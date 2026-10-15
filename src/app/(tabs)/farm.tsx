import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Muted, Section, Icon, ICON, Row, ArtCard, OnBlue, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { play } from '@/lib/sound';

/** Farm: the social side. Farm-offs, Debate Duels, rating moments, reading profiles. Mostly free; built to be shared. */
export default function Farm() {
  const t = useTheme();
  const s = useStore();
  const [code, setCode] = useState('');
  const recent = [
    ...(s.duels ?? []).map((d) => ({ k: `d${d.code}`, title: d.topic, sub: `Duel ${d.code} · ${d.result ? 'judged' : 'waiting'}`, at: d.createdAt, go: () => router.push({ pathname: '/duel/[code]', params: { code: d.code } }) })),
    ...(s.moments ?? []).map((m, i) => ({ k: `m${i}`, title: m.title, sub: `Clip · ${m.total > 0 ? '+' : ''}${m.total} aura`, at: m.createdAt ?? '', go: () => router.push('/clip') })),
    ...(s.scans ?? []).slice(0, 10).map((r, i) => ({ k: `s${i}`, title: `${r.name} · ${r.archetype}`, sub: `Farm-off · ${r.score} ${r.tier}`, at: (r as any).createdAt ?? '', go: () => router.push('/aura-scan') })),
  ]
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 8);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: 8, gap: 4 }}>
          <Title size={30}>Farm</Title>
          <Muted small>Play it with friends. Rate what you see. Everything here is built to share.</Muted>
        </View>

        <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 14 }}>
          <ArtCard art="athlete" height={210} focus="top" onPress={() => router.push('/aura-scan')}>
            <OnBlue kicker="Farm-off · pass the phone" sub="Same prompt, fifteen seconds each on camera. Poise ranks who held it and who folded.">Who has the most aura?</OnBlue>
          </ArtCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(40)} style={{ marginTop: 10 }}>
          <Pressable onPress={() => { play('select'); router.push('/duel'); }} style={{ borderRadius: 22, backgroundColor: t.accent, padding: 18, gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 3 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>DEBATE DUEL</RNText>
                <RNText style={{ fontFamily: font.medium, fontSize: 20, color: '#FFF' }}>Argue it. Send it. Get judged.</RNText>
                <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>45 seconds each, opposite sides, whenever you both want.</RNText>
              </View>
              <Icon d={ICON.duel} size={22} color="#FFF" />
            </Row>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingLeft: 14, paddingRight: 6, height: 46 }}>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                placeholder="Have a duel code?"
                placeholderTextColor="rgba(255,255,255,0.65)"
                autoCapitalize="characters"
                autoCorrect={false}
                style={{ flex: 1, fontFamily: code ? font.mono : font.regular, fontSize: 15, letterSpacing: code ? 3 : 0, color: '#FFF' }}
              />
              <Pressable disabled={code.length < 5} onPress={() => { router.push({ pathname: '/duel/[code]', params: { code } }); setCode(''); }} style={{ height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: code.length === 5 ? '#FFF' : 'rgba(255,255,255,0.2)', justifyContent: 'center' }}>
                <RNText style={{ fontFamily: font.medium, fontSize: 13, color: code.length === 5 ? t.accent : 'rgba(255,255,255,0.7)' }}>Join</RNText>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>

        <Row gap={10} style={{ marginTop: 10 }}>
          {[
            { k: 'clip', label: 'Rate a clip', sub: 'Anyone’s moment, scored beat by beat', art: 'man' as const, go: () => router.push('/clip') },
            { k: 'ig', label: 'Profile read', sub: 'What your Instagram says', art: 'dora' as const, go: () => router.push('/profile-read') },
          ].map((x) => (
            <View key={x.k} style={{ flex: 1 }}>
              <ArtCard art={x.art} height={170} focus="top" onPress={x.go}>
                <RNText style={{ fontFamily: font.medium, fontSize: 16, color: '#FFF' }}>{x.label}</RNText>
                <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.85)' }}>{x.sub}</RNText>
              </ArtCard>
            </View>
          ))}
        </Row>

        {recent.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(120)} style={{ marginTop: 28 }}>
            <Section title="Recent" />
            <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
              {recent.map((r, i) => (
                <Pressable key={r.k} onPress={r.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <RNText numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{r.title}</RNText>
                    <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{r.sub}</RNText>
                  </View>
                  <Chevron />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}
