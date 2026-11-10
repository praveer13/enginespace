---
version: 1
slug: "src-games-loop-game-tsx"
primary_target: "src/games/loop/Game.tsx"
related_targets: ["src/games/loop","src/pages/Game.tsx","packages/play/loop"]
---

# Service's own page: the pass in the middle of service

## Scope

- **Surface:** `/play/loop`, Service (`loop`) on its own page: the 3D pass, its 2D twin (the same pass drawn from above), the controls, the printer's tape and the mirror. Experience mode: the game is the page. Two services play on it: "First service" (the front page's four levels, on synthetic ticks) and, since W1-T13, "the full service" (TR2's levels `async`, `graphs`, `mrv2` and TR6's `mask`, on µs of the model's clock; and, since W1-T14, `close`, TR2's graded level), with `keys` behind an in-world card that waits for the owner's dispatcher tables (Q-10).
- **Player:** a kernelspace graduate who has met Service on the front page, or is sent here from TR2 or TR6.
- **Job:** First service: hang tickets and ring the bell until the beat lands. The full service: commit a prediction, set the engine's levers (async scheduling, the graph mode, the molds on the rack, the runner, the allergy card's overlap), and ring the bell through the night the sim serves with them until it matches the house's. On `close`, graded, the job is one night: choose every lever from four cards before a single fire, serve the night once, and read the verdict against the house's bar (useful tokens per GPU-ms at least 97% of the house's, and no fire that reads a token before it is sampled).
- **Proof:** the session is the sim's step loop: the tick card on the front page's levels; on the full service, `runStepLoop` v1 on "70B on H100" (S5, derived) or the small-model napkin (synthetic), every µs tagged with its card; the mirror and the tape carry every figure the scene draws; Compose prints the vLLM and SGLang flags the levers compile to, and In production cites them as claims. `close`'s four cards print the model's own arithmetic on the seed's draws (tonight's tickets, what the line charges for a fire, what the expo charges, the backend and the room for routines), each figure a Readout with its tag; the live readouts and the house's clock wait for the night.
- **Constraints:** The Pass (DESIGN.md) is inherited; One Lamp and Only Code hold; the scene draws from scene kit v1 only, and the full service's new objects (the mold rack, the comb, the allergy card) are built the kit's way; numbers never enter the canvas; usable at 360 px, by keyboard and under reduced motion; D-023's frozen budgets (the scene chunk at most 40 KB gz, at most 100 draw calls).

## Direction contract

THESIS: Service's page is the pass in the middle of service, and the scene leads it: a real line under heat lamps where each bell is one step of the engine's loop, and the plates, the dark stations, the fired rail, the comb, the mold rack and the allergy card are the batch, the bubble, overlap, the launch calls, the captured sizes and the mask. It refuses the category's game page: a small canvas in a card beside a stats sidebar, a settings form beside a chart, and a lane chart standing in for the world.

OWN-WORLD: The Pass as built: the kit's room (subway tile, hood, quarry floor, haze), brushed and spun steel with moving highlights, glazed plates, ring molds of spun steel on a rack, a steel comb, bond tickets and the allergy card with dot print and curl, masking tape and marker for names; heat-lamp amber only on the present (the pass, a burning station, the mold the fire drops into); the 2D twin is the same pass in steel, paper and hotel pans; the tape stamped SYNTHETIC once on ticks, and on µs stamped with its card's tag; every number in Doto, in the DOM.

STORY: On First service the player hangs tickets and rings the bell, and learns that the line earns by full clips and a fired rail. On the full service they call a number before the night, ring through it, and watch the expo's work come back to the pass: the line drops dark while the expo calls every dish, the comb folds into one word when the routine is drilled, a fire drops into the smallest mold that holds it with its padding showing, and the allergy card outlasts a short fire. They change one lever, serve again, and read the tape to see the night match the house's.

FIRST VIEWPORT: At 1440 the 3D pass leads under the game's name, whole in the first screen, with the docket of levels above it. The pass carries the night: lamps at the top, the rail with its clips and tickets, the line glowing beyond, the plates across the lower middle, the printer at the left; on the full service the mold rack stands along the back of the pass behind the plates, each mold labelled with its size, the comb lies along the expo's edge, and on the mask level the allergy card lies in front of the expo. Beside it, the controls a hand needs: camera plates, the stage's tabs and prompt, the prediction (a dot-printed field or plates to choose, torn off with a stub), the levers (switches, mode plates, the rack's ladder of molds), the bell and Auto, and the tape under them. Under the scene, the view switch, the keys and the stages, then the mirror's table. At 390 the scene comes first, then the prediction, the levers and the bell, the tape, the switches and the mirror.

FORM: Service's stage, the pass over the expediter's shoulder, specified by GAMES.md §2.6 and §3 and A§6; the first and only form on the list. seed: none (specified surface, no roll).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The bell with overlap off: the line drops dark while the expo writes, then every hung clip's station burns amber and one plate per ticket slides onto the pass. With overlap on the fired rail takes the fire, and the line never goes dark. On the full service, the comb: with no routine drilled its teeth stand tall for every call while the line waits; drilled, it folds flat into one word on the bell, the fire's mold lights, and the line lights at once.

