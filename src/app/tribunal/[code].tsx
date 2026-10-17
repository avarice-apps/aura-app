import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Share, Alert, ActivityIndicator, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON, Statue } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { Kicker, Pill, Hair } from '@/components/Kit';
import { tribunalGet, tribunalJoin, tribunalSubmit, tribunalAction, type Tribunal, type TribunalSeat } from '@/lib/api';
import { play } from '@/lib/sound';
import { track } from '@/lib/analytics';

const BLUE = '#1608F2';
const FORMAT_LABEL = { settle: 'Settle it', tribunal: 'The Tribunal', common: 'Find the disagreement' } as const;
const wordsIn = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * One Tribunal. What you see depends on who you are and where the round is:
 * the rules and a Join button (invited), your opening, the wait, the other side's opening and your reply,
 * the ruling. The server decides all of it; this screen polls while it waits.
 */
export default function TribunalRoom() {
  const t = useTheme();
  const s = useStore();
  const { code: raw, fresh } = useLocalSearchParams<{ code: string; fresh?: string }>();
  const code = String(raw ?? '').toUpperCase();
  const [v, setV] = useState<Tribunal | null>(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState(s.name || '');
  const [side, setSide] = useState('');
  const [busy, setBusy] = useState(false);
  const [since, setSince] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const x = await tribunalGet(code);
      setV(x);
      setErr('');
      return x;
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t open this tribunal.');
      return null;
    }
  }, [code]);

  useEffect(() => {
    let alive = true;
    tribunalGet(code)
      .then((x) => alive && setV(x))
      .catch((e) => alive && setErr(e?.message ?? 'Couldn’t open this tribunal.'));
    return () => {
      alive = false;
    };
  }, [code]);

  // Poll only while someone else has something to do.
  const mine = v?.me?.seat;
  const waiting = !!v && (v.state === 'judging' || (v.state === 'open' && !!v.me) || ((v.state === 'openings' || v.state === 'rebuttals') && !!v.me && !(v.waiting_for ?? []).includes(mine as TribunalSeat)) || (mine === 'audience' && v.state !== 'done'));
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    timer.current = setInterval(async () => {
      setSince(Math.round((Date.now() - started) / 1000));
      const x = await load();
      if (x && (x.state === 'done' || x.state === 'rebuttals')) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 3500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [waiting, load, v?.state]);

  async function join(seat: 'b' | 'audience') {
    setBusy(true);
    try {
      const x = await tribunalJoin(code, { name: name.trim() || 'Guest', side: side.trim() || undefined, seat });
      setV(x);
      track('tribunal_join', { seat });
      s.set({ tribunals: [{ code, topic: x.topic, createdAt: new Date().toISOString() }, ...(s.tribunals ?? []).filter((y) => y.code !== code)].slice(0, 20) });
      play('select');
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t join.');
    } finally {
      setBusy(false);
    }
  }

  async function send(kind: 'opening' | 'rebuttal') {
    setBusy(true);
    try {
      const x = await tribunalSubmit(code, kind, text.trim());
      setV(x);
      setText('');
      track('tribunal_submit', { kind });
      play('reveal');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t send that.');
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    const link = `kleos://tribunal/${code}`;
    await Share.share({ message: `Settle it on Kleos: “${v?.topic ?? ''}”. Open ${link} or enter ${code} in Play.` });
  }

  function more() {
    Alert.alert('Tribunal', undefined, [
      { text: 'Copy the code', onPress: () => Clipboard.setStringAsync(code) },
      { text: 'Report this round', onPress: () => tribunalAction(code, 'report', { reason: 'Reported from the app' }).then(() => Alert.alert('Thanks', 'We’ll take a look.')).catch(() => {}) },
      { text: 'Leave', style: 'destructive', onPress: () => tribunalAction(code, 'leave').then(() => router.back()).catch(() => router.back()) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (!v) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header onClose={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 }}>
          {err ? <RNText style={{ fontFamily: font.regular, fontSize: 15, color: t.ink2, textAlign: 'center' }}>{err}</RNText> : <ActivityIndicator color={t.accent} />}
        </View>
      </Screen>
    );
  }

  const other: TribunalSeat = mine === 'a' ? 'b' : 'a';
  const sub = (seat: TribunalSeat, kind: 'opening' | 'rebuttal') => v.submissions?.find((x) => x.seat === seat && x.kind === kind);
  const kind: 'opening' | 'rebuttal' | null =
    mine === 'a' || mine === 'b'
      ? !v.me!.submitted.includes('opening') && (v.state === 'open' || v.state === 'openings')
        ? 'opening'
        : v.state === 'rebuttals' && !v.me!.submitted.includes('rebuttal')
          ? 'rebuttal'
          : null
      : null;
  const limit = kind ? v.limits[kind] : 0;
  const n = wordsIn(text);
  const names = { a: v.seats.a?.name ?? 'Them', b: v.seats.b?.name ?? 'Them' };
  const closed = v.state === 'expired' || v.state === 'abandoned';
  const canJoin = v.state === 'open';
  const canWatch = v.watchers && v.state !== 'done';
  const shutOut = !v.me && !closed && !canJoin && !canWatch;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header onClose={() => router.back()} onMore={v.me ? more : undefined} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 8 }}>
            <Kicker>{`${FORMAT_LABEL[v.format]} · ${code}`}</Kicker>
            <RNText style={{ fontFamily: font.serif, fontSize: 34, lineHeight: 38, color: t.ink }}>{v.topic}</RNText>
          </Animated.View>

          {/* the two seats */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {(['a', 'b'] as TribunalSeat[]).map((k) => (
              <View key={k} style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: mine === k ? t.accent : t.line, padding: 12, gap: 2 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: t.ink3 }}>{mine === k ? 'YOU' : k === 'a' ? 'FIRST SEAT' : 'SECOND SEAT'}</RNText>
                <RNText numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 16, color: v.seats[k] ? t.ink : t.ink3 }}>{v.seats[k]?.name ?? 'Waiting…'}</RNText>
                {v.seats[k]?.side ? <RNText numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{v.seats[k]!.side}</RNText> : null}
              </View>
            ))}
          </View>
          {v.audience ? <RNText style={{ marginTop: 8, fontFamily: font.regular, fontSize: 12.5, color: t.ink3 }}>{v.audience} watching</RNText> : null}

          {/* invited: the rules first, then an explicit join */}
          {shutOut ? (
            <RNText style={{ marginTop: 24, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>
              {v.state === 'done' ? 'This round is over, and it was just for the two of them.' : 'Both seats are taken, and this one’s just for the two of them.'}
            </RNText>
          ) : null}
          {!v.me && !closed && !shutOut ? (
            <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24, gap: 14 }}>
              {[v.rules.what, v.rules.flow, v.rules.who_sees, v.rules.fair, v.rules.kept].map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink3, width: 14, paddingTop: 2 }}>{i + 1}</RNText>
                  <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 14.5, lineHeight: 20, color: t.ink }}>{r}</RNText>
                </View>
              ))}
              <Hair />
              <TextInput value={name} onChangeText={(x) => setName(x.slice(0, 24))} placeholder="Your name" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 16, color: t.ink, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }} />
              {v.state === 'open' && v.format !== 'common' ? (
                <TextInput value={side} onChangeText={(x) => setSide(x.slice(0, 60))} placeholder="Your side (optional)" placeholderTextColor={t.ink3} style={{ fontFamily: font.regular, fontSize: 16, color: t.ink, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }} />
              ) : null}
            </Animated.View>
          ) : null}

          {closed ? (
            <RNText style={{ marginTop: 24, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>{v.state === 'expired' ? 'This invite expired before anyone joined.' : 'Someone left, so this round closed. Nothing was judged.'}</RNText>
          ) : null}

          {/* the round so far */}
          {v.me && v.state !== 'done' ? (
            <View style={{ marginTop: 22, gap: 12 }}>
              {(['opening', 'rebuttal'] as const).map((k) =>
                (['a', 'b'] as TribunalSeat[]).map((seat) => {
                  const x = sub(seat, k);
                  if (!x) return null;
                  return <Entry key={x.id} who={seat === mine ? 'You' : names[seat]} kind={k} text={x.text} mine={seat === mine} />;
                }),
              )}
              {v.state === 'open' && mine === 'a' ? (
                <View style={{ borderRadius: 20, backgroundColor: BLUE, padding: 18, gap: 10 }}>
                  <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: 'rgba(255,255,255,0.75)' }}>INVITE · {code}</RNText>
                  <RNText style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 28, color: '#FFF' }}>Send it to the other side. The code lasts two days.</RNText>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={invite} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center' }}>
                      <RNText style={{ fontFamily: font.medium, fontSize: 14, color: BLUE }}>Send the invite</RNText>
                    </Pressable>
                    <Pressable onPress={() => { Clipboard.setStringAsync(code); Haptics.selectionAsync(); }} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center' }}>
                      <RNText style={{ fontFamily: font.medium, fontSize: 14, color: '#FFF' }}>Copy code</RNText>
                    </Pressable>
                  </View>
                  {fresh ? <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>You can write your opening now. They won’t see it until theirs is in too.</RNText> : null}
                </View>
              ) : null}
              {v.state === 'rebuttals' && kind === 'rebuttal' ? (
                <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2 }}>{`Both openings are in. Answer ${names[other]}’s strongest point.`}</RNText>
              ) : null}
              {!kind && v.state !== 'judging' && v.state !== 'open' && !closed && mine !== 'audience' ? (
                <Waiting label={`Waiting for ${names[other]}`} sub="Yours is locked in. We’ll update this when they’re done." />
              ) : null}
              {v.state === 'judging' ? (
                <Waiting
                  label="Poise is reading both sides"
                  sub={since > 45 ? 'Taking longer than usual.' : 'Twice, with the order swapped. About ten seconds.'}
                  action={since > 45 && mine !== 'audience' ? { label: 'Ask again', onPress: () => tribunalAction(code, 'judge').then(setV).catch(() => {}) } : undefined}
                />
              ) : null}
              {mine === 'audience' && v.state !== 'judging' ? <Waiting label="You’re watching" sub="You’ll see each part once both sides have sent it." /> : null}
            </View>
          ) : null}

          {/* the ruling */}
          {v.state === 'done' && v.result ? <Ruling v={v} mine={mine} names={names} /> : null}

          {err ? <RNText style={{ marginTop: 14, fontFamily: font.regular, fontSize: 14, color: t.accent }}>{err}</RNText> : null}
        </ScrollView>

        {/* the composer */}
        {kind && !closed ? (
          <View style={{ borderTopWidth: 1, borderColor: t.line, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Kicker color={t.accent}>{kind === 'opening' ? 'Your opening' : 'Your reply'}</Kicker>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, color: n > limit ? '#E5484D' : t.ink3 }}>{`${n} / ${limit}`}</RNText>
            </View>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={kind === 'opening' ? 'Your claim, and why. One good reason beats three loose ones.' : `What does ${names[other]} get wrong?`}
              placeholderTextColor={t.ink3}
              style={{ minHeight: 84, maxHeight: 180, fontFamily: font.regular, fontSize: 15.5, lineHeight: 22, color: t.ink, textAlignVertical: 'top' }}
            />
            <Pill label={busy ? 'Locking it in…' : 'Lock it in'} onPress={() => send(kind)} disabled={busy || n < 3 || n > limit} />
          </View>
        ) : !v.me && !closed && !shutOut ? (
          <View style={{ paddingHorizontal: 22, paddingBottom: 10, gap: 10 }}>
            {canJoin ? <Pill label={busy ? 'Joining…' : 'Join and take the other side'} onPress={() => join('b')} disabled={busy} /> : null}
            {canWatch ? <Pill label="Just watch" quiet onPress={() => join('audience')} disabled={busy} /> : null}
          </View>
        ) : v.state === 'done' && (mine === 'a' || mine === 'b') ? (
          <View style={{ paddingHorizontal: 22, paddingBottom: 10, flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Pill label="Rematch" onPress={() => tribunalAction(code, 'rematch').then((x: Tribunal) => router.replace({ pathname: '/tribunal/[code]', params: { code: x.code, fresh: '1' } })).catch((e: any) => setErr(e?.message ?? 'Couldn’t start a rematch.'))} />
            </View>
            <View style={{ flex: 1 }}>
              <Pill label="Share" quiet onPress={() => Share.share({ message: `${v.topic}\n${v.result?.verdict ?? ''}\nSettled on Kleos.` })} />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Header({ onClose, onMore }: { onClose: () => void; onMore?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 8 }}>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={ICON.close} size={15} color={t.ink} />
      </Pressable>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={10} accessibilityLabel="More" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink, marginTop: -6 }}>…</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

function Entry({ who, kind, text, mine }: { who: string; kind: string; text: string; mine: boolean }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ borderRadius: 20, borderWidth: 1, borderColor: mine ? t.accent : t.line, backgroundColor: mine ? t.accentSoft : t.card, padding: 14, gap: 6 }}>
      <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: t.ink3 }}>{`${who.toUpperCase()} · ${kind.toUpperCase()}`}</RNText>
      <RNText selectable style={{ fontFamily: font.regular, fontSize: 15.5, lineHeight: 22, color: t.ink }}>{text}</RNText>
    </Animated.View>
  );
}

