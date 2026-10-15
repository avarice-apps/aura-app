import QUESTS_JSON from '../../content/quests.json';

export type Quest = { id: string; title: string; category: string; partner: string; spicy: boolean; setting: string; opener: string; twist: string; goal: string; focus: string };

export const QUESTS = QUESTS_JSON.quests as Quest[];

export const PARTNER: Record<string, string> = { mara: 'Mara', theo: 'Theo', dev: 'Dev', julian: 'Julian', ines: 'Ines', kai: 'Kai' };

export const QUEST_CATEGORY: Record<string, string> = { dating: 'Dating', approach: 'Approach', money: 'Money', service: 'Out and about', conflict: 'Conflict', friends: 'Friends', status: 'Status' };

/** Quests for the current tone. Spicy ones only appear in Unfiltered. */
export function questsFor(tone: 'real' | 'unfiltered', done: string[] = []) {
  const list = QUESTS.filter((q) => tone === 'unfiltered' || !q.spicy);
  return [...list.filter((q) => !done.includes(q.id)), ...list.filter((q) => done.includes(q.id))];
}
