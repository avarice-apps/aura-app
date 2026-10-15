import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedSensor,
  SensorType,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  FadeInUp,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Statue, Halo } from '@/ui';
import { play } from '@/lib/sound';

type Name = 'head' | 'athlete' | 'bust' | 'antinoos' | 'bustDark';

/**
 * A statue that feels alive: it tilts in 3D with the phone (gyroscope), breathes when still,
 * the halo turns slowly behind it, and a tap sends a pulse through the rays.
 * `scrollX` + `index` add parallax when it sits inside a paged carousel.
 */
export function ReactiveStatue({ name, height, scrollX, index = 0, pageWidth = 0, intro = false }: { name: Name; height: number; scrollX?: SharedValue<number>; index?: number; pageWidth?: number; intro?: boolean }) {
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  const pulse = useSharedValue(intro ? 0 : 1);
  const spinIn = useSharedValue(intro ? -120 : 0);
  const halo = height * 1.3;

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 90000, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }), -1, true);
    if (intro) {
      // Opening sequence: the rays draw in from the centre and spin up into place.
      pulse.value = withDelay(150, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
      spinIn.value = withDelay(150, withTiming(0, { duration: 1600, easing: Easing.out(Easing.cubic) }));
    }
  }, [spin, breathe, intro, pulse, spinIn]);

  const statueStyle = useAnimatedStyle(() => {
    const { pitch, roll } = sensor.sensor.value;
    // Clamp device tilt into a gentle 3D turn of the statue.
    const ry = Math.max(-14, Math.min(14, (roll || 0) * 22));
    const rx = Math.max(-8, Math.min(8, ((pitch || 0) - 0.6) * -10));
    const par = scrollX && pageWidth ? interpolate(scrollX.value, [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth], [pageWidth * 0.35, 0, -pageWidth * 0.35]) : 0;
    const fade = scrollX && pageWidth ? interpolate(Math.abs(scrollX.value - index * pageWidth), [0, pageWidth * 0.8], [1, 0.2], 'clamp') : 1;
    return {
      opacity: fade,
      transform: [{ perspective: 700 }, { translateX: par }, { translateY: -6 * breathe.value }, { rotateY: `${ry}deg` }, { rotateX: `${rx}deg` }, { scale: 0.985 + 0.015 * breathe.value }],
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    const { roll } = sensor.sensor.value;
    const shift = Math.max(-18, Math.min(18, (roll || 0) * -30));
    const par = scrollX && pageWidth ? interpolate(scrollX.value, [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth], [pageWidth * 0.6, 0, -pageWidth * 0.6]) : 0;
    return { opacity: Math.min(1, pulse.value * 1.4), transform: [{ translateX: shift + par }, { rotate: `${spin.value + spinIn.value}deg` }, { scale: pulse.value }] };
  });

  return (
    <Pressable
      onPress={() => {
        pulse.set(withSequence(withTiming(1.12, { duration: 160 }), withSpring(1, { damping: 8, stiffness: 140 })));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        play('tick');
      }}
      style={{ width: halo, height: halo, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[{ position: 'absolute' }, haloStyle]}>
        <Halo size={halo} opacity={0.55} />
      </Animated.View>
      <Animated.View entering={intro ? FadeInUp.delay(650).duration(1100).springify().damping(16) : undefined}>
        <Animated.View style={statueStyle}>
          <Statue name={name} height={height} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
