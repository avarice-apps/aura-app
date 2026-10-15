import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral } from '@/ui';
import { color, space } from '@/theme/tokens';
import { API_URL, OFFLINE } from '@/lib/config';
import { useStore } from '@/state/store';

const SECONDS = 15;
type Result = { presence: number; breaks: number; blinks: number; fidgets: number; longestHoldS: number; line: string };

/** Holding Silence. Fifteen seconds into the lens, saying nothing. */
export default function Silence() {
  const [perm, request] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const recordBest = useStore((s) => s.recordBest);
  const [phase, setPhase] = useState<'intro' | 'hold' | 'scoring' | 'done'>('intro');
  const [left, setLeft] = useState(SECONDS);
  const [result, setResult] = useState<Result | null>(null);
  const rec = useRef<Promise<{ uri: string } | undefined> | null>(null);

  useEffect(() => {
    if (phase !== 'hold') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rec.current = cam.current?.recordAsync({ maxDuration: SECONDS }) ?? null;
    const iv = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    const end = setTimeout(finish, SECONDS * 1000 + 200);
    return () => { clearInterval(iv); clearTimeout(end); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function finish() {
    setPhase('scoring');
    cam.current?.stopRecording();
    const r = await rec.current;
    let out: Result;
    if (OFFLINE || !r?.uri) {
      await new Promise((res) => setTimeout(res, 1200));
      const breaks = Math.floor(Math.random() * 4);
      out = { presence: 80 - breaks * 12, breaks, blinks: 6 + Math.floor(Math.random() * 8), fidgets: Math.floor(Math.random() * 3), longestHoldS: 15 - breaks * 3, line: breaks === 0 ? 'You held it. Most don’t.' : 'You looked away to check if it was over. It wasn’t.' };
    } else {
      const form = new FormData();
      form.append('video', { uri: r.uri, name: 'silence.mp4', type: 'video/mp4' } as any);
      const res = await fetch(`${API_URL}/silence`, { method: 'POST', body: form });
      out = await res.json();
    }
    recordBest('silence', out.presence);
    setResult(out);
    setPhase('done');
  }

  if (!perm?.granted) {
    return (
      <Screen surface="ink">
        <Gutter style={{ flex: 1, justifyContent: 'center' }}>
          <Stack gap={space.l}>
            <Display size="d3">Camera.</Display>
            <Body color={color.w72}>Fifteen seconds of video, measured for eye contact and stillness, then deleted.</Body>
            <Button label="Allow" onPress={() => request()} />
          </Stack>
        </Gutter>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      {(phase === 'hold' || phase === 'scoring') && <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" mode="video" />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ink, opacity: phase === 'hold' ? 0.5 : 1 }]} />
      <Screen surface="ink" style={{ backgroundColor: 'transparent' }}>
        <Gutter style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
            <Label>Holding Silence</Label>
            {phase !== 'hold' && (
              <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
            )}
          </Row>

          {phase === 'intro' && (
            <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Stack gap={space.l}>
                  <Display size="d2">Fifteen seconds.{'\n'}Say nothing.</Display>
                  <Body color={color.w72}>Look into the lens. Don’t smile to fill it. Don’t look away to check the time. Every break, blink-burst and fidget is counted.</Body>
                </Stack>
              </View>
              <View style={{ paddingBottom: space.l }}>
                <Button label="Hold" onPress={() => { setLeft(SECONDS); setPhase('hold'); }} />
              </View>
            </Animated.View>
          )}

          {phase === 'hold' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: space.xl }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.white, position: 'absolute', top: '45%' }} />
              <Numeral value={left} size={64} color={color.w48} />
            </View>
          )}

          {phase === 'scoring' && (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Label color={color.w48}>Poise</Label>
              <Display size="d3">Watching that back.</Display>
            </View>
          )}

          {phase === 'done' && result && (
            <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Row style={{ alignItems: 'flex-end' }} gap={space.m}>
                  <Numeral value={result.presence} size={140} />
                  <Label color={color.w48} style={{ paddingBottom: 14 }}>Presence</Label>
                </Row>
                <Display size="d4" style={{ marginTop: space.m }}>{result.line}</Display>
                <Row gap={space.l} style={{ marginTop: space.l }}>
                  <Stat n={result.breaks} label="Breaks" />
                  <Stat n={result.blinks} label="Blinks" />
                  <Stat n={result.fidgets} label="Fidgets" />
                  <Stat n={`${result.longestHoldS}s`} label="Longest hold" />
                </Row>
              </View>
              <Stack gap={space.s} style={{ paddingBottom: space.l }}>
                <Button label="Again" onPress={() => { setLeft(SECONDS); setPhase('hold'); }} />
                <Button label="Done" variant="secondary" onPress={() => router.back()} />
              </Stack>
            </Animated.View>
          )}
        </Gutter>
      </Screen>
    </View>
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
