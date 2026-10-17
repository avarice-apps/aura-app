import { useStore } from '@/state/store';
import { directContext, directStatus, occasionLine } from './api';

/** What Poise Direct may know, as one line each. Only sent for the parts switched on in the app. */
function styleLine(): string | undefined {
  const p = useStore.getState().styleProfile;
  if (!p) return undefined;
  return [p.lanes?.slice(0, 2).join(', '), p.colours?.slice(0, 4).join(', '), p.presence].filter(Boolean).join('; ') || undefined;
}

/** Push the allowed context again (after the occasion or taste changes). Quiet no-op for everyone else. */
export async function syncDirectContext(allow?: { occasion: boolean; style: boolean }) {
  const s = useStore.getState();
  if (s.account?.plan !== 'black' && s.plan !== 'black') return;
  const a = allow ?? (await directStatus())?.allow;
  if (!a || (!a.occasion && !a.style && !allow)) return;
  try {
    await directContext({ allow: a, occasion: a.occasion ? occasionLine() : undefined, style: a.style ? styleLine() : undefined });
  } catch {}
}
