import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Card, Row, Stack, Num, Print, ListRow, Icon, ICON, Tag } from '@/ui';
import { useTheme } from '@/theme';
import { useStore, auraIndex, isPaid } from '@/state/store';
import { nextLesson, ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';

const PRINT_FOR_UNIT: Record<string, 'faceHead' | 'bust' | 'faceAthlete' | 'faceAntinoos' | 'athlete'> = { intro: 'faceHead', stories: 'bust', pushback: 'faceAthlete', dates: 'faceAntinoos', rooms: 'athlete' };

export default function Today() {
  const t = useTheme();
  const s = useStore();
  const idx = auraIndex(s.sessions);
  const next = nextLesson(s.laurels);
  const laurelCount = Object.values(s.laurels).filter(Boolean).length;
  const hour = new Date().getHours();
  const evening = hour >= 19 || hour < 3;
  const mission = ALL_MISSIONS.find((m) => m.id === s.activeMission) ?? ALL_MISSIONS.find((m) => !s.missionsDone.includes(m.id))!;
  const latest = s.receipts[0];
  const lastEval = s.sessions[0] && (s.sessions[0].retry ?? s.sessions[0].evaluation);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <Row style={{ justifyContent: 'space-between', paddingTop: 10 }}>
          <Stack gap={2}>
            <Label>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Label>
            <Title size={26}>{hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'}{s.name ? `, ${s.name}` : ''}</Title>
          </Stack>
          {!isPaid(s) && <Pressable onPress={() => router.push('/paywall')}><Tag label="Free" tone="accent" /></Pressable>}
        </Row>

        {/* Index block: cobalt */}
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 16, borderRadius: 22, backgroundColor: t.inverse, overflow: 'hidden', flexDirection: 'row' }}>
          <View style={{ flex: 1, padding: 18, gap: 4 }}>
            <Label color={t.onInverse2}>Aura Index</Label>
            <Row style={{ alignItems: 'baseline' }} gap={8}>
              <Num value={idx ?? '—'} size={74} color={t.onInverse} />
              {idx !== null && <Label color={t.onInverse2}>Provisional</Label>}
            </Row>
            <Row gap={14} style={{ marginTop: 6 }}>
              <Stack gap={0}>
                <Body strong color={t.onInverse}>{s.streak}</Body>
                <Label color={t.onInverse2}>Day streak</Label>
              </Stack>
              <Stack gap={0}>
                <Body strong color={t.onInverse}>{laurelCount}</Body>
                <Label color={t.onInverse2}>Laurels</Label>
              </Stack>
            </Row>
          </View>
          <Print name="faceAthlete" size={150} radius={0} style={{ alignSelf: 'stretch' }} />
        </Animated.View>

        {/* Next lesson */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)}>
          <Pressable
            onPress={() => {
              play('select');
              router.push({ pathname: '/lesson/[id]', params: { id: next.lesson.id } });
            }}
            style={{ marginTop: 14, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center' }}
          >
            <Print name={PRINT_FOR_UNIT[next.unit.id] ?? 'faceHead'} size={84} radius={6} />
            <Stack gap={4} style={{ flex: 1 }}>
              <Label>#{next.index + 1} {next.unit.title}</Label>
              <Title size={22}>{next.lesson.title}</Title>
              <Muted small numberOfLines={2}>{next.lesson.objective}</Muted>
            </Stack>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ICON.play} size={13} fill={t.onInverse} />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(200)}>
          <Card style={{ marginTop: 14, paddingVertical: 4 }}>
            <ListRow first title="Situation of the day" sub="Ten seconds to read the room" left={<Dot t={t} d={ICON.clock} />} onPress={() => router.push('/situations')} />
            <ListRow title={`Mission · ${mission.title}`} sub={mission.task} left={<Dot t={t} d={ICON.flag} />} onPress={() => router.push('/(tabs)/poise')} />
            {evening ? (
              <ListRow title="Tonight's debrief" sub="Sixty seconds with Poise about one moment from today" left={<Dot t={t} d={ICON.moon} />} onPress={() => router.push({ pathname: '/(tabs)/poise', params: { mode: 'debrief' } })} />
            ) : (
              <ListRow title="Aura Scan" sub="Point it at a friend. Party mode for the group." left={<Dot t={t} d={ICON.scan} />} onPress={() => router.push('/(tabs)/scan')} />
            )}
          </Card>
        </Animated.View>

        {(latest || lastEval) && (
          <Animated.View entering={FadeInDown.duration(500).delay(300)}>
            <Card inverse style={{ marginTop: 14, gap: 6 }}>
              <Label color={t.onInverse2}>Poise</Label>
              <Body color={t.onInverse}>{latest ? latest.headline : lastEval!.change.text}</Body>
            </Card>
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Dot({ t, d }: { t: ReturnType<typeof useTheme>; d: string }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon d={d} size={16} color={t.accent} />
    </View>
  );
}
