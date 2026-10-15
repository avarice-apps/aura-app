import React from 'react';
import { router } from 'expo-router';
import { Screen } from '@/ui';
import { PaywallBody } from '@/components/Paywall';
import { useStore } from '@/state/store';
import { track } from '@/lib/analytics';

/** Onboarding 8 · Paywall, after the compare. Headline matches the goal. */
export default function OnboardingPaywall() {
  const set = useStore((s) => s.set);
  const go = () => {
    set({ onboarded: true });
    track('onboarding_complete');
    router.replace('/(tabs)');
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <PaywallBody reason="onboarding" onDone={go} onSkip={go} />
    </Screen>
  );
}
