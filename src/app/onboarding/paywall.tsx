import React from 'react';
import { router } from 'expo-router';
import { Screen } from '@/ui';
import { PaywallBody } from '@/components/Paywall';

/** Onboarding 8 · Paywall, after the compare. Headline matches the goal. */
export default function OnboardingPaywall() {
  return (
    <Screen edges={['top', 'bottom']}>
      <PaywallBody onDone={() => router.replace('/(tabs)')} onSkip={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
