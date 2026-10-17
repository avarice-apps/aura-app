import React from 'react';
import { View, ScrollView, Pressable, Alert, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { Display, Kicker, Hair } from '@/components/Kit';
import { faceFor } from '@/lib/faces';
import { patterns } from '@/lib/progress';
import { occasionFresh, whenLabel } from '@/lib/occasion';

const DATE = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const PRONOUN = { he: 'He / him', she: 'She / her', they: 'They / them' } as const;
const DATES = { women: 'Women', men: 'Men', everyone: 'Anyone' } as const;

/**
 * What Poise remembers, and where each thing came from. Everything here lives on this phone; each line can go.
 * Poise and the characters use it as context, never as instructions.
 */
export default function Memory() {
  const t = useTheme();
  const s = useStore();
  const met = Object.entries(s.met ?? {}).sort((a, b) => (b[1].at || '').localeCompare(a[1].at || ''));
  const tells = patterns(s.sessions, s.patternsDismissed);
  const occ = occasionFresh(s.occasion) ? s.occasion : undefined;
  const drafts = (s.drafts ?? []).length;
  const notes = (s.callNotes ?? []).length;

  const about: { k: string; label: string; value: string; from: string; clear?: () => void }[] = [
    ...(s.name ? [{ k: 'name', label: 'Your name', value: s.name, from: 'You told Kleos', clear: () => s.set({ name: '' }) }] : []),
    { k: 'pronoun', label: 'Characters call you', value: PRONOUN[s.pronoun ?? 'they'], from: s.pronoun ? 'You chose it' : 'Default until you choose', clear: s.pronoun ? () => s.set({ pronoun: undefined }) : undefined },
    { k: 'dates', label: 'On dates, across from you', value: DATES[s.dates ?? 'everyone'], from: s.dates ? 'You chose it' : 'Default until you choose', clear: s.dates ? () => s.set({ dates: undefined }) : undefined },
    ...(s.styleProfile ? [{ k: 'style', label: 'Your taste', value: [...(s.styleProfile.lanes ?? []).slice(0, 2), s.styleProfile.presence].filter(Boolean).join(' · '), from: 'From your style quiz', clear: () => s.set({ styleProfile: undefined, styleLane: undefined }) }] : []),
    ...(occ ? [{ k: 'occ', label: whenLabel(occ), value: occ.what, from: `You set it ${DATE(occ.createdAt)}`, clear: () => s.set({ occasion: undefined }) }] : []),
  ];

  function confirm(title: string, body: string, go: () => void) {
    Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Forget', style: 'destructive', onPress: go }]);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICON.back} size={16} color={t.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
          <Kicker>Memory</Kicker>
          <Display text="What Poise " em="remembers." size={40} />
          <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>All of it lives on this phone, with where it came from. Remove anything and it’s gone from the next call.</RNText>
        </Animated.View>

        <Section title="About you">
          {about.map((x, i) => (
            <Line key={x.k} first={!i} label={x.label} value={x.value} from={x.from} onForget={x.clear} />
          ))}
        </Section>

        <Section title="People who remember you">
          {met.length === 0 ? (
            <Empty>After a call, the person you talked to remembers one thing about you for next time.</Empty>
          ) : (
            met.map(([who, m], i) => (
              <View key={who} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
                <Image source={faceFor(who)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.card }} contentFit="cover" />
                <View style={{ flex: 1, gap: 3 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{who}</RNText>
                  <RNText style={{ fontFamily: font.serifItalic, fontSize: 16, lineHeight: 21, color: t.ink }}>“{m.note}”</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>From your call · {DATE(m.at)}</RNText>
                </View>
                <ForgetButton onPress={() => { const next = { ...s.met }; delete next[who]; s.set({ met: next }); }} />
              </View>
            ))
          )}
        </Section>

        <Section title="Your tells">
          {tells.length === 0 ? (
            <Empty>Patterns show up after a few calls, each with the quotes behind it.</Empty>
          ) : (
            tells.slice(0, 8).map((p, i) => (
              <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{p.label}</RNText>
                  <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>Seen in {p.count} call{p.count === 1 ? '' : 's'} · used to pick your scenes</RNText>
                </View>
                <ForgetButton onPress={() => s.set({ patternsDismissed: [...s.patternsDismissed, p.key] })} />
              </View>
            ))
          )}
        </Section>

        <Section title="Messages and calls">
          <Line
            first
            label="Draft reads"
            value={drafts ? `${drafts} from the last 30 days` : 'None'}
            from="Before I send this. Cleared automatically after 30 days. Screenshots are never kept."
            onForget={drafts ? () => confirm('Forget your draft reads?', 'The messages you checked and Poise’s reads of them are removed from this phone.', () => s.set({ drafts: [] })) : undefined}
          />
          <Line
            label="Notes after calls"
            value={notes ? `${notes} note${notes === 1 ? '' : 's'}` : 'None'}
            from="What Poise wrote after a call. The call itself isn’t recorded."
            onForget={notes ? () => confirm('Forget Poise’s call notes?', 'The notes in your chat from calls with Poise are removed.', () => s.set({ callNotes: [] })) : undefined}
          />
          <Line
            label="Chat with Poise"
            value={s.receipts.length ? `${s.receipts.length} message${s.receipts.length === 1 ? '' : 's'}` : 'None'}
            from="Stories and questions you sent, with Poise’s answers"
            onForget={s.receipts.length ? () => confirm('Clear the chat?', 'Your stories, questions and ledgers are removed from this phone.', () => s.set({ receipts: [] })) : undefined}
          />
        </Section>

        <RNText style={{ marginTop: 28, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>
          The server keeps only what an account needs: your plan, this week’s allowance, and a short progress summary for the Members page. Calls are read and then deleted. To remove everything, use Delete account.
        </RNText>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 32 }}>
      <Kicker>{title}</Kicker>
      <View style={{ marginTop: 4 }}>{children}</View>
      <Hair />
    </View>
  );
}

function Line({ label, value, from, onForget, first }: { label: string; value: string; from: string; onForget?: () => void; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderColor: t.line }}>
      <View style={{ flex: 1, gap: 3 }}>
        <RNText style={{ fontFamily: font.regular, fontSize: 12.5, color: t.ink2 }}>{label}</RNText>
        <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }} numberOfLines={2}>{value}</RNText>
        <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: t.ink3 }}>{from}</RNText>
      </View>
      {onForget ? <ForgetButton onPress={onForget} /> : null}
    </View>
  );
}

function ForgetButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel="Forget" style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: t.line, justifyContent: 'center' }}>
      <RNText style={{ fontFamily: font.regular, fontSize: 12.5, color: t.ink2 }}>Forget</RNText>
    </Pressable>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink3, paddingVertical: 12 }}>{children}</RNText>;
}
