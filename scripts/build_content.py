"""Build the scene library and Poise's guidance cards.

Inputs
- content/quests.json (the existing side quests; their ids are kept stable)
- reference/poise-handoff/content/{situations,guidance-cards}.json (editorial drafts, v0.1.0)
- the Kleos pack below (raw nights out, dating, looks talk and street side quests)

Outputs
- content/quests.json: every playable side-quest scene, one schema
- content/guidance.json: the cards Poise retrieves at runtime (never evaluation fixtures)
- content/briefs.json: the style records, as occasion briefs for the look builder
- docs/CONTENT_MERGE.md: what was new, merged or kept, and why

Run: python3 scripts/build_content.py   (idempotent: rebuilds from the inputs every time)
"""
from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAND = os.path.join(ROOT, "reference", "poise-handoff", "content")
VERSION = "0.2.0"

ORIGINAL_IDS = {
    "q-bar-fade", "q-sidewalk", "q-rejected", "q-split-bill", "q-wrong-order", "q-friend-owes", "q-roommate", "q-group-roast",
    "q-ex-at-party", "q-bouncer", "q-number", "q-not-serious", "q-body-count", "q-morning-after", "q-wingman-fail", "q-landlord",
    "q-barber", "q-friend-girl",
}

# Titles that assumed who you date. The person you play against follows your dating preference now.
NEUTRAL_TITLES = {
    "q-bar-fade": "Fading at the bar",
    "q-number": "Asking for the number",
    "q-body-count": "The body count question",
    "q-friend-girl": "Left on read",
    "q-ex-at-party": "Your ex is at the party",
}

# ---------------------------------------------------------------- handoff scenes → the side-quest schema
# category, cast partner, focus lens, optional persona name (the cast member plays someone else), spicy (Unfiltered only)
HAND_MAP = {
    "S01": ("work", "theo", "work", None, False, "The internship interrogation"),
    "S02": ("status", "ines", "rooms", None, False, "The borrowed yacht"),
    "S03": ("friends", "dev", "rooms", None, False, "The table has lore"),
    "S04": ("friends", "mara", "intro", "Sahar", False, "You said their name wrong"),
    "S05": ("friends", "kai", "pushback", None, False, "The outfit tribunal"),
    "S06": ("merge", "q-split-bill"),
    "S07": ("night", "dev", "ground", None, False, "Leaving the party"),
    "S08": ("status", "kai", "rooms", None, False, "The name-drop loop"),
    "S09": ("dating", "mara", "ground", None, True, "Come back to mine"),
    "S10": ("dating", "ines", "dates", None, False, "The interview date"),
    "S11": ("dating", "ines", "dates", None, False, "Four days later"),
    "S12": ("merge", "q-ex-at-party"),
    "S13": ("work", "theo", "work", None, False, "They took your idea"),
    "S14": ("work", "julian", "work", None, False, "Going blank in the update"),
    "S15": ("work", "dev", "ground", None, False, "The extra shift"),
    "S16": ("work", "julian", "work", None, False, "The raise, and the silence"),
    "S17": ("work", "kai", "pushback", None, False, "Wrong Slack channel"),
    "S18": ("work", "ines", "work", None, False, "Make it more premium"),
    "S19": ("work", "theo", "work", None, False, "The fake expert trap"),
    "S20": ("work", "dev", "pushback", None, False, "Talked over in the meeting"),
    "S21": ("friends", "kai", "rooms", None, False, "The group-chat screenshot"),
    "S22": ("friends", "dev", "ground", None, False, "The joke that went too far"),
    "S23": ("conflict", "theo", "pushback", None, False, "The sink summit"),
    "S24": ("friends", "mara", "pushback", None, False, "They went without you"),
    "S25": ("status", "ines", "rooms", None, False, "Where did you summer?"),
    "S26": ("friends", "theo", "ground", None, False, "The accent impression"),
    "S27": ("night", "dev", "ground", None, False, "Why aren't you drinking?"),
    "S28": ("night", "dev", "ground", None, False, "The startup pitch at the party"),
}

