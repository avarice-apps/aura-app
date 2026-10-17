import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, type Occasion } from '@/state/store';
import { Display, Kicker, Pill, Chip } from '@/components/Kit';
import { OCCASIONS, IMPRESSIONS, occasionFresh } from '@/lib/occasion';
import { play } from '@/lib/sound';
import { syncDirectContext } from '@/lib/direct';

const WHEN: { k: NonNullable<Occasion['when']>; label: string }[] = [
  { k: 'tonight', label: 'Tonight' },
  { k: 'tomorrow', label: 'Tomorrow' },
  { k: 'week', label: 'This week' },
  { k: 'later', label: 'Later' },
];

/**
 * Something coming up. One sheet, four quiet questions, and Today turns into "Tonight, handled.":
 * practise the moment, then choose the look. Kept on the phone; Poise hears it as context, never as orders.
 */
export default function OccasionSheet() {
  const t = useTheme();
  const s = useStore();
  const prev = occasionFresh(s.occasion) ? s.occasion : undefined;
  const [kind, setKind] = useState<string | undefined>(prev?.kind);
  const [what, setWhat] = useState(prev?.what ?? '');
  const [when, setWhen] = useState<Occasion['when']>(prev?.when ?? 'tonight');
  const [who, setWho] = useState(prev?.who ?? '');
  const [impression, setImpression] = useState(prev?.impression ?? '');
  const [target, setTarget] = useState(prev?.target ?? '');
  const ok = what.trim().length >= 3;

  function pick(k: string) {
    const o = OCCASIONS.find((x) => x.key === k)!;
    // Swapping presets replaces the text only if it was still the old preset's words.
    const old = OCCASIONS.find((x) => x.key === kind)?.what;
    if (!what.trim() || what === old) setWhat(o.what);
    setKind(k);
  }

  function save() {
    if (!ok) return;
    play('select');
    s.set({
      occasion: {
        what: what.trim().slice(0, 140),
        kind,
        when,
        who: who.trim().slice(0, 140) || undefined,
        impression: impression || undefined,
        target: target.trim().slice(0, 140) || undefined,
        createdAt: prev?.createdAt && prev.when === when ? prev.createdAt : new Date().toISOString(),
        lookId: prev?.lookId,
        practised: prev?.practised,
      },
    });
    syncDirectContext();
    router.back();
  }

  const field = { fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: t.ink, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.line } as const;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ICON.close} size={15} color={t.ink} />
          </Pressable>
          {prev ? (
            <Pressable onPress={() => { s.set({ occasion: undefined }); router.back(); }} hitSlop={10}>
              <RNText style={{ fontFamily: font.regular, fontSize: 14, color: t.ink2 }}>It’s over · clear it</RNText>
            </Pressable>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
            <Kicker>Something coming up</Kicker>
            <Display text="What’s the " em="moment?" size={40} />
            <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>Tell Poise once. You’ll get the scene to practise and the look for it.</RNText>
          </Animated.View>

          <Animated.View entering={FadeIn.duration(400).delay(80)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
            {OCCASIONS.map((o) => (
              <Chip key={o.key} label={o.label} on={kind === o.key} onPress={() => pick(o.key)} />
            ))}
          </Animated.View>

          <View style={{ marginTop: 22, gap: 22 }}>
            <View>
              <Kicker>In your words</Kicker>
              <TextInput value={what} onChangeText={setWhat} placeholder="Dinner with her friends at a place I’ve never been" placeholderTextColor={t.ink3} multiline maxLength={140} style={field} />
            </View>

            <View style={{ gap: 10 }}>
              <Kicker>When</Kicker>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {WHEN.map((w) => (
                  <Chip key={w.k} label={w.label} on={when === w.k} onPress={() => setWhen(w.k)} />
                ))}
              </View>
            </View>

            <View>
              <Kicker>Who’ll be there</Kicker>
              <TextInput value={who} onChangeText={setWho} placeholder="Six people. I know two of them." placeholderTextColor={t.ink3} maxLength={140} style={field} />
            </View>

            <View style={{ gap: 10 }}>
              <Kicker>How you want to come across</Kicker>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {IMPRESSIONS.map((x) => (
                  <Chip key={x} label={x} on={impression === x} onPress={() => setImpression(impression === x ? '' : x)} />
                ))}
              </View>
            </View>

            <View>
              <Kicker>The one part to get right</Kicker>
              <TextInput value={target} onChangeText={setTarget} placeholder="Walking in and the first ten minutes" placeholderTextColor={t.ink3} maxLength={140} style={field} />
            </View>
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
          <Pill label={prev ? 'Save' : 'Set it'} onPress={save} disabled={!ok} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
