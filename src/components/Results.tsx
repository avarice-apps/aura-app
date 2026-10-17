import { useFullRead } from '@/lib/reads';
import React, { useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Body, Card, Icon, ICON, Label, Muted, Num, Row, Stack, Title, Bar, Tag, Serif, ArtCard } from '@/ui';
import type { ArtName } from '@/theme';
import { router } from 'expo-router';
import { useTier } from '@/lib/plan';
import { font, useTheme } from '@/theme';
import type { Evaluation } from '@/lib/types';
import { speak, stopSpeaking } from '@/lib/voice';
import { useStore } from '@/state/store';
import type { AudioSrc } from '@/lib/api';

/** Play Poise's spoken read. */
export function HearPoise({ src, seconds }: { src: AudioSrc; seconds?: number }) {
  const t = useTheme();
  const [on, setOn] = useState(false);
  if (!src) return null;
  return (
    <Pressable
      onPress={async () => {
        if (on) {
          stopSpeaking();
          setOn(false);
          return;
        }
        setOn(true);
        await speak(src);
        setOn(false);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, paddingHorizontal: 8, borderRadius: 27, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={on ? ICON.stop : ICON.play} size={14} fill={t.onAccent} />
      </View>
      <Body strong>{on ? 'Poise is speaking' : 'Hear Poise say it'}</Body>
      {seconds ? <Label style={{ marginLeft: 'auto', marginRight: 10 }}>0:{String(seconds).padStart(2, '0')}</Label> : null}
    </Pressable>
  );
}

/** Free tier: show what's inside the full read, blurred, with one tap to unlock. */
function LockedRead({ e }: { e: Evaluation }) {
  const t = useTheme();
  const rows = [
    e.signal ? ['The moment', `Turn ${e.signal.turn}: where two signals lined up`] : null,
    e.turning_point ? ['Turning point', `Turn ${e.turning_point.turn}: where it changed`] : null,
    e.trace && e.trace.length > 1 ? ['What they were thinking', `${e.trace.length - 1} private reactions, turn by turn`] : null,
    e.alternatives?.length ? ['Two ways in', 'Two lines you could have said instead'] : null,
  ].filter(Boolean) as [string, string][];
  return (
    <Pressable onPress={() => router.push({ pathname: '/paywall', params: { reason: 'read' } })} style={{ borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, padding: 16, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label color={t.accent}>The full read</Label>
        <Icon d={ICON.lock} size={14} color={t.accent} />
      </Row>
      {rows.map(([a, b]) => (
        <View key={a} style={{ gap: 2 }}>
          <Body small strong>{a}</Body>
          <Muted small>{b}</Muted>
        </View>
      ))}
      <View style={{ height: 44, borderRadius: 22, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.onAccent }}>Unlock with Kleos+</RNText>
      </View>
    </Pressable>
  );
}

/** The other person's inner state over the conversation: the engine's signature. */
export function ThoughtTrace({ e }: { e: Evaluation }) {
  const t = useTheme();
  if (!e.trace || e.trace.length < 2) return null;
  const who = e.character ?? 'They';
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>What {who} was thinking</Label>
        <Label>Interest</Label>
      </Row>
      <Stack gap={0} style={{ marginTop: 6 }}>
        {e.trace.slice(1).map((p, i) => {
          const prev = e.trace![i];
          const d = p.interest - prev.interest;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
              <Label style={{ width: 52, paddingTop: 2 }}>After {p.turn}</Label>
              <Body small style={{ flex: 1, fontFamily: font.serifItalic, fontSize: 16, lineHeight: 21 }}>“{p.thought}”</Body>
              <View style={{ alignItems: 'flex-end', width: 52 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 13, color: t.ink }}>{p.interest}</RNText>
                <RNText style={{ fontFamily: font.mono, fontSize: 11, color: d >= 0 ? t.accent : t.ink3 }}>{d >= 0 ? '↑' : '↓'} {Math.abs(d)}</RNText>
              </View>
            </View>
          );
        })}
      </Stack>
    </Card>
  );
}


const ART_FOR: Record<string, ArtName> = {
  'The Hedge': 'man', 'The Apologist': 'aphrodite', 'The Sprinter': 'athlete', 'The Statue': 'vespasian', 'The Pleaser': 'lisa',
  'The Blade': 'trajan', 'The Anchor': 'aurelius', 'The Current': 'apollo', 'The Storyteller': 'pitt', 'The Understated': 'youth',
  'The Ghost': 'dora', 'The Clown': 'violin',
};

/** The verdict as a print: archetype, one line, the number. Built to be screenshotted. */
export function ResultHero({ e, label = 'This answer read as' }: { e: Evaluation; label?: string }) {
  return (
    <ArtCard art={ART_FOR[e.archetype] ?? 'aurelius'} height={300} focus="top">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>{label.toUpperCase()}</RNText>
          <RNText style={{ fontFamily: font.medium, fontSize: 28, lineHeight: 31, letterSpacing: -0.8, color: '#FFF' }}>{e.archetype}</RNText>
          <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: 'rgba(255,255,255,0.86)' }}>{e.archetype_line}</RNText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <RNText style={{ fontFamily: font.medium, fontSize: 60, lineHeight: 62, letterSpacing: -2, color: '#FFF' }}>{e.rating}</RNText>
          <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.75)' }}>AURA</RNText>
        </View>
      </View>
    </ArtCard>
  );
}

