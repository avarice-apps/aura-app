import { createAudioPlayer, setAudioModeAsync, requestRecordingPermissionsAsync, AudioPlayer } from 'expo-audio';
import type { AudioSrc } from './api';

let current: AudioPlayer | null = null;

/** Play a voice line (remote URL or bundled asset). Resolves when it finishes, or after a safety timeout. */
export async function speak(src: AudioSrc, opts: { onStart?: () => void; maxMs?: number } = {}): Promise<void> {
  if (src === undefined || src === null || src === '') return;
  stopSpeaking();
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  } catch {}
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sub?.remove();
      } catch {}
      resolve();
    };
    // keepAudioSessionActive: expo-audio otherwise deactivates the shared iOS session when a line ends,
    // which can cut the mic out from under a live call.
    const p = createAudioPlayer(typeof src === 'string' ? { uri: src } : src, { keepAudioSessionActive: true });
    current = p;
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) finish();
    });
    p.play();
    opts.onStart?.();
    setTimeout(finish, opts.maxMs ?? 30000);
  });
}

export function stopSpeaking() {
  try {
    current?.pause();
    current?.remove();
  } catch {}
  current = null;
}

/** Live calls: permission only. The call's audio engine owns the session (lib/liveAudio). */
export async function requestMic(): Promise<boolean> {
  const p = await requestRecordingPermissionsAsync();
  return p.granted;
}

export async function prepareMic(): Promise<boolean> {
  const p = await requestRecordingPermissionsAsync();
  if (!p.granted) return false;
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
  return true;
}
