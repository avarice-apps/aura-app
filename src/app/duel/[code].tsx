import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Text as RNText, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Title, Body, Muted, Label, Button, IconButton, Icon, ICON, Card } from '@/ui';
import { TakeRecorder } from '@/components/TakeRecorder';
import { DuelResult } from '@/components/DuelResult';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { duelGet, duelAnswer } from '@/lib/api';
import { track } from '@/lib/analytics';
import { play } from '@/lib/sound';
import type { Duel } from '@/lib/types';

const TAKE_S = 45;

/** Join or view a duel by code: argue the other side, or see the verdict. */
export default function DuelByCode() {
  const t = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const s = useStore();
  const mine = (s.duels ?? []).find((x) => x.code === code?.toUpperCase());
  const [d, setD] = useState<Duel | null>(null);
  const [err, setErr] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(mine?.role === 'a' ? '' : s.name ?? '');

  const load = useCallback(() => {
    if (!code) return;
    duelGet(code)
      .then((x) => {
        setErr('');
        setD(x);
      })
      .catch((e) => setErr(e?.message ?? 'Couldn’t find that duel.'));
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  async function submit(uri: string) {
    if (!d) return;
    setRecording(false);
    setBusy(true);
    setErr('');
    try {
      const out = await duelAnswer({ code: d.code, videoUri: uri, name: name.trim() || undefined });
      setD(out);
      play('reveal');
      track('duel_judged', { topic: out.topic_id });
      if (!mine) s.set({ duels: [{ id: out.id, code: out.code, topic: out.topic, role: 'b' as const, createdAt: new Date().toISOString(), result: out.result }, ...(s.duels ?? [])].slice(0, 30) });
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t send your take.');
    } finally {
      setBusy(false);
    }
  }

  if (recording && d) {
    return <TakeRecorder seconds={TAKE_S} kicker={`Your side: ${d.side_b}`} title={d.topic} sub={`${d.name_a} already argued ${d.side_a}. Beat them.`} onDone={submit} onClose={() => setRecording(false)} />;
  }

  const me: 'a' | 'b' | undefined = mine?.role ?? (d?.status === 'done' ? 'b' : undefined);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ marginTop: 10, gap: 14 }}>
          {!d && !err ? <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} /> : null}
          {err ? (
            <Card style={{ gap: 8 }}>
              <Label>Duel {code}</Label>
              <Body>{err}</Body>
              <Button label="Try again" variant="secondary" onPress={load} />
            </Card>
          ) : null}
          {d && d.status === 'done' && d.result ? <DuelResult d={d} me={me} /> : null}
          {d && d.status === 'waiting' && mine?.role === 'a' ? (
            <>
              <Label color={t.accent}>Duel {d.code}</Label>
              <Title size={28}>Waiting on your opponent.</Title>
              <Muted small>They argue “{d.side_b}”. Pull down or tap below to check.</Muted>
              <Button label="Check again" variant="secondary" onPress={load} />
              <Button label="They’re here: pass the phone" onPress={() => setRecording(true)} />
            </>
          ) : null}
          {d && d.status === 'waiting' && mine?.role !== 'a' ? (
            <>
              <Label color={t.accent}>Debate Duel · {d.code}</Label>
              <Title size={28}>{d.name_a} challenged you.</Title>
              <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18, gap: 8 }}>
                <RNText style={{ fontFamily: font.medium, fontSize: 21, lineHeight: 26, color: '#FFF' }}>{d.topic}</RNText>
                <RNText style={{ fontFamily: font.regular, fontSize: 14, color: 'rgba(255,255,255,0.86)' }}>They argued “{d.side_a}”. You argue “{d.side_b}”. {TAKE_S} seconds.</RNText>
              </View>
              <Card style={{ gap: 8 }}>
                <Label>Your name on the verdict</Label>
                <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 15, color: t.ink, paddingVertical: 6 }} />
              </Card>
              <Button label={busy ? 'Poise is judging…' : 'Record my side'} disabled={busy} onPress={() => setRecording(true)} />
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
