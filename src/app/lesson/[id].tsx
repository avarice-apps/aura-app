import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Button, Row, Stack, Statue, Halo, Pill, IconButton, Icon, ICON, Num } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { ResultHero, FeedbackCard, HearPoise, CompareCard, Appear, FullRead, Insufficient } from '@/components/Results';
import { SituationCard, pickSituation } from '@/components/SituationCard';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { findLesson, UNIT_CATEGORY, laurelFor, weakSpots, ROMAN } from '@/lib/progress';
import { generateLesson } from '@/lib/api';
import { API_URL, OFFLINE } from '@/lib/config';
import type { Evaluation, Lesson } from '@/lib/types';
import { play } from '@/lib/sound';

type Step = 'brief' | 'generating' | 'talk' | 'result' | 'retry' | 'compare' | 'lock' | 'done';
type Ev = Evaluation & { scriptAudio?: any };

const PRESSURE = ['', 'Easy', 'Real', 'Heat'];

export default function LessonScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const found = findLesson(id);
  const s = useStore();
  const checkpoint = !!found?.lesson.checkpoint;
  const [pressure, setPressure] = useState(checkpoint ? (found!.unit.id === 'pushback' || found!.unit.id === 'rooms' ? 3 : 2) : 1);
  const [step, setStep] = useState<Step>('brief');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sid, setSid] = useState('');
  const [a, setA] = useState<Ev | null>(null);
  const [b, setB] = useState<Ev | null>(null);
  const [err, setErr] = useState('');
  const [awarded, setAwarded] = useState<number>(0);
  const situation = React.useMemo(() => pickSituation(UNIT_CATEGORY[found?.unit.id ?? 'intro'] ?? 'intro', s.situationsSeen, 3), [found?.unit.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!found) return null;
  const { unit, lesson: def } = found;

  async function begin() {
    setStep('generating');
    setErr('');
    try {
      const avoid = s.sessions.slice(0, 5).map((x) => x.title);
      const l = await generateLesson({ unit: unit.title, unit_id: unit.id, objective: def.objective, weak: weakSpots(s.sessions), avoid, pressure });
      setLesson(l);
      setStep('talk');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not build the scene.');
      setStep('brief');
    }
  }

  function finish() {
    const best = Math.max(a?.rating ?? 0, b?.rating ?? 0);
    const prev = s.laurels[def.id] ?? 0;
    const lastSame = s.sessions.find((x) => x.lessonId === def.id);
    const sameDay = !!lastSame && lastSame.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
    let lvl = laurelFor(prev, best, sameDay);
    if (checkpoint && best < 65) lvl = Math.min(lvl, 1) as 1;
    s.award(def.id, lvl, 0);
    s.addSession({ id: sid, kind: checkpoint ? 'checkpoint' : 'lesson', title: lesson?.setting ?? def.title, createdAt: new Date().toISOString(), evaluation: a!, retry: b ?? undefined, lessonId: def.id });
    s.touchDay();
    setAwarded(lvl);
    play(lvl > prev ? 'cleared' : 'reveal');
    setStep('done');
  }

  const header = (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <IconButton label="Close" onPress={() => router.back()}>
        <Icon d={ICON.close} size={16} />
      </IconButton>
      <Label>{unit.title} · {checkpoint ? 'Checkpoint' : `Lesson ${found.index + 1}`}</Label>
      <View style={{ width: 40 }} />
    </Row>
  );

  if (step === 'talk' && lesson) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Conversation
          label={def.title}
          args={{ lesson, pressure, max_turns: checkpoint ? 3 : 2 }}
          onDone={({ sessionId, evaluation }) => {
            setSid(sessionId);
            setA(evaluation as Ev);
            setStep('result');
          }}
        />
      </Screen>
    );
  }
  if (step === 'retry') {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Conversation
          label="Take two"
          args={{ attempt_of: sid, lesson: lesson ?? undefined, pressure }}
          onDone={({ evaluation }) => {
            setB(evaluation as Ev);
            setStep('compare');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {(step === 'brief' || step === 'generating') && (
          <Stack gap={16}>
            <Animated.View entering={FadeIn.duration(600)} style={{ height: 210, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute' }}><Halo size={250} opacity={0.5} /></View>
              <Statue name={checkpoint ? 'antinoos' : 'head'} height={200} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ gap: 8 }}>
              <Title size={28}>{def.title}</Title>
              <Body color={t.ink2}>{def.objective}</Body>
            </Animated.View>
            {!OFFLINE && <HearPoise src={`${API_URL}/tts?text=${encodeURIComponent(`Here's the skill. ${def.objective} Keep it short, and let the other person respond.`)}`} />}
            <Stack gap={8}>
              <Label>Pressure</Label>
              <Row gap={8}>
                {[1, 2, 3].map((p) => (
                  <Pill key={p} label={PRESSURE[p]} active={pressure === p} onPress={checkpoint && p < 2 ? undefined : () => setPressure(p)} />
                ))}
              </Row>
              <Muted small>{pressure === 1 ? 'Generous answer window, friendly follow-ups.' : pressure === 2 ? 'Shorter window, one skeptical follow-up.' : 'Short window, skeptical, and the scene may change on you.'}</Muted>
            </Stack>
            {err ? <Body color={t.accent}>{err}</Body> : null}
          </Stack>
        )}

        {step === 'result' && a && a.insufficient && <Insufficient e={a} />}
        {step === 'result' && a && !a.insufficient && (
          <Stack gap={12}>
            <Appear><ResultHero e={a} /></Appear>
            <Appear delay={120}><FeedbackCard e={a} /></Appear>
            <Appear delay={240}><HearPoise src={a.scriptAudio ?? a.script_audio} /></Appear>
            <Appear delay={360}><FullRead e={a} /></Appear>
          </Stack>
        )}

        {step === 'compare' && a && b && b.insufficient && <Insufficient e={b} />}
        {step === 'compare' && a && b && !b.insufficient && (
          <Stack gap={12}>
            <Appear><CompareCard a={a} b={b} /></Appear>
            <Appear delay={200}><HearPoise src={b.scriptAudio ?? b.script_audio} /></Appear>
            <Appear delay={320}><FullRead e={b} showAlternatives={false} /></Appear>
          </Stack>
        )}

        {step === 'lock' && (
          <Stack gap={10}>
            <Label>Lock it in · one judgment call</Label>
            <SituationCard s={situation} onAnswered={() => s.set({ situationsSeen: [...s.situationsSeen, situation.id] })} />
          </Stack>
        )}

        {step === 'done' && (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 16 }}>
            <Animated.View entering={ZoomIn.duration(600)} style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Num value={ROMAN[awarded] || '·'} size={44} weight="regular" color={t.onAccent} />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(300)} style={{ alignItems: 'center', gap: 8 }}>
              <Label>Laurel</Label>
              <Title size={26} align="center">{def.title} {ROMAN[awarded]}</Title>
              <Muted align="center">
                {awarded >= 3 ? 'Gold. You did it again, on a different day, with a different person. That’s a skill, not a take.' : awarded === 2 ? 'Silver. Do it again on another day to earn gold.' : 'Bronze for doing the work. A take rated 60+ earns silver.'}
              </Muted>
            </Animated.View>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        {step === 'brief' && <Button label="Start the conversation" sound="select" onPress={begin} />}
        {step === 'generating' && <Button label="Building your scene…" disabled />}
        {step === 'result' && a?.insufficient && <Button label="Go again. That one didn't count" sound="select" onPress={() => { setA(null); setStep('talk'); }} />}
        {step === 'result' && !a?.insufficient && (
          <>
            <Button label="Run it again with that change" sound="select" onPress={() => setStep('retry')} />
            <Button label="Continue" variant="secondary" onPress={() => setStep('lock')} />
          </>
        )}
        {step === 'compare' && b?.insufficient && <Button label="Run take two again" sound="select" onPress={() => { setB(null); setStep('retry'); }} />}
        {step === 'compare' && !b?.insufficient && <Button label="Continue" sound="select" onPress={() => setStep('lock')} />}
        {step === 'lock' && <Button label="Finish the lesson" sound="select" onPress={finish} />}
        {step === 'done' && <Button label="Done" onPress={() => router.back()} />}
      </View>
    </Screen>
  );
}
