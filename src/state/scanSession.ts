import { create } from 'zustand';
import type { ScanResult } from '@/lib/types';

/** Transient state for one Aura Scan session (solo, party, or upload). Not persisted; results go to the main store. */
export type ScanMode = 'solo' | 'party' | 'upload';

type S = {
  mode: ScanMode;
  players: string[];
  current: number;
  prompt: string;
  usedPrompts: string[];
  results: (ScanResult & { player: string })[];
  uploadUri?: string;
  set: (p: Partial<S>) => void;
  begin: (mode: ScanMode, players: string[]) => void;
  pushResult: (r: ScanResult) => void;
  next: () => boolean;
};

export const useScan = create<S>()((set, get) => ({
  mode: 'solo',
  players: ['You'],
  current: 0,
  prompt: '',
  usedPrompts: [],
  results: [],
  set: (p) => set(p),
  begin: (mode, players) => set({ mode, players, current: 0, results: [], prompt: '', usedPrompts: [], uploadUri: undefined }),
  pushResult: (r) => set((s) => ({ results: [...s.results, { ...r, player: s.players[s.current] }] })),
  next: () => {
    const s = get();
    if (s.current + 1 >= s.players.length) return false;
    set({ current: s.current + 1 });
    return true;
  },
}));
