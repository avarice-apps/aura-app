import React, { useRef } from 'react';
import { View, ScrollView, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Screen, Button, IconButton, Icon, ICON, Row, Body, Muted, Card, Label, Num } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';

const PAPER = '#F6F4EF';
const INK = '#141416';

/** Aura Receipt: the share card. Paper and mono, deliberately unlike the rest of the app so it pops in a feed. */
export default function ReceiptScreen() {
  const t = useTheme();
  const { i, kind } = useLocalSearchParams<{ i?: string; kind?: string }>();
  const receipts = useStore((s) => s.receipts);
  const ob = useStore((s) => s.ob);
  const shot = useRef<any>(null);

  async function share() {
    try {
      const uri = await (shot.current as any)?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
    } catch {}
  }

  const r = kind === 'compare' ? null : receipts[Number(i ?? 0)];

  return (
    <Screen edges={['top', 'bottom']} bg="#1A1B2E">
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton label="Close" onPress={() => router.back()}><Icon d={ICON.close} size={16} /></IconButton>
      </Row>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 20 }}>
        <ViewShot ref={shot} options={{ format: 'png', quality: 1 }}>
          <Animated.View entering={FadeInDown.duration(500)} style={{ width: 320, backgroundColor: PAPER, padding: 22, transform: [{ rotate: '-1.2deg' }], gap: 10 }}>
            {r ? (
              <>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <RNText style={{ fontFamily: font.monoMedium, fontSize: 20, letterSpacing: 6, color: INK }}>AURA</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: '#5E5B56' }}>RECEIPT NO. {r.receipt_no}</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 10, color: '#5E5B56' }}>{r.title.toUpperCase()}</RNText>
                </View>
                <Dash />
                {r.lines.map((l, k) => (
                  <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <RNText style={{ fontFamily: font.mono, fontSize: 12, color: INK, flex: 1 }}>{l.text}</RNText>
                    <RNText style={{ fontFamily: font.mono, fontSize: 12, color: INK }}>{l.points > 0 ? '+' : ''}{l.points}</RNText>
                  </View>
                ))}
                <Dash />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <RNText style={{ fontFamily: font.monoMedium, fontSize: 15, color: INK }}>TOTAL</RNText>
                  <RNText style={{ fontFamily: font.monoMedium, fontSize: 15, color: INK }}>{r.total > 0 ? '+' : ''}{r.total} AURA</RNText>
                </View>
                <Dash />
                <RNText style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 16, color: '#3F3C38' }}>NOTE FROM POISE{'\n'}{r.headline} Next time: {r.next_time}</RNText>
                <Barcode />
                <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, color: '#5E5B56', textAlign: 'center' }}>GET YOUR RECEIPT · AURA</RNText>
              </>
            ) : ob.first && ob.second ? (
              <>
                <RNText style={{ fontFamily: font.monoMedium, fontSize: 20, letterSpacing: 6, color: INK, textAlign: 'center' }}>AURA</RNText>
                <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: '#5E5B56', textAlign: 'center' }}>ONE CHANGE · TWO TAKES</RNText>
                <Dash />
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 10 }}>
                  <Num value={ob.first.rating} size={34} color="#8A867F" />
                  <RNText style={{ fontFamily: font.mono, fontSize: 14, color: INK }}>→</RNText>
                  <Num value={ob.second.rating} size={64} color={INK} />
                </View>
                <RNText style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 16, color: '#3F3C38' }}>THE CHANGE{'\n'}{ob.first.change.text}</RNText>
                <Dash />
                <RNText style={{ fontFamily: font.mono, fontSize: 11, color: INK }}>HEDGES {ob.first.counts.hedges} → {ob.second.counts.hedges}   FILLERS {ob.first.counts.fillers} → {ob.second.counts.fillers}</RNText>
                <Barcode />
                <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, color: '#5E5B56', textAlign: 'center' }}>TRY THIS SITUATION · AURA</RNText>
              </>
            ) : null}
          </Animated.View>
        </ViewShot>
        {r ? (
          <Card style={{ width: 320, marginTop: 24, gap: 6 }}>
            <Label>Practice it</Label>
            <Body small>{r.drill}</Body>
          </Card>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button label="Share the receipt" variant="light" onPress={share} icon={<Icon d={ICON.share} size={16} color={t.inverse} />} />
        <Muted small align="center" style={{ marginTop: 8 }} color="#B4B6E0">Shares the card only. Never your recording.</Muted>
      </View>
    </Screen>
  );
}

function Dash() {
  return <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#8A867F' }} />;
}

function Barcode() {
  const bars = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2];
  return (
    <View style={{ flexDirection: 'row', gap: 2, height: 32, justifyContent: 'center', marginTop: 4 }}>
      {bars.map((w, i) => (
        <View key={i} style={{ width: w, backgroundColor: INK }} />
      ))}
    </View>
  );
}
