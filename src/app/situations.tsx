import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Muted, Label, Button, IconButton, Icon, ICON, Row, Pill, Tag } from '@/ui';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { SituationCard, pickSituation, ALL_SITUATIONS, CATEGORY_LABEL } from '@/components/SituationCard';
import { play } from '@/lib/sound';

const CATS = Object.keys(CATEGORY_LABEL);

/** Situations: ten-second judgment calls. Endless, categorised, with what everyone picked once there's enough data. */
export default function Situations() {
  const t = useTheme();
  const s = useStore();
  const [cat, setCat] = useState<string>('all');
  const [n, setN] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [key, setKey] = useState(0);
  const seen = s.situationsSeen;
  // Category for 'all' is drawn from the key so the pick stays stable across re-renders.
  const sit = useMemo(() => pickSituation(cat === 'all' ? CATS[(key * 7 + seen.length) % CATS.length] : cat, seen, 3), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = ALL_SITUATIONS.filter((x) => seen.includes(x.id)).length;

  function next() {
    play('select');
    setAnswered(false);
    setKey((k) => k + 1);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton label="Close" onPress={() => router.back()}><Icon d={ICON.close} size={16} /></IconButton>
        <Label>{done}/{ALL_SITUATIONS.length} seen</Label>
        <Tag label={streak ? `${streak} in a row` : 'Situations'} tone={streak >= 3 ? 'accent' : 'muted'} />
      </Row>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 4 }}>
          <Title size={30}>Read the room.</Title>
          <Muted small>Ten seconds. Pick the move. See why, and what everyone else picked.</Muted>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pill label="All" active={cat === 'all'} onPress={() => { setCat('all'); next(); }} />
          {CATS.map((c) => <Pill key={c} label={CATEGORY_LABEL[c]} active={cat === c} onPress={() => { setCat(c); next(); }} />)}
        </ScrollView>
        <Animated.View key={sit.id} entering={FadeInDown.duration(350)}>
          <SituationCard
            s={sit}
            onAnswered={(right) => {
              setAnswered(true);
              setN((x) => x + 1);
              setStreak(right ? streak + 1 : 0);
              s.set({ situationsSeen: [...seen, sit.id] });
            }}
          />
        </Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        {answered ? <Button label="Next situation" sound="select" onPress={next} /> : <Muted small align="center">{n ? `${n} answered this session` : 'Tap an option before the clock runs out.'}</Muted>}
      </View>
    </Screen>
  );
}
