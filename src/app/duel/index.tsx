import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Share, TextInput, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Button, IconButton, Icon, ICON, Card, Row } from '@/ui';
import { TakeRecorder } from '@/components/TakeRecorder';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { duelCreate } from '@/lib/api';
import { track } from '@/lib/analytics';
import TOPICS from '../../../content/duels.json';
import type { Duel } from '@/lib/types';

type Step = 'setup' | 'record' | 'sending' | 'sent';
const TAKE_S = 45;

/** Debate Duel: you argue first. Your friend gets a code, argues the other side whenever, and Poise judges both. */
export default function DuelStart() {
  const t = useTheme();
  const s = useStore();
  const all = TOPICS.topics;
  const [i, setI] = useState(() => Math.floor(Math.random() * all.length));
  const topic = all[i % all.length];
  const [name, setName] = useState(s.name ?? '');
  const [step, setStep] = useState<Step>('setup');
  const [err, setErr] = useState('');
  const [duel, setDuel] = useState<Duel | null>(null);
  const shuffle = useMemo(() => () => setI((x) => (x + 1 + Math.floor(Math.random() * (all.length - 1))) % all.length), [all.length]);

  async function send(uri: string) {
    setStep('sending');
    setErr('');
    try {
      const d = await duelCreate({ videoUri: uri, topicId: topic.id, name: name.trim() || undefined });
      setDuel(d);
      s.set({ duels: [{ id: d.id, code: d.code, topic: d.topic, role: 'a' as const, createdAt: new Date().toISOString() }, ...(s.duels ?? [])].slice(0, 30) });
      track('duel_created', { topic: topic.id });
      setStep('sent');
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t send your take.');
      setStep('setup');
    }
  }

  if (step === 'record') {
    return <TakeRecorder seconds={TAKE_S} kicker={`Your side: ${topic.a}`} title={topic.topic} sub="Make your case. Your opponent argues the other side later." onDone={send} onClose={() => setStep('setup')} />;
  }

  const invite = duel ? `I just argued “${duel.topic}” (${duel.side_a}). You take ${duel.side_b}. Open Kleos → Farm → Join a duel → ${duel.code}` : '';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        {step !== 'sent' ? (
          <View style={{ gap: 14, marginTop: 10 }}>
            <View style={{ gap: 6 }}>
              <Label color={t.accent}>Debate Duel</Label>
              <Title size={30}>Argue it. Then send it.</Title>
              <Muted small>You get {TAKE_S} seconds on camera for one side. Your friend argues the other side whenever they want. Poise judges both on argument and composure.</Muted>
            </View>
            <Animated.View key={topic.id} entering={FadeInDown.duration(300)} style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18, gap: 10 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>THE TOPIC</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 22, lineHeight: 27, color: '#FFF' }}>{topic.topic}</RNText>
              <Row gap={8}>
                <View style={{ backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><RNText style={{ fontFamily: font.medium, fontSize: 12, color: t.accent }}>You: {topic.a}</RNText></View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><RNText style={{ fontFamily: font.medium, fontSize: 12, color: '#FFF' }}>Them: {topic.b}</RNText></View>
              </Row>
              <Pressable onPress={shuffle} hitSlop={8}><RNText style={{ fontFamily: font.medium, fontSize: 13, color: '#FFF', textDecorationLine: 'underline' }}>Different topic</RNText></Pressable>
            </Animated.View>
            <Card style={{ gap: 8 }}>
              <Label>Your name on the verdict</Label>
              <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 15, color: t.ink, paddingVertical: 6 }} />
            </Card>
            {err ? <Body small color={t.accent}>{err}</Body> : null}
            <Button label={step === 'sending' ? 'Poise is listening…' : 'Record my side'} disabled={step === 'sending'} onPress={() => setStep('record')} />
          </View>
        ) : (
          <View style={{ gap: 14, marginTop: 10 }}>
            <Label color={t.accent}>Sent to the judge</Label>
            <Title size={30}>Now send them the code.</Title>
            <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 22, alignItems: 'center', gap: 6 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>DUEL CODE</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 44, letterSpacing: 8, color: '#FFF' }}>{duel?.code}</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.86)', textAlign: 'center' }}>They argue “{duel?.side_b}”. You’ll see the verdict in Farm once they’ve gone.</RNText>
            </View>
            <Button label="Send the challenge" onPress={() => { track('share', { what: 'duel_invite' }); Share.share({ message: invite }); }} />
            <Button label="They’re here: pass the phone" variant="secondary" onPress={() => duel && router.replace({ pathname: '/duel/[code]', params: { code: duel.code } })} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
