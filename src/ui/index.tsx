import React from 'react';
import { Pressable, StyleSheet, Text as RNText, TextProps, View, ViewProps, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSpring } from 'react-native-reanimated';
import Svg, { Path, Line, Circle, Ellipse } from 'react-native-svg';
import { font, radius, space, useTheme, STATUES, PRINTS } from '@/theme';
import { play } from '@/lib/sound';

// ------------------------------------------------------------ layout

export function Screen({ children, style, edges = ['top'], bg }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; edges?: ('top' | 'bottom')[]; bg?: string }) {
  const t = useTheme();
  return <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bg ?? t.bg }, style]}>{children}</SafeAreaView>;
}

export function Row({ children, gap = space.m, style, ...p }: ViewProps & { gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} {...p}>{children}</View>;
}
export function Stack({ children, gap = space.m, style, ...p }: ViewProps & { gap?: number }) {
  return <View style={[{ gap }, style]} {...p}>{children}</View>;
}
export function Gutter({ children, style, ...p }: ViewProps) {
  return <View style={[{ paddingHorizontal: space.gutter }, style]} {...p}>{children}</View>;
}

// ------------------------------------------------------------ type

type TP = TextProps & { color?: string; align?: TextStyle['textAlign'] };

/** Geist medium, tight tracking, generous line height so nothing clips on iOS. */
export function Title({ style, color, align, size = 28, ...p }: TP & { size?: number }) {
  const t = useTheme();
  return <RNText {...p} style={[{ fontFamily: font.medium, fontSize: size, lineHeight: Math.round(size * 1.16), letterSpacing: -size * 0.025, color: color ?? t.ink, textAlign: align }, style]} />;
}
export function Serif({ style, color, align, italic, ...p }: TP & { size?: number; italic?: boolean }) {
  const t = useTheme();
  const s = p.size ?? 28;
  return <RNText {...p} style={[{ fontFamily: italic ? font.serifItalic : font.serif, fontSize: s, lineHeight: s * 1.1, color: color ?? t.ink, textAlign: align }, style]} />;
}
export function Num({ style, color, value, size = 72, weight = 'light' }: { style?: StyleProp<TextStyle>; color?: string; value: string | number; size?: number; weight?: 'light' | 'regular' }) {
  const t = useTheme();
  return <RNText style={[{ fontFamily: weight === 'light' ? font.light : font.regular, fontSize: size, lineHeight: Math.round(size * 1.12), letterSpacing: -size * 0.045, color: color ?? t.ink, fontVariant: ['tabular-nums'] }, style]}>{value}</RNText>;
}
export function Body({ style, color, align, small, strong, ...p }: TP & { small?: boolean; strong?: boolean }) {
  const t = useTheme();
  const s = small ? 13 : 15;
  return <RNText {...p} style={[{ fontFamily: strong ? font.medium : font.regular, fontSize: s, lineHeight: s * 1.42, color: color ?? t.ink, textAlign: align }, style]} />;
}
export function Muted(p: TP & { small?: boolean }) {
  const t = useTheme();
  return <Body {...p} color={p.color ?? t.ink2} />;
}
export function Label({ style, color, align, ...p }: TP) {
  const t = useTheme();
  return <RNText {...p} style={[{ fontFamily: font.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.9, textTransform: 'uppercase', color: color ?? t.ink3, textAlign: align }, style]} />;
}

// ------------------------------------------------------------ surfaces

export function Card({ children, style, inverse, ...p }: ViewProps & { inverse?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: inverse ? t.inverse : t.card, borderRadius: radius.card, borderWidth: inverse ? 0 : StyleSheet.hairlineWidth * 2, borderColor: t.line, padding: space.l }, style]} {...p}>
      {children}
    </View>
  );
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.cardAlt, alignSelf: 'stretch' }, style]} />;
}

export function Pill({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: 'accent' | 'muted' }) {
  const t = useTheme();
  const bg = active ? t.accent : tone === 'accent' ? t.accentSoft : t.card;
  const fg = active ? t.onAccent : tone === 'accent' ? t.accent : t.ink2;
  return (
    <Pressable onPress={onPress && (() => { play('tap'); Haptics.selectionAsync(); onPress(); })} disabled={!onPress} style={{ backgroundColor: bg, borderWidth: active || tone ? 0 : 1, borderColor: t.line, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill }}>
      <RNText style={{ fontFamily: active ? font.medium : font.regular, fontSize: 12, color: fg }}>{label}</RNText>
    </Pressable>
  );
}