export function FeedbackCard({ e: e0 }: { e: Evaluation }) {
  const e = useFullRead(e0);
  const t = useTheme();
  const toneNow = useStore((st) => st.tone);
  const both = !!(e.voices?.straight?.verdict && e.voices?.unfiltered?.verdict);
  const [voice, setVoice] = useState<'straight' | 'unfiltered'>(toneNow === 'unfiltered' ? 'unfiltered' : 'straight');
  const verdict = both ? e.voices![voice]!.verdict : e.verdict;
  return (
    <Card style={{ paddingVertical: 4 }}>
      {verdict ? (
        <View style={{ paddingVertical: 14, gap: 10 }}>
          <Serif size={21} italic>{verdict}</Serif>
          {both ? (
            <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: t.line, padding: 2 }}>
              {(['straight', 'unfiltered'] as const).map((v) => (
                <Pressable key={v} onPress={() => setVoice(v)} hitSlop={4} style={{ height: 26, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: voice === v ? t.accent : 'transparent' }}>
                  <RNText style={{ fontFamily: voice === v ? font.medium : font.regular, fontSize: 11.5, color: voice === v ? t.onAccent : t.ink2 }}>{v === 'straight' ? 'Straight' : 'Unfiltered'}</RNText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {(e.strengths ?? []).length === 0 ? (
        <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: verdict ? 1 : 0, borderColor: t.cardAlt }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink3, width: 14 }}>·</RNText>
          <Body small color={t.ink2} style={{ flex: 1 }}>Nothing here worked well enough to call a strength.</Body>
        </View>
      ) : null}
      {(e.strengths ?? []).map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: i || verdict ? 1 : 0, borderColor: t.cardAlt }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.accent, width: 14 }}>+</RNText>
          <Body small style={{ flex: 1 }}>{s.text}</Body>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: t.cardAlt }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink, width: 14 }}>→</RNText>
        <Stack gap={6} style={{ flex: 1 }}>
          <Body small>
            <RNText style={{ fontFamily: font.semibold }}>The one change: </RNText>
            {e.change.text}
          </Body>
          {e.change.quote ? <Tag label={`Turn ${e.change.turn}: “${e.change.quote.slice(0, 48)}${e.change.quote.length > 48 ? '…' : ''}”`} /> : null}
        </Stack>
      </View>
    </Card>
  );
}

/** The Moment: where two channels lined up. Words x voice, or voice x eyes. Measured, then interpreted. */
export function SignalCard({ e: e0 }: { e: Evaluation }) {
  const e = useFullRead(e0);
  const t = useTheme();
  if (!e.signal) return null;
  return (
    <Card style={{ gap: 8, borderLeftWidth: 3, borderLeftColor: t.accent }}>
      <Label color={t.accent}>The moment · turn {e.signal.turn}</Label>
      <Serif size={22} italic>“{e.signal.quote}”</Serif>
      <Body small color={t.ink2}>{e.signal.text}</Body>
      <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink3, marginTop: 2 }}>MEASURED · {e.signal.measured.toUpperCase()}</RNText>
    </Card>
  );
}

/** Turning point: the exchange where the other person's inner state moved. Only shown when the evaluator found one. */
export function TurningPoint({ e: e0 }: { e: Evaluation }) {
  const e = useFullRead(e0);
  const t = useTheme();
  if (!e.turning_point) return null;
  return (
    <Card style={{ gap: 6 }}>
      <Label>Turning point · turn {e.turning_point.turn}</Label>
      <Serif size={20} italic>“{e.turning_point.quote}”</Serif>
      <Body small color={t.ink2}>{e.turning_point.what_changed}</Body>
    </Card>
  );
}

