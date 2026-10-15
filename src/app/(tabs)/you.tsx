import React from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Gutter, Row, Button } from '@/ui';
import { color, space } from '@/theme/tokens';
import { useStore, isPaid } from '@/state/store';

export default function You() {
  const name = useStore((s) => s.name);
  const plan = useStore((s) => s.plan);
  const paid = useStore(isPaid);
  const intensity = useStore((s) => s.intensity);
  const verdicts = useStore((s) => s.verdicts);
  const set = useStore((s) => s.set);
  const reset = useStore((s) => s.reset);
  const canUnsparing = verdicts.length >= 3;

  return (
    <Screen surface="ink">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <Gutter>
          <Label style={{ paddingTop: space.s }}>You</Label>
          <Display size="d3" style={{ marginTop: space.m }}>{name || 'Unnamed'}</Display>
          <Label small color={color.w48} style={{ marginTop: 6 }}>{plan === 'pro' ? 'Aura Pro' : paid ? 'Aura+' : 'Free'}</Label>

          <Section title="Poise">
            <Item
              label="Intensity"
              value={intensity === 'straight' ? 'Straight' : 'Unsparing'}
              hint={canUnsparing ? 'Unsparing removes the softening sentence. The evidence rule stays.' : 'Unsparing unlocks after three Reads.'}
              onPress={() => {
                if (!canUnsparing) return;
                Haptics.selectionAsync();
                set({ intensity: intensity === 'straight' ? 'unsparing' : 'straight' });
              }}
            />
            <Item label="Voice" value="On" hint="Poise speaks the verdict. Mute in the system switch." />
            <Item label="Messages" value="2 / week" hint="Short, in her voice, from your data. Never templated." />
          </Section>

          <Section title="Plan">
            {!paid && <Button label="Start 3-day trial" onPress={() => router.push('/paywall')} />}
            {paid && plan !== 'pro' && <Button label="Upgrade to Pro" variant="secondary" onPress={() => router.push('/paywall')} />}
            {paid && (
              <Item
                label="Pause"
                value="2 weeks"
                hint="Freezes your Index and streak. Billing pauses too."
                onPress={() => Alert.alert('Pause Aura', 'Two weeks. Your Index and streak freeze. You can resume any time.', [{ text: 'Not now' }, { text: 'Pause', onPress: () => {} }])}
              />
            )}
          </Section>

          <Section title="Your data">
            <Item label="Clips" value="Auto-delete 30 d" hint="Measured, then gone. Face templates are never stored." />
            <Item label="Witness" value="Off" hint="Let one friend see your Index and streak. No feed." />
            <Item
              label="Delete everything"
              value=""
              hint="Clips, numbers, verdicts, account. Immediate and permanent."
              onPress={() =>
                Alert.alert('Delete everything?', 'This cannot be undone.', [
                  { text: 'Keep' },
                  { text: 'Delete', style: 'destructive', onPress: () => { reset(); router.replace('/onboarding'); } },
                ])
              }
            />
          </Section>

          <Section title="About">
            <Body color={color.w48} small>
              Aura gives training feedback on how you come across. It is not therapy, counselling or a clinical assessment. 18+ only.
            </Body>
          </Section>
        </Gutter>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <Label color={color.w48} style={{ marginBottom: space.s }}>{title}</Label>
      <View style={{ gap: space.m }}>{children}</View>
    </View>
  );
}

function Item({ label, value, hint, onPress }: { label: string; value: string; hint?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.item}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body color={color.white}>{label}</Body>
        <Label color={color.w72}>{value}</Label>
      </Row>
      {hint && <Body color={color.w48} small style={{ marginTop: 4 }}>{hint}</Body>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 },
});
