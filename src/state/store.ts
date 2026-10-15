import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Evaluation, Receipt, ScanResult } from '@/lib/types';

export type Goal = 'dates' | 'work' | 'rooms' | 'ground';
export type ThemePref = 'gallery' | 'nocturne' | 'system';
export type Mode = 'voice' | 'camera';
export type Tone = 'real' | 'unfiltered';

export type SessionRecord = {
  id: string;
  kind: 'onboarding' | 'lesson' | 'room' | 'checkpoint';
  title: string;
  createdAt: string;
  evaluation: Evaluation;
  retry?: Evaluation;
  lessonId?: string;
};

type State = {
  // prefs
  theme: ThemePref;
  sounds: boolean;
  tone: Tone; // 'unfiltered' = funny, swearing, frank adult talk (never explicit)
  // gates
  ageConfirmed: boolean;
  biometricConsent: boolean;
  trainingConsent: boolean;
  subjectId: string;
  onboarded: boolean;
  // identity
  name: string;
  goal: Goal;
  mode: Mode;
  // onboarding scratch
  ob: { quickCorrect?: number; first?: Evaluation; firstSession?: string; second?: Evaluation };
  // progress
  sessions: SessionRecord[];
  receipts: Receipt[];
  scans: ScanResult[];
  laurels: Record<string, 0 | 1 | 2 | 3>; // lessonId -> bronze/silver/gold
  xp: number;
  streak: number;
  lastActiveDay?: string;
  composure: number; // hearts, refills daily
  composureDay?: string;
  missionsDone: string[];
  activeMission?: string;
  situationsSeen: string[];
  questsDone: string[];
  dailyQuestDone: string[]; // dates (YYYY-MM-DD) a Daily Side Quest was played
  moments: import('@/lib/types').Moment[];
  profileReads: import('@/lib/types').ProfileRead[];
  patternsDismissed: string[]; // pattern keys the user removed from their history
  daily: { day: string; done: string[] }; // today's small things: situation, mission, debrief, scan
  // plan (set from RevenueCat entitlements; trial counts as plus)
  plan: 'free' | 'plus' | 'black';
  trialEndsAt?: string;
  usage: { week: string; calls: number; clips: number; poise: number; profiles: number };
  duels: { id: string; code: string; topic: string; role: 'a' | 'b'; createdAt: string; result?: any }[];
  // actions
  set: (p: Partial<State>) => void;
  addSession: (r: SessionRecord) => void;
  addReceipt: (r: Receipt) => void;
  addScan: (r: ScanResult) => void;
  award: (lessonId: string, level: 1 | 2 | 3, xp: number) => void;
  touchDay: () => void;
  markDaily: (key: string) => void;
  spendComposure: () => boolean;
  reset: () => void;
};

const today = () => new Date().toISOString().slice(0, 10);

const initial = {
  theme: 'gallery' as ThemePref,
  sounds: true,
  tone: 'real' as Tone,
  ageConfirmed: false,
  biometricConsent: false,
  trainingConsent: false,
  subjectId: `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  onboarded: false,
  name: '',
  goal: 'work' as Goal,
  mode: 'voice' as Mode,
  ob: {},
  sessions: [] as SessionRecord[],
  receipts: [] as Receipt[],
  scans: [] as ScanResult[],
  laurels: {} as Record<string, 0 | 1 | 2 | 3>,
  xp: 0,
  streak: 0,
  composure: 3,
  missionsDone: [] as string[],
  situationsSeen: [] as string[],
  questsDone: [] as string[],
  dailyQuestDone: [] as string[],
  moments: [] as import('@/lib/types').Moment[],
  profileReads: [] as import('@/lib/types').ProfileRead[],
  patternsDismissed: [] as string[],
  daily: { day: '', done: [] as string[] },
  plan: 'free' as 'free' | 'plus' | 'black',
  usage: { week: '', calls: 0, clips: 0, poise: 0, profiles: 0 },
  duels: [] as { id: string; code: string; topic: string; role: 'a' | 'b'; createdAt: string; result?: any }[],
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      set: (p) => set(p),
      addSession: (r) => set({ sessions: [r, ...get().sessions] }),
      addReceipt: (r) => set({ receipts: [r, ...get().receipts] }),
      addScan: (r) => set({ scans: [r, ...get().scans].slice(0, 50) }),
      award: (lessonId, level, xp) => {
        const cur = get().laurels[lessonId] ?? 0;
        set({ laurels: { ...get().laurels, [lessonId]: Math.max(cur, level) as 0 | 1 | 2 | 3 }, xp: get().xp + xp });
      },
      markDaily: (key) =>
        set((st) => {
          const d = today();
          const done = st.daily?.day === d ? st.daily.done : [];
          return done.includes(key) ? {} : { daily: { day: d, done: [...done, key] } };
        }),
      touchDay: () => {
        const t = today();
        const last = get().lastActiveDay;
        if (last === t) return;
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        set({ lastActiveDay: t, streak: last === y ? get().streak + 1 : 1 });
      },
      spendComposure: () => {
        const t = today();
        let c = get().composureDay === t ? get().composure : 3;
        if (isPaid(get())) return true;
        if (c <= 0) return false;
        set({ composure: c - 1, composureDay: t });
        return true;
      },
      reset: () => set({ ...initial, subjectId: `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}` }),
    }),
    { name: 'aura-v2', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export function isPaid(s: Pick<State, 'plan' | 'trialEndsAt'>) {
  return s.plan !== 'free' || (s.trialEndsAt ? new Date(s.trialEndsAt) > new Date() : false);
}

export function composureLeft(s: Pick<State, 'composure' | 'composureDay'>) {
  return s.composureDay === today() ? s.composure : 3;
}

/** Provisional Aura Index: mean of the last 5 session ratings (retry if present). */
export function auraIndex(sessions: SessionRecord[]) {
  const r = sessions.slice(0, 5).map((s) => (s.retry ?? s.evaluation).rating);
  if (!r.length) return null;
  return Math.round(r.reduce((a, b) => a + b, 0) / r.length);
}
