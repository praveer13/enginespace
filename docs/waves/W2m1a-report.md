# Wave 1a exit check

**Status:** the exit record of wave 1a of the next build (the gate, the defects a learner meets today, and the tooling the unwritten modules need), for the owner's review of the wave's pull request into `main`. **Date:** 2026-11-20. **Task:** W2b-T44 (opus). **Build checked:** `wave-2m1a` at `114ded7` (`114ded77a2f4a2652816f549385b7ecc3e114fda`), the merge of W2b-T15, the last task of the wave. **Base:** `wave-r2` at `168e09d`. **Sources:** [TRACKER.md](../TRACKER.md) (the W2b section), [AGENTS.md](../../AGENTS.md), [REDESIGN.md](../REDESIGN.md), `scripts/gate/known-red.json`, the results of the wave's merges and fix rounds, the nightly run of `nightly.yml` dispatched on this branch, and what this check ran itself (§9).

**Tags** follow ARCHITECTURE. A figure tagged [measured] with no date or SHA of its own was measured by this check on 2026-11-20 at `114ded7`, from a pristine export of the tip (an archive of the commit with nothing generated in it), on four pinned cores of the 20-core build host, which has no GPU and draws with a software rasteriser. A figure a task measured carries the task's id. Gates and targets are A§11.1's design targets and stay [estimated].

---

## 1. Verdict

Every task of wave 1a merged through the wave's merge script, which re-ran the gates on each merged tip: 27 tasks of the plan, the two the coordinator added in the close (W2b-T54, W2b-T55), and fix rounds for W2b-T04, W2b-T06, W2b-T09 and W2b-T10. W2b-T08, the reserve, did not run: W2b-T40 freed 1,581 B on `/play/broken-bench` (room 115 B to 1,696 B [measured by W2b-T40]), over the 1,000 B at which the reserve would have run, and on the wave tip the route still has 1,433 B of room [measured] (§4).

On the tip: every committed screenshot baseline is the picture the page draws (§6); the heavy unit run and the rejection-sampler rates test pass (§3); the nightly-width browser sweep of the `smoke` and `features` projects passes but for the two known-red tests (§2); `known-red.json` holds two entries, both listed with their reason in §5; and every number, removed assertion, gate file and baseline that the wave moved is accounted for by the sentence of the task that required it (§7).

| Exit line (plan 4.5, tasks.json W2b-T44) | Status | Evidence |
|---|---|---|
| G0 passes on the tip | met | The merge script ran G0 (four pristine unit shards, lint, typecheck, build, `verify all`, smoke on four cores) and the repository's own gates (`scripts/gate/run.ts`, `paths.ts`, `bars.ts`, `baselines.ts`) on every merged tip, the last at `114ded7`; and once more on the merge of this report |
| `known-red.json` holds only what the report lists, with a reason each | met | §5 |
| The bundle table, with the front-page and `/play/broken-bench` rows and the room each now has | met | §4 |
| A spot check of five tasks' evidence against their accept lines | met | §8 |
| `ES_PROPERTY_SEEDS=10000 ES_HEAVY=1 bun test --parallel=2 --timeout 900000` and `bun test tests/forge/rejection-sampler-rates.test.ts` pass once on the tip | met | §3 |
| N4, N5 and N8 with what the owner answered and what wave 1b therefore does | met | §11 |
| `ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features` once on the tip, four pinned cores; Firefox and WebKit recorded as not run | met: 1,664 passed; the 2 failures are the two known-red entries | §2; Firefox and WebKit were not run on this host. They ran on the runner (§2.2) |

---

## 2. The browser sweep

### 2.1 On this host

`ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features --workers=2`, from a pristine export of the tip, CI's environment (so the projects' own retry count), cores 4 to 7, `ES_CHROMIUM` set to the host's headless shell [measured 2026-11-20, 14:58 to 15:32 UTC, load 0.8 at the start]:

- **1,664 passed, 2 failed, 0 flaky, 0 skipped, in 33.5 min.**
- The two failures are the two entries of `known-red.json` (§5), each failing first time and on its retry with "no page links this file yet": `e2e/lab-kits.spec.ts:94` for `enginespace-gpu-kit-0.1.0.zip` and for `enginespace_grader-0.1.0-py3-none-any.whl`.
- No other test failed, and none passed only on a retry: the eleven `receipts-import` tests and the 100,000-span pan that were flaky on the runner at `b5bf755` passed first time here, after W2b-T55's fixes.
- Firefox and WebKit were not run on this host: the command selects the two Chromium projects only, as the plan's exit line asks. Their one test ran on the runner (§2.2).
- The `lab` project was not part of this command.

