# W0 exit review

**Status:** the exit record of wave 0, for the owner's review of the `wave-0` → `main` PR. **Date:** 2026-11-04. **Task:** W0-T24 (opus). **Build reviewed:** `wave-0` at `0512837` (`05128375c25e8179beae2d5265265f6d29e370b0`), the merge of W0-T25's DESIGN.md, the last W0 task before this one. **Sources:** [TRACKER.md](../TRACKER.md) (W0's tasks and exit criteria), [ARCHITECTURE.md](../ARCHITECTURE.md) (A§n), [DECISIONS.md](../DECISIONS.md) (D-nnn, O-n), PRODUCT.md, DESIGN.md, the task results the orchestrator passed to this review, the finish reviewer's three reports, and what this review ran itself (§10).

**Tags** follow ARCHITECTURE. A figure tagged [measured] with no date or SHA of its own was measured by this review on 2026-11-04 at `0512837`, on the dev host of §2. Gates and targets are A§11.1's design targets and stay [estimated]. Task ids, counts of named things and list numbers are not quantities and go untagged.

---

## 1. Verdict

W0 built what its tracker asked for. The front page plays first, in 2D from the static HTML and in 3D after the largest paint. Every gate that W0 owns is live and passes, and the TR2 spike passed. Two things stay open, and both need the owner rather than another agent:
- **The finish review ended on `fix`, not `ship`.** It ran its two unattended fix rounds, and two of its findings stay open. Beyond its captures, this review confirmed two more breaks of the world's own One Lamp rule in the built site (§6). W0-T25's first check closes only when the owner ships with the findings listed, or asks for another round.
- **CI has never run on GitHub.** `wave-0` has not been pushed, so the first run of `ci.yml` will be the wave PR's. Everything it runs passes on the dev host, but the runner uses Node 24 and Playwright's own Chromium (§4.4).

| W0 exit criterion (TRACKER) | Status | Evidence |
|---|---|---|
| `/` is playable in 2D from first paint and in 3D after LCP on a capable device | met, on a software renderer | With JavaScript off, `/` shows the heading, the promise and the poster. The largest paint is the heading, and nothing shifts across the swap to 3D at 1440 px (tier 2) or 390 px (tier 1). With data saver on, or at tier 0, no 3D chunk is requested. A keyboard alone wins all four levels at 360 and 1280 px. All of this is e2e on SwiftShader, and no reference device has played it yet (O-9, §2). |
| The fast gate runs in CI, and every budget in A§11.1 is measured | in part | `ci.yml` is built and every step passes locally (§4), but it has not run on a runner. Every bundle budget and the lab profile's LCP, INP and CLS are measured (§3). The two workers have no source yet. The by-hand frame-time, first-3D-frame and post-processing GPU budgets wait for reference devices. GPU memory and main-thread long tasks have no measurement yet. |
| The TR2 spike (W0-T13) has passed | met | All five of W0-T13's checks hold at the tip, and its "stop and report" check never fired (§5). |
| The finish review has returned its verdict, and DESIGN.md and `.impeccable/design.json` describe the built world | met as worded; W0-T25 open | The verdict is `fix` (§6). DESIGN.md and its sidecar exist, and this review added the test W0-T25 asked for: every colour, type role, radius and spacing step in DESIGN.md is the tokens' own, and every face it names is self-hosted (`tests/design/design-md.test.ts`). |

**What the owner decides, in order of urgency:**
1. Ship the front page with the finish review's open findings listed, or run a third fix round (§6.4). This review recommends shipping with them listed, since the site is private and not yet deployed (O-2), and fixing the two green state lights and the 2D wells in W1-T13, which reworks Service anyway.
2. Name the reference laptop and phone (O-9), so W1's exit can check frame time by hand.
3. Answer O-7 and O-8 when merging (§7.3). For O-8, W0's PR is 74,824 added lines outside the lockfile and the copied files [measured], and 18 of its 19 S and M tasks went over the tracker's line bounds, by 1.2 to 8 times (§9).
4. Accept or change the proposed records W0 relied on: D-023 (budgets now frozen), D-048, D-049, D-050, D-051, and O-11's default.

---

## 2. The measuring host and the reference devices (O-9)

**The reference devices are not named.** No file this review can read names the owner's laptop or phone, so O-9 is carried over (DECISIONS, "Carried over by the W0 exit review"). Until it is answered, the by-hand budgets of A§11.1 (frame time on the laptop and the phone, the first 3D frame, post-processing GPU time) have no measurement.

**Every figure here comes from one machine, the owner's dev host.** It is a desktop and stands in for neither reference device:
- an Intel Core i5-13600KF, 20 threads, and 31 GB of memory [measured];
- an AMD Navi 32 GPU (PCI id `1002:747e`, "Radeon RX 7700 XT / 7800 XT" in hwdata 0.403's `pci.ids`) on `amdgpu` [measured]. No browser here drew with it: every browser check ran headless on SwiftShader;
- NixOS on Linux 6.12.63, Node 22.22.2, npm 10.9.7 and Bun 1.3.14 [measured]. CI pins Node 24 (D-032), so nothing here ran on Node 24;
- Chrome for Testing 149.0.7827.55, Playwright's cached `chromium_headless_shell-1228`, started through a wrapper that sets `LD_LIBRARY_PATH` for NixOS [measured]. Playwright 1.63.0 pins Chrome for Testing 153.0.8010.12, which was not on the host [unverified, from W0-T21].

The host was shared. Its load average was 1.3 when the e2e run started, rose to about 65 [measured] while ten Playwright workers drew on SwiftShader, and was 6.5 at the start of the lab profile and 5.1 at its end [measured].

---

## 3. Budgets as measured

The counting is W0-T20's, recorded in D-023: gzip by `gzipSync` at its default level under Bun 1.3.14, one file at a time, in KB of 1,000 B, with closures walked over the manifest's static imports. D-023 now freezes these gates (§7.2).

### 3.1 The bundle (`verify:bundle`)

| Budget (A§11.1) | Gate [estimated] | Target [estimated] | At `0512837` [measured] | At `5a69685`, W0-T20 [measured 2026-11-04] |
|---|---|---|---|---|
| Entry chunk, its own file | 110 KB | 100 KB | 37,331 B | 37,316 B |
| Front page first-paint JavaScript (the entry, the Front page, the course index and their static imports: 14 chunks) | 150 KB | 130 KB | 148,747 B: 1,253 B under the gate, 18,747 B over the target | 149,590 B |
| First-paint CSS (one stylesheet) | 30 KB | 20 KB | 16,637 B | 15,185 B |
| First-paint JavaScript and CSS together, printed without a verdict | — | — | 165,384 B | 164,775 B |
| Any other route, JavaScript and CSS | 200 KB | — | 116,372 B (`/today`) to 181,059 B (`/play/loop` with its game); `/settings` 172,807 B, `/evidence` 165,605 B, `/design` 158,986 B | 114,905 B to 177,663 B |
| `three-vendor` (three and R3F) | 245 KB | — | 238,603 B: 6,397 B under | 238,603 B |
| `scene-loop` (its chunk, its CSS and what only 3D reaches) | 40 KB | — | 16,362 B | 15,432 B |
| `scene-specimen`, the scene kit's own | 40 KB | — | 13,735 B | — |
| `postfx` | 25 KB | — | 5,470 B | 5,469 B |
| `receipt.worker`, `forge.worker` | 60 KB, 40 KB | — | no source yet (W2's receipts, W1-T10) | — |
| Lesson JSON `tr2.l0-sample`, module JSON `tr2` | 40 KB each | — | 1,994 B and 769 B | 1,994 B |
| Course index (A§4.6) | — | 6 KB | 666 B | — |
| The front page's document; its three preloaded faces as served | — | — | 8,760 B; 35,748 B | 8,165 B; 35,748 B |
| The site on Pages | — | well under 1 GB | 2,093,890 B in 80 files | 2,067,796 B in 79 files |

What the two columns say:
- **What merged after W0-T20's measurement moved little.** That is W0-T21 and the two finish rounds. The first-paint JavaScript shrank by 843 B and its CSS grew by 1,452 B [derived]. The other routes grew by 1.5 to 1.8 KB, because each counts the shared stylesheet, and `/play/loop` grew by 3.4 KB [derived].
- **The front page's closure has 1,253 B of room** [derived]. One cause is known: W0-T01 measured React Router's data router at about 31 KB gz against A§11.1's 15 KB basis [derived by W0-T01, 2026-11-03]. Any growth in the entry, the Front page's chunks or the code they share fails `verify:bundle`.
- **The entry row no longer bounds what it was set for.** A§11.1 derived its 110 KB from kernelspace's entry, which carried React. Here React, ReactDOM and the stores sit in `react-vendor`, so that three stays out of the first paint (W0-T01). The entry file is 37,331 B, while its static closure (the entry and `react-vendor`, what every page loads before its own code) is 99,559 B [measured]: 10,441 B under 110 KB and 441 B under the 100 KB target [derived]. The closure rows contain it, so it cannot grow unchecked. Gating the 110 KB on the closure is a follow-up (§8).

### 3.2 The lab profile (`e2e/perf.spec.ts`, A§11.1's mobile profile)

Chrome for Testing 149.0.7827.55 with the CPU 4× slower, 1.6 Mbit/s and 150 ms of round trip, at 360 × 800 and 2× with touch, served gzipped over HTTP, with `--enable-unsafe-swiftshader` alone as W0-T20 chose [measured].

| Vital | Gate [estimated] | Target [estimated] | At `0512837` [measured] | At `5a69685`, W0-T20 [measured 2026-11-04] |
|---|---|---|---|---|
| LCP, the median of three cold loads | 2,500 ms | 1,500 ms | 896 ms (912, 896 and 892). The largest paint is the heading, `h1.es-ticket__title`. | 888 ms |
| CLS across the swap to 3D | 0.1 | 0 | 0 in all three loads, with the swap at 5,361, 5,229 and 5,210 ms | 0 |
| INP, the median of three players, each making 57 taps over the four levels | 200 ms | 100 ms | 120 ms (120, 120 and 112): over the target. In the middle play the longest interaction had 55 ms of input delay, 7 ms of handlers and 58 ms to present. | 152 ms |

Before the largest paint, 6 requests and 62.0 KB came over the link: the document, 16.6 KB of CSS, 35.7 KB of fonts and 1.0 KB of JavaScript. After it came 28 requests and 471.1 KB, of which 421.5 KB was JavaScript, and the pass drew in 3D at tier 1 [measured]. The heading paints before the app's JavaScript arrives, as A§6.11 intends.

### 3.3 Scene budgets (the test hook's `renderer.info`)

| Budget (A§11.1) | Gate [estimated] | At `0512837`, on SwiftShader [measured] |
|---|---|---|
| Draw calls per scene | ≤ 100 | `scene-loop`, a whole night of `first-4-par`: at most 12 scene draw calls at T1, and at T2 12, or 26 in the frame with bloom and the final pass. The specimen: 7 scene draw calls for 10,896 instances, or 21 in the frame at T2. |
| Instances per scene | ≤ 50k | `scene-loop` at most 150; the specimen 10,896 |
| GPU memory per scene | < 200 MB | not measured: `renderer.info` counts geometries and textures, not bytes |

### 3.4 Not measured at the freeze

- **The workers:** `receipt.worker` and `forge.worker` have no source yet.
- **Frame time p95** on the reference laptop (target 16.7 ms) and the reference phone (target 33.3 ms at T1), **the first 3D frame** after its chunk loads (target 1.5 s), and **post-processing GPU time** at T3 (2.0 ms): all are by hand on the reference devices, which O-9 has not named. SwiftShader's frame times mean nothing for these.
- **Main-thread tasks over 50 ms** during play: the nightly trace A§11.1 names does not exist yet.
- **GPU memory per scene**, as §3.3 says.

---

## 4. Gate status at `0512837`

### 4.1 The four gates every task runs

| Gate | Result [measured] |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` (`tsc -b`) | exit 0 |
| `npm run test` (`bun test`) | 3,589 pass and 0 fail, in 105 files and 40.25 s. With this review's new test there are 3,649 in 106 files (§10). |
| `npm run build` | exit 0; Vite built in 2.79 s, and the whole script took 6.6 s |

### 4.2 The gate registry (`bun scripts/verify.ts all`)

16 gates: 10 passed, 6 pending and 0 failed, in 1.09 s of wall time [measured].

| Gate | Status | What it printed [measured] |
|---|---|---|
| `content`, `claims`, `numbers` | passed | 1 module, 1 lesson and 15 claims. `claims` warns once: pins are unchecked until `course.lock.json` exists (W1-T01). |
| `games` | passed | 1 game, `loop`, shown as Service · the step loop. The share of the first 400 seeds in band is 28% for `first-1-fill`, `first-2-slot` and `first-3-gap`, and 40% for `first-4-par`, against a floor of 20%. It has 8 common keys and 1 of its own. |
| `determinism` | passed | 39 files in scope and 0 findings. The vectors: 2 models, 24 vectors and the exponential table reproduce. |
| `boundaries` | passed | 203 files checked against A§2.3, 16 reachable from `src/main.tsx` without a dynamic import, and 0 violations |
| `bundle` | passed | 23 budgets gated, 1 over its target (§3.1), and 2 skipped (the workers) |
| `tokens` | passed | 90 roles, 2 colour schemes (light and more contrast), 101 declared pairs; no placeholder, and every pair meets its threshold |
| `vendor` | passed | 25 files match VENDOR.md at `d478f91a0af5` |
| `routes` | passed | 17 route-table entries with 37 documents, and the e2e list's 8 paths each have a document |
| `kc`, `items`, `pins`, `labs`, `schema`, `vectors` | pending | W1-T03, W1-T04, W1-T01, W1-T10, W2-T01 and W2-T01 |

### 4.3 Playwright (`playwright.config.ts`)

- **`smoke`, the pull-request subset (W0-T21):** 78 of 78 pass [measured]. axe finds no serious or critical violation on `/`, `/map`, `/m/tr2`, `/m/tr2/l0-sample`, `/play/loop`, `/settings`, `/design` and `/evidence` at 360 and 1280 px, nor on `/` with its 3D pass drawn. It finds one moderate `landmark-unique` violation on one node of `/design` at both widths, which is below the gate. No request leaves the origin on any of those routes, the meta CSP is the first element after `<meta charset>` everywhere, and the 2D screenshots of `/` match their baselines within 1%.
- **`features`, the earlier tasks' specs (nightly):** 117 of 120 pass in the full run, with Playwright's default of 10 workers taking 8.7 min [measured]. The three failures passed when run alone on one worker, in 29.2 s [measured]. They are `loop.spec.ts:260`, the poster against the first frame, where the dev server did not serve the page within 10 s, and `settings.spec.ts:273` and `:286`, where a setting was not shown within 10 s after a reload. They fail under load, not on their own. The orchestrator's last run before `bca0535` failed three other tests, which pass here.
- **`lab`, the lab profile:** 2 of 2 pass (§3.2).

### 4.4 CI on GitHub

`wave-0` has not been pushed (the clone's remote-tracking refs hold `main` only), so `ci.yml`, `deploy.yml`, `nightly.yml` and `labs.yml` have never run on a runner. The wave PR will start `ci.yml`. Three things may differ there:
- Node 24 instead of 22.22.2;
- Playwright's own Chromium (revision 1243) instead of 1228. `e2e/screenshots.spec.ts` prints the build and its renderer, and a baseline that the runner draws differently is replaced from the job's `-actual.png` artifact, as `ci.yml` says;
- a runner's fewer and slower cores. `smoke` runs on 2 workers with 1 retry there.

`deploy.yml` waits for `PAGES_ENABLED`, which waits for O-2. One reserved step names a task that has merged: `nightly.yml`'s `properties` job still prints `pending: W0-T10`, because W0-T10's file list did not include the workflow. The 10,000-seed property run of A§5.10 is therefore unbuilt (§8).

---

## 5. The TR2 spike (D-040)

**It passed.** W0-T13 met its five checks, so its sixth, "stop and report to the owner", never fired, and no W0 task builds on a workaround. At the tip:
- the 87 tests of `tests/sim/steploop*.test.ts` pass with 2,363,120 expectations, and the goldens reproduce byte for byte (checks 1 to 3) [measured];
- a 100-step run of 64 requests takes 2.75 to 2.90 ms on a fresh process's first call and 0.49 to 0.51 ms as the median of the next 40, across graphs on or off and overlap on or off, against the 20 ms bound. In a warm process the median is 0.18 ms (check 4) [measured];
- the card's "Ignores" list holds S5's list and host variance (check 5).

The front page's levels run on the model. `first-4-par`'s band takes 159 of 400 candidate seeds [measured by W0-T16 at `a5907b1`, 2026-11-04], and `verify:games` reads the same 40% at the tip. D-040 records the outcome.

---

## 6. The finish review (W0-T25)

### 6.1 Rounds

The review was impeccable's code-led finish of `/`. No comp exists, so a fresh finish reviewer audited the direction contract's FIRST VIEWPORT and signature interaction against captures at 1440 and 390 px.

| Round | Kind | Disposition | What it said | What followed |
|---|---|---|---|---|
| 1 | full review: persistence, fidelity, ceiling | `fix` | Eight material fixes: (1) the first service did not land, since a half and a full rail gave the same readout; (2) at 390 px the first viewport held only the headline; (3) four FIRST VIEWPORT promises were missing: the printer feed, the readout on the tape, time per step, and glowing stations; (4) no preview of a fire before the bell, and no readout as a control; (5) the 2D view was a neutral template chart; (6) tables broke at 390 px; (7) eyebrow rows and side stripes; (8) faked plate hardware, an overshoot easing, and the detector run on the wrong tree. Truth passed: every figure is labelled synthetic. | fix round 1, `81e54e9`, merged at `aca8142` |
| 2 | verdict pass | `fix` | Resolved 1, 2, 4, 6 and 7. Partial: 3 (the stations still did not glow beyond the pass), 5 (still a chart below the rail) and 8 (the detector record named no tree). It also found one regression: a lit state drawn in saturated HACCP green on unshaded slabs, against "amber is the only active state". | fix round 2, `8046843`, `e540a20` and `bca0535`, merged at `8c5dc7b` |
| 3 | verdict pass | `fix` | Resolved 3d with the regression (the stations burn amber, and no green shows in any scene, rail or tape capture) and the tape's NEXT FIRE row. Partial: 5 (the only 2D capture is the empty state, whose wells are flat slate-grey bars) and 8 (the record has a SHA and no scanned path). | the two-round limit for an unattended finish; the documenter wrote DESIGN.md (`3e9d078`, merged at `0512837`) |

### 6.2 The final disposition

**`fix`**, in the reviewer's own word, at its scope: the front page alone, at 1440 and 390 px, and in rounds 2 and 3 only the fixes it scored. It did not review `/play/loop`, `/design` or `/map`. Its "keep" stands: the condensed headline ticket hanging from the rail with its perforated "Start service" stub, over a real 3D brushed pass under three amber lamps, and the SYNTHETIC label on every figure.

### 6.3 Open findings

| # | Finding | Source | Evidence | Suggested home |
|---|---|---|---|---|
| F1 | The 2D view's wells are flat, rounded slate-grey bars with hollow circles. They read as a lane chart, not the steel counter, and no capture shows the fired 2D state. | round 3, fix 5 | The game page's 2D view (`/play/loop`) draws from the same `layoutFrame` and `frameSvg` as the front page's 2D pass, and this review's capture of it after a fire shows the same flat bars. | W1-T13 |
| F2 | The detector's record names no scanned path, and its fields are unlabelled. | round 3, fix 8 | This review reran the detector with its path recorded (§6.5). The review folder is git-ignored, so the record lives here. | closed by §6.5, if the owner agrees |
| F3 | The front page's overlap switch lights its pilot lamp in board green when it is on. That is a code colour marking a state, against DESIGN.md's One Lamp rule. | the documenter, confirmed here | On `/` at `first-3-gap` with the switch on, the pilot paints `rgb(35, 122, 55)` (`--es-cat-green`) with a `rgb(24, 94, 44)` edge (`.es-toggle__switch[data-state='checked'] .es-toggle__pilot` in `src/design/components.css`) [measured]. Round 3 saw the rule in the source and left it out, because no capture showed the switch; it appears only on levels 3 and 4. | W1-T13, or a small fix |
| F4 | The game page's 2D view lights "The line" in the GPU lane's green while the line cooks. Again a code colour marks a state, against One Lamp. | the documenter, confirmed here | `StationLight` defaults to `lane="gpu"` and sets `--es-station-light: var(--es-lane-gpu)`, and `src/games/loop/View2D.tsx` passes no lane. On `/play/loop?level=first-3-gap` with 3D off and overlap on, the lit lens paints `rgb(35, 122, 55)` after the first fire [measured]. This is the 2D path that tier 0 and "3D off" get. `/design`'s specimens show the same. | W1-T13 |
| F5 | On a phone, the lane tapes "THE EXPO · CPU" and "THE LINE · GPU" run into each other on the 3D scene. | round 3, not counted (it predates fix round 2) | seen again in this review's 390 px capture | W1-T13 |
| F6 | The detector, now that DESIGN.md exists, reports 105 advisory drifts from DESIGN.md's scales: 74 font sizes, 19 radii, and 12 white or black highlights in `src/design`. | this review | §6.5 | a W1 polish task: document the sizes or make them tokens |

The finish reviewer's "ceiling" also listed world devices the front page leaves unused: the printer's feed and paper curl as the only motion between bells, station glow and lamp intensity tracking how busy the line is, hotel pans under tape, the bell as a struck clock, tickets torn and spiked as courses go out, and HACCP colours as request types. None of them blocks anything.

### 6.4 W0-T25's acceptance

| Check | Status |
|---|---|
| 1. The final disposition is `ship`, or the owner chose to ship with the open findings listed | **open**: the disposition is `fix`, and the findings are listed in §6.3 for the owner |
| 2. DESIGN.md has token front matter and the canonical sections, `.impeccable/design.json` exists, and a test checks the colours and faces | pass. The test was missing, and this review added `tests/design/design-md.test.ts` (60 tests). Six deliberate edits to DESIGN.md were each caught: a colour, a face, a section heading, an extra token group, a type size and a radius. |
| 3. `impeccable embed-prompt --scan` reports no shipping raster without provenance | pass: `public`, `src` and the built `dist` hold no raster ("SCAN: 0 rasters, 0 missing") [measured]. The only tracked PNGs are the two screenshot baselines under `e2e/`, which do not ship. |
| 4. The contract-leak test still passes | pass: `tests/design/contract.test.ts` passes, and no contract block label appears in `src/`, `public/`, `index.html`, DESIGN.md or the sidecar |
| 5. Lint, typecheck, test, build, `verify:tokens` and W0-T21's e2e pass after the fixes | pass (§4). W0-T21's `smoke` specs all pass; three of the earlier `features` tests pass only when run alone (§4.3). |
| 6. D-047's record notes the verdict and its date | done by this review |

### 6.5 The detector, rerun with its path

`impeccable detect --json` ran over `src/front`, `src/design`, `src/games/loop`, `src/games/kit`, `src/scene`, `src/content/render` and `index.html`, in the task's worktree (`.worktrees/t24-exit`) at `0512837` (the `wave-0` tip's tree) [measured]:
- it found 0 non-advisory findings, and 0 of any kind with `--no-design-system`. That matches the fix rounds' empty records, since DESIGN.md did not exist when they ran;
- it found 105 advisory findings, all from the design-system rules that DESIGN.md switched on: 74 `design-system-font-size`, 19 `design-system-radius` and 12 `design-system-color`. The colours are white or black highlights inside `src/design` (bevels, sheens), which the literal-colour rule allows there but DESIGN.md does not document.

---

## 7. W0 against ARCHITECTURE and DECISIONS

### 7.1 What holds

- **I1, nothing leaves the device:** the meta CSP is on every document (`verify:routes`, e2e), the faces are self-hosted (D-033), and no request leaves the origin (e2e on 8 routes, with and without 3D). The policy refuses one thing today: zod's probe for `eval`, a `script-src` refusal on `/settings` and `/evidence`, the two pages that load the ledger. zod works without it, and W0-T21's network spec pins that refusal as the only one.
- **I4, I5 and I10:** the boundaries, determinism, games and token gates are live (§4.2), and Service has its 2D view, mirror, keys and reduced motion, all checked by e2e.
- **I11, play first:** the heading paints before any app JavaScript, and the 3D waits for LCP (§3.2).
- **The architecture's stack and pins:** A§14's versions are pinned exactly and tested, with no drei, `postprocessing` or `detect-gpu` (D-021, D-022). Vendoring is checked by hash (D-031), and every action is pinned by SHA (A§10.3).
- **The front page's run is practice and writes nothing (D-038):** it runs on `useRun` in its own frame and never opens the ledger, and D-051 keeps settings out of IndexedDB at first paint.
- **D-047 to D-050:** the tokens carry The Pass's values with no placeholder, the display names are in the registry and checked, and every tick on the front page is labelled synthetic.

### 7.2 Where the build departs from the docs, and what this review decided

| Item | Where | What happened | Resolution |
|---|---|---|---|
| D-023's budgets | A§11.1, D-023 | Measured, and every gate holds (§3) | **Frozen** in D-023 at A§11.1's figures, with two readings settled: the front page's closure counts JavaScript, and the entry row measures the entry's own file, as gated. |
| Tier 3's antialiasing | A§6.6 names SMAA | three's `SMAAPass` alone is 35,631 B gz, over the 25 KB `postfx` gate [measured by W0-T15, `gzip -9`], so T3 uses FXAA (`src/scene/tiers.ts`) | Recorded in D-023's freeze. A§6.6's row needs the edit (§8). |
| The router's cost | A§11.1's basis says 15 KB | about 31 KB gz [derived by W0-T01] | Recorded in §3.1; it is why the closure is tight. |
| `verify:games`'s summary | A§6.2 and A§10.2 | The gate also fails a game without its display name and subtitle (D-049), which the summaries omit | doc edit (§8) |
| The look's authority | PLAN.md line 168 still says the identity "is chosen separately (D-006)"; A§6.2's test 5, A§6.5's bloom and A§14's font packages still say DESIGN.md decides | D-047 gives the reading rule, and DESIGN.md now exists | doc sweep (§8) |
| Sizes | TRACKER: S under about 300 lines, M under about 1,000 | 18 of the 19 S and M tasks went over their line bound, by 1.2 to 8 times (§9) | data for O-8 and for sizing W1 |
| Owner questions past their "needed by" | O-2 (W0-T04), O-11 (W0-T18) | built on their defaults: the deploy waits on `PAGES_ENABLED`, and the front page is 2D first and 3D after LCP | still the owner's |

### 7.3 Open owner questions closed or carried by this review

- **O-7, the pick-form gate:** carried over. W0 ran on the default, and no W0 task waited for demand data. It is needed by the `wave-0` merge, since W1 starts after this task.
- **O-8, review capacity:** carried over. W0's numbers are in §9.
- **O-9, the reference devices:** carried over (§2). It is needed by W1-T38, the next exit that checks frame time by hand.

---

## 8. Open issues and follow-ups

**For the owner:**
- The finish disposition (§6.4, check 1), and findings F1 to F6.
- O-7, O-8 and O-9 (§7.3); O-2 and O-11, which are past their "needed by"; and the proposed D-023, D-048, D-049, D-050 and D-051.
- From W0-T02: `docs/physics/report.json` is referenced by hash, not copied. Before the repository goes public (O-3), check two things: whether linking the Mooncake slice's Apache-2.0 text satisfies its section 4(a) [unverified], and the MIT labels on two agent-kit templates [unverified].
- From W0-T01: eslint 9.39.2 is marked unsupported by npm [measured 2026-11-03]. Add it to the quarterly re-pin.

**For W1 tasks (suggested homes):**
- **W1-T13:** F1, F3, F4 and F5. The two lights take amber, or a shape with no colour, and the 2D wells take the counter's steel.
- **Gate the entry's static closure:** move `verify:bundle`'s entry row from the entry file (37,331 B) to the entry's static closure (99,559 B), at 110 KB with a target of 100 KB, so the row bounds what A§11.1 set it for. This is one row in `scripts/verify-bundle.ts` and its tests.
- **Watch the front page's closure:** with 1,253 B of room, any W1 task that touches the entry, `src/front`, `packages/play/loop` or the code they share runs `verify:bundle` and states its delta in its PR. Going over the gate is a new D- record, never a quiet raise.
- **The nightly property run:** replace `nightly.yml`'s `properties` step, which still says `pending: W0-T10`, with A§5.10's 10,000-seed run of the ledger and sim properties. The test that checks reserved steps could also fail on a step that names a merged task.
- **The load-sensitive `features` specs** (§4.3): give `loop.spec.ts`'s dev-server load and `settings.spec.ts`'s post-reload checks the headroom of a runner with 2 workers, before the nightly sweep relies on them.
- **The `/play` index** (`src/pages/PlayIndex.tsx`) is still a stub, and no task owns it. W1-T06 (the course map) is the nearest home.
- **Not yet built:** route-change focus and announcement, and scroll restoration, in `src/App.tsx` (W0-T01 left them out on purpose). W1-T36 or W3-T11 are candidate homes.
- **No test for the stale-chunk reload:** the `vite:preloadError` handler in `src/main.tsx` was checked once by hand in W0-T01 (reload once, then the error page) and has no test.
- **Unmeasured budgets:** GPU memory per scene needs bytes, not `renderer.info`'s counts. Main-thread long tasks during play need the nightly trace.
- **The advisory drift (F6):** fold the 74 font sizes and 19 radii into DESIGN.md's scales or into tokens.
- **The moderate axe finding:** `landmark-unique` on one node of `/design`.

**Doc edits, outside this task's files:**
- A§6.6: T3 antialiasing is FXAA (D-023's freeze).
- A§6.2 and A§10.2: `verify:games` also requires the display name and subtitle.
- PLAN.md line 168, A§6.2's test 5, A§6.5's bloom line and A§14's "Icon and font packages are DESIGN.md's call": read under D-047, and DESIGN.md now exists.
- TRACKER: every W0 task still shows `[ ]`. The merged tasks are `[=]` until the owner merges `wave-0`.

**Inherited from earlier W0 tasks, still open:**
- `scripts/` and `tests/` are linted but not type-checked, because no tsconfig covers them and Bun's types are not in A§14 (W0-T01, W0-T03, W0-T04).
- A§5.1's banned `Math` list may be incomplete: ECMA-262 may also treat `log2`, `log10`, `log1p`, `expm1` and the hyperbolic and inverse functions as implementation-approximated, and kernelspace bans `log2` and `log10` [unverified, W0-T03].
- `verify:boundaries` walks static imports from `src/main.tsx` only, so a lazy page that imports three statically passes until `verify:bundle` measures it (W0-T03).

---

## 9. What W0 merged

From `main` (`4249418`) to `wave-0` (`0512837`), the diff is 519 files, 95,796 added lines and 93 removed, in 37 commits and 26 merges [measured]. Leaving out the lockfile, `vendor/`, the fonts, the screenshot baselines, the test fixtures and the posters, it is 410 files and 74,824 added lines [measured]. Of those, 39,658 lines are code (`src` 23,912, `packages` 8,092, `scripts` 6,633, `.github` 569, `content` 452) and 32,453 are tests (`tests` without its fixtures 27,305, `e2e` 5,148) [measured].

Added lines per merge, without the lockfile, vendored files, fonts, baselines, fixtures and posters [measured]:

| Task | Size | Merge | Lines |
|---|---|---|---|
| art direction (D-047 to D-049, before W0's tasks) | — | `60dbe37` | 449 |
| W0-T01 Scaffold | M | `8f8fbe1` | 1,222 |
| W0-T02 Vendor kernelspace | S | `f8d1aef` | 1,241 |
| W0-T03 Boundaries and determinism lint | S | `8900868` | 1,519 |
| W0-T04 CI and the gate registry | M | `f4e237b` | 1,402 |
| W0-T05 The design system | L | `f25e78a` | 7,292 |
| W0-T07 Schemas | S | `cca46f7` | 2,410 |
| W0-T08 Content compiler and gates | M | `24856ba` | 5,215 |
| W0-T09 Content renderer and page shells | M | `2c0654e` | 2,949 |
| W0-T10 Ledger core | M | `bf10ed3` | 4,908 |
| W0-T11 Ledger in the browser | M | `cc8aade` | 5,148 |
| W0-T12 Sim core | M | `87789f8` | 3,544 |
| W0-T13 Step-loop model, the TR2 spike | L | `78019b1` | 3,080 |
| W0-T14 Game framework | M | `4b473fc` | 3,987 |
| W0-T15 Scene kit | L | `0743341` | 6,171 |
| W0-T16 Service: session, 2D view, mirror, poster | M | `8118c20` | 4,831 |
| W0-T17 Service: the 3D scene | L | `fac1415` | 1,781 |
| W0-T18 The front page | M | `0a5ccf2` | 3,210 |
| W0-T19 Static routes, CSP, 404, base path | S | `0314a31` | 2,416 |
| W0-T20 Budget gates | M | `b137eac` | 2,202 |
| W0-T21 Playwright e2e | M | `75b39ee` | 1,516 |
| W0-T22 Settings, evidence and the design page | M | `05e8be6` | 5,419 |
| W0-T23 Repo docs for agents | S | `836f954` | 223 |
| W0-T25 fix rounds 1 and 2, and DESIGN.md | M | `aca8142`, `8c5dc7b`, `0512837` | 1,975, 646 and 1,227 |

Of the 19 S and M tasks, only W0-T23 stayed inside its line bound. The other four S tasks ran 4.1 to 8.1 times over their roughly 300 lines, and the 14 M tasks 1.2 to 5.4 times over their roughly 1,000 [derived]. An L task's bound is an agent-day, not a line count. Across the wave, tests are 32,453 of the 72,111 lines of code and tests, or 45% [derived].

---

## 10. How to reproduce

From a checkout of `0512837`:

```
npm ci
npm run lint && npm run typecheck && npm run test && npm run build
bun scripts/verify.ts all
ES_PERF_REPORT=1 bun test tests/sim/steploop.test.ts       # the spike's check 4, printed
ES_CHROMIUM=<a Chromium that starts here> npx playwright test --project=smoke --project=features
ES_CHROMIUM=<the same> npx playwright test --project=lab   # the lab profile, on a quiet machine
~/.claude/skills/impeccable/scripts/impeccable detect --json src/front src/design src/games/loop src/games/kit src/scene src/content/render index.html
~/.claude/skills/impeccable/scripts/impeccable embed-prompt --scan public src dist
```

This review's own changes are `tests/design/design-md.test.ts`, this report, and DECISIONS (D-023, D-040, D-047, and the carried-over O-7, O-8 and O-9). The colour probes of §6.3 and the captures were ad hoc scripts, not committed.
