import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral, Hairline } from '@/ui';
import { Mark } from '@/components/Mark';
import { color, space } from '@/theme/tokens';
import { tierFor, ARCHETYPES, AXIS_LABEL } from '@/data';
import { useStore, isPaid } from '@/state/store';
import { OFFLINE } from '@/lib/config';
import { play } from '@/lib/sound';

export default function Verdict() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const verdict = useStore((s) => s.verdicts.find((v) => v.id === id));
  const previous = useStore((s) => {
    const i = s.verdicts.findIndex((v) => v.id === id);
    return i >= 0 ? s.verdicts[i + 1] : undefined;
  });
  const paid = useStore(isPaid);
  const name = useStore((s) => s.name);
  const [shown, setShown] = useState(0);
  const [stage, setStage] = useState(0); // 0 mark, 1 number, 2 tier, 3 tells, 4 drill
  const player = useAudioPlayer(verdict?.audioUrl ? { uri: verdict.audioUrl } : null);
  const played = useRef(false);

  const unlocked = paid || verdict?.unblurred;

  // staged reveal
  useEffect(() => {
    if (!verdict) return;
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setStage(1), 1100));
    t.push(setTimeout(() => setStage(2), 2500));
    t.push(setTimeout(() => setStage(3), 3400));
    t.push(setTimeout(() => setStage(4), 4200));
    return () => t.forEach(clearTimeout);
  }, [verdict]);

  // count up
  useEffect(() => {
    if (stage < 1 || !verdict) return;
    play('reveal');
    const target = verdict.index;
    const start = Date.now();
    const dur = 1300;
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(target * eased));
      if (p >= 1) {
        clearInterval(iv);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 32);
    return () => clearInterval(iv);
  }, [stage, verdict]);

  // Poise speaks once the number has landed
  useEffect(() => {
    if (stage >= 2 && verdict?.audioUrl && !played.current) {
      played.current = true;
      player.play();
    }
  }, [stage, verdict, player]);

  if (!verdict) return null;
  const tier = tierFor(verdict.index);
  const arch = ARCHETYPES.find((a) => a.key === verdict.archetype);
  const delta = previous ? verdict.index - previous.index : null;

  return (
    <Screen surface="cobalt">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <Gutter>
          <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
            <Label>{previous ? 'Re-read' : 'Your first read'}</Label>
            <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={16}>
              <Label color={color.w72}>Done</Label>
            </Pressable>
          </Row>

          <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
            <Mark index={verdict.index} axes={verdict.axes} size={300} from={previous ? { index: previous.index, axes: previous.axes } : undefined} />
          </View>

          {stage >= 1 && (
            <Animated.View entering={FadeIn.duration(400)}>
              <Row style={{ alignItems: 'flex-end' }} gap={space.m}>
                <Numeral value={shown} size={132} />
                <Stack gap={2} style={{ paddingBottom: 14 }}>
                  <Label color={color.w48}>±{verdict.band}</Label>
                  {delta !== null && <Label color={color.white}>{delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta)} since last</Label>}
                </Stack>
              </Row>
            </Animated.View>
          )}

          {stage >= 2 && (
            <Animated.View entering={FadeInDown.duration(500)}>
              <Stack gap={space.s} style={{ marginTop: space.s }}>
                <Display size="d3">{tier.name}.</Display>
                <Body color={color.w72}>{tier.line}</Body>
              </Stack>
              {arch && (
                <Stack gap={4} style={{ marginTop: space.l }}>
                  <Label color={color.w48}>Archetype</Label>
                  <Display size="d4">{arch.name}</Display>
                  <Body color={color.w72} small>{arch.read}</Body>
                </Stack>
              )}
            </Animated.View>
          )}

          {stage >= 2 && (
            <Animated.View entering={FadeIn.duration(500).delay(200)} style={{ marginTop: space.xl }}>
              <Label color={color.w48} style={{ marginBottom: space.s }}>Axes</Label>
              {(Object.keys(verdict.axes) as (keyof typeof verdict.axes)[]).map((k) => (
                <AxisRow key={k} label={AXIS_LABEL[k]} value={verdict.axes[k]} prev={previous?.axes[k]} />
              ))}
            </Animated.View>
          )}

          {stage >= 3 && (
            <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: space.xl }}>
              <Label color={color.w48}>Three tells</Label>
              <Stack gap={0} style={{ marginTop: space.s }}>
                {verdict.tells.map((t, i) => (
                  <View key={t.id} style={styles.tell}>
                    <Row gap={space.m} style={{ alignItems: 'flex-start' }}>
                      <Label color={color.w48} style={{ width: 24, paddingTop: 5 }}>0{i + 1}</Label>
                      <View style={{ flex: 1 }}>
                        <Display size="d4">{t.title}</Display>
                        <Body color={color.w72} style={{ marginTop: 6 }}>{t.evidence}</Body>
                        <Label small color={color.w48} style={{ marginTop: 8 }}>{AXIS_LABEL[t.axis]}</Label>
                      </View>
                    </Row>
                    {i > 0 && !unlocked && (
                      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
                        <View style={styles.lock} />
                      </BlurView>
                    )}
                  </View>
                ))}
              </Stack>
            </Animated.View>
          )}

          {stage >= 4 && (
            <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: space.xl }}>
              <Label color={color.w48}>Your drill · 24 hours</Label>
              <View style={{ marginTop: space.s, position: 'relative' }}>
                <Display size="d4">{verdict.drill.title}</Display>
                <Body color={color.w72} style={{ marginTop: 6 }}>{verdict.drill.body}</Body>
                {!unlocked && (
                  <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
                    <View style={styles.lock} />
                  </BlurView>
                )}
              </View>

              {verdict.script && (
                <View style={{ marginTop: space.xl }}>
                  <Label color={color.w48}>Poise said</Label>
                  <Body color={color.white} style={{ marginTop: space.s, fontStyle: 'normal' }}>
                    {unlocked ? verdict.script : verdict.script.split('. ').slice(0, 2).join('. ') + '…'}
                  </Body>
                  {OFFLINE && <Label small color={color.w24} style={{ marginTop: 6 }}>Voice plays when the server is connected</Label>}
                </View>
              )}

              <View style={{ marginTop: space.xxl }}>
                {unlocked ? (
                  <Stack gap={space.s}>
                    <Button label="Start the drill" surface="cobalt" onPress={() => router.replace('/(tabs)')} />
                    <Button label="Share your Mark" variant="secondary" surface="cobalt" onPress={() => router.push({ pathname: '/share', params: { id: verdict.id } })} />
                  </Stack>
                ) : (
                  <Stack gap={space.s}>
                    <Body color={color.w72} small>
                      {name ? `${name}, that` : 'That'} was the first tell. The other two, the drill and Poise's voice are in the full read.
                    </Body>
                    <Button label="See the full read" surface="cobalt" onPress={() => router.push({ pathname: '/paywall', params: { from: verdict.id } })} />
                  </Stack>
                )}
              </View>
            </Animated.View>
          )}
        </Gutter>
      </ScrollView>
    </Screen>
  );
}

function AxisRow({ label, value, prev }: { label: string; value: number; prev?: number }) {
  return (
    <View>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
        <Label color={color.w72}>{label}</Label>
        <Row gap={space.m}>
          {prev !== undefined && <Label small color={color.w48}>{value - prev > 0 ? '↑' : value - prev < 0 ? '↓' : '→'} {Math.abs(value - prev)}</Label>}
          <Numeral value={value} size={28} />
        </Row>
      </Row>
      <View style={{ height: 1, backgroundColor: color.w16 }}>
        <Animated.View entering={FadeIn.duration(800)} style={{ height: 1, width: `${value}%`, backgroundColor: color.white }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tell: { paddingVertical: space.l, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w16, overflow: 'hidden' },
  lock: { flex: 1, backgroundColor: 'rgba(20,20,240,0.35)' },
});
