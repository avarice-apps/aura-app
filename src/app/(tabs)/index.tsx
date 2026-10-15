import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Row, Stack, Num, Statue, Halo, Icon, ICON, Section, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, auraIndex } from '@/state/store';
import { nextLesson, ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';
import { questsFor, PARTNER, QUEST_CATEGORY } from '@/lib/quests';
import { ToneSwitch } from '@/components/ToneSwitch';

const TIER = (n: number) => (n >= 85 ? ['Gravity', 'People lean in without knowing why.'] : n >= 72 ? ['Magnetic', 'The room reorganises around you.'] : n >= 60 ? ['Composed', 'Steady. Nothing leaks.'] : n >= 45 ? ['Present', 'You hold attention. You don’t yet direct it.'] : ['Faint', 'The good parts are getting buried.']);

/** Today. Three sections, one primary action: your Index, what's next, three small things. */
export default function Today() {
  const t = useTheme();
  const s = useStore();
  const idx = auraIndex(s.sessions);
  const next = nextLesson(s.laurels);
  const hour = new Date().getHours();
  const evening = hour >= 18 || hour < 3;
  const mission = ALL_MISSIONS.find((m) => m.id === s.activeMission) ?? ALL_MISSIONS.find((m) => !s.missionsDone.includes(m.id))!;
  const doneToday = s.daily?.day === new Date().toISOString().slice(0, 10) ? s.daily.done : [];
  const daily = [
    { key: 'situation', title: 'Situation of the day', sub: 'Ten seconds to read the room', icon: ICON.clock, go: () => router.push('/situations') },
    { key: 'mission', title: mission.title, sub: 'Field mission · do it for real', icon: ICON.flag, go: () => router.push('/(tabs)/poise') },
    evening
      ? { key: 'debrief', title: 'Tonight’s debrief', sub: 'One moment from today, with Poise', icon: ICON.moon, go: () => router.push({ pathname: '/(tabs)/poise', params: { mode: 'debrief' } }) }
      : { key: 'scan', title: 'Aura Scan', sub: 'Fifteen seconds on camera', icon: ICON.scan, go: () => router.push('/(tabs)/scan') },
  ];
  const doneCount = daily.filter((d) => doneToday.includes(d.key)).length;
  const [tier, line] = TIER(idx ?? 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        {/* header */}
        <Row style={{ justifyContent: 'space-between', paddingTop: 8 }}>
          <Stack gap={2}>
            <Label>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Label>
            <Title size={24}>{hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'}{s.name ? `, ${s.name}` : ''}</Title>
          </Stack>
          <Pressable onPress={() => router.push('/(tabs)/you')} accessibilityLabel="You" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{(s.name || 'A')[0].toUpperCase()}</RNText>
          </Pressable>
        </Row>

        {/* 1 · Index */}
        <Animated.View entering={FadeInDown.duration(450)} style={{ marginTop: 18, height: 196, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -60, top: -40 }}><Halo size={290} opacity={0.4} /></View>
          <View style={{ position: 'absolute', right: 4, bottom: -8 }}><Statue name="bust" height={186} /></View>
          <View style={{ position: 'absolute', left: 20, top: 18, width: 170, gap: 2 }}>
            <Label>Aura Index</Label>
            {idx !== null ? (
              <>
                <Num value={idx} size={72} />
                <Body strong style={{ fontSize: 16 }}>{tier}</Body>
                <Muted small>{line}</Muted>
              </>
            ) : (
              <>
                <Title size={22} style={{ marginTop: 10 }}>Not set yet</Title>
                <Muted small>Your first lesson sets your starting point.</Muted>
              </>
            )}
          </View>
          {s.streak > 0 && (
            <View style={{ position: 'absolute', left: 20, bottom: 14, backgroundColor: t.accentSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.accent }}>{s.streak}-day streak</RNText>
            </View>
          )}
        </Animated.View>

        {/* 2 · Up next */}
        <Animated.View entering={FadeInDown.duration(450).delay(80)} style={{ marginTop: 28 }}>
          <Section title="Up next" note="Path" onNote={() => router.push('/(tabs)/path')} />
          <Pressable
            onPress={() => { play('select'); router.push({ pathname: '/lesson/[id]', params: { id: next.lesson.id } }); }}
            style={{ borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 20, gap: 6 }}
          >
            <Label color={t.accent}>{next.unit.title} · {next.lesson.checkpoint ? 'Checkpoint' : `Lesson ${next.index + 1}`}</Label>
            <Title size={24}>{next.lesson.title}</Title>
            <Body small color={t.ink2} numberOfLines={2}>{next.lesson.objective}</Body>
            <View style={{ marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, height: 40 }}>
              <Icon d={ICON.play} size={11} fill={t.onAccent} />
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>Start · 3 min</RNText>
            </View>
          </Pressable>
        </Animated.View>

        {/* 3 · Side quests */}
        <Animated.View entering={FadeInDown.duration(450).delay(120)} style={{ marginTop: 28 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 17, letterSpacing: -0.3, color: t.ink }}>Side quests</RNText>
            <ToneSwitch />
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {questsFor(s.tone, s.questsDone ?? []).slice(0, 8).map((q) => {
              const done = (s.questsDone ?? []).includes(q.id);
              return (
                <Pressable
                  key={q.id}
                  onPress={() => { play('select'); router.push({ pathname: '/quest/[id]', params: { id: q.id } }); }}
                  style={{ width: 200, height: 150, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, justifyContent: 'space-between' }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Label color={t.accent}>{QUEST_CATEGORY[q.category] ?? q.category}</Label>
                    {done ? <Icon d={ICON.check} size={14} color={t.accent} stroke={2.4} /> : q.spicy ? <Label>18+</Label> : null}
                  </Row>
                  <RNText style={{ fontFamily: font.medium, fontSize: 17, lineHeight: 21, letterSpacing: -0.3, color: t.ink }} numberOfLines={3}>{q.title}</RNText>
                  <Muted small>With {PARTNER[q.partner] ?? q.partner}</Muted>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* 4 · Daily */}
        <Animated.View entering={FadeInDown.duration(450).delay(160)} style={{ marginTop: 28 }}>
          <Section title="Today" note={`${doneCount} of 3 done`} />
          <View style={{ borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
            {daily.map((d, i) => {
              const done = doneToday.includes(d.key);
              return (
                <Pressable key={d.key} onPress={() => { play('tap'); d.go(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: done ? t.accent : t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon d={done ? ICON.check : d.icon} size={16} color={done ? t.onAccent : t.accent} stroke={done ? 2.4 : 1.8} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <RNText style={{ fontFamily: font.medium, fontSize: 15, color: done ? t.ink3 : t.ink }} numberOfLines={1}>{d.title}</RNText>
                    <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }} numberOfLines={1}>{d.sub}</RNText>
                  </View>
                  <Chevron />
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
