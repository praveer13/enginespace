---
version: 1
slug: "src-games-engine-floor-game-tsx"
primary_target: "src/games/engine-floor/Game.tsx"
related_targets: ["src/games/engine-floor","packages/play/engine-floor"]
---

# Back of House

## Scope

- **Surface:** the Engine Floor's page (`/play/engine-floor`), in Operate mode: Back of House, GAMES.md §5 (working name The Engine Floor), its practice levels `nano` to `abort` and the graded `map` (W1-T19), drawn in 2D. A whole surface inside the established world, specified by GAMES.md §2.6 and §5 and by A§6.3, so there is no concept roll. The 2D view is the game's first paint and its 3D-off path; the 3D scene (W1-T18) joins this page later.
- **Visitor:** a kernelspace graduate in TR1, who has read part of an engine (nano-vllm, Mini-SGLang, "Inside vLLM", or vLLM or SGLang at the pin) and now has to say, stage by stage, how one request gets from the client to the GPU and back.
- **Action:** commit a prediction, lay stages from a tray into a path, run it, read the first stage that did not hold and the file it lives in, fix it and run again.
- **Proof:** the stages are the pinned lifecycle data of `packages/sim/lifecycle` (W1-T16), each cited to its file, symbol and line at the commit the course pins. A wrong answer is explained from that source, and the page never says a stage is right because it looks right: the rules of GAMES.md §5 are functions, and the path is compared with the engine's own.
- **Constraints:**
  - the PRODUCT.md and DESIGN.md constraints (one lamp, only code, dots for numbers, no dark scheme), zero servers, nothing collected;
  - complete by keyboard alone, at 360-390 px and at laptop width, with reduced motion;
  - every fact the drawing shows is also in the mirror table, and nothing is timed.

## Direction contract

THESIS: A request is a ticket, and the engine is a house it walks through. The page is the expo drawing the ticket's route floor by floor, and it will not carry the ticket past a hand-off that does not hold. It refuses the category's sequence-diagram widget: grey lifelines, thin arrows, a legend of swatches, and a green or red toast.

OWN-WORLD:
- **Floors:** brushed-stainless shelves stacked down the page, one for each process, named in marker on masking tape with the engine's own name beside; the line (the GPU) is the deep-stainless counter at the bottom. Floors differ by height and by name, never by colour alone.
- **The ticket:** white bond paper with a punched hole. It stands on the lane where the last hand-off that held left it.
- **Hand-offs:** drawn objects in ink on small paper tiles: a spike, a ticket window, a window shelf, a dumbwaiter going down or coming up, a call to the line, a boom gate for "Heard!", two halves passing. Each has its word on its tile, the kitchen's beside the engine's. Hand-offs carry no board colour.
- **Code:** the board colours mark only the lane's kind, a blue circle for hands on a CPU thread and a green square for a stream on the GPU, always beside the lane's name.
- **Numbers:** stage numbers and counts in the printer's dots; the learner's own prediction printed the same way, untagged.
- **A stage that failed:** struck in the ribbon's red with a drawn mark, and its source printed under it. The red is never a board colour.
- **The one lamp:** amber pools only where the next hand-off starts, the end of the laid path. History, the struck stage and the debrief never take it.

STORY: The learner comes to see that a request never teleports. It crosses a floor only through a window or a shelf, a thread only through a spike, the line only by a dumbwaiter or by being called, and it reads nothing the line made before "Heard!". They believe the route is something they can lay from what they read, because the page checks it against the pinned source and says where the engine does it. They predict, lay, run, read the first hand-off that failed with its file and symbol, fix it and run again. In the debrief they set their engine's house beside the other's and can say where detokenizing runs and how many windows a sampled token crosses.

FIRST VIEWPORT:
- **At 1440 px:** the game's plate, "Back of House" over "a request's lifecycle", the level on a tape label, the view keys and the stages. Two columns under it.
  - Left: the house in section, drawn at the width of the column. Before the prediction only the dining room's shelf is drawn, with the ticket standing on it under the lamp, because the prediction asks how many floors a sampled token crosses and the drawing must not answer it. Under the drawing, the order ticket: the scenario (engine, pin, what the request asks), the prediction ("how many process boundaries does a sampled token cross on its way to the client?"), a row of number plates, and the stub "Commit the prediction". Writing the prediction down builds the house: every floor and lane of the engine's path appears, each named on its tape, and the tray opens. From then the route builds as stages are laid, and nothing in the drawing moves.
  - Right: the mirror's ticket, empty, with its caption.
