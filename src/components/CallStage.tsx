import React from 'react';
import { View, Text as RNText } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, SharedValue } from 'react-native-reanimated';
import { Serif } from '@/ui';
import { CallFace, VoiceBars } from '@/components/CallFace';
import { font, useTheme } from '@/theme';

/**
 * The call, at night: who's on the line, one waveform, the last thing said as a caption, and the controls.
 * Purely presentational, shared by the live (full-duplex) call and the turn-by-turn fallback.
 */
export type CallStageProps = {
  /** "LIVE · 0:42", "CALLING", "CALL ENDED" */
  top: string;
  dot: 'live' | 'idle' | 'warn';
  topRight?: string;
  face: any;
  energy: SharedValue<number>;
  who: SharedValue<number>;
  idle: boolean;
  interest: number | null;
  leaving?: boolean;
  name: string;
  subline?: string;
  present?: { name: string; face: any }[];
  bars: SharedValue<number>;
  barsDim?: boolean;
  caption: { label: string; text: string; mine?: boolean; key?: number } | null;
  placeholder: string;
  status: string;
  statusError?: boolean;
  /** The controls row (end call, mic, camera, words). */
  children?: React.ReactNode;
};

export function CallStage(p: CallStageProps) {
  const t = useTheme();
  const red = '#E5484D';
  return (
    <View style={{ flex: 1 }}>
      {/* the line: live, and for how long */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, height: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.dot === 'warn' ? red : p.dot === 'live' ? t.accent : t.lineStrong }} />
          <RNText style={{ fontFamily: font.mono, fontSize: 11.5, letterSpacing: 1.6, color: p.dot === 'warn' ? red : t.ink3 }}>{p.top}</RNText>
        </View>
        {p.topRight ? <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: t.ink3 }}>{p.topRight}</RNText> : null}
      </View>

      {/* who you're talking to */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ marginTop: -24, marginBottom: -30 }}>
          <CallFace source={p.face} size={200} energy={p.energy} who={p.who} interest={p.interest} leaving={p.leaving} idle={p.idle} />
        </View>
        <Serif size={38} align="center" style={{ marginTop: 2 }}>{p.name || ' '}</Serif>
        {p.subline ? (
          <RNText numberOfLines={1} style={{ marginTop: 4, fontFamily: font.regular, fontSize: 14, color: t.ink3, textAlign: 'center', maxWidth: 300 }}>{p.subline}</RNText>
        ) : null}
        {p.present?.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <View style={{ flexDirection: 'row' }}>
              {p.present.slice(0, 3).map((x, i) => (
                <View key={x.name} style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: t.bg }}>
                  <Image source={x.face} style={{ width: 24, height: 24 }} />
                </View>
              ))}
            </View>
            <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{`with ${p.present.map((x) => x.name).join(', ')}`}</RNText>
          </View>
        ) : null}
        <View style={{ marginTop: 20 }}>
          <VoiceBars energy={p.bars} who={p.who} dim={p.barsDim} color={t.ink} bars={15} height={40} />
        </View>
      </View>

      {/* the caption: the last thing said, or the scene before anyone speaks */}
      <View style={{ marginHorizontal: 18, marginBottom: 14, minHeight: 104, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 18, paddingVertical: 14, justifyContent: 'center' }}>
        {p.caption ? (
          <Animated.View key={p.caption.key} entering={FadeIn.duration(240)} style={{ gap: 6 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: p.caption.mine ? t.ink2 : t.ink3 }}>{p.caption.label.toUpperCase()}</RNText>
            <RNText numberOfLines={4} style={{ fontFamily: font.regular, fontSize: 16.5, lineHeight: 23, color: p.caption.mine ? t.ink2 : t.ink }}>{p.caption.text}</RNText>
          </Animated.View>
        ) : (
          <RNText style={{ fontFamily: font.regular, fontSize: 15, color: t.ink3, textAlign: 'center' }}>{p.placeholder}</RNText>
        )}
      </View>

      {/* status and controls */}
      <View style={{ alignItems: 'center', paddingBottom: 14, gap: 14 }}>
        <RNText style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, textAlign: 'center', color: p.statusError ? '#F2A6A8' : t.ink2, paddingHorizontal: 32 }}>{p.status}</RNText>
        {p.children}
      </View>
    </View>
  );
}
