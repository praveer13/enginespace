# enginespace: plan for the rest of the build (final)

> This is the plan for the rest of the build, written 2026-11-19 against a read-only export of `wave-r2` at `9b7ceb9`: it defines waves 1 to 5, with wave 1 in full and the later waves in outline, and wave 2 was planned from its sections 0 to 3 and 5 to 9. It is a plan, not a record. Its own sentence about being private working material with absolute paths describes the copy kept with the build, not this one; this copy replaces its paths on the build host and its references to files kept with the build by plain words, and changes nothing else. It was copied in on `wave-2m2`, whose tip was `e221dc72` when the copy was made.

Written 2026-11-19 against the read-only export of commit 9b7ceb9 (branch `wave-r2`). The export is a copy of that commit on the build host, not in the repository, and every other path is relative to it. Nothing was built or run there, no git command and no web request was made, and nothing in the export was changed. This file is private working material: it holds absolute paths, and section 3's path rule says none of them may reach a commit or a pull request.

This plan replaces an earlier draft (kept with the build, not in the repository). It is complete in itself. The machine-readable task list of wave 1 is a file kept with the build, not in the repository.

## 0. What this plan rests on

**Read whole:** the draft; the five maps (kept with the build, not in the repository: the tracker, authoring, games, labs and followups maps); the two critics' findings; `curriculum/TR0-pytorch-for-rust.md`; the merge script (kept with the build, not in the repository; it is outside the export).

