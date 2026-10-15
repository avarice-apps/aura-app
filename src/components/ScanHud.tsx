import React, { useEffect } from 'react';
import { View, Text as RNText, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withTiming, withRepeat, useAnimatedStyle, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { font } from '@/theme';

/**
 * While recording: a soft fade at the top so the controls read, a small breathing dot with the time, and a
 * hairline that fills toward the limit. Quiet on purpose; the footage is the point.
 */
export function ScanHud({ secs, max, top = 104 }: { secs: number; max?: number; top?: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const pct = max ? Math.min(1, secs / max) : 0;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }} />
      <View style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }, dot]} />
          <RNText style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: 1.2, color: '#fff' }}>{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</RNText>
        </View>
      </View>
      {max ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <View style={{ width: `${pct * 100}%`, height: 2, backgroundColor: '#fff' }} />
        </View>
      ) : null}
    </View>
  );
}
