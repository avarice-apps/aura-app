import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Switch, Alert, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Card, Row, Stack, Print, Button, ListRow, Pill, Num, Tag, Serif } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, isPaid, auraIndex, ThemePref } from '@/state/store';
import { patterns, UNITS, ROMAN } from '@/lib/progress';
import { withdrawTraining } from '@/lib/api';
import { setSoundsEnabled, play } from '@/lib/sound';

export default function YouTab() {
  const t = useTheme();
  const s = useStore();
  const paid = isPaid(s);
  const idx = auraIndex(s.sessions);
  const pats = patterns(s.sessions, s.patternsDismissed);
  const [open, setOpen] = useState<string | null>(null);
  const laurelsByLevel = [0, 0, 0, 0];
  Object.values(s.laurels).forEach((l) => l && laurelsByLevel[l]++);
  const golds = UNITS.flatMap((u) => u.lessons).filter((l) => s.laurels[l.id] === 3);

  function askDelete() {
    Alert.alert('Delete everything?', 'Your sessions, receipts, cards and progress on this phone. Any training clips you consented to are withdrawn from the server too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (s.trainingConsent) await withdrawTraining(s.subjectId);
          s.reset();
          router.replace('/onboarding');
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Row gap={14} style={{ paddingTop: 10, alignItems: 'flex-end' }}>
          <Print name="bust" size={72} radius={6} />
          <Stack gap={2} style={{ flex: 1 }}>
            <Label>{paid ? 'Aura' : 'Free'}{s.trialEndsAt && paid ? ' · trial' : ''}</Label>
            <TextInput value={s.name} onChangeText={(v) => s.set({ name: v })} placeholder="Your name" placeholderTextColor={t.ink3} style={{ fontFamily: font.display, fontSize: 32, color: t.ink, padding: 0 }} />
          </Stack>
        </Row>

        {/* Portrait: the numbers that mean something */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <Card inverse style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Stack gap={0}><Num value={idx ?? '—'} size={44} color={t.onInverse} /><Label color={t.onInverse2}>Index</Label></Stack>
            <Stack gap={0}><Num value={s.sessions.length} size={44} color={t.onInverse} /><Label color={t.onInverse2}>Sessions</Label></Stack>
            <Stack gap={0}><Num value={laurelsByLevel[3]} size={44} color={t.onInverse} /><Label color={t.onInverse2}>Gold</Label></Stack>
            <Stack gap={0}><Num value={s.streak} size={44} color={t.onInverse} /><Label color={t.onInverse2}>Streak</Label></Stack>
          </Card>
        </Animated.View>

        {/* Patterns: recurring, with evidence, removable */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={{ marginTop: 22, gap: 10 }}>
          <Label>Your patterns · with the evidence</Label>
          {pats.length === 0 ? (
            <Card><Muted small>Patterns appear after a few sessions, each with the quotes behind it. You can inspect them, disagree, or remove one.</Muted></Card>
          ) : (
            pats.map((p) => (
              <Card key={p.key} style={{ gap: 8 }}>
                <Pressable onPress={() => { play('tap'); setOpen(open === p.key ? null : p.key); }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Body strong style={{ flex: 1 }}>{p.label}</Body>
                    <Tag label={`${p.count}×`} tone="accent" />
                  </Row>
                </Pressable>
                {open === p.key && (
                  <Stack gap={8}>
                    {p.evidence.map((e, i) => (
                      <View key={i} style={{ gap: 2 }}>
                        {e.quote ? <Serif size={17} italic>“{e.quote}”</Serif> : null}
                        <Muted small>{e.title} · {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Muted>
                      </View>
                    ))}
                    <Pressable onPress={() => s.set({ patternsDismissed: [...s.patternsDismissed, p.key] })} hitSlop={8}>
                      <Label color={t.accent}>That’s not me. Remove it</Label>
                    </Pressable>
                  </Stack>
                )}
              </Card>
            ))
          )}
        </Animated.View>

        {golds.length > 0 && (
          <View style={{ marginTop: 22, gap: 10 }}>
            <Label>Gold laurels · shown on a different day, with a different person</Label>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {golds.map((l) => <Tag key={l.id} label={`${l.title} ${ROMAN[3]}`} tone="inverse" />)}
            </Row>
          </View>
        )}

        {/* Settings */}
        <View style={{ marginTop: 22, gap: 10 }}>
          <Label>Look</Label>
          <Row gap={8}>
            {(['gallery', 'nocturne', 'system'] as ThemePref[]).map((th) => (
              <Pill key={th} label={th === 'gallery' ? 'Gallery' : th === 'nocturne' ? 'Night' : 'System'} active={s.theme === th} onPress={() => s.set({ theme: th })} />
            ))}
          </Row>
          <Card style={{ paddingVertical: 4 }}>
            <ListRow first title="Sounds" sub="Taps, reveals, the tick" right={<Switch value={s.sounds} onValueChange={(v) => { s.set({ sounds: v }); setSoundsEnabled(v); }} trackColor={{ true: t.accent }} />} />
            <ListRow title={paid ? 'Plan · Aura' : 'Plan · Free'} sub={paid ? 'Every lesson, every room' : 'First two lessons per unit'} onPress={() => router.push('/paywall')} />
          </Card>
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          <Label>Your data</Label>
          <Card style={{ paddingVertical: 4 }}>
            <ListRow
              first
              title="Help train Poise"
              sub={s.trainingConsent ? 'On. Your clips help the model learn. Withdraw any time.' : 'Off. Nothing is kept beyond the session.'}
              right={<Switch value={s.trainingConsent} onValueChange={async (v) => { if (!v) await withdrawTraining(s.subjectId); s.set({ trainingConsent: v }); }} trackColor={{ true: t.accent }} />}
            />
            <ListRow title="What Poise keeps" sub="Transcripts and measurements. Never raw face data." onPress={() => Alert.alert('What is kept', 'Each session stores the transcript, measured numbers (pace, fillers, pitch range, gaze ratio) and Poise’s notes on this phone. Audio and video are deleted after they are read. Face landmarks are reduced to numbers per frame and discarded. If you opt into training, the clip is kept on the server under a random id until you withdraw.')} />
            <ListRow title="Delete everything" sub="Local progress, and any training clips" onPress={askDelete} />
          </Card>
        </View>

        <View style={{ marginTop: 22, gap: 6 }}>
          <Label>About</Label>
          <Muted small>Aura rates a take, not a person. Several styles are valid. Poise measures what can be measured and says what it is interpreting.</Muted>
        </View>
      </ScrollView>
    </Screen>
  );
}
