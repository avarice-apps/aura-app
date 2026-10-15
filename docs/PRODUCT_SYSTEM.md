# Aura — product system

Aura reads how you come across, tells you plainly, and trains it out of you. Poise is the voice that does the telling.

This document is the whole system: what is measured, how it is scored, how people progress, what keeps them coming back, and how it makes money. The design direction (cobalt, engraving, sculpture) lives in `docs/DESIGN_DIRECTION.md`.

---

## 1. The spine: Read → Verdict → Drill → Re-read

Everything hangs off one loop.

1. **Read** (45–60 s). You answer one prompt to the front camera. "Introduce yourself to a table of people you want to impress." Aura measures voice, face and body in the clip.
2. **Verdict** (Poise, ~40 s of audio + the card). Your Aura Index, your tier, the **three tells** that cost you most, and **one drill** for the next 24 hours. Specific, evidenced, no hedging.
3. **Drill** (daily, 3–5 min). Short targeted reps on the tell Poise picked.
4. **Re-read** (Sunday, weekly). Same prompt as your first Read. The delta is the product. The burst fills in or it does not.

The Index moves slowly and honestly. Watching it move is the reason to pay for month four.

---

## 2. What is measured

Every signal below is measured in code, not guessed by the model. The model judges; the numbers come from the pipeline.

| Axis | Signals | Source |
|---|---|---|
| **Voice** | words per minute, filler rate (um/uh/like/you know), pause pattern, pitch variance, energy, upward inflection at sentence ends, volume consistency | Deepgram word timestamps + librosa |
| **Presence** | eye-contact ratio to lens, head stability, posture (shoulder line, lean), self-touch and fidget events, blink rate, micro-nods | MediaPipe Face + Pose, server side |
| **Command** | hedges ("I guess", "sort of", "just"), apologies, structure (claim → support → close), concision, specificity vs abstraction, ending strength | transcript + Claude rubric |
| **Composure** | performance under time pressure and interruption, recovery after a stumble, first-sentence speed | Pressure Rounds, Cold Open |
| **Read** | social judgment: timed quizzes on what to do, what someone meant, who holds the room | Read the Room |

Each axis is 0–100. The **Aura Index** is a weighted blend: Voice 25, Presence 25, Command 20, Composure 15, Read 15. Weights are stored in config, not code, so they can be tuned without a release.

### Scoring honesty rules

- A new user's Index carries a wide **uncertainty band** (±12) that narrows with each Read. The band is shown. It makes early scores feel fair and later ones feel earned.
- Index movement per Read is capped at ±6. No one jumps 30 points because they had a good morning. This is what makes the number worth trusting and therefore worth chasing.
- Scores are **relative to the cohort**, not to an abstract ideal. "71 — more present than 68% of men your age" is a sentence people screenshot.

---

## 3. Tiers and the Mark

Six tiers. Names chosen to be cool when said out loud and impossible to mock.

| Index | Tier | What Poise says it means |
|---|---|---|
| 0–29 | **Static** | "People are waiting for you to finish." |
| 30–44 | **Faint** | "You are there. They are not sure why." |
| 45–59 | **Present** | "You hold attention. You don't yet direct it." |
| 60–74 | **Composed** | "The room settles when you speak." |
| 75–89 | **Magnetic** | "They remember what you said." |
| 90–100 | **Gravity** | "They remember how it felt to be near you." |

**The Mark** is your aura rendered as a burst of rays (the Skia component). Ray count maps to Index, ray evenness maps to consistency across axes, ray length maps to your best axis. It is your profile, your share card, and your proof. Over months it visibly fills in. People do not cancel a subscription that is drawing a picture of them getting better.

**Archetypes.** After the first Read, Poise assigns one of eight archetypes, each with a sculpture engraving and a one-line read. These are diagnostic, not flattering, and they change as you change.

| Archetype | The read |
|---|---|
| The Apologist | Talks himself down before anyone else can. |
| The Sprinter | Fast, bright, forgettable. Never lands. |
| The Statue | Still and controlled. Reads as absent. |
| The Pleaser | Every sentence ends as a question. |
| The Hedge | Qualifies everything. Owns nothing. |
| The Blade | Sharp, clear, cold. Lands and leaves. |
| The Anchor | Slow, low, certain. Wins rooms, loses pace. |
| The Current | Warm and directed. The target archetype. |

---

## 4. Modes: training as games

Each mode trains an axis. Each has a score, a personal best, and a cohort percentile. New modes unlock with tier, which is the progression system doing double duty as a reason to keep going.

### 4.1 The Read (core, free once)
The 60-second video prompt. Prompt library of 120 situations across Work, Social, Dating, Family, Public: "Tell the hiring manager why you." "Explain to your friends why you're leaving early." "Introduce the person next to you."

