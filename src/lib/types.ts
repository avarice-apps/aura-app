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
  axes: { voice: number; command: number; composure: number; awareness: number };
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
  title: string;
  lines: { text: string; points: number }[];
  total: number;
  headline: string;
  next_time: string;
  drill: string;
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
  createdAt?: string;
};

export type Lesson = { character: string; setting: string; opener: string; twist: string | null; goal: string; hint: string; focus?: string };
