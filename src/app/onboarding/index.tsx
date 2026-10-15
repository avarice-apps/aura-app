import React, { useEffect } from 'react';
import { View, useWindowDimensions, Text as RNText, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedSensor,
  SensorType,
  interpolate,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
  SharedValue,
  type ValueRotation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button, Label, Row, Statue, Halo } from '@/ui';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';

type Name = 'head' | 'athlete' | 'bust' | 'antinoos';
const FIGURES: Name[] = ['head', 'athlete', 'bust', 'antinoos', 'head'];

const STORY = [
  { kicker: 'First impressions', title: 'You’re read\nin seconds.', body: 'Before your first sentence ends, people have decided how sure, how warm and how worth hearing you are.' },
  { kicker: 'What they read', title: 'It isn’t\nyour face.', body: 'It’s your voice, your eyes, your timing. The pause before you answer. The line you let fade out.' },
  { kicker: 'The method', title: 'Aura is\ntrainable.', body: 'Talk with people who react in real time. Poise finds the moment it turned and gives you one change.' },
  { kicker: 'Kleos', title: 'Build what’s\nheard of you.', body: '' },
];

/**
 * Opening. A full-screen statue that turns as you swipe and tilts with the phone,
 * a field of blue rays behind it, and the words over the top.
 */
export default function Welcome() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const x = useSharedValue(0);
  const pages = STORY.length + 1;
  const lastPage = (pages - 1) * width;
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  const ctaStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [lastPage - width * 0.5, lastPage], [0, 1], 'clamp'), transform: [{ translateY: interpolate(x.value, [lastPage - width * 0.5, lastPage], [20, 0], 'clamp') }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, width * 0.25], [1, 0], 'clamp') }));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Cinematic layer: rays + statues, full screen, behind everything */}
      <Stage x={x} width={width} height={height} />

      {/* Fade to white under the words so they always read */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', '#FFFFFF']} locations={[0, 0.4, 0.75]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.56 }} />

      {/* Words, paged */}
      <Animated.ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} onMomentumScrollEnd={() => play('tick')} style={StyleSheet.absoluteFill}>
        <View style={{ width, height, justifyContent: 'flex-end', paddingHorizontal: 26, paddingBottom: 150 }}>
          <Entry />
        </View>
        {STORY.map((s, k) => (
          <View key={k} style={{ width, height, justifyContent: 'flex-end', paddingHorizontal: 26, paddingBottom: 150, gap: 10 }}>
            <Label color={t.accent}>{s.kicker}</Label>
            <RNText style={{ fontFamily: font.medium, fontSize: 44, lineHeight: 48, letterSpacing: -1.4, color: t.ink }}>{s.title}</RNText>
            {s.body ? <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: t.ink2 }}>{s.body}</RNText> : null}
          </View>
        ))}
      </Animated.ScrollView>

      {/* Top bar */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 58, left: 26, right: 26 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label color={t.ink} style={{ letterSpacing: 3 }}>Kleos</Label>
          <Label>Private by default</Label>
        </Row>
      </View>

      {/* Bottom: dots, hint, begin */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 24, right: 24, bottom: 34, gap: 14 }}>
        <Animated.View entering={FadeIn.delay(3600).duration(600)}>
          <Dots x={x} width={width} n={pages} />
        </Animated.View>
        <View style={{ height: 56, justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0 }, hintStyle]}>
            <Animated.View entering={FadeIn.delay(3800).duration(600)}>
              <SwipeHint />
            </Animated.View>
          </Animated.View>
          <Animated.View style={ctaStyle}>
            <Button label="Begin" sound="select" onPress={() => router.push('/onboarding/goal')} />
          </Animated.View>
        </View>
        <Label align="center" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>For adults 18+ · No account needed</Label>
      </View>
    </View>
  );
}

/** The dictionary entry: the word, the Greek, how to say it, and what it means. */
function Entry() {
  const t = useTheme();
  const words = ['what', 'is', 'heard', 'of', 'you.'];
  return (
    <View style={{ gap: 4 }}>
      <Row gap={0}>
        {'Kleos'.split('').map((ch, i) => (
          <Animated.Text key={i} entering={FadeInDown.delay(1500 + i * 110).duration(520)} style={{ fontFamily: font.medium, fontSize: 76, lineHeight: 84, letterSpacing: -2.5, color: t.ink }}>
            {ch}
          </Animated.Text>
        ))}
      </Row>
      <Animated.View entering={FadeIn.delay(2200).duration(700)}>
        <Row gap={12}>
          <RNText style={{ fontFamily: font.serifItalic, fontSize: 24, color: t.ink }}>κλέος</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.ink2 }}>/ˈkle.os/</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.ink3 }}>KLEH-oss</RNText>
        </Row>
      </Animated.View>
      <Row gap={9} style={{ flexWrap: 'wrap', marginTop: 14 }}>
        {words.map((w, i) => (
          <Animated.Text key={i} entering={FadeInDown.delay(2700 + i * 160).duration(600)} style={{ fontFamily: font.serifItalic, fontSize: 38, lineHeight: 44, color: t.accent }}>
            {w}
          </Animated.Text>
        ))}
      </Row>
    </View>
  );
}

