import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Share, ActivityIndicator, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Icon, ICON, Statue } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { tableVerdict, type TablePlayer, type TableVerdict } from '@/lib/api';
import { play } from '@/lib/sound';
import { track } from '@/lib/analytics';
import { Display, Kicker, Pill, Chip, Hair } from '@/components/Kit';
import TABLE from '../../content/table.json';

type Mission = { id: string; text: string; bold: boolean };
type Step = 'setup' | 'pass' | 'secret' | 'play' | 'reveal' | 'verdict';
type Outcome = TablePlayer['outcome'];

const BLUE = '#1608F2';
const SOFT = 'rgba(255,255,255,0.74)';
const OUTCOMES: { k: Outcome; label: string; sub: string }[] = [
  { k: 'clean', label: 'Clean', sub: 'Did it, nobody noticed' },
  { k: 'obvious', label: 'Obvious', sub: 'Did it, a bit loud' },
  { k: 'caught', label: 'Caught', sub: 'Someone called it' },
  { k: 'missed', label: 'Missed', sub: 'Didn’t pull it off' },
];
const POINTS: Record<Outcome, number> = { clean: 3, obvious: 1, caught: -1, missed: 0 };
const ROUNDS = [10, 20, 30];

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The Table. Poise hosts dinner: everyone gets a secret mission, you pass the phone round, then you just talk.
 * At the end the table votes on how each mission went and Poise reads the verdict. Bold missions only in Unfiltered.
 */
