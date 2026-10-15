import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row } from '@/ui';
import { color, space } from '@/theme/tokens';

export default function Screen_duet() {
  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Duets</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Stack gap={space.l}>
            <Display size="d2">Same prompt.{'\n'}Two verdicts.</Display>
            <Body color={color.w72}>Send a prompt to a friend. You both record it. Poise reads both and reveals them side by side. The invite is a free Read for them.</Body>
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
