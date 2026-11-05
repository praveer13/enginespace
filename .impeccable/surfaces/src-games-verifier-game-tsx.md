---
version: 1
slug: "src-games-verifier-game-tsx"
primary_target: "src/games/verifier/Game.tsx"
related_targets: ["src/games/verifier","packages/play/verifier"]
---

# The Tasting

## Scope

- **Surface:** the game page `/play/verifier`, in Operate mode: a whole game view inside the established world. GAMES.md §10 and §2.6 and A§6 specify it, so there is no concept roll. The 2D view is the first paint and the 3D-off path (the 3D scene is W1-T29), and it is a first-class rendering of the same kitchen.
- **Visitor:** a kernelspace graduate who has met speculative decoding in T5.L8 and wants to see why the verifier's output is the target's, exactly.
- **Task:** predict how many of the commis's plates the chef keeps; sculpt the re-plating until what goes out is the chef's tasting; predict a round's courses; name the bug in five tasting rules; choose how far ahead the commis should plate.
- **Proof:** every mark and every number comes out of the pure session. The distance from the chef's tasting is an exact fraction in rationals, so no pass is a sample's luck.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - completable by keyboard, with reduced motion, and no sideways scroll at 390 px;
  - a graded run hides the live meter and the decomposition, takes one submission and has no undo;
  - every probability is a count of plates out of sixty-four, synthetic.

## Direction contract

THESIS: The Tasting is the pass at the moment of tasting. Each dish has two stacks of plates side by side, the commis's and the chef's, and the plates they share. It refuses a bar chart in a game frame: grey bars, a tick axis and a swatch legend.

OWN-WORLD:
- **Surfaces:** brushed stainless, with the pass as the counter the stacks stand on, and the heat lamp over the row being tasted.
- **Marks:** each dish is a pair of plate stacks. The shared plates are the agreed board green, the commis's extra plates are hatched in the draft yellow, and the chef's extra plates are the residual red.
- **The chef and the output:** the chef's tasting is a blue outline, and what went out is a hollow white outline over it.
- **Sent-back plates:** the ribbon's red strike, as in Service.
- **Print:** dish names on masking tape in marker, counts and the exact distance in the printer's dots.

STORY: The learner comes to see that the chef keeps every plate she and the commis agree on, sends back only the commis's extra, and re-plates from exactly what the commis under-plated. Nothing else puts out her tasting. They predict, sculpt, and watch the outline settle onto her line, then find the same rule hiding in five rules that look right.

FIRST VIEWPORT:
- **At 1440 px:** under the game's plate and its stage buttons, two columns. On the left, 3fr: the six dishes' pairs of plate stacks on the pass, each under its tape name and a dot-matrix count tag, with the lamp over the row, then the prompt and the six dish weight fields. On the right, 2fr: the printer's tape with the exact distance, over the mirror table.
- **At 390 px:** one column in that order. The stacks come first, narrower, and the prompt and the weight fields sit directly under them.
- **The primary action:** the weight fields and "Submit", in the level's own words.

FORM: The Pass, as GAMES.md §2.6 and DESIGN.md specify it: stainless for the pass, tickets for what is read, the printer's tape for the readout, tape labels for names and plates for controls. Stacks of plates stand in for the skyline's bars. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The outline settling. The learner sets the last weight, and the hollow outline over each dish drops onto the top of the chef's stack, all six at once, and the distance reads zero as a fraction.

## Unresolved

- **The 3D scene** is W1-T29: it reads the same layout, and its drafted tokens drop through the rows into depth.
- **The Build-this card** points at the `rejection-sampler` forge lab (W1-T27), which is not built yet, so the debrief names the lab and does not link it.
- **Dish names:** GAMES.md §10 says "the six dishes of the vocabulary" and names none. The game's six are soup, salad, fish, steak, pasta and tart, and the mirror gives each its token number beside it.
