import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions, Text as RNText, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedSensor,
  useAnimatedReaction,
  SensorType,
  interpolate,
  withRepeat,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button, Label, Row, Statue, Halo } from '@/ui';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';

type Name = 'head' | 'athlete' | 'bust' | 'antinoos';
const FIGURE: Name[] = ['head', 'athlete', 'bust', 'antinoos', 'head'];
const STEPS = [
  { kicker: '', title: '', body: '' }, // the dictionary entry (rendered specially)
  { kicker: 'First impressions', title: 'You’re read\nin seconds.', body: 'Before your first sentence ends, people have decided how sure, how warm and how worth hearing you are.' },
  { kicker: 'What they read', title: 'It isn’t\nyour face.', body: 'It’s your voice, your eyes, your timing. The pause before you answer. The line you let fade out.' },
  { kicker: 'The method', title: 'Aura is\ntrainable.', body: 'Talk with people who react in real time. Poise finds the moment it turned and gives you one change.' },
  { kicker: 'Kleos', title: 'Build what’s\nheard of you.', body: '' },
];
const LAST = STEPS.length - 1;

/**
 * Opening: one scene. Drag anywhere and the statue turns like a dial, edge-on, into the next figure;
 * the rays spin with your finger and the words change in place. Tilt the phone and it leans.
 */
export default function Welcome() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const p = useSharedValue(0); // 0..LAST, continuous
  const start = useSharedValue(0);
  const [step, setStep] = useState(0);
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const spin = useSharedValue(0);
  const drawIn = useSharedValue(0);
  const rise = useSharedValue(0);

  useEffect(() => {
    drawIn.value = withDelay(100, withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }));
    rise.value = withDelay(500, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
    spin.value = withRepeat(withTiming(360, { duration: 80000, easing: Easing.linear }), -1, false);
  }, [drawIn, rise, spin]);

  const tick = (n: number) => {
    setStep(n);
    play('tick');
    Haptics.selectionAsync();
  };
  useAnimatedReaction(
    () => Math.round(p.value),
    (n, prev) => {
      if (prev !== null && n !== prev) runOnJS(tick)(n);
    },
  );

  const settle = (to: number) => {
    'worklet';
    p.set(withSpring(Math.max(0, Math.min(LAST, to)), { damping: 18, stiffness: 120, mass: 0.9 }));
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onStart(() => {
      start.set(p.value);
    })
    .onUpdate((e) => {
      const raw = start.value - e.translationX / (width * 0.75);
      p.set(raw < 0 ? raw * 0.25 : raw > LAST ? LAST + (raw - LAST) * 0.25 : raw);
    })
    .onEnd((e) => {
      const fling = -e.velocityX / 1600;
      settle(Math.round(p.value + Math.max(-0.6, Math.min(0.6, fling))));
    });
  const tap = Gesture.Tap().onEnd((e) => {
    settle(Math.round(p.value) + (e.x > width / 2 ? 1 : -1));
  });
  const gesture = Gesture.Exclusive(pan, tap);

  const haloSize = height * 1.05;
  const statueH = height * 0.45;

  const haloStyle = useAnimatedStyle(() => {
    const { roll } = sensor.sensor.value;
    return {
      opacity: drawIn.value * 0.9,
      transform: [
        { translateX: Math.max(-24, Math.min(24, (roll || 0) * -36)) },
        { rotate: `${spin.value + p.value * 72 + (1 - drawIn.value) * -160}deg` },
        { scale: 0.2 + 0.8 * drawIn.value },
      ],
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (width - haloSize) / 2, top: height * 0.33 - haloSize / 2 }, haloStyle]}>
            <Halo size={haloSize} opacity={0.6} />
          </Animated.View>
          {FIGURE.map((name, k) => (
            <Figure key={k} name={name} k={k} p={p} rise={rise} sensor={sensor.sensor} height={height} statueH={statueH} />
          ))}
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.88)', '#FFFFFF']} locations={[0, 0.4, 0.75]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.56 }} />

          {/* Words, in place */}
          <View pointerEvents="none" style={{ position: 'absolute', left: 26, right: 26, bottom: 150 }}>
            <Words p={p} k={0}>
              <Entry />
            </Words>
            {STEPS.slice(1).map((s, i) => (
              <Words key={i} p={p} k={i + 1}>
                <View style={{ gap: 10 }}>
                  <Label color={t.accent}>{s.kicker}</Label>
                  <RNText style={{ fontFamily: font.medium, fontSize: 44, lineHeight: 48, letterSpacing: -1.4, color: t.ink }}>{s.title}</RNText>
                  {s.body ? <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: t.ink2 }}>{s.body}</RNText> : null}
                </View>
              </Words>
            ))}
          </View>
        </View>
      </GestureDetector>

      <View pointerEvents="none" style={{ position: 'absolute', top: 58, left: 26, right: 26 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label color={t.ink} style={{ letterSpacing: 3 }}>Kleos</Label>
          <Label>Private by default</Label>
        </Row>
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 24, right: 24, bottom: 34, gap: 14 }}>
        <Animated.View entering={FadeIn.delay(3400).duration(600)} pointerEvents="none">
          <Progress p={p} />
        </Animated.View>
        <View style={{ height: 56, justifyContent: 'center' }} pointerEvents="box-none">
          {step < LAST ? (
            <Animated.View entering={FadeIn.delay(step === 0 ? 3600 : 0).duration(500)} pointerEvents="none">
              <Hint />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(450)}>
              <Button label="Begin" sound="select" onPress={() => router.push('/onboarding/goal')} />
            </Animated.View>
          )}
        </View>
        <Label align="center" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>For adults 18+ · No account needed</Label>
      </View>
    </View>
  );
}

