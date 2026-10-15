import DAILIES_JSON from '../../content/dailies.json';

export type Daily = { id: string; title: string; category: string; spicy?: boolean; persona: { name: string; voice: string; style: string; behaviour: string }; setting: string; opener: string; roles: Record<string, string>; beats: string[] };

export const DAILIES = DAILIES_JSON.dailies as unknown as Daily[];

export const today = () => new Date().toISOString().slice(0, 10);

/** Today's surprise. Same for everyone on a given day (so people can compare), different every day. */
export function dailyFor(tone: 'real' | 'unfiltered', day = today()) {
  const pool = DAILIES.filter((d) => tone === 'unfiltered' || !d.spicy);
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}
