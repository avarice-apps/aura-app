import { API_URL, OFFLINE } from './config';
import type { BuiltFit, DraftRead, Duel, Evaluation, FitRead, Lesson, Moment, ProfileRead, Receipt, ScanResult, SessionStart, ShotMessage, StyleProfile, StyleRead, Swatch, TurnResult, WardrobeItem } from './types';
import { useReads, pickDetail } from './reads';
import { useStore, type Goal, type Account } from '@/state/store';
import { File, Directory, Paths } from 'expo-file-system';
import { QUESTS } from './quests';
import { router } from 'expo-router';
import { authHeaders, dropToken, adopt, refreshAccount } from './session';

const tone = () => useStore.getState().tone ?? 'real';

/** What the player told us about themselves: how characters refer to them, and who they date. */
export function userPrefs() {
  const s = useStore.getState();
  return { pronoun: s.pronoun ?? 'they', dates: s.dates ?? null, name: s.name || '' };
}

/** The upcoming occasion, in one line, for Poise and the scene builder. */
export function occasionLine(): string | undefined {
  const o = useStore.getState().occasion;
  if (!o?.what) return undefined;
  const when = o.when === 'tonight' ? 'tonight' : o.when === 'tomorrow' ? 'tomorrow' : o.when === 'week' ? 'this week' : '';
  return [o.what + (when ? ` (${when})` : ''), o.who, o.impression && `wants to come across ${o.impression.toLowerCase()}`, o.target && `wants to get this right: ${o.target}`].filter(Boolean).join('; ');
}

