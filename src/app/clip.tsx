import React, { useState } from 'react';
import { View, ScrollView, TextInput, Share, Linking, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, IconButton, Icon, ICON, Card, ArtCard, OnBlue, Row } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { rateMoment } from '@/lib/api';
import type { Moment } from '@/lib/types';
import { play } from '@/lib/sound';
import { spend, refund } from '@/lib/plan';
import { track } from '@/lib/analytics';

/** Rate a Clip: any moment from your camera roll, replayed beat by beat for aura gained and lost. */
export default function Clip() {
  const t = useTheme();
  const s = useStore();
  const [uri, setUri] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [m, setM] = useState<Moment | null>(null);

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr('Kleos needs photo access to pick that. Turn it on in Settings › Kleos › Photos.');
      if (!perm.canAskAgain) Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 90, quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    setUri(res.assets[0].uri);
    setErr('');
  }

  async function rate() {
    if (!spend('clips')) {
      router.push({ pathname: '/paywall', params: { reason: 'clips' } });
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await rateMoment({ videoUri: uri, note: note.trim() || undefined });
      setM(r);
      track('clip_rated', { total: r.total });
      s.set({ moments: [{ ...r, createdAt: new Date().toISOString() }, ...(s.moments ?? [])].slice(0, 30) });
      play('reveal');
    } catch (e: any) {
      refund('clips');
      setErr(e?.message ?? 'Poise couldn’t read that clip.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        {!m ? (
          <View style={{ gap: 16, marginTop: 10 }}>
            <ArtCard art="man" height={260} focus="top">
              <OnBlue kicker="Rate a clip" sub="Any moment. Yours or your boy's. Poise replays it beat by beat and tells you where the aura went.">Was that a fumble?</OnBlue>
            </ArtCard>
            <Card style={{ gap: 10 }}>
              <Label>The clip</Label>
              {uri ? <Body small>Clip ready. {busy ? 'Reading it…' : ''}</Body> : <Muted small>Up to 90 seconds from your camera roll.</Muted>}
              <Button label={uri ? 'Choose a different clip' : 'Choose a clip'} variant="secondary" onPress={pick} icon={<Icon d={ICON.upload} size={16} color={t.ink} />} />
            </Card>
            <Card style={{ gap: 8 }}>
              <Label>Context (optional)</Label>
              <TextInput value={note} onChangeText={setNote} placeholder="e.g. my friend's best man speech" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 15, color: t.ink, paddingVertical: 6 }} />
            </Card>
            {err ? <Body small color={t.accent}>{err}</Body> : null}
            <Button label={busy ? 'Replaying it…' : 'Rate it'} disabled={!uri || busy} onPress={rate} />
            <Muted small align="center">Rates what happened, never anyone’s looks. The clip is deleted right after.</Muted>
          </View>
        ) : (
          <MomentCard m={m} onAgain={() => { setM(null); setUri(''); setNote(''); }} />
        )}
      </ScrollView>
    </Screen>
  );
}

function MomentCard({ m, onAgain }: { m: Moment; onAgain: () => void }) {
  const t = useTheme();
  const pos = m.total >= 0;
  return (
    <View style={{ gap: 12, marginTop: 10 }}>
      <Animated.View entering={FadeInDown.duration(450)} style={{ borderRadius: 24, backgroundColor: t.accent, padding: 20, gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>AURA REPLAY</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>{m.tier.toUpperCase()}</RNText>
        </Row>
        <RNText style={{ fontFamily: font.medium, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: '#FFF' }}>{m.title}</RNText>
        <View style={{ gap: 0 }}>
          {m.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
              <RNText style={{ width: 34, fontFamily: font.mono, fontSize: 11, color: 'rgba(255,255,255,0.65)', paddingTop: 2 }}>{l.t}</RNText>
              <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: '#FFF' }}>{l.text}</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 13, color: '#FFF' }}>{l.points > 0 ? '+' : ''}{l.points}</RNText>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 15, color: '#FFF' }}>Total</RNText>
            <RNText style={{ fontFamily: font.medium, fontSize: 22, color: '#FFF' }}>{pos ? '+' : ''}{m.total} aura</RNText>
          </View>
        </View>
        <RNText style={{ fontFamily: font.serifItalic, fontSize: 21, lineHeight: 26, color: '#FFF' }}>“{m.caption}”</RNText>
      </Animated.View>
      <Card style={{ gap: 6 }}>
        <Label>The call</Label>
        <Body>{m.verdict}</Body>
      </Card>
      <Card style={{ gap: 6 }}>
        <Label color={t.accent}>What would have saved it</Label>
        <Body>{m.what_to_do}</Body>
        {m.said_instead ? <Muted small>Could have said: “{m.said_instead}”</Muted> : null}
      </Card>
      <Button label="Share the replay" onPress={() => Share.share({ message: `${m.title}: ${m.total > 0 ? '+' : ''}${m.total} aura. “${m.caption}” Rated by Kleos.` })} />
      <Button label="Rate another" variant="secondary" onPress={onAgain} />
    </View>
  );
}
