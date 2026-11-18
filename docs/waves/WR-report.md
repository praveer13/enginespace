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

`npm run build`, then `bun scripts/verify.ts bundle` on `wave-r` at `a564916` (R-T49's base; this task changes no file the gate reads), 2026-11-17: 60 budgets gated, all passing, three over a target (the entry, the front page's JavaScript and its CSS). The ledger column is section 1's row, measured on 2026-11-15 at `dcba8ef`. No bundle gate, budget or `tests/bundle` file moved in wave R (§6.9 has the other thresholds, and the two that were lowered and restored).

| Row | Measured, 2026-11-17 at `a564916` | Gate | Room | Ledger row (§1, 2026-11-15 at `dcba8ef`) |
|---|---|---|---|---|
| Entry closure | 100,434 B [measured] | 110 KB (target 100 KB) | 9,566 B | 99,177 B |
| Front page first-paint JS | 149,855 B [measured] | 150 KB (target 130 KB) | 145 B | 148,189 B |
| Front page first-paint CSS | 23,149 B [measured] | 30 KB (target 20 KB) | 6,851 B | 18,843 B |
| Course index | 2,327 B [measured] | target 6 KB | 3,673 B under | 2,304 B |
| `/map` | 175,621 B [measured] | 200 KB | 24,379 B | 171,986 B |
| `/m/:module` | 180,538 B [measured] | 200 KB | 19,462 B | 191,438 B |
| `/m/:module/:lesson` | 149,977 B [measured] | 200 KB | 50,023 B | 147,482 B (the gate counts the page's static imports; §6.9 says what the page also loads unasked) |
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
| First-paint fonts (3 faces, no gate) | 49,516 B [measured 2026-11-17 at 64fd895] | none | | 35,748 B on `wave-2` |
| `three-vendor` | 238,480 B [measured] | 245 KB | 6,520 B | 238,647 B |
| `postfx` | skipped: `src/scene/postfx` does not exist (R-T44) | 25 KB | | 5,468 B |
| `receipt.worker` | 55,839 B [measured] | 60 KB | 4,161 B | 55,226 B |
| `forge.worker` | 2,595 B [measured] | 40 KB | 37,405 B | 2,595 B |
| Lesson JSON, the largest (`tr1.l2-nano-vllm-in-one-sitting`; 27 rows gated) | 8,932 B [measured] | 40 KB each | 31,068 B | 9,289 B |
| Module JSON, the largest (`tr6`; 5 rows gated) | 2,906 B [measured] | 40 KB each | 37,094 B | 3,027 B |
| The site under `dist/` | 10,102,704 B in 372 files [measured] | Pages' 1 GB cap | | 6,532,453 B in 297 files |

Rows that need watching: `/play/broken-bench` has 1,070 B under its gate and the front page's JavaScript has 145 B (at the tip, 64fd895, 733 B and 150 B [measured 2026-11-17]). Both are held by gates that no task may raise. The pool's 3D chunk went from 39,766 B to 15,904 B, so the 3D scenes now have the room the ledger lacked.

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
| R-T50 | The finish (§6): the finish review's three rounds, DESIGN.md rewritten from the built world, the copy guard's allowlist (empty), the look gate's record, the cold-test pack, the ten owner decisions and the gates against `wave-2`'s; the final check's fixes follow it (`wr/fix-close-ci`, `wr/fix-close-copy`, `wr/fix-finish-2` and this task's records) |

The fixes that merged between tasks (`wr/fix-build-b`, `wr/fix-build-b-2`, `wr/fix-stage1-walk`, `wr/fix-stage3-specs`, `wr/fix-stage4-specs`, `wr/fix-look-decision`, `wr/fix-final-walk`, `wr/fix-close-ci`, `wr/fix-close-copy`, `wr/fix-finish-2` and `wr/fix-close-records`) are in `git log wave-r`.

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

impeccable's finish review ran three times on the built site at 1440 x 900 and 390 x 844. What the reviewer returned each time is kept whole in [WR-finish-review.md](WR-finish-review.md). Nothing below softens a verdict or sums several into a better one.

| Round | Tip it judged | Disposition | What followed |
|---|---|---|---|
| 1 | `3c70861` | **fix**: eight material fixes, and a verdict on every captured surface that began "Fix" or "Close" (Front page: "Close at 1440; cramped and partly off-contract at 390. Fix."; TR1 lesson 1: "Read sections sound; the Run is where a first-time learner trips. Fix."; TR5a lesson 1: "Readable; two visible defects in Read and one unverified blocker. Fix."; Step loop: "The strongest instrument; intro and phone result need repair. Fix."; KV page pool: "2D clear; result dock and 3D below the bar. Fix."; Rejection sampler: "Best 2D drawing of the set; unfinished at 390 and in 3D. Fix."; Request path: "The result drawing is good; the intro and the phone play surface are not ready. Fix."; Course: "Holds. One contract miss."; Tensor views and KV offload: "Not built; nothing to review."; Broken benchmark: no capture, not reviewed) | the fix batch `wr/fix-finish-1`, merged at 3e516ed |
| 2 | `3e516ed` | **recapture**: no surface judged, because four focus captures were byte-identical to other captures, and the reviewer asked for four phone results, a state with a bubble and the Broken benchmark to be captured again | the captures were retaken, with the driver's focus kept and the page's own scroll |
| 2b | `4a41050` | **fix**: the second review, on valid captures (check 0 passed: 84 viewport captures, no two byte-identical). Eight material fixes. | the fix batch `wr/fix-finish-2`, merged at 64fd895 (§6.3) |

