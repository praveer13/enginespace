---
version: 1
slug: "src-games-verifier-game-tsx"
primary_target: "src/games/verifier/Game.tsx"
related_targets: ["src/games/verifier","packages/play/verifier"]
---

# The Tasting

## Scope

- **Surface:** the game page `/play/verifier`, in Operate mode: a whole game view inside the established world. GAMES.md §10 and §2.6 and A§6 specify it, so there is no concept roll. On a device whose tier draws 3D the view is the 3D scene (W1-T29), the pass at the tasting built from scene kit v1; the 2D view is the first paint, the fallback and the 3D-off path, and it is a first-class rendering of the same kitchen.
- **Visitor:** a kernelspace graduate who has met speculative decoding in T5.L8 and wants to see why the verifier's output is the target's, exactly.
- **Task:** predict how many of the commis's plates the chef keeps; sculpt the re-plating until what goes out is the chef's tasting; predict a round's courses; name the bug in five tasting rules; choose how far ahead the commis should plate.
- **Proof:** every mark and every number comes out of the pure session. The distance from the chef's tasting is an exact fraction in rationals, so no pass is a sample's luck.
- **Constraints:**
  - the PRODUCT.md constraints (zero servers, nothing collected);
  - completable by keyboard, with reduced motion, and no sideways scroll at 390 px;
  - a graded run hides the live meter and the decomposition, takes one submission and has no undo;
  - every probability is a count of plates out of sixty-four, synthetic;
  - the 3D scene holds D-023's frozen budgets (its chunk at most 40 KB gz, at most 100 draw calls), carries no text of its own, and cuts every change under reduced motion.

## Direction contract

THESIS: The Tasting is the pass at the moment of tasting. Each dish has two stacks of plates side by side, the commis's and the chef's, and the plates they share; a run of courses stands in rows behind the first. It refuses a bar chart in a game frame: grey bars, a tick axis and a swatch legend, flat or in 3D.

OWN-WORLD:
- **Surfaces:** brushed stainless: the pass, a tasting bench as deep as the run, the chef's wire plate dispensers and the bell; subway tile, the hood and a cold line behind, falling into a haze of deep steel; heat lamps over the course being tasted.
- **Marks:** each dish is a pair of stacks of edge-banded tasting plates, the commis's standing free and the chef's in her dispenser, its foot in the target blue and its wires a few plates over her stack. A plate's edge is its part: agreed board green, the commis's extra in the draft yellow, the chef's extra in the residual red. A graded run's stacks are plain, the commis's yellow and the chef's blue.
- **The draws:** a drafted plate is a plate of the commis's stack pulled out at its coin's height, level and toward the chef when kept, tipped away when sent back.
- **What went out:** a white enamel ring edged in grey on the chef's dispenser, at the height served.
- **Print:** dish and stack names on masking tape in marker, counts on paper tags in the printer's dots, all DOM.

STORY: The learner comes to see that the chef keeps every plate she and the commis agree on, sends back only the commis's extra, and re-plates from exactly what the commis under-plated. Nothing else puts out her tasting. They predict, sculpt and draw rounds: on each bell the commis's plates drop into the stacks down the run, and the rings settle onto the tops of her stacks. Then they find the same rule hiding in five rules that look right.

FIRST VIEWPORT:
- **At 1440 px:** under the game's plate and its stage buttons, two columns. On the left, 3fr: the scene's box, over the run: the pass across its lower half with the six dishes' pairs of stacks under three heat lamps, any later courses in rows behind, the line under its hood beyond, the dish names on tape along the pass's edge; under the box the camera's plates, then the prompt and the six dish weight fields. On the right, 2fr: the printer's tape with the exact distance, over the mirror table.
- **At 390 px:** one column in that order. The scene comes first at about half the screen's height. Over one course the camera stands low and near, so the pass and its stacks fill the box's lower half with the six pairs across it and the room over them falls into haze; over a run it stands higher, so the courses run into the box. The prompt and the weight fields sit directly under it.
- **The primary action:** the weight fields and "Submit", in the level's own words; in the predicting levels the prediction and Commit, then the draws.

FORM: The Pass, as GAMES.md §2.6 and DESIGN.md specify it: stainless for the pass, tickets for what is read, the printer's tape for the readout, tape labels for names and plates for controls; in 3D, scene kit v1's room and props with the Tasting's own plates, dispensers and rings made the kit's way. Stacks of plates stand in for the skyline's bars. seed: none (specified surface, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The bell. Rounds are drawn and the bell on the pass strikes: the commis's plates drop into their stacks down the run, a kept plate sliding out toward the chef and a sent-back one tipping away, and the white rings settle onto the tops of her stacks, all six at once, while the tape prints the distance as a fraction. In the 2D view it is the outline settling: the learner sets the last weight, and the hollow outline over each dish drops onto the top of the chef's stack.

## Adaptations (finish review, round 1)