export function Tag({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'inverse' }) {
  const t = useTheme();
  const bg = tone === 'accent' ? t.accentSoft : tone === 'inverse' ? t.inverse : t.cardAlt;
  const fg = tone === 'accent' ? t.accent : tone === 'inverse' ? t.onInverse : t.ink2;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 0.6, color: fg, textTransform: 'uppercase' }}>{label}</RNText>
    </View>
  );
}

// ------------------------------------------------------------ structure

/** Section header: a plain title with an optional quiet right-hand note or action. */
export function Section({ title, note, onNote, style }: { title: string; note?: string; onNote?: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }, style]}>
      <RNText style={{ fontFamily: font.medium, fontSize: 17, letterSpacing: -0.3, color: t.ink }}>{title}</RNText>
      {note ? (
        <Pressable disabled={!onNote} onPress={onNote} hitSlop={8}>
          <RNText style={{ fontFamily: onNote ? font.medium : font.mono, fontSize: onNote ? 14 : 11, letterSpacing: onNote ? 0 : 0.6, color: onNote ? t.accent : t.ink3, textTransform: onNote ? 'none' : 'uppercase' }}>{note}</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Segmented tabs inside a screen. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (k: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: t.line }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => { play('tap'); Haptics.selectionAsync(); onChange(o.key); }} style={{ flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.bg : 'transparent', shadowColor: '#000', shadowOpacity: on ? 0.06 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
            <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 14, color: on ? t.ink : t.ink2 }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------ buttons

export function Button({ label, onPress, variant = 'primary', disabled, style, icon, sound = 'tap' }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'light'; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: React.ReactNode; sound?: 'tap' | 'select' | null }) {
  const t = useTheme();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const bg = variant === 'primary' || variant === 'accent' ? t.accent : variant === 'light' ? t.onInverse : variant === 'secondary' ? t.card : 'transparent';
  const fg = variant === 'primary' || variant === 'accent' ? t.onAccent : variant === 'light' ? t.accent : variant === 'ghost' ? t.accent : t.ink;
  return (
    <Pressable
      disabled={disabled}
      // eslint-disable-next-line react-hooks/immutability
      onPressIn={() => (s.value = withTiming(0.97, { duration: 80 }))}
      // eslint-disable-next-line react-hooks/immutability
      onPressOut={() => (s.value = withSpring(1, { damping: 14, stiffness: 260 }))}
      onPress={() => {
        if (sound) play(sound);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Animated.View style={[{ height: 54, borderRadius: radius.button, backgroundColor: bg, borderWidth: variant === 'secondary' ? 1 : 0, borderColor: t.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 20 }, a]}>
        {icon}
        <RNText style={{ fontFamily: font.medium, fontSize: 16, color: fg }}>{label}</RNText>
      </Animated.View>
    </Pressable>
  );
}

export function IconButton({ onPress, label, children, size = 40 }: { onPress?: () => void; label: string; children: React.ReactNode; size?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityLabel={label} hitSlop={8} onPress={() => { play('tap'); onPress?.(); }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  );
}

/** A tappable list row (title, sub, right accessory). */
export function ListRow({ title, sub, left, right, onPress, first, strike }: { title: string; sub?: string; left?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; first?: boolean; strike?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress && (() => { play('tap'); Haptics.selectionAsync(); onPress(); })} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderColor: t.cardAlt }}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 15, color: strike ? t.ink3 : t.ink, textDecorationLine: strike ? 'line-through' : 'none' }}>{title}</RNText>
        {sub ? <RNText style={{ fontFamily: font.regular, fontSize: 12, color: t.ink2 }}>{sub}</RNText> : null}
      </View>
      {right ?? (onPress ? <Chevron /> : null)}
    </Pressable>
  );
}

// ------------------------------------------------------------ progress

export function Segments({ total, done }: { total: number; done: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < done ? t.accent : t.cardAlt }} />
      ))}
    </View>
  );
}

export function Bar({ value, max = 100, accent }: { value: number; max?: number; accent?: boolean }) {
  const t = useTheme();
  const w = useSharedValue(0);
  React.useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value / max)), { duration: 900 });
  }, [value, max, w]);
  const a = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: t.cardAlt, overflow: 'hidden', flex: 1 }}>
      <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: accent === false ? t.ink : t.accent }, a]} />
    </View>
  );
}