## Adaptations (finish review, round 2)

- **The lamps light the steel.** On the counter, three's own spot-light reflection (one smooth lobe in the lamp's full amber, clipped) is taken off, and the steel's own sheen and streak are brightened and warmed in its place, falling off softly. The 2D twin draws each pool as a lit gradient over the brushed top's grain.
- **The room falls away beyond the line.** Its light is baked into the tile and the floor, dimming toward the corners and over the hood, and its haze is deep steel.
- **The plates sit on the steel.** Each plate on the pass has a dark contact ring at its rim and a softer shade past it, and its underside is occluded against the counter.

## Adaptations (W1-T13, two looks at 1440 and 390)

- **The controls fit beside the scene.** The first look found the full service's controls running far past the scene at 1440: the scene's box grew taller, the stage prompts were cut to what the stage asks, and the levers compacted. The second look still found the mold rack's column about 300 px past the view's switches, a hole under the scene, so the tape moved under the controls in their column and the mirror joined the grid under the switches, on the only flexible row: the mirror stands under the switches however long the controls run, and the page's order stays the keyboard's.
- **The ladder walks every plate.** The rack's ladder never disables a plate: a mold past the rack's few is refused in words ("The rack holds 3 molds: take one off first."), so the arrows walk all twelve sizes. Calling the prediction and closing a stage move focus on to the next thing to press.
- **The 2D twin names its molds.** Each mold on the 2D rack has its size stamped on the steel in front of it, the fire's mold on a chip in the lamp's light, as the 3D scene labels them.
- **The waiting keys read on the lit plate.** "· waiting" on the docket takes the lit plate's own ink when the keys are open, where its quiet grey sank into the dark plate.

## Adaptations (W1-T14, looks at 1440, 390 and tier 1)

- **The cards stand under the view, in two columns.** The first look put `close`'s four slips in three columns, which left the fourth alone on a second row with a hole beside it, and the paired figures of the expo's card (the V2 runner's, then the legacy runner's) ran together as one. The grid is two slips wide on a wide page and one on a phone, each pair names its figures ("MRV2", "V1") and takes a row of its own for the base and for each sequence, and the backend's support is a sentence under its label.
- **A closed-book night keeps the house to itself.** Before the night is served the 2D footer, the tape and the mirror print the clock alone, with no "against the house", and the mode a lever resolves to and the memory the routines take are not drawn (the cards and the lever panel hold the arithmetic); once the night is served, both appear with the verdict ticket under the bell, which reads one line of words and the share of the house's tokens for each ms against the bar.
- **The debrief reads the configuration lever by lever.** A table of the learner's configuration against the house's, with a row marked where they differ, comes before the stage table, which a one-stage level keeps for its call against the model's.
- **A graded run is asked for in one line above the controls** ("This level can be graded, on fresh numbers." and one button); in a graded run the line says so, Undo is not drawn, and the debrief offers another graded run and practice.

## Adaptations (W1b-T10, the scene kit's haze, the lamp's pool and paper; two looks at 1440 and 390)

- **The lamps' light is the kit's** (W1b-T10): no spot light, but under each lit lamp a cone of warm haze from inside its shade's lip down to the surface and an edgeless pool where it lands, at every tier, which brightens the steel and lays no colour of its own; paper lying in it stays white. A lit end on the cone's mouth drew a hard peach disc under each shade in the task's first look, so the mouth is dark and the shade's own bulb is its glow.
- **Paper is the kit's** (W1b-T10): a tooth of soft fibres and a normal that catches a raking light, a shade darker toward its cut edges, a millimetre thick at the scene's scale and curled at its foot [estimated].
- **The pools on the pass** are round a plate's place and gone before the next lamp's, and the steel reflects the tubes and not the lamps' glow, so the amber lies under the three lamps and nowhere else. In 2D each pool is the lamp's amber from a low lift at its middle to nothing at its rim, with no white-hot core, and the brushed grain shows through it.
- **The room falls into haze:** its light is full behind the worktops and falls up the tile to the hood and toward the corners into a veil of deep steel, and the haze begins nearer the line.

## Adaptations (W1b's finish review, round 1; two looks at 1440 and 390)

- **The 2D pools are drawn on the steel.** Under each lamp, three flat washes of the lamp's amber lie in the counter's plane, one inside the next, and over them the brushed lines the light catches: streaks of amber on the grain's own lines, fading out toward their ends and toward the pool's rim. No blur and no radial glow, and the steel's lines run through the light.
- **At T1 the pools are amber again.** There the kit's light adds after the tone curve, where amber laid on pale steel reads as a pale smudge, so the steel in each pool is also warmed toward the amber by scaling its own colour, which keeps its grain's light and dark.
- **The room darkens as it recedes.** Its light falls off sooner toward the sides, so a phone's frame and a laptop's right side end in darker tile; the haze is the shadows' ink, darker than the floor's tile as well as the wall's; and the aisle between the pass and the line lies in shade, so the floor seen under the pass darkens away from the expo instead of catching the tubes.

## Adaptations (W1b's finish review of the lesson blocks, round 1; two looks at 1440 and 390)

