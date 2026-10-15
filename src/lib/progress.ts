import PATH from '../../content/path.json';
import MISSIONS from '../../content/missions.json';
import type { SessionRecord } from '@/state/store';
import type { Evaluation } from '@/lib/types';

export type Unit = (typeof PATH.units)[number];
export type LessonDef = Unit['lessons'][number] & { checkpoint?: boolean };

export const UNITS = PATH.units as Unit[];
export const ALL_MISSIONS = MISSIONS.missions;

export const UNIT_CATEGORY: Record<string, string> = { intro: 'intro', stories: 'group', pushback: 'conflict', dates: 'dating', rooms: 'hosting' };
export const ROMAN = ['', 'I', 'II', 'III'];

export function findLesson(id: string): { unit: Unit; lesson: LessonDef; index: number } | null {
  for (const u of UNITS) {
    const i = u.lessons.findIndex((l) => l.id === id);
    if (i >= 0) return { unit: u, lesson: u.lessons[i] as LessonDef, index: i };
  }
  return null;
}

/** The next lesson: first one without a laurel, in unit order. */
export function nextLesson(laurels: Record<string, number>): { unit: Unit; lesson: LessonDef; index: number } {
  for (const u of UNITS) {
    for (let i = 0; i < u.lessons.length; i++) {
      if (!laurels[u.lessons[i].id]) return { unit: u, lesson: u.lessons[i] as LessonDef, index: i };
    }
  }
  return { unit: UNITS[0], lesson: UNITS[0].lessons[0] as LessonDef, index: 0 };
}

/** Free tier: first two lessons of every unit. */
export function isFreeLesson(index: number) {
  return index < 2;
}

/**
 * Laurel rules (demonstrated, not grinded):
 * I   = completed the lesson with a retry.
 * II  = best take rated 60+.
 * III = 72+ in a later session after already holding II (repeat performance).
 */
export function laurelFor(prev: number, bestRating: number, sameDayAsPrev: boolean): 1 | 2 | 3 {
  if (prev >= 2 && bestRating >= 72 && !sameDayAsPrev) return 3;
  if (bestRating >= 60) return Math.max(2, prev) as 2 | 3;
  return Math.max(1, prev) as 1 | 2 | 3;
}

/** Recurring weak spots from recent sessions, fed into lesson generation. */
export function weakSpots(sessions: SessionRecord[]): string[] {
  const c = { hedges: 0, fillers: 0, apologies: 0, trailing: 0 };
  sessions.slice(0, 6).forEach((s) => {
    const e = s.retry ?? s.evaluation;
    c.hedges += e.counts.hedges;
    c.fillers += e.counts.fillers;
    c.apologies += e.counts.apologies;
    c.trailing += e.counts.ended_clean ? 0 : 1;
  });
  const out: string[] = [];
  if (c.hedges >= 3) out.push('hedging');
  if (c.fillers >= 4) out.push('fillers');
  if (c.apologies >= 1) out.push('apologising');
  if (c.trailing >= 2) out.push('trailing off at the end');
  return out;
}

/** Pattern history: recurring themes across sessions, each with its evidence quotes, so the user can inspect or disagree. */
export type Pattern = { key: string; label: string; count: number; evidence: { quote: string; title: string; createdAt: string }[] };

const PATTERN_RULES: { key: string; label: string; test: (e: Evaluation) => boolean }[] = [
  { key: 'hedge', label: 'Softening the claim before making it', test: (e) => e.counts.hedges >= 2 || /hedg|qualif|soften|i guess|kind of/i.test(e.change.text) },
  { key: 'apology', label: 'Apologising for the answer', test: (e) => e.counts.apologies >= 1 || /apolog|sorry/i.test(e.change.text) },
  { key: 'trail', label: 'Letting the end of the sentence fade', test: (e) => !e.counts.ended_clean || /trail|fade|end on|finish/i.test(e.change.text) },
  { key: 'restart', label: 'Restarting the explanation instead of answering the follow-up', test: (e) => /restart|answer what was asked|different question|sidestep/i.test(e.change.text) },
  { key: 'rush', label: 'Speeding up on the hardest line', test: (e) => e.counts.wpm > 185 || /rush|fast|pace|speed/i.test(e.change.text) || /rush|pace/i.test(e.signal?.measured ?? '') },
  { key: 'noask', label: 'Never asking anything back', test: (e) => /ask(ed)? (anything|a question|back)|never asked/i.test(e.awareness?.evidence ?? '') },
];

export function patterns(sessions: SessionRecord[], dismissed: string[] = []): Pattern[] {
  const out: Pattern[] = [];
  for (const rule of PATTERN_RULES) {
    if (dismissed.includes(rule.key)) continue;
    const ev: Pattern['evidence'] = [];
    for (const s of sessions.slice(0, 12)) {
      const e = s.retry ?? s.evaluation;
      if (!e || e.insufficient) continue;
      if (rule.test(e)) ev.push({ quote: e.change.quote || e.signal?.quote || '', title: s.title, createdAt: s.createdAt });
    }
    if (ev.length >= 2) out.push({ key: rule.key, label: rule.label, count: ev.length, evidence: ev.slice(0, 3) });
  }
  return out.sort((a, b) => b.count - a.count);
}
