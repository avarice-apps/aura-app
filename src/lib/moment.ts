import { router } from 'expo-router';
import { useStore } from '@/state/store';
import type { Evaluation } from './types';
import { gate, requireTier } from './plan';

/**
 * Retry this moment. The screen that showed the read hands over the call and its evaluation, and /moment plays
 * the scene again from just before the one change. The result is kept here until the caller saves its session.
 */
type Pending = { sessionId: string; e: Evaluation; title: string };
let current: Pending | null = null;
const results: Record<string, Evaluation> = {};

export function retryMoment(sessionId: string, e: Evaluation, title: string) {
  if (!sessionId || !e.change?.turn) return;
  if (!requireTier('plus', 'retry')) return;
  if (!gate('calls')) return;
  current = { sessionId, e, title };
  router.push({ pathname: '/moment', params: { session: sessionId, turn: String(e.change.turn) } });
}

export function pendingMoment(sessionId?: string): Pending | null {
  return current && (!sessionId || current.sessionId === sessionId) ? current : null;
}

/** The moment's read: attached to the saved session as its retry (or kept until the caller saves it). */
export function finishMoment(sessionId: string, e: Evaluation) {
  results[sessionId] = e;
  if (e.insufficient) return;
  const st = useStore.getState();
  const has = st.sessions.some((x) => x.id === sessionId);
  if (has) st.set({ sessions: st.sessions.map((x) => (x.id === sessionId ? { ...x, retry: e } : x)) });
}

export function momentRetryFor(sessionId: string): Evaluation | undefined {
  const e = results[sessionId];
  return e && !e.insufficient ? e : undefined;
}