/** Two viable ways to handle the change moment. He picks the one that sounds like him. */
export function Alternatives({ e: e0, onPick, picked }: { e: Evaluation; onPick?: (i: number) => void; picked?: number }) {
  const e = useFullRead(e0);
  const t = useTheme();
  if (!e.alternatives?.length) return null;
  return (
    <Stack gap={8}>
      <Label>Two ways in. Neither is the answer</Label>
      {e.alternatives.map((a, i) => (
        <Pressable key={i} onPress={onPick ? () => onPick(i) : undefined} style={{ borderRadius: 16, borderWidth: 1, borderColor: picked === i ? t.accent : t.line, backgroundColor: picked === i ? t.accentSoft : t.card, padding: 14, gap: 4 }}>
          <Label color={picked === i ? t.accent : undefined}>{a.style}</Label>
          <Serif size={18} italic>“{a.line}”</Serif>
        </Pressable>
      ))}
    </Stack>
  );
}

/** Not enough evidence to rate fairly. Says so plainly; never a confident-looking number on thin air. */
export function Insufficient({ e }: { e: Evaluation }) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: 16, gap: 8 }}>
      <Label>No rating this time</Label>
      <Title size={26}>Nothing to read.</Title>
      <Body color={t.ink2}>{e.reason ?? 'You barely said anything. There is nothing to rate.'}</Body>
      <Muted small>Talk to them like they’re real. A few full sentences is enough.</Muted>
    </Card>
  );
}

export function AxesCard({ e }: { e: Evaluation }) {
  const t = useTheme();
  const st = e.axes_status ?? {};
  const rows: [string, keyof Evaluation['axes'], number | null | undefined][] = [
    ...(e.axes.landed !== undefined ? ([['How it landed', 'landed', e.axes.landed]] as [string, keyof Evaluation['axes'], number | null][]) : []),
    ['Voice', 'voice', e.axes.voice],
    ['Command', 'command', e.axes.command],
    ['Composure', 'composure', e.axes.composure],
    ['Reading the room', 'awareness', e.axes.awareness],
  ];
  const why = (k: keyof Evaluation['axes']) => (st[k] === 'insufficient_evidence' ? 'too short to tell' : 'not measured');
  const anyMissing = rows.some(([, , v]) => typeof v !== 'number');
  return (
    <Card style={{ paddingVertical: 6 }}>
      {rows.map(([label, k, v], i) => (
        <Row key={label} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
          <Body small style={{ width: 128 }} numberOfLines={1}>{label}</Body>
          {typeof v === 'number' ? (
            <>
              <Bar value={v} accent={k === 'awareness'} />
              <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink, width: 28, textAlign: 'right' }}>{v}</RNText>
            </>
          ) : (
            <RNText style={{ flex: 1, textAlign: 'right', fontFamily: font.mono, fontSize: 11, color: t.ink3 }}>{why(k)}</RNText>
          )}
        </Row>
      ))}
      <Muted small style={{ paddingBottom: 8 }}>
        {anyMissing ? 'Anything Poise couldn’t measure is left out of the score, not guessed. ' : ''}
        Voice and composure come from the recording. Reading the room is Poise’s interpretation{e.awareness?.evidence ? `: ${e.awareness.evidence}` : '.'}
      </Muted>
    </Card>
  );
}

