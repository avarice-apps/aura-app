import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, Text as RNText, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Segments } from '@/ui';
import { Conversation } from '@/components/Conversation';
import { useStore } from '@/state/store';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';

const LIMIT = 75; // seconds. One take, like real life.
const WHITE = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.72)';

/**
 * Onboarding 4 · The first live conversation. No warm-up and no retry: it starts on a count of three,
 * runs against a clock, and cuts hard. While Poise reads it, the user sees why Kleos exists.
 */
export default function Live() {
  const t = useTheme();
  const goal = useStore((s) => s.goal);
  const set = useStore((s) => s.set);
  const [stage, setStage] = useState<'intro' | 'call' | 'cut'>('intro');
  const [count, setCount] = useState(3);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [second, setSecond] = useState(false);

  // 3 · 2 · 1, felt as much as seen.
  useEffect(() => {
    if (stage !== 'intro') return;
    const lead = setTimeout(() => {
      let n = 3;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const id = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setStage('call');
          return;
        }
        setCount(n);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 800);
    }, 1400);
    return () => clearTimeout(lead);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'cut') return;
    const id = setTimeout(() => setSecond(true), 1700);
    return () => clearTimeout(id);
  }, [stage]);

  const cut = () => {
    play('cut');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setStage('cut');
  };
  const toPaywall = () => router.replace('/onboarding/paywall');

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segments total={5} done={4} />
      </View>

      {stage !== 'intro' && (
        <Conversation
          args={{ goal, pressure: 2 }}
          timeLimit={LIMIT}
          onEnded={cut}
          onLeave={toPaywall}
          onReadFailed={() => setFailed(true)}
          onError={() => {
            setFailed(true);
            setStage('cut');
          }}
          onDone={({ sessionId, evaluation }) => {
            set({ ob: { ...useStore.getState().ob, first: evaluation, firstSession: sessionId } });
            setReady(true);
          }}
        />
      )}

      {stage === 'intro' && (
        <Animated.View exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: t.accent, justifyContent: 'center', paddingHorizontal: 28 }]}>
          <Animated.View entering={FadeIn.duration(300)}>
            <RNText style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: 2, color: SOFT }}>ONE TAKE · {LIMIT} SECONDS</RNText>
          </Animated.View>
          <Animated.View entering={FadeIn.duration(300).delay(250)} style={{ marginTop: 14 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 44, lineHeight: 48, color: WHITE }}>No warm-up.{'\n'}No second take.</RNText>
          </Animated.View>
          <Animated.View key={count} entering={FadeIn.duration(200)} style={{ marginTop: 48 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 120, lineHeight: 124, color: WHITE }}>{count}</RNText>
          </Animated.View>
        </Animated.View>
      )}

      {stage === 'cut' && (
        <Animated.View entering={FadeIn.duration(120)} style={[StyleSheet.absoluteFill, { backgroundColor: t.accent, paddingHorizontal: 28, paddingTop: 120, paddingBottom: 48, justifyContent: 'space-between' }]}>
          <View style={{ gap: 26 }}>
            <Animated.View entering={FadeIn.duration(700).delay(350)}>
              <RNText style={{ fontFamily: font.serif, fontSize: 38, lineHeight: 44, color: WHITE }}>In reality, you aren’t often given second chances.</RNText>
            </Animated.View>
            {second && (
              <Animated.View entering={FadeIn.duration(800)}>
                <RNText style={{ fontFamily: font.serifItalic, fontSize: 30, lineHeight: 36, color: SOFT }}>That’s why we made Kleos, so you never feel you need one.</RNText>
              </Animated.View>
            )}
          </View>
          {second && (
            <Animated.View entering={FadeIn.duration(500).delay(400)} style={{ alignItems: 'center', gap: 12 }}>
              {failed ? (
                <Pressable onPress={toPaywall} style={{ height: 54, alignSelf: 'stretch', borderRadius: 27, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.accent }}>Continue</RNText>
                </Pressable>
              ) : ready ? (
                <Pressable onPress={() => router.replace('/onboarding/result')} style={{ height: 54, alignSelf: 'stretch', borderRadius: 27, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                  <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.accent }}>See how it went</RNText>
                </Pressable>
              ) : (
                <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color={WHITE} />
                  <RNText style={{ fontFamily: font.regular, fontSize: 14, color: SOFT }}>Poise is reading it</RNText>
                </View>
              )}
            </Animated.View>
          )}
        </Animated.View>
      )}
    </Screen>
  );
}