/** A small summary of his last calls, so characters test his real weak spots and Poise remembers. */
function profile() {
  try {
    const evs = (useStore.getState().sessions ?? [])
      .map((r) => r.evaluation)
      .filter((e) => e && !e.insufficient && typeof e.rating === 'number' && e.axes)
      .slice(0, 8);
    const occasion = occasionLine();
    if (!evs.length) return occasion ? { calls: 0, avg_rating: 50, occasion } : undefined;
    const avg = Math.round(evs.reduce((n, e) => n + e.rating, 0) / evs.length);
    const keys = ['voice', 'command', 'composure', 'awareness', 'landed'] as const;
    const mean = (k: (typeof keys)[number]) => {
      const v = evs.map((e) => (e.axes as any)[k]).filter((x) => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 100;
    };
    const weakest = keys.reduce((w, k) => (mean(k) < mean(w) ? k : w), keys[0]);
    // axes the read couldn't measure come back as null; mean() skips them
    const counts: Record<string, number> = {};
    evs.forEach((e) => e.archetype && (counts[e.archetype] = (counts[e.archetype] ?? 0) + 1));
    const archetype = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ?? '';
    const recent_changes = evs.slice(0, 3).map((e) => e.change?.text).filter(Boolean);
    const now = Date.now();
    const met = Object.fromEntries(
      Object.entries(useStore.getState().met ?? {})
        .sort((a, b) => b[1].at.localeCompare(a[1].at))
        .slice(0, 12)
        .map(([name, m]) => [name, { note: m.note, days: Math.max(0, Math.floor((now - Date.parse(m.at)) / 86400000)) }]),
    );
    return { calls: evs.length, avg_rating: avg, weakest, recent_changes, archetype, met, occasion };
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ offline demo
// Real voices, pre-rendered. Lets the whole app be walked through before the server is deployed.

export const DEMO_AUDIO = {
  open_work: require('../../assets/demo/open_work.mp3'),
  open_dates: require('../../assets/demo/open_dates.mp3'),
  open_rooms: require('../../assets/demo/open_rooms.mp3'),
  open_ground: require('../../assets/demo/open_ground.mp3'),
  r1_work: require('../../assets/demo/r1_work.mp3'),
  r1_dates: require('../../assets/demo/r1_dates.mp3'),
  r1_rooms: require('../../assets/demo/r1_rooms.mp3'),
  r1_ground: require('../../assets/demo/r1_ground.mp3'),
  r2_any: require('../../assets/demo/r2_any.mp3'),
  poise_1: require('../../assets/demo/poise_1.mp3'),
  poise_2: require('../../assets/demo/poise_2.mp3'),
  poise_receipt: require('../../assets/demo/poise_receipt.mp3'),
} as const;

export type AudioSrc = string | number | undefined;

const DEMO_SCENES: Record<Goal, { character: SessionStart['character']; setting: string; opener: string; goal: string; r1: string }> = {
  work: { character: { id: 'julian', name: 'Julian', style: 'Reserved and senior', behaviour: 'Short answers, long pauses.', voice: '' }, setting: 'A job interview. First question.', opener: 'Tell me a little about yourself.', goal: 'Lead with one specific thing, then stop.', r1: 'Which part of that actually holds your attention?' },
  dates: { character: { id: 'mara', name: 'Mara', style: 'Warm and curious', behaviour: 'Asks follow-ups, goes quiet if you ramble.', voice: '' }, setting: 'A first date at a small wine bar.', opener: 'Okay, so outside of work or school, what do you actually enjoy?', goal: 'Make one thing sound alive, then turn it back to her.', r1: "Wait, say more. What's the part you actually love about it?" },
  rooms: { character: { id: 'dev', name: 'Dev', style: 'The talker', behaviour: 'Fills silence, interrupts warmly.', voice: '' }, setting: 'A house party. You walk up to a group mid-conversation.', opener: 'Hey, we were just arguing about the best bad movie. Who are you here with?', goal: 'Join without taking over. One line about you, one question back.', r1: "Okay, okay. And what's your pick, then?" },
  ground: { character: { id: 'dev', name: 'Dev', style: 'The talker', behaviour: 'Pushes once, warmly.', voice: '' }, setting: "A friend calls asking a favour you can't do.", opener: "Hey, any chance you can help me move this Saturday? It's like four hours, tops.", goal: 'Say no once, kindly, without over-explaining.', r1: "Come on, it's literally one morning. You're the only one with a car." },
};

let demo: { goal: Goal; attempt: number; turns: number } = { goal: 'work', attempt: 1, turns: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_EVAL_1: Evaluation = {
  rating: 47,
  axes: { voice: 24, command: 51, composure: 68, awareness: 56 },
  archetype: 'The Hedge',
  archetype_line: 'Good material, wrapped in three layers of disclaimer.',
  strengths: [
    { text: 'You started within a second and put a concrete fact first. They had something solid to work with.', turn: 1 },
    { text: 'Your second answer named something specific. That was your strongest line, and it earned a sharper follow-up.', turn: 2 },
  ],
  change: { text: 'End on the content, not a verdict on it. You closed by calling your own answer scattered, which hid the good detail.', turn: 1, quote: "Sorry. It's a bit all over the place." },
  hint: 'Pick the single most interesting thing, say it in one plain sentence, and stop. Skip the "I guess" before it and the apology after it.',
  example: "I study how political movements recruit people online.",
  alternatives: [
    { style: 'Brief and firm', line: "I'm a senior in history and political science. I've done market intelligence work on political movements." },
    { style: 'Calm and explanatory', line: 'I study history and politics, and the part I like most is the research. I got to do it for real on a consulting project about political movements.' },
  ],
  signal: { text: 'The apology landed exactly where your pace spiked. Your voice faded on the interesting part, then you said sorry and rushed the last clause. The listener hears the content trail off and the self-correction speed past.', turn: 1, quote: "Sorry. It's a bit all over the place.", measured: 'fade at 9.2s, apology at 9.6s, 231 wpm on the last sentence' },
  turning_point: { turn: 2, quote: 'I did some consulting, like market intelligence, I guess, on political movements.', what_changed: 'Julian had been unsure where you stood. The consulting detail gave him the first substance, and his interest rose even though you hedged it. He went from asking about your interests to asking what you actually did.' },
  awareness: { score: 56, evidence: 'You answered what was asked, but never asked anything back.' },
  compare: null,
  script: 'You had a good answer and talked over it. The specific thing was interesting, and they went straight to it. The hedges and the apology told them to doubt it. Say one concrete thing, in a plain sentence, then stop.',
  counts: { fillers: 4, hedges: 4, apologies: 1, ended_clean: false, talk_s: 18.4, wpm: 181 },
  turns: [],
  trace: [
    { turn: 0, interest: 40, trust: 45, thought: null },
    { turn: 1, interest: 36, trust: 40, thought: "Vague, trailing off, 'I guess' twice. I need specifics before I believe him." },
    { turn: 2, interest: 38, trust: 42, thought: 'Something real in there. He keeps burying it.' },
  ],
};

const DEMO_EVAL_2: Evaluation = {
  ...DEMO_EVAL_1,
  rating: 64,
  axes: { voice: 58, command: 70, composure: 72, awareness: 55 },
  archetype: 'The Understated',
  archetype_line: 'Clean delivery. Still saving the substance.',
  strengths: [
    { text: 'Your first line was one specific sentence, with no hedge in front of it.', turn: 1 },
    { text: 'Zero fillers, zero apologies, and you ended on a full stop.', turn: 2 },
  ],
  change: { text: 'They asked a direct question and you answered a different one. Answer what was asked first, then connect it to you.', turn: 2, quote: 'The part I liked most was finding the pattern.' },
  compare: 'Mixed, honestly. Delivery improved a lot: fillers 4 to 0, hedges 4 to 0, the apology is gone, and you ended cleanly. Content is only half better: your second answer still sidestepped the question.',
  alternatives: [
    { style: 'Warm and direct', line: 'Finding the pattern. The clients wanted to know who was recruiting whom, and I could show them.' },
    { style: 'Brief and firm', line: 'Who was recruiting whom. That was the question, and I answered it.' },
  ],
  signal: { text: 'Your pace jumped on the hardest claim. The sentence about finding the pattern ran at 210 words a minute while everything else sat around 170. Fast on the important line reads as wanting to get past it.', turn: 2, quote: 'The part I liked most was finding the pattern.', measured: 'rush at 6.4s, 210 wpm vs 168 median' },
  turning_point: { turn: 1, quote: 'I study how political movements recruit people online.', what_changed: 'One specific sentence, finished. Julian’s interest went from 40 to 58 and he dropped the polite questions for a real one.' },
  script: 'Mixed, honestly. Your delivery cleaned up completely. No fillers, no hedges, no apology, and you ended on a full stop. The content is only half there. Next time, answer the exact question first, then connect it to you.',
  counts: { fillers: 0, hedges: 0, apologies: 0, ended_clean: true, talk_s: 17.1, wpm: 186 },
  trace: [
    { turn: 0, interest: 40, trust: 45, thought: null },
    { turn: 1, interest: 58, trust: 60, thought: 'Specific, clean, and finished. Now I actually want to hear the answer.' },
    { turn: 2, interest: 60, trust: 58, thought: 'Good answer, but he rushed it. I want to see how he handles being wrong.' },
  ],
  delta: 17,
  prev_counts: DEMO_EVAL_1.counts,
  prev_rating: 47,
};

// ------------------------------------------------------------------ helpers

/** Out of allowance, or a feature the plan doesn't include. The paywall opens with the right headline. */
export class PlanError extends Error {
  reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.name = 'PlanError';
    this.reason = reason;
  }
}

const PAYWALL_REASON: Record<string, string> = { minutes: 'minutes', calls: 'calls', daily: 'calls', clips: 'clips', poise: 'poise', profiles: 'profiles', fits: 'fits', wardrobe: 'wardrobe', portrait: 'black', rehearse: 'rehearse', retry: 'retry', direct: 'direct', duels: 'plan' };

function onPlanError(body: any): PlanError {
  const reason = String(body?.reason ?? 'plan');
  try {
    router.push({ pathname: '/paywall', params: { reason: PAYWALL_REASON[reason] ?? 'plan' } });
  } catch {}
  refreshAccount().catch(() => {});
  return new PlanError(body?.detail ?? 'That’s part of a plan.', reason);
}

/** Any call to our server: auth header, one quiet retry with a fresh guest if the token is gone, paywall on 402. */
async function call(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...(await authHeaders()) };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && !retried) {
    await dropToken();
    return call(path, init, true);
  }
  return res;
}

async function failure(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 402) return onPlanError(body);
  if (res.status === 429) return new Error(body?.detail ?? 'Slow down a little. Try again in a few minutes.');
  return new Error(body?.detail ?? `Request failed (${res.status})`);
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await failure(res);
  return res.json();
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await call(path);
  if (!res.ok) throw await failure(res);
  return res.json();
}

