import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Screen, Display, Label, Body, Gutter, Row, Numeral, Stack } from '@/ui';
import { MarkStatic } from '@/components/Mark';
import { color, space } from '@/theme/tokens';
import { tierFor, TIERS, AXIS_LABEL, ARCHETYPES } from '@/data';
import { useStore } from '@/state/store';

export default function Progress() {
  const verdicts = useStore((s) => s.verdicts);
  const tellsCleared = useStore((s) => s.tellsCleared);
  const streak = useStore((s) => s.streak);
  const bests = useStore((s) => s.bests);
  const v = verdicts[0];
  if (!v) return null;
  const first = verdicts[verdicts.length - 1];
  const tier = tierFor(v.index);
  const nextTier = TIERS.find((t) => t.min > v.index);
  const arch = ARCHETYPES.find((a) => a.key === v.archetype);

  return (
    <Screen surface="ink">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <Gutter>
          <Label style={{ paddingTop: space.s }}>Progress</Label>

          <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
            <MarkStatic index={v.index} axes={v.axes} size={260} />
          </View>

          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Stack gap={2}>
              <Numeral value={v.index} size={88} />
              <Display size="d4">{tier.name}</Display>
            </Stack>
            {nextTier && (
              <Stack gap={2} style={{ alignItems: 'flex-end', paddingBottom: 8 }}>
                <Label small color={color.w48}>Next</Label>
                <Label color={color.w72}>{nextTier.name} at {nextTier.min}</Label>
              </Stack>
            )}
          </Row>

          {/* Index over time: a bare line of numerals, oldest first */}
          <View style={{ marginTop: space.xl }}>
            <Label color={color.w48}>Reads</Label>
            <Row gap={space.l} style={{ marginTop: space.s, flexWrap: 'wrap' }}>
              {[...verdicts].reverse().map((r, i) => (
                <Stack key={r.id} gap={2} style={{ alignItems: 'center' }}>
                  <Numeral value={r.index} size={32} color={i === verdicts.length - 1 ? color.white : color.w48} />
                  <Label small color={color.w24}>{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Label>
                </Stack>
              ))}
            </Row>
          </View>

          <View style={{ marginTop: space.xl }}>
            <Label color={color.w48} style={{ marginBottom: space.s }}>Axes · since first read</Label>
            {(Object.keys(v.axes) as (keyof typeof v.axes)[]).map((k) => {
              const d = v.axes[k] - first.axes[k];
              return (
                <Row key={k} style={styles.axis}>
                  <Label color={color.w72}>{AXIS_LABEL[k]}</Label>
                  <Row gap={space.m}>
                    {verdicts.length > 1 && <Label small color={color.w48}>{d > 0 ? '↑' : d < 0 ? '↓' : '→'} {Math.abs(d)}</Label>}
                    <Numeral value={v.axes[k]} size={28} />
                  </Row>
                </Row>
              );
            })}
          </View>

          <Row style={{ marginTop: space.xl, justifyContent: 'space-between' }}>
            <Stat n={tellsCleared} label="Tells cleared" />
            <Stat n={streak} label="Day streak" />
            <Stat n={verdicts.length} label="Reads" />
          </Row>

          <Row style={{ marginTop: space.l, justifyContent: 'space-between' }}>
            <Stat n={bests.pressure ?? '—'} label="Pressure best" />
            <Stat n={bests.room ?? '—'} label="Room best" />
            <Stat n={bests.silence ?? '—'} label="Silence best" />
          </Row>

          {arch && (
            <View style={{ marginTop: space.xl }}>
              <Label color={color.w48}>Archetype</Label>
              <Display size="d4" style={{ marginTop: 6 }}>{arch.name}</Display>
              <Body color={color.w72} small style={{ marginTop: 4 }}>{arch.read} Archetypes change when you do.</Body>
            </View>
          )}

          <View style={{ marginTop: space.xl }}>
            <Label color={color.w48}>Season</Label>
            <Display size="d4" style={{ marginTop: 6 }}>Standing opens with your second Read.</Display>
            <Body color={color.w72} small style={{ marginTop: 4 }}>
              A league of fifty men near your Index. Ranked on training and movement, not on raw score. Top ten promote.
            </Body>
          </View>
        </Gutter>
      </ScrollView>
    </Screen>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <Stack gap={2}>
      <Numeral value={n} size={40} />
      <Label small color={color.w48}>{label}</Label>
    </Stack>
  );
}

const styles = StyleSheet.create({
  axis: { justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 },
});
