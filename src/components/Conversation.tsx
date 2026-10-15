import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText, NativeModules, TurboModuleRegistry } from 'react-native';
import Animated, { FadeInDown, FadeIn, useSharedValue, withTiming, withRepeat, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets } from 'expo-audio';
import { Body, Muted, Icon, ICON, Tag } from '@/ui';
import { Mark } from '@/components/Mark';
import { font, useTheme } from '@/theme';
import { startSession, sendTurn, evaluateSession, StartArgs } from '@/lib/api';
import type { Evaluation, SessionStart } from '@/lib/types';
import { speak, stopSpeaking, prepareMic } from '@/lib/voice';
import { play } from '@/lib/sound';
import { track } from '@/lib/analytics';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { OFFLINE } from '@/lib/config';

type Phase = 'loading' | 'speaking' | 'yourturn' | 'recording' | 'sending' | 'evaluating' | 'error';
type Msg = { role: 'char' | 'user'; text: string };

const WINDOW: Record<number, number> = { 1: 45, 2: 30, 3: 20 };
/** Talk longer than this and the character cuts in (pressure 2-3). */
const CUT_IN: Record<number, number> = { 1: 0, 2: 24, 3: 15 };
/** Silence after speech that counts as "done talking". */
const END_SILENCE_MS: Record<number, number> = { 1: 1600, 2: 1300, 3: 1000 };
/** Speech is this many dB above the room's noise floor (calibrated in the first ~0.4s of each turn). */
const SPEECH_OVER_FLOOR = 9;
/** Small mono AAC: plenty for speech, uploads fast over a tunnel or mobile data. */
const VOICE_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};

export type ConversationDone = { sessionId: string; evaluation: Evaluation & { scriptAudio?: unknown }; start: SessionStart };

/**
 * A live, turn-based voice conversation with a cast character.
 * The character replies to what you said and how; Poise evaluates at the end.
 */