# ---------------------------------------------------------------- the Kleos pack (raw, 18+ where marked)
# Every scene: a person with an immediate want, an opening line, one complication, an objective that has more than
# one good answer. Nothing explicit, nothing that rewards pushing past a no.
KLEOS = [
    dict(id="k-afters", title="The afters", category="night", partner="dev", spicy=False, focus="ground",
         setting="3am outside the club. A group you met in the smoking area is going to an afters at someone's flat. Your friend is fading.",
         opener="Yo, we're going to Marco's, ten minutes away. You two coming or what?",
         twist="Your friend says she's going home either way and asks what you're doing.",
         goal="Decide and say it once: in or home, without being pushed or ditching your friend.",
         objective="Make your own call about the afters and say it plainly, accounting for your friend.",
         guidance="Say what you're doing in one line. If your friend is going home alone, that's part of the decision.",
         avoid="I mean I'm down if everyone's down, whatever you guys think.",
         unfiltered="You took a vote on your own night. Pick.",
         ineffective="I mean I'm down if everyone's down, whatever you guys think."),
    dict(id="k-back-to-yours", title="\"Want to come back to mine?\"", category="dating", partner="ines", spicy=True, focus="dates",
         setting="End of a good second date. You're outside the bar, close to their place. It's been easy all night.",
         opener="So... I live like two minutes that way. Do you want to come up?",
         twist="They add, quickly, that it's fine if you'd rather not.",
         goal="Answer honestly. Yes or not tonight, said like an adult, warmly.",
         objective="Give a clear, warm answer to the invitation that matches what you actually want.",
         guidance="A clear yes, or a warm 'not tonight' with a real next plan if you want one. Check in instead of assuming.",
         avoid="Haha I mean... sure? If you want? Or not, whatever.",
         unfiltered="They asked a yes-or-no question and you handed them a maze.",
         ineffective="Haha I mean... sure? If you want? Or not, whatever."),
    dict(id="k-mogged", title="Mogged at the pregame", category="night", partner="kai", spicy=True, focus="rooms",
         setting="Pregame at a friend's place. Someone's very tall, very gym friend walks in and the room reacts. Kai turns to you, grinning.",
         opener="Bro. You just got mogged in your own friend group. How does that feel?",
         twist="Two people start comparing your jawlines out loud.",
         goal="Take the joke without shrinking, sulking or starting a contest you didn't sign up for.",
         objective="Respond to looks-comparison banter with humour or indifference and keep your place in the room.",
         guidance="A light line back, or simply moving the conversation. You don't have to accept the ranking or argue it.",
         avoid="I mean I've been doing mewing for like three months so give it time.",
         unfiltered="You turned a joke into a progress report on your jaw.",
         ineffective="I mean I've been doing mewing for like three months so give it time."),
    dict(id="k-looksmaxxer", title="The looksmaxxer at the gym", category="status", partner="dev", spicy=True, focus="pushback",
         setting="Between sets at the gym. A guy you half know has opinions about everyone's face and wants to share his routine.",
         opener="No offence, but your maxilla is kind of recessed. I could fix your whole face in six months.",
         twist="He pulls up his phone to show you his before-and-after.",
         goal="Stay unbothered. Engage on your terms or end it, without asking for his approval.",
         objective="Handle unsolicited appearance advice without seeking validation or getting defensive.",
         guidance="You can be curious, joke, or close it. A short boundary works: you're good, you're here to train.",
         avoid="Wait, is it really that bad? What should I do?",
         unfiltered="A stranger rated your skull and you asked for the full report.",
         ineffective="Wait, is it really that bad? What should I do?"),
    dict(id="k-rate-me", title="\"Rate me out of ten\"", category="dating", partner="mara", spicy=False, focus="dates",
         setting="A fun first date. Drinks, a little flirting. They lean in with a dare in their eyes.",
         opener="Okay, be honest. Out of ten. What am I?",
         twist="They say 'you can't dodge it' when you try to.",
         goal="Step out of the numbers game with charm and say something real instead.",
         objective="Answer a rating dare playfully without ranking the person or getting awkward.",
         guidance="Turn the number into something specific and true you've noticed tonight. Play is fine; a score isn't required.",
         avoid="Like a solid seven? Maybe seven and a half.",
         unfiltered="They asked you to flirt and you submitted a spreadsheet.",
         ineffective="Like a solid seven? Maybe seven and a half."),
    dict(id="k-vip-table", title="The table minimum", category="night", partner="dev", spicy=False, focus="ground", persona="Rocco",
         setting="The door of a club on a Saturday. The promoter is offering your group of four a table. Your friends look at you.",
         opener="For you guys? Table's fifteen hundred minimum. Bottles included. Trust me, it's worth it.",
         twist="He says the girls at the next table just took one, and gestures at them.",
         goal="Say no, or negotiate, without performing money you don't want to spend.",
         objective="Decide on an expensive offer under social pressure and state it plainly.",
         guidance="Name your number or decline once; no need to explain your finances. Check with your group instead of answering for them.",
         avoid="Yeah no, we're good, we usually just get tables at other places anyway.",
         unfiltered="You invented a richer weekend to avoid saying 'no thanks'.",
         ineffective="Yeah no, we're good, we usually just get tables at other places anyway."),
    dict(id="k-dance-floor", title="\"I'm good\"", category="night", partner="ines", spicy=False, focus="dates",
         setting="The dance floor, 1am. You asked someone to dance. They smiled and said they're good. Five minutes later they come back for a drink at the bar beside you.",
         opener="Hey, sorry, I wasn't trying to be rude earlier. I just really needed water.",
         twist="Their friend, behind them, mouths 'he's cute' a little too loudly.",
         goal="Take it lightly. No sulk, no second pitch unless the door actually opens.",
         objective="Recover from a turned-down approach with ease and read whether there's an opening.",
         guidance="Accept the apology lightly; a short friendly line is enough. If they keep talking, you can try again once.",
         avoid="No it's fine, I get it, I'm not offended or anything, it's fine.",
         unfiltered="'It's fine' three times is not fine.",
         ineffective="No it's fine, I get it, I'm not offended or anything, it's fine."),
    dict(id="k-what-are-we", title="\"What are we?\"", category="dating", partner="mara", spicy=False, focus="dates",
         setting="Three months of seeing each other. Saturday morning coffee in their kitchen. They put the mug down.",
         opener="Can I ask something without it being weird? What are we doing, actually?",
         twist="They say they've stopped seeing other people.",
         goal="Answer the real question honestly, even if the answer is 'I don't know yet'.",
         objective="Have an honest status conversation without dodging, overpromising or panicking.",
         guidance="Say where you are now and what you want next. Uncertainty is allowed if it's said plainly.",
         avoid="I mean, we're having fun, right? Why label it?",
         unfiltered="They asked for a status update and got a philosophy seminar.",
         ineffective="I mean, we're having fun, right? Why label it?"),
    dict(id="k-flatmate-morning", title="The flatmate at 9am", category="night", partner="dev", spicy=True, focus="rooms",
         setting="Sunday, 9am. Your date stayed over. Your flatmate is in the kitchen, making eggs, delighted.",
         opener="Well, well. Good morning. And who do we have here?",
         twist="He asks your date, loudly, how you two met.",
         goal="Be easy about it. Introduce them, keep your date comfortable, don't let him run the show.",
         objective="Navigate an awkward morning-after introduction while looking after your guest.",
         guidance="Introduce your guest by name, keep it short, and steer: coffee, then out. Your guest's comfort comes first.",
         avoid="Haha don't be weird man, this is just... a friend.",
         unfiltered="You demoted your date to 'a friend' in front of the eggs.",
         ineffective="Haha don't be weird man, this is just... a friend."),
    dict(id="k-profile-roast", title="They read your dating profile out loud", category="friends", partner="kai", spicy=True, focus="rooms",
         setting="Pregame. Kai has your dating app open and is reading your prompts to the group in a dramatic voice.",
         opener="'My simple pleasures: a good book and a long walk.' Bro, who are you, a retired dentist?",
         twist="Someone asks to see your photos too.",
         goal="Laugh at it, defend one thing you actually like, and take the useful edit.",
         objective="Take a group roast of your profile with humour, keep one real thing and accept a fair note.",
         guidance="Laugh first, keep one line you mean, take one note. You can stop the photo tour if you want.",
         avoid="Okay give it back, that's not even funny, it's private.",
         unfiltered="Your prompts are getting roasted harder than you are. Fix the prompts.",
         ineffective="Okay give it back, that's not even funny, it's private."),
    dict(id="k-shared-uber", title="The shared ride home", category="night", partner="ines", spicy=True, focus="ground",
         setting="2:30am. You and someone you just met are sharing an Uber. The driver asks where to first.",
         opener="Okay so... do we drop me first, or...?",
         twist="They say 'or we could just go to one place'.",
         goal="Be clear about the plan and comfortable with either answer.",
         objective="Make the ambiguous end-of-night plan clear and respectful of both people.",
         guidance="Ask or say plainly what you want; accept the answer warmly. Clarity is the attractive part.",
         avoid="Ha, I don't know, wherever, you decide.",
         unfiltered="The driver has a clearer plan for your night than you do.",
         ineffective="Ha, I don't know, wherever, you decide."),
    dict(id="k-gym-work-in", title="Can I work in?", category="approach", partner="kai", spicy=False, focus="intro",
         setting="Busy gym. The only free bench is the one someone is resting on between sets, headphones in.",
         opener="Huh? Oh, sorry, what?",
         twist="They say they've got four more sets.",
         goal="Ask clearly, accept the answer, keep it friendly.",
         objective="Make a short, clear request to a stranger and handle the answer without awkwardness.",
         guidance="One sentence: what you want and how long. Then accept the answer either way.",
         avoid="Sorry sorry, never mind, it's nothing, carry on.",
         unfiltered="You took out his headphones to tell him nothing.",
         ineffective="Sorry sorry, never mind, it's nothing, carry on."),
    dict(id="k-delete-photo", title="Delete that photo", category="friends", partner="mara", spicy=False, focus="ground",
         setting="Your friend posted a photo of you mid-sneeze from last night. It already has 200 likes.",
         opener="Oh my god, have you seen the comments? Everyone loves it.",
         twist="She says it's 'iconic' and that you're being dramatic.",
         goal="Ask for it to come down, clearly, without making it a war.",
         objective="Make a direct request about a photo of you and hold it if it's brushed off.",
         guidance="Say what you want once, with a reason if you like. Repeat it calmly if needed.",
         avoid="Haha yeah it's so bad, I mean, you could maybe crop it? If you want?",
         unfiltered="You asked for the photo to go and accepted a crop.",
         ineffective="Haha yeah it's so bad, I mean, you could maybe crop it? If you want?"),
    dict(id="k-red-flag", title="The red flag, casually", category="dating", partner="ines", spicy=False, focus="dates",
         setting="A good third date. Over dessert they mention, breezily, that they still live with their ex. 'It's totally fine though.'",
         opener="Anyway, it's honestly the best flat I've ever had. Why, is that weird?",
         twist="They ask if you'd be okay coming over sometime.",
         goal="Ask one honest question, then decide how you feel, out loud or later.",
         objective="Respond to a potential deal-breaker with curiosity and honesty rather than a joke or a lecture.",
         guidance="Ask the question that matters to you. You don't have to decide in the moment, but don't pretend.",
         avoid="Haha no that's not weird at all, super normal, love that.",
         unfiltered="You approved a living arrangement you clearly hated in real time.",
         ineffective="Haha no that's not weird at all, super normal, love that."),
    dict(id="k-compliment-dare", title="Side quest: the compliment", category="approach", partner="ines", spicy=False, focus="intro",
         setting="Your friends dare you to walk up to someone at the bar and compliment their outfit. Just the outfit. Then walk away.",
         opener="Sorry, hi? Do I know you?",
         twist="They ask, half-laughing, if your friends sent you over.",
         goal="Give one specific, sincere compliment and leave them smiling. No pitch.",
         objective="Deliver a specific compliment to a stranger and exit cleanly.",
         guidance="Name the specific thing, say why it works, then leave. Admitting the dare is fine.",
         avoid="You look really good. Like, really good. Can I get your number?",
         unfiltered="The quest said compliment and leave. You compliment-and-stayed.",
         ineffective="You look really good. Like, really good. Can I get your number?"),
    dict(id="k-street-interview", title="The street interview", category="approach", partner="dev", spicy=True, focus="stories", persona="Jules",
         setting="SoHo, Saturday afternoon. A guy with a mic and a camera operator stops you for his channel. Small crowd watching.",
         opener="Quick one for the page! Rate your own rizz out of ten. And what's your best opening line?",
         twist="He asks you to try the line on someone in the crowd.",
         goal="Be funny and real on camera. Don't cringe, don't fold, don't overdo it.",
         objective="Handle a playful on-camera interview with presence: answer, joke, and set your own limits.",
         guidance="A quick honest answer beats a rehearsed line. You can decline the dare with a laugh.",
         avoid="Uh, I don't know, like a six? I don't really have lines, sorry.",
         unfiltered="Camera on, crowd watching, and you rated yourself a six with an apology.",
         ineffective="Uh, I don't know, like a six? I don't really have lines, sorry."),
    dict(id="k-free-coffee", title="Side quest: the free coffee", category="approach", partner="mara", spicy=False, focus="intro", persona="Lou",
         setting="A busy café. The side quest: make the barista laugh, then ask if your coffee could be free. No pressure, no lying.",
         opener="Hi! What can I get you?",
         twist="There's a queue behind you and the barista glances at it.",
         goal="Make the moment fun, ask once, accept the answer with grace.",
         objective="Make a light, cheeky request of a stranger at work while respecting their time.",
         guidance="Read the queue. One playful line, one ask, then pay happily if it's no.",
         avoid="Can I have it for free? Please? It's for a dare. Please?",
         unfiltered="You asked for free coffee three times. That's not a side quest, that's a hostage situation.",
         ineffective="Can I have it for free? Please? It's for a dare. Please?"),
    dict(id="k-ex-text", title="Your ex calls at 1am", category="dating", partner="mara", spicy=True, focus="ground",
         setting="1am. Your ex calls, a little drunk, after four months of silence.",
         opener="Hey... I know it's late. I just saw something that reminded me of you. Are you up?",
         twist="They say they miss you and ask if you can talk tomorrow, in person.",
         goal="Be kind and clear about what you want, tonight and after.",
         objective="Respond to a late-night call from an ex with kindness and a clear position.",
         guidance="You can be warm and still end the call. Say what you're open to, if anything, plainly.",
         avoid="Yeah... I mean... I don't know... maybe? What do you think?",
         unfiltered="Four months of moving on, undone by 'are you up'.",
         ineffective="Yeah... I mean... I don't know... maybe? What do you think?"),
]

