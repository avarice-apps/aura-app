import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Button, Row, Stack, Pill, IconButton, Icon, ICON, Tag, Card } from '@/ui';
import { ReactiveStatue } from '@/components/ReactiveStatue';
import { Conversation } from '@/components/Conversation';
import { NightCall } from '@/components/NightCall';
import { ResultHero, FeedbackCard, HearPoise, CompareCard, Appear, FullRead, Insufficient, RetryMoment } from '@/components/Results';
import { retryMoment, momentRetryFor } from '@/lib/moment';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { QUESTS, QUEST_CATEGORY, withWhom } from '@/lib/quests';
import type { Evaluation } from '@/lib/types';
import { play } from '@/lib/sound';
import { gate, requireTier } from '@/lib/plan';

/** A fallback session id (only used offline, where calls have none). */
const stamp = () => `local_${Date.now()}`;

type Step = 'brief' | 'talk' | 'result' | 'retry' | 'compare';
type Ev = Evaluation & { scriptAudio?: any };
const PRESSURE = ['', 'Easy', 'Real', 'Heat'];
const STATUE: Record<string, 'head' | 'athlete' | 'bust' | 'antinoos' | 'bustDark'> = { dating: 'antinoos', night: 'bustDark', approach: 'athlete', work: 'bust', money: 'bust', service: 'head', conflict: 'bust', friends: 'athlete', status: 'head' };

/** Side Quest: a real-life situation, played live. Brief → talk → read → run it back → compare. */
export default function QuestScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = QUESTS.find((x) => x.id === id);
  const s = useStore();
  const [pressure, setPressure] = useState(2);
  const [step, setStep] = useState<Step>('brief');
  const [sid, setSid] = useState('');
  const [a, setA] = useState<Ev | null>(null);
  const [b, setB] = useState<Ev | null>(null);
  if (!q) return null;

  function save(first: Ev, second?: Ev) {
    s.addSession({ id: sid || stamp(), kind: 'room', title: q!.title, createdAt: new Date().toISOString(), evaluation: first, retry: second ?? momentRetryFor(sid) });
    s.touchDay();
    s.set({ questsDone: Array.from(new Set([...(s.questsDone ?? []), q!.id])) });
  }

  const header = (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <IconButton label="Close" onPress={() => router.back()}>
        <Icon d={ICON.close} size={16} />
      </IconButton>
      <Label>Side quest · {QUEST_CATEGORY[q.category] ?? q.category}</Label>
      <View style={{ width: 40 }} />
    </Row>
  );

  if (step === 'talk' || step === 'retry') {
    return (
      <NightCall label={`Side quest · ${QUEST_CATEGORY[q.category] ?? q.category}`} onClose={() => router.back()}>
        <Conversation
          metered
          label={step === 'retry' ? 'Run it back' : q.title}
          args={step === 'retry' ? { attempt_of: sid, room_id: q.id, pressure } : { room_id: q.id, pressure, max_turns: 3 }}
          onDone={({ sessionId, evaluation }) => {
            if (step === 'talk') {
              setSid(sessionId);
              setA(evaluation as Ev);
              setStep('result');
            } else {
              setB(evaluation as Ev);
              setStep('compare');
            }
          }}
        />
      </NightCall>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {step === 'brief' && (
          <Stack gap={18}>
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}>
              <ReactiveStatue name={STATUE[q.category] ?? 'head'} height={170} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(120)} style={{ gap: 8 }}>
              <Row gap={8}>
                <Tag label={`With ${withWhom(q, s.dates)}`} tone="accent" />
                {q.spicy ? <Tag label="18+" /> : null}
              </Row>
              <Title size={28}>{q.title}</Title>
              <Body color={t.ink2}>{q.setting}</Body>
            </Animated.View>
            <Card style={{ gap: 4 }}>
              <Label color={t.accent}>Your goal</Label>
              <Body>{q.goal}</Body>
            </Card>
            <Stack gap={8}>
              <Label>Pressure</Label>
              <Row gap={8}>
                {[1, 2, 3].map((p) => (
                  <Pill key={p} label={PRESSURE[p]} active={pressure === p} onPress={() => setPressure(p)} />
                ))}
              </Row>
              <Muted small>{pressure === 1 ? 'Friendly. Takes its time.' : pressure === 2 ? 'Realistic. Cuts in if you ramble.' : 'Tough. Short fuse, and the twist lands.'}</Muted>
            </Stack>
          </Stack>
        )}

        {step === 'result' && a && (a.insufficient ? <Insufficient e={a} /> : (
          <Stack gap={12}>
            <Appear><ResultHero e={a} /></Appear>
            <Appear delay={120}><FeedbackCard e={a} /></Appear>
            <Appear delay={240}><HearPoise src={a.scriptAudio ?? a.script_audio} /></Appear>
            <Appear delay={300}><RetryMoment e={a} onRetry={() => retryMoment(sid, a, q.title)} /></Appear>
            <Appear delay={360}><FullRead e={a} /></Appear>
          </Stack>
        ))}

        {step === 'compare' && a && b && (b.insufficient ? <Insufficient e={b} /> : (
          <Stack gap={12}>
            <Appear><CompareCard a={a} b={b} /></Appear>
            <Appear delay={200}><HearPoise src={b.scriptAudio ?? b.script_audio} /></Appear>
            <Appear delay={320}><FullRead e={b} showAlternatives={false} /></Appear>
          </Stack>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        {step === 'brief' && <Button label="Start" sound="select" onPress={() => gate('calls') && setStep('talk')} />}
        {step === 'result' && a?.insufficient && <Button label="Go again. That one didn't count" onPress={() => { setA(null); setStep('talk'); }} />}
        {step === 'result' && a && !a.insufficient && (
          <>
            <Button label="Done" onPress={() => { save(a); play('cleared'); router.back(); }} />
            <Button label="Run the whole scene back" variant="secondary" sound="select" onPress={() => requireTier('plus', 'retry') && gate('calls') && setStep('retry')} />
          </>
        )}
        {step === 'compare' && a && b && <Button label="Done" sound="select" onPress={() => { save(a, b.insufficient ? undefined : b); router.back(); }} />}
      </View>
    </Screen>
  );
}
