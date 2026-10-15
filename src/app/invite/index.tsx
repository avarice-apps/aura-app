import React, { useEffect, useState } from 'react';
import { View, ScrollView, Share, TextInput, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen, Body, Muted, Label, Button, Card, IconButton, Icon, ICON, ArtCard, OnBlue, Row } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { syncMe, redeemCode, inviteLink, type Me } from '@/lib/api';
import { bonusCalls } from '@/lib/plan';
import { track } from '@/lib/analytics';

/** Invite friends: both of you get extra live calls once they finish their first one. */
export default function Invite() {
  const t = useTheme();
  const s = useStore();
  const [me, setMe] = useState<Me | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    syncMe().then(setMe);
  }, []);

  const mine = me?.code ?? s.invite?.code;
  const terms = me?.terms ?? { you_get: 2, you_get_paid: 5, they_get: 2 };

  async function share() {
    if (!mine) return;
    track('share', { what: 'invite' });
    await Share.share({ message: `Kleos puts you in live conversations and tells you honestly how you came across. Use my code ${mine} for ${terms.they_get} extra live calls: ${inviteLink(mine)}` });
  }

  async function redeem() {
    setErr('');
    setMsg('');
    try {
      setMsg(await redeemCode(code));
      setCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (x: any) {
      setErr(x?.message ?? 'That code didn’t work.');
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <IconButton label="Back" onPress={() => router.back()}><Icon d={ICON.back} size={18} /></IconButton>
        <View style={{ gap: 14, marginTop: 10 }}>
          <ArtCard art="aurelius" height={240} focus="top">
            <OnBlue kicker="Invite friends" sub={`When a friend finishes their first call, you both get ${terms.they_get} extra live calls. If they subscribe, you get ${terms.you_get_paid} more.`}>Bring someone who needs to hear it.</OnBlue>
          </ArtCard>

          <Card style={{ gap: 10, alignItems: 'center' }}>
            <Label>Your code</Label>
            <RNText style={{ fontFamily: font.mono, fontSize: 30, letterSpacing: 6, color: t.ink }}>{mine ?? '······'}</RNText>
            <Button label="Share your invite" onPress={share} disabled={!mine} style={{ alignSelf: 'stretch' }} />
          </Card>

          <Row gap={10}>
            <Card style={{ flex: 1, gap: 2 }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 26, color: t.ink }}>{me?.friends ?? s.invite?.friends ?? 0}</RNText>
              <Muted small>friends joined</Muted>
            </Card>
            <Card style={{ flex: 1, gap: 2 }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 26, color: t.accent }}>{bonusCalls()}</RNText>
              <Muted small>extra calls left</Muted>
            </Card>
          </Row>

          {!s.invite?.usedCode && (
            <Card style={{ gap: 8 }}>
              <Label>Have a code?</Label>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))}
                placeholder="Friend’s or creator’s code"
                placeholderTextColor={t.ink3}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{ fontFamily: code ? font.mono : font.regular, fontSize: 16, letterSpacing: code ? 3 : 0, color: t.ink, paddingVertical: 8 }}
              />
              <Button label="Add code" variant="secondary" disabled={code.length < 3} onPress={redeem} />
              {msg ? <Body small color={t.accent}>{msg}</Body> : null}
              {err ? <Body small color={t.accent}>{err}</Body> : null}
            </Card>
          )}
          <Muted small align="center">Extra calls never expire. They’re used after your weekly free calls.</Muted>
        </View>
      </ScrollView>
    </Screen>
  );
}
