# Kleos data plan: getting real data for the perception model

Written 17 Oct 2026.

## Where things stand

Most of the training system is already built. What's missing is the data.

- **Consent.** The opt-in "Help train Poise" lives in onboarding and in You. Only accounts that opted in on the server have clips kept. Retention is 365 days. Switching it off withdraws everything.
- **Clip store.** `server/training/store.py` already stores Mirror and scan takes from opted-in users.
- **Panel rating.** `/rate`: a rater link, clips under a minute, six 1–7 scales:
  - confident
  - warm
  - nervous
  - clear
  - trust
  - engage
- **Training.** `python -m training.train`:
  - Drops raters whose reliability is low.
  - Reliability-weights the rest.
  - Trains one regressor per dimension with 5-fold CV.
- **Blending.** `training/learned.py` gives the learned model weight only in proportion to how well it predicts held-out panel ratings. Below Spearman 0.35 it gets no weight at all. This is how we can later claim "validated" honestly.

## Done tonight: checking the instrument itself

`server/evals/calibrate_voice.py` generates synthetic speech with one thing changed at a time and runs it through the real pipeline. The variables are pace, fillers, rising endings, pauses, a flat versus lively voice, and fading endings.

It found three real bugs, all now fixed. **7/7 checks pass.**

1. **"like" was counted as a filler when used as a verb** ("I'd like to"). Every clean take scored about 2 fillers per 100 words that weren't there.
2. **Rising endings were nearly invisible.** Questions read as statements rose 4–14 semitones and were still missed. The check now uses word timings and a tuned 3.5-semitone rule.
3. **Fading endings were judged on silence.** The transcript pads the last word with silence, so the check flagged fades in clean speech. It now looks only at voiced frames.

This checks the instrument, not perception. Whether people actually hear these differences is what the rater study is for. Re-run the check after any change to `audio.py`.

## Sources, ranked

### 1. Our own users, opted in (free; scales with the app)
- **Mechanism:** the plumbing is already live.
- **Before launch:** turn the "Help train Poise" wording into a proper written release under Illinois' biometric privacy law (BIPA). It needs four things:
  - the purpose;
  - the retention schedule (12 months);
  - no sale;
  - a public retention policy page.
- **Note:** the Mirror screen now says takes are kept when the user has opted in.

### 2. Paid rater study on Prolific (about $350–450; the validation study)
This is the one that makes "science-based" defensible.

**Collection:**
- 150 participants each record one 30-second Mirror question. Pay about $1.20 for a 3-minute task.
- 3+ raters per clip on the existing `/rate` page, with an attention check on every 10th clip.
- That's about 450–600 ratings, at roughly $0.25 each.

**Budget:** roughly $180 for recording plus $150 for rating, plus Prolific's fee.

**Credibility:** preregister on OSF (free) before collecting. Afterwards, publish:
- inter-rater reliability (ICC);
- how well each Kleos measure correlates with the ratings.

Then the site can say "checked against N ratings from real people", and the "Kleos" ranges can either earn the "research" label or be changed.

**What you'd need to do:**
- Create a Prolific researcher account and add funds. I can't do that, because it involves payment.
- Approve the recording page. I drafted one (kept out of the repo until you decide), with full consent and BIPA wording, 18+, a 12-month retention policy and withdrawal through Prolific. It isn't wired to the server: the endpoint was held back for your decision, because it means collecting face measurements from paid strangers.

### 3. Openly licensed speech, voice only (free; norms and robustness)
- **Mozilla Common Voice** (CC0) and **LibriSpeech** (CC BY 4.0) are read speech.
  - **Good for:** checking that pitch and pace measures hold up across many voices, accents and microphones.
  - **Not good for:** conversational norms.
- **US federal government recordings are public domain.** NASA briefings and congressional hearing audio work as voice-only examples of speaking under pressure. Use the audio only, no face measurement.
- **Conversational corpora:**
  - **Switchboard/Fisher:** LDC licence, paid.
  - **Buckeye:** licence restricts use.
  - **CANDOR:** check its licence before using it.

### 4. Synthetic (done)
- **Use:** only for checking the instrument, never as perception labels.

## What we won't use
- **Scraped YouTube/TikTok/podcast video.** Two reasons:
  - Copyright.
  - Face-derived measurements of people who never consented, which is exactly what BIPA penalises per person.
- **Research-only datasets** (ChaLearn First Impressions, CMU-MOSEI and similar). Their licences forbid commercial use, and most are YouTube-derived anyway.

## Order
1. Run the Prolific study once you set up the account. About a week end to end, including rating.
2. Publish the reliability numbers on `/r/method.html`, and move any range the data supports to "research".
3. Retrain with `training.train` once there are 300+ rated clips. The blend switches on automatically if CV Spearman reaches 0.35.
