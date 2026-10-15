import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Button, Label, Row, Print } from '@/ui';
import { useTheme } from '@/theme';

/** Onboarding 1 · Hook. Full cobalt, Hermes lineage. */
export default function Hook() {
  const t = useTheme();
  return (
    <Screen edges={['top', 'bottom']} bg={t.inverse}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 10 }}>
        <Title size={22} color={t.onInverse} style={{ letterSpacing: 1 }}>AURA</Title>
        <Label color={t.onInverse2}>Private by default</Label>
      </Row>
      <Animated.View entering={FadeIn.duration(1400)} style={{ flex: 1, marginTop: 14, marginHorizontal: 24 }}>
        <Print name="athlete" radius={4} />
        <Label color={t.onInverse} style={{ marginTop: 10 }}>#1 Read · #2 Retry · #3 Rise</Label>
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(700).delay(400)} style={{ paddingHorizontal: 24, gap: 12 }}>
        <Title size={50} color={t.onInverse}>How You{'\n'}Come Across.</Title>
        <Body color={t.onInverse2}>Talk for thirty seconds. Hear what landed, change one thing, and hear the difference. No account needed.</Body>
      </Animated.View>
      <View style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 10, gap: 12 }}>
        <Button label="Start" variant="light" sound="select" onPress={() => router.push('/onboarding/goal')} />
        <Label color={t.onInverse2} align="center">For adults 18+</Label>
      </View>
    </Screen>
  );
}
