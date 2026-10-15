import React, { useEffect } from 'react';
import { View, useWindowDimensions, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Screen, Title, Body, Button, Label, Row } from '@/ui';
import { ReactiveStatue } from '@/components/ReactiveStatue';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';

type Name = 'head' | 'athlete' | 'bust' | 'antinoos';
const STORY: { statue: Name; kicker: string; title: string; body: string }[] = [
  { statue: 'athlete', kicker: 'First impressions', title: 'You’re read\nin seconds.', body: 'Before your first sentence ends, people have already decided how sure, how warm and how worth listening to you are.' },
  { statue: 'bust', kicker: 'What they read', title: 'It isn’t\nyour face.', body: 'It’s your voice, your eyes, your timing. The pause before you answer. The sentence you let fade out.' },
  { statue: 'antinoos', kicker: 'The method', title: 'Aura is\ntrainable.', body: 'Talk with characters who react in real time. Poise finds the moment it turned and gives you one change. Then you run it again.' },
  { statue: 'head', kicker: 'Kleos', title: 'Build what’s\nheard of you.', body: 'Every conversation you get better at becomes part of your kleos.' },
];

/** Welcome: the dictionary entry, then four swipes on why presence is everything. Swipe only. */
export default function Welcome() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const x = useSharedValue(0);
  const pages = STORY.length + 1;
  const art = Math.min(300, height * 0.33);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  const lastPage = (pages - 1) * width;

  const ctaStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [lastPage - width * 0.5, lastPage], [0, 1], 'clamp'), transform: [{ translateY: interpolate(x.value, [lastPage - width * 0.5, lastPage], [16, 0], 'clamp') }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, width * 0.3], [1, 0], 'clamp') }));

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 10 }}>
        <Label color={t.ink} style={{ letterSpacing: 3 }}>Kleos</Label>
        <Label>Private by default</Label>
      </Row>

      <Animated.ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} onMomentumScrollEnd={() => play('tick')} style={{ flex: 1 }}>
        {/* 0 · The dictionary entry */}
        <View style={{ width, flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ReactiveStatue name="head" height={art} scrollX={x} index={0} pageWidth={width} intro />
          </View>
          <View style={{ paddingHorizontal: 26, gap: 6, minHeight: 230 }}>
            <Row gap={0}>
              {'Kleos'.split('').map((ch, i) => (
                <Animated.Text key={i} entering={FadeInDown.delay(1450 + i * 110).duration(500)} style={{ fontFamily: font.medium, fontSize: 56, lineHeight: 64, letterSpacing: -1.5, color: t.ink }}>
                  {ch}
                </Animated.Text>
              ))}
            </Row>
            <Animated.View entering={FadeIn.delay(2150).duration(600)}>
            <Row gap={10} style={{ flexWrap: 'wrap' }}>
              <RNText style={{ fontFamily: font.serifItalic, fontSize: 22, color: t.ink }}>κλέος</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.ink2 }}>/ˈkle.os/</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.ink3 }}>KLEH-oss</RNText>
            </Row>
            <RNText style={{ fontFamily: font.serifItalic, fontSize: 16, color: t.ink2, marginTop: 4 }}>noun · Ancient Greek</RNText>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(2550).duration(600)} style={{ gap: 6, marginTop: 6 }}>
              <Row gap={10} style={{ alignItems: 'flex-start' }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.accent, width: 16 }}>1</RNText>
                <Body style={{ flex: 1 }}>Glory; renown.</Body>
              </Row>
              <Row gap={10} style={{ alignItems: 'flex-start' }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.accent, width: 16 }}>2</RNText>
                <Body style={{ flex: 1 }}>Literally, <RNText style={{ fontFamily: font.serifItalic, fontSize: 17 }}>what is heard of you</RNText>: the impression you leave in the minds of others.</Body>
              </Row>
            </Animated.View>
          </View>
        </View>

        {/* 1-4 · Why presence is everything */}
        {STORY.map((s, k) => (
          <View key={k} style={{ width, flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ReactiveStatue name={s.statue} height={art} scrollX={x} index={k + 1} pageWidth={width} />
            </View>
            <View style={{ paddingHorizontal: 26, gap: 10, minHeight: 230 }}>
              <Label color={t.accent}>{s.kicker}</Label>
              <Title size={38} style={{ letterSpacing: -1 }}>{s.title}</Title>
              <Body color={t.ink2} style={{ fontSize: 16, lineHeight: 23 }}>{s.body}</Body>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 8, height: 120, justifyContent: 'flex-end', gap: 14 }}>
        <Animated.View entering={FadeIn.delay(3000).duration(600)} style={{ position: 'absolute', top: 0, left: 24, right: 24 }}>
          <Dots x={x} width={width} n={pages} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 24, right: 24, bottom: 34 }, hintStyle]} pointerEvents="none">
          <Animated.View entering={FadeIn.delay(3200).duration(600)}>
            <SwipeHint />
          </Animated.View>
        </Animated.View>
        <Animated.View style={ctaStyle}>
          <Button label="Begin" sound="select" onPress={() => router.push('/onboarding/goal')} />
        </Animated.View>
        <Label align="center" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>For adults 18+ · No account needed</Label>
      </View>
    </Screen>
  );
}

function Dots({ x, width, n }: { x: { value: number }; width: number; n: number }) {
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      {Array.from({ length: n }).map((_, k) => (
        <Dot key={k} x={x} width={width} k={k} />
      ))}
    </Row>
  );
}

function Dot({ x, width, k }: { x: { value: number }; width: number; k: number }) {
  const t = useTheme();
  const st = useAnimatedStyle(() => {
    const d = Math.abs(x.value / width - k);
    return { width: interpolate(d, [0, 1], [20, 6], 'clamp'), opacity: interpolate(d, [0, 1], [1, 0.35], 'clamp') };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: t.accent }, st]} />;
}

function SwipeHint() {
  const t = useTheme();
  const n = useSharedValue(0);
  useEffect(() => {
    n.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [n]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -10 * n.value }] }));
  return (
    <Animated.View style={[{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, st]}>
      <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.ink2 }}>Swipe</RNText>
      <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.accent }}>←</RNText>
    </Animated.View>
  );
}
