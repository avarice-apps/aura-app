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

