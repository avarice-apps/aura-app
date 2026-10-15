import React from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router, Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Gutter, Row, Numeral } from '@/ui';
import { color, space } from '@/theme/tokens';
import { tierFor, TIERS, TierName } from '@/data';
import { useStore, latestVerdict, isPaid } from '@/state/store';

type Mode = {
  key: string;
  name: string;
  axis: string;
  body: string;
  minutes: string;
  unlock: TierName | 'pro';
  href: Href;
  bestKey?: 'pressure' | 'room' | 'silence';
};

const MODES: Mode[] = [
  { key: 'pressure', name: 'Pressure Rounds', axis: 'Composure', body: 'Three seconds, a surprise prompt, twenty seconds to answer. Round five, she interrupts.', minutes: '3', unlock: 'Faint', href: '/train/pressure', bestKey: 'pressure' },
  { key: 'room', name: 'Read the Room', axis: 'Read', body: 'Ten seconds a call. What she meant. Who holds it. What you do now.', minutes: '2', unlock: 'Faint', href: '/train/room', bestKey: 'room' },
  { key: 'silence', name: 'Holding Silence', axis: 'Presence', body: 'Fifteen seconds into the lens. Say nothing. Most men fail the first time.', minutes: '1', unlock: 'Present', href: '/train/silence', bestKey: 'silence' },
  { key: 'duet', name: 'Duets', axis: 'All', body: 'Send a prompt to a friend. Same Read, verdicts side by side. Loser buys.', minutes: '2', unlock: 'Present', href: '/train/duet' },
  { key: 'cold', name: 'Cold Open', axis: 'All', body: 'Live roleplay in voice. Poise plays the stranger, the interviewer, the landlord. Then she drops character.', minutes: '5', unlock: 'pro', href: '/train/cold' },
  { key: 'reference', name: 'Reference Read', axis: 'All', body: 'Upload someone whose presence you want. See the gap per axis. Get a two-week plan to close it.', minutes: '4', unlock: 'pro', href: '/train/reference' },
];

export default function Train() {
  const v = useStore(latestVerdict);
  const bests = useStore((s) => s.bests);
  const plan = useStore((s) => s.plan);
  const paid = useStore(isPaid);
  const index = v?.index ?? 0;
  const tier = tierFor(index);

  function unlocked(m: Mode) {
    if (m.unlock === 'pro') return plan === 'pro';
    const need = TIERS.find((t) => t.name === m.unlock)!.min;
    return index >= need && paid;
  }

  return (
    <Screen surface="ink">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <Gutter>
          <Label style={{ paddingTop: space.s }}>Train</Label>
          <Display size="d3" style={{ marginTop: space.m, marginBottom: space.l }}>Four minutes a day{'\n'}beats one hour a week.</Display>

          {MODES.map((m) => {
            const open = unlocked(m);
            const best = m.bestKey ? bests[m.bestKey] : undefined;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  if (open) router.push(m.href);
                  else router.push('/paywall');
                }}
                style={styles.row}
              >
                <View style={{ flex: 1 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Label small color={color.w48}>{m.axis} · {m.minutes} min</Label>
                    <Label small color={open ? color.w48 : color.w24}>{open ? (best !== undefined ? `Best ${best}` : 'Open') : m.unlock === 'pro' ? 'Pro' : `${m.unlock}+`}</Label>
                  </Row>
                  <Display size="d4" color={open ? color.white : color.w48} style={{ marginTop: 6 }}>{m.name}</Display>
                  <Body color={open ? color.w72 : color.w24} style={{ marginTop: 4 }}>{m.body}</Body>
                </View>
              </Pressable>
            );
          })}

          <View style={{ marginTop: space.xl }}>
            <Label color={color.w48}>You are {tier.name}</Label>
            <Body color={color.w72} small style={{ marginTop: 4 }}>
              Modes unlock by tier. Your Index moves on Sundays. Training moves your Standing.
            </Body>
          </View>
        </Gutter>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.l, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 },
});
