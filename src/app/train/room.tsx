import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral } from '@/ui';
import { color, space } from '@/theme/tokens';
import { ROOM_QUESTIONS, RoomQuestion } from '@/data';
import { useStore } from '@/state/store';

const PER_Q_S = 10;
const N = 6;
const KIND_LABEL = { call: 'Call it', meant: 'What she meant', holds: 'Who holds it' };

export default function Room() {
  const recordBest = useStore((s) => s.recordBest);
  const [phase, setPhase] = useState<'intro' | 'q' | 'reveal' | 'done'>('intro');
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const qs = useRef(shuffle(ROOM_QUESTIONS).slice(0, N));
  const q: RoomQuestion = qs.current[i];
  const bar = useSharedValue(1);
  const startedAt = useRef(0);

  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

  useEffect(() => {
    if (phase !== 'q') return;
    bar.value = 1;
    bar.value = withTiming(0, { duration: PER_Q_S * 1000, easing: Easing.linear });
    startedAt.current = Date.now();
    const t = setTimeout(() => answer(null), PER_Q_S * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  function answer(idx: number | null) {
    const ms = Date.now() - startedAt.current;
    setTimes((t) => [...t, ms]);
    setPicked(idx);
    const right = idx === q.answer;
    if (right) {
      // faster correct answers earn more: 10..20 points
      const bonus = Math.round(10 * (1 - Math.min(ms, PER_Q_S * 1000) / (PER_Q_S * 1000)));
      setScore((s) => s + 10 + bonus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setPhase('reveal');
  }

  function next() {
    if (i + 1 >= N) {
      const pct = Math.round((score / (N * 20)) * 100);
      recordBest('room', pct);
      setPhase('done');
      return;
    }
    setI((x) => x + 1);
    setPicked(null);
    setPhase('q');
  }

  const pct = Math.round((score / (N * 20)) * 100);

  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Read the Room · {Math.min(i + 1, N)} / {N}</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}>
            <Label color={color.w72}>Close</Label>
          </Pressable>
        </Row>

        {phase === 'intro' && (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Display size="d2">Ten seconds{'\n'}a call.</Display>
                <Body color={color.w72}>Six situations. Pick what the room is actually saying. Right and fast scores more than right and slow. The key was set by a panel, not by Poise.</Body>
              </Stack>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label="Start" onPress={() => setPhase('q')} />
            </View>
          </Animated.View>
        )}

        {(phase === 'q' || phase === 'reveal') && (
          <Animated.View key={q.id} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
            <View style={{ height: 1, backgroundColor: color.w12, marginTop: space.m }}>
              <Animated.View style={[{ height: 1, backgroundColor: color.white }, barStyle]} />
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Label color={color.w48}>{KIND_LABEL[q.kind]}</Label>
              <Display size="d4" style={{ marginTop: space.s }}>{q.scene}</Display>
              <Stack gap={0} style={{ marginTop: space.l }}>
                {q.options.map((o, idx) => {
                  const isAnswer = phase === 'reveal' && idx === q.answer;
                  const isWrongPick = phase === 'reveal' && picked === idx && idx !== q.answer;
                  return (
                    <Pressable key={idx} disabled={phase === 'reveal'} onPress={() => answer(idx)} style={styles.opt}>
                      <Row gap={space.m}>
                        <View style={[styles.mark, isAnswer && styles.markOn, isWrongPick && styles.markWrong]} />
                        <Body color={phase === 'reveal' && !isAnswer && !isWrongPick ? color.w48 : color.white} style={{ flex: 1 }}>{o}</Body>
                      </Row>
                    </Pressable>
                  );
                })}
              </Stack>
              {phase === 'reveal' && (
                <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: space.l }}>
                  <Label color={color.w48}>{picked === q.answer ? 'Right' : picked === null ? 'Too slow' : 'No'}</Label>
                  <Body color={color.w72} style={{ marginTop: 4 }}>{q.why}</Body>
                </Animated.View>
              )}
            </View>
            {phase === 'reveal' && (
              <View style={{ paddingBottom: space.l }}>
                <Button label={i + 1 >= N ? 'See the score' : 'Next'} onPress={next} />
              </View>
            )}
          </Animated.View>
        )}

        {phase === 'done' && (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Label color={color.w48}>Read</Label>
              <Numeral value={pct} size={140} />
              <Display size="d4" style={{ marginTop: space.m }}>
                {pct >= 80 ? 'You read rooms. Now say less in them.' : pct >= 55 ? 'You catch the obvious signals and miss the quiet ones.' : 'You hear words. You are not yet hearing what they are for.'}
              </Display>
              <Body color={color.w72} small style={{ marginTop: space.m }}>Average call: {(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length) / 1000).toFixed(1)}s</Body>
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

function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const styles = StyleSheet.create({
  opt: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 },
  mark: { width: 10, height: 10, borderRadius: 1, borderWidth: 1, borderColor: color.w48 },
  markOn: { backgroundColor: color.white, borderColor: color.white },
  markWrong: { backgroundColor: 'transparent', borderColor: color.w24 },
});
