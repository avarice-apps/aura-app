import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { Display, Kicker, Pill, Chip } from '@/components/Kit';
import { tribunalCreate, type TribunalFormat } from '@/lib/api';
import { track } from '@/lib/analytics';
import DUELS from '../../../content/duels.json';

const FORMATS: { k: TribunalFormat; label: string; sub: string }[] = [
  { k: 'settle', label: 'Settle it', sub: 'Poise judges the argument' },
  { k: 'tribunal', label: 'The Tribunal', sub: 'Same judgement, read out like a court' },
  { k: 'common', label: 'Find the disagreement', sub: 'No winner. What you each need, and a way forward' },
];

/** Start a Tribunal: a topic, a format, your side. Then send the code. */
export default function NewTribunal() {
  const t = useTheme();
  const s = useStore();
  const { topic: preset } = useLocalSearchParams<{ topic?: string }>();
  const [format, setFormat] = useState<TribunalFormat>('settle');
  const [topic, setTopic] = useState((preset ?? '').slice(0, 160));
  const [side, setSide] = useState('');
  const [name, setName] = useState(s.name || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ideas] = useState(() => [...(DUELS.topics as { topic: string }[])].sort(() => 0.5 - Math.random()).slice(0, 4));
  const ok = topic.trim().length >= 6 && name.trim().length >= 1;

  async function create() {
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    try {
      const v = await tribunalCreate({ format, topic: topic.trim(), name: name.trim(), side: side.trim() || undefined });
      s.set({ tribunals: [{ code: v.code, topic: v.topic, createdAt: new Date().toISOString() }, ...(s.tribunals ?? [])].slice(0, 20) });
      track('tribunal_create', { format });
      router.replace({ pathname: '/tribunal/[code]', params: { code: v.code, fresh: '1' } });
    } catch (e: any) {
      if (e?.name !== 'PlanError') setErr(e?.message ?? 'Couldn’t start it. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const field = { fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: t.ink, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.line } as const;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ICON.close} size={15} color={t.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
            <Kicker>Tribunal · two people, in writing</Kicker>
            <Display text="Settle " em="something." size={44} />
            <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>You each write an opening, then one reply. Poise reads it both ways round and rules on the writing. Draws allowed.</RNText>
          </Animated.View>

          <View style={{ marginTop: 22 }}>
            {FORMATS.map((f, i) => {
              const on = format === f.k;
              return (
                <Pressable key={f.k} onPress={() => setFormat(f.k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 1.5, borderColor: on ? t.accent : t.lineStrong }} />
                  <View style={{ flex: 1 }}>
                    <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{f.label}</RNText>
                    <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{f.sub}</RNText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 22, gap: 20 }}>
            <View>
              <Kicker>What are you settling?</Kicker>
              <TextInput value={topic} onChangeText={(v) => setTopic(v.slice(0, 160))} placeholder="Whoever cooks shouldn’t do the dishes" placeholderTextColor={t.ink3} multiline style={field} />
              {!topic ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {ideas.map((x) => <Chip key={x.topic} label={x.topic.length > 38 ? x.topic.slice(0, 36) + '…' : x.topic} onPress={() => setTopic(x.topic)} />)}
                </View>
              ) : null}
            </View>
            {format !== 'common' ? (
              <View>
                <Kicker>Your side (optional)</Kicker>
                <TextInput value={side} onChangeText={(v) => setSide(v.slice(0, 60))} placeholder="It does / It doesn’t" placeholderTextColor={t.ink3} style={field} />
              </View>
            ) : null}
            <View>
              <Kicker>Your name, as they’ll see it</Kicker>
              <TextInput value={name} onChangeText={(v) => setName(v.slice(0, 24))} placeholder="Name" placeholderTextColor={t.ink3} style={field} />
            </View>
          </View>
          {err ? <RNText style={{ marginTop: 16, fontFamily: font.regular, fontSize: 14, color: t.accent }}>{err}</RNText> : null}
          <RNText style={{ marginTop: 18, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>Only the two of you (and anyone you invite to watch) can see it. Nothing from your chats with Poise is used. Deleted after 30 days.</RNText>
        </ScrollView>
        <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
          <Pill label={busy ? 'Opening the court…' : 'Get the invite code'} onPress={create} disabled={!ok || busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
