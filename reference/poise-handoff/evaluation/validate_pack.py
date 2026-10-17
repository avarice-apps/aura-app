"""Static content checks only; does not evaluate an AI model."""
import json
from pathlib import Path
from collections import Counter

root = Path(__file__).resolve().parents[1]
cards = json.loads((root/'content/guidance-cards.json').read_text())
scenes = json.loads((root/'content/situations.json').read_text())
cases = [json.loads(line) for p in sorted((root/'evaluation').glob('*.jsonl')) for line in p.read_text().splitlines() if line.strip()]
assert len(cards) == len(scenes) == 48
assert len(cases) == 160
for records in (cards, scenes, cases):
    assert len({r['id'] for r in records}) == len(records), 'Duplicate ID'
card_ids = {c['id'] for c in cards}
families = {}
for c in cases:
    assert set(c['guidance_ids']) <= card_ids
    assert c['source'] == 'synthetic_editorial_fixture'
    assert c['input']['request'] and c['expected']['must'] and c['expected']['must_not']
    assert families.setdefault(c['family_id'], c['split']) == c['split'], 'Family leaked across splits'
for s in scenes:
    assert set(s['guidance_ids']) <= card_ids
    assert all(s[k] for k in ['opening_line','complication','user_objective','branches','retry'])
assert Counter(c['split'] for c in cases) == {'development':80,'validation':40,'reserved':40}
assert len({s['opening_line'] for s in scenes}) == 48
print(json.dumps({'static_checks':'passed','cards':48,'situations':48,'cases':160,'splits':dict(Counter(c['split'] for c in cases)),'model_evaluation':'not_run','human_review':'not_run'}, indent=2))
