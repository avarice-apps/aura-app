import React, { useState } from 'react';
import { View, ScrollView, TextInput, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, Row, Stack, Pill, IconButton, Icon, ICON, Card, ArtCard, OnBlue } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { NightCall } from '@/components/NightCall';
import { AfterRead } from '@/components/AfterRead';
import { ResultHero, FeedbackCard, HearPoise, Appear, FullRead, Insufficient, RetryMoment } from '@/components/Results';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { useTier, gate } from '@/lib/plan';
import { generateLesson } from '@/lib/api';
import { track } from '@/lib/analytics';
import { occasionBrief, occasionFresh } from '@/lib/occasion';
import { retryMoment } from '@/lib/moment';
import type { Evaluation, Lesson } from '@/lib/types';
import { PARTNER } from '@/lib/quests';

type Step = 'describe' | 'brief' | 'talk' | 'result';
type Ev = Evaluation & { scriptAudio?: any };
const PRESSURE = ['', 'Chill', 'Real', 'Brutal'];
const EXAMPLES = ['Asking my manager for a raise on Friday. She’s nice but always says budgets are tight.', 'Second date tomorrow. Last time I talked too much about work.', 'Telling my roommate I’m moving out. He’s going to take it personally.'];

/**
 * Rehearse (Kleos+): describe what's coming up, Poise rebuilds it with the right person and the thing you're
 * dreading, and you play it tonight. Opened from Today's occasion, it starts already filled in.
 */
