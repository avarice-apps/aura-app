import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Title, Body, Muted, Label, Card, Row, Button, Icon, ICON, ListRow, Tag, Statue, Halo, Section } from '@/ui';
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
        <View style={{ paddingTop: 8, gap: 6 }}>
          <Title size={30}>Aura Scan</Title>
          <Muted small>A prompt, fifteen seconds on camera, a reveal. Pass the phone round.</Muted>
        </View>
        <Animated.View entering={FadeInDown.duration(500)} style={{ height: 220, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          <View style={{ position: 'absolute' }}><Halo size={260} opacity={0.5} /></View>
          <Statue name="antinoos" height={210} />
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
        <Button label="Upload a clip instead" variant="ghost" onPress={upload} icon={<Icon d={ICON.upload} size={16} color={t.accent} />} />

        <Muted small align="center" style={{ marginTop: 6 }}>Rates the take, not the person. Clips are deleted after they’re read.</Muted>

        {scans.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Section title="Your cards" note={`${scans.length}`} />
            <Card style={{ paddingVertical: 4 }}>
              {scans.slice(0, 8).map((r, i) => (
                <ListRow key={i} first={i === 0} title={`${r.name} · ${r.archetype}`} sub={r.prompt} right={<Tag label={`${r.score} · ${r.tier}`} tone="accent" />} />
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
