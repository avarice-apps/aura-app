import QUESTS_JSON from '../../content/quests.json';
import type { Dates } from '@/state/store';

export type Quest = {
  id: string;
  title: string;
  category: string;
  partner: string;
  spicy: boolean;
  setting: string;
  opener: string;
  twist: string;
  goal: string;
  focus: string;
  persona?: string; // a named stranger played by a cast voice (gets a stranger's face)
  objective?: string;
};

export const QUESTS = QUESTS_JSON.quests as Quest[];

export const PARTNER: Record<string, string> = { mara: 'Mara', theo: 'Theo', dev: 'Dev', julian: 'Julian', ines: 'Ines', kai: 'Kai' };

export const QUEST_CATEGORY: Record<string, string> = {
  dating: 'Dating',
  night: 'Night out',
  approach: 'Approach',
  friends: 'Friends',
  work: 'Work',
  status: 'Status',
  money: 'Money',
  conflict: 'Conflict',
  service: 'Out and about',
};

/** The order rooms appear in Play: the loud ones first. */
export const CATEGORY_ORDER = ['dating', 'night', 'approach', 'friends', 'status', 'work', 'money', 'conflict', 'service'] as const;

/** Mirrors the server (converse.ROMANCE_SWAP): in dating scenes the partner follows who you said you date. */
const CAST_GENDER: Record<string, 'f' | 'm'> = { mara: 'f', ines: 'f', theo: 'm', dev: 'm', julian: 'm', kai: 'm' };
const ROMANCE_SWAP: Record<'f' | 'm', Record<string, string>> = { m: { mara: 'kai', ines: 'theo' }, f: { theo: 'ines', kai: 'mara', dev: 'mara', julian: 'ines' } };

export function partnerFor(q: Pick<Quest, 'partner' | 'category'>, dates?: Dates): string {
  const want = dates === 'women' ? 'f' : dates === 'men' ? 'm' : undefined;
  if (q.category !== 'dating' || !want || CAST_GENDER[q.partner] === want) return q.partner;
  return ROMANCE_SWAP[want][q.partner] ?? q.partner;
}

/** Who you'll be talking to, as the room list and the scene card show it. */
export function withWhom(q: Quest, dates?: Dates): string {
  if (q.persona) return q.persona;
  const p = partnerFor(q, dates);
  return PARTNER[p] ?? p;
}

/** Quests for the current tone. Spicy ones only appear in Unfiltered. */
export function questsFor(tone: 'real' | 'unfiltered', done: string[] = []) {
  const list = QUESTS.filter((q) => tone === 'unfiltered' || !q.spicy);
  return [...list.filter((q) => !done.includes(q.id)), ...list.filter((q) => done.includes(q.id))];
}
