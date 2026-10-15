# Aura — feature set v3 (2026-10-14)

This version merges the original product system with Astra's review, which we took selectively. The rule throughout: **a few excellent loops, not thirty features.**

## The signature loop

**Enter a situation → respond out loud → meet a believable challenge → get precise feedback → change one thing → try again → hear the difference.**

The second take is the product. It turns "an app judged me" into "this made me better in two minutes." That is why it is free in onboarding and is the moment right before the paywall.

## Onboarding: the first five minutes decide the purchase

Canvas row "Onboarding" has eight screens.

1. **Hook.** A statue with the Mark behind it. Copy: "Find out how you come across. Then change one thing and hear the difference." No account.
2. **Goal and mode.**
   - Goal: dates, interviews/work, rooms/parties, or holding your ground.
   - Mode: **voice only** (the default, low friction) or voice + camera.
3. **Read three rooms.** Three timed Situations from the library, answered by tap, with sounds. This hooks the user in 45 seconds without asking for a mic.
4. **Live: Mara asks.**
   - The user meets Mara, a warm and curious character, who asks "So what do you actually do?" and follows up on the user's actual answer.
   - Pressure is Easy. Audio only.
5. **First result.**
   - An archetype for *this answer*, plus a score labelled "this read". It reads the answer, never the person.
   - Two strengths and **one change**, with a timestamp and a replay button.
   - Poise can speak the result.
6. **Retry.** The same question with the one change shown, plus an example line.
7. **Before and after.**
   - The score delta (e.g. 48 → 61) and both transcripts.
   - **Mara's reaction to each take**, generated blind to which take is the retry. An illustration; the recordings are the evidence.
   - Measured changes (hedges 3→0).
   - Share the before/after, or **challenge a friend**.
8. **Paywall.**
   - Headline: "Your interview week is ready", a 7-day plan built from the two takes.
   - Pricing: yearly with 3 days free (default) and monthly. A one-time Event Prep pack for people who won't subscribe.

## Launch feature set (v1)

| # | Feature | Notes |
|---|---|---|
| 1 | **Live conversations** with a cast of six | Mara (warm), Theo (skeptic), Dev (talker), Julian (reserved, senior), Ines (distracted), Kai (direct).<br>Speech-to-text, then Claude, then the ElevenLabs voice, with follow-ups to what you actually said.<br>Content: 12 Rooms in `content/live.json`. |
| 2 | **Pressure levels** | Easy, Real, Heat. Shorter windows, an interruption, skeptical follow-ups, a plot twist at Heat.<br>**A deliberate pause of up to 2.5 s is never penalised**; filled pauses are. |
| 3 | **Situations** | 80 written and checked (`content/situations.json`), 8 categories, 3 difficulties, each with aura +/− per answer, the why, and a one-line Code.<br>Sounds on select, right and wrong. |
| 4 | **Feedback with replay** | Two strengths and one change.<br>Every claim cites words or timestamps. Observable facts (pace, fillers) are kept separate from interpretation ("read as hesitant"). |
| 5 | **Instant retry and compare** | Available everywhere, not just in onboarding. |
| 6 | **Aura profile** | The Mark, the Index, five axes (Voice, Presence, Command, Composure, Social Awareness) and an archetype.<br>The archetype is clearly entertainment; the axes are measured.<br>Several valid styles: quiet-deliberate can score as high as warm-expressive. |
| 7 | **Ask Poise and the Aura Ledger** | Describe a real moment and get +/− per beat, a net score, and "next time".<br>Can turn the moment into a drill or a roleplay. |
| 8 | **Sunday Re-read** | A comparable weekly benchmark under the same conditions. It is the only thing that moves the Index. |
| 9 | **Programs** | A 7-day program generated from the onboarding goal. Each session has one objective and takes 3–5 minutes. |
| 10 | **Aura Offs** | A friend gets the same prompt; results unlock only when both have submitted.<br>Categories: best intro, best recovery, clearest answer.<br>Compares the performance on the task, never the person. |
| 11 | **Share cards** | Result only, before/after, or a clip. Every card carries a "Try this situation" link.<br>Users never have to share the video. |
| 12 | **Referrals** | Both people get a premium Room once the invitee **completes** a first session. Capped. |
| 13 | **Audio-only mode** | The default. Camera adds eye contact and posture. |
| 14 | **Privacy controls** | Private by default; delete everything in one tap; separate consent for sharing, human raters and training. |
| 15 | **Sounds and haptics** | tap, select, correct, wrong, tick, reveal, cleared (`assets/sounds`). Respects the silent switch. |

