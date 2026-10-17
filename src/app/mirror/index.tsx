import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON, Statue } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { Display, Kicker, Pill, RowLink, Hair, Chip } from '@/components/Kit';
import { WEEKLY, EXTRA, weekKey, promptById } from '@/lib/mirror';

/**
 * The Mirror: thirty seconds on camera, answering one question. Voice, eyes and stillness are measured; then Poise
 * reads it. The same question every week, so the takes line up and you can see what moved.
 */
export default function Mirror() {
  const t = useTheme();
  const reads = useStore((s) => s.mirror ?? []);
  const doneThisWeek = reads.some((r) => r.promptId === WEEKLY.id && weekKey(new Date(r.createdAt)) === weekKey());
  const weekly = reads.filter((r) => r.promptId === WEEKLY.id && !r.safety).slice(0, 8).reverse();
  const go = (id: string) => router.push({ pathname: '/mirror/take', params: { prompt: id } });

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICON.back} size={16} color={t.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1, gap: 10 }}>
            <Kicker>The Mirror · 30 seconds</Kicker>
            <Display text="See what " em="they" after=" see." size={42} />
          </View>
          <Statue name="head" height={120} style={{ marginRight: -10, marginBottom: -6 }} />
        </Animated.View>
        <RNText style={{ marginTop: 12, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>
          Answer one question to the camera. Your pace, pauses, pitch, eyes and stillness are measured; then Poise tells you what a stranger would take from it.
        </RNText>

        {/* this week's take */}
        <Animated.View entering={FadeIn.duration(400).delay(80)} style={{ marginTop: 22, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 18, gap: 12 }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.8, color: t.accent }}>{doneThisWeek ? 'THIS WEEK · DONE' : 'THIS WEEK'}</RNText>
          <RNText style={{ fontFamily: font.serif, fontSize: 28, lineHeight: 33, color: t.ink }}>{WEEKLY.text}</RNText>
          <RNText style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink3 }}>The same question every week, so your takes compare like with like.</RNText>
          <Pill label={doneThisWeek ? 'Take it again' : 'Record · 30 seconds'} quiet={doneThisWeek} icon={ICON.scan} onPress={() => go(WEEKLY.id)} />
        </Animated.View>

        {weekly.length >= 2 ? <Trend points={weekly.map((r) => r.index)} /> : null}

        <View style={{ marginTop: 26, gap: 10 }}>
          <Kicker>Or answer something else</Kicker>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 22 }}>
            {EXTRA.map((p) => (
              <Chip key={p.id} label={p.text} onPress={() => go(p.id)} />
            ))}
          </ScrollView>
        </View>

        {reads.length ? (
          <View style={{ marginTop: 28 }}>
            <Kicker>Your takes</Kicker>
            {reads.slice(0, 12).map((r, i) => (
              <RowLink
                key={r.id}
                first={i === 0}
                title={r.safety ? 'A take' : `${r.index} · ${titleOf(r.archetype)}`}
                sub={`${new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${promptById(r.promptId).text}`}
                onPress={() => router.push({ pathname: '/mirror/[id]', params: { id: r.id } })}
              />
            ))}
            <Hair />
          </View>
        ) : null}

        <Pressable onPress={() => router.push('/mirror/methods')} hitSlop={8} style={{ marginTop: 22 }}>
          <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.accent }}>How Kleos measures →</RNText>
        </Pressable>
        <RNText style={{ marginTop: 10, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>
          The video is measured, then deleted. Only the numbers and Poise’s read stay, on this phone.
        </RNText>
      </ScrollView>
    </Screen>
  );
}

export function titleOf(a?: string) {
  if (!a) return '';
  const s = a.replace(/^the\s+/i, '');
  return `The ${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** Your Index on the weekly question, take by take. */
function Trend({ points }: { points: number[] }) {
  const t = useTheme();
  const max = Math.max(...points, 70);
  const min = Math.min(...points, 30);
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <View style={{ marginTop: 16, borderRadius: 20, borderWidth: 1, borderColor: t.line, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6, color: t.ink3 }}>{`${points.length} WEEKS`}</RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.2, color: last >= first ? t.accent : t.ink2 }}>{`${last - first >= 0 ? '+' : ''}${last - first} SINCE WEEK 1`}</RNText>
      </View>
      <View style={{ height: 84, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        {points.map((p, i) => (
          <View key={i} style={{ flex: 1, maxWidth: 34, alignItems: 'center', gap: 5 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 10.5, color: i === points.length - 1 ? t.ink : t.ink3 }}>{p}</RNText>
            <View style={{ width: '100%', height: 8 + ((p - min) / (max - min || 1)) * 50, borderRadius: 6, backgroundColor: i === points.length - 1 ? t.accent : t.accentSoft }} />
          </View>
        ))}
      </View>
    </View>
  );
}
