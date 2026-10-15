import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { Screen, Title, Muted, Label, IconButton, Icon, ICON, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import CODES from '../../content/codes.json';
import { play } from '@/lib/sound';

/** Codes: two-minute reads. One idea each. */
export default function Codes() {
  const t = useTheme();
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ paddingTop: 12, gap: 6 }}>
          <Label color={t.accent}>Codes</Label>
          <Title size={30}>Two-minute reads.</Title>
          <Muted small>One idea each. Read it, then go use it on a live call.</Muted>
        </View>
        <View style={{ marginTop: 20, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
          {CODES.codes.map((c, i) => (
            <Pressable key={c.id} onPress={() => { play('tap'); router.push({ pathname: '/code/[id]', params: { id: c.id } }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
              <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: t.ink }}>{c.title}</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink3 }}>{c.minutes} MIN</RNText>
              <Chevron />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
