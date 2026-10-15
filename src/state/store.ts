import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Axes } from '@/components/Mark';

export type Tell = { id: string; title: string; evidence: string; axis: keyof Axes; clearedAt?: string };
export type Drill = { title: string; body: string; minutes: number; expiresAt?: string; doneAt?: string };

export type Verdict = {
  id: string;
  createdAt: string;
  promptId: string;
  index: number;
  band: number;
  axes: Axes;
  archetype: string;
  tells: Tell[];
  drill: Drill;
  script: string;
  audioUrl?: string;
  unblurred: boolean;
};

export type Intensity = 'straight' | 'unsparing';

type State = {
  // gates
  ageConfirmed: boolean;
  biometricConsent: boolean;
  onboarded: boolean;
  // identity
  name: string;
  intensity: Intensity;
  // progression
  verdicts: Verdict[];
  streak: number;
  lastGauntletDay?: string;
  freezesLeft: number;
  tellsCleared: number;
  // entitlements (RevenueCat later)
  plan: 'free' | 'plus' | 'pro';
  trialEndsAt?: string;
  // pressure / room scores
  bests: { pressure?: number; room?: number; silence?: number };
  // actions
  set: (p: Partial<State>) => void;
  addVerdict: (v: Verdict) => void;
  unblur: (id: string) => void;
  completeDrill: () => void;
  completeGauntlet: () => void;
  recordBest: (k: keyof State['bests'], v: number) => void;
  reset: () => void;
};

const initial = {
  ageConfirmed: false,
  biometricConsent: false,
  onboarded: false,
  name: '',
  intensity: 'straight' as Intensity,
  verdicts: [] as Verdict[],
  streak: 0,
  freezesLeft: 1,
  tellsCleared: 0,
  plan: 'free' as const,
  bests: {},
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      set: (p) => set(p),
      addVerdict: (v) => set({ verdicts: [v, ...get().verdicts] }),
      unblur: (id) => set({ verdicts: get().verdicts.map((v) => (v.id === id ? { ...v, unblurred: true } : v)) }),
      completeDrill: () => {
        const [latest, ...rest] = get().verdicts;
        if (!latest) return;
        set({ verdicts: [{ ...latest, drill: { ...latest.drill, doneAt: new Date().toISOString() } }, ...rest] });
      },
      completeGauntlet: () => {
        const today = new Date().toISOString().slice(0, 10);
        if (get().lastGauntletDay === today) return;
        set({ streak: get().streak + 1, lastGauntletDay: today });
      },
      recordBest: (k, v) => {
        const b = get().bests;
        if ((b[k] ?? -1) < v) set({ bests: { ...b, [k]: v } });
      },
      reset: () => set({ ...initial }),
    }),
    { name: 'aura', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export const latestVerdict = (s: State) => s.verdicts[0];
export const currentIndex = (s: State) => s.verdicts[0]?.index ?? null;
export const isPaid = (s: State) => s.plan !== 'free' || (s.trialEndsAt ? new Date(s.trialEndsAt) > new Date() : false);
