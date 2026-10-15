import { router } from 'expo-router';
import { useStore } from '@/state/store';

export type Tier = 'free' | 'plus' | 'black';
export type Metered = 'calls' | 'clips' | 'poise' | 'profiles';

/** What each tier gets per week. Infinity = unlimited. The Daily Side Quest, Situations' daily set, Aura Farm and Duels are always free. */
export const LIMITS: Record<Tier, Record<Metered, number>> = {
  free: { calls: 2, clips: 1, poise: 3, profiles: 1 },
  plus: { calls: Infinity, clips: Infinity, poise: Infinity, profiles: 3 },
  black: { calls: Infinity, clips: Infinity, poise: Infinity, profiles: Infinity },
};

/** The pitch, used by the paywall and plan screen. */
export const TIERS = [
  {
    key: 'free' as const,
    name: 'Free',
    line: 'Get a taste. Every day.',
    perks: ['The Daily Side Quest, every day', 'Aura Farm and Debate Duels with friends', '2 live calls a week, with the verdict, the score and Poise’s voice note', '1 clip rating a week, 1 Profile Read'],
  },
  {
    key: 'plus' as const,
    name: 'Kleos+',
    line: 'Train every day. Hear the whole truth.',
    perks: ['Unlimited live calls: Open Floor, every side quest, the full Path', 'The full read: the moment it turned, what they were thinking, two ways in', 'Run it back and Replay any moment', 'Unlimited clip ratings and Poise debriefs', 'Your patterns, cleared tells and the Index over time'],
  },
  {
    key: 'black' as const,
    name: 'Kleos Black',
    line: 'For the moments that actually matter.',
    perks: ['Everything in Kleos+', 'Rehearse your real situation: describe tomorrow’s date or interview, play it tonight', 'Your Portrait: a deep read of every conversation you’ve had', 'Unlimited Profile Reads, re-read after every change', 'New Daily packs a week early'],
  },
];

const week = () => {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-w${Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)}`;
};

/** The plan comes only from RevenueCat entitlements (free trials are Apple's, inside the subscription). */
export function tierOf(s: { plan: Tier }): Tier {
  return s.plan ?? 'free';
}

export function useTier(): Tier {
  return useStore((s) => tierOf(s));
}

function usageNow() {
  const s = useStore.getState();
  const w = week();
  return s.usage?.week === w ? s.usage : { week: w, calls: 0, clips: 0, poise: 0, profiles: 0 };
}

/** Extra live calls earned through invites. They never expire and are only used once the week's are gone. */
export function bonusCalls(): number {
  const c = useStore.getState().credits ?? { granted: 0, used: 0 };
  return Math.max(0, c.granted - c.used);
}

export function remaining(kind: Metered): number {
  const s = useStore.getState();
  const weekly = Math.max(0, LIMITS[tierOf(s)][kind] - usageNow()[kind]);
  return kind === 'calls' ? weekly + bonusCalls() : weekly;
}

/** Try to use one of a metered feature. Returns false (and nothing is spent) when the week's allowance is gone. */
export function spend(kind: Metered): boolean {
  const s = useStore.getState();
  const u = usageNow();
  if (LIMITS[tierOf(s)][kind] - u[kind] > 0) {
    s.set({ usage: { ...u, [kind]: u[kind] + 1 }, lastSpent: { kind, bonus: false } });
    return true;
  }
  if (kind === 'calls' && bonusCalls() > 0) {
    const c = s.credits ?? { granted: 0, used: 0 };
    s.set({ credits: { ...c, used: c.used + 1 }, lastSpent: { kind, bonus: true } });
    return true;
  }
  return false;
}

/** Give one back (the call failed to start, the upload errored). */
export function refund(kind: Metered) {
  const s = useStore.getState();
  if (kind === 'calls' && s.lastSpent?.kind === 'calls' && s.lastSpent.bonus) {
    const c = s.credits ?? { granted: 0, used: 0 };
    s.set({ credits: { ...c, used: Math.max(0, c.used - 1) }, lastSpent: undefined });
    return;
  }
  const u = usageNow();
  s.set({ usage: { ...u, [kind]: Math.max(0, u[kind] - 1) }, lastSpent: undefined });
}

export const atLeast = (t: Tier, need: Tier) => (need === 'free' ? true : need === 'plus' ? t !== 'free' : t === 'black');


/** Spend one use, or open the paywall explaining why. Returns whether to proceed. */
export function gate(kind: Metered): boolean {
  if (spend(kind)) return true;
  router.push({ pathname: '/paywall', params: { reason: kind } });
  return false;
}

/** Tier gate for whole features (Black-only rehearsals, Plus-only full reads). */
export function requireTier(need: Tier, reason: 'black' | 'read' | 'path' | 'retry'): boolean {
  if (atLeast(tierOf(useStore.getState()), need)) return true;
  router.push({ pathname: '/paywall', params: { reason } });
  return false;
}
