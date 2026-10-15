import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Screen, IconButton, Icon, ICON, Label, Row } from '@/ui';
import { Conversation } from '@/components/Conversation';

/** A voice call with Poise. Any topic about how you come across: a date Friday, what to wear, a text to send. No score. */
export default function PoiseLive() {
  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton label="Close" onPress={() => router.back()}>
          <Icon d={ICON.close} size={16} />
        </IconButton>
        <Label>Talk to Poise</Label>
        <View style={{ width: 40 }} />
      </Row>
      <Conversation metered args={{ poise: true }} onDone={() => router.back()} onLeave={() => router.back()} />
    </Screen>
  );
}
