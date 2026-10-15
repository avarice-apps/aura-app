import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Segments } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { useStore } from '@/state/store';

/** Onboarding 4 · The first live conversation, matched to the goal. */
export default function Live() {
  const goal = useStore((s) => s.goal);
  const set = useStore((s) => s.set);
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segments total={6} done={4} />
      </View>
      <Conversation
        args={{ goal, pressure: 1 }}
        onDone={({ sessionId, evaluation }) => {
          set({ ob: { ...useStore.getState().ob, first: evaluation, firstSession: sessionId } });
          router.replace('/onboarding/result');
        }}
      />
    </Screen>
  );
}
