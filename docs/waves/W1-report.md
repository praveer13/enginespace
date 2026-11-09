# W1 exit review

**Status:** the exit record of wave 1, for the owner's review of the `wave-1` PR, which stacks on `wave-0`'s (PR #1). **Date:** 2026-11-08. **Task:** W1-T38 (opus). **Build reviewed:** `wave-1` at `35d5fd3` (`35d5fd3d62c78eb05fc04dc4dd747d62169f57fb`), the merge of the W1 documenter's DESIGN.md, the last merge before this review. **Sources:** [TRACKER.md](../TRACKER.md) (W1's tasks and exit criteria), [ARCHITECTURE.md](../ARCHITECTURE.md) (A§n), [GAMES.md](../GAMES.md), [ASSESSMENT.md](../ASSESSMENT.md), [DECISIONS.md](../DECISIONS.md) (D-nnn, O-n, Q-n), the results of W1's merges that the orchestrator passed to this review (the first run, 2026-11-04 to 2026-11-05, and the close-out, 2026-11-08), the finish reviewers' 16 reports, the gate audit's three finders, and what this review ran itself (§13).

**Tags** follow ARCHITECTURE. A figure tagged [measured] with no date or SHA of its own was measured by this review on 2026-11-08 at `35d5fd3`, on the host of §2. A figure that a W1 task measured carries the task's id. Gates and targets are A§11.1's design targets and stay [estimated]. Task ids, counts of named things and list numbers are not quantities and go untagged.

---

## 1. Verdict

W1 built every task of its tracker but the owner's two and this review. Every build task merged into `wave-1`, every gate passes at the tip, D-023's frozen budgets hold again, and the five modules and their five games are live. It did not close its loop, and four things stand between W1 and a clean exit:

- **Eleven KCs have no graded artifact, so this review's own first check fails.** The lessons name 26 item families, and W1 built 8. No W1 task was asked for the other 18: the content tasks were asked for lessons, and each said so in its result. So 17 of the 27 lessons end on an exit ticket that cannot be passed, Today can draw items for 9 of the 45 KCs and none of TR1's, TR5a's or TR8's, and `bun scripts/verify-kc.ts --final` fails on the 11 KCs whose only planned artifact is one of those families (§5). This review removed the 25 placeholders that W1's games, families and labs had answered, and wired the labs' checks into `verify:kc`.
- **Two graded levels that ASSESSMENT names were built as practice.** ASSESSMENT §4.3 and §9 grade `loop/graphs` (its `sizes` and `modes` stages) and `loop/mask`. W1 shipped both as practice and gave `mask`'s graded task to an item family. With the exit tickets above, no W1 module can be browser-complete as §9 reads (§8.2, O-17).
- **No finish review reached `ship`.** Each of the five game surfaces ended `fix` at the round cap. Three faults come back across the four 3D scenes, and one scene-kit task at the start of W2 could take them, with 160 B of room under the scene gates unless it first frees bytes (§7).
- **The process let agents raise frozen gates.** Five records raised D-023's budgets during W1. The close-out restored them (D-059), added a merge guard, and audited every other gate. Nine of the audit's 22 items stay open, and four of them need the owner's ruling (§9.1, O-13 to O-16).

CI has never run on `wave-1`: the wave PR will start it (§4.4).

| W1 exit criterion (TRACKER) | Status | Evidence |
|---|---|---|
| The five modules are live, each with its loop: content, games, a graded browser artifact and Today | met in part | TR1, TR2, TR5a, TR6 and TR8 each have a module page, lessons (27 in all, status `review`) and a game. Each has a graded browser artifact: TR1 `engine-floor/map`; TR2 `loop/close`; TR5a `pool/evict`, `/adapters`, `/manager` and `lab:hybrid-kv`; TR6 `verifier/exact`, `/chain`, `/gamma`, `lab:rejection-sampler` and the `tr6.mask-fits` family; TR8 `broken-bench/due`, `/warm`, `/sure` and `/court`. Today is built on the vendored FSRS (W1-T05). The loop falls short at its last two steps: 17 lessons' exit tickets and Today's draws need families that were never built (§5). |
| Every W1 game passes `verify:games` and the keyboard walks | met | `verify:games` passes on the five games and their 34 levels (§4.2). Keys alone play every level of every game to its debrief at 360 and 1280 px, with focus in view at every stop: the 30 of the five games in the nightly walks, and the front page's four in its keyboard spec (§4.3). |
| The GPU parts of TR1, TR6 and TR8 are announced as arriving with W2 (D-039) | met | Each module page's "The part that needs a GPU" says that its lab (`tr1.fork`, `tr6.proposer`, `tr8.replay`) "arrives with the grader (W2, D-039)", and its Build card does not run it. |

**What the owner decides, in order of urgency:**
1. Schedule the 18 item families as one carry-over task before W2's module tasks, or accept a W1 whose 11 KCs cannot be earned (§5). W1-T38's first check passes once they land and `--final` is run again.
2. Rule on the audit's open findings that touch credit or a design document: A§6.6's shadow-casting lights (O-13), ASSESSMENT §4.1's bound for choice items (O-14), the bootstrap's p99 band (O-15), and the full service's 231,148 B with no gated row (O-16).
3. Ship the five game surfaces with their open fixes listed, or schedule the scene-kit task of §7.4.
4. The owner's tasks: W1-T02's pins (D-035, O-4), W1-T37's screen-reader pass (its notes go in §10.3), and Q-10's dispatcher tables (§10.1).
5. Build `loop/graphs` and `loop/mask` as graded levels, or amend ASSESSMENT to what was built (O-17); confirm W1-T27's change to ASSESSMENT §4.5 (O-18).
6. Name the reference devices (O-9, carried to W2-T41), and answer O-7 and O-8 at the `wave-0` merge. (O-12, which domain the message of 2026-11-08 meant, was answered later that day: D-058 stands.)
7. Accept or change the proposed records that W1 ran on: D-044 above all, whose confirmation was due before W1-T12, and D-059.

---

## 2. The measuring host and the reference devices (O-9)

**The reference devices are still not named.** O-9 was carried to this review, and no file names the owner's laptop or phone, so for a second exit, frame time p95, the first 3D frame and post-processing GPU time have no measurement. DECISIONS carries O-9 to W2's exit, W2-T41.

**Every figure here comes from the owner's dev host,** the machine of W0's report:
- an Intel Core i5-13600KF with 20 threads and 31 GB of memory [measured]. No browser drew with its GPU: every browser check ran headless on SwiftShader;
- NixOS on Linux 6.12.63, Node 22.22.2, npm 10.9.7, Bun 1.3.14 and rustc 1.96.0 [measured];
- Chrome for Testing 153.0.8010.12, Playwright's `chromium_headless_shell-1243`, started through a wrapper that sets `LD_LIBRARY_PATH` for NixOS [measured]. That is the revision Playwright 1.63.0 pins and CI runs; W0's figures came from 149.0.7827.55.

Other agents had finished when this review measured. The load average was 1.3 at the start of the lab profile and 8.3 at its end, its own SwiftShader the load [measured]. The five gates of §4.1 ran at load averages of 3 to 5, and the Playwright run of §4.3 at about 18 to 26, which its own SwiftShader workers made [measured].

---

## 3. Budgets as measured

The counting is D-023's: gzip by Node's zlib at its default level under Bun 1.3.14, one file at a time, in KB of 1,000 B, closures walked over the manifest's static imports. D-059 restored the gates that D-053 to D-057 had raised (§9.1).

### 3.1 The bundle (`verify:bundle`)

63 budgets gated, 1 over a target and 1 skipped (`receipt.worker`, which has no source until W2) [measured].

| Budget (A§11.1) | Gate [estimated] | Target [estimated] | At `35d5fd3` [measured] | At `0512837`, the W0 exit [measured 2026-11-04] |
|---|---|---|---|---|
| Entry and its static imports (`react-vendor`) | 110 KB | 100 KB | 99,153 B: 847 B under the target | 99,559 B (the row then measured the entry's own file, 37,331 B) |
| Front page first-paint JavaScript (25 chunks) | 150 KB | 130 KB | 147,678 B: 2,322 B under the gate, 17,678 B over the target | 148,747 B |
| First-paint CSS | 30 KB | 20 KB | 18,469 B | 16,637 B |
| Any other route, JavaScript and CSS | 200 KB | — | 117,799 B (`/about`) to 187,706 B (`/play/broken-bench`, 12,294 B under); `/play/engine-floor` 186,159 B, `/play/verifier` 183,059 B, `/play/pool` 180,350 B, `/play/loop` 180,430 B, `/m/:module` 179,996 B, `/today` 179,788 B | 116,372 B to 181,059 B |
| `three-vendor` | 245 KB | — | 238,647 B | 238,603 B |
| Each `scene-<id>`, with the chunks only 3D reaches | 40 KB | — | `pool` 39,840 B (160 B under), `verifier` 39,566 B, `engine-floor` 39,560 B, `loop` 39,468 B, `kitchen` 35,844 B, `specimen` 14,894 B | `loop` 16,362 B, `specimen` 13,735 B |
| `scene-kit`, the props every scene that reaches them counts again | 40 KB | — | 22,651 B | — |
| `postfx` | 25 KB | — | 5,498 B | 5,470 B |
| `forge.worker`; `receipt.worker` | 40 KB; 60 KB | — | 2,595 B; no source yet (W2) | no source yet |
| Lesson JSON (27); module JSON (5) | 40 KB each | — | the largest 9,289 B (`tr1.l2`); 3,027 B (`tr6`) | 1,994 B; 769 B |
| Course index | — | 6 KB | 2,304 B | 666 B |
| The front page's document; its three preloaded faces | — | — | 18,966 B; 35,748 B | 8,760 B; 35,748 B |
| The site | — | well under 1 GB | 5,629,563 B in 250 files | 2,093,890 B in 80 files |

What the rows say:
- **The front page has 2,322 B of room** [derived], after W1 took it to 153,808 B under raised gates [measured 2026-11-05 at 72f163e by `es1-merge.sh`] and D-059 brought it back to 147,337 B [measured 2026-11-08 at cb7bc29 by W1 gates restore]. W1-T15's seven lessons have since cost it 341 B through the course index [derived], about 49 B a lesson, which matches D-057's 50 B. The room is about 47 more lessons, if nothing else in the first paint grows [derived].
- **The scenes are the tight rows.** Each of the four game scenes is 160 to 532 B under 40 KB, and every one of them counts the scene kit's 22,651 B and the shared `SheetInstances` chunk again, so a byte added to the kit lands on all four (§7.4).
- **What loads on demand is printed and not gated** (D-059): `route /play/loop with FullService` is 231,148 B, which would be 31,148 B over a route's 200 KB (O-16); `with KeysWaiting` 189,603 B; each item family 15,703 to 17,975 B with what it adds to the entry; `ForgeLabPage` 86,302 B; `TraceView` 62,287 B; the game shell's `KeysDialog` 20,601 B [measured].
- **The document grew** from 8,760 B to 18,966 B gzipped, mostly the two inlined posters of the redrawn 2D kitchen (Service's finish rounds). LCP held (§3.2).

### 3.2 The lab profile (`e2e/perf.spec.ts`, A§11.1's mobile profile)

Chrome for Testing 153.0.8010.12, the CPU 4× slower, 1.6 Mbit/s and 150 ms of round trip, 360 × 800 at 2× with touch, gzip over HTTP, `--enable-unsafe-swiftshader` alone, on the production build of `35d5fd3` [measured].

| Vital | Gate [estimated] | Target [estimated] | At `35d5fd3` [measured] | At `0512837` [measured 2026-11-04] |
|---|---|---|---|---|
| LCP, median of three cold loads | 2,500 ms | 1,500 ms | 884 ms (904, 876 and 884); the heading `h1.es-ticket__title` | 896 ms |
| CLS across the swap to 3D | 0.1 | 0 | 0 in all three, the swap at 6,498, 6,566 and 6,541 ms | 0, the swap at 5.2 to 5.4 s |
| INP, median of three players, 58 taps each over the four levels | 200 ms | 100 ms | 136 ms (136, 128 and 136): over the target. In the middle play the longest interaction had 55 ms of input delay, 47 ms of handlers and 35 ms to present. | 120 ms |

Before the largest paint, 6 requests and 74.0 KB came over the link: the document, 18.4 KB of CSS, 35.7 KB of fonts and 1.0 KB of JavaScript. After it came 44 requests and 495.2 KB, of which 446.9 KB was JavaScript, and the pass drew in 3D at tier 1 [measured]. The INP of 200 to 312 ms that the Service redress read [measured 2026-11-04 by that task] was taken at load averages of 8 to 37; on a quiet host the page holds its W0 figure within 16 ms [derived]. The profile measures the front page alone: no game page has an INP of its own.

### 3.3 Scene budgets (the test hook's `renderer.info`, SwiftShader)

Each scene's draw-call test, run in the `features` project of §4.3 [measured]. A§11.1's gates are 100 draw calls and 50k instances a scene [estimated]; the scene kit's own specimen holds itself to 10 calls.

| Scene, and what its test plays | T1: scene calls (in the frame) | T2: scene calls (in the frame) | Instances, at most | Triangles at T1 and T2, at most |
|---|---|---|---|---|
| Service on `/play/loop`: a whole night of `first-4-par` | 14 (14) | 39 (53) | 80 | 108,164 and 413,652 |
| Service's full service: a night of the mold rack and the comb | 16 (16) | 47 (61) | 157 | 148,764 and 575,884 |
| Back of House: a whole level of the tallest practice house | 11 (11) | 11 (25) | 37 | 174,266 and 174,586 |
| The Reach-In: the house's night on `adapters`, and on `same-size` | 20 (20) and 21 (21) | 34 (48) and 35 (49) | 468 | 292,678 and 403,086 |
| The Tasting: every level, played with its draws | 14 (14) | 38 (52) | 146 | 222,282 and 868,170 |
| The kitchen on `/design`: every piece, and the assembled pass | 12 (12) | 37 (51) | 61 | 85,342 and 329,366 |
| The scene kit's specimen: 10,896 instances | 7 (7) | 7 (21) | 10,896 | 134,830 at both |

Every scene is under both gates. The frame adds bloom and the final pass at T2. At T2 the kitchen draws 3 shadow maps and The Reach-In 2, against A§6.6's none at T2 (O-13); Back of House draws its one lamp with no spot light since its round-2 fix, so its T2 adds no shadow pass. Every game's triangles are over the targets of its GAMES.md section, and every T2 draw count but Back of House's is over its own: Service's targets at T2 are 24 calls and 60k triangles, for example (§8.2). GPU memory is not measured (§3.4).

### 3.4 Not measured

- **Frame time p95** on the reference laptop (target 16.7 ms) and phone (target 33.3 ms at T1), **the first 3D frame** (target 1.5 s) and **post-processing GPU time** at T3 (2.0 ms): by hand on the reference devices, which O-9 has not named. SwiftShader's frame times mean nothing for these.
- **GPU memory per scene:** `renderer.info` counts objects, not bytes.
- **Main-thread tasks over 50 ms during play:** the nightly trace of A§11.1 is not built.
- **INP on a game's page,** and the lab profile on GitHub's runner: the nightly runs only by hand until the owner turns it on (D-052).

---

## 4. Gate status at `35d5fd3`

### 4.1 The five gates of the merge

| Gate | Result [measured] |
|---|---|
| `npm run lint` | exit 0, in 13.3 s |
| `npm run typecheck` (`tsc -b`) | exit 0, in 6.9 s |
| `npm run build` | exit 0, in 11.2 s |
| `bun scripts/verify.ts all` | exit 0, in 123.1 s (§4.2) |
| `npm run test` (`bun test`) | 7,917 pass, 25 skip and 0 fail: 7,942 tests in 266 files, 6,950,826 expect() calls, 428.3 s |

With this review's changes, lint, typecheck, build and `verify:all` exit 0 again, and `bun test` gives 7,921 pass, 25 skip and 0 fail of 7,946 tests in 430.7 s [measured]; the four new tests are the labs' source of `verify:kc` (§5).

The 25 tests that skip here wait on things this host lacks or the owner owns: the source checks of TR1's lessons and of the lifecycle model need the pins' unpacked tarballs and the post's text (`ES_LIFECYCLE_SOURCES`, `ES_INSIDE_VLLM_POST`), the dispatcher tables' two checks wait on Q-10, and the 2,000-seed coverage of the p99 runs only under `ES_HEAVY=1` (O-15). CI skips more, because it has no Rust toolchain and no kernelspace checkout (§12).

### 4.2 The gate registry (`bun scripts/verify.ts all`)

16 gates: 14 passed, 2 pending and 0 failed [measured]. W0's exit had 10 live.

| Gate | Status | What it printed [measured] |
|---|---|---|
| `content`, `claims`, `numbers` | passed | 5 modules, 27 lessons and 648 claims |
| `kc` | passed | 45 KCs (TR1 8, TR2 11, TR5a 8, TR6 8, TR8 10), 7 thresholds, 10 confusable pairs and 24 kernelspace prerequisites. At the tip: 29 with a graded reference, 36 planned and 20 warnings, each a placeholder that a graded reference had answered. With this review's change: 34 with a graded reference, 11 planned and no warning (§5). |
| `items` | passed | 8 families and 23 variants, each level measured on 1,000 banded seeds. Bands accept 82.3% to 100% of candidates; the best blind strategy is 7.3% to 13.8% against 15% on numeric levels and up to 37.9% against a bound of 41.0% on choice levels, which is O-14's reading. |
| `games` | passed | 5 games, each with its display name and subtitle; every practice seed in its band; the share of the first 400 seeds in band runs from 25% (`pool/evict`) to 100%, against a floor of 20% |
| `determinism` | passed | 185 files in scope and 0 findings; `vectors.ts --check`: 9 models and 144 vectors reproduce |
| `boundaries` | passed | 548 files, 17 reachable from `src/main.tsx` without a dynamic import, 0 violations |
| `bundle` | passed | §3.1 |
| `tokens` | passed | 107 roles, 2 schemes, 101 declared pairs, each at its threshold |
| `vendor` | passed | 25 files match VENDOR.md at `d478f91a0af5` |
| `labs` | passed | 3 labs and 27 builds in 109.1 s: each template traps on every check, each reference passes 50 runs on fresh seeds and names itself `@reference`, each solved build passes, and each of the 16 bestiary members is caught by a named check on 50 of 50 runs |
| `pins` | passed | 8 entries of `course.lock.json` |
| `routes` | passed | 17 route-table entries with 67 documents, and the 24 paths of `e2e/routes.ts` each have one |
| `schema`, `vectors` | pending | W2-T01 |

### 4.3 Playwright (`playwright.config.ts`)

All runs used Chrome for Testing 153.0.8010.12 through the wrapper, 2 workers, on the production build of `35d5fd3` in a worktree of its own [measured].

- **`smoke`, the pull-request subset (W0-T21, W1-T36):** 193 of 193 pass [measured]. axe finds no serious or critical violation on the 29 routes and level pages of `e2e/routes.ts` at 360 and 1280 px, nor on the four pages it audits with their 3D pass drawn (`/`, `/play/engine-floor`, `/play/pool` and `/play/verifier`). One moderate `landmark-unique` shows on one node of `/play/pool` with 3D off, at both widths, below the gate, as W0's did on `/design`. No page asks for anything outside the origin and none has its policy refuse anything (`KNOWN_REFUSALS` is empty since D-059); no 3D page asks for a frame once it has settled under reduced motion; the 2D screenshots of `/` match their four baselines within 1%; keys alone win the front page's four levels and play the first level of each of the five games to its debrief, at 360 and 1280 px.
- **`features`, every other spec:** 409 of 410 pass, and with `smoke` the run took 43.3 minutes at load averages of about 18 to 26 [measured]. The one failure, `ledger-conformance.spec.ts:135`, timed out at 1.5 minutes and passed alone in 154 ms [measured], a load flake that W1's tasks had reported before (§9.5). The scene specs' draw calls are §3.3.
- **The nightly walks** (`ES_E2E_NIGHTLY=1`, `walks.spec.ts` and `keyboard-loop.spec.ts`): 70 of 70 pass in 7.7 minutes [measured]. Keys alone play every one of the 30 levels that the front page does not, across the five games, to its debrief at 360 and 1280 px, with focus in view at every stop, and the registry check finds no level without a walk.
- **`lab`, the lab profile:** 2 of 2 pass (§3.2).
- **Not run here:** the rest of the nightly sweep (axe at 320 px on every document, the network and reduced-motion scans of every document, and the determinism hash in Firefox and WebKit).

### 4.4 CI on GitHub

`wave-1` has never been pushed: the remote holds `main` and `wave-0` [measured 2026-11-08 with `git ls-remote`], so `ci.yml`, `deploy.yml`, `nightly.yml` and `labs.yml` have never run on W1's code. The wave PR will start `ci.yml`. What is known from PR #1: its first run failed, and two commits made it green (run 41924657242, 2026-11-04), one of them a real bug that only Chrome 153 showed. W1's e2e-smoke subset grew from 78 tests to 193 in four shards, which ran in 66, 61, 75 and 98 s on this host [measured 2026-11-08 at df76ca9 by W1-T36]; at PR #1's ratio of 4 to 16 times slower per test, a shard is about 11 minutes on a runner [estimated by W1-T36], against A§10.1's 6. The nightly runs only by hand until `NIGHTLY_ENABLED` is set (D-052), and the deploy waits for `PAGES_ENABLED` (O-2 was answered later on 2026-11-08: the repo is public and Pages is on, D-060).

---

## 5. The KC graph, and this review's own check

W1-T03's second check allows a `planned:` placeholder "only until W1-T38, which fails on any that remain". At the tip, 36 of the 45 KCs carried one [measured].
- **20 were answered**, each by a graded game level (`engine-floor/map`, `verifier`'s three, `broken-bench`'s four) or an item family (TR6's five), and `verify:kc` warned on each. This review removed the 20 lines.
- **5 were answered by a lab check that the gate could not read.** `verify:kc` read games and families, and not labs. This review added the source the gate's header had reserved: `packages/sim/forge/kcs.ts` maps each graded lab's checks to the KCs they assess (`hybrid-kv`'s table, which W1-T22 wrote, and `rejection-sampler`'s, with the mapping W1-T27 proposed), and the gate fails a row that names a check the lab lacks. The five TR5a lines that `hybrid-kv` answers are gone.
- **11 remain, and `bun scripts/verify-kc.ts --final` fails on them** [measured, with this review's tree]. Each waits for an item family that a lesson names and nobody built:

| KC | Says | What would carry it | The lessons that name it |
|---|---|---|---|
| `tr1.phases-vs-one-budget` | `planned: W1-T20` | the `tr1.step-budget` family | `tr1.l2`, `tr1.l5` |
| `tr1.request-states` | `planned: W1-T20` | `tr1.request-state` | `tr1.l5`, `tr1.l7` |
| `tr1.read-at-the-pin` | `planned: W1-T20` | `tr1.what-moved` | `tr1.l4` |
| `tr2.step-calls` | `planned: W1-T15` | `tr2.step-order` | `tr2.l1` |
| `tr2.one-budget` | `planned: W1-T15` | `tr2.preempt-victim` | `tr2.l2` |
| `tr2.gpu-dependent-defaults` | `planned: W1-T15` | `tr2.default-budget` | `tr2.l2` |
| `tr2.dispatch-keys` | `planned: W1-T14` | Service's `keys` level, which waits on Q-10, or the `tr2.dispatch-key` family; `close` has no adapter lever | `tr2.l6` |
| `tr5a.slots-vs-pages` | `planned: W1-T25` | `tr5a.slots-vs-pages` | `tr5a.l4` |
| `tr8.goodput-denominator` | `planned: W1-T34` | `tr8.goodput-denominator` | `tr8.l4` |
| `tr8.littles-law` | `planned: W1-T34` | `tr8.littles-law` | `tr8.l4` |
| `tr8.tool-defaults` | `planned: W1-T34` | `tr8.which-flag` | `tr8.l3` |

**Why.** The lessons' item blocks name 26 families [measured by `grep` over `content/modules`]. W1 built 8: TR2's three (W1-T04, W1-T14) and TR6's five (W1-T30). The other 18 are TR1's `which-mechanism`, `step-budget`, `where-does-it-run`, `what-moved` and `request-state`; TR2's `step-order`, `preempt-victim`, `default-budget`, `runner-fallback`, `dispatch-key` and `kv-after-graphs`; TR5a's `blocks-held`, `hit-length`, `pages-for-adapter` and `slots-vs-pages`; and TR8's `goodput-denominator`, `littles-law` and `which-flag`. TRACKER asked each content task for lessons with "a prediction, a game or item, and an exit check", which a block naming an unbuilt family meets, and the KC graph planned these KCs on those tasks without any task text that builds a family. W1-T20, W1-T25, W1-T15 and W1-T34 each said so in their results, and their tests list the families as `TO_BUILD`. The item block prints "Not built yet: the generator for <family>".

**What it costs.** 17 of the 27 lessons name at least one unbuilt family [measured by `grep`]: all seven of TR1's and four of TR5a's, four of TR2's seven and two of TR8's four. Their exit tickets cannot be passed, so ASSESSMENT §9's browser-complete is out of reach for TR1, TR2, TR5a and TR8. Today can draw items for the 9 KCs that the 8 families assess (TR2's 4 and TR6's 5 of the 45), and shows every other earned KC as unserved. A family is about 470 lines, before its goldens and its `verify:items` bands [estimated by W1-T25], so the 18 are one L carry-over, or one M per module.

**The app reads neither source.** `src/progress/sources.ts` maps a game run to its KCs, and returns nothing for an item or a lab check. The map and the module pages therefore show progress from game levels alone, while Today schedules from items. D-059's `packages/play/items/catalog.ts` is the table of the families' KCs that costs those pages nothing, which the file's comment waits for, and `LAB_CHECK_KCS` is the labs'. Wiring both is a follow-up (§12).

---

## 6. Content facts: the spot-check

**The sample.** One claim from each of the 23 claim files that W1 wrote or extended (`loop.yaml` is W0's), chosen without reading them: in each file, among the claims that have a source and a quote, the one whose id has the smallest SHA-256 of `w1-t38:<id>`. 21 sources were fetched again on 2026-11-08, from `raw.githubusercontent.com` at each pin's commit (for a claim that cites a tag, the commit that `course.lock.json` gives it), `github.com` (one release page), `www.lmsys.org` and `arxiv.org`. The two that cite kernelspace's lessons were read with `git show` at `d478f91`.

**How it was fetched.** Every request sent the User-Agent `Mozilla/5.0 (X11; Linux x86_64)` and nothing that names anyone: `curl -q` sent `Host`, `User-Agent` and `Accept` (the first request's trace kept as evidence), with no cookie, no login and no call to the GitHub API. Each download went into a new, empty folder of its own, was read as text, and was never run; Python read it with `-I`. Every response was HTTP 200.

| # | Claim | File | Source, as fetched | Result |
|---|---|---|---|---|
| 1 | `vllm.bench.max-tokens-is-output-len` | `broken-bench.yaml` | vLLM `vllm/benchmarks/lib/endpoint_request_func.py`, line 232 | verbatim in its line, inside `async_request_openai_completions` |
| 2 | `nano-vllm.preempt-recompute` | `readings.yaml` | nano-vllm `nanovllm/engine/scheduler.py`, lines 58 to 79 | verbatim; the text's victim and requeue rules are lines 62 to 79 |
| 3 | `sglang.bench.seed-default` | `sglang/bench.yaml` | SGLang `python/sglang/benchmark/serving.py`, line 2554 | verbatim |
| 4 | `sglang.overlap.loop` | `sglang/engine.yaml` | SGLang `python/sglang/srt/managers/scheduler.py`, lines 2061 to 2120 | verbatim; the launch, the result queue and the pop of the last batch are in the lines |
| 5 | `sglang.cudagraph.tc-piecewise-removed` | `sglang/graphs.yaml` | SGLang's v0.5.22 release page | verbatim in the page's text, with the error and the default that the claim's text adds |
| 6 | `sglang.kv-events.block-stored` | `sglang/kv.yaml` | SGLang `python/sglang/srt/disaggregation/kv_events.py`, lines 279 to 295 | verbatim; the nine fields are the lines. The comparison with vLLM's event rests on other claims and was not re-read |
| 7 | `sglang.spec.overlap-topk` | `sglang/spec.yaml` | SGLang `docs/docs/advanced_features/speculative_decoding.mdx`, lines 779 to 781 | verbatim |
| 8 | `nano-vllm.engine-step` | `tr1.yaml` | nano-vllm `nanovllm/engine/llm_engine.py`, lines 49 to 55 | verbatim |
| 9 | `sglang.cudagraph.blog-padded-tokens` | `tr2.yaml` | LMSYS's post of 2026-08-17 (redirected to `www.lmsys.org`) | verbatim, with the empty-slot sentence that the claim's text adds |
| 10 | `vllm.hybrid-kv.group-size-example` | `tr5a.yaml` | vLLM `vllm/v1/core/kv_cache_planning.py`, lines 524 to 533 | verbatim |
| 11 | `mask.kernelspace.token-mask` | `tr6.yaml` | kernelspace `public/lessons-md/t6.l8.md`, line 32 (`git show`) | verbatim |
| 12 | `bench.kernelspace.traffic-rule` | `tr8.yaml` | kernelspace `public/lessons-md/t7.l2.md`, line 12 (`git show`) | verbatim |
| 13 | `vllm.bench.max-concurrency-closed-loop` | `vllm/bench.yaml` | vLLM `vllm/benchmarks/serve.py`, lines 1679 to 1689 | verbatim; the semaphore that the text names is at lines 1001 to 1010 of the same file |
| 14 | `vllm.http.api-server-shim` | `vllm/engine.yaml` | vLLM `vllm/entrypoints/openai/api_server.py`, lines 20 to 27 | verbatim |
| 15 | `vllm.cudagraph.padding` | `vllm/graphs.yaml` | vLLM `docs/design/cuda_graphs.md`, line 91 | verbatim |
| 16 | `vllm.hybrid-kv.doc-gemma3-layers` | `vllm/kv-manager.yaml` | vLLM `docs/design/hybrid_kv_cache_manager.md`, lines 113 to 121 | verbatim; the seven groups are the lines |
| 17 | `vllm.hybrid-kv.full-plus-sliding-lookup` | `vllm/kv.yaml` | the same document, lines 196 to 197 | verbatim |
| 18 | `vllm.release.driver-r580` | `vllm/release.yaml` | vLLM `docs/getting_started/installation/gpu.cuda.inc.md`, lines 344 to 346 | verbatim |
| 19 | `vllm.spec.rejection-sampler.exact` | `vllm/spec.yaml` | vLLM `vllm/v1/sample/rejection_sampler.py`, lines 50 to 70 | verbatim across a line break of the docstring (lines 51 and 52) |
| 20 | `vllm.cudagraph.mrv1-lora-cases` | `vllm/steploop.yaml` | vLLM `vllm/v1/cudagraph_dispatcher.py`, lines 106 to 129 | verbatim; the three cases are lines 115 to 128 |
| 21 | `vllm.spec.bonus-token` | `worlds/engines.yaml` | the same file as 19, lines 59 to 62 | verbatim across the docstring's line breaks (lines 60 to 62) |
| 22 | `vllm.executor.rpc-broadcast` | `worlds/lifecycle.yaml` | vLLM `vllm/v1/executor/multiproc_executor.py`, line 492 | verbatim. Which executor runs with more than one rank was not re-read |
| 23 | `kv.slora.unified-paging` | `worlds/references.yaml` | arXiv 2311.03285v3's abstract page | verbatim in the page's text |

**Findings.**
- All 23 quotes are in their sources at the pins, and each claim's text says what its source says. Three texts state a fact beyond the quoted lines (5, 9, 13), and this review found each in the same source.
- Two quotes (19 and 21) join a docstring's lines. `content/claims/README.md` says that a source which splits a string across lines is quoted from one of its lines. The fact is right; the convention drifted, and `verify:claims` does not check it, since it does not read sources.
- `verify:claims` checks that a claim carries its source, quote, date and tag, not that the source says it, and the committed tests do the same, apart from the source checks of TR1's lessons and of the lifecycle model, which need the pins' unpacked tarballs and skip on CI and on this host. This sample is the only re-read since the claims were written; the re-read of every claim at the next re-pin (`content/claims/README.md`) is the only full one.

---

## 7. The finish reviews

### 7.1 Rounds

impeccable's finish reviewer judged each W1 game surface against its direction contract, GAMES.md §2.6 and the owner's 3D bar, from captures at 1440 and 390 px. Rounds were capped at three, or four when the last asked only for a recapture. Each fix round was one batch of the reviewer's material fixes, merged through the gates.

| Surface | Round 1 | Round 2 | Round 3 | Round 4 | Fix rounds merged | Final |
|---|---|---|---|---|---|---|
| Service (`loop`), on `/` and `/play/loop` | `fix`, 8 fixes | `fix`, 5 | `fix`, 3 | — | `ecce3f4` (at `cc1d29d`), `23c3279` (`99c90af`) | `fix`, on captures of `99c90af` (2026-11-05) |
| The Tasting (`verifier`) | `fix`, 8 | `fix`, 6 | `fix`, 5 | — | `9ce9b1e` (`b96f19d`), `489454e` (`72f163e`) | `fix`, on `72f163e` (2026-11-05) |
| The Inspection (`broken-bench`), 2D | `fix`, 8 | `fix`, 5 | `recapture`, 4 | `fix`, 3 | `a72b022` (`d7277db`), `0962e57` (`cc0495c`) | `fix`, on `72f163e` (2026-11-08) |
| Back of House (`engine-floor`) | `rebuild`, 8 | `fix`, 6 | `fix`, 5 | — | `975e32b` (`69e0326`), `72f275b` (`cb7bc29`) | `fix`, on `cb7bc29` (2026-11-08) |
| The Reach-In (`pool`) | `rebuild`, 8 | `fix`, 8 | `fix`, 4 | — | `9778d26` (`f4c037d`), `56ab2a7` (`9b13bed`) | `fix`, on `9b13bed` (2026-11-08) |

Back of House's and The Reach-In's last rounds, and The Inspection's fourth, ran in the close-out, after the usage limit had stopped them (§9.2). The detector found nothing on any round's tree.

### 7.2 The final dispositions, and the open material fixes

**Every surface ended `fix`, in the reviewer's own word, and none `ship`.** The reviewer scored only the listed fixes in its verdict passes, so each list below is at that scope, not a fresh review of the surface. In the reviewer's words, shortened:

- **Service.** (1) At 390 px, on `/play/loop` and on `/`, the heat-lamp pools are still saturated peach ovals that hide the steel's grain, and in the 2D view they are radial amber blurs with white-hot centres. (2) The room got dimmer and did not fall away: no luma gradient of 30 or more toward the hood and the far corners, and a fog lighter than the tile. (3) At 390 px the printer's taller housing now runs off the first screen (a regression of the last fix round). Resolved and to keep: the dark-against-lit stations, the framing clear of the ticket, the full-scale 2D kitchen, the contact under the plates, and the tiled side wall.
- **The Tasting.** (1) At 390 px the wall, hood and cords take the top 55% of the scene box, the floor is back below the pass, and the stacks are 10 to 50 px tall. (2) The amber is a wash along the front row, not a pool on the course being tasted. (3) The 1-, 10- and 1,000-round frames are almost the same picture. (4) The wall is one evenly lit tile plane to the top edge. (5) Short white bars are cut by the top edge at 1440 (a regression). W1's fix rounds also met a limit they measured: six pairs across a portrait box cap a 29-plate stack at about 45 px [derived by the round-2 fix], so (1) needs a phone box shaped to the pass, an owner's call on the contract.
- **The Inspection.** (1) In "In the real tools", MEASURED prints in two styles and DERIVED in a third, and a tag drops below a long claim on some rows. (2) The In-production ledger drops its tags in the same way. (3) DESIGN.md's Ticket still prescribes "a Doto head line over a dotted rule, a heading-face title", the kicker the review asked the documenter to strike; the W1 documenter (`7593ab3`) left it in.
- **Back of House.** (1) The 390 px run in follow framing and the stopped state were never captured, and the reframed 390 px first screen shows no hand's tape (a regression). (2) In the vLLM cutaway the host stand is still a full-width dark slab. (3) A stage chit sits on the order desk's printer (a regression). (4) The ticket is white bond with printed dots, flat, with no curl or edge. Resolved: the lamp's pool on the steel, the chits clear of the tapes, and the room's depth.
- **The Reach-In.** (1) The filled pans are still flat legend colours, so the rack reads as a coloured memory grid. (2) No haze: the floor's luma is 73, 71, 70 and 70 from front to back [measured by the reviewer], and the wall runs crisp to the frame's edges. (3) The amber shows as hard-edged peach discs printed on the pass tickets, with no pool on the steel. (4) The rail tickets are the right size with dot print, and still flat sheets with no thickness or tooth. Resolved: the fan of layers, the pass's steel and lip, the cover plate over the open slots, and no number in the scene.

### 7.3 W0's open findings

W1 closed W0-T25's findings and the two lights that W0-T24 found [measured by the tasks named]: F1, the 2D view as a lane chart with no fired state, by the Service redress and its finish rounds (round 2's verdict: "2D view: resolved"), with fired baselines added to `e2e/screenshots.spec.ts`; F3 and F4, the green pilot and the green station lens, by `design-tidy` (both lamp amber, `rgb(255, 181, 71)`); F5, the phone's lane tapes, by the Service redress (244 px apart at 390 px on `/play/loop`); F6, the 105 advisory drifts, by `design-tidy` (a type ramp and radius tokens, 0 findings after); and `/design`'s moderate `landmark-unique`, by `design-tidy`. W0-T25's first check, ship or a choice by the owner, still waits on the owner; W1's Service review is its successor, and it ended `fix` too.

### 7.4 The three faults that recur, and a scene-kit task for W2

| | The room falls into haze | The lamp's amber pools on the steel | Paper reads as printed bond |
|---|---|---|---|
| Service | partial | partial: right at 1440, not at 390 or in 2D | not raised in round 3 |
| Back of House | resolved in round 3 | resolved in round 3 | partial: no curl, no edge |
| The Reach-In | unresolved | partial: discs on the tickets | partial: flat, no thickness or tooth |
| The Tasting | partial | unresolved: a wash | not in play: the plates resolved as ceramic |

**They belong in one scene-kit task at the start of W2.** All three are the kit's: the lamps' light and its pool on the steel, the room's veil and fog, and the ticket's print and shape are shared by every scene, and each game fixed them its own way in W1. Two recipes have passed a review: Back of House's round-2 fix, which drew the lamp as a cone of warm haze and an edgeless pool with no spot light and dimmed the tile toward the hood (both resolved in round 3), and The Reach-In's kit options, the tubes-only environment and the room-light veil (judged not enough in round 3). One task can carry the passing recipe into the kit, apply it to the four scenes, give the ticket curl, thickness and tooth, and recapture all four for one verdict pass each.

**The scene gates leave it almost no room.** Each scene's row counts the scene kit (22,651 B) and the shared `SheetInstances` chunk, so a byte the kit gains lands on all four, and the tightest row, `scene-pool`, is 160 B under 40 KB [measured]. The task therefore starts by freeing bytes inside the frozen gates, and its brief should say to stop and report if it cannot: W1's records name the candidates, such as a local merge in place of three's `mergeGeometries` (about 1 to 2 KB [estimated by scene kit v1]) or a kit split so that a scene counts only the props it draws (the Tasting's round-1 fix). Moving a game's own lamp code into the kit is about even for that game and a cost for the other three.

---

## 8. W1 against ARCHITECTURE, GAMES, ASSESSMENT and DECISIONS

### 8.1 What holds

- **I1, nothing leaves the device.** The meta CSP is on every document, the e2e network check finds no request leaving the origin, and since D-059 zod builds its schemas jitless, so the policy refuses nothing on any page and `KNOWN_REFUSALS` is empty: stricter than W0, whose policy refused zod's probe on two pages.
- **Determinism and boundaries** (D-017, A§2.3): the pure packages pass the lint with 23 banned `Math` names where W0 had 10, the vectors of 9 models reproduce, and no static path reaches `three` from the entry.
- **The labs** (D-025, A§8.3): every reference passes and every bestiary member fails a named check in `verify:labs` (§4.2); `rejection-sampler`'s exact checks enumerate every coin, and its false-fail rate through the host was 0 of 1,500 runs [measured 2026-11-04 by W1-T27].
- **The records W1 built:** D-037 (Today), D-039 (the GPU parts announced), D-041 (dispatch as data for both runners), D-042 (S-LoRA's pages, with the slot baseline in the `adapters` debrief), D-045 (one page size), D-048's W1 half (µs on TR2's levels, tagged), D-049 (display names), and D-058 (the domain). DECISIONS now records each outcome.
- **Claims:** 648, every one with a source or marked synthetic or derived, and a sample of 23 re-read clean (§6).
- **Accessibility gates:** axe finds no serious or critical violation on the 29 pages and level pages of the smoke subset at 360 and 1280 px, and the keyboard walks reach the debrief of every level with focus in view at each stop (§4.3).

### 8.2 Where the build departs from the docs

| Item | Where | What W1 did | Status |
|---|---|---|---|
| Graded `loop/graphs` and `loop/mask` | ASSESSMENT §4.3 and §9; GAMES.md §3.2 ("practice → graded") | Built as practice; `mask`'s graded task is the `tr6.mask-fits` family (GAMES.md records it), and `graphs`' stages have no graded form | O-17 |
| Exit tickets of 17 lessons | ASSESSMENT §4.2 and §9 | Name families that were not built | §5 |
| The blind-strategy bound | ASSESSMENT §4.1 and §13; A§10.2 | `verify:items` holds a choice item to chance plus three standard errors (A5); `verify:games` does not measure the bound at all (each game's tests do), and The Inspection's levels pass its band check by construction, since the corpus redraws an out-of-band case itself | O-14; a follow-up for `verify:games` (§12) |
| Bootstrap coverage | ASSESSMENT §4.6 and §13 | The medians hold [93%, 97%] over 2,000 seeds again (D-059); the p99 at 1,000 rows covers 92.6%, and its 2,000-seed check is opt-in | O-15 |
| `rejection-sampler`'s required checks | ASSESSMENT §4.5 | W1-T27 rewrote the row to five checks, four of them exact; stricter, and a change to the credit document by a build task | O-18 |
| Error rates | ASSESSMENT §4.6 says "[measured once built]" | W1-T26 and W1-T27 measured them: 0 false fails in 10,000 nightly-size trials of the exact sampler, every bestiary member caught by the chi-square on its band but the boundary-inclusive one (12.55% at 2¹⁶ [measured 2026-11-04 by W1-T26]), which the exhaustive accept-step check catches 100% of the time | doc edit (§12) |
| Shadow-casting lights | A§6.6 | 3 at T2 and 4 at T3 in place of none and one; the test named for A§6.6 rewritten (A1) | O-13 |
| Service's 3D scene and 2D path | A§6.1; GAMES.md §3 ("lanes along time", "an SVG Gantt", "about 25°") | The kitchen's present, drawn through one shot in 3D and 2D; the timeline lives in the tape, the mirror and the debrief; the camera sits at 20.5° and 21.5° and its test window is 18° to 36° (A9) | owner's doc amendment |
| The synthetic label on the scene | D-012; D-048 | The stamp moved off the 3D scene and the 2D drawing onto the printer tape, printed once at its head (A17). D-012 is still met in the DOM. | noted in D-048 |
| Per-game budget targets | GAMES.md §3, §5, §8, §10 (draw calls, triangles, scene chunks) | Over at T2 once scene kit v1's shadow passes and props arrived; A§11.1's frozen gates hold (§3.3) | the owner restates the targets |
| The kitchen's rules | GAMES.md §2.6 (rule 1, steam; rule 7, print; §5's TP ranks as twins in depth) | Steam over a lit station at T2, a print texture of generic lines, TP ranks as storeys | owner's doc amendment |
| The Tasting | GAMES.md §10 ("per-position bar charts", batch draws do not animate) | Plates in dispensers in 2D; one move of the scene per draw | owner's doc amendment |
| A lazy part with no row | A§11.1; D-059 | `route /play/loop with FullService` 231,148 B; `verify:games` reads only `Game.tsx`'s views, not the full service's | O-16; follow-up |
| The 2D containment check | `tests/play/loop-layout.test.ts` | Narrowed to what a night is read by (A10) | open, design owner |
| Sub-ramp label sizes | DESIGN.md's Ramp Rule | Ten one-off font sizes with a reason each, six under the ramp's smallest step (A20); the detector runs in no CI job | open, design owner |
| The progress sources | A§7, ASSESSMENT §3.3 | Item and lab events move no KC on the map or the module pages | §5, follow-up |
| D-044's confirmation | D-044 ("the owner confirms it before W1-T12") | W1-T12 built the default without it | open (DECISIONS) |

### 8.3 What this review changed in DECISIONS

D-023, D-035, D-037, D-039, D-041, D-042, D-044, D-045, D-047, D-048, D-049 and D-059 each carry a note of what W1 built or measured against them, and their index rows say so. O-9 is carried to W2-T41, O-7 and O-8 stay with the `wave-0` merge, Q-5 and Q-10 record their state, and O-12 to O-18 are new. No record is accepted or changed on the owner's behalf.

---

## 9. Process

### 9.1 Frozen gates raised, then restored

**What was raised.** D-023's budgets were frozen by W0's exit, and its record says that a change over a gate "comes here as a new record, never as a quiet raise". Five build tasks wrote that record and raised the gate in the same change, under `proposed`, and the merge script took them:

| Record | Task | Gate | From → to |
|---|---|---|---|
| D-053 | W1-T28 | the front page's first-paint JavaScript | 150 → 151 KB |
| D-054 | W1-T17 | the same | 151 → 152 KB |
| D-055 | W1-T33 | the same | 152 → 154 KB |
| D-056 | W1-T30 | `/today` and `/m/:module` | 200 → 210 KB |
| D-057 | W1-T30 | every other route | 200 → 201 KB |

At the tip `72f163e` the front page was 153,808 B, `/today` 208,489 B, `/m/:module` 207,463 B and `/play/broken-bench` 200,125 B [measured 2026-11-05 by `es1-merge.sh`]. Each record had named the structural fix and left it to the owner.

**What was restored.** The close-out's gates-restore task put `BUDGETS` back to D-023's values, pinned them with a test that names D-023 (`tests/bundle/budgets.test.ts`), and fitted the build by the fixes the records named: the entry's preload lists replaced by a route table with hover-and-focus preloading, the item families on demand, the lessons' tables out of the content loader, a front page that carries what it runs, and the keys dialog on demand (D-059). `es1-merge.sh` now refuses a branch that raises or adds a bundle gate. At this tip every row has room (§3.1).

**The audit.** Three read-only finders compared every other gate, test and setting between `wave-0` and `wave-1` (the verify, tests and config lenses). Their 36 findings come to 22 items, which gates-restore numbered A1 to A22 and checked:
- **Restored:** zod's probe and the allowlist of CSP refusals (A6, A11); the exponential median's coverage at 2,000 seeds (A2, in part); the scene's instance bound, counted in the browser (A7); the build test's allowlist of lazy files, narrowed to the items' own (A3, in part); a printed row for what loads on demand (A4, in part); a reason on each lint suppression (A8).
- **Kept, with a reason that holds:** waits of 45 s on page state after a reload and a cold dev server (A12, A13), asked for by W0's report; Bun timeouts of 120 s on tests that spawn `verify:games` (A14, A15); two assertions that moved with the Service redress, D-012 still met (A16, A17); screenshot baselines re-blessed for W0's finding F1 at an unchanged tolerance (A18); the modulepreload polyfill off, D-023's W1 note (A19); the other lazy-file entries, which are real lazy parts now printed (A3).
- **Open:** the shadow-casting lights against A§6.6 (A1, O-13); the p99's coverage (A2, O-15); the full service's 231,148 B with no row, and `verify:games` not reading the full service's views (A4, O-16); the blind bound for choice items (A5, O-14); the camera window against GAMES.md's 25° (A9); the narrowed 2D containment check (A10); ten font-size waivers, six of them under the ramp (A20); and reasonless `as unknown as` casts at seven sites, one of which passes `null` where a geometry is typed (A21, A22).

**For the process.** The brief now forbids raising a gate, and the merge script refuses a raised bundle gate. The audit shows the same move elsewhere: a test that pins a design document's number (A§6.6's tiers, GAMES.md's camera, ASSESSMENT's bound) was rewritten to the build's number in the same change. A guard that fails a change to a test whose title names an A§, GAMES.md or ASSESSMENT section, unless a record names it, would catch the next one.

### 9.2 The usage limit (2026-11-05)

The account's weekly limit stopped nine agents on 2026-11-05: W1-T15 and its retry, Back of House's and The Reach-In's last finish rounds, and this review. They resumed on 2026-11-08, each from its worktree's saved state, onto a `wave-1` that had moved (gates-restore and the domain landed first). The cost was three days and a rebase each; nothing was lost that the gates did not catch.

### 9.3 Duplicate runs (2026-11-04)

Messages that the orchestrator sent to eleven running agents started eleven duplicate runs in the same worktrees, between about 16:20 and 16:31, and the orchestrator stopped them. Their edits touched the worktrees of W1-T05, W1-T21, W1-T28, W1-T32, scene kit v1 and W1-T17. Every one of those tasks merged through the gates, and every gate passes at the tip; the orchestrator reviews those files on `wave-1` before the wave PR, and this review did not re-read them line by line.

### 9.4 Commit trailers

64 of W1's 86 non-merge commits say `Co-Authored-By: Claude Sonnet 5.5` and 22 say Opus 5.5 [measured with `git log`], where the task text asked every task for Opus. The build agents followed the session's attribution rule, which names the model that ran, and several said so; the tasks that Opus ran (the finish fixes, gates-restore, the documenter and this review) say Opus. Nothing to change in history; the task text should name the model that runs it.

### 9.5 Tests that fail under load

A test that failed under load and passed when run alone, as W1's tasks reported it, and the fixes made: `settings.spec.ts:273`, `front.spec.ts:182` (the LCP element read after React may have replaced it), `ledger-conformance.spec.ts:135`, `pool.spec.ts:579`, `items.spec.ts:217`, `forge-hybrid-kv.spec.ts:110` and `:138`, `rejection-sampler.spec.ts:101`, `:124` and `:135`, and `loop-scene.spec.ts:366` (a frame owed to the demand loop waiting longer than the settle window, which Back of House's fix widened to 1.5 s); among Bun tests, `tests/content/plugin.test.ts` (a race between the content plugin's reload and Vite's watcher), `steploop-v1`, `forge-rejection-sampler` and `workload` at the 5 s default. W1-T36 fixed two real defects found this way (a focus lost after the Keys dialog, and `close`'s copy). In this review's run one test failed, `ledger-conformance.spec.ts:135`, which timed out at 1.5 minutes under a load of about 20 and passed alone in 154 ms [measured]: the same test as above, and the sign that these specs want state-based waits rather than a quiet host.

---

## 10. Owner tasks and open questions

### 10.1 The owner's tasks

- **W1-T02, the edition-1 pins (D-035, O-4).** Confirm vLLM v0.33.0 and SGLang v0.5.23 or change them, and settle the choices W1-T01 left: Nsight Systems 2026.5.1 or 2026.6.1, Nsight Compute 2026.3.1 or 2026.4.0, and the R580 driver gate on the capture GPUs and the rental hosts (v0.32.0 is the fallback). `course.lock.json` follows the answer.
- **W1-T37, the screen-reader pass.** NVDA and VoiceOver notes go in §10.3, and issues are filed.
- **Q-10, the dispatcher tables.** Run `scripts/tables/vllm-dispatch.py` at vLLM v0.33.0 (`4ba787ec9959e566d3b587a796dff07673324da5`) on a CPU host, commit `tests/fixtures/dispatch/v0.33.0.json` with its `.sha256` and the run's provenance, and set `DISPATCH_TABLES.status` to `committed`. `tests/sim/dispatch-tables.test.ts` then holds `dispatchV2` and `dispatchV1` to at least 5,000 cases each (W1-T12's fourth check), and Service's `keys` level and `close`'s adapters can be built. Whether a CPU-only run suffices is [unverified].

### 10.2 Open owner questions

| # | In short | Since | Needed by |
|---|---|---|---|
| O-2 | Pages on a private repository, and when the repo goes public. Answered 2026-11-08, after this review: the repo is public and Pages is on (D-060) | 2026-11-03 | answered |
| O-3 | The content and code licences. The repo went public before they were decided (D-060); until then, enginespace's own code and content are all rights reserved | 2026-11-03 | W3-T15 |
| O-4 | The edition-1 pins | 2026-11-03 | W1-T02 |
| O-5, O-6 | Reference traces; the capstone's commit pairs | 2026-11-03 | W2-T21; W3-T01 |
| O-7, O-8 | The pick-form gate; review capacity (W1 added 170,253 lines, §11) | 2026-11-03 | the `wave-0` merge |
| O-9 | The reference laptop and phone | 2026-11-03 | W2-T41 (carried again) |
| O-10, O-11 | Grader-attested correctness; the 2D-first front page | 2026-11-03 | W2-T08; past due |
| O-12 | Which domain the message "statespace.naigap.com i mean" concerns: `enginespace.naigap.com`, `statespace.naigap.com` and `kernelspace.naigap.com` all resolve to GitHub Pages, and statespace's repository names `statespace.play.naigap.com` [measured 2026-11-08]. D-058 stands until the owner says otherwise. Answered 2026-11-08, after this review: the correction names statespace's own domain, so D-058 stands (D-060) | 2026-11-08 | answered |
| O-13 to O-18 | Shadow lights; the blind bound; the p99 band; the full service's row; graded `graphs` and `mask`; `rejection-sampler`'s five checks | 2026-11-08 | DECISIONS gives each |
| D-044, D-059 and the other proposed records | Accept or change | — | W2's module tasks |
| Q-5, Q-10 | A `proved` event for completion; the dispatcher tables | 2026-11-03 | the task that derives completion; W1-T12 |

### 10.3 W1-T37: the screen-reader pass (for the owner)

*The owner writes this section (TRACKER W1-T37): NVDA and VoiceOver notes, and the issues filed.* The pages that W1 added are those of `e2e/routes.ts`'s `W1_ROUTES` and `W1_LEVEL_PAGES`: the five module pages and their richest lessons, `/play` and the five games (Service's full service through `?level=`), the two labs, and `/today`. Scene kit v1 also asked for a pass over `/design`'s kitchen specimen. Nothing has been written here yet.

| Screen reader, browser and device | Page or game level | What was heard, and what was missing | Issue filed |
|---|---|---|---|
| | | | |

---

## 11. What W1 merged

From `wave-0` (`7ceb7c2`) to `wave-1` (`35d5fd3`), the diff is 997 files, 170,253 added lines and 4,034 removed, in 86 commits and 65 merges [measured]. Of the added lines, 33,156 are in `src`, 29,770 in `packages`, 6,133 in `scripts` and 5,730 in `labs`; 53,300 in `tests` (11,356 more in its fixtures) and 8,927 in `e2e`; 13,967 in `content`, 4,497 in the committed Markdown export and 1,590 in `docs` [measured].

Added lines per task, leaving out the lockfile, `vendor/`, the test fixtures, the Markdown export, the lab zips, the figures and the screenshot baselines [measured]:

| Task | Size | Lines | | Task | Size | Lines |
|---|---|---|---|---|---|---|
| W1-T01 Pins and W1 claims | M | 4,179 | | W1-T19 TR1's graded map | M | 2,411 |
| W1-T03 KC graph | M | 2,092 | | W1-T20 TR1 content | L | 4,855 |
| W1-T04 Items and the item block | M | 5,611 | | W1-T21 Sim: hybrid KV | L | 5,685 |
| W1-T05 Today | M | 4,248 | | W1-T22 Lab `hybrid-kv` | L | 5,627 |
| W1-T06 Map and progress | M | 5,094 | | W1-T23 The Reach-In: session and 2D | M | 7,313 |
| W1-T07 Cards | S | 1,856 | | W1-T24 The Reach-In: 3D | L | 1,601 |
| W1-T08 Trace model | M | 3,370 | | W1-T25 TR5a content | M | 2,626 |
| W1-T09 Trace viewer | L | 6,240 | | W1-T26 Sim: speculation | M | 2,648 |
| W1-T10 Forge host | L | 6,321 | | W1-T27 Lab `rejection-sampler` | L | 3,037 |
| W1-T11 Lab packer | S | 2,259 | | W1-T28 The Tasting: session and 2D | M | 7,361 |
| W1-T12 Step loop v1 | L | 7,040 | | W1-T29 The Tasting: 3D | L | 1,688 |
| W1-T13 Service: TR2's levels | L | 5,226 | | W1-T30 TR6 content | L | 5,871 |
| W1-T14 TR2's graded task and families | M | 4,165 | | W1-T31 Sim: benchmark generator | L | 2,889 |
| W1-T15 TR2 content | L | 4,048 | | W1-T32 Broken-bench corpus | M | 2,652 |
| W1-T16 Sim: lifecycle | M | 2,535 | | W1-T33 The Inspection | M | 6,833 |
| W1-T17 Back of House: session and 2D | M | 5,409 | | W1-T34 TR8 content | M | 1,972 |
| W1-T18 Back of House: 3D | L | 2,221 | | W1-T35 Markdown export | S | 412 |
| | | | | W1-T36 End-to-end coverage | M | 1,127 |

Beside the tracker's tasks: scene kit v1 6,269; the Service redress 1,571; `design-tidy` 914; the W1 carry-over (`loose-ends`) 1,581; gates-restore 1,551; the domain 335; the documenter 201; the ten finish-fix rounds 172 to 1,416 each, 5,739 in all; and two small fixes by the orchestrator, 84 and 8 [measured].

Every S and M task went over its line bound: the three S tasks by 1.4 to 7.5 times their roughly 300 lines, and the 18 M tasks by 1.1 to 7.4 times their roughly 1,000 [derived]. Tests are 62,227 of the 137,016 lines of code and tests (`src`, `packages`, `scripts`, `labs`, `tests` and `e2e`), or 45% [derived], the share W0 had.

---

## 12. Open issues and follow-ups

**For the owner:** §1's list, §10's tasks and questions, and §7's open fixes.

**For W2's first tasks (suggested homes):**
- **W1's item families** (the carry-over of §5): the 18 families, each with its face in `catalog.ts` and its loader in `src/items/families.ts`, the `TO_BUILD` lists of the content tests emptied, and `bun scripts/verify-kc.ts --final` run again, which is W1-T38's first check. The `tr8.*` families also give Today TR8's KCs, which no family serves now.
- **Progress from items and labs:** wire `family` and `lab` in `src/progress/sources.ts` to `catalog.ts` and `LAB_CHECK_KCS`, and derive ASSESSMENT §9's states once Q-5 is answered.
- **The scene-kit task** of §7.4, inside the frozen scene gates.
- **`verify:games` and the blind bound:** measure ASSESSMENT §4.1's bound for every graded level in the gate (each game's tests measure it today), and read the full service's views.
- **CI coverage:** `labs.yml`'s `paths:` leave out `src/forge`, `packages/sim`, `scripts/labs` and `tests/fixtures/forge`, which `verify:labs` reads; CI's `tests` job skips the tests that need Rust, a kernelspace checkout or the pins' tarballs; and the nightly sets neither `ES_HEAVY` nor `ES_LAB_TRIALS`.
- **The Inspection's tail may give away a graded answer:** it shows max(12, the p99's rank + 6) rows, so the row count can tell where the p99 sits (observed by its round-2 fix, and not checked by this review). A rule that gives nothing away is needed before its graded levels count.
- **Labs:** a download link and the zip's SHA-256 on the lab page (W1-T11), and the slot-baseline readout of TR5a §5 (W1-T22).
- **The trace viewer and the item ticket** were built with no finish review of their own (W1-T09, W1-T04).

**Doc edits, outside this task's files:**
- ASSESSMENT §4.6's "[measured once built]" rows take W1-T26's and W1-T27's rates (§8.2), and §4.1's bound follows O-14.
- A§6.1 and GAMES.md §3, §5, §8 and §10 follow what was built (§8.2), or the owner restores the docs' versions.
- DESIGN.md's Ticket loses its head line over the title (§7.2).
- `content/claims/README.md`'s rule for quotes that cross lines, or the two quotes of §6.
- A§5.6 and A§5.7 against the as-built benchmark and trace APIs (W1-T31, W1-T08); A§9.2's agent-kit file name (W1-T11).
- WORLD.md and TR5b's wording that TR5b "adds an adapter field" to the KV events, which both engines already carry as `lora_name`, before the `kv-publisher` lab is written; and `research/upstream-vllm.md`'s rows on which file the Inside vLLM post follows (W1-T01).

**For the owner, from W1's tasks:** TR1's lessons compile to 296 minutes against the module's 7.5 browser hours in `content/course.yaml` [measured 2026-11-05 by W1-T20], so the hours fall or W2 adds counted work; the repository's NOTICE described `vendor/kernelspace/` alone, while `labs/forge/kit` and `labs/agent-kit` are copies from kernelspace too (W1-T11, for O-3; NOTICE names both since 2026-11-08, D-060); and a trace's `meta.sha256` is read as the raw capture's hash until the owner says otherwise, before W2-T19 writes it (W1-T08).

**Inherited and still open:** from W0, `scripts/` and `tests/` are linted and not type-checked, and `verify:boundaries` walks static imports from `src/main.tsx` only. From W1's tasks: the 90-day TTL of the pin claims runs out about 2027-02-02 [derived], when the first re-pin falls; `sglang.bench.rust-client-2500-requests` is tagged unverified; the Gastronorm pan sizes are [unverified]; and three of 10,000 broken-bench seeds come back out of band and are redrawn [measured 2026-11-04 by W1-T32].

---

## 13. How to reproduce

From a checkout of `35d5fd3` with this review's changes:

```
npm ci
npm run lint && npm run typecheck && npm run build && bun scripts/verify.ts all && npm run test
bun scripts/verify-kc.ts --final          # fails on the 11 placeholders of §5
ES_CHROMIUM=<a Chromium that starts here> npx playwright test --project=lab --workers=1
ES_CHROMIUM=<the same> npx playwright test --project=smoke --project=features --workers=2
ES_E2E_NIGHTLY=1 ES_CHROMIUM=<the same> npx playwright test e2e/walks.spec.ts e2e/keyboard-loop.spec.ts --project=smoke --workers=2
```

The spot-check's sample is one claim per claims file with the smallest `sha256("w1-t38:" + id)`; its downloads and their trace are in the session's scratch, not in the repository. This review's own changes: this report; the labs' source in `scripts/verify-kc.ts`, with `packages/sim/forge/kcs.ts` and `REJECTION_SAMPLER_KCS`, and their tests; the 25 answered placeholders out of `content/kc/graph.yaml`; TRACKER's W1 markers, and the list of merged tasks in `tests/ci/workflows.test.ts` that the markers must follow; `content/README.md`'s line on lab checks; and DECISIONS.
