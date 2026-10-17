import type { Occasion } from '@/state/store';

/** Presets for "something coming up". Each knows what Poise should assume until told otherwise. */
export const OCCASIONS: { key: string; label: string; what: string }[] = [
  { key: 'dinner', label: 'Dinner', what: 'Dinner with people I don’t know well' },
  { key: 'date', label: 'A date', what: 'A first date' },
  { key: 'interview', label: 'Interview', what: 'A job interview' },
  { key: 'party', label: 'A party', what: 'A party where I know a few people' },
  { key: 'drinks', label: 'Work drinks', what: 'Drinks with people from work' },
  { key: 'presentation', label: 'Presenting', what: 'A presentation in front of a room' },
  { key: 'parents', label: 'Meeting the parents', what: 'Meeting my partner’s parents' },
  { key: 'night', label: 'Night out', what: 'A big night out' },
  { key: 'conversation', label: 'A hard talk', what: 'A conversation I’ve been putting off' },
];

export const IMPRESSIONS = ['Relaxed', 'Sharp', 'Warm', 'Magnetic', 'Quietly confident', 'Funny'];

const DAY = 86400000;

/** Is the occasion still ahead? Tonight's lasts until tomorrow morning; "later" fades after three weeks. */
export function occasionFresh(o?: Occasion | null): boolean {
  if (!o?.what) return false;
  const age = Date.now() - Date.parse(o.createdAt);
  const made = new Date(o.createdAt);
  const morningAfter = new Date(made.getFullYear(), made.getMonth(), made.getDate() + (o.when === 'tomorrow' ? 2 : 1), 5).getTime();
  if (o.when === 'tonight' || o.when === 'tomorrow') return Date.now() < morningAfter;
  if (o.when === 'week') return age < 8 * DAY;
  return age < 21 * DAY;
}

export function whenLabel(o: Occasion): string {
  return o.when === 'tonight' ? 'Tonight' : o.when === 'tomorrow' ? 'Tomorrow' : o.when === 'week' ? 'This week' : 'Coming up';
}

/** The occasion as Rehearse would hear it from the person: one plain paragraph. */
export function occasionBrief(o: Occasion): string {
  return [o.what, o.who, o.impression ? `I want to come across ${o.impression.toLowerCase()}` : '', o.target ? `The part I want to get right: ${o.target}` : ''].filter(Boolean).join('. ').replace(/\.\./g, '.');
}
