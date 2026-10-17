import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Text as RNText, Linking, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Body, Button, Icon, ICON, Muted, Row, Stack, ArtCard, OnBlue } from '@/ui';
import { font, useTheme } from '@/theme';
import { TIERS, useTier } from '@/lib/plan';
import { FALLBACK, Product, buy, loadProducts, restore } from '@/lib/purchases';
import { LEGAL_URL } from '@/lib/config';
import { track } from '@/lib/analytics';
import { play } from '@/lib/sound';

const PER_SHORT = { week: '/week', month: '/month', year: '/year' } as const;
const PER_LONG = { week: 'every week', month: 'every month', year: 'every year' } as const;

/** Why the paywall opened; sets the headline so it answers the moment. */
export type PaywallReason = 'calls' | 'minutes' | 'clips' | 'poise' | 'profiles' | 'fits' | 'read' | 'black' | 'wardrobe' | 'rehearse' | 'path' | 'retry' | 'onboarding' | 'plan' | 'direct';

const HEAD: Record<PaywallReason, [string, string]> = {
  calls: ['You’ve used this week’s free calls.', 'Kleos+ opens every scene, every day: 45 minutes of live calls a week. Or invite a friend and you both get extra calls.'],
  minutes: ['That’s this week’s live minutes.', 'They come back on Monday. Kleos Black doubles them to 90 a week.'],
  clips: ['That was this week’s free clip.', 'Rate the moments worth rating. Ten a week with Kleos+.'],
  poise: ['Poise is out of free reads this week.', 'Debriefs, draft checks and answers, all week, with Kleos+.'],
  profiles: ['That was your free Profile Read.', 'Re-read your page after every change.'],
  fits: ['That was this week’s last free Fit check.', 'Check every fit before you leave the house. Thirty a week with Kleos+.'],
  wardrobe: ['Your Wardrobe is Kleos Black.', 'Scan what you own once. Get the look for anything coming up, built from your own clothes.'],
  read: ['There’s more to this read.', 'The moment it turned, two ways in, what it rests on, and your tells over time.'],
  black: ['This one is Kleos Black.', 'Your Wardrobe, your Portrait, and twice the live time.'],
  rehearse: ['Rehearse is Kleos+.', 'Describe what’s coming up. Play it tonight, as many times as it takes.'],
  path: ['The rest of the Path is Kleos+.', 'Every lesson, every unit, every checkpoint.'],
  retry: ['Retrying the moment is Kleos+.', 'Go back to the line that mattered and say it the new way.'],
  onboarding: ['Your first week is ready.', 'Every scene, the full read, Rehearse and the whole Path.'],
  plan: ['Pick your level.', 'Free gets you a taste. The rest gets you better.'],
  direct: ['Poise Direct is Kleos Black.', 'Text Poise from your phone’s messages: drafts, questions, tonight’s plan.'],
};