**No review ran after that batch.** The verdicts below describe `4a41050`, not the tip, and no reviewer has said whether the batch closed what it listed. The wave therefore ends with a `fix` disposition that the build has answered and nobody has judged. Whether a fourth review is wanted is the owner's call.

Round 2b's verdict on each surface, in the reviewer's words, with its open findings as returned. The round's eight material fixes, its scoring of round 1's eight fixes and its persistence note are in [WR-finish-review.md](WR-finish-review.md). The reviewer had no pixel tooling and judged colour by eye; it did not open the design-page captures, four focus captures, or REDESIGN.md outside sections 2.8, 2.9, 3.1, 3.2 and 5.4 in full.

#### Front page (`/`), 1440 and 390

Verdict: **Close. Holds at 1440 in Diagram; the phone's first screen still hides the goal and swaps out the lane glyphs.**

Open findings:

- 390 front-first-paint-390.png: callout discs 3, 2 and 4 stand in place of the CPU circle and the slot 1 and slot 2 hexagons, so the rows read '2 1' and '4 2' and the colour code's glyphs are gone exactly while the list explains them; slots 3 and 4 keep theirs.
- 390 front-first-paint-390.png, front-returning-390.png: the goal line is cut behind 'more', hiding the number to beat and the end condition (P4); the role line still sits to the right of the Parts button.
- 1440 front-first-paint-1440.png: the focal element is still an empty graticule until the fifth action; the reference run is not drawn; Auto-step still wraps alone onto a second dock row (section 3.1 puts Step, Undo and Auto-step on one row).
- 1440 front-returning-1440.png: the 3D opening shot is an empty tilted plate; the word 'now' overprints the lower edge of the R1 chip; the queue chips R1 to R6 are drawn twice (scene and dock); the left column is empty from y 480 to 850.
- 1440 front-after-step-2d-1440.png and 390 front-after-step-2d-390.png: the yellow sync slab is now parted from the now line by about 2 px; at 390 the two still read as one yellow-and-amber mark.
- 1440 front-demo2-dimension-diagram-1440.png: the dimension line is present (end ticks, '3 ticks'), but the value fills the whole interval so no line shows between the ticks; in 3D (front-demo2-dimension-3d-1440.png) the 'idle' word is clipped by the CPU slab.
- 1440 front-after-step-2d-1440.png: the page's own scroll (y 36) leaves the header cut through its text.

#### TR1 lesson 1 (`/m/tr1/l1-five-mechanisms`), 1440 and 390

Verdict: **Reads well; the Run is better but its intro still breaks the marker rule and the phone path loses its mechanism words. Fix.**

Open findings:

- 1440 and 390 tr1-l1-run-game-intro-1440.png, tr1-l1-run-game-intro-390.png: two amber rings (the request node and Next), a full-width amber now line and a '▷ now' mark between Next and Skip intro in one viewport; the list says 'The numbers on the drawing match this list' and disc 3 (Stage list) has nothing drawn; at 1440 part 5's disc shows as a sliver behind the Next bar; about 300 px of blank sheet under the example.
- 390 tr1-l1-after-run-390.png: hop labels between stages in one column are slivers; only the last two rows of the path are on screen with the result.
- 1440 tr1-l1-after-run-1440.png, tr1-l1-keep-1440.png and 390 tr1-l1-keep-390.png: 'you said 1 stages' and 'guess 1 stages'.
- 1440 tr1-l1-read-midway-1440.png: the five rules are still unnumbered while the text says 'the first four' and 'the fifth'; the Your-run dock's column head reads 'One proce…'.
- 1440 tr1-l1-top-1440.png: still no instrument edge in the first viewport (a primer, a code block, then Guess 1 of 2). The guess now defines 'stages' before asking, which answers the walk's trip.
- 1440 tr1-l1-after-run-1440.png: the swimlane uses the left 40 percent of its sheet.
- Not shown by any capture: lesson-to-lesson navigation (React error 185). fix-final-walk.md reports it fixed with an e2e test; every lesson capture here is a direct load.

#### TR5a lesson 1 (`/m/tr5a/l1-why-one-model-needs-several-kv-caches`), 1440 and 390

Verdict: **Near. Result and source popover are right at both sizes; the intro on a phone covers the part it names.**

Open findings:

