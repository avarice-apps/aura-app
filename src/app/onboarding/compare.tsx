import React, { useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen, Button, Segments, Stack, Title, Row } from '@/ui';
import { CompareCard, HearPoise, ThoughtTrace, Appear } from '@/components/Results';
import { useStore } from '@/state/store';
import { play } from '@/lib/sound';

/** Onboarding 7 · Before and after. Honest: says "mixed" or "worse" when that's what happened. */
export default function Compare() {
  const ob = useStore((s) => s.ob);
  const addSession = useStore((s) => s.addSession);
  const a = ob.first as any;
  const b = ob.second as any;
  useEffect(() => {
    if (a && b) {
      play(b.rating >= a.rating ? 'cleared' : 'select');
      addSession({ id: ob.firstSession ?? String(Date.now()), kind: 'onboarding', title: 'First conversation', createdAt: new Date().toISOString(), evaluation: a, retry: b });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!a || !b) return null;
  const better = b.rating > a.rating;
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <Segments total={6} done={6} />
        <Stack gap={14} style={{ marginTop: 18 }}>
          <Appear><Title size={26}>{better ? "That's what one change does." : b.rating === a.rating ? 'Different, not better yet.' : 'Worth seeing why.'}</Title></Appear>
          <Appear delay={150}><CompareCard a={a} b={b} /></Appear>
          <Appear delay={300}><HearPoise src={b.scriptAudio ?? b.script_audio} /></Appear>
          <Appear delay={450}><ThoughtTrace e={b} /></Appear>
        </Stack>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        <Row gap={8}>
          <Button label="Share" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/receipt', params: { kind: 'compare' } })} />
          <Button label="Challenge a friend" variant="secondary" style={{ flex: 1.3 }} onPress={() => router.push('/scan')} />
        </Row>
        <Button label="Build my first week" sound="select" onPress={() => router.push('/onboarding/paywall')} />
      </View>
    </Screen>
  );
}