export default function TableGame() {
  const t = useTheme();
  const tone = useStore((s) => s.tone);
  const pool = useMemo(() => (TABLE.missions as Mission[]).filter((m) => tone === 'unfiltered' || !m.bold), [tone]);
  const [step, setStep] = useState<Step>('setup');
  const [names, setNames] = useState<string[]>(['', '', '']);
  const [mins, setMins] = useState(20);
  const [deal, setDeal] = useState<{ name: string; mission: Mission; swapped: boolean }[]>([]);
  const [turn, setTurn] = useState(0);
  const [votes, setVotes] = useState<{ outcome?: Outcome; guessed: boolean }[]>([]);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<TableVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const deck = useRef<Mission[]>([]);

  const players = names.map((n) => n.trim()).filter(Boolean);
  const unique = new Set(players.map((n) => n.toLowerCase())).size === players.length;
  const ready = players.length >= 3 && players.length <= 8 && unique;

  // the round clock (side effects live in the tick, never inside a state updater)
  const leftRef = useRef(0);
  useEffect(() => {
    if (step !== 'play') return;
    const id = setInterval(() => {
      leftRef.current = Math.max(0, leftRef.current - 1);
      setLeft(leftRef.current);
      if (leftRef.current === 0) {
        clearInterval(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        play('reveal');
        setTurn(0);
        setStep('reveal');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  function draw(): Mission {
    if (!deck.current.length) deck.current = shuffle(pool);
    return deck.current.pop()!;
  }

  function start() {
    if (!ready) return;
    deck.current = shuffle(pool);
    setDeal(players.map((name) => ({ name, mission: draw(), swapped: false })));
    setVotes(players.map(() => ({ guessed: false })));
    setTurn(0);
    setResult(null);
    setStep('pass');
    track('table_start', { players: players.length, mins });
  }

  function swap() {
    setDeal((d) => d.map((p, i) => (i === turn && !p.swapped ? { ...p, mission: draw(), swapped: true } : p)));
    Haptics.selectionAsync();
  }

  function nextSecret() {
    if (turn + 1 < deal.length) {
      setTurn(turn + 1);
      setStep('pass');
    } else {
      leftRef.current = mins * 60;
      setLeft(mins * 60);
      setStep('play');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  async function finish() {
    const ps: TablePlayer[] = deal.map((p, i) => ({ name: p.name, mission: p.mission.id, outcome: votes[i].outcome ?? 'missed', guessed: votes[i].guessed }));
    setStep('verdict');
    setBusy(true);
    try {
      setResult(await tableVerdict(ps));
    } catch (e: any) {
      if (e?.name === 'PlanError') {
        setBusy(false);
        setStep('reveal');
        return;
      }
      // Offline or the server is busy: the scores are simple enough to settle here.
      const scored = ps.map((p) => ({ ...p, points: POINTS[p.outcome] + (!p.guessed && (p.outcome === 'clean' || p.outcome === 'obvious') ? 1 : 0), line: '' }));
      const best = [...scored].sort((a, b) => b.points - a.points || Number(b.outcome === 'clean') - Number(a.outcome === 'clean'))[0];
      setResult({ players: scored, winner: best.name, crown: `${best.name} takes the table.`, toast: 'Same time next week.' });
    } finally {
      setBusy(false);
    }
    play('cleared');
  }

  async function share() {
    if (!result) return;
    const lines = [...result.players].sort((a, b) => b.points - a.points).map((p) => `${p.name} ${p.points > 0 ? '+' : ''}${p.points}`);
    await Share.share({ message: `The Table, hosted by Poise.\n${result.crown}\n${lines.join(' · ')}\nkleos` });
  }

  const blue = step === 'pass' || step === 'secret' || step === 'play';
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const me = deal[turn];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: blue ? BLUE : t.bg }}>
      <StatusBar style={blue || t.dark ? 'light' : 'dark'} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 6, height: 50 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Leave the table" style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: blue ? 'rgba(255,255,255,0.35)' : t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICON.close} size={14} color={blue ? '#FFF' : t.ink} />
        </Pressable>
        <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 2, color: blue ? SOFT : t.ink3 }}>THE TABLE{tone === 'unfiltered' ? ' · BOLD' : ''}</RNText>
        <View style={{ width: 38 }} />
      </View>

      {step === 'setup' && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
            <Kicker>A dinner game · 3 to 8 players</Kicker>
            <Display text="Poise hosts " em="the table." size={44} />
            <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>Everyone gets a secret mission. Pass the phone, then just talk. Pull yours off without anyone noticing. At the end, the table votes and Poise reads the verdict.</RNText>
          </Animated.View>

          <View style={{ marginTop: 26 }}>
            <Kicker>Who’s at the table</Kicker>
            {names.map((n, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: t.line }}>
                <RNText style={{ width: 20, fontFamily: font.mono, fontSize: 12, color: t.ink3 }}>{i + 1}</RNText>
                <TextInput
                  value={n}
                  onChangeText={(v) => setNames(names.map((x, k) => (k === i ? v.replace(/[^\p{L}\p{N} '.-]/gu, '').slice(0, 20) : x)))}
                  placeholder={i === 0 ? 'Your name' : 'Name'}
                  placeholderTextColor={t.ink3}
                  autoCapitalize="words"
                  returnKeyType="next"
                  style={{ flex: 1, fontFamily: font.regular, fontSize: 17, color: t.ink, paddingVertical: 13 }}
                />
                {names.length > 3 ? (
                  <Pressable onPress={() => setNames(names.filter((_, k) => k !== i))} hitSlop={8} accessibilityLabel="Remove player">
                    <Icon d={ICON.close} size={12} color={t.ink3} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {names.length < 8 ? (
              <Pressable onPress={() => setNames([...names, ''])} hitSlop={6} style={{ paddingVertical: 14 }}>
                <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.accent }}>+ Add someone</RNText>
              </Pressable>
            ) : null}
            {!unique && players.length ? <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.accent }}>Two people have the same name. Add an initial.</RNText> : null}
          </View>

          <View style={{ marginTop: 18, gap: 10 }}>
            <Kicker>How long</Kicker>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ROUNDS.map((m) => <Chip key={m} label={`${m} min`} on={mins === m} onPress={() => setMins(m)} />)}
            </View>
            <RNText style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, color: t.ink3 }}>
              {tone === 'unfiltered' ? 'Unfiltered is on, so bold missions are in the deck.' : 'Turn on Unfiltered for the bold missions.'} Missions are harmless: nothing at anyone’s expense, no drinking dares.
            </RNText>
          </View>
        </ScrollView>
      )}
      {step === 'setup' && (
        <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
          <Pill label={ready ? 'Deal the missions' : players.length < 3 ? 'Add at least three names' : 'Deal the missions'} onPress={start} disabled={!ready} />
        </View>
      )}

      {/* pass the phone */}
      {step === 'pass' && me && (
        <Animated.View key={`pass-${turn}`} entering={FadeIn.duration(300)} exiting={FadeOut.duration(150)} style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24 }}>
          <View style={{ marginTop: 60, gap: 14 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 2, color: SOFT }}>{`MISSION ${turn + 1} OF ${deal.length}`}</RNText>
            <RNText style={{ fontFamily: font.serif, fontSize: 52, lineHeight: 54, color: '#FFF' }}>Pass it to{'\n'}<RNText style={{ fontFamily: font.serifItalic }}>{me.name}.</RNText></RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: SOFT }}>Everyone else, look away.</RNText>
          </View>
          <BigButton label={`I’m ${me.name}. Show me`} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStep('secret'); }} />
        </Animated.View>
      )}

      {step === 'secret' && me && (
        <Animated.View key={`secret-${turn}`} entering={ZoomIn.duration(260)} style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24 }}>
          <View style={{ marginTop: 50, gap: 18 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 2, color: SOFT }}>{`${me.name.toUpperCase()}, YOUR MISSION`}</RNText>
            <RNText style={{ fontFamily: font.serif, fontSize: 36, lineHeight: 42, color: '#FFF' }}>{me.mission.text}</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: SOFT }}>Do it during the conversation. Clean beats obvious. Don’t get caught.</RNText>
          </View>
          <View style={{ gap: 12 }}>
            {!me.swapped ? (
              <Pressable onPress={swap} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 8 }}>
                <RNText style={{ fontFamily: font.regular, fontSize: 14, color: SOFT }}>Swap it once</RNText>
              </Pressable>
            ) : null}
            <BigButton label={turn + 1 < deal.length ? 'Got it. Hide it' : 'Got it. Start the round'} onPress={nextSecret} />
          </View>
        </Animated.View>
      )}

      {/* the round */}
      {step === 'play' && (
        <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24 }}>
          <View style={{ marginTop: 40, gap: 10 }}>
            <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 2, color: SOFT }}>THE ROUND IS ON</RNText>
            <RNText style={{ fontFamily: font.serif, fontSize: 104, lineHeight: 108, color: '#FFF', letterSpacing: -2 }}>{clock}</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: SOFT }}>Put the phone face down. Talk like normal. Everyone’s on a mission.</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: SOFT, marginTop: 10 }}>If you think you’ve caught someone, say so. It counts at the reveal.</RNText>
          </View>
          <BigButton label="End it. Time for the reveal" quiet onPress={() => { setStep('reveal'); setTurn(0); }} />
        </Animated.View>
      )}

      {/* the reveal: the table votes on each mission */}
      {step === 'reveal' && deal[turn] && (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            <Animated.View key={`rev-${turn}`} entering={FadeInDown.duration(320)} style={{ gap: 12 }}>
              <Kicker>{`The reveal · ${turn + 1} of ${deal.length}`}</Kicker>
              <Display text={`${deal[turn].name}’s `} em="mission" size={38} />
              <View style={{ borderRadius: 22, backgroundColor: BLUE, padding: 20 }}>
                <RNText style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 30, color: '#FFF' }}>{deal[turn].mission.text}</RNText>
              </View>
              <RNText style={{ fontFamily: font.regular, fontSize: 14, color: t.ink2, marginTop: 4 }}>How did it go? The table decides.</RNText>
              <View style={{ gap: 0 }}>
                {OUTCOMES.map((o, i) => {
                  const on = votes[turn]?.outcome === o.k;
                  return (
                    <Pressable key={o.k} onPress={() => { Haptics.selectionAsync(); setVotes(votes.map((v, k) => (k === turn ? { ...v, outcome: o.k } : v))); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 1.5, borderColor: on ? t.accent : t.lineStrong }} />
                      <View style={{ flex: 1 }}>
                        <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>{o.label}</RNText>
                        <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink2 }}>{o.sub}</RNText>
                      </View>
                      <RNText style={{ fontFamily: font.mono, fontSize: 12, color: t.ink3 }}>{POINTS[o.k] > 0 ? '+' : ''}{POINTS[o.k]}</RNText>
                    </Pressable>
                  );
                })}
                <Hair />
              </View>
              <Pressable onPress={() => setVotes(votes.map((v, k) => (k === turn ? { ...v, guessed: !v.guessed } : v)))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: votes[turn]?.guessed ? t.accent : t.lineStrong, backgroundColor: votes[turn]?.guessed ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {votes[turn]?.guessed ? <Icon d={ICON.check} size={13} color={t.onAccent} stroke={2.6} /> : null}
                </View>
                <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: t.ink }}>Someone guessed the mission</RNText>
                <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink3 }}>{votes[turn]?.guessed ? 'no bonus' : '+1 if unguessed'}</RNText>
              </Pressable>
            </Animated.View>
          </ScrollView>
          <View style={{ paddingHorizontal: 22, paddingBottom: 10, flexDirection: 'row', gap: 10 }}>
            {turn > 0 ? <Pill label="Back" quiet onPress={() => setTurn(turn - 1)} /> : null}
            <View style={{ flex: 1 }}>
              <Pill label={turn + 1 < deal.length ? 'Next' : 'Poise, the verdict'} disabled={!votes[turn]?.outcome} onPress={() => (turn + 1 < deal.length ? setTurn(turn + 1) : finish())} />
            </View>
          </View>
        </View>
      )}

      {/* the verdict */}
      {step === 'verdict' && (
        <View style={{ flex: 1 }}>
          {busy || !result ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <ActivityIndicator color={t.accent} />
              <RNText style={{ fontFamily: font.serifItalic, fontSize: 22, color: t.ink }}>Poise is deciding.</RNText>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInDown.duration(500)} style={{ borderRadius: 28, backgroundColor: BLUE, padding: 22, gap: 10, overflow: 'hidden', minHeight: 220 }}>
                  <View style={{ position: 'absolute', right: -18, bottom: -16, opacity: 0.95 }} pointerEvents="none">
                    <Statue name="antinoos" height={190} />
                  </View>
                  <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 2, color: SOFT }}>TONIGHT’S TABLE</RNText>
                  <RNText style={{ fontFamily: font.serif, fontSize: 44, lineHeight: 46, color: '#FFF', maxWidth: '70%' }}>{result.winner}</RNText>
                  <RNText style={{ fontFamily: font.serifItalic, fontSize: 19, lineHeight: 24, color: '#FFF', maxWidth: '66%' }}>{result.crown}</RNText>
                </Animated.View>
                <View style={{ marginTop: 18 }}>
                  {[...result.players].sort((a, b) => b.points - a.points).map((p, i) => {
                    const m = deal.find((d) => d.name === p.name)?.mission;
                    return (
                      <Animated.View key={p.name} entering={FadeInDown.duration(380).delay(120 + i * 70)} style={{ paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <RNText style={{ fontFamily: font.medium, fontSize: 17, color: t.ink }}>{p.name}</RNText>
                          <RNText style={{ fontFamily: font.mono, fontSize: 13, color: p.points > 0 ? t.accent : t.ink2 }}>{p.points > 0 ? '+' : ''}{p.points} · {OUTCOMES.find((o) => o.k === p.outcome)?.label}</RNText>
                        </View>
                        {m ? <RNText style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink3 }}>{m.text}</RNText> : null}
                        {p.line ? <RNText style={{ fontFamily: font.serifItalic, fontSize: 17, lineHeight: 23, color: t.ink }}>{p.line}</RNText> : null}
                      </Animated.View>
                    );
                  })}
                  <Hair />
                </View>
                <RNText style={{ marginTop: 18, fontFamily: font.serifItalic, fontSize: 20, lineHeight: 26, color: t.em, textAlign: 'center' }}>{result.toast}</RNText>
                <RNText style={{ marginTop: 10, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3, textAlign: 'center' }}>A verdict on tonight’s round, nothing more.</RNText>
              </ScrollView>
              <View style={{ paddingHorizontal: 22, paddingBottom: 10, gap: 10 }}>
                <Pill label="Another round" onPress={start} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Pill label="Share" quiet onPress={share} /></View>
                  <View style={{ flex: 1 }}><Pill label="Done" quiet onPress={() => router.back()} /></View>
                </View>
              </View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function BigButton({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable onPress={() => { play('tap'); onPress(); }} style={({ pressed }) => ({ height: 58, borderRadius: 29, backgroundColor: quiet ? 'transparent' : '#FFF', borderWidth: quiet ? 1 : 0, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <RNText style={{ fontFamily: font.medium, fontSize: 16, color: quiet ? '#FFF' : BLUE }}>{label}</RNText>
    </Pressable>
  );
}
