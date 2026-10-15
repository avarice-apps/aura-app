import React, { useEffect } from 'react';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Antonio_200ExtraLight, Antonio_300Light, Antonio_500Medium } from '@expo-google-fonts/antonio';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { color } from '@/theme/tokens';
import { initSounds } from '@/lib/sound';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    Antonio_200ExtraLight,
    Antonio_300Light,
    Antonio_500Medium,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    Inter_400Regular,
    Inter_500Medium,
  });

  useEffect(() => {
    initSounds();
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.ink }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.ink },
          animation: 'fade',
          animationDuration: 420,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="read" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="train" />
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