/** What the read rests on, and what Poise couldn't tell. */
export function Grounds({ e: e0 }: { e: Evaluation }) {
  const e = useFullRead(e0);
  const t = useTheme();
  const ev = (e.evidence ?? []).slice(0, 3);
  const un = (e.uncertainties ?? []).slice(0, 2);
  if (!ev.length && !un.length) return null;
  return (
    <Card style={{ gap: 10 }}>
      {ev.length ? <Label>What this rests on</Label> : null}
      {ev.map((x, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Serif size={17} italic>“{x.quote}”</Serif>
          <Muted small>Turn {x.turn} · {x.observation}</Muted>
        </View>
      ))}
      {un.length ? (
        <View style={{ gap: 4, paddingTop: ev.length ? 6 : 0, borderTopWidth: ev.length ? 1 : 0, borderColor: t.cardAlt }}>
          <Label>What Poise couldn’t tell</Label>
          {un.map((u, i) => <Body key={i} small color={t.ink2}>{u}</Body>)}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Retry this moment: back to the instant before the one change, same scene, same person. One more go at the
 * line that mattered instead of replaying the whole call.
 */
export function RetryMoment({ e, onRetry }: { e: Evaluation; onRetry: () => void }) {
  const t = useTheme();
  const tier = useTier();
  if (e.insufficient || !e.change?.turn || !e.change.quote) return null;
  return (
    <Pressable onPress={onRetry} style={({ pressed }) => ({ borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.accent, padding: 16, gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label color={t.accent}>Retry this moment · turn {e.change.turn}</Label>
        {tier === 'free' ? <Icon d={ICON.lock} size={14} color={t.accent} /> : <Icon d={ICON.play} size={13} color={t.accent} fill={t.accent} />}
      </Row>
      <Serif size={18} italic numberOfLines={3}>“{e.change.quote}”</Serif>
      <Muted small>Back to just before you said it. Same person, same mood. Say it the new way.</Muted>
    </Pressable>
  );
}

/** Before / after. Honest: the delta can be negative or mixed. */
export function CompareCard({ a, b }: { a: Evaluation; b: Evaluation }) {
  const t = useTheme();
  const d = b.rating - a.rating;
  const rows: [string, string, string][] = [
    ['Hedges', String(a.counts.hedges), String(b.counts.hedges)],
    ['Fillers', String(a.counts.fillers), String(b.counts.fillers)],
    ['Apologies', String(a.counts.apologies), String(b.counts.apologies)],
    ['Ended on a full stop', a.counts.ended_clean ? 'Yes' : 'No', b.counts.ended_clean ? 'Yes' : 'No'],
    [`${a.character ?? 'Their'} interest`, String(a.trace?.at(-1)?.interest ?? '–'), String(b.trace?.at(-1)?.interest ?? '–')],
  ];
  // The exchange to put side by side: the first one in a full retry; the retried moment in a moment retry.
  const pair = (e: Evaluation, k?: number) => {
    const users = e.turns.map((x, i) => [x, i] as const).filter(([x]) => x.role === 'user' && !x.context);
    const hit = k ? users[k - 1] : users[0];
    if (!hit) return { said: '', reply: '' };
    const reply = e.turns.slice(hit[1] + 1).find((x) => x.role === 'char')?.text ?? '';
    return { said: hit[0].text, reply };
  };
  const view = (e: Evaluation, i: number) => (b.moment ? (i ? pair(e) : pair(e, b.moment.turn)) : pair(e));
  return (
    <Stack gap={12}>
      <Row style={{ alignItems: 'baseline' }} gap={12}>
        <Num value={a.rating} size={30} color={t.ink3} />
        <Body color={t.ink3}>→</Body>
        <Num value={b.rating} size={64} />
        <RNText style={{ fontFamily: font.mono, fontSize: 13, color: d >= 0 ? t.accent : t.ink2 }}>{d >= 0 ? '+' : ''}{d}</RNText>
      </Row>
      {b.compare ? <Body>{b.compare}</Body> : null}
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        {[a, b].map((e, i) => (
          <Card key={i} style={{ flex: 1, padding: 12, borderColor: i ? t.accent : t.line, borderWidth: i ? 1.5 : 1 }}>
            <Label color={i ? t.ink : t.ink3}>{b.moment ? (i ? 'This time' : 'Before') : `Take ${i + 1}`}</Label>
            <Body small style={{ marginTop: 6 }} color={i ? t.ink : t.ink2}>“{view(e, i).said}”</Body>
            <View style={{ borderTopWidth: 1, borderColor: t.cardAlt, marginTop: 8, paddingTop: 6 }}>
              <Muted small>{e.character ?? 'They'}: “{view(e, i).reply}”</Muted>
            </View>
          </Card>
        ))}
      </Row>
      <Card style={{ paddingVertical: 2 }}>
        {rows.map(([k, x, y], i) => (
          <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
            <Body small>{k}</Body>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink }}>{x} → {y}</RNText>
          </Row>
        ))}
      </Card>
      <Muted small>The reactions come from a simulated conversation and were generated without knowing which take was the retry. Your recordings are the real evidence.</Muted>
    </Stack>
  );
}

export function Appear({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <Animated.View entering={FadeInDown.duration(420).delay(delay)}>{children}</Animated.View>;
}

/** Everything beyond the headline read, folded. Results stay clean; depth is one tap away. */
export function FullRead({ e: e0, showAlternatives = true }: { e: Evaluation; showAlternatives?: boolean }) {
  const e = useFullRead(e0);
  const t = useTheme();
  const tier = useTier();
  const [open, setOpen] = useState(false);
  const has = e.signal || (e.trace && e.trace.length > 1) || e.turning_point || e.axes || e.evidence?.length;
  if (!has) return null;
  if (tier === 'free') return <LockedRead e={e} />;
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 18, borderRadius: 26, borderWidth: 1, borderColor: t.line }}
      >
        <Body strong>{open ? 'Hide the full read' : 'See the full read'}</Body>
        <Icon d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} size={16} color={t.ink3} />
      </Pressable>
      {open && (
        <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 12 }}>
          <SignalCard e={e} />
          <ThoughtTrace e={e} />
          <TurningPoint e={e} />
          {showAlternatives ? <Alternatives e={e} /> : null}
          {e.axes ? <AxesCard e={e} /> : null}
          <Grounds e={e} />
        </Animated.View>
      )}
    </View>
  );
}
