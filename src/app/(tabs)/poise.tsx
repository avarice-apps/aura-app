import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Body, Muted, Label, Icon, ICON, Halo } from '@/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { makeReceipt } from '@/lib/api';
import { prepareMic, speak } from '@/lib/voice';
import { ALL_MISSIONS } from '@/lib/progress';
import type { Receipt } from '@/lib/types';
import { play } from '@/lib/sound';
import { spend, refund, gate } from '@/lib/plan';
import { liveAvailable } from '@/components/Conversation';

/** Ask Poise: a chat. Tell it what happened; it answers with where the aura went, then offers the next move. */
export default function PoiseTab() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: string; mission?: string }>();
  const s = useStore();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Record<string, 'said' | 'drill' | undefined>>({});
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, sampleRate: 22050, numberOfChannels: 1, bitRate: 64000 });
  const scroll = useRef<ScrollView>(null);
  const mission = ALL_MISSIONS.find((m) => m.id === (params.mission ?? ''));
  const context = mission ? `Field mission: ${mission.task}` : params.mode === 'debrief' ? 'Nightly debrief: one moment from today.' : '';
  const thread = [...s.receipts].reverse(); // oldest first, like a chat

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 80);
  }, [s.receipts.length, busy]);

  async function submit(audioUri?: string) {
    if (busy) return;
    if (!spend('poise')) {
      router.push({ pathname: '/paywall', params: { reason: 'poise' } });
      return;
    }
    setBusy(true);
    setErr('');
    play('select');
    try {
      const r = await makeReceipt({ text: text.trim() || undefined, audioUri, context });
      const rec = { ...r, createdAt: new Date().toISOString(), missionId: mission?.id };
      s.addReceipt(rec);
      if (mission) s.set({ missionsDone: Array.from(new Set([...s.missionsDone, mission.id])), activeMission: undefined });
      s.touchDay();
      s.markDaily(mission ? 'mission' : 'debrief');
      setText('');
      play('reveal');
      if (r.audio) speak(r.audio);
    } catch (e: any) {
      refund('poise');
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRecording(true);
    } else {
      await recorder.stop();
      setRecording(false);
      submit(recorder.uri ?? undefined);
    }
  }

  const canSend = text.trim().split(/\s+/).filter(Boolean).length >= 3;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: t.line }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Halo size={64} opacity={0.9} />
            <View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent }} />
          </View>
          <View style={{ flex: 1 }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 18, color: t.ink }}>Poise</RNText>
            <Muted small>Tell me what happened, or ask me anything.</Muted>
          </View>
          <Pressable onPress={() => router.push('/missions')} hitSlop={8} accessibilityLabel="Field missions" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ICON.flag} size={16} color={t.ink} />
          </Pressable>
          {liveAvailable() ? (
            <Pressable onPress={() => { if (gate('calls')) router.push('/poise-live'); }} hitSlop={8} accessibilityLabel="Talk to Poise" style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon d={ICON.live} size={15} color={t.onAccent} />
              <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.onAccent }}>Talk</RNText>
            </Pressable>
          ) : null}
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {thread.length === 0 && !context && (
            <Animated.View entering={FadeIn.duration(500)}>
              <PoiseBubble>
                <Body>Describe a real moment: a dinner, a date, a meeting, a text you sent. Or ask me anything: what to wear Saturday, how to reply to her, how to ask for the raise.</Body>
                <Muted small style={{ marginTop: 6 }}>Stories get an aura ledger. Questions get a straight answer. Tap Talk to do it out loud.</Muted>
              </PoiseBubble>
            </Animated.View>
          )}

          {thread.map((r, i) => (
            <Exchange
              key={`${r.receipt_no}-${i}`}
              r={r}
              open={open[r.receipt_no]}
              onOpen={(k) => setOpen((o) => ({ ...o, [r.receipt_no]: o[r.receipt_no] === k ? undefined : k }))}
              onReplay={() => router.push({ pathname: '/replay', params: { i: String(s.receipts.indexOf(r)) } })}
              onReceipt={() => router.push({ pathname: '/receipt', params: { i: String(s.receipts.indexOf(r)) } })}
            />
          ))}

          {context ? (
            <Animated.View entering={FadeIn.duration(400)}>
              <PoiseBubble>
                <Label color={t.accent}>{mission ? 'Mission debrief' : 'Tonight’s debrief'}</Label>
                <Body style={{ marginTop: 4 }}>{mission ? `${mission.title}. How did it go? Tell me what you said and how they reacted.` : 'One moment from today. What happened, and what did you say?'}</Body>
              </PoiseBubble>
            </Animated.View>
          ) : null}

          {busy && (
            <Animated.View entering={FadeIn} style={{ alignSelf: 'flex-start' }}>
              <PoiseBubble>
                <Muted small>Reading it…</Muted>
              </PoiseBubble>
            </Animated.View>
          )}
          {err ? <Body small color={t.accent}>{err}</Body> : null}
        </ScrollView>

        {/* Composer */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: t.line, backgroundColor: t.bg }}>
          <View style={{ flex: 1, minHeight: 50, maxHeight: 130, borderRadius: 25, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 18, justifyContent: 'center' }}>
            {recording ? (
              <Muted small>Listening… tap the square when you’re done.</Muted>
            ) : (
              <TextInput value={text} onChangeText={setText} multiline placeholder="What happened, or what do you want to know?" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink, paddingVertical: 13 }} />
            )}
          </View>
          {canSend && !recording ? (
            <Pressable onPress={() => submit()} accessibilityLabel="Send" style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ICON.send} size={20} color={t.onAccent} stroke={2.2} />
            </Pressable>
          ) : (
            <Pressable onPress={toggleMic} accessibilityLabel={recording ? 'Stop and send' : 'Tell it out loud'} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={recording ? ICON.stop : ICON.mic} size={20} color={t.onAccent} fill={recording ? t.onAccent : undefined} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PoiseBubble({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ alignSelf: 'stretch', backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 20, padding: 16 }}>{children}</View>;
}

