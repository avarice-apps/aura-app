import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withTiming, withRepeat, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ConversationProvider, useConversation } from '@elevenlabs/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Body, Muted, Tag, Icon, ICON } from '@/ui';
import { Mark } from '@/components/Mark';
import { font, useTheme } from '@/theme';
import { liveStart, liveFinish, liveState, uploadFrames, StartArgs, LiveStart } from '@/lib/api';
import { useStore } from '@/state/store';
import type { ConversationDone } from '@/components/Conversation';
import { prepareMic } from '@/lib/voice';
import { play } from '@/lib/sound';

type Msg = { who: string; mine: boolean; text: string };
type Phase = 'connecting' | 'live' | 'evaluating' | 'error';

const SPEAKER = /<([A-Z][a-zA-Z]+)>([\s\S]*?)<\/\1>/g;
const CUE = /\[(?:laughs|laughing|sighs|whispers|excited|slow|chuckles|pause|scoffs|gasps)[^\]]*\]\s*/gi;

/** Split a reply like "Hey. <Sasha>Who's this?</Sasha>" into one caption per speaker, voice cues removed. */
export function splitSpeakers(text: string, primary: string): { who: string; text: string }[] {
  const out: { who: string; text: string }[] = [];
  let pos = 0;
  const clean = (x: string) => x.replace(CUE, '').replace(/<\/?[A-Za-z]+>/g, '').replace(/\*[^*]*\*?/g, '').replace(/\s{2,}/g, ' ').trim();
  for (const m of text.matchAll(SPEAKER)) {
    const before = clean(text.slice(pos, m.index));
    if (before) out.push({ who: primary, text: before });
    const said = clean(m[2]);
    if (said) out.push({ who: m[1], text: said });
    pos = (m.index ?? 0) + m[0].length;
  }
  const rest = clean(text.slice(pos));
  if (rest) out.push({ who: primary, text: rest });
  return out;
}

/**
 * Full-duplex live conversation. ElevenLabs streams the audio both ways (interruptions, natural turn-taking,
 * several voices); every line comes from our scene engine on the server. It keeps going until you end it,
 * or until the person you're talking to walks off. Poise reads it back after.
 */
type LiveProps = {
  args: StartArgs;
  onDone: (r: ConversationDone) => void;
  onError?: (e: string) => void;
  label?: string;
  /** Hang up automatically after this many seconds (onboarding). */
  timeLimit?: number;
  /** Fired the moment the call ends, before the read is back. */
  onEnded?: () => void;
  /** Where "Leave" goes if the read fails. Defaults to back. */
  onLeave?: () => void;
  /** The call happened but the read failed (the screen shows retry and leave). */
  onReadFailed?: (message: string) => void;
};

export function LiveConversation(props: LiveProps) {
  return (
    <ConversationProvider>
      <Live {...props} />
    </ConversationProvider>
  );
}

