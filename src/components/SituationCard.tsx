import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Body, Label, Muted, Row, Stack, Title } from '@/ui';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';
import { recordSituationAnswer, situationStats } from '@/lib/api';
import SITUATIONS from '../../content/situations.json';

export type Situation = {
  id: string;
  category: string;
  title: string;
  scene: string;
  difficulty: number;
  options: { text: string; delta: number; why: string }[];
  best: number;
  code: string;
};

export const ALL_SITUATIONS = SITUATIONS as Situation[];
export const CATEGORY_LABEL: Record<string, string> = { intro: 'Introductions', dating: 'Dating', work: 'Work', group: 'Friends & groups', status: 'Status', conflict: 'Conflict', recovery: 'Recovery', hosting: 'Hosting' };
const MIN_N_FOR_STATS = 200;
const SECONDS = 12;

export function SituationCard({ s, onAnswered, timed = true }: { s: Situation; onAnswered?: (correct: boolean, delta: number) => void; timed?: boolean }) {
  const t = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const [stats, setStats] = useState<{ n: number; counts: number[] } | null>(null);
  const bar = useSharedValue(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(null);
    setStats(null);
    if (timed) {
      bar.value = 1;
      bar.value = withTiming(0, { duration: SECONDS * 1000, easing: Easing.linear });
      timer.current = setTimeout(() => choose(-1), SECONDS * 1000);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);

  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

  async function choose(i: number) {
    if (picked !== null) return;
    if (timer.current) clearTimeout(timer.current);
    bar.value = withTiming(bar.value, { duration: 0 });
    setPicked(i);
    const right = i === s.best;
    if (right) {
      play('correct');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      play('wrong');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onAnswered?.(right, i >= 0 ? s.options[i].delta : 0);
    if (i >= 0) recordSituationAnswer(s.id, i);
    const st = await situationStats(s.id);
    if (st && st.n >= MIN_N_FOR_STATS) setStats(st);
  }

  const chosen = picked !== null && picked >= 0 ? s.options[picked] : null;
  const pct = (i: number) => (stats ? Math.round((stats.counts[i] / Math.max(1, stats.n)) * 100) : null);

  return (
    <Stack gap={14}>
      {timed && (
        <View style={{ height: 3, borderRadius: 2, backgroundColor: t.lineStrong, overflow: 'hidden' }}>
          <Animated.View style={[{ height: 3, backgroundColor: t.ink }, barStyle]} />
        </View>
      )}
      <Stack gap={6}>
        <Body small strong color={t.accent}>{s.title}</Body>
        <Title size={21} style={{ fontFamily: font.regular, letterSpacing: -0.2, lineHeight: 28 }}>{s.scene}</Title>
      </Stack>
      <Stack gap={8}>
        {s.options.map((o, i) => {
          const isBest = picked !== null && i === s.best;
          const isWrong = picked === i && i !== s.best;
          const dim = picked !== null && !isBest && !isWrong;
          const p = pct(i);
          return (
            <Pressable
              key={i}
              disabled={picked !== null}
              onPressIn={() => picked === null && play('select')}
              onPress={() => choose(i)}
              style={{ minHeight: 56, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: isBest ? t.accentSoft : t.card, borderWidth: isBest || isWrong ? 1.5 : 1, borderColor: isBest ? t.accent : isWrong ? t.ink : t.line, opacity: dim ? 0.55 : 1, overflow: 'hidden' }}
            >
              {p !== null && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p}%`, backgroundColor: t.cardAlt, opacity: 0.6 }} />}
              <Row gap={10}>
                <Body small style={{ flex: 1 }}>{o.text}</Body>
                {picked !== null && (
                  <Stack gap={0} style={{ alignItems: 'flex-end' }}>
                    <RNText style={{ fontFamily: font.monoMedium, fontSize: 12, color: o.delta > 0 ? t.accent : t.ink }}>{o.delta > 0 ? '+' : ''}{o.delta}</RNText>
                    {p !== null && <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>{p}%</RNText>}
                  </Stack>
                )}
              </Row>
            </Pressable>
          );
        })}
      </Stack>
      {picked !== null && (
        <Animated.View entering={FadeInDown.duration(350)} style={{ backgroundColor: t.inverse, borderRadius: 16, padding: 14, gap: 6 }}>
          <Label color={t.onInverse2}>{picked < 0 ? 'Too slow' : picked === s.best ? `Aura gained +${chosen!.delta}` : `Aura lost ${Math.abs(chosen!.delta)} · best was +${s.options[s.best].delta}`}</Label>
          <Body small color={t.onInverse}>{picked < 0 ? s.options[s.best].why : chosen!.why}</Body>
          {picked !== s.best && picked >= 0 ? <Body small color={t.onInverse2}>Best: {s.options[s.best].text}</Body> : null}
          <Body small color={t.onInverse} style={{ fontFamily: font.serifItalic, fontSize: 16, marginTop: 4 }}>{s.code}</Body>
        </Animated.View>
      )}
      {picked !== null && (
        <Animated.View entering={FadeIn.delay(200)}>
          <Muted small>{stats ? `${stats.n.toLocaleString()} people answered this one.` : 'You’re one of the first to answer this one. What everyone picked appears after 200 answers.'}</Muted>
        </Animated.View>
      )}
    </Stack>
  );
}

export function pickSituation(category: string, seen: string[], maxDifficulty = 3): Situation {
  const pool = ALL_SITUATIONS.filter((x) => x.category === category && x.difficulty <= maxDifficulty);
  const fresh = pool.filter((x) => !seen.includes(x.id));
  const list = fresh.length ? fresh : pool.length ? pool : ALL_SITUATIONS;
  return list[Math.floor(Math.random() * list.length)];
}
