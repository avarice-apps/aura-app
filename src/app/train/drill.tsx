import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row } from '@/ui';
import { color, space } from '@/theme/tokens';
import { useStore, latestVerdict } from '@/state/store';
import { AXIS_LABEL } from '@/data';

/** The 24-hour drill Poise assigned. Two reps of the same prompt with one constraint. */
export default function DrillScreen() {
  const v = useStore(latestVerdict);
  const completeDrill = useStore((s) => s.completeDrill);
  const [rep, setRep] = useState(0);
  if (!v) return null;
  const tell = v.tells[0];

  return (
    <Screen surface="ink">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>Drill · rep {Math.min(rep + 1, 2)} / 2</Label>
          <Pressable onPress={() => router.back()} hitSlop={16}><Label color={color.w72}>Close</Label></Pressable>
        </Row>
        {rep < 2 ? (
          <Animated.View key={rep} entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Label color={color.w48}>Targets · {AXIS_LABEL[tell.axis]}</Label>
                <Display size="d2">{v.drill.title}</Display>
                <Body color={color.w72}>{v.drill.body}</Body>
                <Body color={color.w48} small>Record it as a Read. Poise checks the one thing, nothing else, and tells you if it moved.</Body>
              </Stack>
            </View>
            <Stack gap={space.s} style={{ paddingBottom: space.l }}>
              <Button label="Record rep" onPress={() => router.push({ pathname: '/read/record', params: { id: v.promptId } })} />
              <Button label="Mark rep done" variant="secondary" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRep((r) => r + 1); }} />
            </Stack>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Label color={color.w48}>Done</Label>
                <Display size="d2">Two clean reps.</Display>
                <Body color={color.w72}>Sunday will show whether it held. Two Re-reads without this tell and it clears for good.</Body>
              </Stack>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label="Finish" onPress={() => { completeDrill(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); }} />
            </View>
          </Animated.View>
        )}
      </Gutter>
    </Screen>
  );
}
