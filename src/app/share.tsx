import React, { useRef } from 'react';
import { View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral } from '@/ui';
import { MarkStatic } from '@/components/Mark';
import { color, space } from '@/theme/tokens';
import { tierFor } from '@/data';
import { useStore } from '@/state/store';

/** Share card. Cobalt, engraved, no app-store chrome. Looks like a gallery poster. */
export default function Share() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const v = useStore((s) => s.verdicts.find((x) => x.id === id) ?? s.verdicts[0]);
  const name = useStore((s) => s.name);
  if (!v) return null;
  const tier = tierFor(v.index);
  const line = v.script.split('. ').slice(1, 2).join('') + '.';

  return (
    <Screen surface="cobalt">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Share</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ aspectRatio: 4 / 5, backgroundColor: color.cobalt, padding: space.l, justifyContent: 'space-between', borderWidth: 1, borderColor: color.w16 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>{name}</Label>
              <Label color={color.w48}>Aura</Label>
            </Row>
            <View style={{ alignItems: 'center' }}>
              <MarkStatic index={v.index} axes={v.axes} size={220} />
            </View>
            <Stack gap={4}>
              <Row style={{ alignItems: 'flex-end' }} gap={space.s}>
                <Numeral value={v.index} size={72} />
                <Display size="d4" style={{ paddingBottom: 6 }}>{tier.name}</Display>
              </Row>
              <Body color={color.w72} small>{line}</Body>
            </Stack>
          </View>
        </View>
        <Stack gap={space.s} style={{ paddingBottom: space.l }}>
          <Button label="Share" surface="cobalt" onPress={() => {}} />
          <Body color={color.w48} small align="center">Exports as an image with no tells. Your Index and tier only.</Body>
        </Stack>
      </Gutter>
    </Screen>
  );
}
