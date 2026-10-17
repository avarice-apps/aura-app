"""The Mirror's lab report: what was measured on a take, each with a reference band and what it means.

Everything here is computed from the recording (word timings, pitch, loudness, face landmarks), never judged by a
model. Bands are labelled by where they come from:
  "research"  a published finding (sources in REFS, shown on "How Kleos measures")
  "kleos"     Kleos's own working threshold, tuned on practice takes; honest about not being a population norm
A take that can't support a measure (too short, no face found) leaves it out rather than guessing.
"""
from __future__ import annotations

REFS = {
    "fillers": {"title": "Enfield, How We Talk (2017): in English conversation, uh or um is about 1 in 50 words for men and 1 in 70 for women", "url": "https://marginalrevolution.com/marginalrevolution/2017/12/facts-uh-um.html"},
    "interview": {"title": "Naim, Tanveer, Gildea & Hoque (2015), Automated Analysis and Prediction of Job Interview Performance: fluency, fewer fillers and smiling predicted ratings", "url": "https://arxiv.org/abs/1504.03425"},
    "charisma": {"title": "Skarnitzl & Hledíková (2022), Frontiers in Psychology, reviewing charisma research: wider melodic range, more emphatic accents and fewer disfluencies go with higher ratings", "url": "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.857647/full"},
    "gaze": {"title": "Rogers, Speelman, Guidetti & Longmuir (2018), Scientific Reports: people look at a partner's face about 71% of the time while speaking and 90% while listening", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC5844880"},
    "thin": {"title": "Ambady & Rosenthal (1993), Half a Minute: impressions from silent clips under a minute predicted end-of-term ratings", "url": "https://doi.org/10.1037/0022-3514.64.3.431"},
}


def _m(key, label, value, display, band, scale, source, note, low_note, high_note, ref=None, better="in"):
    lo, hi = band
    status = "low" if value < lo else "high" if value > hi else "in"
    return {
        "key": key, "label": label, "value": round(float(value), 3), "display": display,
        "band": [lo, hi], "scale": list(scale), "status": status, "source": source,
        "note": note if status == "in" else (low_note if status == "low" else high_note), "ref": ref,
    }


def measures(voice: dict, presence: dict) -> list[dict]:
    v, p = voice or {}, presence or {}
    out = []
    words = int(v.get("word_count") or 0)
    dur = float(v.get("duration_s") or 0)
    sentences = max(1, int(v.get("sentence_count") or 0))
    if words >= 15 and dur >= 6:
        wpm = float(v.get("wpm") or 0)
        out.append(_m("pace", "Pace", wpm, f"{round(wpm)} wpm", (130, 175), (70, 230), "kleos",
                      "An easy pace to follow.",
                      "Slow enough to sound unsure or to lose them.",
                      "Fast enough to sound rushed; a beat between thoughts would land more."))
        fper = 100 * int(v.get("filler_count") or 0) / words
        out.append(_m("fillers", "Fillers", fper, f"{fper:.1f} per 100 words", (0, 2.0), (0, 8), "research",
                      "Fluent: at or under everyday conversation.",
                      "", "More um and uh than everyday conversation; a silent pause does the same job.", ref="fillers"))
        hper = 100 * (int(v.get("hedge_count") or 0) + int(v.get("apology_count") or 0)) / words
        out.append(_m("hedges", "Hedges and sorries", hper, f"{hper:.1f} per 100 words", (0, 1.5), (0, 8), "kleos",
                      "You said things plainly.",
                      "", "Softeners (kind of, I guess, sorry) are taking the edge off what you mean."))
    if words >= 15 and float(v.get("pitch_variance") or 0) > 0:
        st = float(v.get("pitch_variance") or 0)
        out.append(_m("melody", "Pitch movement", st, f"{st:.1f} semitones", (1.4, 4.2), (0, 7), "research",
                      "Your voice moves: it carries meaning, not just words.",
                      "Flat: the voice stays on one note, which reads as bored or nervous.",
                      "Very wide swings; it can sound performed.", ref="charisma"))
    if dur >= 6:
        lp = float(v.get("longest_pause_s") or 0)
        out.append(_m("pause", "Longest pause", lp, f"{lp:.1f} s", (0.4, 1.6), (0, 4), "kleos",
                      "Pauses used as beats, not as getting lost.",
                      "No real pause anywhere: the listener never gets a beat.",
                      "A long silence mid-thought; it reads as losing the thread."))
        fw = float(v.get("first_word_s") or 0)
        out.append(_m("start", "First word", fw, f"{fw:.1f} s", (0, 1.2), (0, 4), "kleos",
                      "You started without hesitating.", "", "A slow start; the first second is when people decide to listen."))
    if int(v.get("sentence_count") or 0) >= 2:
        up = 100 * int(v.get("upward_endings") or 0) / sentences
        out.append(_m("uptalk", "Rising endings", up, f"{round(up)}% of sentences", (0, 25), (0, 100), "kleos",
                      "Statements end like statements.", "", "Sentences end on a rise, so statements sound like questions."))
        fade = 100 * int(v.get("fade_endings") or 0) / sentences
        out.append(_m("fade", "Fading endings", fade, f"{round(fade)}% of sentences", (0, 25), (0, 100), "kleos",
                      "You land your sentences.", "", "The ends of sentences drop to a murmur, which is where the point usually is."))
    if p.get("available") and float(p.get("face_found_ratio") or 0) >= 0.5:
        ec = 100 * float(p.get("eye_contact_ratio") or 0)
        out.append(_m("eyes", "Eyes on the lens", ec, f"{round(ec)}% of the take", (60, 100), (0, 100), "research",
                      "You held the lens: to whoever watches, that's eye contact.",
                      "Your eyes kept leaving the lens; on camera that reads as avoiding the person watching.", "", ref="gaze"))
        if dur >= 6:
            breaks = float(p.get("contact_breaks") or 0) / dur * 60
            out.append(_m("darting", "Look-aways", breaks, f"{breaks:.0f} per minute", (0, 8), (0, 30), "kleos",
                          "Steady eyes.", "", "Eyes darting on and off the lens; it reads as restless."))
        sm = 100 * float(p.get("smile_ratio") or 0)
        out.append(_m("smile", "Smiling", sm, f"{round(sm)}% of the take", (8, 70), (0, 100), "research",
                      "Some warmth showed, which helps people warm to you back.",
                      "Almost no smiling; neutral can read cold to strangers.",
                      "Smiling nearly throughout; in serious moments it can read nervous.", ref="interview"))
    return out


def summary(ms: list[dict]) -> dict:
    """How many measures sit in their band, for the headline line."""
    return {"in": sum(1 for m in ms if m["status"] == "in"), "total": len(ms)}
