import React from 'react';
import { View, Text as RNText, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import { font, useTheme } from '@/theme';
import type { LabMeasure } from '@/lib/types';

const OUT = '#D9480F'; // out of band: one warm signal colour, used sparingly

/**
 * The lab report: every number measured from the take, each against the band it's judged by, with what it means.
 * Bands from published research are marked; the rest are Kleos's working ranges. Nothing here is a model's opinion.
 */
export function LabPanel({ measures, previous }: { measures: LabMeasure[]; previous?: LabMeasure[] }) {
  const t = useTheme();
  if (!measures.length) return null;
  const inBand = measures.filter((m) => m.status === 'in').length;
  const prev = new Map((previous ?? []).map((m) => [m.key, m]));
  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 18 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.8, color: t.ink3 }}>THE MEASUREMENTS</RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.2, color: t.ink2 }}>{`${inBand} OF ${measures.length} IN RANGE`}</RNText>
      </View>
      <RNText style={{ paddingHorizontal: 18, marginTop: 6, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: t.ink3 }}>
        Measured from your take, not judged. Ranges marked ◆ come from published research; the rest are Kleos working ranges.
      </RNText>
      <View style={{ marginTop: 8 }}>
        {measures.map((m, i) => (
          <Animated.View key={m.key} entering={FadeIn.duration(300).delay(60 * i)}>
            <Row m={m} prev={prev.get(m.key)} first={i === 0} />
          </Animated.View>
        ))}
      </View>
      <Pressable onPress={() => router.push('/mirror/methods')} hitSlop={8} style={{ paddingHorizontal: 18, paddingTop: 12 }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 13.5, color: t.accent }}>How Kleos measures →</RNText>
      </Pressable>
    </View>
  );
}

function Row({ m, prev, first }: { m: LabMeasure; prev?: LabMeasure; first: boolean }) {
  const t = useTheme();
  const [lo, hi] = m.scale;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%` as const;
  const off = m.status !== 'in';
  const delta = prev ? m.value - prev.value : null;
  const deltaText = delta != null && Math.abs(delta) >= (hi - lo) * 0.03 ? `${delta > 0 ? '↑' : '↓'} since last take` : null;
  return (
    <View style={{ paddingHorizontal: 18, paddingVertical: 13, borderTopWidth: first ? 0 : 1, borderColor: t.line, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>
          {m.label}
          {m.source === 'research' ? <RNText style={{ color: t.ink3, fontSize: 11 }}>{'  ◆'}</RNText> : null}
        </RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 12.5, color: off ? OUT : t.ink2 }}>{m.display}</RNText>
      </View>
      {/* the scale, the band, and you */}
      <View style={{ height: 12, justifyContent: 'center' }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: t.cardAlt }} />
        <View style={{ position: 'absolute', left: pos(m.band[0]), right: `${100 - parseFloat(pos(m.band[1]))}%`, height: 7, borderRadius: 4, backgroundColor: t.accentSoft }} />
        {prev ? <View style={{ position: 'absolute', left: pos(prev.value), marginLeft: -3, width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: t.ink3 }} /> : null}
        <View style={{ position: 'absolute', left: pos(m.value), marginLeft: -6, width: 12, height: 12, borderRadius: 6, backgroundColor: off ? OUT : t.accent, borderWidth: 2, borderColor: t.card }} />
      </View>
      <RNText style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink2 }}>
        {m.note}
        {deltaText ? <RNText style={{ color: t.ink3 }}>{`  ${deltaText}`}</RNText> : null}
      </RNText>
    </View>
  );
}
