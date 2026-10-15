import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withTiming, withRepeat, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ConversationProvider, useConversation } from '@elevenlabs/react-native';
import { Body, Muted, Tag } from '@/ui';
import { Mark } from '@/components/Mark';
import { font, useTheme } from '@/theme';
import { liveStart, liveFinish, liveState, StartArgs, LiveStart } from '@/lib/api';
import type { ConversationDone } from '@/components/Conversation';
import { prepareMic } from '@/lib/voice';
import { play } from '@/lib/sound';

type Msg = { role: 'char' | 'user'; text: string };
type Phase = 'connecting' | 'live' | 'wrapping' | 'evaluating' | 'error';

/**
 * Full-duplex live conversation. ElevenLabs streams the audio both ways (interruptions, natural turn-taking);
 * every character reply comes from our engine on the server. Poise evaluates after hang-up.
 */
export function LiveConversation(props: { args: StartArgs; onDone: (r: ConversationDone) => void; onError?: (e: string) => void; label?: string }) {
  return (
    <ConversationProvider>
      <Live {...props} />
    </ConversationProvider>
  );
}

function Live({ args, onDone, onError, label }: { args: StartArgs; onDone: (r: ConversationDone) => void; onError?: (e: string) => void; label?: string }) {
  const t = useTheme();
  const [phase, setPhase] = useState<Phase>('connecting');
  const [start, setStart] = useState<LiveStart | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [interest, setInterest] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const energy = useSharedValue(0);
  const idle = useSharedValue(0);
  const scroll = useRef<ScrollView>(null);
  const userTurns = useRef(0);
  const ending = useRef(false);
  const startRef = useRef<LiveStart | null>(null);
  const convId = useRef('');

  const conv = useConversation({
    onConnect: ({ conversationId }) => {
      convId.current = conversationId;
      setPhase('live');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onMessage: (m) => {
      const role: Msg['role'] = (m as any).role === 'user' || m.source === 'user' ? 'user' : 'char';
      const text = (m.message || '').trim();
      if (!text) return;
      setMsgs((x) => [...x, { role, text }]);
      if (role === 'user') userTurns.current += 1;
      else if (startRef.current && userTurns.current > 0) {
        liveState(startRef.current.session_id)
          .then((s) => {
            if (typeof s.interest === 'number') setInterest(s.interest);
          })
          .catch(() => {});
      }
    },
    onModeChange: ({ mode }) => {
      // The character just finished its closing line: hang up and read it back.
      if (mode === 'listening' && startRef.current && userTurns.current >= (startRef.current.max_turns ?? 3) && !ending.current) {
        setTimeout(() => finish(), 600);
      }
    },
    onError: (m) => fail(typeof m === 'string' ? m : 'The live line dropped.'),
  });

  // Mark reacts to whoever is speaking.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      try {
        const v = conv.isSpeaking ? conv.getOutputVolume() : conv.getInputVolume();
        energy.value = withTiming(Math.min(1, (v || 0) * 2.2), { duration: 90 });
      } catch {}
    }, 90);
    return () => clearInterval(id);
  }, [phase, conv, energy]);

  useEffect(() => {
    if (phase === 'connecting' || phase === 'evaluating' || phase === 'wrapping') idle.value = withRepeat(withTiming(0.45, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
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
      try {
        conv.endSession();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }, [msgs.length]);

  function fail(m: string) {
    setErr(m);
    setPhase('error');
    onError?.(m);
  }

  async function finish() {
    if (ending.current || !startRef.current) return;
    ending.current = true;
    setPhase('wrapping');
    try {
      conv.endSession();
    } catch {}
    play('select');
    setPhase('evaluating');
    try {
      const e = await liveFinish(startRef.current.session_id, convId.current || conv.getId());
      play('reveal');
      onDone({ sessionId: startRef.current.session_id, evaluation: e, start: startRef.current });
    } catch (e: any) {
      ending.current = false;
      fail(e?.message ?? 'Poise could not read that one.');
    }
  }

  const speaking = conv.isSpeaking;
  const shared = phase === 'live' ? energy : idle;
  const name = start?.character.name ?? '';
  const status =
    phase === 'connecting' ? 'Connecting' : phase === 'wrapping' || phase === 'evaluating' ? 'Poise is reading it back' : phase === 'error' ? err : speaking ? `${name} is talking` : 'Listening. Just talk';

  return (
    <View style={{ flex: 1 }}>
      {start && (
        <Animated.View entering={FadeIn.duration(400)} style={{ marginHorizontal: 20, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: interest !== null && interest >= 55 ? t.accent : 'transparent' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 18, color: t.accent }}>{name[0]}</RNText>
          </View>
          <View style={{ flex: 1 }}>
            <Body strong>{name}</Body>
            <Muted small numberOfLines={1}>{start.character.style}</Muted>
          </View>
          <Tag label="Live" tone="accent" />
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
          <Animated.View key={i} entering={FadeInDown.duration(280)} style={{ alignSelf: m.role === 'char' ? 'flex-start' : 'flex-end', maxWidth: '84%' }}>
            <View style={{ backgroundColor: m.role === 'char' ? t.card : t.accent, borderWidth: m.role === 'char' ? 1 : 0, borderColor: t.line, borderRadius: 18, borderBottomLeftRadius: m.role === 'char' ? 6 : 18, borderBottomRightRadius: m.role === 'user' ? 6 : 18, paddingHorizontal: 14, paddingVertical: 11 }}>
              <Body color={m.role === 'char' ? t.ink : t.onAccent}>{m.text}</Body>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <View style={{ alignItems: 'center', paddingBottom: 18, gap: 12 }}>
        <Muted small color={phase === 'error' ? t.accent : t.ink2}>{status}</Muted>
        <View style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center' }}>
          <Mark index={speaking ? 40 : 62} axes={{ voice: 55, presence: 55, command: 55, composure: 55, read: 55 }} size={170} energy={shared} color={t.markInk} animateIn={false} opacity={phase === 'live' ? 0.8 : 0.35} />
          <View style={{ position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: speaking ? t.card : t.accent, borderWidth: speaking ? 1 : 0, borderColor: t.line }} />
        </View>
        {phase === 'live' && userTurns.current > 0 ? (
          <Pressable onPress={finish} hitSlop={10} style={{ paddingHorizontal: 18, height: 38, borderRadius: 19, borderWidth: 1, borderColor: t.line, justifyContent: 'center' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.ink }}>End and get my read</RNText>
          </Pressable>
        ) : (
          <View style={{ height: 38 }} />
        )}
      </View>
    </View>
  );
}
