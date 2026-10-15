import React, { useEffect } from 'react';
import { Stack, SplashScreen, usePathname } from 'expo-router';
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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const t = useTheme();
  const sounds = useStore((s) => s.sounds);
  const [loaded] = useFonts({ Antonio_200ExtraLight, Antonio_300Light, Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular, GeistMono_500Medium, InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic });

  const subjectId = useStore((s) => s.subjectId);
  const path = usePathname();
  useEffect(() => {
    initSounds();
  }, []);
  useEffect(() => {
    if (!subjectId) return;
    initAnalytics(subjectId);
    initPurchases(subjectId);
  }, [subjectId]);
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
        <Stack.Screen name="you" options={{ animation: 'slide_from_right' }} />
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
        <Stack.Screen name="profile-read" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="floor/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="code/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="replay" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
