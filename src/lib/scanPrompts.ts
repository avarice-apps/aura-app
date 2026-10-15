/** Prompts for Aura Scan. 15 seconds, one person, one take. Picked at random so a party never repeats. */
export const SCAN_PROMPTS = [
  'Convince us to come to the thing you’re hosting next.',
  'Tell us about the last time you were completely wrong.',
  'Sell us the worst object in this room.',
  'Introduce yourself to someone you want to impress.',
  'Explain your job to a six-year-old.',
  'Tell the story of your most embarrassing text.',
  'Talk someone out of leaving the party early.',
  'Give a toast for the person on your left.',
  'Defend a food everyone hates.',
  'Describe your morning like it was a heist.',
  'Ask for a raise. We’re your boss. Go.',
  'Tell us one thing you’re genuinely good at. No hedging.',
];

export function randomPrompt(exclude: string[] = []) {
  const pool = SCAN_PROMPTS.filter((p) => !exclude.includes(p));
  return (pool.length ? pool : SCAN_PROMPTS)[Math.floor(Math.random() * (pool.length || SCAN_PROMPTS.length))];
}

export const TIER_LINE: Record<string, string> = {
  Gravity: 'People lean in without knowing why.',
  Magnetic: 'The room reorganises around you.',
  Composed: 'Steady. Nothing leaked.',
  Present: 'You were there. Mostly.',
  Faint: 'We could hear you thinking.',
  Static: 'Signal lost.',
};
