import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Title, Muted, Label, IconButton, Icon, ICON, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { questsFor, PARTNER, QUEST_CATEGORY } from '@/lib/quests';
import { play } from '@/lib/sound';

/** A room: every scene in one setting. */
export default function Room() {
  const t = useTheme();
  const { cat } = useLocalSearchParams<{ cat: string }>();
  const s = useStore();
  const list = questsFor(s.tone).filter((q) => q.category === cat);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ paddingTop: 12, gap: 6 }}>
          <Label color={t.accent}>Room</Label>
          <Title size={30}>{QUEST_CATEGORY[cat ?? ''] ?? cat}</Title>
          <Muted small>Live scenes. Each one is a real conversation with someone who reacts.</Muted>
        </View>
        <View style={{ marginTop: 20, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
          {list.map((q, i) => {
            const done = (s.questsDone ?? []).includes(q.id);
            return (
              <Pressable key={q.id} onPress={() => { play('select'); router.push({ pathname: '/quest/[id]', params: { id: q.id } }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: done ? t.ink3 : t.ink }}>{q.title}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>With {PARTNER[q.partner] ?? q.partner}{q.spicy ? ' · 18+' : ''}</RNText>
                </View>
                {done ? <Icon d={ICON.check} size={15} color={t.accent} stroke={2.4} /> : <Chevron />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
