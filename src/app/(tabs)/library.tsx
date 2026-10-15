import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Label, Statue, Section, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { UNITS, nextLesson } from '@/lib/progress';
import { questsFor, QUEST_CATEGORY } from '@/lib/quests';
import CODES from '../../../content/codes.json';
import { play } from '@/lib/sound';

const ROOM_STATUE: Record<string, 'head' | 'athlete' | 'bust' | 'antinoos'> = { dating: 'antinoos', approach: 'athlete', money: 'bust', service: 'head', conflict: 'bust', friends: 'athlete', status: 'head' };

/** Library: the program you're in, rooms to rehearse, and two-minute codes. */
export default function Library() {
  const t = useTheme();
  const s = useStore();
  const next = nextLesson(s.laurels);
  const total = UNITS.reduce((n, u) => n + u.lessons.length, 0);
  const done = UNITS.reduce((n, u) => n + u.lessons.filter((l) => s.laurels[l.id]).length, 0);
  const quests = questsFor(s.tone);
  const rooms = Object.entries(
    quests.reduce<Record<string, number>>((acc, q) => {
      acc[q.category] = (acc[q.category] ?? 0) + 1;
      return acc;
    }, {}),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8 }}>
          <Title size={30}>Library</Title>
        </View>

        {/* Program */}
        <Animated.View entering={FadeInDown.duration(450)}>
          <Pressable onPress={() => { play('select'); router.push('/(tabs)/train'); }} style={{ marginTop: 16, height: 200, borderRadius: 24, backgroundColor: t.accent, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', right: -6, bottom: -14 }}>
              <Statue name="head" height={200} />
            </View>
            <View style={{ position: 'absolute', left: 20, top: 20, width: 200, gap: 6 }}>
              <Label color={t.onInverse2}>Program · {done ? 'In progress' : 'Start here'}</Label>
              <RNText style={{ fontFamily: font.medium, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: t.onAccent }}>The Presence Path</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>{next.unit.title} · {next.lesson.title}</RNText>
            </View>
            <View style={{ position: 'absolute', left: 20, bottom: 20, width: 170, gap: 6 }}>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }}>
                <View style={{ height: 3, borderRadius: 2, backgroundColor: t.onAccent, width: `${Math.max(4, (done / total) * 100)}%` }} />
              </View>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.onInverse2 }}>{done} / {total}</RNText>
            </View>
          </Pressable>
        </Animated.View>

        {/* Rooms */}
        <Animated.View entering={FadeInDown.duration(450).delay(80)} style={{ marginTop: 28 }}>
          <Section title="Rooms" note="Rehearse a setting" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {rooms.map(([cat, n]) => (
              <Pressable key={cat} onPress={() => { play('select'); router.push({ pathname: '/room/[cat]', params: { cat } }); }} style={{ width: 150, height: 190, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                <View style={{ padding: 14, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{QUEST_CATEGORY[cat] ?? cat}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{n} scenes</RNText>
                </View>
                <View style={{ position: 'absolute', bottom: -6, left: 0, right: 0, alignItems: 'center' }}>
                  <Statue name={ROOM_STATUE[cat] ?? 'head'} height={118} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Codes */}
        <Animated.View entering={FadeInDown.duration(450).delay(160)} style={{ marginTop: 28 }}>
          <Section title="Codes" note="Two-minute reads" />
          <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
            {CODES.codes.map((c, i) => (
              <Pressable key={c.id} onPress={() => { play('tap'); router.push({ pathname: '/code/[id]', params: { id: c.id } }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: t.ink }}>{c.title}</RNText>
                <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink3 }}>{c.minutes} MIN</RNText>
                <Chevron />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