/**
 * Multipart uploads go through XMLHttpRequest, not fetch. Expo installs expo/fetch as the global fetch,
 * and it rejects React Native file parts ({ uri, name, type }) with "Unsupported FormDataPart implementation".
 * RN's XHR streams those file parts natively on iOS and Android.
 */
async function postForm<T>(path: string, form: FormData, timeoutMs = 120000, retried = false): Promise<T> {
  const headers = await authHeaders();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = timeoutMs;
    xhr.responseType = 'text';
    xhr.onload = async () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (xhr.status === 401 && !retried) {
        await dropToken();
        postForm<T>(path, form, timeoutMs, true).then(resolve, reject);
      } else if (xhr.status === 402) reject(onPlanError(body));
      else reject(new Error(body?.detail ?? `Request failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error. Check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The server took too long. Try again.'));
    xhr.send(form);
  });
}

/** React Native file part. Sent via XHR (see postForm). */
function fileField(uri: string, name: string, type: string) {
  return { uri, name, type } as unknown as Blob;
}

// ------------------------------------------------------------------ conversations

export type StartArgs = { goal?: Goal; room_id?: string; lesson?: Lesson; floor_id?: string; daily_id?: string; pressure?: number; attempt_of?: string; max_turns?: number; poise?: boolean; resume?: { session: string; turn: number } };

export async function startSession(a: StartArgs): Promise<SessionStart & { openerAudio: AudioSrc }> {
  if (OFFLINE) {
    const g = a.goal ?? demo.goal;
    demo = { goal: g, attempt: a.attempt_of ? 2 : 1, turns: 0 };
    const sc = DEMO_SCENES[g];
    await sleep(400);
    const q = a.room_id ? QUESTS.find((x) => x.id === a.room_id) : undefined;
    const lessonScene = a.lesson ? { setting: a.lesson.setting, opener: a.lesson.opener, goal: a.lesson.goal } : q ? { setting: q.setting, opener: q.opener, goal: q.goal } : null;
    return { session_id: `demo_${Date.now()}`, character: sc.character, setting: lessonScene?.setting ?? sc.setting, goal: lessonScene?.goal ?? sc.goal, opener: lessonScene?.opener ?? sc.opener, max_turns: 2, pressure: a.pressure ?? 1, openerAudio: lessonScene ? undefined : DEMO_AUDIO[`open_${g}` as keyof typeof DEMO_AUDIO] };
  }
  const r = await postJSON<SessionStart>('/session/start', { ...a, tone: tone(), profile: a.goal ? undefined : profile(), user: userPrefs() });
  return { ...r, openerAudio: r.opener_audio };
}

export async function sendTurn(sessionId: string, uri: string, interrupted = false): Promise<TurnResult & { replyAudio: AudioSrc }> {
  if (OFFLINE) {
    demo.turns += 1;
    await sleep(1400);
    const sc = DEMO_SCENES[demo.goal];
    const first = demo.turns === 1;
    const reply = first ? sc.r1 : "Okay. That's clearer.";
    return {
      user_text: demo.attempt === 1 ? (first ? "So, yeah, um, I guess I'm kind of into research stuff? Sorry, it's a bit all over the place." : 'I mean, I did some consulting, I guess. It was cool. Yeah.') : first ? 'I study how political movements recruit people online.' : 'The part I liked most was finding the pattern before anyone else did.',
      facts: { duration_s: 9, wpm: 180, filler_count: demo.attempt === 1 ? 2 : 0, hedge_count: demo.attempt === 1 ? 2 : 0, apology_count: demo.attempt === 1 && first ? 1 : 0, first_word_s: 0.8, ended_mid_sentence: false },
      reply,
      done: demo.turns >= 2,
      turn: demo.turns,
      interest: demo.attempt === 1 ? (first ? 36 : 38) : first ? 58 : 60,
      trust: demo.attempt === 1 ? (first ? 40 : 42) : first ? 60 : 58,
      replyAudio: first ? DEMO_AUDIO[`r1_${demo.goal}` as keyof typeof DEMO_AUDIO] : DEMO_AUDIO.r2_any,
    };
  }
  const form = new FormData();
  form.append('audio', fileField(uri, 'turn.m4a', 'audio/m4a'));
  form.append('interrupted', interrupted ? '1' : '0');
  const r = await postForm<TurnResult>(`/session/${sessionId}/turn`, form);
  return { ...r, replyAudio: r.reply_audio };
}

export async function evaluateSession(sessionId: string): Promise<Evaluation & { scriptAudio: AudioSrc }> {
  if (OFFLINE) {
    await sleep(1800);
    const e = demo.attempt === 1 ? DEMO_EVAL_1 : DEMO_EVAL_2;
    return { ...e, scriptAudio: demo.attempt === 1 ? DEMO_AUDIO.poise_1 : DEMO_AUDIO.poise_2 };
  }
  const r = await withTimeout(postJSON<Evaluation>(`/session/${sessionId}/evaluate`, {}), 45000);
  followDetail(sessionId, r);
  return { ...r, scriptAudio: r.script_audio };
}

export async function generateLesson(a: { unit: string; unit_id?: string; objective: string; weak: string[]; avoid: string[]; pressure: number }): Promise<Lesson> {
  if (OFFLINE) {
    await sleep(600);
    return { character: 'dev', setting: 'At a coworking desk on a Thursday afternoon.', opener: "Hey, quick favour: can you cover my Friday 4pm client call? I'd totally owe you.", twist: 'He says it’s only thirty minutes and asks if you’re really that busy.', goal: a.objective, hint: 'Lead with your answer, give at most one reason, then pause.' };
  }
  return postJSON<Lesson>('/lesson', { ...a, tone: tone(), user: userPrefs() });
}

// ------------------------------------------------------------------ receipts

export async function makeReceipt(a: { text?: string; audioUri?: string; context?: string }): Promise<Receipt & { audio?: AudioSrc }> {
  if (OFFLINE) {
    await sleep(1500);
    return {
      title: 'Dinner, Friday',
      lines: [
        { text: 'Asked the quiet guy what he was working on', points: 60 },
        { text: 'Listened and kept that conversation going', points: 40 },
        { text: 'Long internship story to the whole table', points: -20 },
        { text: 'Someone changed the subject mid-story', points: -10 },
        { text: 'Went quiet for the rest of the night', points: -90 },
      ],
      total: -20,
      headline: "The story wasn't the costly part. Disappearing after it was.",
      next_time: 'If a story gets cut off, let it go with a smile, then ask someone a question within a minute.',
      drill: 'A 30-second version of one story that ends with a question to the listener.',
      said_instead: "Anyway, that's the short version. What's the most chaotic job any of you have had?",
      scene: { character: 'dev', setting: 'Dinner with friends. You are mid-story when someone starts a new topic.', opener: 'Wait, sorry, did anyone else see the game last night?', goal: 'Let the story go gracefully and stay in the conversation.' },
      receipt_no: String(Math.floor(Math.random() * 9000) + 1000),
      story: a.text ?? '(voice)',
      audio: DEMO_AUDIO.poise_receipt,
    };
  }
  const form = new FormData();
  if (a.text) form.append('text', a.text);
  // Something coming up is context for every chat with Poise, not just the occasion screens.
  const coming = occasionLine();
  const ctx = [a.context, coming ? `Coming up for them: ${coming}` : ''].filter(Boolean).join('\n');
  if (ctx) form.append('context', ctx);
  form.append('tone', tone());
  form.append('user', JSON.stringify(userPrefs()));
  if (a.audioUri) form.append('audio', fileField(a.audioUri, 'story.m4a', 'audio/m4a'));
  return postForm<Receipt>('/ledger', form);
}

// ------------------------------------------------------------------ before I send this

export type DraftAsk = { draft: string; convo?: ShotMessage[]; to?: string; intent?: string; outcome?: string };

export async function draftReview(a: DraftAsk): Promise<DraftRead> {
  if (OFFLINE) {
    await sleep(900);
    return { mode: a.draft ? 'review' : 'reply', assumptions: [], reads: 'Clear, and easy to answer. It asks one thing.', keep: 'The question at the end.', change: null, send_as_is: true, observations: [], preserve: [], alternatives: [{ label: 'As written', text: a.draft || 'sounds good, see you then' }, { label: 'Lighter', text: (a.draft || 'sounds good').replace(/\?$/, '') + '?' }], next: 'Send it.' };
  }
  return postJSON<DraftRead>('/poise/draft', { ...a, tone: tone(), user: userPrefs() });
}

/** A screenshot of a conversation, read into who said what. The image is not kept anywhere. */
export async function readShot(uri: string): Promise<{ messages: ShotMessage[]; confirm: boolean; note?: string | null; app?: string | null }> {
  const form = new FormData();
  form.append('image', fileField(uri, 'shot.jpg', 'image/jpeg'));
  return postForm('/poise/draft/extract', form, 60000);
}

// ------------------------------------------------------------------ tribunals

export type TribunalFormat = 'settle' | 'tribunal' | 'common';
export type TribunalSeat = 'a' | 'b';
export type TribunalResult = {
  outcome: 'a' | 'b' | 'draw' | 'insufficient' | 'none' | 'declined';
  winner: string | null;
  margin: 'clear' | 'close' | null;
  split: boolean;
  verdict: string;
  theatre: string | null;
  observations: Partial<Record<TribunalSeat, { id: string; quote: string; note: string; kind: string }>>;
  decisive: { id: string; seat: TribunalSeat; quote: string; why: string } | null;
  unverified: { id: string; seat: TribunalSeat; claim: string }[];
  common: { needs: Record<TribunalSeat, string>; disputed: string[]; agreed: string[]; next_steps: string[] } | null;
  delivery: string;
  declined_reason: string | null;
  rubric_version: string;
  note: string;
};
export type Tribunal = {
  code: string;
  format: TribunalFormat;
  topic: string;
  tone: 'real' | 'unfiltered';
  state: 'open' | 'openings' | 'rebuttals' | 'judging' | 'done' | 'expired' | 'abandoned';
  limits: { opening: number; rebuttal: number };
  expires: number | null;
  seats: Partial<Record<TribunalSeat, { name: string; side: string; left: boolean }>>;
  audience: number;
  watchers: boolean;
  rules: { what: string; flow: string; who_sees: string; kept: string; fair: string };
  me: { seat: TribunalSeat | 'audience'; host: boolean; submitted: string[] } | null;
  submissions?: { id: string; seat: TribunalSeat; kind: 'opening' | 'rebuttal'; text: string; words: number }[];
  waiting_for?: TribunalSeat[];
  result?: TribunalResult;
};

export async function tribunalCreate(a: { format: TribunalFormat; topic: string; name: string; side?: string; watchers?: boolean }): Promise<Tribunal> {
  return postJSON<Tribunal>('/tribunal', { ...a, tone: tone() });
}
export async function tribunalGet(code: string): Promise<Tribunal> {
  return getJSON<Tribunal>(`/tribunal/${encodeURIComponent(code.toUpperCase())}`);
}
export async function tribunalJoin(code: string, a: { name: string; side?: string; seat?: 'b' | 'audience' }): Promise<Tribunal> {
  return postJSON<Tribunal>(`/tribunal/${encodeURIComponent(code)}/join`, { ...a, accept: true });
}
export async function tribunalSubmit(code: string, kind: 'opening' | 'rebuttal', text: string): Promise<Tribunal> {
  return postJSON<Tribunal>(`/tribunal/${encodeURIComponent(code)}/submit`, { kind, text });
}
export async function tribunalAction(code: string, action: 'judge' | 'leave' | 'rematch' | 'report', body: Record<string, unknown> = {}): Promise<any> {
  return postJSON(`/tribunal/${encodeURIComponent(code)}/${action}`, body);
}

// ------------------------------------------------------------------ Poise Direct (Black)

export type DirectStatus = { enabled: boolean; channel: 'sms' | 'imessage' | null; number: string | null; linked: boolean; linked_at: number | null; allow: { occasion: boolean; style: boolean }; black: boolean };

export async function directStatus(): Promise<DirectStatus | null> {
  if (OFFLINE) return null;
  try {
    return await getJSON<DirectStatus>('/direct/status');
  } catch {
    return null;
  }
}
export async function directLink(): Promise<{ code: string; text: string; to: string; sms: string | null; expires_in: number }> {
  return postJSON('/direct/link', {});
}
export async function directUnlink(): Promise<DirectStatus> {
  return postJSON('/direct/unlink', {});
}
export async function directContext(body: { allow: { occasion: boolean; style: boolean }; occasion?: string; style?: string }): Promise<DirectStatus> {
  return postJSON('/direct/context', body);
}
export async function directHistory(): Promise<{ role: 'user' | 'poise'; text: string; created: number }[]> {
  return (await getJSON<{ messages: { role: 'user' | 'poise'; text: string; created: number }[] }>('/direct/history')).messages;
}
export async function directClearHistory(): Promise<void> {
  await postJSON('/direct/history/delete', {});
}

// ------------------------------------------------------------------ scan

export async function scan(a: { videoUri: string; prompt: string; consent: boolean; isSelf: boolean; name: string }): Promise<ScanResult> {
  if (OFFLINE) {
    await sleep(2200);
    const score = 58 + Math.round(Math.random() * 30);
    const tiers: [number, string][] = [[90, 'Gravity'], [75, 'Magnetic'], [60, 'Composed'], [45, 'Present'], [30, 'Faint'], [0, 'Static']];
    return {
      score,
      tier: tiers.find(([m]) => score >= m)![1],
      axes: { delivery: score + 4, composure: score - 3, command: score + 2, posture: score - 5 },
      name: a.name,
      transcript: '',
      counts: { fillers: Math.round(Math.random() * 4), hedges: Math.round(Math.random() * 3), wpm: 140 + Math.round(Math.random() * 40) },
      archetype: ['The Closer', 'The Quiet Authority', 'The Storyteller', 'The Wildcard'][Math.floor(Math.random() * 4)],
      best_moment: 'The pause right before the punchline.',
      roast: 'Strong open. Then you thanked us for listening. We were.',
      prompt: a.prompt,
    };
  }
  const form = new FormData();
  form.append('video', fileField(a.videoUri, 'scan.mp4', 'video/mp4'));
  form.append('prompt_text', a.prompt);
  form.append('subject_consent', a.consent ? '1' : '0');
  form.append('is_self', a.isSelf ? '1' : '0');
  form.append('name', a.name);
  form.append('render', '1'); // the rated video renders in the background while the card shows
  const r = await postForm<ScanResult>('/scan', form);
  return { ...r, prompt: a.prompt };
}

// ------------------------------------------------------------------ situations: "what everyone picked"

export async function situationStats(id: string): Promise<{ n: number; counts: number[] } | null> {
  if (OFFLINE) return null;
  try {
    const res = await fetch(`${API_URL}/situations/${id}/stats`);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export async function recordSituationAnswer(id: string, choice: number) {
  if (OFFLINE) return;
  try {
    await postJSON(`/situations/${id}/answer`, { choice });
  } catch {}
}

// ------------------------------------------------------------------ training consent

/** "Delete everything": this account's duels, invites and training clips on the server. */
export async function deleteServerData(): Promise<void> {
  if (OFFLINE) return;
  await postJSON('/privacy/delete', {});
}

export async function withdrawTraining(): Promise<number> {
  if (OFFLINE) return 0;
  try {
    const r = await postJSON<{ removed: number }>('/train/withdraw', {});
    return r.removed;
  } catch {
    return 0;
  }
}

/** The training opt-in, recorded on the server (clips are only ever kept for accounts that opted in). */
export async function setTrainingConsent(on: boolean): Promise<void> {
  if (OFFLINE) return;
  try {
    await postJSON('/train/consent', { on });
  } catch {}
}

// ------------------------------------------------------------------ live (full-duplex) conversations

export type LiveStart = SessionStart & { agent_id: string; conversation_token: string; overrides: any; speakers?: { name: string; role: string }[] };

export async function liveStart(a: StartArgs): Promise<LiveStart> {
  return postJSON<LiveStart>('/live/start', { ...a, tone: tone(), profile: a.goal ? undefined : profile(), user: userPrefs() });
}

export async function liveState(sessionId: string): Promise<{ done: boolean; leaving?: boolean; turns: number; interest: number | null; trust: number | null }> {
  const r = await call(`/live/${sessionId}/state`);
  if (!r.ok) throw new Error('state');
  return r.json();
}

/** A call where the mic delivered nothing: what the native audio engine reported, for the server log. */
export function reportMic(sessionId: string, diag: Record<string, unknown>) {
  call(`/live/${sessionId}/mic`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(diag) }).catch(() => {});
}

export async function liveFinish(sessionId: string, conversationId: string, frames = false): Promise<Evaluation & { scriptAudio: AudioSrc }> {
  // The quick read comes back in a few seconds; if the server is still busy it says so and we poll.
  // `frames`: camera stills are on their way. Never waits more than 90 seconds in all.
  let e = await withTimeout(postJSON<Evaluation & { script_audio?: string; pending?: boolean }>(`/live/${sessionId}/finish`, { conversation_id: conversationId, frames }), 40000);
  const until = Date.now() + 90000;
  while (e.pending && Date.now() < until) {
    await sleep(1000);
    const r = await withTimeout(call(`/live/${sessionId}/result`), 15000);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail ?? 'Poise could not read that one.');
    e = await r.json();
  }
  if (e.pending) throw new Error('That read is taking too long. Try it again.');
  followDetail(sessionId, e);
  return { ...e, scriptAudio: e.script_audio };
}

/** A request that never answers would leave the screen waiting forever: give up and let them retry. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('That took too long. Check your connection and try again.')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (x) => { clearTimeout(t); reject(x); });
  });
}

/** The read's second half (evidence, alternatives, signal, turning point) is written after the quick read. */
function followDetail(sessionId: string, e: any) {
  if (!e?.detail_pending) return;
  (async () => {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      await sleep(1500);
      try {
        const r = await call(`/live/${sessionId}/result`);
        if (!r.ok) return;
        const full = await r.json();
        if (!full?.detail_pending) {
          const d = pickDetail(full);
          useReads.getState().put(sessionId, d);
          // The saved copy of this call gets the full read too, so it's complete in history.
          const st = useStore.getState();
          if (st.sessions.some((x) => x.evaluation?.session_id === sessionId)) {
            st.set({ sessions: st.sessions.map((x) => (x.evaluation?.session_id === sessionId ? { ...x, evaluation: { ...x.evaluation, ...d } } : x)) });
          }
          return;
        }
      } catch {}
    }
  })();
}

// ------------------------------------------------------------------ rate a clip / profile read

export async function rateMoment(a: { videoUri: string; note?: string; render?: boolean }): Promise<Moment> {
  if (OFFLINE) {
    await sleep(1800);
    return {
      title: 'The fumbled toast',
      verdict: 'Strong open, then he read his notes off his phone for a full minute.',
      lines: [
        { t: '0:02', text: 'Stands up, taps the glass, room goes quiet', points: 120 },
        { t: '0:09', text: 'Pulls out his phone to read the speech', points: -200 },
        { t: '0:21', text: 'Inside joke nobody else gets', points: -150 },
        { t: '0:34', text: 'Lands the last line, looks at the couple', points: 90 },
      ],
      total: -140,
      tier: 'Aura debt',
      caption: 'Opened like a best man, closed like a PowerPoint.',
      what_to_do: 'Memorise three lines, look at the couple, sit down.',
      said_instead: 'I’ll keep it short, because they’ve waited long enough. To the two of you.',
    };
  }
  const form = new FormData();
  form.append('video', fileField(a.videoUri, 'clip.mp4', 'video/mp4'));
  if (a.note) form.append('note', a.note);
  form.append('tone', tone());
  if (a.render) form.append('render', '1'); // the rated video renders in the background while the result shows
  return postForm<Moment>('/moment', form, 180000);
}

/** Fit check: one outfit photo. Not stored on the server. */
export async function readFit(uri: string): Promise<FitRead> {
  if (OFFLINE) {
    await sleep(1600);
    return {
      score: 54,
      tier: 'Mall default',
      lane: 'smart casual',
      verdict: 'Every piece fine, nothing chosen.',
      roast: 'The chinos are long enough to have their own postcode.',
      pieces: [
        { item: 'Shirt', score: 61, note: 'Good colour, but the shoulder seam hangs past the shoulder.' },
        { item: 'Trousers', score: 42, note: 'Pooling at the shoe. Two inches too long.' },
        { item: 'Shoes', score: 58, note: 'Clean, but too chunky for the rest of it.' },
      ],
      works: ['Navy and white is a palette that never fails.'],
      fixes: ['Take the trousers up two inches.', 'Size down the shirt or have the shoulders taken in.', 'Swap the trainers for a slim white leather pair.'],
      colouring: { undertone: 'warm', contrast: 'medium', read: 'Warm undertone, brown hair and eyes: medium contrast.', wear: [{ name: 'Olive', hex: '#5B6236' }, { name: 'Camel', hex: '#B5895A' }, { name: 'Cream', hex: '#EFE6D2' }, { name: 'Navy', hex: '#1F2A44' }, { name: 'Rust', hex: '#A0522D' }], avoid: [{ name: 'Icy grey', hex: '#D7DEE5' }, { name: 'Fuchsia', hex: '#D0368A' }, { name: 'Stark black', hex: '#0A0A0A' }] },
      buy: [{ piece: 'Slim white leather sneakers', why: 'Lighter shoe for a lighter outfit.' }],
    };
  }
  const form = new FormData();
  form.append('photos', fileField(uri, 'fit.jpg', 'image/jpeg'));
  form.append('tone', tone());
  const lane = useStore.getState().styleLane;
  if (lane) form.append('lane', lane);
  return postForm<FitRead>('/fit', form, 90000);
}

/** The style quiz → his path to aura. */
export async function readStyle(p: StyleProfile): Promise<StyleRead> {
  if (OFFLINE) {
    await sleep(1200);
    return { signature: 'Clean streetwear', read: 'You own the right colours and too many of the same piece. Your fits stall at the silhouette.', principles: ['One hero piece per fit.', 'Heavyweight blanks, never thin tees.', 'Sneakers chosen like jewellery.'], core: [{ piece: 'Heavyweight boxy grey tee', why: 'Shape everything else hangs off.' }], palette: [{ name: 'Black', hex: '#111111' }, { name: 'Grey', hex: '#8A8A8A' }, { name: 'Bone', hex: '#E8E2D4' }, { name: 'Olive', hex: '#5B6236' }, { name: 'Washed indigo', hex: '#3B4C6B' }], presence: 'Unbothered on campus, sharp at night.' };
  }
  return postJSON<StyleRead>('/style/profile', { lanes: p.lanes, colours: p.colours, life: p.life, feeling: p.feeling, presence: p.presence, tone: tone() });
}

/** Wardrobe: what's in these photos, catalogued. Returns one entry per piece, with the photo it came from. */
export async function scanWardrobe(uris: string[]): Promise<{ photo: number; category: WardrobeItem['category']; name: string; colour: Swatch; formality: number }[]> {
  if (OFFLINE) {
    await sleep(1200);
    return uris.map((_, i) => ({ photo: i, category: (['top', 'bottom', 'shoes'] as const)[i % 3], name: ['Navy oxford shirt', 'Ecru wide-leg trousers', 'Brown suede loafers'][i % 3], colour: [{ name: 'Navy', hex: '#1F2A44' }, { name: 'Ecru', hex: '#E6DEC8' }, { name: 'Brown', hex: '#6F4728' }][i % 3], formality: 3 }));
  }
  const form = new FormData();
  uris.slice(0, 8).forEach((u, i) => form.append('photos', fileField(u, `piece${i}.jpg`, 'image/jpeg')));
  const r = await postForm<{ items: any[] }>('/wardrobe/scan', form, 90000);
  return r.items ?? [];
}

/** Two outfits from what they own, for the occasion and the presence they want. Only descriptions are sent. */
export async function buildFits(a: { items: WardrobeItem[]; occasion: string; presence: string; colouring?: FitRead['colouring'] }): Promise<BuiltFit[]> {
  if (OFFLINE) {
    await sleep(1400);
    const pick = (c: string) => a.items.find((x) => x.category === c)?.id;
    const ids = ['top', 'bottom', 'shoes', 'outer'].map(pick).filter(Boolean) as string[];
    return [{ name: 'Navy and ecru', items: ids, why: 'Three colours, neat on top, easy below.', presence: 'Composed, not trying.', missing: null }];
  }
  const items = a.items.map((x) => ({ id: x.id, category: x.category, name: x.name, colour: x.colour, formality: x.formality }));
  const r = await postJSON<{ outfits: BuiltFit[] }>('/wardrobe/build', { items, occasion: a.occasion, presence: a.presence, colouring: a.colouring ?? null, tone: tone(), lane: useStore.getState().styleLane ?? '' });
  return r.outfits ?? [];
}

export async function readProfile(a: { uris: string[]; handle?: string }): Promise<ProfileRead> {
  if (OFFLINE) {
    await sleep(1800);
    return {
      score: 47,
      tier: 'LinkedIn energy',
      lane: 'quiet luxury',
      verdict: 'Expensive taste, nobody home.',
      first_impression: 'Hustle bio, no face, and a grid that could be anyone’s.',
      parts: [
        { part: 'Profile picture', score: 52, note: 'Too far away to read your face or your vibe.', fix: 'Shoulders up, natural light, not a mirror.' },
        { part: 'Bio', score: 34, note: '“Grind in silence” is a quote, not a person.', fix: 'Say one specific thing you do or like.' },
        { part: 'Grid', score: 61, note: 'Cohesive colours, but no people and no story.', fix: 'Add two posts with friends in them.' },
      ],
      bio_rewrite: 'San Juan / NYC',
      caption_rewrite: { before: 'Grateful 🙏✨', after: 'third try' },
      fixes: ['Replace the quote in your bio with one real detail.', 'Use a closer, warmer profile photo.', 'Post one photo with people in it.'],
      song: { title: 'Location', artist: 'Khalid', why: 'Chill, a little guarded, wants to be found.' },
    };
  }
  const form = new FormData();
  a.uris.slice(0, 6).forEach((u, i) => form.append('shots', fileField(u, `shot${i}.jpg`, 'image/jpeg')));
  if (a.handle) form.append('handle', a.handle);
  form.append('tone', tone());
  return postForm<ProfileRead>('/profile', form, 180000);
}

// ------------------------------------------------------------------ debate duel

export async function duelCreate(a: { videoUri: string; topicId: string; name?: string }): Promise<Duel> {
  if (OFFLINE) throw new Error('Duels need the Kleos server. Start it with npm run dev.');
  const form = new FormData();
  form.append('video', fileField(a.videoUri, 'take.mov', 'video/quicktime'));
  form.append('topic_id', a.topicId);
  if (a.name) form.append('name', a.name);
  form.append('tone', tone());
  return postForm<Duel>('/duel', form, 180000);
}

export async function duelGet(code: string): Promise<Duel> {
  if (OFFLINE) throw new Error('Duels need the Kleos server.');
  const r = await fetch(`${API_URL}/duel/${encodeURIComponent(code.trim().toUpperCase())}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail ?? 'No duel with that code.');
  return r.json();
}

export async function duelAnswer(a: { code: string; videoUri: string; name?: string }): Promise<Duel> {
  const form = new FormData();
  form.append('video', fileField(a.videoUri, 'take.mov', 'video/quicktime'));
  if (a.name) form.append('name', a.name);
  return postForm<Duel>(`/duel/${encodeURIComponent(a.code.trim().toUpperCase())}/answer`, form, 180000);
}

// ------------------------------------------------------------------ portrait (Black)

export type Portrait = { headline: string; in_a_room: string; strengths: string[]; the_pattern: string; when_it_works: string; next_month: string[]; line: string };

export async function makePortrait(history: unknown[]): Promise<Portrait> {
  if (OFFLINE) throw new Error('The Portrait needs the Kleos server.');
  return postJSON<Portrait>('/portrait', { history, tone: tone() });
}


// ------------------------------------------------------------------ invites, clips, challenges, camera

export type Me = { code: string; credits: number; friends: number; friends_paid: number; used_code: string | null; terms: { you_get: number; you_get_paid: number; they_get: number } };

/** Sync invite code and earned call credits from the server. Safe to call often. */
export async function syncMe(): Promise<Me | null> {
  if (OFFLINE) return null;
  const st = useStore.getState();
  try {
    const r = await call('/me');
    if (!r.ok) return null;
    const me: Me = await r.json();
    st.set({ credits: { granted: me.credits, used: Math.min(st.credits?.used ?? 0, me.credits) }, invite: { code: me.code, usedCode: me.used_code ?? undefined, friends: me.friends } });
    return me;
  } catch {
    return null;
  }
}

export async function redeemCode(code: string): Promise<string> {
  const r = await postJSON<{ message: string }>('/redeem', { code });
  syncMe();
  return r.message;
}

export const inviteLink = (code: string) => `${API_URL}/i/${code}`;

/** Render the Aura Replay clip for a finished call and download it. Returns a local file uri. */
export async function makeClip(sessionId: string): Promise<string> {
  const { url } = await postJSON<{ url: string }>(`/clip/${sessionId}`, {});
  const dir = new Directory(Paths.cache, 'clips');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `kleos-${sessionId}.mp4`);
  if (dest.exists) dest.delete();
  const f = await File.downloadFileAsync(url, dest);
  return f.uri;
}

