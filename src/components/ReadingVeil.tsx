import React, { useEffect, useState } from 'react';
import { View, Text as RNText, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { font, useTheme } from '@/theme';

const GLOW = {
  cobalt: require('../../assets/fx/glow-cobalt.png'),
  lavender: require('../../assets/fx/glow-lavender.png'),
  ivory: require('../../assets/fx/glow-ivory.png'),
};

// What the wait says. Short, in the house voice; the last one stays until the read is ready.
const LINES = ['That’s the call.', 'Playing it back.', 'Every pause counts.', 'What they heard.', 'Almost.'];
const EASE = Easing.inOut(Easing.sin);
const BEAT_MS = 2200;

/**
 * Between hanging up and the read: light drifting through the dark like ink in water, the face receding into it,
 * and a few words that change as it works. `leaving` plays the hand-off to the result: the light swells and the
 * whole veil dissolves (about 450 ms), so the read arrives out of it rather than cutting in.
 */
export function ReadingVeil({ face, leaving = false }: { face?: any; leaving?: boolean }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (line >= LINES.length - 1) return;
    const id = setTimeout(() => setLine((l) => l + 1), line === 0 ? 1600 : 2300);
    return () => clearTimeout(id);
  }, [line]);

  // A slow heartbeat you can feel, in time with the face's pulse: lub (soft), dub (light), rest.
  useEffect(() => {
    const beat = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 170);
    };
    beat();
    const id = setInterval(beat, BEAT_MS);
    return () => clearInterval(id);
  }, []);

  // The veil as a whole: in, and out to the result.
  const out = useSharedValue(0);
  useEffect(() => {
    out.value = withTiming(leaving ? 1 : 0, { duration: leaving ? 450 : 0, easing: Easing.bezier(0.23, 1, 0.32, 1) });
  }, [leaving, out]);
  const veil = useAnimatedStyle(() => ({ opacity: 1 - out.value, transform: [{ scale: 1 + out.value * 0.06 }] }));

  const big = Math.max(width, height) * 0.95;
  return (
    <Animated.View style={[{ flex: 1, backgroundColor: t.bg, overflow: 'hidden' }, veil]} accessibilityLabel="Your read is on its way">
      <Drift src={GLOW.cobalt} size={big} x={-width * 0.28} y={-height * 0.18} dx={width * 0.22} dy={height * 0.12} ms={7000} still={still} opacity={0.9} />
      <Drift src={GLOW.lavender} size={big * 0.8} x={width * 0.3} y={height * 0.22} dx={-width * 0.26} dy={-height * 0.1} ms={9000} still={still} opacity={0.55} />
      <Drift src={GLOW.cobalt} size={big * 0.7} x={width * 0.12} y={height * 0.42} dx={-width * 0.18} dy={-height * 0.2} ms={11000} still={still} opacity={0.6} />
      <Drift src={GLOW.ivory} size={big * 0.45} x={-width * 0.05} y={-height * 0.04} dx={width * 0.08} dy={height * 0.06} ms={6000} still={still} opacity={0.12} />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ripples still={still} />
        {face ? <Recede face={face} still={still} /> : null}
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: height * 0.16, alignItems: 'center', paddingHorizontal: 32, gap: 10 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 2.4, color: t.ink3 }}>THE READ</RNText>
        <View style={{ height: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text
            key={line}
            entering={FadeInDown.duration(520).springify().damping(18).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(320)}
            style={{ position: 'absolute', fontFamily: font.serif, fontSize: 34, lineHeight: 40, color: t.ink, textAlign: 'center' }}
          >
            {LINES[line]}
          </Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** One soft light, drifting on its own slow loop. */
function Drift({ src, size, x, y, dx, dy, ms, still, opacity }: { src: any; size: number; x: number; y: number; dx: number; dy: number; ms: number; still: boolean; opacity: number }) {
  const p = useSharedValue(0);
  const q = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    p.value = withRepeat(withTiming(1, { duration: ms, easing: EASE }), -1, true);
    q.value = withDelay(ms / 3, withRepeat(withTiming(1, { duration: ms * 1.3, easing: EASE }), -1, true));
  }, [p, q, ms, still]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: x + dx * p.value }, { translateY: y + dy * q.value }, { scale: 0.92 + 0.16 * q.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: '50%', top: '50%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, opacity }, st]}>
      <Image source={src} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </Animated.View>
  );
}

/** Rings going out from the centre, slow, like sound leaving the room. */
function Ripples({ still }: { still: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1, 2].map((i) => (
        <Ring key={i} delay={i * 1100} still={still} />
      ))}
    </View>
  );
}

function Ring({ delay, still }: { delay: number; still: boolean }) {
  const t = useTheme();
  const v = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 3300, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1, false));
  }, [v, delay, still]);
  const st = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - v.value), transform: [{ scale: 0.6 + v.value * 1.9 }] }));
  return <Animated.View style={[{ position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: t.ink2 }, st]} />;
}

/** The person you just spoke to, slowly going under the light. */
function Recede({ face, still }: { face: any; still: boolean }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: still ? 0 : 5200, easing: Easing.out(Easing.cubic) });
  }, [v, still]);
  // The pulse: a quick swell on each heartbeat, easing back.
  const beat = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    beat.value = withRepeat(
      withSequence(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0.4, { duration: 120 }), withTiming(0.85, { duration: 120 }), withTiming(0, { duration: BEAT_MS - 380, easing: Easing.out(Easing.cubic) })),
      -1,
      false,
    );
  }, [beat, still]);
  const st = useAnimatedStyle(() => ({ opacity: 0.9 - 0.62 * v.value + 0.12 * beat.value, transform: [{ scale: 1 - 0.18 * v.value + 0.05 * beat.value }] }));
  return (
    <Animated.View style={[{ width: 132, height: 132, borderRadius: 66, overflow: 'hidden' }, st]}>
      <Image source={face} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </Animated.View>
  );
}