// ------------------------------------------------------------ imagery and icons

/** A square cobalt print (Hermes-style), optionally with a mono caption like "#1 READ". */
const PRINT_TO_STATUE: Record<keyof typeof PRINTS, keyof typeof STATUES> = { athlete: 'athlete', bust: 'bust', antinoos: 'antinoos', head: 'head', bustDark: 'bustDark', faceAthlete: 'athlete', faceAntinoos: 'antinoos', faceHead: 'head' };

/** Hermes-style halo: fine blue rays and an orbit, drawn behind a statue. Deterministic, so it never flickers. */
export function Halo({ size, opacity = 0.5, style }: { size: number; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = size / 2;
  const rays = React.useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; w: number; o: number }[] = [];
    const rnd = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2 + rnd(i) * 0.05;
      const r0 = size * (0.16 + rnd(i + 100) * 0.08);
      const r1 = size * (0.34 + rnd(i + 200) * 0.16);
      out.push({ x1: c + r0 * Math.cos(a), y1: c + r0 * Math.sin(a), x2: c + r1 * Math.cos(a), y2: c + r1 * Math.sin(a), w: rnd(i + 300) > 0.8 ? 1.4 : 0.8, o: 0.35 + rnd(i + 400) * 0.6 });
    }
    return out;
  }, [size, c]);
  return (
    <View pointerEvents="none" style={[{ width: size, height: size, opacity }, style]}>
      <Svg width={size} height={size}>
        {rays.map((r, i) => <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={t.accent} strokeWidth={r.w} strokeOpacity={r.o} />)}
        <Circle cx={c} cy={c} r={size * 0.3} stroke={t.accent} strokeWidth={1} fill="none" strokeOpacity={0.6} />
        <Ellipse cx={c} cy={c} rx={size * 0.46} ry={size * 0.16} stroke={t.accent} strokeWidth={1} fill="none" strokeOpacity={0.45} transform={`rotate(-16 ${c} ${c})`} />
        <Circle cx={c + size * 0.3} cy={c} r={3} fill={t.accent} />
      </Svg>
    </View>
  );
}

/** Statue visual. Marble cut-out, contained, on whatever surface it sits on. */
export function Print({ name, size, caption, style }: { name: keyof typeof PRINTS; size?: number; caption?: string; style?: StyleProp<any>; radius?: number }) {
  const t = useTheme();
  return (
    <View style={style}>
      <Image source={STATUES[PRINT_TO_STATUE[name]]} style={size ? { width: size, height: size } : { width: '100%', aspectRatio: 1 }} contentFit="contain" transition={300} />
      {caption ? <RNText style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6, color: t.ink, marginTop: 8, textTransform: 'uppercase' }}>{caption}</RNText> : null}
    </View>
  );
}

export function Statue({ name, height, style }: { name: keyof typeof STATUES; height: number; style?: StyleProp<any> }) {
  return <Image source={STATUES[name]} style={[{ height, aspectRatio: STATUE_RATIO[name] ?? 0.75 }, style]} contentFit="contain" transition={300} />;
}
const STATUE_RATIO: Record<string, number> = { athlete: 0.71, bust: 0.73, bustDark: 0.83, antinoos: 0.67, head: 0.73, engrBust: 0.73, engrAthlete: 0.71, engrAntinoos: 0.67 };

export function Chevron({ color }: { color?: string }) {
  const t = useTheme();
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color ?? t.ink3} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function Icon({ d, size = 18, color, stroke = 1.8, fill }: { d: string; size?: number; color?: string; stroke?: number; fill?: string }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ?? 'none'}>
      <Path d={d} stroke={fill ? 'none' : color ?? t.ink} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill={fill} />
    </Svg>
  );
}

export const ICON = {
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  play: 'M7 4l13 8-13 8z',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  stop: 'M7 7h10v10H7z',
  check: 'M5 12l5 5 9-10',
  home: 'M4 11l8-7 8 7v9H4z',
  path: 'M5 19V9M12 19V5M19 19v-7',
  scan: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M9 12h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
  flip: 'M4 7h3l2-2h6l2 2h3v12H4zM9 13a3 3 0 0 0 5.2 2M15 11a3 3 0 0 0-5.2-2',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  chat: 'M4 5h16v11H8l-4 4z',
  share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
} as const;