function Live({ args, onDone, onError, label, timeLimit, onEnded, onLeave, onReadFailed }: LiveProps) {
  const t = useTheme();
  const [phase, setPhase] = useState<Phase>('connecting');
  const [start, setStart] = useState<LiveStart | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [interest, setInterest] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [secs, setSecs] = useState(0);
  const [turns, setTurns] = useState(0);
  const [err, setErr] = useState('');
  const [retryId, setRetryId] = useState<string | null>(null);
  const energy = useSharedValue(0);
  const idle = useSharedValue(0);
  const scroll = useRef<ScrollView>(null);
  const ending = useRef(false);
  const leavingRef = useRef(false);
  const startRef = useRef<LiveStart | null>(null);
  const convId = useRef('');
  const isPoise = !!args.poise;
  // Optional front camera: a still every few seconds, measured for eye contact after the call, then deleted.
  const cameraOn = useStore((st) => st.cameraOn) && !isPoise;
  const setStore = useStore((st) => st.set);
  const [camPerm, askCam] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const frames = useRef<string[]>([]);
  const heard = useRef(0); // loudest mic level so far; stays ~0 if the mic is blocked

  // Callbacks below run long after this render; they reach the latest finish/fail through this ref.
  const act = useRef({ finish: () => {}, fail: (_m: string) => {} });

  const conv = useConversation({
    onConnect: ({ conversationId }) => {
      convId.current = conversationId;
      setPhase('live');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onMessage: (m) => {
      const mine = (m as any).role === 'user' || m.source === 'user';
      const text = (m.message || '').trim();
      if (!text || ending.current) return;
      const primary = startRef.current?.character.name ?? '';
      if (mine) {
        setMsgs((x) => [...x, { who: 'You', mine: true, text }]);
        setTurns((n) => n + 1);
        return;
      }
      const parts = splitSpeakers(text, primary);
      setMsgs((x) => [...x, ...parts.map((p) => ({ who: p.who, mine: false, text: p.text }))]);
      setPresent((cur) => {
        const add = parts.map((p) => p.who).filter((w) => w !== primary && !cur.includes(w));
        if (add.length) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return add.length ? [...cur, ...add] : cur;
      });
      if (startRef.current) {
        liveState(startRef.current.session_id)
          .then((s) => {
            if (typeof s.interest === 'number') setInterest(s.interest);
            if (s.leaving) {
              leavingRef.current = true;
              setLeaving(true);
            }
          })
          .catch(() => {});
      }
    },
    onModeChange: ({ mode }) => {
      if (mode !== 'listening' || ending.current || !startRef.current) return;
      // They said their exit line and finished speaking: hang up and read it back.
      if (leavingRef.current) {
        setTimeout(() => act.current.finish(), 900);
        return;
      }
      // The state check from onMessage may still be in flight on a slow connection; ask once more.
      liveState(startRef.current.session_id)
        .then((st) => {
          if (st.leaving && !ending.current) {
            leavingRef.current = true;
            setLeaving(true);
            setTimeout(() => act.current.finish(), 600);
          }
        })
        .catch(() => {});
    },
    onDisconnect: () => {
      // The line closed on their side (time limit, network). Read back what we have.
      if (!ending.current && startRef.current && convId.current) act.current.finish();
    },
    onError: (m) => {
      if (ending.current) return;
      // Mid-call error: never leave the mic running with no way out. Hang up and read what we have.
      if (convId.current) act.current.finish();
      else act.current.fail(typeof m === 'string' ? m : 'The live line dropped.');
    },
  });

  // The Mark reacts to whoever is speaking.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      try {
        if (!conv.isSpeaking) heard.current = Math.max(heard.current, conv.getInputVolume() || 0);
        const v = conv.isSpeaking ? conv.getOutputVolume() : conv.getInputVolume();
        energy.value = withTiming(Math.min(1, (v || 0) * 2.2), { duration: 90 });
      } catch {}
    }, 90);
    const clock = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [phase, conv, energy]);

  useEffect(() => {
    if (!cameraOn || phase !== 'live' || !camPerm?.granted) return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy || !cam.current) return;
      busy = true;
      try {
        const pic = await cam.current.takePictureAsync({ quality: 0.25, shutterSound: false, skipProcessing: true });
        if (pic?.uri) frames.current = [...frames.current, pic.uri].slice(-60);
      } catch {}
      busy = false;
    }, 3000);
    return () => clearInterval(id);
  }, [cameraOn, phase, camPerm?.granted]);

  async function toggleCamera() {
    if (cameraOn) {
      setStore({ cameraOn: false });
      return;
    }
    const p = camPerm?.granted ? camPerm : await askCam();
    if (p?.granted) setStore({ cameraOn: true });
  }

  useEffect(() => {
    if (phase === 'connecting' || phase === 'evaluating') idle.value = withRepeat(withTiming(0.45, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    else {
      cancelAnimation(idle);
      idle.value = withTiming(0, { duration: 300 });
    }
  }, [phase, idle]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!(await prepareMic())) throw new Error('Kleos needs the microphone. Turn it on in Settings.');
        const s = await liveStart(args);
        if (!alive) return;
        startRef.current = s;
        setStart(s);
        conv.startSession({ conversationToken: s.conversation_token, connectionType: 'webrtc', overrides: s.overrides });
      } catch (e: any) {
        fail(e?.message ?? 'Could not start the conversation.');
      }
    })();
    return () => {
      alive = false;
      ending.current = true;
      try {
        conv.endSession();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }, [msgs.length]);

  useEffect(() => {
    if (timeLimit && phase === 'live' && secs >= timeLimit) act.current.finish();
  }, [timeLimit, phase, secs]);

  function fail(m: string) {
    setErr(m);
    setPhase('error');
    onError?.(m);
  }

  async function readBack(id: string) {
    if (!startRef.current) return;
    setErr('');
    setPhase('evaluating');
    let e;
    try {
      e = await liveFinish(startRef.current.session_id, id);
    } catch (x: any) {
      const m = x?.message ?? 'Poise could not read that one.';
      setErr(m);
      setPhase('error');
      setRetryId(id);
      try {
        onReadFailed?.(m);
      } catch {}
      return;
    }
    play('reveal');
    try {
      onDone({ sessionId: startRef.current.session_id, evaluation: e, start: startRef.current });
    } catch (x: any) {
      console.warn('onDone failed', x);
      setErr('Something went wrong showing your read.');
      setPhase('error');
      setRetryId(null);
    }
  }

  async function finish() {
    if (ending.current || !startRef.current) return;
    ending.current = true;
    const id = convId.current || (() => {
      try {
        return conv.getId();
      } catch {
        return '';
      }
    })();
    try {
      conv.endSession();
    } catch {}
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      onEnded?.();
    } catch {}
    if (frames.current.length >= 3 && startRef.current) {
      setPhase('evaluating');
      const shots = frames.current;
      frames.current = [];
      await Promise.race([uploadFrames(startRef.current.session_id, shots).catch(() => {}), new Promise((r) => setTimeout(r, 8000))]);
      shots.forEach((u) => {
        try {
          new File(u).delete(); // stills never stay on the phone either
        } catch {}
      });
    }
    await readBack(id);
  }

  useEffect(() => {
    act.current = { finish, fail };
  });

  const speaking = conv.isSpeaking;
  const shared = phase === 'live' ? energy : idle;
  const name = start?.character.name ?? '';
  const shown = timeLimit ? Math.max(0, timeLimit - secs) : secs;
  const clock = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`;
  const leave = () => {
    if (onLeave) onLeave();
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const status =
    phase === 'connecting'
      ? 'Connecting'
      : phase === 'evaluating'
        ? isPoise
          ? 'Call ended'
          : 'Call ended. Poise is reading it back'
        : phase === 'error'
          ? err
          : turns === 0 && secs >= 10 && heard.current < 0.02
            ? 'I can’t hear you. Is screen recording using the mic?'
            : leaving
            ? `${name} is leaving`
            : speaking
              ? 'They’re talking. Cut in whenever you want'
              : 'Your turn. Just talk';

  return (
    <View style={{ flex: 1 }}>
      {start && (
        <Animated.View entering={FadeIn.duration(400)} style={{ marginHorizontal: 20, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: interest !== null && interest >= 55 ? t.accent : 'transparent' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 18, color: t.accent }}>{name[0]}</RNText>
          </View>
          <View style={{ flex: 1 }}>
            <Body strong>
              {name}
              {present.length ? <RNText style={{ fontFamily: font.regular, color: t.ink2 }}>{`  +  ${present.join(', ')}`}</RNText> : null}
            </Body>
            <Muted small numberOfLines={1}>{start.character.style}</Muted>
          </View>
          {!isPoise && phase !== 'error' ? (
            <Pressable onPress={toggleCamera} hitSlop={8} accessibilityLabel={cameraOn ? 'Turn camera off' : 'Turn camera on'} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: cameraOn ? t.accent : t.line, backgroundColor: cameraOn ? t.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ICON.scan} size={14} color={cameraOn ? t.accent : t.ink2} />
            </Pressable>
          ) : null}
          {phase === 'live' ? <Tag label={clock} tone={timeLimit && shown <= 10 ? 'inverse' : 'accent'} /> : <Tag label="Live" tone="accent" />}
        </Animated.View>
      )}
      {start && (
        <View style={{ marginHorizontal: 22, marginTop: 12, gap: 4 }}>
          <Muted small>{label ? `${label} · ` : ''}{start.setting}</Muted>
        </View>
      )}

      {cameraOn && camPerm?.granted && (phase === 'live' || phase === 'connecting') ? (
        <View style={{ position: 'absolute', right: 20, top: 150, width: 84, height: 112, borderRadius: 14, overflow: 'hidden', zIndex: 5, borderWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
          <CameraView ref={cam} style={{ flex: 1 }} facing="front" mirror animateShutter={false} />
        </View>
      ) : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {msgs.map((m, i) => {
          const showName = !m.mine && (m.who !== name || present.length > 0) && msgs[i - 1]?.who !== m.who;
          return (
            <Animated.View key={i} entering={FadeInDown.duration(260)} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '84%', gap: 3 }}>
              {showName ? <RNText style={{ fontFamily: font.medium, fontSize: 11, letterSpacing: 0.4, color: m.who === name ? t.accent : t.ink2, marginLeft: 6 }}>{m.who.toUpperCase()}</RNText> : null}
              <View style={{ backgroundColor: m.mine ? t.accent : t.card, borderWidth: m.mine ? 0 : 1, borderColor: t.line, borderRadius: 18, borderBottomLeftRadius: m.mine ? 18 : 6, borderBottomRightRadius: m.mine ? 6 : 18, paddingHorizontal: 14, paddingVertical: 11 }}>
                <Body color={m.mine ? t.onAccent : t.ink}>{m.text}</Body>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>

      <View style={{ alignItems: 'center', paddingBottom: 18, gap: 12 }}>
        <Muted small color={phase === 'error' ? t.accent : t.ink2}>{status}</Muted>
        <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
          <Mark index={speaking ? 40 : 62} axes={{ voice: 55, presence: 55, command: 55, composure: 55, read: 55 }} size={150} energy={shared} color={t.markInk} animateIn={false} opacity={phase === 'live' ? 0.8 : 0.35} />
          <View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: speaking ? t.card : t.accent, borderWidth: speaking ? 1 : 0, borderColor: t.line }} />
        </View>
        {phase === 'live' ? (
          <Pressable onPress={finish} hitSlop={10} style={{ paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: turns > 0 ? t.ink : t.card, borderWidth: turns > 0 ? 0 : 1, borderColor: t.line, justifyContent: 'center' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 14, color: turns > 0 ? t.bg : t.ink2 }}>{isPoise ? 'End call' : turns > 0 ? 'End call and get my read' : 'Hang up'}</RNText>
          </Pressable>
        ) : phase === 'error' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {retryId !== null ? (
              <Pressable onPress={() => readBack(retryId)} hitSlop={10} style={{ paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: t.accent, justifyContent: 'center' }}>
                <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>Try the read again</RNText>
              </Pressable>
            ) : null}
            <Pressable onPress={leave} hitSlop={10} style={{ paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.ink }}>Leave</RNText>
            </Pressable>
          </View>
        ) : (
          <View style={{ height: 40 }} />
        )}
      </View>
    </View>
  );
}
