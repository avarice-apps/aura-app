import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Text as RNText, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { Body, Muted, Label, Icon, ICON } from '@/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, useTheme } from '@/theme';
import { useStore, type CallNote } from '@/state/store';
import { makeReceipt, draftReview, readShot } from '@/lib/api';
import { prepareMic, speak } from '@/lib/voice';
import { ALL_MISSIONS } from '@/lib/progress';
import type { DraftEntry, Receipt, ShotMessage } from '@/lib/types';
import { play } from '@/lib/sound';
import { spend, refund, gate, requireTier } from '@/lib/plan';
import { liveAvailable } from '@/components/Conversation';
import { Display, Kicker, WAVE_ICON } from '@/components/Kit';
import { occasionFresh } from '@/lib/occasion';
import { faceFor } from '@/lib/faces';

const POISE_FACE = faceFor('poise');
const TO: [string, string][] = [['partner', 'Partner'], ['date', 'A date'], ['friend', 'Friend'], ['family', 'Family'], ['boss', 'Boss'], ['coworker', 'Coworker'], ['client', 'Client'], ['ex', 'Ex'], ['group', 'Group chat']];
const INTENT: [string, string][] = [['plan', 'Make a plan'], ['boundary', 'Set a boundary'], ['repair', 'Repair something'], ['ask', 'Ask directly'], ['light', 'Keep it light']];
const DAY = 86400000;

type Item = { at: string; kind: 'receipt'; r: Receipt; i: number } | { at: string; kind: 'call'; c: CallNote; i: number } | { at: string; kind: 'draft'; d: DraftEntry };

/**
 * Poise: the chat. Tell it what happened, ask anything, check a message before you send it, or call.
 * Everything Poise says lands in one thread: ledgers, answers, draft reads and the note after a call.
 */
