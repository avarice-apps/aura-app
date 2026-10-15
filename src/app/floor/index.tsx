import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Muted, Label, IconButton, Icon, ICON, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { floorsFor } from '@/lib/floors';
import { PARTNER } from '@/lib/quests';
import { play } from '@/lib/sound';

/** Open Floor: continuous live scenes. No turn limit; people arrive, things escalate, you end it. */
export default function FloorList() {
  const t = useTheme();
  const s = useStore();
  const list = floorsFor(s.tone);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ paddingTop: 12, gap: 6 }}>
          <Label color={t.accent}>Open Floor</Label>
          <Title size={30}>Stay in it.</Title>
          <Muted small>No script and no turn limit. Other people show up, it gets harder, and it ends when you hang up or they walk off.</Muted>
        </View>
        <View style={{ marginTop: 20, gap: 10 }}>
          {list.map((f, i) => (
            <Animated.View key={f.id} entering={FadeInDown.duration(380).delay(i * 40)}>
              <Pressable onPress={() => { play('select'); router.push({ pathname: '/floor/[id]', params: { id: f.id } }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{f.title}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{f.blurb}</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 0.6, color: t.ink3, marginTop: 2 }}>
                    {[PARTNER[f.primary] ?? f.primary, ...Object.keys(f.roles)].join(' · ').toUpperCase()}{f.spicy ? '  ·  18+' : ''}
                  </RNText>
                </View>
                <Chevron />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