**Checked in the export, because a finding or the order rests on it:**
1. `src/front/menu.ts` lines 40 to 46: `firstLesson()` takes the first module of the index that has a lesson. `content/course.yaml` lists `tr0` first. So publishing TR0 lesson 1 would move the front page's Start control, `nextStep`'s rule 1 and the demo's closing copy (`src/front/copy.ts` line 115 names TR1) from TR1 lesson 1 to TR0 lesson 1. Twenty test and spec files name TR1 lesson 1 (a grep of `tests` and `e2e`).
2. `src/pages/Game.tsx` line 7 imports `resolveGame` from `src/games/registry.ts`, which imports the value `GAMES` from `@es/play`; `packages/play/registry.ts` line 52 builds `GAMES` from the five entries, each a static import. Every registered game's `entry.ts` is therefore in every `/play/<id>` route. The five entries are 1,095 to 1,766 B each as gzip of the source with comments [my count]; critic 2 derives 481 to 654 B each once comments are stripped, which I did not reproduce. `/play/broken-bench` has 115 B of room.
3. `scripts/verify-kc.ts` lines 162 to 195: a lab's graded reference is read only from `packages/sim/forge/kcs.ts` (`LAB_CHECK_KCS`, forge labs). `src/progress/kcmap.ts` maps `receipt:<stage>` to its lab's KCs through `KcSources.lab`. Nothing maps a grader lab's stage to a KC.
4. `docs/ASSESSMENT.md` 7.1 to 7.3 and 9: three kinds of Prove-it, and a module is complete only with a `proved` event. `src/progress/derive.ts` line 18 says completion is not derived because no such event exists. `docs/DECISIONS.md` Q-5's default is "Yes". `docs/TRACKER.md` holds no task with "Prove" in it.
5. `labs/grader/pyproject.toml` depends on `jsonschema==4.26.0` only; `labs/envs/cpu/pyproject.toml` holds `torch==2.14.0` (PyTorch's CPU index) and `transformers==5.19.0`; `labs/envs/relock.sh` needs the network for metadata. `.github/workflows/labs.yml` runs on `pull_request` (a path list) and `workflow_dispatch`, with no schedule, and its grader job syncs only `labs/grader`.
6. `.gitignore`: `public/claims.json` is ignored and never committed; `public/md/` and `public/llms.txt` are committed.
7. `playwright.config.ts`: `retries` is 1 under `CI`; only the `smoke` project has `--disable-gpu-compositing`; with `ES_E2E_NIGHTLY=1` and no `--project`, Firefox and WebKit projects are added. `.github/workflows/nightly.yml` has the jobs `properties` (`ES_PROPERTY_SEEDS=10000`, `ES_HEAVY=1`), `lab-rates`, `browsers`, `lab-profile` and `reports`, all off until `NIGHTLY_ENABLED` is set.
8. `src/items/Attempt.tsx` line 119: a Test passes when every question is right on new numbers ("3 of 3: passed"). `docs/ASSESSMENT.md` 4.2 says 2 of 3 with one numeric or constructed.
9. `curriculum/TR7-contribute-honestly.md` section 11 item 1: "no target ships until the owner has reproduced it once on the course's reference hardware".
10. `content/claims/tr2.yaml` line 753: the claim `mlc-book.gemm-launch-api` cites the book's site page. `curriculum/TR3-profile-a-real-engine.md` line 78 says a link to the book goes to the repository file at a commit, and that any further number of the book waits for the owner's word on its licence.
11. `e2e/keep-list.spec.ts` lists five moments, one per built game or debrief; `docs/REDESIGN.md` 5.4 asks that each game's scripted first run reaches its first named moment before the run ends.
12. The facts the draft checked and I rely on without re-checking: the course index is in the front page's first paint and grows by one row per lesson (`scripts/content/build.ts` lines 875 to 923, `COURSE_INDEX` in `scripts/verify-bundle.ts`); the KC gate accepts `W<n>-Tnn`, `W<n>b-Tnn` and `R-Tnn` in a `planned:` line (I read the regular expression at `scripts/verify-kc.ts` line 387); the hard-coded counts 27, 39 and 42; `MAX_PLAN_NUMEL = 256`; `STAGE_DECLARATIONS = {}` and `BANKS = {}`.

**Not read:** `docs/ARCHITECTURE.md`, `docs/GAMES.md`, `docs/PLAN.md`, `docs/WORLD.md`, `DESIGN.md`, `PRODUCT.md`; `AGENTS.md` beyond one grep; `content/README.md` beyond its headings (I rely on `map/authoring.md` for the twelve rules); `docs/waves/*` beyond the shape of `wr-tasks.json`; `docs/DECISIONS.md` beyond the O- and Q- tables and D-068's line; `docs/REDESIGN.md` beyond sections 5.4, 5.5 and 7 and two greps; `docs/TRACKER.md` beyond its reading guide, the agent brief and tasks W2-T14 to W2-T22; the briefs of TR3 and TR4 beyond their "Where these come from" paragraphs; the briefs of TR5b and the capstone; `curriculum/TR7` beyond its open items; `.github/workflows/ci.yml`; `scripts/verify-bundle.ts` beyond lines 296 to 400; every test body, every game's source and the grader's Python. Sizes of waves 2 to 5 therefore rest on the maps, which say what they did not read.

Tags: [measured] is a figure a document in the export prints, with its date; [derived] is arithmetic on such figures; [estimated] is a judgment.

**What changed from the draft, in one paragraph.** Wave 1 is cut in two: 1a (the gate, the defects, the tooling) ships on its own, and 1b (TR0, the receipts path, Prove) stacks on it. Fourteen tasks are new: room on the game routes by loading one game's record at a time (W2b-T40), the course's start as a key so that publishing TR0 does not move the front page (T41), Prove mode (T42), the gate's lab checks (T43), an exit check for 1a (T44), a dead-code cleanup (T45), a script that re-reads claim quotes at their pins (T46), a table from grader-lab stages to KCs (T47), the TR0 lab's grader module split from its kit and page (T48), the Triton interpreter runs (T49), "Defend your receipt" (T50), TR0's lessons cut into tasks of at most two lessons (T51, T52), and a teaching-fix task on opus (T53). W2b-T38 moved to wave 2. Every lab task of every wave now merges through one serial queue. Section 9 lists what was not taken.

---

## 1. Present state

**Built** (judged from files, not from the tracker's markers, which are all `[ ]` for W2):
- Five modules with their games, items, predictions and tests: TR1, TR2, TR5a, TR6, TR8 (27 lessons, 5 games, 39 predictions).
- The redesign: the instrument frame (`src/games/kit`), the lesson template, Data Book.
- The grader and receipts track: W2-T01 to W2-T11, with W2-T13 (tensor sim), W2-T19 (trace export), W2-T28 (tiers sim) and W2-T43 (closed by R-T09). `/receipts`, the receipt worker, `packages/verify`, the hardware atlas, the kit packer, the runners. Several of these keep an open check: W2-T02 (`selftest --gpu` is a stub), W2-T04 (the Dockerfile builds are the owner's), W2-T07 (the verdict is frozen into the event), W2-T08 (a bare claim; `relabelled` unread in rule 7), W2-T13 (the torch vectors' build), W2-T19 (the nsys table names).
- The trace viewer (`src/trace`) and the trace model (`packages/sim/trace`).

**Not built:**
- Modules TR0, TR3, TR4, TR5b, TR7 and the capstone: no `content/modules/<id>`, no KC, no claims file, no item family.
- Four games: Tensor views (`shape-shifter`), Trace attribution (`gap-hunt`), Backend dispatch (`dispatch`), KV offload (`switchyard`). `/trace-room` is a stub.
- Every graded lab: no `labs/gpu/`, no lab module under `labs/grader/src/enginespace_grader/labs/`, no `checks/` or `bench/` folder, no page for an L or F lab. The forge lab `kv-publisher` is not built.
- Three sims no tracker task owns: a gap and cause finder for Trace attribution, a second GPU stream in the trace generator, and the connector model for KV offload. `packages/sim/backends` does not exist.
- Prove-it in all three kinds of `docs/ASSESSMENT.md` 7.2, and the derivation of module completion (section 9 of the same file). No tracker task owns either.
- A mapping from a grader lab's stage to the KCs it earns.
- Lesson blocks `trace`, "In vLLM today" and the Build row (W2-T42), and those cards for the five built modules; the readers of the prediction event (W2-T44).
- All of W3 except parts of `/about` and `/changes`.

**Open defects a learner meets today** (`map/followups.md`, class A): two on the Request path at a mouse and at a keyboard (A1, A2), one on a short desk (A3), a focus race on the Step loop (A4), covered fields on the Broken benchmark (A5, A6), a flash of dock controls on a phone's first run (A7), and two 320 px page faults (A8). Fifteen tests are red on the base and in no gate: eight in the `features` project, five nightly walks, two 320 px page checks. Two more are flaky.

**Blocked on the owner, and nothing an agent does replaces it:** W1-T02 (confirm the pins, O-4), W2-T12 (GPU smoke and real receipt fixtures), W2-T17 (the TR0 argmax bank), W2-T21 (6 to 10 reference traces, O-5), W2-T40 and W3-T12 (screen-reader passes), W3-T01 (the capstone's commit pairs, O-6), W3-T16 (launch), the reproduction of TR7's targets, a real-engine run of every F-lane lab, upstream's connector tests and the nano-vllm install, Q-10's dispatcher table run, the look at any new 3D scene or screenshot baseline, and the human cold test of `docs/REDESIGN.md` 5.5.

**Room under the frozen gates:** front page first-paint JavaScript 350 B under 150 KB; `/play/broken-bench` 115 B under 200 KB (the task's figures; `docs/waves/WR-report.md` 7.8 prints 337 B and 99 B [measured 2026-11-19 at fcd0f68]). `receipt.worker` 4,161 B under 60 KB and `three-vendor` 6,520 B under 245 KB [measured 2026-11-17 at a564916, per `map/games.md`].

**Seven facts that decide the order:**
1. Twenty-five new lessons cost about 1.2 KB of first paint through the course index [derived: 25 times about 49 B], against 350 B. No lesson merges before the lesson rows leave the first paint (W2b-T16).
2. Registering a game adds its record to every `/play/<id>` route, and `/play/broken-bench` has 115 B. No game registers before the game page loads one record at a time (W2b-T40).
3. Publishing TR0's first lesson moves the course's start unless the start is named (W2b-T41).
4. The merge gate cannot see a broken walk, a broken `features` spec or a broken grader test (W2b-T02, T43).
5. A game cannot register half built: the registry, the walks, the blind probes, the card, the claims and the KCs are checked together. So a module's KCs and claims land before its game, and the game's pure session lands unregistered before its views.
6. TR0 is the only unwritten module whose lab runs with no GPU, and its sim is built. It is first in the KC order (TR0, then TR3, then TR4). It is the pattern module: the first graded lab page, the first `labs/gpu` kit, the first lab module in the grader, the first Prove level, the first "Defend your receipt".
7. The build machine has no torch. A test that needs torch can run only in CI (the `labs.yml` job this plan adds) or after the owner allows the download (question N4). Such a test must fail, not skip, where torch is expected.

---

## 2. The waves

The whole is about 180 tasks [estimated], so it is cut into six waves. Each ends in a state that passes every gate, can be deployed, and has one pull request stacked on the previous wave's branch. The owner merges; agents never do.

| Wave | Branch | Holds | Tasks | Ends when |
|---|---|---|---|---|
| 1a | `wave-2m1a` on `wave-r2` | The gate, the defects a learner meets today, the tooling the modules need | 29 (planned in full) | W2b-T44: every class-A defect is fixed or listed for the owner, and the first-paint and game-route room is made |
| 1b | `wave-2m1b` on `wave-2m1a` | TR0 complete, the receipts path's open checks, Prove mode, the first lab page | 30 (planned in full) | W2b-T39: TR0 is live in the browser; its lab is built; the bank, the weights run and the 3D look wait for the owner |
| 2 | `wave-2m2` | TR3 beside TR5b, TR7's sources and targets as a light third lane, the first F-lane lab | 47 [estimated] | Both modules are live in the browser; `pinned` and every real run wait for the owner |
| 3 | `wave-2m3` | TR4 beside the rest of TR7; the GPU labs of TR1 and TR6; the grader's follow-ups; the runbook for one GPU session | 33 [estimated] | Every W2 module is written; every lab is built to its synthetic acceptance |
| 4 | `wave-2m4` | W2's close: what the owner's runs unlock, Prove on the remaining games, module completion, end-to-end coverage, the exit review | 16 [estimated] | W2-T41 |
| 5 | `wave-3` | W3: the capstone, search, the Evidence Pack, the watcher, the sweeps, launch | 23 [estimated] | W3-T17 |

**Task ids.** A task that is the tracker's keeps its id (`W2-Tnn`, `W3-Tnn`). New work takes `W2b-Tnn`, which the KC gate's pattern accepts. Wave 1 uses W2b-T01 to T37 and T39 to T53; W2b-T38 is kept for wave 2's capture runbook. In the lists below a bare `Tnn` is `W2b-Tnn`. W2b-T01 writes only wave 1's headings into `docs/TRACKER.md`. Each later wave opens with a task that writes that wave's headings, after its task list is confirmed against the module designs, so no `planned:` line can name a task that is later renumbered. For that reason the outlines of waves 2 to 5 give new tasks a name and no id.

**Sizes** are the tracker's: S about 2 agent-hours, M about 6, L about a day (10 hours here) with a plan as the pull request's first comment.

| Wave | S | M | L | Agent-hours at the upper bounds [derived] | Models | Agent runs with re-runs [estimated] | Gate wall time [estimated] |
|---|---|---|---|---|---|---|---|
| 1a | 12 | 16 | 1 | 130 | 2 opus, 4 haiku, 23 sonnet | about 38 | 10 to 19 hours |
| 1b | 5 | 22 | 3 | 172 | 11 opus, 3 haiku, 16 sonnet | about 40 | 10 to 20 hours |

Gate time is one serialized gate run of 20 to 40 minutes per merge [critic 2's estimate; W2b-T02 measures it]. The orchestrator merges branches that touch only documents in one batch. The longest chain of 1a is T01, T02, T16, T41, T19, T20, W2-T42, T22, T44: about 46 hours [derived]. The longest chain of 1b is T26, T27, T28, W2-T14, T32, T51, W2-T18, T33, T34 or T35, T36, T53, T39: about 68 hours [derived].

---

## 3. Rules every task of this plan carries

**G0, the standard gate.** Every task passes, on the merged tip, in CI's environment: the unit suite in four shards from a pristine checkout, `npm run lint`, `npm run typecheck`, `npm run build`, `bun scripts/verify.ts all`, and the smoke project on four pinned cores with two workers. From W2b-T02 on, the gate also runs the `features` specs and the nightly-width walks that the branch's paths call for, with `--retries=0`; from W2b-T43 on, the grader and forge checks that the branch's paths call for. A task below lists only what it adds to G0. "Nightly width" means `ES_E2E_NIGHTLY=1 npx playwright test --project=smoke walks -g "(<game id>)" --retries=0`, which walks every level at 360 and 1280 px and runs the first-screen and first-run tests.

**Never lowered.** No task raises or adds a bundle budget. No task changes a threshold, a tolerance, a timeout, a retry or a skip in an existing test, a pacing or opener constant under `scripts/content/`, the blind-probe bound under `scripts/games/`, a constant of `tests/seeds.ts`, `MAX_PLAN_NUMEL`, or a screenshot baseline. No task adds an entry to `scripts/gate/known-red.json`. W2b-T03 makes the merge gate refuse each of these unless the orchestrator's allow-list for the task names the line. Where a task below edits an expected count, the edit is named in the task and the count stays exact.

**No quiet skip.** A new test that needs something the machine may lack (torch, a browser engine, the network) fails where that thing is expected (`CI=true`, or the named environment) and says so; it never skips there. W2b-T03 lists every skip guard a branch adds, in new files too.

**Rows reported.** Every task that touches `src/games/kit`, `src/design`, `src/front`, `src/games/loop`, `src/content/load.ts`, `packages/play/index.ts`, `packages/play/keys.ts`, `src/routes.tsx`, `src/pages/Game.tsx`, `src/games/registry.ts` or the receipt worker reports the front-page row, the `/play/broken-bench` row and its own route's row from `verify:bundle`, before and after. A game or lab task must not change `src/games/kit` or `src/design`; if it must, that is a separate commit that names every game it touches and runs every game's nightly-width walks.

**Numbers.** A number the course's model prints is `[synthetic]` with its day and commit. A number nobody measured is a dash in a table, or `[estimated]` with the next sentence saying it is arbitrary. A quoted run of someone else's is `[unverified]` (O-21's default). No lab page and no lesson prints `[measured]` for a run the course has not made.

**Claims.** `verify:claims` checks a claim's schema, id, dates, formula and pin key. It does not read the source. That a quote lies inside its anchored lines is asserted by the sources task and checked again by the module's technical check, with W2b-T46's script. Every sources task stores, for each claim, the raw-file URL at the pinned commit and the line range.

**Owner steps.** No agent simulates one. A synthetic bundle keeps its `synthetic` label and never goes under `tests/fixtures/receipts/`. `BANKS` stays empty until the owner's bank is committed. No task marks a tracker task `[x]` while one of its checks is the owner's or needs a GPU.

**Web requests and downloads.** A generic User-Agent, no name, email or token anywhere (AGENTS.md rule 8). A source is read at its pinned commit, never at `main`. Reading a file at a pinned commit, and the metadata requests of `labs/envs/relock.sh`, are allowed, as W2-T04 did. An agent installs no wheel and downloads no model, bank or source tree on the build machine without the owner's leave (question N4).

**Evidence from CI.** The orchestrator opens each wave's pull request as a draft at the wave's first merge and pushes the wave branch after each merge, so `ci.yml` and `labs.yml` run during the wave and not only at its end. Where a task's check can run only in `labs.yml`, the task is "built, awaiting the labs run", and the orchestrator confirms that run is green before any task that depends on it merges.

**Paths stay private.** Gate logs, reports and pull request text are filtered to repository-relative paths. Before a commit or a push, a grep of the diff and of the pull request text for `/home/`, `/tmp/` and the login name must find nothing; W2b-T03 makes the gate refuse otherwise. A task is handed a file's contents or a copy inside its worktree, never a scratchpad path to cite.

**Toolchains.** Cargo runs with `RUSTUP_AUTO_INSTALL=0`. Python runs only through `uv run --project`, with `UV_PYTHON_DOWNLOADS=never` and `UV_PYTHON` set to an installed interpreter inside the lock's range (this machine has CPython 3.13 and 3.14 and no 3.12). No `uv sync` of the `vllm`, `sglang` or `nano-vllm` environments on the build machine.

**Lane G is one serial merge queue.** Every task that changes the grader, a kit, an environment, `src/receipts/declared.ts`, `packages/verify/stages.ts` or `labs/references/manifest.json` is in lane G, in every wave, whichever module it serves. Lane-G tasks may be built at the same time, but they merge one after the other in the order the wave gives, each after a rebase and a repack (`bun scripts/pack-kit.ts`, then `--check`). A module lane names a lab task only as a dependency of its lessons.

**Collision points, and how lanes avoid them.**

| Shared file or budget | Who touches it | How lanes stay apart |
|---|---|---|
| Counts of lessons, predictions and game blocks (five test files) | every lesson | W2b-T17 replaces each literal with a per-module table that already has a row for tr0, tr3, tr4, tr5b and tr7 at zero. A lane edits only its own row; the total is the sum and stays exact. |
| `tests/kc/graph.test.ts` `MODULES`, `content/kc/graph.yaml`, `tests/content/openers-table.ts` | every module | One block per module. The module's design task adds the whole block in one commit, after W2b-T17. A later task removes only the `planned:` lines of the KCs it discharges. |
| `src/map/outcomes.ts` | every module | W2b-T19 moves outcomes into each `module.md`, so the shared table is gone. |
| `packages/play/registry.ts`, `src/games/registry.ts`, `e2e/levels.ts`, `e2e/support/walks.ts`, the `RULES` table of `e2e/walks.spec.ts`, `e2e/keep-list.spec.ts`, the game lists in `e2e/a11y.spec.ts`, `e2e/network.spec.ts`, `tests/copy/no-kitchen.test.ts`, `src/pages/About.tsx` | every game | One game registers per lane, in the single task that owns the game's views. In wave 1 the walk files are edited in the order T05, T14, T15, W2-T14. Two lanes' registration commits merge one after the other through the serial gate, the second after a rebase. |
| `src/content/render/model.ts` (`PENDING`, `GAME_TASKS`, `LAB_TASKS`) and `tests/content/pending.test.ts` | W2-T42, every game, every lab | W2-T42 first. A game task and a lab task each remove their own row and nothing else. |
| `e2e/routes.ts` | every game, lab and lesson | A task appends its own rows. Conflicts are resolved by a rebase, never by reordering another task's rows. |
| `.github/workflows/labs.yml` and `tests/ci/workflows.test.ts` | W2-T13, T48, T49, W2-T16, later labs | Lane G's order. |
| `packages/play/items/registry.ts`, `catalog.ts`, `src/items/families.ts`, `tests/fixtures/items/vectors.json` | every item-family task | One items task per module. `vectors.json` is regenerated after a rebase (`bun scripts/verify-items.ts --write`), never merged by hand. |
| `packages/play/predictions/plan.ts`, `truth.ts` | every lesson task | Each module has its own `commit-<id>.ts` and `<id>.ts`; `plan.ts` and `truth.ts` take one block per module. |
| `public/md/`, `public/llms.txt` | every content task | Generated and committed. After a rebase, run `bun scripts/content/build.ts` and commit the result; never resolve a conflict in them by hand. `public/claims.json` is written by the build and ignored by git: never add it. |
| `public/labs/*`, `src/receipts/graders.ts`, `labs/references/manifest.json`, `src/receipts/declared.ts`, `packages/verify/stages.ts` `PENDING`, `tests/verify/bestiary.ts`, `labs/envs/*` | every grader, kit or lab task | Lane G's serial queue, above. |
| `scripts/content/build.ts`, `packages/schema/content.ts` | compiler tasks | One serial sub-lane in wave 1a (T16, T41, T19, T20, W2-T42, T22). No module task changes the compiler. |
| `src/games/kit/*` | T10, T42 | Serial: T10, then T42. |
| `course.lock.json`, `docs/TRACKER.md` | sources tasks; markers | One sources task per module adds that module's pins. W2b-T01 sets the stale markers once; after it the orchestrator sets a marker at merge, and tasks do not. |
| Front-page first paint; `/play/broken-bench`; `receipt.worker`; `three-vendor` | anything shared | The "rows reported" rule; W2b-T16 and W2b-T40 make room first; wave 2 makes the worker load a lab's re-checks on demand before the labs add them. |

**Which modules can run in parallel.** TR3 and TR5b share no sim, no game, no claim file and no KC edge, and run side by side in wave 2. TR7 has no game and no sim and needs only built KCs, so its sources and targets run as a light third lane in wave 2 and its lessons beside TR4 in wave 3. TR0 precedes TR3, and TR3 precedes TR4, because of the KC edges (`tr3.gap-cause` requires `tr0.hidden-syncs`; `tr4.sweep-method` requires `tr3.step-floor`) and because the cold-reader check reads modules in course order. Within a module the lane is serial except where the task list says otherwise. Lanes meet only at the collision points above and at lane G.

**The two checks that end a module.** A technical check and a cold-reader check, both by opus, each by an agent with a fresh context that did not write the module and does not see the other's report. Each writes a report and changes nothing else. A sonnet task then fixes the technical rows, and an opus task rewrites the passages where the reader was lost and re-reads what the sonnet task changed. The next module's lessons do not start until both fix tasks have merged.

**A lesson task writes at most two lessons.** The first lesson of a module and its conceptually hardest lesson go to opus (TR0 lesson 4, TR3 lesson 4, TR5b lesson 2).

**A game task** adds the game's named moment to `e2e/keep-list.spec.ts`, shows that the scripted first run reaches it before the run ends, and starts its Prove level (`docs/ASSESSMENT.md` 7.2) in Prove mode.

---

## 4. Wave 1 in full

### 4.1 Lanes and order

**Wave 1a**
- **Gate (serial, first):** T01, T02, then T43 beside T03. Other tasks may be built meanwhile; none merges before T02.
- **A1, Request path:** T04, T05, T06 (the same files).
- **A2, Step loop:** T07.
- **A3, game routes and the frame (serial):** T40, then T09, T10. T08 is held in reserve and runs only if T40 frees too little.
- **A4, red specs:** T11, T12, T13, then T14, T15. T05, T14 and T15 each edit `e2e/support/walks.ts` or `e2e/walks.spec.ts`; they merge in that order.
- **B, compiler (serial):** T16, T41, T19, T20, W2-T42, T22.
- **B, tests and readers (parallel):** T17, T18, W2-T44, T21. T45, a cleanup in the Step loop's folder, follows T07.
- **Exit:** T44, then the pull request.

**Wave 1b** starts when T44 has merged. It takes the owner's answers to N4, N5 and N8 if they have come, and the stated defaults if they have not.
- **G, the serial merge queue:** T23 and T24, T25, T27 (lane T's sources task, which changes the references manifest), W2-T13, T47, T30, T48, T49, W2-T16, T31, T50, T37.
- **K, the frame:** T42 (after T10).
- **T, TR0 (serial unless said):** T26, T27, then {T28, W2-T14} beside {T29}; then T32, T51, T52, W2-T18, T33; then T34 beside T35; then T36, T53. W2-T15 follows W2-T14 and is off the module's path. T46 stands alone and must merge before T34.
- **Exit:** T39.

TR0's first lesson (T32) cannot merge before T16, T41, T17, T18, T19, T20 and W2-T42 (all in 1a) and W2-T14 and T29.

### 4.2 Wave 1a: the gate

**W2b-T01 · Record wave 1 in the tracker, and set the stale markers to the tree** · sonnet · S · deps: none
- Files: `docs/TRACKER.md` (a W2b section with a heading for each wave-1 task, W2b-T01 to T37 and T39 to T53, and no heading for a later wave; the markers of W2-T01 to T11, T13, T19, T28 and T43; W2-T18's dep on W2-T15 removed, with the reason; W2-T16's first check reworded from "the nightly `labs.yml` job" to "the `labs.yml` CPU job on the wave's pull request, and the weights job on a dispatch", with the reason that `labs.yml` has no schedule and the nightly is off (D-052); line 1154's "three questions" corrected to four; the summary table), `AGENTS.md` (the "never lowered", "no quiet skip", "paths stay private" and `RUSTUP_AUTO_INSTALL=0` rules, and "an agent installs no wheel and downloads no model without the owner's leave", word for word as the tracker has them), `tests/ci/task-ids.test.ts` (a test that no `[x]` task of W2 has a check that names the owner, a GPU or W2-T12).
- The marker rule: a task gets `[x]` only if every check is met by files in the tree and none is the owner's or needs a GPU. Otherwise it gets `[~]` and a first body line "State (2026-11-19): built; open check: <what>, closes with <task id>". Known to need the second form: W2-T02 (`selftest --gpu`, W2b-T37), W2-T04 (the Dockerfile builds, W2-T12), W2-T07 (W2b-T23), W2-T08 (W2b-T24; real fixtures, W2-T12), W2-T11 (W2-T12), W2-T13 (its own open check), W2-T19 (the nsys table names, W2-T21). W2-T43 is `[x]` (closed by R-T09).
- Accept: `tests/docs/repo-docs.test.ts`, `tests/content/pending.test.ts`, `tests/play/roster.test.ts`, `tests/content/roster.test.ts`, `tests/kc/verify-kc.test.ts` and `tests/ci/task-ids.test.ts` pass; `npm run verify:kc` passes; every task named in `GAME_TASKS`, `LAB_TASKS` and `PENDING` of `src/content/render/model.ts` is still open in the tracker.
- Browser tests: none beyond G0.

**W2b-T02 · The merge gate runs the features specs and the nightly-width walks of what a branch touches** · sonnet · M · deps: T01
- Files: `scripts/gate/touched.ts` (changed paths in; the specs, walk filters and steps out), `scripts/gate/known-red.json` (two lists: `red`, the base's failing set by file and title, which is eight `features` tests, five walks and two 320 px page checks; `flaky`, the two tests that fail some runs on the base, which are "Tab and Enter alone win Fill the batch" in `e2e/keyboard-loop.spec.ts` and the pool's `same-size` walk at 360 px), `tests/ci/gate-touched.test.ts`. Outside the repository, the orchestrator's merge script for the wave, copied from `esp-merge.sh`, calls `touched.ts`.
- The mapping: `src/games/<g>/` or `packages/play/<g>/` gives `e2e/<g>*.spec.ts`, `lesson-games.spec.ts`, `lesson-games-scene.spec.ts`, `lesson-predict.spec.ts`, `keep-list.spec.ts` and the nightly-width walks of `<g>`. `src/games/kit/`, `src/design/`, `src/pages/Game.tsx` or `src/games/registry.ts` gives one level of every game (`SMOKE_LEVELS` of `e2e/levels.ts`) at 360 and 1280 px, `design-parts.spec.ts` and `screens.spec.ts`; the task that made the change runs every level of every game itself and pastes the result. `content/`, `src/content/` or `scripts/content/` gives `lesson-games`, `lesson-predict`, `items`, `map`, `titles` and `today`. `src/receipts/`, `packages/verify/` or `src/workers/` gives `receipts` and `receipts-import`. `src/forge/` or `labs/forge/` gives `forge`, `forge-hybrid-kv`, `rejection-sampler` and `lab-kits`. `src/trace/` or `packages/sim/trace/` gives `trace-view`. `src/front/` gives `front`.
- How it runs: with `--retries=0`. A test in `flaky` is re-run once, and only those. The gate passes on "no test fails here that is not in `red`". An entry leaves `red` or `flaky` only after five passes of five with `--retries=0` on four pinned cores, in the branch that fixes it. The gate keeps the `features` project's own browser flags; it does not edit `playwright.config.ts`.
- Accept: the mapping has a unit test per row; a scratch branch with one broken walker is refused, and the refusal, filtered to repository-relative paths, is in the pull request; the gate's added wall time is measured on four pinned cores for three branches (content only, one game, a kit change) and reported against budgets of 10, 15 and 25 minutes [estimated]; where a case passes its budget the task reports the slowest specs and stops there, and the orchestrator decides (the choices are the specs' own shards outside the lock, or CPU compositing for `features`, which is a change to `playwright.config.ts` and the owner's call).
- Browser tests: the dry run of the gate on the wave tip.

**W2b-T43 · The merge gate runs the lab checks a branch touches** · sonnet · S · deps: T02
- Files: `scripts/gate/touched.ts`, `tests/ci/gate-touched.test.ts`.
- The mapping: `labs/grader/`, `labs/gpu/`, `labs/envs/`, `labs/references/`, `course.lock.json`, `packages/schema/`, `schemas/`, `src/receipts/`, `packages/verify/`, `tests/verify/`, `tests/fixtures/grader/`, `tests/fixtures/references/` or `tests/fixtures/receipts/` gives `uv lock --check --project labs/grader`, `uv run --project labs/grader python -m unittest`, `uv run --project labs/grader enginespace selftest --no-suite`, `bun scripts/pack-kit.ts --check`, `bun run verify:schema`, `bun run verify:vectors` and `bun test tests/verify/bestiary.test.ts tests/verify/fixtures.test.ts`. `labs/forge/`, `src/forge/`, `packages/sim/forge/` or `tests/fixtures/forge/` gives `cargo test --manifest-path labs/forge/Cargo.toml --workspace --features reference` and `bun run verify:labs`, with `RUSTUP_AUTO_INSTALL=0`. `bash labs/envs/relock.sh --check` needs the network: the gate prints that it did not run it, and `labs.yml` on the wave's draft pull request is its evidence.
- Accept: the steps run on this machine with `UV_OFFLINE=1`, `UV_PYTHON_DOWNLOADS=never` and `UV_PYTHON` set to an installed 3.13; if the grader's environment cannot be made without the network, the task stops and reports, and maps nothing to a step that does not run; a scratch branch that breaks one grader test is refused.
- Browser tests: none.

**W2b-T03 · The merge gate refuses a lowered bar, an unlisted baseline, a new skip and a leaked path** · sonnet · M · deps: T02
- Files: `scripts/gate/bars.ts`, `scripts/gate/paths.ts`, `tests/ci/gate-bars.test.ts`, `tests/ci/gate-paths.test.ts`.
- `bars.ts` diffs base to head over `tests/`, `e2e/`, `labs/grader/tests/`, `playwright.config.ts`, `scripts/verify-*.ts`, `scripts/content/`, `scripts/games/`, `scripts/gate/known-red.json`, `tests/seeds.ts` and `packages/sim/tensor/plan.ts`. It lists every changed number inside an `expect`, every changed `timeout`, `retries` or `toBeCloseTo` digit count, every removed `expect`, every changed named bound (`PACING`, `OPENER_WORDS`, the blind-probe bound and `MIN_BLIND_SAMPLE`, `PR_SEEDS`, `NIGHTLY_SEEDS`, `MAX_SEEDS`, `MAX_PLAN_NUMEL`, the compiler's page and index sizes), every added entry of `known-red.json`, every added `skip`, `fixme`, `todo`, `skipIf`, `skipUnless` or `importorskip` in an existing or a new file, and every changed or added PNG under `e2e/**/*-snapshots/`. The merge script refuses the branch unless the orchestrator passed that line in the task's allow-list. A PNG is allowed only when the allow-list names it, the pull request shows the diff image, and the orchestrator has recorded that the owner looked.
- `paths.ts` refuses a branch whose added lines, or whose pull request text, hold `/home/`, `/tmp/` or the login name. The name is read from the environment when the gate runs and is written nowhere in the repository.
- Accept: fixture diffs reproduce wave R's three cases (`> 40` to `> 20`, six digits to one, a dropped assertion) as refusals; an allowed count edit passes; a re-blessed PNG, a new `unittest.skipUnless`, a raised `PACING.between` and an added known-red entry are each refused; a line with a home path is refused; `BUDGETS` edits stay refused by the existing guard.
- Browser tests: none.

### 4.3 Wave 1a, lane A: defects a learner meets today

**W2b-T04 · Request path: a pointer lay does not move the page (A1)** · haiku · S · deps: T02
- Files: `src/games/engine-floor/useFloorControls.ts`, `src/games/engine-floor/Controls.tsx`, `e2e/engine-floor.spec.ts` (a test of twenty mouse lays at 1440 x 900 and 1280 x 800), `docs/waves/WR-report.md` 7.1 and 7.10 (the record of the fourth check, with no scratchpad path in it).
- The fix is written: a patch (kept with the build, not in the repository) (two files, 10 insertions, 7 deletions). The orchestrator copies it into the task's worktree as an untracked file; the task applies it and does not cite where it came from.
- Accept: the page moves 0 px in 20 of 20 mouse lays; twenty keyboard walks have no covered stop; the `/play/engine-floor` row is reported (the check measured 194,740 B with the patch).
- Browser tests: features `e2e/engine-floor.spec.ts`, `e2e/engine-floor-map.spec.ts`; nightly width `(engine-floor)`.

**W2b-T05 · Request path: after the first run's commit, focus is on the stage the intro points at (A2)** · sonnet · S · deps: T04
- Files: `e2e/support/walks.ts` (`commitBoundaries` ends with `walk.see()`; commit this first and show it failing), then `src/games/engine-floor/useFloorControls.ts`, `Controls.tsx`.
- Accept: 2.5 s after the commit, on `nano`, `mini`, `vllm` and `map` at 1280 x 800, 1440 x 900 and 390 x 844, the focused stage is inside the list's box and uncovered; Enter lays the ringed stage.
- Browser tests: features `e2e/engine-floor.spec.ts`; smoke `first-visit`; nightly width `(engine-floor)`, all eight levels.

**W2b-T06 · Request path: a click in the filter field does not move the page on a short desk (A3)** · sonnet · M · deps: T05
- Files: `src/games/engine-floor/floor.css`, a new test in `e2e/engine-floor.spec.ts`. The task probes first and writes the cause in the pull request before it changes anything.
- Accept: at 1280 x 620 and 1366 x 768 the filter stops move the page 0 px on `mini` and `map`; a typed letter and a Backspace at the page's foot leave the scroll position as it was; the four sizes that move 0 px today still do.
- Browser tests: features `e2e/engine-floor.spec.ts`; nightly width `(engine-floor)`.

**W2b-T07 · Step loop: after the last step, focus is on the result (A4)** · sonnet · M · deps: T02
- Files: the result's focus effect under `src/games/loop/`; `e2e/keyboard-loop.spec.ts` only if the test reads focus before the move, and then with no retry added.
- Accept: the pull request says whether the product or the test was at fault, with the evidence; "Tab and Enter alone win Fill the batch" passes 40 of 40 runs with `--retries=0` on four pinned cores and leaves `flaky`; the front-page row is reported and grows by at most 100 B. If the fix needs more, the task stops, waits for T16's merge and rebases.
- Browser tests: smoke `keyboard-loop`; features `e2e/loop.spec.ts`, `e2e/loop-full.spec.ts`; nightly width `(loop)`.

**W2b-T40 · `/play/:game` loads one game's record, so a new game costs the other game routes nothing** · opus · M · deps: T02
- Files: `src/games/registry.ts` (it resolves an id through a loader of that game's record and no longer imports the value `GAMES`), `src/pages/Game.tsx`, `src/routes.tsx` if the route's loader awaits the record, the lesson's game embed if it resolves through the same call, `scripts/verify-games.ts` (the record loaders, the components and `packages/play/registry.ts` list the same ids), `tests/play/registry.test.ts`, `tests/build.test.ts` (a test over the build's manifest that the Game page's static closure holds no game's `entry.ts`). `packages/play/index.ts` and `packages/play/keys.ts` do not grow.
- First commit: the chunk list of the `/play/broken-bench` row as built, with what in it reads `GAMES`.
- Accept: rows before and after for the front page, `/play`, each `/play/<id>`, `/m/:module/:lesson` and `/evidence`; the front page's row does not grow; `/play/broken-bench` gains at least 1,500 B of room [estimated from critic 2's 481 to 654 B an entry, four entries, less the loader]; under 1,000 B the task reports what else the route carries, and T08 runs; the tab's title is set as the page mounts, as today (`e2e/titles.spec.ts` unchanged); an unknown id still gives "Game not found"; the Games index, the Progress page's re-grading and `scripts/pages/plan.ts` still read `GAMES`.
- Browser tests: smoke `walks`, `first-visit`, `network`; features `e2e/titles.spec.ts`, `e2e/route-change.spec.ts`, `e2e/stale-chunk.spec.ts`, `e2e/lesson-games.spec.ts` and each game's own spec (`broken-bench`, `engine-floor`, `loop`, `pool`, `verifier`); nightly width for every level of all five games, run by the task and pasted.

**W2b-T08 (reserve) · Make room on the game routes: `src/design/parts.css` by component** · sonnet · M · deps: T40
- It runs only if T40 leaves under 1,000 B of room on `/play/broken-bench`, or if T09 or T10 stops for want of room. The orchestrator records the choice.
- Files: `src/design/parts.css` split into one sheet per component, each imported by the component that uses it; no rule changes.
- Accept: `verify:bundle` rows before and after for the front page and every `/play/*` route; no screenshot baseline changes and none is re-blessed; `verify:tokens` passes.
- Browser tests: smoke `screens`, `screenshots`; features `e2e/design-parts.spec.ts`; nightly width for all five games.

**W2b-T09 · Broken benchmark: no field and no heading under the pinned readout (A5, and A6's wrap)** · sonnet · M · deps: T40
- Files: the form and its CSS under `src/games/broken-bench/`, `packages/play/broken-bench/copy.ts` (the meaning line that takes three lines), `e2e/broken-bench.spec.ts` (a geometry test on the pattern of its "the first screen" test).
- Accept: the `court` walk at 1280 px passes five of five and leaves `red`; at 1440 x 800, 1366 x 768 and 1280 x 800, with a flaw chosen, the number fields and File the report are whole and uncovered; the fix is a `scroll-margin` on the fields, not a page `scroll-padding`; every meaning line takes two lines at 390; `/play/broken-bench` stays under 200 KB and its row is reported. The form's position at 390 stays as built (the owner's default, `map/followups.md` D4).
- Browser tests: features `e2e/broken-bench.spec.ts`; nightly width `(broken-bench)`.

**W2b-T10 · Phone, first run: the dock's controls do not show before the intro (A7)** · sonnet · M · deps: T09
- Files: `src/games/kit/Frame.tsx`, `src/games/kit/Intro.tsx`, a test in `e2e/first-visit.spec.ts` or `e2e/walks.spec.ts` that records which dock controls were ever visible before the coach strip.
- Accept: at 390 x 844, on the first run of each of the five games, no decision control is visible before the coach strip; rows reported for the front page and all five game routes. Two rooms bound the fix: the front page's first paint may grow by at most 100 B, and every `/play/<id>` row stays under 200 KB. If the fix does not fit either room, the task stops with its measurements; T08 runs, or the item goes to the owner's list.
- Browser tests: smoke `first-visit`, `walks`; nightly width for every level of all five games, run by the task and pasted.

**W2b-T11 · 320 px: `/changes` fits its width, and TR2 lesson 2 passes axe (A8)** · sonnet · S · deps: T02
- Files: `src/pages/Changes.tsx` and its styles; the block that axe names on `/m/tr2/l2-one-token-budget` (no prose edit unless the violation is in the prose, and then the edit is listed).
- Accept: both nightly checks pass at 320 px and leave `red`. It stays on sonnet because the cause of the axe violation is not known.
- Browser tests: `ES_E2E_NIGHTLY=1` smoke `a11y` at 320 px for the two routes.

**W2b-T12 · The lab-kits spec knows the three kinds of kit** · haiku · S · deps: T02
- Files: `e2e/lab-kits.spec.ts`; the page rows that link the GPU kit and the grader wheel if they are missing.
- Accept: the three tests at lines 81 and 87 pass and leave `red`; the forge-only assertion is split by kind, and no assertion is deleted.
- Browser tests: features `e2e/lab-kits.spec.ts`.

**W2b-T13 · Name and fix the three failing design-parts tests and the settings tier test** · sonnet · M · deps: T02
- Files: `e2e/design-parts.spec.ts`, `e2e/settings.spec.ts`, or the pages they test.
- Accept: a JSON-reporter run names each failing test and its first error, in the pull request before any change; each is fixed in the product where the product is wrong, and in the spec only where the spec asserts something the redesign removed, with the REDESIGN section cited; no skip is added; all four leave `red`. If the settings test can pass only on a machine with a GPU, the task stops and the test stays in `red` with that reason for the owner (question N6).
- Browser tests: features `e2e/design-parts.spec.ts`, `e2e/settings.spec.ts`.

**W2b-T14 · Rejection sampler: the wrong-module spec, and the `greedy-ngram` and `mutants` walks** · sonnet · M · deps: T05
- Files: `e2e/rejection-sampler.spec.ts`, the verifier's walkers in `e2e/support/walks.ts`, the announcements under `src/games/verifier/` if the product is at fault, `tests/fixtures/forge` if a fixture is stale.
- Accept: the four walks pass at 360 and 1280 px, five runs of five with `--retries=0`; the spec's "a wrong module" tests pass; all leave `red`.
- Browser tests: features `e2e/rejection-sampler.spec.ts`, `e2e/verifier.spec.ts`; nightly width `(verifier)`.

**W2b-T15 · Two timing faults in tests: the pool's `same-size` walk at 360 px, and the graded `due` seed** · sonnet · S · deps: T14
- Files: the pool's walker in `e2e/support/walks.ts`; `e2e/lesson-games.spec.ts` near line 165 (wait for the lesson to set the seed before reading it).
- Accept: `same-size` at 360 px passes eight of eight with `--retries=0` on four pinned cores by a shorter walk, not a longer timeout, and leaves `flaky`; if only a longer timeout would do it, the task stops and the question goes to the owner's list; the `due` test passes 20 of 20.
- Browser tests: features `e2e/lesson-games.spec.ts`; nightly width `(pool)`.

**W2b-T45 · Remove the dead step control** · haiku · S · deps: T07 (the same folder)
- Files: `src/games/loop/ControlPieces.tsx` (`LoopStepControl`, mounted nowhere, and its `bell` ref), the dead `.es-frame-labels` rule if a grep still finds it.
- Accept: lint and typecheck pass; the front-page row and the `/play/loop` row are reported and neither grows.
- Browser tests: smoke `walks`; features `e2e/loop.spec.ts`.

### 4.4 Wave 1a, lane B: tooling the new modules need

**W2b-T16 · Front page: lesson rows leave the first paint** · sonnet · L · deps: T02
- Files: the index's schema in `packages/schema/compiled.ts` (the index keeps its module rows and gains, per module, whether it is published, and at the top the course's first lesson), `scripts/content/build.ts` (lesson rows go to a second generated file that pages load on demand), `src/content/load-lessons.ts` (its loader; `src/content/load.ts` gains nothing), `src/front/menu.ts`, `src/front/FrontPage.tsx`, `scripts/pages/front-shell.ts`, `src/pages/{Lesson,Module,Evidence,Map}.tsx`, their tests. `scripts/verify-bundle.ts` is not edited: the front-page row still counts `src/content/generated/index.json`, which is still exactly what the front page awaits.
- Accept: the front-page row before and after; a test compiles a fixture course of 60 lessons and one of 6 and holds `index.json` to the same bytes apart from the first lesson's row; the front page's path table in the static HTML is unchanged; the room gained is reported against the estimate of about 1.3 KB [derived: 27 lessons times about 49 B]. If the gain is under 1 KB the task says where the rest of the index's bytes are.
- Browser tests: features `e2e/front.spec.ts`, `e2e/map.spec.ts`, `e2e/titles.spec.ts`, `e2e/today.spec.ts`; smoke `first-visit`, `screenshots` (no baseline changes).

**W2b-T41 · The course's start is a key of `content/course.yaml`** · sonnet · S · deps: T16
- Takes question N8's default: TR0 is an advised primer, and the course still starts at TR1 lesson 1 (`curriculum/TR0` section 2: "Nothing locks: TR1 can come first").
- Files: `content/course.yaml` (`start: tr1`), `packages/schema/content.ts`, `scripts/content/build.ts` (the index's first lesson is the start module's first lesson), `src/front/menu.ts` (`firstLesson` reads it), `src/progress/next.ts` (rule 1 starts at the start module; a lesson of a module that stands before the start in course order is never counted as an "earlier lesson not finished"; rule 5 offers such a lesson only when no later lesson is left), new cases in `tests/front/way.test.ts` and `tests/progress/next.test.ts`.
- Accept: with a fixture course in which `tr0` has lessons, the Start control, the header's Continue with no events and the demo's closing line all name TR1 lesson 1; a ledger with TR1 lessons 1 to 3 done shows no earlier lesson unfinished; no existing expectation is edited; the front-page row is reported and grows by at most 40 B [estimated].
- Browser tests: smoke `first-visit`; features `e2e/front.spec.ts`, `e2e/today.spec.ts`, `e2e/map.spec.ts`.

**W2b-T17 · Counts are derived, and each coming module has its row** · sonnet · M · deps: T02
- Files: a new `tests/content/module-counts.ts` (per module: lessons, predictions after-game and at-commit, game blocks; rows for tr0, tr3, tr4, tr5b, tr7 at zero), and the literals it replaces in `tests/content/openers.test.ts`, `tests/content/map.test.ts`, `tests/content/sections.test.ts`, `tests/play/predictions.test.ts`, `e2e/lesson-games.spec.ts`; the same treatment for the module list in `tests/kc/graph.test.ts` and the has-3D list in `tests/ci/e2e-coverage.test.ts`.
- Accept: every total is still asserted exactly, as the sum of the rows; the sums equal today's 27, 39 (18 and 21) and 42; these edits are the task's named allow-list for T03.
- Browser tests: features `e2e/lesson-games.spec.ts`.

**W2b-T18 · The module test kit, with the rule that every model table's header row is held** · sonnet · M · deps: T02
- Files: `tests/content/module-kit.ts` (the checks a module test runs, taken from `tests/content/tr8-module.test.ts` and `tr6-module.test.ts`: compiles with zero diagnostics and no pacing allowance, every lesson has a Test of three questions with at least one numeric, minutes, KCs taught, titles follow the brief, game and item blocks name built levels and families, claims rules, module equals `course.yaml`, the part that needs a laptop or a GPU announced), `tests/content/module-kit.test.ts`, and one call added to each of the five built module tests.
- The rule: the kit finds every Markdown table in a module's lessons and cards whose header or caption carries `[synthetic]`, and fails unless the module's demos file holds that header row word for word, tags included, and recomputes its rows.
- Accept: a fixture lesson with an unheld model table fails the kit's own test; for each built module the pull request lists the model tables found and shows each one held; where a built module has an unheld table, the hold is added as a test and no lesson is edited. The pacing allowance stays in the TR1, TR2 and TR5a tests (removing it needs lesson edits; it is listed for wave 4).
- Browser tests: none.

**W2b-T19 · A module's outcomes live in its `module.md`** · sonnet · M · deps: T41
- Files: `packages/schema/content.ts`, `scripts/content/build.ts`, `src/map/outcomes.ts` (removed or generated), `tests/map/outcomes.test.ts`, the front matter of the five `content/modules/*/module.md`, `content/course.yaml` (one outcome sentence for each planned module). The compiler writes outcomes into the course map or the module's JSON, never into `index.json`.
- Accept: `/map` shows the same outcome ticks for a fixture ledger before and after; TR2's fourth outcome keeps no KC and the pull request says so; the front-page row and the index's size are reported before and after and neither grows; the `/m/:module` row is reported.
- Browser tests: features `e2e/map.spec.ts`; smoke `walks` (the module-page tests).

**W2b-T20 · Lesson template: the Test's pass rule stands with its questions, and an item block may name a `variant`** · sonnet · M · deps: T19
- Takes N5's default: the pass rule is the one the page enforces today (every question right on new numbers); nothing in the rule changes. Takes O-20's default: TR5a lesson 1 stays as built.
- Files: `packages/schema/content.ts`, `scripts/content/directives.ts`, `src/content/render/` (the Test section), the item block's draw in `src/items/`, `packages/play/items/types.ts` (`LEVEL_NAMES`: "faded" and "new surface" are jargon; the task proposes plain words, lists every screen that shows them, and holds them in a test), tests. No built lesson changes.
- Accept: a fixture lesson's pass rule renders after its last prose and beside its question set; a block with `variant` draws only that variant and one without draws as before; the golden vectors do not move; the lesson route row is reported.
- Browser tests: features `e2e/items.spec.ts`, `e2e/lesson-games.spec.ts`, `e2e/tr5a-items.spec.ts`, `e2e/today.spec.ts`.

**W2-T42 · Lesson blocks: the trace block, "In vLLM today" and the Build row** · sonnet · M · deps: T20
- Files: as the tracker lists (`src/content/render/model.ts` `PENDING`, `src/content/render/Blocks.tsx`, `scripts/content/cards.ts`, `content/cards/`). The trace block loads the viewer on demand; if that needs a new pattern in `tests/build.test.ts`'s on-demand list, the pattern is named in the pull request.
- Accept: the tracker's three checks; `tests/content/pending.test.ts` passes with `PENDING` reduced to `change`; the lesson route row and the front-page row are reported and the front page's does not move.
- Browser tests: features `e2e/lesson-games.spec.ts`, `e2e/trace-view.spec.ts`, `e2e/show-on-machine.spec.ts`; smoke `a11y`.

**W2b-T22 · The compiler survives a file that vanishes between its walk and its read** · sonnet · M · deps: W2-T42
- Files: `scripts/content/build.ts`, `scripts/content/vite-plugin.ts`, `tests/content/plugin.test.ts`.
- Accept: a test removes a lesson file between the walk and the read; the compiler retries once, then prints a diagnostic and the dev server keeps running; the plugin's test counts every timer; the options' comment says the plugin object is not to be shared between servers.
- Browser tests: none.

**W2-T44 · Readers of the prediction event: Review's rescheduling, and calibration on Progress** · sonnet · S · deps: T02
- Takes D-067 as proposed.
- Files: `src/items/today/kcs.ts`, `src/evidence/`, `src/pages/Evidence.tsx`.
- Accept: the tracker's two checks: a prediction reschedules an idea already earned and never earns one; the calibration rows read in words before counts, cover both reveal kinds, and are derived on read and stored nowhere.
- Browser tests: features `e2e/today.spec.ts`, `e2e/lesson-predict.spec.ts`; smoke `a11y` on `/evidence`.

**W2b-T21 · A unit run leaves no temporary project behind** · haiku · S · deps: T02
- Files: `tests/content/support.ts`, `bunfig.toml` (a preload that cleans once per process, if the `afterAll` proves not to run for every file), a new `tests/ci/temp-clean.test.ts`.
- Accept: after a full four-shard run the temporary folder holds no `enginespace-*` directory made by the run.
- Browser tests: none.

### 4.5 Wave 1a exit

**W2b-T44 · Wave 1a exit check** · opus · S · deps: all of wave 1a
- Files: a report under `docs/waves/` (repository-relative paths only); the pull request from `wave-2m1a` into `wave-r2`, marked ready and not merged.
- Accept: G0 on the tip; `known-red.json` holds only what the report lists, with a reason each; the bundle table, with the front-page and `/play/broken-bench` rows and the room each now has; a spot check of five tasks' evidence against their Accept lines; `ES_PROPERTY_SEEDS=10000 ES_HEAVY=1 bun test --parallel=2 --timeout 900000` and `bun test tests/forge/rejection-sampler-rates.test.ts` once on the tip; the list of what the owner must answer before 1b (N4, N5, N8) and the default 1b takes for each.
- Browser tests: `ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features` once on the tip, on four pinned cores. Firefox and WebKit are recorded as not run on this machine; the owner may dispatch `nightly.yml`.

**After 1a a learner** no longer meets the eight class-A defects, and sees nothing else new. The site is deployable: nothing in 1a adds a page.

### 4.6 Wave 1b, lane G: the receipts path, the lab page and TR0's lab

Merge order: T23 and T24 (in either order), T25, T27 (section 4.7), W2-T13, T47, T30, T48, T49, W2-T16, T31, T50, T37. T49 is left out of the queue if question N4 keeps it from starting.

**W2b-T23 · W2-T07's open check: a receipt event holds the receipt and the report, never the verdict** · sonnet · M · deps: T43
- Files: `src/receipts/keep.ts`, `src/receipts/records.ts`, the ledger's event schema and its version, a migration, `tests/receipts/`.
- Accept: the verdict is computed on read; a ledger written in the old shape still reads; a receipt imported before a bank exists is credited after the bank is added, with no second import (a test with a synthetic bank that lives in the test); `/receipts` and `receipt.worker` rows reported.
- Browser tests: features `e2e/receipts.spec.ts`, `e2e/receipts-import.spec.ts`, `e2e/ledger-conformance.spec.ts`.

**W2b-T24 · W2-T08's open check, and rule 7 reads `relabelled`** · sonnet · M · deps: T43
- Files: `packages/verify/checks.ts` (a claim under a key that names no artifact is shown as a claim with nothing behind it, or fails), `packages/verify/rechecks.ts` (the three re-checks read `relabelled`), `tests/verify/bestiary.ts` (a bare claim; a relabelled outputs, counts and argmax artifact).
- Accept: each new forgery fails; the three honest synthetic bundles still pass; the `receipt.worker` row is reported against its 4,161 B of room.
- Browser tests: features `e2e/receipts-import.spec.ts`.

**W2b-T25 · `fetch` does not print a symlinked home** · haiku · S · deps: T43
- Files: `labs/grader/src/enginespace_grader/fetch.py` (`shown` also compares with `Path.home().resolve()`), `labs/grader/tests/test_fetch.py`, then the repack (`bun scripts/pack-kit.ts`, `public/labs/*`, `src/receipts/graders.ts`).
- Accept: the grader's unittest, `uv lock --check`, `pack-kit --check`, `labs/grader/tests/test_published.py`.
- Browser tests: features `e2e/lab-kits.spec.ts`.

**W2-T13 (its open check) · The torch vectors come from the `cpu` environment's own build** · haiku · S · deps: T43
- Files: `scripts/tensor-torch-vectors.py` (its header no longer says "run by hand"), `.github/workflows/labs.yml` (the path list gains `tests/fixtures/tensor/**` and `scripts/tensor-torch-vectors.py`; a job `cpu` that syncs `labs/envs/cpu` from its lock, regenerates the vectors and fails on a difference; the job runs only when the detect job finds a change under `labs/envs/cpu/`, `tests/fixtures/tensor/`, the script, or the TR0 lab's files), `tests/ci/workflows.test.ts`, `tests/fixtures/tensor/torch-vectors.json` only if the CI run shows a difference, and then with the differing cases reported.
- Accept: `tests/sim/tensor-torch.test.ts` passes; the task is "built, awaiting the labs run"; the orchestrator confirms the `cpu` job on the draft pull request. With N4 answered yes the task also runs the script here in the `cpu` environment and pastes the result.
- Browser tests: none.

**W2b-T47 · A grader lab's stage names the KCs it earns** · sonnet · M · deps: T43
- Files: `packages/verify/stage-kcs.ts` (a table from stage id to KC ids, empty of real rows at first), `scripts/verify-kc.ts` (a declared stage's checks are a graded reference, named `receipt:<stage>`; a row for a stage that `src/receipts/labs.ts` does not list fails), `src/progress/kcmap.ts` and the place that builds `KcSources` (a `receipt:<stage>` ref earns the stage's KCs first, then the lab's), `tests/kc/verify-kc.test.ts`, `tests/progress/`, the KC paragraph of `content/README.md`.
- Accept: with a fixture table, `verify:kc` accepts a KC whose only reference is a stage; a verified receipt event of that stage earns the KC; a receipt whose `argmax-bank` check fails for want of a bank earns nothing; `verify:kc` on the real tree is unchanged.
- Browser tests: none.

**W2b-T30 · The lab page for the L and F lanes** · opus · M · deps: T12, T23
- Files: a graded-lab page component beside `src/forge/ForgeLabPage.tsx`, `src/pages/Lab.tsx`, `src/unbuilt/copy.ts`, a copy table for the page's states, styles from `src/design` roles only.
- The page is REDESIGN 3.9's numbered procedure for a graded lab: download the kit (file, size, hash), fetch the inputs, issue a challenge, edit the named file, run the grader, import the receipt, then the checks, each with its id, its label in the engine's terms and what it catches, then the Prove step. Each stage carries one state line from a fixed set: "built; the course has not yet run this lab on the pinned weights", "built; the course has not yet run this lab on a real engine", "awaiting the course's reference bank", or verified. A command taken from a pin's documents and never run is marked `[unverified]`.
- Accept: `/labs/tr0.forward` renders from a fixture descriptor in a server-render test; axe at 320, 360 and 1280 px; REDESIGN 5.2's per-screen checks for a lab; the `/labs/:lab` row reported; no number on the page without a tag.
- Browser tests: features `e2e/lab-kits.spec.ts`, `e2e/receipts.spec.ts`; smoke `a11y`, `screens`.

**W2b-T48 · TR0 lab: the grader module, its checks, the reference and the mutant** · sonnet · L · deps: T27, T24, T25, W2-T13
- Files: `labs/grader/src/enginespace_grader/labs/tr0_forward.py` (three stages; the import guard that refuses `transformers.models`; forward hooks that record shape, strides and dtype at five named points into the receipt of stages 2 and 3), `labs/grader/src/enginespace_grader/checks/` (first use: allclose), `packages/schema/bundle.ts` and `schemas/` (the artifact for the five points, through `scripts/export-schemas.ts`), `labs/grader/tests/test_tr0_forward.py` (what needs no torch: the guard's scan, check ids and labels, the receipt's shape, the points artifact from a recorded fixture), `labs/grader/tests/cpu/` (the reference solution, the wrong-epsilon mutant, and tests on a small random-weight model built from the pinned `transformers`; no weights downloaded), `.github/workflows/labs.yml` (the `cpu` job runs these tests), `tests/ci/workflows.test.ts`, `docs/DECISIONS.md` (a dated, proposed record of the 1e-3 bar as `[estimated]`), the repack.
- Accept, with no GPU and no torch here: the grader's unittest in the grader's environment, `uv lock --check`, `pack-kit --check`, `test_published.py`; the kit's member list holds no reference solution; check ids and labels carry no banned word. The tests under `tests/cpu/` fail, and do not skip, when torch is missing and `CI=true`; in the `cpu` job the reference passes stages 1 to 3, the mutant fails stage 2, and the cache length equals the prefix length at every step. The task is "built, awaiting the labs run" until the orchestrator confirms that job; with N4 answered yes the same tests also run here. No task changes the 1e-3 bar: if a run shows a thin margin, that goes to the owner.
- Browser tests: none.

**W2b-T49 · Triton 3.8.0 under the interpreter: which pinned kernels run on a CPU** · sonnet · M · deps: T27, T48
- Needs question N4 to allow the Triton CPU wheel in `labs.yml`. If N4 is refused, or unanswered when T52 is due, the task does not start, T52 writes lesson 4 without the walk-through and says so, and the outcome's removal is recorded as a proposed decision for the owner.
- Files: `labs/envs/cpu/pyproject.toml` (`triton==3.8.0` on Linux), its `uv.lock` and `requirements.txt` (`bash labs/envs/relock.sh`), `docs/DECISIONS.md` (a proposed record for the dependency), `scripts/triton-interp/run.py` (it reads each candidate file of `curriculum/TR0` section 3 at vLLM `4ba787ec` into a temporary folder with a generic User-Agent, runs each kernel under `TRITON_INTERPRET=1` on CPU tensors and prints ran or failed, with the error's class), `scripts/triton-interp/course_kernel.py` (a kernel of the course's own, at most 40 lines, over the grid that the `grid` level's model describes), a step in the `cpu` job, `content/claims/tr0.yaml` (which kernels ran, as the claims schema allows for the course's own run; if it allows no such claim the task stops and reports), the repack.
- Accept: `relock.sh --check` and the `cpu` job are green on the draft pull request; the job's log names each kernel as ran or failed; the course's own kernel runs; no vLLM file is committed. Whether a 3.8.0 wheel installs off Linux stays `[unverified]` and the lesson says so.
- Browser tests: none.

**W2-T16 · Build the Qwen3-0.6B forward pass on CPU (TR0 lab): the kit, the page and the wiring** · sonnet · M · deps: T48, T30, T47, T29, W2-T42
- Files: `labs/gpu/tr0-forward/{LAB.md,lab.toml,starter/}`, `scripts/pack-kit.ts` if the kit needs a `gpu/` member, the lab's page descriptor, `src/receipts/declared.ts` (the three stages, with the model's files by hash and size as T27 recorded them), `packages/verify/stage-kcs.ts` (stage 2 earns `tr0.decoder-forward`, stage 3 `tr0.kv-cache-contract`), `content/kc/graph.yaml` (those two `planned:` lines go), `tests/verify/synthetic.ts` (an honest synthetic bundle, labelled synthetic), `tests/verify/bestiary.ts`, `src/content/render/model.ts`, `src/unbuilt/copy.ts` and `tests/content/pending.test.ts` (the lab leaves the stub tables), `e2e/routes.ts`, `.github/workflows/labs.yml` (a `weights` job on `workflow_dispatch` only: it fetches the pinned weights with `enginespace fetch` into a cache, hashes each file against `labs/references/manifest.json`, runs the reference and the mutant, and prints the worst logit difference of each), `tests/ci/workflows.test.ts`, the repack.
- Accept: the tracker's checks 2 and 3; the honest synthetic bundle verifies in the worker except for `argmax-bank`; `verify:kc` shows the two KCs with a graded reference; the page's state lines are true: stages 1 and 3 "built; the course has not yet run this lab on the pinned weights", stage 2 "awaiting the course's reference bank", and a sentence that the 1e-3 margin is not measured.
- What stays open, truthfully: the tracker's first check closes on the `weights` job's first green run, which is the owner's dispatch. Until then the model files' hashes are `[unverified]`.
- Browser tests: features `e2e/receipts.spec.ts`, `e2e/receipts-import.spec.ts`, `e2e/lab-kits.spec.ts`; smoke `a11y`, `screens` on `/labs/tr0.forward`.

**W2b-T31 · The bank's generator, and the page's state while the bank is awaited** · sonnet · S · deps: W2-T16
- Files: a generator in the lab's grader module with a test under `labs/grader/tests/cpu/`, a runbook for the owner at `docs/owner/W2-T17-bank.md` (the command, `public/references/tr0/`, the manifest entry, the `BANKS` entry), a test in `tests/verify/` with a synthetic bank that lives only in the test, the repack.
- Accept: the generator is deterministic (in the `cpu` job); with the test's bank the honest synthetic receipt passes `argmax-bank` and a receipt with one wrong id fails; `BANKS` in `src/receipts/declared.ts` is still `{}`; nothing is written under `public/references/`.
- The owner's step: W2-T17.
- Browser tests: features `e2e/receipts-import.spec.ts`.

**W2b-T50 · "Defend your receipt", and TR0's questions** · opus · M · deps: W2-T16, T23, T42
- Takes Q-5's default: a module is complete only with a `proved` event.
- Files: `src/receipts/defend/` (the step, its copy and its question registry), `packages/sim/defend/tr0.ts` (seeded questions that only the receipt's five recorded points answer: a point's shape or strides), `src/receipts/ReceiptDetail.tsx` and the lab page (the way in, after a verified import), `tests/receipts/defend.test.ts`, `tests/sim/defend-tr0.test.ts`, a test in `e2e/receipts-import.spec.ts`.
- Accept: `docs/ASSESSMENT.md` 7.1 to 7.3: the learner answers before the browser shows the computation; two bundles with different recorded points give different keys for one seed; a pass on a verified receipt writes a `prove` event with provenance `proved`; a synthetic or unverified receipt shows the flow at practice weight and earns nothing; the attestation and the 24-hour window are T42's; the step is a lazy chunk; `/receipts` and `/labs/:lab` rows reported; the `receipt.worker` row does not move. Stage 3's receipt needs no bank, so a learner can prove the lab before the bank exists.
- Browser tests: features `e2e/receipts.spec.ts`, `e2e/receipts-import.spec.ts`; smoke `a11y`.

**W2b-T37 · `selftest --gpu`, and the intake of the owner's bundles** · sonnet · M · deps: T25 (last in lane G's queue)
- Files: `labs/grader/src/enginespace_grader/selftest.py`, `cli.py`, tests with the fake NVML; `scripts/fixtures-intake.ts` (hashes a bundle, sweeps it for a host name, user name, path or UUID, appends an entry to `tests/fixtures/receipts/manifest.json`) with a test on a throwaway bundle in a temporary folder; a runbook for the owner at `docs/owner/W2-T12-smoke.md` (not in the kit); the repack.
- Accept: with no CUDA, `selftest --gpu` exits non-zero and says why in one line; the intake refuses a bundle that holds a host name; the committed manifest stays `"fixtures": []`.
- Up to the owner's step: the smoke code and the intake. What the learner sees meanwhile: every F-lane lab page says the course has not yet run the lab on a real engine. The owner's step: W1-T02 (the pins) at any time after this merges, and W2-T12 in the GPU session after wave 3.
- Browser tests: none.

### 4.7 Wave 1b, lanes K and T: Prove mode, and TR0 complete

**W2b-T42 · Prove mode for a graded level, in the frame** · opus · M · deps: T10, T40
- Takes Q-5's default (yes).
- Files: `src/games/kit/Frame.tsx` (in Prove mode the readout slot is hidden until the result), a lazy panel under `src/prove/` (the request to close the coding agent, the attestation, the 24-hour window read from the ledger, its copy), `src/games/kit/record.ts` and `useRecorder.ts` (a passed, attested run on fresh seeds writes its `play` event with provenance `proved`), `src/pages/Game.tsx` (`?mode=prove`), `packages/play/types.ts` (an entry may name its Prove level), `packages/play/verifier/entry.ts` (`exact`, the built game with the most route room), `tests/play/prove.test.ts`, a case in `tests/progress/`, a keyboard Prove run in `e2e/verifier.spec.ts`.
- Accept: `docs/ASSESSMENT.md` 7.1 to 7.3: seeds are drawn when the run starts; a failed attempt can be retried at once at practice weight; a credited one opens a 24-hour window (a test with a set clock); `src/progress/derive.ts` reads the run as proved; the panel passes axe at 360 and 1280 px and holds no banned word; rows before and after for the front page (unchanged) and all five game routes, each under 200 KB.
- Not in this task, and listed for wave 4: Prove on the other four built games, the question that returns in Review after 30 days, and module completion.
- Browser tests: features `e2e/verifier.spec.ts`; smoke `walks`, `a11y`; nightly width for every level of all five games, run by the task and pasted.

**W2b-T26 · TR0: the module's design, its KCs, and the game's design in the frame** · opus · M · deps: T01, T17
- Files: `curriculum/TR0-pytorch-for-rust.md` (a "Before you write" section, as TR3 and TR4 have; the game's title and the tag syntax corrected), `docs/GAMES.md` sections 2.6 and 4, `packages/play/roster.ts` (the role line; `has3d` false until W2-T15), `content/kc/graph.yaml` (the nine TR0 KCs, each with `planned:` naming W2-T14, W2b-T29 or W2-T16), `tests/kc/graph.test.ts` (TR0's row).
- It decides and writes down, each with its reason: the role line "You plan the reshape." (N1's proposal: REDESIGN section 7 and the tracker are later than the roster); the 2D diagram exactly (the shape and stride table beside the buffer strip, the stride-order thread drawn in 2D, and what a copy looks like in 2D); for each level its parts (at most five), its goal line with its number, its named moment, its first move and its pass-rule sentence; which named moment goes on the keep-list; `fewest` as the Prove level; bands that keep every tensor at 256 elements or fewer; what the third dimension carries in 3D and, for each camera, what it shows that the 2D does not (a camera that shows nothing is not built; if none does, the task recommends cutting W2-T15 and the owner decides, N3); each lesson's opener by rule 1; the module page's sentence that TR0 helps before TR1 and locks nothing (N8); its sentence that TR0's lessons are separate subjects and carry no "what changed" table and no form (rules 9 and 11); each prediction with its reveal kind; that the lab's challenge-time prediction is prose and not a `predict` block; that a lesson's last heading is "Exit check" and holds three questions, at least one numeric (N5); lesson 4's two shapes, with the walk-through on the kernels T49 ran and without it.
- Accept: `npm run verify:kc`; the roster tests pass with the roster and GAMES.md 2.6 moved together; no word of `src/copy/banned.ts` in the new level, goal or part text (a script over the new sections, in the pull request).
- Browser tests: none.

**W2b-T27 · TR0: the sources read at their pins, as claims** · sonnet · M · deps: T26, T25
- Files: `course.lock.json` (torch 2.14.0, transformers 5.19.0, Triton 3.8.0, Python 3.12, and Qwen3-0.6B at a proposed revision: the commit and its date), `content/claims/tr0.yaml`, `content/cards/tensor.md`, `labs/references/manifest.json` (the model's files with the hashes and sizes the hub's metadata gives for that revision, each `[unverified]` until the `weights` job hashes the fetched files), and the repack, because the references manifest is a member of the kit.
- What it reads, each at its pin, with a generic User-Agent: PyTorch 2.14's documents for `view`, `reshape`, `contiguous`, `expand` and the calls that wait for the GPU; Triton 3.8.0's documents for the program model and `TRITON_INTERPRET`; the five MRV2 files' paths and line counts at vLLM `4ba787ec`; Mini-SGLang's `qwen3.py` at `9a91cfaf`; SGLang's `python_bindings.rs` at v0.5.23; `config.json` of the proposed Qwen3 revision (layers, heads, KV heads, head size, hidden size, vocabulary, the RMSNorm epsilon).
- Accept: `verify:claims`, `verify:pins`, `verify:content`; for each claim the pull request lists the raw-file URL at the pinned commit and the line range, and the task asserts the quote lies inside them (T34 checks again); a fact that could not be read is `[unverified]`, is listed in the pull request, and no later task may lean on it. Because it changes the kit, it takes its place in lane G's queue, after T25 and before W2-T13; the grader's unittest, `uv lock --check`, `pack-kit --check` and `test_published.py` pass.
- Browser tests: none.

**W2b-T46 · A script re-reads each claim's quote at its pin** · sonnet · M · deps: T43
- Files: `scripts/claims/requote.ts` (for the claims of the files it is given: fetch the source at its pinned commit as raw text with a generic User-Agent and no token, and say whether the quote lies inside the anchored lines: verified, moved, or could not be read; it stops at a rate limit and reports how many claims it covered), `tests/claims/requote.test.ts` (against a server on 127.0.0.1; no network), a `claims:requote` script in `package.json`. It is not part of G0, because it needs the network.
- Accept: the unit tests; one run over the vLLM claims of `content/claims/tr2.yaml`, with its table in the pull request.
- Browser tests: none.

**W2b-T28 · Tensor views: the pure session, its levels, bands, blind probes and copy** · sonnet · M · deps: T27
- Files: `packages/play/shape-shifter/{entry,types,engine,levels,bands,score,view,session,debrief,labels,copy,blind}.ts`, `scripts/games/blind.ts` (only the lines that register this game's probes, named in the allow-list), `tests/play/shape-shifter-{entry,levels,session,debrief,labels}.test.ts`, `tests/copy/game-copy.test.ts` and `tests/copy/no-kitchen.test.ts` (the new copy table), `packages/sim/tensor/index.ts` (the two stale "Sheet Pan" comments). It does not touch `packages/play/registry.ts`.
- Accept: on every band seed (count from `tests/seeds.ts`) the `fewest` ghost equals the model's optimum, the naive path costs at least one more copy, and the target is reachable in six operations; `grid` passes only on exact coverage with the least waste; each graded level's blind probe is at or under the gate's bound (O-14's default reading); practice seeds are pinned and tested; the state holds no display string; every pass-rule sentence is held to the bar its level computes. Its checks are against `packages/sim/tensor`, not against the torch vectors, until W2-T13's labs run is green.
- Browser tests: none (nothing is routed yet).

**W2-T14 · Tensor views (`shape-shifter`): the 2D view in the frame, the mirror, the walks and the registration** · opus · L · deps: T28, T10, T15, T40, T42, W2-T42
- Files: `src/games/shape-shifter/{Game,View2D,Mirror,Debrief,Controls,DockView,ReadoutStrip,kit,Card}.tsx`, `{announce,focus,words,types}.ts`, `shape-shifter.css`; `packages/play/registry.ts`, `src/games/registry.ts` (with its record loader); `src/pages/About.tsx`; `src/content/render/model.ts` (`GAME_TASKS` loses the game) and `tests/content/pending.test.ts`; `content/kc/graph.yaml` (the `planned:` lines this game discharges); `e2e/shape-shifter.spec.ts`; `e2e/levels.ts`, `e2e/support/walks.ts`, the `RULES` table of `e2e/walks.spec.ts`, `e2e/keep-list.spec.ts`, `e2e/routes.ts`, the game lists of `e2e/a11y.spec.ts` and `e2e/network.spec.ts`; the rows in `tests/play/{registry,games-blind,games-gate,frame,intro,kit,moments,part-popover,state-copy,cards-gate}.test.ts`; `tests/play/shape-shifter-ui.test.ts`.
- First commit: a skeleton `Game.tsx` with an empty diagram in the frame, and the measured `/play/shape-shifter` row. The task goes on only if the skeleton leaves at least 30 KB under the 200 KB gate [estimated need, from the built games' sizes]; otherwise it stops and reports.
- Accept: the tracker's four checks; `verify:games`; a first-screen geometry test at 1440 x 900 and 390 x 844 at the start, with a decision open and at the result (the diagram's current region, the control in hand and the readout whole and uncovered; the goal's number and end in view; one amber fill); every pinned region has a stated `scroll-margin`; the game's named moment is an entry of the keep-list, reached in e2e, and the scripted first run reaches it before the run ends; `fewest` starts in Prove mode and a passed Prove run is read as proved; no new screenshot baseline; `src/games/kit` and `src/design` unchanged; the front-page row is unchanged; the `/play/broken-bench` row is reported and has not grown by more than 50 B, and if it has, the task stops, because T40 was to make a new game free for the other routes.
- Browser tests: features `e2e/shape-shifter.spec.ts`, `e2e/keep-list.spec.ts`; smoke `walks`, `a11y`, `screens`, `network`, `reduced-motion`; nightly width `(shape-shifter)`, all five levels at 360 and 1280 px and the first-run tests at 1440 x 900 and 390 x 844.

**W2b-T29 · TR0's four item families** · sonnet · M · deps: T27
- Files: `packages/play/items/families/tr0/{strides-of,view-or-copy,find-the-sync,grid-cover,kit}.ts`, `packages/play/items/registry.ts`, `packages/play/items/catalog.ts`, `src/items/families.ts`, `tests/play/items-{strides-of,view-or-copy,find-the-sync,grid-cover}.test.ts`, `tests/fixtures/items/vectors.json`, `content/kc/graph.yaml` (the `planned:` lines these families discharge).
- Accept: `verify:items` (the blind-strategy bound by O-14's default); each family's test re-derives every key from the numbers the item prints, against `packages/sim/tensor` or, for `find-the-sync`, against a rule table whose every row is a claim; each family draws at least one numeric variant, so a Test of three can hold one; `tests/items/catalog.test.ts`, `verify-items.test.ts` and `stems.test.ts` pass; `verify:kc`.
- Browser tests: features `e2e/items.spec.ts`, `e2e/today.spec.ts`.

**W2b-T32 · TR0 lesson 1 and the module page** · opus · M · deps: W2-T14, T29, and wave 1a's T16, T41, T17, T18, T19, T20, W2-T42
- Files: `content/modules/tr0/module.md`, `content/modules/tr0/lessons/l1-<slug>.md`, `tests/content/openers-table.ts`, `tests/content/module-counts.ts` (TR0's row), `packages/play/predictions/{plan.ts,truth.ts,commit-tr0.ts,tr0.ts}`, `tests/content/tr0-module.test.ts` and `tests/content/tr0-demos.ts` (from the kit), `e2e/routes.ts`, `e2e/support/lessons.ts`, the `MET` parts in `e2e/lesson-games.spec.ts`, and the generated `public/md/tr0/` and `public/llms.txt`.
- The module page carries the lab's `:::lab` block and says only what is true when it merges; the section that says which stage tests what is T51's, after the lab exists. It has the Prove step in words, the sentence that TR0 helps before TR1 and locks nothing, and the sentence on rules 9 and 11.
- Accept: the kit's checks with zero diagnostics; `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts`; every model number is `[synthetic]` with its day and commit, and its table's header row is held; the Test holds three questions, at least one numeric; the front page's Start still names TR1 lesson 1; the front-page row is reported and grows by no more than the module row's own change; the lesson's JSON is under 40 KB.
- Browser tests: features `e2e/lesson-games.spec.ts`, `e2e/lesson-predict.spec.ts`, `e2e/map.spec.ts`, `e2e/titles.spec.ts`, `e2e/items.spec.ts`, `e2e/front.spec.ts`; smoke `first-visit`, `a11y`, `screens`; nightly `a11y` at 320 px on the two new routes; nightly width `(shape-shifter)` for the lesson's levels.

**W2b-T51 · TR0 lessons 2 and 3, and the module page's section on the laptop part** · sonnet · M · deps: T32, W2-T16
- Files: the two lesson files, their rows in the openers table and the counts table, the predictions files, `tests/content/tr0-module.test.ts`, `tests/content/tr0-demos.ts`, `tests/content/tr0-figures.ts` and `public/figures/tr0/` for figures drawn from the tensor model, `content/modules/tr0/module.md` (which stage tests what; stage 2's bank is awaited; nothing on the page is a run of the learner's machine), `e2e/routes.ts`, the generated exports.
- Accept: as T32 for each lesson; lesson 2 uses the `three-d` level in 2D; lesson 3 carries the lab's Build row; every value of Qwen3 comes from a claim on the pinned `config.json`.
- Browser tests: as T32, for the two new routes; features `e2e/lab-kits.spec.ts`.

**W2b-T52 · TR0 lesson 4: reading Triton** · opus · M · deps: T32, T49 (or the record that T49 did not run)
- Files: the lesson file, its rows, the predictions files, the module test and demos, `e2e/routes.ts`, the generated exports.
- Accept: as T32; the lesson teaches grids, programs, `BLOCK` and masks from the `grid` level and the pinned files; with T49 done, it walks through the kernels that ran under the interpreter and names the course's own kernel as the course's; without T49, it has no walk-through and one sentence says the course has not run a vLLM kernel under the interpreter; either way it says that a 3.8.0 wheel off Linux is `[unverified]`.
- Browser tests: as T32, for the new route.

**W2-T18 · TR0 content: lesson 5, and the module closed** · sonnet · M · deps: T51, T52
- Files: the lesson file, its rows, the predictions files, the module test and demos, `e2e/routes.ts`, the generated exports.
- Accept: as T32; every claim of `content/claims/tr0.yaml` is cited by a lesson or the module page; `verify:kc` shows no `planned:` left on a TR0 KC; the lessons' minutes sum within 10 percent of the brief's plan; the tracker's check for W2-T18 holds for all five lessons.
- Browser tests: as T32, for the new route.

**W2-T15 · Tensor views: the 3D scene** · sonnet · L · deps: W2-T14, and T26 having found at least one camera worth building
- Files: `src/games/shape-shifter/{Scene3D,Stage3D,Select3D}.tsx`, `scene-layout.ts`, `scene-presets.ts`, its CSS, `Game.tsx` (lazy load), `tests/play/shape-shifter-scene.test.ts`, `e2e/shape-shifter-scene.spec.ts`, the lists at `tests/lint/boundaries.test.ts` line 195, `tests/lint/eslint-rules.test.ts` line 168 and the has-3D row of `tests/ci/e2e-coverage.test.ts`, the roster's `has3d` with GAMES.md.
- Accept: the tracker's three checks; the row `scene-shape-shifter` under 40 KB, reported; `three-vendor` unchanged (if the scene needs a module that is not in it, the task stops); every 3D mark takes its glyph and its label from the layout the 2D uses, and the legend is the 2D legend; each camera is fitted to its box on the level's largest state; the drawn-canvas bar is set once, from a run on four pinned cores, written down as a dated record, and later changes to it are the owner's call; a phone is offered no 3D; the default view stays 2D.
- Up to the owner's step: the scene, its tests and stills of every camera in the pull request. What the learner sees meanwhile: the 3D switch on a desktop, with 2D as the default. The owner's step: look at the stills and check frame time by hand (O-9).
- Browser tests: features `e2e/shape-shifter-scene.spec.ts`, `e2e/lesson-games-scene.spec.ts`; smoke `reduced-motion`, `network`, `a11y`; nightly width `(shape-shifter)`.

**W2b-T33 · TR0 end to end: first-visit checks on its routes** · haiku · S · deps: W2-T18
- Files: `e2e/first-visit.spec.ts` and `e2e/screens.spec.ts` (REDESIGN 5.2's per-screen checks on `/m/tr0`, its five lessons, `/play/shape-shifter` and `/labs/tr0.forward`). This is W2-T39's share for TR0.
- Accept: the checks pass at both widths; the smoke project's four shard times are reported, as `playwright.config.ts` asks of an added spec.
- Browser tests: smoke `first-visit`, `screens`.

**W2b-T34 · TR0 technical check** · opus · M · deps: T33, T46
- It checks every claim and number in TR0's lessons, module page, card, item rule tables, game copy and lab page: each claim's quote against its anchored lines at the pin (with `scripts/claims/requote.ts`, then by reading what the script could not), each `[derived]` number recomputed, each `[synthetic]` number against the demos file, each configuration value against the pinned `config.json`, each command against the kit.
- Files: one report under `docs/waves/` with a row per claim or number: verified, wrong, or could not be read. It changes nothing else.
- Accept: every claim of `content/claims/tr0.yaml` and every tagged number of the five lessons has a row; every "wrong" names file and line.
- Browser tests: none.

**W2b-T35 · TR0 cold-reader check** · opus · M · deps: T33
- It reads as a kernelspace graduate who has not seen the engines: the kernelspace lessons the module names as prerequisites, read from the sibling checkout `../kernelspace` with `git -C ../kernelspace show d478f91:<path>` (AGENTS.md rule 5), then TR0's pages in order as exported in `public/md/tr0/`, and each level's parts list, goal line and prompts. For each lesson it says where the reader is lost (file and line), which term is used before it is given, whether the opener is the right one by rule 1, whether rules 8 to 12 hold, and whether the Test tests what was taught.
- Files: one report under `docs/waves/`. It cites a kernelspace lesson by id and line and quotes none of it. It changes nothing else, and it does not see T34's report.
- Accept: every lesson has a verdict of "follows" or "lost at", with lines; no praise.
- Browser tests: none.

**W2b-T36 · TR0: fix what the technical check found** · sonnet · M · deps: T34
- Files: the lessons, claims and tests T34's report names.
- Accept: every "wrong" row is closed, or is listed for the owner with the reason; the module test and G0 pass; the report gains a closing line per row.
- Browser tests: as T32.

**W2b-T53 · TR0: rewrite where the reader was lost, and re-read the fixes** · opus · M · deps: T35, T36
- Files: the lesson passages and level copy T35's report names.
- Accept: every "lost at" row is closed, or is listed for the owner with the reason; each passage T36 changed is read again and either stands or is rewritten; the module test and G0 pass; T35's report gains a closing line per row.
- Browser tests: as T32.

### 4.8 Wave 1b exit

**W2b-T39 · Wave 1b exit review** · opus · S · deps: all of wave 1b
- Files: a wave report under `docs/waves/`; the pull request from `wave-2m1b` into `wave-2m1a`, marked ready and not merged.
- Accept: G0 on the tip; `known-red.json` holds only what the report lists; the bundle table, with the front-page and `/play/broken-bench` rows; the `labs.yml` run on the pull request is green, with the `cpu` job's results quoted; a spot check of five tasks' evidence against their Accept lines; `ES_PROPERTY_SEEDS=10000 ES_HEAVY=1 bun test --parallel=2 --timeout 900000`, `bun test tests/forge/rejection-sampler-rates.test.ts`, `bun run verify:claims` and `bun run verify:pins` once on the tip; the list of owner steps and of what each page says meanwhile.
- Browser tests: `ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features` once on the tip, on four pinned cores. Firefox and WebKit are recorded as not run.

**After 1b a learner can:** read tensors as storage plus shape and strides, tell views from copies and find the hidden syncs; play Tensor views in 2D and take `fewest` in Prove mode; answer TR0's four item families; build the forward pass on a laptop, get credit for stages 1 and 3, and defend the stage 3 receipt. **They cannot yet:** get browser credit for stage 2 until the owner commits the bank; see a measured margin for the 1e-3 bar until the owner dispatches the weights job; step through a vLLM kernel under the interpreter if N4 was refused; see a module marked complete (wave 4); do anything in TR3, TR4, TR5b, TR7 or a GPU lab.

---

## 5. Later waves in outline

New tasks have a name and no id here; each wave's opening task assigns ids and writes the headings. Models and sizes are proposals.

### Wave 2: TR3 beside TR5b, TR7's sources, and the first F-lane lab (47 tasks [estimated])

**Opening:** the wave's headings in the tracker, with W2-T33's dependency on W2-T31 removed and the reason written (the 3D scene is off the lessons' path and ends at the owner's look) · sonnet · S.

**Lane G, in merge order:**
1. W2b-T38 · The capture runbook, and a checker for the owner's reference traces (`docs/owner/W2-T21-traces.md`, a `trace check` subcommand) · sonnet · S.
2. The receipt worker loads a lab's re-checks on demand · sonnet · M. Twenty-one checks wait in `packages/verify/stages.ts` `PENDING`, and the worker has 4,161 B of room.
3. `bench-log@1` names its GPU (W2-T36's open check) · sonnet · M.
4. W2-T36 · Build a BurstGPT open-loop replay (TR8 lab) · sonnet · L. The client is tested against a local streaming server; a seeded synthetic workload stands in until the dataset may be fetched. Its files include `content/modules/tr8/module.md`'s lab section (line 42 says the page does not grade the lab), the lab block, the module test, and the lab's "Defend your receipt" questions.
5. W2-T29 · Build a KV events publisher (forge lab) · sonnet · L. Fully buildable and testable here.
6. Prove-it v2 on a forge module (`hybrid-kv`, `rejection-sampler`, then `kv-publisher`) · opus · M.
7. W2-T23 · Build an attribution report from a vLLM profile (TR3 lab), to its synthetic acceptance, with its Defend questions · sonnet · M.
8. W2-T32 · Build a toy connector in vLLM (TR5b lab), to its synthetic acceptance, with its Defend questions · sonnet · L. Upstream's connector unit tests at the pin are the owner's (section 6).

**TR3 lane:** design, KCs and the game in the frame (opus, M; takes the brief's defaults for its four questions and needs N2) · sources at the pins as claims (sonnet, M; it re-cites `mlc-book.gemm-launch-api` to the book's repository file at a commit, and adds a `verify:claims` rule that no other claim cites the book until the owner answers the brief's question 4) · the gap and cause finder, its band and a bestiary of plausible wrong causes (sonnet, M) · a second GPU stream in the generator, with a proof of which goldens move (sonnet, M) · the pure session (sonnet, M) · W2-T20, Traces and Trace attribution in the frame (opus, L; the viewer loads on demand, the front-page row is measured at the first commit that mounts it, `attribute` is the Prove level, `pinned` is not built) · five item families and the numeric variant (sonnet, M) · lesson 1 and the module page (opus, M) · lessons 2 and 3 (sonnet, M) · lesson 4, attribution (opus, M) · W2-T24, lessons 5 and 6 and the module closed (sonnet, M) · the host-card fit as a script on synthetic traces (sonnet, S) · end to end (haiku, S) · technical check (opus, M) · cold-reader check (opus, M) · technical fixes (sonnet, M) · teaching fixes and re-read (opus, M).

**TR5b lane:** design (opus, M; settles the tracker's text against GAMES.md section 9, N1) · sources (sonnet, M) · the connector model over `tiers` (sonnet, L; no tracker task owns it) · the pure session, seven levels (sonnet, M) · W2-T30, KV offload in the frame, 2D (opus, L; `yard` is the Prove level) · four item families (sonnet, M) · lesson 1 and the module page (opus, M) · lesson 2, the connector contract (opus, M) · lessons 3 and 4 (sonnet, M) · W2-T33, lesson 5 and the module closed (sonnet, M) · W2-T31, the 3D scene (sonnet, L; last, with the owner's look) · end to end, the two checks and the two fix tasks as for TR3.

**TR7, a light third lane:** design (opus, S; the block quote in the brief becomes a claim's quote) · sources at the pins, and the census re-measured over four weeks with no token, stopping at the rate limit and reporting the window it covered (sonnet, M) · the targets file as a draft for the owner (sonnet, S). The brief's rule stands: no target is published until the owner has reproduced it.

**Floating:** the "In vLLM today" and Build cards for TR1, TR2, TR5a, TR6 and TR8, from existing claims (sonnet, M; any count edit under the gate's allow-list).

**Exit:** the review, with the same sweeps as W2b-T39 · opus · S.

### Wave 3: TR4 beside the rest of TR7, and the GPU labs of TR1 and TR6 (33 tasks [estimated])

**TR4 lane:** design (opus, M; Q-11's default: it stays a game) · sources and the rule table's claims read from the pinned registry (sonnet, L; it pins the FlashAttention repository at a commit in `course.lock.json`, and FA4's instruction cells stay a dash until read there) · `packages/sim/backends` and the pure session (sonnet, M) · W2-T25, Backend dispatch in the frame (sonnet, M, with an opus read before merge; `pick` is the Prove level) · five item families (sonnet, M) · lesson 1 and the module page (opus, M) · lessons 2 and 3 (sonnet, M) · W2-T27, lessons 4 and 5 (sonnet, M) · end to end, the two checks and the two fix tasks.

**TR7 lane:** four item families (sonnet, M) · a seeded PR description as TR7's Prove item (sonnet, M) · lesson 1 and the module page (opus, M) · lesson 2 (sonnet, S) · W2-T37, lessons 3 and 4 with the targets file as reviewed (sonnet, M) · end to end, the two checks and the two fix tasks.

**Lane G, in merge order:** W2-T26, the sweep lab (sonnet, M; Q-1's default: no H100 stage is required; the floor's parameter `[estimated]`) · W2-T38, the reproduction lab (sonnet, M) · W2-T34, the TR1 fork lab (sonnet, M; built for nano-vllm, with Q-8's fallback in the runbook; its files include `content/modules/tr1/module.md` line 49's lab section, the lab block and the module test) · W2-T35, the TR6 proposer lab (sonnet, L; O-18's five checks, Q-7's tie-aware identity; the TR6 module page likewise) · the canonical form's memory bound and piecewise hashing (sonnet, L) · Python `receipt verify` beyond rule 3, and the long-string import test (sonnet, M) · the re-pin runbook's list of pin-dependent shims (sonnet, S) · one runbook for the owner's GPU session, covering every lab, upstream's connector tests and the nano-vllm install (sonnet, S).

**Exit:** the review · opus · S.

### Wave 4: W2's close (16 tasks [estimated], four of them the owner's)

Most of it waits for the owner's one GPU session after wave 3. In order as results arrive: W2-T17's bank, then the `BANKS` entry and TR0's browser re-check (S); W2-T12's bundles, then real fixtures in `tests/verify`, forgeries made from them, and each lab page's state line and `[unverified]` commands updated to what the session showed (M); W2-T21's traces, then W2-T22 (fit the host card and regenerate the goldens, M) and the `pinned` level with the pinned traces on Traces and the nsys table names checked (M). Then, with no owner step: Prove mode on the other four built games and the question that returns in Review after 30 days (sonnet, M); module completion derived as `docs/ASSESSMENT.md` 9 gives it (opus, M; Q-5's default yes, O-17's default as built); the audit wave R asked for, a second read of the moved blocks in TR1, TR2, TR6 and TR8, and the pacing allowance out of three module tests (M); `scripts/claims/requote.ts` in `nightly.yml`'s reports job (S); W2-T39 (end-to-end coverage with real fixtures, M); W2-T40 (owner); `bun scripts/verify-kc.ts --final` (S); W2-T41 (exit review; O-10's default: full weight when every browser check also passes).

### Wave 5: W3 (23 tasks [estimated])

W3-T01 (owner). Capstone design, with the `cap.` against `capstone.` KC id settled (opus, S). W3-T02 the harness, which can start on synthetic pairs before W3-T01. W3-T03 the browser part. W3-T04 the guide, followed by a technical check, a cold-reader check and the two fix tasks. W3-T05 the Evidence Pack, W3-T06 the watcher and change cards, W3-T07 search and the missing parts of W3-T15 depend on W2-T41 only formally and may be pulled into wave 4 while it waits for the owner. Then W3-T08, W3-T09, W3-T10 (needs O-9's devices), W3-T11, W3-T12 (owner), W3-T13, W3-T14, W3-T15 (needs O-3), W3-T16 (owner) and W3-T17.

---

## 6. Owner steps

| Step | Built up to it | What the learner sees meanwhile | When |
|---|---|---|---|
| Answer N4, N5 and N8 (section 7) | Wave 1a | Nothing changes | before wave 1b; 1b takes the defaults otherwise |
| Merge each wave's pull request; look at any re-shot screenshot before it is allowed | Each wave's report | Nothing changes | each wave |
| Dispatch the `weights` job of `labs.yml` (or say the orchestrator may) | The job (W2-T16) | The lab page says the course has not yet run the lab on the pinned weights; the 1e-3 bar is `[estimated]`, with a sentence that the margin is not measured; the model files' hashes are `[unverified]` | after 1b |
| W2-T17: the TR0 argmax bank | The generator and its runbook (W2b-T31) | Stage 2 of `/labs/tr0.forward` says "awaiting the course's reference bank"; stages 1 and 3 can be credited and defended | after 1b |
| A look at Tensor views' 3D stills, and frame time by hand (O-9) | W2-T15 | 2D by default; 3D behind the switch on a desktop | after 1b |
| W1-T02, O-4: confirm the pins on a 4090 (a short session; optional before wave 2, but every sources task reads at the pin) | `selftest --gpu` (W2b-T37), the environments | Pins shown as proposed on `/changes` | after 1b |
| Dispatch `nightly.yml` for Firefox and WebKit, or set `NIGHTLY_ENABLED` | The exit reviews run Chromium only | Nothing changes | any time |
| The human cold test of REDESIGN 5.5, now with TR0 lesson 1 | Each wave's report | Nothing changes | each wave |
| Review the TR7 targets draft | The draft (wave 2) | TR7 is not published yet | wave 2 to 3 |
| **One GPU session after wave 3** (a 4090, and an H100 where a stage asks): W2-T12's smoke and receipt fixtures; one real-engine run of each F-lane lab (TR1, TR3, TR4, TR5b, TR6, TR7, TR8); upstream's connector unit tests at the pin; the nano-vllm install (Q-8); W2-T21's 6 to 10 traces (O-5); one reproduction of each TR7 target | Every lab to its synthetic acceptance, the intake, the runbooks | Every F-lane lab page says "built; the course has not yet run this lab on a real engine", with commands tagged `[unverified]`; Trace attribution has no `pinned` level; host cards are `[estimated]`; a dash stands wherever a lesson would print a captured time; TR7's lab page lists no target and says why | after wave 3 |
| Q-10: run the dispatcher table script | Built in W1 | The Step loop's `keys` level stays unpublished | any time |
| W2-T40 and W3-T12: screen-reader passes | W2-T39, W3-T11 | Nothing changes | waves 4, 5 |
| W3-T01, O-6: the three commit pairs and their traces | The harness on synthetic pairs | The capstone's page says its pairs are not chosen | wave 5 |
| O-3: licences; W3-T16: launch | W3-T15 | All rights reserved | wave 5 |

---

## 7. Owner questions

**Needed before wave 1b starts. Each has a default that 1b takes if no answer comes.**

- **N8. Does TR0 become the course's start?** It is first in `content/course.yaml`, so publishing its first lesson would move the front page's Start, the demo's closing line and about twenty tests from TR1 lesson 1 to TR0 lesson 1. Default taken (W2b-T41): no. TR0 is an advised primer, the course starts at TR1 lesson 1, and the map says TR0 helps. It is one line of `course.yaml` to change later; changing it means new copy in `src/front/copy.ts`, about twenty expectation edits and re-shot baselines for the owner's look.
- **N4. What may an agent download?** Proposed: the locked CPU environment (torch 2.14.0 CPU, transformers 5.19.0) and the Triton 3.8.0 CPU wheel, on the build machine and in `labs.yml`; the Qwen3-0.6B weights in `labs.yml` only, on a dispatch; files at pinned commits for reading, never whole source trees or GPU wheels. Default taken if unanswered: nothing is installed on the build machine; `labs.yml` on the draft pull request syncs the locked CPU environment and is the evidence for W2-T13, W2b-T48 and W2b-T31; W2b-T49 (the Triton wheel) does not start, and lesson 4 ships without the interpreter walk-through and says so; the weights job waits for the owner's dispatch.
- **N5. The pass rule of a lesson's Test.** REDESIGN 2.5 and the built page say every question right on new numbers ("3 of 3: passed"); `docs/ASSESSMENT.md` 4.2 and the briefs say 2 of 3 with one numeric. Default taken: the page's rule stays, and every new Test holds three questions with at least one numeric, which fits both rules.

**Needed during wave 1b or before wave 2:**
- **N1. Four role lines and one design differ** between the roster and GAMES.md 2.6 on one side and the tracker and REDESIGN 7 on the other. Proposed: the tracker's and REDESIGN's lines, because they are later ("You plan the reshape." for Tensor views, in W2b-T26). For KV offload, proposed: GAMES.md section 9's connector game, with the tracker's "publishes each move" as its `publish` level.
- **N3. Whether Tensor views gets a 3D scene** if W2b-T26 finds no camera that shows what the 2D does not. Proposed: then it is not built, and the roster says 2D.
- **N2. "Bubble" or "CPU gap"** for the stretch in which the GPU idles while the CPU prepares the next step. Proposed if no answer comes before wave 2's Trace attribution session: "CPU gap", since the roster's subtitle and the trace model use it.
- **Q-5. Is a `proved` event required for a module to be complete?** Documented default: yes. The plan builds Prove mode (W2b-T42), "Defend your receipt" (W2b-T50), Prove-it v2 (wave 2) and the completion states (wave 4) on it. If the owner says no, those four tasks shrink to practice features and the record is written.
- **N6. The red tests on the base** are fixed in wave 1a, not quarantined. If one cannot be fixed, it stays in `known-red.json` with its reason, and that is the owner's to accept.

**With a documented default, which the plan takes:**

| Question | Default taken | Task that leans on it |
|---|---|---|
| O-4, pins | vLLM v0.33.0, SGLang v0.5.23, as proposed | every sources task |
| O-5, traces | 6 to 10 on a 4090 and an H100 | W2b-T38 |
| O-10, grader-attested weight | full weight when every browser check passes | W2-T41 |
| O-14, the blind bound for a choice item | the gate's reading | W2b-T28, W2b-T29, every items task |
| O-17, levels built as practice | as built | the completion task of wave 4 |
| O-18, the sampler's five checks | as built | W2-T35 |
| O-19, TR1 lesson 1's instrument edge | as built (the recommendation in `map/followups.md` is to do it; it is the owner's call) | none |
| O-20, TR5a lesson 1 | as built | W2b-T20 |
| O-21, a quoted run | `[unverified]` | every lesson |
| Q-1, H100 stages | not required | W2-T26, W2-T37 |
| Q-7, identity | tie-aware | W2-T34, W2-T35 |
| Q-8, flash-attn for nano-vllm | Mini-SGLang if it does not install | W2-T34 |
| Q-11, Backend dispatch | it stays a game | W2-T25 |
| TR3's four and TR4's three authoring questions | the notes' own defaults (no table, no form, no more of the book quoted) | wave 2 and wave 3 design tasks |
| The Broken benchmark's form at 390 | as built | W2b-T09 |
| The front page's 158 px move at 1280 x 800 (`map/followups.md` D16) | as built; a fix by deferral is the owner's choice | none |
| D-067 and the other proposed records | as proposed | W2-T44 |

**Later:** N7, the capstone's KC ids (`cap.` in the brief, `capstone` in `course.yaml`), settled in wave 5's design task. O-3, the licences, before W3-T15.

---

## 8. Risks, and what the plan does about each

1. **The front page's 350 B.** The index alone would break it at the first new lessons. W2b-T16 takes the lesson rows out of the first paint before any lesson is added. W2b-T19 keeps outcomes out of `index.json`. T07 and T10, which touch files the front page imports, have an allowance of 100 B each and wait for T16 if they need more. No task edits `scripts/verify-bundle.ts`.
2. **`/play/broken-bench`'s 115 B.** A registered game's record is in every game route today. W2b-T40 loads one record at a time before any game registers, and W2-T14 stops if the row still grows. `src/design/parts.css` by component (T08) is the reserve.
3. **A new game's route size is unknown.** W2-T14's first commit measures a skeleton game and stops if the room is short; W2-T20 and W2-T30 do the same.
4. **The receipt worker's 4.1 KB.** Wave 2 makes the worker load a lab's re-checks on demand before the first F-lane lab lands. "Defend your receipt" runs outside the worker.
5. **Tests the gate did not run, and flaky tests.** W2b-T02 and T43 run the features specs, the walks and the lab checks of what a branch touches, with `--retries=0`. The fifteen red tests and two flaky ones are listed and fixed in wave 1a; an entry leaves the list only after five passes of five, and no task may add one.
6. **An agent lowers a bar, or a test skips quietly.** W2b-T03 diffs thresholds, timeouts, retries, skips, named bounds and screenshot baselines, in new files too, and refuses the merge.
7. **No torch on the build machine.** The lab's main tests run in `labs.yml`'s `cpu` job on the draft pull request, fail where torch is expected and missing, and are confirmed by the orchestrator before a dependent task merges. With N4 answered yes they also run here.
8. **Upstream reading that `research/` does not hold.** Each module has a sources task that reads each named file at its pinned commit and records the raw URL and line range. No gate checks a quote: the technical check does, with W2b-T46's script. What cannot be read stays `[unverified]`, is listed, and no lesson sentence, rule table or check may rest on it. Facts known to be unread today: the MRV2 paths at the pin, the Qwen3 revision and its `config.json`, Triton under the interpreter, the trace's event names at the pin, the nsys table names, the backend registry, FA4's instruction cells (no FlashAttention build is pinned yet), the connector's registration keys.
9. **Work no tracker task owns.** Prove-it in three kinds, module completion, the stage-to-KC table, the connector model, the gap and cause finder, the second GPU stream, the graded lab page, the `checks/` folder and the `--gpu` smoke each have a task here.
10. **The briefs are older than the redesign.** Each module opens with an opus design task that rewrites the brief's "Before you write" section, so no author copies a stale line.
11. **The owner's steps are the critical path.** The plan asks for one GPU session after wave 3, when every environment has a lab, and builds the runbooks and the intake before it. Three small steps come earlier and need no GPU or a short one: the bank, the weights dispatch, the pins.
12. **3D cannot be judged on a machine with no GPU.** A 3D task is last in its module, off the module's path, ends at stills for the owner, sets its drawn-canvas bar from the four-core run only, and leaves 2D as the default.
13. **Lanes collide.** Section 3's table, and one serial merge queue for every grader, kit and lab change in every wave.
14. **A pin moves (O-4).** A claim read at a tag stays true at that tag. If the owner's driver gate moves vLLM to v0.32.0, every sources task's claims are re-read at the new tag with `scripts/claims/requote.ts`.
15. **Paths and names in public text.** Section 3's rule, and the gate's check.
16. **This plan's own sizes.** Waves 2 to 5 are sized from the maps. Each wave opens by confirming its task list against the module designs and writing its own headings.

---

## 9. What was not taken from the two reviews, and why

1. Critic 1, finding 19, in part. Its move of TR7's sources and targets into wave 2 is taken. Its statement that "no target is published until the owner has reproduced it" is the draft's own addition is not: `curriculum/TR7-contribute-honestly.md` section 11 item 1 says it.
2. Critic 2, finding 9, in part. The FlashAttention pin is taken. "No claim may cite the book until O-3 is decided, and `verify:claims` rejects that source" is corrected: O-3 is enginespace's own licence, the question that governs the book is question 4 of the TR3 brief, and `content/claims/tr2.yaml` already holds one claim on the book (D-069). The rule is "no other claim", with that one re-cited to the repository file at a commit.
3. Critic 2, finding 12, in part. The wall-time measurement, the budgets and the cap on walks for a kit change are taken. Running the features specs with the smoke project's flags in the gate is not: the flags are set in `playwright.config.ts` and cannot be passed for one run, the file's own comment says `features` keeps them on purpose, and an edit there is the kind of change the gate is being taught to refuse. W2b-T02 measures first, and the choice goes to the owner if a budget is passed.
4. Critic 2, finding 20, in part. T12, T21 and T33 go to haiku and T18 to sonnet. T11 stays on sonnet, because the cause of the axe violation is unknown and the task is not mechanical.
5. Critic 1, finding 17, in part. The dead step control is its own haiku task. The `LEVEL_NAMES` wording goes to T20 on sonnet, because it is a choice of words a learner reads.
6. Critic 1, finding 11. The alternative it offers is taken, not the dependency: T32 writes only what is true when it merges, and T51 adds the lab section after the lab exists. The dependency would put the whole lab on the first lesson's path.
7. Critic 2, finding 6. The allowance is taken (100 B each for T07 and T10), not the dependency on T16, so the defect fixes do not wait behind an L task.
8. Critic 2, finding 1, on T08's floor. With W2b-T40 a new game's record costs the other routes nothing, so T08 no longer has to fund four records; it is held in reserve with a stated trigger.
9. Critic 1, finding 9, on GPU sessions. One session after wave 3 is taken. The pin confirmation (O-4) is kept as an optional short step after wave 1b, because every sources task reads at the pin.
