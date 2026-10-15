import React, { useEffect, useState } from 'react';
import { View, Text as RNText, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Button } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { redeemCode } from '@/lib/api';

/** kleos://invite/CODE — opened from an invite link. Adds the code, then carries on. */
export default function InviteLink() {
  const t = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const onboarded = useStore((s) => s.onboarded);
  const c = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [state, setState] = useState<{ done: boolean; text: string }>(c ? { done: false, text: '' } : { done: true, text: 'That link didn’t have a code in it.' });

  useEffect(() => {
    if (!c) return;
    redeemCode(c)
      .then((m) => setState({ done: true, text: m }))
      .catch((e) => setState({ done: true, text: e?.message ?? 'That code didn’t work.' }));
  }, [c]);

  const next = () => router.replace(onboarded ? '/(tabs)' : '/onboarding');

  return (
    <Screen edges={['top', 'bottom']} bg={t.accent}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 18 }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: 2, color: 'rgba(255,255,255,0.75)' }}>KLEOS · INVITE</RNText>
        {state.done ? (
          <RNText style={{ fontFamily: font.serif, fontSize: 34, lineHeight: 40, color: '#FFF' }}>{state.text}</RNText>
        ) : (
          <ActivityIndicator color="#FFF" />
        )}
      </View>
      {state.done && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Button label="Continue" variant="light" onPress={next} />
        </View>
      )}
    </Screen>
  );
}
