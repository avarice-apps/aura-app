import React from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import * as Haptics from 'expo-haptics';
import { font, useTheme } from '@/theme';
import { useStore, type Tone } from '@/state/store';
import { play } from '@/lib/sound';

/** Real ↔ Unfiltered. Changes how characters and Poise talk, everywhere, instantly. */
export function ToneSwitch({ size = 'small' }: { size?: 'small' | 'large' }) {
  const t = useTheme();
  const tone = useStore((s) => s.tone);
  const set = useStore((s) => s.set);
  const h = size === 'large' ? 40 : 30;
  const opts: { key: Tone; label: string }[] = [
    { key: 'real', label: 'Real' },
    { key: 'unfiltered', label: 'Unfiltered' },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: 999, borderWidth: 1, borderColor: t.line, padding: 3 }}>
      {opts.map((o) => {
        const on = o.key === tone;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (on) return;
              play('select');
              Haptics.selectionAsync();
              set({ tone: o.key });
            }}
            style={{ height: h - 6, paddingHorizontal: size === 'large' ? 16 : 11, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? t.accent : 'transparent' }}
          >
            <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: size === 'large' ? 14 : 12, color: on ? t.onAccent : t.ink2 }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
