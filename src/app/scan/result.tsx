import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Screen, Title, Body, Muted, Label, Button, IconButton, Icon, ICON, Row, Stack, Card, Num, Bar, Tag, Statue, Halo } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { useScan } from '@/state/scanSession';
import { scan as runScan, saveScanVideo } from '@/lib/api';
import { TIER_LINE } from '@/lib/scanPrompts';
import type { ScanResult } from '@/lib/types';
import { play } from '@/lib/sound';

const STATUE_FOR: Record<string, 'athlete' | 'antinoos' | 'head' | 'bust'> = { Gravity: 'athlete', Magnetic: 'athlete', Composed: 'bust', Present: 'head', Faint: 'antinoos', Static: 'antinoos' };

/** Processing → trading card → next player / leaderboard. The card is the share unit. */
export default function ScanResultScreen() {
  const t = useTheme();
  const scan = useScan();
  const addScan = useStore((s) => s.addScan);
  const myName = useStore((s) => s.name);
  const [r, setR] = useState<ScanResult | null>(null);
  const [err, setErr] = useState('');
  const [board, setBoard] = useState(false);
  const shot = useRef<any>(null);
  const [vid, setVid] = useState<'idle' | 'making' | 'error'>('idle');
  const [vidNote, setVidNote] = useState('');
  const who = scan.players[scan.current];
  const isSelf = scan.mode === 'solo' || (scan.mode === 'upload' && scan.players[0] === 'Me');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!scan.uploadUri) throw new Error('No clip.');
        const res = await runScan({ videoUri: scan.uploadUri, prompt: scan.prompt, consent: true, isSelf, name: isSelf ? myName || 'You' : who });
        if (!alive) return;
        const full = { ...res, createdAt: new Date().toISOString() };
        setR(full);
        scan.pushResult(full);
        if (isSelf || scan.mode === 'party') addScan(full);
        useStore.getState().markDaily('scan');
        play('reveal');
      } catch (e: any) {
        setErr(e?.message ?? 'Could not read that clip.');
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function share() {
    try {
      const uri = await (shot.current as any)?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
    } catch {}
  }

  async function saveVideo() {
    if (!r?.video_id || vid === 'making') return;
    setVid('making');
    setVidNote('Finishing your video. A few seconds.');
    try {
      const uri = await saveScanVideo(r.video_id);
      setVid('idle');
      setVidNote('');
      play('cleared');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: 'Your Aura Scan' });
    } catch (e: any) {
      setVid('error');
      setVidNote(e?.message ?? 'Couldn’t make the video.');
    }
  }

  function next() {
    play('select');
    if (scan.next()) router.replace('/scan/consent');
    else setBoard(true);
  }

  if (board) {
    const sorted = [...scan.results].sort((a, b) => b.score - a.score);
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, flex: 1 }}>
          <Label>Round over</Label>
          <Title size={28}>Leaderboard</Title>
          <Card style={{ marginTop: 14, paddingVertical: 4 }}>
            {sorted.map((x, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(i * 120)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: t.cardAlt }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 12, color: i === 0 ? t.accent : t.ink3, width: 22 }}>{i + 1}</RNText>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Body strong>{x.player}</Body>
                  <Muted small>{x.archetype} · {x.tier}</Muted>
                </Stack>
                <Num value={x.score} size={30} color={i === 0 ? t.accent : t.ink} />
              </Animated.View>
            ))}
          </Card>
          <Muted small style={{ marginTop: 12 }}>Fifteen-second takes. Entertainment with real measurements underneath, and it rates the take, not the person.</Muted>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
          <Button label="Another round" sound="select" onPress={() => { scan.begin('party', scan.players); router.replace('/scan/consent'); }} />
          <Button label="Done" variant="secondary" onPress={() => router.dismissAll()} />
        </View>
      </Screen>
    );
  }

  if (!r) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          {err ? (
            <>
              <Title size={24} align="center">{err}</Title>
              <Button label="Back" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
            </>
          ) : (
            <>
              <Animated.View entering={ZoomIn.duration(600)} style={{ alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute' }}><Halo size={240} opacity={0.6} /></View>
                <Statue name="head" height={180} />
              </Animated.View>
              <Body strong>Reading {who}</Body>
              <Muted small align="center">Voice, pace, posture, composure. A few seconds.</Muted>
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton label="Close" onPress={() => router.dismissAll()}><Icon d={ICON.close} size={16} /></IconButton>
        <Label>{scan.mode === 'party' ? `Player ${scan.current + 1} of ${scan.players.length}` : 'Your card'}</Label>
        <View style={{ width: 40 }} />
      </Row>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
        <ViewShot ref={shot} options={{ format: 'png', quality: 1 }}>
          <Animated.View entering={FadeInDown.duration(500)} style={{ borderRadius: 24, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
            <View style={{ height: 200, alignItems: 'center', justifyContent: 'flex-end' }}>
              <View style={{ position: 'absolute', top: -30 }}><Halo size={260} opacity={0.5} /></View>
              <Statue name={STATUE_FOR[r.tier] ?? 'head'} height={190} />
            </View>
            <View style={{ padding: 18, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Stack gap={2}>
                  <Label color={t.accent}>{r.name}</Label>
                  <Title size={30}>{r.archetype}</Title>
                </Stack>
                <Num value={r.score} size={64} color={t.accent} />
              </Row>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1, color: t.ink3 }}>{r.tier.toUpperCase()} · {TIER_LINE[r.tier] ?? ''}</RNText>
              <Body small color={t.ink2} style={{ marginTop: 8 }}>{r.roast}</Body>
              <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1, color: t.ink3, marginTop: 10 }}>KLEOS · AURA SCAN · “{r.prompt?.toUpperCase().slice(0, 40)}”</RNText>
            </View>
          </Animated.View>
        </ViewShot>

        <Animated.View entering={FadeInDown.delay(200)}>
          <Card style={{ gap: 10 }}>
            <Label>The take, measured</Label>
            {(['delivery', 'composure', 'command', 'posture'] as const).map((k) => (
              <Stack key={k} gap={4}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body small>{k[0].toUpperCase() + k.slice(1)}</Body>
                  <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink2 }}>{r.axes[k]}</RNText>
                </Row>
                <Bar value={r.axes[k]} />
              </Stack>
            ))}
            <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 4 }}>
              <Tag label={`${r.counts.wpm} wpm`} />
              <Tag label={`${r.counts.fillers} fillers`} />
              <Tag label={`${r.counts.hedges} hedges`} />
            </Row>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300)}>
          <Card style={{ gap: 4 }}>
            <Label>Best moment</Label>
            <Body small>{r.best_moment}</Body>
          </Card>
        </Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        {scan.mode === 'party' ? <Button label={scan.current + 1 < scan.players.length ? `Next: ${scan.players[scan.current + 1]}` : 'See the leaderboard'} sound="select" onPress={next} /> : <Button label="Done" onPress={() => router.dismissAll()} />}
        {r.video_id ? (
          <Button label={vid === 'making' ? 'Making your video' : 'Save the video'} variant="secondary" disabled={vid === 'making'} onPress={saveVideo} icon={<Icon d={ICON.share} size={16} color={t.ink} />} />
        ) : null}
        {vidNote ? <Muted small align="center" color={vid === 'error' ? t.accent : undefined}>{vidNote}</Muted> : null}
        <Button label="Share the card" variant="ghost" onPress={share} icon={<Icon d={ICON.share} size={16} color={t.ink} />} />
      </View>
    </Screen>
  );
}
