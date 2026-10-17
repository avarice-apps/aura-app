import React, { useEffect, useMemo } from 'react';
import { View, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Canvas, Circle, Path, Skia, BlurMask, Group } from '@shopify/react-native-skia';
import Animated, { SharedValue, useDerivedValue, useSharedValue, withTiming, withRepeat, Easing, useAnimatedStyle, cancelAnimation } from 'react-native-reanimated';
import { useTheme } from '@/theme';

/**
 * The person on the other end of the call, as a portrait in a glowing ring.
 * - Their voice makes the halo swell (energy while `who` is 1).
 * - Your voice sends a thin ring out from the face (energy while `who` is 0).
 * - The arc around the face is their interest in you, 0-100, moving as the call goes.
 * - When they decide to leave, the face fades.
 */
type FaceProps = {
  source: any;
  size?: number;
  energy: SharedValue<number>;
  who: SharedValue<number>;
  interest: number | null;
  leaving?: boolean;
  idle?: boolean;
};

/** Skia draws the glow on phones. The web build (previews only) gets a CSS glow instead. */
export function CallFace(props: FaceProps) {
  return Platform.OS === 'web' ? <WebFace {...props} /> : <SkiaFace {...props} />;
}

function WebFace({ source, size = 208, energy, who, leaving }: FaceProps) {
  const t = useTheme();
  const box = Math.round(size * 1.62);
  const glow = useAnimatedStyle(() => {
    const e = who.value > 0.5 ? energy.value : 0;
    return { opacity: 0.35 + e * 0.5, transform: [{ scale: 1 + e * 0.12 }] };
  });
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size + 40, height: size + 40, borderRadius: (size + 40) / 2, backgroundColor: t.accent, filter: [{ blur: size * 0.12 }] } as any, glow]} />
      <View style={{ position: 'absolute', width: size + 24, height: size + 24, borderRadius: (size + 24) / 2, borderWidth: 2, borderColor: t.dark ? 'rgba(241,235,221,0.14)' : 'rgba(18,18,24,0.08)' }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#07061A', opacity: leaving ? 0.42 : 1 }}>
        <Image source={source} style={{ width: size, height: size }} contentFit="cover" />
      </View>
    </View>
  );
}

function SkiaFace({
  source,
  size = 208,
  energy,
  who,
  interest,
  leaving,
  idle,
}: {
  source: any;
  size?: number;
  /** 0..1 voice level, whoever is talking */
  energy: SharedValue<number>;
  /** 1 while they talk, 0 while you do */
  who: SharedValue<number>;
  interest: number | null;
  leaving?: boolean;
  /** connecting / reading back: a slow breath instead of a voice */
  idle?: boolean;
}) {
  const t = useTheme();
  const box = Math.round(size * 1.62);
  const c = box / 2;
  const r = size / 2;

  const breath = useSharedValue(0);
  useEffect(() => {
    if (idle) breath.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    else {
      cancelAnimation(breath);
      breath.value = withTiming(0, { duration: 300 });
    }
  }, [idle, breath]);

  const them = useDerivedValue(() => (who.value > 0.5 ? energy.value : 0) + breath.value * 0.35);
  const you = useDerivedValue(() => (who.value > 0.5 ? 0 : energy.value));

  const haloR = useDerivedValue(() => r + 10 + them.value * size * 0.16);
  const haloO = useDerivedValue(() => 0.28 + them.value * 0.5);
  const ringR = useDerivedValue(() => r + 6 + you.value * size * 0.2);
  const ringO = useDerivedValue(() => Math.min(0.9, you.value * 1.4));

  const arc = useMemo(() => {
    return Skia.PathBuilder.Make().addArc({ x: c - r - 12, y: c - r - 12, width: (r + 12) * 2, height: (r + 12) * 2 }, -90, 359.9).detach();
  }, [c, r]);
  const lvl = useSharedValue(interest == null ? 0 : interest / 100);
  useEffect(() => {
    lvl.value = withTiming(interest == null ? 0 : Math.max(0.02, Math.min(1, interest / 100)), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [interest, lvl]);

  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = withTiming(leaving ? 0.42 : 1, { duration: 1200 });
  }, [leaving, fade]);
  const faceStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: 1 + them.value * 0.025 }] }));

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Canvas style={{ position: 'absolute', width: box, height: box }}>
        <Group opacity={haloO}>
          <Circle cx={c} cy={c} r={haloR} color={t.accent}>
            <BlurMask blur={size * 0.13} style="normal" />
          </Circle>
        </Group>
        <Circle cx={c} cy={c} r={r + 12} color={t.dark ? 'rgba(241,235,221,0.14)' : 'rgba(18,18,24,0.08)'} style="stroke" strokeWidth={2} />
        {interest != null ? <Path path={arc} color={t.accent} style="stroke" strokeWidth={2.5} strokeCap="round" start={0} end={lvl} /> : null}
        <Circle cx={c} cy={c} r={ringR} color={t.dark ? '#F1EBDD' : '#121218'} style="stroke" strokeWidth={1.5} opacity={ringO} />
      </Canvas>
      <Animated.View style={[{ width: size, height: size, borderRadius: r, overflow: 'hidden', backgroundColor: '#07061A' }, faceStyle]}>
        <Image source={source} style={{ width: size, height: size }} contentFit="cover" transition={400} />
      </Animated.View>
    </View>
  );
}

/** The voice, as bars: they bounce with whoever is talking, like the site's call screen. */
export function VoiceBars({ energy, who, bars = 11, height = 46, color, dim }: { energy: SharedValue<number>; who: SharedValue<number>; bars?: number; height?: number; color?: string; dim?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: bars }, (_, i) => (
        <Bar key={i} i={i} n={bars} energy={energy} who={who} height={height} color={color ?? t.ink} dim={dim} />
      ))}
    </View>
  );
}

function Bar({ i, n, energy, who, height, color, dim }: { i: number; n: number; energy: SharedValue<number>; who: SharedValue<number>; height: number; color: string; dim?: boolean }) {
  // Each bar has its own rhythm so the row moves like speech, not like a meter.
  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(withTiming(1, { duration: 520 + ((i * 137) % 380), easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [i, phase]);
  const centre = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 + 0.5);
  const style = useAnimatedStyle(() => {
    const e = Math.min(1, energy.value * 1.15);
    const swing = 0.35 + 0.65 * phase.value;
    const h = 5 + (height - 5) * e * swing * (0.45 + 0.55 * centre);
    return { height: h, opacity: dim ? 0.35 : 0.55 + 0.45 * Math.max(e, who.value > 0.5 ? 0.4 : 0.2) };
  });
  return <Animated.View style={[{ width: 4, borderRadius: 2, backgroundColor: color }, style]} />;
}
