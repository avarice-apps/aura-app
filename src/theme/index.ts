// Aura themes. Light (white + Hermes blue, default) and Nocturne (dark, optional).
// Every screen reads colours from useTheme(); nothing hard-codes a hex.
import React, { createContext, useContext } from 'react';
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
  em: string; // the one emphasised word in a serif headline (italic): Kleos blue by day, lavender at night
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
  inverse: '#1608F2',
  onInverse: '#FFFFFF',
  onInverse2: '#C8CAFF',
  accent: '#1608F2',
  accentSoft: '#EDEEFF',
  onAccent: '#FFFFFF',
  markInk: '#1608F2',
  em: '#1608F2',
};

/**
 * Night: the maître d' palette from the site. Ink-black with a violet cast, ivory type, lavender for the quiet
 * words, electric blue only where you tap. Calls always use it.
 */
export const nocturne: Theme = {
  name: 'nocturne',
  dark: true,
  bg: '#0D0C19',
  card: '#16152A',
  cardAlt: '#1F1E37',
  line: '#29284A',
  lineStrong: '#3A3966',
  ink: '#F1EBDD',
  ink2: '#B9B5DA',
  ink3: '#8C88D8',
  inverse: '#1608F2',
  onInverse: '#F1EBDD',
  onInverse2: '#C9C4F0',
  accent: '#6A5CFF',
  accentSoft: '#1C1A4D',
  onAccent: '#FFFFFF',
  markInk: '#8C88D8',
  em: '#C9C4F0',
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

/** A screen can force a theme for itself and everything inside it (calls are always at night). */
const Forced = createContext<Theme | null>(null);
export function ForceTheme({ name, children }: { name: 'gallery' | 'nocturne'; children: React.ReactNode }) {
  return React.createElement(Forced.Provider, { value: name === 'nocturne' ? nocturne : gallery }, children);
}

export function useTheme(): Theme {
  const forced = useContext(Forced);
  const pref = useStore((s) => s.theme);
  const sys = useColorScheme();
  if (forced) return forced;
  if (pref === 'nocturne') return nocturne;
  if (pref === 'system') return sys === 'dark' ? nocturne : gallery;
  return gallery;
}

export const STATUES = {
  // floating cut-outs (on paper)
  athlete: require('../../assets/img/grain_248579.webp'),
  bust: require('../../assets/img/grain_249049.webp'),
  bustDark: require('../../assets/img/grain_250675.webp'),
  antinoos: require('../../assets/img/grain_256530.webp'),
  head: require('../../assets/img/grain_255422.webp'),
  // engravings (cobalt line on paper)
  engrBust: require('../../assets/img/engr_249049.webp'),
  engrAthlete: require('../../assets/img/engr_248579.webp'),
  engrAntinoos: require('../../assets/img/engr_256530.webp'),
} as const;

/** Full-bleed art: public-domain sculpture and portraits (Cleveland Museum of Art, CC0) in the Kleos print treatment. */
export const ART = {
  youth: require('../../assets/art/a_youth.webp'),
  aurelius: require('../../assets/art/a_aurelius.webp'),
  aphrodite: require('../../assets/art/a_aphrodite.webp'),
  vespasian: require('../../assets/art/a_vespasian.webp'),
  trajan: require('../../assets/art/a_trajan.webp'),
  man: require('../../assets/art/a_man.webp'),
  apollo: require('../../assets/art/a_apollo.webp'),
  athlete: require('../../assets/art/a_athlete.webp'),
  lisa: require('../../assets/art/o_lisa.webp'),
  pitt: require('../../assets/art/o_pitt.webp'),
  couple: require('../../assets/art/o_couple.webp'),
  tennis: require('../../assets/art/o_tennis.webp'),
  seaside: require('../../assets/art/o_seaside.webp'),
  lovers: require('../../assets/art/o_lovers.webp'),
  dora: require('../../assets/art/o_dora.webp'),
  violin: require('../../assets/art/o_violin.webp'),
} as const;
export type ArtName = keyof typeof ART;

/** Heritage prints for the style section: public-domain works (CC0 museum collections, US government photographs) in Kleos blue on ivory (scripts/heritage.py). */
export const HERITAGE = {
  sailing: { src: require('../../assets/heritage/sailing.webp'), credit: 'White House photograph, 1962' },
  gentleman: { src: require('../../assets/heritage/gentleman.webp'), credit: 'Caillebotte, Portrait of a Man, 1880' },
  rider: { src: require('../../assets/heritage/rider.webp'), credit: 'Nadar, Man on a Horse, 1860s' },
  deauville: { src: require('../../assets/heritage/deauville.webp'), credit: 'Boudin, The Beach at Deauville, 1864' },
  rowers: { src: require('../../assets/heritage/rowers.webp'), credit: 'Eakins, The Biglin Brothers, 1873' },
  pockets: { src: require('../../assets/heritage/pockets.webp'), credit: 'Caillebotte, Man with Hands in His Pockets, 1893' },
  jockeys: { src: require('../../assets/heritage/jockeys.webp'), credit: 'Degas, Before the Race, 1887' },
  polo: { src: require('../../assets/heritage/polo.webp'), credit: 'Bellows, Polo Sketch, 1921' },
  trouville: { src: require('../../assets/heritage/trouville.webp'), credit: 'Caillebotte, Villas at Trouville, 1884' },
} as const;
export type HeritageName = keyof typeof HERITAGE;
/** The style section's palette: printed catalogue, the same in light and dark mode. */
export const IVORY = '#F1EBDD';
export const NAVY = '#0C0678'; // the deep end of Kleos blue, for type on ivory

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