export default function Rehearse() {
  const t = useTheme();
  const s = useStore();
  const tier = useTier();
  const { from, brief } = useLocalSearchParams<{ from?: string; brief?: string }>();
  const occ = from === 'occasion' && occasionFresh(s.occasion) ? s.occasion : undefined;
  const [text, setText] = useState(occ ? occasionBrief(occ) : (brief ?? '').slice(0, 600));
  const [pressure, setPressure] = useState(2);
  const [step, setStep] = useState<Step>('describe');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ev, setEv] = useState<Ev | null>(null);
  const [sid, setSid] = useState('');
  const [key, setKey] = useState(0);
  const paid = tier !== 'free';
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  async function build() {
    setBusy(true);
    setErr('');
    try {
      const l = await generateLesson({ unit: 'Rehearse', objective: text.trim().slice(0, 600), weak: [], avoid: [], pressure });
      setLesson(l);
      setStep('brief');
      track('rehearse_built', { from: occ ? 'occasion' : 'tab' });
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t build that scene.');
    } finally {
      setBusy(false);
    }
  }

  function call() {
    if (!gate('calls')) return;
    setEv(null);
    setKey((k) => k + 1);
    setStep('talk');
  }

  const header = (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <IconButton label="Close" onPress={() => router.back()}><Icon d={ICON.close} size={16} /></IconButton>
      <Label>{occ ? 'Practise the moment' : 'Rehearse · Kleos+'}</Label>
      <View style={{ width: 40 }} />
    </Row>
  );

  if (step === 'talk' && lesson) {
    return (
      <NightCall label={occ ? occ.what : 'Rehearsal'} onClose={() => router.back()}>
        <Conversation
          metered
          key={key}
          label="Rehearsal"
          args={{ lesson, pressure }}
          onDone={({ sessionId, evaluation }) => {
            const e = evaluation as Ev;
            setEv(e);
            setSid(sessionId);
            if (!e.insufficient) {
              s.addSession({ id: sessionId, kind: 'room', title: occ ? occ.what : 'Rehearsal', createdAt: new Date().toISOString(), evaluation: e });
              s.touchDay();
              const o = useStore.getState().occasion;
              if (occ && o) s.set({ occasion: { ...o, practised: (o.practised ?? 0) + 1 } });
            }
            setStep('result');
          }}
        />
      </NightCall>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === 'describe' && (
          <Stack gap={14}>
            <ArtCard art="aurelius" height={occ ? 190 : 230} focus="top">
              <OnBlue kicker={occ ? 'Your occasion' : 'Rehearse'} sub={occ ? 'Poise has what you told it. Add anything it should know, then build the scene.' : 'Describe what’s coming up. Poise rebuilds it with the right person and the thing you’re dreading. Play it until it’s easy.'}>
                {occ ? 'Play it before it happens' : 'Practise the real thing'}
              </OnBlue>
            </ArtCard>
            <Card style={{ gap: 8 }}>
              <Label>What’s the situation?</Label>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                editable={paid}
                maxLength={600}
                placeholder="Who is it with, where, and what are you worried will happen?"
                placeholderTextColor={t.ink3}
                style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink, minHeight: 96, textAlignVertical: 'top' }}
              />
              {paid && !text ? (
                <Stack gap={6}>
                  {EXAMPLES.map((x) => (
                    <RNText key={x} onPress={() => setText(x)} style={{ fontFamily: font.regular, fontSize: 13, color: t.accent }}>“{x}”</RNText>
                  ))}
                </Stack>
              ) : null}
            </Card>
            <Stack gap={8}>
              <Label>Intensity</Label>
              <Row gap={8}>
                {[1, 2, 3].map((p) => <Pill key={p} label={PRESSURE[p]} active={pressure === p} onPress={() => setPressure(p)} />)}
              </Row>
            </Stack>
            {err ? <Body small color={t.accent}>{err}</Body> : null}
          </Stack>
        )}

        {step === 'brief' && lesson && (
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 12 }}>
            <View style={{ borderRadius: 22, backgroundColor: t.inverse, padding: 18, gap: 6 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>YOUR SCENE · WITH {(PARTNER[lesson.character] ?? lesson.character).toUpperCase()}</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 20, lineHeight: 25, color: '#FFF' }}>{lesson.setting}</RNText>
              <RNText style={{ fontFamily: font.serifItalic, fontSize: 18, color: '#FFF' }}>“{lesson.opener}”</RNText>
            </View>
            <Card style={{ gap: 4 }}>
              <Label color={t.accent}>Your goal</Label>
              <Body>{lesson.goal}</Body>
            </Card>
            {lesson.hint ? <Muted small>Tip: {lesson.hint}</Muted> : null}
          </Animated.View>
        )}

        {step === 'result' && ev && (ev.insufficient ? <Insufficient e={ev} /> : (
          <Stack gap={12}>
            <Appear><ResultHero e={ev} label="You played it like" /></Appear>
            <Appear delay={120}><FeedbackCard e={ev} /></Appear>
            <Appear delay={240}><HearPoise src={ev.scriptAudio ?? ev.script_audio} /></Appear>
            <Appear delay={300}><RetryMoment e={ev} onRetry={() => retryMoment(sid, ev, occ ? occ.what : 'Rehearsal')} /></Appear>
            <Appear delay={360}><FullRead e={ev} /></Appear>
            <Appear delay={480}><AfterRead sessionId={sid} e={ev} /></Appear>
          </Stack>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        {step === 'describe' && (paid ? (
          <Button label={busy ? 'Building your scene…' : 'Build the scene'} disabled={busy || words < 6} onPress={build} />
        ) : (
          <Button label="Unlock with Kleos+" onPress={() => router.push({ pathname: '/paywall', params: { reason: 'rehearse' } })} />
        ))}
        {step === 'brief' && (
          <>
            <Button label="Start the call" sound="select" onPress={call} />
            <Button label={busy ? 'Rebuilding…' : 'Rebuild it'} variant="secondary" onPress={build} disabled={busy} />
          </>
        )}
        {step === 'result' && (
          <>
            {occ ? <Button label="Now choose the look" sound="select" onPress={() => router.replace({ pathname: '/wardrobe', params: { from: 'occasion' } })} /> : null}
            <Button label="Run it again" variant={occ ? 'secondary' : 'primary'} onPress={call} />
            <Button label="Done" variant="secondary" onPress={() => router.back()} />
          </>
        )}
      </View>
    </Screen>
  );
}
