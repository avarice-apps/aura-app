import React, { useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Muted, Button, Segments, Stack, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, Goal } from '@/state/store';
import { play } from '@/lib/sound';

const GOALS: { key: Goal; label: string; sub: string }[] = [
  { key: 'dates', label: 'First dates', sub: 'Ease, curiosity' },
  { key: 'work', label: 'Interviews and work', sub: 'Clear, credible' },
  { key: 'rooms', label: 'Rooms and parties', sub: 'Entering, stories' },
  { key: 'ground', label: 'Holding my ground', sub: 'Pushback, saying no' },
];

/** Onboarding 2 · Goal. The first live conversation is built from this. */
export default function GoalScreen() {
  const t = useTheme();
  const set = useStore((s) => s.set);
  const [goal, setGoal] = useState<Goal | null>(null);
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, flex: 1 }}>
        <Segments total={6} done={1} />
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 26, gap: 8 }}>
          <Title size={30}>Where do you want to come across better?</Title>
          <Muted>Pick one. Your first conversation and your first week are built around it.</Muted>
        </Animated.View>
        <Stack gap={8} style={{ marginTop: 22 }}>
          {GOALS.map((g, i) => {
            const on = goal === g.key;
            return (
              <Animated.View key={g.key} entering={FadeInDown.duration(400).delay(80 * i)}>
                <Pressable
                  onPress={() => {
                    play('select');
                    Haptics.selectionAsync();
                    setGoal(g.key);
                  }}
                  style={{ height: 62, borderRadius: 16, paddingHorizontal: 18, backgroundColor: t.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.ink : t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 16, color: t.ink }}>{g.label}</RNText>
                  {on ? (
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon d={ICON.check} size={13} color={t.onInverse} stroke={3} />
                    </View>
                  ) : (
                    <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>{g.sub}</RNText>
                  )}
                </Pressable>
              </Animated.View>
            );
          })}
        </Stack>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button
          label="Continue"
          disabled={!goal}
          onPress={() => {
            set({ goal: goal! });
            router.push('/onboarding/quick');
          }}
        />
      </View>
    </Screen>
  );
}
