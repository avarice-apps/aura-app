import React from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ForceTheme, font, useTheme } from '@/theme';
import { Icon, ICON } from '@/ui';

/**
 * Every call happens at night: the maître d' palette (ink navy, lavender, ivory) whatever the app's theme is.
 * Calm, a little mysterious, and nothing on screen but the person you're talking to.
 */
export function NightCall({ children, label, onClose }: { children: React.ReactNode; label?: string; onClose?: () => void }) {
  return (
    <ForceTheme name="nocturne">
      <StatusBar style="light" />
      <NightFrame label={label} onClose={onClose}>
        {children}
      </NightFrame>
    </ForceTheme>
  );
}

function NightFrame({ children, label, onClose }: { children: React.ReactNode; label?: string; onClose?: () => void }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      {onClose || label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, height: 46 }}>
          {onClose ? (
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ICON.close} size={14} color={t.ink2} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
          {label ? <RNText numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.mono, fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase', color: t.ink3 }}>{label}</RNText> : null}
          <View style={{ width: 36 }} />
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}
