import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';

const SOURCES = {
  tap: require('../../assets/sounds/tap.wav'),
  select: require('../../assets/sounds/select.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  cleared: require('../../assets/sounds/cleared.wav'),
  cut: require('../../assets/sounds/cut.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let enabled = true;
let ready = false;

/** Preload every UI sound once. Respects the silent switch (UI sounds should not override it). */
export async function initSounds() {
  if (ready) return;
  ready = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: false });
  } catch {}
  (Object.keys(SOURCES) as SoundName[]).forEach((k) => {
    try {
      const p = createAudioPlayer(SOURCES[k], { keepAudioSessionActive: true }); // never deactivate the session under a live call
      p.volume = k === 'cut' ? 0.6 : 0.22;
      players[k] = p;
    } catch {}
  });
}

export function setSoundsEnabled(on: boolean) {
  enabled = on;
}

// Navigation and taps are felt, not heard: a light haptic only. Sound is kept for results.
const SILENT: SoundName[] = ['tap', 'select', 'tick'];

export function play(name: SoundName) {
  if (SILENT.includes(name)) {
    try {
      Haptics.selectionAsync();
    } catch {}
    return;
  }
  if (!enabled) return;
  const p = players[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}
