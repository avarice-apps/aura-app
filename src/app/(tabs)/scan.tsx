import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Title, Body, Muted, Label, Card, Row, Stack, Print, Button, Icon, ICON, ListRow, Tag } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { useScan, ScanMode } from '@/state/scanSession';
import { play } from '@/lib/sound';

/** Aura Scan · Pass the Phone. A situation, a 15-second performance, a reveal. Back camera, so it's a game for the room. */
export default function ScanTab() {
  const t = useTheme();
  const scans = useStore((s) => s.scans);
  const myName = useStore((s) => s.name);
  const scan = useScan();
  const [mode, setMode] = useState<ScanMode>('solo');
  const [names, setNames] = useState<string[]>(['', '']);

  function start() {
    play('select');
    if (mode === 'party') {
      const ps = names.map((n) => n.trim()).filter(Boolean);
      if (ps.length < 2) return;
      scan.begin('party', ps);
    } else {
      scan.begin('solo', [myName || 'You']);
    }
    router.push('/scan/consent');
  }

  async function upload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 30, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    scan.begin('upload', ['Clip']);
    scan.set({ uploadUri: res.assets[0].uri });
    router.push('/scan/consent');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 10, borderRadius: 22, backgroundColor: t.inverse, overflow: 'hidden' }}>
          <Print name="antinoos" radius={0} style={{ width: '100%', aspectRatio: 1.35 }} />
          <View style={{ padding: 18, gap: 4 }}>
            <Label color={t.onInverse2}>Aura Scan · Pass the phone</Label>
            <Title size={30} color={t.onInverse}>A prompt. Fifteen seconds. A reveal.</Title>
            <Muted small color={t.onInverse2}>Back camera. Hand it round. Everyone gets a card. Nothing is saved unless they choose.</Muted>
          </View>
        </Animated.View>

        <Row gap={8} style={{ marginTop: 16 }}>
          {(['solo', 'party'] as ScanMode[]).map((m) => (
            <Pressable key={m} onPress={() => { play('tap'); setMode(m); }} style={{ flex: 1, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: mode === m ? t.accent : t.line, backgroundColor: mode === m ? t.accentSoft : t.card, gap: 2 }}>
              <Label color={mode === m ? t.accent : undefined}>{m === 'solo' ? 'Just me' : 'Party'}</Label>
              <Body small>{m === 'solo' ? 'One take, your card.' : 'Take turns. Leaderboard at the end.'}</Body>
            </Pressable>
          ))}
        </Row>

        {mode === 'party' && (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Card style={{ marginTop: 10, gap: 8 }}>
              <Label>Who’s playing</Label>
              {names.map((n, i) => (
                <TextInput key={i} value={n} onChangeText={(v) => setNames(names.map((x, k) => (k === i ? v : x)))} placeholder={`Player ${i + 1}`} placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 15, color: t.ink, paddingVertical: 8, borderBottomWidth: 1, borderColor: t.cardAlt }} />
              ))}
              {names.length < 8 && (
                <Pressable onPress={() => setNames([...names, ''])} hitSlop={8}>
                  <Label color={t.accent}>+ Add a player</Label>
                </Pressable>
              )}
            </Card>
          </Animated.View>
        )}

        <Button label={mode === 'party' ? 'Start the round' : 'Scan me'} style={{ marginTop: 14 }} onPress={start} disabled={mode === 'party' && names.filter((n) => n.trim()).length < 2} />
        <Button label="Upload a clip instead" variant="ghost" onPress={upload} icon={<Icon d={ICON.upload} size={16} color={t.ink} />} />

        <Card style={{ marginTop: 16, gap: 6 }}>
          <Label>What it reads</Label>
          <Body small color={t.ink2}>Delivery, composure, command and posture, from how you spoke and held yourself for fifteen seconds. It rates the performance, not the person. No face data is kept, and a clip of someone else is read from voice and posture only.</Body>
        </Card>

        {scans.length > 0 && (
          <View style={{ marginTop: 22, gap: 10 }}>
            <Label>Your cards</Label>
            <Card style={{ paddingVertical: 4 }}>
              {scans.slice(0, 8).map((r, i) => (
                <ListRow key={i} first={i === 0} title={`${r.name} · ${r.archetype}`} sub={r.prompt} right={<Tag label={`${r.score} · ${r.tier}`} tone="inverse" />} />
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
