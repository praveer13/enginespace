---
version: 1
slug: "src-games-engine-floor-game-tsx"
primary_target: "src/games/engine-floor/Game.tsx"
related_targets: ["src/games/engine-floor","packages/play/engine-floor"]
---

# Back of House

## Scope

- **Surface:** the Engine Floor's page (`/play/engine-floor`), in Operate mode: Back of House, GAMES.md §5 (working name The Engine Floor), its practice levels `nano` to `abort` and the graded `map` (W1-T19). A whole surface inside the established world, specified by GAMES.md §2.6 and §5 and by A§6.3, so there is no concept roll. Since W1-T18 the view leads the page as the 3D house in cutaway (`Scene3D.tsx`), with the controls beside it; the 2D house in section is its first paint, its fallback and its 3D-off path, one key (`V`) away.
- **Visitor:** a kernelspace graduate in TR1, who has read part of an engine (nano-vllm, Mini-SGLang, "Inside vLLM", or vLLM or SGLang at the pin) and now has to say, stage by stage, how one request gets from the client to the GPU and back.
- **Action:** commit a prediction, lay stages from a tray into a path, run it, read the first stage that did not hold and the file it lives in, fix it and run again.
- **Proof:** the stages are the pinned lifecycle data of `packages/sim/lifecycle` (W1-T16), each cited to its file, symbol and line at the commit the course pins. A wrong answer is explained from that source, and the page never says a stage is right because it looks right: the rules of GAMES.md §5 are functions, and the path is compared with the engine's own.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints (one lamp, only code, dots for numbers, no dark scheme), zero servers, nothing collected;
  - complete by keyboard alone, at 360-390 px and at laptop width, with reduced motion;
  - every fact the drawing shows is also in the mirror table, and nothing is timed.

## Direction contract

THESIS: A request is a ticket, and the engine is a house it walks through. The page is that house in cutaway, a real back of house at night, and it will not carry the ticket past a hand-off that does not hold. It refuses the category's two defaults: the sequence-diagram widget (grey lifelines, thin arrows, a legend of swatches, a green or red toast) and the 3D lifecycle graph (grey boxes on a void, glowing pipes between them).

OWN-WORLD (the 3D house):
- **The house:** brushed-stainless decks with rolled front edges, one storey for each process, stacked against subway tile on a quarry-tile floor; the line at the bottom is scene kit v1's own burners, griddle and fryer under the hood, with its ticket rail. The room falls into a haze of deep steel past the house, never into a void.
- **Its towers:** the ticket windows stand in a column of steel frames at the house's left, one into each storey, and the dumbwaiter's shaft at its right runs every storey down to the line, its car riding it. Both are the house's furniture, so neither tells the path.
- **Hands:** each thread's spot is a short ticket rail on the tile with a heat lamp over it; the client sits at a dining table on the top storey. Spikes and the "Heard!" gate stand where a stage lays them.
- **The one lamp:** of all the lamps, only the one over the present is lit and pools amber on its deck; on the line, the present's station burns instead. Nothing else glows but the hood's white tubes.
- **Words and numbers:** floor and hands names are marker on masking tape, and each hand-off carries a paper chit of its stage numbers in the printer's dots, struck in the ribbon's red where the ticket stopped: all DOM.

OWN-WORLD (the 2D house):
- **Floors:** brushed-stainless shelves stacked down the page, one for each process, named in marker on masking tape with the engine's own name beside; the line (the GPU) is the deep-stainless counter at the bottom. Floors differ by height and by name, never by colour alone.
- **The ticket:** white bond paper with a punched hole. It stands on the lane where the last hand-off that held left it.
- **Hand-offs:** drawn objects in ink on small paper tiles: a spike, a ticket window, a window shelf, a dumbwaiter going down or coming up, a call to the line, a boom gate for "Heard!", two halves passing. Each has its word on its tile, the kitchen's beside the engine's. Hand-offs carry no board colour.
- **Code:** the board colours mark only the lane's kind, a blue circle for hands on a CPU thread and a green square for a stream on the GPU, always beside the lane's name.
- **Numbers:** stage numbers and counts in the printer's dots; the learner's own prediction printed the same way, untagged.
- **A stage that failed:** struck in the ribbon's red with a drawn mark, and its source printed under it. The red is never a board colour.
- **The one lamp:** amber pools only where the next hand-off starts, the end of the laid path. History, the struck stage and the debrief never take it.