- **At 390 px:** one column in the order drawing, order ticket, tray, path, mirror. The drawing runs down the phone: lanes are columns, stages are rows, so a phone's height shows the route. The number plates stay on one row at 44 px.
- **The primary action:** committing the prediction, then pressing a card of the tray. After that the stub "Run the path" is the thing to pull.

FORM: The Pass's order ticket and the house in section (GAMES.md §2.6, Back of House: floors, hands, spikes, windows, the dumbwaiter, "Heard!", twin cooks). The tray is a set of hand-off cards. Specified surface, so the form was not rolled. seed: none (specified surface, no roll). Signature interaction: pulling the stub sends the ticket along the laid path, and the route inks stop by stop until the first stop that does not hold, which is struck in the ribbon's red with its file printed under it. Motion grammar: nothing moves until the stub is pulled, then one stepped inking in the printer's line steps; every duration is 0 under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## The graded map (W1-T19)

`map` is the same house with three things changed, and no new object.
- **The mode bar.** One line above the order, only on the level that can be graded: practice says "This level can be graded, on a fresh scenario of any of the five engines" with a plate, "Start a graded run"; a graded run says "A graded run: a fresh scenario, no undo and one run" with "Back to practice". The row of levels sits at the foot of the controls. Neither takes the lamp.
- **The order names the engine,** because the level's title is not an engine's, and a graded run has no Undo plate. The tray holds every stage the engine has and four of other engines, so a card the engine makes for another request is a trap that the card of the request answers, and a wrong one is named for what it needs.
- **The house builds with the route.** Until the one run is judged the drawing has the floor the request begins on and the floors the route has reached, and the mirror does not give the path's length. Once judged, the whole house is drawn, the tray closes with "The run is over", and nothing on the page can take the path back.
- **The debrief reads the path against the tape:** "Passed." or "Not passed." in the ink, the table of the check (a row for each laid stage with the span it matched, its track, and its start and length in synthetic ns), the first stage that parted from the tape struck in the ribbon's red with a drawn mark and the word, and the lifecycle trace in the trace viewer below it, read-only, as a lazy chunk. Its way on is another fresh scenario.

## Memorable moment

The first struck stop. A learner lays the engine core's `update_from_output` straight after `schedule`; the route inks up to the pass and stops before it, the stop is struck in red, and the ticket under it prints, in the printer's dots, the file and line where the engine calls the model first.

## Unresolved

- **The hand-off glyphs:** the eight drawn marks (spike, window, shelf, dumbwaiter down and up, call, gate, halves) and the pencil for work in place are built in `src/games/engine-floor` on the design system's 24-unit grid, because `src/design` is outside this task's files. The finish review may move them into `Glyph.tsx`.
- **The tray at 390 px:** once it opens it holds up to two dozen cards, one to a row on a phone, and the graded `map`'s holds up to forty (all of the engine's stages and four of other engines' [derived from the pinned lifecycle data]). The platform chips cut it to the cards that start on one floor, and the finish review decides whether the default view should start there.
- **The mirror at 390 px:** the kit prints each row of the table as a block, which makes a path of two dozen stages a long page. The finish review decides whether a phone wants a shorter form of it.
- **Level titles:** a title names the engine and nothing of its architecture ("one process" or "four processes" would answer the prediction), and the level's note, which says what the level is about, appears once the prediction is written.
- **The 3D scene:** W1-T18 builds the scene from the same session. A scene must keep the graded `map`'s path to itself as the 2D view does: it draws the house only as far as the route has gone while `view.sealed` is true, and shows no length of the path.
- **The graded map's tape:** the debrief shows the scenario's lifecycle trace in the trace viewer, whose kitchen words name a thread's lane "the expo's lane" because the viewer was built for the step loop's main thread. On a lifecycle tape every thread is one pair of hands, and the words are the viewer's to change (a `laneWords` prop would do it) and not this page's.
- **The level list at 390 px:** eight plates wrap onto three rows under the path. The finish review decides whether a phone wants the list above the order instead.
- **The kitchen word for work in place:** GAMES.md §2.6 names glyphs for hand-offs and not for a stage that does its work where the ticket already stands (tokenizing, scheduling). This page draws it as a pencil on the hands that do it and calls it "hands at work".
