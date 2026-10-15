import React, { useState } from 'react';
import { View, ScrollView, Text as RNText, Share } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, IconButton, Icon, ICON, Card, ArtCard, OnBlue, Row, Stack } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { useTier } from '@/lib/plan';
import { makePortrait, Portrait } from '@/lib/api';
import { track } from '@/lib/analytics';

/** Kleos Black: your Portrait. A deep read across every conversation you've had. */
export default function PortraitScreen() {
  const t = useTheme();
  const s = useStore();
  const tier = useTier();
  const [p, setP] = useState<Portrait | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const scored = s.sessions.filter((x) => !(x.retry ?? x.evaluation).insufficient);

  async function go() {
    setBusy(true);
    setErr('');
    try {
      const history = scored.slice(0, 30).map((x) => {
        const e = x.retry ?? x.evaluation;
        return { title: x.title, when: x.createdAt.slice(0, 10), rating: e.rating, archetype: e.archetype, verdict: e.verdict, change: e.change?.text, strengths: (e.strengths ?? []).map((y) => y.text), counts: e.counts, effort: e.effort };
      });
      const out = await makePortrait(history);
      setP(out);
      track('portrait_made', { n: history.length });
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t make your Portrait.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ marginTop: 10, gap: 12 }}>
          <ArtCard art="pitt" height={260} focus="top">
            <OnBlue kicker="Your Portrait · Kleos Black" sub={p ? p.in_a_room : `Built from your ${scored.length} conversation${scored.length === 1 ? '' : 's'}. Who you are in a room, the pattern that costs you most, and next month’s targets.`}>{p ? p.headline : 'What people actually experience'}</OnBlue>
          </ArtCard>
          {p ? (
            <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 12 }}>
              <Card style={{ gap: 8 }}>
                <Label color={t.accent}>What works</Label>
                {p.strengths.map((x) => <Body key={x} small>{x}</Body>)}
                <Muted small>{p.when_it_works}</Muted>
              </Card>
              <Card style={{ gap: 6 }}>
                <Label>The pattern that costs you</Label>
                <Body>{p.the_pattern}</Body>
              </Card>
              <Card style={{ gap: 8 }}>
                <Label>Next month, in order</Label>
                {p.next_month.map((x, i) => (
                  <Row key={i} gap={10} style={{ alignItems: 'flex-start' }}>
                    <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent, width: 14 }}>{i + 1}</RNText>
                    <Body small style={{ flex: 1 }}>{x}</Body>
                  </Row>
                ))}
              </Card>
              <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18 }}>
                <RNText style={{ fontFamily: font.serifItalic, fontSize: 21, lineHeight: 26, color: '#FFF' }}>“{p.line}”</RNText>
              </View>
              <Button label="Share my Portrait" variant="secondary" onPress={() => Share.share({ message: `My Kleos Portrait: “${p.headline}”` })} />
            </Animated.View>
          ) : (
            <Stack gap={10}>
              {err ? <Body small color={t.accent}>{err}</Body> : null}
              {tier !== 'black' ? (
                <Button label="Unlock with Kleos Black" onPress={() => router.push({ pathname: '/paywall', params: { reason: 'black' } })} />
              ) : scored.length < 3 ? (
                <Muted small align="center">Have at least three conversations first. Then there’s something real to read.</Muted>
              ) : (
                <Button label={busy ? 'Reading everything…' : 'Make my Portrait'} disabled={busy} onPress={go} />
              )}
            </Stack>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
