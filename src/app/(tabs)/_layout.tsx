import React from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Icon, ICON } from '@/ui';
import { Image } from 'expo-image';
import { font, useTheme } from '@/theme';
import { faceFor } from '@/lib/faces';

const POISE = faceFor('poise');
import { play } from '@/lib/sound';

const TABS = [
  { name: 'index', label: 'Today', icon: ICON.home },
  { name: 'play', label: 'Play', icon: ICON.live },
  { name: 'poise', label: 'Poise', icon: ICON.poise },
  { name: 'mirror', label: 'Mirror', icon: ICON.scan },
  { name: 'you', label: 'You', icon: ICON.user },
] as const;
const HIDDEN = ['live', 'farm', 'progress'] as const;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }} tabBar={({ state, navigation }) => <Bar active={state.routes[state.index]?.name} go={(n) => navigation.navigate(n)} />}>
      {TABS.map((x) => (
        <Tabs.Screen key={x.name} name={x.name} options={{ title: x.label }} />
      ))}
      {/* old tab routes, kept so links into them still land (each redirects) */}
      {HIDDEN.map((n) => (
        <Tabs.Screen key={n} name={n} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

function Bar({ active, go }: { active?: string; go: (name: string) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.bg, borderTopWidth: 1, borderColor: t.line, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) }}>
      {TABS.map((x) => {
        const on = x.name === active;
        if (x.name === 'poise') {
          // Poise sits in the middle, raised: she's the one you talk to
          return (
            <Pressable
              key={x.name}
              accessibilityLabel="Poise"
              onPress={() => { if (!on) { play('select'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } go(x.name); }}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, transform: [{ scale: pressed ? 0.95 : 1 }] })}
            >
              <View style={{ marginTop: -30, width: 62, height: 62, borderRadius: 31, padding: 3, backgroundColor: on ? t.accent : t.bg, borderWidth: on ? 0 : 1.5, borderColor: t.accent, shadowColor: '#1608F2', shadowOpacity: on ? 0.45 : 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
                <Image source={POISE} style={{ flex: 1, borderRadius: 28, backgroundColor: t.card }} contentFit="cover" />
              </View>
              <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 10, color: on ? t.accent : t.ink3 }}>{x.label}</RNText>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={x.name}
            accessibilityLabel={x.label}
            onPress={() => {
              if (!on) {
                play('tap');
                Haptics.selectionAsync();
              }
              go(x.name);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
          >
            <Icon d={x.icon} size={21} color={on ? t.accent : t.ink3} stroke={on ? 2 : 1.7} />
            <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 10, color: on ? t.accent : t.ink3 }}>{x.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
