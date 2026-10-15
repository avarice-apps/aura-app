import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral } from '@/ui';
import { color, space } from '@/theme/tokens';
import { PRESSURE_PROMPTS } from '@/data';
import { scorePressure } from '@/lib/api';
import { useStore } from '@/state/store';

const ROUNDS = 5;
const ANSWER_S = 20;

type Phase = 'intro' | 'count' | 'answer' | 'scoring' | 'between' | 'done';
type RoundResult = { composure: number; firstWordMs: number; fillers: number; finished: boolean; line: string; prompt: string };

export default function Pressure() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordBest = useStore((s) => s.recordBest);
  const [phase, setPhase] = useState<Phase>('intro');
  const [round, setRound] = useState(0);
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(ANSWER_S);
  const [interrupted, setInterrupted] = useState(false);
  const [results, setResults] = useState<RoundResult[]>([]);
  const prompts = useRef(shuffle(PRESSURE_PROMPTS).slice(0, ROUNDS));
  // round five always interrupts
  prompts.current[ROUNDS - 1] = { ...prompts.current[ROUNDS - 1], interrupt: true };
  const prompt = prompts.current[round];

  useEffect(() => {
    (async () => {
      await requestRecordingPermissionsAsync();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  useEffect(() => {
    if (phase !== 'count') return;
    if (count === 0) {
      setPhase('answer');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== 'answer') return;
    let alive = true;
    (async () => {
      await recorder.prepareToRecordAsync();
      recorder.record();
    })();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLeft(ANSWER_S);
    setInterrupted(false);
    const iv = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    const interruptAt = prompt.interrupt ? setTimeout(() => { if (alive) { setInterrupted(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } }, 7000) : null;
    const end = setTimeout(() => alive && finishRound(), ANSWER_S * 1000);
    return () => {
      alive = false;
      clearInterval(iv);
      clearTimeout(end);
      if (interruptAt) clearTimeout(interruptAt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function finishRound() {
    setPhase('scoring');
    await recorder.stop();
    const uri = recorder.uri ?? '';
    try {
      const r = await scorePressure({ uri, promptText: prompt.text, seconds: ANSWER_S });
      setResults((rs) => [...rs, { ...r, prompt: prompt.text }]);
    } catch {
      setResults((rs) => [...rs, { composure: 50, firstWordMs: 0, fillers: 0, finished: false, line: 'Could not score this one.', prompt: prompt.text }]);
    }
    setPhase('between');
  }

  function nextRound() {
    if (round + 1 >= ROUNDS) {
      const avg = Math.round(results.reduce((s, r) => s + r.composure, 0) / results.length);
      recordBest('pressure', avg);
      setPhase('done');
      return;
    }
    setRound((r) => r + 1);
    setCount(3);
    setPhase('count');
  }

  const last = results[results.length - 1];
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.composure, 0) / results.length) : 0;

  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Pressure · {Math.min(round + 1, ROUNDS)} / {ROUNDS}</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}>
            <Label color={color.w72}>Close</Label>
          </Pressable>
        </Row>

        {phase === 'intro' && (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Display size="d2">Three seconds.{'\n'}Then twenty.</Display>
                <Body color={color.w72}>Five prompts you have not seen. Answer out loud, out of the gate, and finish on a full stop. On the fifth, she cuts in. Keep going.</Body>
              </Stack>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label="Start" onPress={() => { setCount(3); setPhase('count'); }} />
            </View>
          </Animated.View>
        )}

        {phase === 'count' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View key={count} entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
              <Numeral value={count === 0 ? '' : count} size={200} />
            </Animated.View>
          </View>
        )}

        {phase === 'answer' && (
          <Animated.View entering={FadeIn.duration(150)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Display size="d1" style={{ fontSize: 72, lineHeight: 70 }}>{prompt.text}</Display>
              {interrupted && (
                <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: space.xl }}>
                  <Label color={color.w48}>Poise</Label>
                  <Display size="d4" style={{ marginTop: 4 }}>"No. Why should I care?"</Display>
                </Animated.View>
              )}
            </View>
            <Row style={{ justifyContent: 'space-between', paddingBottom: space.l, alignItems: 'flex-end' }}>
              <Numeral value={left} size={96} />
              <Button label="Done" variant="secondary" onPress={finishRound} />
            </Row>
          </Animated.View>
        )}

        {phase === 'scoring' && (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Label color={color.w48}>Poise</Label>
            <Display size="d3">Listening.</Display>
          </View>
        )}

        {phase === 'between' && last && (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Row style={{ alignItems: 'flex-end' }} gap={space.m}>
                <Numeral value={last.composure} size={120} />
                <Label color={color.w48} style={{ paddingBottom: 12 }}>Composure</Label>
              </Row>
              <Display size="d4" style={{ marginTop: space.l }}>{last.line}</Display>
              <Row gap={space.l} style={{ marginTop: space.l }}>
                <Stat n={`${(last.firstWordMs / 1000).toFixed(1)}s`} label="First word" />
                <Stat n={last.fillers} label="Fillers" />
                <Stat n={last.finished ? 'Yes' : 'No'} label="Finished" />
              </Row>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label={round + 1 >= ROUNDS ? 'See the set' : 'Next'} onPress={nextRound} />
            </View>
          </Animated.View>
        )}

        {phase === 'done' && (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Label color={color.w48}>Set average</Label>
              <Numeral value={avg} size={140} />
              <Display size="d4" style={{ marginTop: space.m }}>{avg >= 70 ? 'You start on time and you finish.' : avg >= 50 ? 'You start on time. You drift in the middle.' : 'You wait too long to begin. Then you rush.'}</Display>
              <Stack gap={space.s} style={{ marginTop: space.l }}>
                {results.map((r, i) => (
                  <Row key={i} style={{ justifyContent: 'space-between' }}>
                    <Body color={color.w72} small style={{ flex: 1 }}>{r.prompt}</Body>
                    <Numeral value={r.composure} size={24} />
                  </Row>
                ))}
              </Stack>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label="Done" onPress={() => router.back()} />
            </View>
          </Animated.View>
        )}
      </Gutter>
    </Screen>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <Stack gap={2}>
      <Numeral value={n} size={36} />
      <Label small color={color.w48}>{label}</Label>
    </Stack>
  );
}

function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
