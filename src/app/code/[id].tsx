import React from 'react';
import { View, ScrollView, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Label, IconButton, Icon, ICON, Button } from '@/ui';
import { font, useTheme } from '@/theme';
import CODES from '../../../content/codes.json';

/** A code: a two-minute read, one idea per paragraph. */
export default function Code() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = CODES.codes.find((x) => x.id === id);
  if (!c) return null;
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ paddingTop: 16, gap: 8 }}>
          <Label color={t.accent}>Code · {c.minutes} min</Label>
          <Title size={32}>{c.title}</Title>
        </View>
        <View style={{ marginTop: 20, gap: 18 }}>
          {c.lines.map((l, i) => (
            <Animated.View key={i} entering={FadeInDown.duration(400).delay(i * 70)} style={{ flexDirection: 'row', gap: 14 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent, width: 20, paddingTop: 4 }}>{String(i + 1).padStart(2, '0')}</RNText>
              <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 17, lineHeight: 26, color: t.ink }}>{l}</RNText>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button label="Practise it live" sound="select" onPress={() => router.push('/(tabs)/live')} />
      </View>
    </Screen>
  );
}