## Next (weeks 6–10)

- **Recovery Lab.** Simulated blank-outs, interruptions and flat jokes, scored on the reset.
- **Plot Twist conversations** and **Hold Your Point** (pushback on a boundary).
- **Same Words, Different Presence.** One line delivered warm, decisive and playful; Poise demonstrates each.
- **Intent vs impression.** Choose the impression you want before a session and compare after.
- **Event Prep.** "Interview tomorrow at 10" produces a rehearsal tonight and a 5-minute warm-up an hour before; the next morning brings a debrief Ledger.
- **Fit & Posture check.** One monthly photo, posture plus fit notes. Kept light: no wardrobe system.
- **Rematch with one adjustment** after an Aura Off, with awards for "most improved".
- **Personal highlights.** Save your best takes and build an optional progress montage.

## Later or experimental

Group conversations (2–3 voices), blind friend comparison of two takes, a remembered practice partner, creator scenario packs, gift passes, a coaches marketplace.

## What we took from Astra, and what we didn't

**Taken:**
- Retry and compare as the core of onboarding.
- Audio-first, low-pressure entry.
- Distinct personalities.
- Pauses aren't penalised.
- Answer-to-unlock Aura Offs.
- Referral rewards on completion, not install.
- Practice points kept separate from scores, and no score inflation from usage.
- Several valid styles.
- No invented percentiles: "top 38%" is removed until there's a real population behind it.
- Measure retry rate, transfer to new prompts, and scoring consistency.

**Not taken, or changed:**
- *"Monthly only, no weekly."* For revenue, the category standard (yearly with trial, plus monthly; competitors also sell weekly at about $5) wins.
  - We launch **yearly-with-trial and monthly**, and test weekly as an A/B arm instead of ruling it out.
  - Every price is a hypothesis.
- *"No outfit/appearance feature."* Appearance is half of what the looksmax audience wants, so we keep a light monthly Fit & Posture check.
  - It stays a check, not a wardrobe product.
  - It never scores faces or bodies, only posture, fit and grooming choices.
- *"Thirty-five features."* Most are good ideas as *content* inside the live-conversation engine (Recovery Lab, Plot Twist, Pause Challenge and Hold Your Point are all Rooms with a twist), not separate products.
  - That keeps the app from becoming clunky.

## Viral surfaces (v1.1): back camera, uploads, share formats

Canvas row "Viral surfaces" has the mockups.

### Aura Scan: back camera, game interface
- Point the phone at a friend. They get a prompt ("Convince the table to go out tonight", 15 s) and answer.
- The live display shows:
  - the Mark's rays reacting to their voice;
  - pace, fillers, stillness and posture readouts;
  - floating "+40 AURA" chips as moments land.
- The result is a trading-card reveal: score, tier, archetype, stat bars and the best moment.
- **Party Mode:** pass the phone around, everyone answers the same prompt, and there's a leaderboard for the night. Awards go beyond the winner ("best recovery", "funniest") so that losing is fun.
- **Why it spreads:** the person filmed is someone else, so the video is entertainment and not self-exposure. The scan display is the ad.

### Upload a clip
Users can upload a toast, a presentation, a Hinge voice prompt, a TikTok they posted, or a voice note before sending it.
- The same analysis runs.
- Up to 3 minutes. Video, or audio only.

### Share formats
- **Aura Receipt.** Any Ask Poise story becomes a receipt with aura points per moment and a total. It speaks the meme language ("-200 aura") at share-card scale. The in-app Ledger stays at precise scale.
- **Scan card and before/after clip.** A vertical video with the Mark overlay and captions.
- **"Can you beat the greats?"** Deliver famous public-domain lines (e.g. JFK, 1962) and compare against Poise's breakdown of the original. This is editorial: the famous clip is never run through the biometric pipeline.

