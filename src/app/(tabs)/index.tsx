import React from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral, Card, Hairline } from '@/ui';
import { MarkStatic } from '@/components/Mark';
import { color, space } from '@/theme/tokens';
import { tierFor, AXIS_LABEL } from '@/data';
import { useStore, latestVerdict, isPaid } from '@/state/store';

export default function Today() {
  const v = useStore(latestVerdict);
  const name = useStore((s) => s.name);
  const streak = useStore((s) => s.streak);
  const lastGauntletDay = useStore((s) => s.lastGauntletDay);
  const paid = useStore(isPaid);
  const today = new Date().toISOString().slice(0, 10);
  const gauntletDone = lastGauntletDay === today;
  const isSunday = new Date().getDay() === 0;
  const drillOpen = v && !v.drill.doneAt && v.drill.expiresAt && new Date(v.drill.expiresAt) > new Date();
  const hoursLeft = v?.drill.expiresAt ? Math.max(0, Math.round((new Date(v.drill.expiresAt).getTime() - Date.now()) / 3600000)) : 0;

  if (!v) return null;
  const tier = tierFor(v.index);

  return (
    <Screen surface="ink">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <Gutter>
          <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
            <Label>{greeting()}{name ? `, ${name}` : ''}</Label>
            <Label color={color.w48}>{streak} day{streak === 1 ? '' : 's'}</Label>
          </Row>

          <Pressable onPress={() => router.push('/(tabs)/progress')}>
            <Row style={{ paddingVertical: space.xl, justifyContent: 'space-between' }}>
              <Stack gap={4}>
                <Numeral value={v.index} size={96} />
                <Display size="d4">{tier.name}</Display>
                <Label small color={color.w48}>±{v.band} · {v.unblurred || paid ? 'Full read' : 'Partial read'}</Label>
              </Stack>
              <MarkStatic index={v.index} axes={v.axes} size={150} color={color.white} />
            </Row>
          </Pressable>

          <Hairline />

          {/* Sunday Re-read is the only way to move the Index */}
          {isSunday ? (
            <Block
              eyebrow="Sunday"
              title="Re-read."
              body="Same prompt as your first Read. This is the only thing that moves your Index."
              cta="Start the Re-read"
              onPress={() => router.push('/read')}
              primary
            />
          ) : (
            <Block
              eyebrow="Next Re-read"
              title={`${daysToSunday()} day${daysToSunday() === 1 ? '' : 's'}.`}
              body="Your Index updates on Sunday. Everything until then is training."
            />
          )}

          <Block
            eyebrow={drillOpen ? `Drill · closes in ${hoursLeft}h` : v.drill.doneAt ? 'Drill · done' : 'Drill · expired'}
            title={v.drill.title}
            body={paid || v.unblurred ? v.drill.body : 'Unlock the full read to see the drill.'}
            cta={drillOpen ? 'Do it now · 3 min' : undefined}
            onPress={() => (paid || v.unblurred ? router.push('/train/drill') : router.push('/paywall'))}
          />

          <Block
            eyebrow={gauntletDone ? 'Gauntlet · done today' : 'Gauntlet · 4 min'}
            title={gauntletDone ? 'Streak held.' : 'One round. One call. One rep.'}
            body="Pressure round, a judgment call, and a micro-drill. Keeps the streak, feeds your Standing."
            cta={gauntletDone ? undefined : 'Run the Gauntlet'}
            onPress={() => router.push('/train/gauntlet')}
          />

          <Label color={color.w48} style={{ marginTop: space.xl, marginBottom: space.s }}>Open tells</Label>
          {v.tells.map((t, i) => (
            <Row key={t.id} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 }} gap={space.m}>
              <Label color={color.w48} style={{ width: 24 }}>0{i + 1}</Label>
              <View style={{ flex: 1 }}>
                <Body color={i === 0 || paid || v.unblurred ? color.white : color.w24}>{i === 0 || paid || v.unblurred ? t.title : 'Locked'}</Body>
                <Label small color={color.w48}>{AXIS_LABEL[t.axis]}</Label>
              </View>
            </Row>
          ))}

          {!paid && !v.unblurred && (
            <View style={{ marginTop: space.xl }}>
              <Button label="Unlock the full read" onPress={() => router.push('/paywall')} />
            </View>
          )}
        </Gutter>
      </ScrollView>
    </Screen>
  );
}

function Block({ eyebrow, title, body, cta, onPress, primary }: { eyebrow: string; title: string; body: string; cta?: string; onPress?: () => void; primary?: boolean }) {
  return (
    <View style={{ paddingVertical: space.l, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 }}>
      <Label color={color.w48}>{eyebrow}</Label>
      <Display size="d4" style={{ marginTop: 8 }}>{title}</Display>
      <Body color={color.w72} style={{ marginTop: 6 }}>{body}</Body>
      {cta && (
        <View style={{ marginTop: space.m }}>
          <Button label={cta} variant={primary ? 'primary' : 'secondary'} onPress={onPress} />
        </View>
      )}
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}
function daysToSunday() {
  const d = new Date().getDay();
  return d === 0 ? 7 : 7 - d;
}
