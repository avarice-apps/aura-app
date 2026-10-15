import type { Axes } from '@/components/Mark';

export type TierName = 'Static' | 'Faint' | 'Present' | 'Composed' | 'Magnetic' | 'Gravity';

export const TIERS: { name: TierName; min: number; line: string }[] = [
  { name: 'Static', min: 0, line: 'People are waiting for you to finish.' },
  { name: 'Faint', min: 30, line: 'You are there. They are not sure why.' },
  { name: 'Present', min: 45, line: "You hold attention. You don't yet direct it." },
  { name: 'Composed', min: 60, line: 'The room settles when you speak.' },
  { name: 'Magnetic', min: 75, line: 'They remember what you said.' },
  { name: 'Gravity', min: 90, line: 'They remember how it felt to be near you.' },
];

export function tierFor(index: number) {
  let t = TIERS[0];
  for (const tier of TIERS) if (index >= tier.min) t = tier;
  return t;
}

export const AXIS_LABEL: Record<keyof Axes, string> = {
  voice: 'Voice',
  presence: 'Presence',
  command: 'Command',
  composure: 'Composure',
  read: 'Read',
};

export const AXIS_WEIGHT: Record<keyof Axes, number> = { voice: 0.25, presence: 0.25, command: 0.2, composure: 0.15, read: 0.15 };

export function indexFrom(axes: Axes) {
  return Math.round((Object.keys(axes) as (keyof Axes)[]).reduce((s, k) => s + axes[k] * AXIS_WEIGHT[k], 0));
}

export type Archetype = { key: string; name: string; read: string };

export const ARCHETYPES: Archetype[] = [
  { key: 'apologist', name: 'The Apologist', read: 'Talks himself down before anyone else can.' },
  { key: 'sprinter', name: 'The Sprinter', read: 'Fast, bright, forgettable. Never lands.' },
  { key: 'statue', name: 'The Statue', read: 'Still and controlled. Reads as absent.' },
  { key: 'pleaser', name: 'The Pleaser', read: 'Every sentence ends as a question.' },
  { key: 'hedge', name: 'The Hedge', read: 'Qualifies everything. Owns nothing.' },
  { key: 'blade', name: 'The Blade', read: 'Sharp, clear, cold. Lands and leaves.' },
  { key: 'anchor', name: 'The Anchor', read: 'Slow, low, certain. Wins rooms, loses pace.' },
  { key: 'current', name: 'The Current', read: 'Warm and directed.' },
];

export type PromptCategory = 'Work' | 'Social' | 'Dating' | 'Family' | 'Public';

export type ReadPrompt = { id: string; cat: PromptCategory; text: string; seconds: number };

export const READ_PROMPTS: ReadPrompt[] = [
  { id: 'r1', cat: 'Social', text: 'Introduce yourself to a table of people you want to impress.', seconds: 45 },
  { id: 'r2', cat: 'Work', text: 'Tell the hiring manager why it should be you.', seconds: 60 },
  { id: 'r3', cat: 'Social', text: "Explain to your friends why you're leaving early.", seconds: 30 },
  { id: 'r4', cat: 'Dating', text: 'She asks what you actually do all day. Answer.', seconds: 45 },
  { id: 'r5', cat: 'Work', text: 'Your boss asks why the thing is late. It is your fault.', seconds: 45 },
  { id: 'r6', cat: 'Public', text: 'Give a thirty-second toast at a friend’s birthday.', seconds: 30 },
  { id: 'r7', cat: 'Family', text: 'Tell your father you are not taking the job he wants you to take.', seconds: 45 },
  { id: 'r8', cat: 'Social', text: 'Introduce the person standing next to you to the group.', seconds: 30 },
  { id: 'r9', cat: 'Work', text: 'Disagree with a decision in a meeting, out loud.', seconds: 45 },
  { id: 'r10', cat: 'Dating', text: 'Ask for her number. You have one shot.', seconds: 20 },
  { id: 'r11', cat: 'Public', text: 'A stranger asks for directions. You know the way.', seconds: 30 },
  { id: 'r12', cat: 'Work', text: 'Explain what you are building to someone who could fund it.', seconds: 60 },
];

export type PressurePrompt = { id: string; text: string; interrupt?: boolean };

