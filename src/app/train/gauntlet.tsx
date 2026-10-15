import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row } from '@/ui';
import { color, space } from '@/theme/tokens';
import { useStore } from '@/state/store';

/** The daily Gauntlet: one Pressure round, one Room call, one micro-drill. Holds the streak. */
export default function Gauntlet() {
  const completeGauntlet = useStore((s) => s.completeGauntlet);
  const streak = useStore((s) => s.streak);
  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Gauntlet</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Stack gap={space.l}>
            <Display size="d2">Four minutes.{'\n'}Three things.</Display>
            <Step n="01" title="One pressure round" onPress={() => router.push('/train/pressure')} />
            <Step n="02" title="One judgment call" onPress={() => router.push('/train/room')} />
            <Step n="03" title="One rep of your drill" onPress={() => router.push('/train/drill')} />
          </Stack>
        </View>
        <Stack gap={space.s} style={{ paddingBottom: space.l }}>
          <Body color={color.w48} small>Streak: {streak}. Finishing the Gauntlet holds it and feeds your Standing.</Body>
          <Button label="Mark Gauntlet complete" onPress={() => { completeGauntlet(); router.back(); }} />
        </Stack>
      </Gutter>
    </Screen>
  );
}

function Step({ n, title, onPress }: { n: string; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.w12 }}>
      <Row gap={space.l}>
        <Label color={color.w48} style={{ width: 24 }}>{n}</Label>
        <Display size="d4">{title}</Display>
      </Row>
    </Pressable>
  );
}