- **Plates, not bars.** In 3D each plate is a satin glaze with its part on its edge band only, a gap of shade under it, and a few millimetres off the plate under it, stacked by hand. In 2D each plate is drawn edge on, with rounded ends and the glaze of its rim, each stack stands in its contact shadow on the pass, and the chef's stands in her wire dispenser, whose foot is the target's blue, as the contract has it in 3D too.
- **The draws read from over the run.** A pulled plate stands clear of its stack, glazed whole in its part: a kept one level, out toward the chef and the expo, a sent-back one out the other way, tipping away as it lands. The heat lamps' pool on the steel round the course being tasted is brighter. Over the run the haze starts just past the courses, so the line and the wall fall away into deep steel; the shots nearer the pass keep it further off, so the room never falls into a void.
- **The courses' names.** Over a run the pass runs on past the soup, and each course's name lies on its tape on that strip, a step further left into depth, so that no name stands over a stack. The walk keeps the dishes' names alone, and so does One course, where one course stands in front of the next; in a phone's narrow box the strip stands outside the box, so the names are left to the mirror there.
- **The counts.** A single course's counts are on one paper tag a dish, the commis's plates and then the chef's, hung from the pass's edge under the dish's tape: from a phone's height, and level with the counter in One course, the counter in front of a pair has no room for a tag in front of the tape.
- **The framings.** Over a run, at 1440 px, the camera stands higher and closer, so the courses fill the box and the hood stands above it. On a phone the pass's front edge stands at the foot of the box and no floor shows under it; the room above it (the line under its lamps, the hood, the wall falling into haze) fills the rest, since one course's pass is too shallow to fill a box taller than it is wide while all six pairs fit across.
- **The hood.** Over a run, at 1440 px, it stands above the box. Where it shows, on a phone and in One course, The Tasting's hood has a shorter skirt, so that it reads as a canopy over the line, and a drawn steel lip along the skirt's foot; its baffles and lights stand under it, seen from One course. The kit's own hood is unchanged, since every dressed scene shares the kit's chunk and The Reach-In's scene stands too near its frozen gate to carry more of it (GAMES.md §8, "Budget").

## Adaptations (finish review, round 2)

- **The draws are plates.** A pulled plate is a tasting plate glazed as its stack's are, its part on its edge band only, and it stands over its own shadow on the steel, fainter and wider the higher it was pulled from. One draw takes the plates both stacks share and one the commis's extra.
- **What went out reads.** The rings are white enamel edged in grey on their top and foot, so they read on white plates as on steel: a run's first round leaves most of them at the foot of their dispensers and one at its top, ten leave them scattered, and a thousand settle them onto the tops of her stacks. That, more than how many plates are pulled, is what tells the three apart.
- **The dispensers.** Each dispenser's wires stand six plates over the chef's stack and no taller, so an empty one is a short loop round its blue foot and not a bare wire as tall as the tallest stack; a ring past its wires waits at their top, and the mirror prints the figure.
- **One lamp's pool.** The heat lamps over the course being tasted hang a little behind it: brushed steel shows a lamp's light on the side of its pool toward the eye, so from over the course their light washed the pass in front of it. From behind, it pools on the course's plates and the steel between them. Over a run their light leaves at a course's height, a hand under the higher shades, so the pool is a course deep.
- **The haze.** Over one course the haze thickens within the wall's depth, and the room's light falls away from just over the line and just behind the pass: the line keeps its steel, the wall over it falls into deep steel, and past the room's walls is the same deep steel, never a pale void.
- **The phone.** Over one course the camera comes down and in: the pass and its stacks stand in the box's lower half, the floor in front of the pass under the box's foot and the floor under its open shelf in its shade, and the line, the hood and the lamps over them in haze. The camera's target stands back along its line of sight, so the haze, measured from it, starts behind the line.
- **The walk's names.** Walking with the chef, the camera turns a little further down the pass and widens, so that every dish's tape, the soup's at the far end too, stands whole inside the box at the page's boxes.

## Unresolved

- **The Build-this card** points at the `rejection-sampler` forge lab (W1-T27), which is not built yet, so the debrief names the lab and does not link it.
- **Dish names:** GAMES.md §10 says "the six dishes of the vocabulary" and names none. The game's six are soup, salad, fish, steak, pasta and tart, and the mirror gives each its token number beside it.
- **The heat lamps in a run:** GAMES.md §2.6 puts the lamp on "the row being tasted". A round's walk starts at the first course, so in `chain` the 3D lamps light the front course, where every round begins, hung a little behind it; the 2D view pools its amber over every draft row.
- **The stacks on a phone:** six pairs across a phone's box, which is taller than wide, stand no taller from any height: a stack of 29 plates is about 45 px at 390 px [derived from the framing's projection, 2026-11-05], against about 40 px from higher. The camera fills the box's lower half with the pass instead; a stack any taller would need fewer dishes across or a box shaped to the pass, which the review did not ask for.
- **Walk with the chef** (Follow) is a framing the learner chooses, low along the pass, and does not move on its own: the scene moves only on a bell or the learner's input.
- **The chef's re-plating** (GAMES.md §2.6: "a second plate drops into the row's under-plated wells") is not drawn in 3D as a plate of its own: the session's view gives no re-plated dish for a sent-back plate, and the scene's chunk stands just under its frozen 40 KB gate (GAMES.md §10, "Budget", gives the figure). What she re-plates shows in what went out (the rings) and in the mirror.
- **A pick in 3D** is a dish's tape on the pass's edge, which hands focus to its weight; the 2D drawing's tap target is the dish's whole column.
