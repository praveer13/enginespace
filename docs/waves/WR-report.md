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

---

## 2. Stage 1 closes (R-T15)

Stage 1 is the look-independent stage: the new names, the way on, the lesson template and the frame. It is **build A** of the look gate (R-T20). Every figure below was measured on 2026-11-16 at `c49554a` (the merge of the stage-1 walk's fixes into `wave-r`); this task changes only two e2e specs and four screenshot baselines, so the build is byte-identical to that commit's [derived]. Sizes are `verify:bundle`'s, as in section 1.

### 2.1 The gates, on the stage's head

| Gate | Result [measured, `c49554a`] |
|---|---|
| `npm run lint` | passes |
| `npm run typecheck` | passes |
| `npm run test` (bun test, `CI=1`) | 10,498 pass, 28 skip, 14 todo, 0 fail, in 374 files |
| `npm run build` | passes |
| `bun scripts/verify.ts all` | 16 gates, 16 passed, 0 failed |
| `bun scripts/verify.ts bundle` | 64 budgets gated, 2 over a target, 0 skipped |
| e2e `smoke` project, `--workers=2` | 198 tests: 191 passed and 7 failed at first; after the three repairs of 2.2, all pass |

### 2.2 What the first smoke run found, and what became of each

| Test | Cause | Closed by |
|---|---|---|
| `network.spec.ts` "the navigation and the footer lead to every page they name" | The spec still listed `/receipts` and `/design`, which left the navigation in R-T06, and clicked header links at 360 px without opening the Navigation button. | Here: the list names what the navigation holds now, and the spec opens the button first. |
| `keyboard-loop.spec.ts` (two tests, 360 and 1280 px) | The link "Open the course" now matches the front page's menu links too, so the locator was ambiguous. | Here: the locator is `exact: true`. |
| `screenshots.spec.ts` front page, four baselines (`front-360`, `front-1280`, `front-fired-360`, `front-fired-1280`) | The front page's words changed in R-T14 and the stage-1 walk's fixes. The change is intended. | Here: re-blessed at the unchanged tolerance. R-T19 rebuilds the page and re-blesses them again. |

The other known failures of the brief (`map.spec.ts`, `lesson-predict.spec.ts` on tr2 l5, `verifier.spec.ts:403`) passed in this run; no later task owns them.

### 2.3 The budget table, stage 1 against the ledger

Stage 0 is section 1's column [measured at `dcba8ef`]; stage 1 is measured at `c49554a`. No row is over its gate.

| Row | Stage 0 | Stage 1 | Gate | Room at stage 1 |
|---|---|---|---|---|
| Entry closure | 99,177 B | 100,183 B | 110 KB | 9,817 B |
| Front page first-paint JS (23 chunks) | 148,189 B | 145,194 B | 150 KB (target 130 KB) | 4,806 B |
| Front page first-paint CSS | 18,843 B | 19,388 B | 30 KB (target 20 KB) | 10,612 B |
| Front page JS and CSS together | 167,032 B | 164,582 B | none | |
| Course index | 2,304 B | 2,317 B | target 6 KB | 3,683 B under |
| `/m/:module/:lesson` | 147,482 B | 150,481 B | 200 KB | 49,519 B |
| `/m/:module` | 191,438 B | 195,722 B | 200 KB | 4,278 B |
| `/map` | 171,986 B | 178,574 B | 200 KB | 21,426 B |
| `/play` | 135,224 B | 137,462 B | 200 KB | 62,538 B |
| `/play/engine-floor` | 192,116 B | 195,408 B | 200 KB | 4,592 B |
| `/play/verifier` | 187,889 B | 191,701 B | 200 KB | 8,299 B |
| `/play/pool` | 186,019 B | 190,677 B | 200 KB | 9,323 B |
| `/play/broken-bench` | 190,068 B | 193,468 B | 200 KB | 6,532 B |
| `/play/loop` | 185,649 B | 189,824 B | 200 KB | 10,176 B |
| `/today` | 184,951 B | 187,839 B | 200 KB | 12,161 B |
| `/labs/:lab` | 125,117 B | 126,683 B | 200 KB | 73,317 B |
| `/trace-room` | 121,402 B | 122,957 B | 200 KB | 77,043 B |
| `/receipts` | 188,487 B | 190,152 B | 200 KB | 9,848 B |
| `/evidence` | 168,520 B | 170,378 B | 200 KB | 29,622 B |
| `/design` | 176,467 B | 192,380 B | 200 KB | 7,620 B |
| `/settings` | 176,702 B | 178,456 B | 200 KB | 21,544 B |
| `/about` | 121,965 B | 123,517 B | 200 KB | 76,483 B |
| `/changes` | 121,351 B | 122,905 B | 200 KB | 77,095 B |
| scene-engine-floor | 39,365 B (after section 1.8) | 39,371 B | 40 KB | 629 B |
| scene-pool | 39,761 B (after section 1.8) | 39,768 B | 40 KB | 232 B |
| scene-loop, -verifier, -kitchen | see the gate's output | 37,600 B, 38,695 B, 36,593 B | 40 KB | 2,400 B, 1,305 B, 3,407 B |
| three-vendor | | 238,646 B | 245 KB | 6,354 B |
| receipt.worker | | 55,839 B | 60 KB | 4,161 B |

Two rows are close for the stage that follows: `/m/:module` has 4,278 B and `/play/engine-floor` 4,592 B under their gate, and `/design` grew by 15,913 B for the new components' specimens. The front page's first paint has 4,806 B; R-T17 and R-T19 take the kitchen drawing's bytes back.

### 2.4 Build and serve build A from a second worktree

```
git worktree add ../enginespace-build-a wave-r-stage1 --detach
cd ../enginespace-build-a && cp -al ../enginespace/node_modules node_modules && npm run build && npm run preview
```

The first line makes the worktree at the tag; the second hard-links the packages (never a symlink), builds, and serves `dist/` with `vite preview`. The tag is local and is not pushed.

### 2.5 What stage 1 leaves in the old world

By route:

- **Games in the new frame:** `/play/pool` (KV page pool) only, with the first-run intro and the feedback kit. **Still on the old shell:** `/play/engine-floor` (Request path, until R-T29), `/play/verifier` (R-T30), `/play/broken-bench` (R-T31) and `/play/loop` (Step loop, R-T17, R-T18 and R-T28). The loop's demo and the front page have engine words on the existing kitchen drawing (R-T14); the kitchen leaves the tree at R-T44.
- **Lessons in the new template:** `/m/tr5a/l1-why-one-model-needs-several-kv-caches` only (R-T10). Every lesson has its predict blocks rewritten with a reveal (R-T09, 18 after the run and 21 at commit), and no other part of a lesson is edited. Not yet in the template: TR1 lessons 1 to 7 (R-T34, R-T35), TR2 lessons 1 to 7 (R-T36), TR5a lessons 2 to 4 (R-T37), TR6 lessons 1 to 5 (R-T38) and TR8 lessons 1 to 4 (R-T39). The build still warns, per lesson, of build-log ids in prose and pacing gaps; those warnings are the work of the lesson tasks.
- **Pages in the old look:** the course (`/map`, R-T21), the module page (R-T22), the Games index (R-T23), Review (`/today`, R-T24), Progress, Evidence and the small pages (R-T25), the labs (R-T26) and the traces (R-T27) keep the Kitchen look until stage 2 restyles them under The Pass (R-T16).
- **Files left under `tests/copy/allow/`** (each is a per-area record of display words the copy guard still lets through, with its area, task and `covers` lists): `broken-bench.json`, `cards.json`, `engine-floor.json`, `items.json`, `labs.json`, `loop.json`, `tr1.json`, `tr2.json`, `tr5a.json`, `tr6.json`, `tr8.json` and `verifier.json`: twelve files. They go as their area's task edits the words (R-T26 labs, R-T28 loop, R-T29 to R-T31 the games, R-T32 items and cards, R-T34 to R-T39 the lessons); R-T47 requires none to be left.

### 2.6 The tag

`wave-r-stage1` is a local tag on the `wave-r` commit that holds this task's merge, which is the stage-1 head (the walk's fixes included). This task changes no source file under `src/`, `packages/`, `content/` or `scripts/`.

