import { API_URL, OFFLINE } from './config';
import type { Evaluation, Lesson, Receipt, ScanResult, SessionStart, TurnResult } from './types';
import type { Goal } from '@/state/store';

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

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail ?? `Request failed (${res.status})`);
  return res.json();
}

/**
 * Multipart uploads go through XMLHttpRequest, not fetch. Expo installs expo/fetch as the global fetch,
 * and it rejects React Native file parts ({ uri, name, type }) with "Unsupported FormDataPart implementation".
 * RN's XHR streams those file parts natively on iOS and Android.
 */
function postForm<T>(path: string, form: FormData, timeoutMs = 120000): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.timeout = timeoutMs;
    xhr.responseType = 'text';
    xhr.onload = () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new Error(body?.detail ?? `Request failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error. Is the server running?'));
    xhr.ontimeout = () => reject(new Error('The server took too long. Try again.'));
    xhr.send(form);
  });
}

/** React Native file part. Sent via XHR (see postForm). */
function fileField(uri: string, name: string, type: string) {
  return { uri, name, type } as unknown as Blob;
}

// ------------------------------------------------------------------ conversations

export type StartArgs = { goal?: Goal; room_id?: string; lesson?: Lesson; pressure?: number; attempt_of?: string; max_turns?: number };

export async function startSession(a: StartArgs): Promise<SessionStart & { openerAudio: AudioSrc }> {
  if (OFFLINE) {
    const g = a.goal ?? demo.goal;
    demo = { goal: g, attempt: a.attempt_of ? 2 : 1, turns: 0 };
    const sc = DEMO_SCENES[g];
    await sleep(400);
    const lessonScene = a.lesson ? { setting: a.lesson.setting, opener: a.lesson.opener, goal: a.lesson.goal } : null;
    return { session_id: `demo_${Date.now()}`, character: sc.character, setting: lessonScene?.setting ?? sc.setting, goal: lessonScene?.goal ?? sc.goal, opener: lessonScene?.opener ?? sc.opener, max_turns: 2, pressure: a.pressure ?? 1, openerAudio: lessonScene ? undefined : DEMO_AUDIO[`open_${g}` as keyof typeof DEMO_AUDIO] };
  }
  const r = await postJSON<SessionStart>('/session/start', a);
  return { ...r, openerAudio: r.opener_audio };
}

export async function sendTurn(sessionId: string, uri: string): Promise<TurnResult & { replyAudio: AudioSrc }> {
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
  const r = await postForm<TurnResult>(`/session/${sessionId}/turn`, form);
  return { ...r, replyAudio: r.reply_audio };
}

export async function evaluateSession(sessionId: string): Promise<Evaluation & { scriptAudio: AudioSrc }> {
  if (OFFLINE) {
    await sleep(1800);
    const e = demo.attempt === 1 ? DEMO_EVAL_1 : DEMO_EVAL_2;
    return { ...e, scriptAudio: demo.attempt === 1 ? DEMO_AUDIO.poise_1 : DEMO_AUDIO.poise_2 };
  }
  const r = await postJSON<Evaluation>(`/session/${sessionId}/evaluate`, {});
  return { ...r, scriptAudio: r.script_audio };
}

export async function generateLesson(a: { unit: string; unit_id?: string; objective: string; weak: string[]; avoid: string[]; pressure: number }): Promise<Lesson> {
  if (OFFLINE) {
    await sleep(600);
    return { character: 'dev', setting: 'At a coworking desk on a Thursday afternoon.', opener: "Hey, quick favour: can you cover my Friday 4pm client call? I'd totally owe you.", twist: 'He says it’s only thirty minutes and asks if you’re really that busy.', goal: a.objective, hint: 'Lead with your answer, give at most one reason, then pause.' };
  }
  return postJSON<Lesson>('/lesson', a);
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
      receipt_no: String(Math.floor(Math.random() * 9000) + 1000),
      story: a.text ?? '(voice)',
      audio: DEMO_AUDIO.poise_receipt,
    };
  }
  const form = new FormData();
  if (a.text) form.append('text', a.text);
  if (a.context) form.append('context', a.context);
  if (a.audioUri) form.append('audio', fileField(a.audioUri, 'story.m4a', 'audio/m4a'));
  return postForm<Receipt>('/ledger', form);
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

export async function withdrawTraining(subjectId: string): Promise<number> {
  if (OFFLINE) return 0;
  try {
    const form = new FormData();
    form.append('subject_id', subjectId);
    const r = await postForm<{ removed: number }>('/train/withdraw', form);
    return r.removed;
  } catch {
    return 0;
  }
}
