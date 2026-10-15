import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions, Text as RNText, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedSensor,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedRef,
  SensorType,
  interpolate,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Row } from '@/ui';
import { font, ART, ArtName } from '@/theme';

const BLUE = '#1608F2';
const W70 = 'rgba(255,255,255,0.72)';

type Page = { art: ArtName; kicker: string; title: string; body: string };

const PAGES: Page[] = [
  { art: 'youth', kicker: '', title: '', body: '' }, // the name, rendered specially
  { art: 'lisa', kicker: 'The problem', title: 'People decide\nfast.', body: 'A few seconds after you start talking, they’ve decided if you’re worth listening to. Most of it isn’t what you said.' },
  { art: 'apollo', kicker: 'How you train', title: 'Talk to people\nwho react.', body: 'Live calls with people who get bored, cut you off, warm up or walk away. Strangers show up. Nobody is polite for your sake.' },
  { art: 'aurelius', kicker: 'The read', title: 'Then hear the\ntruth.', body: 'Poise tells you the exact moment you lost them and the one thing to change. Phone it in and the score says so.' },
  { art: 'pitt', kicker: 'Out loud', title: 'Farm it.\nThen live it.', body: 'Fifteen seconds on camera against your friends. A surprise side quest every day. A score that only moves if you do.' },
];
const LAST = PAGES.length - 1;

/**
 * Opening, all in print blue. Swipe five pages. The art above the words is a print that turns edge-on
 * into the next as you swipe, drifts slowly (a held camera), leans with the phone, and catches a glint of light.
 * The words live in their own band under the art, so nothing is ever covered.
 */
export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [page, setPage] = useState(0);
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const drawIn = useSharedValue(0);
  const drift = useSharedValue(0);
  const sweep = useSharedValue(0);

  const stageH = Math.min(height * (height < 720 ? 0.46 : 0.56), width * 1.25);

  useEffect(() => {
    drawIn.value = withDelay(80, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
    drift.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
    sweep.value = withDelay(1200, withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [drawIn, drift, sweep]);

  const onScroll = useAnimatedScrollHandler((e) => {
    p.value = e.contentOffset.x / width;
  });

  const changed = (n: number) => {
    setPage(n);
    Haptics.selectionAsync();
  };
  useAnimatedReaction(
    () => Math.round(p.value),
    (n, prev) => {
      if (prev !== null && n !== prev) runOnJS(changed)(n);
    },
  );

  const next = () => {
    (scrollRef.current as any)?.scrollTo({ x: Math.min(LAST, page + 1) * width, animated: true });
  };

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.55,
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-width, width]) }, { rotate: '16deg' }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: BLUE }}>
      {/* Stage */}
      <View pointerEvents="none" style={{ height: stageH, overflow: 'hidden' }}>
        {PAGES.map((pg, k) => (
          <Print key={k} art={pg.art} k={k} p={p} sensor={sensor.sensor} drawIn={drawIn} drift={drift} w={width} h={stageH} />
        ))}
        <Animated.View style={[{ position: 'absolute', top: -stageH * 0.3, left: width / 2 - 50, width: 100, height: stageH * 1.6 }, sweepStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
        <LinearGradient colors={['rgba(22,8,242,0.55)', 'rgba(22,8,242,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top + 70 }} />
        <LinearGradient colors={['rgba(22,8,242,0)', BLUE]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: stageH * 0.28 }} />
      </View>

      {/* Top bar */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, left: 24, right: 24 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 3, color: '#FFFFFF' }}>KLEOS</RNText>
          {page < LAST ? (
            <Pressable hitSlop={12} onPress={() => router.push('/onboarding/goal')}>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.5, color: W70 }}>SKIP</RNText>
            </Pressable>
          ) : (
            <View />
          )}
        </Row>
      </View>

      {/* Words, in their own band */}
      <Animated.ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1, marginTop: -28 }} decelerationRate="fast">
        {PAGES.map((pg, k) => (
          <View key={k} style={{ width, paddingHorizontal: 26 }}>
            <Words p={p} k={k}>{k === 0 ? <Entry /> : <Copy pg={pg} />}</Words>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Bottom */}
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 12, gap: 14 }}>
        <Dots p={p} />
        {page < LAST ? (
          <WhiteButton label={page === 0 ? 'See how it works' : 'Next'} ghost onPress={next} />
        ) : (
          <Animated.View entering={FadeInDown.duration(400)}>
            <WhiteButton label="Begin" onPress={() => router.push('/onboarding/goal')} />
          </Animated.View>
        )}
        <RNText style={{ textAlign: 'center', fontFamily: font.mono, fontSize: 10.5, letterSpacing: 0.6, color: 'rgba(255,255,255,0.6)' }}>FOR ADULTS 18+ · NO ACCOUNT NEEDED</RNText>
      </View>
    </View>
  );
}

