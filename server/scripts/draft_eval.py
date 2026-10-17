"""Live evaluation of Before I send this against evals/draft_cases.json (not part of the app or the tests).

Checks, per case: facts kept in every alternative (code check), spans really in the draft, no score fields,
no prompt leak, the expectations listed in the case. Prints a table and a summary; exits non-zero on failures.
Usage: python scripts/draft_eval.py [case_id ...]
"""
import asyncio
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from pipeline import drafts  # noqa: E402

CASES = json.load(open(os.path.join(HERE, "evals", "draft_cases.json")))
SOFT = re.compile(r"\b(maybe|perhaps|if that's ok|if you don't mind|sorry|i hope|would it be possible)\b", re.I)


async def run(c):
    t0 = time.time()
    try:
        out = await drafts.review(draft=c.get("draft", ""), convo=c.get("convo"), to=c.get("to", ""), intent=c.get("intent", ""), outcome=c.get("outcome", ""), tone="real")
    except Exception as e:
        return c["id"], False, [f"error: {e!r}"[:160]], time.time() - t0, None
    fails = []
    req = drafts.exempt(drafts.facts(c.get("draft", "")), c.get("outcome", "")) if c.get("draft") else drafts.facts(c.get("outcome", ""))
    for a in out["alternatives"]:
        gone = drafts.missing_facts(req, a["text"])
        if gone:
            fails.append(f"alt '{a['label']}' lost {gone}")
    if any(k in out for k in ("score", "rating", "aura")):
        fails.append("has a score")
    blob = json.dumps(out).lower()
    e = c.get("expect", {})
    if e.get("no_prompt_leak") and ("you are poise" in blob or "return only json" in blob):
        fails.append("leaked the prompt")
    if "send_as_is" in e and out["send_as_is"] != e["send_as_is"]:
        fails.append(f"send_as_is={out['send_as_is']}, wanted {e['send_as_is']}")
    if e.get("no_softening"):
        for a in out["alternatives"]:
            if SOFT.search(a["text"]) and not SOFT.search(c["draft"]):
                fails.append(f"softened: {a['text'][:60]}")
    for w in e.get("mentions", []):
        if not all(w.lower() in a["text"].lower() for a in out["alternatives"]):
            fails.append(f"an alternative is missing '{w}'")
    for w in e.get("keeps_words", []):
        if not all(w.lower() in a["text"].lower() for a in out["alternatives"]):
            fails.append(f"an alternative dropped '{w}'")
    if e.get("declines") and out["alternatives"]:
        fails.append("wrote alternatives for a harmful message")
    if e.get("asks_or_assumes") and not (out.get("clarify") or out.get("assumptions") or out.get("uncertainty")):
        fails.append("neither asked nor stated an assumption")
    return c["id"], not fails, fails, time.time() - t0, out


async def main(ids):
    cases = [c for c in CASES["cases"] if not ids or c["id"] in ids]
    results = await asyncio.gather(*(run(c) for c in cases))
    ok = 0
    for cid, passed, fails, dt, out in results:
        ok += passed
        print(f"{'PASS' if passed else 'FAIL'}  {cid:18} {dt:4.1f}s  {'; '.join(fails)}")
        if out and os.environ.get("SHOW"):
            print("      reads:", out["reads"])
            for a in out["alternatives"]:
                print("      -", a["label"], "|", a["text"])
    print(f"\n{ok}/{len(results)} passed · {drafts.VERSION} · {CASES['version']}")
    sys.exit(0 if ok == len(results) else 1)


asyncio.run(main(sys.argv[1:]))
