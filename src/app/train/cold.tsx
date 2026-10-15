import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row } from '@/ui';
import { color, space } from '@/theme/tokens';

export default function Screen_cold() {
  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Cold Open</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Stack gap={space.l}>
            <Display size="d2">She plays the stranger.{'\n'}You open.</Display>
            <Body color={color.w72}>Live roleplay in voice. Poise answers in character within two seconds, three to five turns, then drops character and reads the whole exchange.</Body>
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