function Exchange({ r, open, onOpen, onReplay, onReceipt }: { r: Receipt; open?: 'said' | 'drill'; onOpen: (k: 'said' | 'drill') => void; onReplay: () => void; onReceipt: () => void }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 12 }}>
      {/* You */}
      <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: t.accent, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Body color={t.onAccent} style={{ fontFamily: font.medium }}>{r.story}</Body>
      </View>

      {/* Poise */}
      {r.advice ? (
        <PoiseBubble>
          <Body style={{ fontSize: 16, lineHeight: 23 }}>{r.advice}</Body>
        </PoiseBubble>
      ) : (
      <PoiseBubble>
        <Body style={{ fontSize: 16, lineHeight: 23 }}>{r.headline}</Body>
        {r.lines.length > 0 ? (
          <Pressable onPress={onReceipt} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderColor: t.cardAlt }}>
            <Label>Aura ledger</Label>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, color: r.total >= 0 ? t.accent : t.ink }}>Net {r.total > 0 ? '+' : ''}{r.total}</RNText>
          </Pressable>
        ) : null}
        {r.lines.map((l, k) => (
          <View key={k} style={{ flexDirection: 'row', gap: 14, paddingVertical: 10, borderBottomWidth: k < r.lines.length - 1 ? 1 : 0, borderColor: t.cardAlt }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, width: 36, color: l.points >= 0 ? t.accent : t.ink2 }}>{l.points > 0 ? '+' : ''}{l.points}</RNText>
            <Body small style={{ flex: 1 }}>{l.text}</Body>
          </View>
        ))}
        {r.next_time ? (
          <View style={{ marginTop: 12, backgroundColor: t.cardAlt, borderRadius: 14, padding: 14, gap: 4 }}>
            <Label>Next time</Label>
            <Body small>{r.next_time}</Body>
          </View>
        ) : null}
      </PoiseBubble>
      )}

      {open === 'said' && r.said_instead ? (
        <Animated.View entering={FadeInDown.duration(300)}>
          <PoiseBubble>
            <Label color={t.accent}>You could have said</Label>
            <RNText style={{ fontFamily: font.serifItalic, fontSize: 20, lineHeight: 26, color: t.ink, marginTop: 6 }}>“{r.said_instead}”</RNText>
            <Muted small style={{ marginTop: 6 }}>In your words, not these. It’s the shape that matters.</Muted>
          </PoiseBubble>
        </Animated.View>
      ) : null}
      {open === 'drill' ? (
        <Animated.View entering={FadeInDown.duration(300)}>
          <PoiseBubble>
            <Label color={t.accent}>Your drill</Label>
            <Body style={{ marginTop: 4 }}>{r.drill}</Body>
            <Pressable onPress={onReplay} style={{ marginTop: 12, alignSelf: 'flex-start', backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, height: 38, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>Practise it live</RNText>
            </Pressable>
          </PoiseBubble>
        </Animated.View>
      ) : null}

      {/* Next moves (stories only) */}
      {!r.advice && r.lines.length > 0 && (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {r.said_instead ? <Chip label="What should I have said?" on={open === 'said'} onPress={() => onOpen('said')} /> : null}
        <Chip label="Replay it as a roleplay" onPress={onReplay} />
        <Chip label="Make it a drill" on={open === 'drill'} onPress={() => onOpen('drill')} />
      </View>
      )}
    </Animated.View>
  );
}

function Chip({ label, onPress, on }: { label: string; onPress: () => void; on?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        play('tap');
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.bg, justifyContent: 'center' }}
    >
      <RNText style={{ fontFamily: font.regular, fontSize: 13, color: on ? t.accent : t.ink }}>{label}</RNText>
    </Pressable>
  );
}
