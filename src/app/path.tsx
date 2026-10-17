import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Muted, Section, Icon, ICON, IconButton, Label } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { useTier } from '@/lib/plan';
import { UNITS, ROMAN, isFreeLesson, nextLesson } from '@/lib/progress';

/** The Presence Path: five units, one list each. The next lesson is the only thing in blue. */
export default function PathScreen() {
  const t = useTheme();
  const laurels = useStore((s) => s.laurels);
  const tier = useTier();
  const next = nextLesson(laurels);
  const total = UNITS.reduce((n, u) => n + u.lessons.length, 0);
  const done = UNITS.reduce((n, u) => n + u.lessons.filter((l) => laurels[l.id]).length, 0);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ paddingTop: 12, gap: 6 }}>
          <Label color={t.accent}>Program · {done}/{total}</Label>
          <Title size={30}>The Presence Path</Title>
          <Muted small>Five units. Every lesson is a new live conversation, built around your tells.</Muted>
        </View>
        {UNITS.map((u, ui) => {
          const unitDone = u.lessons.filter((l) => laurels[l.id]).length;
          return (
            <Animated.View key={u.id} entering={FadeInDown.duration(400).delay(ui * 50)} style={{ marginTop: 26 }}>
              <Section title={`${ui + 1} · ${u.title}`} note={`${unitDone}/${u.lessons.length}`} />
              <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 14 }}>
                {u.lessons.map((l, i) => {
                  const lvl = laurels[l.id] ?? 0;
                  const locked = tier === 'free' && !isFreeLesson(i);
                  const isNext = next.lesson.id === l.id;
                  const check = (l as { checkpoint?: boolean }).checkpoint;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        if (locked) router.push({ pathname: '/paywall', params: { reason: 'path' } });
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
