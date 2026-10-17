import React, { useState } from 'react';
import { View, Pressable, ScrollView, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Muted, Button, Segments, Stack, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, Goal, Tone, Pronoun, Dates } from '@/state/store';
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
  const [tone, setTone] = useState<Tone>('real');
  const [pronoun, setPronoun] = useState<Pronoun | null>(null);
  const [dates, setDates] = useState<Dates | null>(null);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <Segments total={5} done={1} />
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
                  style={{ height: 62, borderRadius: 16, paddingHorizontal: 18, backgroundColor: t.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.accent : t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
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
        <Animated.View entering={FadeInDown.duration(400).delay(360)} style={{ marginTop: 26, gap: 10 }}>
          <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>How should it talk to you?</RNText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { key: 'real', label: 'Straight', sub: 'Clear, honest, no swearing.' },
              { key: 'unfiltered', label: 'Unfiltered', sub: 'Funny, blunt, swears. 18+.' },
            ] as { key: Tone; label: string; sub: string }[]).map((o) => {
              const on = tone === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => { play('select'); Haptics.selectionAsync(); setTone(o.key); }}
                  style={{ flex: 1, minHeight: 84, borderRadius: 16, padding: 14, backgroundColor: on ? t.accentSoft : t.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.accent : t.line, gap: 4 }}
                >
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: on ? t.accent : t.ink }}>{o.label}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: t.ink2 }}>{o.sub}</RNText>
                </Pressable>
              );
            })}
          </View>
          <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>Switch any time from Play or You.</RNText>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(400).delay(440)} style={{ marginTop: 22, gap: 10 }}>
          <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>The people you talk to call you</RNText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['he', 'she', 'they'] as Pronoun[]).map((p) => (
              <Small key={p} label={p === 'he' ? 'He' : p === 'she' ? 'She' : 'They'} on={pronoun === p} onPress={() => setPronoun(p)} />
            ))}
          </View>
          {goal === 'dates' ? (
            <>
              <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink, marginTop: 8 }}>On dates, across from you</RNText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['women', 'men', 'everyone'] as Dates[]).map((d) => (
                  <Small key={d} label={d === 'women' ? 'Women' : d === 'men' ? 'Men' : 'Anyone'} on={dates === d} onPress={() => setDates(d)} />
                ))}
              </View>
            </>
          ) : null}
          <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>Optional. Change it any time in You.</RNText>
        </Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button
          label="Continue"
          disabled={!goal}
          onPress={() => {
            set({ goal: goal!, tone, ...(pronoun ? { pronoun } : {}), ...(dates ? { dates } : {}) });
            router.push('/onboarding/quick');
          }}
        />
      </View>
    </Screen>
  );
}

function Small({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { play('select'); Haptics.selectionAsync(); onPress(); }} style={{ flex: 1, height: 46, borderRadius: 14, backgroundColor: on ? t.accentSoft : t.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.accent : t.line, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 15, color: on ? t.accent : t.ink }}>{label}</RNText>
    </Pressable>
  );
}
