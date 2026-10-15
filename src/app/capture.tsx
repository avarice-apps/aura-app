import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Linking, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Title, Body, Button, IconButton, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { ScanHud } from '@/components/ScanHud';
import { spend, refund } from '@/lib/plan';

const MAX_S = 60;
const MIN_S = 3;

/**
 * Aura Check: pull the phone out mid-moment, film whatever is happening, get it rated beat by beat with a video
 * to post. No prompt, no game. Back camera by default; tap to start, tap to stop.
 */
export default function Capture() {
  const t = useTheme();
  const cam = useRef<CameraView>(null);
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const params = useLocalSearchParams<{ mode?: string }>();
  // Two things the camera does: film a moment (video, rated beat by beat) or snap a fit (photo, rated as an outfit).
  const [kind, setKind] = useState<'moment' | 'fit'>(params.mode === 'fit' ? 'fit' : 'moment');
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('');
  const started = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) askCam();
    if (kind === 'moment' && micPerm && !micPerm.granted && micPerm.canAskAgain) askMic();
  }, [camPerm, micPerm, askCam, askMic, kind]);

  useEffect(() => {
    if (!rec) return;
    const id = setInterval(() => setSecs(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [rec]);

  // Leaving mid-recording never uploads anything.
  useEffect(
    () => () => {
      cancelled.current = true;
      try {
        cam.current?.stopRecording();
      } catch {}
    },
    [],
  );

  async function start() {
    if (!ready || rec) return;
    if (!spend('clips')) {
      router.push({ pathname: '/paywall', params: { reason: 'clips' } });
      return;
    }
    cancelled.current = false;
    setNote('');
    setSecs(0);
    started.current = Date.now();
    setRec(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const v = await cam.current?.recordAsync({ maxDuration: MAX_S });
      setRec(false);
      if (cancelled.current) {
        refund('clips'); // closed mid-recording: nothing was read, so it doesn't count
        return;
      }
      const took = (Date.now() - started.current) / 1000;
      if (!v?.uri || took < MIN_S) {
        setNote(`Film at least ${MIN_S} seconds of it.`);
        refund('clips');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Rated on the clip screen, which already paid for this one.
      router.replace({ pathname: '/clip', params: { uri: v.uri, live: '1' } });
    } catch {
      setRec(false);
      setNote('The camera stopped. Try again.');
      refund('clips');
    }
  }

  async function snap() {
    if (!ready) return;
    if (!spend('fits')) {
      router.push({ pathname: '/paywall', params: { reason: 'fits' } });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const pic = await cam.current?.takePictureAsync({ quality: 0.85, shutterSound: false });
      if (!pic?.uri) throw new Error('no photo');
      router.replace({ pathname: '/fit', params: { uri: pic.uri, paid: '1' } });
    } catch {
      refund('fits');
      setNote('The camera didn’t take that. Try again.');
    }
  }

  function stop() {
    if (!rec) return;
    if ((Date.now() - started.current) / 1000 < MIN_S) return; // too short to read; keep rolling
    cam.current?.stopRecording();
  }

  const needMic = kind === 'moment';
  if (!camPerm?.granted || (needMic && !micPerm?.granted)) {
    const blocked = (camPerm && !camPerm.canAskAgain) || (needMic && micPerm && !micPerm.canAskAgain);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Title size={28}>{needMic ? 'Aura Check needs the camera and the mic.' : 'Fit check needs the camera.'}</Title>
        <Body color={t.ink2}>Only while you film. The clip is read, then deleted.</Body>
        <Button label={blocked ? 'Open Settings' : 'Allow'} onPress={() => (blocked ? Linking.openSettings() : (askCam(), needMic && askMic()))} />
        {needMic ? <Button label="Rate a fit instead" variant="secondary" onPress={() => setKind('fit')} /> : null}
        <Button label="Not now" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing={facing} mode={kind === 'fit' ? 'picture' : 'video'} videoQuality="720p" videoBitrate={3_000_000} onCameraReady={() => setReady(true)} />
      {rec && <ScanHud secs={secs} max={MAX_S} />}

      <View style={{ position: 'absolute', top: 54, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <IconButton label="Close" onPress={() => router.back()}><Icon d={ICON.close} size={16} color="#fff" /></IconButton>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6, color: '#fff' }}>{kind === 'fit' ? 'FIT CHECK' : 'AURA CHECK'}</RNText>
        <IconButton label="Flip camera" onPress={() => !rec && setFacing(facing === 'back' ? 'front' : 'back')}><Icon d={ICON.flip} size={16} color="#fff" /></IconButton>
      </View>

      <View style={{ position: 'absolute', bottom: 44, left: 20, right: 20, alignItems: 'center', gap: 14 }}>
        {!rec ? (
          <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', gap: 4 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 26, color: '#fff', textAlign: 'center' }}>{kind === 'fit' ? 'Head to shoes.' : 'Point it at the moment.'}</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
              {note || (kind === 'fit' ? 'The whole fit in frame, daylight if you can. Yours or a friend’s.' : `Up to ${MAX_S} seconds. Poise rates it beat by beat and makes you the video.`)}
            </RNText>
          </Animated.View>
        ) : (
          <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.2, color: '#fff' }}>{secs < MIN_S ? 'KEEP ROLLING' : `TAP TO STOP · ${MAX_S - secs}s LEFT`}</RNText>
        )}
        {!rec && (
          <View style={{ flexDirection: 'row', gap: 22 }}>
            {(['moment', 'fit'] as const).map((k) => (
              <Pressable key={k} hitSlop={10} onPress={() => { if (k !== kind) { Haptics.selectionAsync(); setReady(false); setNote(''); setKind(k); } }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 11.5, letterSpacing: 1.6, color: k === kind ? '#fff' : 'rgba(255,255,255,0.45)' }}>{k === 'fit' ? 'FIT' : 'MOMENT'}</RNText>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable
          onPress={kind === 'fit' ? snap : rec ? stop : start}
          disabled={!ready}
          accessibilityLabel={kind === 'fit' ? 'Take the photo' : rec ? 'Stop' : 'Start filming'}
          style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.5 }}
        >
          {rec ? <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#fff' }} /> : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: kind === 'fit' ? '#fff' : t.accent }} />}
        </Pressable>
        {!rec ? (
          <Pressable hitSlop={8} onPress={() => (kind === 'fit' ? router.replace({ pathname: '/fit', params: { pick: '1' } }) : router.replace('/clip'))}>
            <RNText style={{ fontFamily: font.regular, fontSize: 12, color: 'rgba(255,255,255,0.8)', textDecorationLine: 'underline' }}>{kind === 'fit' ? 'Choose a photo instead' : 'Choose a video instead'}</RNText>
          </Pressable>
        ) : null}
        {!rec && <RNText style={{ fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>{kind === 'fit' ? 'Rates the clothes, never the person. Photos aren’t kept.' : 'Rates what happens, never anyone’s looks. Only film people who are fine with it.'}</RNText>}
      </View>
    </View>
  );
}
