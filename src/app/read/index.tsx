import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row } from '@/ui';
import { color, space } from '@/theme/tokens';
import { READ_PROMPTS, ReadPrompt } from '@/data';
import { useStore } from '@/state/store';

/** Prompt selection. First Read is fixed (r1) so the Sunday Re-read has a baseline. */
export default function ReadPromptScreen() {
  const verdicts = useStore((s) => s.verdicts);
  const first = verdicts.length === 0;
  const baseline = verdicts.length ? READ_PROMPTS.find((p) => p.id === verdicts[verdicts.length - 1].promptId) : undefined;
  const isSunday = new Date().getDay() === 0;

  const [chosen, setChosen] = useState<ReadPrompt>(first ? READ_PROMPTS[0] : isSunday && baseline ? baseline : pick(verdicts.map((v) => v.promptId)));

  const canChoose = !first && !(isSunday && baseline);

  return (
    <Screen surface="cobalt">
      <Gutter style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
          <Label>{first ? 'First Read' : isSunday && baseline ? 'Sunday Re-read' : 'Read'}</Label>
          {!first && (
            <Pressable onPress={() => router.back()} hitSlop={16}>
              <Label color={color.w72}>Close</Label>
            </Pressable>
          )}
        </Row>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.View entering={FadeIn.duration(500)} key={chosen.id}>
            <Stack gap={space.l}>
              <Label color={color.w48}>
                {chosen.cat} · {chosen.seconds}s
              </Label>
              <Display size="d2">{chosen.text}</Display>
            </Stack>
          </Animated.View>
        </View>

        <Stack gap={space.m} style={{ paddingBottom: space.l }}>
          {canChoose && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setChosen(pick([...verdicts.map((v) => v.promptId), chosen.id]));
              }}
              style={styles.swap}
            >
              <Label color={color.w72}>Another prompt</Label>
            </Pressable>
          )}
          <Body color={color.w48} small>
            Quiet room. Light on your face. Look at the lens, not the screen. Speak as you would to a person.
          </Body>
          <Button label="Record" surface="cobalt" onPress={() => router.push({ pathname: '/read/record', params: { id: chosen.id } })} />
        </Stack>
      </Gutter>
    </Screen>
  );
}

function pick(exclude: string[]) {
  const pool = READ_PROMPTS.filter((p) => !exclude.includes(p.id));
  const list = pool.length ? pool : READ_PROMPTS;
  return list[Math.floor(Math.random() * list.length)];
}

const styles = StyleSheet.create({
  swap: { paddingVertical: space.s, alignSelf: 'flex-start' },
});
