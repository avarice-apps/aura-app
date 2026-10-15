import React, { useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Body, Card, Icon, ICON, Label, Muted, Num, Row, Stack, Statue, Title, Bar, Tag, Serif, Halo } from '@/ui';
import { font, useTheme } from '@/theme';
import type { Evaluation } from '@/lib/types';
import { speak, stopSpeaking } from '@/lib/voice';
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

const STATUE_FOR: Record<string, 'athlete' | 'bust' | 'bustDark' | 'antinoos' | 'head'> = {
  'The Hedge': 'head',
  'The Apologist': 'bust',
  'The Sprinter': 'athlete',
  'The Statue': 'bustDark',
  'The Pleaser': 'head',
  'The Blade': 'antinoos',
  'The Anchor': 'bustDark',
  'The Current': 'athlete',
  'The Storyteller': 'antinoos',
  'The Understated': 'bust',
};

/** Approved design O5: the dark block, now blue. Archetype, one line, the number, a statue. */
export function ResultHero({ e, label = 'This answer read as' }: { e: Evaluation; label?: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 210, borderRadius: 24, backgroundColor: t.inverse, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -40, top: -30 }}>
        <Halo size={270} opacity={0.35} />
      </View>
      <View style={{ position: 'absolute', right: 6, bottom: -12 }}>
        <Statue name={STATUE_FOR[e.archetype] ?? 'head'} height={176} />
      </View>
      <View style={{ position: 'absolute', left: 18, top: 16, width: 180, gap: 3 }}>
        <Label color={t.onInverse2}>{label}</Label>
        <Title size={26} color={t.onInverse}>{e.archetype}</Title>
        <Body small color={t.onInverse2}>{e.archetype_line}</Body>
      </View>
      <View style={{ position: 'absolute', left: 18, bottom: 12, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Num value={e.rating} size={54} color={t.onInverse} />
        <Label color={t.onInverse2}>Aura · this read</Label>
      </View>
    </View>
  );
}

export function FeedbackCard({ e }: { e: Evaluation }) {
  const t = useTheme();
  return (
    <Card style={{ paddingVertical: 4 }}>
      {e.strengths.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
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
export function SignalCard({ e }: { e: Evaluation }) {
  const t = useTheme();
  if (!e.signal) return null;
  return (
    <Card inverse style={{ gap: 8 }}>
      <Label color={t.onInverse2}>The moment · turn {e.signal.turn}</Label>
      <Serif size={22} italic color={t.onInverse}>“{e.signal.quote}”</Serif>
      <Body small color={t.onInverse}>{e.signal.text}</Body>
      <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.onInverse2, marginTop: 2 }}>MEASURED · {e.signal.measured.toUpperCase()}</RNText>
    </Card>
  );
}

/** Turning point: the exchange where the other person's inner state moved. Only shown when the evaluator found one. */
export function TurningPoint({ e }: { e: Evaluation }) {
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
export function Alternatives({ e, onPick, picked }: { e: Evaluation; onPick?: (i: number) => void; picked?: number }) {
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
      <Title size={26}>Not enough to go on.</Title>
      <Body color={t.ink2}>{e.reason ?? 'Poise heard too little to rate fairly. That one doesn’t count against you.'}</Body>
      <Muted small>A fair read needs a few full sentences. Get a little closer to the mic and give it one more go.</Muted>
    </Card>
  );
}

export function AxesCard({ e }: { e: Evaluation }) {
  const t = useTheme();
  const rows: [string, number][] = [
    ['Voice', e.axes.voice],
    ['Command', e.axes.command],
    ['Composure', e.axes.composure],
    ['Social awareness', e.axes.awareness],
  ];
  return (
    <Card style={{ paddingVertical: 6 }}>
      {rows.map(([k, v], i) => (
        <Row key={k} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
          <Body small style={{ width: 120 }}>{k}</Body>
          <Bar value={v} accent={k === 'Social awareness'} />
          <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink, width: 28, textAlign: 'right' }}>{v}</RNText>
        </Row>
      ))}
      <Muted small style={{ paddingBottom: 8 }}>Voice, command and composure are measured from the audio. Social awareness is Poise’s interpretation: {e.awareness.evidence}</Muted>
    </Card>
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
  const firstUser = (e: Evaluation) => e.turns.find((x) => x.role === 'user')?.text ?? '';
  const firstReply = (e: Evaluation) => e.turns.filter((x) => x.role === 'char')[1]?.text ?? '';
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
            <Label color={i ? t.ink : t.ink3}>Take {i + 1}</Label>
            <Body small style={{ marginTop: 6 }} color={i ? t.ink : t.ink2}>“{firstUser(e)}”</Body>
            <View style={{ borderTopWidth: 1, borderColor: t.cardAlt, marginTop: 8, paddingTop: 6 }}>
              <Muted small>{e.character ?? 'They'}: “{firstReply(e)}”</Muted>
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
export function FullRead({ e, showAlternatives = true }: { e: Evaluation; showAlternatives?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const has = e.signal || (e.trace && e.trace.length > 1) || e.turning_point;
  if (!has) return null;
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
        </Animated.View>
      )}
    </View>
  );
}
