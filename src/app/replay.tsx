import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Label, Button, Row, Stack, IconButton, Icon, ICON, Card } from '@/ui';
import { ReactiveStatue } from '@/components/ReactiveStatue';
import { Conversation } from '@/components/Conversation';
import { ResultHero, FeedbackCard, HearPoise, Appear, FullRead, Insufficient } from '@/components/Results';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { generateLesson } from '@/lib/api';
import type { Evaluation, Lesson } from '@/lib/types';
import { play } from '@/lib/sound';

type Step = 'brief' | 'talk' | 'result';
type Ev = Evaluation & { scriptAudio?: any };

/** Replay a real moment from a receipt as a live roleplay, with the change applied. */
export default function Replay() {
  const t = useTheme();
  const { i } = useLocalSearchParams<{ i: string }>();
  const s = useStore();
  const r = s.receipts[Number(i ?? 0)];
  const sceneLesson = useMemo<Lesson | null>(() => (r?.scene?.opener ? { character: r.scene.character, setting: r.scene.setting, opener: r.scene.opener, goal: r.scene.goal, twist: null, hint: r.next_time, focus: 'rooms' } : null), [r]);
  const [generated, setGenerated] = useState<Lesson | null>(null);
  const lesson = sceneLesson ?? generated;
  const [step, setStep] = useState<Step>('brief');
  const [ev, setEv] = useState<Ev | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!r || r.scene?.opener) return;
    generateLesson({ unit: 'Replay', objective: r.next_time, weak: [], avoid: [], pressure: 2 })
      .then(setGenerated)
      .catch((e) => setErr(e?.message ?? 'Could not build the scene.'));
  }, [r]);

  if (!r) return null;

  const header = (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <IconButton label="Close" onPress={() => router.back()}>
        <Icon d={ICON.close} size={16} />
      </IconButton>
      <Label>Replay · {r.title}</Label>
      <View style={{ width: 40 }} />
    </Row>
  );

  if (step === 'talk' && lesson) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Conversation
          label="Replay"
          args={{ lesson, pressure: 2, max_turns: 3 }}
          onDone={({ sessionId, evaluation }) => {
            setEv(evaluation as Ev);
            s.addSession({ id: sessionId, kind: 'room', title: `Replay: ${r.title}`, createdAt: new Date().toISOString(), evaluation });
            s.touchDay();
            setStep('result');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {step === 'brief' && (
          <Stack gap={18}>
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}>
              <ReactiveStatue name="bust" height={160} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(120)} style={{ gap: 8 }}>
              <Label color={t.accent}>Run it back</Label>
              <Title size={28}>{r.title}</Title>
              <Body color={t.ink2}>{lesson?.setting ?? 'Setting the scene from your story…'}</Body>
            </Animated.View>
            <Card style={{ gap: 4 }}>
              <Label color={t.accent}>The change to try</Label>
              <Body>{r.next_time}</Body>
            </Card>
            {err ? <Body color={t.accent}>{err}</Body> : null}
          </Stack>
        )}
        {step === 'result' && ev && (ev.insufficient ? <Insufficient e={ev} /> : (
          <Stack gap={12}>
            <Appear><ResultHero e={ev} /></Appear>
            <Appear delay={120}><FeedbackCard e={ev} /></Appear>
            <Appear delay={240}><HearPoise src={ev.scriptAudio ?? ev.script_audio} /></Appear>
            <Appear delay={360}><FullRead e={ev} /></Appear>
          </Stack>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        {step === 'brief' && <Button label={lesson ? 'Start the replay' : 'Building the scene…'} disabled={!lesson} sound="select" onPress={() => setStep('talk')} />}
        {step === 'result' && <Button label="Done" onPress={() => { play('cleared'); router.back(); }} />}
      </View>
    </Screen>
  );
}