export default function PoiseTab() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: string; mission?: string }>();
  const s = useStore();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<false | 'chat' | 'draft' | 'shot'>(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Record<string, 'said' | 'drill' | undefined>>({});
  const [menu, setMenu] = useState(false);
  // Before I send this
  const [drafting, setDrafting] = useState(params.mode === 'draft');
  const [to, setTo] = useState('');
  const [intent, setIntent] = useState('');
  const [outcome, setOutcome] = useState('');
  const [convo, setConvo] = useState<ShotMessage[] | null>(null);
  const [shotNote, setShotNote] = useState<{ confirm: boolean; note?: string | null } | null>(null);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, sampleRate: 22050, numberOfChannels: 1, bitRate: 64000 });
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const outcomeRef = useRef<TextInput>(null);
  const mission = ALL_MISSIONS.find((m) => m.id === (params.mission ?? ''));
  const context = mission ? `Field mission: ${mission.task}` : params.mode === 'debrief' ? 'Nightly debrief: one moment from today.' : '';
  const occ = occasionFresh(s.occasion) ? s.occasion : undefined;
  const live = liveAvailable();

  const [now] = useState(() => Date.now());
  const thread = useMemo<Item[]>(() => {
    const cut = now - 30 * DAY;
    const items: Item[] = [
      // receipts are newest first; very old ones have no date, so keep their order at the top
      ...s.receipts.map((r, i) => ({ at: r.createdAt ?? `0000-${String(99999 - i).padStart(5, '0')}`, kind: 'receipt' as const, r, i })),
      ...(s.callNotes ?? []).map((c, i) => ({ at: c.createdAt, kind: 'call' as const, c, i })),
      ...(s.drafts ?? []).filter((d) => Date.parse(d.createdAt) > cut).map((d) => ({ at: d.createdAt, kind: 'draft' as const, d })),
    ];
    return items.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  }, [s.receipts, s.callNotes, s.drafts, now]);

  // Opened with ?mode=draft (from Today or a link): start in Before I send this.
  const [seenMode, setSeenMode] = useState(params.mode);
  if (params.mode !== seenMode) {
    setSeenMode(params.mode);
    if (params.mode === 'draft') setDrafting(true);
  }

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 80);
  }, [thread.length, busy]);

  function closeDraft() {
    setDrafting(false);
    setTo('');
    setIntent('');
    setOutcome('');
    setConvo(null);
    setShotNote(null);
  }

  function startDraft(prefill?: string) {
    setMenu(false);
    setDrafting(true);
    if (prefill !== undefined) setText(prefill);
    setTimeout(() => input.current?.focus(), 120);
  }

  async function submitChat(audioUri?: string) {
    if (busy) return;
    if (!spend('poise')) {
      router.push({ pathname: '/paywall', params: { reason: 'poise' } });
      return;
    }
    setBusy('chat');
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
      if (e?.name !== 'PlanError') setErr(e?.message ?? 'Poise could not read that.');
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    if (busy) return;
    const draft = text.trim();
    if (!draft && !convo?.length) return;
    if (!spend('poise')) {
      router.push({ pathname: '/paywall', params: { reason: 'poise' } });
      return;
    }
    setBusy('draft');
    setErr('');
    play('select');
    try {
      const shot = convo?.filter((m) => m.text.trim()) ?? undefined;
      const read = await draftReview({ draft, convo: shot, to: to || undefined, intent: intent || undefined, outcome: outcome.trim() || undefined });
      const entry: DraftEntry = { id: `d_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), draft, convo: shot, to: to || undefined, intent: intent || undefined, outcome: outcome.trim() || undefined, read };
      const cut = Date.now() - 30 * DAY;
      s.set({ drafts: [...(s.drafts ?? []).filter((d) => Date.parse(d.createdAt) > cut), entry].slice(-30) });
      setText('');
      closeDraft();
      play('reveal');
    } catch (e: any) {
      refund('poise');
      if (e?.name !== 'PlanError') setErr(e?.message ?? 'Poise could not read that.');
    } finally {
      setBusy(false);
    }
  }

  async function addShot() {
    setMenu(false);
    setDrafting(true);
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
      if (pick.canceled || !pick.assets?.[0]?.uri) return;
      const uri = pick.assets[0].uri;
      setBusy('shot');
      setErr('');
      try {
        const out = await readShot(uri);
        setConvo(out.messages);
        setShotNote({ confirm: out.confirm, note: out.note });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } finally {
        try {
          new File(uri).delete(); // the picker's copy; the screenshot itself is never uploaded anywhere else
        } catch {}
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t read that screenshot.');
    } finally {
      setBusy(false);
    }
  }

  function call() {
    setMenu(false);
    if (gate('calls')) router.push('/poise-live');
  }

  async function toggleMic() {
    if (live) return call();
    if (!recording) {
      if (!(await prepareMic())) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRecording(true);
    } else {
      await recorder.stop();
      setRecording(false);
      submitChat(recorder.uri ?? undefined);
    }
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const canSend = drafting ? words >= 1 || !!convo?.length : words >= 3;
  const empty = thread.length === 0 && !context;

  const starters = [
    { k: 'draft', label: 'Before I send this', sub: 'Check a message first' },
    occ ? { k: 'ready', label: `Get ready: ${occ.what}`, sub: 'The look, and the first ten minutes' } : { k: 'occ', label: 'Something coming up', sub: 'Tell me once, practise it tonight' },
    { k: 'look', label: 'Help me choose a look', sub: 'What to wear, and why' },
    { k: 'read', label: 'Read what happened', sub: 'Where the aura went, beat by beat' },
  ];

  function menuPick(k: string) {
    if (k === 'draft') return startDraft();
    if (k === 'shot') return addShot();
    if (k === 'call') return call();
    setMenu(false);
    if (k === 'tribunal') return router.push('/tribunal');
    if (k === 'direct') return router.push('/direct');
    router.push('/occasion');
  }

  function starter(k: string) {
    if (k === 'draft') return startDraft();
    if (k === 'occ') return router.push('/occasion');
    const prefill = k === 'ready' && occ ? `Help me get ready for this: ${occ.what}.` : k === 'look' ? 'What should I wear to ' : 'Here’s what happened: ';
    setText(prefill);
    setTimeout(() => input.current?.focus(), 60);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: t.line }}>
          <Image source={POISE_FACE} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.card }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 26, color: t.ink }}>Poise</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 12.5, color: t.ink3 }}>{busy === 'chat' || busy === 'draft' ? 'Reading…' : 'Ask anything. Or call.'}</RNText>
          </View>
          <Pressable onPress={() => router.push('/missions')} hitSlop={8} accessibilityLabel="Field missions" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ICON.flag} size={16} color={t.ink} />
          </Pressable>
          {live ? (
            <Pressable onPress={call} hitSlop={8} accessibilityLabel="Call Poise" style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon d={WAVE_ICON} size={15} color={t.onAccent} stroke={2} />
              <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.onAccent }}>Call</RNText>
            </Pressable>
          ) : null}
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {empty && (
            <Animated.View entering={FadeIn.duration(500)} style={{ gap: 14, paddingTop: 6 }}>
              <Display text="What’s " em="on your mind?" size={36} />
              <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>Tell me what happened, ask me anything, or show me a message before you send it.{live ? ' Or call, and just talk.' : ''}</RNText>
              <View style={{ marginTop: 6 }}>
                {starters.map((x, i) => (
                  <Pressable key={x.k} onPress={() => { play('tap'); Haptics.selectionAsync(); starter(x.k); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line, opacity: pressed ? 0.6 : 1 })}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <RNText numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{x.label}</RNText>
                      <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{x.sub}</RNText>
                    </View>
                    <Icon d="M7 17L17 7M9 7h8v8" size={17} color={t.ink2} stroke={1.6} />
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          )}

          {thread.map((it) =>
            it.kind === 'receipt' ? (
              <Exchange
                key={`r-${it.r.receipt_no}-${it.i}`}
                r={it.r}
                open={open[it.r.receipt_no]}
                onOpen={(k) => setOpen((o) => ({ ...o, [it.r.receipt_no]: o[it.r.receipt_no] === k ? undefined : k }))}
                onReplay={() => router.push({ pathname: '/replay', params: { i: String(it.i) } })}
                onReceipt={() => router.push({ pathname: '/receipt', params: { i: String(it.i) } })}
              />
            ) : it.kind === 'call' ? (
              <CallNoteBubble key={`c-${it.c.createdAt}`} c={it.c} onPractise={() => router.push({ pathname: '/replay', params: { note: String(it.i) } })} />
            ) : (
              <DraftExchange
                key={it.d.id}
                d={it.d}
                onEdit={(txt) => {
                  setText(txt);
                  setDrafting(true);
                  setTo(it.d.to ?? '');
                  setIntent(it.d.intent ?? '');
                  setTimeout(() => input.current?.focus(), 100);
                }}
                onAnswer={() => {
                  setText(it.d.draft);
                  setConvo(it.d.convo ?? null);
                  setTo(it.d.to ?? '');
                  setIntent(it.d.intent ?? '');
                  setOutcome(it.d.outcome ?? '');
                  setDrafting(true);
                  setTimeout(() => outcomeRef.current?.focus(), 150);
                }}
              />
            ),
          )}

          {context ? (
            <Animated.View entering={FadeIn.duration(400)}>
              <PoiseBubble>
                <Label color={t.accent}>{mission ? 'Mission debrief' : 'Tonight’s debrief'}</Label>
                <Body style={{ marginTop: 4 }}>{mission ? `${mission.title}. How did it go? Tell me what you said and how they reacted.` : 'One moment from today. What happened, and what did you say?'}</Body>
              </PoiseBubble>
            </Animated.View>
          ) : null}

          {busy === 'chat' || busy === 'draft' ? (
            <Animated.View entering={FadeIn} style={{ alignSelf: 'flex-start' }}>
              <PoiseBubble>
                <Muted small>{busy === 'draft' ? 'Reading your message…' : 'Reading it…'}</Muted>
              </PoiseBubble>
            </Animated.View>
          ) : null}
          {err ? <Body small color={t.accent}>{err}</Body> : null}
        </ScrollView>

        {/* Before I send this: who it's to, what it should do, the conversation it answers. All optional. */}
        {drafting ? (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} style={{ borderTopWidth: 1, borderColor: t.line, backgroundColor: t.bg, paddingTop: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
              <Kicker color={t.accent}>Before I send this</Kicker>
              <Pressable onPress={closeDraft} hitSlop={10} accessibilityLabel="Close">
                <Icon d={ICON.close} size={13} color={t.ink2} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }} keyboardShouldPersistTaps="handled">
              {TO.map(([k, l]) => <SmallChip key={k} label={l} on={to === k} onPress={() => setTo(to === k ? '' : k)} />)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }} keyboardShouldPersistTaps="handled">
              {INTENT.map(([k, l]) => <SmallChip key={k} label={l} on={intent === k} onPress={() => setIntent(intent === k ? '' : k)} />)}
            </ScrollView>
            <View style={{ paddingHorizontal: 20 }}>
              <TextInput
                ref={outcomeRef}
                value={outcome}
                onChangeText={(v) => setOutcome(v.slice(0, 400))}
                placeholder={convo?.length && !text.trim() ? 'What do you want to say? (optional)' : 'Anything Poise should know (optional)'}
                placeholderTextColor={t.ink3}
                style={{ fontFamily: font.regular, fontSize: 14, color: t.ink, paddingVertical: 8, borderBottomWidth: 1, borderColor: t.line }}
              />
            </View>
            {busy === 'shot' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 }}>
                <ActivityIndicator size="small" color={t.accent} />
                <Muted small>Reading the screenshot…</Muted>
              </View>
            ) : convo ? (
              <ShotPreview msgs={convo} note={shotNote} onFlip={(i) => setConvo(convo.map((m, k) => (k === i ? { ...m, speaker: m.speaker === 'me' ? 'them' : 'me' } : m)))} onClear={() => { setConvo(null); setShotNote(null); }} />
            ) : null}
          </Animated.View>
        ) : null}

        {/* the + menu */}
        {menu ? (
          <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)} style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 6, paddingVertical: 4 }}>
            {[
              { k: 'draft', label: 'Before I send this', icon: ICON.send },
              { k: 'shot', label: 'Add a screenshot', icon: ICON.upload },
              { k: 'occ', label: occ ? 'Change what’s coming up' : 'Something coming up', icon: ICON.clock },
              { k: 'tribunal', label: 'Settle something with someone', icon: ICON.duel },
              { k: 'direct', label: 'Text Poise from Messages', icon: ICON.chat },
              ...(live ? [{ k: 'call', label: 'Call Poise', icon: WAVE_ICON }] : []),
            ].map((x, i) => (
              <Pressable key={x.k} onPress={() => { play('tap'); menuPick(x.k); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: t.line, opacity: pressed ? 0.6 : 1 })}>
                <Icon d={x.icon} size={17} color={t.ink2} />
                <RNText style={{ fontFamily: font.regular, fontSize: 15, color: t.ink }}>{x.label}</RNText>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}

        {/* composer */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, borderTopWidth: drafting ? 0 : 1, borderColor: t.line, backgroundColor: t.bg }}>
          <Pressable onPress={() => { play('tap'); setMenu(!menu); }} accessibilityLabel="More" style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}>
            <Icon d={menu ? ICON.close : 'M12 5v14M5 12h14'} size={menu ? 14 : 18} color={t.ink} />
          </Pressable>
          <View style={{ flex: 1, minHeight: 50, maxHeight: 150, borderRadius: 25, backgroundColor: t.card, borderWidth: 1, borderColor: drafting ? t.accent : t.line, paddingHorizontal: 18, justifyContent: 'center' }}>
            {recording ? (
              <Muted small>Listening… tap the square when you’re done.</Muted>
            ) : (
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                onFocus={() => setMenu(false)}
                multiline
                placeholder={drafting ? (convo?.length ? 'Your reply, or leave it empty for two options' : 'Paste the message you’re about to send') : 'What happened, or what do you want to know?'}
                placeholderTextColor={t.ink3}
                style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink, paddingVertical: 13 }}
              />
            )}
          </View>
          {canSend && !recording ? (
            <Pressable onPress={() => (drafting ? submitDraft() : submitChat())} disabled={!!busy} accessibilityLabel={drafting ? 'Read my message' : 'Send'} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
              <Icon d={ICON.send} size={20} color={t.onAccent} stroke={2.2} />
            </Pressable>
          ) : !drafting ? (
            <Pressable onPress={toggleMic} accessibilityLabel={live ? 'Call Poise' : recording ? 'Stop and send' : 'Tell it out loud'} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={recording ? ICON.stop : live ? WAVE_ICON : ICON.mic} size={20} color={t.onAccent} fill={recording ? t.onAccent : undefined} stroke={2} />
            </Pressable>
          ) : (
            <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: t.lineStrong, alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
              <Icon d={ICON.send} size={20} color={t.onAccent} stroke={2.2} />
            </View>
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

function MyBubble({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: t.accent, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
      {kicker ? <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.6, color: 'rgba(255,255,255,0.7)' }}>{kicker}</RNText> : null}
      {children}
    </View>
  );
}

function SmallChip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { play('tap'); Haptics.selectionAsync(); onPress(); }} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : 'transparent', justifyContent: 'center' }}>
      <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 13, color: t.ink }}>{label}</RNText>
    </Pressable>
  );
}

/** The screenshot, read back as who-said-what. Tap a name to swap it if Poise got the sides wrong. */
function ShotPreview({ msgs, note, onFlip, onClear }: { msgs: ShotMessage[]; note: { confirm: boolean; note?: string | null } | null; onFlip: (i: number) => void; onClear: () => void }) {
  const t = useTheme();
  return (
    <View style={{ marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: note?.confirm ? t.accent : t.line, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.ink }}>{note?.confirm ? 'Check who said what' : `The conversation · ${msgs.length} message${msgs.length === 1 ? '' : 's'}`}</RNText>
        <Pressable onPress={onClear} hitSlop={8}>
          <RNText style={{ fontFamily: font.regular, fontSize: 12.5, color: t.ink2 }}>Remove</RNText>
        </Pressable>
      </View>
      {note?.note ? <Muted small>{note.note}</Muted> : null}
      <ScrollView style={{ maxHeight: 132 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {msgs.slice(-8).map((m, k) => {
          const i = msgs.length - Math.min(8, msgs.length) + k;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              <Pressable onPress={() => onFlip(i)} hitSlop={6} style={{ width: 52 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1, color: m.speaker === 'unclear' ? t.accent : m.speaker === 'me' ? t.ink : t.ink3 }}>{m.speaker === 'me' ? 'ME' : m.speaker === 'them' ? (m.name ?? 'THEM').toUpperCase().slice(0, 7) : 'WHO?'}</RNText>
              </Pressable>
              <RNText numberOfLines={2} style={{ flex: 1, fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink2 }}>
                {m.text}
                {m.unclear?.length ? <RNText style={{ color: t.accent }}>{`  (unsure: ${m.unclear.join(', ')})`}</RNText> : null}
              </RNText>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CallNoteBubble({ c, onPractise }: { c: CallNote; onPractise: () => void }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
        <Icon d={WAVE_ICON} size={13} color={t.ink3} stroke={2} />
        <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: t.ink3 }}>
          CALL WITH POISE · {new Date(c.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toUpperCase()}
        </RNText>
      </View>
      <PoiseBubble>
        <Body style={{ fontSize: 16, lineHeight: 23 }}>{c.note}</Body>
        {c.next ? (
          <View style={{ marginTop: 12, backgroundColor: t.cardAlt, borderRadius: 14, padding: 14, gap: 4 }}>
            <Label>Next</Label>
            <Body small>{c.next}</Body>
          </View>
        ) : null}
        {c.scene ? (
          <Pressable onPress={onPractise} style={{ marginTop: 12, alignSelf: 'flex-start', backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, height: 38, justifyContent: 'center' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>Practise it live</RNText>
          </Pressable>
        ) : null}
      </PoiseBubble>
    </Animated.View>
  );
}

/** One draft read: what you'd send, how it reads, what to keep and change, two versions you can copy. */
function DraftExchange({ d, onEdit, onAnswer }: { d: DraftEntry; onEdit: (t: string) => void; onAnswer: () => void }) {
  const t = useTheme();
  const tone = useStore((st) => st.tone);
  const r = d.read;
  const both = !!(r.voices?.straight?.reads && r.voices?.unfiltered?.reads);
  const [voice, setVoice] = useState<'straight' | 'unfiltered'>(tone === 'unfiltered' ? 'unfiltered' : 'straight');
  const v = both ? r.voices![voice]! : { reads: r.reads, keep: r.keep, change: r.change };
  const [copied, setCopied] = useState<number | null>(null);
  const [why, setWhy] = useState(false);

  async function copy(i: number, txt: string) {
    await Clipboard.setStringAsync(txt);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
  }

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 12 }}>
      <MyBubble kicker={r.mode === 'reply' ? 'WHAT DO I SAY?' : 'BEFORE I SEND THIS'}>
        {d.draft ? (
          <Body color={t.onAccent} style={{ fontFamily: font.medium }}>{d.draft}</Body>
        ) : (
          <Body color={t.onAccent} style={{ fontFamily: font.medium }}>{`${d.convo?.length ?? 0} messages from a screenshot${d.outcome ? `. ${d.outcome}` : ''}`}</Body>
        )}
      </MyBubble>

      <PoiseBubble>
        <Body style={{ fontSize: 16, lineHeight: 23 }}>{v.reads}</Body>
        {v.keep ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent, width: 14 }}>+</RNText>
            <Body small style={{ flex: 1 }}>{v.keep}</Body>
          </View>
        ) : null}
        {v.change ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink, width: 14 }}>→</RNText>
            <Body small style={{ flex: 1 }}>{v.change}</Body>
          </View>
        ) : null}
        {r.observations.length ? (
          <Pressable onPress={() => setWhy(!why)} hitSlop={6} style={{ marginTop: 12 }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.ink2 }}>{why ? 'Hide the lines' : `The lines it’s about (${r.observations.length})`}</RNText>
          </Pressable>
        ) : null}
        {why ? (
          <View style={{ gap: 10, marginTop: 10 }}>
            {r.observations.map((o, i) => (
              <View key={i} style={{ gap: 2 }}>
                <RNText style={{ fontFamily: font.serifItalic, fontSize: 17, lineHeight: 22, color: t.ink }}>“{o.span}”</RNText>
                <Muted small>{o.note}</Muted>
              </View>
            ))}
          </View>
        ) : null}
        {both ? (
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: t.line, padding: 2, marginTop: 14 }}>
            {(['straight', 'unfiltered'] as const).map((k) => (
              <Pressable key={k} onPress={() => setVoice(k)} hitSlop={4} style={{ height: 26, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: voice === k ? t.accent : 'transparent' }}>
                <RNText style={{ fontFamily: voice === k ? font.medium : font.regular, fontSize: 11.5, color: voice === k ? t.onAccent : t.ink2 }}>{k === 'straight' ? 'Straight' : 'Unfiltered'}</RNText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </PoiseBubble>

      {r.alternatives.map((a, i) => (
        <View key={i} style={{ borderRadius: 20, borderWidth: 1, borderColor: i === 0 ? t.accent : t.line, backgroundColor: t.bg, padding: 14, gap: 8 }}>
          <Kicker color={i === 0 ? t.accent : undefined}>{r.send_as_is && i === 0 ? 'Send it as is' : a.label}</Kicker>
          <RNText selectable style={{ fontFamily: font.regular, fontSize: 15.5, lineHeight: 22, color: t.ink }}>{a.text}</RNText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Pressable onPress={() => copy(i, a.text)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: copied === i ? t.accentSoft : t.card, borderWidth: 1, borderColor: copied === i ? t.accent : t.line, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.ink }}>{copied === i ? 'Copied' : 'Copy'}</RNText>
            </Pressable>
            <Pressable onPress={() => onEdit(a.text)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: t.line, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink }}>Edit</RNText>
            </Pressable>
          </View>
        </View>
      ))}

      {r.preserve.length || r.uncertainty || r.clarify || r.next || r.note ? (
        <View style={{ gap: 6, paddingHorizontal: 4 }}>
          {r.preserve.length ? <Muted small>{`Kept as you wrote it: ${r.preserve.slice(0, 5).join(' · ')}`}</Muted> : null}
          {r.note ? <Muted small>{r.note}</Muted> : null}
          {r.uncertainty ? <Muted small>{r.uncertainty}</Muted> : null}
          {r.next ? <RNText style={{ fontFamily: font.medium, fontSize: 13.5, color: t.ink }}>{r.next}</RNText> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {r.clarify ? <ActionChip label={r.clarify.length > 44 ? 'Answer Poise’s question' : r.clarify} onPress={onAnswer} /> : null}
        {r.alternatives.length ? (
          <ActionChip
            label="Rehearse how it goes"
            onPress={() => {
              if (!requireTier('plus', 'rehearse')) return;
              const brief = `I'm about to send this${d.to ? ` to my ${d.to}` : ''}: "${r.alternatives[0].text}". ${d.convo?.length ? `Their last message: "${d.convo.filter((m) => m.speaker === 'them').slice(-1)[0]?.text ?? ''}". ` : ''}Play how they might reply in person or on a call.`;
              router.push({ pathname: '/rehearse', params: { brief } });
            }}
          />
        ) : null}
      </View>
      {r.clarify && r.clarify.length > 44 ? <Muted small style={{ marginTop: -4, paddingHorizontal: 4 }}>{r.clarify}</Muted> : null}
    </Animated.View>
  );
}

function ActionChip({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { play('tap'); Haptics.selectionAsync(); onPress(); }} style={{ paddingHorizontal: 14, minHeight: 38, paddingVertical: 8, borderRadius: 19, borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, justifyContent: 'center' }}>
      <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink }}>{label}</RNText>
    </Pressable>
  );
}

function Exchange({ r, open, onOpen, onReplay, onReceipt }: { r: Receipt; open?: 'said' | 'drill'; onOpen: (k: 'said' | 'drill') => void; onReplay: () => void; onReceipt: () => void }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 12 }}>
      <MyBubble>
        <Body color={t.onAccent} style={{ fontFamily: font.medium }}>{r.story}</Body>
      </MyBubble>

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

      {!r.advice && r.lines.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {r.said_instead ? <ActionChip label="What should I have said?" onPress={() => onOpen('said')} /> : null}
          <ActionChip label="Replay it as a roleplay" onPress={onReplay} />
          <ActionChip label="Make it a drill" onPress={() => onOpen('drill')} />
        </View>
      )}
    </Animated.View>
  );
}
