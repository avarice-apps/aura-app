import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { Screen, Title, Muted, Label, Num, Halo, Statue, Bar, Section, Chevron, Row, Icon, ICON } from '@/ui';
import { useTier } from '@/lib/plan';
import { font, useTheme } from '@/theme';
import { useStore, auraIndex, SessionRecord } from '@/state/store';
import { patterns, UNITS } from '@/lib/progress';
import type { Evaluation } from '@/lib/types';
import { play } from '@/lib/sound';

type Range = '4w' | '8w' | 'all';
const AXES: { key: 'voice' | 'command' | 'composure' | 'awareness'; label: string }[] = [
  { key: 'voice', label: 'Voice' },
  { key: 'command', label: 'Command' },
  { key: 'composure', label: 'Composure' },
  { key: 'awareness', label: 'Social IQ' },
];

const best = (s: SessionRecord): Evaluation => (s.retry && !s.retry.insufficient ? s.retry : s.evaluation);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Progress: where your Index is going, which skills moved, and which tells you've cleared. */
export default function Progress() {
  const t = useTheme();
  const s = useStore();
  const tier = useTier();
  const [range, setRange] = useState<Range>('8w');
  const [now0] = useState(() => Date.now());
  const scored = useMemo(() => s.sessions.filter((x) => best(x)?.axes && !best(x).insufficient), [s.sessions]);
  const idx = auraIndex(s.sessions);

  const series = useMemo(() => {
    const cutoff = range === 'all' ? 0 : now0 - (range === '4w' ? 28 : 56) * 864e5;
    const asc = [...scored].reverse().filter((x) => new Date(x.createdAt).getTime() >= cutoff);
    // rolling mean of the last three takes: the Index moves with consistency, not one lucky take
    return asc.map((_, i) => avg(asc.slice(Math.max(0, i - 2), i + 1).map((x) => best(x).rating)) ?? 0);
  }, [scored, range, now0]);
  const first = series[0];
  const change = idx !== null && first !== undefined ? idx - first : 0;

  const recent = scored.slice(0, 5);
  const before = scored.slice(5, 10);
  const axisNow = (k: (typeof AXES)[number]['key']) => avg(recent.map((x) => best(x).axes[k]));
  const axisDelta = (k: (typeof AXES)[number]['key']) => {
    const a = avg(recent.map((x) => best(x).axes[k]));
    const b = avg(before.map((x) => best(x).axes[k]));
    return a !== null && b !== null ? a - b : null;
  };

  const golds = UNITS.flatMap((u) => u.lessons).filter((l) => s.laurels[l.id] === 3).length;
  const laurels = Object.values(s.laurels).filter(Boolean).length;
  const older = patterns(s.sessions.slice(3), s.patternsDismissed);
  const recentKeys = patterns(s.sessions.slice(0, 3).concat(s.sessions.slice(0, 3)), s.patternsDismissed).map((p) => p.key);
  const cleared = older.filter((p) => !recentKeys.includes(p.key));
  const live = patterns(s.sessions, s.patternsDismissed);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title size={30}>Progress</Title>
          <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: 999, borderWidth: 1, borderColor: t.line, padding: 3 }}>
            {(['4w', '8w', 'all'] as Range[]).map((r) => (
              <Pressable key={r} onPress={() => { play('tap'); setRange(r); }} style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: range === r ? t.accent : 'transparent' }}>
                <RNText style={{ fontFamily: range === r ? font.medium : font.regular, fontSize: 12, color: range === r ? t.onAccent : t.ink2 }}>{r === 'all' ? 'All' : r.toUpperCase()}</RNText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Index + chart */}
        <Animated.View entering={FadeInDown.duration(450)} style={{ marginTop: 16, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 18, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -30, top: -30 }}><Halo size={130} opacity={0.5} /></View>
          <Label>Aura Index</Label>
          {idx === null ? (
            <View style={{ paddingVertical: 18, gap: 6 }}>
              <Title size={22}>Starts with your first lesson.</Title>
              <Muted small>Every conversation adds a point. The line shows whether it’s holding.</Muted>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Num value={idx} size={60} />
                {series.length > 1 ? (
                  <RNText style={{ fontFamily: font.mono, fontSize: 12, color: change >= 0 ? t.accent : t.ink2 }}>
                    {change >= 0 ? '↑' : '↓'} {Math.abs(change)} since {range === 'all' ? 'the start' : range === '4w' ? '4 weeks ago' : '8 weeks ago'}
                  </RNText>
                ) : null}
              </View>
              <Chart values={series} />
            </>
          )}
        </Animated.View>

        {/* Skills */}
        <Animated.View entering={FadeInDown.duration(450).delay(80)} style={{ marginTop: 14, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 18, paddingVertical: 6 }}>
          {AXES.map((a, i) => {
            const v = axisNow(a.key);
            const d = axisDelta(a.key);
            return (
              <View key={a.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                <RNText style={{ width: 86, fontFamily: font.regular, fontSize: 15, color: t.ink }}>{a.label}</RNText>
                <Bar value={v ?? 0} />
                <RNText style={{ width: 66, textAlign: 'right', fontFamily: font.mono, fontSize: 12, color: t.ink }}>
                  {v ?? '—'}
                  {d !== null && d !== 0 ? <RNText style={{ color: d > 0 ? t.accent : t.ink3 }}>{`  ${d > 0 ? '↑' : '↓'}${Math.abs(d)}`}</RNText> : null}
                </RNText>
              </View>
            );
          })}
        </Animated.View>

        {/* Tiles */}
        <Animated.View entering={FadeInDown.duration(450).delay(160)} style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => router.push('/(tabs)/live')} style={{ flex: 1, borderRadius: 20, backgroundColor: t.accent, padding: 16, gap: 4, minHeight: 124 }}>
            <Label color={t.onInverse2}>Laurels</Label>
            <RNText style={{ fontFamily: font.medium, fontSize: 26, letterSpacing: -0.6, color: t.onAccent }}>{laurels} earned</RNText>
            <RNText style={{ fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: t.onAccent }}>{golds ? `${golds} gold. Proven on a different day.` : 'Gold needs a repeat on another day.'}</RNText>
          </Pressable>
          <View style={{ flex: 1, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, gap: 4, minHeight: 124 }}>
            <Label>Tells cleared</Label>
            <Num value={cleared.length} size={30} />
            <Muted small numberOfLines={2}>{cleared[0] ? `Latest: ${cleared[0].label.toLowerCase()}` : 'Clear a pattern by not showing it for three sessions.'}</Muted>
          </View>
        </Animated.View>

        {/* Portrait (Black) */}
        <Animated.View entering={FadeInDown.duration(450).delay(200)} style={{ marginTop: 14 }}>
          <Pressable onPress={() => { play('select'); router.push('/portrait'); }} style={{ borderRadius: 20, backgroundColor: t.ink, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.6)' }}>KLEOS BLACK</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 17, color: '#FFF' }}>Your Portrait</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>A deep read of every conversation you’ve had.</RNText>
            </View>
            <Chevron color="#FFF" />
          </Pressable>
        </Animated.View>

        {/* Patterns */}
        <Animated.View entering={FadeInDown.duration(450).delay(240)} style={{ marginTop: 28 }}>
          <Section title="Still showing" note="With evidence" onNote={() => router.push('/you')} />
          {live.length > 0 && tier === 'free' ? (
            <Pressable onPress={() => router.push({ pathname: '/paywall', params: { reason: 'read' } })} style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{live.length} pattern{live.length === 1 ? '' : 's'} keep showing up</RNText>
                <Icon d={ICON.lock} size={14} color={t.accent} />
              </Row>
              <Muted small>See what they are, with the quotes behind each one. Kleos+.</Muted>
            </Pressable>
          ) : live.length === 0 ? (
            <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Statue name="bust" height={60} />
              <Muted small style={{ flex: 1 }}>Patterns show up after a few conversations, each with the quotes behind it.</Muted>
            </View>
          ) : (
            <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
              {live.slice(0, 4).map((p, i) => (
                <Pressable key={p.key} onPress={() => router.push('/you')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                  <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: t.ink }}>{p.label}</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.accent }}>{p.count}×</RNText>
                  <Chevron />
                </Pressable>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function Chart({ values }: { values: number[] }) {
  const t = useTheme();
  const W = 300;
  const H = 120;
  const v = values.length === 1 ? [values[0], values[0]] : values;
  const lo = Math.max(0, Math.min(...v) - 8);
  const hi = Math.min(100, Math.max(...v) + 8);
  const pts = v.map((y, i) => [(i / Math.max(1, v.length - 1)) * W, H - ((y - lo) / Math.max(1, hi - lo)) * H] as const);
  const last = pts[pts.length - 1];
  return (
    <View style={{ marginTop: 14 }}>
      <Svg width="100%" height={H + 8} viewBox={`-4 -4 ${W + 8} ${H + 8}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <Line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke={t.cardAlt} strokeWidth={1} />
        ))}
        <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={t.ink} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={last[0]} cy={last[1]} r={4.5} fill={t.accent} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>FIRST</RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>{values.length} TAKES</RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>NOW</RNText>
      </View>
    </View>
  );
}
