import React from 'react';
import { router } from 'expo-router';
import { Conversation } from '@/components/Conversation';
import { NightCall } from '@/components/NightCall';
import { useStore } from '@/state/store';

/**
 * A voice call with Poise: just talk, no score. A date Friday, what to wear, a text to send.
 * When it ends, Poise leaves a short note in the chat (what you agreed, the next step, a scene to practise).
 */
export default function PoiseLive() {
  return (
    <NightCall label="Call with Poise" onClose={() => router.back()}>
      <Conversation
        metered
        args={{ poise: true }}
        onDone={({ evaluation }) => {
          const e: any = evaluation;
          if (e?.note) {
            const st = useStore.getState();
            st.set({ callNotes: [...(st.callNotes ?? []), { kind: 'call' as const, note: String(e.note), next: e.next ?? null, scene: e.scene ?? null, createdAt: new Date().toISOString() }].slice(-40) });
          }
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/poise');
        }}
        onLeave={() => router.back()}
      />
    </NightCall>
  );
}
