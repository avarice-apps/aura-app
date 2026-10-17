import React from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Statue, ICON, Chevron } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore, auraIndex } from '@/state/store';
import { nextLesson, ALL_MISSIONS } from '@/lib/progress';
import { play } from '@/lib/sound';
import { today } from '@/lib/dailies';
import { STRANGERS } from '@/lib/faces';
import { Display, Kicker, RowLink, Pill, Hair } from '@/components/Kit';
import { occasionFresh, whenLabel } from '@/lib/occasion';

const TIER = (n: number) => (n >= 85 ? 'Gravity' : n >= 72 ? 'Magnetic' : n >= 60 ? 'Composed' : n >= 45 ? 'Present' : 'Faint');

/**
 * Today: one thing to do now, then a short list. If something real is coming up, that's the thing
 * ("Tonight, handled."). Otherwise it's the next lesson, or, on day one, your first read.
 */
export default function Today() {
  const t = useTheme();
  const s = useStore();
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

        {/* the short list */}
        <Animated.View entering={FadeIn.duration(500).delay(120)} style={{ marginTop: 22 }}>
          <RowLink
            first
            thumb={STRANGERS[new Date().getDate() % STRANGERS.length]}
            title={dailyDone ? 'Daily Side Quest · done' : 'Daily Side Quest'}
            sub={dailyDone ? 'Back tomorrow with someone new.' : 'Someone’s about to call. You find out who when it connects.'}
            onPress={() => router.push('/daily')}
          />
          {!occ ? <RowLink title="Something coming up?" sub="Tell Poise. Get the look and the practice for it." onPress={() => router.push('/occasion')} /> : null}
          {occ && !first ? <RowLink title="Continue your Path" sub={`${next.lesson.title} · 3 minutes`} onPress={lesson} /> : null}
          <RowLink title="Situation of the day" sub="Ten seconds to read the room" dim={doneToday.includes('situation')} onPress={() => router.push('/situations')} />
          {evening ? (
            <RowLink title="Tonight’s debrief" sub="One moment from today, with Poise" dim={doneToday.includes('debrief')} onPress={() => router.navigate({ pathname: '/(tabs)/poise', params: { mode: 'debrief' } })} />
          ) : (
            <RowLink title={mission.title} sub="Field mission · do it for real" dim={doneToday.includes('mission')} onPress={() => router.push('/missions')} />
          )}
          <Hair />
        </Animated.View>

        {/* the Index, small */}
        <Pressable onPress={() => router.navigate('/(tabs)/you')} style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Kicker>Aura Index</Kicker>
          <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{idx === null ? 'after your first read' : `${idx} · ${TIER(idx)}`}</RNText>
          <View style={{ flex: 1 }} />
          {s.streak > 0 ? <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1, color: t.ink3 }}>{s.streak}-DAY STREAK</RNText> : null}
          <Chevron />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
