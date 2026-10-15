import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Label, Button, Segments } from '@/ui';
import { SituationCard, pickSituation } from '@/components/SituationCard';
import { useStore, Goal } from '@/state/store';

const CAT: Record<Goal, string> = { dates: 'dating', work: 'work', rooms: 'group', ground: 'conflict' };

/** Onboarding 3 · One situation matched to the goal. Fast: hooks in ~15s before asking for the mic. */
export default function Quick() {
  const goal = useStore((s) => s.goal);
  const set = useStore((s) => s.set);
  const seen = useStore((s) => s.situationsSeen);
  const s = useMemo(() => pickSituation(CAT[goal], seen, 1), [goal]); // eslint-disable-line react-hooks/exhaustive-deps
  const [answered, setAnswered] = useState(false);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}>
        <Segments total={5} done={2} />
        <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 22, marginBottom: 12 }}>
          <Label>Read the room · 12 seconds</Label>
        </Animated.View>
        <SituationCard
          s={s}
          onAnswered={(right) => {
            setAnswered(true);
            set({ ob: { quickCorrect: right ? 1 : 0 }, situationsSeen: [...seen, s.id] });
          }}
        />
      </ScrollView>
      {answered && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Button label="Now say it out loud" sound="select" onPress={() => router.push('/onboarding/consent')} />
        </View>
      )}
    </Screen>
  );
}
