import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON, ArtCard } from '@/ui';
import { font, useTheme, type ArtName } from '@/theme';
import { useStore } from '@/state/store';
import { Pill } from '@/components/Kit';
import { HearPoise } from '@/components/Results';
import { LabPanel } from '@/components/LabPanel';
import { promptById } from '@/lib/mirror';
import { titleOf } from './index';

const ART: Record<string, ArtName> = {
  hedge: 'man', apologist: 'aphrodite', sprinter: 'athlete', statue: 'vespasian', pleaser: 'lisa', blade: 'trajan', anchor: 'aurelius', current: 'apollo',
};
const AXIS: Record<string, string> = { voice: 'VOICE', presence: 'PRESENCE', command: 'COMMAND', composure: 'COMPOSURE' };

/** One take, read: the number and the type, Poise's voice note, three tells, the measurements, and one drill. */
export default function MirrorRead() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reads = useStore((s) => s.mirror ?? []);
  const r = reads.find((x) => x.id === id);
  if (!r) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: 28, justifyContent: 'center', gap: 12 }}>
          <RNText style={{ fontFamily: font.serif, fontSize: 32, color: t.ink }}>That take isn’t here any more.</RNText>
          <Pill label="Back to the Mirror" onPress={() => router.replace('/mirror')} />
        </View>
      </Screen>
    );
  }
  const prev = reads.find((x) => x.promptId === r.promptId && !x.safety && x.createdAt < r.createdAt);
  const date = new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/mirror'))} hitSlop={10} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICON.back} size={16} color={t.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 12 }} showsVerticalScrollIndicator={false}>
        {r.safety ? (
          <View style={{ paddingTop: 40, gap: 12 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 30, lineHeight: 36, color: t.ink }}>{r.script}</RNText>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(450)}>
              <ArtCard art={ART[r.archetype] ?? 'aurelius'} height={280} focus="top">
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>{`THE MIRROR · ${date.toUpperCase()}`}</RNText>
                    <RNText style={{ fontFamily: font.medium, fontSize: 28, lineHeight: 31, letterSpacing: -0.8, color: '#FFF' }}>{titleOf(r.archetype)}</RNText>
                    <RNText numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 18, color: 'rgba(255,255,255,0.86)' }}>{promptById(r.promptId).text}</RNText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <RNText style={{ fontFamily: font.medium, fontSize: 60, lineHeight: 62, letterSpacing: -2, color: '#FFF' }}>{r.index}</RNText>
                    <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.75)' }}>
                      {prev ? `${r.index - prev.index >= 0 ? '+' : ''}${r.index - prev.index} · INDEX` : `INDEX ±${r.band || 12}`}
                    </RNText>
                  </View>
                </View>
              </ArtCard>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(450).delay(80)}>
              <HearPoise src={r.audioUrl ?? undefined} />
            </Animated.View>

            {/* what they said: the one judged part, labelled as such */}
            {r.landed ? (
              <Animated.View entering={FadeInDown.duration(450).delay(120)} style={{ borderRadius: 20, borderWidth: 1, borderColor: t.line, padding: 16, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6, color: t.ink3 }}>WHAT YOU SAID · JUDGED</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink2 }}>{r.landed.score}</RNText>
                </View>
                <RNText style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 20, color: t.ink }}>{r.landed.why}</RNText>
              </Animated.View>
            ) : null}

            {/* three tells */}
            {r.tells.map((x, i) => (
              <Animated.View key={x.id ?? i} entering={FadeInDown.duration(450).delay(160 + i * 60)} style={{ borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, gap: 6 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: t.accent }}>{`TELL ${i + 1} · ${AXIS[x.axis] ?? x.axis.toUpperCase()}`}</RNText>
                <RNText style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 28, color: t.ink }}>{x.title}</RNText>
                <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2 }}>{x.evidence}</RNText>
              </Animated.View>
            ))}

            <Animated.View entering={FadeInDown.duration(450).delay(360)}>
              <LabPanel measures={r.measures} previous={prev?.measures} />
            </Animated.View>

            {r.drill?.title ? (
              <Animated.View entering={FadeInDown.duration(450).delay(420)} style={{ borderRadius: 22, backgroundColor: t.inverse, padding: 18, gap: 8 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: t.onInverse2 }}>{`YOUR DRILL · ${r.drill.minutes || 3} MINUTES`}</RNText>
                <RNText style={{ fontFamily: font.serif, fontSize: 26, lineHeight: 30, color: t.onInverse }}>{r.drill.title}</RNText>
                <RNText style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 20, color: t.onInverse2 }}>{r.drill.body}</RNText>
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        <Pill label="Take it again" onPress={() => router.replace({ pathname: '/mirror/take', params: { prompt: r.promptId } })} />
        <Pill label="Done" quiet onPress={() => router.replace('/mirror')} />
      </View>
    </Screen>
  );
}
