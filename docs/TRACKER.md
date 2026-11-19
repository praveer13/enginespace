# enginespace: build tracker

**Status:** proposed backlog. W0's 24 tasks and W1's 35 build tasks are built, and both waves merged into `main` on 2026-11-09 with PR #2 ([waves/W0-report.md](waves/W0-report.md), [waves/W1-report.md](waves/W1-report.md)). W1b's exit review turned their `[=]` markers `[x]`, but for the two tasks with a check that waits on the owner, W0-T25 (its first) and W1-T12 (its fourth), which keep `[=]`; W1's two owner tasks wait on the owner too. W1b, W1's carry-over, built its 15 tasks into `wave-1b`, which waits for the owner's merge ([waves/W1b-report.md](waves/W1b-report.md)). There `bun scripts/verify-kc.ts --final` passes, so W1-T38's open check holds and W1-T38 shows `[=]`. The other tasks show `[ ]`: a wave's exit review sets its markers. **Date:** 2026-11-03, markers updated 2026-11-09, W1b added 2026-11-09, wave R added 2026-11-15. **Source:** [ARCHITECTURE.md](ARCHITECTURE.md) (cited as A§n) and [DECISIONS.md](DECISIONS.md) (D-nnn, O-n). Credit rules come from `docs/ASSESSMENT.md`, written in parallel. The look was The Pass (D-047): W0-T05 applied its direction contract, and W0-T25 documented the built world in DESIGN.md. Wave R, the redesign of 2026-11-15, replaces it with Data Book (D-062, the owner's decision at the look gate on 2026-11-16) and makes the engine's term the only name (D-063); its section below carries `docs/waves/wr-tasks.json`.

## How to read this page

- **Task line.** Each task opens with `ID · title · size · model · deps`. The body gives:
  - **Goal**, one or two sentences;
  - **Read**, what to read first;
  - **Files**, what to create or change;
  - **Accept**, the checks that close the task.
  A task is done when every check passes and its evidence is pasted into the PR description.
- **Sizes** [estimated]:
  - **S**: at most about 2 agent-hours, one PR, under about 300 changed lines.
  - **M**: at most about 6 agent-hours, one PR, under about 1,000 changed lines.
  - **L**: at most about one agent-day, one PR. The agent writes a short plan as the PR's first comment before coding.
  - Anything larger is split before it starts.
- **Models** (D-036):
  - `sonnet` for every build task;
  - `opus` for wave exit reviews, for W0-T25's finish review, for W1b-T01 and W1b-T10 (W1b's header says why), and for wave R's 16 pattern-setting and design-critical tasks (D-068);
  - `haiku` for wave R's two mechanical tasks, R-T43 and R-T46 (D-068);
  - `owner` for tasks only the owner can do. These tasks block their dependants, and agents never simulate them.
