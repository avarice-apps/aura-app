import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Evaluation, Receipt, ScanResult } from '@/lib/types';

export type Goal = 'dates' | 'work' | 'rooms' | 'ground';
export type ThemePref = 'gallery' | 'nocturne' | 'system';
export type Mode = 'voice' | 'camera';
export type Tone = 'real' | 'unfiltered';
export type Pronoun = 'he' | 'she' | 'they';
export type Dates = 'women' | 'men' | 'everyone';

/** The account as the server reports it (see lib/session). */
export type Account = {
  id: string;
  name: string;
  email: string | null;
  apple: boolean;
  saved: boolean;
  waitlist_no: number | null;
  plan: 'free' | 'plus' | 'black';
  plan_until: number | null;
  week: string;
  left: { calls: number | null; clips: number | null; poise: number | null; profiles: number | null; fits: number | null };
  credits: number;
  daily_done: boolean;
  live_min_left: number | null;
  live_min_week: number | null;
  subject: string;
  summary?: unknown;
};

/** Something coming up. One at a time; it ties the look and the practice together. */
export type Occasion = {
  what: string; // "Dinner with her friends"
  kind?: string; // preset key: dinner, date, interview, party, drinks, presentation, parents, night
  when?: 'tonight' | 'tomorrow' | 'week' | 'later';
  who?: string; // "I know two people"
  impression?: string; // how they want to come across
  target?: string; // the one thing to get right
  createdAt: string;
  lookId?: string; // the outfit they chose for it (Wardrobe)
  practised?: number; // scenes played for it
};

/** A note Poise left in the chat after a voice call. */
export type CallNote = { kind: 'call'; note: string; next?: string | null; scene?: { character: string; setting: string; opener: string; goal: string } | null; createdAt: string };

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
  pronoun?: Pronoun; // how characters refer to you
  dates?: Dates; // who sits across from you in dating scenes
  account?: Account;
  occasion?: Occasion;
  callNotes: CallNote[];
  /** Before I send this: recent draft reads. Kept on this phone only, and only for 30 days. */
  drafts: import('@/lib/types').DraftEntry[];
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
  fits?: import('@/lib/types').FitRead[];
  patternsDismissed: string[]; // pattern keys the user removed from their history
  daily: { day: string; done: string[] }; // today's small things: situation, mission, debrief, scan
  // plan (set from RevenueCat entitlements; trial counts as plus)
  plan: 'free' | 'plus' | 'black';
  trialEndsAt?: string;
  usage: { week: string; calls: number; clips: number; poise: number; profiles: number; fits?: number };
  wardrobe?: import('@/lib/types').WardrobeItem[];
  /** The style lane he's building toward (Wardrobe). Keeps every fit read and build consistent. */
  styleLane?: string;
  styleProfile?: import('@/lib/types').StyleProfile;
  duels: { id: string; code: string; topic: string; role: 'a' | 'b'; createdAt: string; result?: any }[];
  // referrals: extra live calls earned (granted by the server) and how many have been used
  credits: { granted: number; used: number };
  invite: { code?: string; usedCode?: string; friends?: number };
  // what recurring characters remember about you (name -> note)
  met: Record<string, { note: string; at: string }>;
  cameraOn: boolean;
  lastSpent?: { kind: string; bonus: boolean };
  /** Local usage counts at the moment the server last reported the account (see plan.remaining). */
  lastSync?: { calls: number; clips: number; poise: number; profiles: number; fits: number };
  challenges: { code: string; title: string; createdAt: string; mine: boolean }[];
  tribunals: { code: string; topic: string; createdAt: string }[];
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
  pronoun: undefined as Pronoun | undefined,
  dates: undefined as Dates | undefined,
  account: undefined as Account | undefined,
  occasion: undefined as Occasion | undefined,
  callNotes: [] as CallNote[],
  drafts: [] as import('@/lib/types').DraftEntry[],
  tribunals: [] as { code: string; topic: string; createdAt: string }[],
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
  fits: [] as import('@/lib/types').FitRead[],
  wardrobe: [] as import('@/lib/types').WardrobeItem[],
  styleProfile: undefined as import('@/lib/types').StyleProfile | undefined,
  styleLane: undefined as string | undefined,
  patternsDismissed: [] as string[],
  daily: { day: '', done: [] as string[] },
  plan: 'free' as 'free' | 'plus' | 'black',
  usage: { week: '', calls: 0, clips: 0, poise: 0, profiles: 0 },
  duels: [] as { id: string; code: string; topic: string; role: 'a' | 'b'; createdAt: string; result?: any }[],
  credits: { granted: 0, used: 0 },
  invite: {} as { code?: string; usedCode?: string; friends?: number },
  met: {} as Record<string, { note: string; at: string }>,
  cameraOn: false,
  challenges: [] as { code: string; title: string; createdAt: string; mine: boolean }[],
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
      // Wipes history but keeps what isn't the user's content: their subscription, this week's usage and the install id.
      reset: () => set({ ...initial, plan: get().plan, usage: get().usage, subjectId: get().subjectId, credits: get().credits, invite: get().invite, account: get().account }),
    }),
    { name: 'aura-v2', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export function isPaid(s: Pick<State, 'plan'>) {
  return s.plan !== 'free';
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
