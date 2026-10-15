import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Body, Muted, Label, Row, Button, Icon, ICON, Tabs, Section, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { makeReceipt } from '@/lib/api';
import { prepareMic, speak } from '@/lib/voice';
import { ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';

type Pane = 'ask' | 'missions' | 'receipts';

/** Poise. Three panes, one at a time: ask about a moment, real-life missions, your receipts. */
export default function PoiseTab() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const s = useStore();
  const [pane, setPane] = useState<Pane>('ask');
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [context, setContext] = useState<string>(params.mode === 'debrief' ? 'Nightly debrief: one moment from today.' : '');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const mission = ALL_MISSIONS.find((m) => m.id === s.activeMission);
  const open = ALL_MISSIONS.filter((m) => !s.missionsDone.includes(m.id) && m.id !== s.activeMission);

  async function submit(audioUri?: string) {
    setBusy(true);
    setErr('');
    try {
      const r = await makeReceipt({ text: text.trim() || undefined, audioUri, context });
      const rec = { ...r, createdAt: new Date().toISOString(), missionId: mission && context.startsWith('Field mission') ? mission.id : undefined };
      s.addReceipt(rec);
      if (rec.missionId) s.set({ missionsDone: [...s.missionsDone, rec.missionId], activeMission: undefined });
      s.touchDay();
      s.markDaily(rec.missionId ? 'mission' : 'debrief');
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

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
          <Title size={30}>Poise</Title>
          <Tabs<Pane> value={pane} onChange={setPane} options={[{ key: 'ask', label: 'Ask' }, { key: 'missions', label: 'Missions' }, { key: 'receipts', label: 'Receipts' }]} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {pane === 'ask' && (
            <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 14 }}>
              <View style={{ gap: 4 }}>
                <Body strong style={{ fontSize: 17 }}>{context.startsWith('Night') ? 'Tonight’s debrief' : context ? 'Mission debrief' : 'What happened?'}</Body>
                <Muted small>Describe a real moment. Poise tells you where the aura went, line by line.</Muted>
              </View>
              <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  placeholder="Dinner last night. I told a long story and someone changed the subject halfway…"
                  placeholderTextColor={t.ink3}
                  style={{ minHeight: 120, fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: t.ink, textAlignVertical: 'top' }}
                />
              </View>
              <Row gap={10}>
                <Pressable onPress={toggleMic} accessibilityLabel={recording ? 'Stop and send' : 'Say it out loud'} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: recording ? t.accent : t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={recording ? ICON.stop : ICON.mic} size={20} color={recording ? t.onAccent : t.accent} fill={recording ? t.onAccent : undefined} />
                </Pressable>
                <Button label={busy ? 'Reading it…' : 'Get my receipt'} disabled={busy || (!recording && words < 5)} style={{ flex: 1 }} onPress={() => submit()} />
              </Row>
              {recording ? <Muted small>Recording. Tap the square when you’re done.</Muted> : null}
              {err ? <Body small color={t.accent}>{err}</Body> : null}
              {context ? (
                <Pressable onPress={() => setContext('')} hitSlop={8}>
                  <Muted small>Not a debrief? Clear it.</Muted>
                </Pressable>
              ) : null}
            </Animated.View>
          )}

          {pane === 'missions' && (
            <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 24 }}>
              {mission ? (
                <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 20, gap: 8 }}>
                  <Label color={t.onInverse2}>Active · {mission.skill}</Label>
                  <Title size={22} color={t.onAccent}>{mission.title}</Title>
                  <Body small color={t.onInverse2}>{mission.task}</Body>
                  <Pressable
                    onPress={() => { setContext(`Field mission: ${mission.task}`); setPane('ask'); play('select'); }}
                    style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: t.onAccent, borderRadius: 999, paddingHorizontal: 16, height: 40, justifyContent: 'center' }}
                  >
                    <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.accent }}>I did it · debrief me</RNText>
                  </Pressable>
                </View>
              ) : (
                <Muted small>Pick one. Do it in real life this week, then tell Poise how it went.</Muted>
              )}
              <View>
                <Section title={mission ? 'Up after this' : 'Missions'} note={`${s.missionsDone.length} done`} />
                <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
                  {open.slice(0, 5).map((m, i) => (
                    <Pressable key={m.id} onPress={() => { s.set({ activeMission: m.id }); play('select'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{m.title}</RNText>
                        <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }} numberOfLines={2}>{m.task}</RNText>
                      </View>
                      <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.accent }}>Start</RNText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Animated.View>
          )}

          {pane === 'receipts' && (
            <Animated.View entering={FadeInDown.duration(300)}>
              {s.receipts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                  <Body strong>No receipts yet</Body>
                  <Muted small align="center">Tell Poise about a real moment in Ask. Each one becomes a receipt you can keep or share.</Muted>
                </View>
              ) : (
                <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
                  {s.receipts.map((r, i) => (
                    <Pressable key={i} onPress={() => router.push({ pathname: '/receipt', params: { i: String(i) } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{r.title}</RNText>
                        <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }} numberOfLines={1}>{r.headline}</RNText>
                      </View>
                      <RNText style={{ fontFamily: font.monoMedium, fontSize: 13, color: r.total >= 0 ? t.accent : t.ink }}>{r.total > 0 ? '+' : ''}{r.total}</RNText>
                      <Chevron />
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
