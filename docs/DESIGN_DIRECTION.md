# Aura — design direction

Anchor: the Hermes Agent site. Electric cobalt field, tall light condensed type, flat rectangular buttons, monochrome engraved illustration with radiating lines.

## Principles
- Museum, not gym. Engraved plate in a gallery, not a looksmax forum. Classical sculpture already belongs to that culture; engraving makes it serious.
- One colour, many opacities. Cobalt and white. Hierarchy by opacity and scale, never by extra hues.
- Ritual screens are blue; working screens are dark. Full-bleed cobalt for onboarding, the verdict, the Sunday Re-read. Near-black ink for drills, history, settings.
- Slow, weighted motion. No bounce, no confetti. Lines draw in, numbers count up, verdicts land with one haptic.

## Tokens (`src/theme/tokens.ts`)
Cobalt `#1414F0` · Cobalt deep `#0B0BB8` · Lilac `#DADCFF` (primary button) · Ink `#06071A` · Ink raised `#10122E` · White at 100/72/48/24/16/12/8%. No red or green: deltas use ↑/↓ and weight.

## Type
Display: Antonio Light/ExtraLight (tall condensed), 32–120 pt, leading 0.92. Labels: JetBrains Mono, uppercase, +8% tracking, 11–13 pt. Body: Inter 14–16 pt.

## The Mark (`src/components/Mark.tsx`)
A radial burst of rays, not a glowing blob. Ray count ↔ Index; per-sector ray length ↔ the axis that owns that sector; evenness ↔ consistency. It breathes with voice energy during a Read and morphs from last week's shape on the Re-read. It is the profile, the share card and the proof.

## Imagery
Classical sculpture from CC0 archives (Met Open Access, Smithsonian Open Access), processed into cobalt duotone engraving / halftone line art. Onboarding, archetype cards, empty states. Never stock photos of men.

## Tone guardrails
No "alpha", "sigma", "mog", "king", "rizz". No emojis, no exclamation marks, no neon gradients. Poise is a sharp, unimpressed, specific observer.
