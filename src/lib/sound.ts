import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';

const SOURCES = {
  tap: require('../../assets/sounds/tap.wav'),
  select: require('../../assets/sounds/select.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  cleared: require('../../assets/sounds/cleared.wav'),
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
      const p = createAudioPlayer(SOURCES[k]);
      p.volume = k === 'tap' || k === 'tick' ? 0.5 : 0.8;
      players[k] = p;
    } catch {}
  });
}

export function setSoundsEnabled(on: boolean) {
  enabled = on;
}

export function play(name: SoundName) {
  if (!enabled) return;
  const p = players[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}