- **The tapes are the design system's tape, on what they name.** Each name (the line's, the expo's, the bin's, the comb's, the rack's) is masking tape in the DOM, torn off at the size of its words and never smaller than the size ramp's smallest step (11 px on a phone, about 13 px on a laptop), so the lesson's GPU and CPU read at any width. Each is stuck on its object: the line's on its last station's cabinet, under the fired rail and over the pass's back edge, the expo's on the pass's front edge, the bin's on its front, the comb's on the front edge under it, the rack's at its row's right end. From the side of the pass the line's station stands behind the counter, so its tape is hidden there with the counts beside the tools, and on a phone every tape is, as that shot is too small to hold them.
- **The bell reads as chrome on deep steel.** Its dome is turned narrower than its base, so the base's deep steel rings its foot, with the plunger's knob on its crown, and its chrome mirrors the kit's room brighter than brushed steel does: the tubes' streaks white, the room light, and a dark band at its foot.
- **On a phone the 2D view holds the whole pass.** The portrait shot is drawn through a wider lens (`PASS_LENS`) and fitted to the box's width, so the printer that issues the tickets and the bell and the spike stand inside it.
- **The full service's debrief reads on a phone.** Its ticket is a size container, and under 36rem the stage table prints each stage as a block of its own, as the mirror's table does, with the learner's call against the model's on its own line.

## Adaptations (W1b's finish review of the lesson blocks, round 2; two looks at 1440 and 390)

- **The bell is polished chrome on deep steel.** Its dome and plunger take the palette's polished finish, even all over with no grain and soft enough that the room's tubes merge into one highlight that rolls over the crown, with the body a shade brighter than the counter and a darker band at the foot. Mirrored as sharply as chrome, the dim room drew the tubes as hard stripes, an emblem on a grey mouse. Its base is turned steel in deep steel's tone, its chamfered rim ringing the dome's foot, and the spike beside it keeps the darker brushed deep steel. The first look found the dome burnt out to a flat white ball, so the room it mirrors was dimmed and the base turned a shade toward deep steel.
- **The 2D view prints no word: its names are the design system's tape in the DOM.** The line's, the fired rail's and the expo's names, and on the full service the comb's and the rack's, are masking tape over the drawing at the 3D layer's size, from the size ramp's smallest step to its caption step, each stuck on its object: the line's on its last station's cabinet, between the fired rail's tickets and the pass's back edge; the fired rail's on its channel's left end, ending by its first ticket, so it covers no ticket on a phone; the expo's on the pass's front edge; the comb's on the front edge under its left end, clear of the expo's; and the rack's at its row's right end, under the line's. The front page's 2D view and its posters follow: the posters hold no tape, and the page prints the tapes beside them.

## Adaptations (W1b close-out, the 2D view's labels; two looks at 1440 and 390)

- **The 2D view prints no number either: all its print is DOM, each piece on its object, at the tapes' size.** The tapes round's verdict found the stubs' word at about 4 px at 1440 and 2 px at 390 [measured by the reviewer], and the tickets' numbers and the printer's counts as small. A hung ticket's number is Doto on paper of its own over the ticket; an empty clip's stub hangs from the clip's jaw, perforated paper with "empty" in the ribbon's red, as the 3D layer's stubs; what the printer still holds is a deep-steel chip on its housing's face; a fed ticket's number is printed on its slip on the counter; on the full service each mold's size is stamped on the steel in front of it and the fire's mold's on a chip of the lamp's amber. Print that needs room, the fired rail's copies, the fed tickets, the molds' sizes and the numbers on the full service's twelve clips, shows in a drawing box 520 px wide or wider [estimated], the scene's own measure; on a phone the mirror and the controls carry it. On those twelve clips a stub's word would cover its neighbours', so there the stub is its perforated paper alone. The first look found the printer's count floating over the floor above the printer, the fed tickets' numbers boxed on paper over the slanted slips, and the twelve clips' numbers running together on a phone; the count moved onto the housing, the slips' numbers lost their paper, and the crowded rail's numbers took the room rule.

## Unresolved

- GAMES.md §3's "3D scene" and "2D path" still describe lanes along time (a Gantt). This page draws the present instead (the rail, the fired rail, the last fire's plates, the stations), and the night's timeline lives in the tape and the mirror, and in the debrief's compare strips. The docs need the owner's amendment.
- The steam over a lit station departs from GAMES.md §2.6 rule 1 (no steam), as scene kit v1 already noted.
- The comb draws a tooth for each layer of the card's model, as tall as the calls that layer takes, where GAMES.md §3 says a tooth per call: the calls of an eager fire run to hundreds, and per call the comb could not show piecewise against eager. The count is DOM.
- `keys` waits behind its card until the owner commits the dispatcher tables (Q-10); the card shows what the level will teach and the facts In production will cite.
- `close` is a long page: its four cards stand under the view (after the tape, on a phone), and once the night is served the mirror's table lists every fire of it, 57 rows on the practice seed [measured 2026-11-05 over wave-1 at f4c2395 with this task's tree]. A graded night is judged on its verdict, so the table may want to start collapsed.
