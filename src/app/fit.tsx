import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, Linking, Share, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Body, Muted, Label, Button, IconButton, Icon, ICON, Card, Row, Bar } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { readFit } from '@/lib/api';
import type { FitRead, Swatch } from '@/lib/types';
import { play } from '@/lib/sound';
import { spend, refund, useTier } from '@/lib/plan';
import { track } from '@/lib/analytics';

/** Fit check: the honest read of an outfit, from the camera or a photo. The share card carries the photo. */
export default function FitScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ uri?: string; paid?: string; pick?: string }>();
  const [uri, setUri] = useState(params.uri ? String(params.uri) : '');
  const [r, setR] = useState<FitRead | null>(null);
  const [err, setErr] = useState('');
  const started = useRef(false);

  async function read(u: string, paid: boolean) {
    if (!paid && !spend('fits')) {
      router.replace({ pathname: '/paywall', params: { reason: 'fits' } });
      return;
    }
    setErr('');
    setR(null);
    try {
      const out = await readFit(u);
      setR(out);
      play('reveal');
      track('fit_rated', { score: out.score });
      const st = useStore.getState();
      st.set({ fits: [{ ...out, createdAt: new Date().toISOString() }, ...(st.fits ?? [])].slice(0, 30) });
    } catch (e: any) {
      refund('fits');
      setErr(e?.message ?? 'Poise couldn’t read that fit.');
    }
  }

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr('Kleos needs photo access to pick that. Turn it on in Settings › Kleos › Photos.');
      if (!perm.canAskAgain) Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets[0]) {
      if (!uri) router.back();
      return;
    }
    setUri(res.assets[0].uri);
    read(res.assets[0].uri, false);
  }

  useEffect(() => {
    // Deferred a tick (and cancelled on unmount) so it runs once, also under React's double-mount in development.
    const id = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      if (params.pick === '1') pick();
      else if (uri) read(uri, params.paid === '1');
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        {r ? (
          <Result r={r} uri={uri} />
        ) : (
          <View style={{ marginTop: 12, gap: 16 }}>
            {uri ? <Image source={{ uri }} style={{ aspectRatio: 4 / 5, borderRadius: 26, backgroundColor: t.cardAlt }} contentFit="cover" /> : null}
            {err ? (
              <>
                <Body color={t.accent}>{err}</Body>
                {uri ? <Button label="Try again" onPress={() => read(uri, false)} /> : null}
                <Button label="Take another" variant="secondary" onPress={() => router.replace({ pathname: '/capture', params: { mode: 'fit' } })} />
              </>
            ) : uri ? (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6, color: t.accent }}>FIT CHECK</RNText>
                <RNText style={{ fontFamily: font.serif, fontSize: 30, color: t.ink }}>Reading the fit…</RNText>
                <Muted small align="center">Fit, proportion, colour, what it says. A few seconds.</Muted>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Result({ r, uri }: { r: FitRead; uri: string }) {
  const t = useTheme();
  const tier = useTier();
  const shot = useRef<any>(null);
  async function shareCard() {
    track('share', { what: 'fit_card' });
    try {
      const u = await shot.current?.capture?.();
      if (u && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(u, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Fit check' });
        return;
      }
    } catch {}
    Share.share({ message: `Fit check: ${r.score} (${r.tier}). “${r.verdict}” Rated by Kleos.` });
  }
  const c = r.colouring;
  return (
    <View style={{ gap: 12, marginTop: 10 }}>
      <Animated.View entering={FadeInDown.duration(450)}>
        <ViewShot ref={shot} options={{ format: 'png', quality: 1 }}>
          <FitCard r={r} uri={uri} />
        </ViewShot>
      </Animated.View>

      <View style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18, gap: 6 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>THE HONEST VERSION</RNText>
        <RNText style={{ fontFamily: font.serifItalic, fontSize: 22, lineHeight: 28, color: '#FFF' }}>{r.roast}</RNText>
      </View>

      <Card style={{ paddingVertical: 4 }}>
        {r.pieces.map((p, i) => (
          <View key={`${p.item}${i}`} style={{ paddingVertical: 12, gap: 6, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{p.item}</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent }}>{p.score}</RNText>
            </Row>
            <Bar value={p.score} />
            <Body small color={t.ink2}>{p.note}</Body>
          </View>
        ))}
      </Card>

      {r.works?.length ? (
        <Card style={{ gap: 6 }}>
          <Label>What works</Label>
          {r.works.map((w, i) => <Body key={i} small>{w}</Body>)}
        </Card>
      ) : null}

      <Card style={{ gap: 8 }}>
        <Label color={t.accent}>Fix it, in this order</Label>
        {r.fixes.map((f, i) => (
          <Row key={i} gap={10} style={{ alignItems: 'flex-start' }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent, width: 14 }}>{i + 1}</RNText>
            <Body small style={{ flex: 1 }}>{f}</Body>
          </Row>
        ))}
      </Card>

      {c ? (
        <Card style={{ gap: 10 }}>
          <Label>Your colours</Label>
          <Body small color={t.ink2}>{c.read}</Body>
          <Swatches label="Wear" list={c.wear} />
          <Swatches label="Avoid" list={c.avoid} />
        </Card>
      ) : null}

      {r.buy?.length ? (
        <Card style={{ gap: 8 }}>
          <Label>Worth adding</Label>
          {r.buy.map((b, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Body small strong>{b.piece}</Body>
              <Muted small>{b.why}</Muted>
            </View>
          ))}
        </Card>
      ) : null}

      <Button label="Share the card" onPress={shareCard} icon={<Icon d={ICON.share} size={16} color="#fff" />} />
      <Button label={tier === 'black' ? 'Build tomorrow’s fit from my wardrobe' : 'Build fits from your own wardrobe'} variant="secondary" onPress={() => router.push('/wardrobe')} />
      <Button label="Rate another fit" variant="ghost" onPress={() => router.replace({ pathname: '/capture', params: { mode: 'fit' } })} />
    </View>
  );
}

function Swatches({ label, list }: { label: string; list: Swatch[] }) {
  const t = useTheme();
  if (!list?.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.3, color: t.ink3 }}>{label.toUpperCase()}</RNText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {list.map((s) => (
          <View key={s.name + s.hex} style={{ alignItems: 'center', gap: 4, width: 56 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: s.hex, borderWidth: 1, borderColor: t.line }} />
            <RNText numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 10.5, color: t.ink2, textAlign: 'center' }}>{s.name}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The share card: the photo itself, framed like a magazine page. Same look in light and dark mode. */
function FitCard({ r, uri }: { r: FitRead; uri: string }) {
  return (
    <View style={{ aspectRatio: 4 / 5, borderRadius: 26, overflow: 'hidden', backgroundColor: '#0B0B12' }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.82)']} locations={[0, 0.22, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <RNText style={{ fontFamily: font.serif, fontSize: 26, color: '#FFF' }}>Kleos</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.6, color: 'rgba(255,255,255,0.85)' }}>FIT CHECK</RNText>
        </View>
        <View style={{ gap: 8 }}>
          {r.lane ? <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: 'rgba(255,255,255,0.8)' }}>{r.lane.toUpperCase()}</RNText> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 88, lineHeight: 88, color: '#FFF' }}>{r.score}</RNText>
            <RNText numberOfLines={2} style={{ fontFamily: font.serif, fontSize: 26, lineHeight: 30, color: '#FFF', flex: 1, paddingBottom: 8 }}>{r.tier}</RNText>
          </View>
          <RNText numberOfLines={2} style={{ fontFamily: font.serifItalic, fontSize: 20, lineHeight: 25, color: '#FFF' }}>{`“${r.verdict}”`}</RNText>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {(r.colouring?.wear ?? []).slice(0, 5).map((s) => <View key={s.hex + s.name} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.hex, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }} />)}
            </View>
            <RNText style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.1, color: 'rgba(255,255,255,0.75)' }}>JOINKLEOS.COM</RNText>
          </View>
        </View>
      </View>
    </View>
  );
}