- **Game names.** A game task's title gives the game's display name and id, as in "Service (`loop`)". Display names are what the learner sees (D-049, superseded by D-063: from wave R the engine's term is the only name, and R-T13 rewrites the open W2 and W3 tasks). Task bodies and the design docs keep the working names (The Loop, The Pool and the rest) as shorthand, and GAMES.md §0 maps all three.
- **Status markers:** `[ ]` todo, `[~]` in progress, `[=]` review (acceptance passed, waiting for merge), `[x]` done.
- **Numbers in acceptance checks.** Seed counts, draw counts, instance counts, time limits and tolerances are design parameters [estimated], taken from ARCHITECTURE's budgets or set here. A task that measures one records it as [measured], with the date and the build SHA. Pass bars for credit come from ASSESSMENT.md and override any figure here.

## The agent brief: rules for every task

Paste this brief above the task text when dispatching a task. AGENTS.md (W0-T23) carries the same rules.

1. **Base.**
   - Work on `w<wave>/t<nn>-<slug>`, created from the wave branch at the SHA the orchestrator names: `git checkout -B <branch> <base-sha>`.
   - Confirm with `git merge-base --is-ancestor <base-sha> HEAD`.
   - Worktrees start at the default branch, not the current one.
2. **`node_modules` in a worktree.** Run `cp -al <main-checkout>/node_modules ./node_modules && rm -rf node_modules/.tmp node_modules/.vite`. Never symlink it: `tsc -b` keeps build info in `node_modules/.tmp`.
3. **Read first.** Read PRODUCT.md, the A§ sections and D- records the task names, and ASSESSMENT.md for anything about credit.
4. **Scope.**
   - Change only the files the task lists, plus tests.
   - If another file must change, say so in the PR and keep the change minimal.
   - Never edit `vendor/`.
5. **Sibling repos are read-only.** Read kernelspace (the sibling checkout `../kernelspace`) and statespace only with `git -C <repo> show`, `ls-tree` and `grep`. Never add, commit or push there.
6. **Dependencies.** Add none without a DECISIONS record and an exact pin (A§14). Use no `^` and no `~`.
7. **Numbers.** Tag every number in content and docs as [measured], [derived], [estimated], [synthetic] or [unverified], and date every upstream fact. A number that the course's own model printed is [synthetic], never [measured]. In content, put facts in claims (A§4.4). Never invent a fact. If one cannot be sourced, mark it [unverified] and list it in the PR.
8. **Web requests.** Send a generic User-Agent, and never send the owner's name or email in a header, URL or payload. The site itself makes no third-party request.
9. **Look.** The visual identity is Data Book (D-062). Use only the token roles in `src/design/tokens.ts` and the components in `src/design/components`. Put no literal colour or font name outside `src/design`. Names follow GAMES.md §2.6: the engine's term is the only name (D-063). D-062 is the owner's decision (the look gate, 2026-11-16, "data book for sure"), and the kitchen's files left the tree at stage 4 of wave R (R-T44).
10. **Done means:**
    - `npm run lint`, `npm run typecheck`, `bun test`, `npm run build` and every `verify:*` the task touches pass;
    - the PR lists each acceptance check with its evidence;
    - you commit on the task branch, open a PR into the wave branch, and never merge.

## Wave gates and the critical path

- **W0** starts now.
- **W1** starts after W0-T24.
- **W1b**, W1's carry-over, starts after W1-T38's report (2026-11-09). W1b-T16 closes W1-T38.
- **W2's grader track** (W2-T01 to W2-T12) may start after W0-T24 and run alongside W1. **W2's module, game and content tasks** start after W1-T38 and after R-T15 (wave R's stage 1), and are written for the new design (REDESIGN.md §7). The grader track is unaffected.
- **Wave R**, the redesign, runs on `wave-r`, stacked on `wave-2`, in six stages around a look gate (D-068). W2's grader track (W2-T01 to W2-T12) is unaffected and runs alongside it. W2's module, game and content tasks start after R-T15, so nothing is built twice (REDESIGN.md §7).
- **W3** starts after W2-T41.
- **Branches.** Each wave branch stacks on the previous unmerged one, and the owner merges in order (D-036).

**Critical paths** [estimated, taking each size at its upper bound]:
- **W0:** T01 → T03 → T07 → T10 → T14 → T15 → T17 → T18 → T21 → T25 → T24. The go/no-go chain, T03 → T12 → T13 (the TR2 spike, D-040) → T16, joins it at T17 and is 2 h shorter [derived from the size bounds]. T05 and T20 run alongside.
- **W1:** two chains. One is T03 → T04 → T14 for items, with T12 → T13 for Service (`loop`). The other is T21 → T22 for the KV lab. Both end at T36 → T38.
- **W1b:** two chains. One is T01 → T02 for the lessons, then the lesson's finish review. The other is T10 and the four scenes' finish reviews. Both end at T14 → T16.
- **W2:** T01 → T02 → T08 → T12 (owner fixtures). The module labs follow, then T39 → T41. Owner tasks T21 (traces) and T17 (the bank) gate T22 and TR0's browser re-check.
- **W3:** T01 (owner's commit pairs) → T02 → T03 → T17.

## Summary

| Wave | Goal | Tasks | S | M | L | Owner | Opus |
|---|---|---|---|---|---|---|---|
| W0 | Scaffold, the design system, the front-page 3D game, the finish review | 24 | 6 | 14 | 4 | 0 | 2 |
| W1 | The no-GPU modules (TR1, TR2, TR5a, TR6, TR8) and their games | 38 | 6 | 18 | 14 | 2 | 1 |
| W1b | W1's carry-over: lessons that run W1's games, the item families, the scene kit, CI | 16 | 6 | 8 | 2 | 0 | 3 |
| W2 | The GPU modules (TR0, TR3, TR4, TR5b, TR7), the local grader, and the GPU parts of TR1, TR6 and TR8 | 44 | 6 | 25 | 13 | 4 | 1 |
| WR | The redesign: engine names, one way on, the lesson template, one game frame, Data Book (2 tasks on haiku) | 50 | 8 | 28 | 14 | 0 | 16 |
| W3 | The capstone, polish and launch | 17 | 7 | 9 | 1 | 3 | 1 |
| **Total** | | **189** | **39** | **102** | **48** | **9** | **24** |

The owner column counts tasks only the owner can do. It leaves out reviewing PRs and answering O-1 to O-11.

---

## W0: scaffold, the design system, the front-page 3D game

**Exit criteria:**
- `/` is playable in 2D from first paint and in 3D after LCP on a capable device.
- The fast gate runs in CI, and every budget in A§11.1 is measured.
- The TR2 spike (W0-T13) has passed.
- The finish review has returned its verdict, and DESIGN.md and `.impeccable/design.json` describe the built world (W0-T25).

#### [x] W0-T01 · Scaffold the app · M · sonnet · deps: —
- **Goal:** An empty, complete app on kernelspace's toolchain, with every route stubbed.
- **Read:** A§2, A§3.1, A§14; D-014, D-032; kernelspace's `package.json`, `vite.config.ts`, `tsconfig*.json` and `eslint.config.js` at d478f91 (`git show`).
- **Files:**
  - `package.json` (A§14's runtime and dev lists, without `fuse.js`) and `package-lock.json`;
  - `bunfig.toml`, `index.html`;
  - `vite.config.ts`: base from `VITE_BASE`, `build.manifest: true`, `manualChunks` putting `three` and `@react-three/fiber` in `three-vendor`, aliases `@/` and `@es/{sim,play,ledger,schema,verify}`;
  - `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.pure.json` (`lib: ["ES2022"]`, covering `packages/sim` and `packages/play`);
  - `eslint.config.js`, `tailwind.config.ts`, `postcss.config.js`;
  - `src/main.tsx` (kernelspace's reload-once `vite:preloadError` handler), `src/App.tsx`, `src/routes.tsx`, `src/pages/*.tsx` stubs;
  - `.gitignore` (`node_modules`, `dist`, `src/content/generated`, `.claude`), `README.md`, `tests/smoke.test.ts`.
- **Accept:**
  1. On a clean checkout, `npm ci && npm run lint && npm run typecheck && bun test && npm run build` exits 0.
  2. A test reads `package.json`: no `^` or `~`, and every version equals A§14's table.
  3. Every route in A§3.1 renders a stub whose `<h1>` names it, and `/nope` renders the 404 page.
  4. `dist/.vite/manifest.json` exists, and `three` appears only in a `three-vendor` chunk.

#### [x] W0-T02 · Vendor kernelspace at d478f91 · S · sonnet · deps: W0-T01
- **Goal:** A§13's files under `vendor/kernelspace/`, unchanged, with VENDOR.md and a drift script (D-031).
- **Read:** A§13; statespace's VENDOR approach (`git -C ../statespace show HEAD:vendor/kernelspace/VENDOR.md`).
- **Files:**
  - `vendor/kernelspace/**`, byte copies made with `git -C <kernelspace> show d478f91:<path>`;
  - `vendor/kernelspace/{VENDOR.md,LICENSE}`, and `vendor/kernelspace/shims/` for type shims: `MemoryState`, `Rating`, and the two ledger types `run.ts` imports;
  - `NOTICE` (kernelspace's section and ts-fsrs's section);
  - `scripts/vendor-drift.ts` (`verify`, `diff <sha>`);
  - `tests/vendor/{rng,physics,fsrs}.test.ts`.
- **Accept:**
  1. Each VENDOR.md row's SHA-256 equals `git -C <kernelspace> show d478f91:<path> | sha256sum`.
  2. `bun scripts/vendor-drift.ts verify` passes, and fails after a one-byte edit to a temporary copy.
  3. kernelspace's physics step vectors and FSRS reference vectors reproduce through the vendored code.
  4. `verify:vendor` is wired into the gate registry.

#### [x] W0-T03 · Package boundaries and the determinism lint · S · sonnet · deps: W0-T01
- **Goal:** Package skeletons, with purity enforced by `tsconfig.pure.json`, ESLint and two gates (D-017, A§2.3, A§5.1).
- **Files:**
  - `packages/{sim,play,ledger,schema,verify}/index.ts`;
  - rules in `eslint.config.js`: import fences per A§2.3; in `packages/{sim,play}/**`, the determinism bans (`Math.{exp,log,pow,sin,cos,tan,atan2,cbrt,hypot,random}`, `Date`, `performance`, `crypto`, `window`, `document`, `**`, argument-less `.sort()`); `dangerouslySetInnerHTML` banned everywhere;
  - `scripts/verify-boundaries.ts`: a static import walk from `src/main.tsx` that fails when `three` or `@react-three/fiber` is reachable without a dynamic import;
  - `scripts/verify-determinism.ts`;
  - `tests/fixtures/lint/*`, bad files that must fail.
- **Accept:**
  1. A fixture with `Math.random()` in `packages/sim` fails `verify:determinism`, and the clean tree passes.
  2. A fixture page that imports `three` statically fails `verify:boundaries`.
  3. `tsc -p tsconfig.pure.json` fails on a fixture that references `document`.

#### [x] W0-T04 · CI workflows and the gate registry · M · sonnet · deps: W0-T01
- **Goal:** `ci.yml`, `deploy.yml`, `nightly.yml` and `labs.yml` per A§10, and a gate registry in which an unbuilt gate prints `pending: <task>` and exits 0 (kernelspace's pattern).
- **Read:** A§10; kernelspace's `.github/workflows/{ci,deploy,nightly,labs}.yml` (`git show`).
- **Files:** `.github/workflows/*.yml`; `scripts/verify.ts` (gate name → script or pending task id); `package.json` scripts `verify:*` and `verify:all`.
- **Accept:**
  1. Every action is pinned by full SHA with A§10.3's version comment. Jobs default to `permissions: contents: read`, and checkout sets `persist-credentials: false`.
  2. `bun run verify:all` runs every A§10.2 gate, and pending ones name their task.
  3. `deploy.yml` builds with `VITE_BASE=/enginespace/` on pushes to `main` only, behind `if: vars.PAGES_ENABLED == 'true'` until O-2 is answered.
  4. On failure, `nightly.yml` opens or updates one `nightly-failure` issue.
  5. A test parses every workflow file with js-yaml.

#### [x] W0-T05 · The design system: The Pass's tokens, faces and first components · L · sonnet · deps: W0-T01
- **Goal:** The token roles that every page and scene needs, carrying The Pass's values from the first commit (D-047), with no placeholder phase. The roles reach CSS custom properties, Tailwind and scene materials, the faces are self-hosted, and `src/design/components/` starts with the world's first atoms. This task merges the former W0-T05 (the token contract) and W0-T06 (applying the identity), so there is no W0-T06.
- **Read:** the direction contract in `.impeccable/surfaces/src-front-frontpage-tsx.md` (read it, and never copy it into source, comments or any shipped file); impeccable's `reference/new-work.md` §4 (Commit the world) and §6 (Build with full commitment); D-047, D-048 and D-033; A§6.4 and A§11.2; GAMES.md §2.6.
- **Files:**
  - `src/design/tokens.ts`, the role list:
    - the contract's materials as roles: stainless for the ground and surfaces 0-3, ticket paper with its ink and its second ink, the heat lamp (the active state, on the present only), masking tape, and categorical slots from the contract's code;
    - text 1-3, the focus ring, and status (ok, warn, bad, info);
    - lane roles (cpu, gpu, sync, copy, idle);
    - memory roles (free, used, cached, shared, adapter, evicted);
    - probability roles (target, draft, overlap, residual, observed);
    - motion durations and easings, radii, spacing;
    - type roles (display, heading, body, mono, numeric);
    - and the declared contrast pairs.
  - `src/design/tokens.css`: every role as `--es-*`, with its value.
  - `src/design/fonts.css` and `public/fonts/*`: the self-hosted faces, with their licences in NOTICE. A font or icon package enters only with a DECISIONS record and an exact pin (A§14).
  - `tailwind.config.ts`, mapping the theme to the variables.
  - `src/design/scene-tokens.ts`: `useSceneTokens()` reads computed values, and re-reads on `prefers-color-scheme` and `prefers-contrast` changes.
  - `src/design/components/{Ticket,Tape,Readout}.tsx`: the ticket-paper surface that read text sits on, the masking-tape label, and the numeral readout that every count, tick and µs passes through. `Readout` takes each number's tag, so ticks always say synthetic (D-048).
  - `scripts/verify-tokens.ts`, `tests/design/*.test.ts`.
- **Accept:**
  1. A test greps `src/` outside `src/design/` and finds no hex, `rgb(`, `hsl(`, `oklch(` or named colour, and no font-family name.
  2. `verify:tokens` lists every role with its value and fails on any placeholder: a CSS system colour (`Canvas`, `CanvasText`, `GrayText`, `Highlight`, `HighlightText`, `LinkText`, `Mark`, `ButtonFace`, `ButtonText`, `Field`, `FieldText`) outside a `forced-colors` block, a system font stack standing in for a face, an empty value, or a `placeholder` marker. A fixture with one placeholder fails it, and the tree passes.
  3. Every role in `tokens.ts` has a CSS variable, a Tailwind key and a scene-token entry (test).
  4. Every declared pair meets its A§11.2 threshold in every colour scheme the system ships (test).
  5. Loading the faces sends no request off the origin (W0-T21's network check), and NOTICE carries each face's licence.
  6. A test greps `src/`, `public/` and `index.html` for the direction contract's block labels (`THESIS:`, `OWN-WORLD:`, `STORY:`, `FIRST VIEWPORT:`, `FORM:`, `FINISH:`) and finds none.
  7. `Readout` renders a tick count with its synthetic label, and a number passed without a tag fails to type-check (test).

#### [x] W0-T07 · Schemas: content, claims, lock and KC · S · sonnet · deps: W0-T03
- **Goal:** zod schemas for lesson and module front matter, the eight block types, claims, `course.lock.json` entries and the KC graph, plus the ref grammar (A§4.2-A§4.5).
- **Files:** `packages/schema/{content,claims,lock,kc,refs}.ts`; `tests/schema/*.test.ts` with valid and invalid fixtures.
- **Accept:**
  1. Each schema rejects unknown keys and accepts A§4.2's examples, which are copied into fixtures.
  2. Every ref example in A§4.5 parses, and a malformed ref fails.

#### [x] W0-T08 · Content compiler v0 and the content gates · M · sonnet · deps: W0-T07
- **Goal:** Compile `content/` into `src/content/generated/` and `public/md/` + `llms.txt`, with a Vite plugin for dev, plus `verify:content`, `verify:claims` and `verify:numbers` (A§4, D-016).
- **Files:**
  - `scripts/content/{build,parse,directives,prose,vite-plugin}.ts`;
  - `scripts/verify-{content,claims,numbers}.ts`;
  - `src/types/js-yaml.d.ts`;
  - `content/course.yaml`;
  - `content/modules/tr2/module.md` and `content/modules/tr2/lessons/l0-sample.md`, a draft that uses all eight blocks;
  - `content/claims/sample.yaml`.
- **Accept:**
  1. `bun scripts/content/build.ts` writes an `index.json` of at most 6 KB gz, and every output validates.
  2. Each of these fails with `file:line`: an unknown directive key, a ninth block type, an unknown game, claim or KC id, and an untagged number in prose.
  3. `rev` changes when the token tree changes, and not under a whitespace-only reflow.
  4. No compiled prose contains an HTML string (a test scans the JSON).
  5. Under `npm run dev`, editing a lesson hot-reloads it.
- **Follow-up (W2, the hot-reload test waits on the real cause):** check 5's test failed once in CI on wave-2 at 7bae071, with no reload after its first edit. Vite's "Local:" banner and its watcher's `ready` event both come before the watcher has reached the lesson and the generated JSON: `ready` came first in 80 of 80 instrumented starts, and the test's edit landed before the watcher listed the lesson in 17 of 80 and before it listed the JSON in 28 of 80 [measured 2026-11-16 at 7bae071, 40 starts each on one and two cores]. A save the watcher has not reached can be taken for the file's first state, and then is not reported, and a JSON written before the watcher reaches it never reloads the page. Separately, a mend that rewrote the JSON was reloaded by the plugin before Vite had seen the new file, so the page reloaded onto the old module (5 failures of 40 on two cores, 0 of 40 on one [measured, same date and SHA]). `scripts/content/vite-plugin.ts` now compiles before Vite's watcher starts, waits until the watcher lists every file of `content/` and of the output, compiles again to take in an early save, and logs "watching content/", which the test waits for; and after a mend it leaves the reload to Vite's watcher when the page has loaded a rewritten module. Then a hardening (W2): the wait asks only for files a watcher can list, by one stat that cannot throw for a file that vanishes (a dangling link such as the one Emacs writes beside a file no longer holds it, and the content compiler's own walk takes only regular files, so that the link beside a lesson, a claims file or a card is no `bad-file-name` error and no `ENOENT`), and it is bounded by `WATCH_WAIT_MS` [estimated 10 s, against cover at 0.3 to 0.83 s measured 2026-11-16], after which the plugin compiles, warns with the first file it still waited for, and acts on changes as it did before the wait; a server that closes during the wait (Vite calls the plugin's `buildEnd` and `closeBundle`) ends it, with nothing compiled, written or logged after. Open: whether Vite or chokidar should offer a readiness signal of their own, so that the plugin need not poll `getWatched()`.

#### [x] W0-T09 · Content renderer and page shells · M · sonnet · deps: W0-T08
- **Goal:** A React renderer for the token tree and the blocks, with claim chips, tag chips, and the module and lesson pages. Blocks whose features are not built yet render a placeholder naming the task that builds them.
- **Files:** `src/content/render/{Prose,Blocks,ClaimChip,TagChip}.tsx`, `src/content/load.ts` (`import.meta.glob`, lazy), `src/pages/{Module,Lesson}.tsx`.
- **Accept:**
  1. `/m/tr2` and `/m/tr2/l0-sample` render every block type.
  2. A claim chip shows the value, unit, source title and `verifiedAt`, and "stale since" past its TTL (unit test with a fixed today).
  3. Headings form a valid outline (axe, W0-T21).

#### [x] W0-T10 · Ledger core · M · sonnet · deps: W0-T07
- **Goal:** `packages/ledger` per A§7: the envelope and kinds, ids, a strict codec, merge, a memory store, a store-agnostic conformance suite and the provenance enum (D-024).
- **Read:** A§7; the shape of kernelspace's `src/lib/ledger/store-conformance.ts` (`git show`).
- **Files:** `packages/ledger/{types,ids,codec,merge,memory-store,conformance,provenance}.ts`; `tests/ledger/*.test.ts`.
- **Accept:**
  1. The conformance suite passes against the memory store.
  2. Over 200 seeds, double import, merging in any order, and replace-then-undo all give identical ledgers.
  3. The codec rejects unknown kinds, malformed refs and scores outside [0, 1].
  4. No event carries a weight (test).

#### [x] W0-T11 · Ledger in the browser · M · sonnet · deps: W0-T10
- **Goal:** The IndexedDB store (A§7.1's stores), the outbox, BroadcastChannel sync, the schema guard, the persistence request, export and import with undo, and `useEvidence()`.
- **Files:** `src/evidence/{idb-store,outbox,channel,guard,export,import,useEvidence}.ts`; `e2e/ledger-conformance.spec.ts`.
- **Accept:**
  1. The same conformance suite passes against IndexedDB in Playwright Chromium.
  2. An append in one tab shows in a second tab within 1 s.
  3. A database with a newer `schemaVersion` puts the app in read-only mode with a reload prompt.
  4. Export, clear, then import (merge) round-trips to byte-identical canonical JSON.

#### [x] W0-T12 · Sim core: rng, time, workload, physics and host cards · M · sonnet · deps: W0-T02, W0-T03
- **Goal:** `packages/sim/{core,physics,host,workload}` per A§5.2.
- **Files:**
  - the four modules;
  - `scripts/tables/exp-quantiles.ts`, whose committed output is integers;
  - `tests/sim/{core,physics,workload}.test.ts` and `tests/fixtures/sim/workload.json`;
  - `scripts/vectors.ts` (`--check`, `--write`).
- **Accept:**
  1. `below(n)` passes a chi-square uniformity test over 1e5 draws for n in {3, 7, 1000}, and no `Math.floor(… * n)` appears.
  2. The vendored step vectors pass through the physics wrapper.
  3. Workload goldens reproduce byte for byte, and `bun scripts/vectors.ts --check` passes.
  4. The table generator reproduces the committed table.
  5. The host presets carry [estimated] and a card line.

#### [x] W0-T13 · Sim: the step-loop model v0, the TR2 spike · L · sonnet · deps: W0-T12
- **Goal:** `runStepLoop` per A§5.3, with:
  - async scheduling on and off;
  - graphs on and off, with capture sizes and padding;
  - the dependency check;
  - bubble metrics and TTFT and TPOT per request;
  - its notional-machine card.
  This task is the go/no-go for the TR2 spike (D-040).
- **Files:** `packages/sim/steploop/{types,run,events,metrics}.ts`; `content/cards/trace-room-steploop.md`; `tests/sim/steploop*.test.ts`; `tests/fixtures/sim/steploop.json`.
- **Accept:**
  1. At the practice seed, the spans and the summary (GPU busy ‰, bubble µs, tokens/s) equal the golden exactly.
  2. Over 200 seeds:
     - GPU spans never overlap;
     - busy time stays within the horizon;
     - async with device-side inputs raises no violation;
     - a constructed read-before-sample configuration raises one.
  3. On a decode-only workload, async never adds bubble µs, and an exact capture-size hit makes the launch cost `graphReplayUs`.
  4. A 100-step run of 64 requests takes under 20 ms under Bun on the dev host. Record the measurement [measured].
  5. The card's "Ignores" list contains S5's list (kernelspace s5.md §3.5) plus host variance.
  6. If checks 1-4 cannot all be met, stop and report to the owner. No W0 task builds on a workaround.

#### [x] W0-T14 · Game framework core · M · sonnet · deps: W0-T03, W0-T10
- **Goal:** The session contract, the registry (with each game's display name and subtitle, D-049), the action log and replay grader, the announcer, the keyboard map and help dialog, the mirror kit, the Play → Debrief → Compose → In production → Build this shell, and `verify:games` (A§6.3, A§6.8, A§6.9).
- **Files:** `packages/play/{types,registry,replay}.ts`; `src/games/kit/{GameShell,LiveRegion,KeysDialog,MirrorTable,ViewSwitch}.tsx` and `useGameInput.ts`; `src/games/registry.ts`; `scripts/verify-games.ts`; `tests/play/*.test.ts`.
- **Accept:**
  1. A toy game registered in the tests passes `verify:games`. Removing its mirror, 2D view, card, keyboard map or display name fails the gate.
  2. Replaying a recorded log regrades to the same score, and an edited stored score is ignored.
  3. Keys are bound on the container and ignored inside text inputs and on controls that use the key natively, such as `Space` on a focused button (unit test; A§6.8).
  4. Ten messages within 100 ms produce one announcement (fake timers).

#### [x] W0-T15 · Scene kit v0 · L · sonnet · deps: W0-T05, W0-T14
- **Goal:** `src/scene` per A§6.4-A§6.7: Stage, tiers and the Governor, the context-loss fallback, CameraRig, SpanInstances, BlockGrid, LabelLayer, TimeAxis, Selection, PostFX (lazy, tier 2 and up), reduced motion, and a test hook that exposes `renderer.info` in test builds. No drei (D-021).
- **Files:** `src/scene/*.ts(x)`, `src/scene/postfx/*.ts`, `e2e/scene-kit.spec.ts`, `src/pages/Design.tsx` (the specimen section only).
- **Accept:**
  1. With WebGL forced off, Stage renders its 2D child and announces the switch.
  2. A forced `webglcontextlost` swaps to 2D and keeps the session state.
  3. Under `reducedMotion: 'reduce'`, no animation frame is requested after the first settled frame.
  4. 10k instances draw in at most 10 draw calls.
  5. The `postfx` chunk is absent from the network log at T1 and present at T2 (forced tiers).
  6. `verify:boundaries` passes.

#### [x] W0-T16 · Step loop (`loop`): session, 2D view, mirror and poster · M · sonnet · deps: W0-T13, W0-T14
- **Goal:** `packages/play/loop` (session, the front-page levels `first-1-fill` to `first-4-par`, `layout.ts`) and `src/games/loop/{Game,View2D,Mirror,Controls,Debrief}.tsx`; `scripts/posters.ts` renders the practice seed's SVG from `layout.ts` (A§6.11). The session carries GAMES.md §3's synthetic tick card (`TICK_CARD`), manual admission (`admit`), and static and continuous batching over `packages/sim/steploop` (D-043).
- **Read:** GAMES.md §3.1 and §2.6 (Service's objects and First service's copy); D-043, D-048, D-049.
- **Accept:**
  1. The front-page levels follow GAMES.md §3.1 (D-043): requests placed into a tray of 4 slots [estimated] by hand, refill, and an overlap switch, with counters for useful tokens, ghost tokens, GPU-busy ticks and the clock against par, every tick labelled synthetic (D-048). On the practice seed neither refill alone nor overlap alone reaches par (test), and the `first-4-par` band's acceptance is measured and printed, at least 20% of candidates [estimated floor].
  2. The mirror lists every visible step's slots, GPU-busy and bubble time (ticks on the front page; µs and the graph hit once W1-T13 adds TR2's levels) and ghost tokens.
  3. The poster SVG equals the 2D view's first frame (both from one pure function; test).
  4. The 2D view stays at or under 2,000 SVG marks in its default window.
  5. `verify:games` passes for `loop`.

#### [x] W0-T17 · Step loop (`loop`): the 3D scene · L · sonnet · deps: W0-T15, W0-T16
- **Goal:** `src/games/loop/Scene3D.tsx`, built from scene-kit primitives (A§6.1, `loop` row):
  - CPU and GPU tracks along time, with batch slots across the width;
  - the bay, which the front page plays in: the tray of slots, the waiting requests beside it and, with overlap on, the second tray (GAMES.md §3, D-043);
  - step slabs, and launch combs that collapse into a replay slab;
  - bubbles as open gaps;
  - camera presets along, side and top;
  - lever changes that animate, or cut under reduced motion.
- **Read:** GAMES.md §3 and §2.6 (Service: the pass, the rail, the line and the presets, in the kitchen); the surface brief's FIRST VIEWPORT (`.impeccable/surfaces/src-front-frontpage-tsx.md`); D-047.
- **Accept:**
  1. `scene-loop` is at most 40 KB gz (`verify:bundle`).
  2. At most 100 draw calls at the practice seed.
  3. `V` swaps 2D and 3D and keeps the levers, and `C` and buttons reach every preset.
  4. The screenshot artifact is non-blank (pixel sampling).
  5. All text is DOM, and no material uses a literal colour.

#### [x] W0-T18 · The front page · M · sonnet · deps: W0-T09, W0-T16, W0-T17
- **Goal:** A§6.11 in full:
  - The static shell in `index.html` holds the heading, the promise and the inline poster, in a reserved box.
  - Hydration makes the 2D Loop playable.
  - After LCP and on idle, at tier 1 or above, the 3D scene loads and swaps in.
  - Below the fold come the four outcomes (from PRODUCT.md), the map teaser and "Start TR1".
- **Read:** the surface brief, `.impeccable/surfaces/src-front-frontpage-tsx.md` (its scope, direction contract and memorable moment); D-047, D-048; GAMES.md §2.6 (Service).
- **Files:** `index.html`, `src/front/{FrontPage.tsx,upgrade.ts,poster.ts}` (`FrontPage.tsx` is the surface brief's primary target), and the build step that inlines the poster.
- **Accept:**
  1. With JavaScript disabled, `/` shows the heading, the promise and the poster.
  2. The LCP element is the heading or the poster, never the canvas (PerformanceObserver in e2e).
  3. CLS stays at or under 0.1 across the 2D-to-3D swap.
  4. With `saveData` emulated or tier 0 forced, the 3D chunks are never requested.
  5. `verify:numbers` passes on the page copy.

#### [x] W0-T19 · Static routes, meta CSP, 404 and base path · S · sonnet · deps: W0-T01, W0-T09
- **Goal:**
  - `scripts/prepare-pages.ts` writes `dist/<route>/index.html` for every route it can enumerate, each with its own title and description, plus `404.html`.
  - A Vite plugin adds A§12's meta CSP.
  - `verify:routes` is wired up.
- **Accept:**
  1. With `VITE_BASE=/enginespace/`, every route-table entry gets an `index.html` with a distinct `<title>`.
  2. The CSP meta is the first element after `<meta charset>` in every document, and contains no `'unsafe-eval'`.
  3. Adding a route that cannot be enumerated fails `verify:routes`.

#### [x] W0-T20 · Budget gates · M · sonnet · deps: W0-T04, W0-T18
- **Goal:**
  - `scripts/verify-bundle.ts` walks the manifest's closures for A§11.1's budgets: entry, the front page's first-paint closure, CSS, other routes, `three-vendor`, scenes, `postfx`, workers and lesson JSON.
  - `e2e/perf.spec.ts` runs the nightly lab profile (4× CPU, 1.6 Mbit/s, 150 ms RTT) and prints LCP, CLS and INP for lever presses.
- **Accept:**
  1. `verify:bundle` prints each budget's gzip size with pass or fail, and fails above any gate.
  2. The PR records the measured front-page numbers with the build SHA [measured].
  3. The perf spec runs locally and prints its three numbers.

#### [x] W0-T21 · Playwright e2e, axe, screenshots and network isolation · M · sonnet · deps: W0-T18, W0-T19
- **Goal:** `playwright.config.ts` (Chromium, 360×800 default, `vite preview`); `e2e/{a11y,keyboard-loop,network,screenshots,reduced-motion}.spec.ts`; `ci.yml`'s e2e-smoke job and the nightly sweep.
- **Accept:**
  1. axe finds 0 serious or critical violations on `/`, `/map`, `/m/tr2`, `/m/tr2/l0-sample`, `/play/loop`, `/settings`, `/design` and `/evidence`, at 360 and 1280 px.
  2. A keyboard-only walk wins the front-page level.
  3. No request leaves the origin during the walk.
  4. 2D screenshots of `/` at 360 and 1280 px compare within tolerance. The 3D screenshot is an artifact checked non-blank.
  5. The SwiftShader flags that Playwright 1.63's Chromium needs are recorded in the config with a comment [measured].

#### [x] W0-T22 · Settings, evidence v0 and the design page · M · sonnet · deps: W0-T05, W0-T11, W0-T15
- **Goal:**
  - `/settings`: 3D on or off, the tier cap, a reduced-motion override, and export, import and reset.
  - `/evidence` v0: event counts by kind and module, with export and import.
  - `/design`: token roles and values, component states, motion, and scene-kit specimens, each beside its 2D twin.
- **Accept:**
  1. Settings persist in `working` and apply live: switching reduced motion on stops a running scene's animation (e2e).
  2. Reset asks for confirmation and offers an export first.
  3. `/design` lists exactly the roles in `tokens.ts` (test).

#### [x] W0-T23 · Repo docs for agents · S · sonnet · deps: W0-T04
- **Goal:** `README.md` (what the course is, how to run it, the lanes) and `AGENTS.md` (this tracker's agent brief, how to run the gates, the read-only rule for the sibling repos, pins and tags).
- **Accept:**
  1. AGENTS.md carries every rule of the agent brief above.
  2. README's commands run as written on a clean clone.

#### [=] W0-T25 · Finish review and DESIGN.md (impeccable) · M · opus · deps: W0-T21, W0-T22
- **Goal:** Discharge the direction contract's FINISH line (D-047): impeccable's finish review of the built front page and its world, the review's verdict, DESIGN.md and `.impeccable/design.json` written by impeccable's documenter from the built world, and provenance on every shipping raster.
- **Read:** the surface brief, `.impeccable/surfaces/src-front-frontpage-tsx.md`; impeccable's `reference/new-work.md` §7 (Inspect and finish) and `reference/document.md`; PRODUCT.md; D-047 to D-049; GAMES.md §2.6.
- **Files:**
  - `DESIGN.md` and `.impeccable/design.json`;
  - the fixes a review round asks for, within `src/design/**`, `src/front/**`, `src/games/loop/**` and `src/scene/**`;
  - `tests/design/design-md.test.ts`;
  - `docs/DECISIONS.md` (D-047's finish outcome);
  - nothing under `.impeccable/review/`: the captures stay there, and git ignores them.
- **Steps.** This is impeccable's code-led finish: no comp exists, so the reviewer audits the contract's FIRST VIEWPORT and signature interaction in behaviour.
  1. Capture `/` from `vite preview` in Playwright's Chromium, at 1440 px (full page) and at 390 px, into `.impeccable/review/desktop.png` and `mobile.png`, with entrance motion settled. Drive the signature interaction (hang a ticket by drag, tap and key, then ring a fire) and every reachable state. Open each capture once and confirm it shows what its name says.
  2. Run `impeccable detect --json` once on the changed targets, and fix what is mechanical.
  3. Spawn impeccable's finish reviewer fresh, with no inherited history, and give it new-work §7's packet: the request, the confirmed answers (the brief's Scope), the artifact path, the capture paths, the direction contract, the detector's remaining findings, any QUALITY BAR card, and the craft-floor reference path. With no subagent capability, run impeccable's `degraded/finish-reviewer.md` instead, and say so.
  4. Act on the disposition word (`ship`, `fix`, `rebuild` or `recapture`) as new-work §7 says. Unattended, take at most two fix rounds, each a batch of fixes, a recapture and a verdict pass.
  5. Spawn impeccable's documenter with the project root, the artifact path, the direction contract, PRODUCT.md, `document.md` and the write boundary (`DESIGN.md`, `.impeccable/design.json`).
  6. Run `impeccable embed-prompt --scan` over every directory that ships rasters.
- **Accept:**
  1. The final disposition is `ship`, or the owner chose to ship with the open findings listed. The task's result reports the verdict under the reviewer's own word and at its scope, lists every open finding, and W0-T24's report carries it.
  2. DESIGN.md has token front matter and the canonical sections, and `.impeccable/design.json` exists. A test checks that every colour value in DESIGN.md's front matter appears in `src/design/tokens.css`, and that every face it names is self-hosted under `public/fonts/`.
  3. `impeccable embed-prompt --scan` reports no shipping raster without its provenance.
  4. W0-T05's contract-leak test still passes: no direction-contract text in `src/`, `public/` or `index.html`.
  5. `npm run lint`, `npm run typecheck`, `bun test`, `npm run build`, `verify:tokens` and W0-T21's e2e specs pass after the fixes.
  6. D-047's record notes the verdict and its date.

#### [x] W0-T24 · W0 exit review · S · opus · deps: all of W0
- **Goal:** Review W0 against ARCHITECTURE and DECISIONS, and close W0's open decisions.
- **Accept:**
  1. `docs/waves/W0-report.md` records:
     - the budgets as measured, with device, date and build SHA [measured];
     - the reference devices (O-9);
     - gate status;
     - the finish review's verdict and its open findings (W0-T25);
     - open issues.
  2. DECISIONS is updated: D-023's budgets are frozen, D-040's spike result is recorded, and O-7, O-8 and O-9 are answered or carried over.
  3. The wave PR (`wave-0` → `main`) is open for the owner.

---

## W1: the no-GPU modules (TR1, TR2, TR5a, TR6, TR8) and their games

**Exit criteria:**
- The five modules are live, each with its loop: content, games, a graded browser artifact and Today.
- Every W1 game passes `verify:games` and the keyboard walks.
- The GPU parts of TR1, TR6 and TR8 are announced as arriving with W2 (D-039).

**At the exit review (W1-T38, 2026-11-08).** Every build task of W1 merged into `wave-1`, and each shows `[=]` until the owner merges the wave. W1-T02 and W1-T37 are the owner's and stay `[ ]`. W1-T38 shows `[~]`: its first check fails on the eleven KCs that still say `planned`, because the lessons name 18 item families that no W1 task built ([waves/W1-report.md](waves/W1-report.md) §5). Within merged tasks, W1-T12's fourth check waits on the owner's dispatcher tables (Q-10), and so does W1-T13's `keys` level.

**At W1b's exit review (W1b-T16, 2026-11-09).** The owner merged `wave-1` into `main` with PR #2, so W1's build tasks show `[x]`, but W1-T12, which keeps `[=]` while its fourth check waits on Q-10's tables (W1-T13's `keys` level waits on them too). W1b built the 18 item families, and on `wave-1b` at `1ed97ac` `bun scripts/verify-kc.ts --final` passes: 45 KCs, all 45 with a graded reference and none planned. So W1-T38's first check holds there, and W1-T38 shows `[=]` until the owner merges `wave-1b` ([waves/W1b-report.md](waves/W1b-report.md) §4.3).

### Shared

#### [x] W1-T01 · Pins and W1 claims · M · sonnet · deps: W0-T24
- **Goal:**
  - `course.lock.json` entries by SHA for `vllm`, `sglang`, `nano-vllm`, `mini-sglang`, `inside-vllm`, `nsys`, `ncu` and `perfetto` (D-035, A§4.4).
  - A claim for every upstream fact that a W1 module cites:
    - async scheduling (the default since v0.14.0);
    - MRV2 as the default runner (since v0.29.0);
    - CUDA-graph modes and both runners' dispatch descriptors (D-041);
    - graph memory reserved before KV sizing;
    - KV event shapes, and hybrid KV groups with N-group lookup;
    - adapter slots in both engines (D-042), and `SupportsHMA`;
    - speculative methods, and mask overlap in both engines;
    - `vllm bench serve` defaults and traps.
  - Resolve A§5.4's [unverified] KV event shapes.
- **Read:**
  - `research/upstream-vllm.md` and `research/upstream-sglang.md`, the dated claims tables, written 2026-11-03. Start from their rows and re-fetch only what a claim needs to quote.
  - The catalog's §3.5 resources at the pinned versions.
- **Accept:**
  1. `verify:pins` and `verify:claims` pass. Every claim cites the pinned file at its tag or commit, or a doc URL, with an accessed date.
  2. The PR states the generic User-Agent used for every fetch.
  3. `content/claims/README.md` has a note on what changed since kernelspace's twins (vLLM v0.31.0, SGLang v0.5.21).

#### [ ] W1-T02 · Owner: confirm the edition-1 pins · S · owner · deps: W1-T01
- **Accept:** D-035's status reads accepted or changed, with the date, and `course.lock.json` matches.

#### [x] W1-T03 · KC graph v0 · M · sonnet · deps: W0-T24
- **Goal:** `content/kc/graph.yaml` for TR1, TR2, TR5a, TR6 and TR8, with edges and thresholds, following ASSESSMENT.md's KC conventions, plus `verify:kc`.
- **Accept:**
  1. The graph is a DAG.
  2. Every KC has a description and at least one reference to an item, a game level or a check. A `planned:` placeholder is allowed only until W1-T38, which fails on any that remain.

#### [x] W1-T04 · Generator framework and the item block · M · sonnet · deps: W1-T03
- **Goal:**
  - `packages/play/items`: `Gen {kcs, make(seed, level), grade, solution, band}`.
  - `src/items/ItemBlock.tsx`: a fresh seed when an attempt starts, a confidence tap, a why on reveal, and `item` events with provenance.
  - `verify:items`: determinism, the band rejection rate, and the blind-strategy bound from ASSESSMENT.md (A§8.2).
- **Accept:**
  1. A sample family passes `verify:items`, and a family using `Math.random` fails.
  2. Two graded attempts draw different seeds (e2e).
  3. No key or solution appears in the Markdown export.

#### [x] W1-T05 · Today · M · sonnet · deps: W0-T02, W1-T04
- **Goal:** `/today`, with due KCs from the vendored FSRS, items regenerated on fresh seeds, a session cap of 10-12 minutes [estimated], and `review` events. Phone-first (D-037).
- **Accept:**
  1. The FSRS reference vectors pass through the wrapper.
  2. A scripted 30-day ledger produces the expected due list (golden).
  3. The page passes axe and a keyboard walk at 360 px.

#### [x] W1-T06 · Course map and module progress · M · sonnet · deps: W0-T09, W1-T03
- **Goal:** `/map`: TR0-TR8 and the capstone, with lanes, hours, kernelspace prerequisites, artifacts, and evidence state derived at read time through the ref→KC map. An accessible list sits behind the graphic. Module pages show their loop and progress.
- **Accept:**
  1. No status is stored: a test asserts that progress reads only events and content.
  2. There is no sideways scroll at 320 px.
  3. Every node links to its module.

#### [x] W1-T07 · Notional-machine cards · S · sonnet · deps: W0-T08
- **Goal:** `content/cards/*` for the steploop, lifecycle, kv, spec, bench and trace worlds, each with "Models", "Ignores" and "Calibrated against" (A§5.9). The `card` block renders them.
- **Accept:**
  1. Every card cites claim ids.
  2. `verify:games` fails when a registered game's card is missing.

#### [x] W1-T08 · Trace model and synthetic traces · M · sonnet · deps: W0-T13
- **Goal:** `packages/sim/trace` per A§5.7: `trace@1` columns, `traceFromRun` with seeded jitter, `attribute` and `traceChecks`.
- **Accept:**
  1. On 200 seeds of synthetic traces, GPU-busy + CPU-gap + both-idle equals every step window exactly in integer ns (A§5.7; ASSESSMENT T7), and `attribute` recovers the run's own per-µs truth.
  2. `traceChecks` passes synthetic traces and fails constructed defects: overlapping kernels, a launch after its kernel, a kernel outside its step mark.
  3. Encoding round-trips exactly.

#### [x] W1-T09 · Trace viewer · L · sonnet · deps: W0-T14, W1-T08
- **Goal:** `src/trace/TraceView`:
  - Canvas2D lanes, with zoom and pan by keys and buttons;
  - selecting, marking and labelling spans;
  - a DOM mirror of the spans in the window;
  - keyboard movement between spans;
  - marks exported in the `trace-mark` event shape.
- **Accept:**
  1. Panning 100k spans holds at least 30 fps on the dev host. Record the measurement [measured].
  2. Every action works from the keyboard.
  3. axe is clean.

#### [x] W1-T10 · Forge host and the invoke protocol · L · sonnet · deps: W0-T02
- **Goal:**
  - `src/forge`, wrapping the vendored host, and `forge.worker`.
  - `src/forge/invoke.ts`: seeded op batches over `ks_invoke`, with an oracle hook into `packages/sim`.
  - The `/labs/:lab` forge view: drop a `.wasm`, its SHA-256, per-check results and fresh seeds.
  - `labs/forge/toy` (Cargo workspace, `rust-toolchain.toml` 1.96.0), a toy lab with its reference build and one bestiary module.
  - `verify:labs` (A§8.3, D-025).
- **Accept:**
  1. The toy reference passes and the bestiary module fails `verify:labs`.
  2. An infinite loop traps at the 2 s per-check timeout.
  3. A `--features reference` build shows "@reference: no credit".
  4. `lab-check` events carry `wasmSha256` and seeds.

#### [x] W1-T11 · Forge lab packer · S · sonnet · deps: W1-T10
- **Goal:** `scripts/pack-labs.ts` packs each forge lab (crate, kit, agent kit, README) as a zip in `public/labs/`, with a SHA-256 manifest. The agent kit is vendored from kernelspace and renamed.
- **Accept:**
  1. Two runs produce byte-identical zips (fixed modification times).
  2. The manifest's hashes match.
  3. A scripted check shows the agent kit's guard hook blocking an edit to the harness file.

### TR2: the step loop

#### [=] W1-T12 · Sim: step loop v1 · L · sonnet · deps: W0-T13, W1-T01
- **Goal:**
  - Graph modes and dispatch keys as data from claims, for each runner: MRV2's `BatchExecutionDescriptor` as the default, and MRV1's `has_lora` as legacy (D-041).
  - Capture-size padding, with its graph memory reserved before the KV cache is sized.
  - Runner presets (`mrv2` as the default, `v1`) and per-GPU engine defaults (at least the 4090 and H100 rows) from claims.
  - The 70B cost card's host term on the CPU lane, as D-044 proposes, once the owner confirms it.
  - The structured-output mask with overlap.
  - The speculative step's shape, using the acceptance formula.
- **Accept:**
  1. Each feature has goldens, and A§5.10's properties hold.
  2. Every rule cites a claim id in a code comment.
  3. The card's "Ignores" list is updated.
  4. A script generates the dispatcher golden tables by running the pinned vLLM's MRV2 (`vllm/v1/worker/gpu/cudagraph_utils.py`) and MRV1 (`vllm/v1/cudagraph_dispatcher.py`) dispatch on a CPU (GAMES.md §3). The owner runs it at the pin and commits the tables with their SHA-256 (Q-10), and `dispatchV2` and `dispatchV1` agree with them on at least 5,000 cases each. That a CPU-only run is enough is [unverified]; if it is not, the owner runs it on the W2-T12 smoke host and W1-T13's `keys` level waits.
  5. On the 70B card, no host work is counted on both lanes (a test sums each lane's per-sequence terms).

#### [x] W1-T13 · Step loop (`loop`): TR2's levels · L · sonnet · deps: W0-T17, W1-T12
- **Goal:** Levels `async`, `graphs` (stages `comb`, `sizes` and `modes`), `keys` (choose dispatch keys under a memory budget; the In-production card shows MRV2's descriptor, MRV1's `has_lora` and SGLang's padded-size buckets, per D-041), `mrv2` and `mask` (TR6's tie-in), as GAMES.md §3.2 designs them; W1-T14 adds the graded `close`. Each level has a prediction first, a debrief, Compose (a policy spec compiled to a configuration), an In-production card with pinned engine flags as claims, and a Build-this card, in both 2D and 3D. On these levels the printer tape switches from synthetic ticks to µs on the model's clock, with each cost card's tags (D-048), and the new objects (the mold rack, the comb, the allergy card) follow GAMES.md §2.6.
- **Accept:**
  1. Every level can be won by keyboard.
  2. On 50 seeds, each level's naive configuration fails its bar and the intended one passes.
  3. `scene-loop` stays at or under 40 KB gz.

#### [x] W1-T14 · TR2's graded task and item families · M · sonnet · deps: W1-T04, W1-T13
- **Goal:** The Loop's `close` level, "toggled until the bubbles close", graded on fresh seeds (seeded workload and host-card draws), plus the families `tr2.bubble-width`, `tr2.graph-hit` and `tr2.padding-waste`, with their bands and blind strategies.
- **Accept:**
  1. `verify:items` passes.
  2. A test shows "everything on" failing some graded seeds, through the memory budget or padding waste.
  3. The pass bars match ASSESSMENT.md.

#### [x] W1-T15 · TR2 content · L · sonnet · deps: W1-T01, W1-T13, W1-T14
- **Goal:** TR2's `module.md` and lessons (about 10 h [estimated]): the step loop, async scheduling, the MRV2 delta, CUDA-graph modes and dispatch keys. Every fact is a claim, and `builds_on` names kernelspace's T5.L7 and T0.L6.
- **Accept:**
  1. `verify:content`, `verify:claims` and `verify:numbers` pass.
  2. Every lesson has a prediction, a game or item, and an exit check.
  3. Reading minutes fall within 20% of the declared minutes.
  4. Status is `review`.

### TR1: read the engines

#### [x] W1-T16 · Sim: the lifecycle model · M · sonnet · deps: W1-T01, W1-T08
- **Goal:** `packages/sim/lifecycle`: the request paths of vLLM and SGLang as data (stage, location, mechanism), each stage sourced to the pinned reading targets, plus synthetic lifecycle traces (A§5.8).
- **Accept:**
  1. Every stage cites its file at its commit.
  2. Synthetic traces pass `traceChecks`.
  3. Goldens reproduce.

#### [x] W1-T17 · Request path (`engine-floor`): session, 2D view and mirror · M · sonnet · deps: W0-T14, W1-T16
- **Goal:** `packages/play/engine-floor` and a 2D swimlane view. The capsule moves only when the mechanism and the location are both right, and the map builds as the request moves.
- **Accept:**
  1. The game can be completed by keyboard.
  2. A wrong answer is explained from the stage's source.
  3. `verify:games` passes.

#### [x] W1-T18 · Request path (`engine-floor`): the 3D scene · L · sonnet · deps: W0-T15, W1-T17
- **Goal:** Process platforms, the GPU deck, queue buffers and IPC bridges, with one capsule and camera stops that follow it (A§6.1).
- **Accept:**
  1. At most 40 KB gz and at most 100 draw calls.
  2. Reduced motion cuts between stops.
  3. `V` keeps the session.

#### [x] W1-T19 · TR1's graded lifecycle map · M · sonnet · deps: W1-T09, W1-T17
- **Goal:** The Engine Floor's graded `map` level (GAMES.md §5): on a fresh scenario (engine × streaming × TP × abort × prefix hit × n = 2), the learner lays the request's path from the tray, and `spanCheck` matches every laid stage, in order, to a span of the scenario's synthetic lifecycle trace, shown in the trace viewer. Pass bars are ASSESSMENT.md §4.3's.
- **Accept:**
  1. Grading is deterministic and the seeds are banded; each engine family appears on at least 15% of graded seeds.
  2. A scene-blind strategy (laying one engine family's most common path) passes no more often than ASSESSMENT.md §4.1's bound.

#### [x] W1-T20 · TR1 content · L · sonnet · deps: W1-T16, W1-T17, W1-T18, W1-T19
- **Goal:** TR1's module and lessons: reading nano-vllm, Mini-SGLang, and Inside vLLM at 42172ad; the lifecycle; abort inside the engine, recapped from the Data Plane's DP5 in under an hour (catalog §4). The fork lab is announced for W2.
- **Accept:**
  1. The checks of W1-T15 pass.
  2. Every code reference is a pinned permalink.

### TR5a: hybrid KV and adapter pages

#### [x] W1-T21 · Sim: the hybrid KV model · L · sonnet · deps: W0-T12, W1-T01
- **Goal:** All of A§5.4: groups, the pool, sliding release, state pages, adapters, prefix hashing, events, invariants and op generators.
- **Accept:**
  1. The invariants hold over 200 seeds × 2,000 ops.
  2. Each bestiary member of TR5a §5 (a leaky free, a non-atomic admit, a window off by one, a double-counted adapter, a prefix hit that takes the union of groups instead of the intersection, an event published twice) is caught.
  3. Every group's block is exactly one page, and an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages (D-045).
  4. The events match their goldens.

#### [x] W1-T22 · Forge lab `hybrid-kv` · L · sonnet · deps: W1-T10, W1-T21
- **Goal:**
  - `labs/forge/hybrid-kv`: the harness `lib.rs` (DO NOT EDIT), the `TODO(you)` file, stages, a reference feature and bestiary modules.
  - Host checks run through invoke against `kvReference` on fresh seeds.
  - It extends lab 02's `adapter_unified_paging` idea.
- **Accept:**
  1. The reference passes, and every bestiary module fails a named check.
  2. `cargo test` agrees with the host on the default seeds.
  3. W1-T11 packs the zip.

#### [x] W1-T23 · KV page pool (`pool`): session, 2D view and mirror · M · sonnet · deps: W0-T14, W1-T21
- **Goal:** `packages/play/pool`, with admit, evict, preempt and prefetch-adapter actions. The levels are GAMES.md §8's `one-group`, `two-kinds`, `evict`, `same-size`, `state`, `adapters` and `manager`, with `evict`, `adapters` and `manager` graded, and a 2D grid view.
- **Accept:**
  1. The game can be completed by keyboard.
  2. On 50 seeds, each level's naive play fails its bar and the intended play passes.
  3. `verify:games` passes.

#### [x] W1-T24 · KV page pool (`pool`): the 3D scene · L · sonnet · deps: W0-T15, W1-T23
- **Goal:** The rack of fixed-position pages with group and adapter glyphs (no shelf per group), the free line in eviction order, one thread per group from a request to its pages, and linked, non-contiguous adapter pages, with front, per-group-filter and top presets (A§6.1, GAMES.md §8).
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. Under reduced motion, the threads update per op without layout jumps.

#### [x] W1-T25 · TR5a content · M · sonnet · deps: W1-T22, W1-T23, W1-T24
- **Goal:** TR5a's module and lessons: hybrid KV groups, and adapter pages in the same pool as S-LoRA's design, which the learner builds and measures against upstream's adapter slots (D-042). They build on lab 02 and T6.L9.
- **Accept:** The checks of W1-T15 pass.

### TR6: speculation and structure

#### [x] W1-T26 · Sim: speculation · M · sonnet · deps: W0-T12
- **Goal:** A§5.5: `Dist`, `verifyChain`, residual sampling, `chiSquare`, the `CRITICAL` tables (a generator script with committed output) and `expectedTokensPerRound`.
- **Accept:**
  1. With 2 seeds at α = 1e-4, the false-fail rate is at most 5e-4 [estimated bound]: 200 seeds on PRs, 10,000 nightly.
  2. Each bestiary member is detected at least 99% of the time at N = 20,000. Record the measurement [measured].
  3. The generator reproduces the committed tables.

#### [x] W1-T27 · Forge lab `rejection-sampler` · L · sonnet · deps: W1-T10, W1-T26
- **Goal:**
  - `labs/forge/rejection-sampler`.
  - The host drives the learner's verify step with seeded p, q and drafts, then runs chi-square on two fresh seeds.
  - The bestiary (TR6 §5, which ASSESSMENT §4.5 requires): accept when p > q; accept with p/q but resample from p; resample from q; an off-by-one in the residual; the boundary-inclusive comparison of SGLang PR #35798; a FLy-style lossy rule.
- **Accept:**
  1. The reference passes and every bestiary member fails.
  2. The measured false-fail and detection rates are recorded in the PR.

#### [x] W1-T28 · Rejection sampler (`verifier`): session, 2D view and mirror · M · sonnet · deps: W0-T14, W1-T26
- **Goal:** GAMES.md §10's levels:
  - `overlap` (practice): γ = 1; predict α from the overlap min(p, q).
  - `exact` (graded): sculpt or choose the recovery rule until the exact output's total-variation distance to p is 0, computed in rationals.
  - `chain` (graded): γ up to 4 with a bonus token; predict tokens per round.
  - `greedy-ngram` and `mutants` (practice): temperature 0 and n-gram drafts; find the bug in five samplers.
  - `gamma` (graded): draft-length economics, from kernelspace's push-luck model.
- **Accept:**
  1. The game can be completed by keyboard.
  2. Only the exact residual reaches total-variation distance 0 in `exact`.
  3. `verify:games` passes.

#### [x] W1-T29 · Rejection sampler (`verifier`): the 3D scene · L · sonnet · deps: W0-T15, W1-T28
- **Goal:** One skyline row per draft position into depth, then a bonus row, each column stacking the overlap, the reject cap and the recovery well; drafted tokens dropping onto their rows, the walk stopping at the first rejection, and the output skyline converging at the front (A§6.1, GAMES.md §10).
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. The observed skyline updates in batches, not per draw.
  3. Reduced motion shows each batch's final histogram.

#### [x] W1-T30 · TR6 content and the mask-overlap timeline · L · sonnet · deps: W1-T13, W1-T27, W1-T28, W1-T29
- **Goal:** TR6's module and lessons:
  - speculation, which this course owns, and the rejection sampler;
  - EAGLE-3 and MTP as reading;
  - the grammar mask's overlap, through The Loop's `mask` level. That level is the browser artifact, the "mask-overlap timeline".
  - Grammar-engine internals are recapped from DP4 in under an hour.
- **Accept:**
  1. The checks of W1-T15 pass.
  2. The mask-overlap graded task passes `verify:items`.

### TR8: benchmark like you mean it

#### [x] W1-T31 · Sim: the benchmark generator · L · sonnet · deps: W0-T12, W0-T13
- **Goal:** A§5.6: arrivals (Poisson by table, replay, closed loop); the server as the step loop's coarse mode; intended against actual send times; and the statistics (percentiles, bootstrap interval, goodput, Little's law).
- **Accept:**
  1. On the same server, closed loop shows coordinated omission and open loop does not (test).
  2. On a known distribution, the nominal 95% bootstrap interval covers within [93%, 97%] over 2,000 seeds [estimated tolerance].
  3. On stable runs, the Little's-law residual is under 2%.

#### [x] W1-T32 · The broken-benchmark corpus · M · sonnet · deps: W1-T31
- **Goal:** `brokenBenchCase(seed)` with A§5.6's ten flaws and the control case (GAMES.md §11). The answer is drawn first, seeds are banded, and the blind-strategy bounds are measured and printed (kernelspace's D39 rule). Each flaw's debrief cites its real-world instance as a claim, such as `vllm bench serve`'s `--request-rate inf` default, `--max-concurrency` as a capped closed loop, zero warm-ups and prefix-cache reuse across runs (vllm B1-B3).
- **Accept:**
  1. Each of the eleven cases (ten flaws and the control) appears in 1/11 ± 3% of seeds [estimated tolerance].
  2. The best constant per flaw label passes at most as often as ASSESSMENT.md's bound.
  3. Every case's corrected answer recomputes from its scene.

#### [x] W1-T33 · Broken benchmark (`broken-bench`) · M · sonnet · deps: W0-T14, W1-T32
- **Goal:** A 2D evidence board with the setup, the client log and a plot. The learner picks the flaw and predicts the corrected p99 with an interval, scored by log score. The debrief re-runs the corrected benchmark.
- **Accept:**
  1. The game can be completed by keyboard.
  2. Runs are graded on fresh seeds.
  3. `verify:games` passes.

#### [x] W1-T34 · TR8 content · M · sonnet · deps: W1-T31, W1-T32, W1-T33
- **Goal:** TR8's module and lessons: open against closed loop, coordinated omission, warm-up, and bootstrap intervals on p99. They extend kernelspace's broken-bench and knee exercises, and announce the BurstGPT replay for W2.
- **Accept:** The checks of W1-T15 pass.

### Closing W1

#### [x] W1-T35 · Markdown export and `llms.txt` · S · sonnet · deps: W0-T08
- **Goal:** Commit `public/md/**` and `public/llms.txt`, with keys stripped, and add a CI freshness check.
- **Accept:**
  1. A test finds no solution or key field in the export.
  2. A stale export fails the freshness check.

#### [x] W1-T36 · End-to-end coverage for W1 · M · sonnet · deps: W1-T15, W1-T20, W1-T25, W1-T30, W1-T34
- **Goal:** Coverage for every W1 route and game:
  - axe at 360 and 1280 px;
  - keyboard walks of every game level;
  - reduced-motion checks for every W1 scene;
  - network isolation.
- **Accept:** All of it passes in the CI smoke subset and in the nightly full run.

#### [ ] W1-T37 · Owner: screen-reader pass · S · owner · deps: W1-T36
- **Accept:** NVDA and VoiceOver notes are in `docs/waves/W1-report.md`, and issues are filed.

#### [=] W1-T38 · W1 exit review · S · opus · deps: all of W1
- **Accept:**
  1. The report records:
     - a spot-check of content facts, with a sample of claims re-fetched;
     - the budgets;
     - the gates;
     - every KC `planned:` placeholder filled.
  2. The wave PR is open.

---

## W1b: W1's carry-over (the loop W1 left open, the scene kit, CI)

**Why there is a W1b.** W1 built every task of its tracker and did not close its loop ([waves/W1-report.md](waves/W1-report.md) §1). The site went live on 2026-11-09, and a check of it in a real browser that day showed what that leaves a learner [measured 2026-11-09 at 1b402ca, on the live site and on a local copy of the same files]:
- the 27 lessons hold 40 game blocks, 39 prediction boxes, 8 lab blocks and 24 item sets that print "Not built yet" with a disabled button, though most of them name tasks marked `[=]`;
- no page links the forge labs' crates;
- game and lab pages lose their own `<title>` once the app mounts.

W1b closes these, with the carry-overs of W1-report §5, §7.4 and §12, before W2's module tasks start. Its branch, `wave-1b`, stacks on `wave-1`. W2's grader track may run alongside it.

**Models.** W1b-T01 and W1b-T10 go to opus, as W1 gave its scene kit, the Service redress and the finish fixes to opus (W1-report §9.4 and §11). W1b-T16 is the exit review. The rest are sonnet's (D-036).

**Exit criteria:**
- Every lesson block that names a built feature runs it:
  - a game block plays its level in the lesson;
  - a prediction box takes a prediction and scores it after the game;
  - an item set draws items;
  - a forge lab's block leads to a page that hands over the crate.
- `bun scripts/verify-kc.ts --final` passes, which is W1-T38's first check.
- The map and the module pages count items and lab checks toward progress, as well as game levels.
- The scene kit carries the haze, the lamp's pool and paper, inside the frozen scene gates. Each of the four 3D surfaces gets one more finish review.
- No frozen gate moved: every gate table of `wave-1b` holds `wave-1`'s values or stricter.

**At the exit review (W1b-T16, 2026-11-09).** Every task of W1b merged into `wave-1b` through the merge script's five gates, and each shows `[=]` until the owner merges the wave ([waves/W1b-report.md](waves/W1b-report.md)). Within merged tasks, W1b-T02's first check holds for 17 of the 39 prediction boxes: no run of the games as built holds the answer of the other 22, and their tickets name W2-T43, which W1b-T02 added. W1b-T04's `tr2.dispatch-key` leaves out the variants that need Q-10's tables, as its goal allows. The other exit criteria hold; the finish reviews' open fixes and the live check's findings are in the report's §6 and §7.

### Lessons that run what W1 built

#### [=] W1b-T01 · Lesson game blocks play their levels · L · opus · deps: —
- **Goal:** A lesson's `game` block embeds its game at its level and mode, as A§4.3 has it ("It embeds `src/games/<id>`"). This replaces today's ticket, which prints "Not built yet" beside a disabled "Start level".
  - The game's code loads only when the learner starts the level.
  - A page keeps one live 3D canvas (A§6, `Stage`), and every other embed shows its 2D view until it is opened.
  - A `graded` block runs on a fresh seed and writes the same `play` events as the game's own page (A§6.3, A§7).
  - A game that no task has built yet keeps its ticket, which names its open task.
- **Read:**
  - A§4.3, A§6 and A§7.2;
  - GAMES.md §2 and the section of each W1 game;
  - DESIGN.md (Ticket, One Lamp);
  - `src/content/render/Blocks.tsx` and `model.ts`;
  - `src/pages/Game.tsx`, `src/games/kit/GameShell.tsx` and `src/scene/lease.ts`;
  - the level pages, `/play/<game>?level=`.
- **Files:** `src/content/render/`; whatever the game shell needs to sit inside a lesson; tests and `e2e/` coverage.
- **Accept:**
  1. Each of the 40 game blocks in the 27 lessons starts its level in the lesson. A registry test checks that every block names a level that exists. An e2e walk per game plays a lesson's block to its debrief by keys alone, at 360 and 1280 px, with focus in view.
  2. With two game blocks open on one page, only one 3D canvas is live at a time.
  3. A graded block writes the same `play` events as the game's page does for the same run, and a test compares them.
  4. The lesson and module routes' JavaScript stays inside D-023's gates, and `verify:bundle` prints what the embed loads on demand.
  5. axe finds no serious or critical violation on a lesson with an embed open, at 360 and 1280 px.
  6. `GAME_TASKS` names only open tasks.

#### [=] W1b-T02 · The lesson prediction box, and placeholders that name open work · M · sonnet · deps: W1b-T01
- **Goal:** A lesson's `predict` block works.
  - It takes a prediction: a number within its tolerance, a choice, or an interval.
  - It commits the prediction before the game that follows it is played.
  - At the reveal it scores the prediction against the reference that the pure model computes from that run. The reveal is `after-game` for every block (`REVEAL_POINTS`), and no key is stored (A§1, I3; ASSESSMENT §4.7).
  - It writes a `predict` event (A§7.2), which moves no completion and no weight-1.0 credit (ASSESSMENT §6).

  When this task is done, every placeholder the renderer still prints names an open task.
- **Read:**
  - ASSESSMENT §4.7 and §6;
  - A§4.3 and A§7.2;
  - GAMES.md's Predict row;
  - `predictShape` in `packages/schema/content.ts`;
  - the 39 predict blocks in `content/modules`.
- **Files:** `src/content/render/` (PredictTicket); a table of which result of which game block answers each prediction; `PENDING` in `model.ts`; `tests/content/pending.test.ts`.
- **Accept:**
  1. Each of the 39 blocks commits, then reveals and scores after its game. A test plays each one's game on a seed and checks that the reference is read from the run.
  2. A committed prediction cannot change, and nothing of the answer shows before the game ends.
  3. The `predict` event carries the value and the outcome (A§7.2's row). Where a page reads predictions (Today, a game's Mirror), it reads this one. A reader that does not exist yet is named with its task.
  4. `tests/content/pending.test.ts` fails when `PENDING`, `GAME_TASKS` or `LAB_TASKS` names a task whose marker is `[=]` or `[x]`. The trace block and the In-production and Build-this cards each name the open task that builds them. If no task does, add one to W2 and say so.
  5. Keys alone commit and reveal a prediction. axe passes as in W1b-T01.

#### [=] W1b-T03 · TR1's item families · M · sonnet · deps: —
- **Goal:** Build the five families that TR1's lessons name and no W1 task built (W1-report §5):
  - `tr1.which-mechanism`;
  - `tr1.step-budget`;
  - `tr1.where-does-it-run`;
  - `tr1.what-moved`;
  - `tr1.request-state`.

  Build each to W1-T04's contract, as W1-T14 and W1-T30 built theirs: the generator, its face in `packages/play/items/catalog.ts`, its loader in `src/items/families.ts`, goldens, and its `verify:items` bands.
- **Accept:**
  1. `verify:items` passes on every level, and each level's best blind strategy is under the bound that `verify:items` holds (ASSESSMENT §4.1; O-14 is the owner's).
  2. TR1's content test lists no family as `TO_BUILD`, and every item block in TR1's lessons draws items.
  3. In `content/kc/graph.yaml`, the families replace the `planned:` lines they answer: `tr1.phases-vs-one-budget`, `tr1.request-states` and `tr1.read-at-the-pin`.
  4. Every fact about an engine is a claim at the pins (A§4.4), or is derived from the sim.

#### [=] W1b-T04 · TR2's item families · M · sonnet · deps: —
- **Goal:** Build TR2's six families to the contract of W1b-T03:
  - `tr2.step-order`;
  - `tr2.preempt-victim`;
  - `tr2.default-budget`;
  - `tr2.runner-fallback`;
  - `tr2.dispatch-key`;
  - `tr2.kv-after-graphs`.

  `tr2.dispatch-key` is built from the dispatch rules that D-041 keeps as data. A variant that needs the committed dispatcher tables (Q-10) is left out, and the task says so.
- **Accept:** W1b-T03's four checks, for TR2's content test and for the KCs `tr2.step-calls`, `tr2.one-budget`, `tr2.gpu-dependent-defaults` and `tr2.dispatch-keys`. If Service's `keys` level is still waiting on Q-10, `tr2.dispatch-keys` is answered by the family.

#### [=] W1b-T05 · TR5a's item families · M · sonnet · deps: —
- **Goal:** Build TR5a's four families to the contract of W1b-T03:
  - `tr5a.blocks-held`;
  - `tr5a.hit-length`;
  - `tr5a.pages-for-adapter`;
  - `tr5a.slots-vs-pages`.
- **Accept:** W1b-T03's four checks, for TR5a's content test and the KC `tr5a.slots-vs-pages`.

#### [=] W1b-T06 · TR8's item families · M · sonnet · deps: —
- **Goal:** Build TR8's three families to the contract of W1b-T03:
  - `tr8.goodput-denominator`;
  - `tr8.littles-law`;
  - `tr8.which-flag`.

  Today then serves TR8's KCs, which no family serves now.
- **Accept:** W1b-T03's four checks, for TR8's content test and the KCs `tr8.goodput-denominator`, `tr8.littles-law` and `tr8.tool-defaults`.

#### [=] W1b-T07 · Progress from items and lab checks · S · sonnet · deps: —
- **Goal:** Today, `src/progress/sources.ts` maps only a game run to its KCs, so the map and the module pages show progress from game levels alone, while Today schedules from items (W1-report §5). Make `sources.ts` map `item` and `lab-check` events to their KCs as well, through `packages/play/items/catalog.ts` and `LAB_CHECK_KCS` (`packages/sim/forge/kcs.ts`). ASSESSMENT §9's states that wait on Q-5 stay as they are.
- **Accept:**
  1. A test shows an item event and a lab-check event each moving their KCs in the map's model.
  2. The map and module routes stay inside their gates: the catalog costs those pages nothing (D-059).

#### [=] W1b-T08 · Lab pages hand over the crate · S · sonnet · deps: —
- **Goal:** Each forge lab's page links its kit, `/labs/enginespace-<lab>.zip`, beside "Build the lab's crate", with the kit's size and SHA-256 from `public/labs/manifest.json`. This is W1-T11's follow-up: the live check found no page that links the kits. `hybrid-kv`'s page also shows the slot-baseline readout of TR5a §5, W1-T22's follow-up.
- **Accept:**
  1. An e2e check links every file in the manifest from its lab page, and the linked bytes hash to the manifest's SHA-256.
  2. The page gives the hash as a line a learner can copy to check the download.
  3. A test holds the slot-baseline readout to the sim.

#### [=] W1b-T09 · Titles, stub pages and the live check's other findings · S · sonnet · deps: —
- **Goal:** Fix what the live check of 2026-11-09 found beside the larger tasks:
  - Game and lab pages keep their own `<title>` after the app mounts. Today they fall back to "Game · enginespace" and "Lab · enginespace", which is weak for WCAG 2.4.2.
  - Each stub page says what it will hold and which wave builds it: `/receipts`, `/changes`, `/trace-room`, the ten labs that W2 and W3 build, and `/about` beyond its licences paragraph. `/about`'s description says what the page holds today.
  - `e2e/network.spec.ts`'s policy test passes against GitHub Pages too, which answers `/map` with a 301 to `/map/`. This was the live run's one failure.
  - `/play/pool` loses its moderate `landmark-unique`.
  - If the `THREE.Clock` deprecation warning on the 3D pages comes from this repo's code, it goes. If it comes from a dependency, it stays, and the task names the dependency.
- **Accept:**
  1. A test reads `document.title` after mount on a game page and on a lab page.
  2. The network spec passes against `vite preview` and against a server that redirects directory paths as Pages does.
  3. axe reports no `landmark-unique` on `/play/pool`.
  4. No stub says only "This page is not built yet".

### The scene kit and the games

#### [=] W1b-T10 · Scene kit: haze, the lamp's pool, and paper · L · opus · deps: —
- **Goal:** Carry into the scene kit the recipe that passed review: Back of House's round-2 fix, which draws the lamp as a cone of warm haze with an edgeless pool and no spot light, and dims the tile toward the hood. Apply it to the four 3D scenes: Service, The Tasting, Back of House and The Reach-In. Give the ticket curl, thickness and tooth (W1-report §7.4). Then each surface gets one more finish review.
- **Read:**
  - W1-report §7;
  - DESIGN.md;
  - `.impeccable/surfaces/`;
  - `src/scene/` and each game's 3D scene.
- **Accept:**
  1. Each scene's `verify:bundle` row stays under its frozen 40 KB gate. The task starts by freeing bytes, from the candidates W1's records name: a local merge in place of three's `mergeGeometries`, or a kit split so that a scene counts only the props it draws. If the recipe cannot fit, the task stops and reports with the measurements.
  2. Draw calls and instances stay under A§11.1's gates at every tier (the scene specs).
  3. The 2D views carry the same pool of lamp light, not a radial blur with a white-hot centre.
  4. impeccable's finish reviewer judges each of the four surfaces once more from captures at 1440 and 390 px, and one fix round follows if it asks for one.

#### [=] W1b-T11 · The Inspection's tail gives nothing away · S · sonnet · deps: —
- **Goal:** The Inspection's tail shows max(12, the p99's rank + 6) rows, so the number of rows can tell where the p99 sits (W1-report §12). The count must not depend on the answer.
- **Accept:**
  1. A test over 1,000 seeds shows that the row count is a function of what the learner may see, not of the p99's rank.
  2. The game's walks and `verify:games` pass.

#### [=] W1b-T12 · `verify:games` measures the blind bound and reads the full service · M · sonnet · deps: —
- **Goal:** Today each game's own tests measure ASSESSMENT §4.1's bound, and `verify:games` does not. Make `verify:games` measure it for every graded level, and read the full service's views, which it skips (the half of O-16 that is not the owner's). The bound stays as ASSESSMENT gives it, since O-14 is the owner's.
- **Accept:**
  1. The gate prints each graded level's best blind strategy against its bound, and fails a level over it.
  2. A mutation test makes a level guessable and shows the gate failing.
  3. If a level as built is over the bound, the task stops and reports it with the measurements, and changes neither the level nor the bound.

### CI and the docs

#### [=] W1b-T13 · CI: shard the unit tests, steady the e2e shards, cover the labs' paths · M · sonnet · deps: —
- **Goal:** Four CI fixes (W1-report §12, and PR #2's runs):
  - CI's `tests` job runs the unit suite in shards (`bun test --shard`). On a runner it took 9 to 16 minutes in one job [measured 2026-11-09, PR #2 to #4].
  - The e2e smoke shard that flakes under load waits on state rather than on time.
  - `labs.yml` runs when the files that `verify:labs` reads change: `src/forge`, `packages/sim`, `scripts/labs` and `tests/fixtures/forge`.
  - The nightly sets `ES_HEAVY` and `ES_LAB_TRIALS`.
- **Accept:**
  1. Together the shards run every test file once. A test lists each shard's files and compares their union with the suite.
  2. `tests/ci/workflows.test.ts` holds the new shape, and `deploy.yml`'s build still runs the whole suite.
  3. Every job keeps a numeric timeout.
  4. No test is skipped, narrowed or given retries to pass.

#### [=] W1b-T14 · Type-check `scripts/` and `tests/` · M · sonnet · deps: W1b-T01 to W1b-T13
- **Goal:**
  - `npm run typecheck` covers `scripts/` and `tests/`, which W0 left linted but not type-checked.
  - Each of the seven `as unknown as` casts that give no reason (A21, A22) gets a reason or a real type. One of them passes `null` where a geometry is typed.
- **Accept:**
  1. `tsc -b` checks every file under `scripts/` and `tests/`.
  2. No `any`, `@ts-ignore` or `as unknown as` is added without a reason on its line.
  3. No test changes what it asserts.

#### [=] W1b-T15 · Docs follow what was built · S · sonnet · deps: —
- **Goal:** Make the doc edits of W1-report §12 that are not the owner's:
  - ASSESSMENT §4.6's "[measured once built]" rows take the rates that W1-T26 and W1-T27 measured.
  - DESIGN.md's Ticket loses the head line over the title (§7.2).
  - `content/claims/README.md` gets a rule for a quote that crosses a line break, or the two quotes of W1-report §6 are re-quoted from one line.
  - A§5.6 and A§5.7 follow the benchmark and trace APIs as built, and A§9.2 gives the agent kit's file name.
  - WORLD.md and TR5b stop saying that TR5b "adds an adapter field" to the KV events: both engines already carry it as `lora_name`.
  - The rows of `research/upstream-vllm.md` say which file the Inside vLLM post follows.

  The owner's amendments are not this task's: A§6.1, A§6.6, GAMES.md §3, §5, §8 and §10, and ASSESSMENT §4.1.
- **Accept:** Each edit cites what it follows: a task id, a file at a SHA, or a claim. `verify:content` and `verify:claims` pass.

### Closing W1b

#### [=] W1b-T16 · W1b exit review · S · opus · deps: all of W1b
- **Accept:**
  1. `bun scripts/verify-kc.ts --final` passes. W1-T38's first check then holds, and W1-T38 turns `[=]`.
  2. `docs/waves/W1b-report.md` records the budgets, the gates and the finish reviews, and diffs every gate table against `wave-1`.
  3. Each finding of the live check of 2026-11-09 is closed or carried to a named task.
  4. The coordinator opens the wave PR.

---

## W2: the GPU modules (TR0, TR3, TR4, TR5b, TR7) and the local grader

**Exit criteria:**
- The grader installs with uv or pip.
- A real receipt from the owner's GPU passes browser verification, and its forged variants fail.
- Every GPU module and the GPU parts of TR1, TR6 and TR8 are live.

### The grader and receipts track (may start after W0-T24)

#### [ ] W2-T01 · Schemas for receipts, bundles, challenges and traces; the vectors · M · sonnet · deps: W0-T07
- **Goal:**
  - zod schemas for `receipt@1`, `bundle@1`, the challenge and `trace@1`.
  - `scripts/export-schemas.ts` writes them to `schemas/*.schema.json`.
  - `schemas/vectors/{rng,subseed,challenge,canonical,sha256}.json` are written from TypeScript.
  - `verify:schema` and the TypeScript side of `verify:vectors` (A§9.6, A§9.8, D-030).
- **Accept:**
  1. The export is deterministic, and a drift fails.
  2. The vectors cover seed 0, 0xffffffff, Unicode in canonical JSON, and floats.

#### [ ] W2-T02 · Grader core · L · sonnet · deps: W2-T01
- **Goal:** The `labs/grader` package (`uv_build==0.10.2`, `jsonschema==4.26.0`):
  - a CLI with `doctor` as a stub, `grade`, `receipt verify` and `selftest`;
  - the challenge codec, the RNG port, canonical JSON and hashing;
  - the receipt builder and its validation, and the gzip bundle writer;
  - the lab plug-in interface;
  - `unittest` tests that read `schemas/vectors`.
- **Accept:**
  1. `uv run --project labs/grader python -m unittest` passes on CPU.
  2. Every vector matches.
  3. `enginespace receipt verify` rejects a tampered artifact hash.
  4. `uv lock --check` is clean.

#### [ ] W2-T03 · Fingerprint and privacy · M · sonnet · deps: W2-T02
- **Goal:** `fingerprint.py` per A§9.5: NVML through `nvidia-ml-py` when it is present, an `nvidia-smi` CSV fallback, and torch; for engine labs, the effective engine configuration from the engine's log and configuration dump (runner, graph mode after downgrade, async scheduling, attention backend, `max_num_batched_tokens`, `max_num_seqs`; ASSESSMENT §5.6). Redaction, and `doctor` printing exactly the fields a receipt would record.
- **Accept:**
  1. Tests use recorded `nvidia-smi` output and a fake NVML.
  2. A test seeds a hostname, user name, UUID, serial, absolute path and `HF_TOKEN` into the environment, and none appears in the output.

#### [ ] W2-T04 · Engine environments · M · sonnet · deps: W2-T02, W1-T02
- **Goal:** `labs/envs/{cpu,vllm,sglang,nano-vllm}`, each with:
  - a `pyproject.toml` and `uv.lock`;
  - a hashed `requirements.txt` from `uv export`;
  - a `Dockerfile`.
  `doctor` checks the pins against `course.lock.json`, and the host driver against the pin's requirement: R580 or newer for v0.33.0's CUDA 13 wheels (A§9.2, D-026, D-035).
- **Accept:**
  1. `uv lock --check` passes per environment in `labs.yml`.
  2. `doctor` flags an off-pin vLLM in a fake environment, and an R570 driver against a CUDA 13 pin, in recorded `nvidia-smi` output.
  3. The Dockerfile builds are left to the owner's smoke run (W2-T12).

#### [ ] W2-T05 · References manifest and `fetch` · S · sonnet · deps: W2-T02
- **Goal:** A schema for `labs/references/manifest.json`, and `enginespace fetch` with SHA-256 checks, resume and a generic User-Agent (A§9.7).
- **Accept:**
  1. A hash mismatch aborts and deletes the partial file (local file server).
  2. The User-Agent is `enginespace-grader/<version>` (test).

#### [ ] W2-T06 · Challenge issuing and `/receipts` · M · sonnet · deps: W0-T11, W2-T01
- **Goal:** `/receipts`: choose a lab and stage, issue a token (a `challenge` event), copy it, list receipts, and open a receipt's detail at `#<sha256>` (A§8.4).
- **Accept:**
  1. Tokens decode with the shared codec.
  2. Expired and used tokens are shown as such.
  3. The page passes a keyboard walk and axe.

#### [ ] W2-T07 · Receipt worker and import · M · sonnet · deps: W2-T06
- **Goal:** `receipt.worker` runs A§8.5's rules 1-6: caps (`DecompressionStream` with a byte counter), zod, artifact hashes, binding, grader identity against the published list, and pins. Import works by drop or by file picker, and the parsed receipt and its report are stored.
- **Accept:**
  1. Oversized and zip-bomb fixtures abort with a message.
  2. A tampered hash fails integrity.
  3. A reused token fails binding.
  4. An unknown grader build gives `gpu-unverified`.
- **Open check (second review of W2's rest work, note 7, first half):** `src/receipts/keep.ts` (near line 54) freezes the verdict into the credited receipt event at import. A verdict is worked out when it is read (A§8.5 rule 10), so the event has to keep the receipt and its report and not the verdict. The receipts page reads it, so the redesign's rebuild of that page takes this with it.

#### [ ] W2-T08 · Verification rules and the forged bestiary · L · sonnet · deps: W1-T08, W1-T31, W2-T07, W2-T09
- **Goal:** `packages/verify` implements A§8.5's rules 7-10: re-checks, recomputation, physics floors and the verdict, with bounds printed. A generator builds forgeries from honest fixtures: synthetic ones until W2-T12, then the owner's.
- **Accept:**
  1. Honest synthetic bundles pass.
  2. Each forgery fails its named check with the bound printed:
     - an edited p99;
     - a closed-loop log presented as open loop;
     - a trace faster than its physics floor;
     - an attribution that does not partition its step window (ASSESSMENT T7);
     - a replayed receipt;
     - an unknown grader.
- **Open check (second review of W2's rest work, note 7, second half):** `packages/verify/checks.ts` (near line 128): a claim in `performance.claimed` under a key that names no evidence artifact is shown as recomputed. It has to be shown as a claim with nothing behind it, or fail. The receipts page shows it, so the redesign's rebuild of that page takes this with it.

#### [ ] W2-T09 · Hardware atlas claims · M · sonnet · deps: W0-T08
- **Goal:** `content/claims/hardware/*.yaml` for the GPUs learners rent or own: RTX 4090, RTX 5090, L4, L40S, A100 40/80 GB, H100 PCIe and SXM, H200 (a Modal `gpu="H100"` request may land on one, sglang C4), and RTX PRO 6000 where it is rentable. Each records memory bandwidth, dense peak by precision and capacity. The physics floors use them, keyed by the device name the fingerprint reports.
- **Accept:**
  1. `verify:claims` passes.
  2. Every value quotes the vendor's datasheet, with an accessed date.
  3. Derived values recompute.

#### [ ] W2-T10 · Kit packer, grader wheel and manifest · S · sonnet · deps: W1-T11, W2-T02, W2-T04
- **Goal:** Pack the GPU kit zip (grader, environments, GPU labs, runners, references manifest) and the grader wheel into `public/labs/` with a SHA-256 manifest. Publish the list of grader versions and their `sourceSha256` values for the site (A§9.3).
- **Accept:**
  1. The zips are reproducible.
  2. The site's published-grader list matches the wheel's computed source hash.

#### [ ] W2-T11 · Rented-GPU runners · M · sonnet · deps: W2-T04
- **Goal:** `labs/runners/{runpod.md,lambda.md,modal_app.py}`. Check that each Dockerfile's base is an official image at the pinned tag, and record the result as a dated claim.
- **Accept:**
  1. The docs can be followed by copy and paste.
  2. `modal_app.py` runs a dry-run `selftest` with stubbed credentials (unit test).
  3. The image-tag claims carry [measured] with dates.

#### [ ] W2-T12 · Owner: GPU smoke and receipt fixtures · M · owner · deps: W2-T04, W2-T05, W2-T08, at least one GPU lab
- **Goal:** Run `enginespace selftest --gpu` and one lab per environment on a 4090 and an H100. Commit the bundles to `tests/fixtures/receipts/`, pinned by SHA-256 and dated.
- **Accept:**
  1. The fixtures pass browser verification.
  2. Forgeries generated from them fail.

### TR0: PyTorch and Triton reading

#### [ ] W2-T13 · Sim: the tensor model · M · sonnet · deps: W0-T12
- **Goal:** A§5.8's tensor rules and grid coverage.
- **Accept:**
  1. The rules agree with PyTorch on a committed fixture set, generated once with CPU torch, with the torch version recorded.
  2. Goldens reproduce.
- **Open check (second review of W2's rest work, note 9):** `tests/fixtures/tensor/torch-vectors.json` was generated by torch 2.14.0+cu130 run on the CPU, and not by the `cpu` environment's own build. Sync `labs/envs/cpu` and regenerate the vectors from it, with that build recorded.

#### [ ] W2-T14 · Tensor views (`shape-shifter`): session, 2D view and mirror · M · sonnet · deps: W0-T14, W2-T13
- **Goal:** GAMES.md §4's levels: `views`, `stride-zero` and `three-d` for practice, and `fewest` and `grid` graded. The game's title is Tensor views and its role line is "You plan the reshape." The 2D view is the shape and stride table beside the buffer strip, in the instrument frame. It is built in the instrument frame (REDESIGN.md §2.6) and supplies the frame's five exports: `Diagram2D`, `DockView`, `parts`, `moments` and `firstMove`, with the role line and the goal line in `packages/play/<game>/copy.ts`, where the engine's term is the only name (D-063).
- **Read:** REDESIGN.md §2.6 and §3.5; GAMES.md §2.6 and §4.
- **Accept:**
  1. The game can be completed by keyboard.
  2. The fewest-copies bar matches the model's optimum.
  3. `verify:games` passes.
  4. The frame's five exports exist, each level has a goal line with its number, and the first run names the parts before it asks for a guess.

#### [ ] W2-T15 · Tensor views (`shape-shifter`): the 3D scene · L · sonnet · deps: W0-T15, W2-T14
- **Goal:** The 3D view of Tensor views: a block of cells over its buffer, with a stride-order thread through the cells, drawn from the scene kit's primitives with no props chunk. The thread re-weaves on a view, cells move on a copy, and program tiles sit over the block (A§6.1). The scene sits in the instrument frame and takes its names from the `parts` table.
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. Under reduced motion, a copy shows its final layout immediately.
  3. The scene imports nothing from `src/scene/props`, and no literal colour or font name sits outside `src/design`.

#### [ ] W2-T16 · Build the Qwen3-0.6B forward pass on CPU (TR0 lab) · L · sonnet · deps: W2-T02, W2-T04
- **Goal:**
  - `labs/gpu/tr0-forward`: the starter for the learner's PyTorch forward over Hugging Face weights.
  - The grader's lab module: an HF fp32 reference on the same CPU, a maximum absolute difference of 1e-3, and argmax ids at the challenge's positions.
  - Pin the Qwen3-0.6B revision in `course.lock.json`.
  - The browser re-checks against the bank once W2-T17 lands.
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. The reference solution passes in the nightly `labs.yml` job (CPU).
  2. A perturbed solution, with a wrong RMSNorm epsilon, fails.
  3. The lab's page is the numbered procedure, and its title and check labels carry no kitchen word.

#### [ ] W2-T17 · Owner: the TR0 argmax bank · S · owner · deps: W2-T16
- **Goal:** Produce the bank of argmax ids at positions whose margin passes the threshold, using HF fp32 on CPU. Publish it under `public/references/tr0/` with its SHA-256 and a manifest entry.
- **Accept:** The browser re-check passes on the reference solution's receipt.

#### [ ] W2-T18 · TR0 content · L · sonnet · deps: W2-T14, W2-T15, W2-T16
- **Goal:** TR0's module and lessons: PyTorch for the Rust-first learner, and reading Triton with `TRITON_INTERPRET=1`. Triton's program model is recapped from Kernels' KN4 in under an hour (catalog §4). Written to the authoring rules of REDESIGN.md §2.5 (and `content/README.md`) from the start: an opener chosen by rule 1, guesses that each get a reveal, a Test that closes the file, and engine terms only (`src/copy/terms.ts`). Each new lesson adds its row to the openers table, and `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts` hold it.
- **Read:** REDESIGN.md §2.5 and §2.7; `content/README.md`.
- **Accept:** The checks of W1-T15 pass, and each lesson has its row in the openers table and passes the openers and vocabulary tests.

### TR3: profile a real engine

#### [ ] W2-T19 · Grader: trace export · L · sonnet · deps: W2-T02, W1-T08
- **Goal:** Convert torch-profiler Chrome JSON and nsys SQLite exports into `trace@1`, keeping correlation ids. Captures use `--cuda-graph-trace=node`, so graph replays show their kernels (vllm P1). The nsys table names are [unverified]: check them against the pinned nsys (2026.5.1, proposed) and record the version. Small fixture traces are committed.
- **Accept:**
  1. The fixtures round-trip.
  2. TypeScript's `traceChecks` passes on the exported fixtures (a cross-language test).

#### [ ] W2-T20 · Traces, and Trace attribution (`gap-hunt`) · L · sonnet · deps: W1-T09, W1-T08
- **Goal:**
  - `/trace-room`, on a page labelled Traces: lists pinned and synthetic traces, each with its card. It is reached from Games and from TR3.
  - Trace attribution (`gap-hunt`, 2D, in the instrument frame, built on `src/trace`): find the gap, mark the spans, name the cause, with GAMES.md §6's levels (`read`, `gap`, `attribute`, `graphs`, `pinned`, `yours`) and its list mode for phones, which ASSESSMENT §4.3 grades the same. The span categories use the one colour code, and the game supplies the frame's five exports (REDESIGN.md §2.6), with the role line "You attribute the gap."
  - Runs are graded on fresh synthetic seeds, and on the pinned traces against the owner's annotations once W2-T21 lands.
- **Accept:**
  1. The game can be completed by keyboard.
  2. `verify:games` passes.
  3. Synthetic traces carry their label.
  4. At 360 px, a graded `attribute` case can be completed in list mode (e2e).
- **Before you write (2026-11-18):** one case needs a second GPU stream from the trace generator, so that an empty stretch on one stream is not read as an idle GPU, and the `attribute` level's goal line waits for the owner's word on "bubble" against "CPU gap". See `curriculum/TR3-profile-a-real-engine.md`, "Before you write", (a) and (e).

#### [ ] W2-T21 · Owner: capture 6-10 reference traces · M · owner · deps: W2-T04, W2-T19
- **Goal:** Per O-5:
  - Run the pinned vLLM (and SGLang) on the agreed workloads with the profiler and nsys.
  - Export the traces with the grader, and annotate the gaps.
  - Publish them with SHA-256 and dates.
- **Accept:**
  1. The traces pass `traceChecks`.
  2. The annotations are reviewed.
  3. The manifest is updated.

#### [ ] W2-T22 · Fit the host card · M · sonnet · deps: W2-T21
- **Goal:** Fit the HostCard presets to the owner's traces as per-phase CPU µs medians with ranges. Update the claims, and make the card say "fitted on <traces>, <date>" (A§5.3).
- **Accept:**
  1. A script reproduces the fit.
  2. The step loop's goldens are regenerated with `--write` and reviewed in the PR.

#### [ ] W2-T23 · Build an attribution report from a vLLM profile (TR3 lab) · M · sonnet · deps: W2-T08, W2-T19
- **Goal:** `labs/gpu/tr3-profile`:
  - It runs the pinned vLLM on the challenge's workload with profiling, and exports the trace. The profiling commands come from the pin's docs: `--profiler-config` for torch, and `/start_profile` with `delay_iterations` and `max_iterations` to capture a chosen window (vllm P1).
  - The receipt records which runner actually ran (MRV2 or a fallback to MRV1), from the engine's log line (vllm M2).
  - The learner writes a structured attribution report in JSON.
  - The grader checks correctness by teacher-forced agreement.
  - The browser recomputes the attribution and the floors.
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A forged trace that is too fast fails its floor.
  3. The lab's page is the numbered procedure, with the titles and labels above.

#### [ ] W2-T24 · TR3 content · L · sonnet · deps: W2-T20, W2-T23
- **Goal:** TR3's module and lessons: `--profile`, Perfetto, and nsys graph traces. Written to the authoring rules of REDESIGN.md §2.5 (and `content/README.md`) from the start: an opener chosen by rule 1, guesses that each get a reveal, a Test that closes the file, and engine terms only (`src/copy/terms.ts`). Each new lesson adds its row to the openers table, and `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts` hold it.
- **Accept:** The checks of W1-T15 pass, and each lesson has its row in the openers table and passes the openers and vocabulary tests.
- **Before you write (2026-11-18):** four rules for reading a GPU timeline, each at its lesson, the place of rule 11's form, three pointers and three questions for the owner. See `curriculum/TR3-profile-a-real-engine.md`, "Before you write", (a) to (f).

### TR4: backends as a consumer

#### [ ] W2-T25 · Sim: backend rules, and Backend dispatch (`dispatch`) · M · sonnet · deps: W1-T01, W0-T14
- **Goal:** `packages/sim/backends` as an ordered rule table from pinned claims, and Backend dispatch (2D): a rule table and predict-then-reveal questions on fresh seeds, in the instrument frame, with the role line "You pick the backend." It is built in the instrument frame (REDESIGN.md §2.6) and supplies the frame's five exports: `Diagram2D`, `DockView`, `parts`, `moments` and `firstMove`, with the role line and the goal line in `packages/play/<game>/copy.ts`, where the engine's term is the only name (D-063).
- **Accept:**
  1. Every rule cites a claim.
  2. `verify:items` and `verify:games` pass.
  3. The frame's five exports exist, and each level has a goal line with its number.

#### [ ] W2-T26 · Build an attention backend sweep (TR4 lab) · M · sonnet · deps: W2-T08, W2-T04
- **Goal:** Sweep the attention backends that the learner's GPU supports at the pin.
  - **Correctness:** each backend matches fp32 SDPA within tolerance on seeded inputs.
  - **Performance:** raw timings over repeats. The browser checks the floors and the intervals.
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A sweep with a timing below its floor fails.
- **Before you write (2026-11-18):** four timing practices (a drift check for warm-up, a stated cache policy tested against the floor, alternating backend order, tolerances per backend), the sections of `docs/ASSESSMENT.md` they touch, what "Blackwell" covers, and questions for the owner. See `curriculum/TR4-backends-as-a-consumer.md`, "Before you write".

#### [ ] W2-T27 · TR4 content · M · sonnet · deps: W2-T25, W2-T26
- **Goal:** TR4's module and lessons: FA2, FA3 and FA4, FlashInfer and FlashMLA, read as a consumer. FlashMLA's hardware list carries a 60-day TTL (catalog §3.5). Written to the authoring rules of REDESIGN.md §2.5 (and `content/README.md`) from the start: an opener chosen by rule 1, guesses that each get a reveal, a Test that closes the file, and engine terms only (`src/copy/terms.ts`). Each new lesson adds its row to the openers table, and `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts` hold it.
- **Accept:** The checks of W1-T15 pass, and each lesson has its row in the openers table and passes the openers and vocabulary tests.
- **Before you write (2026-11-18):** lesson 3's three-row table and one item, with what each source does and does not show, and a word kept apart. See `curriculum/TR4-backends-as-a-consumer.md`, "Before you write".

### TR5b: offload, connector and events

#### [ ] W2-T28 · Sim: tiers, the connector contract and `kv-events@1` · M · sonnet · deps: W1-T21
- **Goal:** `packages/sim/tiers` per A§5.8, with a reference consumer (D-034).
- **Accept:**
  1. The consumer's view equals the truth after every op over 200 seeds.
  2. A publisher that drops a `BlockRemoved` is caught.

#### [ ] W2-T29 · Build a KV events publisher (lab `kv-publisher`) · L · sonnet · deps: W1-T10, W2-T28
- **Goal:** `labs/forge/kv-publisher`. Host conformance checks the consumer's view after every event, the ordering, and reset semantics. Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. The reference passes.
  2. Each bestiary member (a dropped event, events out of order, a missing `AllBlocksCleared`) fails.
  3. The lab's page is the numbered procedure, and `verify:labs` still holds the two sides together.

#### [ ] W2-T30 · KV offload (`switchyard`): session, 2D view and mirror · M · sonnet · deps: W0-T14, W2-T28
- **Goal:** `packages/play/switchyard`, titled KV offload, with the role line "You publish the events." The learner publishes each move, and the consumer's board is checked after every event. The 2D view is lanes per tier, in the instrument frame. It is built in the instrument frame (REDESIGN.md §2.6) and supplies the frame's five exports: `Diagram2D`, `DockView`, `parts`, `moments` and `firstMove`, with the role line and the goal line in `packages/play/<game>/copy.ts`, where the engine's term is the only name (D-063).
- **Accept:**
  1. The game can be completed by keyboard.
  2. `verify:games` passes.
  3. The frame's five exports exist, and each level has a goal line with its number.

#### [ ] W2-T31 · KV offload (`switchyard`): the 3D scene · L · sonnet · deps: W0-T15, W2-T30
- **Goal:** KV offload's 3D view: three decks, one per tier, with pages in transit drawn as dashed outlines, event signals, and the consumer's board (A§6.1). It is built from the scene kit's primitives, with no props chunk and no carrier prop.
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. The scene imports nothing from `src/scene/props`, and takes its names from the `parts` table.

#### [ ] W2-T32 · Build a toy connector in vLLM (TR5b lab) · L · sonnet · deps: W2-T08, W2-T04, W2-T28
- **Goal:**
  - `labs/gpu/tr5b-connector`: a connector class registered through the pinned version's extension point, with a per-pin shim. It starts from upstream's `ExampleConnector`, must subclass `SupportsHMA` so the hybrid KV manager stays on, and must pass upstream's connector unit tests at the pin (vllm K3, K6, K9).
  - **The grader:** on shared-prefix prompts, run A saves and run B loads through the kit's probe store; every block's SHA-256 at load equals its SHA-256 at save, and run B's outputs agree with a no-connector baseline by teacher-forced agreement (ASSESSMENT §5.7, §5.9).
  - **The browser:** it re-checks the probe log's hashes and loaded-token counts, and replays the event log through `tiers`.
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A fixture with a corrupted event log fails conformance.

#### [ ] W2-T33 · TR5b content · M · sonnet · deps: W2-T29, W2-T30, W2-T31, W2-T32
- **Goal:** TR5b's module and lessons: native offload, the engine side of the connector contract, and the event publisher. P/D sizing and transport are pointed to The Wire. Written to the authoring rules of REDESIGN.md §2.5 (and `content/README.md`) from the start: an opener chosen by rule 1, guesses that each get a reveal, a Test that closes the file, and engine terms only (`src/copy/terms.ts`). Each new lesson adds its row to the openers table, and `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts` hold it.
- **Accept:** The checks of W1-T15 pass, and each lesson has its row in the openers table and passes the openers and vocabulary tests.

### The GPU parts of TR1, TR6 and TR8 (D-039)

#### [ ] W2-T34 · Build an instrumented nano-vllm fork (TR1 lab) · M · sonnet · deps: W2-T08, W2-T04, W1-T19
- **Goal:** The fork instruments the lifecycle stages and emits a trace.
  - The grader checks correctness by teacher-forced agreement, and that instrumentation changes nothing by tie-aware identity with the plain run (ASSESSMENT §5.7, D-046).
  - The browser checks that the stage order matches the learner's map, and runs `traceChecks`.
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A fixture with stages out of order fails.

#### [ ] W2-T35 · Build a speculative-decoding proposer (TR6 lab) · L · sonnet · deps: W2-T08, W2-T04, W1-T26
- **Goal:** An n-gram or suffix proposer, written through the pinned extension point (`method="custom_class"`). At v0.33.0 that path falls back to MRV1, and the receipt records the runner used (vllm S4).
  - The grader requires greedy outputs with and without speculation, on the same machine, to pass ASSESSMENT §5.7's tie-aware identity (D-046), and collects acceptance statistics from the logs.
  - The browser recomputes the acceptance and checks the speedup claim against the step-time evidence, with both sides on the same runner and async setting (TR6 §5).
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A fixture whose speculative output diverges from the plain one at a position that is not a near tie fails.

#### [ ] W2-T36 · Build a BurstGPT open-loop replay (TR8 lab) · L · sonnet · deps: W2-T08, W2-T04, W1-T31
- **Goal:**
  - The grader's own open-loop client runs the challenge's seeded schedule against the pinned vLLM server and keeps per-request records.
  - The browser recomputes the percentiles, the interval, goodput and arrival adherence.
  - If the learner also runs `vllm bench serve --save-result --save-detailed`, the browser checks that tool's identities as well (vllm B5).
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A closed-loop log presented as open loop fails.
- **Open check (second review of W2's rest work, note 1):** `bench-log@1` must carry the name of the GPU that ran it, and P3 (`packages/verify/floors.ts`) must make its basis with `gpusNamed` from that name. Until then P3's ceiling follows the receipt's own GPU list, so renaming every listed GPU raises it (four H100 give 15,314 tokens/s, and the same list renamed H200 gives 21,942 [measured 2026-11, build ff47e8f]), and a log at 19,422 tokens/s fails P3 under the first and passes under the second.

### TR7: contribute honestly

#### [ ] W2-T37 · TR7 content and the reproduction targets · M · sonnet · deps: W1-T01
- **Goal:**
  - TR7's module and lessons: DCO, RFCs, and each project's AI-disclosure rules. Quote vLLM's "Do not submit 'pure agent' PRs" with an accessed date. Replace the catalog's "median PR cycle 1.04 d", which has no source and does not reproduce, with the measured figures (vllm C5: median 2.12 d overall, 0.85 d for members and 4.2 d for others; n = 1,005 PRs merged 2026-10-19 to 2026-11-01 [measured]).
  - `content/claims/tr7-targets.yaml`: 5 to 8 published numbers with pinned configurations, for the owner to review. Every target must be reproducible on a 4090 or within 6-8 H100 hours. Results from GB200 machines, such as RFC #40846 and the MRV2 blog's numbers, do not qualify (vllm TR7 notes).
  - The lessons are written to the authoring rules of REDESIGN.md §2.5 (and `content/README.md`) from the start: an opener chosen by rule 1, guesses that each get a reveal, a Test that closes the file, and engine terms only (`src/copy/terms.ts`). Each new lesson adds its row to the openers table, and `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts` hold it.
- **Accept:**
  1. The checks of W1-T15 pass.
  2. Every target cites its source and its configuration.
  3. Each lesson has its row in the openers table and passes the openers and vocabulary tests.

#### [ ] W2-T38 · Build a reproduction of a published number (TR7 lab) · M · sonnet · deps: W2-T08, W2-T37
- **Goal:** `labs/gpu/tr7-reproduce` runs a target's configuration. The receipt carries the reproduction's delta with an interval. Credit goes to the consistency of the reproduction, not to matching the number. An issue-draft template is generated, and the learner files it themselves. Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. A synthetic fixture passes.
  2. A delta whose interval does not follow from the raw records fails.

### Lesson blocks, predictions and readers that W1 left waiting

#### [ ] W2-T42 · Lesson blocks: the trace block, "In vLLM today" and the Build row · M · sonnet · deps: W1-T07, W1-T09
- **Goal:** Three kinds of block still print a ticket that names this task (`PENDING` in `src/content/render/model.ts`), because no task built them and no lesson uses them yet. W1b-T02 found that none of W1's or W2's tasks did.
  - The `trace` block (A§4.3) opens the trace viewer (`src/trace/TraceView.tsx`, W1-T09) on its pinned or seeded synthetic trace, with its span tasks, and writes `trace-mark` events with the lesson's `rev`.
  - The In-production card (`card` kind `in-production`, an id that does not change) renders as "In vLLM today" in the debrief. It shows the flags and source lines of the pinned engines that the lesson's lever stands for, each a claim with its source and its tag (GAMES.md §2.6 rule 2, §3.2 "Compose and In production").
  - The Build-this card (kind `build-this`, an id that does not change) renders as the Build row in Keep: it names the lab that the lesson leads to, with its stages, and links to it.
  - The trace block is a Run-style block in the lesson template (REDESIGN.md §2.5), and claims are numbered marks, not chips.

  The compiler reads the two cards' files (`content/cards/<id>.md`, A§5.9), which `scripts/content/cards.ts` refuses today. The renderer draws them, and `PENDING` loses its three entries.
- **Read:** A§4.3, A§5.9, A§7.2; GAMES.md §2.6 and §3.2; `src/trace/`; `src/content/render/Blocks.tsx`; `scripts/content/cards.ts`.
- **Files:** `packages/schema` (the card kinds), `scripts/content/cards.ts`, `content/cards/`, `src/content/render/`, tests.
- **Accept:**
  1. A lesson's `trace` block opens the viewer on its trace, and a mark made there is a `trace-mark` event (an e2e walk, by keys).
  2. A card of each of the two kinds compiles, is drawn, and cites its claims as marks. `verify:claims` and `verify:content` pass.
  3. `PENDING` names no task for the three, and `tests/content/pending.test.ts` passes.

#### [ ] W2-T43 · Predictions that no run answers yet · M · sonnet · deps: W1b-T02
- **Goal:** W1b-T02 built the lesson's prediction box. It reveals a prediction against what the pure model reads from the run of the game block that follows it (A§1, I3; ASSESSMENT §4.7), and 22 of the 39 predictions have no such run. The question carries numbers of its own, round and made up, that no level of its game holds; or it asks for a measured fact about an engine's source; or its lesson has no game. Each is a row of `PLAN` in `packages/play/predictions/plan.ts` with its reason, and its ticket says that its reveal waits on this task. Give each a run to read, by the cheapest of three ways, and record the choice for the set in DECISIONS:
  1. The lesson's game takes the question's numbers: the level, or a variant of it that the lesson's block names, plays the scenario of the prompt, so that the run answers it (GAMES.md §2.2: each level's opening prediction is generated by the game's model).
  2. The prompt is rewritten around the numbers of the level that the lesson plays, and the figures of `tests/content/tr*-demos.ts` follow it.
  3. The pure model computes the answer on the numbers of the prompt itself. That relaxes the rule that a reference is read from a run, so it is the owner's call, and the record says so.

  A lesson with no game (`tr2.l7`) takes one, or its prediction becomes an item.
- **Read:** ASSESSMENT §4.7; A§1 (I3), A§4.3; `packages/play/predictions/`; `tests/play/predictions.test.ts`; the predictions of `PLAN`'s waiting rows.
- **Files:** `packages/play/predictions/` (the readings), the games' levels where way 1 is chosen, `content/modules` where way 2 is, tests.
- **Accept:**
  1. `PLAN` has no waiting row left, or each one that is left has a record in DECISIONS that says why.
  2. `tests/play/predictions.test.ts` plays the game of each row it adds on a seed, and holds the reading to the lesson's own figure.

- **Closed by R-T09 (wave R).** The owner's call under the third way (D-067) was taken: 18 predictions are revealed after their run (the 17 that a run answered, and TR2 lesson 1's, reworded onto the ticks of `first-3-gap` by the second way) and 21 at commit, from the question's own numbers or from the claim it is about. `PLAN` has no waiting row left, so the first check holds with no record to write, and `tests/play/predictions.test.ts` plays each run it holds on a seed and holds the reading to the lesson's own figure, and each at-commit answer to the same figure.

#### [ ] W2-T44 · Readers of the prediction event: Review's rescheduling and the calibration view on Progress · S · sonnet · deps: W1b-T02
- **Goal:** W1b-T02's box writes a `predict` event at each reveal (A§7.2: the value and the truth). The module page's loop and the course map's practised KCs read it (`src/progress`), and so does the Evidence page's count of events by kind. Two readers of it do not exist yet:
  - Today (`src/items/today/kcs.ts`) maps no `predict:` ref to a KC, so a prediction reschedules no idea. ASSESSMENT §4.7 says that it may reschedule an idea that is earned, and never earns one. Give Review (`/today`) the compiled map's refs for them, inside its gate, so Review reschedules from predictions as specified. The readers take both reveal kinds, a reveal after the run and a reveal at commit (R-T09).
  - The calibration view on Progress (`/evidence`; ASSESSMENT §4.2 and §4.7), as rows in words before counts: how often each confidence tap of an item or a prediction (guess, think so, sure) was right, derived from the ledger when the page is read, stored nowhere, and shown with the count it rests on, in words before the count.
- **Read:** ASSESSMENT §3.3, §4.2, §4.7; A§3.1, A§7.2; `src/items/today/`, `src/progress/`, `src/evidence/`.
- **Files:** `src/items/today/kcs.ts`, `src/evidence/` (a derivation and its view), `src/pages/Evidence.tsx`, tests.
- **Accept:**
  1. A test shows a prediction rescheduling an idea that is earned and earning none that is not, with the event that the box writes.
  2. The calibration is derived from events and moves no credit, completion or KC state (a test), and the page reads at 360 px and by keys, with no serious or critical axe violation.

### Closing W2

#### [ ] W2-T39 · End-to-end coverage for receipts and W2 routes · M · sonnet · deps: W2-T12 and every W2 module task
- **Goal:** Import, end to end, for every fixture, honest and forged. axe and keyboard walks on every W2 route and game. It extends `e2e/first-visit.spec.ts`'s per-screen checks (REDESIGN.md §5.2) to every W2 route and game, so that each one names its way on, its goal line and its parts.
- **Accept:** CI smoke and nightly pass, and the per-screen checks of `e2e/first-visit.spec.ts` cover every W2 route and game.

#### [ ] W2-T40 · Owner: screen-reader pass · S · owner · deps: W2-T39
- **Accept:** Notes are in `docs/waves/W2-report.md`, and issues are filed.

#### [ ] W2-T41 · W2 exit review · S · opus · deps: all of W2
- **Accept:**
  1. The report covers the verification threat model (A§8.6) against the bestiary's results, the budgets and the gates.
  2. O-10 is answered or carried over.
  3. The wave PR is open.

---

## WR: the redesign, "You Are Here" (wave R)

**Why there is a wave R.** On 2026-11-15 the owner found the site confusing and no delight to use: the kitchen's names and metaphors hide the engine's concepts, and it is unclear what to do next and why. [waves/WR-diagnosis.md](waves/WR-diagnosis.md) is the audit, [REDESIGN.md](REDESIGN.md) is the brief that answers it, and D-062 to D-068 are its records. This section carries every task of `docs/waves/wr-tasks.json` (R-T01 to R-T50) in the tracker's format, so that a task can be worked from here alone. If the two ever differ, `wr-tasks.json` holds.

**Branch and order.** The wave runs on `wave-r`, stacked on `wave-2`, in six stages (D-068). The look gate, R-T20, closes stage 2: the owner compares build A (stage 1, under The Pass) with build B (stage 2, under Data Book), and no agent answers its questions or picks a build. Stage 3 does not wait for the gate. Stage 4 starts when the owner answers at the gate or when every stage 3 task has merged, whichever comes first, and nothing of the kitchen is deleted before then (D-062). **The owner answered on 2026-11-16: Data Book, in the words "data book for sure" (D-062, `waves/WR-look.md` section 6).** The wave goes on from build B and no task of stage 4 is dropped. W2's grader and receipts track (W2-T01 to W2-T12) continues alongside; W2's module, game and content tasks start after R-T15, and R-T13 rewrites them for the new design.

**Models** (D-068, a note on D-036): 16 tasks go to opus, 32 to sonnet and 2 to haiku. Sizes: 8 S, 28 M and 14 L. A task of size L writes its plan first.

**Exit criteria:**
- Every gate of REDESIGN §5.3 passes unchanged, and every gate table of `wave-r` holds `wave-2`'s values or stricter: no gate, budget, threshold or tolerance is raised or added.
- The first-visit walk and the per-screen checks of REDESIGN §5.1 and §5.2 pass (R-T47).
- The owner has answered at the look gate, or stage 3 has merged on the default (D-062). Met: the owner chose Data Book on 2026-11-16.
- The human cold test of REDESIGN §5.5 waits for the owner before the wave merges to `main`, and agents never simulate it.

### Stage 0: records and safety

#### [ ] R-T01 · Records, the agent brief and the direction contract · S · opus · deps: —
- **Goal:** Stage 0. Write the records the redesign stands on, so that every later task can cite them. D-062: the visual world is Data Book and replaces The Pass (supersedes D-047; proposed, and decided by the owner at the look gate, R-T20). D-063: the engine's term is the only name (supersedes D-049; carries the brief's section 2.7). D-064: three faces and the new surface values (supersedes D-050's faces, keeps its one light scheme and no dark scheme). D-065: a lesson is up to four sections (Run, Read, Test, Keep) with one of three openers, and every game sits in one instrument frame; phones open the front page in 2D; Request path has no 3D scene (notes on D-004, D-005 and O-11). D-066: a pointer, a bookmark and an intro flag in localStorage (extends D-051, keeps D-038). D-067: a prediction may be revealed at commit, from the question's own numbers or from a claim (the owner's call under W2-T43's third way). D-068: wave R's process: six stages, the look gate, and which tasks run on opus and haiku (a note on D-036). Rewrite rule 9 of the agent brief in TRACKER and AGENTS.md, add a wave R section to TRACKER from tasks.json, and replace the direction contract in the front page's surface brief with Data Book's.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `docs/DECISIONS.md`, `docs/TRACKER.md`, `AGENTS.md`, `.impeccable/surfaces/src-front-frontpage-tsx.md`, `tests/docs/repo-docs.test.ts`, `tests/design/contract.test.ts`
- **Accept:**
  1. Each record has Status, Decision, Context, Alternatives, Consequences and Revisit when. D-047, D-049 and D-050 are marked superseded with a pointer, and none is deleted.
  2. The index at the top of DECISIONS.md lists D-062 to D-068, and the Status paragraph says which are the owner's to confirm: D-062, D-066, D-067 and D-068, and the cut of one 3D game in D-065.
  3. D-062 says that the kitchen is deleted only after the look gate, and what the wave does if the owner chooses The Pass there (the brief's section 6).
  4. Rule 9 reads the same, word for word, in TRACKER and AGENTS.md, and tests/docs/repo-docs.test.ts passes.
  5. tests/design/contract.test.ts passes: the contract's block labels appear in no file under src/ or public/.
  6. TRACKER has a wave R section with all 50 tasks in their six stages, each with its size, model and deps as in tasks.json.
  7. No file under src/ or packages/ changes.

#### [ ] R-T02 · Display copy leaves the session state · M · sonnet · deps: —
- **Goal:** Stage 0. Each game's state embeds its level object, and stateHash covers the whole state (packages/play/replay.ts). So rewording a display string today moves golden hashes although no rule changed. Move every display string out of the state into a new pure table, packages/play/<game>/copy.ts, keyed by level id and stage id and holding today's strings unchanged. The paths, found by walking every level's state: level.title and level.prompt in all five games; level.predict.ask and level.predict.unit in the pool; level.stages[].title, .prompt, .prediction.question, .prediction.unit and .prediction.options[] in the step loop's full levels. Views read the table by id. Enum values and ids that happen to be words (a fire's outcome 'plate', a page's 'free') stay: they are ids. Regenerate the golden hashes once, in this task alone, with a proof that nothing else moved. This merges before any task rewords a level.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/play/loop/levels.ts`, `packages/play/loop/full/levels.ts`, `packages/play/loop/full/close.ts`, `packages/play/loop/full/types.ts`, `packages/play/loop/full/session.ts`, `packages/play/pool/levels.ts`, `packages/play/verifier/levels.ts`, `packages/play/engine-floor/levels.ts`, `packages/play/broken-bench/levels.ts`, `packages/play/*/session.ts`, `packages/play/*/types.ts`, `packages/play/*/copy.ts`, `src/games/**`, `tests/play/*-session.test.ts`, `tests/play/*-levels.test.ts`, `tests/play/state-copy.test.ts`
- **Accept:**
  1. tests/play/state-copy.test.ts walks the state of every level of every built game, at its start and at every state along its reference run, and finds no string outside a closed list of ids and enum values that the test names.
  2. Before anything is moved, the PR shows that no action carries display text: a prediction's commit carries a number or an option's id or index, never the option's words. If one does, the words stay as that id and a display label is added beside it.
  3. The PR carries the output of an equivalence script: for every golden, the hash of the old state with exactly the listed paths removed equals the new hash.
  4. The only expected values that change are the golden tables in tests/play/pool-session.test.ts and tests/play/engine-floor-session.test.ts and any other golden the script finds, and the PR lists each old and new value.
  5. Every screen shows the same words as before: the view and e2e tests pass with no change to an expected string.
  6. verify:games and verify:determinism pass, and the stored-run fixtures replay to the same grades.
  7. packages/play still compiles under tsconfig.pure.json, and no id, action or ledger ref changes.

#### [ ] R-T03 · The budget ledger, and the lane spike with its go or stop · M · opus · deps: —
- **Goal:** Stage 0. Measure before anything is built. First, the budget ledger: build wave-2 as it stands and record every route class against its gate (entry, the front page's first-paint JS and CSS, a module page, a lesson, each game route, Review, each scene's closure with the props chunk inside it, three-vendor, postfx). Then the spike: write the pure lane layout for the step loop's demo levels (a waiting-queue row, one CPU row, one GPU row per batch slot, the now cursor, idle boxes) from the loop's view state, starting from src/scene/specimen-layout.ts. On a scratch branch that is not merged, stand a front-page skeleton on it (the static poster, the instrument's DOM, no kitchen drawing, no landmark anchors) and a step-loop scene that imports nothing from src/scene/props. Build, run verify:bundle and report go or stop. The thresholds below are design parameters [estimated].
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/play/loop/lanes.ts`, `tests/play/loop-lanes.test.ts`, `docs/waves/WR-report.md`
- **Accept:**
  1. The wave report has a budget ledger: one row per route class and per scene, each figure [measured] with its date and SHA, beside its gate and the allowance the brief's section 4 gives it.
  2. The report has the spike's table, each figure [measured]: the skeleton's front-page JS closure and first-paint CSS, and the step-loop scene's closure with and without the props chunk.
  3. Go if the skeleton's front-page JS closure is at most 140,000 B and the scene without props is at most 30,000 B. Otherwise the report says which of the brief's cuts are needed and the measured saving of each.
  4. lanes.ts compiles under tsconfig.pure.json and has tests: one tick maps to one x; a gap between two forwards gives an idle box as wide as the CPU's work; the layout holds for 4 and for 64 slots.
  5. Only lanes.ts, its test and the report are proposed for merge.
  6. No gate script, budget table or tests/bundle file is edited.

### Stage 1: the patterns that do not depend on the look, and build A

#### [ ] R-T04 · The naming table, the roster, the terms and the copy guard · M · opus · deps: R-T01, R-T02
- **Goal:** Stage 1. Make section 2.7 of the brief the source of every name. Rewrite GAMES.md section 2.6 as the naming and drawing rules, with the kitchen vocabulary kept only as a history table. Give the roster its nine titles, subtitles and role lines (the pool is KV page pool). In each built game's copy.ts write every level's and stage's new title, its goal line (aim, what the learner controls, the number to beat or the pass rule, when it ends), its prompts and prediction questions in engine terms and, for a graded level, its pass-rule sentence, each checked against the level's rule in GAMES.md. Write src/copy/terms.ts: the canonical terms with a definition of 6 to 12 words each, the product's own words, and the state, verdict and provenance words. Write src/copy/banned.ts from the brief's two lists (words banned everywhere; phrases banned in the kitchen sense, each with its allowed contexts) and the guard that reads it. In e2e specs change only the game and level titles they look up.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `docs/GAMES.md`, `docs/ARCHITECTURE.md`, `docs/TRACKER.md`, `packages/play/roster.ts`, `packages/play/*/entry.ts`, `packages/play/*/copy.ts`, `src/copy/terms.ts`, `src/copy/banned.ts`, `tests/copy/no-kitchen.test.ts`, `tests/copy/allow/**`, `tests/play/roster.test.ts`, `tests/content/roster.test.ts`, `e2e/*.spec.ts`
- **Accept:**
  1. verify:games passes, and the roster tests pass: the roster, D-063's table, ARCHITECTURE section 6.1 and the tracker's task titles agree.
  2. Every level and stage of the five built games has a title and a goal line with its three parts and an end condition, and every prediction question and unit is in engine terms. The pool's unit is the page.
  3. For each graded level, a test reads the pass bar from the level and finds the same number in its pass-rule sentence.
  4. The guard passes on its own fixtures: it fails on 'the pass', 'table A' and 'each course takes', and passes on 'Passed', 'sliding window', 'State as a table', 'block table' and 'the course'. It skips code spans.
  5. The guard reads rendered and compiled text only (copy tables, terms, compiled lessons, the Markdown export, llms.txt, item stems over the seed count), never raw source, so an enum value such as 'plate' does not fail it.
  6. Areas not yet converted are files under tests/copy/allow/, one per area, each naming the R task that deletes it. This task deletes none but the copy tables' own.
  7. Every coined term (bubble, ghost token, page as the pool's unit) is marked as the course's own in terms.ts.
  8. No id, route, action or ledger ref changes: tests/play/index.test.ts and the route-table test pass untouched, and the goldens of R-T02 do not move.
  9. The Games index and each game's title strip show the new titles, and the e2e specs that name a game or a level pass.

#### [ ] R-T05 · The new components, on the current token roles · M · opus · deps: R-T01
- **Goal:** Stage 1. Build the components the lesson template and the instrument frame are made of, as listed in section 2.8, and show each on /design. They use token roles only, so they render under the current values now and under Data Book's after R-T16. These set the pattern every later task copies, so each one's states and keyboard behaviour are finished here. No token value, face or existing component changes in this task.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/design/components/Marker.tsx`, `src/design/components/Callout.tsx`, `src/design/components/PartsList.tsx`, `src/design/components/Legend.tsx`, `src/design/components/Note.tsx`, `src/design/components/Popover.tsx`, `src/design/components/Stamp.tsx`, `src/design/components/TitleBlock.tsx`, `src/design/components/SectionRail.tsx`, `src/design/components/LevelMenu.tsx`, `src/design/components/GoalLine.tsx`, `src/design/components/DeltaChip.tsx`, `src/design/components/NumberLine.tsx`, `src/design/components/NextStep.tsx`, `src/design/components/index.ts`, `src/design/components.css`, `src/pages/Design.tsx`, `tests/design/components.test.ts`, `tests/design/design-page.test.ts`
- **Accept:**
  1. Each component has a specimen on /design at 1440 and 390 with its default, hover, focus, active and disabled states where they apply.
  2. Popover opens on activation (click, Enter or Space), closes on Escape and on an outside press, and returns focus to its trigger, by test. It never opens on focus alone.
  3. Stamp is a button that opens the tag legend: four lines, one per provenance word.
  4. SectionRail is a nav holding an ordered list, and the current entry carries aria-current="step". LevelMenu is one control that works by keyboard.
  5. Callout is an ink disc with a numeral. Marker is amber with its edge, a shape and a word. Neither carries meaning by colour alone.
  6. The focus ring on every new component is 3 px of text-1 at a 2 px offset with a paper halo.
  7. Every colour, size, radius and duration is a token role (tests/design/literals.test.ts and scales.test.ts pass).
  8. Every interactive target is at least 44 px on its short side.
  9. The /design route stays at or under 200 KB [measured, against R-T03's ledger].

#### [ ] R-T06 · The way on: nextStep, the lessons table, Continue and the words for state · L · opus · deps: R-T04, R-T05
- **Goal:** Stage 1. Build section 2.4 of the brief. The compiler writes a lessons table into map.json: for each lesson its route, title, minutes, needs, opener, and the refs of its opener runs, inline runs, predictions, checkpoints, question families and graded levels. One pure function, nextStep(events, lessons, bookmark), answers what is next for every page, by the five rules of section 2.4, and a second, lastTime(events, lessons), tells progress back as a sentence. Reading has no event, so only Run and Test have a state, and a lesson is done when its Test is passed. An event that several lessons could own goes to the one whose rev it carries. The header shows Course, Games, Review, Progress and an outline Continue on every route; the footer shows About, Sources and changes, Settings. Breadcrumbs use titles. Skills, attempts and lessons each get their words. Three localStorage keys: the pointer (es:next), the bookmark (es:here) and, for R-T08, the intro flag.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/progress/next.ts`, `src/progress/derive.ts`, `src/progress/useProgress.ts`, `src/progress/sources.ts`, `scripts/content/build.ts`, `packages/schema/content.ts`, `schemas/**`, `src/App.tsx`, `src/routes.tsx`, `src/settings/store.ts`, `src/design/components/Board.tsx`, `src/design/components/NextStep.tsx`, `tests/progress/**`, `tests/app/**`, `tests/content/map.test.ts`, `e2e/titles.spec.ts`, `e2e/route-change.spec.ts`
- **Accept:**
  1. map.json has a lessons table with a row for each of the 27 built lessons, and a test holds each row to the lesson's blocks. Every row has a non-empty test.
  2. nextStep is pure and tested, one test per rule: an empty ledger gives the first section of TR1 lesson 1; an unfinished lesson gives its Run, then the bookmark's part, then Read, then Test; a done lesson gives the next lesson after it that is not done, and skipped counts the earlier ones; reviews due never change the answer.
  3. A play event for a level that two lessons use (loop/graphs, broken-bench/court) goes to the lesson whose rev it carries, and with no matching rev it counts for both: a test covers each case.
  4. Test is passed only when the last count attempts at each of its families were right at full weight and each graded ref has a passing graded run. A practice pass does not pass a graded ref.
  5. The words Continue and Start appear only on controls whose href is nextStep's. A test greps for the old derivations (nextModule callers, LINK_TR2) and finds none outside next.ts.
  6. Every route's header has the four links and Continue, and no route's chrome links Design or Receipts. On a phone the links sit behind a button labelled Navigation.
  7. No rendered title or breadcrumb shows a lesson or KC id; breadcrumbs read as titles with 'Lesson n of m'.
  8. Skills read not started, tried, passed or kept. An attempt reads not yet, passed in practice or passed, and a pass at part weight is 'passed in practice'. A lesson reads not started, started or done. The words practised, earned, credited and part credit appear in no rendered string.
  9. es:next and es:here are written only by pages that open the ledger or by a lesson page, are read inside try/catch, and deleting them changes the place only. The front page still opens no IndexedDB (the existing test passes).
  10. Nothing new is stored in the ledger. The entry closure stays at or under 110 KB [measured, against the ledger].

#### [ ] R-T07 · The instrument frame, built on KV page pool · L · opus · deps: R-T04, R-T05
- **Goal:** Stage 1. Build section 2.6's frame as a new file beside the old shell, and prove it on the game that opens coldest today. The frame has a title strip with the role line, a one-control level menu, Parts, How to play and Keyboard; an always-visible goal line; the diagram with its legend; a dock that holds the decision, the readout strip and the result; a title block; and the mirror table under a disclosure. The debrief becomes a component of its own. Lay KV page pool out in the frame in 2D, as its default view, with every string in engine terms: page, KV group, conversation, shared system prompt, cost. GameShell.tsx stays for the games not yet converted. In packages/play/pool only display strings change.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/kit/Frame.tsx`, `src/games/kit/ViewSwitch.tsx`, `src/games/kit/MirrorTable.tsx`, `src/games/kit/KeysDialog.tsx`, `src/games/kit/Debrief.tsx`, `src/pages/Game.tsx`, `src/games/pool/**`, `packages/play/pool/copy.ts`, `packages/play/pool/labels.ts`, `packages/play/pool/debrief.ts`, `packages/play/pool/view.ts`, `tests/play/pool-*.test.ts`, `tests/play/frame.test.ts`, `e2e/pool.spec.ts`, `e2e/tr5a-items.spec.ts`
- **Accept:**
  1. The frame's parts appear in the order of section 2.6, and the level menu is one control (no row of level chips).
  2. The keyboard list is labelled Keyboard, and verify:games still finds a keyboard map for the game.
  3. The goal line of every pool level shows an aim, what the learner controls, the number to beat or the pass rule, and when the level ends.
  4. On /play/pool at 1440 x 900 and 390 x 844, the diagram, the current control and the readout are inside the viewport at the start, at an eviction decision and at the result (e2e bounding boxes). Under 700 px of height the dock is not pinned.
  5. An eviction decision is announced in the dock. In practice each option shows its cost before it is chosen; in a graded level it does not, and the dock says so.
  6. 2D is the default view; 3D is one switch away and unchanged by this task.
  7. No banned word or phrase on /play/pool in text, aria labels or live-region lines; 'Say it first' is gone; tests/copy/allow/pool is deleted.
  8. The verdict word comes from the grade's data: a test covers Passed, Not yet and Finished (practice).
  9. The mirror table is in the DOM whether its disclosure is open or closed.
  10. No reducer, level number, band, score, pass bar or seed changes: verify:games and verify:determinism pass, and the pool's goldens are unchanged.
  11. The keyboard and reduced-motion walks pass, axe finds nothing serious or critical, and the route is within 2 KB of its row in the ledger and under 200 KB [measured].

#### [ ] R-T08 · The first-run intro and the feedback kit · M · opus · deps: R-T06, R-T07
- **Goal:** Stage 1. Build the first run and the feedback of section 2.6 as a kit every game uses, and script it for KV page pool. The interface a game gives the frame is { Diagram2D, DockView, parts, moments, firstMove }. The first run names up to five parts on the live diagram, then lets the learner look or move, then shows the session's first ask. A real move comes before the ask only where the session has no prediction to ask first; elsewhere the learner selects a part and reads its popover. The pointed first move is the first action of the level's reference run. The parts list is per level, and the es:intro flag keeps the part ids already shown. The kit also gives named moments, the delta beside a readout, the reference run drawn as a hollow outline, the guess and the result on one number line, and the learner's best per level read from the ledger. The intro is a lazy chunk.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/kit/Intro.tsx`, `src/games/kit/moments.ts`, `src/games/kit/best.ts`, `src/games/kit/first-move.ts`, `src/games/kit/Frame.tsx`, `src/settings/store.ts`, `src/games/pool/**`, `packages/play/pool/copy.ts`, `tests/play/intro.test.ts`, `tests/play/moments.test.ts`, `e2e/pool.spec.ts`
- **Accept:**
  1. The intro is not modal: no focus trap, no control disabled, and Escape or Skip intro ends it at any point. The parts list is an ordered list in the dock, and the callout discs are decoration for it.
  2. On the pool the order is parts, look at request 1, the level's own guess, then Admit pointed at. The guess is the session's commit and is dispatched first or not at all: a test shows that no action precedes it, and that Skip the guess dispatches nothing.
  3. Before the pool's guess is committed or skipped, a waiting request's row shows its tokens and prefix and not its page count.
  4. A unit test with a stub session that has no first ask shows the kit offering a real move first, which appears in the action log. A second stub that requires its prediction first shows an inspection that dispatches nothing.
  5. The pointed first move equals the first action of the level's reference run, for every pool level (test).
  6. No prediction is shown before the parts list has been shown (e2e).
  7. On a level whose parts were all shown before, the intro does not open by itself; on a level with one new part, only that part is called out. How to play replays the whole of it. In front-page mode only the flag is read.
  8. The scripted first run of the pool finishes in under 60 s in e2e.
  9. A named moment shows once per level, at the first time its rule occurs. A delta shows for one second beside a value that has itself changed.
  10. At the end of a run the reference is drawn as a hollow outline on the same axis, the guess and the result sit on one number line, and Run again states the difference to the reference and the best from the ledger.
  11. Under reduced motion nothing pulses or animates and each state is drawn at its end.
  12. The intro loads as its own chunk when it shows, and the game route's own closure grows by nothing for it [measured].

#### [ ] R-T09 · Every prediction gets a reveal (W2-T43, in this wave) · L · sonnet · deps: R-T01, R-T04, R-T06
- **Goal:** Stage 1. 22 of the 39 lesson predictions show a lock today because no run answers them, and 14 of the 27 lessons have none that works. Give each a reveal, as the brief's section 2.5 says, by W2-T43's second and third ways. (a) TR2 lesson 1's prediction is reworded onto the ticks of its own level, first-3-gap, so that level's run answers it. (b) The other 21 get reveal: at-commit, a new value of the schema's reveal enum. Where the question carries numbers of its own, the answer is computed from those numbers by the lesson's demo function (tests/content/tr*-demos.ts already hold these figures). Where it asks for a fact about an engine's source, configuration or tool, the answer is read from the claim the question is about. Write packages/play/predictions/same.ts: the pairs where a lesson's prediction and its level's opening prediction ask for the same quantity. Rewrite the wait and reveal sentences of plan.ts, tr1.ts, tr2.ts and tr5a.ts in engine terms. In lesson files change predict blocks only. Record the choice under D-067 and close W2-T43 in the tracker.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/play/predictions/**`, `packages/schema/content.ts`, `schemas/**`, `src/content/render/Predict.tsx`, `src/content/render/predicted.ts`, `src/content/render/reveal.ts`, `content/modules/*/lessons/*.md`, `tests/content/tr1-demos.ts`, `tests/content/tr2-demos.ts`, `tests/content/tr5a-demos.ts`, `tests/content/tr6-demos.ts`, `tests/content/tr8-demos.ts`, `tests/play/predictions.test.ts`, `tests/play/predictions-support.ts`, `tests/content/predict.test.ts`, `e2e/lesson-predict.spec.ts`, `docs/DECISIONS.md`, `docs/TRACKER.md`
- **Accept:**
  1. PLAN has no waiting row, or each one left has a record under D-067 that says why, and renders as a question to hold with no input, no lock and no task id.
  2. Every at-commit prediction has a truth function that takes no run, and tests/play/predictions.test.ts holds each to the lesson's own figure or to the named claim's value.
  3. TR2 lesson 1's prediction is answered by a run of loop/first-3-gap, and the test plays that level on a seed and holds the reading to the lesson's figure.
  4. After a commit an at-commit prediction shows the learner's value, the answer and its working (the arithmetic, or the claim with its source), and writes one predict event with both. COMMIT is never disabled.
  5. same.ts lists every pair of a lesson prediction and a session prediction that ask for the same quantity, each with the two prompts side by side in the PR, and a test fails when either prompt changes without the row.
  6. No wait or reveal sentence in packages/play/predictions contains a banned word or a task id, and tests/copy/allow/predictions is deleted.
  7. A prediction still earns no credit: ASSESSMENT.md is untouched and the progress tests pass unchanged.
  8. verify:schema passes with the exported schemas regenerated; verify:content, verify:kc and verify:numbers pass.
  9. The 17 predictions a run already answered still reveal as before.

#### [ ] R-T10 · The lesson template, built on TR5a lesson 1 · L · opus · deps: R-T08, R-T09
- **Goal:** Stage 1. Build section 2.5 of the brief, without the dock (R-T11): the head with its promise line, the rail, the phone's strip and foot bar, and the sections Run, Read, Test and Keep on one scrolling page with nothing collapsed. A pure function, groupSections(blocks), derives the sections and the opener (A, B or C) from the file's shape. Test holds the question set and every graded game block. A guess sits in the guess slot of the instrument whose run answers it, or where it was written when it is revealed at commit. Where same.ts pairs a lesson's guess with the level's opening guess, one prompt serves both. Claims are numbered marks that link to a Sources list and open a popover on activation. The notional-machine card is one line in the title block that opens a panel. Keep ends in the lesson record and the way on. Edit TR5a lesson 1 to opener A as the reference lesson: its guess is answered by its second run, and it has a lab, a figure and three card kinds. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/Lesson.tsx`, `src/content/render/**`, `src/content/render/sections.ts`, `content/modules/tr5a/lessons/l1-why-one-model-needs-several-kv-caches.md`, `tests/content/render.test.ts`, `tests/content/render-model.test.ts`, `tests/content/game-blocks.test.ts`, `tests/content/sections.test.ts`, `tests/content/claim-chip.test.ts`, `tests/content/tr5a-module.test.ts`, `e2e/lesson-games.spec.ts`, `e2e/lesson-predict.spec.ts`
- **Accept:**
  1. groupSections runs over all 27 built lessons without error and gives each a Test. A lesson whose first game follows its first heading has no Run section; a graded game block is always in Test, wherever it sits in the file.
  2. A lesson whose Test is a graded level alone renders 'Test · graded level' in the rail (TR6 lesson 2, TR8 lessons 1 and 2, by fixture).
  3. TR5a lesson 1 at 1440: its setup is at most 60 words, its first control is within 900 px of the top, both opener levels play one after the other in Run, and the page is shorter than today by at least the notional-machine card's height [measured].
  4. No notional-machine card is inlined in any lesson; the title block's link opens the full card in a panel that returns focus when closed.
  5. Nothing is collapsed: the page's text contains its last paragraph with no interaction, and every heading has an anchor.
  6. The rail is a nav with aria-current on the current section, and after a run it shows the learner's own answer (e2e).
  7. No more than two prompts come before a run's first move, and no lesson asks one question twice.
  8. Claims render as numbered links with a popover on activation, the Sources list holds every claim the lesson cites, a tagged number is not a tab stop, and no paragraph contains a bordered chip. verify:content, verify:claims and verify:numbers pass.
  9. In Keep, with the Test passed the amber control is the next lesson and equals nextStep; with it not passed the amber control goes to the questions and the next lesson is an outline.
  10. At 390 the sticky strip and foot bar are present, and in a keyboard walk the focused control's box never lies under either (WCAG 2.4.11). Under 600 px of viewport height neither is sticky.
  11. The lesson record's lines come from ledger events (a test with a fixture ledger), and nothing new is stored.
  12. The lesson route is within 3 KB of its row in the ledger and under 200 KB, and each lesson's JSON is at or under 40 KB [measured].

#### [ ] R-T11 · The lesson's dock and the source popover · M · opus · deps: R-T10
- **Goal:** Stage 1. From 80rem wide and 44rem tall, keep the learner's run beside the prose: a sticky dock in the lesson's right column that renders a game's DockView over the same run state as the instrument, with its readout and, in practice, Step, Undo and Reset. Add the source popover: selecting a part of a diagram opens its engine name, one sentence, its value with its tag and a link to the file and symbol at the pinned commit. The parts list and the popover read one table. Build both against the kit's interface and supply the pool's DockView and parts table; every other game supplies its own in its own task.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/content/render/Dock.tsx`, `src/content/render/GameEmbed.tsx`, `src/content/render/content.css`, `src/games/kit/RunContext.tsx`, `src/games/kit/PartPopover.tsx`, `src/games/kit/Frame.tsx`, `src/games/pool/View2D.tsx`, `src/games/pool/DockView.tsx`, `packages/play/pool/copy.ts`, `tests/content/dock.test.ts`, `tests/play/part-popover.test.ts`, `e2e/lesson-games.spec.ts`
- **Accept:**
  1. At 1440 x 900 the dock shows the same run as the instrument: an action taken in either shows in both (e2e).
  2. Before any run the dock shows the level's opening state. In a lesson with no opener it is empty and says so until the first run.
  3. Below 80rem wide or 44rem tall there is no dock and no sheet, and each part has a Back to my run link.
  4. The dock is always 2D, and a page still holds at most one live 3D scene.
  5. Selecting a part opens a popover with its name, a sentence, its value with its tag, and a link whose target is the claim's source at the pinned ref. A part with no claim says model object. A KV page's popover says once that vLLM's class is BlockPool.
  6. The popover opens on activation, closes on Escape and returns focus; it works in the instrument and in the dock. Its source table is a lazy chunk.
  7. One test shows that the parts list's lines and the popover's names come from the same rows of copy.ts.
  8. A test renders the dock with a stub game that supplies only the interface, so no pool file is imported by Dock.tsx.
  9. The dock never covers a focused control, and the lesson route stays within its allowance [measured].

#### [ ] R-T12 · Opener and pacing warnings, the openers and vocabulary tests, and the authoring rules · M · sonnet · deps: R-T10
- **Goal:** Stage 1. Give authors and agents the pacing signal without touching a gate. The compiler warns, and never fails, when more than 200 words precede an opener's game, when an opener C lesson's first thing to do comes after 450 words, when more than 600 words lie between two things the learner does, when a graded game block is not under the file's last heading, when a lesson has no Test, and when prose holds a build-log id. Write tests/content/openers.test.ts with the brief's table of 27 rows; it is expected to fail for the lessons not yet edited, each listed with the task that fixes it. Write tests/content/vocabulary.test.ts, the rule of P4: for an opener A or B lesson, every term of src/copy/terms.ts that appears in the opener level's controls, stage list and prompts is in that level's parts list or in the lesson's setup or primer. It checks words, not whether the level can be solved. Write the seven authoring rules into content/README.md. Make e2e/support/lessons.ts read the openers table, so the content tasks need not edit it.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `scripts/content/pacing.ts`, `scripts/content/directives.ts`, `scripts/content/build.ts`, `content/README.md`, `tests/content/compiler.test.ts`, `tests/content/openers.test.ts`, `tests/content/vocabulary.test.ts`, `e2e/support/lessons.ts`
- **Accept:**
  1. Each of the six cases prints a warning with its file and line, and a test covers each.
  2. A warning never changes the exit status of the compiler or of verify:content (test).
  3. tests/content/openers.test.ts holds all 27 rows of section 2.5's table and passes for TR5a lesson 1. For every other lesson it is marked as waiting on a named task (R-T34 to R-T39), and each of those tasks removes its own marks.
  4. tests/content/vocabulary.test.ts passes for TR5a lesson 1 and fails on a fixture lesson whose primer leaves out a term its level uses. Lessons not yet edited, and games with no parts table yet, are marked as waiting on a named task.
  5. content/README.md states the seven authoring rules and the three openers.
  6. The PR lists the warnings for the 27 built lessons, which is the worklist of R-T34 to R-T39.
  7. No verify script and no gate table is edited.

#### [ ] R-T13 · The tracker's W2 and W3 tasks, rewritten for the new design · S · sonnet · deps: R-T09, R-T10
- **Goal:** Stage 1. Rewrite the open tracker tasks that the redesign touches, as section 7 of the brief says, so that nothing in W2 or W3 is built in the old world. Titles take the engine names. Game tasks point at the instrument frame and its five exports. Content tasks point at the authoring rules and add their lessons to the openers table. Lab tasks take the 'Build ...' titles and the numbered procedure. W3-T08 and W3-T09 shrink to a check of the surfaces W2 and W3 add.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `docs/TRACKER.md`
- **Accept:**
  1. W2-T14, T15, T16, T18, T20, T23, T24, T25, T27, T29, T30, T31, T33, T37, T39, T42 and T44, and W3-T03, T07, T08, T09, T13 and T15, each carry the change section 7 names. W2-T43 points at R-T09.
  2. The wave gates say that W2's module, game and content tasks start after R-T15, and that the grader track is unaffected.
  3. No task title or body uses a kitchen name as a current name, and the roster tests pass.
  4. No pass bar or credit rule changes: ASSESSMENT.md is untouched.
  5. The summary table's counts still add up.

#### [ ] R-T14 · The step loop's demo and the front page in engine words, on the existing drawing · M · sonnet · deps: R-T04, R-T06
- **Goal:** Stage 1. Make the stage-1 build an honest picture of The Pass kept as a look. On the front page and the step loop's four demo levels change words only: every label, control, tape and live-region line takes the engine's term, with no kitchen word after it. The drawing, the scene and the layout are untouched. The front page's first button does what it says: it starts the demo, and one link whose label names TR1 lesson 1 enters the course. This is the smallest task that lets the owner compare two looks on the same structure at R-T20. Its strings carry over to R-T17 and R-T19.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/front/copy.ts`, `src/front/FrontPage.tsx`, `src/games/loop/announce.ts`, `src/games/loop/readout.ts`, `src/games/loop/ControlPieces.tsx`, `src/games/loop/FrameLabels.tsx`, `src/games/loop/Card.tsx`, `src/games/loop/Debrief.tsx`, `src/games/loop/Tape.tsx`, `src/games/loop/KeysWaiting.tsx`, `src/games/loop/LoopOverlap.tsx`, `packages/play/loop/kitchen.ts`, `packages/play/loop/copy.ts`, `tests/play/loop-ui.test.ts`, `tests/front/copy.test.ts`, `e2e/front.spec.ts`, `e2e/loop.spec.ts`
- **Accept:**
  1. No banned word or phrase on / or on the four demo levels of /play/loop, in text, aria labels or live-region lines.
  2. The scene, the layout and every reducer are untouched: the layout and scene tests pass with no change, and verify:games passes.
  3. No button on the front page does anything but what it says, and a link that names TR1 lesson 1, its minutes and what it needs is inside the first viewport at 1440.
  4. The header's Continue is on the page and reads from es:next; the page still opens no IndexedDB.
  5. Front-page JS stays at or under 150,000 B and at or under its row in the ledger plus 500 B [measured].
  6. The four front-page baselines are not re-shot in this task; the screenshot spec is updated for changed words only where it reads text.

#### [ ] R-T15 · Stage 1 closes: every gate, and build A · S · sonnet · deps: R-T08, R-T11, R-T12, R-T13, R-T14
- **Goal:** Stage 1. Close the look-independent stage. Run every gate on the stage's head, record the budgets against the ledger, and tag the commit wave-r-stage1. This tag is build A of the look gate: the new names, the way on, the lesson template and the frame, under The Pass. It is also the point the wave continues from if the owner chooses The Pass at R-T20. Fix nothing here: a gate that fails goes back to the task that owns the file.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `docs/waves/WR-report.md`
- **Accept:**
  1. lint, typecheck, bun test, build, verify:all and the e2e smoke project pass on the tagged commit, and the report lists each.
  2. The report's budget table has a stage-1 column, each figure [measured] with its SHA, and no row is over its gate.
  3. The tag wave-r-stage1 exists, and the report gives the two commands that build and serve it from a second worktree.
  4. The report lists what stage 1 leaves in the old world, by route: which games still use the old shell, which lessons are not yet edited, and the files left under tests/copy/allow/.
  5. No source file changes in this task.

### Stage 2: Data Book on the pattern screens, and the look gate

#### [ ] R-T16 · Data Book: tokens, faces and the restyle of every component · L · opus · deps: R-T15
- **Goal:** Stage 2. Apply section 2.8 of the brief. New values for the surface roles and paper-rule; tape, tape-ink, glint and light-fluorescent retired from every stylesheet; role names otherwise unchanged. Three faces: Doto, Handjet and Permanent Marker leave, and the numeric, ticket and label roles are re-pointed. Sentence case everywhere. A flat ground with no texture, two shadows, square paper. The focus ring is ink. Restyle the existing components in place with their exports unchanged: Ticket as a plain sheet, Stub as the amber primary button, Button as outline, ink and quiet, PrinterTape as the readout strip, Toggle as a switch, Field, Board as the header and the kick-plate as the footer. Check the stage-1 components under the new values. Move DESIGN.md's front matter with the tokens in the same change. src/design/scene-tokens.ts and the kitchen scenes are not touched: they keep working until stage 4.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/design/tokens.ts`, `src/design/tokens.css`, `src/design/fonts.css`, `src/design/base.css`, `src/design/components.css`, `src/design/specimens.css`, `src/design/components/**`, `src/index.css`, `public/fonts/**`, `NOTICE`, `DESIGN.md`, `.impeccable/design.json`, `tests/design/**`
- **Accept:**
  1. verify:tokens passes in both shipped schemes, and every pair named in section 2.8 is declared in tokens.ts.
  2. A test finds no text-transform: uppercase and no texture role in any stylesheet under src/ outside the kitchen scene's own files.
  3. public/fonts/fonts.json pins three faces, and the removed font files and their licences are gone from public/fonts/ and NOTICE.
  4. tests/design/one-lamp.test.ts is rewritten as the One Marker rule (amber on its three carriers only, callouts in ink) and passes. A second test holds the focus ring to text-1.
  5. tests/design/design-md.test.ts passes: DESIGN.md's front matter and tokens.ts agree role by role.
  6. No component's exported name or props change (typecheck passes with no edit outside src/design and tests/design).
  7. Every route renders, with zero serious or critical axe findings in the e2e smoke project, and the kitchen scenes still render.
  8. First-paint CSS is at or under its row in the ledger [measured, in the PR].

#### [ ] R-T17 · Step loop: the timing diagram and the pure lane layouts · L · opus · deps: R-T03, R-T16
- **Goal:** Stage 2. Redraw the step loop's 2D view as a real timing diagram, in the frame, for the four demo levels: a waiting-queue row, a CPU row, one GPU row per batch slot whose label holds the request in it, a now cursor, idle stretches as dashed boxes and a dimension line with its value on a bubble. Write both pure layouts here, because every other view of the loop is drawn from them: lanes.ts for the demo levels and full/lanes.ts for the five full levels in microseconds (CPU slabs by call, a copy row, one forward row with its batch size, a live-slots strip, a grammar-mask row, eager launches as ticks, a graph replay as one slab, padding as a hatch). Supply the game's five exports: the diagram, the dock view, the parts table, the named moments (batching, an empty slot, the bubble, the ghost token) and the first move. The kitchen layout, the kitchen scene and the full levels' views stay in the tree, untouched and working.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/play/loop/lanes.ts`, `packages/play/loop/full/lanes.ts`, `packages/play/loop/svg.ts`, `packages/play/loop/copy.ts`, `packages/play/loop/game.ts`, `src/games/loop/Game.tsx`, `src/games/loop/View2D.tsx`, `src/games/loop/Controls.tsx`, `src/games/loop/ControlPieces.tsx`, `src/games/loop/Card.tsx`, `src/games/loop/Debrief.tsx`, `src/games/loop/Mirror.tsx`, `src/games/loop/Tape.tsx`, `src/games/loop/FrameLabels.tsx`, `src/games/loop/KeysWaiting.tsx`, `src/games/loop/LoopOverlap.tsx`, `src/games/loop/readout.ts`, `src/games/loop/announce.ts`, `src/games/loop/svg.tsx`, `src/games/loop/useOrientation.ts`, `src/games/loop/useLoopControls.ts`, `src/games/loop/DockView.tsx`, `tests/play/loop-lanes.test.ts`, `tests/play/loop-full-lanes.test.ts`, `tests/play/loop-ui.test.ts`, `e2e/loop.spec.ts`, `e2e/keyboard-loop.spec.ts`
- **Accept:**
  1. The 2D view of the demo levels matches sections 2.9 and 3.1: the rows, the slot labels, the cursor, dashed idle boxes, and a dimension line with its value on a bubble.
  2. full/lanes.ts compiles under tsconfig.pure.json and has tests for each of the five full levels and each stage of graphs: one microsecond maps to one x; a bubble is as wide as the CPU work that causes it; padding, eager launches and a replay are distinct layout kinds.
  3. The four demo levels play with their new titles and goal lines. A level that opens mid-run says so in its first line, and the end of each is announced.
  4. The first run follows section 2.6: parts, then a real first move, with no prediction on demo levels 1, 2 and 4. On level 3 a view-only guess appears and nothing is stored for it.
  5. The four named moments each appear once, the first time their rule occurs.
  6. The dock view renders the lanes at 464 x 240, and the parts table has a row for every drawn object with its claim or 'model object'.
  7. On /play/loop at 1440 x 900 and 390 x 844 the diagram, the current control and the readout share the viewport. At 390 the track scrolls inside its box and keeps the cursor in view.
  8. No banned word on the demo levels, in text, aria labels or live-region lines.
  9. The reducer and every level number are unchanged: the loop's tests, verify:games and verify:determinism pass.
  10. The 3D view and the full levels still work as before, nothing new imports packages/play/loop/layout.ts or kitchen.ts, and the front page still builds at or under 150 KB [measured].
  11. The keyboard and reduced-motion walks pass, and the route is within its allowance [measured].

#### [ ] R-T18 · Step loop: the 3D time track, beside the kitchen scene · L · opus · deps: R-T17
- **Goal:** Stage 2. Build the step loop's 3D scene from the specimen's time track as a model of the same diagram, in new files beside the kitchen scene: matte slabs in the lane colours on a pale base plate engraved with the graticule, idle as dashed wire outlines, the now cursor as a thin amber sheet. It reads lanes.ts and full/lanes.ts, so the demo and the full levels share it. Give it the six cameras of section 2.9 (Side, Lifted, Along time, Top, Compare, Scale). It imports nothing from src/scene/props. Point the game's 3D switch at it. The kitchen scene's files, its materials and its lights are not edited or deleted: R-T44 removes them after the look gate.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/loop/TrackScene3D.tsx`, `src/games/loop/track-layout.ts`, `src/games/loop/track-presets.ts`, `src/games/loop/track3d.css`, `src/games/loop/full/track.ts`, `src/games/loop/Game.tsx`, `src/games/loop/FullService.tsx`, `src/scene/specimen-layout.ts`, `src/scene/SpecimenScene3D.tsx`, `src/scene/SpecimenView2D.tsx`, `src/scene/SceneSpecimen.tsx`, `src/scene/flat-materials.ts`, `src/scene/FlatLights.tsx`, `tests/scene/specimen.test.ts`, `tests/play/loop-track.test.ts`, `e2e/loop-scene.spec.ts`, `e2e/scene-kit.spec.ts`
- **Accept:**
  1. The scene imports nothing from src/scene/props, and its closure is at or under 40,000 B, with 30,000 B as the target [measured, with SHA].
  2. A test shows that a tick's x in the Side camera's projection equals its x in the 2D layout within 1 px, for a demo level and for a full level.
  3. Lifted is Side tilted: time still runs left to right, and slots recede in depth.
  4. Compare stacks static batching, continuous batching and async scheduling, and the gaps close when async scheduling goes on: one authored move of 640 ms, drawn at its end under reduced motion.
  5. Scale draws 64 slots and at least 10,000 instances inside the scene kit's draw-call budget.
  6. Nothing glows but the cursor; there is no environment map, fog, bloom or steam.
  7. Every word and number is DOM in the label layer, and the DOM mirror and the 2D path are unchanged.
  8. Contact shadows and baked occlusion hold at every 3D tier, and tier 1 renders.
  9. The kitchen scene's files are byte for byte as before, and the stage-1 tag still builds.
  10. e2e/loop-scene.spec.ts and the reduced-motion spec pass.

#### [ ] R-T19 · The front page · L · opus · deps: R-T17, R-T18
- **Goal:** Stage 2. Rebuild the front page as section 3.1 draws it, at 1440 and 390, for a first visit and a return. The left column says what this is and holds no procedure. The instrument is live from first paint as the 2D timing diagram, painted from static HTML, and on a capable desktop it becomes the 3D scene at the Lifted camera after LCP, in the same box. Callouts are ink; at first paint the only amber is the ring on R1 and the now line. There is no guess on demo level 1. Each demo level's result offers the next demo level in amber and Start the course beside it; after the fourth, one sentence bridges to the course and one amber button starts it. Below the fold is plain HTML. A returning learner sees where they left off, from the pointer. The page fits the unchanged 150 KB and 30 KB gates. src/front/anchors.ts is no longer imported; R-T44 deletes it.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/front/**`, `src/pages/Front.tsx`, `index.html`, `scripts/posters.ts`, `scripts/prepare-pages.ts`, `public/posters/**`, `tests/front/**`, `tests/map/posters.test.ts`, `e2e/front.spec.ts`, `e2e/perf.spec.ts`, `e2e/support/front.ts`, `e2e/screenshots.spec.ts`, `e2e/screenshots.spec.ts-snapshots/**`
- **Accept:**
  1. The page matches section 3.1 at 1440 x 900 and 390 x 844: at both, the h1, a waiting request and Step are inside the first viewport, and the left column has no numbered procedure.
  2. At first paint there is one amber ring, the now line, and no amber fill; the five callouts are ink. The goal line of demo level 1 does not state how many tokens a step produces.
  3. At 390 the callout discs are on the diagram, the coach line steps through the parts one at a time, and Parts opens the whole list.
  4. The instrument is playable in 2D from the static HTML's first paint. On a desktop of tier 1 or above it upgrades to 3D after LCP, and no DOM strip moves when it does (CLS at or under 0.1).
  5. On a coarse pointer under 48rem the page stays in 2D with a 3D switch.
  6. No button on the page does anything but what it says. After a demo level, Next demo level is the amber control and Start the course is an outline that names TR1 lesson 1, its minutes and what it needs; after the fourth, Start the course is the amber one.
  7. A returning learner sees where they left off and Continue, read from es:next, and no intro. The page opens no IndexedDB and writes nothing to the ledger (D-038), by test.
  8. Front-page JS is at or under 150,000 B and first-paint CSS at or under 30,000 B [measured, with SHA]; LCP is at or under 2.5 s and INP at or under 200 ms in the perf spec; the LCP element is the h1.
  9. The page is at most 2,000 px long at 1440 (today 4,116).
  10. The posters are regenerated from the lane layout and tests/map/posters.test.ts passes.
  11. No banned word and no build-log id on the page.
  12. The four baselines are re-shot and listed in the PR for the owner's review.

#### [ ] R-T20 · The look gate: two builds, the same screens, three questions · S · sonnet · deps: R-T19
- **Note (2026-11-16):** the owner answered the gate: Data Book, in the words "data book for sure". The three questions are unanswered and the cold test asks them again. No task's status changes with this note.
- **Goal:** The gate between stage 2 and the deletions. The owner said they are not sure which style suits this course, and The Pass was chosen on paper and disliked when built. So show two built things. Build A is the tag wave-r-stage1: the new names, way on, lesson and frame, under The Pass. Build B is this stage's head: the same, under Data Book. Serve both, shoot the same five screens in each at 1440 x 900 and 390 x 844 (the front page at first paint; the front page after one step, in 3D; /play/pool at its first run; TR5a lesson 1 mid-way in Read; /play/loop on demo level 3 with async scheduling on), and write one page that sets each pair side by side with the three delight questions of the brief's section 5.4 and the decision the owner is asked for. No agent answers the questions or picks a build.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `scripts/look-gate.ts`, `docs/waves/WR-look.md`, `docs/waves/wr-look/**`
- **Accept:**
  1. docs/waves/WR-look.md holds ten pairs of images (five screens, two sizes), each pair from the same route, state and viewport, with the build's SHA under each image.
  2. The page gives the commands that serve build A and build B side by side on two ports, and both serve.
  3. The page states the decision (the brief's section 6, row 1), its default, and what the wave does on each answer, in under 200 words.
  4. The page lists what is the same in both builds (names, the way on, the lesson template, the frame) and what differs (surfaces, faces, the step loop's 2D and 3D, the front page).
  5. The three questions are printed with space for the owner's words, and nothing on the page answers them.
  6. The task changes no file under src/, packages/ or content/, and its PR comment tells the owner that stage 4 waits for the answer or takes the default.

### Stage 3: the roll-outs

#### [ ] R-T21 · Course (/map) · M · sonnet · deps: R-T16
- **Goal:** Stage 3. Rebuild the course map as section 3.2: one column of module rows in course order on a track line, opened by the next-step block and its sentence. Each row says in words what the module needs and where the learner stands. The module in progress is open and lists its lessons.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/Map.tsx`, `src/map/CourseMap.tsx`, `src/map/Stop.tsx`, `src/map/Pips.tsx`, `src/map/copy.ts`, `src/map/summary.ts`, `src/map/map.css`, `tests/map/course-map.test.ts`, `tests/map/summary.test.ts`, `e2e/map.spec.ts`
- **Accept:**
  1. The page opens with the next-step block: the lastTime sentence, the amber Continue from nextStep and, when they apply, a quiet line for reviews due and one for earlier lessons not finished.
  2. Modules are one column in course order; no grid of cards.
  3. Each row states what the module needs in words (browser only, or hours in the browser then on a GPU) and its state in words (lessons done, skills passed).
  4. The module nextStep points into is open and lists its lessons, with the next one under the amber mark.
  5. An unpublished module says Not published yet and is not a link.
  6. The two legend lines and the sentence 'Nothing is locked. Prerequisites advise.' are present.
  7. The first lesson link is within 700 px of the top at 1440, and the layout holds at 390 and 320 with no sideways scroll.
  8. No banned word, zero serious or critical axe findings, and the route at or under 200 KB [measured].

#### [ ] R-T22 · The module page · M · sonnet · deps: R-T11, R-T16
- **Goal:** Stage 3. Reorder the module page as section 3.3: title, two sentences, the amber button, then the lessons, all in the first screen. Then what the learner will be able to do, the Game, Build, Prove and Keep rows, and last a Reference section of closed disclosures that holds the essays, the hours, the model card and the sources.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/Module.tsx`, `src/pages/module.css`, `src/map/ModuleProgress.tsx`, `src/content/render/Page.tsx`, `tests/map/module-progress.test.ts`, `tests/pages/module.test.ts`, `e2e/walks.spec.ts`
- **Accept:**
  1. On TR1 and TR2 at 1440 the lesson list starts within 700 px (today 12,113 and 20,512).
  2. The amber button is Continue, with nextStep's href, when nextStep points into this module. Otherwise it says 'Open lesson n' with that lesson's title and minutes, and never says Continue.
  3. Each lesson row shows its number, title, minutes, what it needs and its state as a word.
  4. An outcome sentence gains a tick when its KCs are passed, derived from KC states and stored nowhere.
  5. The Reference disclosures are closed by default and their content is in the DOM.
  6. No citation row or metadata receipt sits above the lessons.
  7. The layout holds at 390; no banned word; the module route stays at or under its 200 KB gate [measured].

#### [ ] R-T23 · The Games index and the unpublished pages · S · sonnet · deps: R-T16
- **Goal:** Stage 3. Rebuild /play as section 3.8: a plain list of the nine games by engine name, each with its role line, its rule in one line and its levels marked practice or graded with the learner's best attempt in words. There are no picture boxes. Link Traces from it. An unpublished game or page says so in learner words and hands back to Continue.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/PlayIndex.tsx`, `src/games/specials/**`, `src/unbuilt/**`, `tests/map/specials.test.ts`, `tests/pages/unbuilt.test.ts`
- **Accept:**
  1. Each built game shows its title, role line and subtitle, and lists its levels with practice or graded and the learner's best attempt as not yet, passed in practice or passed.
  2. An unpublished game or page says Not published yet, names no task or wave, and offers Continue.
  3. Traces is linked from the page.
  4. The page holds no poster box and no 'No picture yet'; the poster files it used are removed from the specials folder.
  5. No banned word; the specials and unbuilt tests pass; the layout holds at 390.

#### [ ] R-T24 · Review (/today) and the question frame · M · sonnet · deps: R-T10, R-T16
- **Goal:** Stage 3. Rebuild Review as section 3.10 with its five states, and restyle the question frame that Review and every lesson's Test share. The page keeps its rules: it never counts what is overdue and never scolds. A set never shows the same stem twice: when a draw repeats one already in the set, the set takes the next seed. Scheduling, keys and grading are not touched.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/Today.tsx`, `src/items/today/TodayView.tsx`, `src/items/today/PrepList.tsx`, `src/items/today/Tickets.tsx`, `src/items/today/Work.tsx`, `src/items/today/copy.ts`, `src/items/today/today.css`, `src/items/ItemBlock.tsx`, `src/items/Attempt.tsx`, `src/items/Frame.tsx`, `src/items/Rich.tsx`, `src/items/items.css`, `tests/today/**`, `tests/items/item-block.test.ts`, `tests/items/answer.test.ts`, `e2e/today.spec.ts`, `e2e/items.spec.ts`
- **Accept:**
  1. The five states of section 3.10 render: nothing passed yet, due, in a session, done, nothing due.
  2. tests/today/copy.test.ts still passes: no overdue count, no scolding.
  3. An item is called a question everywhere. Radio choices are drawn as radios; the buttons say Check answer and Next question; a tag inside a stem is a dotted underline and never a bracketed word.
  4. Feedback keeps its shape: you wrote, the key, you said, why.
  5. A tally reads 'n of m: passed' or 'n of m: not yet. New numbers when you retry.'
  6. Over the seed count of tests/seeds.ts, no set of any built lesson holds two questions with the same stem, and every answer key is what it was for the seed that was used.
  7. Every empty or finished state offers the amber Continue from nextStep.
  8. At 390 the primary button is inside the first screen in every state, and Check answer is the sticky foot bar in a session.
  9. The scheduling tests (fsrs, plan, session) pass with no change, and the keyboard walk and axe pass.

#### [ ] R-T25 · Progress, GPU lab results and the small pages · M · sonnet · deps: R-T16
- **Goal:** Stage 3. Carry the system and the plain words to the remaining pages. Progress lists what the learner did as dated rows in words before its counts. GPU lab results is the receipts page under a plain name, reached from Progress and from GPU labs. About gains 'How numbers are tagged', the same legend every stamp opens. Settings, Sources and changes, and the not-found page take the new components.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/Evidence.tsx`, `src/pages/Receipts.tsx`, `src/pages/Settings.tsx`, `src/pages/About.tsx`, `src/pages/Changes.tsx`, `src/pages/NotFound.tsx`, `src/pages/panels.css`, `src/evidence/*.tsx`, `src/receipts/*.tsx`, `src/receipts/copy.ts`, `src/receipts/receipts.css`, `src/settings/SettingsView.tsx`, `src/settings/Choice.tsx`, `tests/evidence/view.test.ts`, `tests/receipts/view.test.ts`, `tests/receipts/copy.test.ts`, `tests/receipts/import-view.test.ts`, `tests/settings/view.test.ts`, `tests/settings/pages.test.ts`, `e2e/receipts.spec.ts`, `e2e/receipts-import.spec.ts`, `e2e/settings.spec.ts`
- **Accept:**
  1. Progress opens with dated rows in words (date, what, result) and then counts, with the words for skills and for attempts and their two legend lines.
  2. GPU lab results is linked from Progress and from each GPU lab, and not from the header. The word receipt is used only for the grader's file.
  3. A table or list carries one provenance stamp, and each figure keeps its tag for a screen reader. About has the tag legend under an anchor that a footer link reaches.
  4. The not-found page is one sentence and Continue.
  5. No page shows a build-log id, and the footer has no Design link.
  6. The receipts pipeline's tests (challenge, import, rules) pass with changes to expected text only.
  7. No banned word; axe finds nothing serious or critical; each route stays at or under 200 KB [measured].

#### [ ] R-T26 · Labs: engine titles, check labels, the crates' prose and the numbered procedure · M · sonnet · deps: R-T16
- **Goal:** Stage 3. Give the three labs their engine names and a page that says what to do, as sections 2.7 and 3.9 say. Titles: Build an LRU free queue, Build the rejection sampler, Build a hybrid KV cache manager. Rewrite each lead in src/forge/labs.ts, each check's label and catches sentence in packages/sim/forge, and the prose of the crates under labs/forge (doc comments and READMEs) in engine terms. Only words change: no check id, plan, seed, stage, file name, Rust identifier, wire command or wasm export. Where an identifier is a kitchen-era word, the prose beside it says once what it is. Reorder the page as five numbered steps. Add two fields to each lab's entry, the file to edit and the build command, read from the crate header's 'YOU EDIT' line, from what verify:labs runs, and from rust-toolchain.toml.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/pages/Lab.tsx`, `src/forge/ForgeLabPage.tsx`, `src/forge/ForgeView.tsx`, `src/forge/Crate.tsx`, `src/forge/SlotReadout.tsx`, `src/forge/labs.ts`, `src/forge/words.ts`, `src/forge/forge.css`, `packages/sim/forge/*.ts`, `labs/forge/**`, `tests/forge/**`, `e2e/forge.spec.ts`, `e2e/forge-hybrid-kv.spec.ts`, `e2e/lab-kits.spec.ts`
- **Accept:**
  1. The page is an ordered list of five steps: download the crate, edit the named file, build, drop the .wasm, the checks. The download precedes the upload in the DOM.
  2. Step 2 names the one file to edit and the file not to edit. Step 3 gives the build command, the Rust version and the wasm target. A test holds each lab's edit field to its crate header and its toolchain line to rust-toolchain.toml.
  3. The download shows its hash, and each check shows its label and the bug it catches, in engine terms.
  4. No lab title, lead, check label or catches sentence, and no doc comment or README of a crate outside a code span, contains a banned word or phrase. tests/copy/allow/labs is deleted.
  5. A diff of packages/sim/forge shows changes to label and catches strings only, and a diff of labs/forge shows changes to comments and Markdown only: every .rs file compiles to the same wasm as before, by hash.
  6. verify:labs passes: the two sides still agree on ids, labels and stages.
  7. A lesson's reference to a lab is a link to its page.
  8. The forge host, the workers and the invoke protocol are untouched, and their tests and the three e2e specs pass.

#### [ ] R-T27 · Traces: the viewer in the system · S · sonnet · deps: R-T16
- **Goal:** Stage 3. Restyle the trace viewer so that it is the model for every lane diagram on the site: lanes in the colour code with their glyphs, an amber cursor, plain labels. Label its page Traces and its shortcut list Keyboard. The model, the plan, the viewport and the marks logic are not touched.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/trace/Tape.tsx`, `src/trace/Toolbar.tsx`, `src/trace/MarksTicket.tsx`, `src/trace/CursorTape.tsx`, `src/trace/KeysSheet.tsx`, `src/trace/SpanMirror.tsx`, `src/trace/TraceView.tsx`, `src/trace/SpecimenPage.tsx`, `src/trace/trace.css`, `src/trace/theme.ts`, `src/trace/words.ts`, `src/pages/TraceRoom.tsx`, `tests/trace/view.test.ts`, `tests/trace/spoken.test.ts`, `tests/trace/key-rules.test.ts`, `e2e/trace-view.spec.ts`
- **Accept:**
  1. Lanes and span categories use the six-colour code, each with a glyph or a pattern.
  2. The cursor is the amber marker with its edge.
  3. The page's title and heading read Traces, the shortcut list is labelled Keyboard, and no banned word appears.
  4. The model, plan, viewport and marks tests pass unchanged; the view tests pass with changes to expected text only.
  5. The keyboard walk of e2e/trace-view.spec.ts passes.

#### [ ] R-T28 · Step loop: TR2's and TR6's levels on the timing diagram · L · sonnet · deps: R-T17, R-T18
- **Goal:** Stage 3. Carry the timing diagram and the frame to the step loop's five full levels (async, graphs with its three stages, mrv2, close, mask), as section 3.7 draws them, on the pure layout R-T17 wrote. The stage's prediction comes first, as the session requires, after the parts list. The levers sit in the dock beside the diagram they change. The graded close level hides its live readout, says so, and shows its pass rule before the run. In packages/play/loop/full only display strings change. Post a wireframe of the five levels as the PR's first comment before building.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/loop/full/BuildThis.tsx`, `src/games/loop/full/CloseCards.tsx`, `src/games/loop/full/Compose.tsx`, `src/games/loop/full/FullCard.tsx`, `src/games/loop/full/FullControls.tsx`, `src/games/loop/full/full.css`, `src/games/loop/full/FullDebrief.tsx`, `src/games/loop/full/FullMirror.tsx`, `src/games/loop/full/FullTape.tsx`, `src/games/loop/full/FullView2D.tsx`, `src/games/loop/full/NightVerdict.tsx`, `src/games/loop/full/production-lines.ts`, `src/games/loop/full/Production.tsx`, `src/games/loop/full/tags.ts`, `src/games/loop/full/useFullControls.ts`, `src/games/loop/FullService.tsx`, `packages/play/loop/full/night.ts`, `packages/play/loop/full/kitchen.ts`, `packages/play/loop/copy.ts`, `tests/play/loop-full-ui.test.ts`, `tests/play/loop-full-levels.test.ts`, `tests/play/loop-close-ui.test.ts`, `e2e/loop-full.spec.ts`
- **Accept:**
  1. Each of the five levels, and each stage of graphs, plays in the frame with its new title, goal line and, where graded, its pass rule shown before the run. The level menu shows the stage.
  2. The first run on a full level is parts, look at the cost card's row, then the stage's prediction; no session action precedes the prediction (test).
  3. The cost cards keep their names, because they are claims.
  4. Every microsecond figure keeps its tag for a screen reader, and each readout strip shows one provenance stamp.
  5. Eager launches, a graph replay, padding and the grammar mask are each distinguishable by shape or hatch as well as colour, and a bubble carries a dimension line with its value.
  6. At 1440 x 900 the diagram, the levers and the readout share the viewport. At 390 the dock shows one lever group over Step and one readout line.
  7. At a result the learner's lanes sit above the reference's outline on one axis.
  8. The full levels' views import full/lanes.ts and nothing from full/layout.ts or full/kitchen.ts.
  9. No banned word on any full level; tests/copy/allow/loop is deleted.
  10. No reducer, lever, band, score or pass bar changes: the full-session and close tests pass with changes to expected text only, and verify:games passes.
  11. The keyboard walk of e2e/loop-full.spec.ts passes, and the route is within its allowance [measured].

#### [ ] R-T29 · Request path: the swimlane as the play surface · L · opus · deps: R-T11, R-T16
- **Goal:** Stage 3. Make the swimlane, which today appears only in the debrief, the diagram the learner plays on, as section 3.6 draws it: one column per process, time running down, each laid stage a row with an arrow labelled with its mechanism as a glyph and a word. The stage list is a filtered, scrolling list in the dock. This is the first game the course's first lesson opens, so its first screen decides whether the course starts lost. It draws only what the session's view already exposes: before the prediction no column, and in a sealed graded run a column only when the route reaches it. Its first run is parts, a look at one stage, then the session's own prediction, which is required. Supply the five exports. The 3D scene is left alone here and removed in R-T43.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/engine-floor/Game.tsx`, `src/games/engine-floor/View2D.tsx`, `src/games/engine-floor/DockView.tsx`, `src/games/engine-floor/Controls.tsx`, `src/games/engine-floor/Card.tsx`, `src/games/engine-floor/Cite.tsx`, `src/games/engine-floor/Code.tsx`, `src/games/engine-floor/Debrief.tsx`, `src/games/engine-floor/LevelRail.tsx`, `src/games/engine-floor/Mirror.tsx`, `src/games/engine-floor/TapeCheck.tsx`, `src/games/engine-floor/HandoffGlyph.tsx`, `src/games/engine-floor/svg.tsx`, `src/games/engine-floor/announce.ts`, `src/games/engine-floor/text.ts`, `src/games/engine-floor/floor.css`, `src/games/engine-floor/useFloorControls.ts`, `src/games/engine-floor/useOrientation.ts`, `packages/play/engine-floor/layout.ts`, `packages/play/engine-floor/words.ts`, `packages/play/engine-floor/facts.ts`, `packages/play/engine-floor/copy.ts`, `tests/play/engine-floor-ui.test.ts`, `tests/play/engine-floor-layout.test.ts`, `tests/play/engine-floor-map-ui.test.ts`, `tests/play/engine-floor-run.test.ts`, `e2e/engine-floor.spec.ts`, `e2e/engine-floor-map.spec.ts`
- **Accept:**
  1. The diagram is a swimlane with one column per process and one labelled arrow per hop, and a laid stage stays visible. Fourteen rows fit at 1440 x 900 without scrolling.
  2. Each mechanism has a glyph and a word; none is told apart by colour alone.
  3. A test compares, for every level's fixture states including a sealed map run, the processes and stages named on the diagram with those the old 2D view named: the new view names no more. The path's length is never shown in a sealed run.
  4. The first run follows section 3.5: the look dispatches no session action, the prediction is the session's commit with no skip and a line that says why, and then the first stage of the reference path is pointed at.
  5. The stage list filters by process and by typed text, and works by keyboard. At 390 three tiles, the run control and the readout are in the viewport with the current row.
  6. A stopped run marks the row, says the rule that broke in engine terms or cites the pinned symbol, and names the mechanism that was wrong.
  7. The debrief sets two engines' paths side by side with their differences marked.
  8. The graded map level shows its pass rule before the run, and says that it has no undo and no live readout.
  9. The dock view and the parts table are supplied, and every stage's popover names its mechanism, its process and its source.
  10. No reducer, stage, level or score changes: the goldens in tests/play/engine-floor-session.test.ts are unchanged and verify:games passes.
  11. No banned word; tests/copy/allow/engine-floor is deleted; the keyboard walk passes; the route is within its allowance [measured].

#### [ ] R-T30 · Rejection sampler in the frame · M · sonnet · deps: R-T11, R-T16
- **Goal:** Stage 3. Put the rejection sampler in the frame with 2D as its default view and engine terms throughout: the bars are draft q, target p, accepted min(p, q) and residual (p - q)+, and the six dishes are tokens 0 to 5. Its first run is parts, a look at one token's bars, then the level's own first ask. Lessons first meet this game at the chain level, so the intro must read well there as well as on overlap. Keep and name the moment where draws of 10, 100 and 1,000 converge. Supply the five exports.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/verifier/Game.tsx`, `src/games/verifier/View2D.tsx`, `src/games/verifier/DockView.tsx`, `src/games/verifier/Controls.tsx`, `src/games/verifier/Card.tsx`, `src/games/verifier/Debrief.tsx`, `src/games/verifier/Fraction.tsx`, `src/games/verifier/LevelRail.tsx`, `src/games/verifier/Mirror.tsx`, `src/games/verifier/Stepper.tsx`, `src/games/verifier/announce.ts`, `src/games/verifier/rules.ts`, `src/games/verifier/verifier.css`, `packages/play/verifier/copy.ts`, `packages/play/verifier/cards.ts`, `packages/play/verifier/facts.ts`, `packages/play/verifier/view.ts`, `tests/play/verifier-ui.test.ts`, `tests/play/verifier-layout.test.ts`, `e2e/verifier.spec.ts`, `e2e/rejection-sampler.spec.ts`
- **Accept:**
  1. The bars carry the four labels, each with its colour and glyph, and tokens are numbered 0 to 5.
  2. The words draft and target are on screen in every level (today one view never shows them).
  3. The first run works on overlap and on chain: on each, the parts list names what that level draws, and the level's own first ask follows it. Where the session requires a prediction there is no skip, and the dock says why.
  4. The convergence of the draws on the acceptance rate is kept and named once.
  5. The dock view and the parts table are supplied.
  6. 2D is the default view; 3D is one switch away and unchanged by this task.
  7. At 1440 x 900 and 390 x 844 the bars, the current control and the readout share the viewport.
  8. No reducer, level, band or score changes: the verifier's tests pass with changes to expected text only, and verify:games passes.
  9. No banned word; tests/copy/allow/verifier is deleted; the keyboard and reduced-motion walks pass.

#### [ ] R-T31 · Broken benchmark in the frame · M · sonnet · deps: R-T11, R-T16
- **Goal:** Stage 3. Put the clearest game in the frame and finish it. The switch and the report form move beside the chart they change. The range rule is shown before filing. Verdict words come from the grade's data, so a heading can no longer contradict its body. Guests, tables, the court and the clipboard leave the copy. Its first run is parts, then a flip of the switch (a view change that files nothing), then the report form. Supply the five exports. In packages/play/broken-bench only display strings change.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/broken-bench/**`, `packages/play/broken-bench/copy.ts`, `packages/play/broken-bench/cases.ts`, `packages/play/broken-bench/flaws.ts`, `packages/play/broken-bench/desk.ts`, `packages/play/broken-bench/judge.ts`, `tests/play/broken-bench-ui.test.ts`, `tests/play/broken-bench-layout.test.ts`, `tests/play/broken-bench-desk.test.ts`, `e2e/broken-bench.spec.ts`
- **Accept:**
  1. The switch and the report form are beside the chart, inside the viewport with it at 1440 x 900.
  2. The range rule is printed above the form before the learner files.
  3. A test covers every verdict heading against its body: Passed never sits over a failing body, nor Not yet over a passing one.
  4. The moment where the p99 moves when latency is counted from the due time is kept and named as coordinated omission.
  5. Each level shows its title, goal line and, when played graded, its pass rule before the run.
  6. The dock view and the parts table are supplied.
  7. No case, flaw, judge rule or score changes: the session tests pass unchanged, the view tests with changes to expected text only, and verify:games passes.
  8. No banned word; tests/copy/allow/broken-bench is deleted; the keyboard walk passes; the route is within its allowance and under 200 KB [measured].

#### [ ] R-T32 · Question stems and feedback in engine terms · M · sonnet · deps: R-T04
- **Goal:** Stage 3. Rewrite the words of every question family's stems, options and whys in engine terms, with one meaning per term. The pool's unit stays the page. Only words change. The keys, the seeds, the draws and the grading do not, and no gate script is edited.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/play/items/families/**`, `packages/play/items/rich.ts`, `tests/play/items-*.test.ts`, `tests/items/verify-items.test.ts`, `tests/items/catalog.test.ts`
- **Accept:**
  1. Over the seed count of tests/seeds.ts, no stem, option or why of any family contains a banned word or phrase or a build-log id.
  2. For every family and seed, the answer key before and after is equal: the PR carries the comparison script's output.
  3. verify:items passes, and its golden vectors are rewritten only where text changed.
  4. Every number in a stem keeps its tag in the data.
  5. tests/copy/allow/items is deleted.

#### [ ] R-T33 · Figures in the diagram language · M · sonnet · deps: R-T16
- **Goal:** Stage 3. Redraw the lessons' figures in the same language as the diagrams: the six-colour code with glyphs and hatches, the graticule, dimension lines with their values and mono labels. A generated figure is regenerated from its function. A hand-drawn one is redrawn as a file. A figure fills its column and stays legible on a phone. The figures' alt and description text live in the lessons and are rewritten by the content tasks, not here.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `tests/content/tr2-figures.ts`, `tests/content/tr5a-figures.ts`, `tests/content/tr6-figure.ts`, `public/figures/**`
- **Accept:**
  1. Every generated figure is rewritten by its function, and the module tests hold each file to what the function draws.
  2. Each figure uses only the six code colours, each with a glyph or hatch, and marks an interval with a dimension line where it names one.
  3. Each figure renders at the column's width and its labels are legible at 358 px.
  4. No text inside a figure file contains a banned word.
  5. verify:content passes.

#### [ ] R-T34 · The course's first lesson: TR1 lesson 1 · M · opus · deps: R-T12, R-T29, R-T33
- **Goal:** Stage 3. Edit TR1 lesson 1 to opener B. It is the first lesson a learner meets and the one the first-visit walk plays, and it sets the pattern for every primer. Today 983 words precede its level, which has 14 stages and 4 decoys. Write a primer of at most 200 words under 'Before you run', from the lesson's own prose and with no new claim: the five mechanisms, one line each, and that nano-vllm is one process. Then the two guesses and the level, before the first heading. The Read parts that follow are checked for words that assume the old order. Its questions become the Test under the last heading. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/modules/tr1/lessons/l1-five-mechanisms.md`, `tests/content/tr1-support.ts`
- **Accept:**
  1. The lesson's derived opener is B: at most 200 words, then its predict blocks and its game block, before the first heading. The openers test passes for it and its waiting mark is removed.
  2. Every engine term in the nano level's stage list, controls and prompts appears in the level's parts list or in the primer (the vocabulary test passes for this lesson).
  3. At 1440 the instrument's top edge is inside the first viewport, and at 390 within two screens.
  4. No more than two prompts come before the run's first move.
  5. The PR lists every sentence in Read that held an order word (above, below, earlier, you just, the level that follows) and what was done with each. A second agent that did not write the edit has read the lesson top to bottom, and its notes are in the PR.
  6. No banned word and no build-log id; every figure's alt and description is in engine terms.
  7. No claim, number, pin or KC is dropped: verify:content, verify:claims, verify:numbers and verify:kc pass, and the lesson's JSON is at or under 40 KB.
  8. The PR states plainly that whether a cold reader can finish this run is untested until the brief's section 5.5, and that a failure there moves this lesson to opener C.

#### [ ] R-T35 · TR1's lessons 2 to 7 in the template · L · sonnet · deps: R-T34
- **Goal:** Stage 3. Edit TR1's lessons 2 to 7 and its module file to the authoring rules of section 2.5, with the openers of its table: lesson 2 is C (its level stays in part 6), and lessons 3 to 7 are B, each with a primer that names the engine's processes and what is new. In lesson 7 the graded map level moves under the last heading, into the Test. Engine terms only; no build-log id. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/modules/tr1/lessons/l2-*.md`, `content/modules/tr1/lessons/l3-*.md`, `content/modules/tr1/lessons/l4-*.md`, `content/modules/tr1/lessons/l5-*.md`, `content/modules/tr1/lessons/l6-*.md`, `content/modules/tr1/lessons/l7-*.md`, `content/modules/tr1/module.md`, `tests/content/tr1-module.test.ts`, `tests/content/tr1-sources.test.ts`
- **Accept:**
  1. Each lesson's derived opener equals its row, the openers test passes for all seven TR1 lessons, and this task's waiting marks are removed.
  2. Lesson 2's first part ends in something to do within 450 words: a guess with a reveal, or a one-question checkpoint from a family whose idea that part covers.
  3. Lesson 7's Test holds its three questions and the graded map level, with the pass rule before the run.
  4. The vocabulary test passes for each opener level. The compiler prints no pacing warning for TR1, or each one left is listed in the PR with its reason.
  5. For each lesson that moved a block, the PR lists the order words found and resolved, and a second agent's read.
  6. No banned word and no build-log id in any lesson or in module.md; every figure's alt and description is in engine terms; tests/copy/allow/tr1 is deleted.
  7. No claim, number, pin or KC is dropped: the four content gates pass, and each lesson's JSON is at or under 40 KB.
  8. The demos and module tests for TR1 pass.

#### [ ] R-T36 · TR2's lessons in the template · L · sonnet · deps: R-T12, R-T28, R-T33
- **Goal:** Stage 3. Edit TR2's seven lessons and its module file to the authoring rules, with the openers of section 2.5's table: lessons 1 and 3 are A, lesson 4 is B, and lessons 2, 5, 6 and 7 are C. Lesson 2's level teaches slot refill and not the token budget, so it stays where it is, with one sentence that says what it shows. In lesson 6 the graded close level is the Test with the questions. Lesson 7 has no game. Remove every sentence that explains the kitchen. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/modules/tr2/**`, `tests/content/tr2-module.test.ts`
- **Accept:**
  1. Each lesson's derived opener equals its row, the openers test passes for all seven, and this task's waiting marks are removed.
  2. Lesson 1 opens on loop/first-3-gap after at most 60 words, with its reworded guess in the instrument's guess slot.
  3. Lesson 2 does not open on its level, and the sentence before the level says that it shows slot refill.
  4. Each C lesson's first part ends in something to do within 450 words.
  5. No sentence refers to a kitchen, a service or a dressing of the loop.
  6. The compiler prints no pacing warning for TR2, or each one left is listed with its reason. For each lesson that moved a block, the PR lists the order words resolved and a second agent's read.
  7. No banned word and no build-log id; figure alts in engine terms; tests/copy/allow/tr2 is deleted; no claim, number, pin or KC is dropped; the four content gates pass.
  8. At 1440 the first control of lessons 1 and 3 is within 900 px, lesson 1 is at most 12,000 px long (today 26,253), each lesson's JSON is at or under 40 KB, and TR2's demos and module tests pass.

#### [ ] R-T37 · TR5a's lessons 2 to 4 in the template · M · sonnet · deps: R-T12, R-T33
- **Goal:** Stage 3. Edit TR5a's lessons 2 to 4 and its module file to the authoring rules, as R-T10 did for lesson 1. All three are opener B, each with a primer that states the one new rule. In lessons 3 and 4 the graded levels are the Test with the questions. Page and block keep the meanings the lessons already give them: a block is a block of tokens in one group's layers, and a page is the pool's unit. Remove the sentences that explain the kitchen. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/modules/tr5a/lessons/l2-*.md`, `content/modules/tr5a/lessons/l3-*.md`, `content/modules/tr5a/lessons/l4-*.md`, `content/modules/tr5a/module.md`
- **Accept:**
  1. Each lesson's derived opener is B, the openers test passes for TR5a, and this task's waiting marks are removed.
  2. Lesson 3's Test holds its questions and the graded evict level; lesson 4's holds its questions and the graded adapters and manager levels.
  3. Block and page are each used with one meaning, and nothing in the module calls the pool's unit a block.
  4. Each lab block renders as the Build row in Keep.
  5. The compiler prints no pacing warning for TR5a, or each one left is listed with its reason. For each lesson that moved a block, the PR lists the order words resolved and a second agent's read.
  6. No banned word and no build-log id; figure alts in engine terms; tests/copy/allow/tr5a is deleted; no claim, number, pin or KC is dropped; the four content gates pass.
  7. Each lesson's JSON is at or under 40 KB, and TR5a's demos, figures and module tests pass.

#### [ ] R-T38 · TR6's lessons in the template · M · sonnet · deps: R-T12, R-T28, R-T30, R-T33
- **Goal:** Stage 3. Edit TR6's five lessons and its module file to the authoring rules, with the openers of section 2.5's table: lesson 2 is A, lesson 3 is B, and lessons 1, 4 and 5 are C. Lesson 2 has no question set: its Test is the graded exact level. Lesson 1 is where a learner first meets the rejection sampler, at the chain level in its fifth part. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/modules/tr6/**`, `tests/content/tr6-module.test.ts`
- **Accept:**
  1. Each lesson's derived opener equals its row, the openers test passes for all five, and this task's waiting marks are removed.
  2. Lesson 2 renders Run, Read, Test and Keep, and its rail reads 'Test · graded level'.
  3. Each C lesson's first part ends in something to do within 450 words.
  4. Draft, target, accept and residual are used as section 2.7 defines them.
  5. The compiler prints no pacing warning for TR6, or each one left is listed with its reason. For each lesson that moved a block, the PR lists the order words resolved and a second agent's read.
  6. No banned word and no build-log id; figure alts in engine terms; tests/copy/allow/tr6 is deleted; no claim, number, pin or KC is dropped; the four content gates pass.
  7. Each lesson's JSON is at or under 40 KB, and TR6's demos, figure and module tests pass.

#### [ ] R-T39 · TR8's lessons in the template · M · sonnet · deps: R-T12, R-T31, R-T33
- **Goal:** Stage 3. Edit TR8's four lessons and its module file to the authoring rules, with the openers of section 2.5's table: lessons 1 and 3 are B, and lessons 2 and 4 are C. Lessons 1 and 2 have no question set: their Test is their graded level or levels. Lesson 4's only game is the graded court level, which is its Test with the questions; the lesson opens on Read. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/modules/tr8/**`, `tests/content/tr8-module.test.ts`
- **Accept:**
  1. Each lesson's derived opener equals its row, the openers test passes for all four, and this task's waiting marks are removed.
  2. Lesson 1's Test is the graded due level; lesson 2's is the graded warm and sure levels; lesson 4's is its questions and the graded court level. Each rail says so.
  3. In lesson 2 the practice levels render inline in their parts, and the dock follows the most recent run.
  4. Each C lesson's first part ends in something to do within 450 words.
  5. Open loop, closed loop and coordinated omission are used as section 2.7 defines them, with no guests, tables or court.
  6. The compiler prints no pacing warning for TR8, or each one left is listed with its reason. For each lesson that moved a block, the PR lists the order words resolved and a second agent's read.
  7. No banned word and no build-log id; figure alts in engine terms; tests/copy/allow/tr8 is deleted; no claim, number, pin or KC is dropped; the four content gates pass.
  8. Each lesson's JSON is at or under 40 KB, and TR8's demos and module tests pass.

#### [ ] R-T40 · Model cards and the worlds' claims · S · sonnet · deps: R-T04
- **Goal:** Stage 3. Rewrite the words of the six model cards and of the claims that describe the course's own worlds in engine terms. Only sentences change: no value, id, source, date or TTL. The export under public/md and public/llms.txt is generated: the merge gate recompiles it on the merged tree, and it is never merged by hand.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `content/cards/*.md`, `content/claims/worlds/**`, `content/claims/loop.yaml`, `content/claims/broken-bench.yaml`, `tests/content/cards.test.ts`, `tests/content/world-cards.test.ts`, `tests/content/claims.test.ts`
- **Accept:**
  1. No banned word or phrase in any card or claim sentence; tests/copy/allow/cards is deleted.
  2. A diff of the compiled claims shows changes to sentence fields only.
  3. Each card keeps its three parts in order and cites its claims; verify:content and verify:claims pass.
  4. tests/content/export.test.ts passes on the recompiled export.

### Stage 4: the kitchen leaves

#### [ ] R-T41 · KV page pool: the 3D rack · L · sonnet · deps: R-T18, R-T20
- **Goal:** Stage 4. It starts when the owner has answered at the look gate, or when every stage 3 task has merged, whichever comes first. Re-skin the pool's 3D scene from kit primitives, in the 3D language R-T18 set: a rack of page cells on a base plate. A selected page fans into the layers it serves, and threads run from a request's block table to its pages, which is the one thing depth shows that 2D cannot. The scene imports nothing from src/scene/props. If the owner chose The Pass at the gate, this task is dropped.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/pool/Scene3D.tsx`, `src/games/pool/scene-layout.ts`, `src/games/pool/scene-presets.ts`, `src/games/pool/cabinet.ts`, `tests/play/pool-scene.test.ts`, `e2e/pool-scene.spec.ts`
- **Accept:**
  1. The scene imports nothing from src/scene/props, and its closure is at or under 40,000 B [measured, with SHA].
  2. The rack draws every page with its state as a form (free hollow, in use solid, cached hatched, shared dotted) as well as a colour.
  3. Selecting a page fans it into its layers, and selecting a request shows threads from its block table to its pages.
  4. A page never moves: a moving page would misteach copying.
  5. Every word and number is DOM; the mirror and the 2D view are unchanged; 2D stays the default.
  6. Under reduced motion the fan is drawn at its end.
  7. The scene renders at every 3D tier, and e2e/pool-scene.spec.ts passes.

#### [ ] R-T42 · Rejection sampler: the 3D skylines · L · sonnet · deps: R-T18, R-T20, R-T30
- **Goal:** Stage 4. It starts when the owner has answered at the look gate, or when every stage 3 task has merged, whichever comes first. Re-skin the sampler's 3D scene from kit primitives as skylines: one row of bars per draft position into depth, with the output skyline settling onto the target p as rounds are drawn. The scene imports nothing from src/scene/props. If the owner chose The Pass at the gate, this task is dropped.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/verifier/Scene3D.tsx`, `src/games/verifier/scene-layout.ts`, `src/games/verifier/scene-plan.ts`, `src/games/verifier/scene-props.ts`, `src/games/verifier/scene-shots.ts`, `tests/play/verifier-scene.test.ts`, `e2e/verifier-scene.spec.ts`
- **Accept:**
  1. The scene imports nothing from src/scene/props, and its closure is at or under 40,000 B [measured, with SHA].
  2. There is one row per draft position, and the draft, target, accepted and residual parts keep their colours and glyphs.
  3. The output skyline settles onto p as rounds are drawn: one authored move, drawn at its end under reduced motion.
  4. Every word and number is DOM; the mirror and the 2D view are unchanged; 2D stays the default.
  5. The scene renders at every 3D tier, and e2e/verifier-scene.spec.ts passes.

#### [ ] R-T43 · Request path: remove the 3D scene · S · haiku · deps: R-T20, R-T29
- **Goal:** Stage 4. It starts when the owner has answered at the look gate, or when every stage 3 task has merged, whichever comes first. Delete the Request path's 3D scene and everything only it uses, mark the game as 2D in the roster and in the docs, and remove its scene spec and test. This is a mechanical removal: no other behaviour changes. It runs whichever look the owner chose, unless the owner kept the scene under decision 2.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/games/engine-floor/Scene3D.tsx`, `src/games/engine-floor/scene-layout.ts`, `src/games/engine-floor/scene-presets.ts`, `src/games/engine-floor/scene-props.ts`, `src/games/engine-floor/scene-route.ts`, `src/games/engine-floor/scene-stops.ts`, `src/games/engine-floor/scene3d.css`, `src/games/engine-floor/Game.tsx`, `packages/play/roster.ts`, `packages/play/engine-floor/entry.ts`, `docs/ARCHITECTURE.md`, `docs/GAMES.md`, `tests/play/engine-floor-scene.test.ts`, `e2e/engine-floor-scene.spec.ts`, `e2e/lesson-games-scene.spec.ts`, `tests/play/roster.test.ts`
- **Accept:**
  1. The seven scene files, tests/play/engine-floor-scene.test.ts and e2e/engine-floor-scene.spec.ts are gone, and nothing imports them.
  2. The build has no scene chunk for engine-floor, and the game shows no 3D switch.
  3. The roster says has3d: false, and the roster test, ARCHITECTURE section 6.1 and GAMES.md agree: five 3D games and four 2D.
  4. verify:games and verify:bundle pass with no edit to a gate script or a budget.
  5. The remaining e2e specs pass.

#### [ ] R-T44 · The kitchen leaves the tree · M · sonnet · deps: R-T19, R-T28, R-T41, R-T42, R-T43
- **Goal:** Stage 4, and the one step after which the two looks can no longer be compared in one tree. It starts when the owner has answered at the look gate, or when every stage 3 task has merged, whichever comes first. Before deleting, list every importer of each file and confirm that it is gone or moved: 25 files imported the loop's kitchen layout at the start of the wave. Then delete the loop's kitchen layout and kitchen scene, the old game shell if no game uses it, the front page's landmark anchors, the kitchen prop kit, and the kitchen scene, specimen, lamps, pools, textures and environment, with their tests. Remove bloom's use. Point scene-tokens.ts at the palette without the props. Leave /design with the lane specimen and the components. If the owner chose The Pass at the gate, this task is dropped.
- **Moved ahead:** the loop's kitchen scene (`src/games/loop/Scene3D.tsx`, `scene-layout.ts`, `scene-presets.ts`, `scene3d.css`, `full/scene.ts`) and the front page's anchors left with R-T19 on 2026-11-16, because the rebuilt front page was the kitchen scene's last importer and a scene nothing loads cannot be measured by verify:bundle; the time track took the name `Scene3D.tsx` (WR-report §3).
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/play/loop/layout.ts`, `packages/play/loop/kitchen.ts`, `packages/play/loop/full/layout.ts`, `packages/play/loop/full/kitchen.ts`, `src/games/loop/Scene3D.tsx`, `src/games/loop/scene-layout.ts`, `src/games/loop/scene-presets.ts`, `src/games/loop/scene3d.css`, `src/games/loop/full/scene.ts`, `src/games/kit/GameShell.tsx`, `src/front/anchors.ts`, `tests/front/anchors.test.ts`, `src/scene/props/**`, `src/scene/KitchenScene3D.tsx`, `src/scene/KitchenSpecimen.tsx`, `src/scene/kitchen-specimen.ts`, `src/scene/KitchenNote2D.tsx`, `src/scene/kitchen.css`, `src/scene/spot-lamps.tsx`, `src/scene/spot-pools.ts`, `src/scene/textures.ts`, `src/scene/environment.ts`, `src/scene/materials.ts`, `src/scene/Lights.tsx`, `src/scene/postfx/**`, `src/design/scene-tokens.ts`, `src/pages/Design.tsx`, `vite.config.ts`, `tests/play/loop-layout.test.ts`, `tests/play/loop-full-layout.test.ts`, `tests/play/loop-scene.test.ts`, `tests/scene/kitchen.test.ts`, `tests/scene/lamp-light.test.ts`, `tests/scene/props.test.ts`, `e2e/kitchen.spec.ts`, `e2e/scene-kit.spec.ts`
- **Accept:**
  1. The PR opens with the importer list for each deleted file, taken from a grep on this task's base, and each is empty.
  2. A grep finds no import of src/scene/props, of packages/play/loop/layout.ts or kitchen.ts or their full/ twins, or of any other deleted file.
  3. The build has no scene-kit chunk, and each scene's closure is reported [measured, with SHA].
  4. verify:bundle passes with no edit to BUDGETS, to the gate script or to tests/bundle. If a row cannot pass without such an edit, the task stops and reports.
  5. three-vendor is at or under its row in the ledger [measured].
  6. /design shows the lane specimen in 3D beside its 2D twin and the components, and nothing of the kitchen.
  7. lint, typecheck, bun test and the e2e smoke project pass.

#### [ ] R-T45 · Show on the machine: a figure can load its state into the dock · M · sonnet · deps: R-T12, R-T22, R-T36
- **Goal:** Stage 4. A stretch task, and the first to cut if the wave runs long: if it is cut, drop it from the deps of R-T46. Give the figure block an optional replay field (a game, a level and a list of actions), which the pure sessions already support. A figure with it gains a Show on the machine button that loads that state into the lesson's dock, and Back to my run returns. Use it in two TR2 lessons. This is an optional key on an existing block, not a ninth block type.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `packages/schema/content.ts`, `schemas/**`, `scripts/content/directives.ts`, `src/content/render/Blocks.tsx`, `src/content/render/Dock.tsx`, `content/modules/tr2/lessons/l1-one-step-five-calls.md`, `content/modules/tr2/lessons/l3-async-scheduling-closes-the-bubble.md`, `docs/DECISIONS.md`, `tests/content/figure-replay.test.ts`, `tests/schema/**`
- **Accept:**
  1. The schema accepts an optional replay on a figure and rejects an unknown game, level or action; verify:schema passes and the exported schemas are regenerated.
  2. The compiler replays each figure's actions on the pure session and fails on a log that does not replay.
  3. Show on the machine loads the figure's state into the dock, and Back to my run restores the learner's own run unchanged.
  4. Below 80rem the button is absent and the figure is static.
  5. TR2 lessons 1 and 3 each use it once.
  6. A note under D-016 records that the block types are still eight.
  7. verify:content passes and each lesson's JSON stays at or under 40 KB.

#### [ ] R-T46 · Component names follow the system · M · haiku · deps: R-T21, R-T22, R-T23, R-T24, R-T25, R-T26, R-T27, R-T29, R-T30, R-T31, R-T44, R-T45
- **Goal:** Stage 4. A mechanical rename, done once every surface has landed, so that the code and DESIGN.md use the same names: Ticket becomes Sheet, Stub becomes PrimaryButton, PrinterTape becomes ReadoutStrip, TapeLabel becomes Label, Board becomes Header. Delete the components nothing uses any more (Bell, Pan, Rail, StationLight, PrintingDots). Rename only: no markup, style or behaviour changes. If the owner chose The Pass at the gate, the deletions are skipped and the renames still run.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `src/design/components/**`, `src/design/components.css`, `src/**/*.tsx`, `tests/design/**`
- **Accept:**
  1. A grep finds no export named Ticket, Stub, PrinterTape, TapeLabel, Board, Bell, Pan, Rail, StationLight or PrintingDots under src/design.
  2. The class prefixes of the renamed components follow their new names.
  3. typecheck and lint pass, and the unit and e2e suites pass with changes to imports and selectors only.
  4. Each route's bundle size is within 200 B of its size before the rename [measured].
  5. The rename is one commit per component, so a reviewer can read each as a pure rename.

### Stage 5: the sweep

#### [ ] R-T47 · The first-visit walk, the per-screen checks, the keep-list and the baselines · M · sonnet · deps: R-T32, R-T35, R-T36, R-T37, R-T38, R-T39, R-T40, R-T46
- **Goal:** Stage 5. Automate section 5 of the brief. One spec walks a first visit with an empty ledger through checkpoints CP1 to CP17, at 1440 x 900 and 390 x 844, by pointer and again by keyboard. A second set of checks runs on every route. A third spec holds the keep-list of felt moments and the time to the first payoff (section 5.4). Confirm that the openers and vocabulary tests of R-T12 have no waiting mark left. Re-shoot and extend the screenshot baselines.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `e2e/first-visit.spec.ts`, `e2e/keep-list.spec.ts`, `e2e/support/walks.ts`, `e2e/walks.spec.ts`, `e2e/routes.ts`, `e2e/screenshots.spec.ts`, `e2e/screenshots.spec.ts-snapshots/**`, `playwright.config.ts`
- **Accept:**
  1. e2e/first-visit.spec.ts asserts CP1 to CP17 at both sizes, by pointer and by keyboard, and runs in the smoke project.
  2. On every route of e2e/routes.ts: the header's Continue equals nextStep and so does every control labelled Continue or Start, at most one amber fill per viewport, no banned word or phrase in text, alt or aria labels, no build-log id, no sideways scroll at 320, 360 and 390, and nothing sticky at 844 x 390 or 320 x 256.
  3. CP14 holds: the header, /, /map, /m/tr1, /today and /evidence give the same Continue. CP16 holds for a lesson opened out of order. CP17 holds: no lock, disabled commit or task id on any lesson, checked over all 27.
  4. e2e/keep-list.spec.ts reaches each of the five moments of section 5.4, finds the first named moment within six actions of landing on /, and finds each game's first named moment inside its scripted first run.
  5. tests/content/openers.test.ts and tests/content/vocabulary.test.ts pass for all 27 lessons with no waiting mark left in either.
  6. The per-screen length and position checks of section 5.2 are asserted for the front page, a module, one lesson of each opener and each game.
  7. Baselines exist for the front page (first visit and returning), TR5a lesson 1, TR1 lesson 1, KV page pool, Request path and Course, each at 1440 and 390, and the PR lists every new or changed image for the owner's review.
  8. The network spec still shows no third-party request.

#### [ ] R-T48 · Accessibility sweep of the surfaces the wave touched · M · sonnet · deps: R-T47
- **Goal:** Stage 5. Hold the redesigned surfaces to WCAG 2.2 AA before the finish review: axe at three widths, a keyboard walk of every game and of a lesson of each opener, focus never hidden under a sticky bar, the short-viewport rule, popovers that can be dismissed, target sizes, the forced-colours mapping for the new components, and reduced motion. Fix what is found in the two stylesheets this task owns, send anything else back to the task that owns the file, and list anything left for W3-T11 and W3-T12.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `e2e/a11y.spec.ts`, `e2e/reduced-motion.spec.ts`, `e2e/keyboard-loop.spec.ts`, `e2e/walks.spec.ts`, `src/design/base.css`, `src/design/components.css`
- **Accept:**
  1. axe finds zero serious or critical violations at 320, 360 and 1280 px on every route the wave touched.
  2. Every game, a lesson of each opener and Review can be completed by keyboard alone.
  3. With the lesson's sticky strip, foot bar and dock present, a focused control is never covered (WCAG 2.4.11), by assertion in the keyboard walk.
  4. At 844 x 390 and at 320 x 256 nothing is sticky or pinned, every page reflows to one column, and no content is lost (WCAG 1.4.10).
  5. A lesson's claim marks are links, a tagged number is not a tab stop, and no popover opens on focus alone. Every popover is dismissible and returns focus.
  6. The focus ring is visible against the ground, paper and the amber button, and is never amber.
  7. Targets are at least 24 px, and primary actions at least 44 px.
  8. The new components have a forced-colours mapping, and the more-contrast variant's pairs pass verify:tokens.
  9. Under reduced motion every duration is 0 and every state is drawn at its end.
  10. Each finding is fixed, or listed in the wave report for W3-T11 or W3-T12.

#### [ ] R-T49 · Docs written from the built world · M · sonnet · deps: R-T47
- **Goal:** Stage 5. Bring the documents in line with what was built. GAMES.md describes each game's diagram, cameras and materials in Data Book's terms, and keeps the kitchen only as a history table. WORLD.md section 7 says how the world appears. ARCHITECTURE's route labels, game table, starting tier, front-page sections, the lessons table of the compiled map and the two reveal kinds follow the build. PRODUCT.md gains two proposed principles for the owner to confirm. The wave report records what moved and the measured budgets.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `docs/GAMES.md`, `docs/WORLD.md`, `docs/ARCHITECTURE.md`, `docs/waves/WR-report.md`, `PRODUCT.md`, `README.md`, `content/README.md`
- **Accept:**
  1. No document uses a kitchen name as a current name; the working names are no longer used as shorthand.
  2. GAMES.md sections 0, 2.3 and 2.6 and each built game's scene block describe the diagram, the cameras and the materials as built, and section 2.2 describes the two reveal kinds.
  3. ARCHITECTURE section 6.1 lists five 3D games and four 2D, section 6.6 says where a phone starts, and section 4 describes the lessons table and what 'done' means.
  4. PRODUCT.md gains 'The engine's name is the name' and 'One way on' as proposed principles marked for the owner's confirmation, and its first principle is reworded to 'play the mechanism before reading it, where the play can succeed', also marked. Nothing else in it changes.
  5. docs/waves/WR-report.md has a table of every budget [measured, with date and SHA] beside its gate and its ledger row, and lists each task with what it changed.
  6. Every number in the docs carries its tag, and tests/docs pass.

#### [ ] R-T50 · Finish review, DESIGN.md and the cold-test pack · M · opus · deps: R-T48, R-T49
- **Goal:** Stage 5. Run impeccable's finish review on the front page, TR1 lesson 1, TR5a lesson 1, each of the five games and Course, at 1440 and 390, and do its material fixes. The review looks hardest at what would make the result read as a default chart: the one marker, the dimension lines, the source popover and whether the 3D reads as the same diagram. Then have the documenter rewrite DESIGN.md and its sidecar from the built world. Confirm that the guard's allowlist is empty. Hand the owner the cold-test pack, and open the wave's pull request.
- **Read:** REDESIGN.md §1 and §2.1, the sections the goal names, and the records it cites.
- **Files:** `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/**`, `tests/design/design-md.test.ts`, `tests/copy/no-kitchen.test.ts`, `tests/copy/allow/**`, `docs/waves/WR-report.md`, `docs/DECISIONS.md`
- **Accept:**
  1. Each reviewed surface has a verdict in the reviewer's own word, recorded in the wave report and under D-062, with its open findings listed.
  2. Material fixes are done within two rounds, or listed for the owner.
  3. DESIGN.md is rewritten from the built world with Data Book as its North Star and the named rules of section 2.8, and tests/design/design-md.test.ts passes.
  4. tests/copy/allow/ is empty, and the guard passes.
  5. The wave report holds the cold-test pack: the script of section 5.1, and a sheet with the five items of section 5.5, among them 'finishes the first run of five named lessons without scrolling into Read' and the three delight questions. It says what happens to a lesson that fails. No agent simulates it.
  6. The report records the owner's answer at the look gate, or that the default was taken, and what was built on it.
  7. lint, typecheck, bun test, build, verify:all and the e2e suite pass, and every gate table holds wave-2's values or stricter.
  8. The wave's pull request is open and not merged, and it lists the ten owner decisions of the brief's section 6 with the default taken for each.

---

## W3: the capstone, polish and launch

**Exit criteria:** The capstone is live, every budget in A§11 passes, the claims audit is clean, and the site launches at its domain.

#### [ ] W3-T01 · Owner: choose the three commit pairs · S · owner · deps: W2-T41
- **Candidates** (research/upstream-vllm.md, capstone notes):
  - async scheduling off against on, across v0.13.0 and v0.14.0;
  - MRV1 against MRV2 through `VLLM_USE_V2_MODEL_RUNNER`, at one commit or across v0.28.0 and v0.29.0;
  - the KV-offload layout change across v0.11.x and v0.12.0.
  Upstream's magnitudes are [unverified] on learner hardware.
- **Accept:**
  1. Three vLLM commit pairs with a known delta are recorded in `course.lock.json` (O-6), with dates and the expected direction of each delta.
  2. The owner captures, annotates and publishes each pair's reference traces on the reference 4090 (and the H100 where the pair has an H100 side), SHA-256-pinned and dated as in W2-T21, for the capstone page's Trace attribution cases (CAPSTONE §5, §7).

#### [ ] W3-T02 · Capstone harness in the grader · L · sonnet · deps: W3-T01
- **Goal:** `labs/gpu/capstone`:
  - It installs both commits in the vLLM environment, or a variant of it.
  - Both runs go under one challenge, with the same seeds, and capture traces and benchmark logs.
  - It computes the delta with a bootstrap interval and goodput at SLO by TR8's rules.
  - The roofline explanation is a structured form.
- **Accept:**
  1. Synthetic paired fixtures pass.
  2. Pairs run on different seeds fail binding.

#### [ ] W3-T03 · The capstone in the browser · M · sonnet · deps: W3-T02, W2-T20
- **Goal:** The capstone's browser part uses the instrument frame and the lesson template (REDESIGN.md §2.5 and §2.6). The capstone page:
  - verify both receipts;
  - recompute the delta and its interval;
  - attribute the pairs' pinned traces with Trace attribution;
  - check the roofline form against the S5-style card with atlas numbers.
- **Accept:**
  1. The page passes a keyboard walk and axe.
  2. A roofline answer that breaks the floor is rejected, with the bound shown.

#### [ ] W3-T04 · Capstone content · M · sonnet · deps: W3-T03
- **Goal:** The capstone's module page and guide, written to the authoring rules of REDESIGN.md §2.5 with the lesson template. Every capstone also prices itself with kernelspace's T7.L2 and T7.L4 (catalog §2).
- **Accept:** The checks of W1-T15 pass.
- **For the guide's author, before the `attribute` step is written:** to test a hypothesis about where the time goes, change one factor, check that the output is still correct, check that the metric the hypothesis predicted has moved, and only then compare latency with the profilers off; if the metric moved and the latency did not, either another bottleneck has taken its place or the hypothesis was incomplete. The method is set out at length in the appendix "Measuring and Analyzing GPU Kernel Performance" of "Modern GPU Programming For MLSys" (https://mlc.ai/modern-gpu-programming-for-mlsys/appendix/benchmarking_gpu_kernels.html, read 2026-11-18). Cite it; copy none of its words, because no licence was found for it. Question for the owner, not a change to W3-T02: should the harness alternate the two sides within a run, which would be a design change and cost GPU hours?

#### [ ] W3-T05 · Evidence Pack · M · sonnet · deps: W2-T41
- **Goal:** A one-file HTML export of credited artifacts (A§7.5). It is previewed, makes no requests, and describes artifacts rather than the learner.
- **Accept:**
  1. Opened offline, the file makes zero requests.
  2. Its content matches the ledger's credited events.

#### [ ] W3-T06 · Change cards, the upstream watcher and the re-pin runbook · M · sonnet · deps: W2-T41
- **Goal:**
  - `upstream-watch.yml` (weekly, with a generic User-Agent) opens an issue with draft change cards and never merges.
  - `/changes` renders change cards.
  - `docs/RUNBOOK-repin.md` describes the quarterly re-pin (D-035).
- **Accept:**
  1. A fake newer release in a fixture produces the expected draft cards.
  2. The runbook names every pin-dependent shim.

#### [ ] W3-T07 · Search · S · sonnet · deps: W2-T41
- **Goal:** A ⌘K search over a build-time index, using `fuse.js` 7.5.0, loaded lazily. The index covers `src/copy/terms.ts` as well as the lessons.
- **Accept:**
  1. The index is at most 20 KB gz, and a search for a term in `src/copy/terms.ts` finds its definition.
  2. Search works by keyboard and passes axe.

#### [ ] W3-T08 · The visual identity across pages · M · sonnet · deps: W0-T25, W2-T41
- **Goal:** Largely discharged by wave R. A check that every page that W2 and W3 add follows DESIGN.md: its components and layouts, the tokens only, and the naming policy (D-063). Fix what misses, and take the owner's review of the baselines that W2 and W3 add.
- **Accept:**
  1. `verify:tokens` passes, and every W2 and W3 page uses only `src/design`'s roles and components.
  2. Baselines for the surfaces W2 and W3 add are shot and reviewed by the owner.
  3. There is no regression in axe or the budgets.

#### [ ] W3-T09 · The visual identity across scenes · M · sonnet · deps: W3-T08
- **Goal:** Largely discharged by wave R. A check that every scene W2 adds follows DESIGN.md: materials, post-processing use within A§6.5's budget and camera framing, and the owner's review of the scene baselines that W2 adds.
- **Accept:**
  1. Scene budgets hold.
  2. Contrast pairs for in-canvas marks pass.
  3. The owner has reviewed the baselines of the scenes W2 adds.

#### [ ] W3-T10 · Performance pass · M · sonnet · deps: W3-T09
- **Goal:** Measure every A§11.1 budget, including frame times on the reference devices, and fix what misses.
- **Accept:** A table of the measurements with dates is in `docs/waves/W3-report.md` [measured], and every gate passes.

#### [ ] W3-T11 · Accessibility sweep · M · sonnet · deps: W3-T09
- **Goal:** Full axe at 320, 360 and 1280 px on every route, keyboard walks of every game, the reduced-motion checks, and the target-size assertions.
- **Accept:** Zero serious or critical violations, and every walk passes.

#### [ ] W3-T12 · Owner: screen-reader pass · S · owner · deps: W3-T11
- **Accept:** Notes are in the W3 report, and the issues found are fixed or carried over.

#### [ ] W3-T13 · Claims and copy audit · M · sonnet · deps: W3-T08
- **Goal:**
  - Every number is tagged.
  - Every claim has a live source, or is marked stale.
  - Synthetic labels are present.
  - The audit's list adds the copy guard (`src/copy/banned.ts`, `tests/copy/no-kitchen.test.ts`) and the build-log scan, and one read of every lesson for kitchen sentences that the guard cannot see.
  - No copy claims enrollment, testimonials or outcomes that do not exist (PRODUCT.md, "Missing, and not to be invented").
- **Accept:**
  1. `verify:numbers` and `verify:claims` pass.
  2. The audit list is in the W3 report.

#### [ ] W3-T14 · Offline shell (optional) · S · sonnet · deps: W3-T10
- **Goal:** A service worker that precaches the shell, with kernelspace's kill switch and a network-first `index.html`.
- **Accept:**
  1. Today works offline after one visit.
  2. The kill switch unregisters the worker (e2e).

#### [ ] W3-T15 · About, privacy and licences · S · sonnet · deps: W3-T13
- **Goal:** `/about`: what each world models and ignores, with each model's card printed in full (lessons no longer inline it), the tag legend, claims and sources, the privacy statement (nothing collected), and the licences per O-3.
- **Accept:**
  1. Every world's card is printed in full, and the tag legend is on the page.
  2. LICENSE, LICENSE-CONTENT and NOTICE match O-3's answer.

#### [ ] W3-T16 · Owner: launch · S · owner · deps: W3-T10, W3-T11, W3-T12, W3-T15
- **Accept:**
  1. Pages is enabled for the repo (O-2), its custom domain is `enginespace.naigap.com` with HTTPS enforced (D-058), and the repository variable `PAGES_ENABLED` is `'true'`.
  2. The repo visibility is the owner's choice.
  3. The edition-1 tag is pushed by the owner.

#### [ ] W3-T17 · Final review · S · opus · deps: all of W3
- **Accept:**
  1. A whole-course review against PRODUCT.md's four outcomes, the invariants (A§1) and the decisions.
  2. Issues are filed for what remains.
  3. The final PR is open for the owner.
