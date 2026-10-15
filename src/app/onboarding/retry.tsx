import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Muted, Body, Button, Segments, Stack, Label, Pill, Row } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { Alternatives } from '@/components/Results';

/** Onboarding 6 · Take two. One change, offered as a hint (structure) or an example (support), never forced. */
export default function Retry() {
  const t = useTheme();
  const ob = useStore((s) => s.ob);
  const goal = useStore((s) => s.goal);
  const set = useStore((s) => s.set);
  const [show, setShow] = useState<'hint' | 'example' | null>(null);
  const [alt, setAlt] = useState<number | undefined>();
  const [go, setGo] = useState(false);
  const e = ob.first;
  if (!e) return null;

  if (go) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Segments total={6} done={5} />
        </View>
        <Conversation
          label="Take two"
          args={{ goal, attempt_of: ob.firstSession }}
          onDone={({ evaluation }) => {
            set({ ob: { ...useStore.getState().ob, second: evaluation } });
            router.replace('/onboarding/compare');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}>
        <Segments total={6} done={5} />
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 24, gap: 8 }}>
          <Label>Take two</Label>
          <Title size={30}>Same question.{'\n'}One change.</Title>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ marginTop: 18, padding: 16, borderRadius: 18, backgroundColor: t.accentSoft, gap: 8 }}>
          <Label color={t.accent}>Your one change</Label>
          <Body>{e.change.text}</Body>
        </Animated.View>
        <Row gap={8} style={{ marginTop: 14 }}>
          <Pill label="Give me a hint" active={show === 'hint'} onPress={() => setShow(show === 'hint' ? null : 'hint')} />
          {e.example ? <Pill label={e.alternatives?.length ? 'Show two examples' : 'Show an example'} active={show === 'example'} onPress={() => setShow(show === 'example' ? null : 'example')} /> : null}
        </Row>
        {show && (
          <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 12 }}>
            {show === 'hint' || !e.alternatives?.length ? (
              <Body color={t.ink2}>{show === 'hint' ? e.hint : `“${e.example}”`}</Body>
            ) : (
              <Alternatives e={e} picked={alt} onPick={(i) => setAlt(alt === i ? undefined : i)} />
            )}
            {show === 'example' && <Muted small style={{ marginTop: 8 }}>Use your own words. These are support, not a script.</Muted>}
          </Animated.View>
        )}
        <Stack gap={4} style={{ marginTop: 20 }}>
          <Muted small>The other person won’t know this is your second try. Their reaction depends only on what you say this time.</Muted>
        </Stack>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button label="Start take two" sound="select" onPress={() => setGo(true)} />
      </View>
    </Screen>
  );
}