### Guardrails (these keep the app in the App Store and out of court)
1. **Only consenting adults are scored.**
   - Before any back-camera scan, the subject taps "I'm in, I'm 18+" on the screen (or says it in Party Mode, and it's logged).
   - No consent, no score.
2. **Prompt-response format only.**
   - Scans need a person answering a prompt.
   - There is no "rate this stranger" mode and no scoring of crowds or of people in the background.
   - This also makes secretly filming someone pointless.
3. **Never appearance.**
   - Delivery, composure, posture and words only.
   - No looks or attractiveness ratings, ever. This matters for Apple review and for harassment risk.
4. **Uploads of other people:**
   - The uploader confirms they're the person in the clip or have the subject's permission.
   - Non-account-holders get **delivery-only mode**: audio plus body pose, and no face mesh.
   - The clip is deleted right after scoring.
5. **Data handling.**
   - No face templates.
   - Clips aren't kept unless the user saves their own.
   - Nothing from a scanned friend is used for training unless that friend opts in from their own account.

### More ideas (backlog, ranked by virality × retention)
1. **Draft check.** "How does this text / voice note come across?" before sending it to a date or a boss. Daily utility; Poise rewrites it in three tones.
2. **Walk-in.** A friend films you entering a room. Posture and pace give an "Entrance" read. Good for ads ("aura-rating how I walk into a party").
3. **Pickup line / opener lab.** Opener plus delivery scored live, respectful only, with a "how she might hear it" reaction.
4. **Aura Wrapped.** A monthly recap reel: best moment, most improved, archetype shift.
5. **Statue series (content, not a feature).** Aura-scanning Greek statues as a running TikTok bit ("2,500 years, zero fillers").
6. **Hinge/Tinder prompt audit.** Text and voice prompts only; photos are excluded.
7. **Group chat mode.** A friend group shares a weekly prompt, and the results unlock when everyone submits.

## Review round 2 (ChatGPT): accepted changes

- **Evaluation hears the audio, not just the transcript.** It already does: pitch, pauses, energy and inflection come from librosa, and fillers come from Deepgram timestamps. Delivery claims must cite these measured facts.
- **Character reactions are generated blind.** The character model is never told that a take is a retry. Some retries will not improve, or will trade one strength for another, and the compare screen says so honestly (e.g. "clearer, but faster"). The reaction is presented as an illustration; the recordings are the evidence.
- **Three layers on every result:** the observable detail, then the interpretation, then the session rating.
  - "Social IQ" is renamed **Social Awareness**.
  - Camera mode says "looking toward the lens", not "eye contact".
- **Onboarding.**
  - A/B test one tap situation against three.
  - The first live prompt matches the chosen goal:
    - dates: "what do you enjoy outside work?"
    - work: "tell me about yourself"
    - rooms: joining a conversation
    - holding ground: decline a request, then handle pushback
  - The paywall headline matches the goal.
  - Camera choice is honoured; voice-only stays the default.
- **Pauses and fillers** are judged by whether they disrupt clarity in context, not by a fixed 2.5 s rule. Game timers are deadlines, not composure judgments.
- **Retry offers "Give me a hint" or "Show an example".** No scripted line by default. A different but related prompt comes later to test transfer.
- **Event Prep stays off the paywall until it ships.**
  - Free users can accept and finish an invited Aura Off, and replay their first comparison.
  - The referral reward is explicit: one premium Room, including its retry.
- **The weekly benchmark** can be taken any day (Sunday is a suggestion). The first Index is labelled provisional; personal progress is the main comparison.
- **Metrics** get explicit denominators. Added: voice response latency, failed sessions and unexpected interruptions. Trial conversion counts successful charges, with refunds tracked separately.

## Metrics that decide whether to expand

| Metric | Target |
|---|---|
| Onboarding completion (hook to compare screen) | >55% |
| Retry rate after the first result | >70% |
| Trial start at paywall | >12% of onboarding starters |
| Trial → paid | >40% |
| D7 return | >25% |
| D30 return | >12% |
| Weekly Re-read completion | >50% of weekly actives |
| Same-clip score variance across runs | ≤3 points |

Also tracked: cost per completed analysis and per paying user, and completed Aura Offs per sharer.