/**
 * The rated Aura Scan video (the take, scan overlay, readouts, score at the end). It renders on the server while
 * the card is on screen; wait for it, then download it for the share sheet (which offers Save Video).
 */
export async function saveScanVideo(videoId: string, onWait?: () => void): Promise<string> {
  const deadline = Date.now() + 90000;
  for (;;) {
    const r = await fetch(`${API_URL}/scan/video/${videoId}/status`);
    const st = r.ok ? await r.json() : { expired: true };
    if (st.ready) break;
    if (st.failed) throw new Error('Couldn’t make that video. The card still saves.');
    if (st.expired) throw new Error('That video has expired. Videos are kept for two hours.');
    if (Date.now() > deadline) throw new Error('The video is taking too long. Try again in a minute.');
    onWait?.();
    await sleep(1500);
  }
  const dir = new Directory(Paths.cache, 'scans');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `kleos-aura-scan-${videoId}.mp4`);
  if (dest.exists) return dest.uri;
  const f = await File.downloadFileAsync(`${API_URL}/scan/video/${videoId}`, dest);
  return f.uri;
}

/** Camera stills taken during a live call, measured for eye contact before the read. */
export async function uploadFrames(sessionId: string, uris: string[]): Promise<void> {
  if (!uris.length) return;
  const form = new FormData();
  uris.slice(-60).forEach((u, i) => form.append('frames', fileField(u, `f${i}.jpg`, 'image/jpeg')));
  await postForm(`/live/${sessionId}/frames`, form, 60000);
}

