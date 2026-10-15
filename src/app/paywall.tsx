import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral } from '@/ui';
import { color, space } from '@/theme/tokens';
import { useStore } from '@/state/store';

type Plan = 'weekly' | 'annual' | 'pro';

const PLANS: { key: Plan; name: string; price: string; per: string; note: string }[] = [
  { key: 'weekly', name: 'Aura+', price: '$6.99', per: 'week', note: '3 days free, then weekly. Cancel any time.' },
  { key: 'annual', name: 'Aura+ Annual', price: '$39.99', per: 'year', note: '$0.77 a week. The price of being read once.' },
  { key: 'pro', name: 'Aura Pro', price: '$14.99', per: 'month', note: 'Cold Open, Reference Read, Unsparing, monthly Deep Read.' },
];

/**
 * Hard paywall after the first verdict. The first tell was shown in full; the rest is here.
 * RevenueCat wires in here later; today it grants a local 3-day trial.
 */
export default function Paywall() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [plan, setPlan] = useState<Plan>('annual');
  const set = useStore((s) => s.set);
  const unblur = useStore((s) => s.unblur);
  const verdict = useStore((s) => s.verdicts[0]);

  function start() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const trialEndsAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    set({ trialEndsAt, plan: plan === 'pro' ? 'pro' : 'free' });
    if (from) unblur(from);
    else if (verdict) unblur(verdict.id);
    router.back();
  }

  return (
    <Screen surface="cobalt">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        <Gutter>
          <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
            <Label>Full read</Label>
            <Pressable onPress={() => router.back()} hitSlop={16}>
              <Label color={color.w72}>Not now</Label>
            </Pressable>
          </Row>

          <Stack gap={space.m} style={{ paddingVertical: space.xl }}>
            <Display size="d2">The other two tells.{'\n'}The drill.{'\n'}Her voice.</Display>
            <Body color={color.w72}>
              Plus every mode, the Sunday Re-read that moves your Index, and a Mark that fills in while you watch.
            </Body>
          </Stack>

          <Stack gap={0}>
            {PLANS.map((p) => {
              const on = plan === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPlan(p.key);
                  }}
                  style={[styles.plan, on && styles.planOn]}
                >
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Row gap={space.s}>
                        <View style={[styles.radio, on && styles.radioOn]} />
                        <Display size="d4">{p.name}</Display>
                      </Row>
                      <Body color={color.w72} small style={{ marginTop: 6, marginLeft: 22 }}>{p.note}</Body>
                    </View>
                    <Row gap={4} style={{ alignItems: 'flex-end' }}>
                      <Numeral value={p.price} size={34} />
                      <Label small color={color.w48} style={{ paddingBottom: 4 }}>/{p.per}</Label>
                    </Row>
                  </Row>
                </Pressable>
              );
            })}
          </Stack>

          <Stack gap={space.s} style={{ marginTop: space.xl }}>
            <Button label={plan === 'pro' ? 'Start Pro' : 'Start 3 days free'} surface="cobalt" onPress={start} />
            <Body color={color.w48} small align="center">
              {plan === 'weekly' ? '$6.99 a week after the trial.' : plan === 'annual' ? '$39.99 a year after the trial.' : '$14.99 a month. Includes everything in Aura+.'} Cancel in Settings. Terms and privacy apply.
            </Body>
          </Stack>

          <View style={{ marginTop: space.xl }}>
            <Label color={color.w48}>What you keep either way</Label>
            <Body color={color.w72} small style={{ marginTop: 6 }}>
              Your first tell, your Index with its band, three Read-the-Room calls a day, and your Mark as it stands.
            </Body>
          </View>
        </Gutter>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plan: { paddingVertical: space.l, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.w16 },
  planOn: {},
  radio: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: color.w48 },
  radioOn: { backgroundColor: color.lilac, borderColor: color.lilac },
});