function WhiteButton({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => ({ height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? 'rgba(255,255,255,0.12)' : '#FFFFFF', borderWidth: ghost ? 1 : 0, borderColor: 'rgba(255,255,255,0.35)', transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <RNText style={{ fontFamily: font.medium, fontSize: 16, color: ghost ? '#FFFFFF' : BLUE }}>{label}</RNText>
    </Pressable>
  );
}

type SensorValue = SharedValue<{ pitch: number; roll: number; yaw: number; qw: number; qx: number; qy: number; qz: number; interfaceOrientation: number }>;

/** One print on the turntable: turns edge-on into the next page, drifts, and leans with the phone. */
function Print({ art, k, p, sensor, drawIn, drift, w, h }: { art: ArtName; k: number; p: SharedValue<number>; sensor: SensorValue; drawIn: SharedValue<number>; drift: SharedValue<number>; w: number; h: number }) {
  const st = useAnimatedStyle(() => {
    const off = p.value - k;
    const visible = Math.abs(off) <= 0.5 ? 1 : 0;
    const { pitch, roll } = sensor.value;
    const tiltY = Math.max(-10, Math.min(10, (roll || 0) * 16));
    const tiltX = Math.max(-5, Math.min(5, ((pitch || 0) - 0.6) * -8));
    const r = k === 0 ? drawIn.value : 1;
    return {
      opacity: visible * r,
      transform: [
        { perspective: 1100 },
        { rotateY: `${off * -150 + tiltY}deg` },
        { rotateX: `${tiltX}deg` },
        { translateX: Math.max(-14, Math.min(14, (roll || 0) * -20)) },
        { translateY: -10 * drift.value + (1 - r) * 30 },
        { scale: (1.1 + 0.04 * drift.value) * interpolate(Math.abs(off), [0, 0.5], [1, 0.86]) },
      ],
    };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <Image source={ART[art]} style={{ width: w, height: h }} contentFit="cover" contentPosition="top" />
    </Animated.View>
  );
}

/** Words fade and lift slightly as their page leaves. */
function Words({ p, k, children }: { p: SharedValue<number>; k: number; children: React.ReactNode }) {
  const st = useAnimatedStyle(() => {
    const d = p.value - k;
    return { opacity: interpolate(Math.abs(d), [0, 0.6], [1, 0], 'clamp'), transform: [{ translateY: interpolate(Math.abs(d), [0, 0.6], [0, 14], 'clamp') }] };
  });
  return <Animated.View style={st}>{children}</Animated.View>;
}

function Copy({ pg }: { pg: Page }) {
  return (
    <View style={{ gap: 10 }}>
      <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6, color: W70 }}>{pg.kicker.toUpperCase()}</RNText>
      <RNText adjustsFontSizeToFit numberOfLines={2} style={{ fontFamily: font.medium, fontSize: 38, lineHeight: 42, letterSpacing: -1.2, color: '#FFFFFF' }}>{pg.title}</RNText>
      <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: 'rgba(255,255,255,0.86)' }}>{pg.body}</RNText>
    </View>
  );
}

/** The name, the way a dictionary would print it. Pages stay mounted, so this plays once. */
function Entry() {
  return (
    <View style={{ gap: 6 }}>
      <Row gap={0}>
        {'Kleos'.split('').map((ch, i) => (
          <Animated.Text key={i} entering={FadeInDown.delay(700 + i * 90).duration(480)} style={{ fontFamily: font.medium, fontSize: 64, lineHeight: 70, letterSpacing: -2.2, color: '#FFFFFF' }}>
            {ch}
          </Animated.Text>
        ))}
      </Row>
      <Animated.View entering={FadeIn.delay(1300).duration(600)}>
        <Row gap={12}>
          <RNText style={{ fontFamily: font.serifItalic, fontSize: 22, color: '#FFFFFF' }}>κλέος</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 12, color: W70 }}>/ˈkle.os/</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>KLEH-oss</RNText>
        </Row>
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(1700).duration(600)} style={{ fontFamily: font.serifItalic, fontSize: 32, lineHeight: 38, color: '#FFFFFF', marginTop: 6 }}>
        what is heard of you.
      </Animated.Text>
    </View>
  );
}

function Dots({ p }: { p: SharedValue<number> }) {
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      {PAGES.map((_, k) => (
        <Dot key={k} p={p} k={k} />
      ))}
    </Row>
  );
}

function Dot({ p, k }: { p: SharedValue<number>; k: number }) {
  const st = useAnimatedStyle(() => {
    const a = interpolate(Math.abs(p.value - k), [0, 1], [1, 0], 'clamp');
    return { width: 6 + 14 * a, backgroundColor: `rgba(255,255,255,${0.35 + 0.65 * a})` };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3 }, st]} />;
}
