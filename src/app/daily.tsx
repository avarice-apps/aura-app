import React, { useState } from 'react';
import { View, ScrollView, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, Row, Stack, Pill, IconButton, Icon, ICON, Card, ArtCard, OnBlue } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { ResultHero, FeedbackCard, HearPoise, Appear, FullRead, Insufficient } from '@/components/Results';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { dailyFor, today } from '@/lib/dailies';
import type { Evaluation } from '@/lib/types';
import { play } from '@/lib/sound';

type Step = 'brief' | 'talk' | 'result';
type Ev = Evaluation & { scriptAudio?: any };
const PRESSURE = ['', 'Chill', 'Real', 'Brutal'];

/** Daily Side Quest: something happens to you today. You don't know what until the call connects. */
export default function DailyQuest() {
  const t = useTheme();
  const s = useStore();
  const d = dailyFor(s.tone);
  const played = (s.dailyQuestDone ?? []).includes(today());
  const [pressure, setPressure] = useState(2);
  const [step, setStep] = useState<Step>('brief');
  const [ev, setEv] = useState<Ev | null>(null);

  const header = (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <IconButton label="Close" onPress={() => router.back()}>
        <Icon d={ICON.close} size={16} />
      </IconButton>
      <Label>Daily side quest</Label>
      <View style={{ width: 40 }} />
    </Row>
  );

  if (step === 'talk') {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Conversation
          label="Daily side quest"
          args={{ daily_id: d.id, pressure }}
          onDone={({ sessionId, evaluation }) => {
            const e = evaluation as Ev;
            setEv(e);
            s.set({ dailyQuestDone: Array.from(new Set([...(s.dailyQuestDone ?? []), today()])) });
            if (!e.insufficient) {
              s.addSession({ id: sessionId, kind: 'room', title: d.title, createdAt: new Date().toISOString(), evaluation: e });
              s.touchDay();
            }
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
          <Stack gap={16}>
            <Animated.View entering={FadeInDown.duration(450)}>
              <ArtCard art="vespasian" height={330} focus="top">
                <OnBlue kicker={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} sub="Something is about to happen to you. You find out what when the call connects. Handle it.">
                  {played ? 'You already played today’s.' : 'Today’s side quest'}
                </OnBlue>
              </ArtCard>
            </Animated.View>
            <Card style={{ gap: 6 }}>
              <Label color={t.accent}>How it works</Label>
              <Body small>It could be anyone: a stranger on the subway, a bouncer, your ex in the grocery store, a guy who thinks you scratched his truck. It talks back, other people join, and it escalates.</Body>
              <Body small color={t.ink2}>Everyone gets the same one today. Compare scores with your friends.</Body>
            </Card>
            <Stack gap={8}>
              <Label>Intensity</Label>
              <Row gap={8}>
                {[1, 2, 3].map((p) => (
                  <Pill key={p} label={PRESSURE[p]} active={pressure === p} onPress={() => setPressure(p)} />
                ))}
              </Row>
            </Stack>
          </Stack>
        )}

        {step === 'result' && ev && (
          <Stack gap={12}>
            <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18, gap: 4 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>TODAY WAS</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 24, color: '#FFF' }}>{d.title}</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 14, color: 'rgba(255,255,255,0.86)' }}>With {d.persona.name}. {d.setting}</RNText>
            </View>
            {ev.insufficient ? <Insufficient e={ev} /> : (
              <>
                <Appear><ResultHero e={ev} label="You handled it like" /></Appear>
                <Appear delay={120}><FeedbackCard e={ev} /></Appear>
                <Appear delay={240}><HearPoise src={ev.scriptAudio ?? ev.script_audio} /></Appear>
                <Appear delay={360}><FullRead e={ev} /></Appear>
              </>
            )}
            <Muted small align="center">A new one tomorrow.</Muted>
          </Stack>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        {step === 'brief' && <Button label={played ? 'Play it again' : 'Answer it'} sound="select" onPress={() => setStep('talk')} />}
        {step === 'result' && <Button label="Done" onPress={() => { play('cleared'); router.back(); }} />}
      </View>
    </Screen>
  );
}
