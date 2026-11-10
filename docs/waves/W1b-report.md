# W1b exit review

**Status:** the exit record of W1b, wave 1's carry-over, for the owner's review of the `wave-1b` PR. `wave-1b` stacks on `wave-1`, which is `main` plus the publication follow-up of PR #5, and it carries PR #4's commit (the Bun fallback); both PRs are open. **Date:** 2026-11-09. **Task:** W1b-T16 (opus). **Build reviewed:** `wave-1b` at `1ed97ac` (`1ed97ac92a05fe37811bccd539878500243b2867`), the merge of the lesson blocks' finish fixes, the last merge before this review. **Close-out:** a close-out round on `wave-1b`, the same day, added the round-2 verdicts of The Reach-In and of the lesson blocks that this review lacked (§6), closed the docs and the guards of §8.2 and §10, and runs one more fix round and verdict pass for four surfaces, whose results the coordinator adds to the wave PR (§1). **Sources:** [TRACKER.md](../TRACKER.md) (W1b's tasks and exit criteria), [ARCHITECTURE.md](../ARCHITECTURE.md) (A§n), [GAMES.md](../GAMES.md), [ASSESSMENT.md](../ASSESSMENT.md), [DECISIONS.md](../DECISIONS.md) (D-nnn, O-n, Q-n), [W1-report.md](W1-report.md), the results of W1b's merges that the workflow passed to this review, the finish reviewers' verdicts, the evidence of the live check of 2026-11-09, and what this review ran itself (§12).

**Tags** follow ARCHITECTURE. A figure tagged [measured] with no date or SHA of its own was measured by this review on 2026-11-09 at `1ed97ac`, on the host of §2; a figure measured at `wave-1`'s tip says `c985c4c`. A figure that a W1b task or a finish round measured carries its name. Gates and targets are A§11.1's design targets and stay [estimated]. Task ids, counts of named things and list numbers are not quantities and go untagged.

---

## 1. Verdict

W1b built all fifteen of its build tasks, and each merged into `wave-1b` through `es1b-merge.sh`, which re-ran the five gates on every merged tip. One round of finish fixes for each of the five surfaces reviewed merged the same way. At the tip every gate passes (§4.1), `bun scripts/verify-kc.ts --final` passes with 45 KCs, all 45 with a graded reference and none planned, so W1-T38's first check holds (§4.3), and no frozen gate moved: `BUDGETS` is D-023's at every W1b merge (§3), and every other gate table holds `wave-1`'s values or stricter (§4.5). The lessons now run what W1 built: their 40 game blocks play their levels, their 36 item sets draw items from 26 families, the five blocks of the two forge labs lead to pages that hand over the crate, and the map and the module pages count items and lab checks. Four things stay open:

