import React from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Label } from '@/ui';
import { color, space } from '@/theme/tokens';

const TABS = [
  { name: 'index', label: 'Today' },
  { name: 'train', label: 'Train' },
  { name: 'progress', label: 'Progress' },
  { name: 'you', label: 'You' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.ink } }}
      tabBar={({ state, navigation }) => <Bar index={state.index} go={(n) => navigation.navigate(n)} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

function Bar({ index, go }: { index: number; go: (name: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {TABS.map((t, i) => (
        <Pressable
          key={t.name}
          onPress={() => {
            Haptics.selectionAsync();
            go(t.name);
          }}
          style={styles.item}
          hitSlop={8}
        >
          <View style={[styles.dot, i === index && styles.dotOn]} />
          <Label small color={i === index ? color.white : color.w48}>{t.label}</Label>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.ink,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: color.w12,
    paddingTop: 14,
    paddingHorizontal: space.gutter,
  },
  item: { flex: 1, alignItems: 'center', gap: 8 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: color.white },
});
