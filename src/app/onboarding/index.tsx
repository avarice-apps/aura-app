import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Button, Label, Row, Statue, Halo } from '@/ui';
import { useTheme } from '@/theme';

/** Onboarding 1 · Hook. Approved design O1: one statue, one line, one button. */
export default function Hook() {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const art = Math.min(400, height * 0.44);
  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 10 }}>
        <Label color={t.ink} style={{ letterSpacing: 2 }}>Aura</Label>
        <Label>Private by default</Label>
      </Row>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View entering={FadeIn.duration(1600)} style={{ position: 'absolute' }}>
          <Halo size={art * 1.15} opacity={0.55} />
        </Animated.View>
        <Animated.View entering={FadeIn.duration(900)}>
          <Statue name="head" height={art * 0.92} />
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.duration(700).delay(300)} style={{ paddingHorizontal: 24, gap: 12 }}>
        <Title size={40}>Find out how{'\n'}you come across.</Title>
        <Body color={t.ink2} style={{ fontSize: 16, lineHeight: 23 }}>Then change one thing and hear the difference. Two minutes. No account needed.</Body>
      </Animated.View>

      <View style={{ paddingHorizontal: 24, paddingTop: 26, paddingBottom: 8, gap: 12 }}>
        <Button label="Start" sound="select" onPress={() => router.push('/onboarding/goal')} />
        <Label align="center" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>For adults 18+</Label>
      </View>
    </Screen>
  );
}