function Waiting({ label, sub, action }: { label: string; sub: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <ActivityIndicator color={t.accent} />
      <View style={{ flex: 1 }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{label}</RNText>
        <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{sub}</RNText>
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <RNText style={{ fontFamily: font.medium, fontSize: 13, color: t.accent }}>{action.label}</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

function Ruling({ v, mine, names }: { v: Tribunal; mine?: string; names: Record<TribunalSeat, string> }) {
  const t = useTheme();
  const r = v.result!;
  const head =
    r.outcome === 'a' || r.outcome === 'b'
      ? { kicker: r.margin === 'close' ? 'THIS ROUND, NARROWLY' : 'THIS ROUND GOES TO', big: names[r.outcome] }
      : r.outcome === 'draw'
        ? { kicker: 'THE RULING', big: 'A draw.' }
        : r.outcome === 'none'
          ? { kicker: 'WHERE YOU ACTUALLY DISAGREE', big: 'The real split.' }
          : r.outcome === 'declined'
            ? { kicker: 'NO RULING', big: 'Poise passed.' }
            : { kicker: 'NO RULING', big: 'Not enough to go on.' };
  return (
    <View style={{ marginTop: 20, gap: 14 }}>
      <Animated.View entering={FadeInDown.duration(500)} style={{ borderRadius: 26, backgroundColor: BLUE, padding: 22, gap: 10, overflow: 'hidden', minHeight: 200 }}>
        <View style={{ position: 'absolute', right: -16, bottom: -14, opacity: 0.95 }} pointerEvents="none">
          <Statue name="bust" height={170} />
        </View>
        <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.8, color: 'rgba(255,255,255,0.75)' }}>{head.kicker}</RNText>
        <RNText style={{ fontFamily: font.serif, fontSize: 42, lineHeight: 44, color: '#FFF', maxWidth: '72%' }}>{head.big}</RNText>
        <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: '#FFF', maxWidth: '70%' }}>{r.verdict}</RNText>
        {r.split ? <RNText style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: 'rgba(255,255,255,0.8)', maxWidth: '70%' }}>Read both ways round, it came out differently. Call it close.</RNText> : null}
      </Animated.View>

      {r.theatre ? <RNText style={{ fontFamily: font.serifItalic, fontSize: 20, lineHeight: 26, color: t.em }}>{r.theatre}</RNText> : null}

      {r.common ? (
        <View style={{ gap: 12 }}>
          {(['a', 'b'] as TribunalSeat[]).map((k) => (r.common!.needs[k] ? <Line key={k} label={`${names[k]} needs`} text={r.common!.needs[k]} /> : null))}
          {r.common.disputed.length ? <Line label="What you actually disagree on" text={r.common.disputed.map((x) => `· ${x}`).join('\n')} /> : null}
          {r.common.agreed.length ? <Line label="Already agreed" text={r.common.agreed.map((x) => `· ${x}`).join('\n')} /> : null}
          {r.common.next_steps.length ? <Line label="A way forward" text={r.common.next_steps.map((x, i) => `${i + 1}. ${x}`).join('\n')} /> : null}
        </View>
      ) : null}

      {(['a', 'b'] as TribunalSeat[]).map((k) => {
        const o = r.observations[k];
        if (!o) return null;
        return (
          <View key={k} style={{ gap: 4, paddingTop: 4 }}>
            <Kicker>{k === mine ? 'You' : names[k]}</Kicker>
            <RNText style={{ fontFamily: font.serifItalic, fontSize: 18, lineHeight: 24, color: t.ink }}>“{o.quote}”</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2 }}>{o.note}</RNText>
          </View>
        );
      })}

      {r.decisive ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: t.accent, padding: 14, gap: 4 }}>
          <Kicker color={t.accent}>{`The moment that decided it · ${r.decisive.seat === mine ? 'you' : names[r.decisive.seat]}`}</Kicker>
          <RNText style={{ fontFamily: font.serifItalic, fontSize: 18, lineHeight: 24, color: t.ink }}>“{r.decisive.quote}”</RNText>
          <RNText style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: t.ink2 }}>{r.decisive.why}</RNText>
        </View>
      ) : null}

      {r.unverified.length ? (
        <View style={{ gap: 4 }}>
          <Kicker>Not checked</Kicker>
          {r.unverified.map((u, i) => (
            <RNText key={i} style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink3 }}>{`· ${u.claim}`}</RNText>
          ))}
        </View>
      ) : null}
      {r.declined_reason ? <RNText style={{ fontFamily: font.regular, fontSize: 14, color: t.ink2 }}>{r.declined_reason}</RNText> : null}

      <RNText style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>{`${r.note} Written round, so there’s no delivery score.`}</RNText>
    </View>
  );
}

function Line({ label, text }: { label: string; text: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Kicker>{label}</Kicker>
      <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: t.ink }}>{text}</RNText>
    </View>
  );
}