### 4.2 Pressure Rounds (unlocks at Faint)
Three-second countdown, a surprise prompt, twenty seconds to answer. Measures first-sentence speed, fillers under stress, and whether you finish strong. Five rounds per set; the fifth one Poise interrupts you mid-sentence. Scored on Composure.

### 4.3 Read the Room (unlocks at Faint)
Timed judgment quizzes, ten seconds a question. Three formats:
- **Call it:** a short scene described or shown; choose what to do.
- **What she meant:** a line of dialogue; pick the real meaning.
- **Who holds it:** a group photo or clip; tap the person the room is deferring to.

Answers are scored against a panel-calibrated key, not against Poise's opinion. Percentile shown. Scored on Read.

### 4.4 Holding Silence (unlocks at Present)
Look into the lens for fifteen seconds and say nothing. The app counts breaks in eye contact, blinks, swallow-and-smile reflexes, and fidgets. Most men fail this the first time. It is the most shared clip in the app because it is funny and humbling. Scored on Presence.

### 4.5 Cold Open (Pro)
Live roleplay with Poise in voice. She plays the stranger at the bar, the interviewer, the landlord, the friend who is annoyed with you. You speak; she answers in character within two seconds; three to five turns; then she drops character and reads you. Scored across all axes. This is the feature people describe to friends.

### 4.6 Reference Read (Pro)
Upload a clip of someone whose presence you want (a speaker, an actor, a friend). Aura measures them on the same axes and shows the gap per axis, then builds you a two-week drill plan to close the widest one. Clips are analysed and deleted; nothing of the reference is stored beyond the numbers.

### 4.7 Duets (unlocks at Present)
Send a prompt to a friend. You both record the same Read. Verdicts are revealed side by side. Loser buys drinks. This is the acquisition loop: a duet invite is a free Read for the invitee.

### 4.8 The Gauntlet (daily)
One Pressure Round, one Read the Room, one micro-drill, four minutes. Completing it keeps your **Streak** and feeds the **Standing** (below). Missed days can be covered by a Freeze, one per week on Aura+.

### 4.9 Seasons and Standing
Monthly seasons. Each season you are placed in a league of fifty men of similar Index. Standing is your rank in the league, driven by Gauntlet completion and Index movement, not raw Index, so a Static user who trains hard beats a Magnetic user who coasts. Top ten promote. Season end sends a report card with your Mark's before and after.

---

## 5. Poise: behaviour specification

Poise is the product's personality. Everything else is instrumentation.

**Voice.** Standard American woman, low and unhurried, with a slight edge of amusement. Not breathy, not an assistant. She sounds like someone who has seen a thousand of you and is still interested in this one.

**Rules of speech**
- Specific or silent. Every claim cites the evidence: the timestamp, the count, the word. "You said 'just' four times in forty seconds. Three of them were in your first sentence."
- Three tells, one drill. Never a list of ten things. Attention is the budget.
- Credit is earned and named. "Your pace held. Last week it didn't." Praise without evidence is banned.
- She remembers. Every verdict references the last one. Continuity is what makes her feel like a coach rather than a tool.
- No slang from the manosphere. No "alpha", "sigma", "mog", "king", "rizz". No emojis. No exclamation marks.
- She never comments on what cannot be trained: face, height, body, race, voice timbre. Posture, grooming, stillness, pace and words are fair game because they move.
- Two intensity settings, user-chosen: **Straight** (default) and **Unsparing** (unlocks after three Reads, so people choose it after they trust her). Unsparing removes the softening sentence, not the evidence rule.

**Safety rails** (hard, in the system prompt and checked on output)
- 18+ only. Onboarding gate plus App Store rating.
- If a user's transcript shows distress, self-harm language or spiralling about appearance, Poise breaks character once, says one plain human sentence, surfaces resources, and the session ends without a score.
- No scoring of other people from uploaded clips except via Reference Read, which returns axis numbers only and never a verdict about the third party.

---

## 6. The model: how judgment is produced

Honest statement: Aura does not ship a custom-trained neural network on day one. What it ships is better for a solo founder and gets to a fine-tuned model later with real data.

1. **Measured signals** come from deterministic code (Deepgram, librosa, MediaPipe). They are the facts.
2. **A calibrated rubric** turns facts into axis scores with fixed anchors ("filler rate >6 per minute = Voice ≤45") so that scoring is consistent run to run and cannot be charmed.
3. **Claude (Sonnet for speed, Opus for the weekly Re-read)** receives the facts, the rubric, the user's history, and twelve anchor examples of verdicts at each tier. It writes the three tells, the drill, and Poise's script. It is forbidden from inventing a number that was not in the facts.
4. **Consistency guard.** Every verdict is run through a second, cheap check: does each tell cite a fact? Does the drill target the lowest axis? Is any banned word present? Fail → regenerate.
5. **Data flywheel.** Every Read, with consent, stores facts + verdict + the user's next-week delta. After ~5,000 Reads that becomes a fine-tuning set where the label is *what actually improved people*, not what sounded clever. That is the moat: a judgment model trained on outcomes.

