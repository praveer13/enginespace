# enginespace: build tracker

**Status:** proposed backlog, with all 120 tasks `todo`. **Date:** 2026-11-03. **Source:** [ARCHITECTURE.md](ARCHITECTURE.md) (cited as A§n) and [DECISIONS.md](DECISIONS.md) (D-nnn, O-n). Credit rules come from `docs/ASSESSMENT.md`, written in parallel; the look comes from DESIGN.md, chosen separately.

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
  - `opus` for wave exit reviews;
  - `owner` for tasks only the owner can do. These tasks block their dependants, and agents never simulate them.
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
5. **Sibling repos are read-only.** Read kernelspace (`/home/praveern/workplace/kernelspace`) and statespace only with `git -C <repo> show`, `ls-tree` and `grep`. Never add, commit or push there.
6. **Dependencies.** Add none without a DECISIONS record and an exact pin (A§14). Use no `^` and no `~`.
7. **Numbers.** Tag every number in content and docs as [measured], [derived], [estimated] or [unverified], and date every upstream fact. In content, put facts in claims (A§4.4). Never invent a fact. If one cannot be sourced, mark it [unverified] and list it in the PR.
8. **Web requests.** Send a generic User-Agent, and never send the owner's name or email in a header, URL or payload. The site itself makes no third-party request.
9. **Look.** Choose no colours, fonts or visual style (D-006). Use the token roles in `src/design/tokens.ts`.
10. **Done means:**
    - `npm run lint`, `npm run typecheck`, `bun test`, `npm run build` and every `verify:*` the task touches pass;
    - the PR lists each acceptance check with its evidence;
    - you commit on the task branch, open a PR into the wave branch, and never merge.

## Wave gates and the critical path

- **W0** starts now.
- **W1** starts after W0-T24.
- **W2's grader track** (W2-T01 to W2-T12) may start after W0-T24 and run alongside W1. **W2's module tasks** start after W1-T38.
- **W3** starts after W2-T41.
- **Branches.** Each wave branch stacks on the previous unmerged one, and the owner merges in order (D-036).

