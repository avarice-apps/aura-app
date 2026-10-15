import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Button, Row, Stack, Pill, IconButton, Icon, ICON, Tag, Card } from '@/ui';
import { ReactiveStatue } from '@/components/ReactiveStatue';
import { Conversation } from '@/components/Conversation';
import { ResultHero, FeedbackCard, HearPoise, Appear, FullRead, Insufficient } from '@/components/Results';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { FLOORS } from '@/lib/floors';
import { PARTNER } from '@/lib/quests';
import type { Evaluation } from '@/lib/types';
import { play } from '@/lib/sound';
import { gate } from '@/lib/plan';

type Step = 'brief' | 'talk' | 'result';
type Ev = Evaluation & { scriptAudio?: any };
const PRESSURE = ['', 'Chill', 'Real', 'Brutal'];
const STATUE: Record<string, 'head' | 'athlete' | 'bust' | 'antinoos'> = { dating: 'antinoos', approach: 'athlete', money: 'bust', work: 'head', conflict: 'bust', status: 'head' };

/** One Open Floor scene: brief → live call (as long as you like) → read. */
export default function FloorScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = FLOORS.find((x) => x.id === id);
  const s = useStore();
  const [pressure, setPressure] = useState(2);
  const [step, setStep] = useState<Step>('brief');
  const [ev, setEv] = useState<Ev | null>(null);
  const [key, setKey] = useState(0);
  if (!f) return null;
  const who = [PARTNER[f.primary] ?? f.primary, ...Object.keys(f.roles)];

  const header = (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
      <IconButton label="Close" onPress={() => router.back()}>
        <Icon d={ICON.close} size={16} />
      </IconButton>
      <Label>Open Floor</Label>
      <View style={{ width: 40 }} />
    </Row>
  );

  if (step === 'talk') {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Conversation
          key={key}
          label={f.title}
          args={{ floor_id: f.id, pressure }}
          onDone={({ sessionId, evaluation }) => {
            const e = evaluation as Ev;
            setEv(e);
            if (!e.insufficient) {
              s.addSession({ id: sessionId, kind: 'room', title: f.title, createdAt: new Date().toISOString(), evaluation: e });
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
          <Stack gap={18}>
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}>
              <ReactiveStatue name={STATUE[f.category] ?? 'head'} height={160} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(120)} style={{ gap: 8 }}>
              <Row gap={8}>
                {who.map((w) => <Tag key={w} label={w} tone={w === who[0] ? 'accent' : 'muted'} />)}
                {f.spicy ? <Tag label="18+" /> : null}
              </Row>
              <Title size={28}>{f.title}</Title>
              <Body color={t.ink2}>{f.setting}</Body>
            </Animated.View>
            <Card style={{ gap: 6 }}>
              <Label color={t.accent}>How it works</Label>
              <Body small>It’s a phone call with the room. Talk whenever you want, cut them off if you need to. People will join, and it gets harder the longer you stay.</Body>
              <Body small color={t.ink2}>End the call when you want your read. If you lose them, they’ll leave first.</Body>
            </Card>
            <Stack gap={8}>
              <Label>Intensity</Label>
              <Row gap={8}>
                {[1, 2, 3].map((p) => (
                  <Pill key={p} label={PRESSURE[p]} active={pressure === p} onPress={() => setPressure(p)} />
                ))}
              </Row>
              <Muted small>{pressure === 1 ? 'People give you a chance.' : pressure === 2 ? 'Like real life. Vague answers cost you.' : 'Impatient, skeptical, quick to walk.'}</Muted>
            </Stack>
          </Stack>
        )}

        {step === 'result' && ev && (ev.insufficient ? <Insufficient e={ev} /> : (
          <Stack gap={12}>
            <Appear><ResultHero e={ev} label="That call read as" /></Appear>
            <Appear delay={120}><FeedbackCard e={ev} /></Appear>
            <Appear delay={240}><HearPoise src={ev.scriptAudio ?? ev.script_audio} /></Appear>
            <Appear delay={360}><FullRead e={ev} /></Appear>
          </Stack>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        {step === 'brief' && <Button label="Start the call" sound="select" onPress={() => gate('calls') && setStep('talk')} />}
        {step === 'result' && (
          <>
            <Button label="Go again" sound="select" onPress={() => { if (!gate('calls')) return; setEv(null); setKey((k) => k + 1); setStep('talk'); }} />
            <Button label="Done" variant="secondary" onPress={() => { play('cleared'); router.back(); }} />
          </>
        )}
      </View>
    </Screen>
  );
}
