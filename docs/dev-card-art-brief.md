# Development Card Art Brief

Design brief for generating the 5 development card faces (+ optional shared card back) for the Catan app.

## Design direction: minimal, Apple-style

- **Aesthetic**: clean, restrained, modern — think Apple product pages / iOS app icons, not a fantasy board-game illustration. No parchment textures, no ornate borders, no medieval clip-art, no drop shadows piled on drop shadows.
- **Icon language**: one clear, simple glyph or abstract symbol per card, rendered with soft gradients or flat color fields — similar to how iOS system icons or SF Symbols compositions look (simple geometric shapes, generous negative space, a single focal object centered in the frame).
- **Color**: each card gets one confident accent color (see palette below) used as a soft gradient or solid field. Avoid busy multi-color illustrations — one hue family per card, plus neutral white/off-white or dark neutral for contrast elements.
- **Typography** (if any text appears on the face itself, e.g. a small title label): a clean geometric sans-serif (e.g. SF Pro, Inter, or similar), light-to-medium weight, small and unobtrusive — the art should read at a glance without needing to read text.
- **No clutter**: no borders/frames baked into the image (the app draws its own card chrome around it), no drop shadows, no text-heavy explanations, no realistic photographic textures.
- **Consistency**: all 5 cards should look like one family — same lighting style, same level of detail, same corner-radius/composition logic — just different subject + accent color.

## Technical spec

- **Format**: PNG with a transparent background (no baked-in background color/glow — this matters, the app's card chrome sits behind/around the art).
- **Aspect ratio**: portrait, roughly 2:3 to 3:4 (a bit taller than wide).
- **Resolution**: 500–700px on the long edge (doesn't need to be huge — renders small in a hand fan and a "just drew this" toast).
- **File count**: 5 images, one per card type below. A 6th optional shared card-back design (used for face-down/opponent card counts) is welcome but not required.

## The 5 cards

| # | Type | Suggested subject | Accent color | What the card does (for reference/flavor only) |
|---|---|---|---|---|
| 1 | **Knight** | A simple shield silhouette, or an abstract knight-helm shape | Warm terracotta / brick red | Move the robber and steal a resource from an opponent |
| 2 | **Victory Point** | A single clean star or laurel-adjacent minimal mark | Warm gold | Worth 1 secret victory point, revealed at game end |
| 3 | **Road Building** | An abstract road/path motif — e.g. two parallel lines converging, or a simple road-fork glyph | Slate blue / cool gray-blue | Build 2 roads for free |
| 4 | **Year of Plenty** | An abstract "gift" or "bounty" motif — e.g. a simple open box or two resource dots — avoid literal gift-wrap bow illustrations | Sage green | Take any 2 resources from the bank |
| 5 | **Monopoly** | An abstract "take-all" motif — e.g. a single coin/disc, or a minimal upward arrow-in-circle | Muted purple or amber | Take all of one resource type from every other player |

Feel free to reinterpret the "suggested subject" — the goal is a simple, legible, single-focal-point icon, not a literal illustration of the rule text. Prioritize instant recognizability and a shared visual family over literal accuracy to the suggestion.

## Optional: shared card back

- Same minimal aesthetic, a single abstract mark or wordmark-less pattern (e.g. a subtle geometric monogram or repeating dot/line motif) in a neutral dark tone, used for every face-down card regardless of type.
- Same format/resolution/transparency rules as above.

## Delivery

Just the raw PNGs, named however is convenient (e.g. `knight.png`, `victory-point.png`, `road-building.png`, `year-of-plenty.png`, `monopoly.png`, and optionally `card-back.png`). Send them over whenever ready — I'll handle sizing, cropping, and wiring them into the UI.
