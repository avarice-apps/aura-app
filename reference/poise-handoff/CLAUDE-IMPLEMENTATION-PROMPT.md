# Implement this Kleos content pack

Read START-HERE.md, content/CARDS-AND-SITUATIONS.md, DIALOGUE-DIRECTION.md and IMPLEMENTATION.md. Inspect the existing app and content catalogue before editing. Preserve existing modes and good content; deduplicate by scenario and learning objective, not just title. Add the 48 guidance cards and 48 playable situations as versioned content. Treat examples as authored drafts, never as validated psychological rules or evidence of model training.

First report the existing content schema, dialogue/scoring boundaries, navigation and test setup. Then adapt these records to the existing architecture rather than creating a second competing system. Implement retrieval, branching scene setup, independent assessment, evidence-based Straight/Unfiltered rendering, retry snapshots and explicit content labels. Keep game outcomes, wardrobe advice and practice feedback distinct.

Use the development fixtures while implementing. Use validation fixtures after freezing a candidate. Do not load tests into production retrieval. Reserve the final set from iterative tuning; because this pack is shared with the implementer, it is not a genuinely blind holdout. Report actual model and integration results separately from static pack checks. Do not call the scoring model validated until independent human testing supports that claim.

The HTML is a visual reference only. Preserve its original bytes, CSP and sandbox. Do not paste its iframe wrapper into the native app. Follow UI-HANDOFF.md for how to blend the concept with the existing screens. Do not remove existing features or change billing without identifying the effects first. Implement useful content and runtime tests, and report what is working, what is untested, and what still needs product decisions.