## 3. The loop's kitchen scene leaves with R-T19 (2026-11-16)

R-T19 rebuilt the front page around the time track, and the old front page was the last module that imported the step loop's kitchen scene: `/play/loop` had pointed its 3D switch at the time track since R-T18. A scene in the tree that nothing loads is a row verify:bundle cannot measure, and keeping one dead lazy import to make it a chunk measured it at 45,237 B against its 40 KB gate [measured 2026-11-16, over `e963820`], since the kitchen's layout no longer sat in the front page's static closure. So the loop's part of R-T44 moved ahead of it, and R-T19 carries it:

- **Deleted:** `src/games/loop/Scene3D.tsx` (the kitchen scene), `scene-layout.ts`, `scene-presets.ts`, `scene3d.css`, `full/scene.ts`, and the front page's landmark anchors (`src/front/anchors.ts`, which read `scene-presets.ts`), with the tests that read only them (`tests/play/loop-scene.test.ts`, `tests/front/anchors.test.ts`, and the 3D-layout half of `tests/play/loop-full-layout.test.ts`). Before the delete, each file's importers were listed; every one was another file of the same set, a test of it, or the old front page that R-T19 replaced.
- **Renamed:** the time track, `src/games/loop/TrackScene3D.tsx`, is now `src/games/loop/Scene3D.tsx`, the step loop's scene, so the gate's row `scene-loop` measures the scene the game draws. Its props type is `Scene3DProps`, as in the other games.
- **Measured** (`npm run build`, `bun scripts/verify.ts bundle`, 2026-11-16, R-T19's branch over `wave-r` at `e963820`): `scene-loop` 22,045 B [measured], gate 40 KB, 17,955 B under, with no edit to BUDGETS, the gate script or tests/bundle; the front page's first-paint JS 147,548 B and CSS 24,037 B [measured]; `three-vendor` 238,659 B [measured].
- **Left for R-T44:** `packages/play/loop/layout.ts` and `kitchen.ts` (the Debrief and the full service still read them), `src/scene/props`, the kitchen specimen on `/design`, the lamps, textures, environment and post-processing. When `src/scene/Lights.tsx` goes, `FlatLights` needs lights of its own (R-T18's note). The kitchen stays whole in build A, the tag `wave-r-stage1`.

## 4. Stage 5: the documents, the budgets as built, and what each task changed (R-T49, 2026-11-17)

R-T49 brings README, PRODUCT.md, WORLD.md, ARCHITECTURE.md, GAMES.md and the content README in line with the built world. It changes no code, content, id, route, ledger ref, seed or golden hash. R-T48 adds the accessibility section to this report in parallel, and R-T50 rewrites DESIGN.md after this task.

### 4.1 What the documents say now

- **Names.** The documents use each game's title and no other name: Step loop, Request path, KV page pool, Rejection sampler, Broken benchmark, Tensor views, Trace attribution, Backend dispatch and KV offload. The kitchen's names stay in one place, the history table at the end of GAMES.md §2.6, and in decision records. GAMES.md §0's roster loses its working-name column, and ARCHITECTURE §6.1's loses its Game column.
- **GAMES.md.** §0 says which games are built (five) and which are designs (four). §2.2 describes the two reveal kinds (`after-game` and `at-commit`, D-067). §2.3 describes the built diagram, the five mark forms, the materials and the cameras. The scene blocks of Step loop (§3), Request path (§5), KV page pool (§8) and Rejection sampler (§10) describe what was built: the objects, the materials, the named cameras, the motion and the measured rows. Request path's block is the swimlane, and its 3D scene is recorded as removed. Broken benchmark's 3D opener is marked not built. The older "As built" notes of the games that are not rewritten keep their kitchen words as a record, and §2.6's history table is their key.
- **ARCHITECTURE.md.** §3.1 has the built route labels (Course, Games, Review, Progress, GPU lab results, Traces, Sources and changes) and the front page's sections; §3.3 has the header, Continue and the footer. §4.3 has the two reveal kinds, §4.6 the lessons table, and the new §4.8 the lessons table's row, the four sections and what "done" means. §6.1 lists five 3D games and four 2D, with the built objects and cameras. §6.4 names the flat-plate parts, §6.5 records that there is no post-processing, and §6.6 gives the tier table without a post-pass row, says MSAA at T2 and above, and says where a phone starts. §6.10 and §6.11 describe the front page as built.
- **WORLD.md §7** says how the world appears: the instrument frame, the flat diagram lifted into 3D, the Traces page and the lessons.
- **PRODUCT.md** gains two principles and rewords the first, each marked proposed for the owner's confirmation. Nothing else in it changes.
- **README.md** (the games paragraph and the `src/` row) and **content/README.md** (the reveal kinds, how a lesson is shown, the `no-test` warning and the openers) are corrected.

### 4.2 Every budget, on the tip

`npm run build`, then `bun scripts/verify.ts bundle` on `wave-r` at `a564916` (R-T49's base; this task changes no file the gate reads), 2026-11-17: 60 budgets gated, all passing, three over a target (the entry, the front page's JavaScript and its CSS). The ledger column is section 1's row, measured on 2026-11-15 at `dcba8ef`. No gate, budget or `tests/bundle` file moved in wave R.

| Row | Measured, 2026-11-17 at `a564916` | Gate | Room | Ledger row (§1, 2026-11-15 at `dcba8ef`) |
|---|---|---|---|---|
| Entry closure | 100,434 B [measured] | 110 KB (target 100 KB) | 9,566 B | 99,177 B |
| Front page first-paint JS | 149,855 B [measured] | 150 KB (target 130 KB) | 145 B | 148,189 B |
| Front page first-paint CSS | 23,149 B [measured] | 30 KB (target 20 KB) | 6,851 B | 18,843 B |
| Course index | 2,327 B [measured] | target 6 KB | 3,673 B under | 2,304 B |
| `/map` | 175,621 B [measured] | 200 KB | 24,379 B | 171,986 B |
| `/m/:module` | 180,538 B [measured] | 200 KB | 19,462 B | 191,438 B |
| `/m/:module/:lesson` | 149,977 B [measured] | 200 KB | 50,023 B | 147,482 B |
| `/play` | 164,761 B [measured] | 200 KB | 35,239 B | 135,224 B |
| `/play/engine-floor` | 192,655 B [measured] | 200 KB | 7,345 B | 192,116 B |
| `/play/verifier` | 192,099 B [measured] | 200 KB | 7,901 B | 187,889 B |
| `/play/pool` | 193,131 B [measured] | 200 KB | 6,869 B | 186,019 B |
| `/play/broken-bench` | 198,930 B [measured] | 200 KB | 1,070 B | 190,068 B |
| `/play/loop` | 192,471 B [measured] | 200 KB | 7,529 B | 185,649 B |
| `/labs/:lab` | 146,326 B [measured] | 200 KB | 53,674 B | 125,117 B |
| `/trace-room`, `/trace-room/:trace` | 120,984 B [measured] | 200 KB | 79,016 B | 121,402 B |
| `/receipts` | 189,570 B [measured] | 200 KB | 10,430 B | 188,487 B |
| `/today` | 191,279 B [measured] | 200 KB | 8,721 B | 184,951 B |
| `/evidence` | 181,478 B [measured] | 200 KB | 18,522 B | 168,520 B |
| `/design` | 177,804 B [measured] | 200 KB | 22,196 B | 176,467 B |
| `/settings` | 183,230 B [measured] | 200 KB | 16,770 B | 176,702 B |
| `/about` | 134,306 B [measured] | 200 KB | 65,694 B | 121,965 B |
| `/changes` | 128,469 B [measured] | 200 KB | 71,531 B | 121,351 B |
| `scene-loop` | 19,988 B [measured] | 40 KB | 20,012 B | 37,555 B (the kitchen's) |
| `scene-pool` | 15,904 B [measured] | 40 KB | 24,096 B | 39,766 B |
| `scene-verifier` | 14,356 B [measured] | 40 KB | 25,644 B | 38,694 B |
| `scene-specimen` | 9,985 B [measured] | 40 KB | 30,015 B | 15,296 B |
| `scene-engine-floor` | no row: the scene left the tree (R-T43) | 40 KB | | 39,370 B |
| `scene-kitchen`, `scene-kit` | no row: deleted (R-T44) | 40 KB | | 36,532 B and 20,966 B |
| `three-vendor` | 238,480 B [measured] | 245 KB | 6,520 B | 238,647 B |
| `postfx` | skipped: `src/scene/postfx` does not exist (R-T44) | 25 KB | | 5,468 B |
| `receipt.worker` | 55,839 B [measured] | 60 KB | 4,161 B | 55,226 B |
| `forge.worker` | 2,595 B [measured] | 40 KB | 37,405 B | 2,595 B |
| Lesson JSON, the largest (`tr1.l2-nano-vllm-in-one-sitting`; 27 rows gated) | 8,932 B [measured] | 40 KB each | 31,068 B | 9,289 B |
| Module JSON, the largest (`tr6`; 5 rows gated) | 2,906 B [measured] | 40 KB each | 37,094 B | 3,027 B |
| The site under `dist/` | 10,102,704 B in 372 files [measured] | Pages' 1 GB cap | | 6,532,453 B in 297 files |

Rows that need watching: `/play/broken-bench` has 1,070 B under its gate and the front page's JavaScript has 145 B. Both are held by gates that no task may raise. The pool's 3D chunk went from 39,766 B to 15,904 B, so the 3D scenes now have the room the ledger lacked.

### 4.3 What each task changed

| Task | What it changed |
|---|---|
| R-T01 | Recorded wave R: D-062 to D-068, the agent brief's rule 9 for Data Book, the tracker's wave R section and Data Book's direction contract |
| R-T02 | Display copy left the session state (it moved into a table for each game, keyed by level id), so a later rename moves no state hash |
| R-T03 | The budget ledger (§1), the pure lane layout for the step loop's demo levels, and the lane spike's go |
| R-T04 | The naming table, the roster, the terms (`src/copy/terms.ts`) and the copy guard |
| R-T05 | The new components on the current token roles, with their specimens on `/design` |
| R-T06 | The way on: the lessons table in `map.json`, `nextStep`, Continue in the header, breadcrumbs and the words for state |
| R-T07 | The instrument frame, built on KV page pool |
| R-T08 | The first-run intro and the feedback kit |
| R-T09 | Every prediction gets a reveal: `after-game` and `at-commit` |
| R-T10 | The lesson template, built on TR5a lesson 1: Run, Read, Test and Keep on one page, the rail, guesses in the run's slot, claims as numbered marks |
| R-T11 | The lesson's dock and the source popover |
| R-T12 | Pacing warnings, the openers and vocabulary tests, and the authoring rules |
| R-T13 | The tracker's W2 and W3 tasks rewritten for the new design |
| R-T14 | The step loop's demo and the front page in engine words, on the existing drawing |
| R-T15 | Stage 1 closed: the budget table against the ledger, the stage's walk, and build A (the tag `wave-r-stage1`) |
| R-T16 | Data Book: tokens, three faces, a flat ground, an ink focus ring, and every component restyled |
| R-T17 | Step loop's timing diagram, drawn from the pure lane layouts, in the instrument frame |
| R-T18 | Step loop's 3D time track: the diagram laid flat on an engraved plate, six cameras |
| R-T19 | The front page rebuilt around the step loop's instrument; the kitchen scene left the tree and the time track took its name |
| R-T20 | The look gate: two builds, the same screens, three questions; the owner chose Data Book (D-062) |
| R-T21 | Course as one column of module rows on a track line, opened by the way on |
| R-T22 | The module page: the way on, lessons with their state, and the outcomes with ticks |
| R-T23 | The Games index as a plain list of the nine games; unpublished pages say so and hand back to Continue |
| R-T24 | Review as five states and the question frame |
| R-T25 | Progress as dated rows in words, GPU lab results, About with the tag legend, Sources and changes, Settings and the not-found page |
| R-T26 | Labs in the engine's words: titles, check labels, crate prose, and five numbered steps |
| R-T27 | Traces: the viewer in the system, with glyph-coded spans and an amber cursor with its word |
| R-T28 | Step loop's TR2 and TR6 levels in the frame, on the timing diagram |
| R-T29 | Request path plays on the swimlane, in the frame |
| R-T30 | Rejection sampler in the frame, with bars as its 2D view |
| R-T31 | Broken benchmark in the frame |
| R-T32 | Item stems, options and whys in engine terms |
| R-T33 | The lessons' figures in the diagram language |
| R-T34 | TR1 lesson 1 in the template (opener B) |
| R-T35 | TR1 lessons 2 to 7 in the template |
| R-T36 | TR2's seven lessons in the template |
| R-T37 | TR5a lessons 2 to 4 in the template |
| R-T38 | TR6's five lessons in the template |
| R-T39 | TR8's four lessons in the template |
| R-T40 | Model cards and the worlds' claims in engine words |
| R-T41 | KV page pool's 3D rack from kit primitives, with a fan and threads |
| R-T42 | Rejection sampler's 3D skylines: a row of bars for each draft position into depth |
| R-T43 | Request path's 3D scene removed; the game is 2D |
| R-T44 | The kitchen left the tree: the props, the lamps, textures, environment, post-processing and the loop's kitchen layout |
| R-T45 | "Show on the machine": a figure can load its state into the lesson's dock |
| R-T46 | The components are named as DESIGN.md names them |
| R-T47 | The first-visit walk, the per-screen checks, the keep-list and the baselines, and the findings they made |
| R-T48 | The accessibility sweep of the surfaces the wave touched; its section is added in parallel |
| R-T49 | These documents and this section |
| R-T50 | Not started: the finish review, DESIGN.md and the cold-test pack |

The fixes that merged between tasks (`wr/fix-build-b`, `wr/fix-build-b-2`, `wr/fix-stage1-walk`, `wr/fix-stage3-specs`, `wr/fix-stage4-specs`, `wr/fix-look-decision` and `wr/fix-final-walk`) are in `git log wave-r`.

## 5. The accessibility sweep (R-T48)

R-T48 holds the redesigned surfaces to WCAG 2.2 AA with checks that run on every pull request (e2e/a11y.spec.ts, e2e/reduced-motion.spec.ts), and fixes what they found.

**What is held, and where.**

- **Axe at 320, 360 and 1280 px** on every route the wave touched (the pull-request routes, the W1 and W2 pages, the level pages). The 3D pass is audited at 360 and 1280. A lesson's and a game's page now also fail on a `landmark-unique` finding (before, a game's page alone).
- **A Tab walk of a lesson of each opener** (A: TR5a lesson 1, B: TR1 lesson 1, C: TR2 lesson 7) at 1440 x 900 and 390 x 844: a ring at every stop, and none covered or off screen, with the strip and the foot bar present (the test fails if nothing is sticky).
- **Claim marks and popovers:** every mark is a link to its entry, a tag is not a tab stop, no popover opens on focus alone, Escape closes one and hands focus back (a lesson's claim mark, a game's Parts). Axe also runs with each game's Parts sheet open at 320, 360 and 1280.
- **The focus ring** is ink against the paper halo at each of the first thirty stops of fifteen surfaces, and is never a warm colour or the amber.
- **Targets** (WCAG 2.5.8, the inline and the spacing exceptions as the criterion words them) at 360 and 1280 on fifteen surfaces, and a primary action of 44 px or more.
- **Short viewport:** at 844 x 390 and 320 x 256 nothing is sticky or fixed, the page does not scroll sideways, no text is cut off and every heading is still there (the desk's dock, a second view of the run, is the one heading left out).
- **Forced colours:** every control keeps an edge or an underline, and the ring is the system's (3 px, no halo). **More contrast:** axe finds no serious or critical violation under `prefers-contrast: more`, and `bun scripts/verify.ts tokens` holds the variant's pairs (passes).
- **Reduced motion:** the four duration tokens are 0 ms, and a popover, a disclosure and a game's first-run strip stepped through leave nothing running.
- Kept where earlier tasks wrote them: every level of every game by keys (walks.spec.ts), a lesson's sticky strip and foot bar (lesson-games.spec.ts), Review (today.spec.ts), reflow and the sticky rule per route (screens.spec.ts).

**What the sweep found, and fixed.**

1. Axe `landmark-unique` on lessons: a lesson with several guesses named each `Your guess for this run` as a region (e2e/a11y.spec.ts found it on TR1 lesson 5 and TR6 lesson 2); the Verifier's rows named a region each, and Request path's swimlane region appeared in the instrument and in the dock under one name. The guess and the Verifier's rows are `role="group"` now (the name stays); the dock's swimlane is named "Swimlane in the dock" (src/content/render/Predict.tsx, src/games/verifier/View2D.tsx, src/games/engine-floor/View2D.tsx: files of R-T09, R-T31 and R-T29).
2. Axe `target-size` at 360 with a game's Parts sheet open: the 320 px sheet left 8 px of the frame's "more" control showing beside it. At 24 rem of width or less the sheet now spans gutter to gutter, and the sheet's slide back onto the screen is exact, not a pixel more (src/design/parts.css, src/design/components/Popover.tsx: R-T05's files).
3. The focus walk reported a link that wraps over two lines as covered when a claim mark's 44 px box lay over its middle. It now judges each line of the link (e2e/support/front.ts, R-T07's helper).
4. The Games index's level links were 23 px high; 24 now (src/games/specials/specials.css: R-T23's).

**Left for W3-T11 and W3-T12.**

- Standalone text links shorter than 24 px that pass 2.5.8 only by spacing: the breadcrumb ("Course", "Games", 16 to 18 px), the lesson's Sources list and a module's cites (17 px lines), the front page's "What this model leaves out" and the module links under the pitch, and the Course's `T5.L7`-style cites. Giving them a 24 px line is a change to the lesson and page templates' line height, and a look at each.
- `src/design/base.css` and `components.css` needed no change: the forced-colours, more-contrast and ring rules held under the new checks.

---

## 6. The finish (R-T50, 2026-11-17)

R-T50 closes the wave: impeccable's finish review and its material fixes, DESIGN.md rewritten from the built world, the copy guard's allowlist, the record of the look gate, the cold-test pack the owner runs before the merge to `main`, the ten owner decisions of REDESIGN §6 with the default taken for each, and every gate against `wave-2`'s. The wave's pull request into `main` is opened by the coordinator, not by an agent, and it stays open for the owner: nothing of wave R reaches `main` without the owner's merge and the cold test.

### 6.1 The look gate: the owner's answer, and what was built on it

At the look gate (R-T20, [WR-look.md](WR-look.md)) the owner saw ten pairs of images, build A (The Pass) against build B (Data Book), and answered on 2026-11-16: **Data Book**, in the owner's words "data book for sure" (WR-look §6, D-062). The answer was given, so no default was taken for the look. The owner did not answer the gate's three questions (REDESIGN §5.4) and did not ask for a concept roll for Data Book. The three questions are asked again in the cold test (§6.7), and the skipped roll is recorded in the front page's surface brief.

Built on that answer: the wave went on from build B. Stage 3 rolled the new system out to every page, game and lesson (R-T21 to R-T40); stage 4 re-skinned the pool's and the sampler's 3D in Data Book (R-T41, R-T42), removed Request path's 3D scene (R-T43), took the kitchen, its props, its three extra faces and its post-processing out of the tree (R-T44), let a lesson's figure load its state into the dock (R-T45) and named the components as the system names them (R-T46); stage 5 walked the first visit (R-T47), swept accessibility (R-T48), brought the documents in line (R-T49) and closes here. D-047 reads "superseded by D-062", and D-064 stands with D-062.

### 6.2 The finish review: the verdict of each surface, in the reviewer's word

impeccable's finish review ran in two rounds on the built site at 1440 x 900 and 390 x 844. Round 1's disposition was **fix**, with eight material fixes; the fix batch (`wr/fix-finish-1`, merged at 3e516ed) did them, and its own report lists what each left. Round 2's disposition was **recapture**: the reviewer judged no surface, because several captures did not show the state they were named for, and asked for them to be taken again. Two rounds is the ceiling, so these are the verdicts the wave ends with. They are recorded here as given, and under D-062.

| Surface | Widths | Verdict | Open findings |
|---|---|---|---|
| Front page | 1440 and 390 | unjudged | `front-focus-main-control-1440.png` is byte-identical to `front-first-paint-1440.png` and shows no keyboard focus on R1; retake with focus kept. `front-focus-main-control-390.png` is byte-identical to `front-first-paint-390.png`; retake with focus kept. `header-focus-continue-1440.png` is byte-identical to `front-returning-1440.png`; the header Continue shows a 1 px outline and no focus ring; retake with focus kept. `header-focus-continue-390.png` is byte-identical to `front-returning-390.png`; retake with focus kept. No capture shows a dimension line in the diagram; add a state with a bubble (demo level 2 after the step that leaves the gap), Diagram at 1440 and 390 and 3D at 1440. |
| TR1 lesson 1 | 1440 and 390 | unjudged | none |
| TR5a lesson 1 | 1440 and 390 | unjudged | `tr5a-l1-game-intro-390.png` and `tr5a-l1-game-midlevel-390.png` show the dock over the KV page pool grid with cells cut at half height; retake at the scroll position the frame itself sets, and say so in capture-list.md, so the cut can be attributed to the page or to the driver. |
| Step loop | 1440 and 390 | unjudged | `loop-result-390.png` shows the result with no diagram on screen; retake at the scroll position the page itself leaves after the last step, with no driver scroll. |
| KV page pool | 1440 and 390 | unjudged | `pool-result-390.png` shows the result with no diagram on screen; retake at the page's own scroll position. |
| Rejection sampler | 1440 and 390 | unjudged | `verifier-result-390.png` shows the result with no diagram on screen; retake at the page's own scroll position. |
| Request path | 1440 and 390 | unjudged | `floor-result-390.png` shows the result with no diagram on screen; retake at the page's own scroll position. |
| Tensor views and KV offload (`shape-shifter`, `switchyard`) | none | not built, no capture | none |
| Course | 1440 and 390 | unjudged | none |

Read with the table:
- **Broken benchmark** (`/play/broken-bench`) is built but was not among the captured surfaces, so it has no verdict from this review.
- **The 390 result captures.** The round-1 fix batch already said that its capture script scrolled `[data-result]` to the top of the screen, so at 390 a result capture showed no diagram while the page itself scrolls only as far as the result's ways on. Round 2's four result findings ask for exactly that retake. Until it is done, whether P5 holds at a phone's result rests on the e2e checks (`e2e/first-visit.spec.ts`, `e2e/lesson-games.spec.ts` and each game's spec), not on a judged image.
- **The focus captures.** The keyboard focus ring itself is held by `e2e/a11y.spec.ts` (an ink ring at each of the first thirty stops of fifteen surfaces, §5); the finding is that the capture lost focus before the shot, which the e2e run does not judge.
- **Material fixes of round 2:** none were asked for. Round 1's eight are done or listed in §6.3.

### 6.3 What the fix batches left, for the owner

From round 1's fix batch (`wr/fix-finish-1`):
- the retakes of §6.2, and the states not re-captured after its second look: the pool's 3D label under the rack, the sampler's 3D legend sentence, Request path's intro example shortened on a phone, the phone dock back at a third of the screen, and the drawing kept in view at a desk's result;
- a label slot for a hop between two stages in the same process column at 390 (Request path);
- the sampler's recipe level lost its pick in the scene, since only the chain level offers 3D now;
- the pool's 3D still uses about half its box at 1440.

From the walks' fix batch (`wr/fix-final-walk`, §6.6), each an owner call:
1. The pass bar of a question set: ASSESSMENT §4.2 says an exit ticket passes with at least 2 of 3 right, at least 1 of them numeric; the code requires the last 3 answers of each kind all right. ASSESSMENT owns pass bars, so either the code or that line changes; the graded mechanic was left alone.
2. Question pools that reach past what has been taught: limiting a lesson's pool to the engines it has read needs an engine key on item blocks, which changes item generation.
3. Content under an open guess that gives the answer away: hiding it contradicts "nothing collapsed and nothing locked" (REDESIGN §1, line 6).
4. The front page's demo (stay in the chosen view, a legend, the number to beat, a line on what is assumed from kernelspace): its first-paint JavaScript is 131 B under its gate [measured 2026-11-17 at 1d69a0c], so this needs deferral work in the front page's closure first.
5. A Keep rule or table per lesson, and "own night" for the brief's banned-phrase table.

### 6.4 DESIGN.md and its sidecar

impeccable's documenter rewrote DESIGN.md's body and `.impeccable/design.json` from the built world (merged at 1d69a0c). DESIGN.md's North Star is **"Data Book"**, and its eleven named rules are REDESIGN §2.8's: One Marker, Ink Focus, Colour Is State, Declared Pair, Sentence Case, Ramp, Short Viewport, Flat Paper, Moves On Step, Words Are DOM and Quiet Provenance. Its front matter's tokens did not change; eight component entries were added (stamp, stamp-unverified, callout, callout-pressed, note, delta-chip, popover-trigger, course-mark). The sidecar's narrative is DESIGN.md's word for word, the kitchen's scene materials are replaced by the flat 3D materials, lights, primitives, cameras and tiers, and the Stamp, Callout and Now Cursor components are added. `tests/design/design-md.test.ts` passes with no pin changed. The kitchen and The Pass appear once, as history.

The page title's size is settled from the build: `clamp(2rem, 1.2rem + 3.4vw, 3.5rem)`, as `--es-font-display-size` and `--es-size-page`. The front page's title is the one difference from the brief that the documenter recorded: 4rem from 80rem (2.25rem on a phone, a clamp up to 4rem from 48rem), against the brief's 3rem, documented as that page's one-off and not as the page-title size. The build is what is documented.

The surface briefs under `.impeccable/surfaces/` now state Data Book as the built world. Round 1's fix batch rewrote the front page's, the five games', Course's, the question block's and the games index's; R-T50 rewrote Review's, GPU lab results', the lab page's and the trace viewer's, settled the front page's superseded section, and deleted the brief of the kitchen's specimen on `/design`, whose surface left the tree with the kitchen.

### 6.5 The copy guard's allowlist

`tests/copy/allow/` is empty: no area of what a learner reads needs an allowance. Fourteen area files were deleted by the tasks that cleared their areas, from the pool's (R-T07) on 2026-11-15 to TR1's (R-T35), the last, on 2026-11-16. `tests/copy/no-kitchen.test.ts` passes, and from R-T50 it also fails if any file comes back into that folder.

### 6.6 The two last walks: agents, not the cold test

Two learner walk-throughs ran on the finished build before the finish review: one at a desk (1440 x 900) and one on a phone (390 x 844, by touch), each with an empty ledger from landing on `/`, through the front page's demo and TR1's first lessons, and on through the site. **They were agents, not people, and they are not the cold test. No agent simulated the cold test,** and none answered the three delight questions.

What they found, most harmful first, and what became of it (the fix batch `wr/fix-final-walk`, merged at a564916):

| Found | Became |
|---|---|
| Moving from one lesson to another by the site's own links stopped the page (both walks; React error #185, an update loop in the level-name hook), and the next game then blamed the connection | fixed; a lesson-to-lesson e2e test at 1440 and 390 fails on the old code; the error screen now says the answers are saved and offers a reload at the learner's place |
| Lessons shown as started or done that were never opened, and answers counted in the wrong lesson | fixed: an answer counts in the lesson it was given in |
| Two amber buttons on one screen in Read and after a Test pass | fixed |
| A pass rule stated in 24 lessons that the code did not use | fixed: the Test states the rule the page reads; the bar itself is an owner call (§6.3) |
| Request path's swimlane swallowing a thumb's scroll, and games played through a small window in a lesson on a phone | fixed in lessons; the game page's own stage list keeps its scroller |
| Two guesses for one run under one title | fixed: "Guess 1 of 2" and "Guess 2 of 2" |
| The Step loop's queue broken after Request path had loaded (a CSS collision) | fixed |
| Continue landing at the top of a lesson, a rotation losing the reader's place, a committed guess blank after a reload | fixed |
| Words not explained (nano-vllm, stage), ids shown raw, a kitchen leftover ("night") | fixed in TR1 lesson 1 and the reveal; the rest left |
| Question pools beyond what has been taught; content under an open guess; the front demo's changes; diagram label collisions; a Keep rule per lesson | left (§6.3) |

The desk walk's own report is not in the record this task could read; its findings reach this section through the fix batch's report, which numbers both walks' trips. The phone walk's verdict, in its own words: "The redesign fixed what the owner complained about. I always knew what the next step was called, the engine's own words are the only names, and the landing demo is a pleasure on a phone. I was no longer lost in a metaphor."

### 6.7 The cold-test pack

**Who and when.** The owner, or two or three kernelspace graduates, before wave R merges to `main` (REDESIGN §5.5, D-068). Each reader starts with an empty browser profile on the built site: once at a desk at about 1440 x 900, and once on a phone. The person running the test watches and writes down what the reader says; they do not help, and they do not answer for the reader. **Agents never simulate it.**

**What to bring.** The built site, this page printed or on a second screen, and a watch for items 1 and 2.

#### The script (REDESIGN §5.1)

The same walk that `e2e/first-visit.spec.ts` runs. The reader does the "Do" column; the person running the test ticks "Seen" when the "Look for" column holds, and writes what happened when it does not.

| # | Do | Look for | Seen |
|---|---|---|---|
| CP1 | Open `/` | The title, one waiting request and Step are on the first screen. One amber ring and no amber fill. No kitchen word anywhere. | |
| CP2 | Look at the parts | At a desk: five ink callouts, each with an engine name, and the same five lines as a list. On a phone: the discs on the diagram, the coach line on part 1 of 5, and Parts opens the whole list. | |
| CP3 | Put R1 into a slot | R1 sits in slot 1, the dock says what happened, and Step is the one amber-filled control. | |
| CP4 | Press Step | The readout shows the tokens out, and a sentence with "batching" is on screen. | |
| CP5 | Finish the demo level | "Next demo level" is amber with "Start the course" beside it; Start names TR1 lesson 1, its minutes and what it needs. | |
| CP6 | Start the course | The breadcrumb shows titles; the primer sits under "Before you run" (200 words or fewer); at a desk the game's top edge is on the first screen. | |
| CP7 | Look at the game before doing anything | The role line and the goal line are on screen before any guess, and the guess comes only after the parts list. | |
| CP8 | Guess, then run | No more than two prompts before the first move; after the run the result shows the guess beside the model's answer and one sentence with the engine term. | |
| CP9 | Look at the lesson's rail | The Run entry shows the reader's own answer. | |
| CP10 | Go on into Read | One part in view with its title and "Part n of m"; no claim box inside a sentence. | |
| CP11 | Take the Test | The tally reads "n of 3" with "passed" or "not yet". | |
| CP12 | Reach Keep | The record lists what was done; with the Test passed, the one amber control names lesson 2 and is the same as the header's Continue. | |
| CP13 | Open Course | A sentence names what was just done, with the same Continue as the header. | |
| CP14 | Visit the header, `/`, Course, TR1's page, Review and Progress | Every one gives the same Continue. | |
| CP15 | Reload `/` | It says where the reader left off and offers Continue to the same place. | |
| CP16 | Open TR2 lesson 3 directly and run its opener; then pass its Test | Continue names TR2 lesson 3, then TR2 lesson 4; Course shows "earlier lessons not finished" as a quiet line. | |
| CP17 | In TR2 lesson 7, commit the guess | Its reveal shows the answer with its working or its source; no lock, no disabled button, no task id anywhere. | |

#### The sheet (REDESIGN §5.5)

One sheet per reader. Write times in seconds and the reader's words as said.

| # | Item | Where | Passes when | Result |
|---|---|---|---|---|
| 1 | States the game's goal in engine terms | Step loop, Request path, KV page pool, Rejection sampler, Broken benchmark: each game's first screen | within 15 s of the screen, in the engine's terms | one line per game: seconds, and the reader's words |
| 2 | First action in a lesson | TR1 lesson 1 (and each lesson of item 3) | within 60 s of opening the lesson | seconds |
| 3 | Finishes the first run without scrolling into Read | TR1 lesson 1 (opener B), TR2 lesson 1 (A), TR5a lesson 1 (A), TR6 lesson 2 (A), TR8 lesson 1 (B) | the reader finishes the first run of each of the five named lessons without scrolling into Read | one line per lesson: finished or not, and where they went |
| 4 | Points at the way on | at any checkpoint of the script | asked "what is next?", the reader points at the amber control | yes or no, at which checkpoint |
| 5 | The three delight questions | after the walk | answered in the reader's own words | the words, as said |

The three delight questions, asked exactly so, and answered by the reader, never by the person running the test:
1. "Which of these would you rather spend an hour in?"
2. "Name one moment you would show someone."
3. "Where did it feel like work with no payoff?"

#### What happens to a lesson that fails

A lesson of item 3 that a reader cannot finish without scrolling into Read **moves one opener down before the merge**: from A (run first) to B (primer, then run), or from B to C (read first) (REDESIGN §5.5). For the five lessons that means: TR2 lesson 1, TR5a lesson 1 and TR6 lesson 2 would move from A to B, and TR1 lesson 1 and TR8 lesson 1 from B to C. The move is a content change to the lesson's opening, held by its row in `tests/content/openers-table.ts`; it changes the lesson's `rev`, so the evidence earned on it shows "re-check" (REDESIGN §6, decision 7). Two notes from earlier tasks go with it: if TR1 lesson 1 fails, it moves to opener C (R-T34's note), and if readers guess blind in TR1 lesson 2's block manager part, its first part moves ahead of the code (R-T35's note). Items 1, 2 and 4 failing go to the owner as findings with the screen they were seen on; the three answers of item 5 go to the owner as said.

### 6.8 The ten owner decisions, with the default taken

| # | Decision (REDESIGN §6) | Default | Where it stands |
|---|---|---|---|
| 1 | The look: Data Book replaces The Pass | Data Book | **The owner answered**: Data Book, 2026-11-16 (D-062). No default was taken. |
| 2 | One fewer 3D game: Request path loses its 3D scene | Cut it, at stage 4 | Default taken: cut by R-T43. Three built 3D games remain. |
| 3 | Phones open the front page in 2D, with 3D one tap away | Yes | Default taken, and narrowed by the finish review's round 1: a phone gets no 3D switch on the front page, the Step loop, the pool or the sampler (REDESIGN §3.1 amended with the reason). |
| 4 | Three faces leave (Doto, Handjet, Permanent Marker) | Drop them, with the look | Default taken: they left with the kitchen at stage 4 (D-064). |
| 5 | Titles: Rejection sampler, KV page pool, Request path, labs titled "Build ..." | As tabled in §2.7 | Default taken. |
| 6 | Predictions revealed at commit; a prediction earns no credit | Take it | Default taken (D-067, proposed). |
| 7 | Lesson edits change `rev`, so evidence since 2026-11-09 shows "re-check" | Accept it | Default taken; nothing is deleted. |
| 8 | Three keys in `localStorage`: the pointer, the bookmark and the intro flag | Add them | Default taken (D-066, proposed). |
| 9 | The human cold test before the merge to `main` | The finish review hands the owner the script and a sheet; the merge waits for it | Default taken: the pack is §6.7, and the merge waits for it. |
| 10 | Models: 16 tasks on opus and 2 on haiku | As planned | Default taken (D-068, proposed). |

D-063, D-065, D-066, D-067 and D-068 stay **proposed** for the owner to confirm, as does the cut of one 3D game in D-065.

### 6.9 The gates against wave-2's

`scripts/verify-bundle.ts`'s `BUDGETS`, dumped flat from `wave-2` (25320d5) and from this branch, and compared by the merge script's guard: **15 gated numbers on each side, all 15 equal, none raised, none added, none removed** [measured 2026-11-17]. The screenshot tolerance is 1% on both (`e2e/screenshots.spec.ts`), and the `smoke` project that a pull request runs grew from six specs to nine (first-visit, keep-list and screens joined). No gate, budget, threshold or tolerance moved in wave R. `verify:bundle` on this branch: 60 budgets gated, all passing, 3 over a target, and the postfx row skipped because `src/scene/postfx` left the tree [measured 2026-11-17 at 1d69a0c's code]. The rows with the least room: the front page's first-paint JavaScript at 149,869 B, 131 B under its 150 KB gate; `/play/broken-bench` at 199,322 B, 678 B under its 200 KB gate; `/play/engine-floor` 6,534 B under and `/play/pool` 6,559 B under [measured 2026-11-17 at 1d69a0c's code].

### 6.10 The full run

On this branch [measured 2026-11-17, on 1d69a0c's code with R-T50's documents and tests]:

- `npm run lint` and `npm run typecheck`: clean.
- The unit suite in CI's output mode (`bun test`, as the merge gate runs it): 10,523 pass, 28 skip, 0 fail, in 381 files.
- `npm run build` and `bun scripts/verify.ts all`: pass (§6.9 for the bundle).
- **The whole e2e suite** (`npx playwright test`, both projects and the lab profile, two workers, the host's Chromium shell): 1,169 tests, 1,162 passed and 7 failed on the first run. Each of the seven, and what became of it:
  - `e2e/network.spec.ts`, `/play/pool` and `/play/verifier` (2): the spec pressed the 3D switch at a phone's width, and since the finish review's round 1 the pool and the sampler offer no 3D on a phone, and the sampler offers it on its chain level only. The spec now draws those scenes at a desk's width and visits the sampler's chain level after its first; it still requires the scene to go live and every request to stay in the origin. Both pass.
  - `e2e/trace-view.spec.ts`, "shows the marks as a trace-mark event's data" (1): a race in the spec. The viewer hands its marks to the page in an effect, a render after the click, and the spec read the export once, at once. It now waits for the export to hold the mark, then asserts as before; the spec's 21 tests pass.
  - `e2e/ledger-conformance.spec.ts`, "the page runs the cases of the suite that Bun runs" (1): a 90 s timeout while the unit suite ran on the same machine; it passes when run alone.
  - `e2e/lab-kits.spec.ts` (3): **left, with its cause.** `public/labs/manifest.json` lists the GPU kit and the grader wheel beside the three forge labs, and no page links them, so the spec's "the manifest lists forge labs and nothing else, so that a file of another kind must be given its page and its row here" fails as it was written to, and so do the two per-file checks (`/labs/undefined`). Both files came into the manifest on `wave-2`, so this fails there too; giving them a page and a row is W2's kit work, not wave R's.
- The lab profile's front page (mobile, CPU 4x slower): LCP 904 ms on the h1, CLS 0, INP 48 ms, all within their targets [measured 2026-11-17].
