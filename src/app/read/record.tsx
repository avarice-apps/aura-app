import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import Animated, { FadeIn, FadeOut, useSharedValue, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Row, Numeral } from '@/ui';
import { Mark } from '@/components/Mark';
import { color, space } from '@/theme/tokens';
import { READ_PROMPTS } from '@/data';

type Phase = 'permission' | 'ready' | 'countdown' | 'recording' | 'done';

export default function Record() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const prompt = READ_PROMPTS.find((p) => p.id === id) ?? READ_PROMPTS[0];
  const [cam, requestCam] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const camRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>('permission');
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(prompt.seconds);
  const energy = useSharedValue(0);
  const recordingPromise = useRef<Promise<{ uri: string } | undefined> | null>(null);

  useEffect(() => {
    if (cam?.granted && mic?.granted) setPhase((p) => (p === 'permission' ? 'ready' : p));
  }, [cam, mic]);

  // countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      setPhase('recording');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, count]);

  // recording
  useEffect(() => {
    if (phase !== 'recording') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // the Mark breathes while you speak. Real voice energy is measured server-side; this is the live feel.
    energy.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    recordingPromise.current = camRef.current?.recordAsync({ maxDuration: prompt.seconds }) ?? null;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    const stop = setTimeout(() => finish(), prompt.seconds * 1000 + 300);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
      cancelAnimation(energy);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function finish() {
    if (phase === 'done') return;
    setPhase('done');
    cancelAnimation(energy);
    energy.value = withTiming(0, { duration: 600 });
    camRef.current?.stopRecording();
    const result = await recordingPromise.current;
    if (!result?.uri) {
      router.replace('/read');
      return;
    }
    router.replace({ pathname: '/read/processing', params: { uri: result.uri, id: prompt.id } });
  }

  if (phase === 'permission') {
    return (
      <Screen surface="cobalt">
        <Gutter style={{ flex: 1, justifyContent: 'center' }}>
          <Stack gap={space.l}>
            <Label>Camera and microphone</Label>
            <Display size="d3">Poise needs to see and hear you.</Display>
            <Body color={color.w72}>The clip is measured for eye contact, posture, pace and words. It is deleted after 30 days. No one else sees it.</Body>
            <Button
              label="Allow"
              surface="cobalt"
              onPress={async () => {
                const c = await requestCam();
                const m = await requestMic();
                if (c.granted && m.granted) setPhase('ready');
              }}
            />
          </Stack>
        </Gutter>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="front" mode="video" mute={false} />
      {/* cobalt veil so the camera reads as part of the system, not a selfie */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.cobalt, opacity: phase === 'recording' ? 0.18 : 0.55 }]} />

      <Screen surface="cobalt" style={{ backgroundColor: 'transparent' }}>
        <Gutter style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between', paddingTop: space.s }}>
            <Label>{phase === 'recording' ? 'Recording' : 'Read'}</Label>
            {phase !== 'recording' && (
              <Pressable onPress={() => router.back()} hitSlop={16}>
                <Label color={color.w72}>Back</Label>
              </Pressable>
            )}
          </Row>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {phase === 'countdown' && (
              <Animated.View key={count} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                <Numeral value={count === 0 ? 'Go' : count} size={160} />
              </Animated.View>
            )}
            {phase === 'recording' && (
              <View style={{ alignItems: 'center' }}>
                <Mark index={40} axes={{ voice: 50, presence: 50, command: 50, composure: 50, read: 50 }} size={220} energy={energy} animateIn={false} />
                <Numeral value={left} size={72} style={{ marginTop: space.l }} />
              </View>
            )}
          </View>

          <Stack gap={space.m} style={{ paddingBottom: space.l }}>
            <Display size="d4">{prompt.text}</Display>
            {phase === 'ready' && (
              <Button
                label="I'm ready"
                surface="cobalt"
                onPress={() => {
                  setCount(3);
                  setPhase('countdown');
                }}
              />
            )}
            {phase === 'recording' && <Button label="Finish early" variant="secondary" surface="cobalt" onPress={finish} />}
            {phase === 'countdown' && <Body color={color.w72} small>Look at the lens. Not at yourself.</Body>}
          </Stack>
        </Gutter>
      </Screen>
    </View>
  );
}
