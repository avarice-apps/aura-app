// Aura design tokens. One colour, many opacities. See docs/DESIGN_DIRECTION.md.

export const color = {
  cobalt: '#1414F0',
  cobaltDeep: '#0B0BB8',
  lilac: '#DADCFF',
  white: '#FFFFFF',
  ink: '#06071A',
  inkRaised: '#10122E',
  // opacities of white for hierarchy on blue and on ink
  w100: 'rgba(255,255,255,1)',
  w72: 'rgba(255,255,255,0.72)',
  w48: 'rgba(255,255,255,0.48)',
  w24: 'rgba(255,255,255,0.24)',
  w16: 'rgba(255,255,255,0.16)',
  w12: 'rgba(255,255,255,0.12)',
  w08: 'rgba(255,255,255,0.08)',
  // cobalt on lilac (button text) and hairline on lilac
  cobaltOnLilac: '#1414F0',
} as const;

export const font = {
  display: 'Antonio_300Light',
  displayThin: 'Antonio_200ExtraLight',
  displayMed: 'Antonio_500Medium',
  mono: 'JetBrainsMono_500Medium',
  monoRegular: 'JetBrainsMono_400Regular',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
} as const;

export const size = {
  // display scale, tight leading
  d1: 120,
  d2: 88,
  d3: 64,
  d4: 44,
  d5: 32,
  label: 12,
  labelSm: 11,
  body: 16,
  bodySm: 14,
} as const;

export const space = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
  gutter: 24,
} as const;

export const radius = {
  button: 3,
  card: 12,
} as const;

export const motion = {
  // slow and weighted
  slow: 900,
  base: 520,
  quick: 260,
  easing: { x1: 0.2, y1: 0.8, x2: 0.2, y2: 1 },
} as const;

export type Surface = 'cobalt' | 'ink';

export const surface = {
  cobalt: { bg: color.cobalt, fg: color.white, hairline: color.w16, raised: color.w08 },
  ink: { bg: color.ink, fg: color.white, hairline: color.w12, raised: color.inkRaised },
} as const;