/** One figure on the turntable. Visible only around its step; turns edge-on as the dial passes. */
function Figure({ name, k, p, rise, sensor, height, statueH }: { name: Name; k: number; p: SharedValue<number>; rise: SharedValue<number>; sensor: SharedValue<{ pitch: number; roll: number; yaw: number; qw: number; qx: number; qy: number; qz: number; interfaceOrientation: number }>; height: number; statueH: number }) {
  const st = useAnimatedStyle(() => {
    const off = p.value - k; // -0.5..0.5 while this figure is the one facing you
    const visible = Math.abs(off) <= 0.5 ? 1 : 0;
    const { pitch, roll } = sensor.value;
    const tiltY = Math.max(-14, Math.min(14, (roll || 0) * 22));
    const tiltX = Math.max(-7, Math.min(7, ((pitch || 0) - 0.6) * -10));
    const r = k === 0 ? rise.value : 1;
    return {
      opacity: visible * r,
      transform: [
        { perspective: 1000 },
        { translateY: (1 - r) * 60 },
        { rotateY: `${off * -180 + tiltY}deg` },
        { rotateX: `${tiltX}deg` },
        { scale: interpolate(Math.abs(off), [0, 0.5], [1, 0.9]) * (0.92 + 0.08 * r) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: height * 0.085, left: 0, right: 0, alignItems: 'center' }, st]}>
      <Statue name={name} height={statueH} />
    </Animated.View>
  );
}

/** Words for one step: they surface as the dial reaches them and sink as it leaves. */
function Words({ p, k, children }: { p: SharedValue<number>; k: number; children: React.ReactNode }) {
  const st = useAnimatedStyle(() => {
    const d = p.value - k;
    const a = Math.abs(d);
    return { opacity: interpolate(a, [0, 0.42], [1, 0], 'clamp'), transform: [{ translateY: interpolate(d, [-0.5, 0, 0.5], [26, 0, -26], 'clamp') }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, st]}>{children}</Animated.View>;
}

/** The dictionary entry, typed in on first open. */
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

/** A thin dial track under the words: where you are in the turn. */
function Progress({ p }: { p: SharedValue<number> }) {
  const t = useTheme();
  const st = useAnimatedStyle(() => ({ width: `${(Math.max(0, Math.min(LAST, p.value)) / LAST) * 100}%` }));
  return (
    <View style={{ height: 2, borderRadius: 1, backgroundColor: t.cardAlt, overflow: 'hidden', marginHorizontal: 40 }}>
      <Animated.View style={[{ height: 2, backgroundColor: t.accent }, st]} />
    </View>
  );
}

function Hint() {
  const t = useTheme();
  const n = useSharedValue(0);
  useEffect(() => {
    n.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [n]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -12 * n.value }] }));
  return (
    <Animated.View style={[{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, st]}>
      <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink2 }}>Turn it</RNText>
      <RNText style={{ fontFamily: font.medium, fontSize: 17, color: t.accent }}>←</RNText>
    </Animated.View>
  );
}