export function PaywallBody({ onDone, onSkip, reason = 'plan' }: { onDone: () => void; onSkip: () => void; reason?: PaywallReason }) {
  const t = useTheme();
  const current = useTier();
  const [tier, setTier] = useState<'plus' | 'black'>(reason === 'black' || reason === 'wardrobe' || reason === 'minutes' || reason === 'direct' ? 'black' : 'plus');
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  const [pick, setPick] = useState<string>(reason === 'black' || reason === 'wardrobe' || reason === 'minutes' || reason === 'direct' ? 'kleos_black_annual' : 'kleos_plus_weekly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    track('paywall_view', { reason });
    loadProducts().then(setProducts);
  }, [reason]);

  const options = products.filter((p) => p.tier === tier);
  const chosen = options.find((p) => p.id === pick) ?? options[0];
  const info = TIERS.find((x) => x.key === tier)!;
  const [h1, h2] = HEAD[reason] ?? HEAD.plan;

  async function go() {
    if (!chosen) return;
    setBusy(true);
    setErr('');
    try {
      const ok = await buy(chosen);
      if (ok) {
        play('cleared');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone();
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    setBusy(true);
    setErr('');
    try {
      const p = await restore();
      if (p !== 'free') onDone();
      else setErr('No active subscription found on this Apple ID.');
    } catch (e: any) {
      setErr(e?.message ?? 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
        <ArtCard art={tier === 'black' ? 'aurelius' : 'pitt'} height={220} focus="top">
          <OnBlue kicker={tier === 'black' ? 'Kleos Black' : 'Kleos+'} sub={h2}>{h1}</OnBlue>
        </ArtCard>

        {/* tier switch */}
        <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: 999, borderWidth: 1, borderColor: t.line, padding: 4 }}>
          {(['plus', 'black'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                Haptics.selectionAsync();
                setTier(k);
                setPick(k === 'plus' ? 'kleos_plus_weekly' : 'kleos_black_annual');
              }}
              style={{ flex: 1, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: tier === k ? (k === 'black' ? t.ink : t.accent) : 'transparent' }}
            >
              <RNText style={{ fontFamily: font.medium, fontSize: 14, color: tier === k ? '#FFF' : t.ink2 }}>{k === 'plus' ? 'Kleos+' : 'Kleos Black'}</RNText>
            </Pressable>
          ))}
        </View>

        <Animated.View key={tier} entering={FadeIn.duration(250)} style={{ gap: 14 }}>
          <Body strong>{info.line}</Body>
          <Stack gap={9}>
            {info.perks.map((x) => (
              <Row key={x} gap={10} style={{ alignItems: 'flex-start' }}>
                <View style={{ marginTop: 3 }}><Icon d={ICON.check} size={14} color={tier === 'black' ? t.ink : t.accent} stroke={2.4} /></View>
                <Body small style={{ flex: 1 }}>{x}</Body>
              </Row>
            ))}
          </Stack>

          <Stack gap={8}>
            {options.map((p) => {
              const on = chosen?.id === p.id;
              const label = p.period === 'week' ? 'Weekly' : p.period === 'month' ? 'Monthly' : 'Yearly';
              const per = p.period === 'week' ? 'a week' : p.period === 'month' ? 'a month' : 'a year';
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPick(p.id);
                  }}
                  style={{ padding: 16, borderRadius: 18, backgroundColor: on ? t.accentSoft : t.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.accent : t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Stack gap={3}>
                    <Row gap={8}>
                      <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{label}</RNText>
                      {p.trial ? <View style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><RNText style={{ fontFamily: font.mono, fontSize: 10, color: '#FFF' }}>{p.trial.toUpperCase()}</RNText></View> : null}
                      {p.perWeek ? <View style={{ backgroundColor: t.ink, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><RNText style={{ fontFamily: font.mono, fontSize: 10, color: '#FFF' }}>{p.perWeek}/WEEK</RNText></View> : null}
                    </Row>
                    <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{p.price} {per}</RNText>
                    {p.trial ? <Muted small>{p.trial}, then {p.price} {per}</Muted> : null}
                  </Stack>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1, borderColor: t.lineStrong, backgroundColor: on ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Icon d={ICON.check} size={12} color="#FFF" stroke={3} />}
                  </View>
                </Pressable>
              );
            })}
          </Stack>
        </Animated.View>

        {current !== 'free' ? <Muted small align="center">You’re on {current === 'black' ? 'Kleos Black' : 'Kleos+'}.</Muted> : null}
        {err ? <Body small color={t.accent}>{err}</Body> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 10 }}>
        <Button label={busy ? '' : chosen?.trial ? `Try it free, then ${chosen.price}${PER_SHORT[chosen.period]}` : `Subscribe for ${chosen?.price ?? ''}${chosen ? PER_SHORT[chosen.period] : ''}`} disabled={busy || !chosen} onPress={go} icon={busy ? <ActivityIndicator color="#FFF" /> : undefined} />
        <Muted small align="center" style={{ fontSize: 11, lineHeight: 15 }}>
          {chosen ? `${chosen.trial ? `${chosen.trial}, then ` : ''}${chosen.price} ${PER_LONG[chosen.period]}. ` : ''}Payment is charged to your Apple ID. Renews automatically unless cancelled at least 24 hours before the end of the period, in Settings › Apple ID › Subscriptions.
        </Muted>
        <Row style={{ justifyContent: 'center' }} gap={16}>
          <Pressable onPress={doRestore} hitSlop={8}><Muted small>Restore</Muted></Pressable>
          <Pressable onPress={() => Linking.openURL(`${LEGAL_URL}/terms`)} hitSlop={8}><Muted small>Terms</Muted></Pressable>
          <Pressable onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)} hitSlop={8}><Muted small>Privacy</Muted></Pressable>
          {reason === 'calls' ? <Pressable onPress={() => router.push('/invite')} hitSlop={8}><Muted small>Invite a friend</Muted></Pressable> : null}
          <Pressable onPress={onSkip} hitSlop={8}><Muted small>Not now</Muted></Pressable>
        </Row>
      </View>
    </View>
  );
}