### 2.2 On a runner: the dispatched nightly run

The owner's step "dispatch `nightly.yml`" was taken once for this branch: run 44695991129 of `nightly.yml`, at `b5bf755` (the merge of W2b-T20, 33 commits before the tip; the close's tasks W2b-T54, T12, T03, T04, T55, W2-T42, T05, T22, T06, T14, T15 and the fix rounds of T04 and T06 are not in it). It is the first time the three browsers and the nightly-size suites ran on a runner for this branch. Its conclusion is **failure** [measured 2026-11-20 from the run's record].

| Job | Result | Time |
|---|---|---|
| `reports` | success | 1 min |
| `lab-profile` | success | 4 min |
| `lab-rates` | success | 11 min |
| `properties` (the unit suite with every seeded property at its nightly seed count) | **failure**: 11,064 passed, 2 failed of 11,108 tests in 388 files, 3,132 s | 53 min |
| `browsers` (the sweep: `smoke`, `features`, `lab`, and the determinism hash in Firefox and WebKit) | **failure**: 1,603 passed, 8 failed, 14 flaky (passed on the retry), 2 skipped, of 1,627 tests | 58 min |
| `report` | skipped (it runs after the others) | |

**The two `properties` failures**, both a per-test timeout of the test's own, which the command line's `--timeout 900000` does not override:
- `tests/play/loop-close.test.ts`, "the blind-strategy bound (ASSESSMENT §4.1) > no habit passes more than 15% of the seeds a draw serves: the best constant configuration in a library of ninety": timed out after 120,000 ms (ran 155,951 ms). The bound itself held where it printed: the best habit passes on 10.5% of 5,150 served seeds.
- `tests/sim/tiers.test.ts`, "the reference publisher and its consumer > the judge passes the reference on 10000 seeds": timed out after 60,000 ms (ran 62,412 ms).
Neither file changed in this wave. Their time budgets are frozen (AGENTS.md, "never lowered"); what to do with a nightly-size test that outgrows its own timeout on a runner is a follow-up (§10). On this host both passed: 94.0 s and 46.2 s against their 120 s and 60 s [measured]; the runner's two cores are slower than this host's four.

**The eight `browsers` failures**, each fixed or decided by a task that merged after `b5bf755`:

| Test | What became of it |
|---|---|
| `[smoke] e2e/walks.spec.ts:61` at 360 px, Rejection sampler, "Greedy target, n-gram draft" (greedy-ngram) | W2b-T14 fixed it (the first move's ring stays on the weight being typed) |
| the same at 360 px, "Five broken accept rules" (mutants) | W2b-T14 (the walk starts from the field the first run leaves) |
| the same two at 1280 px | W2b-T14 |
| `[features] e2e/lab-kits.spec.ts:81` "the manifest lists forge labs and nothing else ..." | W2b-T12 split it by kind; it passes |
| `[features] e2e/lab-kits.spec.ts:87` `enginespace-gpu-kit-0.1.0.zip` linked from `/labs/undefined` | W2b-T12 renamed it "linked from no page yet"; still red, in `known-red.json` by the coordinator's decision (§5, §12) |
| the same for `enginespace_grader-0.1.0-py3-none-any.whl` | the same |
| `[features] e2e/rejection-sampler.spec.ts:157` "a wrong module > a re-plate from p fails round and the chi-square ..." | W2b-T14 (the spec reads the engine's words for the round and chi-square rows) |

**The fourteen flaky tests** (failed first, passed on the runner's retry): eleven of `e2e/receipts-import.spec.ts` (all waiting for the `filechooser` event until the timeout) and the 100,000-span pan of `e2e/trace-view.spec.ts` (0 frames drawn first time; 240 frames at 57.6 fps on the retry), which W2b-T55 found to be races in the test harness and fixed after this run; `[smoke] e2e/a11y.spec.ts:104` at 360 px, `/play/loop?level=close`; and `[features] e2e/ledger-conformance.spec.ts:135`, accept 1 of the conformance suite against IndexedDB. The last two have no task: follow-ups (§10).

**Firefox and WebKit** ran the one test their projects hold, the cross-browser determinism hash of `e2e/loop.spec.ts:324` ("the same seed and the same actions give the same state hash in the browser as under Node"): passed in both (3.9 s, 3.1 s).

**The gate's host list** is empty (§5), so no test is "not checked on this host"; the two specs W2b-T55 examined fail on the runner as on this host and were fixed, not listed.

---

## 3. The heavy unit run and the rates test

`ES_PROPERTY_SEEDS=10000 ES_HEAVY=1 bun test --parallel=2 --timeout 900000`, from a pristine export of the tip, CI's environment, cores 0 to 3 [measured 2026-11-20, 14:58 to 15:36 UTC]:

- **11,138 passed, 0 failed, 31 skipped, of 11,169 tests in 394 files; 206,911,259 expect calls; 2,255 s.**
- The 31 skips are the tests that read the unpacked source tarballs of the pins or the text of the "Inside vLLM" post, which this host does not hold (no source tree is downloaded); none was added by this wave (W2b-T03's gate lists every added skip, and `bars.ts` over the wave prints only its own pattern line, §7).
- The two tests that timed out on the runner (§2.2) passed here: the blind-strategy bound of `tests/play/loop-close.test.ts` in 94.0 s (its timeout is 120 s; the best habit passes 10.5% of 5,150 served seeds against the 15% bound) and the judge of `tests/sim/tiers.test.ts` in 46.2 s (its timeout 60 s).

`bun test tests/forge/rejection-sampler-rates.test.ts` (default size, 8 trials a row), CI's environment, cores 8 to 11: 8 passed, 0 failed, 20 expect calls, 2.5 s [measured]. On the runner the `lab-rates` job passed.

---

## 4. The bundle

`bun scripts/verify.ts bundle` after `npm run build`, at the base (`wave-r2`) and the tip, gzip bytes [measured]. Nothing in the wave raised a gate.

| Row | `wave-r2` | Tip | Change | Gate | Room now |
|---|---|---|---|---|---|
| Front page first-paint JS | 149,650 | 148,119 | -1,531 | 150 KB (target 130 KB) | **1,881 B** (18,119 B over the target) |
| Front page CSS | 23,374 | 23,374 | 0 | 30 KB | 6,626 B |
| Entry closure | 100,444 | 100,444 | 0 | 110 KB | 9,556 B |
| Course index (in the first paint) | 2,327 | 784 | -1,543 | target 6 KB | 5,216 B under the target |
| `/play/broken-bench` | 199,885 | 198,567 | -1,318 | 200 KB | **1,433 B** |
| `/play/engine-floor` | 194,715 | 194,132 | -583 | 200 KB | 5,868 B |
| `/play/pool` | 194,121 | 192,520 | -1,601 | 200 KB | 7,480 B |
| `/play/verifier` | 193,106 | 191,473 | -1,633 | 200 KB | 8,527 B |
| `/play/loop` | 193,935 | 191,432 | -2,503 | 200 KB | 8,568 B |
| `/m/:module` | 180,731 | 181,870 | +1,139 | 200 KB | 18,130 B |
| `/m/:module/:lesson` | 150,400 | 152,315 | +1,915 | 200 KB | 47,685 B |
| `/map` | 175,787 | 177,167 | +1,380 | 200 KB | 22,833 B |
| `/receipts` | 189,657 | 189,765 | +108 | 200 KB | 10,235 B |
| `/today` | 191,476 | 193,041 | +1,565 | 200 KB | 6,959 B |
| `three-vendor` | 238,489 | 238,489 | 0 | 245 KB | 6,511 B |
| `receipt.worker` | 55,750 | 55,750 | 0 | 60 KB | 4,250 B |

The front page gained its room from W2b-T16 (the lesson rows left the course index: 1,561 B [measured by W2b-T16]); the game routes from W2b-T40 (each game route loads one game's record). `/play/broken-bench` had 1,696 B of room after W2b-T40 and has 1,433 B now: later merges spent 263 B of it, each under the gate; this check did not attribute them one by one. The lesson, module, map and today rows grew with W2b-T16's lesson index loader, W2b-T20, W2-T42's blocks and W2-T44's resolver, all well under their gates. `verify:bundle` passed: 60 budgets gated, 3 over a target (the entry closure, the front page's JS and its CSS), 1 skipped (`postfx`, which does not exist yet).

---

## 5. `scripts/gate/known-red.json` on the tip

| List | Entry | Reason |
|---|---|---|
| `red` | `e2e/lab-kits.spec.ts` "every file in the manifest is linked from its lab page > enginespace-gpu-kit-0.1.0.zip: linked from no page yet with its size and hash, and the bytes behind the link are the manifest's, fetched and downloaded" | No page links the GPU kit until the first lab page that uses it is built. The coordinator decided in the close that the GPU kit and the grader wheel get their page rows with TR0's lab page (wave 1b) and not before (§12). The test fails plainly with "no page links this file yet"; it does not skip |
| `red` | the same for `enginespace_grader-0.1.0-py3-none-any.whl` | the same |
| `flaky` | (empty) | Both of the base's flaky tests left it: "Tab and Enter alone win Fill the batch" with W2b-T07 (40 of 40, `--retries=0`), the pool's `same-size` walk at 360 px with W2b-T15 (16 of 16) |
| `host` | (empty) | W2b-T55 made the list (at most six, each with a measured reason, the commit at which it was shown to fail as first written, and the date) and judged both candidates harness races, fixed in the tests' helpers, not limits of the host |

Of the fifteen tests W2b-T02 found red on the base, thirteen left the list in the branch that fixed them: four of `design-parts` and `settings` (W2b-T13, 270 of 270 at `--repeat-each=5`), two 320 px page checks (W2b-T11, 20 of 20), one `rejection-sampler` spec test and four walks (W2b-T14), and one `lab-kits` test (W2b-T12). The two above stay.

---

## 6. Screenshot baselines

`bun scripts/gate/baselines.ts` on the tip, CI's environment, cores 8 to 11: "every committed baseline is the picture that the page draws", exit 0, 18 baselines [measured]. Three baselines changed in the wave; the owner has not looked at them yet; the coordinator has (§12 item 3):

- `e2e/screenshots.spec.ts-snapshots/tr1-lesson-1-1440.png` | W2b-T54 | 2 pixels of the breadcrumb link's underline (x 139 and 143, y 122, under 'TR1 R') are lighter: the module crumb became text plus a span, so the underline is drawn in two runs with a seam
- `e2e/screenshots.spec.ts-snapshots/course-1440.png` and `course-390.png` | W2b-T19 | TR0's row now carries its outcome sentence, "You will be able to read the PyTorch and Triton that engines use.", between its hours and its "Builds on" line; nothing else changed [W2b-T19's report]. W2b-T19 merged before the baseline gate existed, so no allow list named them; they follow from its goal ("give each planned module one outcome sentence in content/course.yaml")

---

## 7. Every bar the wave moved

`bun scripts/gate/bars.ts --base wave-r2 --head wave-2m1a` prints 33 lines. Each is below with the task that moved it and the sentence that required it. Most merged before W2b-T03 made the gate refuse an unlisted line, so most had no allow file; the three allow files the coordinator wrote (W2b-T03, W2b-T55, W2-T42) cover the lines marked "allowed".

| Line (as printed, shortened) | Task | The sentence that requires it |
|---|---|---|
| `number e2e/design-parts.spec.ts:164` ring count `>= 7` to `>= 6` | W2b-T13 | "fix ... the spec only where it asserts something the redesign removed, citing the REDESIGN section"; "no assertion is removed without the REDESIGN section that removed its subject". The comment cites REDESIGN 2.8, whose table removes the Pan; six focusable parts remain on `/design` |
| `removed-expect e2e/lab-kits.spec.ts:82` and `:83` (kinds all `forge-lab`; at least 3 files) | W2b-T12 | "Split the assertion by kind and give each kind its own page-row check. Delete no assertion"; accept "the count of expect calls in the spec has not gone down": five assertions replace the two (kinds in the three, each forge lab names its lab, at least three forge labs, one GPU kit, one grader wheel); 60 to 64 `expect(` calls in the file [measured] |
| `number e2e/lesson-games.spec.ts:61` `42` to `TOTAL_GAME_BLOCKS`; `:62` `26` to `TOTAL_LESSONS - 1` | W2b-T17 | "Replace the hard-coded counts ... with a per-module table"; accept "the edited literals are the task's named allow-list for the bars guard". The sums are 27 lessons, 18 and 21 predictions, 42 blocks [checked in `tests/content/module-counts.ts`] |
| `number tests/content/map.test.ts:227`, `openers.test.ts:55`, `sections.test.ts:24` (`27` to `TOTAL_LESSONS`); `tests/play/predictions.test.ts:74` (`39` to `TOTAL_PREDICTIONS`) and `:79` (to `TOTAL_AFTER_GAME`, `TOTAL_AT_COMMIT`) | W2b-T17 | the same sentence |
| `png course-1440.png`, `png course-390.png` | W2b-T19 | "give each planned module one outcome sentence in content/course.yaml": the course page prints it (§6) |
| `png tr1-lesson-1-1440.png` | W2b-T54 | its Files line names the image; `baselines-allowed` lists it (§6) |
| `gate scripts/gate/bars.ts:1`, `skip scripts/gate/bars.ts:133` (the `SKIP` pattern), `gate scripts/gate/baselines.ts:1`, `gate scripts/gate/paths.ts:1` | W2b-T03 | its goal and Files (`scripts/gate/bars.ts`, `scripts/gate/paths.ts`); allowed. `baselines.ts` is outside its Files line; the coordinator's allow file for W2b-T03 names it |
| `gate scripts/gate/run.ts:1` | W2b-T02, W2b-T43, W2b-T55 | W2b-T02: "The gate runs touched specs and walks with --retries=0 ..., re-runs a listed flaky test once and no other" (the runner); W2b-T43 extends it with the lab steps; W2b-T55's Files name `scripts/gate/run.ts` (allowed) |
| `gate scripts/gate/touched.ts:1` | W2b-T02, W2b-T43 | each task's Files line names `scripts/gate/touched.ts` |
| `known-red scripts/gate/known-red.json:4` and `:9` (the two `lab-kits` entries) | W2b-T02, then W2b-T12 | W2b-T02 created the file: "known-red.json records the base's failing set". W2b-T12 renamed the two entries when it renamed their tests ("give each kind its own page-row check"); they stay by the coordinator's decision (§5, §12). Relative to `wave-r2` every entry is "added", because the file did not exist there |
| `bound scripts/verify-games.ts:490` (the summary line) | W2b-T40 | Files name `scripts/verify-games.ts`; accept "verify:games fails when the record loaders, the components and packages/play/registry.ts list different ids". The line is a `console.log` that now also counts record loaders: no bound changed |
| `removed-expect tests/play/registry.test.ts:148`, `:149`, `:150`, `:155` (`resolveGame` with a registry) | W2b-T40 | "Make the game page resolve an id through a loader of that one game's record; src/games/registry.ts no longer imports the value GAMES": `resolveGame` lost its registry argument, and the same cases are asserted against the new signature and `loadGame` (a game is its component and its record loader; either missing is unknown; `constructor`, `toString`, `__proto__` are unknown) |
| `number tests/content/load.test.ts:27` globs `4` to `5` | W2b-T16 | "move the lesson rows to a second generated file that pages load on demand": one more glob, in `load-lessons.ts`; `load.ts` keeps its one |
| `number tests/front/shell.test.ts:237` (`module.lessons.length > 0` to `module.published`) | W2b-T16 | "The front page uses only the module rows, whether a module is published, and the course's first lesson. Keep those in index.json": the index has no lesson rows to count |
| `removed-expect tests/schema/compiled.test.ts:146`, `:147`; `number :171` | W2b-T16 | the same sentence: the module route is still asserted from the index, the lesson routes from the new lesson index, and "planned means no lessons" became "planned means not published" |
| `removed-expect tests/map/outcomes.test.ts:39` | W2b-T19 | "Move OUTCOME_KCS out of src/map/outcomes.ts into each module.md's front matter": the row count is asserted from the compiled module (`outcome_kcs` has one list per outcome), and TR2's fourth outcome keeps no KC as its accept line asks |
| `removed-expect tests/schema/content.test.ts:306` | W2-T42 | allowed: the two card kinds gained front matters of their own, so the refusal's message changed |

No line is unaccounted for. No budget of `scripts/verify-bundle.ts`, no timeout, retry, tolerance or seed constant moved.

---

## 8. Spot check of five tasks

| Task | Accept line | Evidence checked | Holds |
|---|---|---|---|
| W2b-T17 | "the sums equal 27, 39 (18 and 21) and 42" | `tests/content/module-counts.ts` on the tip: lessons 7+7+4+5+4 = 27; after-game 9+4+5 = 18; at-commit 6+4+2+5+4 = 21; game blocks 8+9+9+8+8 = 42; tr0, tr3, tr4, tr5b and tr7 at zero | yes |
| W2b-T12 | "the count of expect calls in the spec has not gone down" | 60 at `wave-r2`, 64 on the tip; "the three tests ... pass and leave the red list": one did, two stay by the coordinator's decision | yes, with the decision |
| W2b-T40 | "/play/broken-bench gains at least 1,500 B of room [estimated]" | 115 B to 1,696 B at its merge [measured by W2b-T40]; 1,705 B when the reserve was judged [measured by W2b-T08's note]; 1,433 B on the tip [measured]; "the front page's row does not grow": 149,650 to 149,676 B at its merge (+26 B of import names) [measured by W2b-T40], then down to 148,119 B after W2b-T16 | yes at merge; the front row grew 26 B, which its report states |
| W2b-T16 | "the gain is reported against about 1.3 KB [derived]" and "no baseline under e2e/screenshots.spec.ts-snapshots changes" | 149,663 to 148,102 B, 1,561 B [measured by W2b-T16]; base to tip 1,531 B [measured]; no baseline in its commit (`git show --stat 1bb3964`) | yes |
| W2b-T13 | "All four pass five of five and leave the red list" | 270 passed, 0 failed with `--repeat-each=5 --retries=0` [measured by W2b-T13]; four entries left `known-red.json` in its commit; the lowered ring count cites REDESIGN 2.8, whose table removes the Pan [checked] | yes |

---

## 9. What this check ran

- A pristine export of `114ded7` (git archive into an empty folder, `node_modules` hard-linked, a scratch git init), removed afterwards. Unit runs on cores 0 to 3, the browser sweep from a second export on cores 4 to 7, all in CI's environment (`CI=true`, `GITHUB_ACTIONS=true`, the agent variables unset).
- `bun scripts/gate/bars.ts --base wave-r2 --head wave-2m1a` (§7) and `bun scripts/gate/baselines.ts` (§6) in a worktree at the tip.
- `bun scripts/verify.ts bundle` at the tip and at `wave-r2` (§4).
- The record and the log of nightly run 44695991129, read only (§2.2).

---

## 10. What a learner gains, and what is still wrong

**What a learner gains from this wave.** Every class-A defect found at the end of wave R is fixed:
- **Request path:** a mouse click that lays a stage no longer moves the page or brings the stage above under the pointer, at a desk or on a phone, on the levels whose filter chips vanish as well (W2b-T04 and its fix round); after the first run's commit, focus is on the stage the intro points at (W2b-T05); a click in the filter field on a short desk moves nothing, and a focused chip is not hidden by the dock (W2b-T06 and its fix round).
- **Step loop:** when the level ends, focus is on the result, so Tab and Enter alone win "Fill the batch" every time (W2b-T07); a dead control is gone (W2b-T45).
- **Broken benchmark:** no field and no heading of the report form sits under the pinned readout, and two meaning lines no longer wrap to three (W2b-T09).
- **Phone, first run:** the dock's controls no longer flash before the intro (W2b-T10).
- **320 px:** `/changes` fits its width, and TR2 lesson 2 passes axe (W2b-T11).
- **Rejection sampler:** the first move's focus ring stays on the weight being typed (W2b-T14).
Besides the fixes: Review now reschedules ideas from the learner's predictions, and `/evidence` shows "How sure you were" in words (W2-T44); a lesson's Test shows its pass rule above its questions, and two level names are plain words ("part-worked", "new setting") (W2b-T20); the course page gives each planned module its outcome sentence (W2b-T19); and the front page's first paint is 1,531 B lighter (§4). The trace block, "In vLLM today" and the Build row are built (W2-T42), but no lesson uses them yet.

**What is still wrong, by the owner's bar of the best course in the world on these topics.** The course a learner meets has the same 27 lessons in five modules as before this wave. TR0, TR3, TR4, TR5b and TR7 are unwritten; no lab has been run on a real engine; no lab page links the GPU kit or the grader wheel. This wave built the floor the next modules stand on (a gate that runs what a branch touches, refuses a lowered bar, a stale baseline and a leaked path; counts that grow by a row; outcomes in their module; a course start that is a key), which a learner does not see. More specifically:
- The nightly sweep on the runner is red (§2.2) at `b5bf755`. Its eight failures are fixed or decided on the tip, but the `properties` job's two timeouts are not: two nightly-size tests outrun their own timeouts on a runner, and their timeouts are frozen. Without a decision, the nightly stays red.
- Two flaky tests on the runner have no task: `e2e/a11y.spec.ts` at 360 px on `/play/loop?level=close`, and the IndexedDB conformance test of `e2e/ledger-conformance.spec.ts`. `e2e/forge.spec.ts:371` waits for a file chooser the way W2b-T55 found racy.
- The nightly workflow's schedule is off, so nothing checks the three browsers or the nightly-size suites unless someone dispatches it.
- The fresh checkers of the close judged W2b-T04 and W2b-T06 "new-problem"; each had a fix round that merged with tests that failed before it, and no checker has looked again since. What their reports leave open on the Request path: at 1280 x 800, after three lays in a row from the list's foot, the visible part of the list can be empty until one scroll up; the pinned filters keep the height of a vanished chip row (40 to 80 px of gap) until the learner changes a filter or restarts; a typed letter in the filter field shifts the page 48 to 240 px at sticky sizes; on a phone, the pinned parts move 13 to 34 px as the drawing above grows, and some Tab stops stand under the filters at 390 x 844.
- The human cold test of REDESIGN 5.5 and the screen-reader passes have not been done.

---

## 11. What the owner answered before wave 1b

Before wave 1a ended the coordinator put three questions to the owner, each with a default. The owner replied on 2026-11-19: "1. agree 2. what are best options 3. keep the currnt". The numbers are, in order, N8, N4 and N5. For N4 the coordinator then set out options, and the owner replied: "b".

| Question | The owner's answer | What wave 1b therefore does |
|---|---|---|
| **N8.** Does TR0 become the course's start? The default: no, TR0 is an advised primer and the course starts at TR1 lesson 1 | "1. agree" | The default stands. TR0 is an advised primer, the course starts at TR1 lesson 1, and the map says TR0 helps. W2b-T41 made the start one key of `content/course.yaml` (`start: tr1`); changing it later means new front-page copy, about twenty expectation edits and re-shot baselines |
| **N4.** What may an agent download or install? | "2. what are best options", then "b". Option B, as it was put to the owner: agents may install the locked CPU environment on the build machine (CPU-only torch 2.14.0, transformers 5.19.0 and the Triton 3.8.0 wheel, in an isolated uv environment at the lockfile's pins) and nothing else; no model weights on the build machine; the TR0 argmax bank stays the owner's step; if torch cannot load on the build machine, the work falls back to CI and the owner is told | Not the default this report first gave (nothing installed, W2b-T49 not starting, TR0 lesson 4 without the interpreter walk-through). Under option B the locked CPU environment is installed, W2b-T49 starts, and TR0 lesson 4 has its interpreter walk-through. The weights job of `labs.yml` still waits for the owner's dispatch, and `labs.yml` on the wave's pull request remains the evidence for W2-T13, W2b-T48 and W2b-T31 where torch cannot load here |
| **N5.** The pass rule of a lesson's Test: every question right (the built page) or 2 of 3 with one numeric (ASSESSMENT 4.2) | "3. keep the currnt" | The page's rule stays: every question right. Every Test holds three questions, with at least one numeric |

---

## 12. Decisions the coordinator took in the close, for the owner to overturn

1. **The GPU kit and the grader wheel get their page rows with TR0's lab page, and not before.** Until then the two `lab-kits` tests stay red in `known-red.json` (§5) and fail with "no page links this file yet". The other choice is a page row now on a page that does not use them.
2. **The gate's host list.** The merge gate may set aside, under "Not checked on this host", up to six tests that the build host cannot pass and that a measurement judged a limit of the host, each with its reason, commit and date; every other failure of the same file still refuses the branch. The list is empty today. Since the nightly schedule is off, a test on it would be checked by no machine until the nightly is dispatched (AGENTS.md says so).
3. **Three re-shot baselines** (§6) merged without the owner's look that W2b-T03's rule asks of a re-blessed image: W2b-T19's two merged before the rule existed, and W2b-T54's was allowed by the coordinator. On 2026-11-20 the coordinator read the old and the new image of all three: in `course-1440.png` and `course-390.png`, TR0's row gained its outcome sentence and nothing else moved; in `tr1-lesson-1-1440.png`, two pixels in the crumb's underline are lighter. The owner has not looked yet.
4. **W2b-T08 was not run** (§1).
5. **The wave's pull request goes into `main`**, not into `wave-r2`, which has merged.

---

## 13. After this check: the final independent check and a second nightly run

Sections 1 to 10 describe `114ded7`. Three merges followed: this report (`eb2f9ea`), the correction of §11 to the owner's answers (W2b-T56, `98643c1`), and W2b-T57 (`527a80a`), which is the wave's last change to what a learner meets. This section was added on 2026-11-20 by the coordinator and supersedes §10 where the two differ.

**The final check.** Two fresh checkers tested `eb2f9ea`, each with its own scripts and no task's report to lean on.

- **Request path (opus):** 972 mouse lays (8 levels at 6 sizes) and 3,357 keyboard stops played to the debrief. The five merges of the wave hold at the sizes their tasks name. The verdict was still "fix first", for five faults it classed broken. One was new: W2b-T04's fix traded the 48 px page jump at the page's foot for an empty list window after 3 to 5 lays in a row there, with 11 to 28 stages left and no cue. Four were as old as the wave's base (`wave-r` at `845e022`): on a phone, a lay at the foot of the list box brought the tile above under the finger (129 of 162 lays); at 1280 x 620, laying the top tile in view moved the page 48 px; on a phone, 2 to 5 Tab stops on filter chips per level were hidden; on a phone, the head of the stop message was cut off.
- **Every other screen the wave touched (sonnet), beside `wave-r2` at `168e09d`:** 57 documents at 1440, 390 and 320 px with no console error, no failed request and no sideways scroll; nothing slower to appear than on the base. Nothing was classed broken. One rough finding is new on the wave: at 320 x 700 and 360 x 640 a lesson's "Next part" bar is hidden for about 90 px of scroll while the section strip passes under it (from W2b-T11). Eight other findings behave the same on the base.

**W2b-T57 fixed all five broken faults** (`527a80a`), each first reproduced on the tip by a test that failed there (12 of 13 new browser tests failed before the change; the 13th is a control case). No existing test line, expectation, timeout or baseline moved. A second fresh checker tested `527a80a` from a pristine export and found all five gone at their steps and sizes. `/play/engine-floor` is now 195,141 B, 4,859 B under its 200 KB gate [measured by W2b-T57].

How each is fixed, in a learner's terms: at a desk the list no longer moves while the pointer is over it, and when the visible band holds no whole stage the pinned bar says "More above"; one notch of the wheel then brings back three or more stages. On a phone, a lay at the foot of the list box keeps the laid row's room, so nothing moves under the finger. A filter chip that takes keyboard focus is scrolled whole into its row. The stop message shows its head first.

**What the final check leaves open on the Request path** (none classed broken; wave 1b takes them as one task):
- At a desk, the emptied band shows a bare "More above" in a blank area; on a phone, three lays in a row from the box's foot leave the box showing only "More above" until it is swiped.
- The pinned filters keep the height of a vanished chip row (a 64 px gap that drops 128 px on the first letter typed); typing at the page's foot moves the field 69 to 137 px; clearing the field can move the dock 300 px.
- On a phone: the pinned parts move 13 to 26 px as the drawing grows; "Run the path" is half covered; "Remove last" jumps 244 px after a stop; the widest chip is clipped at 360 px and chips are cut at the screen's edge at 320 px.
- At 1280 x 800 the first run's guess is cut off and Commit is below the dock's fold.
- The first checker's judgement on the cause: the page is the list's scroller, the list shrinks as stages are laid, and two pinned parts stand over a band of only 181 to 245 px. A list box of fixed height at desk sizes would make the hold logic of W2b-T04 and W2b-T57 unnecessary. Wave 1b decides that as a design task, with the measurements of both checkers.
- Not tested by either checker: the game inside a TR1 lesson (the lesson's Run part did not load on a cold visit in the checker's script; the nightly's lesson-games tests do play it).

**The second nightly run on a runner** (dispatched by the coordinator on `eb2f9ea`, before W2b-T57; run 44770006410):

| Job | Result |
|---|---|
| `browsers` | 1,664 passed, 2 failed, 2 flaky, 2 skipped. The 2 failures are the two `known-red.json` entries of §5 (the GPU kit and the grader wheel, linked from no page yet). The 2 flaky tests: `e2e/forge.spec.ts:366` (the file chooser race W2b-T55 described) and `e2e/lesson-games.spec.ts:105` at 1280 px on TR2 lesson 3 |
| `properties` | failed on the same two tests as the first run, each over its own frozen timeout: the blind-strategy bound of `tests/play/loop-close.test.ts` (139,326 ms against 120 s) and the judge on 10,000 seeds of `tests/sim/tiers.test.ts` (61,448 ms against 60 s) |
| `lab-rates`, `lab-profile`, `reports` | passed |

So the first run's other failures are gone on a runner, and the two flaky tests §10 names (`e2e/a11y.spec.ts` at 360 px, `e2e/ledger-conformance.spec.ts`) did not recur in this run. The nightly stays red until the two `properties` tests fit their timeouts (wave 1b splits their seeds across tests; no timeout is raised) and until TR0's lab page links the two files. The nightly was not dispatched again on `527a80a`: the pull request's own twelve checks passed there.

**Corrections to §10.** Its sentence that no checker had looked again at W2b-T04 and W2b-T06 since their fix rounds no longer holds (above). Its list of what was open on the Request path is replaced by the list above.
