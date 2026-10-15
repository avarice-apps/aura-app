import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Body, Muted, Label, Card, Row, Stack, Print, Button, Icon, ICON, Tag, ListRow } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { makeReceipt } from '@/lib/api';
import { prepareMic, speak } from '@/lib/voice';
import { ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';

export default function PoiseTab() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const s = useStore();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [context, setContext] = useState<string>(params.mode === 'debrief' ? 'Nightly debrief: one moment from today.' : '');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const mission = ALL_MISSIONS.find((m) => m.id === s.activeMission);
  const nextMissions = ALL_MISSIONS.filter((m) => !s.missionsDone.includes(m.id) && m.id !== s.activeMission).slice(0, 3);

  async function submit(audioUri?: string) {
    setBusy(true);
    setErr('');
    try {
      const r = await makeReceipt({ text: text.trim() || undefined, audioUri, context });
      const rec = { ...r, createdAt: new Date().toISOString(), missionId: mission && context.startsWith('Field mission') ? mission.id : undefined };
      s.addReceipt(rec);
      if (rec.missionId) s.set({ missionsDone: [...s.missionsDone, rec.missionId], activeMission: undefined });
      s.touchDay();
      setText('');
      setContext('');
      play('reveal');
      router.push({ pathname: '/receipt', params: { i: '0' } });
      if (r.audio) speak(r.audio);
    } catch (e: any) {
      setErr(e?.message ?? 'Poise could not read that.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (!recording) {
      if (!(await prepareMic())) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      play('select');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRecording(true);
    } else {
      await recorder.stop();
      setRecording(false);
      submit(recorder.uri ?? undefined);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Row gap={14} style={{ paddingTop: 10, alignItems: 'flex-end' }}>
            <Print name="faceHead" size={64} radius={32} />
            <Stack gap={2} style={{ flex: 1 }}>
              <Title size={30}>Poise</Title>
              <Muted small>Tell me what happened. I’ll tell you where the aura went.</Muted>
            </Stack>
          </Row>

          <Card style={{ marginTop: 16, gap: 10 }}>
            {context ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Tag label={context.startsWith('Night') ? 'Tonight’s debrief' : 'Mission debrief'} tone="accent" />
                <Pressable onPress={() => setContext('')} hitSlop={10}><Muted small>Clear</Muted></Pressable>
              </Row>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={context.startsWith('Night') ? 'One moment from today. What happened, what did you say?' : 'Dinner last night. I told a long story and someone changed the subject…'}
              placeholderTextColor={t.ink3}
              style={{ minHeight: 96, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink, textAlignVertical: 'top' }}
            />
            <Row gap={8}>
              <Pressable onPress={toggleMic} accessibilityLabel={recording ? 'Stop and send' : 'Tell it out loud'} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: recording ? t.accent : t.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={recording ? ICON.stop : ICON.mic} size={20} color={recording ? t.onAccent : t.ink} fill={recording ? t.onAccent : undefined} />
              </Pressable>
              <Button label={busy ? 'Reading it…' : 'Get my receipt'} disabled={busy || (!recording && text.trim().split(/\s+/).length < 5)} style={{ flex: 1 }} onPress={() => submit()} />
            </Row>
            {recording && <Muted small>Recording. Tap the square when you’re done.</Muted>}
            {err ? <Body small color={t.accent}>{err}</Body> : null}
          </Card>

          <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 22, gap: 10 }}>
            <Label>Field missions · real life, debriefed here</Label>
            {mission ? (
              <Card inverse style={{ gap: 8 }}>
                <Label color={t.onInverse2}>Active · {mission.skill}</Label>
                <Title size={24} color={t.onInverse}>{mission.title}</Title>
                <Body color={t.onInverse}>{mission.task}</Body>
                <Button label="I did it. Debrief me" variant="light" onPress={() => setContext(`Field mission: ${mission.task}`)} />
              </Card>
            ) : null}
            <Card style={{ paddingVertical: 4 }}>
              {nextMissions.map((m, i) => (
                <ListRow key={m.id} first={i === 0} title={m.title} sub={m.task} right={<Label>{'●'.repeat(m.difficulty)}</Label>} onPress={() => { s.set({ activeMission: m.id }); play('select'); }} />
              ))}
            </Card>
          </Animated.View>

          {s.receipts.length > 0 && (
            <View style={{ marginTop: 22, gap: 10 }}>
              <Label>Your receipts</Label>
              <Card style={{ paddingVertical: 4 }}>
                {s.receipts.slice(0, 8).map((r, i) => (
                  <ListRow key={i} first={i === 0} title={r.title} sub={r.headline} right={<RNText style={{ fontFamily: font.monoMedium, fontSize: 12, color: r.total >= 0 ? t.accent : t.ink }}>{r.total > 0 ? '+' : ''}{r.total}</RNText>} onPress={() => router.push({ pathname: '/receipt', params: { i: String(i) } })} />
                ))}
              </Card>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
