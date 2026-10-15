import React, { useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Body, Button, Card, Icon, ICON, Label, Muted, Row, Stack, Statue, Title, Tag } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, Goal } from '@/state/store';
import { play } from '@/lib/sound';
import PATH from '../../content/path.json';

const UNIT_FOR: Record<Goal, string> = { work: 'intro', dates: 'dates', rooms: 'rooms', ground: 'pushback' };
const HEADLINE: Record<Goal, string> = { work: 'Your interview week is ready.', dates: 'Your first-date week is ready.', rooms: 'Your rooms week is ready.', ground: 'Your hold-your-ground week is ready.' };

// Prices are hypotheses to test. RevenueCat replaces the local trial when products exist.
const PLANS = [
  { key: 'year', label: 'Yearly', price: '$59.99 a year', sub: 'About $1.15 a week', trial: true },
  { key: 'month', label: 'Monthly', price: '$12.99 a month', sub: 'Cancel any time', trial: false },
] as const;

export function PaywallBody({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const t = useTheme();
  const goal = useStore((s) => s.goal);
  const set = useStore((s) => s.set);
  const [plan, setPlan] = useState<'year' | 'month'>('year');
  const unit = PATH.units.find((u) => u.id === UNIT_FOR[goal]) ?? PATH.units[0];
  const days = unit.lessons.slice(0, 3);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={{ position: 'absolute', right: -24, top: 0 }}>
          <Statue name="bust" height={180} />
        </View>
        <Label>Built from your two takes</Label>
        <Title size={30} style={{ marginTop: 8, width: 230 }}>{HEADLINE[goal]}</Title>
        <Card style={{ marginTop: 26, paddingVertical: 4 }}>
          {days.map((l, i) => (
            <Row key={l.id} style={{ paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
              <Label style={{ width: 46 }}>Day {i + 1}</Label>
              <Body small style={{ flex: 1 }}>{l.title}</Body>
            </Row>
          ))}
          <Row style={{ paddingVertical: 11, borderTopWidth: 1, borderColor: t.cardAlt }}>
            <Label style={{ width: 46 }}>+4</Label>
            <Muted small style={{ flex: 1 }}>Checkpoint with a new character, then your first Sunday Letter.</Muted>
          </Row>
        </Card>

        <Stack gap={8} style={{ marginTop: 14 }}>
          {PLANS.map((p) => {
            const on = plan === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => {
                  play('select');
                  Haptics.selectionAsync();
                  setPlan(p.key);
                }}
                style={{ padding: 16, borderRadius: 18, backgroundColor: t.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.ink : t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Stack gap={3}>
                  <Row gap={8}>
                    <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{p.label}</RNText>
                    {p.trial && <Tag label="3 days free" tone="accent" />}
                  </Row>
                  <Muted small>{p.price} · {p.sub}</Muted>
                </Stack>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1, borderColor: t.lineStrong, backgroundColor: on ? t.inverse : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Icon d={ICON.check} size={12} color={t.onInverse} stroke={3} />}
                </View>
              </Pressable>
            );
          })}
        </Stack>

        <Card style={{ marginTop: 14, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body strong>Aura Black</Body>
            <Tag label="Soon" />
          </Row>
          <Muted small>For the big moments: rehearsals built from your real interview or date, Heat checkpoints, your monthly Portrait, unlimited voice with Poise.</Muted>
        </Card>

        <Stack gap={6} style={{ marginTop: 14 }}>
          {['Unlimited live conversations and the full Path', 'Laurels, Cadence and the Sunday Letter', 'Aura Scan, Receipts and Circles'].map((x) => (
            <Row key={x} gap={10}>
              <Icon d={ICON.check} size={14} color={t.accent} stroke={2.4} />
              <Body small>{x}</Body>
            </Row>
          ))}
        </Stack>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 10 }}>
        <Button
          label={plan === 'year' ? 'Start 3 days free' : 'Subscribe'}
          sound="select"
          onPress={() => {
            set({ trialEndsAt: new Date(Date.now() + 3 * 86400000).toISOString(), onboarded: true });
            play('cleared');
            onDone();
          }}
        />
        <Pressable onPress={() => { set({ onboarded: true }); onSkip(); }} hitSlop={10}>
          <Muted small align="center">{plan === 'year' ? 'We remind you the day before it renews. ' : ''}Not now, continue free</Muted>
        </Pressable>
      </View>
    </View>
  );
}