**Critical paths** [estimated, taking each size at its upper bound]:
- **W0:** T01 → T03 → T12 → T13 (the TR2 spike, D-040) → T16 → T17 → T18 → T20 → T24. T05, T14 and T15 run alongside.
- **W1:** two chains. One is T03 → T04 → T14 for items, with T12 → T13 for The Loop. The other is T21 → T22 for the KV lab. Both end at T36 → T38.
- **W2:** T01 → T02 → T08 → T12 (owner fixtures). The module labs follow, then T39 → T41. Owner tasks T21 (traces) and T17 (the bank) gate T22 and TR0's browser re-check.
- **W3:** T01 (owner's commit pairs) → T02 → T03 → T17.

## Summary

| Wave | Goal | Tasks | S | M | L | Owner | Opus |
|---|---|---|---|---|---|---|---|
| W0 | Scaffold, design-system hookup, the front-page 3D game | 24 | 7 | 14 | 3 | 0 | 1 |
| W1 | The no-GPU modules (TR1, TR2, TR5a, TR6, TR8) and their games | 38 | 6 | 18 | 14 | 2 | 1 |
| W2 | The GPU modules (TR0, TR3, TR4, TR5b, TR7), the local grader, and the GPU parts of TR1, TR6 and TR8 | 41 | 5 | 23 | 13 | 4 | 1 |
| W3 | The capstone, polish and launch | 17 | 7 | 9 | 1 | 3 | 1 |
| **Total** | | **120** | **25** | **64** | **31** | **9** | **4** |

The owner column counts tasks only the owner can do. It leaves out reviewing PRs and answering O-1 to O-11.

---

## W0: scaffold, design-system hookup, the front-page 3D game

**Exit criteria:**
- `/` is playable in 2D from first paint and in 3D after LCP on a capable device.
- The fast gate runs in CI, and every budget in A§11.1 is measured.
- The TR2 spike (W0-T13) has passed.

#### [ ] W0-T01 · Scaffold the app · M · sonnet · deps: —
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

#### [ ] W0-T02 · Vendor kernelspace at d478f91 · S · sonnet · deps: W0-T01
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

#### [ ] W0-T03 · Package boundaries and the determinism lint · S · sonnet · deps: W0-T01
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

#### [ ] W0-T04 · CI workflows and the gate registry · M · sonnet · deps: W0-T01
- **Goal:** `ci.yml`, `deploy.yml`, `nightly.yml` and `labs.yml` per A§10, and a gate registry in which an unbuilt gate prints `pending: <task>` and exits 0 (kernelspace's pattern).
- **Read:** A§10; kernelspace's `.github/workflows/{ci,deploy,nightly,labs}.yml` (`git show`).
- **Files:** `.github/workflows/*.yml`; `scripts/verify.ts` (gate name → script or pending task id); `package.json` scripts `verify:*` and `verify:all`.
- **Accept:**
  1. Every action is pinned by full SHA with A§10.3's version comment. Jobs default to `permissions: contents: read`, and checkout sets `persist-credentials: false`.
  2. `bun run verify:all` runs every A§10.2 gate, and pending ones name their task.
  3. `deploy.yml` builds with `VITE_BASE=/enginespace/` on pushes to `main` only, behind `if: vars.PAGES_ENABLED == 'true'` until O-2 is answered.
  4. On failure, `nightly.yml` opens or updates one `nightly-failure` issue.
  5. A test parses every workflow file with js-yaml.

#### [ ] W0-T05 · Design-token contract with system-colour placeholders · M · sonnet · deps: W0-T01
- **Goal:** The token roles that every page and scene needs, wired through CSS custom properties, Tailwind and scene materials, with no visual choices (D-006, A§6.4).
- **Files:**
  - `src/design/tokens.ts`, the role list:
    - surfaces 0-3, text 1-3, focus ring, accent;
    - status (ok, warn, bad, info) and categorical slots 1-8;
    - lane roles (cpu, gpu, sync, copy, idle);
    - memory roles (free, used, cached, shared, adapter, evicted);
    - probability roles (target, draft, overlap, residual, observed);
    - motion durations and easings, radii, spacing;
    - type roles (display, heading, body, mono, numeric);
    - and the declared contrast pairs.
  - `src/design/tokens.css`: every role as `--es-*`. Placeholder values are CSS system colours (`Canvas`, `CanvasText`, `GrayText`, `Highlight`, `HighlightText`, `LinkText`, `Mark`, `ButtonFace`, `ButtonText`, `Field`, `FieldText`) and system font stacks, each marked `/* placeholder until DESIGN.md */`.
  - `tailwind.config.ts`, mapping the theme to the variables.
  - `src/design/scene-tokens.ts`: `useSceneTokens()` reads computed values, and re-reads on `prefers-color-scheme` and `prefers-contrast` changes.
  - `scripts/verify-tokens.ts`, `tests/design/tokens.test.ts`.
- **Accept:**
  1. A test greps `src/` outside `tokens.css` and finds no hex, `rgb(`, `hsl(` or palette colour and no font-family name.
  2. `verify:tokens` passes and lists the placeholder roles. It reports placeholders without failing.
  3. Every role in `tokens.ts` has a CSS variable, a Tailwind key and a scene-token entry (test).

#### [ ] W0-T06 · Apply the visual identity's tokens · S · sonnet · deps: W0-T05; blocked until DESIGN.md lands
- **Goal:** Replace the placeholders with DESIGN.md's values, self-host its fonts, and add any icon package it names, with a DECISIONS record and an exact pin.
- **Files:** `src/design/tokens.css`, `public/fonts/*`, NOTICE (font licences), `docs/DECISIONS.md` (only if a dependency is added).
- **Accept:**
  1. `verify:tokens` passes with no placeholder left, and every declared pair meets its A§11.2 contrast threshold.
  2. Loading fonts sends no request off the origin (W0-T21's network check).
  3. `/design` shows every role with its value.

#### [ ] W0-T07 · Schemas: content, claims, lock and KC · S · sonnet · deps: W0-T03
- **Goal:** zod schemas for lesson and module front matter, the eight block types, claims, `course.lock.json` entries and the KC graph, plus the ref grammar (A§4.2-A§4.5).
- **Files:** `packages/schema/{content,claims,lock,kc,refs}.ts`; `tests/schema/*.test.ts` with valid and invalid fixtures.
- **Accept:**
  1. Each schema rejects unknown keys and accepts A§4.2's examples, which are copied into fixtures.
  2. Every ref example in A§4.5 parses, and a malformed ref fails.

#### [ ] W0-T08 · Content compiler v0 and the content gates · M · sonnet · deps: W0-T07
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

#### [ ] W0-T09 · Content renderer and page shells · M · sonnet · deps: W0-T08
- **Goal:** A React renderer for the token tree and the blocks, with claim chips, tag chips, and the module and lesson pages. Blocks whose features are not built yet render a placeholder naming the task that builds them.
- **Files:** `src/content/render/{Prose,Blocks,ClaimChip,TagChip}.tsx`, `src/content/load.ts` (`import.meta.glob`, lazy), `src/pages/{Module,Lesson}.tsx`.
- **Accept:**
  1. `/m/tr2` and `/m/tr2/l0-sample` render every block type.
  2. A claim chip shows the value, unit, source title and `verifiedAt`, and "stale since" past its TTL (unit test with a fixed today).
  3. Headings form a valid outline (axe, W0-T21).

#### [ ] W0-T10 · Ledger core · M · sonnet · deps: W0-T07
- **Goal:** `packages/ledger` per A§7: the envelope and kinds, ids, a strict codec, merge, a memory store, a store-agnostic conformance suite and the provenance enum (D-024).
- **Read:** A§7; the shape of kernelspace's `src/lib/ledger/store-conformance.ts` (`git show`).
- **Files:** `packages/ledger/{types,ids,codec,merge,memory-store,conformance,provenance}.ts`; `tests/ledger/*.test.ts`.
- **Accept:**
  1. The conformance suite passes against the memory store.
  2. Over 200 seeds, double import, merging in any order, and replace-then-undo all give identical ledgers.
  3. The codec rejects unknown kinds, malformed refs and scores outside [0, 1].
  4. No event carries a weight (test).

#### [ ] W0-T11 · Ledger in the browser · M · sonnet · deps: W0-T10
- **Goal:** The IndexedDB store (A§7.1's stores), the outbox, BroadcastChannel sync, the schema guard, the persistence request, export and import with undo, and `useEvidence()`.
- **Files:** `src/evidence/{idb-store,outbox,channel,guard,export,import,useEvidence}.ts`; `e2e/ledger-conformance.spec.ts`.
- **Accept:**
  1. The same conformance suite passes against IndexedDB in Playwright Chromium.
  2. An append in one tab shows in a second tab within 1 s.
  3. A database with a newer `schemaVersion` puts the app in read-only mode with a reload prompt.
  4. Export, clear, then import (merge) round-trips to byte-identical canonical JSON.

#### [ ] W0-T12 · Sim core: rng, time, workload, physics and host cards · M · sonnet · deps: W0-T02, W0-T03
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

#### [ ] W0-T13 · Sim: the step-loop model v0, the TR2 spike · L · sonnet · deps: W0-T12
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

#### [ ] W0-T14 · Game framework core · M · sonnet · deps: W0-T03, W0-T10
- **Goal:** The session contract, the registry, the action log and replay grader, the announcer, the keyboard map and help dialog, the mirror kit, the Play → Debrief → Compose → In production → Build this shell, and `verify:games` (A§6.3, A§6.8, A§6.9).
- **Files:** `packages/play/{types,registry,replay}.ts`; `src/games/kit/{GameShell,LiveRegion,KeysDialog,MirrorTable,ViewSwitch}.tsx` and `useGameInput.ts`; `src/games/registry.ts`; `scripts/verify-games.ts`; `tests/play/*.test.ts`.
- **Accept:**
  1. A toy game registered in the tests passes `verify:games`. Removing its mirror, 2D view, card or keyboard map fails the gate.
  2. Replaying a recorded log regrades to the same score, and an edited stored score is ignored.
  3. Keys are bound on the container and ignored inside text inputs and on controls that use the key natively, such as `Space` on a focused button (unit test; A§6.8).
  4. Ten messages within 100 ms produce one announcement (fake timers).

#### [ ] W0-T15 · Scene kit v0 · L · sonnet · deps: W0-T05, W0-T14
- **Goal:** `src/scene` per A§6.4-A§6.7: Stage, tiers and the Governor, the context-loss fallback, CameraRig, SpanInstances, BlockGrid, LabelLayer, TimeAxis, Selection, PostFX (lazy, tier 2 and up), reduced motion, and a test hook that exposes `renderer.info` in test builds. No drei (D-021).
- **Files:** `src/scene/*.ts(x)`, `src/scene/postfx/*.ts`, `e2e/scene-kit.spec.ts`, `src/pages/Design.tsx` (the specimen section only).
- **Accept:**
  1. With WebGL forced off, Stage renders its 2D child and announces the switch.
  2. A forced `webglcontextlost` swaps to 2D and keeps the session state.
  3. Under `reducedMotion: 'reduce'`, no animation frame is requested after the first settled frame.
  4. 10k instances draw in at most 10 draw calls.
  5. The `postfx` chunk is absent from the network log at T1 and present at T2 (forced tiers).
  6. `verify:boundaries` passes.

#### [ ] W0-T16 · The Loop: session, 2D view, mirror and poster · M · sonnet · deps: W0-T13, W0-T14
- **Goal:** `packages/play/loop` (session, the front-page levels `first-1-fill` to `first-4-par`, `layout.ts`) and `src/games/loop/{Game,View2D,Mirror,Controls,Debrief}.tsx`; `scripts/posters.ts` renders the practice seed's SVG from `layout.ts` (A§6.11). The session carries GAMES.md §3's synthetic tick card (`TICK_CARD`), manual admission (`admit`), and static and continuous batching over `packages/sim/steploop` (D-043).
- **Accept:**
  1. The front-page levels follow GAMES.md §3.1 (D-043): requests placed into a tray of 4 slots [estimated] by hand, refill, and an overlap switch, with counters for useful tokens, ghost tokens, GPU-busy ticks and the clock against par. On the practice seed neither refill alone nor overlap alone reaches par (test), and the `first-4-par` band's acceptance is measured and printed, at least 20% of candidates [estimated floor].
  2. The mirror lists every visible step's slots, GPU-busy and bubble time (ticks on the front page; µs and the graph hit once W1-T13 adds TR2's levels) and ghost tokens.
  3. The poster SVG equals the 2D view's first frame (both from one pure function; test).
  4. The 2D view stays at or under 2,000 SVG marks in its default window.
  5. `verify:games` passes for `loop`.

#### [ ] W0-T17 · The Loop: the 3D scene · L · sonnet · deps: W0-T15, W0-T16
- **Goal:** `src/games/loop/Scene3D.tsx`, built from scene-kit primitives (A§6.1, `loop` row):
  - CPU and GPU tracks along time, with batch slots across the width;
  - the bay, which the front page plays in: the tray of slots, the waiting requests beside it and, with overlap on, the second tray (GAMES.md §3, D-043);
  - step slabs, and launch combs that collapse into a replay slab;
  - bubbles as open gaps;
  - camera presets along, side and top;
  - lever changes that animate, or cut under reduced motion.
- **Accept:**
  1. `scene-loop` is at most 40 KB gz (`verify:bundle`).
  2. At most 100 draw calls at the practice seed.
  3. `V` swaps 2D and 3D and keeps the levers, and `C` and buttons reach every preset.
  4. The screenshot artifact is non-blank (pixel sampling).
  5. All text is DOM, and no material uses a literal colour.

#### [ ] W0-T18 · The front page · M · sonnet · deps: W0-T09, W0-T16, W0-T17
- **Goal:** A§6.11 in full:
  - The static shell in `index.html` holds the heading, the promise and the inline poster, in a reserved box.
  - Hydration makes the 2D Loop playable.
  - After LCP and on idle, at tier 1 or above, the 3D scene loads and swaps in.
  - Below the fold come the four outcomes (from PRODUCT.md), the map teaser and "Start TR1".
- **Files:** `index.html`, `src/front/{Front.tsx,upgrade.ts,poster.ts}`, and the build step that inlines the poster.
- **Accept:**
  1. With JavaScript disabled, `/` shows the heading, the promise and the poster.
  2. The LCP element is the heading or the poster, never the canvas (PerformanceObserver in e2e).
  3. CLS stays at or under 0.1 across the 2D-to-3D swap.
  4. With `saveData` emulated or tier 0 forced, the 3D chunks are never requested.
  5. `verify:numbers` passes on the page copy.

#### [ ] W0-T19 · Static routes, meta CSP, 404 and base path · S · sonnet · deps: W0-T01, W0-T09
- **Goal:**
  - `scripts/prepare-pages.ts` writes `dist/<route>/index.html` for every route it can enumerate, each with its own title and description, plus `404.html`.
  - A Vite plugin adds A§12's meta CSP.
  - `verify:routes` is wired up.
- **Accept:**
  1. With `VITE_BASE=/enginespace/`, every route-table entry gets an `index.html` with a distinct `<title>`.
  2. The CSP meta is the first element after `<meta charset>` in every document, and contains no `'unsafe-eval'`.
  3. Adding a route that cannot be enumerated fails `verify:routes`.

#### [ ] W0-T20 · Budget gates · M · sonnet · deps: W0-T04, W0-T18
- **Goal:**
  - `scripts/verify-bundle.ts` walks the manifest's closures for A§11.1's budgets: entry, the front page's first-paint closure, CSS, other routes, `three-vendor`, scenes, `postfx`, workers and lesson JSON.
  - `e2e/perf.spec.ts` runs the nightly lab profile (4× CPU, 1.6 Mbit/s, 150 ms RTT) and prints LCP, CLS and INP for lever presses.
- **Accept:**
  1. `verify:bundle` prints each budget's gzip size with pass or fail, and fails above any gate.
  2. The PR records the measured front-page numbers with the build SHA [measured].
  3. The perf spec runs locally and prints its three numbers.

#### [ ] W0-T21 · Playwright e2e, axe, screenshots and network isolation · M · sonnet · deps: W0-T18, W0-T19
- **Goal:** `playwright.config.ts` (Chromium, 360×800 default, `vite preview`); `e2e/{a11y,keyboard-loop,network,screenshots,reduced-motion}.spec.ts`; `ci.yml`'s e2e-smoke job and the nightly sweep.
- **Accept:**
  1. axe finds 0 serious or critical violations on `/`, `/map`, `/m/tr2`, `/m/tr2/l0-sample`, `/play/loop`, `/settings`, `/design` and `/evidence`, at 360 and 1280 px.
  2. A keyboard-only walk wins the front-page level.
  3. No request leaves the origin during the walk.
  4. 2D screenshots of `/` at 360 and 1280 px compare within tolerance. The 3D screenshot is an artifact checked non-blank.
  5. The SwiftShader flags that Playwright 1.63's Chromium needs are recorded in the config with a comment [measured].

#### [ ] W0-T22 · Settings, evidence v0 and the design page · M · sonnet · deps: W0-T05, W0-T11, W0-T15
- **Goal:**
  - `/settings`: 3D on or off, the tier cap, a reduced-motion override, and export, import and reset.
  - `/evidence` v0: event counts by kind and module, with export and import.
  - `/design`: token roles and values, component states, motion, and scene-kit specimens, each beside its 2D twin.
- **Accept:**
  1. Settings persist in `working` and apply live: switching reduced motion on stops a running scene's animation (e2e).
  2. Reset asks for confirmation and offers an export first.
  3. `/design` lists exactly the roles in `tokens.ts` (test).

#### [ ] W0-T23 · Repo docs for agents · S · sonnet · deps: W0-T04
- **Goal:** `README.md` (what the course is, how to run it, the lanes) and `AGENTS.md` (this tracker's agent brief, how to run the gates, the read-only rule for the sibling repos, pins and tags).
- **Accept:**
  1. AGENTS.md carries every rule of the agent brief above.
  2. README's commands run as written on a clean clone.

#### [ ] W0-T24 · W0 exit review · S · opus · deps: all of W0
- **Goal:** Review W0 against ARCHITECTURE and DECISIONS, and close W0's open decisions.
- **Accept:**
  1. `docs/waves/W0-report.md` records:
     - the budgets as measured, with device, date and build SHA [measured];
     - the reference devices (O-9);
     - gate status;
     - open issues.
  2. DECISIONS is updated: D-023's budgets are frozen, D-040's spike result is recorded, and O-7, O-8 and O-9 are answered or carried over.
  3. The wave PR (`wave-0` → `main`) is open for the owner.

---

## W1: the no-GPU modules (TR1, TR2, TR5a, TR6, TR8) and their games

**Exit criteria:**
- The five modules are live, each with its loop: content, games, a graded browser artifact and Today.
- Every W1 game passes `verify:games` and the keyboard walks.
- The GPU parts of TR1, TR6 and TR8 are announced as arriving with W2 (D-039).

### Shared

#### [ ] W1-T01 · Pins and W1 claims · M · sonnet · deps: W0-T24
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

#### [ ] W1-T03 · KC graph v0 · M · sonnet · deps: W0-T24
- **Goal:** `content/kc/graph.yaml` for TR1, TR2, TR5a, TR6 and TR8, with edges and thresholds, following ASSESSMENT.md's KC conventions, plus `verify:kc`.
- **Accept:**
  1. The graph is a DAG.
  2. Every KC has a description and at least one reference to an item, a game level or a check. A `planned:` placeholder is allowed only until W1-T38, which fails on any that remain.

#### [ ] W1-T04 · Generator framework and the item block · M · sonnet · deps: W1-T03
- **Goal:**
  - `packages/play/items`: `Gen {kcs, make(seed, level), grade, solution, band}`.
  - `src/items/ItemBlock.tsx`: a fresh seed when an attempt starts, a confidence tap, a why on reveal, and `item` events with provenance.
  - `verify:items`: determinism, the band rejection rate, and the blind-strategy bound from ASSESSMENT.md (A§8.2).
- **Accept:**
  1. A sample family passes `verify:items`, and a family using `Math.random` fails.
  2. Two graded attempts draw different seeds (e2e).
  3. No key or solution appears in the Markdown export.

#### [ ] W1-T05 · Today · M · sonnet · deps: W0-T02, W1-T04
- **Goal:** `/today`, with due KCs from the vendored FSRS, items regenerated on fresh seeds, a session cap of 10-12 minutes [estimated], and `review` events. Phone-first (D-037).
- **Accept:**
  1. The FSRS reference vectors pass through the wrapper.
  2. A scripted 30-day ledger produces the expected due list (golden).
  3. The page passes axe and a keyboard walk at 360 px.

#### [ ] W1-T06 · Course map and module progress · M · sonnet · deps: W0-T09, W1-T03
- **Goal:** `/map`: TR0-TR8 and the capstone, with lanes, hours, kernelspace prerequisites, artifacts, and evidence state derived at read time through the ref→KC map. An accessible list sits behind the graphic. Module pages show their loop and progress.
- **Accept:**
  1. No status is stored: a test asserts that progress reads only events and content.
  2. There is no sideways scroll at 320 px.
  3. Every node links to its module.

#### [ ] W1-T07 · Notional-machine cards · S · sonnet · deps: W0-T08
- **Goal:** `content/cards/*` for the steploop, lifecycle, kv, spec, bench and trace worlds, each with "Models", "Ignores" and "Calibrated against" (A§5.9). The `card` block renders them.
- **Accept:**
  1. Every card cites claim ids.
  2. `verify:games` fails when a registered game's card is missing.

#### [ ] W1-T08 · Trace model and synthetic traces · M · sonnet · deps: W0-T13
- **Goal:** `packages/sim/trace` per A§5.7: `trace@1` columns, `traceFromRun` with seeded jitter, `attribute` and `traceChecks`.
- **Accept:**
  1. On 200 seeds of synthetic traces, GPU-busy + CPU-gap + both-idle equals every step window exactly in integer ns (A§5.7; ASSESSMENT T7), and `attribute` recovers the run's own per-µs truth.
  2. `traceChecks` passes synthetic traces and fails constructed defects: overlapping kernels, a launch after its kernel, a kernel outside its step mark.
  3. Encoding round-trips exactly.

#### [ ] W1-T09 · Trace viewer · L · sonnet · deps: W0-T14, W1-T08
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

#### [ ] W1-T10 · Forge host and the invoke protocol · L · sonnet · deps: W0-T02
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

#### [ ] W1-T11 · Forge lab packer · S · sonnet · deps: W1-T10
- **Goal:** `scripts/pack-labs.ts` packs each forge lab (crate, kit, agent kit, README) as a zip in `public/labs/`, with a SHA-256 manifest. The agent kit is vendored from kernelspace and renamed.
- **Accept:**
  1. Two runs produce byte-identical zips (fixed modification times).
  2. The manifest's hashes match.
  3. A scripted check shows the agent kit's guard hook blocking an edit to the harness file.

### TR2: the step loop

#### [ ] W1-T12 · Sim: step loop v1 · L · sonnet · deps: W0-T13, W1-T01
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

#### [ ] W1-T13 · The Loop: TR2's levels · L · sonnet · deps: W0-T17, W1-T12
- **Goal:** Levels `async`, `graphs` (stages `comb`, `sizes` and `modes`), `keys` (choose dispatch keys under a memory budget; the In-production card shows MRV2's descriptor, MRV1's `has_lora` and SGLang's padded-size buckets, per D-041), `mrv2` and `mask` (TR6's tie-in), as GAMES.md §3.2 designs them; W1-T14 adds the graded `close`. Each level has a prediction first, a debrief, Compose (a policy spec compiled to a configuration), an In-production card with pinned engine flags as claims, and a Build-this card, in both 2D and 3D.
- **Accept:**
  1. Every level can be won by keyboard.
  2. On 50 seeds, each level's naive configuration fails its bar and the intended one passes.
  3. `scene-loop` stays at or under 40 KB gz.

#### [ ] W1-T14 · TR2's graded task and item families · M · sonnet · deps: W1-T04, W1-T13
- **Goal:** The Loop's `close` level, "toggled until the bubbles close", graded on fresh seeds (seeded workload and host-card draws), plus the families `tr2.bubble-width`, `tr2.graph-hit` and `tr2.padding-waste`, with their bands and blind strategies.
- **Accept:**
  1. `verify:items` passes.
  2. A test shows "everything on" failing some graded seeds, through the memory budget or padding waste.
  3. The pass bars match ASSESSMENT.md.

#### [ ] W1-T15 · TR2 content · L · sonnet · deps: W1-T01, W1-T13, W1-T14
- **Goal:** TR2's `module.md` and lessons (about 10 h [estimated]): the step loop, async scheduling, the MRV2 delta, CUDA-graph modes and dispatch keys. Every fact is a claim, and `builds_on` names kernelspace's T5.L7 and T0.L6.
- **Accept:**
  1. `verify:content`, `verify:claims` and `verify:numbers` pass.
  2. Every lesson has a prediction, a game or item, and an exit check.
  3. Reading minutes fall within 20% of the declared minutes.
  4. Status is `review`.

### TR1: read the engines

#### [ ] W1-T16 · Sim: the lifecycle model · M · sonnet · deps: W1-T01, W1-T08
- **Goal:** `packages/sim/lifecycle`: the request paths of vLLM and SGLang as data (stage, location, mechanism), each stage sourced to the pinned reading targets, plus synthetic lifecycle traces (A§5.8).
- **Accept:**
  1. Every stage cites its file at its commit.
  2. Synthetic traces pass `traceChecks`.
  3. Goldens reproduce.

#### [ ] W1-T17 · The Engine Floor: session, 2D view and mirror · M · sonnet · deps: W0-T14, W1-T16
- **Goal:** `packages/play/engine-floor` and a 2D swimlane view. The capsule moves only when the mechanism and the location are both right, and the map builds as the request moves.
- **Accept:**
  1. The game can be completed by keyboard.
  2. A wrong answer is explained from the stage's source.
  3. `verify:games` passes.

#### [ ] W1-T18 · The Engine Floor: the 3D scene · L · sonnet · deps: W0-T15, W1-T17
- **Goal:** Process platforms, the GPU deck, queue buffers and IPC bridges, with one capsule and camera stops that follow it (A§6.1).
- **Accept:**
  1. At most 40 KB gz and at most 100 draw calls.
  2. Reduced motion cuts between stops.
  3. `V` keeps the session.

#### [ ] W1-T19 · TR1's graded lifecycle map · M · sonnet · deps: W1-T09, W1-T17
- **Goal:** The Engine Floor's graded `map` level (GAMES.md §5): on a fresh scenario (engine × streaming × TP × abort × prefix hit × n = 2), the learner lays the request's path from the tray, and `spanCheck` matches every laid stage, in order, to a span of the scenario's synthetic lifecycle trace, shown in the trace viewer. Pass bars are ASSESSMENT.md §4.3's.
- **Accept:**
  1. Grading is deterministic and the seeds are banded; each engine family appears on at least 15% of graded seeds.
  2. A scene-blind strategy (laying one engine family's most common path) passes no more often than ASSESSMENT.md §4.1's bound.

#### [ ] W1-T20 · TR1 content · L · sonnet · deps: W1-T16, W1-T17, W1-T18, W1-T19
- **Goal:** TR1's module and lessons: reading nano-vllm, Mini-SGLang, and Inside vLLM at 42172ad; the lifecycle; abort inside the engine, recapped from the Data Plane's DP5 in under an hour (catalog §4). The fork lab is announced for W2.
- **Accept:**
  1. The checks of W1-T15 pass.
  2. Every code reference is a pinned permalink.

### TR5a: hybrid KV and adapter pages

#### [ ] W1-T21 · Sim: the hybrid KV model · L · sonnet · deps: W0-T12, W1-T01
- **Goal:** All of A§5.4: groups, the pool, sliding release, state pages, adapters, prefix hashing, events, invariants and op generators.
- **Accept:**
  1. The invariants hold over 200 seeds × 2,000 ops.
  2. Each bestiary member of TR5a §5 (a leaky free, a non-atomic admit, a window off by one, a double-counted adapter, a prefix hit that takes the union of groups instead of the intersection, an event published twice) is caught.
  3. Every group's block is exactly one page, and an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages (D-045).
  4. The events match their goldens.

#### [ ] W1-T22 · Forge lab `hybrid-kv` · L · sonnet · deps: W1-T10, W1-T21
- **Goal:**
  - `labs/forge/hybrid-kv`: the harness `lib.rs` (DO NOT EDIT), the `TODO(you)` file, stages, a reference feature and bestiary modules.
  - Host checks run through invoke against `kvReference` on fresh seeds.
  - It extends lab 02's `adapter_unified_paging` idea.
- **Accept:**
  1. The reference passes, and every bestiary module fails a named check.
  2. `cargo test` agrees with the host on the default seeds.
  3. W1-T11 packs the zip.

#### [ ] W1-T23 · The Pool: session, 2D view and mirror · M · sonnet · deps: W0-T14, W1-T21
- **Goal:** `packages/play/pool`, with admit, evict, preempt and prefetch-adapter actions. The levels are GAMES.md §8's `one-group`, `two-kinds`, `evict`, `same-size`, `state`, `adapters` and `manager`, with `evict`, `adapters` and `manager` graded, and a 2D grid view.
- **Accept:**
  1. The game can be completed by keyboard.
  2. On 50 seeds, each level's naive play fails its bar and the intended play passes.
  3. `verify:games` passes.

#### [ ] W1-T24 · The Pool: the 3D scene · L · sonnet · deps: W0-T15, W1-T23
- **Goal:** The rack of fixed-position pages with group and adapter glyphs (no shelf per group), the free line in eviction order, one thread per group from a request to its pages, and linked, non-contiguous adapter pages, with front, per-group-filter and top presets (A§6.1, GAMES.md §8).
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. Under reduced motion, the threads update per op without layout jumps.

#### [ ] W1-T25 · TR5a content · M · sonnet · deps: W1-T22, W1-T23, W1-T24
- **Goal:** TR5a's module and lessons: hybrid KV groups, and adapter pages in the same pool as S-LoRA's design, which the learner builds and measures against upstream's adapter slots (D-042). They build on lab 02 and T6.L9.
- **Accept:** The checks of W1-T15 pass.

### TR6: speculation and structure

#### [ ] W1-T26 · Sim: speculation · M · sonnet · deps: W0-T12
- **Goal:** A§5.5: `Dist`, `verifyChain`, residual sampling, `chiSquare`, the `CRITICAL` tables (a generator script with committed output) and `expectedTokensPerRound`.
- **Accept:**
  1. With 2 seeds at α = 1e-4, the false-fail rate is at most 5e-4 [estimated bound]: 200 seeds on PRs, 10,000 nightly.
  2. Each bestiary member is detected at least 99% of the time at N = 20,000. Record the measurement [measured].
  3. The generator reproduces the committed tables.

#### [ ] W1-T27 · Forge lab `rejection-sampler` · L · sonnet · deps: W1-T10, W1-T26
- **Goal:**
  - `labs/forge/rejection-sampler`.
  - The host drives the learner's verify step with seeded p, q and drafts, then runs chi-square on two fresh seeds.
  - The bestiary (TR6 §5, which ASSESSMENT §4.5 requires): accept when p > q; accept with p/q but resample from p; resample from q; an off-by-one in the residual; the boundary-inclusive comparison of SGLang PR #35798; a FLy-style lossy rule.
- **Accept:**
  1. The reference passes and every bestiary member fails.
  2. The measured false-fail and detection rates are recorded in the PR.

#### [ ] W1-T28 · The Verifier: session, 2D view and mirror · M · sonnet · deps: W0-T14, W1-T26
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

#### [ ] W1-T29 · The Verifier: the 3D scene · L · sonnet · deps: W0-T15, W1-T28
- **Goal:** One skyline row per draft position into depth, then a bonus row, each column stacking the overlap, the reject cap and the recovery well; drafted tokens dropping onto their rows, the walk stopping at the first rejection, and the output skyline converging at the front (A§6.1, GAMES.md §10).
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. The observed skyline updates in batches, not per draw.
  3. Reduced motion shows each batch's final histogram.

#### [ ] W1-T30 · TR6 content and the mask-overlap timeline · L · sonnet · deps: W1-T13, W1-T27, W1-T28, W1-T29
- **Goal:** TR6's module and lessons:
  - speculation, which this course owns, and the rejection sampler;
  - EAGLE-3 and MTP as reading;
  - the grammar mask's overlap, through The Loop's `mask` level. That level is the browser artifact, the "mask-overlap timeline".
  - Grammar-engine internals are recapped from DP4 in under an hour.
- **Accept:**
  1. The checks of W1-T15 pass.
  2. The mask-overlap graded task passes `verify:items`.

### TR8: benchmark like you mean it

#### [ ] W1-T31 · Sim: the benchmark generator · L · sonnet · deps: W0-T12, W0-T13
- **Goal:** A§5.6: arrivals (Poisson by table, replay, closed loop); the server as the step loop's coarse mode; intended against actual send times; and the statistics (percentiles, bootstrap interval, goodput, Little's law).
- **Accept:**
  1. On the same server, closed loop shows coordinated omission and open loop does not (test).
  2. On a known distribution, the nominal 95% bootstrap interval covers within [93%, 97%] over 2,000 seeds [estimated tolerance].
  3. On stable runs, the Little's-law residual is under 2%.

#### [ ] W1-T32 · The broken-benchmark corpus · M · sonnet · deps: W1-T31
- **Goal:** `brokenBenchCase(seed)` with A§5.6's ten flaws and the control case (GAMES.md §11). The answer is drawn first, seeds are banded, and the blind-strategy bounds are measured and printed (kernelspace's D39 rule). Each flaw's debrief cites its real-world instance as a claim, such as `vllm bench serve`'s `--request-rate inf` default, `--max-concurrency` as a capped closed loop, zero warm-ups and prefix-cache reuse across runs (vllm B1-B3).
- **Accept:**
  1. Each of the eleven cases (ten flaws and the control) appears in 1/11 ± 3% of seeds [estimated tolerance].
  2. The best constant per flaw label passes at most as often as ASSESSMENT.md's bound.
  3. Every case's corrected answer recomputes from its scene.

#### [ ] W1-T33 · Broken Bench · M · sonnet · deps: W0-T14, W1-T32
- **Goal:** A 2D evidence board with the setup, the client log and a plot. The learner picks the flaw and predicts the corrected p99 with an interval, scored by log score. The debrief re-runs the corrected benchmark.
- **Accept:**
  1. The game can be completed by keyboard.
  2. Runs are graded on fresh seeds.
  3. `verify:games` passes.

#### [ ] W1-T34 · TR8 content · M · sonnet · deps: W1-T31, W1-T32, W1-T33
- **Goal:** TR8's module and lessons: open against closed loop, coordinated omission, warm-up, and bootstrap intervals on p99. They extend kernelspace's broken-bench and knee exercises, and announce the BurstGPT replay for W2.
- **Accept:** The checks of W1-T15 pass.

### Closing W1

#### [ ] W1-T35 · Markdown export and `llms.txt` · S · sonnet · deps: W0-T08
- **Goal:** Commit `public/md/**` and `public/llms.txt`, with keys stripped, and add a CI freshness check.
- **Accept:**
  1. A test finds no solution or key field in the export.
  2. A stale export fails the freshness check.

#### [ ] W1-T36 · End-to-end coverage for W1 · M · sonnet · deps: W1-T15, W1-T20, W1-T25, W1-T30, W1-T34
- **Goal:** Coverage for every W1 route and game:
  - axe at 360 and 1280 px;
  - keyboard walks of every game level;
  - reduced-motion checks for every W1 scene;
  - network isolation.
- **Accept:** All of it passes in the CI smoke subset and in the nightly full run.

#### [ ] W1-T37 · Owner: screen-reader pass · S · owner · deps: W1-T36
- **Accept:** NVDA and VoiceOver notes are in `docs/waves/W1-report.md`, and issues are filed.

#### [ ] W1-T38 · W1 exit review · S · opus · deps: all of W1
- **Accept:**
  1. The report records:
     - a spot-check of content facts, with a sample of claims re-fetched;
     - the budgets;
     - the gates;
     - every KC `planned:` placeholder filled.
  2. The wave PR is open.

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

#### [ ] W2-T14 · Shape Shifter: session, 2D view and mirror · M · sonnet · deps: W0-T14, W2-T13
- **Goal:** GAMES.md §4's levels: `views`, `stride-zero` and `three-d` for practice, and `fewest` and `grid` graded. The 2D view is a shape and stride table beside the buffer strip.
- **Accept:**
  1. The game can be completed by keyboard.
  2. The fewest-copies bar matches the model's optimum.
  3. `verify:games` passes.

#### [ ] W2-T15 · Shape Shifter: the 3D scene · L · sonnet · deps: W0-T15, W2-T14
- **Goal:** The tensor as a block of cells above its buffer strip, with a stride-order thread through the cells. The thread re-weaves on a view, cells move on a copy, and program tiles sit over the block (A§6.1).
- **Accept:**
  1. Scene budgets as in W1-T18.
  2. Under reduced motion, a copy shows its final layout immediately.

#### [ ] W2-T16 · TR0 lab: the Qwen3-0.6B forward pass on CPU · L · sonnet · deps: W2-T02, W2-T04
- **Goal:**
  - `labs/gpu/tr0-forward`: the starter for the learner's PyTorch forward over Hugging Face weights.
  - The grader's lab module: an HF fp32 reference on the same CPU, a maximum absolute difference of 1e-3, and argmax ids at the challenge's positions.
  - Pin the Qwen3-0.6B revision in `course.lock.json`.
  - The browser re-checks against the bank once W2-T17 lands.
- **Accept:**
  1. The reference solution passes in the nightly `labs.yml` job (CPU).
  2. A perturbed solution, with a wrong RMSNorm epsilon, fails.

#### [ ] W2-T17 · Owner: the TR0 argmax bank · S · owner · deps: W2-T16
- **Goal:** Produce the bank of argmax ids at positions whose margin passes the threshold, using HF fp32 on CPU. Publish it under `public/references/tr0/` with its SHA-256 and a manifest entry.
- **Accept:** The browser re-check passes on the reference solution's receipt.

#### [ ] W2-T18 · TR0 content · L · sonnet · deps: W2-T14, W2-T15, W2-T16
- **Goal:** TR0's module and lessons: PyTorch for the Rust-first learner, and reading Triton with `TRITON_INTERPRET=1`. Triton's program model is recapped from Kernels' KN4 in under an hour (catalog §4).
- **Accept:** The checks of W1-T15 pass.

### TR3: profile a real engine

#### [ ] W2-T19 · Grader: trace export · L · sonnet · deps: W2-T02, W1-T08
- **Goal:** Convert torch-profiler Chrome JSON and nsys SQLite exports into `trace@1`, keeping correlation ids. Captures use `--cuda-graph-trace=node`, so graph replays show their kernels (vllm P1). The nsys table names are [unverified]: check them against the pinned nsys (2026.5.1, proposed) and record the version. Small fixture traces are committed.
- **Accept:**
  1. The fixtures round-trip.
  2. TypeScript's `traceChecks` passes on the exported fixtures (a cross-language test).

#### [ ] W2-T20 · The Trace Room and Gap Hunt · L · sonnet · deps: W1-T09, W1-T08
- **Goal:**
  - `/trace-room`: lists pinned and synthetic traces, each with its card.
  - Gap Hunt (2D): find the gap, mark the spans, name the cause, with GAMES.md §6's levels (`read`, `gap`, `attribute`, `graphs`, `pinned`, `yours`) and its list mode for phones, which ASSESSMENT §4.3 grades the same.
  - Runs are graded on fresh synthetic seeds, and on the pinned traces against the owner's annotations once W2-T21 lands.
- **Accept:**
  1. The game can be completed by keyboard.
  2. `verify:games` passes.
  3. Synthetic traces carry their label.
  4. At 360 px, a graded `attribute` case can be completed in list mode (e2e).

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
  2. The Loop's goldens are regenerated with `--write` and reviewed in the PR.

#### [ ] W2-T23 · TR3 lab: profile vLLM · M · sonnet · deps: W2-T08, W2-T19
- **Goal:** `labs/gpu/tr3-profile`:
  - It runs the pinned vLLM on the challenge's workload with profiling, and exports the trace. The profiling commands come from the pin's docs: `--profiler-config` for torch, and `/start_profile` with `delay_iterations` and `max_iterations` to capture a chosen window (vllm P1).
  - The receipt records which runner actually ran (MRV2 or a fallback to MRV1), from the engine's log line (vllm M2).
  - The learner writes a structured attribution report in JSON.
  - The grader checks correctness by teacher-forced agreement.
  - The browser recomputes the attribution and the floors.
- **Accept:**
  1. A synthetic fixture passes.
  2. A forged trace that is too fast fails its floor.

#### [ ] W2-T24 · TR3 content · L · sonnet · deps: W2-T20, W2-T23
- **Goal:** TR3's module and lessons: `--profile`, Perfetto, and nsys graph traces.
- **Accept:** The checks of W1-T15 pass.

### TR4: backends as a consumer

#### [ ] W2-T25 · Sim: backend rules, and Dispatch · M · sonnet · deps: W1-T01, W0-T14
- **Goal:** `packages/sim/backends` as an ordered rule table from pinned claims, and Dispatch (2D): predict-then-reveal items on fresh seeds.
- **Accept:**
  1. Every rule cites a claim.
  2. `verify:items` and `verify:games` pass.

#### [ ] W2-T26 · TR4 lab: backend sweeps · M · sonnet · deps: W2-T08, W2-T04
- **Goal:** Sweep the attention backends that the learner's GPU supports at the pin.
  - **Correctness:** each backend matches fp32 SDPA within tolerance on seeded inputs.
  - **Performance:** raw timings over repeats. The browser checks the floors and the intervals.
- **Accept:**
  1. A synthetic fixture passes.
  2. A sweep with a timing below its floor fails.

#### [ ] W2-T27 · TR4 content · M · sonnet · deps: W2-T25, W2-T26
- **Goal:** TR4's module and lessons: FA2, FA3 and FA4, FlashInfer and FlashMLA, read as a consumer. FlashMLA's hardware list carries a 60-day TTL (catalog §3.5).
- **Accept:** The checks of W1-T15 pass.

### TR5b: offload, connector and events

#### [ ] W2-T28 · Sim: tiers, the connector contract and `kv-events@1` · M · sonnet · deps: W1-T21
- **Goal:** `packages/sim/tiers` per A§5.8, with a reference consumer (D-034).
- **Accept:**
  1. The consumer's view equals the truth after every op over 200 seeds.
  2. A publisher that drops a `BlockRemoved` is caught.

#### [ ] W2-T29 · Forge lab `kv-publisher` · L · sonnet · deps: W1-T10, W2-T28
- **Goal:** `labs/forge/kv-publisher`. Host conformance checks the consumer's view after every event, the ordering, and reset semantics.
- **Accept:**
  1. The reference passes.
  2. Each bestiary member (a dropped event, events out of order, a missing `AllBlocksCleared`) fails.

#### [ ] W2-T30 · The Switchyard: session, 2D view and mirror · M · sonnet · deps: W0-T14, W2-T28
- **Goal:** `packages/play/switchyard`. The learner publishes each move, and the consumer's board is checked after every event. The 2D view is lanes.
- **Accept:**
  1. The game can be completed by keyboard.
  2. `verify:games` passes.

#### [ ] W2-T31 · The Switchyard: the 3D scene · L · sonnet · deps: W0-T15, W2-T30
- **Goal:** Three decks, block cars on rails, event signals, and the consumer's board (A§6.1).
- **Accept:** Scene budgets as in W1-T18.

#### [ ] W2-T32 · TR5b lab: a toy connector in vLLM · L · sonnet · deps: W2-T08, W2-T04, W2-T28
- **Goal:**
  - `labs/gpu/tr5b-connector`: a connector class registered through the pinned version's extension point, with a per-pin shim. It starts from upstream's `ExampleConnector`, must subclass `SupportsHMA` so the hybrid KV manager stays on, and must pass upstream's connector unit tests at the pin (vllm K3, K6, K9).
  - **The grader:** on shared-prefix prompts, run A saves and run B loads through the kit's probe store; every block's SHA-256 at load equals its SHA-256 at save, and run B's outputs agree with a no-connector baseline by teacher-forced agreement (ASSESSMENT §5.7, §5.9).
  - **The browser:** it re-checks the probe log's hashes and loaded-token counts, and replays the event log through `tiers`.
- **Accept:**
  1. A synthetic fixture passes.
  2. A fixture with a corrupted event log fails conformance.

#### [ ] W2-T33 · TR5b content · M · sonnet · deps: W2-T29, W2-T30, W2-T31, W2-T32
- **Goal:** TR5b's module and lessons: native offload, the engine side of the connector contract, and the event publisher. P/D sizing and transport are pointed to The Wire.
- **Accept:** The checks of W1-T15 pass.

### The GPU parts of TR1, TR6 and TR8 (D-039)

#### [ ] W2-T34 · TR1 lab: a nano-vllm fork · M · sonnet · deps: W2-T08, W2-T04, W1-T19
- **Goal:** The fork instruments the lifecycle stages and emits a trace.
  - The grader checks correctness by teacher-forced agreement, and that instrumentation changes nothing by tie-aware identity with the plain run (ASSESSMENT §5.7, D-046).
  - The browser checks that the stage order matches the learner's map, and runs `traceChecks`.
- **Accept:**
  1. A synthetic fixture passes.
  2. A fixture with stages out of order fails.

#### [ ] W2-T35 · TR6 lab: a proposer · L · sonnet · deps: W2-T08, W2-T04, W1-T26
- **Goal:** An n-gram or suffix proposer, written through the pinned extension point (`method="custom_class"`). At v0.33.0 that path falls back to MRV1, and the receipt records the runner used (vllm S4).
  - The grader requires greedy outputs with and without speculation, on the same machine, to pass ASSESSMENT §5.7's tie-aware identity (D-046), and collects acceptance statistics from the logs.
  - The browser recomputes the acceptance and checks the speedup claim against the step-time evidence, with both sides on the same runner and async setting (TR6 §5).
- **Accept:**
  1. A synthetic fixture passes.
  2. A fixture whose speculative output diverges from the plain one at a position that is not a near tie fails.

#### [ ] W2-T36 · TR8 lab: BurstGPT open-loop replay · L · sonnet · deps: W2-T08, W2-T04, W1-T31
- **Goal:**
  - The grader's own open-loop client runs the challenge's seeded schedule against the pinned vLLM server and keeps per-request records.
  - The browser recomputes the percentiles, the interval, goodput and arrival adherence.
  - If the learner also runs `vllm bench serve --save-result --save-detailed`, the browser checks that tool's identities as well (vllm B5).
- **Accept:**
  1. A synthetic fixture passes.
  2. A closed-loop log presented as open loop fails.

### TR7: contribute honestly

#### [ ] W2-T37 · TR7 content and the reproduction targets · M · sonnet · deps: W1-T01
- **Goal:**
  - TR7's module and lessons: DCO, RFCs, and each project's AI-disclosure rules. Quote vLLM's "Do not submit 'pure agent' PRs" with an accessed date. Replace the catalog's "median PR cycle 1.04 d", which has no source and does not reproduce, with the measured figures (vllm C5: median 2.12 d overall, 0.85 d for members and 4.2 d for others; n = 1,005 PRs merged 2026-10-19 to 2026-11-01 [measured]).
  - `content/claims/tr7-targets.yaml`: 5 to 8 published numbers with pinned configurations, for the owner to review. Every target must be reproducible on a 4090 or within 6-8 H100 hours. Results from GB200 machines, such as RFC #40846 and the MRV2 blog's numbers, do not qualify (vllm TR7 notes).
- **Accept:**
  1. The checks of W1-T15 pass.
  2. Every target cites its source and its configuration.

#### [ ] W2-T38 · TR7 lab: reproduce a published number · M · sonnet · deps: W2-T08, W2-T37
- **Goal:** `labs/gpu/tr7-reproduce` runs a target's configuration. The receipt carries the reproduction's delta with an interval. Credit goes to the consistency of the reproduction, not to matching the number. An issue-draft template is generated, and the learner files it themselves.
- **Accept:**
  1. A synthetic fixture passes.
  2. A delta whose interval does not follow from the raw records fails.

### Closing W2

#### [ ] W2-T39 · End-to-end coverage for receipts and W2 routes · M · sonnet · deps: W2-T12 and every W2 module task
- **Goal:** Import, end to end, for every fixture, honest and forged. axe and keyboard walks on every W2 route and game.
- **Accept:** CI smoke and nightly pass.

#### [ ] W2-T40 · Owner: screen-reader pass · S · owner · deps: W2-T39
- **Accept:** Notes are in `docs/waves/W2-report.md`, and issues are filed.

#### [ ] W2-T41 · W2 exit review · S · opus · deps: all of W2
- **Accept:**
  1. The report covers the verification threat model (A§8.6) against the bestiary's results, the budgets and the gates.
  2. O-10 is answered or carried over.
  3. The wave PR is open.

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
  2. The owner captures, annotates and publishes each pair's reference traces on the reference 4090 (and the H100 where the pair has an H100 side), SHA-256-pinned and dated as in W2-T21, for the capstone page's Gap Hunt cases (CAPSTONE §5, §7).

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
- **Goal:** The capstone page:
  - verify both receipts;
  - recompute the delta and its interval;
  - attribute the pairs' pinned traces with Gap Hunt;
  - check the roofline form against the S5-style card with atlas numbers.
- **Accept:**
  1. The page passes a keyboard walk and axe.
  2. A roofline answer that breaks the floor is rejected, with the bound shown.

#### [ ] W3-T04 · Capstone content · M · sonnet · deps: W3-T03
- **Goal:** The capstone's module page and guide. Every capstone also prices itself with kernelspace's T7.L2 and T7.L4 (catalog §2).
- **Accept:** The checks of W1-T15 pass.

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
- **Goal:** A ⌘K search over a build-time index, using `fuse.js` 7.5.0, loaded lazily.
- **Accept:**
  1. The index is at most 20 KB gz.
  2. Search works by keyboard and passes axe.

#### [ ] W3-T08 · The visual identity across pages · M · sonnet · deps: W0-T06, W2-T41
- **Goal:** Apply DESIGN.md's components and layouts to every page, using tokens only.
- **Accept:**
  1. `verify:tokens` passes.
  2. Screenshots are re-baselined and reviewed by the owner.
  3. There is no regression in axe or the budgets.

#### [ ] W3-T09 · The visual identity across scenes · M · sonnet · deps: W3-T08
- **Goal:** Scene materials, post-processing use within A§6.5's budget, and camera framing, all per DESIGN.md.
- **Accept:**
  1. Scene budgets hold.
  2. Contrast pairs for in-canvas marks pass.

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
- **Goal:** `/about`: what each world models and ignores, claims and sources, the privacy statement (nothing collected), and the licences per O-3.
- **Accept:**
  1. Every world's card is linked.
  2. LICENSE, LICENSE-CONTENT and NOTICE match O-3's answer.

#### [ ] W3-T16 · Owner: launch · S · owner · deps: W3-T10, W3-T11, W3-T12, W3-T15
- **Accept:**
  1. Pages is enabled for the repo (O-2), and the domain is set (O-1).
  2. The repo visibility is the owner's choice.
  3. The edition-1 tag is pushed by the owner.

#### [ ] W3-T17 · Final review · S · opus · deps: all of W3
- **Accept:**
  1. A whole-course review against PRODUCT.md's four outcomes, the invariants (A§1) and the decisions.
  2. Issues are filed for what remains.
  3. The final PR is open for the owner.
