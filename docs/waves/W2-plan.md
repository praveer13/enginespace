# enginespace: plan for wave 2 (final), cut into wave 2a and wave 2b

> This is the plan wave 2 is built from, written 2026-11-22 before the wave's first merge. It is a plan, not a record: the records are the reports under `docs/waves/`, `docs/DECISIONS.md` and the tracker's markers, and where the plan and the tracker or a later record disagree, the later record is what was built. The per-task paragraphs of sections 4.3 and 5.1 are in `docs/TRACKER.md`. The plan was kept on the build host; this copy replaces its paths on that host and its references to files kept with the build by plain words, and, besides the two pointers of 4.3 and 5.1, changes nothing else. The sentence in the plan about being private working material with absolute paths describes the copy kept with the build, not this one. It was checked against `wave-2m2` at `a737ad22`.

Written 2026-11-22 against the read-only export of `wave-2m1b` at 4cae5068. The export is a copy of that commit on the build host, not in the repository, and every path is relative to it. Nothing was built, run, fetched or changed there. This file is private working material: it holds absolute paths, and none of them may reach a commit or a pull request. Tags: [measured] is a figure a document prints, with its source; [derived] is arithmetic on such figures; [estimated] is a judgment.

This plan replaces an earlier draft (kept with the build, not in the repository) and is complete in itself. The machine-readable task list is a file kept with the build, not in the repository (135 tasks; `docs/TRACKER.md`'s section "Wave 2 of the second build plan: 2a and 2b" now holds its tasks); section 4.3 and section 5.1 are printed from it, so the two agree. A file (kept with the build, not in the repository) lists what three critics found in the draft and what was done about each.

## 0. What this plan rests on

**Read whole:** the draft; the three critics' findings; the plan for the rest of the build written 2026-11-19 (kept with the build, not in the repository), sections 0 to 3 and 5 to 9 (lines cut at about 3,000 characters); the draft of pull request 12's description (kept with the build, not in the repository), "What is still wrong" and "For the owner".

**Read in part:** the leftovers map (a triage of what wave 1b left open, kept with the build, not in the repository; its section 0, items A11, A19, A22 to A24, B08, classes C, D and E, sections 6 and 7); the labs map (a map of the labs and the grader, kept with the build, not in the repository; P1, P2, items B, E, F, section 2, section 4); the games map (what adding a game takes, kept with the build, not in the repository; sections 5 and 6); `docs/waves/W2m1b-report.md` sections 5 (the table), 14, 16.1, 16.4 to 16.8 and part of 16.2; `docs/DECISIONS.md`, the two open-question tables and the headings of D-070 to D-076; `curriculum/TR3-profile-a-real-engine.md` sections 0 to 6, "Before you write" and section 11; `curriculum/TR5b-offload-connector-events.md` sections 0 to 5; `docs/TRACKER.md`, the sizes of the reading guide, the heading lines of W2-T19 to W2-T44 and "Tasks added after the plan"; two entries of wave 1's task list (kept with the build, not in the repository) for the format.

**Checked in the export, because a critic's must or the order rests on it:**
1. `tests/ci/workflows.test.ts` 708-711 and the last test of that block: no task may be marked `[x]` or `[=]` before it is in `MERGED`; "the exit review sets them". So markers move only in an exit report (section 3, MERGE).
2. `src/games/kit/Frame.tsx` 481: `data-seed={seed}` is written for every game. A new game cannot keep its seed out of the page without a kit change (W2b-T179).
3. `scripts/content/directives.ts` 277: every item block exports as "**Practice.**" (W2b-T77).
4. `content/README.md` rule 11, `curriculum/TR3-profile-a-real-engine.md` (e) and question 2: the owner settles "bubble" against "CPU gap" before TR3's form is written. `src/copy/terms.ts` 46 coins "bubble". A grep of `content/modules` finds "bubble" 32 times and "CPU gap" twice. The brief's section 1 item 4 names the partition's category "CPU-gap", and `packages/play/roster.ts` 40 is the game's row. The only default is in the plan for the rest of the build (kept with the build, not in the repository), line 597 (N2).
5. `scripts/verify-bundle.ts` 459-463: the worker row measures exactly one file named `receipt.worker-<hash>.js` and fails when more than one matches.
6. `src/labs/tr0-forward.ts` 34-41: the lab page prints `uv sync --locked --project envs/cpu` and `uv run --project envs/cpu enginespace fetch tr0.forward`. A checker told to type the page's commands as printed would download.
7. `.github/workflows/ci.yml` 30-32: one concurrency group per ref with `cancel-in-progress: true`. `playwright.config.ts` 147, 161, 163: retries 1 under CI; `smoke` is `fullyParallel` and `features` is not.
8. `AGENTS.md` line 7: its first section must repeat the tracker's agent brief word for word, and `tests/docs/repo-docs.test.ts` fails otherwise.
9. `scripts/gate/touched.ts` 85-170: the kit row is `design-parts`, `screens`, `walks`, and it also takes everything else under `src/games/` and `packages/play/`, `roster.ts` among it; `course.lock.json` maps to the grader commands only.
10. `docs/TRACKER.md`: the highest id in use is W2b-T68. `docs/DECISIONS.md`: the last record is D-076.
11. The draft's own checks (its section 0, items 1 to 9: the two-digit id reader, the `GAMES` readers, `GRADED_LABS` on `/receipts`, the pins of `course.lock.json`, the tiers model's gaps) are relied on and were not repeated.

