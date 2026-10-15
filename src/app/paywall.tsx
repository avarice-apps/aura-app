import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, IconButton, Icon, ICON } from '@/ui';
import { PaywallBody, PaywallReason } from '@/components/Paywall';

export default function Paywall() {
  const { reason } = useLocalSearchParams<{ reason?: PaywallReason }>();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-end' }}>
        <IconButton label="Close" onPress={() => router.back()}><Icon d={ICON.close} size={16} /></IconButton>
      </View>
      <PaywallBody reason={reason ?? 'plan'} onDone={() => router.back()} onSkip={() => router.back()} />
    </Screen>
  );
}
