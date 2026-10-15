import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeOut, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Screen, Display, Label, Body, Gutter, Stack, Button } from '@/ui';
import { Mark } from '@/components/Mark';
import { color, space } from '@/theme/tokens';
import { READ_PROMPTS } from '@/data';
import { submitRead } from '@/lib/api';
import { useStore } from '@/state/store';

export default function Processing() {
  const { uri, id } = useLocalSearchParams<{ uri: string; id: string }>();
  const prompt = READ_PROMPTS.find((p) => p.id === id) ?? READ_PROMPTS[0];
  const [stage, setStage] = useState('Uploading');
  const [error, setError] = useState<string | null>(null);
  const name = useStore((s) => s.name);
  const intensity = useStore((s) => s.intensity);
  const verdicts = useStore((s) => s.verdicts);
  const addVerdict = useStore((s) => s.addVerdict);
  const energy = useSharedValue(0);

  useEffect(() => {
    energy.value = withRepeat(withTiming(0.6, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [energy]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await submitRead({
          uri,
          promptId: prompt.id,
          promptText: prompt.text,
          name,
          intensity,
          history: verdicts.slice(0, 4).map((v) => ({ index: v.index, axes: v.axes, tells: v.tells.map((t) => t.title), createdAt: v.createdAt })),
          onStage: (s) => alive && setStage(s),
        });
        if (!alive) return;
        const vid = r.id ?? `v_${Date.now()}`;
        const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        addVerdict({ ...r, id: vid, createdAt: new Date().toISOString(), unblurred: false, drill: { ...r.drill, expiresAt: expires } });
        router.replace({ pathname: '/read/verdict', params: { id: vid } });
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Something failed');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen surface="cobalt">
      <Gutter style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Mark index={30} axes={{ voice: 40, presence: 40, command: 40, composure: 40, read: 40 }} size={260} energy={energy} animateIn />
        </View>
        <Stack gap={space.m} style={{ paddingBottom: space.xl, minHeight: 160 }}>
          {!error ? (
            <Animated.View key={stage} entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)}>
              <Label color={color.w48}>Poise</Label>
              <Display size="d3">{stage}.</Display>
            </Animated.View>
          ) : (
            <Stack gap={space.m}>
              <Label color={color.w48}>Something failed</Label>
              <Body color={color.w72}>{error}</Body>
              <Button label="Try again" surface="cobalt" onPress={() => router.replace('/read')} />
            </Stack>
          )}
        </Stack>
      </Gutter>
    </Screen>
  );
}
