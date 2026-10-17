import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Switch, Alert, Linking, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { Directory, Paths } from 'expo-file-system';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { Screen, Num, Bar, Statue, Icon, ICON, Serif, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, auraIndex, SessionRecord, ThemePref, Pronoun, Dates } from '@/state/store';
import { patterns, UNITS } from '@/lib/progress';
import { useTier, remaining } from '@/lib/plan';
import { restore } from '@/lib/purchases';
import { LEGAL_URL } from '@/lib/config';
import { deleteServerData, setTrainingConsent, withdrawTraining, updateAccountName } from '@/lib/api';
import { setSoundsEnabled, play } from '@/lib/sound';
import { ToneSwitch } from '@/components/ToneSwitch';
import { Kicker, Display, RowLink, Hair, Chip } from '@/components/Kit';
import type { Evaluation } from '@/lib/types';

type Range = '4w' | '8w' | 'all';
type AxisKey = 'voice' | 'command' | 'composure' | 'awareness';
const AXES: { key: AxisKey; label: string; note: string }[] = [
  { key: 'voice', label: 'Voice', note: 'Measured from the audio' },
  { key: 'command', label: 'Command', note: 'How you hold the floor' },
  { key: 'composure', label: 'Composure', note: 'Measured from the audio' },
  { key: 'awareness', label: 'Reading the room', note: 'Poise’s read of what you picked up' },
];

const best = (s: SessionRecord): Evaluation => (s.retry && !s.retry.insufficient ? s.retry : s.evaluation);
const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const TIER = (n: number) => (n >= 85 ? 'Gravity' : n >= 72 ? 'Magnetic' : n >= 60 ? 'Composed' : n >= 45 ? 'Present' : 'Faint');
const PLAN = { free: 'Free', plus: 'Kleos+', black: 'Kleos Black' } as const;

/**
 * You: where it's going (the Index and the four skills), the tells with their evidence, your style, what Poise
 * remembers, and the account, plan and settings. One calm page; everything deeper is one tap away.
 */
