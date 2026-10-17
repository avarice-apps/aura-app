import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Statue, ICON, Icon, ArtCard, OnBlue, Section } from '@/ui';
import { Image } from 'expo-image';
import { font, useTheme } from '@/theme';
import { useStore, auraIndex } from '@/state/store';
import { nextLesson, ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';
import { today } from '@/lib/dailies';
import { STRANGERS } from '@/lib/faces';
import { Display, Kicker, RowLink, Pill, Hair } from '@/components/Kit';
import { occasionFresh, whenLabel } from '@/lib/occasion';
import { WEEKLY, weekKey } from '@/lib/mirror';

const TIER = (n: number) => (n >= 85 ? 'Gravity' : n >= 72 ? 'Magnetic' : n >= 60 ? 'Composed' : n >= 45 ? 'Present' : 'Faint');

/**
 * Today: one thing to do now, then a short list. If something real is coming up, that's the thing
 * ("Tonight, handled."). Otherwise it's the next lesson, or, on day one, your first read.
 */
export default function Today() {
  const t = useTheme();
  const s = useStore();
  const mirrorDone = (s.mirror ?? []).some((r) => r.promptId === WEEKLY.id && weekKey(new Date(r.createdAt)) === weekKey());
  const idx = auraIndex(s.sessions);
  const next = nextLesson(s.laurels);
  const hour = new Date().getHours();
  const evening = hour >= 18 || hour < 3;
  const occ = occasionFresh(s.occasion) ? s.occasion : undefined;
  const first = s.sessions.length === 0;
  const mission = ALL_MISSIONS.find((m) => m.id === s.activeMission) ?? ALL_MISSIONS.find((m) => !s.missionsDone.includes(m.id)) ?? ALL_MISSIONS[0];
  const doneToday = s.daily?.day === today() ? s.daily.done : [];
  const dailyDone = (s.dailyQuestDone ?? []).includes(today()) || !!s.account?.daily_done;
  const lesson = () => { play('select'); router.push({ pathname: '/lesson/[id]', params: { id: next.lesson.id } }); };

  return (
    <Screen>
      {BACKDROP ? <Backdrop /> : null}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
          <View style={{ gap: 4 }}>
            <Kicker>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Kicker>
            <RNText style={{ fontFamily: font.serif, fontSize: 30, lineHeight: 32, color: t.ink }}>kleos</RNText>
          </View>
          <Pressable onPress={() => router.navigate('/(tabs)/you')} accessibilityLabel="You" style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{(s.name || 'K')[0].toUpperCase()}</RNText>
          </Pressable>
        </View>

        {/* the one thing: three planes, big serif at the back, the marble in the middle, the buttons on top */}
        <Animated.View entering={FadeInDown.duration(450)} style={{ marginTop: 22, borderRadius: 28, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden', minHeight: 330 }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -24, bottom: -14, opacity: t.dark ? 0.9 : 1 }}>
            <Statue name={occ ? 'antinoos' : first ? 'head' : 'bust'} height={240} />
          </View>
          <View style={{ padding: 22, gap: 12, flex: 1 }}>
            {occ ? (
              <>
                <Kicker>{whenLabel(occ)}</Kicker>
                <Display text={occ.when === 'tonight' ? 'Tonight, ' : occ.when === 'tomorrow' ? 'Tomorrow, ' : 'Ready for '} em={occ.when === 'tonight' || occ.when === 'tomorrow' ? 'handled.' : 'it.'} size={46} />
                <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: t.ink2, maxWidth: '62%' }} numberOfLines={3}>
                  {occ.what}
                  {occ.who ? `. ${occ.who}` : ''}
                </RNText>
              </>
            ) : first ? (
              <>
                <Kicker>Your first read</Kicker>
                <Display text="Start with " em="three minutes." size={46} />
                <RNText style={{ fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: t.ink2, maxWidth: '62%' }}>A short live scene. Poise tells you how it landed and the one thing to change.</RNText>
              </>
            ) : (
              <>
                <Kicker>{`The Path · ${next.unit.title}`}</Kicker>
                <Display text={next.lesson.title} size={40} />
                <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2, maxWidth: '62%' }} numberOfLines={3}>{next.lesson.objective}</RNText>
              </>
            )}
            <View style={{ flex: 1 }} />
            <View style={{ gap: 10, alignItems: 'flex-start' }}>
              {occ ? (
                <>
                  <Pill label="Practise the moment" icon={ICON.live} onPress={() => router.push({ pathname: '/rehearse', params: { from: 'occasion' } })} />
                  <Pill label="Choose your look" quiet onPress={() => router.push({ pathname: '/wardrobe', params: { from: 'occasion' } })} />
                </>
              ) : (
                <Pill label={first ? 'Start a scene' : 'Start · 3 min'} icon={ICON.play} onPress={lesson} />
              )}
            </View>
          </View>
        </Animated.View>

        {occ ? (
          <Pressable onPress={() => router.push('/occasion')} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 10 }}>
            <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink3 }}>Change it, or it’s over</RNText>
          </Pressable>
        ) : null}

        {/* today: one bold card, two pictures, then the small things */}
        <Animated.View entering={FadeInDown.duration(450).delay(80)} style={{ marginTop: 26, gap: 10 }}>
          <Section title="Today" note={s.streak > 0 ? `${s.streak}-day streak` : undefined} />
          <Pressable onPress={() => { play('select'); router.push('/daily'); }} style={({ pressed }) => ({ borderRadius: 24, backgroundColor: dailyDone ? t.card : t.accent, borderWidth: dailyDone ? 1 : 0, borderColor: t.line, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <Image source={STRANGERS[new Date().getDate() % STRANGERS.length]} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: t.cardAlt }} contentFit="cover" />
            <View style={{ flex: 1, gap: 3 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: dailyDone ? t.ink3 : 'rgba(255,255,255,0.75)' }}>{dailyDone ? 'DAILY SIDE QUEST · DONE' : 'DAILY SIDE QUEST'}</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 22, letterSpacing: -0.4, color: dailyDone ? t.ink : '#FFF' }}>{dailyDone ? 'Back tomorrow with someone new.' : 'Someone’s about to call you.'}</RNText>
            </View>
            {!dailyDone ? (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={ICON.play} size={16} color={t.accent} fill={t.accent} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <ArtCard art="youth" height={196} focus="top" scrim={0.95} onPress={() => router.navigate('/(tabs)/mirror')}>
                <OnBlue kicker={mirrorDone ? 'Mirror · done' : 'The Mirror'} size={19}>{mirrorDone ? 'See what moved' : 'This week’s take'}</OnBlue>
              </ArtCard>
            </View>
            <View style={{ flex: 1 }}>
              {occ ? (
                <ArtCard art="tennis" height={196} focus="top" scrim={0.95} onPress={lesson}>
                  <OnBlue kicker="The Path" size={19}>{next.lesson.title}</OnBlue>
                </ArtCard>
              ) : (
                <ArtCard art="seaside" height={196} focus="top" scrim={0.95} onPress={() => router.push('/occasion')}>
                  <OnBlue kicker="Coming up?" size={19}>Get ready for it</OnBlue>
                </ArtCard>
              )}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(500).delay(160)} style={{ marginTop: 18 }}>
          <RowLink first title="Situation of the day" sub="Ten seconds to read the room" dim={doneToday.includes('situation')} onPress={() => router.push('/situations')} />
          {evening ? (
            <RowLink title="Tonight’s debrief" sub="One moment from today, with Poise" dim={doneToday.includes('debrief')} onPress={() => router.navigate({ pathname: '/(tabs)/poise', params: { mode: 'debrief' } })} />
          ) : (
            <RowLink title={mission.title} sub="Field mission · do it for real" dim={doneToday.includes('mission')} onPress={() => router.push('/missions')} />
          )}
          <Hair />
        </Animated.View>

        {/* the Index, on its own plate */}
        <Animated.View entering={FadeIn.duration(500).delay(220)} style={{ marginTop: 22 }}>
          <ArtCard art="vespasian" height={170} focus="top" onPress={() => router.navigate('/(tabs)/you')}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>AURA INDEX</RNText>
                <RNText style={{ fontFamily: font.medium, fontSize: 17, color: '#FFF' }}>{idx === null ? 'After your first read' : TIER(idx)}</RNText>
              </View>
              <RNText style={{ fontFamily: font.medium, fontSize: 64, lineHeight: 64, letterSpacing: -2, color: '#FFF' }}>{idx ?? '—'}</RNText>
            </View>
          </ArtCard>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

// Two cobalt engravings at opposite corners, turned toward each other across the page, very faint.
const BACKDROP = true;
function Backdrop() {
  const t = useTheme();
  const o = t.dark ? 0.16 : 0.11;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <Statue name="engrAthlete" height={300} style={{ position: 'absolute', top: 40, right: -110, opacity: o, transform: [{ rotate: '-14deg' }, { scaleX: -1 }] }} />
      <Statue name="engrAntinoos" height={320} style={{ position: 'absolute', bottom: -40, left: -120, opacity: o, transform: [{ rotate: '12deg' }] }} />
    </View>
  );
}
