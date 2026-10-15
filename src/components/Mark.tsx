import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Path, Skia, Group, Circle } from '@shopify/react-native-skia';
import { useSharedValue, withTiming, Easing, useDerivedValue, SharedValue } from 'react-native-reanimated';
const C = { white: '#FFFFFF' };
const motion = { slow: 900 };

export type Axes = { voice: number; presence: number; command: number; composure: number; read: number };

type Props = {
  index: number; // 0..100
  axes: Axes;
  size?: number;
  color?: string;
  /** live voice energy 0..1, drives ray breathing during a Read */
  energy?: SharedValue<number>;
  /** draw-in animation on mount */
  animateIn?: boolean;
  /** previous state to morph from (Re-read reveal) */
  from?: { index: number; axes: Axes };
  opacity?: number;
};

const AXIS_ORDER: (keyof Axes)[] = ['presence', 'voice', 'command', 'composure', 'read'];

// deterministic jitter so a user's Mark is stable between renders
function jitter(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function rayCount(index: number) {
  return Math.round(28 + (index / 100) * 116); // 28 → 144
}

/**
 * The Mark. A radial burst of rays.
 * - ray count ↔ Index
 * - per-sector ray length ↔ the axis that owns that sector
 * - evenness of the burst ↔ consistency across axes
 * - energy breathes the whole burst during a Read
 */
export function Mark({ index, axes, size = 280, color = C.white, energy, animateIn = true, from, opacity = 1 }: Props) {
  const progress = useSharedValue(animateIn ? 0 : 1);
  const morph = useSharedValue(from ? 0 : 1);

  useEffect(() => {
    if (animateIn) progress.value = withTiming(1, { duration: motion.slow * 1.6, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
    if (from) morph.value = withTiming(1, { duration: motion.slow * 2, easing: Easing.bezier(0.3, 0.7, 0.2, 1) });
  }, [animateIn, from, progress, morph]);

  const cx = size / 2;
  const cy = size / 2;
  const rInner = size * 0.16;
  const rMax = size * 0.48;

  // precompute the target geometry on the JS thread; it's cheap
  const geom = useMemo(() => build(index, axes, rInner, rMax), [index, axes, rInner, rMax]);
  const geomFrom = useMemo(() => (from ? build(from.index, from.axes, rInner, rMax) : null), [from, rInner, rMax]);

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const e = energy ? energy.value : 0;
    const t = progress.value;
    const m = morph.value;
    const n = geom.length;
    for (let i = 0; i < n; i++) {
      const g = geom[i];
      let len = g.len;
      let ang = g.ang;
      if (geomFrom) {
        const f = geomFrom[Math.floor((i / n) * geomFrom.length)];
        len = f.len + (g.len - f.len) * m;
        ang = f.ang + (g.ang - f.ang) * m;
      }
      // breathe: energy lengthens rays, with a slight per-ray phase so it ripples
      const breathe = 1 + e * (0.18 + 0.12 * Math.sin(i * 0.7));
      const L = len * breathe * t;
      const x0 = cx + Math.cos(ang) * rInner;
      const y0 = cy + Math.sin(ang) * rInner;
      const x1 = cx + Math.cos(ang) * (rInner + L);
      const y1 = cy + Math.sin(ang) * (rInner + L);
      p.moveTo(x0, y0);
      p.lineTo(x1, y1);
    }
    return p;
  }, [geom, geomFrom, energy, progress, morph]);

  return (
    <View style={{ width: size, height: size, opacity }}>
      <Canvas style={{ width: size, height: size }}>
        <Group>
          <Path path={path} color={color} style="stroke" strokeWidth={1} strokeCap="round" />
          <Circle cx={cx} cy={cy} r={rInner * 0.08} color={color} />
        </Group>
      </Canvas>
    </View>
  );
}

function build(index: number, axes: Axes, rInner: number, rMax: number) {
  const n = rayCount(index);
  const out: { ang: number; len: number }[] = [];
  const span = rMax - rInner;
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    const base = frac * Math.PI * 2 - Math.PI / 2;
    // which axis sector are we in, and blend with the neighbour for smoothness
    const sectorF = frac * AXIS_ORDER.length;
    const s0 = Math.floor(sectorF) % AXIS_ORDER.length;
    const s1 = (s0 + 1) % AXIS_ORDER.length;
    const w = sectorF - Math.floor(sectorF);
    const a0 = axes[AXIS_ORDER[s0]] / 100;
    const a1 = axes[AXIS_ORDER[s1]] / 100;
    const axisStrength = a0 * (1 - w) + a1 * w;
    // low index → short, uneven, sparse. high index → long, even, dense.
    const unevenness = (1 - index / 100) * 0.55;
    const j = jitter(i);
    const len = span * (0.25 + 0.75 * axisStrength) * (1 - unevenness * j);
    const ang = base + (j - 0.5) * unevenness * 0.08;
    out.push({ ang, len });
  }
  return out;
}

/** The Mark at rest for a given tier, used in lists and share cards */
export function MarkStatic(props: Omit<Props, 'animateIn' | 'energy'>) {
  return <Mark {...props} animateIn={false} />;
}
