"""Order-reversal check for the Tribunal assessor (an evaluation tool, not part of the app).

Runs the assessor once per order on each sample round and reports how often the single-run winner changes when
the sides are swapped. Production judging already runs both orders and averages them; this measures how much
that matters. Usage: python scripts/tribunal_order_check.py [n_repeats]
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import tribunal  # noqa: E402

ROUNDS = [
    ("Texting first makes you look desperate", ("Ana", "No"), ("Ben", "Yes"),
     "Texting first shows you know what you want. People like being chosen.", "Texting first every time reads as available, and available reads as low value.",
     "'Low value' assumes dating is a market. Most people want clear interest.", "It is partly a market. I'm not saying never text first, just not always."),
    ("Remote work makes people worse at their jobs", ("Kai", "Agree"), ("Ines", "Disagree"),
     "Juniors learn by overhearing. At home they never see how a hard call is handled.", "Output is measurable. Most teams I know shipped more at home, with fewer meetings.",
     "Shipping isn't learning. You can ship more and still grow slower.", "Then fix mentoring with scheduled pairing, not commutes."),
    ("Tipping culture has gone too far", ("Dev", "Agree"), ("Mara", "Disagree"),
     "Tablets ask for 20% at a self-serve counter. That isn't service, it's guilt.", "Tips are most of a server's wage in many places. Cutting tips cuts pay.",
     "That's an argument for higher wages, not for tipping at a counter.", "Until wages change, skipping the tip just punishes the worker."),
]


async def main(rep: int):
    tribunal.DB = os.path.join(tempfile.mkdtemp(), "t.db")
    flips = total = 0
    for i, (topic, (na, sa), (nb, sb), ao, bo, ar, br) in enumerate(ROUNDS * rep):
        a, b = {"id": f"a{i}"}, {"id": f"b{i}"}
        code = tribunal.create(a, format="settle", topic=topic, tone="real", name=na, side=sa)["code"]
        tribunal.join(code, b, name=nb, side=sb, accept=True)
        for who, kind, text in ((a, "opening", ao), (b, "opening", bo), (a, "rebuttal", ar), (b, "rebuttal", br)):
            tribunal.submit(code, who, kind=kind, text=text)
        with tribunal.db() as c:
            r = dict(tribunal._round(c, code))
            members = {m["seat"]: dict(m) for m in c.execute("select * from members where round_id=?", (r["id"],))}
            subs = [dict(s) for s in c.execute("select * from submissions where round_id=? order by created", (r["id"],))]
        x, y = await asyncio.gather(tribunal._assess(r, members, subs, False), tribunal._assess(r, members, subs, True))
        wx, wy = tribunal.settle([x], "settle")["outcome"], tribunal.settle([y], "settle")["outcome"]
        total += 1
        flips += wx != wy
        print(f"{topic[:40]:40}  in order: {wx:5}  swapped: {wy:5}  {'FLIP' if wx != wy else ''}")
    print(f"\nwinner changed on swap: {flips}/{total} ({flips / total:.0%}). Production averages both orders.")


asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 1))
