## 2026-10-15 (late night): live voice, dial opening, Marble screens (commits 93b761a → acc95c9)

### Live full-duplex conversation (the core)
- **Architecture:**
  - ElevenLabs Agents carries the real-time audio: streaming speech-to-text, turn-taking, interruptions both ways, streamed voices.
  - **Our server is the brain:** the agent's custom LLM points at `/llm/v1/chat/completions` on the Kleos server, so every character reply comes from `converse.stream_turn`. That covers inner state, delivery awareness, tone and twists.
  - One shared "Kleos Live" agent, created automatically. Auth is on. Each session overrides the prompt (a session tag), the first line and the voice.
- **Latency:** replies stream in about 1–1.5 s, and speech starts on the first words.
- **After hang-up:** the server pulls the recording, slices out your turns, runs the full voice analysis, then Poise evaluates.
- **Bug fixed — "Sorry, say that again?":**
  - Cause: the model was spending its entire output budget on thinking and returning no text.
  - Fix: thinking is off for characters, and evaluation calls get headroom.
  - Poise's evaluation no longer fails on invalid JSON.
- **Builds:**
  - Live voice needs a development build: ElevenLabs React Native SDK + LiveKit WebRTC.
  - Expo Go and offline mode automatically fall back to turn-based voice.
  - `npm run build` installs on a USB-connected iPhone (Xcode needed).
  - expo-doctor passes 21/21.
- **App assets:** a new Kleos app icon (marble head in blue rays) and a white splash.

### Opening: one reactive scene
- The statue sits at the centre. Dragging anywhere turns it like a dial, edge-on, into the next figure, and the words change in place. The rays spin with your finger, tilt leans the statue, and tapping the right side advances.
- Step 1 is the dictionary entry: Kleos / κλέος /ˈkle.os/ KLEH-oss / "what is heard of you." The rest of the sequence is:
  - "You're read in seconds."
  - "It isn't your face."
  - "Aura is trainable."
  - "Build what's heard of you." → Begin

### Marble screens (Rafael's references, blue for black)
- **Tabs:** Today · Train · Poise · Library · Progress. You opens from the avatar on Today; Aura Scan lives in Train.
- **Poise:** a chat. Your story appears as a blue bubble. Poise replies with the headline, an aura ledger and a Next-time box, then three chips:
  - "What should I have said?" (the new `said_instead` field)
  - "Replay it as a roleplay": a live scene rebuilt from your story (new `scene` field)
  - "Make it a drill"
- **Library:**
  - a Presence Path program card;
  - Rooms: side quests grouped by setting, each with a statue;
  - Codes: 10 two-minute reads (Drop the sorry, Say the specific thing, Entering a group, The pause, Saying no, When you're losing someone, Taking a roast, Land the ending, Eye contact, Money conversations).
- **Progress:**
  - an Index line chart (4W / 8W / All), using a rolling mean of three takes;
  - skill bars with their change since the previous five sessions;
  - tiles for Laurels and Tells cleared (a pattern absent for three sessions counts as cleared);
  - the patterns still showing.
- **Situations:** the statue sits inside the scene card, answers are lettered A–D, and the timer is blue.
- **Missions:** their own screen. "I did it" opens a mission debrief in the Poise chat.

### How to run
- **Daily:** run `npm run dev`. It starts the tunnel, the server and the Kleos Live agent (re-pointed at the new tunnel each run), plus Metro.
- **First time only:** run `npm run build` with the iPhone plugged in. It needs Xcode and your Apple ID for signing.

## 2026-10-15 (day): v4: open-ended scenes, Daily Side Quests, brutal honesty, Hermes prints (commits c9cb0db → b033261)

### Conversation
- **No auto-hangup.** The old build ended the call after three turns ("Poise is reading it back" while you were still talking). The call kept running in the background too, which held the mic and broke the Poise chat (the "…").
- **Open-ended scenes.**
  - Scenes escalate through written beats, one about every two turns.
  - Other people join in their own voices: ElevenLabs multi-voice, with nine voices on the agent.
  - Characters can walk off.
  - You end the call when you want your read.
- **Voices:**
  - Expressive `eleven_v3_conversational`, with a fallback to Flash.
  - New, more natural voices for the cast.
  - Characters use [laughs] and [sighs] sparingly.
  - Asterisk stage directions are stripped out.
- **Open Floor:** 10 continuous scenes (bar, party, her parents, an interview that turns, the bill, the roommate, a slipping date, networking, plus two 18+).
- **Daily Side Quest:** 28 surprise characters, one per day and the same for everyone. Examples:
  - the prophet of the 6 train (Epstein from another planet);
  - her "friend" at the club;
  - a returns clerk;
  - a crypto Uber driver;
  - your ex in aisle 7;
  - a street interview ("rate yourself");
  - a bouncer;
  - a barber;
  - a drunk girl who thinks you're her ex;
  - "you dinged my truck";
  - an AI-essay accusation;
  - an MLM pitch;
  - her dad at the door;
  - …and more.
  The first word you hear tells you who it is.
- **Robustness:**
  - A reply is committed only when it finishes, so an interrupted reply leaves no trace.
  - Silence gets an in-character reaction.
  - A mid-call error hangs up and reads what it has.
  - The read-back runs as a background job and the app polls for it.
  - "Try the read again" is offered if the read fails.

### Honesty
- **Scoring:**
  - The evaluator judges **how it landed** (35% of the score) and **effort** (real / half / trolling).
  - Caps: trolling ≤ 18, half effort ≤ 42, very short answers ≤ 40, and if they walked off on you ≤ 45.
  - Delivery gets no credit when no audio was measured.
  - Strengths can be zero, and every read opens with a one-line verdict.
- **Tested:** five nonsense answers scored 18 ("trolling"). A decent bar conversation that fished for compliments scored 52.
- **Unfiltered Poise is brutal.** It swears when earned and roasts what you did, never who you are. Sample read: "That was cooked. You said sorry four times… costs you fuck all."

### New features
- **Rate a Clip:** any video from your camera roll. Six frames plus the transcript go to Claude, which returns a beat-by-beat aura replay (+120 / −200…), a tier, a TikTok caption and what would have saved it. Behaviour only, never looks.
- **Profile Read:** Instagram screenshots (Instagram blocks link fetching). Returns:
  - a score and tier;
  - a first impression;
  - per-part scores (profile picture, bio, grid, captions) with fixes;
  - a bio rewrite;
  - three fixes in order;
  - "your page sounds like" a song.
- **Aura Scan → Aura Farm** (Farm-off for groups).

### Look
- **Hermes-style prints:**
  - 16 public-domain works (Cleveland Museum of Art, CC0): Roman and Greek heads, Apollo, and Sargent/Tissot-era "old money" portraits.
  - Each is processed into electric-blue duotone, ordered-dither grain, scanlines, rays and slight misregistration with `scripts/kleosify.py`.
  - The statue cut-outs were re-rendered in the same grain.
  - Nude figures are cropped above the waist.
- **Onboarding:**
  - Five swipe pages, all blue.
  - The print turns edge-on into the next as you swipe, drifts, leans with the phone and catches a light sweep.
  - The words sit in their own band below the art and are never covered.
- **Blue art cards** on Today (Index), Train (Open Floor), Library (Program), Aura Farm, and every result hero, built to screenshot.
- **Sounds:** navigation and tap sounds are gone, replaced by light haptics. Result sounds play at a lower volume.

### Run
- `git pull`, then `npm run dev`. No rebuild is needed: no new native modules.
- dev.sh now updates the server's Python packages when they change and checks for ffmpeg (`brew install ffmpeg`).

