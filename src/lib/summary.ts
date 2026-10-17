import { useStore, auraIndex } from '@/state/store';
import { saveSummary } from './api';

let last = '';

/** Send the Members page on joinkleos.com a small summary of progress (Index, streak, recent reads). */
export async function syncSummary() {
  const s = useStore.getState();
  if (!s.account) return;
  const body = {
    index: auraIndex(s.sessions),
    streak: s.streak,
    sessions: s.sessions.length,
    laurels: Object.values(s.laurels).filter(Boolean).length,
    archetype: s.sessions[0]?.evaluation?.archetype ?? '',
    recent: s.sessions.slice(0, 6).map((x) => ({ title: x.title, rating: (x.retry ?? x.evaluation)?.rating ?? null, at: x.createdAt })),
  };
  const key = JSON.stringify(body);
  if (key === last) return;
  last = key;
  await saveSummary(body);
}
