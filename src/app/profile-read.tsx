import React, { useRef, useState } from 'react';
import { View, ScrollView, TextInput, Share, Linking, StyleSheet, Text as RNText } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, IconButton, Icon, ICON, Card, ArtCard, OnBlue, Row, Bar } from '@/ui';
import { font, useTheme, ART } from '@/theme';
import { useStore } from '@/state/store';
import { readProfile } from '@/lib/api';
import type { ProfileRead } from '@/lib/types';
import { play } from '@/lib/sound';
import { spend, refund } from '@/lib/plan';
import { track } from '@/lib/analytics';

/** Profile Read: screenshots of your Instagram, read the way a stranger would in five seconds. */
export default function ProfileReadScreen() {
  const t = useTheme();
  const s = useStore();
  const [uris, setUris] = useState<string[]>([]);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [r, setR] = useState<ProfileRead | null>(null);

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr('Kleos needs photo access to pick that. Turn it on in Settings › Kleos › Photos.');
      if (!perm.canAskAgain) Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.8, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
    if (res.canceled) return;
    setUris(res.assets.map((a) => a.uri).slice(0, 6));
    setErr('');
  }

  async function go() {
    if (!spend('profiles')) {
      router.push({ pathname: '/paywall', params: { reason: 'profiles' } });
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const out = await readProfile({ uris, handle: handle.trim() || undefined });
      setR(out);
      track('profile_read', { score: out.score });
      s.set({ profileReads: [{ ...out, createdAt: new Date().toISOString() }, ...(s.profileReads ?? [])].slice(0, 20) });
      play('reveal');
    } catch (e: any) {
      refund('profiles');
      setErr(e?.message ?? 'Poise couldn’t read those screenshots.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        {!r ? (
          <View style={{ gap: 16, marginTop: 10 }}>
            <ArtCard art="dora" height={260} focus="top">
              <OnBlue kicker="Profile read" sub="Screenshot your Instagram: the top of the profile, the grid, a post or two with captions. Poise reads it like a stranger would.">What does your page say?</OnBlue>
            </ArtCard>
            <Card style={{ gap: 10 }}>
              <Label>Screenshots</Label>
              {uris.length ? (
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {uris.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 52, height: 92, borderRadius: 8, backgroundColor: t.cardAlt }} contentFit="cover" />)}
                </Row>
              ) : (
                <Muted small>Up to six. The profile header matters most.</Muted>
              )}
              <Button label={uris.length ? 'Choose again' : 'Choose screenshots'} variant="secondary" onPress={pick} icon={<Icon d={ICON.upload} size={16} color={t.ink} />} />
            </Card>
            <Card style={{ gap: 8 }}>
              <Label>Handle (optional)</Label>
              <TextInput value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="@yourhandle" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 15, color: t.ink, paddingVertical: 6 }} />
              <Muted small>Kleos can’t open Instagram for you. Instagram blocks that, so screenshots are the way.</Muted>
            </Card>
            {err ? <Body small color={t.accent}>{err}</Body> : null}
            <Button label={busy ? 'Reading your page…' : 'Read my profile'} disabled={!uris.length || busy} onPress={go} />
            <Muted small align="center">Rates choices and presentation, never your face or body. Screenshots aren’t stored.</Muted>
          </View>
        ) : (
          <Result r={r} handle={handle.trim()} onAgain={() => { setR(null); setUris([]); }} />
        )}
      </ScrollView>
    </Screen>
  );
}

