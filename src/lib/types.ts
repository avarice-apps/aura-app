export type Character = { id: string; name: string; style: string; behaviour: string; voice: string };

export type SessionStart = {
  session_id: string;
  character: Character;
  setting: string;
  goal: string;
  opener: string;
  opener_audio?: string;
  max_turns: number;
  pressure: number;
};

export type TurnResult = {
  user_text: string;
  facts: { duration_s: number; wpm: number; filler_count: number; hedge_count: number; apology_count: number; first_word_s: number; ended_mid_sentence: boolean; repeat_count?: number; restart_count?: number; fade_endings?: number; rushed?: boolean; eye_contact?: number };
  reply: string;
  reply_audio?: string;
  done: boolean;
  turn: number;
  interest?: number;
  trust?: number;
};

export type Counts = { fillers: number; hedges: number; apologies: number; ended_clean: boolean; talk_s: number; wpm: number };

export type Evaluation = {
  rating: number;
  axes: { voice: number; command: number; composure: number; awareness: number; landed?: number };
  /** One blunt sentence: how it actually went. */
  verdict?: string;
  effort?: 'real' | 'half' | 'trolling';
  landed?: { score: number; evidence: string };
  archetype: string;
  archetype_line: string;
  strengths: { text: string; turn: number }[];
  change: { text: string; turn: number; quote: string };
  hint: string;
  example: string;
  /** Two viable ways to handle the change moment, in different registers. Neither is 'the' answer. */
  alternatives?: { style: string; line: string }[];
  /** The one moment where two channels lined up (words × voice, or voice × eyes). */
  signal?: { text: string; turn: number; quote: string; measured: string } | null;
  /** The exchange where the conversation changed direction, if any. */
  turning_point?: { turn: number; quote: string; what_changed: string } | null;
  /** Server could not rate fairly (too little speech). Nothing counts against the user. */
  insufficient?: boolean;
  reason?: string;
  awareness: { score: number; evidence: string };
  compare: string | null;
  script: string;
  script_audio?: string;
  counts: Counts;
  turns: { role: 'char' | 'user'; text: string }[];
  trace?: { turn: number; interest: number; trust: number; thought: string | null }[];
  character?: string;
  delta?: number;
  prev_counts?: Counts;
  prev_rating?: number;
};

export type Receipt = {
  /** Set when he asked for advice instead of telling a story: Poise's answer, no ledger. */
  advice?: string;
  title: string;
  lines: { text: string; points: number }[];
  total: number;
  headline: string;
  next_time: string;
  drill: string;
  said_instead?: string;
  scene?: { character: string; setting: string; opener: string; goal: string };
  receipt_no: string;
  story: string;
  createdAt?: string;
  missionId?: string;
};

export type ScanResult = {
  score: number;
  tier: string;
  axes: { delivery: number; composure: number; command: number; posture: number };
  name: string;
  transcript: string;
  counts: { fillers: number; hedges: number; wpm: number };
  archetype: string;
  best_moment: string;
  roast: string;
  prompt?: string;
  /** Server is rendering the rated video for this take (kept up to two hours). */
  video_id?: string;
  createdAt?: string;
};

export type Lesson = { character: string; setting: string; opener: string; twist: string | null; goal: string; hint: string; focus?: string };

/** Rate a Clip: a moment (anyone's), scored for aura beat by beat. */
export type Moment = {
  title: string;
  verdict: string;
  lines: { t: string; text: string; points: number }[];
  total: number;
  tier: string;
  caption: string;
  what_to_do: string;
  said_instead?: string | null;
  createdAt?: string;
};

/** Profile Read: an Instagram profile as a stranger sees it. */
export type ProfileRead = {
  score: number;
  tier: string;
  /** The aesthetic they're going for, e.g. 'downtown film'. */
  lane?: string;
  /** The share-card line, <= 9 words. */
  verdict?: string;
  first_impression: string;
  parts: { part: string; score: number; note: string; fix: string }[];
  bio_rewrite?: string | null;
  caption_rewrite?: { before: string; after: string } | null;
  fixes: string[];
  song?: { title: string; artist: string; why: string };
  createdAt?: string;
};

/** Debate Duel: two takes on one topic, judged by Poise. */
export type Duel = {
  id: string;
  code: string;
  topic_id: string;
  topic: string;
  side_a: string;
  side_b: string;
  name_a: string;
  name_b?: string | null;
  status: 'waiting' | 'done';
  result?: {
    winner: 'a' | 'b' | 'draw';
    margin: 'clear' | 'close';
    scores: { a: { argument: number; composure: number; total: number }; b: { argument: number; composure: number; total: number } };
    verdict: string;
    best_line?: { who: 'a' | 'b'; quote: string };
    fumble?: { who: 'a' | 'b'; quote: string; why: string } | null;
    note_a: string;
    note_b: string;
    caption: string;
  } | null;
};
