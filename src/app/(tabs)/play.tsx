import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Screen, Title, Muted, Section, Icon, ICON, Row, ArtCard, OnBlue, Statue, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { UNITS, nextLesson } from '@/lib/progress';
import { questsFor, QUEST_CATEGORY, CATEGORY_ORDER } from '@/lib/quests';
import { useTier, remaining } from '@/lib/plan';
import { ToneSwitch } from '@/components/ToneSwitch';
import { play } from '@/lib/sound';
import { getChallenge } from '@/lib/api';

const ROOM_STATUE: Record<string, 'head' | 'athlete' | 'bust' | 'antinoos' | 'bustDark'> = { dating: 'antinoos', night: 'bustDark', approach: 'athlete', work: 'bust', money: 'bust', service: 'head', conflict: 'bust', friends: 'athlete', status: 'head' };

/**
 * Play: the loud side. Live scenes, games with friends, the Path. Big blue prints, short words.
 */
export default function Play() {
  const t = useTheme();
  const s = useStore();
  const tier = useTier();
  const next = nextLesson(s.laurels);
  const total = UNITS.reduce((n, u) => n + u.lessons.length, 0);
  const done = UNITS.reduce((n, u) => n + u.lessons.filter((l) => s.laurels[l.id]).length, 0);
  const counts = questsFor(s.tone).reduce<Record<string, number>>((acc, q) => ({ ...acc, [q.category]: (acc[q.category] ?? 0) + 1 }), {});
  const rooms = CATEGORY_ORDER.filter((c) => counts[c]).map((c) => [c, counts[c]] as const);
  const calls = remaining('calls');
  const mins = s.account?.live_min_left;
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');

  const recent = [
    ...(s.duels ?? []).map((d) => ({ k: `d${d.code}`, title: d.topic, sub: `Duel ${d.code} · ${d.result ? 'judged' : 'waiting'}`, at: d.createdAt, go: () => router.push({ pathname: '/duel/[code]', params: { code: d.code } }) })),
    ...(s.tribunals ?? []).map((x) => ({ k: `t${x.code}`, title: x.topic, sub: `Tribunal ${x.code}`, at: x.createdAt, go: () => router.push({ pathname: '/tribunal/[code]', params: { code: x.code } }) })),
    ...(s.challenges ?? []).map((c) => ({ k: `c${c.code}`, title: c.title, sub: `Challenge ${c.code}`, at: c.createdAt, go: () => router.push({ pathname: '/challenge/[code]', params: { code: c.code } }) })),
    ...(s.moments ?? []).map((m, i) => ({ k: `m${i}`, title: m.title, sub: `Aura check · ${m.total > 0 ? '+' : ''}${m.total} aura`, at: m.createdAt ?? '', go: () => router.push('/capture') })),
    ...(s.fits ?? []).slice(0, 10).map((f, i) => ({ k: `f${i}`, title: `${f.tier} · ${f.score}`, sub: `Fit check · ${f.verdict}`, at: f.createdAt ?? '', go: () => router.push({ pathname: '/capture', params: { mode: 'fit' } }) })),
    ...(s.scans ?? []).slice(0, 10).map((r, i) => ({ k: `s${i}`, title: `${r.name} · ${r.archetype}`, sub: `Farm-off · ${r.score} ${r.tier}`, at: (r as any).createdAt ?? '', go: () => router.push('/aura-scan') })),
  ]
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 5);

  const allowance =
    tier === 'free'
      ? `${calls} free call${calls === 1 ? '' : 's'} left this week. The Daily Side Quest is always free.`
      : typeof mins === 'number'
        ? `${mins} live minute${mins === 1 ? '' : 's'} left this week.`
        : 'Talk as long as the scene lasts.';

  // One box for every code: tribunals are six characters starting with T; challenges and duels are five.
  async function join(c: string) {
    setCode('');
    setJoining(false);
    if (c.length === 6 && c.startsWith('T')) {
      router.push({ pathname: '/tribunal/[code]', params: { code: c } });
      return;
    }
    try {
      await getChallenge(c);
      router.push({ pathname: '/challenge/[code]', params: { code: c } });
    } catch {
      router.push({ pathname: '/duel/[code]', params: { code: c } });
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between', paddingTop: 8 }}>
          <Title size={30}>Play</Title>
          <ToneSwitch />
        </Row>
        <Muted small style={{ marginTop: 4 }}>{allowance}</Muted>

        {/* Open Floor */}
        <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 14 }}>
          <ArtCard art="apollo" height={220} focus="top" onPress={() => router.push('/floor')}>
            <OnBlue kicker="Open Floor · no turn limit" sub="A real conversation that keeps going. People join. It gets harder.">Stay in it</OnBlue>
          </ArtCard>
        </Animated.View>

        {/* With friends */}
        <Animated.View entering={FadeInDown.duration(400).delay(40)} style={{ marginTop: 28 }}>
          <Section title="With friends" note="Pass the phone" />
          <ArtCard art="lovers" height={200} focus="top" onPress={() => router.push('/table')}>
            <OnBlue kicker="The Table · 3 to 8 players" sub="Poise gives everyone a secret mission. You just talk. Then the reveal.">Poise hosts dinner.</OnBlue>
          </ArtCard>
          <Row gap={10} style={{ marginTop: 10 }}>
            {[
              { k: 'farmoff', label: 'Farm-off', sub: 'Fifteen seconds each. One winner.', art: 'man' as const, go: () => router.push('/aura-scan') },
              { k: 'aura', label: 'Aura check', sub: 'Film any moment. Every beat rated.', art: 'athlete' as const, go: () => router.push('/capture') },
            ].map((x) => (
              <View key={x.k} style={{ flex: 1 }}>
                <ArtCard art={x.art} height={170} focus="top" onPress={x.go}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 17, color: '#FFF' }}>{x.label}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.85)' }}>{x.sub}</RNText>
                </ArtCard>
              </View>
            ))}
          </Row>
          {/* Debate Duel: two clear actions; the code box only when you ask for it */}
          <View style={{ marginTop: 10, borderRadius: 22, backgroundColor: t.inverse, padding: 18, gap: 14 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 3 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>DEBATE DUEL</RNText>
                <RNText style={{ fontFamily: font.medium, fontSize: 21, color: '#FFF' }}>Argue it. Send it. Get judged.</RNText>
                <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>45 seconds each, opposite sides, whenever you both want.</RNText>
              </View>
              <Icon d={ICON.duel} size={22} color="#FFF" />
            </Row>
            {joining ? (
              <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingLeft: 14, paddingRight: 6, height: 48 }}>
                <TextInput
                  autoFocus
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="The code they sent"
                  placeholderTextColor="rgba(255,255,255,0.65)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onSubmitEditing={() => code.length >= 5 && join(code)}
                  style={{ flex: 1, fontFamily: code ? font.mono : font.regular, fontSize: 15, letterSpacing: code ? 3 : 0, color: '#FFF' }}
                />
                <Pressable disabled={code.length < 5} onPress={() => join(code)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: code.length >= 5 ? '#FFF' : 'rgba(255,255,255,0.2)', justifyContent: 'center' }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 13, color: code.length >= 5 ? t.inverse : 'rgba(255,255,255,0.7)' }}>Join</RNText>
                </Pressable>
              </Animated.View>
            ) : (
              <Row gap={8}>
                <Pressable onPress={() => { play('select'); router.push('/duel'); }} style={{ height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: '#FFF', justifyContent: 'center' }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.inverse }}>Start a duel</RNText>
                </Pressable>
                <Pressable onPress={() => { play('tap'); setJoining(true); }} style={{ height: 42, paddingHorizontal: 18, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center' }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 14, color: '#FFF' }}>Join with a code</RNText>
                </Pressable>
              </Row>
            )}
          </View>
          <Pressable onPress={() => { play('select'); router.push('/tribunal'); }} style={({ pressed }) => ({ marginTop: 10, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ flex: 1, gap: 3 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: t.ink3 }}>TRIBUNAL · IN WRITING</RNText>
              <RNText style={{ fontFamily: font.serif, fontSize: 26, lineHeight: 28, color: t.ink }}>Settle something.</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink2 }}>An opening each, one reply, then Poise rules. Draws allowed. Or find where you actually disagree.</RNText>
            </View>
            <Statue name="bust" height={86} />
          </Pressable>
          <Row gap={10} style={{ marginTop: 10 }}>
            {[
              { k: 'fit', label: 'Fit check', sub: 'Yours or a friend’s. Honest.', art: 'pitt' as const, go: () => router.push({ pathname: '/capture', params: { mode: 'fit' } }) },
              { k: 'ig', label: 'Profile read', sub: 'What your page says', art: 'dora' as const, go: () => router.push('/profile-read') },
            ].map((x) => (
              <View key={x.k} style={{ flex: 1 }}>
                <ArtCard art={x.art} height={170} focus="top" onPress={x.go}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 17, color: '#FFF' }}>{x.label}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.85)' }}>{x.sub}</RNText>
                </ArtCard>
              </View>
            ))}
          </Row>
        </Animated.View>

        {/* Side quests */}
        <Animated.View entering={FadeInDown.duration(400).delay(80)} style={{ marginTop: 28 }}>
          <Section title="Side quests" note={`${Object.values(counts).reduce((a, b) => a + b, 0)} scenes`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {rooms.map(([cat, n]) => (
              <Pressable key={cat} onPress={() => { play('select'); router.push({ pathname: '/room/[cat]', params: { cat } }); }} style={{ width: 140, height: 176, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                <View style={{ padding: 14, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{QUEST_CATEGORY[cat] ?? cat}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{n} scene{n === 1 ? '' : 's'}</RNText>
                </View>
                <View style={{ position: 'absolute', bottom: -6, left: 0, right: 0, alignItems: 'center' }}>
                  <Statue name={ROOM_STATUE[cat] ?? 'head'} height={110} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Rehearse */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={{ marginTop: 12 }}>
          <Pressable onPress={() => { play('select'); router.push('/rehearse'); }} style={{ borderRadius: 22, backgroundColor: t.dark ? t.card : t.ink, borderWidth: t.dark ? 1 : 0, borderColor: t.line, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.6)' }}>KLEOS+</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 18, color: '#FFF' }}>Rehearse your real situation</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Tomorrow’s date, the raise, the apology. Describe it, play it tonight.</RNText>
            </View>
            <Icon d={tier !== 'free' ? ICON.play : ICON.lock} size={16} color="#FFF" fill={tier !== 'free' ? '#FFF' : undefined} />
          </Pressable>
        </Animated.View>

        {/* The Path */}
        <Animated.View entering={FadeInDown.duration(400).delay(120)} style={{ marginTop: 28 }}>
          <Section title="The Path" note={`${done}/${total}`} onNote={() => router.push('/path')} />
          <ArtCard art="couple" height={190} focus="top" onPress={() => router.push('/path')}>
            <OnBlue kicker={`The Presence Path · ${next.unit.title}`} sub={`Next: ${next.lesson.title}`}>Five units, one skill at a time</OnBlue>
            <View style={{ marginTop: 10, height: 3, width: 160, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }}>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: '#FFF', width: `${Math.max(4, (done / total) * 100)}%` }} />
            </View>
          </ArtCard>
        </Animated.View>

        {/* Quick reps */}
        <Animated.View entering={FadeInDown.duration(400).delay(160)} style={{ marginTop: 28 }}>
          <Section title="Quick reps" note="Two minutes" />
          <View style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 16 }}>
            {[
              { k: 'sit', label: 'Situations', sub: 'Ten seconds. Pick the move.', go: () => router.push('/situations') },
              { k: 'codes', label: 'Codes', sub: 'Two-minute reads', go: () => router.push('/codes') },
              { k: 'missions', label: 'Field missions', sub: 'Do it for real, then tell Poise', go: () => router.push('/missions') },
            ].map((x, i) => (
              <Pressable key={x.k} onPress={() => { play('select'); x.go(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{x.label}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{x.sub}</RNText>
                </View>
                <Chevron />
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {recent.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(180)} style={{ marginTop: 28 }}>
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
