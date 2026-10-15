import FLOORS_JSON from '../../content/floors.json';

export type Floor = { id: string; title: string; blurb: string; category: string; primary: string; setting: string; opener: string; roles: Record<string, string>; beats: string[]; spicy?: boolean };

export const FLOORS = FLOORS_JSON.floors as unknown as Floor[];

/** Open Floor scenes for the current tone. 18+ ones only in Unfiltered. */
export function floorsFor(tone: 'real' | 'unfiltered') {
  return FLOORS.filter((f) => tone === 'unfiltered' || !f.spicy);
}
