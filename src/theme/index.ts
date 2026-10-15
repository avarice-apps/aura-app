// Aura themes. Light (white + Hermes blue, default) and Nocturne (dark, optional).
// Every screen reads colours from useTheme(); nothing hard-codes a hex.
import { useColorScheme } from 'react-native';
import { useStore } from '@/state/store';

export type Theme = {
  name: 'gallery' | 'nocturne';
  dark: boolean;
  bg: string; // page (paper)
  card: string; // raised surface
  cardAlt: string; // inset / dividers
  line: string; // card borders
  lineStrong: string;
  ink: string; // primary text (deep navy)
  ink2: string;
  ink3: string; // labels
  inverse: string; // statement blocks: cobalt
  onInverse: string;
  onInverse2: string;
  accent: string; // cobalt
  accentSoft: string;
  onAccent: string;
  markInk: string; // Mark rays on bg
};

/** Aura Light: the approved onboarding look on white. Hermes blue wherever the designs used black. The default. */
export const gallery: Theme = {
  name: 'gallery',
  dark: false,
  bg: '#FFFFFF',
  card: '#F6F6F8',
  cardAlt: '#EDEDF1',
  line: '#E6E6EC',
  lineStrong: '#D2D2DB',
  ink: '#121218',
  ink2: '#5E5E69',
  ink3: '#8E8E99',
  inverse: '#1414E6',
  onInverse: '#FFFFFF',
  onInverse2: '#C8CAFF',
  accent: '#1414E6',
  accentSoft: '#EDEEFF',
  onAccent: '#FFFFFF',
  markInk: '#1414E6',
};

/** Night print: deep cobalt-black, for late use. */
export const nocturne: Theme = {
  name: 'nocturne',
  dark: true,
  bg: '#070820',
  card: '#10122E',
  cardAlt: '#191C40',
  line: '#22264F',
  lineStrong: '#343872',
  ink: '#ECEBFF',
  ink2: '#B4B6E0',
  ink3: '#8C8FC4',
  inverse: '#1515E0',
  onInverse: '#F1F1EC',
  onInverse2: '#BFC1FF',
  accent: '#8F94FF',
  accentSoft: '#1C1F55',
  onAccent: '#070820',
  markInk: '#8F94FF',
};

export const font = {
  display: 'Antonio_300Light',
  displayThin: 'Antonio_200ExtraLight',
  light: 'Geist_300Light',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, gutter: 20 } as const;
export const radius = { card: 22, cardSm: 16, pill: 999, button: 28 } as const;

export function useTheme(): Theme {
  const pref = useStore((s) => s.theme);
  const sys = useColorScheme();
  if (pref === 'nocturne') return nocturne;
  if (pref === 'system') return sys === 'dark' ? nocturne : gallery;
  return gallery;
}

export const STATUES = {
  // floating cut-outs (on paper)
  athlete: require('../../assets/img/marble_248579.webp'),
  bust: require('../../assets/img/marble_249049.webp'),
  bustDark: require('../../assets/img/marble_250675.webp'),
  antinoos: require('../../assets/img/marble_256530.webp'),
  head: require('../../assets/img/marble_255422.webp'),
  // engravings (cobalt line on paper)
  engrBust: require('../../assets/img/engr_249049.webp'),
  engrAthlete: require('../../assets/img/engr_248579.webp'),
  engrAntinoos: require('../../assets/img/engr_256530.webp'),
} as const;

/** Square cobalt prints (dither / scanline), Hermes-style. */
export const PRINTS = {
  athlete: require('../../assets/img/print_athlete.webp'),
  bust: require('../../assets/img/print_bust.webp'),
  antinoos: require('../../assets/img/print_antinoos.webp'),
  head: require('../../assets/img/print_head.webp'),
  bustDark: require('../../assets/img/print_bustDark.webp'),
  faceAthlete: require('../../assets/img/print_face_athlete.webp'),
  faceAntinoos: require('../../assets/img/print_face_antinoos.webp'),
  faceHead: require('../../assets/img/print_face_head.webp'),
} as const;
