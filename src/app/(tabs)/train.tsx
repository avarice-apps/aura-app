import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Muted, Section, Icon, ICON, Row } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, isPaid } from '@/state/store';
import { UNITS, ROMAN, isFreeLesson, nextLesson } from '@/lib/progress';
import { play } from '@/lib/sound';

/** The Path: five units, one list each. The next lesson is the only thing in blue. */
export default function Path() {
  const t = useTheme();
  const laurels = useStore((s) => s.laurels);
  const paid = useStore(isPaid);
  const next = nextLesson(laurels);
  const total = UNITS.reduce((n, u) => n + u.lessons.length, 0);
  const done = UNITS.reduce((n, u) => n + u.lessons.filter((l) => laurels[l.id]).length, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 8, gap: 6 }}>
          <Title size={30}>Train</Title>
        </View>
        <Row gap={10} style={{ marginTop: 14 }}>
          {[
            { k: 'sit', label: 'Situations', sub: 'Ten seconds to read the room', icon: ICON.clock, go: () => router.push('/situations') },
            { k: 'scan', label: 'Aura Scan', sub: 'Fifteen seconds on camera', icon: ICON.scan, go: () => router.push('/aura-scan') },
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
        <View style={{ marginTop: 28, gap: 6 }}>
          <Section title="The Path" note={`${done}/${total}`} style={{ marginBottom: 0 }} />
          <Muted small>Every lesson is a new live conversation, built around you.</Muted>
        </View>

        {UNITS.map((u, ui) => {
          const unitDone = u.lessons.filter((l) => laurels[l.id]).length;
          return (
            <Animated.View key={u.id} entering={FadeInDown.duration(400).delay(ui * 60)} style={{ marginTop: 28 }}>
              <Section title={`${ui + 1} · ${u.title}`} note={`${unitDone}/${u.lessons.length}`} />
              <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 14 }}>
                {u.lessons.map((l, i) => {
                  const lvl = laurels[l.id] ?? 0;
                  const locked = !paid && !isFreeLesson(i);
                  const isNext = next.lesson.id === l.id;
                  const check = (l as { checkpoint?: boolean }).checkpoint;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => {
                        play('tap');
                        Haptics.selectionAsync();
                        if (locked) router.push('/paywall');
                        else router.push({ pathname: '/lesson/[id]', params: { id: l.id } });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: lvl ? t.accentSoft : isNext ? t.accent : 'transparent', borderWidth: lvl || isNext ? 0 : 1, borderColor: t.lineStrong }}>
                        {lvl ? (
                          <RNText style={{ fontFamily: font.medium, fontSize: 11, color: t.accent }}>{ROMAN[lvl]}</RNText>
                        ) : locked ? (
                          <Icon d={ICON.lock} size={13} color={t.ink3} />
                        ) : isNext ? (
                          <Icon d={ICON.play} size={10} fill={t.onAccent} />
                        ) : (
                          <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>{i + 1}</RNText>
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 1 }}>
                        <RNText style={{ fontFamily: font.medium, fontSize: 15, color: locked ? t.ink3 : t.ink }}>{l.title}</RNText>
                        <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }} numberOfLines={1}>{check ? 'Checkpoint · ' : ''}{l.objective}</RNText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
