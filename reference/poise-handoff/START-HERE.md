# Poise content handoff — 0.1.0

This pack supplies 48 guidance cards, 48 playable scenario seeds, 160 authored test cases, dialogue direction and implementation requirements. The scenes and cards are paired, not 96 different situations. Each scene has an opening, complication, objective, branch rules and retry. They need adaptation to the app's existing schema and live model testing.

## Files

- `content/CARDS-AND-SITUATIONS.md`: easiest complete read.
- `content/guidance-cards.json`: retrieval content.
- `content/situations.json`: scene director input.
- `DIALOGUE-DIRECTION.md`: voice, character behaviour and example exchanges.
- `IMPLEMENTATION.md`: runtime boundaries and integration acceptance criteria.
- `evaluation/`: 80 development, 40 validation, 40 reserved fixtures, plus review instructions.
- `CLAUDE-IMPLEMENTATION-PROMPT.md`: give this to Claude with the folder.
- `kleos-ui.html`: unchanged exported interactive visual reference, where included.
- `UI-HANDOFF.md`: design integration direction.

## Audience and editorial scope

Adults across different backgrounds. The launch material can speak to aura/meme culture, theatrical roleplay, style-conscious international social circles and early-career work without assuming everyone is wealthy, male, straight, extroverted or pursuing status. Those are contexts and interests, not diagnoses or rankings of people.

The mix includes 12 social/dating scenes, 16 work/friendship/everyday scenes, 8 style scenes and 12 game/feedback scenes. Some details are deliberately unusual; the underlying decision should still be recognisable. Let people choose contexts, intensity, romance preferences and style. Never infer these from a face, accent or clothing budget.

These are editorial drafts. No user research, clinical validation, human-rated accuracy test or provider model run has been performed on this new pack. Static validation only checks completeness and internal consistency. The sample verdicts are conditional examples of mistakes, not labels to attach to every player.

## How to share

For Claude Code, unzip this folder into the project as `reference/poise-handoff` and ask it to read the implementation prompt. For chat, attach the Markdown content, dialogue direction and implementation prompt first; add the JSON and tests for implementation. If HTML is not accepted by that interface, provide screenshots of the relevant states alongside the file through the development workspace. The production UI link may require your account access; local HTML avoids relying on it.
