import React from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen, Button, Segments, Stack } from '@/ui';
import { ResultHero, FeedbackCard, HearPoise, Appear, FullRead, Insufficient } from '@/components/Results';
import { useStore } from '@/state/store';

/** Onboarding 5 · First result. No retry here: in real life there isn't one. Next is the paywall. */
export default function Result() {
  const e = useStore((s) => s.ob.first) as any;
  if (!e) return null;
  if (e.insufficient) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, flex: 1 }}>
          <Segments total={5} done={5} />
          <Insufficient e={e} />
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Button label="Continue" sound="select" onPress={() => router.replace('/onboarding/paywall')} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <Segments total={5} done={5} />
        <Stack gap={12} style={{ marginTop: 16 }}>
          <Appear><ResultHero e={e} /></Appear>
          <Appear delay={150}><FeedbackCard e={e} /></Appear>
          <Appear delay={300}><HearPoise src={e.scriptAudio ?? e.script_audio} /></Appear>
          <Appear delay={450}><FullRead e={e} showAlternatives={false} /></Appear>
        </Stack>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button label="Continue" sound="select" onPress={() => router.replace('/onboarding/paywall')} />
      </View>
    </Screen>
  );
}