export default function You() {
  const t = useTheme();
  const s = useStore();
  const tier = useTier();
  const [range, setRange] = useState<Range>('8w');
  const [open, setOpen] = useState<string | null>(null);
  const [now0] = useState(() => Date.now());
  const idx = auraIndex(s.sessions);
  const scored = useMemo(() => s.sessions.filter((x) => best(x)?.axes && !best(x).insufficient), [s.sessions]);

  const series = useMemo(() => {
    const cutoff = range === 'all' ? 0 : now0 - (range === '4w' ? 28 : 56) * 864e5;
    const asc = [...scored].reverse().filter((x) => new Date(x.createdAt).getTime() >= cutoff);
    // rolling mean of the last three takes: the Index moves with consistency, not one lucky take
    return asc.map((_, i) => avg(asc.slice(Math.max(0, i - 2), i + 1).map((x) => best(x).rating)) ?? 0);
  }, [scored, range, now0]);
  const change = idx !== null && series[0] !== undefined ? idx - series[0] : 0;

  const recent = scored.slice(0, 5);
  const before = scored.slice(5, 10);
  const axisNow = (k: AxisKey) => avg(recent.map((x) => best(x).axes?.[k]));
  const axisDelta = (k: AxisKey) => {
    const a = axisNow(k);
    const b = avg(before.map((x) => best(x).axes?.[k]));
    return a !== null && b !== null ? a - b : null;
  };

  const golds = UNITS.flatMap((u) => u.lessons).filter((l) => s.laurels[l.id] === 3).length;
  const laurels = Object.values(s.laurels).filter(Boolean).length;
  const older = patterns(s.sessions.slice(3), s.patternsDismissed);
  const recentKeys = patterns(s.sessions.slice(0, 3).concat(s.sessions.slice(0, 3)), s.patternsDismissed).map((p) => p.key);
  const cleared = older.filter((p) => !recentKeys.includes(p.key));
  const live = patterns(s.sessions, s.patternsDismissed);
  const memories = Object.keys(s.met ?? {}).length;

  const acc = s.account;
  const mins = acc?.live_min_left;
  const allowance =
    tier === 'free'
      ? `${remaining('calls')} free call${remaining('calls') === 1 ? '' : 's'} left this week`
      : typeof mins === 'number'
        ? `${mins} live minute${mins === 1 ? '' : 's'} left this week`
        : 'Manage in Settings › Apple ID › Subscriptions';

  function askDelete() {
    Alert.alert('Delete everything?', 'Your sessions, notes, wardrobe and progress on this phone, plus your duels and any training clips on our server. Your account and subscription stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteServerData().catch(() => {});
          try {
            const d = new Directory(Paths.document, 'wardrobe'); // wardrobe photos live only on the phone
            if (d.exists) d.delete();
          } catch {}
          s.reset();
          router.replace('/onboarding');
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* who */}
        <View style={{ paddingTop: 10, gap: 6 }}>
          <Kicker>{PLAN[tier]}{s.streak > 0 ? ` · ${s.streak}-day streak` : ''}</Kicker>
          <TextInput
            value={s.name}
            onChangeText={(v) => s.set({ name: v.slice(0, 40) })}
            onEndEditing={() => acc?.saved && s.name.trim() && updateAccountName(s.name.trim()).catch(() => {})}
            placeholder="Your name"
            placeholderTextColor={t.ink3}
            style={{ fontFamily: font.serif, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: t.ink, padding: 0 }}
          />
          <Pressable onPress={() => router.push('/account')} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: acc?.saved ? t.accent : t.ink3 }} />
            <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>
              {acc?.saved ? `Saved${acc.email ? ` · ${acc.email}` : acc.apple ? ' with Apple' : ''}` : 'Save your account so it follows you'}
            </RNText>
            <Chevron />
          </Pressable>
        </View>

        {/* the Index */}
        <Animated.View entering={FadeInDown.duration(450)} style={{ marginTop: 22, borderRadius: 26, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 20, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Kicker>Aura Index</Kicker>
            <View style={{ flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: t.line, padding: 2 }}>
              {(['4w', '8w', 'all'] as Range[]).map((r) => (
                <Pressable key={r} onPress={() => { play('tap'); setRange(r); }} style={{ height: 26, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: range === r ? t.accent : 'transparent' }}>
                  <RNText style={{ fontFamily: range === r ? font.medium : font.regular, fontSize: 11.5, color: range === r ? t.onAccent : t.ink2 }}>{r === 'all' ? 'All' : r.toUpperCase()}</RNText>
                </Pressable>
              ))}
            </View>
          </View>
          {idx === null ? (
            <View style={{ paddingTop: 14, paddingBottom: 6, gap: 8 }}>
              <Display text="Your first read " em="sets it." size={30} />
              <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2, maxWidth: '78%' }}>Every conversation adds a point. The line shows whether it’s holding.</RNText>
              <View style={{ position: 'absolute', right: -16, bottom: -26 }} pointerEvents="none">
                <Statue name="head" height={120} />
              </View>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
                <Num value={idx} size={60} />
                <RNText style={{ fontFamily: font.serifItalic, fontSize: 22, color: t.em }}>{TIER(idx)}</RNText>
              </View>
              {series.length > 1 ? (
                <RNText style={{ fontFamily: font.mono, fontSize: 11.5, color: change >= 0 ? t.accent : t.ink2 }}>
                  {change >= 0 ? '↑' : '↓'} {Math.abs(change)} since {range === 'all' ? 'the start' : range === '4w' ? '4 weeks ago' : '8 weeks ago'}
                </RNText>
              ) : null}
              <Chart values={series} />
            </>
          )}
        </Animated.View>

        {/* the four skills */}
        <Animated.View entering={FadeInDown.duration(450).delay(60)} style={{ marginTop: 12, borderRadius: 26, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, paddingHorizontal: 20, paddingVertical: 6 }}>
          {AXES.map((a, i) => {
            const v = axisNow(a.key);
            const d = axisDelta(a.key);
            return (
              <View key={a.key} style={{ paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: t.line, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <RNText numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium, fontSize: 15, color: t.ink }}>{a.label}</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 12, color: v === null ? t.ink3 : t.ink }}>
                    {v === null ? (scored.length ? 'not measured yet' : '—') : v}
                    {d !== null && d !== 0 ? <RNText style={{ color: d > 0 ? t.accent : t.ink3 }}>{`  ${d > 0 ? '↑' : '↓'}${Math.abs(d)}`}</RNText> : null}
                  </RNText>
                </View>
                <Bar value={v ?? 0} accent={a.key === 'awareness'} />
              </View>
            );
          })}
          <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3, paddingBottom: 12 }}>Voice and composure come from the recording, so typed or silent calls leave them blank rather than guessing.</RNText>
        </Animated.View>

        {/* laurels + tells cleared */}
        <Animated.View entering={FadeInDown.duration(450).delay(120)} style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => router.push('/path')} style={{ flex: 1, borderRadius: 22, backgroundColor: t.inverse, padding: 16, gap: 4, minHeight: 122 }}>
            <Kicker color="rgba(255,255,255,0.7)">Laurels</Kicker>
            <RNText style={{ fontFamily: font.medium, fontSize: 24, letterSpacing: -0.5, color: '#FFF' }}>{laurels} earned</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: 'rgba(255,255,255,0.85)' }}>{golds ? `${golds} gold. Proven on a different day.` : 'Gold needs a repeat on another day.'}</RNText>
          </Pressable>
          <View style={{ flex: 1, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, gap: 4, minHeight: 122 }}>
            <Kicker>Tells cleared</Kicker>
            <Num value={cleared.length} size={30} />
            <RNText numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: t.ink2 }}>{cleared[0] ? `Latest: ${cleared[0].label.toLowerCase()}` : 'A tell clears when it stays gone for three calls.'}</RNText>
          </View>
        </Animated.View>

        {/* tells, with the evidence */}
        <Animated.View entering={FadeInDown.duration(450).delay(160)} style={{ marginTop: 32 }}>
          <Kicker>Your tells</Kicker>
          <RNText style={{ fontFamily: font.serif, fontSize: 26, color: t.ink, marginTop: 6, marginBottom: 6 }}>What keeps showing up</RNText>
          {live.length === 0 ? (
            <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2, paddingVertical: 10 }}>Tells appear after a few calls, each with the quotes behind it. You can inspect one, disagree, or remove it.</RNText>
          ) : tier === 'free' ? (
            <RowLink first title={`${live.length} tell${live.length === 1 ? '' : 's'} keep showing up`} sub="See what they are, with the quotes behind each one. Kleos+." right={<Icon d={ICON.lock} size={15} color={t.accent} />} onPress={() => router.push({ pathname: '/paywall', params: { reason: 'read' } })} />
          ) : (
            live.slice(0, 6).map((p, i) => (
              <View key={p.key} style={{ borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
                <Pressable onPress={() => { play('tap'); setOpen(open === p.key ? null : p.key); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 }}>
                  <RNText style={{ flex: 1, fontFamily: font.medium, fontSize: 16, color: t.ink }}>{p.label}</RNText>
                  <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.accent }}>{p.count}×</RNText>
                  <Icon d={open === p.key ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} size={15} color={t.ink3} />
                </Pressable>
                {open === p.key ? (
                  <Animated.View entering={FadeIn.duration(200)} style={{ gap: 10, paddingBottom: 14 }}>
                    {p.evidence.map((e, k) => (
                      <View key={k} style={{ gap: 2 }}>
                        {e.quote ? <Serif size={17} italic>“{e.quote}”</Serif> : null}
                        <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink3 }}>{e.title} · {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</RNText>
                      </View>
                    ))}
                    <Pressable onPress={() => s.set({ patternsDismissed: [...s.patternsDismissed, p.key] })} hitSlop={8}>
                      <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.accent }}>That’s not me. Remove it</RNText>
                    </Pressable>
                  </Animated.View>
                ) : null}
              </View>
            ))
          )}
          <Hair />
        </Animated.View>

        {/* style and depth */}
        <View style={{ marginTop: 32 }}>
          <Kicker>Style and depth</Kicker>
          <View style={{ marginTop: 4 }}>
            <RowLink first title="Your taste" sub={s.styleProfile ? 'Your lane, colours and the brands you like' : 'Three minutes. Every fit read gets sharper after it'} onPress={() => router.push('/wardrobe')} />
            <RowLink title="Your wardrobe" sub={`${(s.wardrobe ?? []).length ? `${(s.wardrobe ?? []).length} pieces · ` : ''}The look for anything coming up`} right={tier !== 'black' ? <Icon d={ICON.lock} size={15} color={t.ink3} /> : undefined} onPress={() => router.push('/wardrobe')} />
            <RowLink title="Your Portrait" sub="A deep read of every conversation you’ve had" right={tier !== 'black' ? <Icon d={ICON.lock} size={15} color={t.ink3} /> : undefined} onPress={() => router.push('/portrait')} />
            <RowLink title="What Poise remembers" sub={memories ? `${memories} ${memories === 1 ? 'person remembers' : 'people remember'} you · inspect or forget` : 'Your preferences and what people remember. Inspect or forget'} onPress={() => router.push('/memory')} />
            <RowLink title="Poise Direct" sub="Text Poise from Messages" right={tier !== 'black' ? <Icon d={ICON.lock} size={15} color={t.ink3} /> : undefined} onPress={() => router.push('/direct')} />
            <Hair />
          </View>
        </View>

        {/* how Poise talks to you */}
        <View style={{ marginTop: 32, gap: 14 }}>
          <Kicker>How the scenes treat you</Kicker>
          <Choice<Pronoun> label="Characters call you" value={s.pronoun ?? 'they'} options={[['he', 'He'], ['she', 'She'], ['they', 'They']]} onChange={(v) => s.set({ pronoun: v })} />
          <Choice<Dates> label="On dates, across from you" value={s.dates ?? 'everyone'} options={[['women', 'Women'], ['men', 'Men'], ['everyone', 'Anyone']]} onChange={(v) => s.set({ dates: v })} />
          <Choice<ThemePref> label="Look" value={s.theme} options={[['gallery', 'Gallery'], ['nocturne', 'Night'], ['system', 'System']]} onChange={(v) => s.set({ theme: v })} />
          <View>
            <RowLink first title="Conversation style" sub="Unfiltered is funny, blunt and swears" right={<ToneSwitch />} />
            <RowLink title="Sounds" sub="The reveal after a read" right={<Switch value={s.sounds} onValueChange={(v) => { s.set({ sounds: v }); setSoundsEnabled(v); }} trackColor={{ true: t.accent }} />} />
            <RowLink title="Invite friends" sub={`Free live calls for you both${s.invite?.code ? ` · code ${s.invite.code}` : ''}`} onPress={() => router.push('/invite')} />
            <Hair />
          </View>
        </View>

        {/* plan */}
        <View style={{ marginTop: 32 }}>
          <Kicker>Plan</Kicker>
          <View style={{ marginTop: 4 }}>
            <RowLink first title={PLAN[tier]} sub={allowance} onPress={() => router.push({ pathname: '/paywall', params: { reason: 'plan' } })} />
            <RowLink
              title="Restore purchases"
              sub="Bought Kleos on another phone?"
              onPress={async () => {
                try {
                  const p = await restore();
                  Alert.alert(p === 'free' ? 'Nothing to restore' : 'Restored', p === 'free' ? 'No active Kleos subscription on this Apple ID.' : `You’re on ${PLAN[p]}.`);
                } catch (e: any) {
                  Alert.alert('Restore failed', e?.message ?? 'Try again.');
                }
              }}
            />
            <Hair />
          </View>
        </View>

        {/* data */}
        <View style={{ marginTop: 32 }}>
          <Kicker>Your data</Kicker>
          <View style={{ marginTop: 4 }}>
            <RowLink
              first
              title="Help train Poise"
              sub={s.trainingConsent ? 'On. Your clips help the model learn. Withdraw any time.' : 'Off. Nothing is kept beyond the session.'}
              right={
                <Switch
                  value={s.trainingConsent}
                  onValueChange={async (v) => {
                    s.set({ trainingConsent: v });
                    try {
                      if (v) await setTrainingConsent(true);
                      else await withdrawTraining();
                    } catch {}
                  }}
                  trackColor={{ true: t.accent }}
                />
              }
            />
            <RowLink title="What Kleos keeps" sub="Transcripts and measurements. Never raw face data." onPress={() => Alert.alert('What is kept', 'Each call stores the transcript, measured numbers (pace, fillers, pitch range, gaze ratio) and Poise’s notes on this phone. Audio and video are deleted after they are read. Face landmarks are reduced to numbers per frame and discarded. Your account keeps your plan, this week’s allowance and a short summary for joinkleos.com. If you opt into training, the clip is kept under a random id until you withdraw.')} />
            <RowLink title="Terms and privacy" sub="How Kleos works with your data" onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)} />
            <RowLink title="Replay onboarding" sub="Keeps your progress" onPress={() => { s.set({ onboarded: false, ob: {} }); router.replace('/onboarding'); }} />
            <RowLink title="Delete everything" sub="Progress on this phone, and anything on our server" onPress={askDelete} />
            <Hair />
          </View>
        </View>

        <RNText style={{ marginTop: 28, textAlign: 'center', fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>
          Kleos rates a take, not a person. Several styles are valid. Poise measures what can be measured and says what it is interpreting.
        </RNText>
      </ScrollView>
    </Screen>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{label}</RNText>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map(([k, l]) => (
          <Chip key={k} label={l} on={value === k} onPress={() => onChange(k)} />
        ))}
      </View>
    </View>
  );
}

function Chart({ values }: { values: number[] }) {
  const t = useTheme();
  const W = 300;
  const H = 110;
  const v = values.length === 1 ? [values[0], values[0]] : values;
  const lo = Math.max(0, Math.min(...v) - 8);
  const hi = Math.min(100, Math.max(...v) + 8);
  const pts = v.map((y, i) => [(i / Math.max(1, v.length - 1)) * W, H - ((y - lo) / Math.max(1, hi - lo)) * H] as const);
  const last = pts[pts.length - 1];
  return (
    <View style={{ marginTop: 14 }}>
      <Svg width="100%" height={H + 8} viewBox={`-4 -4 ${W + 8} ${H + 8}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <Line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke={t.line} strokeWidth={1} />
        ))}
        <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={t.ink} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={last[0]} cy={last[1]} r={4.5} fill={t.accent} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>FIRST</RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>{values.length} TAKES</RNText>
        <RNText style={{ fontFamily: font.mono, fontSize: 10, color: t.ink3 }}>NOW</RNText>
      </View>
    </View>
  );
}
