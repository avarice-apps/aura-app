import { router } from 'expo-router';
import { useStore } from '@/state/store';

export type Tier = 'free' | 'plus' | 'black';
export type Metered = 'calls' | 'clips' | 'poise' | 'profiles' | 'fits';

/**
 * What each plan gets per week. The server is the source of truth (it counts per account, so reinstalling resets
 * nothing); these numbers are only used to show the right thing before the server has answered.
 * Live calls on paid plans are counted in minutes with a fair-use ceiling (see LIVE_MINUTES).
 */
export const LIMITS: Record<Tier, Record<Metered, number>> = {
  free: { calls: 2, clips: 1, poise: 3, profiles: 1, fits: 3 },
  plus: { calls: Infinity, clips: 10, poise: 150, profiles: 3, fits: 30 },
  black: { calls: Infinity, clips: 30, poise: 300, profiles: 15, fits: 60 },
};
export const LIVE_MINUTES: Record<Exclude<Tier, 'free'>, number> = { plus: 45, black: 90 };

/** The pitch, used by the paywall and plan screen. */
export const TIERS = [
  {
    key: 'free' as const,
    name: 'Free',
    line: 'Get a taste. Every day.',
    perks: ['The Daily Side Quest, every day', 'The Table, Farm-offs and Debate Duels with friends', '2 live calls a week, with the verdict, the score and Poise’s voice note', '3 Fit checks, 1 clip rating and 1 Profile Read a week'],
  },
  {
    key: 'plus' as const,
    name: 'Kleos+',
    line: 'Train every day. Hear the whole truth.',
    perks: [`Up to ${LIVE_MINUTES.plus} minutes of live calls a week: Open Floor, every side quest, the full Path`, 'Rehearse your real situation: describe tomorrow’s date or interview, play it tonight', 'The full read, and retry the exact moment it turned', 'Fit checks, clip ratings and Poise debriefs, all week', 'Your patterns, cleared tells and the Index over time'],
  },
  {
    key: 'black' as const,
    name: 'Kleos Black',
    line: 'For the moments that actually matter.',
    perks: ['Everything in Kleos+', `Twice the live time: up to ${LIVE_MINUTES.black} minutes a week`, 'Your Wardrobe: scan what you own, get the look for any occasion', 'Your Portrait: a deep read of every conversation you’ve had', 'Profile Reads after every change'],
  },
];

const week = () => {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-w${Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)}`;
};

/** The plan: from the server (which follows RevenueCat), or RevenueCat on the phone while offline. */
export function tierOf(s: { plan: Tier }): Tier {
  return s.plan ?? 'free';
}

export function useTier(): Tier {
  return useStore((s) => tierOf(s));
}

function usageNow() {
  const s = useStore.getState();
  const w = week();
  const base = { week: w, calls: 0, clips: 0, poise: 0, profiles: 0, fits: 0 };
  return s.usage?.week === w ? { ...base, ...s.usage } : base;
}

/** Extra live calls earned through invites. They never expire and are only used once the week's are gone. */
export function bonusCalls(): number {
  const a = useStore.getState().account;
  if (a) return a.credits ?? 0;
  const c = useStore.getState().credits ?? { granted: 0, used: 0 };
  return Math.max(0, c.granted - c.used);
}

/** What's left this week. The server's count when we have it (it can't be reset by reinstalling). */
export function remaining(kind: Metered): number {
  const s = useStore.getState();
  const tier = tierOf(s);
  const a = s.account;
  if (kind === 'calls' && tier !== 'free') return a?.live_min_left === 0 ? 0 : Infinity;
  const server = a?.left?.[kind];
  const weekly = typeof server === 'number' ? Math.max(0, server - pendingUse(kind)) : Math.max(0, LIMITS[tier][kind] - usageNow()[kind]);
  return kind === 'calls' ? weekly + bonusCalls() : weekly;
}

/** Uses spent since the last server sync (so the number on screen drops the moment you start). */
function pendingUse(kind: Metered): number {
  const u = usageNow();
  const base = useStore.getState().account?.week ? (useStore.getState().lastSync?.[kind] ?? 0) : 0;
  return Math.max(0, u[kind] - base);
}

/** Try to use one of a metered feature. Returns false (and nothing is spent) when the week's allowance is gone. */
export function spend(kind: Metered): boolean {
  if (remaining(kind) <= 0) return false;
  const s = useStore.getState();
  const u = usageNow();
  s.set({ usage: { ...u, [kind]: u[kind] + 1 }, lastSpent: { kind, bonus: false } });
  return true;
}

/** Give one back (the call failed to start, the upload errored). The server refunds its own count. */
export function refund(kind: Metered) {
  const s = useStore.getState();
  const u = usageNow();
  s.set({ usage: { ...u, [kind]: Math.max(0, u[kind] - 1) }, lastSpent: undefined });
}

/** After the server reports the account: local counts restart from its numbers. */
/** Kept for callers that sync by hand. */
export function syncedUsage() {
  const s = useStore.getState();
  const u = usageNow();
  s.set({ lastSync: { calls: u.calls, clips: u.clips, poise: u.poise, profiles: u.profiles, fits: u.fits ?? 0 } });
}

export const atLeast = (t: Tier, need: Tier) => (need === 'free' ? true : need === 'plus' ? t !== 'free' : t === 'black');

/** Spend one use, or open the paywall explaining why. Returns whether to proceed. */
export function gate(kind: Metered): boolean {
  if (spend(kind)) return true;
  const tier = tierOf(useStore.getState());
  router.push({ pathname: '/paywall', params: { reason: kind === 'calls' && tier !== 'free' ? 'minutes' : kind } });
  return false;
}

/** Tier gate for whole features (Black-only wardrobe and Portrait, Plus-only Rehearse and retries). */
export function requireTier(need: Tier, reason: 'black' | 'read' | 'path' | 'retry' | 'wardrobe' | 'rehearse'): boolean {
  if (atLeast(tierOf(useStore.getState()), need)) return true;
  router.push({ pathname: '/paywall', params: { reason } });
  return false;
}
