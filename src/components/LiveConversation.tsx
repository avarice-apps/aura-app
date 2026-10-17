import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeInDown, useSharedValue, withTiming, withRepeat, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ConversationProvider, useConversation } from '@elevenlabs/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { Body, Muted, Icon, ICON, Serif } from '@/ui';
import { CallStage } from '@/components/CallStage';
import { faceFor } from '@/lib/faces';
import { font, useTheme } from '@/theme';
import { liveStart, liveFinish, liveState, uploadFrames, reportMic, StartArgs, LiveStart } from '@/lib/api';
import { useStore } from '@/state/store';
import type { ConversationDone } from '@/components/Conversation';
import { requestMic, stopSpeaking } from '@/lib/voice';
import { prepareLiveAudio, resetLiveAudio, endLiveAudio, reviveMic, micState, isAudioStartError, AUDIO_START_FAILED } from '@/lib/liveAudio';
import { play } from '@/lib/sound';

type Msg = { who: string; mine: boolean; text: string };
type Phase = 'connecting' | 'live' | 'evaluating' | 'error';

const SPEAKER = /<([A-Z][a-zA-Z]+)>([\s\S]*?)<\/\1>/g;
/** Input level that means the mic is delivering nothing at all (a quiet room still reads above this). */
const DEAD = 0.004;

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
  const who = useSharedValue(0); // 1 while they talk
  const [showTx, setShowTx] = useState(false);
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
  const listenMs = useRef(0); // time the line was open for him (the other side not talking)
  const revived = useRef(false);
  const audioRetried = useRef(false); // one clean retry if iOS refuses to start the call's audio
  const alive = useRef(true);

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
      else if (isAudioStartError(m) && !audioRetried.current) {
        // iOS wouldn't start the phone's audio (another app or a stale session holding it). Reset and try once more.
        audioRetried.current = true;
        resetLiveAudio().then(() => {
          if (alive.current && !ending.current) connect();
        });
      } else
        act.current.fail(
          isAudioStartError(m)
            ? AUDIO_START_FAILED
            : typeof m === 'string'
              ? m
              : 'The live line dropped.',
        );
    },
  });

  // The Mark reacts to whoever is speaking.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      try {
        if (!conv.isSpeaking) {
          heard.current = Math.max(heard.current, conv.getInputVolume() || 0);
          listenMs.current += 90;
          // Four seconds of open line and not a flicker from the mic: kick it once, and report what the engine saw.
          if (!revived.current && listenMs.current >= 4000 && heard.current < DEAD && startRef.current) {
            revived.current = true;
            const sid = startRef.current.session_id;
            const before = micState();
            reviveMic(conv.setMuted).then(() =>
              setTimeout(() => reportMic(sid, { before, after: micState(), heardAfter: heard.current }), 3000),
            );
          }
        }
        const v = conv.isSpeaking ? conv.getOutputVolume() : conv.getInputVolume();
        who.value = conv.isSpeaking ? 1 : 0;
        energy.value = withTiming(Math.min(1, (v || 0) * 2.2), { duration: 90 });
      } catch {}
    }, 90);
    const clock = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [phase, conv, energy, who]);

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

  /** Get a fresh token and connect. A retry gets a new token too, since the first may have been spent. */
  async function connect() {
    try {
      const s = await liveStart(args);
      if (!alive.current) return;
      startRef.current = s;
      setStart(s);
      conv.startSession({ conversationToken: s.conversation_token, connectionType: 'webrtc', overrides: s.overrides });
    } catch (e: any) {
      fail(e?.message ?? 'Could not start the conversation.');
    }
  }

  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        stopSpeaking();
        if (!(await requestMic())) throw new Error('Kleos needs the microphone. Turn it on in Settings › Kleos.');
        await prepareLiveAudio();
      } catch (e: any) {
        fail(e?.message ?? 'Could not start the conversation.');
        return;
      }
      if (alive.current) connect();
    })();
    return () => {
      alive.current = false;
      ending.current = true;
      try {
        conv.endSession();
      } catch {}
      endLiveAudio();
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
      onDone({ sessionId: startRef.current.session_id, evaluation: e, start: startRef.current, micDead: listenMs.current >= 4000 && heard.current < DEAD });
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
    endLiveAudio();
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
          : turns === 0 && listenMs.current >= 9000 && heard.current < DEAD
            ? 'Kleos can’t hear your mic. Check Settings › Kleos › Microphone.'
            : leaving
            ? `${name} is leaving`
            : speaking
              ? 'They’re talking. Cut in whenever you want'
              : 'Your turn. Just talk';

  const last = msgs[msgs.length - 1];
  const idleNow = phase === 'connecting' || phase === 'evaluating';
  const seed = start?.session_id;
  const face = faceFor(start?.character ?? (isPoise ? 'poise' : null), { seed, stranger: !!start?.masked });
  const faceOf = (w: string) => (w === name ? face : faceFor(w, { seed }));
  const round = (bg: string, border?: string) => ({ width: 58, height: 58, borderRadius: 29, backgroundColor: bg, borderWidth: border ? 1 : 0, borderColor: border, alignItems: 'center' as const, justifyContent: 'center' as const });
  const lowTime = phase === 'live' && !!timeLimit && shown <= 10;

  const caption = last
    ? { label: last.mine ? 'You' : last.who, text: last.mine ? last.text : `“${last.text}”`, mine: last.mine, key: msgs.length }
    : start
      ? { label: label || 'The scene', text: start.setting, mine: true, key: 0 }
      : null;

  return (
    <View style={{ flex: 1 }}>
      <CallStage
        top={phase === 'live' ? `LIVE · ${clock}` : phase === 'connecting' ? 'CALLING' : phase === 'evaluating' ? 'CALL ENDED' : ''}
        dot={lowTime ? 'warn' : phase === 'live' ? 'live' : 'idle'}
        topRight={start?.resumed ? 'FROM THE MOMENT' : undefined}
        face={face}
        energy={energy}
        who={who}
        idle={idleNow}
        interest={isPoise ? null : interest}
        leaving={leaving}
        name={name || (isPoise ? 'Poise' : '')}
        subline={start ? (isPoise ? 'Your coach · on the line' : start.character.style) : undefined}
        present={present.map((p) => ({ name: p, face: faceOf(p) }))}
        bars={phase === 'live' ? energy : idle}
        barsDim={phase !== 'live'}
        caption={caption}
        placeholder={isPoise ? 'Calling Poise' : 'Someone’s picking up'}
        status={status}
        statusError={phase === 'error'}
      >
        {phase === 'live' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 34 }}>
            <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
              {!isPoise ? (
                <Pressable onPress={toggleCamera} hitSlop={8} accessibilityLabel={cameraOn ? 'Turn camera off' : 'Turn camera on'} style={round(cameraOn ? t.accentSoft : t.card, cameraOn ? t.accent : t.line)}>
                  <Icon d={ICON.scan} size={20} color={cameraOn ? t.ink : t.ink2} />
                </Pressable>
              ) : <View style={{ width: 58, height: 58 }} />}
              {!isPoise ? <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>{cameraOn ? 'Eyes on' : 'Eyes'}</RNText> : null}
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Pressable onPress={finish} hitSlop={10} accessibilityLabel={isPoise ? 'End call' : turns > 0 ? 'End call and get my read' : 'Hang up'} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ transform: [{ rotate: '135deg' }] }}>
                  <Icon d={ICON.phone} size={28} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </Pressable>
              <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>{isPoise ? 'End' : turns > 0 ? 'End and read' : 'Hang up'}</RNText>
            </View>
            <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
              <Pressable onPress={() => setShowTx(true)} hitSlop={8} accessibilityLabel="Show transcript" style={round(t.card, t.line)}>
                <Icon d={ICON.chat} size={20} color={t.ink2} />
              </Pressable>
              <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>Words</RNText>
            </View>
          </View>
        ) : phase === 'error' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {retryId !== null ? (
              <Pressable onPress={() => readBack(retryId)} hitSlop={10} style={{ paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: t.accent, justifyContent: 'center' }}>
                <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>Try the read again</RNText>
              </Pressable>
            ) : null}
            <Pressable onPress={leave} hitSlop={10} style={{ paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.ink }}>Leave</RNText>
            </Pressable>
          </View>
        ) : (
          <View style={{ height: 94 }} />
        )}
      </CallStage>

      {cameraOn && camPerm?.granted && (phase === 'live' || phase === 'connecting') ? (
        <View style={{ position: 'absolute', right: 20, top: 40, width: 78, height: 104, borderRadius: 14, overflow: 'hidden', zIndex: 5, borderWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
          <CameraView ref={cam} style={{ flex: 1 }} facing="front" mirror animateShutter={false} />
        </View>
      ) : null}

      {/* the whole conversation, on demand */}
      {showTx ? (
        <Animated.View entering={FadeInDown.duration(260)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '30%', backgroundColor: t.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: t.line, zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            <Serif size={24}>The conversation</Serif>
            <Pressable onPress={() => setShowTx(false)} hitSlop={10} accessibilityLabel="Close transcript" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ICON.close} size={14} />
            </Pressable>
          </View>
          <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            {msgs.map((m, i) => {
              const showName = !m.mine && msgs[i - 1]?.who !== m.who;
              return (
                <View key={i} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '84%', gap: 3 }}>
                  {showName ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 2 }}>
                      <Image source={faceOf(m.who)} style={{ width: 18, height: 18, borderRadius: 9 }} />
                      <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.2, color: t.ink3 }}>{m.who.toUpperCase()}</RNText>
                    </View>
                  ) : null}
                  <View style={{ backgroundColor: m.mine ? t.accent : t.card, borderWidth: m.mine ? 0 : 1, borderColor: t.line, borderRadius: 18, borderBottomLeftRadius: m.mine ? 18 : 6, borderBottomRightRadius: m.mine ? 6 : 18, paddingHorizontal: 14, paddingVertical: 11 }}>
                    <Body color={m.mine ? t.onAccent : t.ink}>{m.text}</Body>
                  </View>
                </View>
              );
            })}
            {!msgs.length ? <Muted small align="center">Nothing said yet.</Muted> : null}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}
