import React from 'react';
import { View, Share, Text as RNText } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Body, Card, Label, Muted, Row, Button } from '@/ui';
import { font, useTheme } from '@/theme';
import type { Duel } from '@/lib/types';
import { track } from '@/lib/analytics';

/** The verdict card: who won, both scores, the best line and the fumble. Built to screenshot. */
export function DuelResult({ d, me }: { d: Duel; me?: 'a' | 'b' }) {
  const t = useTheme();
  const r = d.result!;
  const name = (w: 'a' | 'b') => (w === 'a' ? d.name_a : d.name_b ?? 'Player 2');
  const headline = r.winner === 'draw' ? 'Dead even.' : me ? (r.winner === me ? 'You won.' : 'You lost.') : `${name(r.winner)} won.`;
  return (
    <View style={{ gap: 12 }}>
      <Animated.View entering={FadeInDown.duration(450)} style={{ borderRadius: 24, backgroundColor: t.accent, padding: 20, gap: 14 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>DEBATE DUEL · {d.code}</RNText>
        <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 20, color: 'rgba(255,255,255,0.9)' }}>{d.topic}</RNText>
        <RNText style={{ fontFamily: font.medium, fontSize: 34, letterSpacing: -1, color: '#FFF' }}>{headline}</RNText>
        <Row gap={10}>
          {(['a', 'b'] as const).map((w) => (
            <View key={w} style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: r.winner === w ? '#FFF' : 'rgba(255,255,255,0.12)', gap: 2 }}>
              <RNText numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 13, color: r.winner === w ? t.accent : '#FFF' }}>{name(w)} · {w === 'a' ? d.side_a : d.side_b}</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 36, color: r.winner === w ? t.accent : '#FFF' }}>{r.scores[w].total}</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 10, color: r.winner === w ? t.accent : 'rgba(255,255,255,0.75)' }}>ARG {r.scores[w].argument} · COMP {r.scores[w].composure}</RNText>
            </View>
          ))}
        </Row>
        <RNText style={{ fontFamily: font.serifItalic, fontSize: 20, lineHeight: 25, color: '#FFF' }}>“{r.caption}”</RNText>
      </Animated.View>
      <Card style={{ gap: 6 }}>
        <Label>The call</Label>
        <Body>{r.verdict}</Body>
      </Card>
      {r.best_line ? (
        <Card style={{ gap: 6 }}>
          <Label color={t.accent}>Best line · {name(r.best_line.who)}</Label>
          <Body>“{r.best_line.quote}”</Body>
        </Card>
      ) : null}
      {r.fumble ? (
        <Card style={{ gap: 6 }}>
          <Label>The fumble · {name(r.fumble.who)}</Label>
          <Body>“{r.fumble.quote}”</Body>
          <Muted small>{r.fumble.why}</Muted>
        </Card>
      ) : null}
      <Card style={{ gap: 8 }}>
        <Label>Fix this next time</Label>
        <Body small><RNText style={{ fontFamily: font.semibold }}>{d.name_a}: </RNText>{r.note_a}</Body>
        <Body small><RNText style={{ fontFamily: font.semibold }}>{name('b')}: </RNText>{r.note_b}</Body>
      </Card>
      <Button
        label="Share the verdict"
        onPress={() => {
          track('share', { what: 'duel' });
          Share.share({ message: `Debate Duel: “${d.topic}” ${headline} ${r.scores.a.total}–${r.scores.b.total}. “${r.caption}” Judged by Kleos.` });
        }}
      />
    </View>
  );
}