export const PRESSURE_PROMPTS: PressurePrompt[] = [
  { id: 'p1', text: 'Why are you late?' },
  { id: 'p2', text: 'What do you want?' },
  { id: 'p3', text: 'Convince me to stay.' },
  { id: 'p4', text: 'Sell me this phone.' },
  { id: 'p5', text: 'Who are you, again?', interrupt: true },
  { id: 'p6', text: 'Say no to this.' },
  { id: 'p7', text: 'Tell me something true.' },
  { id: 'p8', text: 'Defend your worst decision.' },
  { id: 'p9', text: "You're wrong. Respond.", interrupt: true },
  { id: 'p10', text: 'Order for the table.' },
];

export type RoomQuestion = {
  id: string;
  kind: 'call' | 'meant' | 'holds';
  scene: string;
  options: string[];
  answer: number; // index into options
  why: string;
};

export const ROOM_QUESTIONS: RoomQuestion[] = [
  {
    id: 'q1',
    kind: 'meant',
    scene: 'You pitch an idea. Your friend says: "Yeah, that’s interesting."',
    options: ['He likes it', 'He is being polite', 'He wants details', 'He is jealous'],
    answer: 1,
    why: '"Interesting" with no follow-up question is a soft no. A real yes asks something.',
  },
  {
    id: 'q2',
    kind: 'call',
    scene: 'A group is mid-conversation. You arrive. Two people glance at you and keep talking.',
    options: ['Interrupt with a joke', 'Stand at the edge and listen for one beat', 'Say "What did I miss?"', 'Walk off'],
    answer: 1,
    why: 'The glance was an acknowledgement, not an invitation. One beat of listening earns the entry.',
  },
  {
    id: 'q3',
    kind: 'holds',
    scene: 'Four people at a bar. One talks most. One is on his phone. One laughs loudest. One is asked "what do you think?" twice.',
    options: ['The talker', 'The one on his phone', 'The loud laugher', 'The one being asked'],
    answer: 3,
    why: 'The room defers to the one it keeps asking. Volume is not authority.',
  },
  {
    id: 'q4',
    kind: 'meant',
    scene: 'A date says "I’m kind of tired tonight" at 9pm, then keeps talking.',
    options: ['Leave now', 'She is bored', 'She is testing whether you push', 'She is comfortable and signalling it will end soon'],
    answer: 3,
    why: 'She said it and stayed. That is comfort, not escape. Match it; suggest the walk home in twenty minutes.',
  },
  {
    id: 'q5',
    kind: 'call',
    scene: 'In a meeting, your point gets repeated by someone senior as if it were theirs. People nod.',
    options: ['Say "that’s what I just said"', 'Build on it by name: "Right, and the next step is..."', 'Let it go', 'Message a colleague about it'],
    answer: 1,
    why: 'Reclaim by extending, not by contesting. The room then credits the extension to you.',
  },
  {
    id: 'q6',
    kind: 'call',
    scene: 'You tell a story. Halfway through, someone checks the time.',
    options: ['Speed up', 'Land it in one sentence and stop', 'Ask "am I boring you?"', 'Keep going as planned'],
    answer: 1,
    why: 'A clean early landing reads as control. Speeding up reads as panic.',
  },
];

export const SAMPLE_VERDICT = {
  index: 52,
  band: 9,
  axes: { voice: 48, presence: 56, command: 44, composure: 58, read: 61 } as Axes,
  archetype: 'hedge',
  tells: [
    { id: 't1', title: 'You apologise before your point.', evidence: '"Sorry, just quickly" at 0:02, 0:19 and 0:31. Three apologies in forty seconds. People heard: don’t mind me.', axis: 'command' as keyof Axes },
    { id: 't2', title: 'Your eyes leave on every number.', evidence: 'Eye contact 61% overall, 22% while saying anything specific. You look away to think and it reads as doubt.', axis: 'presence' as keyof Axes },
    { id: 't3', title: 'You end sentences going up.', evidence: 'Upward inflection on 7 of 11 sentence endings. Statements that sound like questions.', axis: 'voice' as keyof Axes },
  ],
  drill: {
    title: 'Drop the sorry.',
    body: 'Re-record the same prompt. Say the first sentence slower than feels natural, and hold the lens until it is finished. No apology, no "just". Twice.',
    minutes: 3,
  },
  script:
    "Here’s your read. You opened fine, then apologised before your point. Three times, in forty seconds. People heard: don’t mind me. Your eyes leave every time you say something specific, so the specific things sound like guesses. Drop the sorry. Slow the first sentence down. Hold my eyes until it’s finished. Again, tomorrow.",
};
