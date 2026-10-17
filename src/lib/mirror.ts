/**
 * The Mirror's prompts. One signature prompt every week (the same question, so takes compare like with like),
 * and a few others for when you want a different angle. Kept short: they're answered on camera in 30 seconds.
 */
export type MirrorPrompt = { id: string; text: string; kind: 'weekly' | 'extra' };

export const WEEKLY: MirrorPrompt = { id: 'intro', text: 'Introduce yourself to someone you’d like to impress.', kind: 'weekly' };

export const EXTRA: MirrorPrompt[] = [
  { id: 'trip', text: 'Tell me about the best trip you’ve taken.', kind: 'extra' },
  { id: 'care', text: 'What do you do? Make me care.', kind: 'extra' },
  { id: 'mind', text: 'Tell me something you changed your mind about.', kind: 'extra' },
  { id: 'saturday', text: 'Describe your ideal Saturday.', kind: 'extra' },
  { id: 'disagree', text: 'Disagree with me: “Cities are overrated.”', kind: 'extra' },
  { id: 'ask', text: 'Ask for something you actually want.', kind: 'extra' },
  { id: 'story', text: 'Tell me a story that still makes you laugh.', kind: 'extra' },
];

export const PROMPTS = [WEEKLY, ...EXTRA];

export function promptById(id?: string) {
  return PROMPTS.find((p) => p.id === id) ?? WEEKLY;
}

/** Monday-based week key, so "this week's take" resets on Monday. */
export function weekKey(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export const SECONDS = 30;

export function titleOf(a?: string) {
  if (!a) return '';
  const s = a.replace(/^the\s+/i, '');
  return `The ${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}
