import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  TextProps as RNTextProps,
  View,
  ViewProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, size, space, radius, surface, Surface, motion } from '@/theme/tokens';
import { play } from '@/lib/sound';

// ---------- Screen ----------

export function Screen({
  surface: s = 'ink',
  children,
  style,
  edges = ['top', 'bottom'],
  ...rest
}: ViewProps & { surface?: Surface; edges?: ('top' | 'bottom')[] }) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: surface[s].bg }, style]} {...rest}>
      {children}
    </SafeAreaView>
  );
}

// ---------- Type ----------

type TProps = RNTextProps & { color?: string; align?: 'left' | 'center' | 'right' };

export function Display({ style, color: c = color.white, align, ...p }: TProps & { size?: keyof typeof size }) {
  const fs = p.size ? size[p.size] : size.d3;
  return (
    <RNText
      {...p}
      style={[
        { fontFamily: font.display, fontSize: fs, lineHeight: fs * 0.92, color: c, textAlign: align, letterSpacing: -fs * 0.005 },
        style,
      ]}
    />
  );
}

export function Numeral({ style, color: c = color.white, value, size: fs = size.d1 }: { style?: any; color?: string; value: string | number; size?: number }) {
  return (
    <RNText style={[{ fontFamily: font.displayThin, fontSize: fs, lineHeight: fs * 0.9, color: c, letterSpacing: -fs * 0.02, fontVariant: ['tabular-nums'] }, style]}>
      {value}
    </RNText>
  );
}

export function Label({ style, color: c = color.w72, align, ...p }: TProps & { small?: boolean }) {
  return (
    <RNText
      {...p}
      style={[
        {
          fontFamily: font.mono,
          fontSize: p.small ? size.labelSm : size.label,
          lineHeight: (p.small ? size.labelSm : size.label) * 1.4,
          color: c,
          textAlign: align,
          letterSpacing: (p.small ? size.labelSm : size.label) * 0.08,
          textTransform: 'uppercase',
        },
        style,
      ]}
    />
  );
}

export function Body({ style, color: c = color.w72, align, ...p }: TProps & { small?: boolean; strong?: boolean }) {
  const fs = p.small ? size.bodySm : size.body;
  return (
    <RNText
      {...p}
      style={[{ fontFamily: p.strong ? font.bodyMed : font.body, fontSize: fs, lineHeight: fs * 1.5, color: c, textAlign: align }, style]}
    />
  );
}

// ---------- Hairline ----------

export function Hairline({ surface: s = 'ink', style }: { surface?: Surface; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: surface[s].hairline, alignSelf: 'stretch' }, style]} />;
}

// ---------- Button ----------

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  surface?: Surface;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
};

export function Button({ label, onPress, variant = 'primary', surface: s = 'ink', disabled, style, haptic = true }: ButtonProps) {
  const pressed = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
    opacity: 1 - pressed.value * 0.1,
  }));

  const bg =
    variant === 'primary' ? color.lilac : variant === 'secondary' ? (s === 'cobalt' ? color.w12 : color.w08) : 'transparent';
  const fg = variant === 'primary' ? color.cobaltOnLilac : color.white;

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => (pressed.value = withTiming(1, { duration: 90 }))}
      onPressOut={() => (pressed.value = withTiming(0, { duration: motion.quick }))}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        play('tap');
        onPress?.();
      }}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Animated.View
        style={[
          {
            backgroundColor: bg,
            borderRadius: radius.button,
            paddingVertical: 18,
            paddingHorizontal: space.l,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
            borderColor: surface[s].hairline,
          },
          aStyle,
        ]}
      >
        <Label color={fg} style={{ fontSize: 13, letterSpacing: 1.3 }}>
          {label}
        </Label>
      </Animated.View>
    </Pressable>
  );
}

// ---------- Layout helpers ----------

export function Gutter({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[{ paddingHorizontal: space.gutter }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Row({ children, style, gap = space.m, ...rest }: ViewProps & { gap?: number }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Stack({ children, style, gap = space.m, ...rest }: ViewProps & { gap?: number }) {
  return (
    <View style={[{ gap }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Card({ children, style, surface: s = 'ink', ...rest }: ViewProps & { surface?: Surface }) {
  // No cards on cobalt. On ink, a raised block.
  if (s === 'cobalt') {
    return (
      <View style={[{ paddingVertical: space.l, borderTopWidth: StyleSheet.hairlineWidth, borderColor: surface.cobalt.hairline }, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[{ backgroundColor: color.inkRaised, borderRadius: radius.card, padding: space.l }, style]} {...rest}>
      {children}
    </View>
  );
}

// ---------- Delta glyph (no red/green) ----------

export function Delta({ value, color: c = color.white }: { value: number; color?: string }) {
  const glyph = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return (
    <RNText style={{ fontFamily: font.mono, fontSize: 13, color: c, letterSpacing: 1 }}>
      {glyph} {Math.abs(value)}
    </RNText>
  );
}