STORY: The learner comes to see that a request never teleports. It crosses a floor only through a window or a shelf, a thread only through a spike, the line only by a dumbwaiter or by being called, and it reads nothing the line made before "Heard!". They believe the route is something they can lay from what they read, because the page checks it against the pinned source and says where the engine does it. They predict, lay, run, watch the ticket go through the house and stop dead at the first hand-off that failed, read its file and symbol, fix it and run again. In the debrief they set their engine's house beside the other's and can say where detokenizing runs and how many windows a sampled token crosses.

FIRST VIEWPORT:
- **At 1440 px:** the game's plate, "Back of House" over "a request's lifecycle". Under it the scene leads, about 870 by 630 px: the house in cutaway at three quarters from the right, a little above, every storey's deck in view, the line glowing under its hood at the foot and the lit lamp over the ticket. Before the prediction only the floor the request begins on stands in the room, with the ticket under its lamp, because the prediction asks how many floors a sampled token crosses and the house must not answer it. Beside the scene, a 20rem column: the camera plates (Cutaway, one per floor, Follow the ticket), then the order ticket (the scenario, the prediction's number plates, the stub "Commit the prediction"); writing the prediction down builds the house and opens the tray and the path under it. Under the scene, the view switch, the keys and the stages; then the mirror across the width.
- **At 390 px:** the scene first, the house framed upright to fill the box (about 55% of the screen), then the camera plates, the order, the tray, the path and the mirror. The 2D view (`V`) runs down the phone as before.
- **The primary action:** committing the prediction, then pressing a card of the tray, beside the house that builds as each is laid. After that the stub "Run the path" (or `R`) sends the ticket.

FORM: The house in cutaway, the 3D form GAMES.md §5 and §2.6 specify (Back of House: floors, hands, spikes, windows, the dumbwaiter, "Heard!", the line), over the 2D house in section and The Pass's order ticket. The tray is a set of hand-off cards. Specified surface, so the form was not rolled. seed: none (specified surface, no roll). Signature interaction: pulling the stub sends the ticket along the laid path, one stage to the bell: out through the window, down the dumbwaiter's shaft in its car, onto the line's rail while its station burns, back up, under the gate, until the first hand-off that does not hold, where it balks and stands, and that hand-off's chit is struck in red. Motion grammar: nothing moves until the stub is pulled; between runs the house is still; under reduced motion every change cuts and the camera cuts between its stops.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## The graded map (W1-T19)

`map` is the same house with three things changed, and no new object.
- **The mode bar.** One line above the order, only on the level that can be graded: practice says "This level can be graded, on a fresh scenario of any of the five engines" with a plate, "Start a graded run"; a graded run says "A graded run: a fresh scenario, no undo and one run" with "Back to practice". The row of levels sits at the foot of the controls. Neither takes the lamp.
- **The order names the engine,** because the level's title is not an engine's, and a graded run has no Undo plate. The tray holds every stage the engine has and four of other engines, so a card the engine makes for another request is a trap that the card of the request answers, and a wrong one is named for what it needs.
- **The house builds with the route.** Until the one run is judged the drawing has the floor the request begins on and the floors the route has reached, and the mirror does not give the path's length. Once judged, the whole house is drawn, the tray closes with "The run is over", and nothing on the page can take the path back.
- **The debrief reads the path against the tape:** "Passed." or "Not passed." in the ink, the table of the check (a row for each laid stage with the span it matched, its track, and its start and length in synthetic ns), the first stage that parted from the tape struck in the ribbon's red with a drawn mark and the word, and the lifecycle trace in the trace viewer below it, read-only, as a lazy chunk. Its way on is another fresh scenario.