**Not read:** `docs/ARCHITECTURE.md`, `docs/GAMES.md`, `docs/ASSESSMENT.md`, `docs/REDESIGN.md`, `PRODUCT.md`, `DESIGN.md`; `AGENTS.md` beyond its first twelve lines; `content/README.md` beyond rule 11; `research/`; `course.lock.json`; `docs/waves/W2m1a-report.md`, `W2m1b-tr0-technical.md`, `W2m1b-tr0-cold-read.md`; sections 1 to 4, 6 to 13, 15 and 16.3 of `W2m1b-report.md`; wave 1's triage of the leftovers (kept with the build, not in the repository); every report of wave 1's build kept with the build, not in the repository; `curriculum/TR7-contribute-honestly.md`; the modules map and the outline map (maps of what writing a module takes and of wave 2's outline against the tip, kept with the build, not in the repository) beyond their headings; the rest of the leftovers, labs and games maps; every source file, test body and lesson beyond the lines named above. Where a task names a file I did not open, the path comes from the draft or a map. A critic's evidence that is not in the list above was taken on the critic's word. Every size and every count of merges is [estimated] unless tagged.

## 1. The present state

**Published in the browser:** six modules (TR0, TR1, TR2, TR5a, TR6, TR8), 32 lessons, six games (Tensor views is the newest and the model), two forge labs (`hybrid-kv`, `rejection-sampler`), one graded lab page (`/labs/tr0.forward`, a CPU lab), `/receipts` with "Defend your receipt" for TR0, and Prove mode on two levels. Wave 1a is on main. Wave 1b is finished on `wave-2m1b` in pull request 12, which the owner has not merged. Wave 2 stacks on it.

**Not written:** TR3, TR4, TR5b, TR7, the capstone. Not built: the games Trace attribution (`gap-hunt`), KV offload (`switchyard`) and Backend dispatch; the forge lab `kv-publisher`; every GPU lab; Prove-it for forge labs. `/trace-room` is a stub in production builds.

**Built under the new modules:** the trace model and the viewer (`packages/sim/trace`, `src/trace`), which can partition a step window but cannot name a gap's cause, draw a second GPU stream or make a case; the tiers model (`packages/sim/tiers`), an instantaneous block store with a publisher judge and no clock, transfer, request state, failure, violation or sequence number; the trace exporter; the lab page as one view drawn from a descriptor; the module test kit; the lesson blocks `trace`, "In vLLM today" and the Build row, which no built lesson uses yet. The `trace` block has no phone path.

**Open defects a learner meets today** (the leftovers map, class A, 22 items; W2m1b-report 14 and 16.4). Those most likely met: the Rejection sampler's 3D stage shrinks 46 px on the first draw; TR0 lesson 1 at 360 px scrolls itself 1,148 px; after a proved run the foot says "Recorded as practice"; a left Prove attempt is a miss that is in no event; Tensor views hides its aim behind "more" on a phone and puts a stepper under the fold at 375x812 and 360x800; "in place" does not mean what lesson 1 says; the Request path's first lay moves "Run the path" 100 to 150 px; raw backticks in every guess reveal; "Continue: this lesson" links a page to itself and Test leads print skill ids in about 15 lessons; TR0's sync questions print code PyTorch would refuse; the Tests of TR0 lessons 3 and 5 grade earlier lessons' skills; `/m/tr0` counts Test answers as game runs; the printed grade command records the most help; a synthetic receipt is credited; the Markdown export calls every Test "Practice". No open finding is classed broken.

**Holes in the checks:** the pull request's CI runs the smoke project only; the features project runs whole only in a nightly that is dispatched by hand; the merge gate maps nothing for the scene kit, the lab page, Prove, the ledger, the pages and most sims, runs no game's own spec for a kit change, and runs no 320 px check for a data change (wave 1b's `/changes` failure came from `course.lock.json`). A nightly-only test failed after wave 1b was declared finished.

**Room under the frozen gates** [measured, W2m1b-report 5 and 16.1]: front page first-paint JavaScript 148,871 B of 150,000 (1,129 B); `/today` 4,290 B; `/receipts` 4,619 B; `/play/broken-bench` 4,716 B; `receipt.worker` 3,379 B; `three-vendor` 6,511 B. `/today` grew 2,669 B with TR0's lessons, four item families and one game.

**Blocked on the owner, never simulated:** the merge of pull request 12; the `weights` dispatch; the TR0 bank (W2-T17); the pins on a GPU (W1-T02, O-4); the GPU session (W2-T12); 6 to 10 reference traces (W2-T21, O-5); a real-engine run of any GPU lab; the reproduction of TR7's targets; frame time on a reference laptop and phone (O-9); screen-reader passes; the human cold test; the look at re-shot screenshots; `NIGHTLY_ENABLED`; the licence (O-3); launch.

## 2. The cut, and why

The old outline counted about 47 tasks. Counted honestly, wave 2 is 135 tasks and 87 planned merges (section 7): each game is three to five day-sized pieces; the tiers model lacks what the KV offload game needs; 22 defects a learner meets today are open and the gate has holes; every learner-facing piece gets its own fresh check, fix round and confirmation. 87 merges is over 60, so wave 2 is cut in two, each half ending mergeable and deployable.

| Half | Branch | Holds | Planned merges | Learner's gain at the cut |
|---|---|---|---|---|
| 2a | `wave-2m2`, stacked on `wave-2m1b` | The opening, the gate holes, every class A defect, TR0's Tests of lessons 3 and 5, words and paint, TR3 complete in the browser, the capture runbook | 54 | What is published today behaves: the sampler's stage holds still, Tensor views fits a phone, Prove mode tells the truth, TR0's Tests test their own lessons, the header's Start goes somewhere, deep links paint styled. TR3 is live: six lessons, the game Trace attribution with a phone path and a Prove level, the Traces page, eight item families |
| 2b | `wave-2m2b`, stacked on `wave-2m2` | TR5b complete in the browser, the forge lab `kv-publisher`, Prove-it on the three forge labs, TR7's design, sources and draft targets, the cards in the five older modules | 33 | TR5b is live: five lessons, the game KV offload with a Prove level, a forge lab a learner can finish and prove. "In vLLM today" and Build cards in TR1, TR2, TR5a, TR6 and TR8 |

Five changes to the old outline, each for a stated reason.
1. **W2-T24 no longer depends on W2-T23, and W2-T33 no longer on W2-T31 or W2-T32.** A module closes in the browser when its lessons, game and items are in. Until its lab merges, the module page shows the lab as not published and the KCs only that lab earns keep their `planned:` lines. Reason: otherwise neither module can be live at its cut.
2. **The GPU labs of TR8, TR3 and TR5b (W2-T36, W2-T23, W2-T32) and the nine tasks under them move to wave 3**, as its first block (section 10 carries them as drafted, with the critics' changes). Reasons: the old plan already puts the owner's one GPU session after wave 3, so nothing the owner or a learner waits for comes later; a lab page nobody has run invites a learner to rent a GPU for it; and the block is 14 merges, which would put 2b at 47 planned and about 61 with its reserve. The owner may pull the first of them (the TR8 replay, 7 merges) back into 2b: question N9.
3. **W2-T31 (the 3D scene of KV offload) is not in wave 2.** TR5b's design task weighs each camera against the 2D, as W2b-T26 did for Tensor views (D-074). If no camera carries meaning the roster says 2D and the task is recommended cut (the owner decides, N3). If one does, the scene is wave 3's, off the lessons' path, ending at stills for the owner.
4. **The host-card fit script moves to wave 4**, beside W2-T22, which needs the owner's traces. Nothing in wave 2 reads it.
5. **TR5b's and TR7's invisible groundwork starts early.** W2b-T118, T119, T136 to T140 and T170 to T172 show a learner nothing and touch no file wave 2a's later work touches, so they may be built while TR3's lane runs in series and agents are idle. They merge into `wave-2m2b`, after W2b-T126, and cost 2a no merge.

**A cut line inside 2a, declared now.** 2a is 54 planned merges and about 70 with its reserve (section 7). If, when W2b-T104 has merged, more than half of 2a's reserve of 14 is spent, W2b-T131 and W2b-T132 (TR0's Tests of lessons 3 and 5, two day-sized tasks) move to the head of 2b with their share of W2b-T133 and T134, and W2b-T84's line on `/m/tr0` stays until they land. Nothing else in 2a depends on them.

## 3. Rules every task carries

A task cites these by name. They are complete here; the old plan is not needed.

**G0, the standard gate.** Every task passes, on the merged tip, in CI's environment: the unit suite in four shards from a pristine checkout, `npm run lint`, `npm run typecheck`, `npm run build`, `bun scripts/verify.ts all`, the smoke project on four pinned cores with two workers, and whatever `scripts/gate/touched.ts` maps to the branch's paths, at `--retries=0`. A task lists only what it adds. "Nightly width" is `ES_E2E_NIGHTLY=1` with the smoke project: walks at 360 and 1280 px, `a11y` and `screens` at 320, 360 and 1280 px.

**Never lowered.** No task raises or adds a bundle budget, or changes a threshold, tolerance, timeout, retry or skip, a pacing or opener constant, the blind-probe bound, a constant of `tests/seeds.ts`, or a screenshot baseline, except the line its own heading names, held in an allow file a fresh reviewer grants. No entry is added to `scripts/gate/known-red.json`. A new test that needs something the machine may lack fails where that thing is expected and never skips.

**Dependencies, as the task list (kept with the build, not in the repository) writes them.** `deps`: tasks that must have merged before this one starts. `soft_deps`: tasks that must have finished (their branch exists and their acceptance passed) but need not have merged; the task is built on that branch. `merge_after`: tasks that must have merged, or for a check or confirmation finished, before this task's branch enters the gate; the task may be built before then. A check or a confirmation merges nothing, and a dependency on it is met when its report is in. `kind` is build, check, fix or confirm; `merges` says whether the task has a merge.

**MERGE.** One branch at a time through the lock-serialized gate; no batch is planned. Before W2b-T70 merges, only W2b-T69, T180, T96 and T76 may merge: they change no path T70's new rows map. Queue order when several branches wait: tasks on the longest chain first (section 7 lists it), then the kit lock's order, then lane G's order, then the rest in the order they finished. Tracker markers move only in W2b-T125 for wave 2a and W2b-T178 for wave 2b, each in the same commit that adds the ids to `MERGED` in `tests/ci/workflows.test.ts`. No task but W2b-T69, T180 and T126 edits `docs/TRACKER.md` outside its own module's block. If pull request 12 is merged into main during wave 2, the coordinator merges main into `wave-2m2`, and `wave-2m2` into `wave-2m2b`; it does not rebase, because the audit of claimed merges reads merge commits. If the owner squash-merges and a rebase cannot be avoided, it is done once at a half's boundary and the audit is redone.

**KIT LOCK.** `src/games/kit/` and `src/design/` are changed by one task at a time, in a commit of their own that names every game it touches. The order is W2b-T74, T78, T179, T79, T86. A fix round that must change the kit takes the lock: it waits for, and merges after, the kit task in flight. Every kit commit runs every game's primary spec and nightly-width walks itself, and the gate runs them again. No game, lesson or lab task changes the kit.

**ROWS.** A task that touches shared code reports, from `bun scripts/verify.ts bundle` before and after: the front page's first paint, `/today`, `/receipts`, `/play/broken-bench` and its own route. Stop rule: the front page grows at most 30 B, each other game route at most 150 B, and every gated row stays at least 400 B under its gate; otherwise the task stops and reports. No task edits a budget in `scripts/verify-bundle.ts`. The wave's whole allowance on the front page is 600 B of the 1,129 B.

**DC, the defect classes, as acceptance checks for anything a learner plays.** Each is a test that fails before the fix.
- DC-A, nothing moves: the rectangle of every control, readout and stage is the same before and after the press that opens something, the commit, the first move, the first draw and the result; a control that appears under the pointer ignores a second press at the same spot within 0.8 s.
- DC-B, in view: at 1440x900, 1366x768, 1280x620, 1024x768, 412x915, 390x844, 375x812, 360x800, 360x640, 320x640, 844x390 and 640x400, after every move, Tab and Enter, the control of the current decision, the ringed first move and the focused control are wholly in the viewport and topmost at their centre; touch targets are at least 44 px; the goal's number is visible without opening a disclosure. The twelve-size matrix lives in `e2e/<game>-sizes.spec.ts`, which the game's own gate row, the CI features job and the nightly run, and the kit row does not.
- DC-C, keys: Enter or Space pressed twice within 500 ms, or held with `event.repeat`, applies nothing the learner did not aim at; after a commit focus lands on a heading or a value.
- DC-D, one seed: from Start to the result of a graded or Prove run no control, key, reload, Back, Forward, edited URL or second tab gives a second seed in an attempt that counts; Restart and New numbers are absent; Start is disabled until the ledger has answered; a run left before its end is an event the export shows; the foot at a result speaks of the next run only. A new game sets `seedInPage: false` (W2b-T179) and gives its seed to tests through the hook.
- DC-E, true in every state: every sentence that states a fact about the run is built from the state and compared with an independent recomputation on 200 random walks; no goal line or readout, practice or graded, holds the answer to its guess; plurals and units are right at 0, 1 and many.
- DC-F, no self-scroll: `window.scrollY` is unchanged for 5 s with no input at 360x800 and 390x844, under CDP throttling 4x with the intro chunk held 800 ms, on the game's page and on every lesson that embeds it; every `focus()` uses `preventScroll`; Back and Forward leave a result as it was.
- DC-G, reduced motion: with `prefers-reduced-motion`, after every zoom, pan, step, move and result no animation or transition runs and state changes in whole steps. The scan runs after moves, not only at load.
- DC-H, nightly size: seeded properties are written in chunks of 100 seeds; the piece's test files pass once at `ES_PROPERTY_SEEDS=10000`, each test inside 25% of its timeout (a HEAVY run); each new spec passes 5 of 5 at `--retries=0` and 20 of 20 under CDP throttling 4x; its layout assertions pass once against a built site (`vite preview` of a pristine export).

**HEAVY.** Four agents share four efficiency cores, so no task pins four cores, starts busy loops, runs 10,000 seeds or repeats a spec 20 times or more unthrottled on them. Contention is simulated with Chromium's `Emulation.setCPUThrottlingRate` at 4 and 6 through CDP. For a 10,000-seed run, a `--repeat-each` of 20 or more, or a run "on four performance cores", the task writes the command; the coordinator runs it on idle performance cores under the gate's lock, or dispatches `nightly.yml`'s properties job on the task's branch (`gh workflow run nightly.yml --ref <branch>`), before that task merges; the task's report quotes the run. Every task that adds or edits a `*-levels.test.ts` file gets such a dispatch.

**OFFLINE** (N4 option B, AGENTS rules 14 and 15). On the build computer commands run only with `UV_OFFLINE=1`, `UV_PYTHON_DOWNLOADS=never`, `HF_HUB_OFFLINE=1`, `RUSTUP_AUTO_INSTALL=0` and `cargo --offline`, in the existing locked CPU environment, with no other `uv sync`. `enginespace fetch`, any `uv sync` of a GPU environment and any model or dataset line of a lab page are checked by reading them against the manifest and the CLI's `--help`, never run. A checker reports each printed line as "run" or "read, not run (download)". "As far as a machine with no GPU can go" is never the rule; "as far as N4 option B allows" is.

**LES, what a lesson task must show.** The module kit's checks with zero diagnostics, from `tests/content/module-kit.ts` and without the pacing allowance that three older module tests carry; `tests/content/openers.test.ts` and `vocabulary.test.ts`; a first act the learner does, within the opener rule, as the design's table names it; a Test of three questions, one numeric, that tests the lesson's own KCs; a test that no Test variant's first worked step holds its key; every term given before it is used, or in a named earlier lesson that the module page's prerequisite line lists, and a test that this line equals the union of the lessons' "Builds on" lines; every model number `[synthetic]` with its day and commit and recomputed by the module's demos file; no `[measured]` for a run the course has not made; a command taken from a pin's documents tagged `[unverified]`; claims cited by id; code spans render as code; the Read section's reference answer is not visible under an unplayed game; WAIT; its own routes' rows in `e2e/first-visit.spec.ts` and `e2e/support/screens.ts`; lesson JSON under 40 KB; `public/md` and `public/llms.txt` regenerated; ROWS. A lesson task writes at most two lessons; a module's first lesson and its hardest go to opus.

**WAIT, what a waiting state says.** No learner-visible line holds "owner", "pinned" as a build word, a task id or a level id. A waiting line says in plain words what is missing and what the learner can do now. Every table with a dash carries one caption sentence saying why the cell is empty and that the lab fills it with the learner's own number. A module whose browser part runs on model-made data says so on its first screen. `tests/copy/waiting-copy.test.ts` (W2b-T129) holds the first sentence on every rendered route.

**SRC, what a sources task must show.** Each claim holds a URL at the pinned commit or tag, or a version-specific page, with a line range, a quote, and the accessed date; requests use a generic User-Agent and no token; a fetched file is not kept; `bun run verify:claims`, `bun run verify:pins`, and `bun scripts/claims/requote.ts <file>` with no row "moved"; a negative finding names the search and the files; a fact that was not read stays `[unverified]`, is listed, and no lesson, rule table, sim or check may rest on it; research rows are re-read at the pin, not copied. Nothing is copied from the MLC book: it is cited only. A change to `course.lock.json` is followed by `bun scripts/pack-kit.ts` and `--check`, and merges in lane G's order. A network refusal stops the task: it does not write a claim from memory.

**LAB, what a lab task must show.** The 14 rules of the labs map, section 4 (kept with the build, not in the repository): OFFLINE; no network beyond 127.0.0.1 in a test; an injected clock; no download; repack after any kit change; page states only from the four of `src/labs/copy.ts`; a test that needs vLLM is not written and a stub stands in under a `[synthetic]` label; nothing marks a tracker task done while a GPU check is open; nothing is written under `tests/fixtures/receipts/`, `public/references/` or `public/traces/`; ROWS with the `receipt.worker` row.

**CHK, a fresh adversarial check.** A fresh opus context that did not build the piece and reads no builder's report, told to break it. It plays a built site (`vite preview` of a pristine export of the tip its brief names); at 1440x900, 390x844 and 320x640, plus DC-B's sizes for a game; with a mouse, with touch emulation and with the keyboard alone; with reduced motion on and off; once under CDP throttling 4x. It looks for DC-A to DC-G first, then for anything false, lost or dead. It classes each finding broken, rough or nit, with steps and a measured rectangle or count, and ends with "Not checked". It changes nothing and merges nothing; its report goes to the coordinator, outside the repository. OFFLINE binds it.

**FIX, a fix round.** Every broken row is fixed with a test that failed before; rough rows that are small are fixed; the rest are closed in a "Closing lines" section as left for a named later task or for the owner, with the reason. No bar moves.

**CONFIRM.** Before a fix round merges, a fresh opus context re-runs the rows it says it fixed and, for a game, the game's DC-A to DC-G sweep at DC-B's twelve sizes; for a lesson, DC-F and a terms-before-use read of the touched parts. It reports any new broken row, and the coordinator then adds a second round from the reserve of section 7. Each confirmation is a task with an id (W2b-T190 to T209).

**SHOTS.** A task that re-shoots a screenshot baseline attaches the output of `bun scripts/gate/baselines.ts` and the before and after images. A fresh reviewer reads each image against the task's stated change before the allow file is granted and the branch merges. The owner's later look is in addition, and the exit report lists every re-shot image.

**MODULE END.** A technical check (every claim and number against the pinned source, with `scripts/claims/requote.ts` and a hand re-read of what the script skips) and a cold-reader check, by fresh opus contexts that do not see each other's report. Each report is the first commit of the fix branch that follows it, under `docs/waves/`, so a check costs no merge of its own. The next module's lessons do not start until both fix tasks have merged.

**NIGHTLY.** The coordinator dispatches `nightly.yml` and reads all five jobs at the points sections 4.1 and 5 name, and on the final tip after the exit report has merged. A red job is fixed, with an addendum to the report. The wave's description is written only after that run is read, and records it.

**Owner steps, numbers, paths.** No agent simulates an owner step. A synthetic bundle keeps its label. No lesson or page prints `[measured]` for a run the course has not made. Nothing says the owner approved, saw or chose anything but N4, N5 and N8. The repository has no licence and no task adds or claims one (O-3). Gate logs, reports and pull request text hold repository-relative paths only; a grep of each diff for `/home/`, `/tmp/` and the login name finds nothing. A task is handed a map or a report as a file inside its worktree, never a scratchpad path to cite.

**The coordinator's steps that are not tasks.** (1) Open each half's pull request as a draft at its first merge and push after every merge. (2) After W2b-T70 merges: measure the gate on three typical branches (content only, a game, the kit), recompute section 7 from those minutes, and apply the cut line of section 2 if 2a's gate hours with its reserve pass 45. (3) After W2b-T71 and W2b-T73 have merged: read three `e2e-features` runs on a clean tip and list any spec that failed in one, with its count; read the job's result at every nightly dispatch point. (4) The HEAVY runs. (5) The allow reviews of SHOTS and of every moved expect line. (6) The nightly dispatches.

## 4. Wave 2a: lanes, order and collision points

In this section and the next a bare `Tnn` is `W2b-Tnn`. A task marked (check) or (confirm) merges nothing. Ids W2b-T127, T128 and T160 to T169 are not used: the draft gave them to the block that moved to wave 3.

### 4.1 Lanes, with their tasks in merge order

| Lane | Tasks in merge order | What it may run beside |
|---|---|---|
| Gate (first) | T69; T180 beside T70; T71 | Everything else is built meanwhile. Only T69, T180, T96 and T76 merge before T70 |
| D2, the sampler and Prove (holds the kit lock first) | T72 beside T74; T78; T179; T88 (check), T89, T191 (confirm) | Every other lane. T74, T78 and T179 each change the kit |
| D1, Tensor views (serial, the same files) | T73; T79 (kit, after T179); T80; T90 (check), T91, T192 (confirm) | Every other lane |
| D3, Request path (serial) | T85; T86 (kit, after T79); T92 (check), T93, T193 (confirm) | Every other lane |
| D4, TR0's path and records | T77 (after T73); T84; T81; in lane G: T82, T83; T94 (check), T95, T194 (confirm) | TR3 |
| D5, single tasks | T75 with T190 (confirm); T76; T87 | Everything |
| D6, words, paint and TR0's Tests | T129 (after T84, T83, T80); T130 (after T87); T131, T132; T133 and T181 (checks), T134, T199 (confirm) | TR3. T129, T131 and T132 are serial on TR0's lesson files |
| TR3 (serial unless said) | T96; T97 beside T98 then T99; T100 beside T101; W2-T20; T102; T103 (check), T104, T195; T105, T106 beside the game tasks; T107; T108 (check), T109, T196; T110 beside T111; T182 (check), T183, T197; W2-T24; T112; T113, T114, T115 (checks); T116; T117, T198 | The D lanes. It shares no file with them but the collision points below |
| G, the serial lab queue | T82, T83, T38, then T97 if it changes `course.lock.json` | Built in parallel, merged one after the other, each after a rebase and a repack |
| Exit | T120, T184, T121, T122 (checks); T123, T200; T124, T201; T125; the nightly on the final tip, read; the description | Nothing |

**Nightly dispatches (the coordinator's, no merge):** after the last of T89, T91, T93 and T95; after T104; when the last build task has merged, so the final checks read a tip the nightly has seen; on the final tip after T125.

**What an idle agent does in 2a.** TR3's lane is serial from T107 to T117. The D6 lane and the early-start tasks of 2b (section 5) fill that time; neither waits for TR3.

### 4.2 Collision points, for both halves

| Shared file or budget | Who touches it | How lanes stay apart |
|---|---|---|
| `docs/TRACKER.md`, `tests/ci/workflows.test.ts` (`MERGED`) | T69, T180, T126; a design task's own module block; T125 and T178 for markers and `MERGED` | Headings are written by the three opening tasks only. T96, T118 and T170 edit their own module's block. Markers and `MERGED` move together, in the two exit reports |
| `docs/DECISIONS.md` | T180 (the open questions), T70, T71, T96, T118 | T180 reserves D-077 onward by task; a task uses only its numbers |
| `AGENTS.md` and the tracker's agent brief | T69 | One task, both files in one commit |
| `content/kc/graph.yaml`, `tests/kc/graph.test.ts` | T96 (tr3), T118 (tr5b), T170 (tr7); item and lab tasks remove their own `planned:` lines | One block per module |
| `packages/play/registry.ts`, `src/games/registry.ts`, `e2e/levels.ts`, `e2e/support/walks.ts`, `e2e/walks.spec.ts`, `e2e/keep-list.spec.ts`, the game lists of `e2e/a11y.spec.ts`, `src/pages/About.tsx` | W2-T20 in 2a, W2-T30 in 2b | One game registers per half, in the one task that owns its views, with its walkers in the same commit |
| `src/content/render/model.ts`, `tests/content/pending.test.ts`, `src/unbuilt/copy.ts`, `tests/pages/unbuilt.test.ts` | each game and lab task | A task removes its own row and moves its own count, named in its allow file |
| `e2e/routes.ts`, `e2e/support/lessons.ts`, `e2e/first-visit.spec.ts`, `e2e/support/screens.ts`, `tests/content/openers-table.ts`, `tests/content/module-counts.ts` | every game, lab and lesson task | A task appends or edits its own rows; a conflict is a rebase |
| `packages/play/items/registry.ts`, `catalog.ts`, `src/items/families.ts`, `tests/fixtures/items/vectors.json` | T84, T105, T106, T131, T132 in 2a; T143, T144 in 2b | Appends only. Whoever merges second rebases and regenerates `vectors.json` with `bun scripts/verify-items.ts --write`; it is never merged by hand |
| `packages/play/predictions/plan.ts`, `truth.ts` | every lesson task | One block per module, its own `commit-<id>.ts` and `<id>.ts` |
| `public/md/`, `public/llms.txt` | every content task; T77 regenerates all of it once | Generated: after a rebase run `bun scripts/content/build.ts` and commit. `public/claims.json` is never added |
| TR0's lesson files and `content/modules/tr0/module.md` | T80 (one sentence of lesson 1), T77 (the export), T84, T83, T129, T131, T132 | Serial in that order, by the dependencies: T77, T84, T83; T129 after T80, T84 and T83; T131; T132 |
| Lessons of TR1, TR2, TR5a, TR6, TR8 | T129 in 2a; T135 in 2b | Serial. O-19 binds both: TR1 lesson 1's guess 2 of 2 is not moved |
| `e2e/shape-shifter.spec.ts` | T73, T79, T80, T91, in D1's order | T74 and T78 write `e2e/prove-mode.spec.ts` and do not edit it |
| `src/games/kit/`, `src/design/` | T74, T78, T179, T79, T86; a fix round only under KIT LOCK | The lock's order |
| `src/prove/`, `packages/ledger/` | T74, T78, T89; T157 reuses and does not edit the window rule | Serial |
| `src/progress/` | T74 (the one file it names), T87 (`sources.ts`, `useProgress.ts`), T81 (`derive.ts`) | Different files; T81 merges after T74 |
| `src/receipts/challenge.ts` | T82 | One task in wave 2 |
| `packages/sim/trace/`, `src/trace/`, `src/content/render/TraceTape.tsx` | T98, T99, T101, W2-T20, T102 | Serial in that order |
| `packages/sim/tiers/`, `packages/sim/yard/` | T136, T137, T138, W2-T29 | Serial |
| `public/labs/*`, `src/receipts/graders.ts`, `labs/grader/`, `.github/workflows/labs.yml`, `course.lock.json` | T83, T38, T97, T119; W2-T29 for the forge zip | Lane G's serial queue; zips and the wheel are regenerated after a rebase, never merged |
| `.github/workflows/` | T71 | One task in wave 2 |
| `scripts/gate/` | T70 only | One task, with an allow file |
| Front page first paint (1,129 B) | anything shared | ROWS; 30 B a task, 600 B a wave |
| `/today` (4,290 B) | each game and item family: T105, T106, T131, T132, W2-T20, T143, T144, W2-T30 | T87 measures one family's cost and makes room for 19 families and two games before any of them; each consumer has the stop rule |
| `/receipts` (4,619 B), `receipt.worker` (3,379 B) | nothing in wave 2 adds a descriptor or a re-check | Reported by ROWS; the room tasks go with the GPU labs to wave 3 |

### 4.3 Wave 2a's tasks

The per-task paragraphs of this section are not copied here. `docs/TRACKER.md`'s section "Wave 2 of the second build plan: 2a and 2b" holds every task of wave 2a in full, under "Wave 2a: the full headings" (W2-T20 and W2-T24 in its W2 section).

## 5. Wave 2b: lanes and order

Wave 2b's branch `wave-2m2b` opens when 2a's tip is final (after W2b-T125 and its nightly). Collision points are section 4.2's.

**Early start.** These 2b tasks show a learner nothing and may be built during wave 2a, each on a branch off `wave-2m2` (or off its predecessor's branch, by `soft_deps`): T118, T119, T136, T137, T138, T139, T140, T170, T171, T172. None merges into `wave-2m2`. After T126 they rebase onto `wave-2m2b` and merge in this order, one at a time: T118, T119, T136, T137, T138, T139, T140, then T170, T171, T172. If none was started early, 2b's longest chain is 52 agent-hours longer (section 7).

| Lane | Tasks in merge order | What it may run beside |
|---|---|---|
| Opening | T126 | The early-start branches wait for it |
| TR5b (serial unless said) | T118; T119; T136, T137, T138; T139 beside T140; W2-T30; T141 (check), T142, T202 (confirm); T143, T144 beside the game tasks; T145; T146 (check), T147, T203; T148; T185 (check), T186, T204; T149; W2-T33; T150; T151, T152, T153 (checks); T154; T155, T205 | Lane G, TR7, the cards |
| G, the forge lab | W2-T29 (after T136 and T118), T156, T157, T158 (check), T159, T206 (confirm) | Built beside TR5b; T149 waits for W2-T29 |
| TR7, light | T170, T171, T172 | Everything |
| Cards | T135 (after T126), T187 (check), T188, T207 (confirm) | Everything; it is serial with nothing in 2b |
| Exit | T173, T189, T174, T175 (checks); T176, T208; T177, T209; T178; the nightly on the final tip, read; the description | Nothing |

**Nightly dispatches:** after T142; after T159; when the last build task has merged; on the final tip after T178.

### 5.1 Wave 2b's tasks

The per-task paragraphs of this section are not copied here. `docs/TRACKER.md`'s section "Wave 2 of the second build plan: 2a and 2b" holds every task of wave 2b, one line each under "Wave 2b: one line each" (W2-T29, W2-T30 and W2-T33 in its W2 section), until W2b-T126 writes their bodies.

## 6. What a learner can do after wave 2 that they cannot do today

After wave 2 a learner can read a trace as evidence in six TR3 lessons, partition a step's time and name the cause of its largest gap in the game Trace attribution on a desk or a phone, and prove it with their agent closed. They can learn what a KV connector owes the engine in five TR5b lessons, make the unsafe moves and see the wrong output in the game KV offload, build an events publisher in Rust that a reference consumer can replay, and prove a forge lab by predicting their own module's replies. They also meet a site whose published parts no longer move under the hand, hide a control on a phone, miscount what they did or call a Test practice, TR0 Tests that test their own lessons, and cards in five older modules that say what vLLM does today.

**What stays waiting for the owner:** every real run. Trace attribution has no level on captured traces until the 6 to 10 reference traces exist, and says so in plain words; a dash with its caption stands wherever a lesson would print a captured time; host cards stay `[estimated]`; TR0's stage 2 waits for the bank and its 0.001 margin for the `weights` dispatch; the GPU labs of TR8, TR3 and TR5b are not published (wave 3 builds them, the owner's GPU session runs them); TR7 is not published and its targets are a draft; KV offload's 3D scene, if the design keeps one, is not built; frame time on a reference laptop and phone is not measured; no module is marked complete (wave 4).

## 7. The cost

| | Wave 2a | Wave 2b | Both |
|---|---|---|---|
| Tasks | 82 | 53 | 135 |
| of them checks, which merge nothing | 16 | 12 | 28 |
| of them confirmations, which merge nothing | 12 | 8 | 20 |
| Planned merges (build tasks and first fix rounds) | 54 | 33 | 87 |
| of them fix rounds | 12 | 9 | 21 |
| Gate time at a flat 32 minutes a merge, one at a time [derived] | 28.8 h | 17.6 h | 46.4 h |
| Gate time at the mix this plan expects: 33 minutes, and 50 for a kit merge (8 in 2a, 2 in 2b) [estimated until W2b-T70 measures] | 32.0 h | 18.7 h | 50.7 h |
| Reserve for second fix rounds and added tasks, 25% [wave 1b added far more: 49 merges for 30 planned tasks] | 14 | 8 | 22 |
| Merges after the exit report [wave 1b had six] | 2 | 2 | 4 |
| Merges with the reserve | 70 | 43 | 113 |
| Gate time with the reserve, at the mix, with W2b-T70's two planted-break runs [derived] | 42.6 h | 24.4 h | 67.0 h |
| Sizes | 20 S, 49 M, 13 L | 16 S, 24 M, 13 L | 36 S, 73 M, 26 L |
| Agent-hours at the upper bounds [derived] | 464 | 306 | 770 |
| Models, by task | 42 opus, 39 sonnet, 1 haiku | 33 opus, 19 sonnet, 1 haiku | 75 opus, 58 sonnet, 2 haiku |
| Agent-hours by model [derived] | 224 opus, 238 sonnet, 2 haiku | 182 opus, 122 sonnet, 2 haiku | 406 opus, 360 sonnet, 4 haiku |
| Nightly dispatches read by the coordinator | 4 | 4 | 8, and about 9 HEAVY dispatches on task branches |

2a with its reserve is 70 merges, over the line of about 60. Section 2 declares the cut line that brings it back (W2b-T131 and T132 move to 2b), and the coordinator applies it from measured minutes after W2b-T70.

**The longest chain of 2a** is T69, T96, T98, T99, T100, W2-T20, T107, T108, T109 with T196, T110 or T111, T182, T183 with T197, W2-T24, T114 or T115, T116, T117 with T198, a final check, T123 with T200, T125: 126 agent-hours in series at the upper bounds, with 15 merges on it (about 8.6 hours of gate), so about 135 hours, 5.6 days of wall-clock [derived] if no piece needs a second round. A second path runs beside it and has little slack: the kit lock (T74, T78, T179, T79, T86) waits for T70 and ends at about hour 38, where the first path reaches W2-T20 at about hour 37.6 [derived]. W2-T20 therefore starts on T74, T78 and T179 (merged by about hour 24) and only merges after T79 and T86, re-running its sizes spec after the rebase. The kit tasks go first in the queue after the chain's own.

**The longest chain of 2b**, if the early-start tasks were built during 2a, is T126, the queue of seven early branches, W2-T30, T145, T146, T147 with T203, T148, T185, T186 with T204, T149, W2-T33, T152 or T153, T154, T155 with T205, a final check, T176 with T208, T178: 100 agent-hours, 4.2 hours of queue and 13 merges, about 112 hours, 4.7 days [derived]. With no early start it is T118, T119, T136, T137, T138, T139 longer: about 164 hours, 6.8 days.

**The gate is not the bottleneck on average.** In 2a it is busy about a quarter of the chain's time as planned and about a third with the reserve [derived]. It is the bottleneck twice: in the burst after T70 merges, when the D lanes' first branches wait (about eight branches, 5 hours), and at 2b's opening, when the early branches merge. The queue order of MERGE puts the chain's tasks first in both.

**Against the old outline and the draft.** The old outline said about 47 tasks. The draft had 119 tasks and 95 planned merges. This plan has 135 tasks and 87 planned merges: the GPU lab block left for wave 3 (14 merges fewer); the checks grew from 24 to 28 and gained 20 confirmations with ids; five merges were added (the id reader split from the headings, the seed option in the frame, a fix round after TR3's lessons 2 to 4, one after TR5b's lesson 2, one after the cards). Wave 1b, for scale: 30 planned tasks, 49 merges.

**What is not counted:** the owner's time; the minutes of hosted runners; the allow reviews (one short fresh read per allow file, about 30 [estimated]); the two fresh design reads inside W2b-T96 and W2b-T118; a third fix round; W2b-T210 if the design asks for it; any task a check leaves for the owner.

## 8. The owner's steps and questions

**Steps, never simulated.** Each row says what wave 2 builds up to it and what a learner sees meanwhile.

| Step | Built up to it by | Meanwhile |
|---|---|---|
| Merge pull request 12 (wave 1b), then 2a's and 2b's; look at each re-shot screenshot the reports list (14 from wave 1b; more from T83, T85, T86, T130 and fix rounds, each already read by a fresh reviewer) | each half's report | nothing changes. If 12 is merged into main during wave 2, the coordinator merges main into `wave-2m2` and says so |
| Dispatch the `weights` job; then record TR0's bank (W2-T17) with a receipt made from the kit of the tip merged | T83's sentence, W2b-T38's note on repacks | stages 1 and 3 say the course has not yet run the lab on the pinned weights; stage 2 says it awaits the course's reference answers |
| Confirm the pins on a GPU (W1-T02, O-4) | every sources task reads at the proposed pins | pins shown as proposed |
| Capture 6 to 10 reference traces on rented pods, a 4090 and an H100 (W2-T21, O-5) | W2b-T38: the runbook, `trace check`, the intake | Trace attribution and the Traces page say that traces captured from a real engine are not recorded yet and that every trace shown is made by the course's model; host cards `[estimated]`; a captioned dash for a captured time |
| The GPU session: W2-T12's smoke and fixtures | wave 1's runbook | each GPU lab page says it is not published |
| Review and reproduce TR7's targets | T172's draft | TR7 not published |
| Make `e2e-features` a required check; set `NIGHTLY_ENABLED` | T71; the coordinator's dispatches | nothing changes |
| Frame time p95 on a reference laptop and phone, for Trace attribution and KV offload (ARCHITECTURE 11.1, O-9) | the games | both exit reports say it is not measured |
| A look at KV offload's 3D stills, if T118 keeps a scene (wave 3) | the 2D game | 2D only |
| Screen-reader passes; the human cold test, now with TR3's and TR5b's first lessons; real touch devices | each report | nothing changes |
| The licence (O-3); launch | nothing in wave 2 adds or claims a licence | all rights reserved |

**Answered by the owner on 2026-11-19, and kept:** N8 (TR0 is an advised primer), N5 (a Test passes when every question is right; three questions, one numeric), N4 option B (only the locked CPU environment on the build computer; no weights; no other download). Nothing below was answered. Each default is taken by the task named and is the owner's to overturn.

| Question | Default taken | Tasks |
|---|---|---|
| **N2, first: "bubble" or "CPU gap" in TR3's one written form.** It is the one answer that shapes TR3's words | "CPU gap" for the form, the `attribute` goal line and the item stems, because rule 11 asks that each term of a form be what the learner measures in the game, and the game's and the trace model's category is the CPU gap. "Bubble" stays TR2's coined word; nothing published is renamed; lesson 4 says once that the two are the same stretch. The word sits in one key of `src/copy/terms.ts`, so the owner's answer is a one-line change and a regenerate | T96, T100, T106, T111 |
| N1, role lines and the KV offload design | the tracker's lines ("You attribute the gap.", "You publish the events."); GAMES 9's connector game with "publishes each move" as its `publish` level | T96, T118, W2-T20, W2-T30 |
| N3, a 3D scene for KV offload | none unless T118's camera table finds a camera that shows what the 2D does not; then wave 3 | T118 |
| The TR3 brief's other three questions | no unprofiled run per side; no "what changed" table; nothing more of the book quoted | T96, T97 |
| O-3, the licence | none added or claimed; the MLC book is cited only | every task |
| O-4, the pins | vLLM v0.33.0, SGLang v0.5.23, Qwen3-0.6B at `c1899de`, Nsight Systems 2026.5.1 | T97, T119, T171 |
| O-5, the reference traces | 6 to 10 on a 4090 and an H100 | W2b-T38 |
| O-9, the reference laptop and phone | none named; frame time is not measured | T125, T178 |
| O-10, O-14, O-17, O-18, O-21 | full weight; at most 15%, or the gate's reading for a choice item; as built; as built; `[unverified]` | as the tasks say |
| O-13 | the build's light values | wave 3, if a scene is built |
| O-15 (the p99 interval's coverage), O-16 (the Step loop's full service over 200 KB, printed and not gated), O-20 (TR5a lesson 1 asks cold) | as built | no wave 2 task |
| O-19, TR1 lesson 1's instrument edge | as built; if TR1 lesson 1 is edited, guess 2 of 2 is not moved | T129, T135 |
| Q-1, Q-5, Q-6 | no H100 stage required; a proved event is needed; non-NVIDIA out of scope | T170, the Prove tasks, T118 |
| Q-8 (Mini-SGLang as TR1's fork target), Q-10 (who runs the dispatcher table), Q-9 (the name `gpu-verified`), Q-11 (Backend dispatch stays a game) | the documented defaults | no wave 2 task |
| Carried and not re-read: the Step loop's two withdrawn cameras; the front page's first visit in 3D or the diagram; D-068's review cap; a visible cue for `[synthetic]`; the service bell that `StepControl` still draws | as built | no wave 2 task |
| D-073 to D-076, and the builders' choices of wave 1b (the 1.0 logit margin, 12 operations, the 24-hour window after a miss, the declared minutes, ASSESSMENT 7.3's sentence that a left attempt is a miss) | as proposed and as built | T78, T80, T83 |
| N9 (new), the cut: 2a and 2b as section 2; the GPU labs of TR8, TR3 and TR5b in wave 3; the removed dependencies of W2-T24 and W2-T33 | as section 2. The owner may pull the TR8 replay lab (7 merges) into 2b | T180 |
| N10 (new), `kv-publisher`'s stages | the curriculum's six, with the tiers model extended | T118, T136, T156 |
| N11 (new), the seed readable in the page on graded and Prove runs | left as it is in the six built games (Prove rests on an attest box); a new game does not write it and uses the test hook | T179, W2-T20, W2-T30 |
| N12 (new), the name "GPU lab results" | "Lab results" | T83 |
| N13 (new), a "give up" on a graded Tensor views target | not added: it changes graded play. (The practice `grid` line that printed its guess's answer is fixed by T80: it changes no graded play) | T80 |
| N14 (new), `e2e-features` as a required check | not required until the owner sets it | T71 |
| N15 (new), the TR8 lab: what is edited, its model, the dataset | the send loop; Qwen3-0.6B; no fetch of BurstGPT, a seeded generator stands in | wave 3 |
| N16 (new), the clock of the Prove result | 24-hour, as `/receipts` | T74 |
| N17 (new), Tensor views' three practice levels cannot be failed (every path to the target makes one copy) | left as built: a change alters play | none |
| N18 (new), the gate's time per merge | 40 minutes, 50 for a kit merge, as a proposed record; no repository gate changes | T70 |
| N19 (new), one real torch-profiler trace of a small random-weight module, captured in the locked CPU environment and shown in TR3 as the course's own `[measured]` trace | T96 records whether it can be done with no download and where the file would live; built as W2b-T210 from the reserve only if yes | T96 |
| The grader's version at a repack | not bumped before publication; the runbooks say a receipt must come from the kit of the merged tip | W2b-T38 |

**Class C of the leftovers map, and where each goes.**

| Item | Goes to |
|---|---|
| C01 (`/receipts` reads a bundle on the main thread), C02 (the quadratic `join` in canonical JSON) | wave 3, one task before the TR3 lab (section 10) |
| C03 (kernel input recipes) | wave 3, with TR6's lab |
| C04 (what one program of the four walked kernels covers) | T97 |
| C05 (TR0's stage-3 Defend questions can be answered without the run) | wave 3, with the next lab's Defend set, as an acceptance line (section 10) |
| C06 (a new lab's CPU check in the gate's grader row) | wave 3's lab tasks, with an allow on `scripts/gate/touched.ts` |
| C07 (a second thing to do in TR8 lesson 1), C09 (a second read of the moved blocks), C10 in part | wave 4, as the old plan has them; T122 is told to look at the long Sources list and the Test header |
| C08 (the pacing allowance in three module tests) | LES forbids copying it; removing it stays in wave 4 |
| C11 (Backend dispatch, Q-11), C12 (two scene nits) | wave 3; not done unless a scene is next edited |
| C13 (dead loop controls) | T75 deletes `ControlPieces.tsx` |
| C14 (authoring rules 8 to 12; the book cited only) | T96, T97 |

**Dropped, with the reason** (the leftovers map's class E, restated).

| Item | Reason |
|---|---|
| E01, two Prove attempts from two tabs within 30 ms; E02, the reading-window race at 30x throttling | no human reaches them; the disabled-while-reading half is T74 |
| E03, a transient contrast failure on the grid's delta value | did not reproduce; re-opened only if T90 or T192 sees it |
| E04, the seed in the page for the six built games | Prove rests on an attest box and the solver ships in the bundle; kept as N11; new games do not write it (T179) |
| E05, "the briefs cite a book-link rule" | the rule is still in the TR3 brief (line 78), so the re-cite stays in T97; nothing is copied from the book |
| E06, E07, E09, E10, E12, E13, E16 | done, answered or rightly not run in wave 1 |
| E08, kitchen words in field names and golden vectors | a rename risks every state hash for no learner |
| E11, splitting `src/design/parts.css` | not needed while the game routes have room; ROWS's stop rule is its trigger |
| E14, `/design` links seven missing anchors | a showcase page, not a learner route |
| E15, two unit tests that time out under 20-core contention | they pass on the gate's cores; timeouts are frozen |
| Tensor views' `grid` cell minimum at 390 px (W2b-T26's row) | covered by T79's DC-B at 390x844; no separate row |

## 9. Risks, and what the plan does about each

1. **The same defects again.** Wave 1b's tasks passed their own checks and three final checks still found 9 broken behaviours, then 2 more in the fix. Here DC-A to DC-H are acceptance lines of every game task; each game, each module's first lesson, its middle lessons, its last lessons, each lab page, the paint, the words and Prove-it gets a CHK and a FIX as it lands; every fix round has a CONFIRM that sweeps the touched piece again; the final checks are a second net and are day-sized.
2. **A nightly-only failure after the wave is called finished.** T70 maps the scene, the kit, Prove, the pages and the data rows at merge. T71 runs the features project on the pull request; it checks the commits whose runs finish, and the coordinator reads it at every nightly dispatch point. The nightly is dispatched four times a half, the last on the final tip before the description.
3. **The gate edit itself breaks the gate, or makes every merge long.** T70 is one opus task, first, with planted breaks, a test of every row, an unchanged verdict path, and a measured budget of 40 minutes a merge (50 for the kit). The coordinator re-measures three branches after it and recomputes section 7.
4. **Room.** `/today` has 4,290 B and the wave adds 19 families and two games. T87 measures one family's cost first and sets its target from it; every consumer has the stop rule; no budget is edited. If T87 covers 2a but not the wave, a room task precedes T143 from 2b's reserve.
5. **The games are larger than planned.** Each is cut into a sim, a session, the parts a phone needs, and the registration, each a day or less; the blind probe and the marks a graded case needs are measured in the session's first commits.
6. **The trace viewer in the frame and in a lesson.** The session must own the marks. T96 decides the bridge, T101 builds the phone path for the viewer and the lesson block first, and W2-T20's first commit is a skeleton that measures the route.
7. **Upstream reading.** The research rows are older than their 14-day note and hold no quotes. T97, T119 and T171 name each file at a commit or a versioned page; what is not read stays `[unverified]` and is listed; sims and items cite claim ids for every upstream rule; T76 fixes the re-quote script first.
8. **A pin moves (O-4).** Claims are read at a commit; if the driver gate moves vLLM to v0.32.0 every sources file is re-read with `scripts/claims/requote.ts`.
9. **A learner leaves TR3 because nothing in it is real.** Every command is `[unverified]` and no captured time exists. So each lesson opens on something the learner does (T96's table), every empty cell says why, the module page says on its first screen that the traces are the model's, and N19 asks whether one trace the course really made can be shown.
10. **One term, two words.** N2's default keeps both words, each with one meaning, tied by one sentence and one test. If the owner prefers "bubble" everywhere, it is one key.
11. **The cost.** 87 planned merges and about 113 with the reserve, not 47. Two shippable halves; a declared cut line in 2a; the GPU labs in wave 3.
12. **Two half-waves stacked on an unmerged pull request, and early-start branches that age.** Merges, not rebases, carry main forward. An early-start branch rebases once, onto `wave-2m2b`, and re-runs its acceptance there; the files it touches (a brief, a claims file, `packages/sim/tiers`, `packages/sim/yard`, `packages/play/switchyard`, an unregistered folder under `src/games/`) are touched by no 2a task.
13. **Lanes collide.** Section 4.2, the kit lock, and one lab queue.
14. **An agent lowers a bar, widens a test to make it pass, downloads, or claims an owner's choice.** The bars check and the allow files stand; T75 and SHOTS say what a test or a baseline may change; OFFLINE binds builders and checkers; every task's last line names the default it takes.
15. **Agents starve each other.** HEAVY keeps long runs off the four shared cores.
16. **This plan's own sizes.** Every size is an estimate. T96 and T118 confirm their lanes' task lists; T126 writes 2b's bodies from what 2a showed.

## 10. What changes in waves 3 to 5

**Wave 3** gains, as the first block of its lane G, the GPU labs of TR8, TR3 and TR5b. The block as drafted, in merge order, with what the critics added; its tasks take new ids when wave 3 is planned:
1. Lab descriptors leave `/receipts`: `challenge.ts` reads a small table of stage ids and command lines, and a descriptor loads by lab id through `import()`. Accept adds DC-F on `/labs/tr0.forward` under CDP throttling 4x, since the page gains a loading state.
2. The receipt worker loads a lab's re-checks on demand. Accept: the `receipt.worker` row measures the entry plus the largest lab re-check chunk reachable from it, against the existing 60 KB, inside the same row, with no new budget; a test fails if a chunk reachable from the worker is counted by no row; the allow file names every changed line of `scripts/verify-bundle.ts`, and a fresh reviewer confirms before the merge that no byte the worker can load has left measurement; if this cannot be met the task stops and reports.
3. `/receipts` reads a bundle in a worker of its own, and canonical JSON loses its quadratic `join` (C01, C02), before any lab whose bundle carries a trace.
4. `bench-log@1` names its GPU; the grader's ports of the workload generator, the plan and the summary with cross-language vectors; the grader's open-loop client with a stand-in server.
5. W2-T36, the TR8 replay lab to its synthetic acceptance; a CHK of `/labs/tr8.replay` (opus, M) and its fix round.
6. A trace and a request log from one simulated run; the TR3 lab's grader side, which depends on TR3's sources and cites a claim id for every vLLM behaviour its stages encode; W2-T23; the TR5b lab's grader side; W2-T32; a CHK of both pages (opus, M) and its fix round.
Rules the block carries: OFFLINE for builders and checkers; each Defend set's Accept line "a blind probe answers each question at most at the set's chance bound without the receipt" (C05, TR0's stage 3 among them); each lab's CPU check joins the gate's grader row (C06); each GPU lab page says, before its download, that nobody has run the lab end to end on a GPU, that a learner who rents one may meet errors the course has not seen, and that a receipt may need remaking when the course runs it. The block is about 14 planned merges. If agents are idle in 2b's serial tail, the coordinator may have the block's invisible tasks (items 2 to 4) built early, as section 5 does; they merge in wave 3.

Wave 3 also gains W2-T31 (KV offload's 3D scene) with its own CHK and FIX, only if T118 kept a scene. Its "one runbook for the owner's GPU session" covers the TR8, TR3 and TR5b labs, the hybrid model's pin and the connector's registration keys, for rented pods. TR7's lessons start from T170's design, T171's claims and T172's draft, and re-run T171's census so that the figure printed is that run's. W2-T25 to W2-T27 (TR4), W2-T34 and W2-T35 stay in wave 3. TR4 is sized as wave 2's modules were: a design with a first-act table, sources, a sim, a session, the game in the frame with a phone path, items in two halves, lessons with a check after the first and after the hardest, the module end, a confirmation for every fix. The old 33 tasks are an undercount by about the same factor as wave 2's, and wave 3 is cut in two when it is planned.

**Wave 4** gains the host-card fit script, beside W2-T22. The level of Trace attribution on captured traces, the level on the learner's own trace and the nsys table names wait there for the owner's traces. W2-T39 to W2-T41 stay in wave 4: W2b-T112 and W2b-T150 do W2-T39's share for TR3 and TR5b and do not close it. The pacing allowance in three module tests, the second read of the moved blocks, and `requote.ts` in the nightly's reports job stay there. Module completion (Q-5) reads proved events from four sources: Prove mode, "Defend your receipt", Prove-it on a forge lab, and the GPU labs' Defend sets.

**Wave 5.** Unchanged, but the capstone's browser part (W3-T03) stands on Trace attribution as built in 2a, with its list mode.

**Every later wave** opens with the gate and CI as T70 and T71 leave them, plans its checks and confirmations as tasks with ids, sets markers only in its exit report, and puts the nightly on the final tip before its description.

## 11. What changed from the draft

The critics' 56 findings and what was done about each are in a file kept with the build, not in the repository. In short: markers move only in the exit reports; the frame gains a seed option before the new games (W2b-T179); the Markdown export names a Test (W2b-T77); N2's default is written into the repository's own rule and held in one key; every KC has a family, a level or a stage; the gate does not run a 10,000-seed file and holds a measured time per merge; checkers and builders run offline; D6's defects moved into 2a and TR5b's design and sources into 2b as early starts; the GPU lab block moved to wave 3; checks grew and confirmations became tasks; DC-G (reduced motion) and WAIT were added; the cost was recounted with a 25% reserve.