# ---------------------------------------------------------------- house cards that apply across modes

HOUSE_CARDS = [
    dict(id="H01", title="Two good answers", category="assessment", apply_when="Any scored practice scene.",
         goal="Judge the move against the objective, not against one ideal style.",
         guidance="Quiet and deliberate can score as high as warm and expressive. Credit any move that achieves the objective.",
         avoid="Scoring a short, effective answer down for being short.",
         straight="Short worked here. You said the thing and stopped.", unfiltered="That was short because it was finished. Correct."),
    dict(id="H02", title="The other person is not the score", category="assessment", apply_when="A character declines, leaves or stays cool after a reasonable move.",
         goal="Separate the user's choices from the character's outcome.",
         guidance="A clear invitation that gets a no can still be a strong turn. Judge what was said, not whether the character agreed.",
         avoid="They didn't say yes, so it failed.",
         straight="Clear ask, clear answer, clean ending. Their answer isn't your grade.", unfiltered="They said no. You asked well. Those are different columns."),
    dict(id="H03", title="Apologies that work", category="assessment", apply_when="The user apologises.",
         goal="Tell a repairing apology from a reflexive one.",
         guidance="One short apology that repairs harm is a strength. Flag only repeated or self-erasing apologies.",
         avoid="Counting every 'sorry' as weakness.",
         straight="One sorry, then the point. That's how it's done.", unfiltered="You apologised once and moved on. Nobody needed a press release."),
    dict(id="H04", title="Pauses are allowed", category="assessment", apply_when="Silence or a slow first word before a hard answer.",
         goal="Never treat a thinking pause as a weakness by itself.",
         guidance="Flag a pause only if it changed how the answer landed. Accent, speech rhythm and a declined camera are never penalties.",
         avoid="Three seconds of silence means low confidence.",
         straight="You paused, then answered. Nothing to fix there.", unfiltered="A pause is not a confession."),
    dict(id="H05", title="Retries are experiments", category="assessment", apply_when="Run it back or retry-this-moment.",
         goal="Compare equivalent evidence honestly.",
         guidance="Name what changed with quotes. Better, worse or mixed. Never award progress for trying again.",
         avoid="Massive improvement, ten out of ten.",
         straight="Clearer request this time. You still withdrew it when they hesitated.", unfiltered="More words. Same dodge."),
    dict(id="H06", title="Roast the move, never the person", category="tone", apply_when="Unfiltered tone.",
         goal="Keep the sharp line attached to an observed behaviour.",
         guidance="The joke must point at something said or done in the transcript. No looks, body, identity, accent or diagnosis.",
         avoid="You're clearly insecure.",
         straight="", unfiltered="You took a vote on your own night. Pick."),
    dict(id="H07", title="Boundaries are wins", category="assessment", apply_when="The user declines, leaves, or says no.",
         goal="Reward a clear boundary even if the character pushes back.",
         guidance="Holding a no without heat is a strong move. Never reward giving in to pressure as 'easygoing'.",
         avoid="You were a bit rigid; you could have just stayed for one.",
         straight="You said no once and meant it.", unfiltered="Boundary held. They'll survive."),
    dict(id="H08", title="Looks talk, handled", category="scene", apply_when="Scenes or chats about looks, mogging, looksmaxxing or ratings.",
         goal="Coach the response, never rate the person's appearance.",
         guidance="Focus on how they handled the comment. Poise doesn't score faces, bodies or height, and doesn't endorse rankings of people.",
         avoid="Honestly your jawline could use work.",
         straight="You didn't take the ranking and you didn't fight it. That's the move.", unfiltered="A stranger graded your face and you didn't hand in homework. Respect."),
    dict(id="H09", title="A text that does its job", category="draft", apply_when="Reviewing a message before it's sent.",
         goal="Say whether the message does what they want it to, and change only what stops it.",
         guidance="Lead with the point, ask one clear thing, end where a reply is easy. A good draft gets 'send it' and nothing else. Length isn't a flaw if every line earns it.",
         avoid="Great start! Maybe add a bit more warmth and a question and an emoji?",
         straight="It asks one clear thing and stops. Send it.", unfiltered="This is fine. Stop staring at it and hit send."),
    dict(id="H10", title="Their words, their facts", category="draft", apply_when="Rewriting someone's message.",
         goal="Rewrites keep the person's meaning, voice and every commitment.",
         guidance="Keep dates, times, amounts and boundaries exactly. Don't add apologies, excuses, feelings or history they didn't write. Match their register: lowercase stays lowercase.",
         avoid="Hey! So sorry to bother you, I was wondering if maybe Thursday could work instead?",
         straight="Same message, same Friday, half the hedging.", unfiltered="Same deal, same day, minus the grovelling."),
]


