# enginespace: build tracker

**Status:** proposed backlog. W0's 24 tasks and W1's 35 build tasks are built, and both waves merged into `main` on 2026-11-09 with PR #2 ([waves/W0-report.md](waves/W0-report.md), [waves/W1-report.md](waves/W1-report.md)). W1b's exit review turned their `[=]` markers `[x]`, but for the two tasks with a check that waits on the owner, W0-T25 (its first) and W1-T12 (its fourth), which keep `[=]`; W1's two owner tasks wait on the owner too. W1b, W1's carry-over, built its 15 tasks into `wave-1b`, which waits for the owner's merge ([waves/W1b-report.md](waves/W1b-report.md)). There `bun scripts/verify-kc.ts --final` passes, so W1-T38's open check holds and W1-T38 shows `[=]`. The other tasks show `[ ]`: a wave's exit review sets its markers. On 2026-11-19 the markers of the grader track (W2-T01 to W2-T11, W2-T13, W2-T19, W2-T28 and W2-T43) were set to the tree: `[x]` where every check is met by files, and `[~]` with a State line where one waits for the owner, a GPU or a later task, and wave 1 of the second plan was recorded as the W2b section. **Date:** 2026-11-03, markers updated 2026-11-09, W1b added 2026-11-09, wave R added 2026-11-15. **Source:** [ARCHITECTURE.md](ARCHITECTURE.md) (cited as A§n) and [DECISIONS.md](DECISIONS.md) (D-nnn, O-n). Credit rules come from `docs/ASSESSMENT.md`, written in parallel. The look was The Pass (D-047): W0-T05 applied its direction contract, and W0-T25 documented the built world in DESIGN.md. Wave R, the redesign of 2026-11-15, replaces it with Data Book (D-062, the owner's decision at the look gate on 2026-11-16) and makes the engine's term the only name (D-063); its section below carries `docs/waves/wr-tasks.json`.

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
7. **Numbers.** Tag every number in content and docs as [measured], [derived], [estimated], [synthetic] or [unverified], and date every upstream fact. In content, a number that the course's own model printed is [synthetic], never [measured]. In docs, a statistic of the course's own software (a band over seeds, a test's rate, a byte count) stays [measured] and names the tool, the day and the commit. In content, put facts in claims (A§4.4). Never invent a fact. If one cannot be sourced, mark it [unverified] and list it in the PR.
8. **Web requests.** Send a generic User-Agent, and never send the owner's name or email in a header, URL or payload. The site itself makes no third-party request.
9. **Look.** The visual identity is Data Book (D-062). Use only the token roles in `src/design/tokens.ts` and the components in `src/design/components`. Put no literal colour or font name outside `src/design`. Names follow GAMES.md §2.6: the engine's term is the only name (D-063). D-062 is the owner's decision (the look gate, 2026-11-16, "data book for sure"), and the kitchen's files left the tree at stage 4 of wave R (R-T44).
10. **Done means:**
    - `npm run lint`, `npm run typecheck`, `bun test`, `npm run build` and every `verify:*` the task touches pass;
    - the PR lists each acceptance check with its evidence;
    - you commit on the task branch, open a PR into the wave branch, and never merge.
11. **Never lowered.**
    - Never raise or add a bundle budget, and never change a threshold, a tolerance, a timeout, a retry or a skip of an existing test, a pacing or opener constant under `scripts/content/`, the blind-probe bound under `scripts/games/`, a constant of `tests/seeds.ts`, `MAX_PLAN_NUMEL` or a screenshot baseline, except for the change the task itself names.
    - Never add an entry to `scripts/gate/known-red.json`; an entry only leaves it, by the rule of the task that fixes it.
    - Its `host` list (at most six) holds the tests the build host cannot pass and that were judged, by measurement, a limit of that host and not of the product: each names its measured reason, the commit at which it was shown to fail as first written, and the date, and the gate prints every one under "Not checked on this host" on every run. These tests run on a runner only in the browsers job of `.github/workflows/nightly.yml`, and that workflow is off on its schedule until the owner turns it on, so today no machine checks them.
    - Where a task edits an expected count, the edit is named in the task and the count stays exact.
12. **No quiet skip.** A new test that needs something the machine may lack (torch, a browser engine, the network) fails where that thing is expected (`CI=true`, or the named environment) and says so. It never skips there.
13. **Paths stay private.** A commit, a report, a log and a pull request hold repository-relative paths only: no home-directory path, no scratch-directory path, no session id and no login name. Before a commit, grep the diff for them.
14. **Toolchains.** Cargo and rustup run with `RUSTUP_AUTO_INSTALL=0`. Python runs only through `uv run --project`, with `UV_OFFLINE=1` and `UV_PYTHON_DOWNLOADS=never`.
15. **Downloads.** An agent installs no wheel and downloads no model, bank or source tree without the owner's leave.
16. **Merge.**
    - One branch at a time goes through the lock-serialized merge gate, and no batch is run.
    - A task's commit subjects begin with its own task id.
    - Tracker markers move only in a wave's exit report, in the same commit that adds the ids to `MERGED` in `tests/ci/workflows.test.ts`. The exceptions are the tasks that name a marker in their own text.
    - When the owner merges a wave's pull request into `main`, the later wave branch takes `main` in by a merge commit, not a rebase, because the audit of claimed merges reads merge commits.
17. **Kit lock.** `src/games/kit/` and `src/design/` are changed by one task at a time, in a commit of their own that names every game it touches. A fix round that must change the kit waits for the kit task in flight and merges after it. Every kit commit runs every game's primary spec and its nightly-width walks. No game, lesson or lab task changes the kit.
18. **Nightly width.** Nightly width is the smoke project with `ES_E2E_NIGHTLY=1`: the walks at 360 and 1280 px, and `a11y` and `screens` at 320, 360 and 1280 px. A change to a game, a lesson or the kit runs it before it merges.
19. **Offline.**
    - On the build computer a command runs only with `UV_OFFLINE=1`, `UV_PYTHON_DOWNLOADS=never`, `HF_HUB_OFFLINE=1` and `RUSTUP_AUTO_INSTALL=0`, and cargo with `--offline`, in the existing locked CPU environment and with no other `uv sync`.
    - A command that fetches a model, a dataset or a GPU environment is checked by reading it against the manifest and the command's `--help`, and is never run.
    - A report says of each printed command whether it was run or read and not run.
20. **Heavy runs.**
    - Agents share a few slow cores, so a task never pins every core, never starts a busy loop, and never runs 10,000 seeds or repeats a spec 20 times or more on them.
    - Contention is simulated with Chromium's CPU throttling through CDP at rates 4 and 6.
    - For a 10,000-seed run, a `--repeat-each` of 20 or more, or a run on a built site on four performance cores, the task writes the command and the coordinator runs it under the gate's lock before the task merges. The task's report quotes the run.
21. **Defect classes.** Anything a learner plays carries a test for each class that fails before the fix.
    - A, nothing moves: the rectangle of every control, readout and stage is the same before and after the press that opens something, the commit, the first move, the first draw and the result.
    - B, in view: after every move, Tab and Enter, the control of the current decision is wholly in the viewport and topmost at its centre, at the twelve sizes from 1440x900 to 640x400; touch targets are at least 44 px; the goal's number is visible without opening a disclosure.
    - C, keys: Enter or Space pressed twice within 500 ms, or held, applies nothing the learner did not aim at, and after a commit focus lands on a heading or a value.
    - D, one seed: from Start to the result of a graded run no control, key, reload, Back, Forward, edited URL or second tab gives a second seed in an attempt that counts.
    - E, true in every state: every sentence that states a fact about the run is built from the state and compared with an independent recomputation on 200 random walks, and no readout holds the answer to its guess.
    - F, no self-scroll: `window.scrollY` is unchanged for 5 s with no input at 360x800 and 390x844, under CDP throttling 4x, and every `focus()` uses `preventScroll`.
    - G, reduced motion: with `prefers-reduced-motion`, after every zoom, pan, step, move and result no animation or transition runs.
    - H, nightly size: seeded properties are written in chunks of 100 seeds, and each new spec passes 5 of 5 at `--retries=0` and 20 of 20 under CDP throttling 4x.
22. **Waiting states.** No learner-visible line holds "owner", a task id, a decision id or a level id. A waiting line says in plain words what is missing and what the learner can do now. Every table with a dash carries one caption sentence saying why the cell is empty and that the lab fills it with the learner's own number. A module whose browser part runs on model-made data says so on its first screen.

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
| W2b | Wave 1 of the second plan: the gate, the defects, the tooling, TR0 (6 tasks on haiku) | 52 | 15 | 35 | 2 | 0 | 12 |
| WR | The redesign: engine names, one way on, the lesson template, one game frame, Data Book (2 tasks on haiku) | 50 | 8 | 28 | 14 | 0 | 16 |
| W3 | The capstone, polish and launch | 17 | 7 | 9 | 1 | 3 | 1 |
| **Total** | | **241** | **54** | **137** | **50** | **9** | **36** |

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

#### [x] W2-T01 · Schemas for receipts, bundles, challenges and traces; the vectors · M · sonnet · deps: W0-T07
- **Goal:**
  - zod schemas for `receipt@1`, `bundle@1`, the challenge and `trace@1`.
  - `scripts/export-schemas.ts` writes them to `schemas/*.schema.json`.
  - `schemas/vectors/{rng,subseed,challenge,canonical,sha256}.json` are written from TypeScript.
  - `verify:schema` and the TypeScript side of `verify:vectors` (A§9.6, A§9.8, D-030).
- **Accept:**
  1. The export is deterministic, and a drift fails.
  2. The vectors cover seed 0, 0xffffffff, Unicode in canonical JSON, and floats.

#### [=] W2-T02 · Grader core · L · sonnet · deps: W2-T01
- **State (2026-11-22):** built; the open check of 2026-11-19, `selftest --gpu`, closed with W2b-T37, which made it fail in one line with no CUDA (docs/waves/W2m1b-report.md).
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

#### [x] W2-T03 · Fingerprint and privacy · M · sonnet · deps: W2-T02
- **Goal:** `fingerprint.py` per A§9.5: NVML through `nvidia-ml-py` when it is present, an `nvidia-smi` CSV fallback, and torch; for engine labs, the effective engine configuration from the engine's log and configuration dump (runner, graph mode after downgrade, async scheduling, attention backend, `max_num_batched_tokens`, `max_num_seqs`; ASSESSMENT §5.6). Redaction, and `doctor` printing exactly the fields a receipt would record.
- **Accept:**
  1. Tests use recorded `nvidia-smi` output and a fake NVML.
  2. A test seeds a hostname, user name, UUID, serial, absolute path and `HF_TOKEN` into the environment, and none appears in the output.

#### [~] W2-T04 · Engine environments · M · sonnet · deps: W2-T02, W1-T02
- **State (2026-11-19):** built; open check: the Dockerfile builds are the owner's smoke run, closes with W2-T12.
- **Goal:** `labs/envs/{cpu,vllm,sglang,nano-vllm}`, each with:
  - a `pyproject.toml` and `uv.lock`;
  - a hashed `requirements.txt` from `uv export`;
  - a `Dockerfile`.
  `doctor` checks the pins against `course.lock.json`, and the host driver against the pin's requirement: R580 or newer for v0.33.0's CUDA 13 wheels (A§9.2, D-026, D-035).
- **Accept:**
  1. `uv lock --check` passes per environment in `labs.yml`.
  2. `doctor` flags an off-pin vLLM in a fake environment, and an R570 driver against a CUDA 13 pin, in recorded `nvidia-smi` output.
  3. The Dockerfile builds are left to the owner's smoke run (W2-T12).

#### [x] W2-T05 · References manifest and `fetch` · S · sonnet · deps: W2-T02
- **Goal:** A schema for `labs/references/manifest.json`, and `enginespace fetch` with SHA-256 checks, resume and a generic User-Agent (A§9.7).
- **Accept:**
  1. A hash mismatch aborts and deletes the partial file (local file server).
  2. The User-Agent is `enginespace-grader/<version>` (test).

#### [x] W2-T06 · Challenge issuing and `/receipts` · M · sonnet · deps: W0-T11, W2-T01
- **Goal:** `/receipts`: choose a lab and stage, issue a token (a `challenge` event), copy it, list receipts, and open a receipt's detail at `#<sha256>` (A§8.4).
- **Accept:**
  1. Tokens decode with the shared codec.
  2. Expired and used tokens are shown as such.
  3. The page passes a keyboard walk and axe.

#### [=] W2-T07 · Receipt worker and import · M · sonnet · deps: W2-T06
- **State (2026-11-22):** built; the open check of 2026-11-19, the receipt event that froze the verdict, closed with W2b-T23, which computes the verdict on read (docs/waves/W2m1b-report.md).
- **Goal:** `receipt.worker` runs A§8.5's rules 1-6: caps (`DecompressionStream` with a byte counter), zod, artifact hashes, binding, grader identity against the published list, and pins. Import works by drop or by file picker, and the parsed receipt and its report are stored.
- **Accept:**
  1. Oversized and zip-bomb fixtures abort with a message.
  2. A tampered hash fails integrity.
  3. A reused token fails binding.
  4. An unknown grader build gives `gpu-unverified`.
- **Open check (second review of W2's rest work, note 7, first half):** `src/receipts/keep.ts` (near line 54) freezes the verdict into the credited receipt event at import. A verdict is worked out when it is read (A§8.5 rule 10), so the event has to keep the receipt and its report and not the verdict. The receipts page reads it, so the redesign's rebuild of that page takes this with it.

#### [~] W2-T08 · Verification rules and the forged bestiary · L · sonnet · deps: W1-T08, W1-T31, W2-T07, W2-T09
- **State (2026-11-22):** built; open check: the owner's real fixtures, closes with W2-T12. The other open check closed with W2b-T24.
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

#### [x] W2-T09 · Hardware atlas claims · M · sonnet · deps: W0-T08
- **Goal:** `content/claims/hardware/*.yaml` for the GPUs learners rent or own: RTX 4090, RTX 5090, L4, L40S, A100 40/80 GB, H100 PCIe and SXM, H200 (a Modal `gpu="H100"` request may land on one, sglang C4), and RTX PRO 6000 where it is rentable. Each records memory bandwidth, dense peak by precision and capacity. The physics floors use them, keyed by the device name the fingerprint reports.
- **Accept:**
  1. `verify:claims` passes.
  2. Every value quotes the vendor's datasheet, with an accessed date.
  3. Derived values recompute.

#### [x] W2-T10 · Kit packer, grader wheel and manifest · S · sonnet · deps: W1-T11, W2-T02, W2-T04
- **Goal:** Pack the GPU kit zip (grader, environments, GPU labs, runners, references manifest) and the grader wheel into `public/labs/` with a SHA-256 manifest. Publish the list of grader versions and their `sourceSha256` values for the site (A§9.3).
- **Accept:**
  1. The zips are reproducible.
  2. The site's published-grader list matches the wheel's computed source hash.

#### [~] W2-T11 · Rented-GPU runners · M · sonnet · deps: W2-T04
- **State (2026-11-19):** built; open check: the runners' docs wait for a rented GPU run, closes with W2-T12.
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

#### [=] W2-T13 · Sim: the tensor model · M · sonnet · deps: W0-T12
- **State (2026-11-22):** built; the open check of 2026-11-19, torch vectors from a build that was not the `cpu` environment's own, closed in wave 1b: the vectors are what the locked CPU environment's torch gives (docs/waves/W2m1b-report.md).
- **Goal:** A§5.8's tensor rules and grid coverage.
- **Accept:**
  1. The rules agree with PyTorch on a committed fixture set, generated once with CPU torch, with the torch version recorded.
  2. Goldens reproduce.
- **Open check (second review of W2's rest work, note 9):** `tests/fixtures/tensor/torch-vectors.json` was generated by torch 2.14.0+cu130 run on the CPU, and not by the `cpu` environment's own build. Sync `labs/envs/cpu` and regenerate the vectors from it, with that build recorded.

#### [=] W2-T14 · Tensor views (`shape-shifter`): session, 2D view and mirror · M · sonnet · deps: W0-T14, W2-T13
- **Goal:** GAMES.md §4's levels: `views`, `stride-zero` and `three-d` for practice, and `fewest` and `grid` graded. The game's title is Tensor views and its role line is "You plan the reshape." The 2D view is the shape and stride table beside the buffer strip, in the instrument frame. It is built in the instrument frame (REDESIGN.md §2.6) and supplies the frame's five exports: `Diagram2D`, `DockView`, `parts`, `moments` and `firstMove`, with the role line and the goal line in `packages/play/<game>/copy.ts`, where the engine's term is the only name (D-063).
- **Read:** REDESIGN.md §2.6 and §3.5; GAMES.md §2.6 and §4.
- **Accept:**
  1. The game can be completed by keyboard.
  2. The fewest-copies bar matches the model's optimum.
  3. `verify:games` passes.
  4. The frame's five exports exist, each level has a goal line with its number, and the first run names the parts before it asks for a guess.

#### [ ] W2-T15 · Tensor views (`shape-shifter`): the 3D scene · L · sonnet · deps: W0-T15, W2-T14
- **State (2026-11-22):** not built. W2b-T26 found no camera that shows what the 2D view does not, and recommended the cut (D-074, proposed); the owner's question N3 is open (docs/waves/W2m1b-report.md).
- **Goal:** The 3D view of Tensor views: a block of cells over its buffer, with a stride-order thread through the cells, drawn from the scene kit's primitives with no props chunk. The thread re-weaves on a view, cells move on a copy, and program tiles sit over the block (A§6.1). The scene sits in the instrument frame and takes its names from the `parts` table.
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. Under reduced motion, a copy shows its final layout immediately.
  3. The scene imports nothing from `src/scene/props`, and no literal colour or font name sits outside `src/design`.

#### [~] W2-T16 · Build the Qwen3-0.6B forward pass on CPU (TR0 lab) · L · sonnet · deps: W2-T02, W2-T04
- **State (2026-11-22):** built; open check: check 1's run on the pinned weights, which is the `weights` job of `labs.yml` on the owner's dispatch; the CPU job passes on the wave's pull request. Closes with that dispatch (docs/waves/W2m1b-report.md).
- **Goal:**
  - `labs/gpu/tr0-forward`: the starter for the learner's PyTorch forward over Hugging Face weights.
  - The grader's lab module: an HF fp32 reference on the same CPU, a maximum absolute difference of 1e-3, and argmax ids at the challenge's positions.
  - Pin the Qwen3-0.6B revision in `course.lock.json`.
  - The browser re-checks against the bank once W2-T17 lands.
  - Under wave R's lab rules (REDESIGN.md §2.7 and §3.9) the lab's title is "Build ...", its page is the numbered procedure (download, edit the named file, build, drop the file, the checks), and its check labels and catches sentences are in engine terms from the start. No check id, plan or seed is a kitchen word.
- **Accept:**
  1. The reference solution passes in the `labs.yml` CPU job on the wave's pull request, and in the weights job on a dispatch.
     - Why (2026-11-19): `labs.yml` has no schedule, and the nightly workflow is off until the owner turns it on (D-052), so no nightly `labs.yml` job runs.
  2. A perturbed solution, with a wrong RMSNorm epsilon, fails.
  3. The lab's page is the numbered procedure, and its title and check labels carry no kitchen word.

#### [ ] W2-T17 · Owner: the TR0 argmax bank · S · owner · deps: W2-T16
- **Goal:** Produce the bank of argmax ids at positions whose margin passes the threshold, using HF fp32 on CPU. Publish it under `public/references/tr0/` with its SHA-256 and a manifest entry.
- **Accept:** The browser re-check passes on the reference solution's receipt.

#### [=] W2-T18 · TR0 content · L · sonnet · deps: W2-T14, W2-T16
- **Note (2026-11-19):** the dep on W2-T15 is removed. The module's lessons need the pure model, the 2D view and the lab, and none needs the 3D scene; W2-T15 is built only if W2b-T26 finds a camera worth building, and the module must not wait for a task that may never start.
- **Goal:** TR0's module and lessons: PyTorch for the Rust-first learner, and reading Triton with `TRITON_INTERPRET=1`. Triton's program model is recapped from Kernels' KN4 in under an hour (catalog §4). Written to the authoring rules of REDESIGN.md §2.5 (and `content/README.md`) from the start: an opener chosen by rule 1, guesses that each get a reveal, a Test that closes the file, and engine terms only (`src/copy/terms.ts`). Each new lesson adds its row to the openers table, and `tests/content/openers.test.ts` and `tests/content/vocabulary.test.ts` hold it.
- **Read:** REDESIGN.md §2.5 and §2.7; `content/README.md`.
- **Accept:** The checks of W1-T15 pass, and each lesson has its row in the openers table and passes the openers and vocabulary tests.

### TR3: profile a real engine

#### [~] W2-T19 · Grader: trace export · L · sonnet · deps: W2-T02, W1-T08
- **State (2026-11-19):** built; open check: the nsys table names are [unverified] until a pinned nsys has read them, closes with W2-T21.
- **Goal:** Convert torch-profiler Chrome JSON and nsys SQLite exports into `trace@1`, keeping correlation ids. Captures use `--cuda-graph-trace=node`, so graph replays show their kernels (vllm P1). The nsys table names are [unverified]: check them against the pinned nsys (2026.5.1, proposed) and record the version. Small fixture traces are committed.
- **Accept:**
  1. The fixtures round-trip.
  2. TypeScript's `traceChecks` passes on the exported fixtures (a cross-language test).

#### [ ] W2-T20 · Trace attribution (`gap-hunt`) in the frame: lanes at a desk, the list on a phone, the walkers, the registration, `attribute` as the Prove level · L · opus · deps: W2b-T100, W2b-T101, W2b-T87, W2b-T74, W2b-T78, W2b-T179
- **Kind:** build; lane 2a:TR3; merges; merges after: W2b-T79, W2b-T86.
- **Split (wave 2):** this task was one task for the Traces page, the trace generator, the gap and cause model, the pure session, the list mode and the game. It is cut: W2b-T98 (the generator's second GPU stream), W2b-T99 (the gap and cause model), W2b-T100 (the pure session), W2b-T101 (the list mode) and W2b-T102 (the Traces page) are tasks of their own, and this task keeps the game in the frame.
- **Goal:** The game a learner plays. The frame's five exports; the session's marks drive the viewer through a bridge (the viewer's own reducer is not the record); the first run's callouts anchor on the lane gutter or the table; parsing stays in a lazy chunk on the main thread, with no new worker; `pinned` and `yours` show their plain waiting lines (WAIT), for example 'Traces captured from vLLM on real GPUs are not recorded yet. Every trace here is made by the course's model of the step loop.'; the game's named moment; both registries, the record loader, the card row. A lesson's graded `attribute` block runs graded; Prove mode starts only from its own control, as Tensor views' does. The first commit is a skeleton that measures the route.
- **Read:** the rewritten brief; docs/GAMES.md 2.6 and 6; src/games/shape-shifter/ (the model); src/games/kit/Frame.tsx; e2e/shape-shifter.spec.ts, shape-shifter-sizes.spec.ts
- **Files:** src/games/gap-hunt/**; packages/play/registry.ts, src/games/registry.ts; src/pages/About.tsx; src/content/render/model.ts; tests/content/pending.test.ts; e2e/gap-hunt.spec.ts, e2e/gap-hunt-sizes.spec.ts; e2e/levels.ts, e2e/support/walks.ts, e2e/walks.spec.ts, e2e/keep-list.spec.ts, e2e/routes.ts, e2e/a11y.spec.ts, e2e/network.spec.ts; the `tests/play/*` files that count the roster's games, with their moved counts in the allow file
- **Accept:**
  1. The game can be completed by keyboard.
  2. `verify:games` passes.
  3. Synthetic traces carry their label.
  4. At 360 px, a graded `attribute` case can be completed in list mode (e2e).
  5. The tracker's four checks, the fourth being a graded `attribute` case finished in list mode at 360 px
  6. DC-A to DC-G, with DC-B's twelve sizes in `e2e/gap-hunt-sizes.spec.ts` re-run after the rebase on W2b-T86; `M`, `X` and the digits never repeat
  7. DC-G: with reduced motion a zoom cuts and nothing animates after a zoom, a pan, a mark or a result
  8. DC-D: the seed is in no attribute, text or URL (`seedInPage: false`); a passed Prove run is read as proved
  9. A scripted first run of `read` reaches the named moment in under 60 s
  10. No learner-visible line holds 'owner', 'pinned' as a build word, a task id or a level id; synthetic traces carry their label
  11. The viewer's 5,000-rectangle and 8 ms bounds hold in the frame
  12. ROWS with the stop rule; the game's own route is at least 10,000 B under its gate; the viewer chunk's size is reported
  13. `src/games/kit` and `src/design` are unchanged; no new baseline
  14. DC-H, with the HEAVY run by the coordinator
- **Browser tests:** features: gap-hunt, gap-hunt-sizes, trace-view, keep-list, lesson-games, prove-mode; smoke: walks, a11y, screens, network, reduced-motion; nightly width: walks (gap-hunt), all four levels at 360 and 1280 px, and the first-run tests at 1440x900 and 390x844
- **Owner default:** N1, N2, N11, Q-5, O-5 (`pinned` waits)
- **Before you write (2026-11-18, rewritten 2026-11-22):** one case needs a second GPU stream from the trace generator, so that an empty stretch on one stream is not read as an idle GPU. For the word of the `attribute` level's goal line, the build takes "CPU gap" as the default; the owner may overturn it (N2), and the word is read from `GAP_WORD` in `src/copy/terms.ts`, so an answer is a one-line change. See `curriculum/TR3-profile-a-real-engine.md`, "Before you write", items 1 to 12 and point (a).

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

#### [ ] W2-T24 · TR3 lessons 5 and 6, and the module closed in the browser · M · sonnet · deps: W2b-T183
- **Kind:** build; lane 2a:TR3; merges. It no longer depends on W2-T23 (the TR3 lab, which moves to wave 3): a module closes in the browser when its lessons, game and items are in, and until the lab merges the module page shows the lab as not published and the KCs that only the lab earns keep their `planned: W2-T23` lines.
- **Goal:** Floors and flat curves (arithmetic from claims), with the '300 us' question said as a number no primary source gives, which the lab will replace with the learner's own; and SGLang's profiler from its documents, opening on one synthetic step with both engines' labels. The module page complete for the browser part; every claim of `tr3.yaml` cited.
- **Read:** as W2b-T107
- **Files:** content/modules/tr3/lessons/l5-*.md and l6-*.md; tests/content/tr3-module.test.ts, tr3-demos.ts; tests/content/openers-table.ts, module-counts.ts; packages/play/predictions/{plan,truth,commit-tr3,tr3}.ts; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr3/**, public/llms.txt; content/modules/tr3/module.md
- **Accept:**
  1. LES
  2. The minutes sum is within 10% of the brief's
  3. `bun run verify:kc`: every KC has a family, a graded level or a credit-bearing lab stage, and only the lab-earned KCs still carry `planned: W2-T23`
  4. The export names each Test as a Test (W2b-T77's test passes on `public/md/tr3`)
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels
- **Owner default:** Q-5; the lab waits for wave 3 (wave 3 holds the lab)
- **Before you write (2026-11-18, rewritten 2026-11-22):** the lessons' openers, first acts, own KCs, Tests and minutes, the module page's prerequisite line, the step floor from the `qwen3.*` claims, the promises of TR2's and TR0's lessons, the form and its word, and the defaults taken for the four questions of 2026-11-18. See `curriculum/TR3-profile-a-real-engine.md`, "Before you write", items 2, 3 and 13 to 19 and points (a) to (f).

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

#### [x] W2-T28 · Sim: tiers, the connector contract and `kv-events@1` · M · sonnet · deps: W1-T21
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

#### [ ] W2-T30 · KV offload (`switchyard`) in the frame, 2D: the registration, the walkers, `yard` as the Prove level · L · opus · deps: W2b-T139, W2b-T140
- **Split (wave 2):** this task was the tiers model's session, the 2D view and the mirror in one task. It is cut: W2b-T136 (the tiers model gains sequence numbers, a replay buffer, the adapter field, a faulty transport and a restart), W2b-T137 and W2b-T138 (the yard model), W2b-T139 (the pure session, seven levels) and W2b-T140 (the 2D parts, unregistered) are tasks of their own, and this task keeps the registration, the walkers and `yard` as the Prove level, in the frame. Its body below is the old one; W2b-T126 writes the new.
- **Goal:** `packages/play/switchyard`, titled KV offload, with the role line "You publish the events." The learner publishes each move, and the consumer's board is checked after every event. The 2D view is lanes per tier, in the instrument frame. It is built in the instrument frame (REDESIGN.md §2.6) and supplies the frame's five exports: `Diagram2D`, `DockView`, `parts`, `moments` and `firstMove`, with the role line and the goal line in `packages/play/<game>/copy.ts`, where the engine's term is the only name (D-063).
- **Accept:**
  1. The game can be completed by keyboard.
  2. `verify:games` passes.
  3. The frame's five exports exist, and each level has a goal line with its number.

#### [ ] W2-T31 · KV offload (`switchyard`): the 3D scene · L · sonnet · deps: W0-T15, W2-T30
- **Wave 2:** not in wave 2. W2b-T118's camera table weighs each camera against the 2D; if none carries meaning, the roster says 2D and this task is recommended cut (N3, the owner decides). If one does, the scene is wave 3's.
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

#### [ ] W2-T33 · TR5b lesson 5, and the module closed in the browser · M · sonnet · deps: W2b-T149
- **Wave 2:** it no longer depends on W2-T31 or W2-T32: a module closes in the browser when its lessons, game and items are in, and until the lab of W2-T32 (moved to wave 3) merges the module page shows that lab as not published. W2-T29 and W2-T30 are reached through W2b-T149's own dependencies. The title and dependencies are the wave's; W2b-T126 writes the body.
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

#### [=] W2-T42 · Lesson blocks: the trace block, "In vLLM today" and the Build row · M · sonnet · deps: W1-T07, W1-T09
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

#### [x] W2-T43 · Predictions that no run answers yet · M · sonnet · deps: W1b-T02
- **State (2026-11-19):** closed by R-T09.
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

#### [=] W2-T44 · Readers of the prediction event: Review's rescheduling and the calibration view on Progress · S · sonnet · deps: W1b-T02
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

## W2b: wave 1 of the second build plan (the gate, the defects a learner meets, the tooling, then TR0)

**Why there is a W2b.** The first build ended with a site that works and a list of what it does not do well. Wave 1 of the second plan is built on `wave-2m1a`, and its pull request is stacked on the polish's. It has two halves. Wave 1a changes no page a learner has not met: the merge gate learns to run the nightly sweep's tests, the defects a learner meets today are fixed, and the tooling that the unwritten modules need is built. Wave 1b builds the receipts path, the lab page and TR0 ("PyTorch and Triton reading") end to end.

**Models.** Opus has the tasks that set a pattern, the exit checks and the cold-reader checks; haiku has the mechanical ones; the rest are sonnet's (D-036).

**Order.** A task lists its deps by id. Lane G's tasks (the grader, the kits, the receipts and the references manifest) merge one at a time, in the order of the plan. W2b-T38 and the tasks of wave 2 have their headings in the section "Wave 2 of the second build plan: 2a and 2b" below; the tasks of waves 3 to 5 have none until their wave starts.

#### [=] W2b-T01 · Record wave 1 in the tracker, and set the stale markers to the tree · S · sonnet · deps: —
- **Goal:** Write a W2b section into docs/TRACKER.md with a heading for each wave-1 task (W2b-T01 to T37 and T39 to T53) and none for a later wave. Set the markers of W2-T01 to T11, T13, T19, T28 and T43 to what the tree holds: [x] only when every check is met by files and none is the owner's or needs a GPU; otherwise [~] with a first body line 'State (2026-11-19): built; open check: <what>, closes with <task id>'. Known to need the second form: W2-T02 (selftest --gpu, W2b-T37), W2-T04 (Dockerfile builds, W2-T12), W2-T07 (W2b-T23), W2-T08 (W2b-T24 and W2-T12), W2-T11 (W2-T12), W2-T13 (its own open check), W2-T19 (nsys table names, W2-T21). Remove W2-T18's dep on W2-T15 with the reason. Reword W2-T16's first check from the nightly labs.yml job to the labs.yml CPU job on the wave's pull request and the weights job on a dispatch, with the reason (labs.yml has no schedule; the nightly is off, D-052). Correct line 1154's 'three questions' to four. Add to AGENTS.md, word for word as the tracker has them, the rules: never lowered, no quiet skip, paths stay private, RUSTUP_AUTO_INSTALL=0, and no wheel or model downloaded without the owner's leave.
- **Files:** `docs/TRACKER.md`, `AGENTS.md`, `tests/ci/task-ids.test.ts`.
- **Accept:**
  1. bun test tests/docs/repo-docs.test.ts tests/content/pending.test.ts tests/play/roster.test.ts tests/content/roster.test.ts tests/kc/verify-kc.test.ts tests/ci/task-ids.test.ts passes
  2. npm run verify:kc passes
  3. A new test in tests/ci/task-ids.test.ts fails on any [x] task of W2 whose checks name the owner, a GPU or W2-T12
  4. Every task named in GAME_TASKS, LAB_TASKS and PENDING of src/content/render/model.ts is still open in the tracker
  5. The W2b section has no heading for a task of waves 2 to 5
- **Browser tests:** none beyond G0

#### [=] W2b-T02 · The merge gate runs the features specs and the nightly-width walks of what a branch touches · M · sonnet · deps: W2b-T01
- **Goal:** scripts/gate/touched.ts turns a branch's changed paths into the features specs, walk filters and steps the gate must run. scripts/gate/known-red.json records the base's failing set in two lists: red (eight features tests, five walks, two 320 px page checks, by file and title) and flaky (the keyboard-loop test 'Tab and Enter alone win Fill the batch' and the pool's same-size walk at 360 px). The gate runs touched specs and walks with --retries=0 on four pinned cores, re-runs a listed flaky test once and no other, and passes when no test fails that is not in red. An entry leaves a list only after five passes of five with --retries=0, in the branch that fixes it. Mapping: src/games/<g>/ or packages/play/<g>/ gives e2e/<g>*.spec.ts, lesson-games, lesson-games-scene, lesson-predict, keep-list and the nightly-width walks of <g>; src/games/kit/, src/design/, src/pages/Game.tsx or src/games/registry.ts gives one level of every game (SMOKE_LEVELS) at 360 and 1280 px, design-parts and screens, and the task that made the change runs every level itself; content/, src/content/ or scripts/content/ gives lesson-games, lesson-predict, items, map, titles, today; src/receipts/, packages/verify/ or src/workers/ gives receipts and receipts-import; src/forge/ or labs/forge/ gives forge, forge-hybrid-kv, rejection-sampler, lab-kits; src/trace/ or packages/sim/trace/ gives trace-view; src/front/ gives front. The gate does not edit playwright.config.ts. The orchestrator's merge script, outside the repository, calls touched.ts.
- **Files:** `scripts/gate/touched.ts`, `scripts/gate/known-red.json`, `tests/ci/gate-touched.test.ts`.
- **Accept:**
  1. tests/ci/gate-touched.test.ts has one test per mapping row and passes
  2. A scratch branch with one broken walker is refused; the refusal, filtered to repository-relative paths, is in the pull request
  3. The gate's added wall time is measured on four pinned cores for a content-only branch, a one-game branch and a kit change, and reported against budgets of 10, 15 and 25 minutes [estimated]; where a budget is passed the task lists the slowest specs and stops for the orchestrator's decision
  4. known-red.json's red list names exactly the fifteen tests that fail on the base, each with file and title, and its flaky list the two named tests
- **Browser tests:** a dry run of the gate on the wave tip: the touched features specs and nightly-width walks with --retries=0

#### [=] W2b-T43 · The merge gate runs the lab checks a branch touches · S · sonnet · deps: W2b-T02
- **Goal:** Extend scripts/gate/touched.ts. A change under labs/grader/, labs/gpu/, labs/envs/, labs/references/, course.lock.json, packages/schema/, schemas/, src/receipts/, packages/verify/, tests/verify/ or tests/fixtures/{grader,references,receipts}/ gives: uv lock --check --project labs/grader; uv run --project labs/grader python -m unittest; uv run --project labs/grader enginespace selftest --no-suite; bun scripts/pack-kit.ts --check; bun run verify:schema; bun run verify:vectors; bun test tests/verify/bestiary.test.ts tests/verify/fixtures.test.ts. A change under labs/forge/, src/forge/, packages/sim/forge/ or tests/fixtures/forge/ gives cargo test --manifest-path labs/forge/Cargo.toml --workspace --features reference and bun run verify:labs, with RUSTUP_AUTO_INSTALL=0. bash labs/envs/relock.sh --check needs the network: the gate prints that it did not run it, and labs.yml on the wave's draft pull request is its evidence.
- **Files:** `scripts/gate/touched.ts`, `tests/ci/gate-touched.test.ts`.
- **Accept:**
  1. The grader steps run on this machine with UV_OFFLINE=1, UV_PYTHON_DOWNLOADS=never and UV_PYTHON set to an installed 3.13; if the grader's environment cannot be made without the network the task stops and reports
  2. A scratch branch that breaks one grader unittest is refused
  3. tests/ci/gate-touched.test.ts covers each new row
  4. No path maps to a step that does not run
- **Browser tests:** none

#### [=] W2b-T03 · The merge gate refuses a lowered bar, an unlisted baseline, a new skip and a leaked path · M · sonnet · deps: W2b-T02
- **Goal:** scripts/gate/bars.ts diffs base to head over tests/, e2e/, labs/grader/tests/, playwright.config.ts, scripts/verify-*.ts, scripts/content/, scripts/games/, scripts/gate/known-red.json, tests/seeds.ts and packages/sim/tensor/plan.ts. It lists every changed number inside an expect; every changed timeout, retries or toBeCloseTo digit count; every removed expect; every changed named bound (PACING, OPENER_WORDS, the blind-probe bound and MIN_BLIND_SAMPLE, PR_SEEDS, NIGHTLY_SEEDS, MAX_SEEDS, MAX_PLAN_NUMEL, the compiler's page and index sizes); every added known-red entry; every added skip, fixme, todo, skipIf, skipUnless or importorskip, in existing and in new files; and every changed or added PNG under e2e/**/*-snapshots/. The merge script refuses the branch unless the orchestrator's allow-list for the task names the line. A PNG passes only when the allow-list names it, the pull request shows the diff image and the orchestrator has recorded the owner's look. scripts/gate/paths.ts refuses added lines or pull request text that hold a home-directory path, a user-directory path, a scratch-directory path or the login name, which is read from the environment at run time and written nowhere in the repository.
- **Files:** `scripts/gate/bars.ts`, `scripts/gate/paths.ts`, `tests/ci/gate-bars.test.ts`, `tests/ci/gate-paths.test.ts`.
- **Accept:**
  1. Fixture diffs reproduce wave R's three cases ('> 40' to '> 20', six digits to one, a dropped assertion) as refusals
  2. An allowed count edit passes
  3. A re-blessed PNG, a new unittest.skipUnless, a raised PACING.between and an added known-red entry are each refused
  4. A diff line that holds a home-directory path or a scratch-directory path is refused
  5. A BUDGETS edit is still refused by the existing guard
- **Browser tests:** none

#### [=] W2b-T04 · Request path: a pointer lay does not move the page (A1) · S · haiku · deps: W2b-T02
- **Goal:** Apply the written fix: onLay takes a boolean, a click passes event.detail > 0, lay(id, index, byPointer) sets a ref so that the effect after a lay reveals the next stage only after a keyboard lay. The orchestrator copies the patch into the worktree as an untracked file; the task applies it and never cites where it came from. Add a test of twenty mouse lays, and bring WR-report 7.1 and 7.10 up to the fourth check with repository-relative paths only.
- **Files:** `src/games/engine-floor/useFloorControls.ts`, `src/games/engine-floor/Controls.tsx`, `e2e/engine-floor.spec.ts`, `docs/waves/WR-report.md`.
- **Accept:**
  1. The page moves 0 px in 20 of 20 mouse lays at 1440 x 900 and at 1280 x 800
  2. Twenty keyboard walks have no covered stop
  3. The /play/engine-floor row of verify:bundle is reported and is under 200 KB
  4. The diff holds no scratchpad path
- **Browser tests:** features: e2e/engine-floor.spec.ts, e2e/engine-floor-map.spec.ts; nightly width: walks (engine-floor) at 360 and 1280 px

#### [=] W2b-T05 · Request path: after the first run's commit, focus is on the stage the intro points at (A2) · S · sonnet · deps: W2b-T04
- **Goal:** First make the walk see the fault: commitBoundaries in e2e/support/walks.ts ends with walk.see(); commit that and show it failing. Then, after the commit of a first run, focus the ringed stage when the intro points at one, and otherwise reveal the focused stage after the ring's scroll.
- **Files:** `e2e/support/walks.ts`, `src/games/engine-floor/useFloorControls.ts`, `src/games/engine-floor/Controls.tsx`.
- **Accept:**
  1. The walk change alone fails on the base, shown in the pull request
  2. 2.5 s after the commit, on nano, mini, vllm and map at 1280 x 800, 1440 x 900 and 390 x 844, the focused stage is inside the list's box and uncovered
  3. Enter lays the ringed stage
  4. The /play/engine-floor row is reported
- **Browser tests:** features: e2e/engine-floor.spec.ts; smoke: first-visit; nightly width: walks (engine-floor), all eight levels

#### [=] W2b-T06 · Request path: a click in the filter field does not move the page on a short desk (A3) · M · sonnet · deps: W2b-T05
- **Goal:** At 1280 x 620 a click in the filter field moves the page (mini 11 px, map 39 px) and nobody has found why. Probe first and write the cause in the pull request before changing anything; then fix it in the sticky filters' CSS.
- **Files:** `src/games/engine-floor/floor.css`, `e2e/engine-floor.spec.ts`.
- **Accept:**
  1. The cause is stated with its measurement before the fix commit
  2. At 1280 x 620 and 1366 x 768 the filter stops move the page 0 px on mini and map
  3. A typed letter and a Backspace at the page's foot leave the scroll position as it was
  4. At 1440 x 900, 1280 x 800, 1920 x 1080 and 1024 x 768 the filter stops still move 0 px
- **Browser tests:** features: e2e/engine-floor.spec.ts; nightly width: walks (engine-floor)

#### [=] W2b-T07 · Step loop: after the last step, focus is on the result (A4) · M · sonnet · deps: W2b-T02
- **Goal:** The keyboard test 'Tab and Enter alone win Fill the batch' failed 6 of 40 runs because focus can land on a section and not on the result. Read the result's focus effect before touching the test, decide whether the product or the test is at fault, and fix that one. Add no retry.
- **Files:** `src/games/loop/**`, `e2e/keyboard-loop.spec.ts`.
- **Accept:**
  1. The pull request says which was at fault, with the evidence
  2. The test passes 40 of 40 runs with --retries=0 on four pinned cores and leaves the flaky list
  3. The front-page row of verify:bundle is reported before and after and grows by at most 100 B; if the fix needs more the task stops and waits for W2b-T16
- **Browser tests:** smoke: keyboard-loop; features: e2e/loop.spec.ts, e2e/loop-full.spec.ts; nightly width: walks (loop)

#### [=] W2b-T40 · `/play/:game` loads one game's record, so a new game costs the other game routes nothing · M · opus · deps: W2b-T02
- **Goal:** Today src/pages/Game.tsx reaches the value GAMES through src/games/registry.ts, so every game's entry.ts is in every /play/<id> route, and /play/broken-bench has 115 B of room. Make the game page resolve an id through a loader of that one game's record; src/games/registry.ts no longer imports the value GAMES. The Games index, the Progress page's re-grading and scripts/pages/plan.ts keep reading GAMES. packages/play/index.ts and packages/play/keys.ts do not grow. This sets the pattern the four new games register by.
- **Files:** `src/games/registry.ts`, `src/pages/Game.tsx`, `src/routes.tsx`, the lesson's game embed under src/content/render/, `scripts/verify-games.ts`, `tests/play/registry.test.ts`, `tests/build.test.ts`.
- **Accept:**
  1. First commit: the chunk list of the /play/broken-bench row as built, with what in it reads GAMES
  2. verify:bundle rows before and after for the front page, /play, each /play/<id>, /m/:module/:lesson and /evidence; the front page's row does not grow
  3. /play/broken-bench gains at least 1,500 B of room [estimated]; under 1,000 B the task reports what else the route carries and W2b-T08 runs
  4. A test over the build's manifest holds that the Game page's static closure contains no game's entry.ts
  5. The tab's title is set as the page mounts and e2e/titles.spec.ts passes unchanged; an unknown id still gives 'Game not found'
  6. verify:games fails when the record loaders, the components and packages/play/registry.ts list different ids
- **Browser tests:** smoke: walks, first-visit, network; features: e2e/titles.spec.ts, e2e/route-change.spec.ts, e2e/stale-chunk.spec.ts, e2e/lesson-games.spec.ts, e2e/broken-bench.spec.ts, e2e/engine-floor.spec.ts, e2e/loop.spec.ts, e2e/pool.spec.ts, e2e/verifier.spec.ts; nightly width: every level of all five games at 360 and 1280 px, run by the task and pasted

#### [ ] W2b-T08 · Make room on the game routes: `src/design/parts.css` by component · M · sonnet · deps: W2b-T40
- **State (2026-11-22):** not run. W2b-T40 left more than 1,000 B of room on /play/broken-bench, and W2b-T09 and W2b-T10 did not stop for room (docs/waves/W2m1a-report.md §1).
- **Goal:** Runs only if W2b-T40 leaves under 1,000 B of room on /play/broken-bench, or if W2b-T09 or W2b-T10 stops for want of room; the orchestrator records the choice. Split src/design/parts.css (26,582 bytes in one sheet) into one sheet per component, each imported by the component that uses it. No rule changes.
- **Files:** `src/design/parts.css`, `src/design/components/**`.
- **Accept:**
  1. verify:bundle rows before and after for the front page and every /play/* route
  2. No screenshot baseline changes and none is re-blessed
  3. verify:tokens passes
- **Browser tests:** smoke: screens, screenshots; features: e2e/design-parts.spec.ts; nightly width: every level of all five games

#### [=] W2b-T09 · Broken benchmark: no field and no heading under the pinned readout (A5, and A6's wrap) · M · sonnet · deps: W2b-T40
- **Goal:** On a desk shorter than about 860 px, with a flaw chosen, the number fields, the Setup heading or File the report stand under the pinned readout, and the court walk fails at 1280 px. Fix it with a scroll-margin on the fields, as the Request path's stages got, not with a page scroll-padding. Shorten the one meaning line that takes three lines at 390. The form's position at 390 stays as built.
- **Files:** `src/games/broken-bench/**`, `packages/play/broken-bench/copy.ts`, `e2e/broken-bench.spec.ts`, `scripts/gate/known-red.json`.
- **Accept:**
  1. The court walk at 1280 px passes five of five with --retries=0 and leaves the red list
  2. At 1440 x 800, 1366 x 768 and 1280 x 800, with a flaw chosen, the number fields and File the report are whole and uncovered (a geometry test)
  3. Every meaning line takes two lines at 390
  4. /play/broken-bench stays under 200 KB and its row is reported before and after
- **Browser tests:** features: e2e/broken-bench.spec.ts; nightly width: walks (broken-bench)

#### [=] W2b-T10 · Phone, first run: the dock's controls do not show before the intro (A7) · M · sonnet · deps: W2b-T09
- **Goal:** On a phone's first run of every game the dock's controls show for 0.5 to 0.8 s and then hide while the parts are walked. Hold the dock's controls until the frame knows whether an intro is due. This is a kit change on five routes with tight budgets: measure before writing.
- **Files:** `src/games/kit/Frame.tsx`, `src/games/kit/Intro.tsx`, `e2e/first-visit.spec.ts`, `e2e/walks.spec.ts`.
- **Accept:**
  1. At 390 x 844, on the first run of each of the five games, a test records that no decision control was visible before the coach strip
  2. verify:bundle rows for the front page and all five game routes, before and after
  3. The front page's first paint grows by at most 100 B and every /play/<id> row stays under 200 KB; if the fix fits neither room the task stops with its measurements, and W2b-T08 runs or the item goes to the owner's list
- **Browser tests:** smoke: first-visit, walks; nightly width: every level of all five games at 360 and 1280 px, run by the task and pasted

#### [=] W2b-T11 · 320 px: `/changes` fits its width, and TR2 lesson 2 passes axe (A8) · S · sonnet · deps: W2b-T02
- **Goal:** Two nightly page checks are red at 320 px: /changes has text past the right edge, and /m/tr2/l2-one-token-budget has an axe violation that no report names. Read each first failure, then fix the page or the block. Edit no prose unless the violation is in the prose, and then list the edit.
- **Files:** `src/pages/Changes.tsx`, the styles of /changes, the block axe names, `scripts/gate/known-red.json`.
- **Accept:**
  1. Both checks pass at 320 px five of five and leave the red list
  2. The pull request names each cause
- **Browser tests:** ES_E2E_NIGHTLY=1 smoke: a11y at 320 px for /changes and /m/tr2/l2-one-token-budget

#### [=] W2b-T12 · The lab-kits spec knows the three kinds of kit · S · haiku · deps: W2b-T02
- **Goal:** e2e/lab-kits.spec.ts asserts every manifest entry is a forge lab and looks for a forge page row for each; public/labs/manifest.json now also lists the GPU kit and the grader wheel. Split the assertion by kind and give each kind its own page-row check. Delete no assertion.
- **Files:** `e2e/lab-kits.spec.ts`, the page rows that link the GPU kit and the grader wheel, if they are missing, `scripts/gate/known-red.json`.
- **Accept:**
  1. The three tests at lines 81 and 87 pass and leave the red list
  2. The count of expect calls in the spec has not gone down
- **Browser tests:** features: e2e/lab-kits.spec.ts

#### [=] W2b-T13 · Name and fix the three failing design-parts tests and the settings tier test · M · sonnet · deps: W2b-T02
- **Goal:** Three tests of e2e/design-parts.spec.ts and the test 'a quality cap lowers the tier the running scene draws at' of e2e/settings.spec.ts are red on the base and no report names their cause. Run them with the JSON reporter, name each with its first error, then fix the product where the product is wrong and the spec only where it asserts something the redesign removed, citing the REDESIGN section.
- **Files:** `e2e/design-parts.spec.ts`, `e2e/settings.spec.ts`, the pages they test, `scripts/gate/known-red.json`.
- **Accept:**
  1. A JSON-reporter run names each failing test and its first error, in the pull request before any change
  2. No skip is added and no assertion is removed without the REDESIGN section that removed its subject
  3. All four pass five of five and leave the red list; if the settings test can pass only with a GPU, the task stops and the test stays listed with that reason for the owner
- **Browser tests:** features: e2e/design-parts.spec.ts, e2e/settings.spec.ts

#### [=] W2b-T14 · Rejection sampler: the wrong-module spec, and the `greedy-ngram` and `mutants` walks · M · sonnet · deps: W2b-T05
- **Goal:** Four nightly walks of the Rejection sampler fail (greedy-ngram and mutants, each at 360 and 1280 px) and so do the 'a wrong module' tests of e2e/rejection-sampler.spec.ts. Read each first failing assertion against the level's lanes and the committed fixture; fix the walker, the announcement or the stale fixture, whichever is wrong.
- **Files:** `e2e/rejection-sampler.spec.ts`, `e2e/support/walks.ts`, `src/games/verifier/**`, `tests/fixtures/forge/**`, `scripts/gate/known-red.json`.
- **Accept:**
  1. The four walks pass at 360 and 1280 px, five runs of five with --retries=0
  2. The spec's 'a wrong module' tests pass
  3. All leave the red list; no timeout is lengthened
- **Browser tests:** features: e2e/rejection-sampler.spec.ts, e2e/verifier.spec.ts; nightly width: walks (verifier)

#### [=] W2b-T15 · Two timing faults in tests: the pool's `same-size` walk at 360 px, and the graded `due` seed · S · sonnet · deps: W2b-T14
- **Goal:** The pool's same-size walk at 360 px is the longest walk and failed 3 of 8 runs; shorten the walk, do not lengthen a timeout. The graded due test of e2e/lesson-games.spec.ts reads the seed before the lesson has set it; wait for the lesson to set it.
- **Files:** `e2e/support/walks.ts`, `e2e/lesson-games.spec.ts`, `scripts/gate/known-red.json`.
- **Accept:**
  1. same-size at 360 px passes eight of eight with --retries=0 on four pinned cores and leaves the flaky list; if only a longer timeout would do it, the task stops and the question goes to the owner's list
  2. The due test passes 20 of 20
- **Browser tests:** features: e2e/lesson-games.spec.ts; nightly width: walks (pool)

#### [=] W2b-T45 · Remove the dead step control · S · haiku · deps: W2b-T07 (the same folder)
- **Goal:** LoopStepControl in src/games/loop/ControlPieces.tsx is mounted nowhere. Delete it with its bell ref, and the dead .es-frame-labels rule if a grep still finds it. Rename no field that is in a golden vector or a state hash. It merges after W2b-T07, which edits the same folder.
- **Files:** `src/games/loop/ControlPieces.tsx`, `src/design/components.css`.
- **Accept:**
  1. npm run lint and npm run typecheck pass
  2. The front-page row and the /play/loop row of verify:bundle are reported and neither grows
- **Browser tests:** smoke: walks; features: e2e/loop.spec.ts

#### [=] W2b-T16 · Front page: lesson rows leave the first paint · L · sonnet · deps: W2b-T02
- **Goal:** The course index is in the front page's first paint and gains one row per lesson (about 49 B each); twenty-five lessons to come would cost about 1.2 KB against 350 B. The front page uses only the module rows, whether a module is published, and the course's first lesson. Keep those in index.json and move the lesson rows to a second generated file that pages load on demand. scripts/verify-bundle.ts is not edited.
- **Files:** `packages/schema/compiled.ts`, `scripts/content/build.ts`, `src/content/load-lessons.ts`, `src/front/menu.ts`, `src/front/FrontPage.tsx`, `scripts/pages/front-shell.ts`, `src/pages/Lesson.tsx`, `src/pages/Module.tsx`, `src/pages/Evidence.tsx`, `src/pages/Map.tsx`, their tests.
- **Accept:**
  1. The front-page row of verify:bundle before and after; the gain is reported against about 1.3 KB [derived]; under 1 KB the task says where the rest of the index's bytes are
  2. A test compiles a fixture course of 60 lessons and one of 6 and holds index.json to the same bytes apart from the first lesson's row
  3. The front page's path table in the static HTML is unchanged
  4. src/content/load.ts gains nothing; no baseline under e2e/screenshots.spec.ts-snapshots changes
- **Browser tests:** features: e2e/front.spec.ts, e2e/map.spec.ts, e2e/titles.spec.ts, e2e/today.spec.ts; smoke: first-visit, screenshots

#### [=] W2b-T41 · The course's start is a key of `content/course.yaml` · S · sonnet · deps: W2b-T16
- **Goal:** firstLesson() takes the first module that has a lesson, and tr0 is first in course.yaml, so publishing TR0 lesson 1 would move the front page's Start, the header's Continue with no events and the demo's closing line off TR1 lesson 1. Add start: tr1 to course.yaml; the compiler writes the start module's first lesson as the index's first lesson; firstLesson and nextStep read it. A lesson of a module that stands before the start in course order is never counted as an earlier lesson not finished, and rule 5 offers it only when no later lesson is left.
- **Files:** `content/course.yaml`, `packages/schema/content.ts`, `scripts/content/build.ts`, `src/front/menu.ts`, `src/progress/next.ts`, `tests/front/way.test.ts`, `tests/progress/next.test.ts`.
- **Accept:**
  1. With a fixture course in which tr0 has lessons, the Start control, the header's Continue with no events and the demo's closing line name TR1 lesson 1
  2. A fixture ledger with TR1 lessons 1 to 3 done shows no earlier lesson unfinished; with every lesson from TR1 on done, rule 5 offers TR0 lesson 1
  3. No existing expectation is edited
  4. The front-page row is reported and grows by at most 40 B [estimated]
- **Browser tests:** smoke: first-visit; features: e2e/front.spec.ts, e2e/today.spec.ts, e2e/map.spec.ts

#### [=] W2b-T17 · Counts are derived, and each coming module has its row · M · sonnet · deps: W2b-T02
- **Goal:** Replace the hard-coded counts (27 lessons, 39 predictions as 18 and 21, 42 game blocks) with a per-module table, tests/content/module-counts.ts, that already has rows for tr0, tr3, tr4, tr5b and tr7 at zero. Do the same for the module list of tests/kc/graph.test.ts and the has-3D list of tests/ci/e2e-coverage.test.ts. Every total is still asserted exactly, as the sum of the rows.
- **Files:** `tests/content/module-counts.ts`, `tests/content/openers.test.ts`, `tests/content/map.test.ts`, `tests/content/sections.test.ts`, `tests/play/predictions.test.ts`, `e2e/lesson-games.spec.ts`, `tests/kc/graph.test.ts`, `tests/ci/e2e-coverage.test.ts`.
- **Accept:**
  1. Each total is asserted exactly as the sum of the rows, and the sums equal 27, 39 (18 and 21) and 42
  2. The edited literals are the task's named allow-list for the bars guard, and it refuses any other changed number
- **Browser tests:** features: e2e/lesson-games.spec.ts

#### [=] W2b-T18 · The module test kit, with the rule that every model table's header row is held · M · sonnet · deps: W2b-T02
- **Goal:** Extract the checks a module test runs from tests/content/tr8-module.test.ts and tr6-module.test.ts into tests/content/module-kit.ts: compiles with zero diagnostics and no pacing allowance; every lesson has a Test of three questions with at least one numeric; minutes; KCs taught; titles follow the brief; game and item blocks name built levels and families; the claims rules; module equals course.yaml; the part that needs a laptop or a GPU is announced. Add the rule: the kit finds every Markdown table in a module's lessons and cards whose header or caption carries [synthetic], and fails unless the module's demos file holds that header row word for word, tags included, and recomputes its rows. Add one call to each of the five built module tests.
- **Files:** `tests/content/module-kit.ts`, `tests/content/module-kit.test.ts`, `tests/content/tr1-module.test.ts`, `tests/content/tr2-module.test.ts`, `tests/content/tr5a-module.test.ts`, `tests/content/tr6-module.test.ts`, `tests/content/tr8-module.test.ts`, the five tests/content/tr*-demos.ts files, for a missing hold.
- **Accept:**
  1. A fixture lesson with an unheld model table fails the kit's own test
  2. For each built module the pull request lists the model tables found and shows each one held; a missing hold is added as a test and no lesson is edited
  3. The pacing allowance stays in the TR1, TR2 and TR5a tests and is listed for wave 4
- **Browser tests:** none

#### [=] W2b-T19 · A module's outcomes live in its `module.md` · M · sonnet · deps: W2b-T41
- **Goal:** Move OUTCOME_KCS out of src/map/outcomes.ts into each module.md's front matter, and give each planned module one outcome sentence in content/course.yaml. The compiler writes outcomes into the course map or the module's JSON, never into index.json, which is in the front page's first paint.
- **Files:** `packages/schema/content.ts`, `scripts/content/build.ts`, `src/map/outcomes.ts`, `tests/map/outcomes.test.ts`, `content/modules/*/module.md`, `content/course.yaml`, `public/md/**`, `public/llms.txt`.
- **Accept:**
  1. /map shows the same outcome ticks for a fixture ledger before and after
  2. TR2's fourth outcome keeps no KC and the pull request says so
  3. The front-page row and index.json's size are reported before and after and neither grows
  4. The /m/:module row is reported
- **Browser tests:** features: e2e/map.spec.ts; smoke: walks (the module-page tests)

#### [=] W2b-T20 · Lesson template: the Test's pass rule stands with its questions, and an item block may name a `variant` · M · sonnet · deps: W2b-T19
- **Goal:** The Test renders every prose block before its questions, so a pass rule sits away from the set it governs; render it beside the question set. Add an optional variant key to the item block, so a checkpoint can name the variant its part taught. Replace the two jargon labels of LEVEL_NAMES ('faded', 'new surface') with plain words, list every screen that shows them, and hold them in a test. The pass rule itself does not change, and no built lesson changes.
- **Files:** `packages/schema/content.ts`, `scripts/content/directives.ts`, `src/content/render/**`, `src/items/**`, `packages/play/items/types.ts`, their tests.
- **Accept:**
  1. A fixture lesson's pass rule renders after its last prose and beside its question set
  2. A block with variant draws only that variant and one without draws as before
  3. tests/fixtures/items/vectors.json does not move
  4. The lesson route row is reported
- **Browser tests:** features: e2e/items.spec.ts, e2e/lesson-games.spec.ts, e2e/tr5a-items.spec.ts, e2e/today.spec.ts

#### [=] W2b-T22 · The compiler survives a file that vanishes between its walk and its read · M · sonnet · deps: W2-T42
- **Goal:** When an editor saves by rename, a lesson file can vanish between the compiler's walk and its read, and the dev server stops. Retry the read once, then print a diagnostic and keep the server running. Narrow the plugin's tests: count every timer, inject the stat. Say in the options' comment that the plugin object is not to be shared between servers.
- **Files:** `scripts/content/build.ts`, `scripts/content/vite-plugin.ts`, `tests/content/plugin.test.ts`.
- **Accept:**
  1. A test removes a lesson file between the walk and the read; the compiler retries once, then prints a diagnostic, and the dev server keeps running
  2. The plugin's test counts every timer
  3. The compiled output of the real course is byte for byte what it was
- **Browser tests:** none

#### [=] W2b-T21 · A unit run leaves no temporary project behind · S · haiku · deps: W2b-T02
- **Goal:** tempDir in tests/content/support.ts makes enginespace-<label>-* folders and removes them in an afterAll that may run for the first importing file only. Add a test that a run leaves none; if it fails, move the cleanup to a preload in bunfig.toml that runs once per process.
- **Files:** `tests/content/support.ts`, `bunfig.toml`, `tests/ci/temp-clean.test.ts`.
- **Accept:**
  1. After a full four-shard run the temporary folder holds no enginespace-* directory made by the run
  2. The four shards' times are reported and none grows by more than 5 percent
- **Browser tests:** none

#### [=] W2b-T44 · Wave 1a exit check · S · opus · deps: all of wave 1a
- **Goal:** Check wave 1a as a whole and hand it to the owner: a report under docs/waves/ with repository-relative paths only, and the pull request from wave-2m1a into wave-r2 marked ready and not merged. W2b-T08 is in the report as run or not run, with the reason.
- **Files:** `docs/waves/W2m1a-report.md`.
- **Accept:**
  1. G0 passes on the tip
  2. known-red.json holds only what the report lists, with a reason each
  3. The bundle table is in the report, with the front-page and /play/broken-bench rows and the room each now has
  4. A spot check of five tasks' evidence against their accept lines
  5. ES_PROPERTY_SEEDS=10000 ES_HEAVY=1 bun test --parallel=2 --timeout 900000 and bun test tests/forge/rejection-sampler-rates.test.ts pass once on the tip
  6. The report lists N4, N5 and N8 with the default wave 1b takes for each
- **Browser tests:** ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features once on the tip, on four pinned cores; Firefox and WebKit are recorded as not run

#### [=] W2b-T23 · W2-T07's open check: a receipt event holds the receipt and the report, never the verdict · M · sonnet · deps: W2b-T43
- **Goal:** receiptDraft in src/receipts/keep.ts writes ok, score, provenance and the per-check verdict into the credited receipt event at import. Store the receipt and the report and compute the verdict on read, so that a receipt imported before a bank exists is credited once the bank is added. This is a ledger schema change with a migration.
- **Files:** `src/receipts/keep.ts`, `src/receipts/records.ts`, `packages/ledger/**`, `tests/receipts/**`, `tests/ledger/**`.
- **Accept:**
  1. The verdict is computed on read and stored nowhere
  2. A ledger written in the old shape still reads (a migration test)
  3. A receipt imported before a bank exists is credited after the bank is added, with no second import (a test with a synthetic bank that lives in the test)
  4. The /receipts and receipt.worker rows are reported; the worker stays under 60 KB
- **Browser tests:** features: e2e/receipts.spec.ts, e2e/receipts-import.spec.ts, e2e/ledger-conformance.spec.ts

#### [=] W2b-T24 · W2-T08's open check, and rule 7 reads `relabelled` · M · sonnet · deps: W2b-T43
- **Goal:** A claim under a performance.claimed key that names no evidence artifact must be shown as a claim with nothing behind it, or fail (packages/verify/checks.ts near line 128). The three re-checks of packages/verify/rechecks.ts (identityTally, acceptanceCounts, argmaxBank) must read the parsed artifact's relabelled flag. Add the forgeries: a bare claim, and a relabelled outputs, counts and argmax artifact.
- **Files:** `packages/verify/checks.ts`, `packages/verify/rechecks.ts`, `tests/verify/bestiary.ts`, `tests/verify/**`.
- **Accept:**
  1. Each new forgery fails its check, with the bound printed
  2. The three honest synthetic bundles still pass
  3. The receipt.worker row is reported and stays under 60 KB (4,161 B of room before)
- **Browser tests:** features: e2e/receipts-import.spec.ts

#### [=] W2b-T25 · `fetch` does not print a symlinked home · S · haiku · deps: W2b-T43
- **Goal:** shown() in labs/grader/src/enginespace_grader/fetch.py compares a path with Path.home() only, so a path under a symlinked home prints in full. Also compare with Path.home().resolve(). Then repack the kit.
- **Files:** `labs/grader/src/enginespace_grader/fetch.py`, `labs/grader/tests/test_fetch.py`, `public/labs/**`, `src/receipts/graders.ts`.
- **Accept:**
  1. uv run --project labs/grader python -m unittest passes, with a test of a symlinked home
  2. uv lock --check --project labs/grader passes
  3. bun scripts/pack-kit.ts --check passes, and labs/grader/tests/test_published.py passes
- **Browser tests:** features: e2e/lab-kits.spec.ts

#### [=] W2b-T47 · A grader lab's stage names the KCs it earns · M · sonnet · deps: W2b-T43
- **Goal:** verify:kc takes a lab's graded reference only from packages/sim/forge/kcs.ts (forge labs), and src/progress/kcmap.ts gives a receipt:<stage> ref its lab's KCs. Add packages/verify/stage-kcs.ts, a table from stage id to KC ids; make verify:kc read a declared stage's checks as a graded reference named receipt:<stage>, and fail a row for a stage src/receipts/labs.ts does not list; make a receipt event earn its stage's KCs first, then its lab's.
- **Files:** `packages/verify/stage-kcs.ts`, `scripts/verify-kc.ts`, `src/progress/kcmap.ts`, the module that builds KcSources, `tests/kc/verify-kc.test.ts`, `tests/progress/**`, `content/README.md`.
- **Accept:**
  1. With a fixture table, verify:kc accepts a KC whose only reference is a stage
  2. A verified receipt event of that stage earns the KC; a receipt whose argmax-bank check fails for want of a bank earns nothing
  3. A row for an unknown stage fails verify:kc
  4. npm run verify:kc on the real tree gives the same result as before
- **Browser tests:** none

#### [=] W2b-T30 · The lab page for the L and F lanes · M · opus · deps: W2b-T12, W2b-T23
- **Goal:** No page exists for a graded lab: src/pages/Lab.tsx and src/forge/ForgeLabPage.tsx draw forge labs only. Build REDESIGN 3.9's numbered procedure for a graded lab: download the kit (file, size, hash), fetch the inputs, issue a challenge, edit the named file, run the grader, import the receipt, then the checks, each with its id, its label in the engine's terms and what it catches, then the Prove step. Each stage carries one state line from a fixed set: 'built; the course has not yet run this lab on the pinned weights', 'built; the course has not yet run this lab on a real engine', 'awaiting the course's reference bank', or verified. A command taken from a pin's documents and never run is marked [unverified]. Nine labs will use this page.
- **Files:** src/labs/** (the graded-lab page, its copy table and descriptor type), `src/pages/Lab.tsx`, `src/unbuilt/copy.ts`, `tests/labs/**`.
- **Accept:**
  1. /labs/tr0.forward renders from a fixture descriptor in a server-render test
  2. axe passes at 320, 360 and 1280 px
  3. REDESIGN 5.2's per-screen checks for a lab hold
  4. The /labs/:lab row is reported and is under 200 KB; the front-page row does not move
  5. No number on the page stands without a tag, and no literal colour or font name sits outside src/design
- **Browser tests:** features: e2e/lab-kits.spec.ts, e2e/receipts.spec.ts; smoke: a11y, screens

#### [=] W2b-T48 · TR0 lab: the grader module, its checks, the reference and the mutant · L · sonnet · deps: W2b-T27, W2b-T24, W2b-T25, W2-T13
- **Goal:** Build labs/grader/src/enginespace_grader/labs/tr0_forward.py: three stages (one layer; the full forward at 1e-3 against Hugging Face fp32 on the same CPU; the cached path against a full recompute), the import guard that refuses transformers.models, and forward hooks that record shape, strides and dtype at five named points into the receipts of stages 2 and 3. Add checks/ with allclose, and the artifact for the five points to packages/schema and schemas/. Tests that need no torch run in the grader's environment. The reference solution, the wrong-epsilon mutant and the tests on a small random-weight model built from the pinned transformers (no weights downloaded) live under labs/grader/tests/cpu/, run in the labs.yml cpu job, and fail (never skip) when torch is missing and CI=true. Record the 1e-3 bar as [estimated] in a dated, proposed DECISIONS record; no task may change it.
- **Files:** `labs/grader/src/enginespace_grader/labs/tr0_forward.py`, `labs/grader/src/enginespace_grader/checks/**`, `packages/schema/bundle.ts`, `schemas/**`, `labs/grader/tests/test_tr0_forward.py`, `labs/grader/tests/cpu/**`, `.github/workflows/labs.yml`, `tests/ci/workflows.test.ts`, `docs/DECISIONS.md`, `public/labs/**`, `src/receipts/graders.ts`.
- **Accept:**
  1. The grader's unittest in the grader's environment, uv lock --check, pack-kit --check and test_published.py pass here
  2. bun run verify:schema and verify:vectors pass
  3. The kit's member list holds no reference solution
  4. Check ids and labels carry no word of src/copy/banned.ts
  5. The tests under labs/grader/tests/cpu/ fail, and do not skip, when torch is missing and CI=true; the bars guard lists no skip guard in them
  6. In the labs.yml cpu job the reference passes stages 1 to 3, the mutant fails stage 2, and the cache length equals the prefix length at every step; the orchestrator confirms that run before a dependent task merges
  7. With N4 answered yes, the cpu tests also run here
- **Browser tests:** none

#### [=] W2b-T49 · Triton 3.8.0 under the interpreter: which pinned kernels run on a CPU · M · sonnet · deps: W2b-T27, W2b-T48
- **Goal:** TR0's seventh outcome is to step through a kernel on CPU with TRITON_INTERPRET=1, and the brief lets a kernel into lesson 4 only after it has been run on Triton 3.8.0. Add triton==3.8.0 (Linux) to labs/envs/cpu, relock, and write scripts/triton-interp/run.py: it reads each candidate MRV2 file at vLLM 4ba787ec into a temporary folder, runs each kernel under the interpreter on CPU tensors and prints ran or failed with the error's class. Write scripts/triton-interp/course_kernel.py, a kernel of the course's own of at most 40 lines over the grid the grid level's model describes. Run both in the cpu job, and record which kernels ran as claims. If N4 is refused, or unanswered when W2b-T52 is due, this task does not start, lesson 4 ships without the walk-through, and the outcome's removal is recorded as a proposed decision.
- **Files:** `labs/envs/cpu/pyproject.toml`, `labs/envs/cpu/uv.lock`, `labs/envs/cpu/requirements.txt`, `docs/DECISIONS.md`, `scripts/triton-interp/run.py`, `scripts/triton-interp/course_kernel.py`, `.github/workflows/labs.yml`, `tests/ci/workflows.test.ts`, `content/claims/tr0.yaml`, `public/labs/**`, `src/receipts/graders.ts`.
- **Accept:**
  1. bash labs/envs/relock.sh --check and the cpu job are green on the draft pull request
  2. The job's log names each candidate kernel as ran or failed, and the course's own kernel runs
  3. No vLLM file is committed, and no request carried a name, an email or a token
  4. bun run verify:claims passes; if the claims schema allows no claim for the course's own run, the task stops and reports
  5. pack-kit --check and test_published.py pass after the repack
- **Browser tests:** none

#### [=] W2b-T31 · The bank's generator, and the page's state while the bank is awaited · S · sonnet · deps: W2-T16
- **Goal:** W2-T17 is the owner's: an fp32 CPU run of Hugging Face over the challenge's prompts, keeping argmax ids at positions whose margin passes a threshold. Build the generator in the lab's grader module with a test on the random-weight model, and a runbook at docs/owner/W2-T17-bank.md (the command, public/references/tr0/, the manifest entry, the BANKS entry). Publish no bank.
- **Files:** `labs/grader/src/enginespace_grader/labs/tr0_forward.py`, `labs/grader/tests/cpu/**`, `docs/owner/W2-T17-bank.md`, `tests/verify/**`, `public/labs/**`, `src/receipts/graders.ts`.
- **Accept:**
  1. The generator is deterministic (two runs give the same bytes, in the cpu job)
  2. With a synthetic bank that lives only in the test, the honest synthetic receipt passes argmax-bank and a receipt with one wrong id fails
  3. BANKS in src/receipts/declared.ts is still empty and nothing is written under public/references/
  4. pack-kit --check and test_published.py pass after the repack
- **Browser tests:** features: e2e/receipts-import.spec.ts

#### [=] W2b-T50 · "Defend your receipt", and TR0's questions · M · opus · deps: W2-T16, W2b-T23, W2b-T42
- **Goal:** Build the third kind of Prove-it (ASSESSMENT 7.2) for every L and F lab: after a verified import the browser asks seeded questions that only the receipt's raw artifacts answer, the learner answers before the browser shows the computation, and a pass writes a prove event with provenance proved. Build it once, with a question registry by lab, and write TR0's set over the five recorded points (a point's shape or strides). It reuses W2b-T42's attestation panel and 24-hour window, runs outside the receipt worker, and loads on demand.
- **Files:** `src/receipts/defend/**`, `packages/sim/defend/tr0.ts`, `src/receipts/ReceiptDetail.tsx`, `src/labs/**`, `tests/receipts/defend.test.ts`, `tests/sim/defend-tr0.test.ts`, `e2e/receipts-import.spec.ts`.
- **Accept:**
  1. Two bundles with different recorded points give different keys for one seed
  2. The learner's answer is taken before the computation is shown
  3. A pass on a verified receipt writes a prove event with provenance proved; a synthetic or unverified receipt shows the flow at practice weight and earns nothing
  4. A credited attempt opens the 24-hour window (a test with a set clock)
  5. The step is a lazy chunk; the /receipts and /labs/:lab rows are reported; the receipt.worker row does not move
  6. A stage 3 receipt can be defended while BANKS is empty
- **Browser tests:** features: e2e/receipts.spec.ts, e2e/receipts-import.spec.ts; smoke: a11y

#### [=] W2b-T37 · `selftest --gpu`, and the intake of the owner's bundles · M · sonnet · deps: W2b-T25 (last in lane G's queue)
- **Goal:** Build what the owner's GPU steps need and nothing that stands in for them: selftest --gpu, which fails clearly with no CUDA; scripts/fixtures-intake.ts, which hashes a bundle, sweeps it for a host name, user name, path or UUID, and appends an entry to tests/fixtures/receipts/manifest.json; and a runbook at docs/owner/W2-T12-smoke.md, which is not in the kit.
- **Files:** `labs/grader/src/enginespace_grader/selftest.py`, `labs/grader/src/enginespace_grader/cli.py`, `labs/grader/tests/**`, `scripts/fixtures-intake.ts`, `tests/grader/**`, `docs/owner/W2-T12-smoke.md`, `public/labs/**`, `src/receipts/graders.ts`.
- **Accept:**
  1. With no CUDA, selftest --gpu exits non-zero and says why in one line (a test with the fake NVML covers the other path)
  2. The intake refuses a bundle that holds a host name, on a throwaway bundle in a temporary folder
  3. The committed tests/fixtures/receipts/manifest.json stays 'fixtures': []
  4. The grader's unittest, pack-kit --check and test_published.py pass
- **Browser tests:** none

#### [=] W2b-T42 · Prove mode for a graded level, in the frame · M · opus · deps: W2b-T10, W2b-T40
- **Goal:** Build the second kind of Prove-it (ASSESSMENT 7.2): a module's graded level started in Prove mode, on fresh seeds, with the live readouts hidden. A lazy panel asks the learner to close their coding agent and records the attestation; a passed, attested run writes its play event with provenance proved; a failed attempt can be retried at once at practice weight; a credited one opens a 24-hour window. An entry of the play registry may name its Prove level. Turn it on for the Rejection sampler's exact level, the built game with the most route room; W2-T14 turns it on for Tensor views. The other four built games, the question that returns in Review after 30 days and module completion are wave 4's.
- **Files:** `src/games/kit/Frame.tsx`, `src/prove/**`, `src/games/kit/record.ts`, `src/games/kit/useRecorder.ts`, `src/pages/Game.tsx`, `packages/play/types.ts`, `packages/play/verifier/entry.ts`, `tests/play/prove.test.ts`, `tests/progress/**`, `e2e/verifier.spec.ts`.
- **Accept:**
  1. Seeds are drawn when the Prove run starts, and the readout is hidden until the result
  2. A passed, attested run is read as proved by src/progress/derive.ts; a failed one is not, and can be retried at once at practice weight
  3. A credited attempt opens a 24-hour window (a test with a set clock)
  4. The panel passes axe at 360 and 1280 px and holds no word of src/copy/banned.ts
  5. verify:bundle rows before and after: the front page's is unchanged, and each of the five /play/<id> rows is under 200 KB
- **Browser tests:** features: e2e/verifier.spec.ts; smoke: walks, a11y; nightly width: every level of all five games at 360 and 1280 px, run by the task and pasted

#### [=] W2b-T26 · TR0: the module's design, its KCs, and the game's design in the frame · M · opus · deps: W2b-T01, W2b-T17
- **Goal:** Rewrite the TR0 brief for the redesign so no author copies a stale line, and decide what the lane's other tasks build. Write down, each with its reason: the role line 'You plan the reshape.'; the 2D diagram exactly (the shape and stride table beside the buffer strip, the stride-order thread in 2D, what a copy looks like in 2D); for each level its parts (at most five), goal line with its number, named moment, first move and pass-rule sentence; which moment goes on the keep-list; fewest as the Prove level; bands that keep every tensor at 256 elements or fewer; what the third dimension carries and, per camera, what it shows that the 2D does not (if no camera does, recommend cutting W2-T15); each lesson's opener by rule 1; the module page's sentences (TR0 helps before TR1 and locks nothing; the lessons are separate subjects with no 'what changed' table and no form); each prediction with its reveal kind; the lab's challenge-time prediction as prose, not a predict block; 'Exit check' as a lesson's last heading, with three questions, at least one numeric; lesson 4 in two shapes, with and without the interpreter walk-through. Add the nine TR0 KCs to the graph, each with planned: naming W2-T14, W2b-T29 or W2-T16.
- **Files:** `curriculum/TR0-pytorch-for-rust.md`, `docs/GAMES.md`, `packages/play/roster.ts`, `content/kc/graph.yaml`, `tests/kc/graph.test.ts`.
- **Accept:**
  1. npm run verify:kc passes with the nine KCs, each planned: line naming a task of the tracker
  2. tests/play/roster.test.ts and tests/content/roster.test.ts pass with the roster and GAMES.md 2.6 moved together
  3. A script over the new sections finds no word of src/copy/banned.ts in the level, goal or part text; its output is in the pull request
  4. Every decision listed in the goal is in the brief's 'Before you write' section with its reason
- **Browser tests:** none

#### [=] W2b-T27 · TR0: the sources read at their pins, as claims · M · sonnet · deps: W2b-T26, W2b-T25
- **Goal:** Read, each at its pin and with a generic User-Agent: PyTorch 2.14's documents for view, reshape, contiguous, expand and the calls that wait for the GPU; Triton 3.8.0's documents for the program model and TRITON_INTERPRET; the five MRV2 files' paths and line counts at vLLM 4ba787ec; Mini-SGLang's qwen3.py at 9a91cfaf; SGLang's python_bindings.rs at v0.5.23; config.json of a proposed Qwen3-0.6B revision. Write them as claims, add the pins to course.lock.json (the model revision as a proposal: commit and date), write the tensor card, and enter the model's files in labs/references/manifest.json with the hashes and sizes the hub's metadata gives, each [unverified] until the weights job hashes the fetched files. Repack, because the references manifest is in the kit.
- **Files:** `course.lock.json`, `content/claims/tr0.yaml`, `content/cards/tensor.md`, `labs/references/manifest.json`, `public/labs/**`, `src/receipts/graders.ts`.
- **Accept:**
  1. bun run verify:claims, verify:pins and verify:content pass
  2. For each claim the pull request lists the raw-file URL at the pinned commit and the line range, and states that the quote lies inside them; W2b-T34 checks again
  3. A fact that could not be read is [unverified] and listed in the pull request; no later task may lean on it
  4. The grader's unittest, uv lock --check, pack-kit --check and test_published.py pass
  5. No request carried a name, an email or a token
- **Browser tests:** none

#### [=] W2b-T46 · A script re-reads each claim's quote at its pin · M · sonnet · deps: W2b-T43
- **Goal:** No gate checks that a claim's quote matches its source. Write scripts/claims/requote.ts: for the claims of the files it is given, fetch the source at its pinned commit as raw text with a generic User-Agent and no token, and say whether the quote lies inside the anchored lines: verified, moved, or could not be read. It stops at a rate limit and reports how many claims it covered. It needs the network, so it is not part of G0; the technical checks run it, and wave 4 adds it to the nightly's reports job.
- **Files:** `scripts/claims/requote.ts`, `tests/claims/requote.test.ts`, package.json (a claims:requote script; no dependency added).
- **Accept:**
  1. The unit tests run against a server on 127.0.0.1 and reach nothing else
  2. One run over the vLLM claims of content/claims/tr2.yaml, with its table in the pull request
  3. The script reads no token from the environment and sends no name or email
- **Browser tests:** none

#### [=] W2b-T28 · Tensor views: the pure session, its levels, bands, blind probes and copy · M · sonnet · deps: W2b-T27
- **Goal:** Build packages/play/shape-shifter to the pool's pattern and W2b-T26's design: entry, types, engine, levels (views, stride-zero, three-d for practice; fewest and grid graded), bands, score, view, session, debrief, labels, copy and blind probes. Register only the probes in scripts/games/blind.ts. Do not touch packages/play/registry.ts: the game is not routed yet.
- **Files:** `packages/play/shape-shifter/**`, scripts/games/blind.ts (only the lines that register this game's probes), `tests/play/shape-shifter-entry.test.ts`, `tests/play/shape-shifter-levels.test.ts`, `tests/play/shape-shifter-session.test.ts`, `tests/play/shape-shifter-debrief.test.ts`, `tests/play/shape-shifter-labels.test.ts`, `tests/copy/game-copy.test.ts`, `tests/copy/no-kitchen.test.ts`, packages/sim/tensor/index.ts (the two stale comments).
- **Accept:**
  1. On every band seed (count from tests/seeds.ts) the fewest ghost equals the model's optimum, the naive path costs at least one more copy, and the target is reachable in six operations
  2. grid passes only on exact coverage with the least waste
  3. Each graded level's blind probe is at or under the gate's bound
  4. Practice seeds are pinned and tested; the state holds no display string; every pass-rule sentence is held to the bar its level computes
  5. The checks are against packages/sim/tensor, not against the torch vectors
- **Browser tests:** none (nothing is routed yet)

#### [=] W2b-T29 · TR0's four item families · M · sonnet · deps: W2b-T27
- **Goal:** Build tr0.strides-of, tr0.view-or-copy, tr0.find-the-sync and tr0.grid-cover as Gen families, registered, with a face in the catalog and a lazy loader, golden vectors and a per-family test. Keys come from packages/sim/tensor, and for find-the-sync from a rule table whose every row is a claim. Each family draws at least one numeric variant.
- **Files:** `packages/play/items/families/tr0/**`, `packages/play/items/registry.ts`, `packages/play/items/catalog.ts`, `src/items/families.ts`, `tests/play/items-strides-of.test.ts`, `tests/play/items-view-or-copy.test.ts`, `tests/play/items-find-the-sync.test.ts`, `tests/play/items-grid-cover.test.ts`, `tests/fixtures/items/vectors.json`, `content/kc/graph.yaml`.
- **Accept:**
  1. bun run verify:items passes
  2. Each family's test re-derives every key from the numbers the item prints
  3. bun test tests/items/catalog.test.ts tests/items/verify-items.test.ts tests/items/stems.test.ts passes
  4. npm run verify:kc passes with these families' planned: lines removed and no other line touched
  5. vectors.json is written by bun scripts/verify-items.ts --write and by nothing else
- **Browser tests:** features: e2e/items.spec.ts, e2e/today.spec.ts

#### [=] W2b-T32 · TR0 lesson 1 and the module page · M · opus · deps: W2-T14, W2b-T29, and wave 1a's W2b-T16, W2b-T41, W2b-T17, W2b-T18, W2b-T19, W2b-T20, W2-T42
- **Goal:** Write content/modules/tr0/module.md and lesson 1 ('PyTorch in Rust terms: storage, shape, strides, dtype, device') to the twelve authoring rules, with the module test made from the kit. The module page carries the lab's :::lab block and says only what is true when it merges; the section on which stage tests what is W2b-T51's. It has the Prove step in words, the sentence that TR0 helps before TR1 and locks nothing, and the sentence on rules 9 and 11.
- **Files:** `content/modules/tr0/module.md`, `content/modules/tr0/lessons/l1-*.md`, `tests/content/openers-table.ts`, `tests/content/module-counts.ts`, `packages/play/predictions/plan.ts`, `packages/play/predictions/truth.ts`, `packages/play/predictions/commit-tr0.ts`, `packages/play/predictions/tr0.ts`, `tests/content/tr0-module.test.ts`, `tests/content/tr0-demos.ts`, `e2e/routes.ts`, `e2e/support/lessons.ts`, `e2e/lesson-games.spec.ts`, `public/md/tr0/**`, `public/llms.txt`.
- **Accept:**
  1. The kit's checks pass with zero diagnostics
  2. bun test tests/content/openers.test.ts tests/content/vocabulary.test.ts passes
  3. Every model number is [synthetic] with its day and commit, and its table's header row is held by the demos file
  4. The Test holds three questions, at least one numeric
  5. The front page's Start still names TR1 lesson 1
  6. The front-page row is reported and grows by no more than the module row's own change; the lesson's JSON is under 40 KB
  7. public/claims.json is not added to git
- **Browser tests:** features: e2e/lesson-games.spec.ts, e2e/lesson-predict.spec.ts, e2e/map.spec.ts, e2e/titles.spec.ts, e2e/items.spec.ts, e2e/front.spec.ts; smoke: first-visit, a11y, screens; nightly: a11y at 320 px on /m/tr0 and the lesson's route; nightly width: walks (shape-shifter) for the lesson's levels

#### [=] W2b-T51 · TR0 lessons 2 and 3, and the module page's section on the laptop part · M · sonnet · deps: W2b-T32, W2-T16
- **Goal:** Write lesson 2 ('Views, copies, and the syncs you cannot see', with the three-d level in 2D and a find-the-sync set) and lesson 3 ('nn.Module as a struct: Qwen3's forward in the pinned transformers', with the lab's Build row), to lesson 1's pattern. Add to the module page the section that says which stage of the lab tests what, that stage 2's bank is awaited, and that nothing on the page is a run of the learner's machine.
- **Files:** `content/modules/tr0/lessons/l2-*.md`, `content/modules/tr0/lessons/l3-*.md`, `content/modules/tr0/module.md`, `tests/content/openers-table.ts`, `tests/content/module-counts.ts`, `packages/play/predictions/**`, `tests/content/tr0-module.test.ts`, `tests/content/tr0-demos.ts`, `tests/content/tr0-figures.ts`, `tests/content/figures.test.ts`, `public/figures/tr0/**`, `e2e/routes.ts`, `e2e/support/lessons.ts`, `e2e/lesson-games.spec.ts`, `public/md/tr0/**`, `public/llms.txt`.
- **Accept:**
  1. As W2b-T32 for each lesson: the kit with zero diagnostics, openers and vocabulary tests, held header rows, a Test of three with one numeric, JSON under 40 KB
  2. Every value of Qwen3 in lesson 3 comes from a claim on the pinned config.json
  3. Lesson 3 carries the lab's Build row and no lab or trace block that claims a run
  4. The module page's laptop section matches the lab page's state lines
- **Browser tests:** features: e2e/lesson-games.spec.ts, e2e/lesson-predict.spec.ts, e2e/map.spec.ts, e2e/titles.spec.ts, e2e/items.spec.ts, e2e/lab-kits.spec.ts; smoke: a11y, screens; nightly: a11y at 320 px on the two new routes; nightly width: walks (shape-shifter) for three-d

#### [=] W2b-T52 · TR0 lesson 4: reading Triton · M · opus · deps: W2b-T32, W2b-T49 (or the record that W2b-T49 did not run)
- **Goal:** Write lesson 4 ('Reading Triton: grids, programs, BLOCK and masks'), the module's hardest: a grid of programs, tl.program_id, a BLOCK that is a compile-time constant, tl.arange, pointer arithmetic from strides, masked loads and stores at the edges, taught from the grid level and the pinned files. With W2b-T49 done, walk through the kernels that ran under the interpreter and name the course's own kernel as the course's. If W2b-T49 did not start, the orchestrator drops that dependency: the lesson then has no walk-through and one sentence says the course has not run a vLLM kernel under the interpreter.
- **Files:** `content/modules/tr0/lessons/l4-*.md`, `tests/content/openers-table.ts`, `tests/content/module-counts.ts`, `packages/play/predictions/**`, `tests/content/tr0-module.test.ts`, `tests/content/tr0-demos.ts`, `e2e/routes.ts`, `e2e/support/lessons.ts`, `e2e/lesson-games.spec.ts`, `public/md/tr0/**`, `public/llms.txt`.
- **Accept:**
  1. As W2b-T32 for the lesson
  2. Every kernel the lesson walks through is one the cpu job's log shows as ran; a kernel that did not run is not presented as steppable
  3. The lesson says that a Triton 3.8.0 wheel off Linux is [unverified]
  4. The grid level's game block names a built level, and the lesson's Test tests masks and grids, not recall of the files
- **Browser tests:** features: e2e/lesson-games.spec.ts, e2e/lesson-predict.spec.ts, e2e/items.spec.ts, e2e/titles.spec.ts; smoke: a11y, screens; nightly: a11y at 320 px on the new route; nightly width: walks (shape-shifter) for grid

#### [=] W2b-T33 · TR0 end to end: first-visit checks on its routes · S · haiku · deps: W2-T18
- **Goal:** Extend REDESIGN 5.2's per-screen checks to /m/tr0, its five lessons, /play/shape-shifter and /labs/tr0.forward, to the pattern of the routes already listed. This is W2-T39's share for TR0.
- **Files:** `e2e/first-visit.spec.ts`, `e2e/screens.spec.ts`, `e2e/support/screens.ts`.
- **Accept:**
  1. The checks pass at both widths with --retries=0
  2. The smoke project's four shard times are reported
  3. No existing expectation is edited
- **Browser tests:** smoke: first-visit, screens

#### [=] W2b-T34 · TR0 technical check · M · opus · deps: W2b-T33, W2b-T46
- **Goal:** With a fresh context, check every claim and number in TR0's lessons, module page, card, item rule tables, game copy and lab page: each claim's quote against its anchored lines at the pin (with scripts/claims/requote.ts, then by reading what the script could not), each [derived] number recomputed, each [synthetic] number against the demos file, each configuration value against the pinned config.json, each command against the kit. Write one report and change nothing else. Do not read W2b-T35's report.
- **Files:** `docs/waves/W2m1b-tr0-technical.md`.
- **Accept:**
  1. Every claim of content/claims/tr0.yaml and every tagged number of the five lessons has a row: verified, wrong, or could not be read
  2. Every 'wrong' row names file and line
  3. The report holds repository-relative paths only, and no request carried a name, an email or a token
- **Browser tests:** none

#### [=] W2b-T35 · TR0 cold-reader check · M · opus · deps: W2b-T33
- **Goal:** With a fresh context, read as a kernelspace graduate who has not seen the engines: the kernelspace lessons the module names as prerequisites, from the sibling checkout with git -C ../kernelspace show d478f91:<path>; then TR0's pages in order as exported in public/md/tr0/; then each level's parts list, goal line and prompts. For each lesson say where the reader is lost (file and line), which term is used before it is given, whether the opener is the right one by rule 1, whether rules 8 to 12 hold, and whether the Test tests what was taught. Write one report and change nothing else. Cite a kernelspace lesson by id and line and quote none of it. Do not read W2b-T34's report.
- **Files:** `docs/waves/W2m1b-tr0-cold-read.md`.
- **Accept:**
  1. Every lesson has a verdict of 'follows' or 'lost at', with file and line
  2. The report has no praise and no quoted kernelspace prose
  3. Nothing was added, committed or pushed in the kernelspace checkout
- **Browser tests:** none

#### [=] W2b-T36 · TR0: fix what the technical check found · M · sonnet · deps: W2b-T34
- **Goal:** Close every 'wrong' row of W2b-T34's report in the lessons, claims and tests it names, or list the row for the owner with the reason. Lower no bar to do it.
- **Files:** `content/modules/tr0/**`, `content/claims/tr0.yaml`, `content/cards/tensor.md`, `packages/play/items/families/tr0/**`, `packages/play/shape-shifter/copy.ts`, `tests/content/tr0-*.ts`, `public/md/tr0/**`, `public/llms.txt`, `docs/waves/W2m1b-tr0-technical.md`.
- **Accept:**
  1. Every 'wrong' row has a closing line: fixed at a commit, or listed for the owner with the reason
  2. bun test tests/content/tr0-module.test.ts passes, and G0 passes
  3. bun run verify:claims, verify:numbers and verify:content pass
- **Browser tests:** features: e2e/lesson-games.spec.ts, e2e/lesson-predict.spec.ts, e2e/items.spec.ts, e2e/titles.spec.ts; smoke: a11y, screens

#### [=] W2b-T53 · TR0: rewrite where the reader was lost, and re-read the fixes · M · opus · deps: W2b-T35, W2b-T36
- **Goal:** Rewrite the passages and level copy where W2b-T35's reader was lost; this is teaching work. Then read again each passage W2b-T36 changed, and let it stand or rewrite it.
- **Files:** `content/modules/tr0/**`, `packages/play/shape-shifter/copy.ts`, `tests/content/tr0-*.ts`, `tests/copy/game-copy.test.ts`, `public/md/tr0/**`, `public/llms.txt`, `docs/waves/W2m1b-tr0-cold-read.md`.
- **Accept:**
  1. Every 'lost at' row has a closing line: rewritten at a commit, or listed for the owner with the reason
  2. Each passage W2b-T36 changed is named as read again, and as standing or rewritten
  3. bun test tests/content/tr0-module.test.ts passes with zero diagnostics, and G0 passes
- **Browser tests:** features: e2e/lesson-games.spec.ts, e2e/lesson-predict.spec.ts, e2e/items.spec.ts, e2e/titles.spec.ts; smoke: first-visit, a11y, screens; nightly width: walks (shape-shifter) if level copy changed

#### [=] W2b-T39 · Wave 1b exit review · S · opus · deps: all of wave 1b
- **Goal:** Check wave 1b as a whole and hand it to the owner: a report under docs/waves/ with repository-relative paths only, and the pull request from wave-2m1b into wave-2m1a marked ready and not merged. W2b-T49 and W2-T15 are in the report as done or not started, each with its reason.
- **Files:** `docs/waves/W2m1b-report.md`.
- **Accept:**
  1. G0 passes on the tip, and known-red.json holds only what the report lists
  2. The bundle table is in the report, with the front-page and /play/broken-bench rows
  3. The labs.yml run on the pull request is green, and the cpu job's results are quoted
  4. A spot check of five tasks' evidence against their accept lines
  5. ES_PROPERTY_SEEDS=10000 ES_HEAVY=1 bun test --parallel=2 --timeout 900000, bun test tests/forge/rejection-sampler-rates.test.ts, bun run verify:claims and bun run verify:pins pass once on the tip
  6. The report lists each owner step and what the page says meanwhile
- **Browser tests:** ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features once on the tip, on four pinned cores; Firefox and WebKit are recorded as not run

### Tasks added after the plan

The plan of wave 1 did not foresee these; the coordinator added each from a check or a nightly run. Markers as above.

- [=] W2b-T54 · A stale screenshot baseline on the wave tip is found, explained and regenerated (wave 1a)
- [=] W2b-T55 · Two specs this build host cannot pass are judged by evidence: a regression is fixed, a limit of the host is listed as one (wave 1a)
- [=] W2b-T56 · The wave 1a report records what the owner answered, and that the coordinator read the re-shot baselines (wave 1a)
- [=] W2b-T57 · Request path: what the final check of wave 1a found broken is fixed (wave 1a)
- [ ] W2b-T58 · What the final check of wave 1a found broken on the other screens is fixed (wave 1a). Not run: that check classed nothing broken there, and its rough findings went to W2b-T62 and W2b-T63
- [=] W2b-T59 · Request path: a layout in which a lay, a filter or a typed letter cannot move what the learner is looking at (wave 1b, with a fix round)
- [=] W2b-T60 · Two nightly-size tests finish inside their own timeouts on a runner (wave 1b)
- [=] W2b-T61 · Four tests that were flaky on the runner, and the baselines gate's root (wave 1b)
- [=] W2b-T62 · Words a learner reads: build vocabulary on the module page, hours that count unpublished modules, a Test that says its rule three times (wave 1b)
- [=] W2b-T63 · Things that move or hide: the lesson's Next part bar on a short phone, a lesson's layout shift, the Rejection sampler's dock, disabled controls (wave 1b)
- [=] W2b-T64 · Room on the game routes, so that a sixth game can register (wave 1b)
- [=] W2b-T65 · Keyboard walks that start before their controls exist: two tests that failed the merge gate at random (wave 1b)
- [=] W2b-T66 · The merge gate lists a renamed file under both names, so that a rename cannot skip the browser tests of the feature it left (wave 1b)
- [=] W2b-T67 · Tensor views' level tests finish inside their own timeouts at nightly size (wave 1b, after its exit check)
- [=] W2b-T68 · Three browser tests that failed the merge gate at random: the TR2 lesson-predict walk, scroll restored on Back, and one ledger conformance test (wave 1b, after its exit check)

---

## Wave 2 of the second build plan: 2a and 2b

**Why this section.** Wave 2 is built in two halves. Wave 2a, on the branch `wave-2m2` (stacked on `wave-2m1b`), holds the opening, the holes of the merge gate, every defect a learner meets today, TR0's Tests of lessons 3 and 5, words and paint, and TR3 ("profile a real engine") complete in the browser with its game and the Traces page. Wave 2b, on `wave-2m2b` (stacked on `wave-2m2`), holds TR5b complete in the browser, the forge lab `kv-publisher`, Prove-it on the three forge labs, TR7's design, sources and draft targets, and the cards in the five older modules. Each half ends mergeable and deployable. Every task of 2a has its full heading below (Goal, Read, Files, Accept). Every task of 2b has a one-line heading marked "Body written by W2b-T126", so that a `planned:` line can name it; W2b-T126 writes the bodies when 2a is done.

**Markers.** No task of this section carries a marker but `[ ]`. Markers move only in W2b-T125 for wave 2a and in W2b-T178 for wave 2b, each in the same commit that adds the ids to `MERGED` in `tests/ci/workflows.test.ts`.

**Ids not used.** W2b-T127, W2b-T128 and W2b-T160 to W2b-T169 are not used: an earlier draft of this wave gave them to the block of GPU labs that moved to wave 3.

**Dependencies that changed, and why.**
- W2-T24 no longer depends on W2-T23, and W2-T33 no longer depends on W2-T31 or W2-T32. A module closes in the browser when its lessons, game and items are in. Until its lab merges, the module page shows the lab as not published, and the KCs that only that lab earns keep their `planned:` lines. Otherwise neither module could be live at the end of its half. The GPU labs of TR8, TR3 and TR5b (W2-T36, W2-T23, W2-T32) move to wave 3, and W2-T31 (the 3D scene of KV offload) is not in wave 2: W2b-T118's camera table decides whether any camera carries meaning (N3, D-074's reasoning for Tensor views).
- W2-T20 and W2-T30 are split, and their headings in the W2 section say how. W2-T20 (Trace attribution) keeps the game in the frame; the generator's second stream (W2b-T98), the gap and cause model (W2b-T99), the pure session (W2b-T100), the list mode (W2b-T101) and the Traces page (W2b-T102) are tasks of their own. W2-T30 (KV offload) keeps the registration in the frame; the tiers model (W2b-T136), the yard model (W2b-T137 and W2b-T138), the pure session (W2b-T139) and the 2D parts (W2b-T140) are tasks of their own. Their headings stay in the W2 section, with the new title and dependencies; W2-T24 is there too, with the full body below.
- W2b-T38 (the capture runbook for the owner's reference traces) earns no KC; its heading says so, and `bun run verify:kc` refuses a `planned:` line that names it.

**Decision numbers.** D-077 onward are reserved by task, so that two tasks that run side by side never write the same number. A task uses only the numbers of its own row; a task that needs one more takes the next spare of its lane and says so in its report. The numbers are written as proposed records; the owner's answers are D-070 to D-072 only.

| D- number | Reserved for | What it records |
|---|---|---|
| D-077 | W2b-T70 | The gate's minutes per merge: 40, and 50 for a kit merge (N18) |
| D-078 | W2b-T71 | The `e2e-features` job, with each shard's measured minutes (N14) |
| D-079 | W2b-T96 | TR3's design: the form's category (N2) and the decisions of the rewritten brief |
| D-080 | W2b-T96 | Whether one real profiler trace can be captured in the locked CPU environment with no download, and where its file would live (N19) |
| D-081 | W2b-T118 | TR5b's design: the game and the lab's stages (N1, N10) |
| D-082 | W2b-T118 | KV offload's camera table against the 2D (N3) |
| D-083 | spare, lane 2a:Gate | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-084 | spare, lane 2a:Gate | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-085 | spare, lane 2a:D2 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-086 | spare, lane 2a:D2 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-087 | spare, lane 2a:D1 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-088 | spare, lane 2a:D1 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-089 | spare, lane 2a:D3 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-090 | spare, lane 2a:D3 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-091 | spare, lane 2a:D4 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-092 | spare, lane 2a:D4 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-093 | spare, lane 2a:G | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-094 | spare, lane 2a:G | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-095 | spare, lane 2a:D5 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-096 | spare, lane 2a:D5 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-097 | spare, lane 2a:D6 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-098 | spare, lane 2a:D6 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-099 | spare, lane 2a:TR3 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-100 | spare, lane 2a:TR3 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-101 | spare, lane 2a:Exit | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-102 | spare, lane 2a:Exit | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-103 | spare, lane 2b:Open | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-104 | spare, lane 2b:Open | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-105 | spare, lane 2b:TR5b | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-106 | spare, lane 2b:TR5b | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-107 | spare, lane 2b:G | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-108 | spare, lane 2b:G | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-109 | spare, lane 2b:TR7 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-110 | spare, lane 2b:TR7 | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-111 | spare, lane 2b:Cards | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-112 | spare, lane 2b:Cards | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-113 | spare, lane 2b:Exit | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |
| D-114 | spare, lane 2b:Exit | Taken by a task of that lane that needs a record the table does not name; the task says so in its report |

D-077 to D-114 are reserved. The next free number after the table is D-115.

**Open questions.** N2 and N9 to N19 are recorded in docs/DECISIONS.md, each as open, with the default the named task takes. The owner has answered N4, N5 and N8 only (D-070 to D-072).

### Wave 2a: the full headings

W2-T20 (Trace attribution in the frame) and W2-T24 (TR3 lessons 5 and 6) are tasks of 2a whose headings are in the W2 section, edited there with their full text; they are not repeated here.

#### [ ] W2b-T69 · The task-id reader takes two or three digits, the agent brief gains wave 2's rules, and the stale markers are set · S · sonnet · deps: —
- **Kind:** build; lane 2a:Gate; merges.
- **Goal:** Widen the id pattern `(?:W\d+b?|R)-T\d\d` to two or three digits in both readers. Move the pinned W2b heading list of `tests/ci/task-ids.test.ts` so that later headings are legal. Add MERGE, KIT LOCK, NIGHTLY, OFFLINE, HEAVY, DC and WAIT (the wave's rules) to the tracker's agent brief and, word for word, to `AGENTS.md`. Set the stale markers (W2-T44 is built; the State lines of W2-T02, T07, T08, T13; W2b-T39) in the same commit that adds those ids to `MERGED`. Make the KC gate refuse a `planned:` line that names a task whose heading says 'earns no KC' (W2b-T38 will be the first).
- **Read:** docs/TRACKER.md: the reading guide, the agent brief, the head of the W2b section; AGENTS.md; tests/docs/repo-docs.test.ts; tests/ci/task-ids.test.ts 180-190; tests/ci/support.ts 50-60; scripts/verify-kc.ts 425-435; tests/ci/workflows.test.ts 700-790
- **Files:** docs/TRACKER.md (the agent brief and the markers only); `AGENTS.md`; `scripts/verify-kc.ts`; `tests/ci/support.ts`; `tests/ci/task-ids.test.ts`; `tests/kc/verify-kc.test.ts`; `tests/ci/workflows.test.ts`; `tests/content/predict.test.ts`; e2e/screens.spec.ts (a comment)
- **Accept:**
  1. bun test tests/ci tests/kc tests/docs tests/content/predict.test.ts
  2. A test that `planned: W2b-T105` is read, that `W2b-T1050` is not, and that a `planned:` line naming an 'earns no KC' task is refused
  3. bun run verify:kc
  4. Every moved expect line is in the allow file
  5. `bun scripts/gate/run.ts --plan` for the branch is a documents-and-tests plan: nothing under `src/` changes
  6. No sentence says the owner chose, saw or approved anything
- **Browser tests:** smoke, by G0

#### [ ] W2b-T180 · Wave 2's headings in the tracker, the D- numbers each task may use, and the open questions recorded · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:Gate; merges.
- **Goal:** A new tracker section for wave 2. A full heading (Goal, Read, Files, Accept) for every task of 2a, from the task list the coordinator hands over with private paths removed. A one-line heading for every 2b task, marked 'body written by W2b-T126', so that `planned:` lines can name it. A sentence that W2b-T127, T128 and T160 to T169 are not used. W2-T24 no longer depends on W2-T23, and W2-T33 no longer on W2-T31 or W2-T32, with the reasons the tracker gives. W2-T20's and W2-T30's splits. W2b-T38's heading says 'earns no KC'. A one-line heading for W2b-T210, 'TR3: one real profiler trace from the locked CPU environment', marked 'run only if W2b-T96's record says yes'. A table that reserves D-077 onward by task (T70, T71, T96, T118, and two spare per lane). In `docs/DECISIONS.md`: N2 first, then N9 to N19, each recorded as open with the default a task takes.
- **Read:** docs/TRACKER.md: the W2 and W2b sections; docs/DECISIONS.md: the open-question tables and D-070 to D-076; the task list
- **Files:** `docs/TRACKER.md`; `docs/DECISIONS.md`; `tests/ci/task-ids.test.ts`; `tests/content/pending.test.ts`
- **Accept:**
  1. bun test tests/ci tests/kc tests/docs tests/content/pending.test.ts
  2. bun run verify:kc
  3. No wave 2 task carries a marker: markers move only in W2b-T125 and W2b-T178
  4. The set of heading ids equals the handed-over list (a script's output in the report)
  5. A grep of the diff for a home-directory path, a scratch-directory path and the login name finds nothing
  6. No sentence says the owner chose anything
- **Browser tests:** smoke, by G0
- **Owner default:** lists N2 and N9 to N19; takes none

#### [ ] W2b-T70 · The merge gate maps every folder, runs the scene, kit, Prove, ledger, items, lab, page and data rows, keeps a failed test's output, and holds a stated time per merge · L · opus · deps: W2b-T69
- **Kind:** build; lane 2a:Gate; merges.
- **Goal:** Close the holes that let wave 1b's defects through, inside a measured budget of gate time. Rows: `src/scene/` runs `scene-kit` and every `*-scene` spec. `src/games/kit/{Frame.tsx,first-move.ts,Intro.tsx,useRun.ts,record.ts}`, `src/pages/Game.tsx` and `src/games/registry.ts` run every game's primary spec and every game's nightly-width walks; the rest of the kit and `src/design/` keep today's row. `packages/play/roster.ts` runs `tests/play/roster.test.ts` only. `src/prove/` and `packages/ledger/` run `settings`, `ledger-conformance`, every `prove-*` spec and the specs a named constant lists as holding a Prove describe. `packages/play/items/` and `src/items/` run `items`, `today`, `lesson-games`. `packages/play/predictions/` runs `lesson-predict`, `keep-list`. `src/labs/` runs `lab-page`, `lab-kits`. `src/pages/`, `src/settings/`, `src/evidence/`, `src/progress/` and `src/map/` run their own specs, and `a11y` and `screens` at nightly width with `-g` limited to the routes the touched page serves. `course.lock.json` also runs `a11y` at nightly width for `/changes`. `e2e/routes.ts` and `content/modules/**` run `a11y` at nightly width for the routes the diff adds or changes, from a helper that diffs `e2e/routes.ts`. A table from each `packages/sim/<model>` to the games that stand on it. `src/trace/` also runs a game that embeds the viewer. The lab prefixes of the gate's lab rows are mapped the same way. A `<game>-sizes` spec is run by its game's row and not by the kit row. No row runs a levels file at the nightly seed count. `run.ts` prints every unmapped path, and writes each failed test's whole error, stdout and stderr through `clean()` to a file outside the repository, printing its first 20 lines.
- **Read:** scripts/gate/touched.ts; scripts/gate/run.ts; tests/ci/gate-touched.test.ts; docs/waves/W2m1b-report.md 2.1 and 16.2
- **Files:** `scripts/gate/touched.ts`; `scripts/gate/run.ts`; `tests/ci/gate-touched.test.ts`; docs/DECISIONS.md (one proposed record: the minutes a merge may take)
- **Accept:**
  1. A plan is the pull request's first comment
  2. A test lists the real folders under `src/`, `packages/` and `e2e/support/` and fails for one with no row and no stated reason
  3. One test row per new mapping, the two data rows among them
  4. The plan for a documents-only branch is unchanged (a test); the verdict logic is unchanged (the recorded reporter JSON gives the same exit codes)
  5. The budget: `bun scripts/gate/run.ts --plan` is run against the Files list of every planned wave 2 task and the browser minutes each adds are measured on four performance cores and tabled
  6. No planned merge exceeds 40 minutes of whole gate time, but the kit merges (T74, T78, T179, T79, T86, W2-T20, W2-T30), which may reach 50; a row that cannot meet this is narrowed and the report says what it no longer runs
  7. A planted break in `src/scene/` and one in `src/games/kit/Frame.tsx`, on throwaway branches, are refused
  8. A test that the failure file holds neither the home path nor `os.userInfo().username`
  9. No timeout, retry or skip changes; the allow file names every changed gate line
- **Browser tests:** the specs each new row names, once, to measure
- **Owner default:** N18: 40 minutes a merge, 50 for a kit merge, as a proposed record

#### [ ] W2b-T71 · CI runs the features project on the pull request, and `pack-kit --check` in the Labs workflow · M · sonnet · deps: W2b-T70
- **Kind:** build; lane 2a:Gate; merges.
- **Goal:** An `e2e-features` job in `ci.yml` in four shards, in a concurrency group of its own with `cancel-in-progress: false`, with the smoke job's worker count and the configuration's own retry. It prints every test that passed only on its retry. `bun scripts/pack-kit.ts --check` in `labs.yml`. A proposed D- record with each shard's measured minutes. ARCHITECTURE 10.1 says what the job checks: the commits whose runs finish.
- **Read:** .github/workflows/ci.yml; .github/workflows/nightly.yml; .github/workflows/labs.yml; tests/ci/workflows.test.ts; playwright.config.ts 140-170 (not edited)
- **Files:** `.github/workflows/ci.yml`; `.github/workflows/labs.yml`; `tests/ci/workflows.test.ts`; `docs/ARCHITECTURE.md`; `docs/DECISIONS.md`
- **Accept:**
  1. bun test tests/ci/workflows.test.ts
  2. The coordinator dispatches `ci.yml` on the task's branch and the task quotes each shard's minutes from that run
  3. If one shard takes more than twice another, spec files are renamed as the configuration's sorting note allows; `playwright.config.ts` is not edited
  4. No test is retried more than the configuration says, skipped or quarantined
- **Browser tests:** the job itself, on a runner
- **Owner default:** N14: the job is not a required check until the owner makes it one

#### [ ] W2b-T72 · Rejection sampler: the 3D stage keeps its box on the commit and the first draw · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D2; merges; merges after: W2b-T70.
- **Goal:** The legend and the note reserve their full height in 3D, so the stage does not shrink 46 px and the bars do not jump. The dock's blank band after the first digit goes. The weight labels do not touch at 390 px. The frame test counts the first draw again.
- **Read:** src/games/verifier/View2D.tsx 205-250; src/games/kit/frame.css 422-424; e2e/verifier-scene.spec.ts
- **Files:** `src/games/verifier/View2D.tsx`; `src/games/verifier/verifier.css`; e2e/verifier-scene.spec.ts (allow file: the warm-up draw is removed, the bound of 3 stays)
- **Accept:**
  1. DC-A on the commit, the first draw and the result at 1440x900 and 390x844
  2. The counted first draw passes 5 of 5 at `--retries=0`, and 20 of 20 under CDP throttling 4x
  3. HEAVY: `--repeat-each 100 --workers 2` is run by the coordinator on idle performance cores; the report quotes it, with the distribution of frames before and after
  4. No copy is shortened
  5. ROWS
- **Browser tests:** features: verifier-scene, verifier, lesson-games-scene; nightly width: walks (verifier)

#### [ ] W2b-T74 · Prove mode: the foot after a proved run, Start held while the ledger is read, one clock, Progress reads the run as proved · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D2; merges; merges after: W2b-T70.
- **Goal:** A passed Prove run shows `PROVE_COPY.proved`, not 'Recorded as practice'. Start is disabled while the stake is unknown. The retry time uses the 24-hour clock of `/receipts`. The Progress page reads the run as proved. 'Next level' stays in Prove mode. The first panel says a miss uses up the day. Token labels do not run together at 320 px.
- **Read:** src/prove/ProveSession.tsx, copy.ts, window.ts; src/games/kit/record.ts 30-40 (`provenanceOf`); src/games/kit/Frame.tsx 440-460 (`modeWord`)
- **Files:** `src/prove/ProveSession.tsx`; `src/prove/copy.ts`; `src/prove/window.ts`; src/games/kit/record.ts and Frame.tsx (a separate commit, KIT LOCK); the one file of `src/progress/` that reads the event, named in the plan comment; `tests/play/prove.test.ts`; e2e/prove-mode.spec.ts (new, table-driven over both Prove levels)
- **Accept:**
  1. DC-D's foot and Start lines as tests on both Prove levels
  2. A test under CDP throttling 30x that Start cannot be pressed before the stake is read
  3. KIT LOCK: every game's primary spec and nightly-width walks pass after the kit commit
  4. ROWS
- **Browser tests:** features: prove-mode, shape-shifter, verifier, settings, ledger-conformance; every game's primary spec; nightly width: walks of every game
- **Owner default:** N16: the 24-hour clock

#### [ ] W2b-T78 · Prove mode: a left attempt is an event the export shows, a second tab is told the truth, and a graded run left early is recorded · M · sonnet · deps: W2b-T74
- **Kind:** build; lane 2a:D2; merges.
- **Goal:** A left Prove attempt is written as a `proved` event with `ok: false` and a `left` note. The playing tab refreshes its open record about every 30 s, and a second tab says an attempt is open in another tab until that lapses. A graded run left before its end writes a `play` event marked left (no window applies to it).
- **Read:** src/prove/window.ts; packages/ledger; src/evidence/export.ts; W2b-T23's migration, as the pattern; docs/ASSESSMENT.md 7.3
- **Files:** `src/prove/*`; packages/ledger/ (a schema bump with its migration only if the event needs one); src/games/kit/record.ts and Frame.tsx (a separate commit, KIT LOCK); `src/evidence/export.ts`; `tests/play/prove.test.ts`; `e2e/prove-mode.spec.ts`; `e2e/ledger-conformance.spec.ts`
- **Accept:**
  1. DC-D whole, as one table-driven spec over both Prove levels
  2. A two-tab test that passes 20 of 20 under CDP throttling 4x
  3. The export of a left attempt shows the miss; an older record migrates (a test)
  4. KIT LOCK
  5. ROWS
- **Browser tests:** features: prove-mode, shape-shifter, verifier, settings, ledger-conformance; every game's primary spec; nightly width: walks of every game
- **Owner default:** Q-5 yes; the builders' rule that a missed attempt that counted opens the 24-hour window stands

#### [ ] W2b-T179 · The frame can leave the seed out of the page, and gives it to tests through a hook · S · sonnet · deps: W2b-T78
- **Kind:** build; lane 2a:D2; merges.
- **Goal:** `Frame` takes a per-game option `seedInPage`. With `false` it writes no `data-seed` in graded and Prove runs, and a test hook (present only when the page is opened with the e2e flag the walkers already use) returns the seed. The six built games keep the attribute (N11's default); `e2e/support` gains one `seedOf` that reads either.
- **Read:** src/games/kit/Frame.tsx 470-490; e2e/shape-shifter.spec.ts and e2e/verifier.spec.ts (`seedOf`)
- **Files:** `src/games/kit/Frame.tsx`; src/games/kit/types.ts or the file that holds the game's options; `e2e/support/seed.ts`; `tests/games/kit-frame.test.ts`
- **Accept:**
  1. A test that a game with `seedInPage: false` has no `data-seed` and no seed in any attribute, text node or URL in a graded run
  2. A test that the hook is absent without the e2e flag
  3. The six built games' markup is unchanged (a snapshot of the frame's attributes)
  4. KIT LOCK
  5. ROWS: the front page grows at most 30 B
- **Browser tests:** features: every game's primary spec; nightly width: walks of every game
- **Owner default:** N11: the six built games keep `data-seed`; a new game does not write it

#### [ ] W2b-T88 · Check: the Rejection sampler and Prove mode · M · opus · deps: W2b-T72, W2b-T179
- **Kind:** check; lane 2a:D2; merges nothing.
- **Goal:** CHK on `/play/verifier` and both Prove levels: the first draw's box; a doubled and a held key; a reload, Back, an edited URL and a second tab inside an attempt; the foot at each result; the export after a pass, a miss and a left attempt; the Progress page.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T89 · Fix round for the sampler and Prove mode · M · opus · deps: W2b-T88
- **Kind:** fix; lane 2a:D2; merges; merges after: W2b-T191.
- **Goal:** FIX: every broken row of W2b-T88 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `src/games/verifier/`; `src/prove/`; src/games/kit/ (a separate commit); `e2e/prove-mode.spec.ts`
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: verifier, verifier-scene, prove-mode, shape-shifter, ledger-conformance

#### [ ] W2b-T191 · Confirm W2b-T89 · S · opus · deps: —
- **Kind:** confirm; lane 2a:D2; merges nothing; finished before it starts: W2b-T89.
- **Goal:** CONFIRM: before W2b-T89 merges, a fresh context re-runs the rows it says it fixed and DC-C and DC-D on both Prove levels at DC-B's twelve sizes, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T73 · Tensor views inside a lesson: no self-scroll, lesson 4's steppers whole, a 1-D target on one row · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D1; merges; merges after: W2b-T70.
- **Goal:** In a lesson the game scrolls only after the learner has acted in its frame. Lesson 4's dimension-1 'one more' is whole from 1280 to 1920 px. A 1-D target is one row that scrolls inside its box.
- **Read:** src/games/shape-shifter/hand.ts 205-250; src/games/shape-shifter/Game.tsx 160-180
- **Files:** `src/games/shape-shifter/hand.ts`; `Game.tsx`; `View2D.tsx`; `shape-shifter.css`; `e2e/lesson-games.spec.ts`; `e2e/shape-shifter.spec.ts`
- **Accept:**
  1. DC-F on `/m/tr0/l1-pytorch-in-rust-terms` and lesson 4
  2. A scrollport test for lesson 4's steppers at 1280, 1440 and 1920 px
  3. `e2e/lesson-games.spec.ts` passes 20 of 20 under CDP throttling 4x
  4. ROWS
- **Browser tests:** features: lesson-games, shape-shifter; nightly width: walks (shape-shifter)

#### [ ] W2b-T79 · Tensor views on a phone and a short desk: the aim in view, nothing over 'Your guess', no stepper under the fold · M · opus · deps: W2b-T73, W2b-T179
- **Kind:** build; lane 2a:D1; merges.
- **Goal:** At 390x844 the goal's number and end show without 'more'; 'More below' does not overprint; an opened target order stays above the dock; the guess card and the intro card do not cover the drawing or the buffer row. At 375x812 and 360x800 dimension 1's 'one more' is reachable while the first-move strip is held. The readout is in view at 1280x620. The launch panel is whole at 1440 px. No tensor is drawn too small to read (W2-T14's R8). The part buttons do not overlap on a phone. The 'show its order' toggle has a 44 px hit area.
- **Read:** src/games/kit/Frame.tsx, Intro.tsx, first-move.ts
- **Files:** `src/games/shape-shifter/shape-shifter.css`; `src/games/shape-shifter/View2D.tsx`; src/games/kit/Frame.tsx, Intro.tsx, first-move.ts (a separate commit, KIT LOCK); e2e/shape-shifter-sizes.spec.ts (new); e2e/support/sizes.ts (the twelve sizes, shared)
- **Accept:**
  1. DC-A and DC-B on all five levels at all twelve sizes, in `e2e/shape-shifter-sizes.spec.ts`
  2. DC-G after each move
  3. KIT LOCK: every other game's specs and nightly-width walks pass
  4. No new screenshot baseline
  5. ROWS on every game route
- **Browser tests:** features: shape-shifter, shape-shifter-sizes, and every game's primary spec; nightly width: walks of every game

#### [ ] W2b-T80 · Tensor views: what its words and controls mean · L · sonnet · deps: W2b-T79
- **Kind:** build; lane 2a:D1; merges.
- **Goal:** Words: 'in place' is renamed or defined so that the readout says what it counts and lesson 1's primer agrees; 'offset' and 'buffer' each keep one meaning; no operation is named before a line defines it; `reshape`'s copy rule is said to be the pinned version's; the 12-operation cap is stated; a stride-zero moment does not call rank-3 slices 'rows'; 'Counted: none on this path.' shows only when true; the debrief compares like with like; the practice `grid` beat reads 'Match the reference's masked lanes, the fewest any launch can leave; its count shows when you launch.' Controls: `contiguous()` is not offered on a contiguous tensor; the BLOCK stepper skips values it would refuse; practice 'New numbers' on `grid` deals practice tensors; a graded target reached with extra copies says so when the copy is made; a double click on the last choice keeps focus on the result; the level menu pushes history, so Back, Forward and Reload at a result keep it; Next level updates the URL. The stale line 'BLOCK must be a power of two.' goes, and the debrief does not print 'on seed 00000000'.
- **Read:** docs/waves/W2m1b-tr0-cold-read.md 98 and 160; packages/play/shape-shifter/copy.ts, session.ts; tests/copy/game-copy.test.ts 55-66, 318-332
- **Files:** packages/play/shape-shifter/copy.ts, session.ts, debrief.ts; src/games/shape-shifter/Controls.tsx, DockView.tsx, Mirror.tsx, ReadoutStrip.tsx, Game.tsx; content/modules/tr0/lessons/l1-pytorch-in-rust-terms.md (one sentence); tests/copy/game-copy.test.ts, tests/play/shape-shifter-labels.test.ts (allow file, the three assertions of the grid beat among them); `public/md/tr0/**`
- **Accept:**
  1. A plan is the first comment
  2. DC-E as a 200-walk fuzz against a second implementation
  3. Graded play is unchanged: the replay tests pass with no vector moved
  4. DC-C on the last choice; Back, Forward and Reload at a result leave it as it was (DC-F's last line)
  5. Every moved string is in the allow file
  6. HEAVY if a `*-levels.test.ts` file is edited
  7. ROWS
- **Browser tests:** features: shape-shifter, shape-shifter-sizes, lesson-games; nightly width: walks (shape-shifter)
- **Owner default:** N13: no 'give up' on a graded target

#### [ ] W2b-T90 · Check: Tensor views on its page and inside TR0's lessons · M · opus · deps: W2b-T80
- **Kind:** check; lane 2a:D1; merges nothing.
- **Goal:** CHK with DC-B's twelve sizes, every level played whole, with rotation mid-level and 200% zoom, and each TR0 lesson that embeds the game.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T91 · Fix round for Tensor views · M · opus · deps: W2b-T90
- **Kind:** fix; lane 2a:D1; merges; merges after: W2b-T192.
- **Goal:** FIX: every broken row of W2b-T90 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `src/games/shape-shifter/`; `packages/play/shape-shifter/`; src/games/kit/ (a separate commit)
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: shape-shifter, shape-shifter-sizes, lesson-games; nightly width: walks (shape-shifter), and of every game if the kit changed

#### [ ] W2b-T192 · Confirm W2b-T91 · S · opus · deps: —
- **Kind:** confirm; lane 2a:D1; merges nothing; finished before it starts: W2b-T91.
- **Goal:** CONFIRM: before W2b-T91 merges, a fresh context re-runs the rows it says it fixed and the DC-A to DC-G sweep of Tensor views at DC-B's twelve sizes, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T85 · Request path at a desk: the list box keeps its stages in view and the first lay moves nothing · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D3; merges; merges after: W2b-T70.
- **Goal:** Findings 2, 3, 4, 8 and 10 of the wave 1b check: no empty box while stages remain; more whole tiles at 1366x768; the first lay of a first run leaves 'Run the path' where it was; a vertical wheel scrolls the chip row at 1280x620.
- **Read:** the check report of W2b-T59
- **Files:** `src/games/engine-floor/floor.css`; `Controls.tsx`; `useFloorControls.ts`; `View2D.tsx`; `e2e/engine-floor.spec.ts`
- **Accept:**
  1. DC-A on the first lay and on every sixth lay at 1440x900, 1366x768 and 1280x620
  2. No kit file changes
  3. SHOTS
  4. ROWS
- **Browser tests:** features: engine-floor, engine-floor-map; nightly width: walks (engine-floor)

#### [ ] W2b-T86 · Request path on a phone, the stamp's focus, and the paired guess's first focus · M · sonnet · deps: W2b-T85, W2b-T79
- **Kind:** build; lane 2a:D3; merges.
- **Goal:** Findings 6, 7, 9, 11 and 12: Commit is on screen at 390x844; 'Run the path' and 'Remove last' are on screen at 320x640 after a stop; the first-move card does not cover the legend; 'now' is not cut; the debrief stamp's focus ring is inside the foot; the toolbar does not start under the screen's foot. In the kit: the paired guess focuses the number before the how-sure plates (`Intro.tsx`).
- **Read:** the check report of W2b-T59
- **Files:** `src/games/engine-floor/floor.css`; `Controls.tsx`; e2e/engine-floor-sizes.spec.ts (new); src/games/kit/Stamp and Intro.tsx (a separate commit, KIT LOCK)
- **Accept:**
  1. DC-B on both levels at the twelve sizes, in `e2e/engine-floor-sizes.spec.ts`
  2. KIT LOCK
  3. SHOTS
  4. ROWS
- **Browser tests:** features: engine-floor, engine-floor-sizes, and every game's primary spec; nightly width: walks of every game

#### [ ] W2b-T92 · Check: Request path, and the four older games after the kit changes · M · opus · deps: W2b-T86
- **Kind:** check; lane 2a:D3; merges nothing.
- **Goal:** CHK on Request path at the sizes of the W2b-T59 check and on a phone, both levels played whole. Then the Step loop, KV page pool, Rejection sampler and Broken benchmark each played once whole at 390x844 and 1280x620, since T79 and T86 changed the kit under them.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T93 · Fix round for Request path and the older games · M · sonnet · deps: W2b-T92
- **Kind:** fix; lane 2a:D3; merges; merges after: W2b-T193.
- **Goal:** FIX: every broken row of W2b-T92 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `src/games/engine-floor/`; the folder of an older game the check names; src/games/kit/ (a separate commit)
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: engine-floor, engine-floor-map, engine-floor-sizes; the named game's specs; nightly width: walks (engine-floor), and of every game if the kit changed

#### [ ] W2b-T193 · Confirm W2b-T93 · S · opus · deps: —
- **Kind:** confirm; lane 2a:D3; merges nothing; finished before it starts: W2b-T93.
- **Goal:** CONFIRM: before W2b-T93 merges, a fresh context re-runs the rows it says it fixed and DC-A to DC-C on Request path at DC-B's twelve sizes, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T77 · Code spans render in guess prompts and reveals, and the Markdown export names a Test as a Test · M · sonnet · deps: W2b-T73
- **Kind:** build; lane 2a:D4; merges.
- **Goal:** Route the bodies of `Predict` and `Tagged` through the inline-code renderer of the prose, in every module. In `scripts/content/directives.ts` an item block under the lesson's last `##` exports as '**Test.**', not '**Practice.**'; `public/md` and `public/llms.txt` are regenerated for every module.
- **Read:** src/content/render/Predict.tsx, Tagged.tsx, Prose.tsx; scripts/content/directives.ts 260-290; public/md/tr0/l1-pytorch-in-rust-terms.md 115-130
- **Files:** `src/content/render/Predict.tsx`; `src/content/render/Tagged.tsx`; `scripts/content/directives.ts`; tests/content/export-labels.test.ts (new); a content test for code spans; `public/md/**`; `public/llms.txt`
- **Accept:**
  1. A content test that no rendered guess text of any lesson holds a backtick
  2. A content test over every module's `public/md`: the item block of each lesson's Test section reads 'Test.', and no other block does
  3. The lesson route's row reported; ROWS
- **Browser tests:** features: lesson-predict, lesson-games, titles; smoke: screens, a11y

#### [ ] W2b-T84 · TR0's Test questions read as code, and the module page says what two Tests ask · M · sonnet · deps: W2b-T77
- **Kind:** build; lane 2a:D4; merges.
- **Goal:** The sync questions keep their indentation and never call `.item()` on a whole tensor. Test leads promise only the kinds drawn. The expand hint speaks of expand. 1-D places are not written as 1-tuples. Two checkable `[unverified]` sentences are settled in the locked CPU environment (OFFLINE). `/m/tr0` says, in the learner's words: 'The Tests of lessons 3 and 5 ask about lessons 1 and 2 for now; their own questions are being written.' W2b-T131 and W2b-T132 each remove their half of that line.
- **Read:** packages/play/items/families/tr0/
- **Files:** `packages/play/items/families/tr0/*.ts`; tests/fixtures/items/vectors.json (by `bun scripts/verify-items.ts --write`); content/modules/tr0/module.md and lessons 2, 3, 5; `content/claims/tr0.yaml`; `public/md/tr0/**`
- **Accept:**
  1. A test that every printed loop body is indented and every `.item()` is on a 0-d value
  2. The first step of no part-worked question holds its key
  3. bun run verify:items; the report names how many vectors moved
  4. A test that `/m/tr0` holds no task id and no KC id
  5. LES for the touched lessons
- **Browser tests:** features: items, today, lesson-games
- **Owner default:** N5 as answered

#### [ ] W2b-T81 · Records: the module page counts game runs, and `/evidence` files, names and words each row rightly · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D4; merges; merges after: W2b-T70, W2b-T74.
- **Goal:** `/m/tr0`'s Game line counts runs, not Test answers. An answer is filed under the lesson it was given in. An exact guess reads 'exact'. The in-run guess of graded `fewest` is recorded. A lab row carries the lab's name. One launch is one row.
- **Read:** src/progress/derive.ts 100-107; src/evidence/rows.ts
- **Files:** `src/progress/derive.ts`; `src/evidence/rows.ts`; their tests
- **Accept:**
  1. Unit tests for each of the six, built from a recorded ledger
  2. DC-E's rule for the counts
  3. ROWS (`/evidence`, `/m/:module`)
- **Browser tests:** features: map, today, settings; nightly width: a11y and screens on `/evidence` and `/m/tr0`

#### [ ] W2b-T82 · Receipts: a synthetic receipt earns nothing, and a lab with no page prints no command · S · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:G; merges; merges after: W2b-T70.
- **Goal:** `ext.synthetic` is never credited with a skill or a Build pass, and the defend panel gives that as its reason. The fallback of `gradeCommandParts` says the lab is not published. The honest synthetic bundle passes rule 5 in the real browser, or the page says why it cannot.
- **Read:** src/receipts/credit.ts 33-52; src/receipts/challenge.ts 172-192; src/receipts/defend/standing.ts, copy.ts
- **Files:** `src/receipts/credit.ts`; `src/receipts/challenge.ts`; `src/receipts/defend/copy.ts`; `tests/receipts/*`; `e2e/receipts.spec.ts`
- **Accept:**
  1. Tests for both
  2. The honest synthetic bundles of `tests/verify` still verify; a browser test drops one on `/receipts` and reads rule 5's line
  3. ROWS (`/receipts`)
- **Browser tests:** features: receipts, receipts-import; the grader row
- **Owner default:** O-10: full weight for a verified receipt

#### [ ] W2b-T83 · The TR0 lab page and kit say and print what is true · M · sonnet · deps: W2b-T82, W2b-T84
- **Kind:** build; lane 2a:G; merges.
- **Goal:** The grade command prints `--assisted` and `--agent` slots and the `uv run` prefix in every step, and holds one token slot. One sentence says the 0.001 bar's margin is not measured. The kit README names each lab's environment. 'GPU lab results' becomes 'Lab results'. Step 5's landmarks are unique. 'Prove it' says what is not published. Step 2's 'Then you see' names the `resumed` status. Step 3's sentence names the same destination as step 5. The breadcrumb and the command do not break badly at 320 px.
- **Read:** src/labs/tr0-forward.ts, copy.ts; labs/kit/README.template.md
- **Files:** src/labs/tr0-forward.ts, copy.ts, GradedLabView.tsx; src/routes.tsx, src/evidence/counts.ts, storage-lines.tsx, EvidenceView.tsx; labs/kit/README.template.md, labs/gpu/tr0-forward/LAB.md; `content/modules/tr0/module.md`; `tests/labs/descriptors.test.ts`; public/labs/*, src/receipts/graders.ts (repacked)
- **Accept:**
  1. A test that each descriptor line holds exactly one token slot
  2. OFFLINE: the grade command is run as printed in the locked CPU environment up to the grader's argument check; `uv sync` and `enginespace fetch` lines are read against the manifest and `--help`, never run; the report marks each line 'run' or 'read, not run (download)'
  3. axe finds no `landmark-unique` at 320, 360 and 1280 px
  4. bun scripts/pack-kit.ts --check
  5. SHOTS
  6. ROWS
- **Browser tests:** features: lab-page, lab-kits, receipts; nightly width: a11y and screens on `/labs/tr0.forward`
- **Owner default:** N12: 'Lab results'; D-075 stands

#### [ ] W2b-T94 · Check: TR0 from `/m/tr0` to a defended receipt · M · opus · deps: W2b-T81, W2b-T83
- **Kind:** check; lane 2a:D4; merges nothing.
- **Goal:** CHK as a learner: the five lessons' guesses and Tests, the module page's counts, `/evidence`, the lab page, `/receipts` with a synthetic bundle, 'Defend your receipt'.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. OFFLINE: commands run only with `UV_OFFLINE=1`, `UV_PYTHON_DOWNLOADS=never`, `HF_HUB_OFFLINE=1`, in the existing locked CPU environment, with no `uv sync`; `enginespace fetch` and every model or dataset line is read against the manifest and the CLI's `--help`, never run; each line is reported 'run' or 'read, not run (download)'
  2. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  3. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  4. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  5. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T95 · Fix round for TR0's path · M · sonnet · deps: W2b-T94
- **Kind:** fix; lane 2a:D4; merges; merges after: W2b-T194.
- **Goal:** FIX: every broken row of W2b-T94 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `content/modules/tr0/`; `packages/play/items/families/tr0/`; src/progress/, src/evidence/, src/labs/, src/receipts/ as the rows name; `public/md/tr0/**`
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: lab-page, receipts, items, lesson-predict; nightly width: a11y, screens on the touched pages

#### [ ] W2b-T194 · Confirm W2b-T95 · S · opus · deps: —
- **Kind:** confirm; lane 2a:D4; merges nothing; finished before it starts: W2b-T95.
- **Goal:** CONFIRM: before W2b-T95 merges, a fresh context re-runs the rows it says it fixed and DC-E on the counts of `/m/tr0` and `/evidence`, and DC-F on each touched lesson, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T75 · `e2e/loop.spec.ts:380` against a built site: find the failing assertion, then fix the game or the test; the dead control file goes · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D5; merges; merges after: W2b-T70, W2b-T190.
- **Goal:** Say whether the Step loop's first screen at 390x844 is cut on a built site, and fix what is wrong. Delete `src/games/loop/ControlPieces.tsx`, which nothing imports.
- **Read:** e2e/loop.spec.ts 365-410
- **Files:** `src/games/loop/`; e2e/loop.spec.ts (allow file if an expect line moves)
- **Accept:**
  1. HEAVY: the coordinator runs the test 20 times against `vite preview` of a pristine export on four performance cores with the JSON reporter; the report quotes the first failing expect
  2. The test changes only where the report quotes the assertion's intent and shows the assertion is wrong; no bound, tolerance or wait is widened; a fresh reviewer grants the allow file
  3. After the fix 20 of 20 on the built site and on the dev server; no retry or timeout is added
  4. ROWS if the game changes
- **Browser tests:** features: loop, loop-full; nightly width: walks (loop)

#### [ ] W2b-T190 · Confirm W2b-T75 · S · opus · deps: —
- **Kind:** confirm; lane 2a:D5; merges nothing; finished before it starts: W2b-T75.
- **Goal:** CONFIRM: before W2b-T75 merges, a fresh context re-runs the rows it says it fixed and the Step loop's first screen at 390x844 and 360x640 (DC-A, DC-B, DC-F), on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T76 · The claims re-quote script reads lines rightly after a character outside the BMP, and reads page claims · S · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D5; merges.
- **Goal:** Fix `locate` (it mixes code points and UTF-16 units). Add a mode that re-reads a claim whose source is a versioned document page or a file in a tagged repository, since TR3 and TR7 cite such pages. It may merge before W2b-T70: it changes no path the new rows map.
- **Read:** scripts/claims/requote.ts 60-104
- **Files:** `scripts/claims/requote.ts`; its test
- **Accept:**
  1. A test with an emoji line above the quote
  2. `bun scripts/claims/requote.ts content/claims/tr0.yaml` reports no row 'moved' for the five rows wave 1b listed. It fetches only the raw files at the pinned commits that those rows already cite, with a generic User-Agent and no token; the coordinator runs it if the task has no network
  3. The count of skipped rows is printed with the reason for each kind
- **Browser tests:** none

#### [ ] W2b-T87 · Room on `/today` and the other pages that read `GAMES` · M · sonnet · deps: W2b-T69
- **Kind:** build; lane 2a:D5; merges; merges after: W2b-T70.
- **Goal:** The pages that need only a game's id, modules, KCs, levels and Prove level import a lean rows export; a game's title lines, keys and claims stay in its own chunk. The first commit is a table of what `/today` holds and the measured cost on `/today` of one item family's catalog row and of one registered game.
- **Read:** packages/play/index.ts, registry.ts; src/items/today/kcs.ts; src/items/families.ts; src/progress/sources.ts, useProgress.ts
- **Files:** packages/play/index.ts, registry.ts; `src/items/today/kcs.ts`; src/progress/sources.ts, useProgress.ts; `src/pages/PlayIndex.tsx`; `src/pages/Evidence.tsx`; `tests/play/registry.test.ts`
- **Accept:**
  1. The target is (the measured cost of one family) x 19 + (one game) x 2 + 400 B, for the wave's 19 families [estimated: 8 for TR3, 5 for TR0, 6 for TR5b] and two games; `/today` has at least that much room and no gated row grows
  2. If it has less, the task also applies the pure annotation of the loop's `entry.ts` that W2b-T40's follow-up names; if `/today` then covers 2a's 13 families and one game but not the wave, it says so and the coordinator adds a room task before W2b-T143 from 2b's reserve; if it does not cover 2a, it stops and reports
  3. No budget is edited
- **Browser tests:** features: today, map, items; smoke: walks, screens

#### [ ] W2b-T129 · Words a learner reads · M · sonnet · deps: W2b-T84, W2b-T83, W2b-T80
- **Kind:** build; lane 2a:D6; merges.
- **Goal:** The header says Start on a lesson nobody started, and does not link a page to itself. Test leads print skill names, not ids. 'Builds on kernelspace T5.L10' becomes that lesson's title. No design-document reference, package path or level id in a module fold. No learner-visible line holds 'owner', 'pinned' or a task id: `src/games/loop/KeysWaiting.tsx` says what is missing in plain words (WAIT). `/map` says, as TR0's module page does, that TR0 is an advised primer. The level picker and TR0's tables at 320 px. The nits: the heading on `/m/tr8`; TR6 lesson 2's Test says its rule once; the ticket row and a planned module's Start label at 320 px; 'Start: TR1 lesson 1' on a half-read lesson; in 'Defend your receipt', the explanation once, a 44 px lab link at 390 px, a reason on the disabled Start; the section strip's toggle keeps focus; disabled buttons and empty chips on the front page do not look alike.
- **Read:** src/settings/store.ts 178-184; src/pages/Lesson.tsx 596; src/content/render/ksTitles.ts; scripts/content/pacing.ts (`BUILD_LOG`)
- **Files:** `src/settings/store.ts`; `src/pages/Lesson.tsx`; `src/games/loop/KeysWaiting.tsx`; src/receipts/defend/ (copy and one target); about 15 lessons under `content/modules/`; tests/copy/waiting-copy.test.ts (new: no rendered route holds 'owner', a task id or a level id); `public/md/**`
- **Accept:**
  1. A content test that no rendered Test lead or fold matches `BUILD_LOG` or holds a KC id
  2. The copy-guard test passes on every route of `e2e/routes.ts`
  3. LES for the touched lessons
  4. The front page's first paint grows at most 30 B; ROWS
- **Browser tests:** features: titles, lesson-games, map, receipts; nightly width: a11y, screens
- **Owner default:** O-19: as built; TR1 lesson 1 may be edited, but guess 2 of 2 is not moved

#### [ ] W2b-T130 · Paint and layout shift on a slow link · M · sonnet · deps: W2b-T87
- **Kind:** build; lane 2a:D6; merges.
- **Goal:** The first commit measures at 1.6 Mbps and CDP throttling 4x. Then deep links are styled at first paint, the footer does not jump, a lesson's load does not shift, and the front page's demo reserves its height in CSS.
- **Read:** scripts/prepare-pages.ts; e2e/perf.spec.ts
- **Files:** `scripts/prepare-pages.ts`; src/front/ (CSS); the page CSS
- **Accept:**
  1. The measured shift before and after on `/`, a lesson and a deep link, at 360x800 and 390x844, in the report
  2. DC-F on those three routes
  3. The front page's first paint grows at most 30 B
  4. No bound of `e2e/perf.spec.ts` changes
  5. SHOTS
- **Browser tests:** features: front, route-change, stale-chunk; smoke: screenshots

#### [ ] W2b-T131 · TR0's Test of lesson 3 tests lesson 3 · L · sonnet · deps: W2b-T129, W2b-T87
- **Kind:** build; lane 2a:D6; merges.
- **Goal:** Families `tr0.module-as-struct`, `tr0.decoder-forward` and `tr0.kv-cache-contract`, each with a numeric variant, and lesson 3's Test drawn from them. The half of W2b-T84's line about lesson 3 goes.
- **Read:** packages/play/items/families/tr0/ (the model); curriculum/TR0-pytorch-for-rust.md
- **Files:** `packages/play/items/families/tr0/`; packages/play/items/registry.ts, catalog.ts; `src/items/families.ts`; `tests/play/items-tr0-*.test.ts`; `tests/fixtures/items/vectors.json`; content/modules/tr0/lessons/l3-*.md, module.md; `public/md/tr0/**`
- **Accept:**
  1. A plan is the first comment
  2. bun run verify:items, verify:kc
  3. Each family's blind bound is at most 15% (O-14's reading)
  4. No first step holds its key
  5. The Test asks only lesson 3's KCs (a test)
  6. DC-H for its property tests
  7. ROWS (`/today`), inside W2b-T87's room
- **Browser tests:** features: items, today, lesson-games
- **Owner default:** N5 as answered; O-14

#### [ ] W2b-T132 · TR0's Test of lesson 5 tests lesson 5, and the minor content batch · L · sonnet · deps: W2b-T131
- **Kind:** build; lane 2a:D6; merges.
- **Goal:** As W2b-T131 for the merged projection and the launch arithmetic, and the rest of W2b-T84's line goes. Then: example numbers that were chosen are tagged as chosen; the Read tables do not show under an unplayed game; lesson 5's file list is a table; the claim chips; the stride-zero note speaks of expand; 'for the same reason' gets its reason; the grid levels' subtitle fits them; the minutes sit inside the 10% band.
- **Read:** as W2b-T131
- **Files:** as W2b-T131, for lesson 5; `content/cards/tensor.md`
- **Accept:**
  1. As W2b-T131, for lesson 5
  2. LES for the touched lessons
- **Browser tests:** features: items, today, lesson-games
- **Owner default:** N5 as answered; O-14

#### [ ] W2b-T133 · Check: TR0's Tests and the words · M · opus · deps: W2b-T132
- **Kind:** check; lane 2a:D6; merges nothing.
- **Goal:** CHK: each TR0 Test passed and failed on 20 draws, looking for a question the lesson did not teach; the leads, folds and waiting lines of all six modules; the header's Start and Continue on a fresh ledger and a half-read one.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T181 · Check: paint on a slow phone link · S · opus · deps: W2b-T130
- **Kind:** check; lane 2a:D6; merges nothing.
- **Goal:** CHK at 1.6 Mbps and CDP throttling 4x, 360x800 and 390x844, on `/`, three lessons and three deep links: an unstyled paint, a shift (measured), a self-scroll (DC-F).
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T134 · Fix round for TR0's Tests, the words and the paint · M · sonnet · deps: W2b-T133, W2b-T181
- **Kind:** fix; lane 2a:D6; merges; merges after: W2b-T199.
- **Goal:** FIX: every broken row of W2b-T133, W2b-T181 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `content/modules/`; `packages/play/items/families/tr0/`; src/pages/, src/settings/, the page CSS
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: items, titles, lesson-games, front, route-change; nightly width: a11y, screens on the touched pages

#### [ ] W2b-T199 · Confirm W2b-T134 · S · opus · deps: —
- **Kind:** confirm; lane 2a:D6; merges nothing; finished before it starts: W2b-T134.
- **Goal:** CONFIRM: before W2b-T134 merges, a fresh context re-runs the rows it says it fixed and DC-F on each touched lesson and a terms-before-use read of the touched parts, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T38 · The capture runbook for the owner's reference traces, and a checker (earns no KC) · M · sonnet · deps: W2b-T83
- **Kind:** build; lane 2a:G; merges.
- **Goal:** `docs/owner/W2-T21-traces.md` for a rented pod with a 4090 and one with an H100: O-5's workloads; the profiler commands from the pin's documents, each `[unverified]`; a check of `nsys` inside the container first; the nsys fallbacks; what to bring home; that a receipt must be made with the kit of the tip the owner merged. `enginespace trace check <file>` on the pod. `scripts/traces-intake.ts` on the owner's computer, which runs `traceChecks`, refuses a synthetic trace, hashes and appends to a manifest. The grader's missing-file message prints the whole `uv run` command. This task earns no KC.
- **Read:** docs/owner/W2-T12-smoke.md; scripts/fixtures-intake.ts
- **Files:** `docs/owner/W2-T21-traces.md`; labs/grader/src/enginespace_grader/cli.py, fetch.py, trace/; `labs/grader/tests/`; scripts/traces-intake.ts and its test; public/labs/* (repacked)
- **Accept:**
  1. LAB
  2. The tests use labelled synthetic captures and write nothing under `public/traces/`
  3. The grader's unittest and `bun scripts/pack-kit.ts --check` pass
  4. The runbook claims no run, and names no provider's price
- **Browser tests:** the grader row
- **Owner default:** O-5: 6 to 10 traces on a 4090 and an H100; annotations are left out and the runbook says so

#### [ ] W2b-T96 · TR3's design: the brief rewritten, the KCs, the game's levels, its phone path, and each lesson's first act · M · opus · deps: W2b-T69
- **Kind:** build; lane 2a:TR3; merges; merges after: W2b-T180.
- **Goal:** Rewrite the brief's 'Before you write' as decisions with reasons, to the model of TR0's. It settles: the role line (N1 default, 'You attribute the gap.'). N2: the form's category is 'CPU gap', the trace model's and the game's own word for what the learner measures; 'bubble' stays TR2's coined word and is not renamed; `src/copy/terms.ts` gains one key that holds the word and says it is the bubble of TR2 as a trace shows it; `content/README.md` rule 11 and the tracker's W2-T20 'Before you write' are rewritten to 'the build takes CPU gap as the default; the owner may overturn it', so an answer is a one-line change. The eight KCs, each with a named family, graded level or credit-bearing lab stage (`tr3.provider-preflight` gets a family and lesson 2; the lab-earned ones keep `planned: W2-T23`). The levels built now (`read`, `graphs`, `gap`, `attribute`), `attribute` as the Prove level, `pinned` and `yours` not built, with the plain line each shows (WAIT). That the session owns the marks as actions; the list mode for phones. The most marks a graded `attribute` case may need, and which spans arrive already categorized at each level, with the reason. The graded `gap` answer as a place and a cause together; that the game's bar (0.95) and the lesson block's (0.9) are never printed as one rule. A table of each lesson's first act and its control, inside the opener rule: lesson 1 marks a launch and its kernel in a `trace` block; lesson 2 sets `delay_iterations` and `max_iterations` on a synthetic run whose first steps are warm-up and sees which steps the capture holds, and holds the provider preflight (brief item 8); lesson 3 opens on the `graphs` level or a graph-on against graph-off pair; lesson 4 runs `gap` and graded `attribute`; lesson 5 opens on a guess of a floor from bytes and bandwidth and holds the '300 us' question (brief item 9); lesson 6 shows one synthetic step with SGLang's `step[...]` labels beside vLLM's. Each lesson's minutes and own KCs; the module page's prerequisite list; the floor derived from the `qwen3.*` claims, not the brief's 1.2 GB; what TR2's and TR0's built lessons already promise of TR3; the exact files W2b-T97 reads. It also records whether one real torch-profiler trace of a small random-weight module can be captured in the locked CPU environment with no download, where its file would live and its bytes (N19); if yes, the coordinator adds W2b-T210 from the reserve.
- **Read:** curriculum/TR3-profile-a-real-engine.md; curriculum/TR0-pytorch-for-rust.md 'Before you write'; docs/GAMES.md 2.6 and 6; docs/ASSESSMENT.md 4.1 and 4.3; docs/REDESIGN.md 2.5 and P1 to P4; content/README.md rules 8 to 12; src/copy/terms.ts
- **Files:** `curriculum/TR3-profile-a-real-engine.md`; docs/GAMES.md (2.6 and section 6); content/README.md (rule 11); `packages/play/roster.ts`; `src/copy/terms.ts`; tests/copy/terms-tr3.test.ts (new: the form's word is read from the key); `content/kc/graph.yaml`; `tests/kc/graph.test.ts`; docs/DECISIONS.md (the records W2b-T180 reserved for it); the TR3 block of docs/TRACKER.md, W2-T20's 'Before you write' among it
- **Accept:**
  1. bun run verify:kc
  2. bun test tests/play/roster.test.ts tests/content/roster.test.ts tests/content/vocabulary.test.ts
  3. Every KC has a family, a graded level or a credit-bearing lab stage named in the brief's table
  4. The new text holds no word of `src/copy/banned.ts`
  5. A fresh opus read before the merge, told to find a KC with no graded reference, a term used before it is given, a lesson with no first act and a promise of a built lesson the design breaks, finds none or its rows are fixed in the branch
  6. Nothing says the owner chose
- **Browser tests:** smoke, by G0
- **Owner default:** N1; N2 ('CPU gap' for the form, 'bubble' kept for TR2's idea); the brief's four questions (no unprofiled run per side; no 'what changed' table; no further quotation of the book); N19; O-14, O-17, Q-5

#### [ ] W2b-T97 · TR3's sources at the pins, as claims · L · sonnet · deps: W2b-T96, W2b-T76
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `content/claims/tr3.yaml` (60 to 90 rows [estimated]). It fetches exactly: of vLLM at commit 4ba787ec, `docs/contributing/profiling.md` and `vllm/config/profiler.py`, the files those name for the profiled step, and the four Triton kernel files that W2b-T52 walked (for what one program of each covers), each as a raw file at that commit; of SGLang at commit 297e54fd, `benchmark_and_profiling.mdx` (path as research row T1 gives); of PyTorch, the profiler's source documentation file in the repository at tag v2.14.0; of NVIDIA, the Nsight Systems User Guide in its 2026.5 archived version or the copy that ships with the 2026.5.1 package (the flags, the `perf_event_paranoid` requirement, the field definitions of `cuda_kern_exec_trace`); of Perfetto, the trace-format document at tag v59.1; of NVIDIA, the driver requirement of the CUDA 13 wheels as the pinned vLLM's install document states it at 4ba787ec. It re-cites `mlc-book.gemm-launch-api` to the book's repository file: one request resolves the repository's current commit id, then `appendix/benchmarking_gpu_kernels.md` is read at that id, which is recorded as a pin; no new quote of the book is added, and a `verify:claims` rule refuses any other claim that cites the book. A blog post or a provider's page with no version is read once and its claim is `[unverified]`.
- **Read:** content/claims/README.md; research/upstream-vllm.md P1 and research/upstream-sglang.md T1 to T3, N1 to N5, C4 (as pointers only); the rewritten brief
- **Files:** `content/claims/tr3.yaml`; content/claims/tr2.yaml (one claim); `course.lock.json`; scripts/verify-claims.ts or its rule file, and its test; `content/cards/trace-room-trace.md`; public/labs/* (a repack, if the lock changed; then it merges in lane G's order)
- **Accept:**
  1. A plan is the first comment
  2. SRC
  3. Each cited page is version-specific: a tagged file or an archived guide; a claim with no versioned copy stays `[unverified]` and is listed
  4. The 'Queue Dur' sentence is kept only if the pinned guide defines the column; else the claim is not written and the design's sentence is dropped
  5. The trace's event names at the pin stay `[unverified]` (no owner capture exists) and are listed
- **Browser tests:** none; the gate's `a11y` on `/changes` at nightly width if the lock changed
- **Owner default:** O-4, O-21, O-3 (nothing is copied from the book; it is cited only)

#### [ ] W2b-T98 · The trace generator draws a second GPU stream · M · sonnet · deps: W2b-T96
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** An option of `traceFromRun` adds a second `gpu-stream` track, so that an empty stretch on one stream can be covered by the other.
- **Read:** packages/sim/trace/synth.ts, attribute.ts; the brief's point (a)
- **Files:** `packages/sim/trace/synth.ts`; `tests/sim/trace*.test.ts`; tests/fixtures/sim/ (new goldens only)
- **Accept:**
  1. A test that every existing golden is byte-identical with the option off
  2. GPU-busy is the union over streams in `attribute` (200 seeds in chunks of 100)
  3. `traceChecks` passes on two-stream traces
- **Browser tests:** features: trace-view

#### [ ] W2b-T99 · The gap and cause model: cases with a known cause, the band, the reference split · L · sonnet · deps: W2b-T98
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `huntCase`, `referenceSplit` and `checkHunt` of GAMES 6: a seeded case whose largest gap has one of three causes (eager launches, a call that waits, host scheduling), in a band where the largest gap is at least 1.5 times the second and one CPU span covers at least 60% of its lead-in; the three parts of a gap between two kernels in exact integer ns, keeping seeds where a part is zero; node-level graph traces for `graphs`; a bestiary of plausible wrong causes.
- **Read:** docs/GAMES.md section 6; packages/sim/trace/; the rewritten brief, points (a) and (b)
- **Files:** packages/sim/trace/hunt.ts and its parts; `tests/sim/trace-hunt*.test.ts`; `tests/fixtures/sim/`
- **Accept:**
  1. A plan is the first comment
  2. The partition sums to the window exactly on 200 seeds
  3. Each bestiary cause fails `checkHunt`
  4. DC-H, with the HEAVY run by the coordinator
  5. No existing golden moves
- **Browser tests:** features: trace-view

#### [ ] W2b-T100 · Trace attribution's pure session · L · sonnet · deps: W2b-T99
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `packages/play/gap-hunt/**`, unregistered, to the pattern of `packages/play/shape-shifter/`: entry, the levels `read`, `graphs`, `gap`, `attribute`, bands, score, a session over `mark`, `unmark`, `cause`, `submit`, debrief, labels, copy, blind probes; `prove: 'attribute'`; `seedInPage: false`.
- **Read:** packages/play/shape-shifter/ (the model); the rewritten brief; docs/ASSESSMENT.md 4.1
- **Files:** `packages/play/gap-hunt/**`; `scripts/games/blind.ts`; packages/play/predictions/ (the game's block); `tests/play/gap-hunt-*.test.ts`; `tests/copy/game-copy.test.ts`; `tests/copy/no-kitchen.test.ts`
- **Accept:**
  1. A plan is the first comment
  2. The blind probe of each graded level is measured in the first commit and is at most 15%
  3. Three habits (always the first gap, always the same cause, the widest-looking span) pass at most that on 50 fresh seeds each
  4. The reference's move count for a graded case is measured on 200 seeds and stays under the design's bound
  5. DC-E as a 200-walk fuzz with the 'largest misattributed span' recomputed by brute force; no goal line or readout, practice or graded, holds the answer to its guess
  6. The goal line and stems read the form's word from `src/copy/terms.ts`
  7. DC-H, with the HEAVY run by the coordinator
  8. No route grows: it is unregistered
- **Browser tests:** none yet
- **Owner default:** O-14, O-17, N2

#### [ ] W2b-T101 · The trace's list mode for phones, on the Traces viewer and in a lesson's `trace` block · M · opus · deps: W2b-T99
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** A component of `src/trace` that shows a step's events as a table with category radios and a cause pick, taking marks as props and emitting actions, so that a phone can do what the lanes do. `src/content/render/TraceTape.tsx` uses it below the narrow breakpoint and writes the same `trace-mark` events.
- **Read:** src/trace/SpanMirror.tsx, marks.ts, keys.ts, key-rules.ts, state.ts; src/content/render/TraceRun.tsx, TraceTape.tsx; docs/ASSESSMENT.md 4.3
- **Files:** src/trace/ListMode.tsx, its CSS and unit tests; `src/content/render/TraceTape.tsx`; e2e/trace-view.spec.ts (on the dev specimen and a lesson specimen)
- **Accept:**
  1. At 360x640 and 320x640 a whole step can be marked by touch and by keys, on the viewer and on a lesson specimen
  2. Touch targets are at least 44 px
  3. DC-A, DC-B, DC-C and DC-G for the list
  4. axe passes
  5. The `/trace-room` route, the lesson route and the lesson's `TraceTape` chunk are reported
- **Browser tests:** features: trace-view

#### [ ] W2b-T102 · The Traces page · M · sonnet · deps: W2-T20
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `/trace-room` in production: the synthetic traces with their cards, reached from Games and from TR3; one plain line that traces captured from a real engine are not recorded yet and that every trace on the page is made by the course's model (WAIT).
- **Read:** src/pages/TraceRoom.tsx; the tracker's W2-T20; content/cards/trace-room-*.md
- **Files:** `src/pages/TraceRoom.tsx`; `src/trace/ids.ts`; `src/unbuilt/copy.ts`; e2e/routes.ts, e2e/first-visit.spec.ts, e2e/support/screens.ts
- **Accept:**
  1. The page names its way on and its parts (first-visit)
  2. Nothing is called pinned or measured; the copy-guard test of W2b-T129, if merged, passes on the route
  3. The step-loop code it shares with the front page adds at most 30 B to the first paint; ROWS
- **Browser tests:** features: trace-view; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on `/trace-room`
- **Owner default:** O-5

#### [ ] W2b-T103 · Check: Trace attribution and the Traces page · L · opus · deps: W2b-T102
- **Kind:** check; lane 2a:TR3; merges nothing.
- **Goal:** CHK with DC-B's twelve sizes; every level played whole in lanes and in list mode; rotation mid-level and 200% zoom; Prove mode attacked as in DC-D; 50 fresh seeds per habit on each graded level; once under CDP throttling 6x and 30x; how many marks a graded case took, against the design's bound.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T104 · Fix round for Trace attribution · M · opus · deps: W2b-T103
- **Kind:** fix; lane 2a:TR3; merges; merges after: W2b-T195.
- **Goal:** FIX: every broken row of W2b-T103 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `src/games/gap-hunt/`; `packages/play/gap-hunt/`; `src/trace/`; `src/pages/TraceRoom.tsx`
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: gap-hunt, gap-hunt-sizes, trace-view, keep-list; nightly width: walks (gap-hunt)

#### [ ] W2b-T195 · Confirm W2b-T104 · S · opus · deps: —
- **Kind:** confirm; lane 2a:TR3; merges nothing; finished before it starts: W2b-T104.
- **Goal:** CONFIRM: before W2b-T104 merges, a fresh context re-runs the rows it says it fixed and the DC-A to DC-G sweep of Trace attribution at DC-B's twelve sizes, in lanes and in list mode, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T105 · TR3's item families, first half · M · sonnet · deps: W2b-T96, W2b-T99, W2b-T87
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `tr3.which-category`, `tr3.capture-window`, and the families the design names for `tr3.trace-anatomy` and `tr3.graph-traces`, each with a numeric variant, keys from `packages/sim/trace`.
- **Read:** packages/play/items/families/tr0/ (the model); the rewritten brief
- **Files:** `packages/play/items/families/tr3/*.ts`; packages/play/items/registry.ts, catalog.ts; `src/items/families.ts`; `tests/play/items-tr3-*.test.ts`; `tests/fixtures/items/vectors.json`; content/kc/graph.yaml (its `planned:` lines)
- **Accept:**
  1. bun run verify:items, verify:kc
  2. Each family's blind bound is at most 15%
  3. No first step holds its key
  4. DC-H
  5. ROWS (`/today`), inside W2b-T87's room; it stops and reports otherwise
- **Browser tests:** features: items, today
- **Owner default:** O-14

#### [ ] W2b-T106 · TR3's item families, second half · M · sonnet · deps: W2b-T105, W2b-T97
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `tr3.gap-cause` with the three-part numeric variant (timestamps from the item's seed, seeds with a zero part kept); `tr3.floor` (from the `qwen3.*` and hardware claims); `tr3.flat-curve`; `tr3.provider-preflight` (keys from the driver and `perf_event_paranoid` claims of `tr3.yaml`); a Test-level test for each lesson's own KCs.
- **Read:** as W2b-T105; content/claims/tr3.yaml
- **Files:** as W2b-T105; `tests/play/items-tr3-test-level.test.ts`
- **Accept:**
  1. As W2b-T105
  2. Stems read the form's word from `src/copy/terms.ts`
  3. Every key that rests on an upstream fact cites its claim id
- **Browser tests:** features: items, today
- **Owner default:** O-14, N2

#### [ ] W2b-T107 · TR3 lesson 1 and the module page · M · opus · deps: W2-T20, W2b-T105, W2b-T97, W2b-T77
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** `content/modules/tr3/module.md` and lesson 1, 'A trace is evidence': tracks, spans, correlation ids and flows given before they are used; the first lesson to use the `trace` block. The module page's first screen says that the browser part uses traces made by the course's model, shows the lab as not published, and says only what is true when it merges.
- **Read:** the rewritten brief; content/README.md; content/modules/tr0/ (the model); tests/content/module-kit.ts (and not the PACING_CODES allowance of the tr1, tr2 and tr5a tests)
- **Files:** `content/modules/tr3/module.md`; `content/modules/tr3/lessons/l1-*.md`; tests/content/tr3-module.test.ts, tr3-demos.ts; tests/content/openers-table.ts, module-counts.ts; `packages/play/predictions/{plan,truth,commit-tr3,tr3}.ts`; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr3/**, public/llms.txt
- **Accept:**
  1. LES
  2. A sentence about what a real vLLM trace holds says the names are the model's, since the course has opened no trace of the pinned engine
  3. The front page's Start still names TR1 lesson 1
  4. DC-F on the lesson
  5. The lesson's first action comes within 60 seconds of reading (the design's first-act table)
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels
- **Owner default:** N5, N8 as answered; O-21

#### [ ] W2b-T108 · Check: TR3's lesson 1, its module page and the `trace` block · M · opus · deps: W2b-T107
- **Kind:** check; lane 2a:TR3; merges nothing.
- **Goal:** CHK as a learner who skipped TR0: every guess, the `trace` block by keys and by touch at 360x640 (list mode), the Test passed and failed, a term met before it is given, an answer shown before it is asked, a bare dash with no caption.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T109 · Fix round for TR3's lesson 1 · S · sonnet · deps: W2b-T108
- **Kind:** fix; lane 2a:TR3; merges; merges after: W2b-T196.
- **Goal:** FIX: every broken row of W2b-T108 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `content/modules/tr3/`; src/content/render/ if the block is at fault; `public/md/tr3/**`
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels

#### [ ] W2b-T196 · Confirm W2b-T109 · S · opus · deps: —
- **Kind:** confirm; lane 2a:TR3; merges nothing; finished before it starts: W2b-T109.
- **Goal:** CONFIRM: before W2b-T109 merges, a fresh context re-runs the rows it says it fixed and DC-F on the lesson and a terms-before-use read of the touched parts, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T110 · TR3 lessons 2 and 3 · M · sonnet · deps: W2b-T109, W2b-T106
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** Capturing vLLM at the pin, with the provider preflight (driver, `perf_event_paranoid`, the GPU's name); and nsys with CUDA graphs. Each opens on the first act the design names. Commands come from the pin's documents and are `[unverified]`. Warm-up gets one sentence and a pointer to TR8. NVTX and node-level traces are said before they are used. Lesson 3 has its graph-on against graph-off table with a column for what else changed (rule 10) and the stream card (a).
- **Read:** as W2b-T107; content/claims/tr3.yaml
- **Files:** content/modules/tr3/lessons/l2-*.md and l3-*.md; tests/content/tr3-module.test.ts, tr3-demos.ts; tests/content/openers-table.ts, module-counts.ts; `packages/play/predictions/{plan,truth,commit-tr3,tr3}.ts`; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr3/**, public/llms.txt
- **Accept:**
  1. LES
  2. Lesson 2's Test asks `tr3.capture-window` and `tr3.provider-preflight`; lesson 3's asks `tr3.graph-traces`
  3. The 'Queue Dur' sentence appears only if W2b-T97 wrote its claim
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels
- **Owner default:** O-21

#### [ ] W2b-T111 · TR3 lesson 4, attribution · M · opus · deps: W2b-T109, W2b-T106
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** The partition that sums to the window; a gap's cause read off the launch queue; the three parts of a gap; rule 11's form written once, with the word of `src/copy/terms.ts`, and one sentence that this category is what TR2 called the bubble, seen in a trace. It runs `gap` and graded `attribute`. A stream, a sync and the blocking calls are given in this lesson's own words or in lesson 1: TR0 is optional.
- **Read:** as W2b-T107; content/modules/tr2/lessons/l3-async-scheduling-closes-the-bubble.md
- **Files:** `content/modules/tr3/lessons/l4-*.md`; tests/content/tr3-module.test.ts, tr3-demos.ts; tests/content/openers-table.ts, module-counts.ts; `packages/play/predictions/{plan,truth,commit-tr3,tr3}.ts`; e2e/routes.ts, e2e/support/lessons.ts, e2e/lesson-games.spec.ts; e2e/first-visit.spec.ts and e2e/support/screens.ts (its own routes' rows); public/md/tr3/**, public/llms.txt; tests/content/vocabulary.test.ts (the mapping of the two words, one row)
- **Accept:**
  1. LES
  2. No real number: a dash with its caption, or the hypothesis, wherever a captured gap would be
  3. The form's words, the `attribute` goal line and the item stems use one term, the one `src/copy/terms.ts` holds; `tests/content/vocabulary.test.ts` passes across all modules
  4. The graded `attribute` block is graded, not Prove
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels
- **Owner default:** N2

#### [ ] W2b-T182 · Check: a cold read of TR3's lessons 1 to 4 as they stand · M · opus · deps: W2b-T110, W2b-T111
- **Kind:** check; lane 2a:TR3; merges nothing.
- **Goal:** A fresh reader takes TR2 and then TR3's lessons 1 to 4 in order, as a learner who skipped TR0, and looks for a term used before it is given, a Test question the lesson did not teach, a first act that is reading and not doing, and a table cell with no reason for being empty. It also plays each lesson's block on a phone.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T183 · Fix round for TR3's lessons 2 to 4 · S · opus · deps: W2b-T182
- **Kind:** fix; lane 2a:TR3; merges; merges after: W2b-T197.
- **Goal:** FIX: every broken row of W2b-T182 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `content/modules/tr3/`; `public/md/tr3/**`
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels

#### [ ] W2b-T197 · Confirm W2b-T183 · S · opus · deps: —
- **Kind:** confirm; lane 2a:TR3; merges nothing; finished before it starts: W2b-T183.
- **Goal:** CONFIRM: before W2b-T183 merges, a fresh context re-runs the rows it says it fixed and a terms-before-use read of lessons 1 to 4 and DC-F on each, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T112 · TR3 end to end: the first-visit and screen checks on its routes · S · haiku · deps: W2-T24
- **Kind:** build; lane 2a:TR3; merges.
- **Goal:** Confirm, to the pattern of W2b-T33, that `/m/tr3`, its six lessons, `/play/gap-hunt` and `/trace-room` each have their first-visit and per-screen rows, and add any that the lesson tasks left out. This is W2-T39's share for TR3; it does not close W2-T39.
- **Read:** e2e/first-visit.spec.ts; e2e/screens.spec.ts; e2e/support/screens.ts; e2e/routes.ts
- **Files:** `e2e/first-visit.spec.ts`; `e2e/screens.spec.ts`; `e2e/support/screens.ts`
- **Accept:**
  1. Both widths at `--retries=0`, 5 of 5
  2. No existing expectation is edited
- **Browser tests:** smoke: first-visit, screens, at nightly width

#### [ ] W2b-T113 · Check: TR3's lessons 5 and 6 and the whole module as a learner · M · opus · deps: W2-T24
- **Kind:** check; lane 2a:TR3; merges nothing.
- **Goal:** CHK from `/m/tr3`: lessons 5 and 6 as W2b-T108 did lesson 1, then the module page closed, Review the next day (a moved clock), and the way from the last lesson to the game's Prove control.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T114 · Check: TR3's technical check · M · opus · deps: W2-T24
- **Kind:** check; lane 2a:TR3; merges nothing.
- **Goal:** MODULE END: every claim and number of the six lessons, the items' keys and the game's rule tables against its pinned source, with `bun scripts/claims/requote.ts content/claims/tr3.yaml` (it re-reads only the URLs the claims already store) and a hand re-read of what the script skips; which function holds each cited line; every negative statement's search. Its report is the first commit of W2b-T116's branch, as `docs/waves/W2m2a-tr3-technical.md`.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T115 · Check: TR3's cold-reader check · M · opus · deps: W2-T24
- **Kind:** check; lane 2a:TR3; merges nothing.
- **Goal:** MODULE END: a fresh reader takes TR2 and then TR3 in course order and marks each place they were lost, with the line. Its report is the first commit of W2b-T117's branch, as `docs/waves/W2m2a-tr3-cold-read.md`.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T116 · TR3's fixes from the learner check and the technical check · M · sonnet · deps: W2b-T113, W2b-T114
- **Kind:** fix; lane 2a:TR3; merges.
- **Goal:** FIX: every broken row of W2b-T113, W2b-T114 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `content/modules/tr3/`; `content/claims/tr3.yaml`; `packages/play/items/families/tr3/`; `docs/waves/W2m2a-tr3-technical.md`; `public/md/tr3/**`
- **Accept:**
  1. It is split in two if the rows pass twelve
  2. Each fix has a test that failed before it
  3. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  4. KIT LOCK if `src/games/kit/` or `src/design/` changes
  5. ROWS
  6. SHOTS if a baseline is re-shot
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels

#### [ ] W2b-T117 · TR3's teaching fixes and a re-read of W2b-T116 · M · opus · deps: W2b-T115, W2b-T116
- **Kind:** fix; lane 2a:TR3; merges; merges after: W2b-T198.
- **Goal:** Rewrite the passages where the cold reader was lost; re-read what W2b-T116 changed; close every row of both reports in a 'Closing lines' section.
- **Read:** both reports; content/modules/tr3/
- **Files:** `content/modules/tr3/`; `docs/waves/W2m2a-tr3-cold-read.md`; `public/md/tr3/**`
- **Accept:**
  1. LES for the touched lessons
  2. Every row is closed as fixed, left for a named task, or left for the owner with the reason
- **Browser tests:** features: lesson-games, lesson-predict, trace-view, map, titles, items, front; smoke: first-visit, a11y, screens; nightly width: a11y at 320 px on the module page and each touched lesson; nightly width: walks (gap-hunt) for the lesson's levels

#### [ ] W2b-T198 · Confirm W2b-T117 · S · opus · deps: —
- **Kind:** confirm; lane 2a:TR3; merges nothing; finished before it starts: W2b-T117.
- **Goal:** CONFIRM: before W2b-T117 merges, a fresh context re-runs the rows it says it fixed and a terms-before-use read of every rewritten passage and DC-F on each touched lesson, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T120 · Final check: the three games the wave built or changed most, and Prove mode · L · opus · deps: W2b-T71, W2b-T75, W2b-T76, W2b-T81, W2b-T87, W2b-T89, W2b-T91, W2b-T93, W2b-T95, W2b-T104, W2b-T112, W2b-T117, W2b-T134, W2b-T38
- **Kind:** check; lane 2a:Exit; merges nothing.
- **Goal:** CHK on Trace attribution, Tensor views and the Rejection sampler: each level played whole, rotation and 200% zoom, double presses on every committing control by mouse and by keys, and every Prove level attacked as in DC-D.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T184 · Final check: the four older games after the kit changes · L · opus · deps: W2b-T71, W2b-T75, W2b-T76, W2b-T81, W2b-T87, W2b-T89, W2b-T91, W2b-T93, W2b-T95, W2b-T104, W2b-T112, W2b-T117, W2b-T134, W2b-T38
- **Kind:** check; lane 2a:Exit; merges nothing.
- **Goal:** CHK on the Step loop, KV page pool, Request path and Broken benchmark: each level played whole at DC-B's twelve sizes, keyboard alone once, rotation and 200% zoom.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T121 · Final check: TR3 and TR0 walked as a learner from the front page · L · opus · deps: W2b-T71, W2b-T75, W2b-T76, W2b-T81, W2b-T87, W2b-T89, W2b-T91, W2b-T93, W2b-T95, W2b-T104, W2b-T112, W2b-T117, W2b-T134, W2b-T38
- **Kind:** check; lane 2a:Exit; merges nothing.
- **Goal:** CHK from `/` to a passed Test in each lesson of TR3, a Prove run, Review the next day (a moved clock), and TR0 to a defended receipt.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. OFFLINE, as W2b-T94
  2. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  3. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  4. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  5. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T122 · Final check: every page at 320, 390 and 1440 px · L · opus · deps: W2b-T71, W2b-T75, W2b-T76, W2b-T81, W2b-T87, W2b-T89, W2b-T91, W2b-T93, W2b-T95, W2b-T104, W2b-T112, W2b-T117, W2b-T134, W2b-T38
- **Kind:** check; lane 2a:Exit; merges nothing.
- **Goal:** CHK on every document route of `e2e/routes.ts`: reflow, a control off screen, a self-scroll, a false count, raw markup, a dead link, a waiting line that uses a build word, the shared Sources list on a lesson with many claims, a Test header's 'Lesson n of m'.
- **Read:** the built site only; docs/GAMES.md and the module's brief for what the piece should do; no task report
- **Files:** none: the report goes to the coordinator, outside the repository
- **Accept:**
  1. CHK: a fresh opus context that did not build the piece and reads no builder's report; it plays `vite preview` of a pristine export of the tip named in its brief
  2. Widths 1440x900, 390x844 and 320x640, and DC-B's twelve sizes for a game; a mouse, touch emulation, and the keyboard alone; reduced motion on and off; once under CDP CPU throttling 4x
  3. It looks for DC-A to DC-G first, then for anything false, lost or dead; every finding is classed broken, rough or nit, with steps and a measured rectangle, count or quoted line
  4. Its report ends with 'Not checked', listing each thing in its scope it did not reach; it changes no file and merges nothing
- **Browser tests:** none of its own: it drives the built site by hand and with throwaway Playwright scripts that are not committed

#### [ ] W2b-T123 · Fix round for the final checks of the games · M · opus · deps: W2b-T120, W2b-T184
- **Kind:** fix; lane 2a:Exit; merges; merges after: W2b-T200.
- **Goal:** FIX: every broken row of W2b-T120, W2b-T184 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** the game folders the rows name; `src/prove/`; src/games/kit/ (a separate commit)
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** features: every game's spec and sizes spec; nightly width: walks of every game

#### [ ] W2b-T200 · Confirm W2b-T123 · S · opus · deps: —
- **Kind:** confirm; lane 2a:Exit; merges nothing; finished before it starts: W2b-T123.
- **Goal:** CONFIRM: before W2b-T123 merges, a fresh context re-runs the rows it says it fixed and the DC-A to DC-G sweep of each touched game at DC-B's twelve sizes, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T124 · Fix round for the final walk and the final pages check · M · sonnet · deps: W2b-T121, W2b-T122
- **Kind:** fix; lane 2a:Exit; merges; merges after: W2b-T201.
- **Goal:** FIX: every broken row of W2b-T121, W2b-T122 is fixed with a test that failed before; small rough rows are fixed; each other row is closed in a 'Closing lines' section as fixed, left for a named task, or left for the owner with the reason.
- **Read:** the checker's report
- **Files:** `content/modules/`; `src/pages/`; the page CSS; `public/md/**`
- **Accept:**
  1. Each fix has a test that failed before it
  2. No bar, tolerance, timeout or retry moves; an expect line that moves is in the allow file
  3. KIT LOCK if `src/games/kit/` or `src/design/` changes
  4. ROWS
  5. SHOTS if a baseline is re-shot
- **Browser tests:** nightly width: a11y and screens; the touched lessons' specs

#### [ ] W2b-T201 · Confirm W2b-T124 · S · opus · deps: —
- **Kind:** confirm; lane 2a:Exit; merges nothing; finished before it starts: W2b-T124.
- **Goal:** CONFIRM: before W2b-T124 merges, a fresh context re-runs the rows it says it fixed and DC-F on each touched page and lesson at 320, 390 and 1440 px, on a built site of the fix branch, and reports any new broken row.
- **Read:** the fix branch; the checker's report; not the fixer's report
- **Files:** `none`
- **Accept:**
  1. Each fixed row is re-run and marked holds or does not hold, with the measured value
  2. A new broken row is reported to the coordinator, who adds a second round from the reserve
  3. It changes no file
- **Browser tests:** the specs the fix branch lists, once, at `--retries=0`

#### [ ] W2b-T125 · Wave 2a's exit report, with the markers and the merged list · M · opus · deps: W2b-T123, W2b-T124
- **Kind:** build; lane 2a:Exit; merges.
- **Goal:** `docs/waves/W2m2a-report.md` with the sweeps of W2b-T39: G0 on the tip; the bundle table; `known-red.json` empty; every bar the wave moved, from `bun scripts/gate/bars.ts`; a spot check of five tasks; the heavy unit run at nightly size, the rates test, `verify:claims`, `verify:pins`; what each check found and what is still open; an audit of every claimed merge against a merge commit on the first-parent line; the owner's steps and what each page says meanwhile; the defaults taken; that frame-time p95 on a reference laptop and phone was not measured (O-9). In the same commit: the marker of every merged 2a task in `docs/TRACKER.md`, those ids added to `MERGED` in `tests/ci/workflows.test.ts`, and any reserved 'pending: <task>' step that names a merged task built.
- **Read:** docs/waves/W2m1b-report.md (the model); tests/ci/workflows.test.ts 700-790
- **Files:** `docs/waves/W2m2a-report.md`; docs/TRACKER.md (markers); `tests/ci/workflows.test.ts`
- **Accept:**
  1. `ES_E2E_NIGHTLY=1 npx playwright test --project=smoke --project=features` once on the tip, run by the coordinator on four performance cores (HEAVY)
  2. bun test tests/ci
  3. The CI, Labs and `e2e-features` runs on the pushed tip are quoted
  4. No sentence says the owner chose, saw or approved anything but N4, N5 and N8
  5. After it merges the coordinator dispatches `nightly.yml` on that tip and reads all five jobs; a red job is fixed with an addendum; only then is the description written, and it records the run
- **Browser tests:** as the first Accept line
- **Owner default:** lists every open question of wave 2, with its default


### Wave 2b: one line each

W2-T29, W2-T30 and W2-T33 are tasks of 2b whose headings are in the W2 section; they are not repeated here.

#### [ ] W2b-T126 · Wave 2b's headings get their bodies · M · sonnet · deps: W2b-T125
- **Kind:** build; lane 2b:Open; merges.
- **Goal:** Write the Goal, Read, Files and Accept of every 2b heading, from the task list the coordinator hands over with private paths removed, checked against wave 2a's report and, if it is finished, W2b-T118's branch. W2b-T118 writes the bodies of TR5b's own block when it merges. Add a heading for anything a 2a fix round left to 2b. No marker moves: 2a's were set by W2b-T125.
- **Read:** docs/TRACKER.md, wave 2's section; docs/waves/W2m2a-report.md; W2b-T118's branch (the rewritten TR5b brief); the task list
- **Files:** `docs/TRACKER.md`; `tests/ci/task-ids.test.ts`; `tests/content/pending.test.ts`
- **Accept:**
  1. bun test tests/ci tests/kc tests/docs
  2. bun run verify:kc
  3. The set of heading ids equals the handed-over list
  4. Allow file for each moved line; no private path in the diff
- **Browser tests:** smoke, by G0

#### [ ] W2b-T118 · TR5b's design: the brief rewritten, the KCs, the game against GAMES 9, the camera table, the lab's stage list, and each lesson's levels and first act · M · opus · deps: W2b-T96, W2b-T180
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T119 · TR5b's sources at the pins, as claims · L · sonnet · deps: W2b-T76
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T136 · The tiers model gains sequence numbers, a replay buffer, the adapter field, a faulty transport and a restart · M · sonnet · deps: —
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T137 · The yard model, first half: a clock, transfers in flight, request states, layers, the cost of a load against a recompute · L · sonnet · deps: —
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T138 · The yard model, second half: violations, failed loads, the reference, the consumer's view · L · sonnet · deps: —
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T139 · KV offload's pure session, seven levels · L · sonnet · deps: —
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T140 · KV offload's 2D parts, unregistered: lanes per tier, the transfer table, the event log, the consumer's board, the dock · L · opus · deps: W2b-T86
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T141 · Check: KV offload · L · opus · deps: W2-T30
- Body written by W2b-T126. Check; lane 2b:TR5b.

#### [ ] W2b-T142 · Fix round for KV offload · M · opus · deps: W2b-T141
- Body written by W2b-T126. Fix; lane 2b:TR5b.

#### [ ] W2b-T202 · Confirm W2b-T142 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:TR5b.

#### [ ] W2b-T143 · TR5b's item families, first half · M · sonnet · deps: W2b-T138, W2b-T118
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T144 · TR5b's item families, second half · M · sonnet · deps: W2b-T143
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T145 · TR5b lesson 1 and the module page · M · opus · deps: W2-T30, W2b-T143, W2b-T119
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T146 · Check: TR5b's lesson 1 and module page · M · opus · deps: W2b-T145
- Body written by W2b-T126. Check; lane 2b:TR5b.

#### [ ] W2b-T147 · Fix round for TR5b's lesson 1 · S · sonnet · deps: W2b-T146
- Body written by W2b-T126. Fix; lane 2b:TR5b.

#### [ ] W2b-T203 · Confirm W2b-T147 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:TR5b.

#### [ ] W2b-T148 · TR5b lesson 2, the connector contract · M · opus · deps: W2b-T147, W2b-T144
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T185 · Check: a cold read of TR5b's lessons 1 and 2 · S · opus · deps: W2b-T148
- Body written by W2b-T126. Check; lane 2b:TR5b.

#### [ ] W2b-T186 · Fix round for TR5b's lesson 2 · S · opus · deps: W2b-T185
- Body written by W2b-T126. Fix; lane 2b:TR5b.

#### [ ] W2b-T204 · Confirm W2b-T186 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:TR5b.

#### [ ] W2b-T149 · TR5b lessons 3 and 4 · M · sonnet · deps: W2b-T186, W2-T29
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T150 · TR5b end to end: the first-visit and screen checks on its routes · S · haiku · deps: W2-T33
- Body written by W2b-T126. Build; lane 2b:TR5b.

#### [ ] W2b-T151 · Check: TR5b's lessons 3 to 5 and the whole module as a learner · M · opus · deps: W2-T33
- Body written by W2b-T126. Check; lane 2b:TR5b.

#### [ ] W2b-T152 · Check: TR5b's technical check · M · opus · deps: W2-T33
- Body written by W2b-T126. Check; lane 2b:TR5b.

#### [ ] W2b-T153 · Check: TR5b's cold-reader check · M · opus · deps: W2-T33
- Body written by W2b-T126. Check; lane 2b:TR5b.

#### [ ] W2b-T154 · TR5b's fixes from the learner check and the technical check · M · sonnet · deps: W2b-T151, W2b-T152
- Body written by W2b-T126. Fix; lane 2b:TR5b.

#### [ ] W2b-T155 · TR5b's teaching fixes and a re-read of W2b-T154 · M · opus · deps: W2b-T153, W2b-T154
- Body written by W2b-T126. Fix; lane 2b:TR5b.

#### [ ] W2b-T205 · Confirm W2b-T155 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:TR5b.

#### [ ] W2b-T156 · `kv-publisher`, stages s5 and s6 · M · sonnet · deps: W2-T29
- Body written by W2b-T126. Build; lane 2b:G.

#### [ ] W2b-T157 · Prove-it on a forge lab, for `hybrid-kv`, `rejection-sampler` and `kv-publisher` · L · opus · deps: W2-T29, W2b-T156, W2b-T78
- Body written by W2b-T126. Build; lane 2b:G.

#### [ ] W2b-T158 · Check: the `kv-publisher` page and Prove-it on the three forge labs · M · opus · deps: W2b-T157
- Body written by W2b-T126. Check; lane 2b:G.

#### [ ] W2b-T159 · Fix round for the forge lab and Prove-it · M · opus · deps: W2b-T158
- Body written by W2b-T126. Fix; lane 2b:G.

#### [ ] W2b-T206 · Confirm W2b-T159 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:G.

#### [ ] W2b-T170 · TR7's design · S · opus · deps: W2b-T180
- Body written by W2b-T126. Build; lane 2b:TR7.

#### [ ] W2b-T171 · TR7's sources at the pins, and a census script · M · sonnet · deps: W2b-T76
- Body written by W2b-T126. Build; lane 2b:TR7.

#### [ ] W2b-T172 · TR7's targets, as a draft for the owner · S · sonnet · deps: —
- Body written by W2b-T126. Build; lane 2b:TR7.

#### [ ] W2b-T135 · 'In vLLM today' and Build cards in TR1, TR2, TR5a, TR6 and TR8 · M · sonnet · deps: W2b-T129, W2b-T126
- Body written by W2b-T126. Build; lane 2b:Cards.

#### [ ] W2b-T187 · Check: the cards in the five older modules · S · opus · deps: W2b-T135
- Body written by W2b-T126. Check; lane 2b:Cards.

#### [ ] W2b-T188 · Fix round for the cards · S · sonnet · deps: W2b-T187
- Body written by W2b-T126. Fix; lane 2b:Cards.

#### [ ] W2b-T207 · Confirm W2b-T188 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:Cards.

#### [ ] W2b-T173 · Final check: KV offload, Trace attribution, Tensor views, and every Prove level and Prove-it · L · opus · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188
- Body written by W2b-T126. Check; lane 2b:Exit.

#### [ ] W2b-T189 · Final check: the five other games · L · opus · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188
- Body written by W2b-T126. Check; lane 2b:Exit.

#### [ ] W2b-T174 · Final check: TR5b and TR3 walked as a learner, and the forge lab · L · opus · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188
- Body written by W2b-T126. Check; lane 2b:Exit.

#### [ ] W2b-T175 · Final check: every page at 320, 390 and 1440 px · L · opus · deps: W2b-T142, W2b-T150, W2b-T155, W2b-T159, W2b-T172, W2b-T188
- Body written by W2b-T126. Check; lane 2b:Exit.

#### [ ] W2b-T176 · Fix round for the final checks of the games · M · opus · deps: W2b-T173, W2b-T189
- Body written by W2b-T126. Fix; lane 2b:Exit.

#### [ ] W2b-T208 · Confirm W2b-T176 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:Exit.

#### [ ] W2b-T177 · Fix round for the final walk and the final pages check · M · sonnet · deps: W2b-T174, W2b-T175
- Body written by W2b-T126. Fix; lane 2b:Exit.

#### [ ] W2b-T209 · Confirm W2b-T177 · S · opus · deps: —
- Body written by W2b-T126. Confirm; lane 2b:Exit.

#### [ ] W2b-T178 · Wave 2's exit report, with the markers and the merged list · M · opus · deps: W2b-T176, W2b-T177
- Body written by W2b-T126. Build; lane 2b:Exit.


#### [ ] W2b-T210 · TR3: one real profiler trace from the locked CPU environment · S · sonnet · deps: W2b-T96
- Run only if W2b-T96's record says yes (N19): one real torch-profiler trace of a small random-weight module, captured in the locked CPU environment with no download. It is not one of the tasks handed over for wave 2; it is added from the reserve, and its size and model are [estimated] until that record gives them. If the record says no, it is not run, and no marker is ever set.

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
- **For the guide's author, before the `attribute` step is written:** to test a hypothesis about where the time goes, change one factor, check that the output is still correct, check that the metric the hypothesis predicted has moved, and only then compare latency with the profilers off; if the metric moved and the latency did not, either another bottleneck has taken its place or the hypothesis was incomplete. The method is set out at length in the appendix "Measuring and Analyzing GPU Kernel Performance" of "Modern GPU Programming For MLSys" (https://mlc.ai/modern-gpu-programming-for-mlsys/appendix/benchmarking_gpu_kernels.html, read 2026-11-18). Cite it; copy none of its words, because no licence was found for it.

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
