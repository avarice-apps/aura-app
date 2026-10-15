import React from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { play } from '@/lib/sound';

const TABS = [
  { name: 'index', label: 'Today', icon: ICON.home },
  { name: 'path', label: 'Path', icon: ICON.path },
  { name: 'poise', label: 'Poise', icon: ICON.chat },
  { name: 'scan', label: 'Scan', icon: ICON.scan },
  { name: 'you', label: 'You', icon: ICON.user },
] as const;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }} tabBar={({ state, navigation }) => <Bar index={state.index} go={(n) => navigation.navigate(n)} />}>
      {TABS.map((x) => (
        <Tabs.Screen key={x.name} name={x.name} options={{ title: x.label }} />
      ))}
    </Tabs>
  );
}

function Bar({ index, go }: { index: number; go: (name: string) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderTopWidth: 1, borderColor: t.line, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) }}>
      {TABS.map((x, i) => {
        const on = i === index;
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
