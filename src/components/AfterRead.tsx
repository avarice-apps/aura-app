import React, { useState } from 'react';
import { View, Pressable, Share, ActivityIndicator, Text as RNText } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Muted } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { makeClip, createChallenge, inviteLink } from '@/lib/api';
import type { Evaluation } from '@/lib/types';
import { track } from '@/lib/analytics';

/**
 * Two quiet actions under a read: turn the moment into a 15-second clip, or dare a friend to beat the score.
 * Both double as the way new people find Kleos (the clip carries the name, the challenge carries your invite).
 */
export function AfterRead({ sessionId, e, challenge }: { sessionId?: string; e: Evaluation; challenge?: { kind: 'daily' | 'floor'; ref_id: string; title: string } }) {
  const t = useTheme();
  const s = useStore();
  const [clip, setClip] = useState<'idle' | 'making' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (!sessionId || e.insufficient || typeof e.rating !== 'number') return null;

  async function doClip() {
    if (clip === 'making') return;
    setClip('making');
    setNote('Making your clip. About fifteen seconds.');
    try {
      const uri = await makeClip(sessionId!);
      setClip('idle');
      setNote('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('share', { what: 'clip' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: 'Your Aura Replay' });
    } catch (x: any) {
      setClip('error');
      setNote(x?.message ?? 'Couldn’t make the clip. Try again.');
    }
  }

  async function doChallenge() {
    if (!challenge || busy) return;
    setBusy(true);
    try {
      const c = await createChallenge({ ...challenge, rating: e.rating, verdict: e.verdict ?? '' });
      s.set({ challenges: [{ code: c.code, title: challenge.title, createdAt: new Date().toISOString(), mine: true }, ...(s.challenges ?? [])].slice(0, 20) });
      track('share', { what: 'challenge' });
      const link = s.invite?.code ? ` ${inviteLink(s.invite.code)}` : '';
      await Share.share({ message: `I got ${e.rating} on “${challenge.title}” in Kleos. Think you can beat it? Enter code ${c.code} in the Farm tab.${link}` });
    } catch (x: any) {
      setNote(x?.message ?? 'Couldn’t create the challenge.');
    } finally {
      setBusy(false);
    }
  }

  const pill = (label: string, onPress: () => void, loading = false) => (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ flex: 1, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
    >
      {loading ? <ActivityIndicator size="small" color={t.accent} /> : null}
      <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.ink }}>{label}</RNText>
    </Pressable>
  );

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {pill(clip === 'making' ? 'Making clip' : 'Make a clip', doClip, clip === 'making')}
        {challenge ? pill('Challenge a friend', doChallenge, busy) : null}
      </View>
      {note ? <Muted small align="center" color={clip === 'error' ? t.accent : undefined}>{note}</Muted> : null}
    </View>
  );
}