/** Full-screen statues and rays. Swiping turns the statue; tilting the phone leans it; a tap pulses the rays. */
function Stage({ x, width, height }: { x: SharedValue<number>; width: number; height: number }) {
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const spin = useSharedValue(0);
  const drawIn = useSharedValue(0);
  const pulse = useSharedValue(1);
  const sway = useSharedValue(0);
  const haloSize = height * 1.05;
  const statueH = height * 0.5;

  useEffect(() => {
    drawIn.value = withDelay(100, withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }));
    spin.value = withRepeat(withTiming(360, { duration: 80000, easing: Easing.linear }), -1, false);
    sway.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [drawIn, spin, sway]);

  const haloStyle = useAnimatedStyle(() => {
    const { roll } = sensor.sensor.value;
    const swipeTurn = (x.value / width) * 50;
    const introTurn = (1 - drawIn.value) * -160;
    return {
      opacity: drawIn.value * 0.9,
      transform: [{ translateX: Math.max(-24, Math.min(24, (roll || 0) * -36)) }, { rotate: `${spin.value + swipeTurn + introTurn}deg` }, { scale: (0.2 + 0.8 * drawIn.value) * pulse.value }],
    };
  });

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={() => {
        pulse.set(withSequence(withTiming(1.08, { duration: 150 }), withSpring(1, { damping: 7, stiffness: 120 })));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      }}
    >
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (width - haloSize) / 2, top: height * 0.33 - haloSize / 2 }, haloStyle]}>
        <Halo size={haloSize} opacity={0.6} />
      </Animated.View>
      {FIGURES.map((name, k) => (
        <Figure key={k} name={name} k={k} x={x} width={width} height={height} statueH={statueH} sway={sway} sensor={sensor.sensor} intro={k === 0} />
      ))}
    </Pressable>
  );
}

function Figure({ name, k, x, width, height, statueH, sway, sensor, intro }: { name: Name; k: number; x: SharedValue<number>; width: number; height: number; statueH: number; sway: SharedValue<number>; sensor: SharedValue<ValueRotation>; intro: boolean }) {
  const rise = useSharedValue(intro ? 0 : 1);
  useEffect(() => {
    if (intro) rise.value = withDelay(500, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [intro, rise]);
  const st = useAnimatedStyle(() => {
    const off = (x.value - k * width) / width; // -1..1 around this page
    const { pitch, roll } = sensor.value;
    const tiltY = Math.max(-16, Math.min(16, (roll || 0) * 24));
    const tiltX = Math.max(-8, Math.min(8, ((pitch || 0) - 0.6) * -10));
    const idle = (sway.value - 0.5) * 16; // slow turn back and forth
    return {
      opacity: interpolate(Math.abs(off), [0, 0.55], [1, 0], 'clamp') * rise.value,
      transform: [
        { perspective: 900 },
        { translateX: off * -width * 0.25 },
        { translateY: (1 - rise.value) * 60 },
        { rotateY: `${off * -55 + idle + tiltY}deg` },
        { rotateX: `${tiltX}deg` },
        { scale: interpolate(Math.abs(off), [0, 1], [1, 0.82], 'clamp') * (0.92 + 0.08 * rise.value) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: height * 0.1, left: 0, right: 0, alignItems: 'center' }, st]}>
      <Statue name={name} height={statueH} />
    </Animated.View>
  );
}

function Dots({ x, width, n }: { x: SharedValue<number>; width: number; n: number }) {
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      {Array.from({ length: n }).map((_, k) => (
        <Dot key={k} x={x} width={width} k={k} />
      ))}
    </Row>
  );
}

function Dot({ x, width, k }: { x: SharedValue<number>; width: number; k: number }) {
  const t = useTheme();
  const st = useAnimatedStyle(() => {
    const d = Math.abs(x.value / width - k);
    return { width: interpolate(d, [0, 1], [22, 6], 'clamp'), opacity: interpolate(d, [0, 1], [1, 0.3], 'clamp') };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: t.accent }, st]} />;
}

function SwipeHint() {
  const t = useTheme();
  const n = useSharedValue(0);
  useEffect(() => {
    n.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [n]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -12 * n.value }] }));
  return (
    <Animated.View style={[{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, st]}>
      <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink2 }}>Swipe</RNText>
      <RNText style={{ fontFamily: font.medium, fontSize: 17, color: t.accent }}>←</RNText>
    </Animated.View>
  );
}