- 390 tr5a-l1-game-intro-390.png: the 'What you are looking at' panel lies over the KV page pool grid, leaving half-height cell tops under the disc that names the pool (driver-scrolled, but the panel is pinned by the page's own layout).
- 1440 tr5a-l1-top-1440.png, tr5a-l1-game-intro-1440.png: the Next bar slices a line of the parts list ('Every KV page on the GPU, in rows of 16. A', 'The admitted requests, one to a slot. Each'); disc 2 (KV page) stands at the end of the legend, not on a page.
- 1440 tr5a-l1-game-result-1440.png, tr5a-l1-game-midlevel-1440.png: the diagram sheet and the dock sheet each carry a shadow inside the lesson's own paper sheet (Flat Paper Rule: one shadow for a sheet).
- 1440 tr5a-l1-read-source-popover-1440.png: in the Your-run dock the graticule runs behind the readout's words and numbers, where it is neither axis nor cell grid.
- 390 tr5a-l1-top-390.png: the breadcrumb still wraps to three slash-led lines.
- 390 tr5a-l1-game-midlevel-390.png: holds (pool whole, two options whole, readout); the running-batch row is cut under the lesson bar and 'Admit none this step' is below the dock's fold.

#### Step loop (`/play/loop`), 2D and 3D, 1440 and 390

Verdict: **Holds in 2D at both sizes; the strongest instrument. The 3D opening shot adds nothing yet.**

Open findings:

- 1440 loop-midlevel-3d-1440.png: the scene uses about half its box, with bare ground above and below; the word 'now' overprints the lower edge of the R3 chip; the queue chips are drawn twice (scene and dock). At the Lifted camera with two requests admitted the scene shows nothing the diagram does not; Compare, the camera that earns the 3D, is not captured this round.
- 390 loop-intro-390.png, loop-midlevel-2d-390.png, loop-result-390.png: the axis label 16 is clipped at the right edge ('1('); at the intro the sixth queue chip is off the edge with no '+1' count (the front page shows '+2').
- 1440 and 390 loop-intro-1440.png, loop-intro-390.png: the '▷ now' mark still stands between Next and Skip intro and reads as a third control; about 120 px of blank paper under the axis at 1440.
- 1440 loop-result-1440.png: the level 1 table still lists 'Ghost tokens' and 'Bubble' before either is named.

#### KV page pool (`/play/pool`), 2D and 3D, 1440 and 390

Verdict: **Close. Result and hatched cache are right; the phone dock and the grid behind the cells are not.**

Open findings:

- 390 pool-midlevel-2d-390.png: the third admit option ('Admit R4') is cut through its text by the readout and 'Admit none this step' is hidden; the fix report says the three options show whole.
- 1440 pool-intro-1440.png, pool-midlevel-2d-1440.png: the graticule runs behind the page cells at a pitch that is not the cells' (REDESIGN 2.8: the graticule is the time axis or the cell grid) and stops in an open comb at about y 655, over roughly 190 px of blank paper.
- 1440 pool-intro-1440.png: disc 2 (KV page) stands at the end of the legend row, not on a page.
- 1440 pool-midlevel-3d-1440.png: free cells are now dashed wire outlines and the labels are clear of the threads, but the scene uses about half its box, the thread arcs run through the 'R1' label on its tile, and the 3D legend uses square texture swatches where the 2D legend uses the circle, diamond and hexagon glyphs.

#### Rejection sampler (`/play/verifier`), 2D and 3D, 1440 and 390

Verdict: **2D holds at both sizes and is the best drawing of the set; the chain's 3D scene is not legible yet.**

Open findings:

- 1440 verifier-midlevel-3d-1440.png (level 3, chain): depth now carries the draft positions, but value tags overprint one another in the middle rows (16, 20, 26, 21, 18, 17), the black collar frames stand tilted and detached, some with no bar inside them (right of token 5 in rows 1 and 3, left of token 1 in row 2), and the collar and the pale grooved top are explained only in a four-line caption, not in the legend row.
- 390 verifier-result-390.png: at the page's own resting scroll the 'Run again' and 'New numbers' row is cut in half by the readout.
- 1440 verifier-intro-1440.png and 390 verifier-intro-390.png: the Next bar slices the parts list (part 5's heading at 1440, a line of part 1 at 390); the bars still have no value axis and the graticule is not their scale; about 180 px of blank paper under the bars at 1440.
- 1440 verifier-result-1440.png: the dock sets its first paragraphs at note size and the closing paragraph at reading size.
- 390 verifier-intro-390.png: two readout labels wrap to two lines and their values sit off the others' baseline.

#### Request path (`/play/engine-floor`), 2D only, 1440 and 390

Verdict: **The result is good at both sizes; the intro and the phone play surface still need work. Fix.**

Open findings:

- 390 floor-midlevel-2d-390.png, floor-result-390.png: hop labels between stages in one column are still slivers; the mechanism words are the lesson. The fix report lists this as left.
- 390 floor-midlevel-2d-390.png: the dock cuts the legend's last row and the stage list's first row; readout cells touch ('stages laid' runs into the next 0, 'copies' into the next 0).
- 1440 floor-midlevel-2d-1440.png: the dock is scrolled so the filter field and the tabs are cut at the top and the last tab is clipped at the right, at the page's own scroll; the swimlane uses the left 45 percent of the sheet; the row number 04 touches the 'now' word.
- 1440 and 390 floor-intro-1440.png, floor-intro-390.png: two amber rings (request node and Next), the full-width now line and the '▷ now' mark by Next; disc 3 (Stage list) has no drawn target while the list says the numbers match; about 350 px of blank sheet under the example at 1440; at 390 the IPC label straddles both example boxes.
- Not shown by any capture: a run that stopped and was run again (the walk's 'first stage that did not hold' on a run that reached the client). fix-final-walk.md reports it reworded.

#### Broken benchmark (`/play/broken-bench`), 2D only, 1440 and 390

Verdict: **Not ready. First time under review; action, state and result do not share the screen at either size.**

Open findings:

- 390 bench-midlevel-2d-390.png, bench-intro-390.png: the chart is cut to a strip about 65 px tall (its title tags and the first tick marks) between the tabs and the legend, so the state is not on screen while the flaw is chosen.
- 1440 bench-midlevel-2d-1440.png: the report form's three number fields are cut in half by the readout, the flaw list is cut through its fourth row, the Setup table is cut at 'Requests', and the control that files the report is not in view.
- 1440 bench-result-1440.png and 390 bench-result-390.png: the readout strip shows its heading and stamp only; its values are below the viewport's foot. At 390 the corrected-run chart is cut at the 1 s line by the legend.
- 1440 bench-intro-1440.png: discs 4, 1, 2 and 3 are stacked in the gutter; disc 1 (Claim) is about 450 px from the reported p99 it names and disc 3 (Timeline) stands beside nothing.
- 1440 bench-result-1440.png: three boxed 'synthetic' stamps in one viewport (one under each chart, one in the readout); 'Passed' is set in the display face where every other game sets its verdict in the bold text face.
- All bench captures: the charts carry tan upper-case tape labels ('TIME TO FIRST TOKEN', 'CUT', 'REPORTED', 'MEASURED') and a grey circle in each top corner. The tan is outside the palette seen on every other surface, and the circles read as pins on a plate; if they are controls they carry no label.

#### Course (`/map`), 1440 and 390

Verdict: **Holds. One contract miss.**

Open findings:

- 1440 course-map-1440.png and 390 course-map-390.png: the unpublished TR0 title is still underlined like a link (section 3.2: 'It is not a link').
- Withdrawn from round 1: the three amber position marks (next-step block, TR1 node, lesson 1) are each specified by section 3.2 and are one carrier of the One Marker Rule.
- Not shown by any capture: the returning Course ('Last time: ...'). fix-final-walk.md reports the false lesson states fixed (placeEvents); only the first-visit Course is captured.

Read with the verdicts:
- **Tensor views and KV offload** (`shape-shifter`, `switchyard`) are not built, and have no capture and no verdict.
- **Broken benchmark** had no capture in rounds 1 and 2. Round 2b is its first review, and its verdict is "Not ready".
- **Motion and the one authored moment** cannot be judged from stills, and no review judged them.
- **Two items outside any capture:** lesson-to-lesson navigation (React error 185) and the false lesson states on Course are reported fixed in `fix-final-walk.md` (§6.6) with tests, and round 2b saw neither fixed or broken, because every lesson capture there is a direct load and only the first-visit Course was captured.
- **The focus ring** is held by `e2e/a11y.spec.ts` (§5), and round 2b's four focus captures now show the ink ring.

### 6.3 What the fix batches left, for the owner

From round 1's fix batch (`wr/fix-finish-1`), what round 2's batch closed: the retakes (round 2b's captures are valid) and the label slot for a hop between two stages in the same process column at 390 (Request path). Still open from it: the sampler's recipe level has no pick in the scene, since only the chain level offers 3D.

From round 2's batch (`wr/fix-finish-2`, merged at 64fd895; its report is `fix-finish-2.md`). Done: Broken benchmark's form at its content height with the readout pinned and no empty readout at the result, the chart leading the box with an 11rem floor at 390; Request path's dock at its content height at a desk and its legend whole at 390; the three pool options whole at 390; the sampler's result ways on found once their chunk has drawn them; Next and Skip intro above the parts list, and no "now" tab beside Next; one amber ring in the Request path and TR1 intros; a paper casing on the now line; the front page's discs given a gutter at 390; the phone goal line leading with the number to beat; the front page's Step, Undo and Auto-step on one row; 3D "now" clear of the queue and the sampler's legend naming the collar and the pale top; singular units; the five rules numbered; TR0's title not underlined; no zero counters in the level 1 table; the bench sheets without tape labels or pins; no graticule in the pool and the sampler. Not done, each with its reason in that report:
- the sampler's chain scene: value tags overprinting and collars without bars;
- the loop's 3D queue drawn twice and its box half empty; the pool's 3D box half empty, threads through "R1" and its square swatches in the legend (each needs layout work in scene models that two 3D specs pin);
- "Admit none this step" at the readout's edge on the pool at 390;
- TR5a lesson 1 at 390: the pinned dock lies over the pool grid, and at 1440 the parts list's lines pass under the readout as the page scrolls;
- Request path's intro disc 3 (Stage list) has no target in view;
- the front page's empty plot until the fifth action, with no reference run drawn (JavaScript in the front page's first-paint closure, which has 150 B of room);
- TR1 lesson 1's first viewport has no instrument edge (a content-order decision);
- DESIGN.md's description of "a 2.5rem square grid at under half strength" on a page map is stale, since that grid was removed.

From the second final check's fix (`wr/fix-close-2`): the Step loop's axis label at 390 is closed (the least spacing of a tick went from 16 to 15 px, so the axis reads 0 5 10 15 whole; the front page's first-paint JavaScript is now 119 B under its gate [measured 2026-11-17 at bd82401]); two defects found in the new baselines' diffs were fixed (the axis's last label cut to "1", and Request path's example hop label crossing a column edge at 390). Left from it: at 360 px the phone goal line, clamped, ends "step.…", and the queue shows the edge of a cut chip as a scroll cue.

Two choices where the brief is silent, for the owner: the parts list's foot fades into the dock's edge with a mask where the dock scrolls (delete the two `mask-image` rules in `src/games/kit/intro.css` for a hard edge), and the phone goal line leads with the number to beat, not the aim.

From the final check's fix batches (§6.5, §6.9): the service bell that `StepControl` still draws on `/play/loop` and on `/design` (DESIGN.md says "flat step control", and the brief's list says Bell is removed; a redraw is not a rename); the dead 2D layout `packages/play/engine-floor/layout.ts`; the one kitchen phrase in the hybrid-KV crate, which the second final check showed was a string in the crate's own check script and not a comment, and which `wr/fix-close-2` reworded (§6.5).

From the walks' fix batch (`wr/fix-final-walk`, §6.6), each an owner call:
1. The pass bar of a question set: ASSESSMENT §4.2 says an exit ticket passes with at least 2 of 3 right, at least 1 of them numeric; the code requires the last 3 answers of each kind all right. ASSESSMENT owns pass bars, so either the code or that line changes; the graded mechanic was left alone.
2. Question pools that reach past what has been taught: limiting a lesson's pool to the engines it has read needs an engine key on item blocks, which changes item generation.
3. Content under an open guess that gives the answer away: hiding it contradicts "nothing collapsed and nothing locked" (REDESIGN §1, line 6).
4. The front page's demo (stay in the chosen view, a legend, the number to beat, a line on what is assumed from kernelspace): its first-paint JavaScript is 150 B under its gate [measured 2026-11-17 at 64fd895], so this needs deferral work in the front page's closure first.
5. A Keep rule or table per lesson, and "own night" for the brief's banned-phrase table.

### 6.4 DESIGN.md and its sidecar

impeccable's documenter rewrote DESIGN.md's body and `.impeccable/design.json` from the built world (merged at 1d69a0c). DESIGN.md's North Star is **"Data Book"**, and its eleven named rules are REDESIGN §2.8's: One Marker, Ink Focus, Colour Is State, Declared Pair, Sentence Case, Ramp, Short Viewport, Flat Paper, Moves On Step, Words Are DOM and Quiet Provenance. Its front matter's tokens did not change; eight component entries were added (stamp, stamp-unverified, callout, callout-pressed, note, delta-chip, popover-trigger, course-mark). The sidecar's narrative is DESIGN.md's word for word, the kitchen's scene materials are replaced by the flat 3D materials, lights, primitives, cameras and tiers, and the Stamp, Callout and Now Cursor components are added. `tests/design/design-md.test.ts` passes with no pin changed. The kitchen and The Pass appear once, as history.

The page title's size is settled from the build: `clamp(2rem, 1.2rem + 3.4vw, 3.5rem)`, as `--es-font-display-size` and `--es-size-page`. The front page's title is the one difference from the brief that the documenter recorded: 4rem from 80rem (2.25rem on a phone, a clamp up to 4rem from 48rem), against the brief's 3rem, documented as that page's one-off and not as the page-title size. The build is what is documented.

The surface briefs under `.impeccable/surfaces/` now state Data Book as the built world. Round 1's fix batch rewrote the front page's, the five games', Course's, the question block's and the games index's; R-T50 rewrote Review's, GPU lab results', the lab page's and the trace viewer's, settled the front page's superseded section, and deleted the brief of the kitchen's specimen on `/design`, whose surface left the tree with the kitchen.

### 6.5 The copy guard's allowlist

`tests/copy/allow/` is empty: no area of what a learner reads needs an allowance. Fourteen area files were deleted by the tasks that cleared their areas, from the pool's (R-T07) on 2026-11-15 to TR1's (R-T35), the last, on 2026-11-16. `tests/copy/no-kitchen.test.ts` passes, and from R-T50 it also fails if any file comes back into that folder.

The final check found that the guard did not read everything a learner can reach, and `wr/fix-close-copy` (`fix-close-copy.md`) widened it. **What the guard reads now:** the games' copy tables, the roster and registry; the compiled lessons and modules, the Markdown export and `llms.txt`; the model cards and claims; every item family's stems, options, reasons and steps, and every variant's title (83 titles); the predictions' sentences; the labs' titles, check labels and crate prose; every string and template literal of `packages/sim/forge/*.ts` (the oracles' verdicts, read through the TypeScript syntax tree); and, for build-log ids (a task, decision or wave id, a section sign), every sentence literal of `packages/verify`, `packages/sim/host`, `packages/sim/steploop` and `packages/sim/forge`. The e2e scan reads the rendered routes, `/design` among them: its exemption (`SPECIMEN` in `e2e/screens.spec.ts`) is gone, and the page's specimens are in the engine's words. The guard was shown to fail on the old sentences: with the five directories checked out at `4a41050`, four guard tests failed.

**What is left, and where:**
- The hybrid-KV crate's one kitchen phrase was not a comment: it was the note of a step in the crate's own check script (`labs/forge/hybrid-kv/src/lib.rs:1307`, "it takes every free page and dumps the twelve oldest cached ones"), compiled into every build (all 13 fixtures held it), printed by `cargo test` when that step's reply is wrong, and shipped in `public/labs/enginespace-hybrid-kv.zip`; the page itself grades through its own oracle and never showed it. `wr/fix-close-2` reworded it to "evicts the twelve oldest". It first checked that regeneration with no change is byte-identical (`verify-labs`, 27 builds, and `pack-labs --check`), then changed the note and regenerated. **Hashes that moved:** the 13 hybrid-KV `.wasm` fixtures, `public/labs/enginespace-hybrid-kv.zip` (3348e76d... to aa61d1c5..., 153,517 to 153,518 B) and its `lib.rs` member hash in `manifest.json`; no other hash is pinned anywhere, and `verify labs` passes. Nothing of the crate is left to reword.
- Internal names that a learner does not read: the view fields `kitchen` and `cooks` and the ids of Request path, the `bell` trace command (`src/trace/state.ts`), the Button variant `plate`, `ticket` in internal names, and three.js's own `clipping` words. Error messages thrown by the games' engines are in the engine's words, after `wr/fix-close-2` reworded those of the pool's levels and bands, the verifier session, `predictions/tr2.ts` and the `describe` strings of four `blind.ts` files, with these left, none printed by any page [read 2026-11-17 on the tip, with the copy guard's own word list over every `throw new ...Error(...)` of `src/` and `packages/`]: `packages/play/engine-floor/layout.ts:473` ("the house plan"; the module is unused by `src`), `packages/play/verifier/exact.ts` (lines 80, 83, 118 and 127: "recipe", "plate", "re-plate"), `src/items/today/Work.tsx:59` ("ticket"), and the `describe` strings of `packages/play/verifier/blind.ts` ("dish", "recipe"), which only a test prints. A mistyped level, lesson, lab or page address shows the game or a "not found" page with no error.
- `StepControl` (renamed from `Bell`, with `BusyMark` from `StationLight` and `LoadingDots` from `PrintingDots`) still draws a service bell on `/play/loop` and on `/design` (§6.3).
- Token role names that were kitchen words were renamed (`lamp` to `marker`, `lamp-ring` to `marker-edge`, `tape` to `slip`, `tape-ink` to `slip-ink`, `light-fluorescent` to `light-ambient`, `dur-bell` to `dur-step`, `radius-plate` to `radius-control`, `size-plate` to `size-control` and `font-ticket` to `font-readout`; values unchanged; `slip` and `light-ambient` are in use; recorded under D-064 for the owner to confirm), which departs from REDESIGN §2.8's "token role names stay" and is forced by `/design` losing its exemption. DESIGN.md, its sidecar, the two loop posters and the tests follow.

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

**Questions the build raised, for the owner** (none is a fault; each has the default taken and what moves if the owner answers otherwise):
1. **Should a lesson have a gated row for what it loads unasked?** The route gate counts a page with its static imports, and `/m/:module/:lesson` reads 150,115 B, 49,885 B under its 200 KB gate (§4.2, §6.9). Since R-T10 the lesson page also loads `LessonLedger`, `Predict`, `ItemBlock` and the levels after first paint with no action by the learner, and since the lesson opens on its game, the game loads unasked too (§6.9 has the figures). The gate's letter holds, and D-059 fitted the front page the same way, but the owner froze these budgets twice and the lesson is now the heaviest page to open. Default: no new row, since no gate moves without the owner. If the owner wants one, it is a new row with a number chosen from §6.9's figures.
2. **The pass bar of a question set** against ASSESSMENT §4.2 (§6.3, item 1): change the code to "at least 2 of 3, at least 1 numeric", or change that line to "the last 3 of each kind". The graded mechanic was left alone.
3. **Request path's cut** (D-065, decision 2 above) and PRODUCT.md's three marked changes: principle 1 reworded ("Play the mechanism before reading it, where the play can succeed", REDESIGN P3), principle 6 added ("The engine's name is the name", P1 and D-063) and principle 7 added ("One way on", P2 and D-066). Each is marked proposed in PRODUCT.md for the owner's confirmation.
4. **The service bell on `StepControl`** (§6.3): keep the drawing, or redraw it flat as DESIGN.md says.
5. **Whether a fourth finish review is wanted** on the tip, after `wr/fix-finish-2` (§6.2).

### 6.9 The gates against wave-2's

**Bundle budgets.** `scripts/verify-bundle.ts`'s `BUDGETS`, dumped flat from `wave-2` (25320d5) and from this branch, and compared by the merge script's guard: **15 gated numbers on each side, all 15 equal, none raised, none added, none removed** [measured 2026-11-17]. `scripts/verify-bundle.ts`, `scripts/verify.ts`, `tests/bundle/`, `package.json`, the lockfile and `.github/` have no diff against `wave-2`. `verify:bundle` on the tip (64fd895): 60 budgets gated, all passing, 3 over a target, and the postfx row skipped because `src/scene/postfx` left the tree [measured 2026-11-17]. The rows with the least room: the front page's first-paint JavaScript at 149,850 B, 150 B under its 150 KB gate; `/play/broken-bench` at 199,267 B, 733 B under its 200 KB gate; `/play/engine-floor` 6,230 B under and `/play/pool` 6,535 B under [measured 2026-11-17 at 64fd895].

**The other thresholds: two browser-test bars were lowered, and were restored.** The sentence this section first carried, "No gate, budget, threshold or tolerance moved in wave R", was false when it was written. The final check of `4a41050` found two bars in the `features` project (the nightly sweep, not a pull request) that wave R's tasks had lowered with no record, and `wr/fix-close-ci` (merged at a8edcdf; `fix-close-ci.md`) put them back:

| Bar | Lowered by | Was | Became | Now | What the restored bar measures [measured 2026-11-17, on 20, 4 and 2 cores] |
|---|---|---|---|---|---|
| `e2e/loop-scene.spec.ts:263`, drawn-canvas colours | R-T18 (`66db745`) | `> 40` | `> 20` | `> 40` | the state the test already used (first-3-gap, async on, one step): tier 1 53 colours and luma spread 48.7, tier 2 61 and 48.4, the same on every core count |
| `e2e/pool-scene.spec.ts:464-465`, colours and luma spread | R-T41 (`1b54af0`) | `> 40` and `> 12` | `> 30` and `> 8` | `> 40` and `> 12` | adapters, six actions admitted, tier 2: 107 colours, spread 39.6 |
| `tests/map/summary.test.ts`, `specialsCopy().length` | found by the fix's own diff | `> 10` | `> 8` | `> 10` | 12 |

No bar had to stay lowered, so there is nothing for the owner to decide on these three. The check's second finding, a bar that was not lowered but failed on a four-core machine, was `e2e/screenshots.spec.ts`'s "3D view of the front page at 1280 px is drawn": a device with four cores or fewer starts at tier 1, which has no MSAA, and the flat time track then draws exactly 40 colours, which the bar (`> 40`, set for the kitchen scene, which drew 155 to 160) refuses; it failed on every run on four cores and passed on 20. The fix kept the bar at `> 40` colours and `> 12` spread and made the test capture a state with something drawn (two requests admitted, one step run): 69 colours and spread 36.6 on 20 cores, 56 and 37.8 on 4 and on 2. Smoke shard 4 then passed on four pinned cores and on two (3 runs each, 0 failed of 123), and loop-scene and pool-scene passed (25 tests, 3 runs each, on both).

**The check's own diff of every bar**, wave-2 to the tip, over `e2e/`, `tests/` and `playwright.config.ts`:

| Where | Change | Stricter, same or looser |
|---|---|---|
| `playwright.config.ts` | the `smoke` project grew from six specs to nine (first-visit, keep-list, screens); timeout, retries, workers, flags and the screenshot options unchanged | stricter |
| `scripts/verify-content.ts` | the content gate also replays a figure's replay | stricter |
| `scripts/verify-games.ts`, `scripts/verify-kc.ts` | a lazy shell is a file that mounts `Frame` or `GameShell`; task ids also match `R-Tnn` | same, for the rename and the new wave |
| `e2e/screenshots.spec.ts` | tolerance (1%) and capture timeout unchanged; 4 baselines re-blessed against `wave-2` and 14 added, and eight of those 18 (`front-360`, `front-fired-360`, `front-first-visit-390`, `front-returning-390`, `kv-page-pool-1440` and `-390`, `request-path-1440` and `-390`) re-blessed again by `wr/fix-close-2` for `wr/fix-finish-2`'s layouts, each diff looked at; the 3D check at 360 px returns early (a phone is offered no 3D); the 14 new baselines are skipped off Linux | same tolerance |
| `tests/build.test.ts` | the list of sources that may be an on-demand chunk gained eight patterns: `src/map/dueCount.ts`, `src/items/ItemBlock.tsx`, `packages/play/predictions/commit-*.ts` and, under `src/content/render/`, `Predict.tsx`, `LessonLedger.tsx`, `levels.ts`, `Dock.tsx` and `ShowOnMachine.tsx`; each is named in the test's comment | **looser, and the reason for the lesson's load below** |
| `e2e/perf.spec.ts` (the nightly lab profile) | gates unchanged; its CLS no longer has a swap to 3D in it, and its INP is taken on the 2D diagram, because a phone stays in 2D | the measure is easier, the gate the same (see the two ungated measures below) |
| `e2e/broken-bench.spec.ts` | `toBeCloseTo` digits 6 to 1 in two places | looser on its face; the page prints the claim with one decimal (`formatReadout(x, 1)`), so one digit is what it shows. Left; the owner may want a check against the formatted value |
| `e2e/loop-full.spec.ts` | the test "at 390 px the scene leads the page ... not blank" (colours `> 40`, spread `> 12`) was deleted by the redesign | the Step loop offers no 3D at 390 (§6.8, decision 3), so no phone picture check is owed; the capture bar lives on in loop-scene |
| `tests/content/openers.test.ts`, `vocabulary.test.ts` | `failing(...)` and `todo(...)` exist for rows waiting on a task; both files assert that none is waiting | inert |
| `e2e/pool-scene.spec.ts`, 'selections that changed the picture' | the check "decisions that moved the twine `> 1`" was rewritten for the new layout and now asks that selections changed the picture `> 0`; a different test, not the same bar loosened | a different test, rewritten for the new layout |
| `e2e/broken-bench.spec.ts`, 'the first screen' | rewritten by `wr/fix-finish-2` for the new layout: the page-length bound is gone, and at 390 "the claim is in view" became "128 px of the chart shows" | a different test, rewritten for the new layout |
| `.fixme`, `.fails`, `describe.skip`, retries | none added | none |

Ten unit test files and two e2e specs were deleted, all of the kitchen's scene, layout, props and posters; the layout comparisons of forge, lab-kits, front, map and loop-full were rewritten for the new layouts and changed with the design, not as numeric loosening.

**The lesson's load.** §4.2 presents the lesson route's row as 150,115 B against 200 KB, which is what the gate counts: the page and its static imports. The final check measured the browser as well [measured 2026-11-17 at 4a41050]:
- Since R-T10 the lesson page loads `LessonLedger`, `Predict`, `ItemBlock` and the levels as chunks of their own after first paint, with no action by the learner (`src/pages/Lesson.tsx:49-54`). The check read their sizes from the manifest as 38,919, 4,851, 11,935 and 4,303 B.
- A lesson now opens on its run, so the game loads unasked as well. With no click and no scroll the browser fetched **279,507 B (TR2 lesson 7, which has no game) to 329,858 B (TR1 lesson 1)** of JavaScript and CSS, gzip, on four lessons at both sizes.
- On `wave-2` the same row was **147,482 B**, with the guess and the question block inside it, and the game loaded when the learner started a level.
- `tests/build.test.ts` gained the eight on-demand patterns above to allow these chunks to stay out of the route's closure.

This is within the gate's letter, and D-059 fitted the front page the same way. It is recorded as a question for the owner, not a fault: whether a lesson should have a gated row for what it loads unasked (§6.8, question 1). No code or test changed for it.

**Two measures that no gate holds** [measured 2026-11-17]:
- **The nightly lab profile.** Its CLS no longer has a swap to 3D in it and its INP is taken on the 2D diagram, because a phone stays in 2D; the gates (CLS, INP, LCP) are the same, and the measure is easier.
- **The three preloaded fonts** (Big Shoulders Display 800, Atkinson Hyperlegible 400 and Atkinson Hyperlegible Mono) are **49,516 B** as served, up from **35,748 B** on `wave-2` (Big Shoulders 14,556 B, Doto 3,984 B and Atkinson 17,208 B) [measured 2026-11-17 at 64fd895, with `bun scripts/verify.ts bundle`, which prints the row "fonts preloaded"]. The Mono face (17,752 B) replaced Doto (3,984 B). No gate holds this row.

The screenshot tolerance is 1% on both branches.

### 6.10 The full run

The full run below is of R-T50's own branch, on 1d69a0c's code. The fix batches that followed it each re-ran the gates: `wr/fix-close-ci` (16 of 16 verify gates, smoke shard 4 on four and two cores), `wr/fix-close-copy` (lint, typecheck, 16 of 16, the unit suite in CI's mode, smoke 493 of 494 with one keyboard-walk test in `e2e/first-visit.spec.ts` failing about one run in six alone; its cause and fix are below) and `wr/fix-finish-2` (lint, typecheck, build, the e2e specs of the games it touched 488 passed and 1 axe contrast failure under load that passed alone twice; no screenshot baseline re-blessed, which is why eight were found out of date afterwards). `wr/fix-close-2` then re-ran all four smoke shards (below).

**The second final check and its fix (`wr/fix-close-2`, merged at 09ae209; `fix-close-2.md`).** The check of 03189fd ran the unit suite (10,510 pass, 28 skip, 0 fail in 381 files), the 16 verify gates and `verify:bundle` clean, and found smoke shard 4 failing 10 tests on 4, 2 and 20 cores: eight screenshot baselines that `wr/fix-finish-2`'s layouts had outdated, and the Broken benchmark's readout, which that batch had removed at the result and which the smoke spec asks of every game. The fix put the result's counts back in the readout (the spec is unchanged), re-blessed the eight baselines at the unchanged 1% tolerance (§6.9, and the pull request lists them), and then ran **all four smoke shards on four pinned cores** (`taskset -c 0-3`, two workers, CI's environment): **124, 124, 123 and 123 passed, 0 failed, 0 retries** [measured 2026-11-17 at the fix's tip]; the unit suite passed 10,512 with 0 failed; `loop-scene` and `pool-scene` passed.

**The keyboard-walk flake, its cause and its rate.** `e2e/first-visit.spec.ts`, "a first visit at 390 x 844, by the keyboard", failed 1 of 9 runs on four cores in the second check (0 of 9 at 1440 x 900). The cause: after a navigation the lesson's opening game arrives as a lazy chunk, and its loading placeholder was 192 px, then 27 px, then about 1,000 px tall, which pushed the Test's Start button more than 700 px below the viewport just after focus had scrolled to it (scroll anchoring has no anchor in that frame). The fix makes the loading placeholders reserve the frame's height (`content.css`, `lesson.css`, `GameEmbed`'s `reserve` prop); no wait and no retry was added. **Rate before: 2 to 3 failures in 20 runs at 390 x 844. After: 0 in 20 at each size (40 of 40)** [measured 2026-11-17 on four cores].

On the R-T50 branch [measured 2026-11-17, on 1d69a0c's code with R-T50's documents and tests]:

- `npm run lint` and `npm run typecheck`: clean.
- The unit suite in CI's output mode (`bun test`, as the merge gate runs it): 10,523 pass, 28 skip, 0 fail, in 381 files.
- `npm run build` and `bun scripts/verify.ts all`: pass (§6.9 for the bundle).
- **The whole e2e suite** (`npx playwright test`, both projects and the lab profile, two workers, the host's Chromium shell): 1,169 tests, 1,162 passed and 7 failed on the first run. Each of the seven, and what became of it:
  - `e2e/network.spec.ts`, `/play/pool` and `/play/verifier` (2): the spec pressed the 3D switch at a phone's width, and since the finish review's round 1 the pool and the sampler offer no 3D on a phone, and the sampler offers it on its chain level only. The spec now draws those scenes at a desk's width and visits the sampler's chain level after its first; it still requires the scene to go live and every request to stay in the origin. Both pass.
  - `e2e/trace-view.spec.ts`, "shows the marks as a trace-mark event's data" (1): a race in the spec. The viewer hands its marks to the page in an effect, a render after the click, and the spec read the export once, at once. It now waits for the export to hold the mark, then asserts as before; the spec's 21 tests pass.
  - `e2e/ledger-conformance.spec.ts`, "the page runs the cases of the suite that Bun runs" (1): a 90 s timeout while the unit suite ran on the same machine; it passes when run alone.
  - `e2e/lab-kits.spec.ts` (3): **left, with its cause.** `public/labs/manifest.json` lists the GPU kit and the grader wheel beside the three forge labs, and no page links them, so the spec's "the manifest lists forge labs and nothing else, so that a file of another kind must be given its page and its row here" fails as it was written to, and so do the two per-file checks (`/labs/undefined`). Both files came into the manifest on `wave-2`, so this fails there too; giving them a page and a row is W2's kit work, not wave R's.
- The lab profile's front page (mobile, CPU 4x slower): LCP 904 ms on the h1, CLS 0, INP 48 ms, all within their targets [measured 2026-11-17].
