import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import Animated, { FadeIn, FadeInDown, useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Title, Body, Muted, Label, Button, IconButton, Icon, ICON, Num } from '@/ui';
import { font, useTheme } from '@/theme';
import { useScan } from '@/state/scanSession';
import { randomPrompt } from '@/lib/scanPrompts';
import { play } from '@/lib/sound';

const TAKE_S = 15;
type Phase = 'ready' | 'countdown' | 'recording' | 'done';

/** Back-camera scan. Prompt on screen for the person holding the phone to read out, 3-2-1, fifteen seconds, hard stop. */
export default function ScanRecord() {
  const t = useTheme();
  const scan = useScan();
  const cam = useRef<CameraView>(null);
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>(scan.mode === 'solo' ? 'front' : 'back');
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(TAKE_S);
  const ring = useSharedValue(1);
  const who = scan.players[scan.current];

  useEffect(() => {
    if (!camPerm?.granted) askCam();
    if (!micPerm?.granted) askMic();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ringStyle = useAnimatedStyle(() => ({ width: `${ring.value * 100}%` }));

  async function begin() {
    play('select');
    setPhase('countdown');
    for (let c = 3; c >= 1; c--) {
      setCount(c);
      play('tick');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise((r) => setTimeout(r, 800));
    }
    setPhase('recording');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ring.value = 1;
    ring.value = withTiming(0, { duration: TAKE_S * 1000 });
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    try {
      const v = await cam.current?.recordAsync({ maxDuration: TAKE_S });
      clearInterval(tick);
      if (v?.uri) {
        scan.set({ uploadUri: v.uri, usedPrompts: [...scan.usedPrompts, scan.prompt] });
        play('reveal');
        setPhase('done');
        router.replace('/scan/result');
      } else {
        setPhase('ready');
        setLeft(TAKE_S);
      }
    } catch {
      clearInterval(tick);
      setPhase('ready');
      setLeft(TAKE_S);
    }
  }

  function stopEarly() {
    cam.current?.stopRecording();
  }

  if (!camPerm?.granted || !micPerm?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Title size={28}>Aura Scan needs the camera and the mic.</Title>
        <Body color={t.ink2}>Only for the fifteen seconds. The clip is deleted after it’s read.</Body>
        <Button label="Allow" onPress={() => { askCam(); askMic(); }} />
        <Button label="Not now" variant="ghost" onPress={() => router.dismissAll()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing={facing} mode="video" videoQuality="720p" />

      {/* top bar */}
      <View style={{ position: 'absolute', top: 54, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <IconButton label="Close" onPress={() => router.dismissAll()}><Icon d={ICON.close} size={16} color="#fff" /></IconButton>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1, color: '#fff' }}>{who.toUpperCase()}{scan.mode === 'party' ? ` · ${scan.current + 1}/${scan.players.length}` : ''}</RNText>
        <IconButton label="Flip camera" onPress={() => phase === 'ready' && setFacing(facing === 'back' ? 'front' : 'back')}><Icon d={ICON.flip} size={16} color="#fff" /></IconButton>
      </View>

      {/* prompt card */}
      <Animated.View entering={FadeInDown.duration(500)} style={{ position: 'absolute', top: 110, left: 20, right: 20, backgroundColor: t.inverse, borderRadius: 18, padding: 16, gap: 6 }}>
        <Label color={t.onInverse2}>Your prompt</Label>
        <Title size={26} color={t.onInverse}>{scan.prompt}</Title>
        {phase === 'ready' && (
          <Pressable onPress={() => scan.set({ prompt: randomPrompt([...scan.usedPrompts, scan.prompt]) })} hitSlop={8}>
            <Muted small color={t.onInverse2}>Different one</Muted>
          </Pressable>
        )}
      </Animated.View>

      {/* countdown */}
      {phase === 'countdown' && (
        <Animated.View key={count} entering={FadeIn.duration(150)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Num value={count} size={160} color="#fff" />
        </Animated.View>
      )}

      {/* bottom */}
      <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20, gap: 14, alignItems: 'center' }}>
        {phase === 'recording' && (
          <View style={{ width: '100%', gap: 8 }}>
            <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
              <Animated.View style={[{ height: 3, backgroundColor: t.onInverse2 }, ringStyle]} />
            </View>
            <RNText style={{ fontFamily: font.mono, fontSize: 11, color: '#fff', textAlign: 'center' }}>{left}s · TAP TO STOP EARLY</RNText>
          </View>
        )}
        {phase === 'ready' && (
          <Pressable onPress={begin} accessibilityLabel="Start" style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accent }} />
          </Pressable>
        )}
        {phase === 'recording' && (
          <Pressable onPress={stopEarly} accessibilityLabel="Stop" style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#fff' }} />
          </Pressable>
        )}
        {phase === 'ready' && <Muted small color="rgba(255,255,255,0.7)" align="center">Read the prompt out loud, then answer it. Fifteen seconds.</Muted>}
      </View>
    </View>
  );
}
