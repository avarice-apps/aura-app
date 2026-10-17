"""Poise's guidance cards: short, reviewed-style notes on what good looks like in a situation, with a counterexample.

They are retrieved at runtime and given to the assessor and to Poise as house guidance. They are editorial drafts,
not validated psychology, and they never contain evaluation fixtures or expected answers (those live in
reference/poise-handoff/evaluation and are never loaded here).

Retrieval, in order: cards linked to the scene, house cards for the mode, then the closest by words. At most three.
Every response that used cards carries their ids and the pack version, so a read can be reproduced.
"""
from __future__ import annotations

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_PACK = json.load(open(os.path.join(ROOT, "content", "guidance.json")))
VERSION: str = _PACK["version"]
CARDS: dict[str, dict] = {c["id"]: c for c in _PACK["cards"]}
BY_SCENE: dict[str, list[str]] = {}
for _c in CARDS.values():
    if _c.get("scene"):
        BY_SCENE.setdefault(_c["scene"], []).append(_c["id"])

# House cards that always apply to a kind of read
MODE_CARDS = {
    "scene": ["H01", "H02", "H04"],
    "retry": ["H05"],
    "ledger": ["H02", "H07"],
    "looks": ["H08"],
    "unfiltered": ["H06"],
    "draft": ["H09", "H10"],
}

_STOP = set("a an the and or but if to of in on at for with you your i me my we our they them their it its is are was were be been do does did not no yes this that what when how why who just so very can will would could should about from into than then there here as by".split())


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z']{3,}", (text or "").lower()) if w not in _STOP}


_INDEX = {cid: _words(" ".join(str(c.get(k, "")) for k in ("title", "apply_when", "goal", "guidance", "avoid"))) for cid, c in CARDS.items()}
LOOKS = re.compile(r"\b(mog|mogged|mogging|looksmax\w*|jaw\w*|mewing|maxilla|rate me|out of ten|height|ugly|hot or not)\b", re.I)


def retrieve(*, scene: str | None = None, cards: list[str] | None = None, mode: str = "scene", text: str = "", tone: str = "real", k: int = 3) -> list[dict]:
    picked: list[str] = []

    def add(cid: str):
        if cid in CARDS and cid not in picked and len(picked) < k:
            picked.append(cid)

    for cid in (cards or []) + BY_SCENE.get(scene or "", []):
        add(cid)
    if LOOKS.search(text or ""):
        add("H08")
    for cid in MODE_CARDS.get(mode, []):
        add(cid)
    if tone == "unfiltered":
        add("H06")
    if len(picked) < k and text:
        q = _words(text)
        scored = sorted(((len(q & ws) / (len(ws) ** 0.5 or 1), cid) for cid, ws in _INDEX.items() if cid not in picked), reverse=True)
        for score, cid in scored:
            if score < 0.35:
                break
            add(cid)
    return [CARDS[c] for c in picked]


def block(cards: list[dict]) -> str:
    """Cards as a prompt block. Framed as guidance to weigh against the evidence, never as facts about the user."""
    if not cards:
        return ""
    lines = []
    for c in cards:
        lines.append(f"- [{c['id']}] {c['title']}: aim: {c['goal']} What tends to work: {c['guidance']} Not this: \"{c['avoid']}\"")
    return ("House guidance (editorial notes; apply only where the transcript supports it, and a different culturally or personally appropriate move can also succeed):\n"
            + "\n".join(lines))


def ids(cards: list[dict]) -> dict:
    return {"cards": [c["id"] for c in cards], "version": VERSION}
