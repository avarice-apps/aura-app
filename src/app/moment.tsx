import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useLocalSearchParams, Redirect } from 'expo-router';
import { Screen, Button, Stack, IconButton, Icon, ICON, Label, Row } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { NightCall } from '@/components/NightCall';
import { CompareCard, FeedbackCard, HearPoise, Appear, FullRead, Insufficient } from '@/components/Results';
import { finishMoment, pendingMoment } from '@/lib/moment';
import { play } from '@/lib/sound';
import type { Evaluation } from '@/lib/types';

type Ev = Evaluation & { scriptAudio?: any };

/** Retry this moment: the call picks up just before the line that mattered. Then before / after, honestly. */
export default function Moment() {
  const { session, turn } = useLocalSearchParams<{ session: string; turn: string }>();
  const p = pendingMoment(session);
  const [ev, setEv] = useState<Ev | null>(null);
  const k = Number(turn) || p?.e.change?.turn || 0;

  if (!session || !k) return <Redirect href="/(tabs)" />;

  if (!ev) {
    return (
      <NightCall label={`The moment · turn ${k}`} onClose={() => router.back()}>
        <Conversation
          metered
          label="Retry this moment"
          args={{ resume: { session, turn: k } }}
          onDone={({ evaluation }) => {
            const e = evaluation as Ev;
            finishMoment(session, e);
            setEv(e);
          }}
          onLeave={() => router.back()}
        />
      </NightCall>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton label="Close" onPress={() => router.back()}>
          <Icon d={ICON.close} size={16} />
        </IconButton>
        <Label>{p?.title ? `${p.title} · the moment` : 'The moment'}</Label>
        <View style={{ width: 40 }} />
      </Row>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {ev.insufficient ? (
          <Insufficient e={ev} />
        ) : (
          <Stack gap={12}>
            {p ? <Appear><CompareCard a={p.e} b={ev} /></Appear> : null}
            <Appear delay={140}><FeedbackCard e={ev} /></Appear>
            <Appear delay={260}><HearPoise src={ev.scriptAudio ?? ev.script_audio} /></Appear>
            <Appear delay={380}><FullRead e={ev} showAlternatives={false} /></Appear>
          </Stack>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        <Button label="Done" sound="select" onPress={() => { play('cleared'); router.back(); }} />
      </View>
    </Screen>
  );
}
