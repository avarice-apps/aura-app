import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, Card, IconButton, Icon, ICON, Row } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { NightCall } from '@/components/NightCall';
import { ResultHero, FeedbackCard, Appear } from '@/components/Results';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { getChallenge, answerChallenge, type Challenge } from '@/lib/api';
import { gate } from '@/lib/plan';
import type { Evaluation } from '@/lib/types';
import { play } from '@/lib/sound';

/** A friend's score on a scene. Play the same scene; the honest score decides who won. */
export default function ChallengeScreen() {
  const t = useTheme();
  const s = useStore();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [c, setC] = useState<Challenge | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<'brief' | 'talk' | 'result'>('brief');
  const [ev, setEv] = useState<Evaluation | null>(null);

  useEffect(() => {
    getChallenge(String(code ?? ''))
      .then((x) => {
        setC(x);
        if (x.done) setStep('result');
      })
      .catch((e) => setErr(e?.message ?? 'No challenge with that code.'));
  }, [code]);

  const mine = (s.challenges ?? []).some((x) => x.code === code && x.mine);

  function start() {
    if (!c) return;
    if (c.kind === 'floor' && !gate('calls')) return; // the Daily Side Quest is always free
    setStep('talk');
  }

  if (step === 'talk' && c) {
    return (
      <NightCall label={`Challenge · ${c.a_name}`} onClose={() => router.back()}>
        <Conversation
          label={`Challenge · ${c.a_name}`}
          metered={c.kind === 'floor'}
          args={c.kind === 'daily' ? { daily_id: c.ref_id, pressure: 2 } : { floor_id: c.ref_id, pressure: 2 }}
          onDone={async ({ evaluation }) => {
            setEv(evaluation);
            setStep('result');
            if (evaluation.insufficient || typeof evaluation.rating !== 'number') return;
            try {
              const r = await answerChallenge(c.code, evaluation.rating, evaluation.verdict ?? '');
              setC(r);
              play(r.winner === 'b' ? 'cleared' : 'reveal');
            } catch (e: any) {
              setErr(e?.message ?? 'Couldn’t submit your score.');
            }
          }}
        />
      </NightCall>
    );
  }

  const won = c?.done ? (mine ? c.winner === 'a' : c.winner === 'b') : false;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        {!c && !err && <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />}
        {err ? <Body color={t.accent} style={{ marginTop: 20 }}>{err}</Body> : null}
        {c && (
          <View style={{ gap: 14, marginTop: 10 }}>
            <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 20, gap: 6 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>CHALLENGE · {c.code}</RNText>
              <RNText style={{ fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: '#FFF' }}>{c.title}</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 14, color: 'rgba(255,255,255,0.86)' }}>
                {c.done ? 'Both reads are in.' : mine ? 'Waiting for your friend to play it.' : `${c.a_name} scored ${c.a_rating}. Same scene, same honest score. Beat it.`}
              </RNText>
            </View>

            {c.done && (
              <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
                <Row gap={10}>
                  {[
                    { k: 'a', name: c.a_name, rating: c.a_rating, verdict: c.a_verdict },
                    { k: 'b', name: c.b_name ?? 'Friend', rating: c.b_rating ?? 0, verdict: c.b_verdict ?? '' },
                  ].map((p) => (
                    <Card key={p.k} style={{ flex: 1, gap: 4, borderColor: c.winner === p.k ? t.accent : t.line, borderWidth: c.winner === p.k ? 1.5 : 1 }}>
                      <Label color={c.winner === p.k ? t.accent : undefined}>{c.winner === p.k ? 'Winner' : c.winner === 'tie' ? 'Tie' : ' '}</Label>
                      <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{p.name}</RNText>
                      <RNText style={{ fontFamily: font.serif, fontSize: 44, color: t.ink }}>{p.rating}</RNText>
                      <Muted small>{p.verdict}</Muted>
                    </Card>
                  ))}
                </Row>
                <Body align="center" strong>{c.winner === 'tie' ? 'Dead even.' : won ? 'You took it.' : 'They took it.'}</Body>
              </Animated.View>
            )}

            {ev && !ev.insufficient && (
              <Stack12>
                <Appear><ResultHero e={ev} label="You played it like" /></Appear>
                <Appear delay={120}><FeedbackCard e={ev} /></Appear>
              </Stack12>
            )}
            {ev?.insufficient ? <Muted small align="center">You barely said anything, so it didn’t count. Try again from Play.</Muted> : null}
          </View>
        )}
      </ScrollView>
      {c && step === 'brief' && !c.done && !mine && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Button label="Play it" sound="select" onPress={start} />
        </View>
      )}
    </Screen>
  );
}

function Stack12({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 12 }}>{children}</View>;
}
