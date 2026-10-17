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
  /** A one-off stranger (not a cast member): gets a face from the stranger pool. */
  masked?: boolean;
  /** Retry-this-moment: the call picks up just before the moment. */
  resumed?: boolean;
  /** Seconds this call may run (the plan's allowance); the scene wraps up near it. */
  allow_s?: number | null;
  speakers?: { name: string; role: string }[];
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

/** How Poise said it: the same findings, two registers. */
export type Voice = { verdict?: string; archetype_line?: string; script?: string };
/** Whether an axis was actually measured. Unmeasured axes are null and left out of the rating. */
export type AxisStatus = 'assessed' | 'not_measured' | 'insufficient_evidence';
export type Axes = { voice: number | null; command: number | null; composure: number | null; awareness: number | null; landed?: number | null };

export type Evaluation = {
  rating: number;
  /** The session this read belongs to; the detail half arrives later under this id (lib/reads.ts). */
  session_id?: string;
  /** True while the detail (evidence, alternatives, signal, turning point) is still being written. */
  detail_pending?: boolean;
  axes: Axes;
  axes_status?: Partial<Record<keyof Axes, AxisStatus>>;
  /** Both voices; the top-level verdict/script are the one chosen for the player's tone. */
  voices?: { straight?: Voice; unfiltered?: Voice };
  /** Quotes the read rests on. */
  evidence?: { turn: number; quote: string; observation: string }[];
  /** What Poise couldn't tell from this call. */
  uncertainties?: string[];
  /** Guidance cards used for this read (ids), and the rubric version. */
  guidance?: string[];
  rubric_version?: string;
  /** Set when this was a retry of one moment. */
  moment?: { turn: number; said_before?: string };
  memory?: string;
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
  awareness: { score: number | null; status?: AxisStatus; evidence: string };
  compare: string | null;
  script: string;
  script_audio?: string;
  counts: Counts;
  turns: { role: 'char' | 'user'; text: string; context?: boolean }[];
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
  /** Server is rendering the rated video (kept up to two hours). */
  video_id?: string;
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

/** Fit check: an outfit photo, rated honestly, with fixes and the colours that suit the wearer. */
export type Swatch = { name: string; hex: string };
export type FitRead = {
  score: number;
  tier: string;
  lane?: string;
  verdict: string;
  roast: string;
  pieces: { item: string; score: number; note: string }[];
  works: string[];
  fixes: string[];
  colouring?: { undertone: string; contrast: string; read: string; wear: Swatch[]; avoid: Swatch[] } | null;
  buy?: { piece: string; why: string }[];
  createdAt?: string;
};

/** One piece in the wardrobe. The photo stays on the phone; only the description is sent when building a fit. */
export type WardrobeItem = {
  id: string;
  uri: string;
  category: 'top' | 'bottom' | 'outer' | 'shoes' | 'accessory' | 'full';
  name: string;
  colour: Swatch;
  formality: number;
  addedAt: string;
};
export type BuiltFit = {
  name: string;
  items: string[];
  why: string;
  presence: string;
  missing?: { piece: string; why: string } | null;
};

/** His style, learned in the Wardrobe quiz. Every fit read and build stays consistent with it. */
export type StyleRead = {
  signature: string;
  read: string;
  principles: string[];
  core: { piece: string; why: string }[];
  palette: Swatch[];
  presence: string;
};
export type StyleProfile = { lanes: string[]; colours: string[]; life: string[]; feeling: string; presence: string; read?: StyleRead; at?: string };

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

/** Before I send this: Poise's read of a draft (or of the conversation it answers). Never scored. */
export type ShotMessage = { speaker: 'me' | 'them' | 'unclear'; name?: string | null; text: string; unclear?: string[] };
export type DraftRead = {
  mode: 'review' | 'reply';
  intent?: string | null;
  assumptions: string[];
  reads: string;
  keep?: string | null;
  change?: string | null;
  send_as_is: boolean;
  observations: { span: string; note: string }[];
  preserve: string[];
  alternatives: { label: string; text: string }[];
  uncertainty?: string | null;
  clarify?: string | null;
  next?: string | null;
  note?: string;
  voices?: { straight?: { reads?: string; keep?: string | null; change?: string | null }; unfiltered?: { reads?: string; keep?: string | null; change?: string | null } };
  version?: string;
};
export type DraftEntry = { id: string; createdAt: string; draft: string; convo?: ShotMessage[]; to?: string; intent?: string; outcome?: string; read: DraftRead };

/** One measure on The Mirror's lab report: measured from the recording, with the band it's compared to. */
export type LabMeasure = {
  key: string;
  label: string;
  value: number;
  display: string;
  band: [number, number];
  scale: [number, number];
  status: 'in' | 'low' | 'high';
  /** "research": a published finding (see How Kleos measures). "kleos": our own working threshold. */
  source: 'research' | 'kleos';
  note: string;
  ref?: string | null;
};

/** The Mirror: thirty seconds on camera, measured, then read. */
export type MirrorRead = {
  id: string;
  promptId: string;
  prompt: string;
  index: number;
  band: number;
  axes: Record<string, number>;
  archetype: string;
  tells: { id: string; title: string; evidence: string; axis: string }[];
  drill: { title: string; body: string; minutes: number };
  script: string;
  audioUrl?: string | null;
  landed?: { score: number; why: string } | null;
  measures: LabMeasure[];
  lab?: { in: number; total: number };
  transcript?: string;
  createdAt: string;
  safety?: boolean;
};
