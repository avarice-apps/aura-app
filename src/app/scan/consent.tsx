import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, Title, Body, Muted, Label, Button, IconButton, Icon, ICON, Row, Stack, Statue, Halo } from '@/ui';
import { useTheme } from '@/theme';
import { useScan } from '@/state/scanSession';
import { randomPrompt } from '@/lib/scanPrompts';
import { play } from '@/lib/sound';

/** The person about to be scanned says yes themselves. Every player, every time. */
export default function ScanConsent() {
  const t = useTheme();
  const scan = useScan();
  const [ok, setOk] = useState(false);
  const who = scan.players[scan.current];
  const upload = scan.mode === 'upload';

  function go() {
    play('select');
    scan.set({ prompt: upload ? 'Uploaded clip' : randomPrompt(scan.usedPrompts) });
    router.replace(upload ? '/scan/result' : '/scan/record');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton label="Close" onPress={() => router.dismissAll()}><Icon d={ICON.close} size={16} /></IconButton>
        <Label>{scan.mode === 'party' ? `Player ${scan.current + 1} of ${scan.players.length}` : 'Aura Scan'}</Label>
        <View style={{ width: 40 }} />
      </Row>
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'center', gap: 18 }}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', justifyContent: 'center', height: 180 }}>
          <View style={{ position: 'absolute' }}><Halo size={220} opacity={0.5} /></View>
          <Statue name="antinoos" height={170} />
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={{ gap: 8 }}>
          <Label>{upload ? 'Before it’s read' : 'Hand the phone over'}</Label>
          <Title size={28}>{upload ? 'Whose clip is this?' : `${who}, your turn.`}</Title>
          <Body color={t.ink2}>
            {upload
              ? 'If it’s you, Poise reads voice, face and posture. If it’s someone else, only voice and posture, and only if they’re fine with it.'
              : 'You’ll get a prompt and fifteen seconds. The camera reads how you spoke and held yourself. It rates the take, not you. The clip is deleted right after.'}
          </Body>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(500).delay(200)}>
          <Pressable onPress={() => { play('tap'); setOk(!ok); }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: ok ? t.accent : t.line, backgroundColor: ok ? t.accentSoft : t.card }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: ok ? t.accent : t.lineStrong, backgroundColor: ok ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {ok && <Icon d={ICON.check} size={13} color={t.onAccent} stroke={2.4} />}
            </View>
            <Body small style={{ flex: 1 }}>{upload ? 'The person in this clip is 18+ and okay with being read.' : 'I’m in. I’m 18+ and I’m fine being read.'}</Body>
          </Pressable>
        </Animated.View>
        {upload && (
          <Stack gap={8}>
            <Row gap={8}>
              <Button label="It’s me" variant={scan.players[0] === 'Me' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => scan.set({ players: ['Me'] })} />
              <Button label="Someone else" variant={scan.players[0] === 'Clip' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => scan.set({ players: ['Clip'] })} />
            </Row>
          </Stack>
        )}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 8 }}>
        <Button label={upload ? 'Read the clip' : 'Show me the prompt'} disabled={!ok} onPress={go} />
        <Muted small align="center">No consent, no scan. Skipping is always fine.</Muted>
      </View>
    </Screen>
  );
}
