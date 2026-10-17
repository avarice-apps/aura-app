import React from 'react';
import { View, Pressable, Text as RNText, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';
import { Icon } from '@/ui';

/**
 * The calm register: one big serif line (with one italic word), small capitals above it, hairline rows under it.
 * Two type sizes, one tap colour. Used where someone is deciding something (Today, Poise, You, the occasion).
 */

export function Kicker({ children, color, style }: { children: React.ReactNode; color?: string; style?: any }) {
  const t = useTheme();
  return <RNText style={[{ fontFamily: font.mono, fontSize: 11, lineHeight: 15, letterSpacing: 2.2, textTransform: 'uppercase', color: color ?? t.ink3 }, style]}>{children}</RNText>;
}

/** "Tonight, *handled*." The serif headline: `text` then an italic `em` in the theme's emphasis colour. */
export function Display({ text, em, after, size = 44, color, align }: { text?: string; em?: string; after?: string; size?: number; color?: string; align?: 'left' | 'center' }) {
  const t = useTheme();
  return (
    <RNText style={{ fontFamily: font.serif, fontSize: size, lineHeight: Math.round(size * 1.02), letterSpacing: -size * 0.02, color: color ?? t.ink, textAlign: align }}>
      {text}
      {em ? <RNText style={{ fontFamily: font.serifItalic, color: color ?? t.em }}>{em}</RNText> : null}
      {after}
    </RNText>
  );
}

export function Hair({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.line, alignSelf: 'stretch' }, style]} />;
}

const ARROW = 'M7 17L17 7M9 7h8v8';

/** A hairline row: optional round thumbnail, a title, a quiet line, an arrow. */
export function RowLink({ title, sub, thumb, onPress, right, first, dim }: { title: string; sub?: string; thumb?: any; onPress?: () => void; right?: React.ReactNode; first?: boolean; dim?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress && (() => { play('tap'); Haptics.selectionAsync(); onPress(); })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderTopWidth: first ? 0 : 1, borderColor: t.line, opacity: pressed ? 0.6 : 1 })}
    >
      {thumb ? <Image source={thumb} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.card }} contentFit="cover" /> : null}
      <View style={{ flex: 1, gap: 3 }}>
        <RNText style={{ fontFamily: font.medium, fontSize: 16, lineHeight: 21, color: dim ? t.ink3 : t.ink }} numberOfLines={2}>{title}</RNText>
        {sub ? <RNText style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: t.ink2 }} numberOfLines={2}>{sub}</RNText> : null}
      </View>
      {right ?? (onPress ? <Icon d={ARROW} size={18} color={t.ink2} stroke={1.6} /> : null)}
    </Pressable>
  );
}

/** The one tap colour, as a pill. `quiet` is the outlined companion for a second option. */
export function Pill({ label, onPress, quiet, icon, disabled, style, small }: { label: string; onPress?: () => void; quiet?: boolean; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const t = useTheme();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      // eslint-disable-next-line react-hooks/immutability
      onPressIn={() => (s.value = withTiming(0.97, { duration: 80 }))}
      // eslint-disable-next-line react-hooks/immutability
      onPressOut={() => (s.value = withSpring(1, { damping: 14, stiffness: 260 }))}
      onPress={() => { play('tap'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Animated.View style={[{ height: small ? 40 : 50, paddingHorizontal: small ? 16 : 22, borderRadius: 999, backgroundColor: quiet ? 'transparent' : t.accent, borderWidth: quiet ? 1 : 0, borderColor: t.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, a]}>
        {icon ? <Icon d={icon} size={small ? 14 : 16} color={quiet ? t.ink : t.onAccent} stroke={1.8} /> : null}
        <RNText style={{ fontFamily: font.medium, fontSize: small ? 14 : 15, color: quiet ? t.ink : t.onAccent }}>{label}</RNText>
      </Animated.View>
    </Pressable>
  );
}

/** A selectable chip (presets, starters). */
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => { play('tap'); Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => ({ paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : 'transparent', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 14, color: on ? t.ink : t.ink }}>{label}</RNText>
    </Pressable>
  );
}

export const ARROW_ICON = ARROW;
export const WAVE_ICON = 'M3 12h1M6 9v6M9 6v12M12 9v6M15 4v16M18 8v8M21 12h0';
