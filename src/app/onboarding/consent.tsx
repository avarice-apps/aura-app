import React, { useState } from 'react';
import { View, Pressable, Switch } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Title, Muted, Body, Button, Segments, Stack, Row, Card, Icon, ICON } from '@/ui';
import { useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { play } from '@/lib/sound';

/** Onboarding · 18+ and privacy, in one calm screen right before the mic is used. */
export default function Consent() {
  const t = useTheme();
  const set = useStore((s) => s.set);
  const [adult, setAdult] = useState(false);
  const [train, setTrain] = useState(false);
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, flex: 1 }}>
        <Segments total={5} done={3} />
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 26, gap: 8 }}>
          <Title size={30}>Before you speak.</Title>
          <Muted>You’ll talk to a character for about thirty seconds. Voice only, no camera.</Muted>
        </Animated.View>
        <Card style={{ marginTop: 20, gap: 12 }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Icon d={ICON.lock} size={16} color={t.ink2} />
            <Body small style={{ flex: 1 }}>Your voice is measured for pace, fillers and tone, then the recording is deleted. Nothing is shared or used for ads.</Body>
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <Icon d={ICON.check} size={16} color={t.ink2} />
            <Body small style={{ flex: 1 }}>Delete everything any time, in one tap, from You.</Body>
          </Row>
        </Card>
        <Pressable
          onPress={() => {
            play('select');
            Haptics.selectionAsync();
            setAdult(!adult);
          }}
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
        >
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: adult ? t.accent : t.lineStrong, backgroundColor: adult ? t.inverse : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {adult && <Icon d={ICON.check} size={13} color={t.onInverse} stroke={3} />}
          </View>
          <Body>I’m 18 or older.</Body>
        </Pressable>
        <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
          <Stack gap={2} style={{ flex: 1, paddingRight: 12 }}>
            <Body small strong>Help train Poise’s eye (optional)</Body>
            <Muted small>A paid panel may rate your takes to improve scoring. Kept up to 12 months. Off changes nothing.</Muted>
          </Stack>
          <Switch value={train} onValueChange={(v) => { play('tap'); setTrain(v); }} trackColor={{ true: t.accent, false: t.lineStrong }} />
        </Row>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <Button
          label="I'm ready"
          disabled={!adult}
          sound="select"
          onPress={() => {
            set({ ageConfirmed: true, biometricConsent: true, trainingConsent: train });
            router.push('/onboarding/live');
          }}
        />
      </View>
    </Screen>
  );
}
