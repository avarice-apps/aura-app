import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row } from '@/ui';
import { color, space } from '@/theme/tokens';

export default function Screen_reference() {
  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Reference Read</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Stack gap={space.l}>
            <Display size="d2">Upload someone{'\n'}you want to be.</Display>
            <Body color={color.w72}>A clip of a speaker, an actor, a friend. Aura measures them on the same axes and shows the gap. Then a two-week plan to close the widest one.</Body>
            <Label color={color.w48}>Ships in the next build</Label>
          </Stack>
        </View>
        <View style={{ paddingBottom: space.l }}>
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Gutter>
    </Screen>
  );
}