export type Challenge = { code: string; kind: 'daily' | 'floor'; ref_id: string; title: string; a_name: string; a_rating: number; a_verdict: string; b_name?: string; b_rating?: number; b_verdict?: string; done: boolean; winner?: 'a' | 'b' | 'tie' };

export async function createChallenge(a: { kind: 'daily' | 'floor'; ref_id: string; title: string; rating: number; verdict: string }): Promise<Challenge> {
  const st = useStore.getState();
  return postJSON<Challenge>('/challenge', { ...a, name: st.name || 'Someone' });
}

export async function getChallenge(code: string): Promise<Challenge> {
  const r = await fetch(`${API_URL}/challenge/${code}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail ?? 'No challenge with that code.');
  return r.json();
}

export async function answerChallenge(code: string, rating: number, verdict: string): Promise<Challenge> {
  const st = useStore.getState();
  return postJSON<Challenge>(`/challenge/${code}/answer`, { name: st.name || 'Your friend', rating, verdict });
}


// ------------------------------------------------------------------ account

export type SignedIn = { token?: string; account: Account; switched: boolean };

export async function emailStart(email: string): Promise<{ sent: boolean; already?: boolean; dev_code?: string }> {
  return postJSON('/auth/email/start', { email });
}

/** Verify the emailed code. Saves this account under that email, or switches to the account that already has it. */
export async function emailVerify(email: string, code: string): Promise<SignedIn> {
  const r = await postJSON<SignedIn>('/auth/email/verify', { email, code });
  if (r.token) await adopt(r.token, r.account);
  return r;
}

/** Sign in with Apple, step one: a single-use nonce from the server for Apple to put inside its signed token. */
export async function appleNonce(): Promise<string> {
  const r = await postJSON<{ nonce: string }>('/auth/apple/nonce', {});
  return r.nonce;
}

export async function appleSignIn(identityToken: string, nonce: string, name?: string): Promise<SignedIn> {
  const r = await postJSON<SignedIn>('/auth/apple', { identity_token: identityToken, nonce, name: name ?? '' });
  if (r.token) await adopt(r.token, r.account);
  return r;
}

export async function updateAccountName(name: string): Promise<void> {
  if (OFFLINE) return;
  try {
    await postJSON('/account', { name });
  } catch {}
}

/** Delete the account on the server. A subscription is cancelled in Apple's settings, not here. */
export async function deleteAccount(): Promise<void> {
  if (OFFLINE) return;
  await postJSON('/account/delete', {});
}

/** Phone test builds without RevenueCat: the server unlocks a plan only while its dev switch is on. */
export async function devPlan(plan: 'free' | 'plus' | 'black'): Promise<void> {
  if (OFFLINE) return;
  try {
    await postJSON('/account/plan/dev', { plan });
  } catch {}
}

/** A small summary of progress, so the Members page on joinkleos.com can show it. */
export async function saveSummary(body: Record<string, unknown>): Promise<void> {
  if (OFFLINE) return;
  try {
    await postJSON('/account/summary', body);
  } catch {}
}

export async function getAccount(): Promise<Account> {
  return getJSON<Account>('/account');
}

// ------------------------------------------------------------------ The Table

export type TablePlayer = { name: string; mission: string; outcome: 'clean' | 'obvious' | 'caught' | 'missed'; guessed: boolean };
export type TableVerdict = { players: (TablePlayer & { points: number; line: string })[]; winner: string; crown: string; toast: string };

export async function tableVerdict(players: TablePlayer[]): Promise<TableVerdict> {
  if (OFFLINE) throw new Error('offline');
  return postJSON<TableVerdict>('/table/verdict', { players, tone: tone() });
}

/** A screen crashed: send the message and the top of the stack (no personal data) so it can be fixed. */
export async function reportClientError(error: Error, path?: string): Promise<void> {
  if (OFFLINE) return;
  try {
    await call('/client/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(error?.message ?? error).slice(0, 300), stack: String(error?.stack ?? '').slice(0, 1500), path: path ?? '' }),
    });
  } catch {}
}