- **22 of the 39 prediction boxes take no answer.** No run of the games as built holds their answer: their prompts carry numbers or engine facts of their own, or their lesson has no game. Their tickets say that the reveal waits on W2-T43, which W1b-T02 added. The other 17 commit, reveal after their game and write a `predict` event (§5).
- **Four of the five finish reviews ended `fix`, and one more round is running.** Service reached `ship` in its verdict pass, at the scope of the five fixes it scored. The Tasting ended `fix` with four open, two of them the phone box, which is the owner's call, and the authored moment; Back of House ended `fix` with one, the ticket's curl and edge; The Reach-In ended `fix` with two, its filled pans and its rail tickets; and the lesson blocks ended `fix` with four, Service's 2D tapes and its bell, and The Reach-In's lamp cords and default shot as a lesson draws them (§6). The round-2 verdicts of The Reach-In and of the lesson blocks were cut from the results that the workflow passed to this review, and the close-out round added them to §6 from the reviewers' words. That round, on `wave-1b`, runs one more fix round and verdict pass for Service, The Reach-In, The Tasting and Back of House; the coordinator adds their results to the wave PR, and this report does not give them.
- **The live site still serves http only.** GitHub has issued no certificate for `enginespace.naigap.com` (`https_certificate` null and `https_enforced` false [measured 2026-11-09 from GitHub's Pages API]), and a page served over http has no `crypto.subtle`. On the live origin a forge lab cannot hash a module and grade it, and once W1b deploys, a game run cannot be hashed and recorded either. That is the deploy's, and the owner's step (D-060).
- **A claim that a lesson prints is wrong.** `vllm.bench.metric-percentiles-default` says that a run of `vllm bench serve` that asks for no more percentiles "reports the tail and no median". At the pin, `serve.py` prints the mean and the median of every selected metric before its percentiles (lines 1424 and 1425 at `4ba787e`) [measured 2026-11-09], as W1b-T06 found. TR8's third lesson shows the claim's text (§8.2).

The scene gates are tight again: `scene-pool` is 478 B under 40 KB and `scene-engine-floor` 769 B [measured], where W1b-T10 had left each game scene about 2 KB under. The finish rounds spent most of that room (§3.2).

CI has never run on `wave-1b`: the wave PR will start it, and with it the four test shards and the smoke project's new browser flag, which have run only on the dev host (§4.6).

| W1b exit criterion (TRACKER) | Status | Evidence |
|---|---|---|
| A game block plays its level in the lesson | met | W1b-T01: all 40 blocks name a level that exists (`tests/content/game-blocks.test.ts`); keys alone play a lesson's block of each game to its debrief at 360 and 1280 px, and only one 3D canvas is live with two blocks open (`e2e/lesson-games.spec.ts` and `lesson-games-scene.spec.ts`; §4.4) |
| A prediction box takes a prediction and scores it after the game | met for 17 of 39 | W1b-T02: 17 commit, reveal after their game and write a `predict` event; the other 22 print a ticket that names W2-T43 and take no answer (§5) |
| An item set draws items | met | The 36 item blocks name 26 families, all built: `verify:items` passes 26 families and 83 variants on every level (§4.2) |
| A forge lab's block leads to a page that hands over the crate | met | W1b-T08: each kit of `public/labs/manifest.json` is linked from its lab's page with its size and SHA-256 and a line that checks the download; the five blocks of `hybrid-kv` and `rejection-sampler` lead there, and the three of the GPU labs name W2-T34, W2-T35 and W2-T36 |
| `bun scripts/verify-kc.ts --final` passes (W1-T38's first check) | met | 45 KCs, 45 with a graded reference, 0 planned (§4.3) |
| The map and the module pages count items and lab checks | met | W1b-T07: an item event moves its variant's KCs and a lab run moves its checks' KCs (`tests/map/progress-sources.test.ts`, `e2e/map.spec.ts`), and the change cost `/m/:module` 463 B, where importing the labs' oracles would have put it 7,510 B over its gate [measured 2026-11-09 by W1b-T07] |
| The scene kit carries the haze, the lamp's pool and paper inside the frozen scene gates, and each 3D surface gets one more finish review | met | W1b-T10's kit is in all four game scenes, each under 40 KB (§3.2); each of the four surfaces had a verdict pass, a fix round and a second verdict pass (§6) |
| No frozen gate moved | met | §4.5 |

**What the owner decides, in order of urgency:**
1. Merge PR #5 (W1's publication follow-up) and PR #4 (the Bun fallback), which `wave-1b` stacks on, then `wave-1b`'s PR.
2. Turn on Enforce HTTPS for `enginespace.naigap.com` once GitHub issues the certificate (D-060). Until then the forge labs grade nothing on the live site, and W1b's game recording will record nothing there.
3. The finish reviews (§6): ship The Tasting, Back of House, The Reach-In and the lesson blocks with their open fixes listed, or schedule a round in W3-T09, once the close-out round's results are on the wave PR; and choose The Tasting's phone box, on which its first fix waits.
4. W2-T43's third way, a prediction answered by a model that computes from the prompt's own numbers, relaxes "the reference is read from the run" and needs a decision and a record (W1b-T02).
5. The slot readout's night (W1b-T08): at the lesson's pool of 20 pages the slot models admit more requests than the learner's pool, 34 and 56 against 30 at seed `0x4b07` [measured 2026-11-09 by W1b-T08]. Keep that night as the lesson's "when slots are enough", or choose another.
6. Still open from W1: W1-T02's pins (O-4), W1-T37's screen-reader pass, Q-10's dispatcher tables (W1-T12's fourth check, and with it Service's `keys` level and `tr2.dispatch-key`'s adapter and speculative variants), O-13 to O-18, Q-5, O-9 (W2-T41) and O-3; and the proposed records D-044, D-059 and now D-061 (W1b-T14).
7. W0-T25's first check. The front page's surface reached `ship` in W1b's verdict pass of Service, at the scope of the fixes it scored (§6). Whether that closes W0-T25 is the owner's call, and its marker stays `[=]` until then.

---

## 2. The measuring host

The host of W1's report, the owner's dev host: an Intel Core i5-13600KF with 20 threads and 31 GB of memory, NixOS on Linux 6.12.63, Node 22.22.2, npm 10.9.7, Bun 1.3.14 and rustc 1.96.0, and Chrome for Testing 153.0.8010.12 (Playwright 1.63.0's `chromium_headless_shell-1243`), started through a wrapper that sets `LD_LIBRARY_PATH` for NixOS [measured]. No browser drew with a GPU: WebGL2 ran on SwiftShader. Every other agent of W1b had finished, and the five gates ran at load averages of 1.9 to 3.7 and the Playwright smoke run at 1.3 to 5.7, where the `features` specs' own SwiftShader composition took the host to about 23 [measured].

The reference devices are still not named (O-9, carried to W2-T41), so frame time p95, the first 3D frame and post-processing GPU time have no measurement (§3.4).

---

## 3. Budgets as measured

The counting is D-023's: gzip by Node's zlib at its default level under Bun 1.3.14, one file at a time, in KB of 1,000 B. This review built `wave-1`'s tip, `c985c4c`, and `wave-1b`'s tip on the same host on the same day and compared every row of `verify:bundle` [measured]. Both builds have 63 budgets gated, 1 over a target (the front page's first-paint JavaScript, over its 130 KB target, as at W1's exit) and 1 skipped (`receipt.worker`, which has no source until W2). The gates themselves did not move: the 40 copies of `BUDGETS` that `es1b-merge.sh` kept, from before and after the last merge of each of W1b's 20 branches, are identical to each other and to the copy taken at W1's exit [measured from the merge logs].

### 3.1 The gated rows that moved

| Row | Gate [estimated] | `wave-1` at `c985c4c` | `wave-1b` at `1ed97ac` | Change | Under the gate at `1ed97ac` |
|---|---|---|---|---|---|
| Front page first-paint JavaScript (25 chunks) | 150 KB | 147,709 B | 147,933 B | +224 B | 2,067 B, and 17,933 B over its 130 KB target |
| Front page CSS | 30 KB | 18,469 B | 18,473 B | +4 B | 11,527 B |
| `/m/:module` | 200 KB | 180,036 B | 189,697 B | +9,661 B | 10,303 B |
| `/m/:module/:lesson` | 200 KB | 137,577 B | 147,043 B | +9,466 B | 52,957 B |
| `/map` | 200 KB | 166,672 B | 170,288 B | +3,616 B | 29,712 B |
| `/today` | 200 KB | 179,821 B | 183,208 B | +3,387 B | 16,792 B |
| `/play/engine-floor` | 200 KB | 186,200 B | 191,546 B | +5,346 B | 8,454 B |
| `/play/broken-bench` | 200 KB | 187,759 B | 189,660 B | +1,901 B | 10,340 B |
| `/play/verifier` | 200 KB | 183,102 B | 187,447 B | +4,345 B | 12,553 B |
| `/play/pool` | 200 KB | 180,384 B | 185,575 B | +5,191 B | 14,425 B |
| `/play/loop` | 200 KB | 180,469 B | 184,986 B | +4,517 B | 15,014 B |
| `/play` | 200 KB | 134,608 B | 134,823 B | +215 B | 65,177 B |
| `/labs/:lab` | 200 KB | 118,384 B | 124,845 B | +6,461 B | 75,155 B |
| `/about`, `/changes`, `/receipts`, `/trace-room` | 200 KB | 117,800 to 118,378 B | 121,073 to 121,687 B | +3,257 to +3,309 B | 78,313 B or more |
| `/evidence`, `/design`, `/settings` | 200 KB | 166,441, 175,779 and 174,739 B | 166,823, 176,066 and 174,997 B | +382, +287 and +258 B | 23,934 B or more |
| `scene-pool` | 40 KB | 39,837 B | 39,522 B | −315 B | 478 B |
| `scene-engine-floor` | 40 KB | 39,558 B | 39,231 B | −327 B | 769 B |
| `scene-verifier` | 40 KB | 39,564 B | 38,327 B | −1,237 B | 1,673 B |
| `scene-loop` | 40 KB | 39,469 B | 37,503 B | −1,966 B | 2,497 B |
| `scene-kitchen` (`/design`) | 40 KB | 35,844 B | 36,484 B | +640 B | 3,516 B |
| `scene-specimen` | 40 KB | 14,891 B | 15,301 B | +410 B | 24,699 B |
| `scene-kit`, the props every scene that reaches them counts again | 40 KB | 22,651 B | 20,914 B | −1,737 B | 19,086 B |
| `postfx` | 25 KB | 5,497 B | 5,469 B | −28 B | 19,531 B |

Unchanged [measured]: the entry and its static imports, 99,153 B (10,847 B under 110 KB and 847 B under its 100 KB target); `three-vendor`, 238,647 B; `forge.worker`, 2,595 B; the course index, 2,304 B; and the 27 lessons' and 5 modules' JSON, the largest 9,289 B (`tr1.l2`) and 3,027 B (`tr6`).

What the rows say:
- **The tightest routes** are `/play/engine-floor`, 8,454 B under, `/m/:module`, 10,303 B, and `/play/broken-bench`, 10,340 B [measured]. A task that grows the lesson blocks, the module page or Back of House should run `verify:bundle` first.
- **The module and lesson routes grew most**, by about 9.5 KB each: the game block's waiting ticket and its loader (W1b-T01), the prediction box (+5,176 B on `/m/:module` [measured 2026-11-09 by W1b-T02]), and the faces of the 18 new item families in the catalog, which every page that lists items carries (about 95 to 220 B a family [measured and derived by W1b-T04 to W1b-T07]).
- **The front page grew 224 B** and has 2,067 B of room [measured].
- **The game scenes shrank** with W1b-T10 and then spent most of what it freed (§3.2).

### 3.2 Scene rows, and draw calls

| Scene row | `wave-1` at `c985c4c` | after W1b-T10, at `34db7f6` [measured 2026-11-09 by W1b-T01] | `1ed97ac` | Under 40 KB |
|---|---|---|---|---|
| `scene-loop` | 39,469 B | 37,601 B | 37,503 B | 2,497 B |
| `scene-pool` | 39,837 B | 37,953 B | 39,522 B | 478 B |
| `scene-verifier` | 39,564 B | 37,692 B | 38,327 B | 1,673 B |
| `scene-engine-floor` | 39,558 B | 37,571 B | 39,231 B | 769 B |

W1b-T10 took 1.9 to 2.0 KB off each game scene, net of the haze, the pool and paper that it added [derived from the table], by merging the kit's geometry itself in place of three's `BufferGeometryUtils` and by moving the `/design` kitchen's spot lamps out of the kit's chunk. The finish rounds then spent it: Back of House's podiums, lectern and rolled ticket took its scene from 37,568 to 38,727 B [measured 2026-11-09 by its fix round]; The Tasting's lamps, framings and flange cost 122 B [measured by its round]; and the lesson blocks' round put Service's tapes in the DOM, which took 728 B off `scene-loop` and split `SceneCanvas` from `SheetInstances`, so that each scene that draws sheets counts one chunk more: The Reach-In 39,005 → 39,522 B, Back of House 38,717 → 39,231 B, The Tasting 37,806 → 38,327 B and the `/design` kitchen 35,973 → 36,484 B [measured 2026-11-09 by that round]. The rest of The Reach-In's growth, about 1 KB, is its own round's haze patches, mise and paper [derived from the measurements above].

**Draw calls** (A§11.1's gate: 100 a scene and 50,000 instances [estimated]). This review measured the games embedded in a lesson, through the test hook's `renderer.info` (`e2e/lesson-games-scene.spec.ts`, SwiftShader, tier forced) [measured]:

| Embedded game and level | T1: scene calls (in the frame), instances, triangles | T2: scene calls (in the frame), instances, triangles | T2 before W1b-T10 [measured 2026-11-09 at `c5fc7ea` by W1b-T01] |
|---|---|---|---|
| Service, `first-4-par` | 14 (14), 32, 101,224 | 14 (28), 67, 102,128 | 35 (49) |
| Service's full service, `async` | 14 (14), 51, 119,208 | 14 (28), 86, 120,112 | 35 (49) |
| Back of House, `nano` | 9 (9), 18, 110,508 | 9 (23), 20, 110,828 | 9 (23) |
| The Reach-In, `one-group` | 11 (11), 57, 84,738 | 11 (25), 61, 85,378 | 20 (34) |
| The Tasting, `overlap` | 12 (12), 34, 111,486 | 12 (26), 40, 112,446 | 26 (40) |

T2 draws what T1 draws now, because the kit's lamp light draws no shadow pass (W1b-T10). The game pages' own scene specs were not run by this review; what the rounds measured on them, each under the gate:
- Service, a night of `async` with twelve tickets hung and twelve fired, twelve plates, the rack, the comb and every tape: at most 17 scene draw calls at T1 (17 in the frame) and 17 at T2 (31 in the frame with bloom and the final pass), 127 and 162 instances [measured 2026-11-09 by the lesson blocks' fix round, over `017eb46`].
- Back of House, a whole level of the tallest practice house: 11 (11) at T1 and 11 (25) at T2, at most 40 instances, and at most 177,924 and 178,244 triangles [measured 2026-11-09 by its fix round, over `6376174`].
- The Tasting, every level played with its draws: at most 15 (15) at T1 and 15 (29) at T2, 149 and 155 instances [measured 2026-11-09 by its fix round, over `43aa9ae`], where W1 drew 38 (52) at T2.
- The Reach-In after its fix round: no figure reached this review.

### 3.3 What loads on demand: printed, held to no gate (D-059)

- **A lesson with a game block started:** the lesson's route with the embed and the game, 209,500 B (`loop`) to 216,332 B (`engine-floor`), and 256,584 B with Service's full service [measured]. The lesson's own first paint carries no game, scene or `three` (147,043 B, §3.1).
- **Service's full service:** `route /play/loop with FullService` went from 231,215 to 235,553 B [measured], 35,553 B over the 200 KB that a route has [derived], and in a lesson the same parts are 56,584 B over [derived]. This is O-16, still the owner's; its other half, `verify:games` reading the full service's views, W1b-T12 closed.
- **The item families:** each of the eight W1 families' rows grew about 3.0 KB [measured], the faces of the 18 new families in the catalog that every row counts; the 18 new families' rows are 18,880 to 28,865 B [measured].
- **The prediction box:** its reveal (`src/content/render/reveal.ts`) is 34,604 B, and the modules' readings 16,636 B (TR1), 31,495 B (TR2) and 7,961 B (TR5a) [measured].
- **The forge lab page:** `ForgeLabPage` went from 86,311 to 93,141 B with the crate's ticket and the slot readout (W1b-T08) [measured].
- **The front page's document:** 18,965 to 21,879 B. The two posters of Service's 2D kitchen, inlined in it, grew from 30,323 and 21,951 to 35,740 and 27,374 B of raw SVG with the finish rounds' pools and the phone's lens [measured]. The largest paint did not move (§3.4).
- **The site:** 5,736,964 B in 252 files to 6,144,147 B in 293 files, against Pages' 1 GB [measured].

### 3.4 The lab profile, and what was not measured

`e2e/perf.spec.ts`, A§11.1's mobile profile: Chrome for Testing 153.0.8010.12, the CPU 4× slower, 1.6 Mbit/s and 150 ms of round trip, 360 × 800 at 2× with touch, gzip over HTTP, on the production build of `1ed97ac` at load averages of 4.2 to 12.3 [measured].

| Vital | Gate [estimated] | Target [estimated] | At `1ed97ac` [measured] | At `35d5fd3`, W1's exit [measured 2026-11-08 by W1-T38] |
|---|---|---|---|---|
| LCP, median of three cold loads | 2,500 ms | 1,500 ms | 884 ms (884, 884 and 888); the heading `h1.es-ticket__title` | 884 ms |
| CLS across the swap to 3D | 0.1 | 0 | 0 in all three, the swap at 6,162 to 6,197 ms | 0 |
| INP, median of three players, 57 taps each over the four levels | 200 ms | 100 ms | 128 ms (128, 136 and 120): over the target | 136 ms |

Before the largest paint, 6 requests and 76.8 KB came over the link, where W1's exit had 74.0 KB: the document's growth (§3.3). After it, 43 requests and 493.0 KB, of which 444.7 KB was JavaScript [measured].

Not measured:
- Frame time p95 on the reference laptop and phone, the first 3D frame and post-processing GPU time: by hand on the reference devices, which O-9 has not named.
- The game pages' scene specs at the tip (the embedded scenes were measured, §3.2), GPU memory per scene, and INP on a game's page or on a lesson with a game open.

---

## 4. Gates at `1ed97ac`

### 4.1 The five gates of the merge

| Gate | Result [measured] |
|---|---|
| `npm run lint` | exit 0, in 14.9 s |
| `npm run typecheck` (`tsc -b`, which now checks `scripts/` and `tests/`, W1b-T14) | exit 0, in 17.2 s |
| `npm run build` | exit 0, in 22.6 s |
| `bun scripts/verify.ts all` | exit 0, in 149.8 s (§4.2) |
| `npm run test` (`bun test --timeout 30000`) | 8,976 pass, 28 skip and 0 fail: 9,004 tests in 305 files, 7,866,699 `expect()` calls, 600.8 s |

W1's exit had 7,921 pass and 25 skip of 7,946 tests in 266 files [measured 2026-11-08 by W1-T38]. The three new skips wait on what this host lacks, as the 25 do: they are source checks of two of TR1's families, `tr1.step-budget` and `tr1.what-moved`, that read the pins' unpacked tarballs (W1b-T03).

### 4.2 The gate registry (`bun scripts/verify.ts all`)

16 gates: 14 passed, 2 pending and 0 failed [measured].

| Gate | Status | What it printed [measured] |
|---|---|---|
| `content`, `claims`, `numbers` | passed | 5 modules, 27 lessons and 664 claims (648 at W1's exit; W1b-T03 added 13 and W1b-T04 3) |
| `kc` | passed | 45 KCs (TR1 8, TR2 11, TR5a 8, TR6 8, TR8 10), 7 thresholds, 10 confusable pairs and 24 kernelspace prerequisites; 45 with a graded reference and 0 planned |
| `items` | passed | 26 families and 83 variants, each level measured on 1,000 banded seeds. The bands accept 45.2% (`tr5a.pages-for-adapter` at level 3) to 100% of candidates. The best blind strategy is 2.5% to 13.8% against 15% on numeric levels, and up to 40.4% against 41.2% on choice levels (`tr2.runner-fallback` at level 1), O-14's reading |
| `games` | passed | 5 games, with the full service's own shell read (W1b-T12). Every graded level's best blind strategy is under 15% [estimated bound]: from 0.1% (`broken-bench/court`) to 14.5% (`verifier/gamma`) and 14.7% (`engine-floor/map`), each on 150 to 20,000 banded seeds |
| `determinism` | passed | 224 files in scope and 0 findings |
| `boundaries` | passed | 606 files, 17 reachable from `src/main.tsx` without a dynamic import, 0 violations |
| `bundle` | passed | §3 |
| `tokens` | passed | 107 roles, 2 schemes, 101 declared pairs, each at its threshold |
| `vendor` | passed | 25 files match VENDOR.md at `d478f91a0af5` |
| `labs` | passed | 3 labs and 27 builds in 110.6 s: each template traps on every check, each reference passes 50 runs on fresh seeds and names itself, each solved build passes, and each of the 18 wrong builds (16 of the two graded labs' bestiaries and 2 of the toy's) is caught by a named check |
| `pins` | passed | 8 entries of `course.lock.json` |
| `routes` | passed | 17 route-table entries with 67 documents, and the 24 paths of `e2e/routes.ts` each have one |
| `schema`, `vectors` | pending | W2-T01 |

### 4.3 W1-T38's first check

`bun scripts/verify-kc.ts --final` exits 0: "45 KCs (tr1 8, tr2 11, tr5a 8, tr6 8, tr8 10), 7 thresholds, 10 confusable pairs, 24 kernelspace prerequisites; 45 with a graded reference, 0 planned" [measured]. The 11 placeholders of W1-report §5 left `content/kc/graph.yaml` as their families landed: `tr1.phases-vs-one-budget`, `tr1.request-states` and `tr1.read-at-the-pin` with W1b-T03; `tr2.step-calls`, `tr2.one-budget`, `tr2.gpu-dependent-defaults` and `tr2.dispatch-keys` with W1b-T04; `tr5a.slots-vs-pages` with W1b-T05; and `tr8.goodput-denominator`, `tr8.littles-law` and `tr8.tool-defaults` with W1b-T06. `scripts/verify-kc.ts` is as `wave-1` had it. So W1-T38's first check holds on `wave-1b`, and TRACKER shows W1-T38 `[=]`.

### 4.4 Playwright

Chrome for Testing 153.0.8010.12 through the wrapper, 2 workers, on the production build of `1ed97ac` [measured].
- **`smoke`, the pull-request subset:** 193 of 193 pass in 3.1 minutes, with the smoke project's new flag (§4.5). axe finds no violation at all on the 66 audits that print one: no serious or critical, and no moderate, with `landmark-unique` now failing on a game's page (W1b-T09). Keys alone win the front page's four levels and play the first level of each of the five games to its debrief at 360 and 1280 px; no page asks for anything outside the origin; the 2D screenshots of `/` match their baselines within 1%.
- **W1b's specs in `features`,** which the merge gates do not run: `lesson-games`, `lesson-games-scene`, `lesson-predict`, `lab-kits`, `titles`, `tr5a-items`, `items`, `map` and `today`, 192 of 193 in 11.5 minutes at load averages of about 15 to 23, which the project's SwiftShader composition makes. The one failure, `lesson-predict.spec.ts:201` for `tr2.l5.p1`, ran out its 10 s wait for the full service's `modes` stage while the walk played `graphs`, and passed alone in 37.9 s with its build [measured]: a load flake, as W1-report §9.5 describes them. With these: keys alone start each game's block in its lesson and play it to its debrief at 360 and 1280 px, and a graded block writes the same `play` event as the game's page (43 of 43); one 3D canvas is live with two blocks open, and each embedded scene is under 100 draw calls (11 of 11); every kit of the manifest is linked and hashes to its SHA-256 (25 of 25); every game and lab page keeps its title (20 of 20); the map's 44 pass, items and lab runs moving its pips among them; TR5a's item blocks (10), the items (14) and Today (12) pass. axe found no violation on 52 audits, and the moderate `landmark-unique` on 6 nodes of `/m/tr5a/l4` with its three games open, at 360 and 1280 px, which does not fail (§10).
- **`lab`, the lab profile:** 2 of 2 pass (§3.4).
- **Not run here:** the rest of `features`, including the game pages' scene specs, and the nightly sweep.

### 4.5 Every gate table against `wave-1`

`git diff wave-1 wave-1b -- scripts/verify-*.ts playwright.config.ts e2e/ tests/bundle tests/ci .github/` is 44 files, 2,841 lines added and 113 removed [measured]. Every change was read for a budget, threshold, tolerance or check that moved toward looser. None did. Two changes moved a check without loosening it, the smoke project's browser flag and the re-blessed screenshots, and the table says why.

| File | What moved | Verdict |
|---|---|---|
| `scripts/verify-bundle.ts` | `BUDGETS` untouched; it also prints the lesson's route with each game a block embeds, and each game's lazy parts with it (W1b-T01), as info | not looser |
| `scripts/verify-games.ts`, with `scripts/games/blind.ts` and `packages/play/*/blind.ts` (new) | Measures ASSESSMENT §4.1's bound on every graded level and fails one over 15%, or one with no probe; reads the full service's shell (W1b-T12). `BLIND_BOUND` is 0.15, as at W1 | stricter |
| `scripts/verify-items.ts`, `scripts/verify-tokens.ts` | A type annotation, a cast's reason, and a guard that throws on a colour role that `COLORS` lacks (W1b-T14) | the same checks |
| `playwright.config.ts` | The smoke project's browser composes on the CPU (`--disable-gpu-compositing`, W1b-T13); `ES_E2E_PAGES=1` serves the build as Pages does (W1b-T09). `features` and `lab` keep their flags | moved, not looser: the same specs, assertions, tolerance and retries. The smoke pages are composed on the CPU instead of through SwiftShader's GL, which made the runner's browser stop answering; WebGL still draws on SwiftShader, and the nightly sweep composes as before |
| `e2e/a11y.spec.ts`, `e2e/pool.spec.ts` | `landmark-unique` fails on a game's page, whatever its impact (W1b-T09) | stricter |
| `e2e/network.spec.ts` | The refusal is read at the page's own path, held to `/map` with or without the slash that Pages adds (W1b-T09) | the same check, and it holds on Pages |
| `e2e/reduced-motion.spec.ts`, `e2e/support/walks.ts` | A wait of 300 ms and two of 50 ms became waits for the state they stood for: a frame counter, and two frames for focus to follow (W1b-T13) | the same checks |
| `e2e/screenshots.spec.ts` and its four baselines | A comment; the baselines re-blessed for Service's round-1 pools. `TOLERANCE` stays 0.01 and the capture's wait 30 s | re-blessed for a reviewed change at an unchanged tolerance, as W1's A18 |
| `e2e/engine-floor-scene`, `verifier-scene`, `pool-scene`, `loop-full`, `front`, `items`, `broken-bench`, `map`, `today` and `loop` specs | New checks (the pools, the tapes, the printer in the first screen, the reveal's clip, the tail's box, progress from items and labs) and changes that follow the build (a helper hoisted, Today's family found by variant, the phone's lens) | stricter or the same |
| New specs: `lab-kits`, `lesson-games`, `lesson-games-scene`, `lesson-predict`, `titles`, `tr5a-items` | New coverage, in `features`. `tr5a-items` waits up to 60 s on page state, for the software renderer's first wide frame (W1b-T05) | added |
| `tests/bundle/verify-bundle.test.ts` | Tests of the new printed rows | added |
| `tests/ci/*` | `shards.test.ts` (new); `workflows.test.ts` holds the shard shape, a 15-minute backstop, the Bun fallback, the labs' paths and the nightly's knobs; `e2e.test.ts` holds the smoke flag to `smoke` and the PR subset's fixed waits to two | stricter |
| `.github/workflows/ci.yml` | The tests job is four shards with a 15-minute backstop each, where the whole suite had 30; every Bun step falls back to npm's copy of the pinned release (PR #4) | stricter; the fallback fails unless `bun --version` prints the pin |
| `deploy.yml`, `labs.yml`, `nightly.yml` | The Bun fallback; `labs.yml` runs for seven more paths that `verify:labs` reads; the nightly sets `ES_HEAVY=1` and runs the lab's rates at 1,500 trials a row | stricter |

Read for the same purpose, outside that command:
- `tests/build.test.ts` names the new lazy parts in its list (the game embed, the reveal and the modules' readings), each of which `verify:bundle` prints, and now holds three's geometry addon to no chunk at all. Widened by name for parts that are printed, as D-059 allows, and stricter on the addon.
- `tests/content/claims.test.ts` judges the repository's claims on the day of the latest claim, where it had a fixed 2026-11-04 (W1b-T04). The gate itself, `verify:claims`, reads the clock, so a claim dated in the future still fails it.
- The other test files with removed lines were spot-read (`render`, the three scene tests, `loop-layout`, the module tests, `smoke`, `today`): their assertions follow what the build now draws, and none is narrowed. Not every line of the 15,466 added to `tests/` was read.
- `eslint.config.js`, `bunfig.toml`, `tests/seeds.ts` and `scripts/verify.ts` did not change; `tsconfig.json` and `tsconfig.tools.json` add a project (W1b-T14).

### 4.6 CI on GitHub

`main` is at `1b402ca`, PR #3's merge, and its deploy succeeded; PR #4 (`w1/bun-fallback` at `197705e`) and PR #5 (`wave-1` at `c985c4c`) are open, CI passed on the head of each, and Labs on PR #4's [measured 2026-11-09 from GitHub's API]. `wave-1b` has never been pushed, so no workflow has run on W1b's code: the four test shards and the smoke project's flag have run only on the dev host. W1b-T13 measured the smoke shards at 82, 71, 58 and 74 s on four pinned cores, where the old flags took 206, 196, 293 and 306 s [measured 2026-11-09 at `54d880f` by W1b-T13]; how long they take on a runner is [unverified]. The nightly runs only by hand until `NIGHTLY_ENABLED` is set (D-052).

---

## 5. W1b's tasks

Every task merged; TRACKER shows each `[=]` until the owner merges the wave. Lines added leave out the test fixtures, the lockfile, the Markdown export and the screenshot baselines [measured with `git`]. The last column is what each task left at its merge: the close-out round has since closed the docs items in it (§10).

| Task | Size | Merged at | Lines added | What it built | What it left open |
|---|---|---|---|---|---|
| W1b-T07 Progress from items and lab checks | S | `fe0d66c` | 506 | The map and the module pages name an item's KCs by its variant, through the families' faces, and a lab run's by its checks, through a table that imports no oracle (`packages/sim/forge/check-kcs.ts`); the first wiring would have put `/m/:module` 7,510 B over its gate [measured 2026-11-09 by W1b-T07] | Today reads no lab event; the GPU labs' tables (W2); a `prove` event will earn all of its lab's KCs (Q-5) |
| W1b-T10 Scene kit: haze, the lamp's pool, and paper | L | `1cc66d4` | 545 | The kit's lamp is Back of House's round-2 recipe (a cone of warm haze and an edgeless pool, no spot light), the room's light falls into haze, paper has tooth, a cut edge, thickness and curl, and Service's 2D pools lose their white core; the bytes came from the kit's own geometry merge | The four finish reviews (§6) |
| W1b-T06 TR8's item families | M | `397331b` | 3,499 | `tr8.goodput-denominator`, `tr8.littles-law` and `tr8.which-flag`, with a table of the tools' flags | The wrong claim (§8.2); TR8's third lesson's exit-check sentence fits two thirds of its draws; six TR8 KCs have no family |
| W1b-T03 TR1's item families | M | `6a791ac` | 3,999 | `tr1.which-mechanism`, `tr1.where-does-it-run`, `tr1.request-state`, `tr1.step-budget` and `tr1.what-moved`, and 13 claims | An item block names no variant, so a lesson can draw one it has not taught (§8.2) |
| W1b-T08 Lab pages hand over the crate | S | `54d880f` | 1,816 | Each forge lab's page links its kit with its size, its SHA-256 and a line that checks the download, and `hybrid-kv`'s page plays TR5a's slot night on the learner's module | The night's design call (§1); A§3.1's `/labs/:lab` row and D-042's W1 note do not say so yet |
| W1b-T01 Lesson game blocks play their levels | L | `34db7f6` | 1,910 | A game block embeds its game at its level and mode, loaded when started; one live canvas a page; a graded block draws its seed; every run, from a lesson or the game's page, is written as the same `play` event; The Reach-In opened graded on its practice seed, and now draws one | `landmark-unique` with three Reach-In games open on `tr5a.l4` (6 nodes, moderate); DESIGN.md has no entry for the game block; The Inspection keeps its graded toggle hidden in a lesson |
| W1b-T04 TR2's item families | M | `ed56f0c` | 5,868 | `tr2.step-order`, `tr2.preempt-victim`, `tr2.default-budget`, `tr2.runner-fallback`, `tr2.dispatch-key` and `tr2.kv-after-graphs`, and 3 claims; the claims test's day | The variants that need Q-10's tables; no exit ticket is sure to hold a numeric item (§8.2) |
| W1b-T05 TR5a's item families | M | `a34939c` | 5,508 | `tr5a.blocks-held`, `tr5a.hit-length`, `tr5a.pages-for-adapter` and `tr5a.slots-vs-pages` | `tr5a.all-or-nothing` has no family; `e2e/tr5a-items.spec.ts` runs nightly and by hand, not in the pull-request subset |
| W1b-T09 Titles, stub pages and the live check's other findings | S | `68c9421` | 946 | §7's findings 6 to 10 | THREE.Clock's warning stays with its dependency |
| W1b-T11 The Inspection's tail gives nothing away | S | `29e48dc`, `6376174` | 406 | The tail lists the slowest min(n, 100) orders at every desk, in a box that scrolls, so its length says nothing of the p99's place; 1,000 seeds hold it | — |
| W1b-T15 Docs follow what was built | S | `43aa9ae` | 83 | ASSESSMENT §4.6's measured rates, DESIGN.md's Ticket, the claims README's rule for quotes across lines, A§5.6, A§5.7 and A§9.2, WORLD.md and TR5b's adapter field, the research rows | — |
| W1b-T12 `verify:games` measures the blind bound | M | `ca0e315` | 1,379 | §4.2; twelve mutations each make a real level guessable, and the gate fails each | — |
| W1b-T13 CI | M | `00e5364` | 549 | §4.5 and §4.6 | No run on a runner yet |
| W1b-T02 The prediction box | M | `cdffd3e` | 2,382 | 17 predictions read from a run of Back of House, Service or The Reach-In (TR1 9, TR2 3, TR5a 5); every placeholder names an open task; W2-T42, W2-T43 and W2-T44 added | 22 predictions (W2-T43); the trace block and two card kinds (W2-T42); Today and the Mirror read no `predict` event (W2-T44) |
| W1b-T14 Type-check `scripts/` and `tests/` | M | `017eb46` | 606 | `tsconfig.tools.json` and a declaration of the parts of Bun they call (D-061, proposed); 85 errors mended in their types; six of the seven unexplained casts gone and the seventh explained | `e2e/` and `playwright.config.ts` are not type-checked: 31 errors in 19 files [measured 2026-11-09 by W1b-T14] |

Beside the tracker's tasks: the tracker's W1b section (`3a8aaa4`), PR #4's commit (`197705e`), and the five finish-fix rounds of §6 (234 to 636 lines each, 1,843 in all) [measured]. From `wave-1` to `wave-1b` the diff is 332 files, 35,766 added lines and 2,244 removed, in 23 commits and 22 merges [measured].

---

## 6. The finish reviews

impeccable's finish reviewer judged each surface from captures at 1440 and 390 px: for the four 3D surfaces, a verdict pass on W1's open fixes (W1-report §7.2), one batch of fixes merged through the gates, and a second verdict pass; for the lesson blocks, a first review, a fix round and a verdict pass. The detector found nothing on any round's tree [measured by the capture runs]. Each verdict scores the fixes it was given, and not the whole surface.

| Surface | Round 1, at | Fixes merged at | Round 2, at | Final, in the reviewer's word |
|---|---|---|---|---|
| Service (`loop`), on `/` and `/play/loop` | `fix`, 5 material fixes (`ed56f0c`) | `e9c9911` | `ship` (`e9c9911`) | `ship`, at the scope of the five fixes |
| The Tasting (`verifier`) | `fix`, 6 (`ed56f0c`) | `f169065` | `fix` (`f169065`) | `fix`, four open |
| Back of House (`engine-floor`) | `fix`, 4 (`a34939c`) | `309abde` | `fix` (`309abde`) | `fix`, one open |
| The Reach-In (`pool`) | `fix`, 4, as its surface brief records (`68c9421`) | `2d4a3aa` | `fix` (`2d4a3aa`) | `fix`, two open, and two more seen in a lesson, counted with the lesson blocks |
| The lesson blocks, on TR2's third lesson and TR5a's first | a fix round followed, on seven fixes as the round's commit lists them (`cdffd3e`) | `1ed97ac` | `fix` (`1ed97ac`) | `fix`, four open |

**The open fixes, in the reviewers' words, shortened:**
- **Service.** None of the five. Resolved: the 2D pools are amber drawn along the steel's grain, not blurs; the back wall's luma falls about 42 toward the corners at 390 px and 47 toward the right edge at 1440 px; the floor darkens as it recedes; the printer's housing ends at about y 837, inside the 844 px first screen; the 390 px 3D pools are amber again with the grain showing. Not scored: on `/play/loop` at 1440 px (T2) the pools are still saturated peach ovals that hide the grain. After this verdict the lesson blocks' round changed Service's tapes (into the DOM), its bell and its phone's 2D lens; the lesson blocks' second verdict scored them and left two open, the 2D tapes and the bell (below).
- **The Tasting.** (1) At 390 px the wall, hood and lamps still fill the top 58% of the 437 px box and the floor the bottom 18%, with stacks 5 to 42 px tall: the camera alone cannot fix it, and a box shaped to the pass, about 358 × 230 px [estimated by its fix round], is the owner's call. (3) The authored moment: the settled 8,000-round frame differs from the empty first level only by six rings and about ten loose plates, and 10 rounds from 1 only by rings on the wires. (6) The 1440 px shades still read as frosted glass, not opaque steel. A regression of round 2: the 1440 px back wall lost its tile and is a flat slate plane (a patch's standard deviation 0, against 0.030 in round 1). Resolved: one pool on the course being tasted, under its lamp; the hood's lip whole along the top edge; nothing sliced by the edge.
- **Back of House.** (4) The ticket still hangs as a flat card with a small flick at one corner: no curl that reads and no lit edge that shows the paper's thickness. Resolved: a hand's tape on the 390 px scene; a podium of its own for each pair of hands in place of the full-width slab; the line's tape cut to its words.
- **The Reach-In** (round 2, on nine captures of `2d4a3aa`; `fix`, two open). Its round 1 asked for the haze, the lamp's warmth at T1, the mise and the paper (its surface brief), numbered (1) to (4) in that order.
  - (3) The filled pans. At the mid-level framing the rack still reads first as a grid of blue, yellow and green, and not as pans of food. The corn is still a key yellow, its mean RGB moving from (170, 144, 57) to (175, 150, 60) [measured by the reviewer], and wants a cooked, uneven gold; the navy stays. The mounds and glints show only close up, so the pans want brighter lit tops, a darker rim where the fill meets the pan, and highlights that differ from pan to pan: turning a third of them end for end is not enough.
  - (4) The rail tickets. The clips now pinch the tickets and their top corners are round, but the cut edge is a dark outline and not a thickness that the camera can see, and no paper tooth reads at the mid-level or From above framing. The slip should turn, or take a lit side face, so that its edge reads as a strip, and the grain in its shading should rise until the default camera shows it. The bottom curl is unchanged.
  - Resolved: (1) the haze, as the floor's luma rises with depth (77 at the front of one framing and 134 at the back, where round 1's was flat at about 78 [measured by the reviewer]) and the back wall's tile is lifted pale; (2) the lamp's warmth at 390 px, with 1,335 pixels of the pass that are redder than blue by more than 20, and by at most 61, where round 1 had none and at most 8 [measured by the reviewer]. No regression: the reach-in, the pass and the tickets stay clear of the haze, and the 2D path and the DOM numbers look unchanged. Not scored as open: the hood's edges at the first screen's top left are still sharp, and the warmth hugs the tickets' outlines more than it spreads under the lamps.
  - The lesson blocks' verdict (below, fix 8) recaptured the scene in TR5a's first lesson at `1ed97ac` and found two defects still there, which this verdict did not score: lamp cords across the rack, and pans that read as a flat chart from the default camera.
- **The lesson blocks** (round 2, on 75 captures of `1ed97ac`; `fix`, four open). Round 1's seven fixes, as the round's commit lists them, are (1) a titled ticket's stamped title leads the paper, with the page's and the block's ids on the foot line; (2) under 36rem the full service's debrief prints each stage as a block; (3) the reveal's feed keeps no clip, so the verdict's focus ring keeps its sides; (4) Service's 2D view on a phone draws through a wider lens, so the printer, the bell and the spike stand in it; (5) Service's tapes are the design system's tape in the DOM, on the objects they name; (6) the bell's dome and base; and (7) the `async` level's draw-call budget measured (§3.2). The verdict adds an eighth, the recapture of The Reach-In in TR5a's first lesson.
  - (5) Service's tapes in the 2D view. The 3D view is fixed: the tapes are DOM tape with caps about 7 px tall at 1440 and 390 px, so the type is at or above the ramp's smallest step [measured by the reviewer], and THE LINE · GPU sits on the last station, BINNED · GHOST on the bin, and COMB · LAUNCHES and MOLDS · SIZES on their objects. The 2D drawing still prints THE LINE · GPU, FIRED RAIL and THE EXPO · CPU at about 4 to 6 px at 1440 px, and the phone's wider lens (4) shrinks them to about 2 to 3 px, which cannot be read [measured by the reviewer]: a regression of (4), and the breach of the size floor and the numbers rule that (5) closed in 3D. THE LINE · GPU still floats on the tile wall beside the third lamp shade. The reviewer's remedy: take the 2D tapes out of the SVG and print them as DOM tape at the 3D layer's size, each on its object, the line's on its last station.
  - (6) The bell, the game's one authored moment. The dome is lathe-turned, with a knob, and lighter than before, but at 1440 px it still reads as a grey mouse with a white stripe emblem on a black puck. The tubes' reflection reads as a printed logo, the base is black and not deep steel, and a stronger room reflection did not make it chrome. The dome wants a bright polished body with a soft rolled highlight across its crown and a visible base rim, with no hard stripe from the reflected tubes, and a deep steel base that differs from the spike's beside it.
  - (8) The Reach-In as a lesson draws it. The first review named three defects there, and the recapture at the tip, which holds The Reach-In's own fix round, finds two of them still. Two lamp cords run from the top edge across the whole rack, and from the default camera the 104 pans read as a flat blue-and-yellow chart seen from above. The third, the floor, now lifts a little toward the back, and tile still fills the left third. The reviewer's remedy: shorten the cords, or reframe the front shot so that the lamps hang over the prep table without crossing the pans; and lower or tilt the default shot so that the pans show their rims, depth and mounded mise.
  - Resolved: (1) the PREDICT ticket's stamped title leads the paper, and the foot line prints the page's id and the block's, as TR2.L3 and TR2.L3.P1 on TR2's third lesson and TR5A.L1 and TR5A.L1.P1 on TR5a's first, where the ticket with no title keeps its head line; (2) at 390 px the `async` debrief prints each stage as a block of its own, with the call against the model's whole and no sideways box; (3) the verdict's focus ring is closed on all four sides and matches its reduced-motion twin to within 1 level [measured by the reviewer]; (4) the 2D view at 390 px holds the printer with its tickets at the left and the bell and the spike at the right, inside the box; (5) in 3D; and (7) the budgets, which GAMES.md records and §3.2 reads.

**W1's three recurring faults (W1-report §7.4), after W1b:** the room's haze and the lamp's pool on the steel are resolved for Service, Back of House and The Reach-In (its haze, and its pool at 390 px, in its round 2); The Tasting's pools are resolved and its haze is in part, with the flat back wall a new regression; and the paper is partial for Back of House (fix 4) and for The Reach-In (fix 4), where the cut edge reads as a drawn line and the tooth does not show at the default camera.

**The close-out round.** One more fix round and verdict pass for Service, The Reach-In, The Tasting and Back of House runs on `wave-1b` as part of the round that added the two verdicts above. The coordinator adds its results to the wave PR, so this report does not give them.

---

## 7. The live check of 2026-11-09

After the first deploy, three agents checked `http://enginespace.naigap.com`, serving `main` at `1b402ca`, in Chromium: the repository's smoke and nightly specs against the live origin (smoke 192 of 193, nightly 695 of 696; the one failure was the same test both times), a sweep of the 66 documents at 360 and 1280 px in two passes (no failed check; the only console output was THREE.Clock's warning on the six 3D pages), and a review that re-ran each failure on the live origin and on a local copy of the same files [measured 2026-11-09 by the live check]. TRACKER's W1b section and W1b-T09's task list what they found.

| # | Finding | Closed by, or carried to | Evidence at `1ed97ac` |
|---|---|---|---|
| 1 | 40 game blocks print "Not built yet" beside a disabled "Start level" | closed, W1b-T01 | Every block names a level that exists, and starts it (§1's table, §4.4) |
| 2 | 39 prediction boxes print "Not built yet" | 17 closed by W1b-T02; 22 carried to W2-T43, and their tickets say so | `tests/play/predictions.test.ts`, `tests/content/predict.test.ts`, `e2e/lesson-predict.spec.ts` |
| 3 | 24 item sets print "Not built yet: the generator for …" | closed, W1b-T03 to W1b-T06 | The 36 item blocks name 26 families, all built (§4.2) |
| 4 | 8 lab blocks (three in TR5a's lessons, five on module pages) print placeholders that name tasks marked `[=]` | closed, W1b-T02 | The five of the two forge labs print none and link a built page; the three of the GPU labs name W2-T34, W2-T35 and W2-T36; `tests/content/pending.test.ts` fails on a placeholder that names a task marked `[=]` or `[x]` |
| 5 | No page links the forge labs' kits | closed, W1b-T08 | `e2e/lab-kits.spec.ts`: every file of the manifest is linked from its lab's page, and the linked bytes hash to the manifest's SHA-256 |
| 6 | Game and lab pages lose their own `<title>` after mount (WCAG 2.4.2) | closed, W1b-T09 | `e2e/titles.spec.ts` reads `document.title` after mount on every game and lab page |
| 7 | `/receipts`, `/changes`, `/trace-room`, `/about` and ten labs say only "This page is not built yet", and `/about`'s description promises more than it holds | closed, W1b-T09 | Each says what it will hold and which task builds it (`tests/pages/unbuilt.test.ts`); `/about`'s description says what it holds |
| 8 | `e2e/network.spec.ts:143` fails on the live origin, which answers `/map` with a 301 to `/map/` | closed, W1b-T09 | `ES_E2E_PAGES=1` serves a build as Pages does, and the spec passes there and on `vite preview`; the smoke run here (§4.4) |
| 9 | A moderate `landmark-unique` on `/play/pool` | closed, W1b-T09 | The a11y spec fails `landmark-unique` on a game's page; none in the smoke run here |
| 10 | THREE.Clock's deprecation warning on `/`, `/design` and the four 3D games | explained, and it stays: @react-three/fiber 9.6.1 makes a clock in the store of every Canvas, and no code of this repository makes one (W1b-T09). Carried to the next change of A§14's pins (a record, and the owner's); W3-T17 files it if it is still there | `e2e/support/site.ts` names the dependency where the specs let the warning through |
| 11 | Over http the forge labs cannot hash a module (no `crypto.subtle`) | the deploy's: carried to the owner, who turns on Enforce HTTPS once GitHub issues the certificate (D-060) | No certificate yet (§1); once W1b deploys, a game run on the http origin is not recorded either, and says so under the game (W1b-T01) |
| 12 | In the evidence, not raised: at 1280 × 900 the largest paint is the nav's board, not the heading, at 1,784 ms on the live origin and 212 ms on the local copy [measured 2026-11-09 by the live check's review]; `e2e/front.spec.ts` holds the heading as the largest paint at 1440 and 390 px only | carried to W3-T10 | — |

---

## 8. W1b against ARCHITECTURE, GAMES, ASSESSMENT and DECISIONS

### 8.1 What holds

- **A§4.3 and A§6:** a lesson's game block embeds `src/games/<id>` at its level and mode; its code, its scene and `three` load only when the learner starts it; and a page keeps one live 3D canvas, each other embed showing its 2D view (W1b-T01).
- **A§6.3, A§7.2 and ASSESSMENT §3.2 and §4.3:** a graded block draws its seed when it starts, and writes the same `play` event as the game's own page for the same run, which a test compares; GAMES.md §5 now says that the page records too.
- **ASSESSMENT §4.1:** both item families and graded levels are held to the blind bound by the gates, as the section says they are (§4.2).
- **ASSESSMENT §4.7:** a `predict` event is stamped `practice` and neither the map nor Today earns anything from it (`src/progress/derive.ts`, `src/items/today/cards.ts`).
- **ASSESSMENT §4.5 and §4.6:** the labs' checks and bestiaries hold (§4.2), and §4.6 now records the rates that W1-T26 and W1-T27 measured (W1b-T15).
- **I1:** no page of the smoke run asks for anything outside the origin, and the live origin made no request off itself in the live check.
- **D-023 and D-059:** the budgets are D-023's, and what loads on demand is printed (§3).
- **D-041:** `tr2.dispatch-key` reads the dispatch rules kept as data, and leaves out the variants that need Q-10's tables.
- **D-042:** the slot readout of TR5a §5 is built (W1b-T08).
- **A§10.1 to §10.3:** the shards, the labs' paths, the nightly's knobs and the Bun fallback are as ARCHITECTURE now describes them (W1b-T13, PR #4).

### 8.2 Where the build departs from the docs

| Item | Where | What the build does | Status |
|---|---|---|---|
| 22 predictions with no reveal | TRACKER's W1b exit criteria; ASSESSMENT §4.7 | Their tickets take no answer and name W2-T43 | W2-T43; its third way needs the owner (§1) |
| Predictions read by Today and the Mirror | ASSESSMENT §4.7 ("Predictions feed the Mirror's calibration and Today's scheduling") | No reader yet | W2-T44 |
| A wrong claim | `content/claims/vllm/bench.yaml`, `vllm.bench.metric-percentiles-default`, shown by TR8's third lesson | Its second sentence, "reports the tail and no median", is false at the pin (§1); its value, 99, and its quote are right. `packages/sim/bench/broken.ts` and `packages/play/broken-bench/entry.ts` cite it for the `mean-as-tail` flaw | fix the text and regenerate the export; W3-T13 at the latest |
| The exit ticket's rule | ASSESSMENT §4.2 (passed with at least 2 right, at least 1 numeric or constructed; a miss is recorded as read) | The item block tallies the right answers and records no pass or read state, and `startAttempt` does not make sure an exit ticket holds a numeric item: TR2's first and fourth lessons draw none in about 30% of attempts [derived by W1b-T04] | needs a task, with Q-5's completion |
| What an item block asks | ASSESSMENT §4.2 (an exit ticket asks what the lesson taught) | A block names a family, a level and a count, and the seed picks the variant, so TR1's first lesson can draw a vLLM-group stage (W1b-T03) | a schema key on the item directive: the owner's, or a later task's |
| The Reach-In's measured budget | GAMES.md §8 | Its bullet is W1's (39,921 B on 2026-11-08); the tip measures 39,522 B | closed by the close-out round: GAMES.md §8 gives the tip's figure with its tag |
| The slot readout | A§3.1's `/labs/:lab` row; D-042's W1 note | Built (W1b-T08); neither said so | closed by the close-out round: both say so now |
| The lab's rates at 1,500 trials | ASSESSMENT §4.6 ("1,500 by hand through the host") | The nightly's `lab-rates` job runs them (W1b-T13) | closed by the close-out round: §4.6 follows the job |
| Service's full service with no gated row | A§11.1; O-16 | 235,553 B on `/play/loop`, 256,584 B in a lesson (§3.3) | O-16 |
| `e2e/` not type-checked | D-061 | 31 errors in 19 files, 20 of them from axe's copy of Playwright's `Page` type | needs a task |

W1's departures (W1-report §8.2) stand as they were, but for those that W1b closed: the 17 lessons' exit tickets that named unbuilt families (W1b-T03 to W1b-T06), the progress sources (W1b-T07), the error rates of ASSESSMENT §4.6 (W1b-T15), and the halves of the blind bound and of the full service's row that were `verify:games`' (W1b-T12). O-14 and O-16 stay the owner's.

---

## 9. The owner's open items

- **Merges:** PR #5, PR #4, then `wave-1b` (§1).
- **HTTPS:** Enforce HTTPS once the certificate is issued (D-060).
- **The finish reviews:** ship with the open fixes of §6 listed or schedule them (W3-T09), once the close-out round's results are on the wave PR; The Tasting's phone box; W0-T25's first check (§1).
- **Decisions W1b raised:** W2-T43's third way; the slot night; a variant key on the item directive; D-061 (proposed; `@types/bun` in its place is the alternative).
- **Carried from W1:** W1-T02 (O-4), W1-T37, Q-10, O-3, O-9, O-13 to O-18, Q-5, D-044 and D-059.

---

## 10. Follow-ups

- **The wrong claim** (§8.2): correct `vllm.bench.metric-percentiles-default`'s text, run the content compiler, commit the export, and check the `mean-as-tail` flaw's words; before W2's TR8 work, and W3-T13 at the latest.
- **W2-T42, W2-T43 and W2-T44,** which W1b-T02 added: the trace block and two card kinds, the 22 predictions, and the readers of the `predict` event. When W2-T43 adds readings for TR6 and TR8, each goes into `MODULES_WITH_READINGS` and `tests/build.test.ts`'s list.
- **The exit ticket's rule** and a numeric item in every exit ticket (§8.2): a task with Q-5's completion state.
- **W1b's ids in the guards (closed by the close-out round).** `tests/ci/support.ts`, `tests/ci/workflows.test.ts` and `scripts/verify-kc.ts` read task ids as `W\d-T\d\d`, so W1b's ids were invisible to the marker guard (`MERGED`), the reserved-step check and `verify:kc`'s task check, and this review added W1-T38 to `MERGED` and left W1b's ids out. They read `W\d+b?-T\d\d` now (`TASK_ID` in `support.ts`), and `MERGED` lists W1b's sixteen tasks. Beside them, `packages/schema/kc.ts` takes a W1b id as a KC's `planned` task, and `tests/forge/pack-labs.test.ts` keeps W1b's ids out of the kit's documents as it does the others'. `tests/ci/task-ids.test.ts` fails on a heading of TRACKER.md whose id the pattern cannot read, and `workflows.test.ts` on a W1b task that is marked and not listed.
- **Accessibility:** `landmark-unique` on `/m/tr5a/l4` with its three Reach-In games open, 6 nodes at 360 and 1280 px, moderate [measured] (W1b-T01): W3-T11, or W1b-T09's rule for a page with two copies of one game.
- **Performance:** the largest paint at 1280 px (§7, 12): W3-T10. INP on the front page is 128 ms, over its 100 ms target (§3.4).
- **Room:** `scene-pool` has 478 B and `scene-engine-floor` 769 B; `/play/engine-floor` 8,454 B and `/m/:module` 10,303 B. The next task that grows a scene frees bytes first.
- **Bands that are tight but hold:** `verify:games`' `engine-floor/map` at 14.7% and `verifier/gamma` at 14.5% of 15%; `verify:items`' `tr2.runner-fallback` at level 1, 40.4% of 41.2%, and `tr6.mask-phases` at level 1, 30.4% of 30.9% [measured]. A change to those levels or families re-runs the gate.
- **Tests:** `tests/content/render.test.ts` still fixes its day at 2026-11-04, where the claims test no longer does; W1b's lesson, prediction, kit, title and TR5a item specs run in the `features` project, nightly and by hand, and none of them in the pull-request subset, so a pull request that breaks a lesson's game block passes CI (W1b-T01's follow-up: move one lesson walk into `smoke`); `e2e/` and `playwright.config.ts` are not type-checked (D-061).
- **Docs (closed by the close-out round):** GAMES.md §8 gives The Reach-In's figure at the tip; A§3.1's `/labs/:lab` row and D-042's W1 note mention the crate download and the slot readout (W1b-T08); ASSESSMENT §4.6 follows the nightly's `lab-rates` job in place of "1,500 by hand"; DESIGN.md has entries for the lesson's game block and its prediction box (W1b-T01, W1b-T02); `content/kc/graph.yaml`'s header comment no longer says that "the eleven that remain" wait for item families; and the surface brief of the forge page no longer lists the kit's download as unresolved (W1b-T08). The owner's amendments (A§6.1, A§6.6, GAMES.md §3, §5, §8 and §10's design text, ASSESSMENT §4.1) were left as they were.
- **Content:** TR8's third lesson's exit-check sentence describes about two thirds of its level-2 draws (W1b-T06); six TR8 KCs and `tr5a.all-or-nothing` have no family; TR2's second, fourth and sixth lessons describe one item of each kind while their families draw variants by seed (W1b-T04).
- **The Inspection in a lesson** keeps its practice-or-graded toggle hidden, and its debrief's "Open TR8" leads out of the lesson (W1b-T01): the owner's or the next finish review's call.

---

## 11. Process

- **What reached this review.** The workflow passed W1b's task results cut at 60,000 characters, each task's notes at 3,000, and the finish reviews at 30,000. So this review read the results of W1b-T01 to W1b-T07, part of W1b-T08's, and none of W1b-T09 to W1b-T15's, of Back of House's fix round's or of The Reach-In's and the lesson blocks' reviews; for those it read the commits, the merge logs, the review captures' metadata and the surface briefs. The coordinator held the rest, and the close-out round added the two cut round-2 verdicts to §6 from the reviewers' words.
- **Merges.** Every task merged through `es1b-merge.sh`; W1b-T03 and W1b-T05 met conflicts in the item registry from the families that landed before them, and rebased. No merge raised a bundle gate (§3).
- **Commit trailers.** W1b's thirteen sonnet tasks say `Co-Authored-By: Claude Sonnet 5.5`, and W1b-T01, W1b-T10 and the five fix rounds say Opus 5.5, where the task text named Opus for every task: the session's attribution rule names the model that ran, as in W1 (W1-report §9.4).
- **Sizes.** The four family tasks, each M, added 3,499 to 5,868 lines, 3.5 to 5.9 times an M's bound of about 1,000; W1b-T08, an S, added 1,816 and W1b-T09 946, against about 300 [derived from §5].

---

## 12. How to reproduce

From a checkout of `1ed97ac`:

```
npm ci
npm run lint && npm run typecheck && npm run build && bun scripts/verify.ts all && npm run test
bun scripts/verify-kc.ts --final
ES_CHROMIUM=<a Chromium that starts here> npx playwright test --project=smoke --workers=2
ES_CHROMIUM=<the same> npx playwright test --project=features --workers=2 e2e/titles.spec.ts e2e/lab-kits.spec.ts \
  e2e/lesson-predict.spec.ts e2e/lesson-games.spec.ts e2e/lesson-games-scene.spec.ts e2e/items.spec.ts e2e/map.spec.ts \
  e2e/tr5a-items.spec.ts e2e/today.spec.ts
ES_CHROMIUM=<the same> npx playwright test --project=lab --workers=1
```

The comparison of §3 builds `c985c4c` and `1ed97ac` the same way and runs `bun scripts/verify-bundle.ts` on each. The gate tables of §4.5 are `git diff wave-1 wave-1b -- scripts/verify-*.ts playwright.config.ts e2e/ tests/bundle tests/ci .github/`. The claim of §1 was read from `vllm/benchmarks/serve.py` at vLLM's pinned commit `4ba787ec9959e566d3b587a796dff07673324da5`, fetched from `raw.githubusercontent.com` with a generic User-Agent into a folder of its own and read as text. This review's own changes: this report, TRACKER's markers and notes (W1b's, W1-T38's, and W1's build tasks `[x]` but W1-T12), and W1-T38 in the merged list of `tests/ci/workflows.test.ts`. The close-out round changed this report (§1, §5, §6, §8.2 and §9 to §11), the docs of §10, the task-id patterns of §10, and the tests that hold them.
