import React, { useRef, useState } from 'react';
import { View, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, Pressable } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Button, Label, Row, Statue, Halo, Muted } from '@/ui';
import { useTheme } from '@/theme';
import { play } from '@/lib/sound';

type Slide = { statue: 'head' | 'athlete' | 'bust' | 'antinoos'; kicker: string; title: string; body: string };

const SLIDES: Slide[] = [
  { statue: 'head', kicker: 'Aura', title: 'Find out how\nyou come across.', body: 'Talk for thirty seconds. Hear what landed, what didn’t, and the one thing to change.' },
  { statue: 'athlete', kicker: 'Live conversations', title: 'Practice with people\nwho react.', body: 'Six characters with their own moods. They warm up, lose interest, push back. You hear it happen.' },
  { statue: 'bust', kicker: 'One change', title: 'Change one thing.\nHear the difference.', body: 'Poise finds the moment it turned, gives you one adjustment, and you run it again.' },
  { statue: 'antinoos', kicker: 'Out in the world', title: 'Scan a friend.\nDebrief a night out.', body: 'Pass the phone for a fifteen-second read. Tell Poise what happened and get the receipt.' },
];

/** Welcome. Four swipeable slides, then the real onboarding. */
export default function Welcome() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(0);
  const sv = useRef<ScrollView>(null);
  const art = Math.min(330, height * 0.36);
  const last = i === SLIDES.length - 1;

  function onEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== i) {
      setI(n);
      play('tick');
    }
  }
  function go(n: number) {
    sv.current?.scrollTo({ x: n * width, animated: true });
    setI(n);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 10 }}>
        <Label color={t.ink} style={{ letterSpacing: 2 }}>Aura</Label>
        {!last ? (
          <Pressable onPress={() => go(SLIDES.length - 1)} hitSlop={10}>
            <Muted small>Skip</Muted>
          </Pressable>
        ) : (
          <Label>Private by default</Label>
        )}
      </Row>

      <ScrollView ref={sv} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} style={{ flex: 1 }}>
        {SLIDES.map((s, k) => (
          <View key={k} style={{ width, flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View entering={FadeIn.duration(1200)} style={{ position: 'absolute' }}>
                <Halo size={art * 1.2} opacity={0.5} />
              </Animated.View>
              <Animated.View entering={FadeIn.duration(700)}>
                <Statue name={s.statue} height={art * 0.9} />
              </Animated.View>
            </View>
            <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ paddingHorizontal: 24, gap: 10, minHeight: 190 }}>
              <Label color={t.accent}>{s.kicker}</Label>
              <Title size={34}>{s.title}</Title>
              <Body color={t.ink2} style={{ fontSize: 16, lineHeight: 23 }}>{s.body}</Body>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 8, gap: 16 }}>
        <Row gap={6} style={{ justifyContent: 'center' }}>
          {SLIDES.map((_, k) => (
            <View key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? t.accent : t.lineStrong }} />
          ))}
        </Row>
        {last ? (
          <Button label="Get started" sound="select" onPress={() => router.push('/onboarding/goal')} />
        ) : (
          <Button label="Next" onPress={() => go(i + 1)} />
        )}
        <Label align="center" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>For adults 18+ · No account needed</Label>
      </View>
    </Screen>
  );
}
