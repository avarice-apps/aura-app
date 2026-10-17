import React, { useEffect, useState } from 'react';
import { Stack, SplashScreen, usePathname, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Antonio_200ExtraLight, Antonio_300Light } from '@expo-google-fonts/antonio';
import { useTheme } from '@/theme';
import { initSounds, setSoundsEnabled } from '@/lib/sound';
import { useStore } from '@/state/store';
import { initAnalytics, screen } from '@/lib/analytics';
import { initPurchases } from '@/lib/purchases';
import { syncMe, reportClientError } from '@/lib/api';
import { getToken, refreshAccount } from '@/lib/session';
import { syncSummary } from '@/lib/summary';
import { AppState, View, Pressable, Text as RNText } from 'react-native';

SplashScreen.preventAutoHideAsync();

/**
 * If any screen throws while rendering, show a way out instead of a blank screen, and tell the server what broke
 * (message and the top of the stack only) so it can be fixed.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const t = useTheme();
  const path = usePathname();
  useEffect(() => {
    reportClientError(error, path);
  }, [error, path]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 28, justifyContent: 'center', gap: 14 }}>
      <RNText style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 38, lineHeight: 42, color: t.ink }}>Something slipped.</RNText>
      <RNText style={{ fontSize: 15, lineHeight: 21, color: t.ink2 }}>That screen hit an error. Your progress is safe, and we’ve been told what happened.</RNText>
      <Pressable onPress={() => retry()} style={{ marginTop: 10, height: 52, borderRadius: 26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontSize: 16, color: t.onAccent }}>Try again</RNText>
      </Pressable>
      <Pressable onPress={() => router.replace('/(tabs)')} style={{ height: 52, borderRadius: 26, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontSize: 16, color: t.ink }}>Back to Today</RNText>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const t = useTheme();
  const sounds = useStore((s) => s.sounds);
  const [loaded] = useFonts({ Antonio_200ExtraLight, Antonio_300Light, Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular, GeistMono_500Medium, InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic });

  const subjectId = useStore((s) => s.subjectId);
  const path = usePathname();
  // Wait for the saved state before identifying the install, or RevenueCat and PostHog see a new user every launch.
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  useEffect(() => {
    initSounds();
  }, []);
  const accountId = useStore((s) => s.account?.id);
  useEffect(() => {
    if (!hydrated || !subjectId) return;
    initAnalytics(subjectId);
    // The account first (a guest one is made quietly the first time), then purchases under the account's id.
    (async () => {
      await getToken();
      const a = await refreshAccount();
      initPurchases(a?.id ?? useStore.getState().account?.id ?? subjectId);
      syncMe();
      syncSummary();
    })();
  }, [hydrated, subjectId]);
  useEffect(() => {
    if (hydrated && accountId) initPurchases(accountId); // signed in to a saved account: RevenueCat follows
  }, [hydrated, accountId]);
  useEffect(() => {
    // Back from the background: allowances and plan may have changed (a purchase, a new week).
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && hydrated) refreshAccount().catch(() => {});
    });
    return () => sub.remove();
  }, [hydrated]);
  useEffect(() => {
    screen(path);
  }, [path]);
  useEffect(() => {
    setSoundsEnabled(sounds);
  }, [sounds]);
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'fade', animationDuration: 320 }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lesson/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="quest/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="situations" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="receipt" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="scan" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="aura-scan" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="occasion" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="memory" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="table" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="moment" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="tribunal/index" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="direct" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tribunal/[code]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="missions" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="room/[cat]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="floor/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="daily" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="rehearse" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="path" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="portrait" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="codes" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="duel/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="duel/[code]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="clip" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="capture" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="fit" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="wardrobe" options={{ animation: 'fade' }} />
        <Stack.Screen name="profile-read" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="floor/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="code/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="replay" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="poise-live" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="challenge/[code]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="invite/[code]" options={{ animation: 'fade' }} />
        <Stack.Screen name="invite/index" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
