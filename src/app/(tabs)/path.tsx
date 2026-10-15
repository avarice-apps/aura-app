import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Muted, Label, Row, Stack, Print, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, isPaid } from '@/state/store';
import { UNITS, ROMAN, isFreeLesson } from '@/lib/progress';
import { play } from '@/lib/sound';

const PRINT_FOR_UNIT: Record<string, 'faceHead' | 'bust' | 'faceAthlete' | 'faceAntinoos' | 'athlete'> = { intro: 'faceHead', stories: 'bust', pushback: 'faceAthlete', dates: 'faceAntinoos', rooms: 'athlete' };

/** The Path: units of lessons. Every lesson is a freshly generated live conversation. */
export default function Path() {
  const t = useTheme();
  const laurels = useStore((s) => s.laurels);
  const paid = useStore(isPaid);
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <Stack gap={4} style={{ paddingTop: 10 }}>
          <Label>Your development plan</Label>
          <Title size={34}>The Path</Title>
          <Muted small>Every lesson is a new conversation, built around your goal and the patterns Poise hears in you. Laurels need a repeat performance, not a lucky take.</Muted>
        </Stack>
        {UNITS.map((u, ui) => {
          const done = u.lessons.filter((l) => laurels[l.id]).length;
          return (
            <Animated.View key={u.id} entering={FadeInDown.duration(450).delay(ui * 80)} style={{ marginTop: 22 }}>
              <Row gap={14} style={{ alignItems: 'flex-end' }}>
                <Print name={PRINT_FOR_UNIT[u.id]} size={72} radius={4} />
                <Stack gap={2} style={{ flex: 1 }}>
                  <Label>#{ui + 1} · {done}/{u.lessons.length}</Label>
                  <Title size={24}>{u.title}</Title>
                </Stack>
              </Row>
              <View style={{ marginTop: 10, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 14 }}>
                {u.lessons.map((l, i) => {
                  const lvl = laurels[l.id] ?? 0;
                  const locked = !paid && !isFreeLesson(i);
                  const check = (l as any).checkpoint;
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
                      <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: lvl ? t.inverse : 'transparent', borderWidth: lvl ? 0 : 1, borderColor: t.lineStrong }}>
                        {lvl ? <RNText style={{ fontFamily: font.monoMedium, fontSize: 11, color: t.onInverse }}>{ROMAN[lvl]}</RNText> : locked ? <Icon d={ICON.lock} size={13} color={t.ink3} /> : <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink3 }}>{i + 1}</RNText>}
                      </View>
                      <Stack gap={1} style={{ flex: 1 }}>
                        <RNText style={{ fontFamily: check ? font.semibold : font.medium, fontSize: 15, color: locked ? t.ink3 : t.ink }}>{l.title}</RNText>
                        <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }} numberOfLines={1}>{l.objective}</RNText>
                      </Stack>
                      {check ? <Label color={t.accent}>Checkpoint</Label> : null}
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