function Result({ r, handle, onAgain }: { r: ProfileRead; handle: string; onAgain: () => void }) {
  const t = useTheme();
  const shot = useRef<any>(null);
  async function shareCard() {
    track('share', { what: 'profile_card' });
    try {
      const uri = await shot.current?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Your profile read' });
        return;
      }
    } catch {}
    Share.share({ message: `My Instagram aura: ${r.score} (${r.tier}). “${r.verdict || r.first_impression}” Read by Kleos.` });
  }
  return (
    <View style={{ gap: 12, marginTop: 10 }}>
      <Animated.View entering={FadeInDown.duration(450)}>
        <ViewShot ref={shot} options={{ format: 'png', quality: 1 }}>
          <ProfileCard r={r} handle={handle} />
        </ViewShot>
      </Animated.View>
      <Body small color={t.ink2}>{r.first_impression}</Body>
      <Card style={{ paddingVertical: 4 }}>
        {r.parts.map((p, i) => (
          <View key={p.part} style={{ paddingVertical: 12, gap: 6, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{p.part}</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent }}>{p.score}</RNText>
            </Row>
            <Bar value={p.score} />
            <Body small color={t.ink2}>{p.note}</Body>
            <Body small><RNText style={{ fontFamily: font.semibold }}>Fix: </RNText>{p.fix}</Body>
          </View>
        ))}
      </Card>
      {r.bio_rewrite ? (
        <Card style={{ gap: 6 }}>
          <Label color={t.accent}>A better bio</Label>
          <Body>{r.bio_rewrite}</Body>
        </Card>
      ) : null}
      {r.caption_rewrite ? (
        <Card style={{ gap: 6 }}>
          <Label>Caption, before and after</Label>
          <Muted small>{r.caption_rewrite.before}</Muted>
          <Body>{r.caption_rewrite.after}</Body>
        </Card>
      ) : null}
      <Card style={{ gap: 8 }}>
        <Label>Do these three, in order</Label>
        {r.fixes.map((f, i) => (
          <Row key={i} gap={10} style={{ alignItems: 'flex-start' }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent, width: 14 }}>{i + 1}</RNText>
            <Body small style={{ flex: 1 }}>{f}</Body>
          </Row>
        ))}
      </Card>
      {r.song ? (
        <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18, gap: 4 }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>YOUR PAGE SOUNDS LIKE</RNText>
          <RNText style={{ fontFamily: font.medium, fontSize: 20, color: '#FFF' }}>{r.song.title}</RNText>
          <RNText style={{ fontFamily: font.regular, fontSize: 14, color: 'rgba(255,255,255,0.86)' }}>{r.song.artist} · {r.song.why}</RNText>
        </View>
      ) : null}
      <Button label="Share the card" onPress={shareCard} icon={<Icon d={ICON.share} size={16} color="#fff" />} />
      <Button label="Read again" variant="secondary" onPress={onAgain} />
    </View>
  );
}


const BLUE = '#1608F2';
const W = 'rgba(255,255,255,';

/** The share card: built to be screenshotted into a story. Fixed brand colours, so it looks the same in dark mode. */
function ProfileCard({ r, handle }: { r: ProfileRead; handle: string }) {
  const parts = (r.parts ?? []).slice(0, 4);
  return (
    <View style={{ aspectRatio: 4 / 5, borderRadius: 26, overflow: 'hidden', backgroundColor: BLUE }}>
      <Image source={ART.lisa} style={[StyleSheet.absoluteFill, { bottom: '38%' }]} contentFit="cover" contentPosition={{ top: '22%', left: '50%' }} />
      <LinearGradient pointerEvents="none" colors={['rgba(22,8,242,0.15)', 'rgba(22,8,242,0.55)', BLUE]} locations={[0, 0.38, 0.62]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.6, color: '#FFF' }}>KLEOS · PROFILE READ</RNText>
          {handle ? <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, color: `${W}0.8)` }}>{(handle.startsWith('@') ? handle : `@${handle}`).toUpperCase().slice(0, 24)}</RNText> : null}
        </View>
        <View style={{ gap: 10 }}>
          {r.lane ? <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: `${W}0.78)` }}>{r.lane.toUpperCase()}</RNText> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 92, lineHeight: 92, color: '#FFF' }}>{r.score}</RNText>
            <RNText style={{ fontFamily: font.serif, fontSize: 28, lineHeight: 34, color: '#FFF', flex: 1, paddingBottom: 8 }} numberOfLines={2}>{r.tier}</RNText>
          </View>
          <RNText style={{ fontFamily: font.serifItalic, fontSize: 21, lineHeight: 26, color: '#FFF' }} numberOfLines={3}>{`“${r.verdict || r.first_impression}”`}</RNText>
          <View style={{ gap: 7, marginTop: 4 }}>
            {parts.map((p) => (
              <View key={p.part} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.2, color: `${W}0.82)`, width: 104 }} numberOfLines={1}>{p.part.toUpperCase()}</RNText>
                <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: `${W}0.22)`, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.max(0, Math.min(100, p.score))}%`, height: 3, backgroundColor: '#FFF' }} />
                </View>
                <RNText style={{ fontFamily: font.mono, fontSize: 10, color: '#FFF', width: 22, textAlign: 'right' }}>{p.score}</RNText>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 }}>
            {r.song ? <RNText style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.1, color: `${W}0.75)`, flex: 1 }} numberOfLines={1}>{`SOUNDS LIKE · ${r.song.title} — ${r.song.artist}`.toUpperCase()}</RNText> : <View style={{ flex: 1 }} />}
            <RNText style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.1, color: `${W}0.75)`, marginLeft: 10 }}>JOINKLEOS.COM</RNText>
          </View>
        </View>
      </View>
    </View>
  );
}