def card(id_, title, category, apply_when, goal, guidance, avoid, straight, unfiltered, scene=None, source="kleos"):
    return {
        "id": id_, "version": VERSION, "title": title, "category": category, "status": "editorial_draft_not_empirically_validated",
        "source": source, "scene": scene, "apply_when": apply_when, "goal": goal, "guidance": guidance, "avoid": avoid,
        "straight_read": straight, "unfiltered_read": unfiltered,
        "tone_rule": "Use the sharp line only when the observed behaviour supports it; otherwise acknowledge success or uncertainty.",
        "evidence_rule": "Quote an actual user turn for a performance finding. Scenario setup and fictional private thoughts are not evidence of user ability.",
    }


def main() -> None:
    quests = json.load(open(os.path.join(ROOT, "content", "quests.json")))
    by_id = {q["id"]: q for q in quests["quests"] if q["id"] in ORIGINAL_IDS}
    sits = {s["id"]: s for s in json.load(open(os.path.join(HAND, "situations.json")))}
    hcards = {c["id"]: c for c in json.load(open(os.path.join(HAND, "guidance-cards.json")))}

    merge_rows = []
    out_quests = []
    # 1) the originals, ids unchanged, with neutral titles where they assumed who you date
    for q in quests["quests"]:
        if q["id"] not in ORIGINAL_IDS:
            continue
        q = dict(q)
        q["title"] = NEUTRAL_TITLES.get(q["id"], q["title"])
        q.setdefault("cards", [])
        q["source"] = "kleos-original"
        out_quests.append(q)
        merge_rows.append((q["id"], "kept", "Existing side quest; stable id."))

    # 2) the handoff scenes
    for sid, m in HAND_MAP.items():
        s = sits[sid]
        cid = s["guidance_ids"][0]
        if m[0] == "merge":
            target = next(q for q in out_quests if q["id"] == m[1])
            target["cards"] = sorted(set(target.get("cards", []) + [cid]))
            target["objective"] = s["user_objective"]
            target["branches"] = s["branches"]
            merge_rows.append((sid, f"merged into {m[1]}", "Same situation and objective; the existing scene keeps its id and gains the card, objective and branch rules."))
            continue
        cat, partner, focus, persona, spicy, title = m
        q = {
            "id": f"h-{sid.lower()}", "title": title, "category": cat, "partner": partner, "spicy": spicy,
            "setting": s["setting"], "opener": s["opening_line"], "twist": s["complication"], "goal": s["user_objective"],
            "focus": focus, "objective": s["user_objective"], "branches": s["branches"], "cards": [cid], "source": "handoff-0.1.0",
        }
        if persona:
            q["persona"] = persona
        out_quests.append(q)
        merge_rows.append((sid, f"new: h-{sid.lower()}", "New situation (no existing scene with this objective)."))

    # 3) the Kleos pack
    kcards = []
    for i, k in enumerate(KLEOS):
        cid = f"K{49 + i}"
        q = {key: k[key] for key in ("id", "title", "category", "partner", "spicy", "setting", "opener", "twist", "goal", "focus", "objective")}
        if k.get("persona"):
            q["persona"] = k["persona"]
        q["branches"] = {
            "effective": f"If the user makes a credible move toward this objective, respond naturally: {k['objective']} Acknowledge a clear boundary; do not punish it to prolong play.",
            "ambiguous": "Ask one context-specific follow-up. Do not interpret hesitation as failure.",
            "ineffective": f"If the user says something like \"{k['ineffective']}\", react the way this person really would, once, without humiliating them.",
            "exit": "Allow an ordinary exit or a clear no to end the scene. End immediately on stop.",
        }
        q["cards"] = [cid]
        q["source"] = "kleos-pack"
        out_quests.append(q)
        kcards.append(card(cid, k["title"].strip('"'), "night" if k["category"] == "night" else "social", k["setting"], k["objective"], k["guidance"], k["avoid"],
                           f"{k['objective']} {k['guidance']}", k["unfiltered"], scene=k["id"]))
        merge_rows.append((k["id"], "new (Kleos pack)", "Raw pack: nights out, dating, looks talk, street side quests."))

    # guidance cards: handoff (all 48, scene-linked where imported) + Kleos pack + house cards
    cards = []
    scene_of = {f"K{int(sid[1:]):02d}": (f"h-{sid.lower()}" if HAND_MAP[sid][0] != "merge" else HAND_MAP[sid][1]) for sid in HAND_MAP}
    for cid, c in hcards.items():
        cards.append({**{k: v for k, v in c.items() if k not in ("retry_instruction",)}, "version": VERSION, "source": "handoff-0.1.0", "scene": scene_of.get(cid), "retry_instruction": c.get("retry_instruction")})
    cards += kcards
    cards += [card(h["id"], h["title"], h["category"], h["apply_when"], h["goal"], h["guidance"], h["avoid"], h["straight"], h["unfiltered"], source="kleos-house") for h in HOUSE_CARDS]

    # style records become occasion briefs for the look builder (not voice scenes)
    briefs = []
    for sid in ("S29", "S30", "S31", "S32", "S33", "S34", "S35", "S36"):
        s = sits[sid]
        briefs.append({"id": f"b-{sid.lower()}", "title": s["title"], "occasion": s["setting"], "ask": s["opening_line"], "constraint": s["complication"], "objective": s["user_objective"], "card": s["guidance_ids"][0]})
        merge_rows.append((sid, f"brief b-{sid.lower()}", "Style record: launches the look builder with this occasion, not a voice scene."))
    for sid in ("S37", "S38", "S39", "S40", "S41", "S42", "S43", "S44", "S45", "S46", "S47", "S48"):
        merge_rows.append((sid, "card only", "Feedback-integrity record: used by the assessor and the game judges, and as a regression case; not a catalogue tile."))

    ids = [q["id"] for q in out_quests]
    assert len(ids) == len(set(ids)), "duplicate scene id"
    card_ids = {c["id"] for c in cards}
    for q in out_quests:
        for c in q.get("cards", []):
            assert c in card_ids, (q["id"], c)

    with open(os.path.join(ROOT, "content", "quests.json"), "w") as f:
        json.dump({"note": "Side quests: real situations played as live conversations. 'spicy' scenes only appear in Unfiltered (18+). The person you play against follows the player's dating preference in dating scenes. Built by scripts/build_content.py.", "version": VERSION, "quests": out_quests}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "content", "guidance.json"), "w") as f:
        json.dump({"version": VERSION, "status": "editorial drafts, not empirically validated", "cards": cards}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "content", "briefs.json"), "w") as f:
        json.dump({"version": VERSION, "briefs": briefs}, f, ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "CONTENT_MERGE.md"), "w") as f:
        f.write(f"# Content merge, v{VERSION}\n\nBuilt by `scripts/build_content.py`. {len(out_quests)} playable scenes, {len(cards)} guidance cards, {len(briefs)} style briefs.\n\n| Source | Result | Why |\n|---|---|---|\n")
        for a, b, c in merge_rows:
            f.write(f"| {a} | {b} | {c} |\n")
    print(f"{len(out_quests)} scenes ({sum(q['spicy'] for q in out_quests)} spicy), {len(cards)} cards, {len(briefs)} briefs")


if __name__ == "__main__":
    main()
