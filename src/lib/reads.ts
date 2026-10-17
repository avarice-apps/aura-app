import { create } from 'zustand';
import type { Evaluation } from './types';

/**
 * The read arrives in two parts: the quick read (score, verdict, the one change) the moment you hang up, and the
 * detail (evidence, two ways in, the signal, the turning point) a few seconds later. The detail lands here, keyed
 * by session, and every result component merges it in with useFullRead, so nothing has to be passed around.
 * Kept in memory only: saved sessions store the complete read when it's there.
 */
type Detail = Partial<Evaluation> & { detail_pending?: boolean };
export const useReads = create<{ bySession: Record<string, Detail>; put: (sid: string, d: Detail) => void }>((set) => ({
  bySession: {},
  put: (sid, d) => set((s) => ({ bySession: { ...s.bySession, [sid]: { ...(s.bySession[sid] ?? {}), ...d } } })),
}));

const DETAIL_KEYS = ['evidence', 'uncertainties', 'alternatives', 'signal', 'turning_point', 'compare', 'voices', 'detail_pending'] as const;

/** The read with its detail merged in, if it has arrived. */
export function useFullRead<T extends Partial<Evaluation> | null | undefined>(e: T): T {
  const sid = (e as any)?.session_id as string | undefined;
  const d = useReads((s) => (sid ? s.bySession[sid] : undefined));
  if (!e || !d) return e;
  return { ...e, ...d } as T;
}

export function pickDetail(e: any): Detail {
  const out: any = {};
  for (const k of DETAIL_KEYS) if (e && k in e) out[k] = e[k];
  return out;
}
