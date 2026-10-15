import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import Animated, { FadeIn, useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Title, Body, Button, IconButton, Icon, ICON, Num } from '@/ui';
import { font, useTheme } from '@/theme';

type Phase = 'ready' | 'countdown' | 'recording';

/** Front-camera take with a card on top (the topic and your side), 3-2-1, then a hard stop at `seconds`. */
export function TakeRecorder({ seconds, kicker, title, sub, onDone, onClose }: { seconds: number; kicker: string; title: string; sub?: string; onDone: (uri: string) => void; onClose: () => void }) {
  const t = useTheme();
  const cam = useRef<CameraView>(null);
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(seconds);
  const ring = useSharedValue(1);
  const ringStyle = useAnimatedStyle(() => ({ width: `${ring.value * 100}%` }));

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) askCam();
    if (micPerm && !micPerm.granted && micPerm.canAskAgain) askMic();
  }, [camPerm, micPerm, askCam, askMic]);

  async function begin() {
    setPhase('countdown');
    for (let c = 3; c >= 1; c--) {
      setCount(c);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise((r) => setTimeout(r, 800));
    }
    setPhase('recording');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ring.set(1);
    ring.set(withTiming(0, { duration: seconds * 1000 }));
    setLeft(seconds);
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    try {
      const v = await cam.current?.recordAsync({ maxDuration: seconds });
      clearInterval(tick);
      if (v?.uri) onDone(v.uri);
      else setPhase('ready');
    } catch {
      clearInterval(tick);
      setPhase('ready');
    }
  }

  if (!camPerm?.granted || !micPerm?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Title size={28}>This needs the camera and the mic.</Title>
        <Body color={t.ink2}>Only while you record. The video is deleted as soon as it’s read.</Body>
        <Button label="Allow" onPress={() => { askCam(); askMic(); }} />
        <Button label="Not now" variant="ghost" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="front" mode="video" videoQuality="720p" />
      <View style={{ position: 'absolute', top: 54, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton label="Close" onPress={() => { if (phase === 'recording') cam.current?.stopRecording(); onClose(); }}><Icon d={ICON.close} size={16} color="#fff" /></IconButton>
      </View>
      <View style={{ position: 'absolute', top: 110, left: 20, right: 20, backgroundColor: t.accent, borderRadius: 18, padding: 16, gap: 6 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' }}>{kicker.toUpperCase()}</RNText>
        <RNText style={{ fontFamily: font.medium, fontSize: 22, lineHeight: 27, color: '#FFF' }}>{title}</RNText>
        {sub ? <RNText style={{ fontFamily: font.regular, fontSize: 14, color: 'rgba(255,255,255,0.86)' }}>{sub}</RNText> : null}
      </View>
      {phase === 'countdown' && (
        <Animated.View key={count} entering={FadeIn.duration(150)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Num value={count} size={160} color="#fff" />
        </Animated.View>
      )}
      <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20, gap: 14, alignItems: 'center' }}>
        {phase === 'recording' && (
          <View style={{ width: '100%', gap: 8 }}>
            <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
              <Animated.View style={[{ height: 3, backgroundColor: '#fff' }, ringStyle]} />
            </View>
            <RNText style={{ fontFamily: font.mono, fontSize: 11, color: '#fff', textAlign: 'center' }}>{left}s · TAP TO FINISH</RNText>
          </View>
        )}
        {phase === 'ready' ? (
          <Pressable onPress={begin} accessibilityLabel="Start" style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accent }} />
          </Pressable>
        ) : phase === 'recording' ? (
          <Pressable onPress={() => cam.current?.stopRecording()} accessibilityLabel="Stop" style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#fff' }} />
          </Pressable>
        ) : null}
        {phase === 'ready' ? <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>Look at the lens. Make your case. {seconds} seconds.</RNText> : null}
      </View>
    </View>
  );
}
