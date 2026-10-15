import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, IconButton, Icon, ICON, Section } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';

/** Field missions: do it in real life, then debrief with Poise. */
export default function Missions() {
  const t = useTheme();
  const s = useStore();
  const active = ALL_MISSIONS.find((m) => m.id === s.activeMission);
  const open = ALL_MISSIONS.filter((m) => !s.missionsDone.includes(m.id) && m.id !== s.activeMission);
  const done = ALL_MISSIONS.filter((m) => s.missionsDone.includes(m.id));

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ paddingTop: 12, gap: 6 }}>
          <Title size={30}>Field missions</Title>
          <Muted small>Real life is the real test. Pick one, do it this week, then tell Poise how it went.</Muted>
        </View>

        {active && (
          <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 22, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 20, gap: 8 }}>
            <Label color={t.accent}>Active · {active.skill}</Label>
            <Title size={22}>{active.title}</Title>
            <Body small color={t.ink2}>{active.task}</Body>
            <Pressable
              onPress={() => {
                play('select');
                router.push({ pathname: '/(tabs)/poise', params: { mission: active.id } });
              }}
              style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, height: 40, justifyContent: 'center' }}
            >
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>I did it · debrief me</RNText>
            </Pressable>
          </Animated.View>
        )}

        <View style={{ marginTop: 28 }}>
          <Section title={active ? 'Up next' : 'Pick one'} note={`${done.length} done`} />
          <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
            {open.map((m, i) => (
              <Pressable key={m.id} onPress={() => { s.set({ activeMission: m.id }); play('select'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{m.title}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }} numberOfLines={2}>{m.task}</RNText>
                </View>
                <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.accent }}>Start</RNText>
              </Pressable>
            ))}
          </View>
        </View>

        {done.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Section title="Done" />
            <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
              {done.map((m, i) => (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                  <Icon d={ICON.check} size={16} color={t.accent} stroke={2.4} />
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink3, flex: 1 }}>{m.title}</RNText>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