export function TurnConversation({ args, onDone, onError, label }: { args: StartArgs; onDone: (r: ConversationDone) => void; onError?: (e: string) => void; label?: string }) {
  const t = useTheme();
  const [phase, setPhase] = useState<Phase>('loading');
  const [start, setStart] = useState<SessionStart | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [left, setLeft] = useState(0);
  const [interest, setInterest] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const recorder = useAudioRecorder(VOICE_PRESET);
  const rec = useAudioRecorderState(recorder, 80);
  const energy = useSharedValue(0);
  const idle = useSharedValue(0);
  const scroll = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<string>('');
  const finishing = useRef(false);
  const listening = useRef(false);
  const heard = useRef(false);
  const quietSince = useRef<number | null>(null);
  const startedAt = useRef(0);
  const cutIn = useRef(false);
  const floor = useRef<number[]>([]);
  const meterSeen = useRef(false);
  const [notice, setNotice] = useState('');
  const pressure = args.pressure ?? 1;

  // live voice energy from mic metering (dBFS -60..0 -> 0..1)
  useEffect(() => {
    if (phase === 'recording' && typeof rec.metering === 'number') {
      const v = Math.max(0, Math.min(1, (rec.metering + 55) / 45));
      energy.value = withTiming(v, { duration: 90 });
      // Hands-free turn taking: once you've spoken, a short silence ends your turn.
      const now = Date.now();
      meterSeen.current = true;
      // Calibrate: the first ~0.4s of each turn sets the room's noise floor.
      if (now - startedAt.current < 400) {
        floor.current.push(rec.metering);
        return;
      }
      const base = floor.current.length ? Math.min(...floor.current) : -60;
      const speech = rec.metering > Math.max(base + SPEECH_OVER_FLOOR, -50);
      if (speech) {
        heard.current = true;
        quietSince.current = null;
      } else if (heard.current) {
        if (quietSince.current === null) quietSince.current = now;
        else if (now - quietSince.current > (END_SILENCE_MS[pressure] ?? 1400)) finish();
      }
      // Pressure: ramble past the cap and they cut in, like a real person would.
      const cap = CUT_IN[pressure] ?? 0;
      if (cap && heard.current && now - startedAt.current > cap * 1000 && !finishing.current) {
        cutIn.current = true;
        setNotice(`${start?.character.name ?? 'They'} cut in`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        finish();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.metering, phase, energy]);

  // idle breathing while the character speaks
  useEffect(() => {
    if (phase === 'speaking' || phase === 'sending' || phase === 'evaluating' || phase === 'loading') {
      idle.value = withRepeat(withTiming(0.45, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      cancelAnimation(idle);
      idle.value = withTiming(0, { duration: 300 });
    }
  }, [phase, idle]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ok = await prepareMic();
        if (!ok) throw new Error('Kleos needs the microphone to hear your answer.');
        const s = await startSession(args);
        if (!alive) return;
        sessionRef.current = s.session_id;
        setStart(s);
        setMsgs([{ role: 'char', text: s.opener }]);
        setPhase('speaking');
        await speak(s.openerAudio);
        if (alive) listen();
      } catch (e: any) {
        fail(e?.message ?? 'Could not start.');
      }
    })();
    return () => {
      alive = false;
      stopSpeaking();
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fail(m: string) {
    setErr(m);
    setPhase('error');
    onError?.(m);
  }

  /** Start listening right away: no tap needed. */
  async function listen() {
    if (listening.current) return;
    listening.current = true;
    heard.current = false;
    quietSince.current = null;
    cutIn.current = false;
    floor.current = [];
    meterSeen.current = false;
    setNotice('');
    stopSpeaking();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const ok = await prepareMic();
      if (!ok) throw new Error('Kleos needs the microphone. Turn it on in Settings › Expo Go › Microphone.');
      // iOS needs a beat to switch the audio route from playback to recording.
      await new Promise((r) => setTimeout(r, 220));
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e: any) {
      listening.current = false;
      setErr(e?.message ?? 'The mic didn’t start. Tap to try again.');
      setPhase('yourturn');
      return;
    }
    startedAt.current = Date.now();
    setErr('');
    setPhase('recording');
    const w = WINDOW[pressure] ?? 40;
    setLeft(w);
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          finish();
          return 0;
        }
        if (l <= 4) play('tick');
        return l - 1;
      });
    }, 1000);
  }

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    listening.current = false;
    setPhase((p) => (p === 'recording' ? 'sending' : p));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recorder.stop();
      const uri = recorder.uri ?? '';
      // Never throw a recording away on the phone. The server decides whether it heard words.
      if (!uri) throw new Error("Didn't catch that.");
      const r = await sendTurn(sessionRef.current, uri, cutIn.current);
      setMsgs((m) => [...m, { role: 'user', text: r.user_text }, { role: 'char', text: r.reply }]);
      if (typeof r.interest === 'number') setInterest(r.interest);
      setPhase('speaking');
      await speak(r.replyAudio);
      if (r.done) {
        setPhase('evaluating');
        const e = await evaluateSession(sessionRef.current);
        play('reveal');
        onDone({ sessionId: sessionRef.current, evaluation: e, start: start! });
      } else {
        finishing.current = false;
        listen();
        return;
      }
    } catch (e: any) {
      // A failed turn is recoverable and never counts: let them answer again.
      const m = String(e?.message ?? '');
      setErr(/catch that|closer to the mic/i.test(m) ? "Didn't catch that. Tap to go again, it doesn't count." : m || 'Something went wrong. Tap to go again.');
      play('wrong');
      setPhase('yourturn');
    } finally {
      finishing.current = false;
    }
  }

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }, [msgs.length]);

  const shared = phase === 'recording' ? energy : idle;
  const level = phase === 'recording' && typeof rec.metering === 'number' ? Math.max(0, Math.min(1, (rec.metering + 55) / 45)) : 0;
  const status =
    phase === 'loading' ? 'Setting the scene' : phase === 'speaking' ? `${start?.character.name ?? ''} is talking` : phase === 'yourturn' ? err || 'Tap to talk' : phase === 'recording' ? (heard.current ? 'Listening… pause when you’re done' : meterSeen.current ? 'Your turn. Just talk' : 'Talk, then tap the square') : phase === 'sending' ? notice || `${start?.character.name ?? ''} is thinking…` : phase === 'evaluating' ? 'Poise is reading it back' : err;

  return (
    <View style={{ flex: 1 }}>
      {start && (
        <Animated.View entering={FadeIn.duration(400)} style={{ marginHorizontal: 20, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: interest !== null && interest >= 55 ? t.accent : 'transparent' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 18, color: t.accent }}>{start.character.name[0]}</RNText>
          </View>
          <View style={{ flex: 1 }}>
            <Body strong>{start.character.name}</Body>
            <Muted small numberOfLines={1}>{start.character.style}</Muted>
          </View>
          <Tag label={['', 'Easy', 'Real', 'Heat'][pressure]} />
        </Animated.View>
      )}

      {start && (
        <View style={{ marginHorizontal: 22, marginTop: 12, gap: 4 }}>
          <Muted small>{label ? `${label} · ` : ''}{start.setting}</Muted>
          <Body small strong color={t.accent}>{start.goal}</Body>
        </View>
      )}

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {msgs.map((m, i) => (
          <Animated.View key={i} entering={FadeInDown.duration(320)} style={{ alignSelf: m.role === 'char' ? 'flex-start' : 'flex-end', maxWidth: '84%' }}>
            <View style={{ backgroundColor: m.role === 'char' ? t.card : t.accent, borderWidth: m.role === 'char' ? 1 : 0, borderColor: t.line, borderRadius: 18, borderBottomLeftRadius: m.role === 'char' ? 6 : 18, borderBottomRightRadius: m.role === 'user' ? 6 : 18, paddingHorizontal: 14, paddingVertical: 11 }}>
              <Body color={m.role === 'char' ? t.ink : t.onAccent}>{m.text}</Body>
            </View>
          </Animated.View>
        ))}
        {phase === 'sending' && (
          <Animated.View entering={FadeIn} style={{ alignSelf: 'flex-start', backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Muted small>{notice ? `${notice}…` : '•••'}</Muted>
          </Animated.View>
        )}
      </ScrollView>

      <View style={{ alignItems: 'center', paddingBottom: 18, gap: 10 }}>
        <Muted small color={phase === 'error' ? t.accent : t.ink2}>{status}</Muted>
        <Pressable
          accessibilityLabel={phase === 'recording' ? 'Finish answer' : 'Start answering'}
          disabled={!(phase === 'yourturn' || phase === 'recording')}
          onPress={() => (phase === 'recording' ? finish() : listen())}
          style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ position: 'absolute' }}>
            <Mark index={phase === 'recording' ? 60 : 40} axes={{ voice: 55, presence: 55, command: 55, composure: 55, read: 55 }} size={170} energy={shared} color={t.markInk} animateIn={false} opacity={phase === 'yourturn' || phase === 'recording' ? 0.75 : 0.35} />
          </View>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: phase === 'yourturn' || phase === 'recording' ? t.accent : t.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            {phase === 'recording' ? <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: t.onAccent }} /> : <Icon d={ICON.mic} size={26} color={t.onAccent} />}
          </View>
        </Pressable>
        {phase === 'recording' ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 120, height: 4, borderRadius: 2, backgroundColor: t.cardAlt, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(level * 100)}%`, height: 4, borderRadius: 2, backgroundColor: t.accent }} />
            </View>
            <Muted small>{left}s</Muted>
          </View>
        ) : (
          <View style={{ height: 27 }} />
        )}
      </View>
    </View>
  );
}


/** True when the app is a development/production build with WebRTC (not Expo Go) and a server is connected. */
export function liveAvailable() {
  if (OFFLINE) return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false; // Expo Go
  try {
    return !!(NativeModules.WebRTCModule || TurboModuleRegistry.get('WebRTCModule'));
  } catch {
    return false;
  }
}

/**
 * The conversation everyone uses. Live full-duplex voice when the build supports it;
 * otherwise the turn-based version (Expo Go, offline demo).
 */
export function Conversation(props: { args: StartArgs; onDone: (r: ConversationDone) => void; onError?: (e: string) => void; label?: string }) {
  const kind = props.args.daily_id ? 'daily' : props.args.floor_id ? 'floor' : props.args.room_id ? 'quest' : props.args.lesson ? 'lesson' : props.args.goal ? 'onboarding' : 'other';
  const onDone = (r: ConversationDone) => {
    track('call_finished', { kind, rating: r.evaluation?.rating ?? null, insufficient: !!r.evaluation?.insufficient, effort: (r.evaluation as any)?.effort ?? null });
    props.onDone(r);
  };
  props = { ...props, onDone };
  if (liveAvailable()) {
    // Loaded lazily so Expo Go never touches the native WebRTC module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LiveConversation } = require('./LiveConversation');
    return <LiveConversation {...props} />;
  }
  return <TurnConversation {...props} />;
}
