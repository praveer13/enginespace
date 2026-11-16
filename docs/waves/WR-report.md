# Wave R report

**Status:** the running record of wave R, the redesign ([REDESIGN.md](../REDESIGN.md), "You Are Here"). Stage 0 opens it; later tasks add their sections below. **Plan:** [wr-tasks.json](wr-tasks.json). **Diagnosis:** [WR-diagnosis.md](WR-diagnosis.md).

**Tags** follow ARCHITECTURE. A figure tagged [measured] with no date or SHA of its own in this section was measured on 2026-11-15 at `dcba8ef`, the first commit of `wave-r`: `wave-2` at `5c03405` plus the redesign's three documents, so its code is `wave-2`'s (`git diff --stat 5c03405 dcba8ef` lists only `docs/REDESIGN.md`, `docs/waves/WR-diagnosis.md` and `docs/waves/wr-tasks.json`). Sizes are `verify:bundle`'s: gzip by node:zlib's default level under Bun 1.3.14, 1 KB = 1,000 B. Gates are D-023's and stay [estimated]; the allowances are the brief's section 4 and are [estimated] design parameters.

---

## 1. Stage 0: the budget ledger (R-T03)

`npm run build`, then `bun scripts/verify-bundle.ts`, on the tree above: 64 budgets gated, all passing, one over its target (the front page's JavaScript). Every later task of the wave reports against these rows. No gate, budget or `tests/bundle` file moved, and none may (section 4, "Budgets").

### 1.1 First paint and the entry

| Row | Measured | Gate | Room under the gate | Allowance in this wave (§4) |
|---|---|---|---|---|
| Entry closure (the entry and react-vendor) | 99,177 B [measured] | 110 KB | 10,823 B | None expected: the header reads one `localStorage` key, and `nextStep` loads with the ledger |
| Front page first-paint JS (25 chunks: the entry, the Front page, the course index and their static imports) | 148,189 B [measured] | 150 KB (target 130 KB) | 1,811 B (18,189 B over the target) | Must end at or under the gate. The lane layout replaces the kitchen drawing and the landmark code goes |
| Front page first-paint CSS (one stylesheet) | 18,843 B [measured] | 30 KB (target 20 KB) | 11,157 B | Falls: textures, tape and plates leave |
| Front page JS and CSS together | 167,032 B [measured] | no gate | | |
| The document, `index.html` | 21,761 B [measured] | no gate | | |
| Fonts preloaded (3 faces, as served) | 35,748 B [measured] | no gate | | Three faces leave with the look (stage 2) |
| Course index | 2,304 B [measured] | target 6 KB | 3,696 B under the target | |
| Route table | 1,596 B [measured] | no gate | | |

The brief's last known front-page figure was 147,337 B [the diagnosis, from W1]; it is now 852 B larger [derived]. Its largest pieces besides react-vendor (62.2 KB) and the entry (36.9 KB): the kitchen drawing's chunk (`FrameLabels`, with `layout.ts` and `kitchen.ts` inside it) 12,138 B, the Front page's own chunk 8.8 KB, the loop's session 5.1 KB and the mirror table 4.7 KB [measured].

### 1.2 Routes

Every route but the front page counts its page, the entry and their static imports, JavaScript and CSS together; a game's route counts its game.

| Route class | Route | Measured | Gate | Room | Allowance in this wave (§4) |
|---|---|---|---|---|---|
| Lesson | `/m/:module/:lesson` | 147,482 B [measured] | 200 KB | 52,518 B | The rail and popovers at no more than +3 KB, and the claim chips' code leaves. The dock loads with the game chunk |
| Module | `/m/:module` | 191,438 B [measured] | 200 KB | 8,562 B | No row of its own in §4; held to the gate |
| Course | `/map` | 171,986 B [measured] | 200 KB | 28,014 B | Held to the gate |
| Games index | `/play` | 135,224 B [measured] | 200 KB | 64,776 B | Held to the gate |
| Game | `/play/engine-floor` (Request path) | 192,116 B [measured] | 200 KB | 7,884 B | The frame replaces the shell at no more than +2 KB; the intro and the source table are lazy chunks |
| Game | `/play/verifier` (Rejection sampler) | 187,889 B [measured] | 200 KB | 12,111 B | As above |
| Game | `/play/pool` (KV page pool) | 186,019 B [measured] | 200 KB | 13,981 B | As above |
| Game | `/play/broken-bench` (Broken benchmark) | 190,068 B [measured] | 200 KB | 9,932 B | As above |
| Game | `/play/loop` (Step loop) | 185,649 B [measured] | 200 KB | 14,351 B | As above |
| Review | `/today` | 184,951 B [measured] | 200 KB | 15,049 B | Held to the gate |
| Lab | `/labs/:lab` | 125,117 B [measured] | 200 KB | 74,883 B | Held to the gate |
| Traces | `/trace-room`, `/trace-room/:trace` | 121,402 B [measured] | 200 KB | 78,598 B | Held to the gate |
| Other | `/receipts` | 188,487 B [measured] | 200 KB | 11,513 B | Held to the gate |
| Other | `/evidence` | 168,520 B [measured] | 200 KB | 31,480 B | Held to the gate |
| Other | `/design` | 176,467 B [measured] | 200 KB | 23,533 B | Held to the gate |
| Other | `/settings` | 176,702 B [measured] | 200 KB | 23,298 B | Held to the gate |
| Other | `/about` | 121,965 B [measured] | 200 KB | 78,035 B | Held to the gate |
| Other | `/changes` | 121,351 B [measured] | 200 KB | 78,649 B | Held to the gate |

What loads on demand, with no gate of its own (the gate prints these rows without a verdict) [measured]: a lesson with its game block's embed and its game is 216,912 B with Request path, 211,485 B with the Rejection sampler, 209,981 B with the KV page pool, 212,128 B with the Broken benchmark and 210,171 B with the Step loop; with the Step loop's full levels (`FullService`) it is 257,163 B, and `/play/loop` with them is 236,127 B. The loop's own lazy game chunk (`packages/play/loop/game.ts`) is 40,467 B with what it adds to the entry.

### 1.3 Scenes, three and post-processing

A scene's row counts its own chunk, its CSS and the chunks only 3D reaches; the props chunk (`scene-kit`, `src/scene/props`) is inside every scene that reaches it. "Without the props chunk" subtracts it and is [derived].

| Row | Measured, with the props chunk | Without the props chunk | Gate | Room | Allowance in this wave (§4) |
|---|---|---|---|---|---|
| `scene-engine-floor` (Request path) | 39,370 B [measured] | 18,404 B [derived] | 40 KB | 630 B | Cut at stage 4 |
| `scene-loop` (Step loop, the kitchen) | 37,555 B [measured] | 16,589 B [derived] | 40 KB | 2,445 B | Stays until stage 4; the new time track is a scene file of its own (1.5) |
| `scene-pool` (KV page pool) | 39,766 B [measured] | 18,800 B [derived] | 40 KB | 234 B | Re-skinned from kit primitives, 30 KB as the target |
| `scene-verifier` (Rejection sampler) | 38,694 B [measured] | 17,728 B [derived] | 40 KB | 1,306 B | Re-skinned from kit primitives, 30 KB as the target |
| `scene-kitchen` (`/design`'s kitchen) | 36,532 B [measured] | 15,566 B [derived] | 40 KB | 3,468 B | Deleted at stage 4 |
| `scene-specimen` (`/design`'s specimen) | 15,296 B [measured] | reaches no props | 40 KB | 24,704 B | |
| `scene-kit`, the props chunk alone | 20,966 B [measured] | | 40 KB | 19,034 B | Deleted at stage 4 |
| `three-vendor` | 238,647 B [measured] | | 245 KB | 6,353 B | |
| `postfx` | 5,468 B [measured] | | 25 KB | 19,532 B | |

### 1.4 Workers and content

| Row | Measured | Gate | Room |
|---|---|---|---|
| `receipt.worker` | 55,226 B [measured] | 60 KB | 4,774 B |
| `forge.worker` | 2,595 B [measured] | 40 KB | 37,405 B |
| Lesson JSON, the largest (`tr1.l2-nano-vllm-in-one-sitting`) | 9,289 B [measured] | 40 KB each | 30,711 B |
| Module JSON, the largest (`tr6`) | 3,027 B [measured] | 40 KB each | 36,973 B |
| The site under `dist/` | 6,532,453 B in 297 files [measured] | Pages' 1 GB cap | |

### 1.5 The lane spike

**Verdict: go.** The skeleton's front-page JS closure is 129,600 B, under the 140,000 B go line, and the step loop's scene without the props chunk is 13,638 B, under the 30,000 B go line [measured; thresholds estimated]. No cut of the brief's is needed for the front page or the scene. Three rows of the old tree moved on the spike's build, and one of them is still open (1.6).

**What was built.** `packages/play/loop/lanes.ts` (merged, with `tests/play/loop-lanes.test.ts`): the pure lane layout for the demo levels, from the loop's view. On a scratch branch that was not merged and is deleted:
- `src/front/FrontPage.tsx` as a skeleton: the h1 and lede, the instrument's DOM (title strip, goal line, the waiting queue's request chips, the lanes, the readout strip with its four counters, the dock with Step, Undo and Auto-step, the coach strip with the five parts and the first move, the title block), the live run on `useRun` with the loop's session and its keys, the 2D/3D switch, and below the fold the outcomes, the path from the course index and the credit lines. The static poster is the lane layout drawn as SVG by the page on the server, so the static HTML holds it. No kitchen drawing (`layout.ts`, `kitchen.ts`, `FrameLabels`, `poster.ts`), no landmark anchors (`anchors.ts`), no mirror and no debrief.
- `src/front/front.css` replaced by the skeleton's own rules on the design tokens.
- `src/scene/LanesScene3D.tsx`: the slabs and idle boxes as `SpanInstances` on a `TimeTrack` with `TimeTicks`, its labels and three camera presets, on `SceneCanvas` and `CameraRig`, importing nothing from `src/scene/props`.

| Spike figure | Build | Measured | Gate | Go line |
|---|---|---|---|---|
| Skeleton front-page JS closure (19 chunks) | 1 | 129,600 B [measured] | 150 KB | 140,000 B |
| Skeleton front-page JS closure | 4 | 129,599 B [measured] | 150 KB | 140,000 B |
| Skeleton first-paint CSS | 1 and 4 | 14,631 B [measured], 4,212 B under `wave-2`'s 18,843 B [derived] | 30 KB | |
| Skeleton JS and CSS together | 1 | 144,231 B [measured] | no gate | |
| Step-loop scene without the props chunk, no lights | 1 | 12,815 B [measured] | 40 KB | 30,000 B |
| Step-loop scene without the props chunk, with the kit's `Fluorescent` lights | 4 | 13,638 B [measured] | 40 KB | 30,000 B |
| Step-loop scene with the props chunk (it imports `src/scene/props`; the chunk itself is 21,435 B in that build) | 5 | 35,131 B [measured] | 40 KB | |
| For comparison: the kitchen's `scene-loop` with the props chunk, on `wave-2` | ledger | 37,555 B [measured] | 40 KB | |

The skeleton's closure, largest first [measured, build 1]: react-vendor 62.2 KB, the entry 37.0 KB, the Front page 5.9 KB, the loop's session 5.1 KB, `ViewSwitch` 3.6 KB, the v0 step loop 3.4 KB, the course index 2.3 KB, and twelve chunks under 2 KB. Against `wave-2`'s 148,189 B it is 18,589 B smaller [derived], most of it the kitchen drawing's chunk (12,138 B) and the mirror table (4,656 B). It leaves 10,400 B under the go line and 20,400 B under the gate [derived] for what the skeleton does not have: the Parts popover, the intro, the header's Continue, the returning state, the guesses of demo levels 3 and 4 and their reveal, the callout discs, the phone's coach steps and Data Book's faces.

The builds, all on the spike branch over `022f5a5` (this task's lanes on `dcba8ef`):
1. The skeleton and the scene as described.
2. Build 1 with a manual chunk `loop-kitchen` in `vite.config.ts` for `packages/play/loop/kitchen.ts`, `layout.ts`, `src/games/loop/scene-presets.ts` and `src/design/components/TapeLabel.tsx`.
3. Build 2 with the kit's `Fluorescent` lights in the new scene.
4. Build 3 with `TapeLabel` out of the manual chunk.
5. Build 4 with the new scene importing `src/scene/props`, to measure it with the props chunk.

### 1.6 What the spike's build moved in the old tree

The skeleton passes its own rows, but taking the kitchen's modules out of the front page re-chunks what the old Step loop and the other scenes share. `verify:bundle` failed on three rows of build 1 [measured]:

| Row | `wave-2` | Build 1 | Build 4 | Why |
|---|---|---|---|---|
| `game loop` | its chunk | no chunk | no chunk | `src/games/loop/Game.tsx` loses its own chunk: with no static importer on the front page, Rollup merges it with the views that `Debrief`, `FullService` and the kitchen scene share with it, into a chunk with no source module, and the gate cannot find the game |
| `scene-loop` | 37,555 B | 53,218 B, 13,218 B over | 37,426 B | The kitchen scene imports `kitchen.ts`, `layout.ts` and `scene-presets.ts`, which then sit in that merged game chunk (15.1 KB), so the scene counts it |
| `scene-pool` | 39,766 B | 40,288 B, 288 B over | 39,899 B | The new scene reaches `SceneCanvas` without `Lights`, so `Lights` (1.2 KB) and `marks` (0.5 KB) split into chunks of their own, and each file's own gzip overhead is counted |

Measured mitigations, none of them a gate change:
- **The new scene uses the kit's lights** (`Fluorescent`): `Lights` stays inside `SceneCanvas`'s chunk, and `scene-pool` is back to 39,899 B, 101 B under (build 4). The pool's scene has the least room of any row and moves by a few hundred bytes with any change to the shared chunks.
- **A manual chunk for the kitchen's layout** (`kitchen.ts`, `layout.ts`, `scene-presets.ts`) brings `scene-loop` to 37,426 B (build 4). `TapeLabel` must stay out of it: the app shell imports it, and with it inside, the entry closure rose to 107,105 B and the front page's JS to 137,583 B, because the entry then imports the kitchen's layout (build 2).
- **Open:** the `game loop` row still fails in builds 2 to 5. The task that takes the kitchen off the front page (the front page's rebuild) has to give `src/games/loop/Game.tsx` a chunk of its own again, for example with a manual chunk for the loop's shared views (`Mirror`, `Controls`, `ControlPieces`, `View2D`, `FrameLabels`, `svg.tsx`) or by keeping one static import of them where they were.

Build 5's namespace import of `src/scene/props` also moved `/play/engine-floor` from 192,116 B to 195,668 B [measured], by re-chunking alone: the routes' room in 1.2 moves by kilobytes with the shared chunks, not only with a route's own code.

### 1.7 The lane layout

`packages/play/loop/lanes.ts` is pure (it compiles under `tsconfig.pure.json`) and draws from any view with the loop's slots, clock, waiting queue, slots' requests, CPU spans and fires, so the demo levels' `LoopView` feeds it as it stands. Two geometries carry the brief's 1440 and 390 numbers (§3.1): `DESK` (a 164 px label column, a 660 px track of 28 ticks, a CPU row of 56 px and slots of 44 px) and `PHONE` (72 px, 286 px of 16 ticks, 36 px and 32 px) [estimated]. It gives the waiting queue's chips and a count of the rest; one CPU row and one row per slot, each slot's label holding its request or "empty", and with more slots than fit at full height the rows share the room and every k-th is labelled; a slab per CPU phase and a slab per forward on every slot row, marked token, ghost or empty; an idle box over the slot rows for each gap between forwards and an open one from the latest forward to now; the now cursor; and an axis whose step is 1, 2 or 5 of a decade. The window shows a fixed number of ticks and slides once now passes three quarters of it, so the scale never changes. `tests/play/loop-lanes.test.ts` holds that one tick maps to one x on every row, that a gap between two forwards gives an idle box as wide as the CPU's sync and schedule in it (3 ticks on the tick card), that the layout holds for 4 and for 64 slots on both geometries, and that each demo level's first state and its reference run lay out.

### 1.8 Room for the front page's first paint (stage 1's fix)

Stage 1's way on, its engine-word copy and the intro took the row "front page first-paint JS" to 149,945 B at `b448d90` [measured], 55 B under its 150 KB gate, and the wave stopped on it. This fix defers two things the first paint does not draw; no gate, budget, target or `tests/bundle` file moved. Each part loads as soon as the page has rendered, and shows its loading line in its own box until then; the static shell loads both before it renders, so the document holds them in full and the page is as tall as before.

- **The run as a table and the world's card** (`src/front/night.ts`): the step loop's mirror (`Mirror`, the kit's `MirrorTable`, the loop's `Tape` and `PrinterTape`) and `WorldCard`, which sits in a closed disclosure, all below the pass. Saved 3,387 B [measured, interim build].
- **The device's tier** (`src/front/device.ts`): `src/scene/tiers.ts` and the settings it reads. The first paint is 2D on every device, because the tier is not known before the browser has been asked, so the page reads it once the code is in. Saved 1,772 B [measured, interim build].

Measured on this task's branch over `b448d90`, 2026-11-15, by the gate's own count:

| Row | Before (`b448d90`) | After | Change | Gate | Room after |
|---|---|---|---|---|---|
| Front page first-paint JS | 149,945 B in 25 chunks | 144,836 B in 22 chunks | −5,109 B | 150 KB | 5,164 B |
| Entry closure | 100,164 B | 100,164 B | 0 | 110 KB | 9,836 B |
| Front page CSS | 19,388 B | 19,388 B | 0 | 30 KB | 10,612 B |
| `/play/loop` | 188,025 B | 189,228 B | +1,203 B | 200 KB | 10,772 B |
| `/play/engine-floor` | 194,434 B | 194,904 B | +470 B | 200 KB | 5,096 B |
| `/play/verifier` | 190,268 B | 190,724 B | +456 B | 200 KB | 9,276 B |
| `/play/pool` | 186,905 B | 187,353 B | +448 B | 200 KB | 12,647 B |
| `/play/broken-bench` | 192,313 B | 192,619 B | +306 B | 200 KB | 7,381 B |
| `/m/:module` | 197,556 B | 197,529 B | −27 B | 200 KB | 2,471 B |
| `scene-pool` | 39,761 B | 39,762 B | +1 B | 40 KB | 238 B |
| `scene-engine-floor` | 39,365 B | 39,367 B | +2 B | 40 KB | 633 B |

The games' routes grew because the loop's `Mirror` and `Card` are now chunks of their own, which the loop's game and the front page both load, and each file carries its own gzip overhead [derived]; every other row moved by less than 200 B. The later tasks that change the front page have 5,164 B under its gate and 1,664 B under this fix's 146,500 B line [derived]; the largest pieces of what is left are react-vendor (62.2 KB), the entry (37.9 KB), the kitchen drawing's shared chunk (`layout.ts` and the loop's controls, 10.2 KB) and the Front page's own chunk (9.3 KB) [measured].
