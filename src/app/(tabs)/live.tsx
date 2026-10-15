import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Muted, Section, Icon, ICON, Row, ArtCard, OnBlue, Statue } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { UNITS, nextLesson } from '@/lib/progress';
import { questsFor, QUEST_CATEGORY } from '@/lib/quests';
import { useTier, remaining } from '@/lib/plan';
import { ToneSwitch } from '@/components/ToneSwitch';
import { play } from '@/lib/sound';

const ROOM_STATUE: Record<string, 'head' | 'athlete' | 'bust' | 'antinoos'> = { dating: 'antinoos', approach: 'athlete', money: 'bust', service: 'head', conflict: 'bust', friends: 'athlete', status: 'head' };

/** Live: everything you practise out loud. Open Floor, side quests, your real situation, the Path, quick reps. */
export default function Live() {
  const t = useTheme();
  const s = useStore();
  const tier = useTier();
  const next = nextLesson(s.laurels);
  const total = UNITS.reduce((n, u) => n + u.lessons.length, 0);
  const done = UNITS.reduce((n, u) => n + u.lessons.filter((l) => s.laurels[l.id]).length, 0);
  const rooms = Object.entries(questsFor(s.tone).reduce<Record<string, number>>((acc, q) => ({ ...acc, [q.category]: (acc[q.category] ?? 0) + 1 }), {}));
  const calls = remaining('calls');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <Row style={{ justifyContent: 'space-between', paddingTop: 8 }}>
          <Title size={30}>Live</Title>
          <ToneSwitch />
        </Row>
        <Muted small style={{ marginTop: 4 }}>{tier === 'free' ? `${calls === Infinity ? 'Unlimited' : calls} free call${calls === 1 ? '' : 's'} left this week. The Daily Side Quest is always free.` : 'Unlimited calls. Talk as long as you want.'}</Muted>

        {/* Open Floor */}
        <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 14 }}>
          <ArtCard art="apollo" height={210} focus="top" onPress={() => router.push('/floor')}>
            <OnBlue kicker="Open Floor · no turn limit" sub="A real conversation that keeps going. People join. It gets harder.">Stay in it</OnBlue>
          </ArtCard>
        </Animated.View>

        {/* Rehearse (Black) */}
        <Animated.View entering={FadeInDown.duration(400).delay(40)} style={{ marginTop: 10 }}>
          <Pressable onPress={() => { play('select'); router.push('/rehearse'); }} style={{ borderRadius: 22, backgroundColor: t.ink, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.6)' }}>KLEOS BLACK</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 18, color: '#FFF' }}>Rehearse your real situation</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Tomorrow’s date, the raise, the apology. Describe it, play it tonight.</RNText>
            </View>
            <Icon d={tier === 'black' ? ICON.play : ICON.lock} size={16} color="#FFF" fill={tier === 'black' ? '#FFF' : undefined} />
          </Pressable>
        </Animated.View>

        {/* Side quests */}
        <Animated.View entering={FadeInDown.duration(400).delay(80)} style={{ marginTop: 28 }}>
          <Section title="Side quests" note="Real situations" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {rooms.map(([cat, n]) => (
              <Pressable key={cat} onPress={() => { play('select'); router.push({ pathname: '/room/[cat]', params: { cat } }); }} style={{ width: 140, height: 176, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                <View style={{ padding: 14, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{QUEST_CATEGORY[cat] ?? cat}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{n} scene{n === 1 ? '' : 's'}</RNText>
                </View>
                <View style={{ position: 'absolute', bottom: -6, left: 0, right: 0, alignItems: 'center' }}>
                  <Statue name={ROOM_STATUE[cat] ?? 'head'} height={110} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* The Path */}
        <Animated.View entering={FadeInDown.duration(400).delay(120)} style={{ marginTop: 28 }}>
          <Section title="Program" note={`${done}/${total}`} onNote={() => router.push('/path')} />
          <ArtCard art="couple" height={200} focus="top" onPress={() => router.push('/path')}>
            <OnBlue kicker={`The Presence Path · ${next.unit.title}`} sub={`Next: ${next.lesson.title}`}>Five units, one skill at a time</OnBlue>
            <View style={{ marginTop: 10, height: 3, width: 160, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }}>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: '#FFF', width: `${Math.max(4, (done / total) * 100)}%` }} />
            </View>
          </ArtCard>
        </Animated.View>

        {/* Quick reps */}
        <Animated.View entering={FadeInDown.duration(400).delay(160)} style={{ marginTop: 28 }}>
          <Section title="Quick reps" note="Two minutes" />
          <Row gap={10}>
            {[
              { k: 'sit', label: 'Situations', sub: 'Ten seconds. Pick the move.', icon: ICON.clock, go: () => router.push('/situations') },
              { k: 'codes', label: 'Codes', sub: 'Two-minute reads', icon: ICON.book, go: () => router.push('/codes') },
            ].map((x) => (
              <Pressable key={x.k} onPress={() => { play('select'); x.go(); }} style={{ flex: 1, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 14, gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={x.icon} size={16} color={t.accent} />
                </View>
                <View style={{ gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{x.label}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{x.sub}</RNText>
                </View>
              </Pressable>
            ))}
          </Row>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
