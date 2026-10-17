# Runtime and integration contract

## Content loading

Load only `content/guidance-cards.json` into guidance retrieval. Load situation records into the scene catalogue. Keep the editorial voice document in the authoring process; use a concise reviewed runtime policy derived from it. Never include evaluation fixtures or their expected answers in production context. Filter by explicit selected mode and occasion, then retrieve up to three relevant cards. Log card IDs and version for reproducibility.

Scene records are scenario seeds, not completed long-form dialogues. Let the existing scene system populate a fictional character, opening, motive and state. Style records should launch an adviser flow rather than pretending a wardrobe request is always a voice duel. Feedback-integrity records may work better as tutorials or regression cases than as public catalogue tiles. Review placement before exposing all 48 as identical games.

## Separation of responsibilities

- Planner: uses user-confirmed occasion, goal, constraints and preferences; proposes a next action.
- Style adviser: uses supplied item IDs and confirmed attributes. Unknown fabric, weather, ownership and dress-code details stay unknown. No silent shopping or uploads.
- Scene director: receives fictional persona, visible conversation and scene state. It may simulate a difficult person. Its private state is never scoring evidence.
- Assessor: receives user objective, rubric version, visible transcript with turn IDs and available quality metadata. Exclude character thoughts, attraction, hidden interest, scripted punishment, previous verdict and target score. Counterpart speech provides context, not independent proof of real-world efficacy.
- Renderer: receives a canonical assessment and selected tone. It may change language but not findings, numeric values, evidence or uncertainty.

Suggested canonical assessment fields: `session_id`, `mode`, `rubric_version`, `evidence[{turn_id,exact_quote,observation}]`, `strengths[]`, `next_move`, `uncertainties[]`, `dimension_results[{dimension,status,value,reason}]`. Status is `assessed`, `not_observed` or `insufficient_evidence`. Numeric scales must be defined by the existing rubric, not invented by the renderer. Do not produce a single objective human-worth score.

## Retry and progress

Store a snapshot before each exchange. A retry restores that snapshot and discards subsequent conversation and character private state. Keep attempts available to the comparison service, not the replaying character. Compare the same objective and comparable evidence; improvement is optional. A shorter answer, an apology, an accent, a pause or declined camera cannot be a penalty by itself.

## Memory and tools

Separate explicit user facts, tentative observations and fictional scene data. Store only appropriate user-confirmed preferences in durable preference memory. Expose correction and deletion. Tool execution is an application responsibility with server-side permission and entitlement checks; model prose is not evidence that a tool succeeded. In tests, inspect actual tool events and assessor payloads. Share previews do not authorise publishing. A request for outfit advice does not authorise buying clothes. Session use does not by itself authorise training use.

## Incorporating the existing catalogue

Export existing scene IDs, openings, goals and audience tags. Build a merge table: new, complementary variation, duplicate, or superseded. Keep stable IDs for existing content. Preserve strong chat and duel flows. Add variation where the existing library is thin instead of replacing it wholesale. Ensure a user can find a practical work situation without navigating meme language, and can find theatrical games without entering a course.

## Acceptance checks

1. Every imported record resolves to a valid category and card ID; no duplicate display entry for a copied scene.
2. Start a social scene, a work scene, a style flow and a game. Check the right experience launches.
3. Inspect assessor requests to prove private director state is excluded.
4. Render one canonical assessment in both tones; compare immutable fields exactly.
5. Decline camera, stop a scene, lose audio and exhaust allowance; each path returns honest usable state.
6. Retry an exchange and inspect context for future-state leakage.
7. Confirm no evaluation data enters runtime retrieval and no unapproved training export occurs.
8. Run the fixture review protocol and report failures honestly. This content pack itself does not execute those model or app checks.