---

## 7. Retention design

Designed around the four moments where subscription apps die.

| Moment | What usually happens | What Aura does |
|---|---|---|
| **Minute 3** (first verdict) | Generic feedback; user shrugs | Blurred verdict with the first tell visible in full. The tell is specific enough to sting. Unblur is the paywall. |
| **Day 2** | No reason to return | The drill Poise assigned expires in 24 h. Push at the time of day the user did their Read: "Your drill closes at 9. It's the 'just' one." |
| **Day 7** | Novelty gone | Sunday Re-read. The same prompt, the delta, the Mark animating from last week's shape to this week's. This is the hook, and it is unavoidable: the Re-read is the only way to update your Index. |
| **Day 30** (first renewal) | "I don't use it" | Season report card arrives three days before renewal: before/after Mark, tells cleared, league finish. Cancel flow offers a Pause (two weeks, Index frozen) before it offers cancellation. |

Additional loops
- **Tells cleared.** You have three named tells at any time. Clearing one (two consecutive Reads without it) is a full-screen moment with haptic and Poise's voice. Then a new tell is assigned. Infinite ladder, always three rungs long.
- **Witness.** Let one friend see your Index and Streak. Social accountability without a feed.
- **Poise messages.** Two pushes per week in her voice, generated from the user's data, never templated. "You skipped Tuesday. Your pace slipped Wednesday. Coincidence."
- **Share card.** Mark + tier + one line from Poise. Cobalt, engraved, no app-store branding. Looks like a gallery poster, posts well.

---

## 8. Monetisation ladder

| Tier | Price | Includes |
|---|---|---|
| **Free** | — | One Read (blurred verdict, first tell visible), Read the Room ×3/day, Mark preview |
| **Aura+** | $6.99/week, $39.99/year (anchor), 3-day trial | Unlimited Reads, full verdicts, Poise voice, Gauntlet, Pressure Rounds, Holding Silence, Duets, Seasons, Freeze |
| **Aura Pro** | $14.99/month or $89/year | Everything in Aura+ plus Cold Open, Reference Read, Deep Read monthly, Unsparing mode, priority processing |
| **Deep Read** (one-off) | $9.99 | Five-minute Read, full written report across all axes, 14-day plan. Sold to free users after the first verdict and to Aura+ users as an upsell |
| **Coaches** (later) | 20–30% take | Marketplace of vetted presence coaches selling async reviews of your Reads |

Revenue mechanics, with the numbers to watch
- Headline is weekly. Weekly trial-to-paid runs higher because the number is small; annual is the anchor that makes weekly look cheap.
- Paywall after the first verdict, not before: conversion from a specific sting beats conversion from a promise.
- Trial rescue on day 2 (not day 3): "Here's the tell you haven't seen yet."
- Cancel flow: Pause → annual at 40% off → cancel. Each step is a real offer.
- Targets: trial→paid >40%, week-one renewal >60%, month-one retention >45%, payback <30 days, Pro attach >12% of Aura+.
- Instrumentation (PostHog): every screen, every paywall impression, every verdict unblur, Sunday Re-read completion, drill completion, cancel-flow step reached. The Sunday Re-read completion rate is the single north-star metric; it predicts renewal better than anything else.

---

## 9. Acquisition

Built into the product rather than bought.
- **Holding Silence clips** and **Duet reveals** are native short-form content; the app exports a vertical clip with the Mark overlay.
- **Pressure Round prompts** are posted daily to TikTok/Reels as "could you answer this in 20 seconds" with the app's cobalt frame. Comments are the funnel.
- **Creator Reads.** Invite ten looksmax/presence creators to be read on camera by Poise. The verdict is the content; the invite link is a free Deep Read.
- No paid ads until organic CAC is known.

---

## 10. Build order

1. Design system, Mark, navigation shell *(now)*
2. Read → pipeline → verdict, end to end on real clips *(week 1–2)*
3. Onboarding, home, drill, progress, paywall *(week 3)*
4. Pressure Rounds, Read the Room, Holding Silence, Sunday Re-read *(week 4)*
5. TestFlight to 30 men; tune the rubric on their Reads *(week 5)*
6. Duets, Seasons, Poise messages *(week 6–7)*
7. Cold Open, Reference Read, Deep Read *(Pro, week 8–10)*
8. Coaches marketplace once there are 2,000 paying users

---

## 11. Legal and trust

- 18+ gate; App Store 17+ rating.
- Biometric consent screen before the first Read (BIPA, Texas CUBI, Washington): video is processed for measurement, face templates are never stored, clips auto-delete at 30 days, delete-everything in settings, nothing biometric used for ads.
- Apple guidelines 2.5.14 (camera purpose string), 5.1.1 (data collection), 5.1.2 (data use). No health claims.
- Poise disclaimers in onboarding: this is training feedback, not therapy or clinical assessment.
