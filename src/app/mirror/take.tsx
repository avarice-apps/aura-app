import React, { useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Screen } from '@/ui';
import { font, ForceTheme, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { TakeRecorder } from '@/components/TakeRecorder';
import { ReadingVeil } from '@/components/ReadingVeil';
import { readTake } from '@/lib/api';
import { promptById, SECONDS } from '@/lib/mirror';
import { faceFor } from '@/lib/faces';
import { track } from '@/lib/analytics';

const WAIT = ['That’s the take.', 'Listening to your voice.', 'Watching your eyes.', 'What a stranger would see.', 'Almost.'];

/** Record, then measure and read. The video goes to the server once, is measured, and is deleted there. */
export default function MirrorTake() {
  const { prompt: pid } = useLocalSearchParams<{ prompt?: string }>();
  const p = promptById(pid);
  const [stage, setStage] = useState<'record' | 'reading' | 'failed'>('record');
  const [err, setErr] = useState('');
  const [uri, setUri] = useState('');

  async function read(u: string) {
    setUri(u);
    setStage('reading');
    setErr('');
    try {
      const s = useStore.getState();
      const history = (s.mirror ?? []).filter((r) => r.promptId === p.id && !r.safety).map((r) => ({ index: r.index, archetype: r.archetype, createdAt: r.createdAt }));
      const r = await readTake({ videoUri: u, promptId: p.id, prompt: p.text, history });
      useStore.getState().set({ mirror: [r, ...(useStore.getState().mirror ?? [])].slice(0, 40) });
      track('mirror_read', { prompt: p.id, index: r.index ?? null });
      router.replace({ pathname: '/mirror/[id]', params: { id: r.id } });
    } catch (e: any) {
      if (e?.name === 'PlanError') return router.back();
      setErr(e?.message ?? 'Couldn’t read that take.');
      setStage('failed');
    }
  }

  if (stage === 'record') {
    return <TakeRecorder seconds={SECONDS} kicker="The Mirror" title={p.text} sub="Look at the lens, like it’s the person. Thirty seconds." onDone={read} onClose={() => router.back()} />;
  }
  return (
    <ForceTheme name="nocturne">
      <StatusBar style="light" />
      {stage === 'reading' ? (
        <ReadingVeil face={faceFor('poise')} lines={WAIT} kicker="THE MIRROR" />
      ) : (
        <Failed err={err} onRetry={() => read(uri)} onRedo={() => setStage('record')} />
      )}
    </ForceTheme>
  );
}

function Failed({ err, onRetry, onRedo }: { err: string; onRetry: () => void; onRedo: () => void }) {
  const t = useTheme();
  const btn = { height: 52, borderRadius: 26, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: 28, justifyContent: 'center', gap: 12 }}>
        <RNText style={{ fontFamily: font.serif, fontSize: 36, lineHeight: 40, color: t.ink }}>That take didn’t go through.</RNText>
        <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>{err}</RNText>
        <Pressable onPress={onRetry} style={[btn, { marginTop: 12, backgroundColor: t.accent }]}>
          <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.onAccent }}>Try the read again</RNText>
        </Pressable>
        <Pressable onPress={onRedo} style={[btn, { borderWidth: 1, borderColor: t.line }]}>
          <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>Record it again</RNText>
        </Pressable>
        <Pressable onPress={() => router.back()} style={btn}>
          <RNText style={{ fontFamily: font.regular, fontSize: 15, color: t.ink3 }}>Leave</RNText>
        </Pressable>
      </View>
    </Screen>
  );
}