## Memorable moment

The first struck stop. A learner lays the engine core's `update_from_output` straight after `schedule` and pulls the stub; in the house the ticket goes through the host stand's window, along the chute and out onto the pass, and balks at the hand-off that does not hold, whose chit is struck in red, and the order prints, in the printer's dots, the file and line where the engine calls the model first. In the 2D house the route inks up to the pass and stops before it.

## Adaptations (W1-T18, two looks at 1440 and 390)

- **The first look** read as an empty steel shelving unit: the window frames floated at the decks' ends like handles, the shaft was a black column, the line sat cramped under the pass's deck with its hood hidden, labels collided and almost nothing was amber. The second build widened the lanes to a metre, raised the line's storey so its hood shows, cut the windows into a steel partition with sills and hid the chute behind it, opened the shaft, gave the present's lamp its cone at T2 and more light, and framed the one storey there is before the prediction.
- **The second look** confirmed those and still showed labels meeting: an IPC chit over a storey's tape, the line's tape crowding the deck's above it, long thread names overlapping. They were moved by geometry, after the ceiling of two looks: storey tapes start just right of the partition, IPC chits sit left of it, the line's tape sits at the hood's foot, thread tapes wrap at their hyphens to about a rail's width, and work-in-place chits sit beside the hanging ticket. The line's name went onto a strip of masking tape on the hood's skirt, Service's way, which also keeps the 3D core in one chunk for every scene (GAMES.md §5, "Budget"). The finish review sees the result first.
- **The scene leads the page** (GameShell's `stage`): the house beside the controls, so laying a card shows the hand-off appear. A run sent from the path, far down the column, plays when the house comes back into view.

## Unresolved

- **The hand-off glyphs:** the eight drawn marks (spike, window, shelf, dumbwaiter down and up, call, gate, halves) and the pencil for work in place are built in `src/games/engine-floor` on the design system's 24-unit grid, because `src/design` is outside this task's files. The finish review may move them into `Glyph.tsx`.
- **The tray at 390 px:** once it opens it holds up to two dozen cards, one to a row on a phone, and the graded `map`'s holds up to forty (all of the engine's stages and four of other engines' [derived from the pinned lifecycle data]). The platform chips cut it to the cards that start on one floor, and the finish review decides whether the default view should start there.
- **The mirror at 390 px:** the kit prints each row of the table as a block, which makes a path of two dozen stages a long page. The finish review decides whether a phone wants a shorter form of it.
- **Level titles:** a title names the engine and nothing of its architecture ("one process" or "four processes" would answer the prediction), and the level's note, which says what the level is about, appears once the prediction is written.
- **The 3D scene (W1-T18):** it keeps the graded `map`'s path to itself as the 2D view does (a sealed view builds only the floors the route has reached). Open for the finish review: the house still reads more as stacked steel decks than as rooms; only the present's lamp is lit, so a level whose ticket is home is all steel and tile; the ticket is small in the cutaway of a six-storey house (the follow stop shows it close); and TP ranks stand as their own storeys rather than as twins in depth (GAMES.md §2.6), as the 2D house plans them.
- **The house's names at 390 px:** a pair of hands' tape is hidden in a canvas under 460 px wide, where three would meet; the mirror, the tray's cards and a floor's own stop carry them.
- **The graded map's tape:** the debrief shows the scenario's lifecycle trace in the trace viewer, whose kitchen words name a thread's lane "the expo's lane" because the viewer was built for the step loop's main thread. On a lifecycle tape every thread is one pair of hands, and the words are the viewer's to change (a `laneWords` prop would do it) and not this page's.
- **The level list at 390 px:** eight plates wrap onto three rows under the path. The finish review decides whether a phone wants the list above the order instead.
- **The kitchen word for work in place:** GAMES.md §2.6 names glyphs for hand-offs and not for a stage that does its work where the ticket already stands (tokenizing, scheduling). This page draws it as a pencil on the hands that do it and calls it "hands at work".
