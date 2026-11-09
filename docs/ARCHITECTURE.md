# enginespace: technical architecture

**Status:** proposed, for the owner's review. **Date:** 2026-11-03. **Audience:** the owner, the critic, and the agents that build waves W0 to W3.

**Scope.** This document covers the site and its repo layout, the routes, the content format, the pure simulation package, the game framework on react-three-fiber, progress and evidence, the grading pipeline, the local grader and its receipts, CI, budgets and exact dependency versions. Three neighbours own the rest:
- `docs/ASSESSMENT.md`, written in parallel, owns grading policy: what earns credit, the provenance weights and the pass bars. This document owns the formats and mechanics that carry them out. The design review of 2026-11-03 reconciled the two (D-043 to D-046); on credit, ASSESSMENT.md wins.
- The visual identity is The Pass, a restaurant line kitchen and its expo pass (D-047). Its direction contract sits in the front page's surface brief (`.impeccable/surfaces/src-front-frontpage-tsx.md`), the design system applies it (W0-T05), and `DESIGN.md` documents the built world at the end of W0 (W0-T25). Nothing here picks a colour, a typeface or a visual style; scenes are described by their objects, cameras and interactions only, and GAMES.md §2.6 names those objects in the kitchen.
- Decisions are logged in [DECISIONS.md](DECISIONS.md) as `D-nnn`, and tasks are listed in [TRACKER.md](TRACKER.md) as `W<wave>-T<nn>`.

**Sources.**
- `PRODUCT.md`, confirmed by the owner on 2026-11-03.
- kernelspace's `SPECIALIZATIONS.md` (untracked, dated 2026-10-24): §2, §3.5, §4 and §7.
- kernelspace at `origin/master` d478f91 (2026-10-30): `package.json` and `package-lock.json`; `PLAN-100X.md`; `docs/100x-evidence/research/games-3d.md`; `docs/specs/s5.md` and `docs/physics/report.json`; the Forge (`labs/kit`, `src/lib/forge`); the ledger (`src/lib/ledger`); the plays and Fleet exercises (`src/components/play`, `src/lib/world`); the CI workflows.
- statespace at 7b6938c (2026-10-27): `docs/ARCHITECTURE.md` (receipts, the Bench, vendoring), `bench/pyproject.toml` and `.github/workflows/`.
- Upstream release metadata fetched by this workflow's research agents on 2026-11-03: PyPI's JSON for vLLM, and the GitHub release feeds for vLLM and SGLang.
- `research/upstream-vllm.md` and `research/upstream-sglang.md`, written by this workflow's research agents on 2026-11-03. Their row ids are cited as (vllm R4), (sglang X6) and so on.

**Tags.**
- [measured]: read or measured from the named source, on 2026-11-03 unless a date is given.
- [derived]: arithmetic on tagged inputs.
- [estimated]: a judgment or a design target. Every budget is a design target and carries [estimated] or [derived].
- [unverified]: not checked against a primary source. Such a value is never load-bearing until a named task checks it.

Version numbers in §14 are [measured] from the lockfiles named there.

Some numbers are not quantities, and these go untagged: identifiers (D-014, W0-T13, `receipt@1`), counts of named things (the four outcomes, the three lanes), list numbering, and thresholds a standard defines, which are cited by criterion instead (WCAG 2.5.8's 24 px). Thresholds and seed counts in test designs are design parameters and carry [estimated].

---

## 0. The architecture on one screen

```
 learner's browser: a static site on GitHub Pages, with no server behind it
 +-------------------------------------------------------------------------+
 | first paint: static HTML + entry chunk + the front page's 2D step loop   |
 | lazy:        pages · game views · 3D scenes · post-FX · workers · content|
 |                                                                          |
 |  packages/sim     pure, seeded models: step loop, KV, speculation,       |
 |                   benchmark, trace, tensor, lifecycle, backends, tiers   |
 |  packages/play    pure game sessions: state, actions, score, debrief     |
 |  packages/verify  pure receipt checks: schema, hashes, recomputation     |
 |  packages/ledger  evidence ledger core; IndexedDB adapter in src/evidence|
 |  workers          forge (the learner's wasm) · receipt (parse + verify)  |
 +-------------------------------------------------------------------------+
        ^ a .wasm file (lane B)               ^ a receipt bundle, .es.json.gz (lanes L and F)
        |                                     |
 learner's laptop                         learner's machine, CPU or GPU (own or rented)
 cargo build --target wasm32              enginespace grader (Python, run with uv)
                                          locked envs: cpu | vllm | sglang | nano-vllm
                                          correctness vs references → receipt + raw artifacts
```

Seven rules carry the design.

1. **Zero servers.** The site is static files only. It has no accounts, no telemetry and no grading server, and nothing leaves the device unless the learner exports it (D-009).
2. **One rule, many views.** Every game is a pure session in `packages/play`. The 3D scene, the 2D view and the DOM mirror render the same state and dispatch the same actions (D-018).
3. **Seeded and deterministic.** Every model takes a seed and works in integer time. The same seed gives the same bytes in Bun, Chromium, Firefox and WebKit, and in the Python grader wherever a model is ported (D-017).
4. **Credit comes from checks a typed number cannot fake.** These are fresh seeds in the browser; host-driven property tests on the learner's wasm; and receipts whose correctness the local grader checks against references, and whose performance evidence the browser recomputes from the raw data (D-001, D-025, D-028).
5. **The browser world is a model.** Every world carries a notional-machine card that says what it models and what it ignores. The real engine is the judge (D-012).
6. **Every number is a claim or carries a tag.** A claim has a source, a date and a TTL, and the content gates fail on an untagged number (D-012).
7. **Play first, and fast.** The front page paints a playable 2D step loop from static HTML and the entry chunk, then upgrades to the 3D scene after the largest contentful paint (D-004, D-023).

## 1. Invariants and the mechanisms that hold them

| # | Invariant | Mechanism | Where | Gate |
|---|---|---|---|---|
| I1 | Zero servers; nothing collected | Static build. The meta CSP sets `connect-src 'self'`. Fonts are self-hosted. There is no analytics code. | `vite.config.ts`, `src/evidence` | An e2e test fails on any request that leaves the origin (§10) |
| I2 | Evidence, not clicks | Only graded event kinds feed progress. Reading, opening and watching write nothing. | `packages/ledger`, `src/evidence` | Ledger property tests |
| I3 | Fresh seeds; keys computed at grade time | Seeds are drawn with `crypto.getRandomValues` at grade time. The pure model computes the reference answer then, so no key is stored. | `packages/sim`, `packages/play`, `src/items` | `verify:items`, `verify:determinism` |
| I4 | One rule, many views | Sessions are pure reducers, and views only dispatch actions. | `packages/play`, `src/games` | `verify:games` |
| I5 | Determinism | Integer µs time, banned non-deterministic APIs, and committed vectors. | `packages/sim` | Lint, golden vectors, nightly cross-browser hash |
| I6 | Receipts are verified from raw data | The browser recomputes every summary it can. It never trusts a summary field, a `pass` flag or an exit code alone. | `packages/verify`, `src/workers/receipt.worker.ts` | A forged-receipt bestiary must fail (§8.5) |
| I7 | Model honesty | A notional-machine card per world, and `synthetic` labels on every synthetic dataset or trace. | `content/cards`, the game registry | `verify:games`, `verify:content` |
| I8 | Numbers are claims | The claims registry and the four tags. | `content/claims` | `verify:claims`, `verify:numbers` |
| I9 | Nothing locks | The router has no guards. Prerequisites advise and never block (kernelspace's rule). | `src/routes.tsx` | e2e |
| I10 | Accessible by default | Every 3D game has a 2D path and a DOM mirror, keyboard control and reduced motion. | `src/scene`, `src/games` | `verify:games`, axe, keyboard walks |
| I11 | Play first, and fast | A static poster plus the 2D game sit in the first-paint closure, and the 3D loads after LCP. | `index.html`, `src/front` | `verify:bundle`, nightly LCP |

---

## 2. Repo layout

### 2.1 One Vite app with internal packages, not workspaces (D-014)

enginespace is **one Vite app with one `package.json` and one lockfile**. Its pure code lives in `packages/*` as TypeScript projects reached through path aliases. These are folders, not npm workspaces. The reasons:

- **One site on one origin.** statespace split into `apps/site` and `apps/instruments` because it runs engines and parses outside bytes on a second origin (statespace ARCHITECTURE §5). enginespace runs the learner's wasm in a worker, which is kernelspace's pattern and needs no second origin. It parses receipts as JSON in a worker and never renders them as HTML. One origin is enough (D-015).
- **kernelspace's patterns carry over unchanged.** PRODUCT.md says so: one Vite app, `npm ci` to install, `bun test` and `bun scripts/*` to check.
- **One `node_modules`.** A worktree agent hard-links one tree (`cp -al`) and keeps its own `node_modules/.tmp`, where `tsc -b` keeps its build info.
- **The boundaries still hold.**
  - Each package has its own `tsconfig`. `packages/sim` and `packages/play` compile with `lib: ["ES2022"]` and no DOM, so any DOM reference is a type error.
  - ESLint's `no-restricted-imports` fences each package.
  - `verify:boundaries` checks the import graph.
- **The way out is cheap.** If a second app appears, such as an instrument origin or a TypeScript CLI, the packages already sit in `packages/` and become npm workspaces without any file moving.

### 2.2 The tree

```
enginespace/
  PRODUCT.md            product record (owner-confirmed 2026-11-03)
  DESIGN.md             visual identity and its tokens (written from the built world by impeccable's documenter, W0-T25)
  README.md  AGENTS.md  LICENSE  LICENSE-CONTENT  NOTICE    (licences: owner decision O-3)
  LICENSES/             the licence texts that NOTICE points at: Apache-2.0.txt (D-060)
  course.lock.json      upstream pins, model revisions and dataset hashes (§4.4)
  package.json  package-lock.json  bunfig.toml  index.html  vite.config.ts
  tsconfig.json  tsconfig.app.json  tsconfig.node.json  tsconfig.pure.json
  eslint.config.js  tailwind.config.ts  postcss.config.js  playwright.config.ts
  docs/                 PLAN, ARCHITECTURE, ASSESSMENT, DECISIONS, TRACKER and the rest
  content/
    course.yaml         module order, hours, lanes
    modules/<id>/       module.md and lessons/*.md, for tr0 … tr8, tr5a, tr5b and capstone
    claims/*.yaml       dated, sourced facts with TTLs (§4.4)
    kc/graph.yaml       knowledge components (§4.5)
    cards/*.md          notional-machine, In-production and Build-this cards
  packages/
    sim/                pure models (§5)
    play/               pure game sessions, the game registry's metadata and layout functions (§6.3)
    ledger/             ledger core: types, ids, codec, merge, memory store, conformance suite (§7)
    schema/             zod schemas: content, claims, lock, KC, receipt@1, bundle@1, trace@1,
                        challenge; JSON Schema export (§9.6)
    verify/             pure receipt verification rules (§8.5)
  src/
    main.tsx  App.tsx  routes.tsx
    pages/              one lazy module per route (§3)
    front/              the front page: static-shell hydration, The Loop in 2D, the 3D upgrade
    games/<id>/         View2D.tsx  Scene3D.tsx  Mirror.tsx  Controls.tsx  Debrief.tsx
    scene/              the scene kit (§6.4): Stage, tiers, governor, primitives, post-FX, fallback
    trace/              the trace viewer (W1-T09): Canvas2D lanes, marks and a DOM mirror over a trace@1 (§5.7, GAMES.md §2.6)
    design/             tokens.css  tokens.ts (role list)  scene-tokens.ts  components/
    content/            renderer for the compiled content; generated/ (git-ignored, built)
    evidence/           IndexedDB store, BroadcastChannel, export and import, provenance weights
    items/              generator families' UI; Today
    forge/              the wasm lab host (kernelspace ABI v2 plus the invoke protocol, §8.3)
    receipts/           challenge issuing, import, the verification report
    workers/            forge.worker.ts  receipt.worker.ts
  public/               fonts/ (self-hosted)  posters/  references/  traces/  labs/ (kits, wheel, manifest)
  labs/                 forge/ (Rust → wasm)  grader/ (Python)  envs/  gpu/  runners/  references/  agent-kit/  (§9.2)
  schemas/              committed JSON Schema exports and the shared vectors (rng, challenge, canonical JSON, hashing)
  scripts/              content/  verify-*.ts  prepare-pages.ts  pack-labs.ts  export-schemas.ts  vendor-drift.ts  posters.ts
  tests/                bun tests that mirror packages/ and src/ (pure code only)
  e2e/                  Playwright specs: axe, keyboard walks, screenshots, budgets, network isolation
  vendor/kernelspace/   files copied at d478f91, never edited in place; VENDOR.md (§13)
  .github/workflows/    ci.yml  deploy.yml  nightly.yml  labs.yml  upstream-watch.yml
```

### 2.3 Dependency rules

- `packages/sim` imports nothing outside itself except the pure vendored files: kernelspace's `rng.ts` and its S5 card.
- `packages/play` imports `packages/sim` and the types in `packages/schema`.
- `packages/verify` imports `packages/sim` (for trace and benchmark recomputation) and `packages/schema`.
- `packages/ledger` imports `packages/schema` only.
- `src/**` may import any package. No package imports `src/**`.
- Only `src/scene/**` and `src/games/*/Scene3D.tsx` may import `three` or `@react-three/fiber`, and only behind a `React.lazy` boundary. `verify:boundaries` fails if any static import path from the entry reaches `three`.
- Nothing reads `content/` at runtime. Content reaches the app only through the compiler's output (§4.6).

---

## 3. Routes

### 3.1 Route table

React Router 7.18.1 in library mode: `createBrowserRouter` with a `lazy` loader per route, so every page is its own chunk.

| Route | Page | Lazy chunks | Phone (360 px) |
|---|---|---|---|
| `/` | Front page: The Loop (2D first, then 3D), the promise, the four outcomes, a map teaser | entry + `front`; `scene-loop` after LCP | yes; 3D at tier 1 or 2D |
| `/map` | Course map: TR0-TR8 and the capstone, with lanes, hours, kernelspace prerequisites, and evidence state per module | `map` | yes |
| `/m/:module` | Module page: its loop (Predict → Play → Build → Prove → Keep), lessons, games, labs and evidence | `module` + the module's JSON | yes |
| `/m/:module/:lesson` | Lesson | `lesson` + the lesson's JSON; game chunks on demand | yes |
| `/play` | Games index | `play-index` | yes |
| `/play/:game` | One game, full screen, at any level | `game-<id>`; `scene-<id>` lazily | yes; 2D or tier 1 |
| `/labs/:lab` | Lab page. A forge lab takes a dropped `.wasm` and shows per-check results. A GPU or local lab offers the kit download, a challenge and the receipt import. | `lab`, `forge.worker` | laptop-first; read-only on phones |
| `/trace-room` and `/trace-room/:trace` | The Trace Room: pinned and synthetic traces, and Gap Hunt | `trace-room` | laptop-first for the timeline viewer; Gap Hunt's graded levels also work on phones, marking by list, and count the same (ASSESSMENT §4.3) |
| `/receipts` | Receipts: issue a challenge, import a bundle, and list receipts. A receipt's detail opens at `/receipts#<sha256>`. | `receipts`, `receipt.worker` | yes (list and detail) |
| `/today` | Keep: spaced review of the KCs earned so far | `today` | yes |
| `/evidence` | The learner's evidence (the Mirror): progress derived from the ledger; export, import and undo | `evidence` | yes |
| `/design` | The design-system page: token roles and values, components and states, motion, and scene-kit specimens, each beside its 2D twin | `design` | yes |
| `/settings` | 3D on or off, quality tier cap, reduced motion, data and reset | `settings` | yes |
| `/about` | What each world models and ignores; claims and sources; licences; privacy | `about` | yes |
| `/changes` | Change cards: claims and pins that moved | `changes` | yes |
| `*` | Not found | entry | yes |

**Ids.** Module ids are `tr0`, `tr1`, `tr2`, `tr3`, `tr4`, `tr5a`, `tr5b`, `tr6`, `tr7`, `tr8` and `capstone`. Lesson ids look like `tr2.l3`. Game ids are listed in §6.1, and lab ids look like `tr8.replay`. A receipt sits in the URL fragment, which browsers never send to a server, as statespace does.

### 3.2 Static hosting

- **Base path.** The site is served at the root of `https://enginespace.naigap.com` (D-058), so the deploy builds with the default base `/`. Vite reads the base from `VITE_BASE`, as kernelspace does, and `scripts/prepare-pages.ts` reads the same variable, so a preview or a fork that is served under a subpath, such as `/enginespace/` on a project site, builds and prepares under it. `public/CNAME` holds the domain. A deploy from an Actions workflow ignores that file [measured from GitHub's docs, "Managing a custom domain for your GitHub Pages site", 2026-11-08], so the owner sets the custom domain in the repository's Pages settings.
- **Deep links return HTTP 200.** `scripts/prepare-pages.ts` writes `dist/<route>/index.html` for every route it can enumerate: the route table, the content index, the game registry and the lab list. Each document gets its own `<title>`, description and static shell, and the modulepreloads of its own route's chunks from the route table beside the entry (§6.10, D-059), as the front page's document has its own. `404.html` is the SPA fallback (kernelspace's `prepare-pages.mjs` pattern).
- **CSP.** Every document carries the meta CSP (§12).
- **Stale chunks.** A deploy replaces hashed chunks under open tabs. A `vite:preloadError` handler reloads once, and a sessionStorage flag stops a loop (kernelspace's `src/main.tsx` pattern).

### 3.3 Navigation

The primary navigation is Map · Play · Today · Receipts · Evidence, and the footer links About, Changes, Settings and Design. The Trace Room is reached from TR3, the capstone and the map.

---

## 4. Content

### 4.1 Sources and pipeline (D-016)

Lessons and module pages are Markdown files with YAML front matter and typed container directives. `scripts/content/` compiles them at build time:
- In development a Vite plugin runs the compiler.
- In CI, `bun scripts/content/build.ts` runs the same module.
- YAML is parsed with js-yaml 4.1.1, the version in kernelspace's lockfile, so the compiler runs the same under Node and Bun.
- zod schemas in `packages/schema` validate every block.
- Prose becomes a restricted token tree from marked 18.0.6's lexer: paragraph, heading, list, table, code, emphasis, link, claim reference and tag. React renders that tree. Nothing anywhere renders HTML from content, and a lint bans `dangerouslySetInnerHTML`.

**Why not kernelspace's TypeScript data files?** Prose inside TypeScript strings is hard to review, and it has to be exported again for the learner's agent. Markdown is diffable and is itself the export format.

**Why not MDX?** MDX would turn content into code and add a dependency. Eight directive types cover the block set.

### 4.2 Lesson and module files

```markdown
---
id: tr2.l3
module: tr2
title: Async scheduling closes the bubble
minutes: 25                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.async-overlap, tr2.bubble]
builds_on: [ks:T5.L7, ks:T0.L6]   # kernelspace refs; rendered as links out
status: draft                     # draft | review | live
---

The scheduler in vLLM's engine core runs on the CPU … {{claim:vllm.async-scheduling.default}}
A 300 µs host step [unverified] hides behind a 2.1 ms decode step [estimated] …

:::predict
id: tr2.l3.p1
prompt: With async scheduling on, how many µs of the CPU's per-step work stay on the critical path?
answer: { kind: numeric, unit: us, rel_tol: 0.15 }
reveal: after-game
kcs: [tr2.async-overlap]
:::

:::game
id: loop
level: async
mode: practice
:::

:::item
family: tr2.bubble-width
level: 2
count: 3
:::
```

**Front matter.**
- A lesson has `id`, `module`, `title`, `minutes`, `kcs`, `builds_on`, `status`, and optionally `lanes`, `games` and `labs`.
- The compiler adds `rev`: a SHA-256 over the authored fields and the claims the lesson cites. An event graded against an older `rev` shows "re-check" and loses nothing (kernelspace's rule).
- A module file (`module.md`) adds:
  - `hours` (and `hours_by_lane`);
  - `outcomes`;
  - `artifacts`, as `{id, lane: B|L|F, title}`;
  - `worlds`, the notional-machine cards it uses;
  - `prereqs`, as kernelspace refs and other modules;
  - `pins`, the `course.lock.json` keys it depends on.

### 4.3 Block types

The cap is eight types, enforced by `verify:content`.

| Block | Carries | Writes to the ledger |
|---|---|---|
| prose (implicit) | Markdown, `{{claim:id}}`, the four tags as chips, `{{ks:T5.L7}}` links | nothing |
| `predict` | A prompt, an answer shape (numeric with tolerance, choice, or interval), a reveal point and KCs | `predict` (graded at reveal) |
| `item` | A generator family, level and count. Items are drawn on fresh seeds at grade time (§8.2). | `item` |
| `game` | A game id, a level and a mode (`practice` or `graded`). It embeds `src/games/<id>` (§6). | `play` |
| `trace` | A pinned trace id or a seeded synthetic trace, plus span tasks | `trace-mark` |
| `lab` | A Build card: a forge lab (B) or a GPU or local lab (L or F), with its stages, linking to `/labs/:lab` | nothing (the lab page writes) |
| `card` | One of: notional-machine, in-production, build-this, change, isomorphism (with where it breaks), warning | `ack` for change cards only |
| `figure` | A static SVG with alt text and a long description; generated from a model or authored | nothing |

### 4.4 Claims, pins and tags

**Claims** live in `content/claims/<area>.yaml` as `{id, value, unit?, text, tag, source: {url, title, quote, accessed}, verifiedAt, ttlDays, pin?, derived?, synthetic?}`.
- `tag` is one of `measured`, `derived`, `estimated` or `unverified`.
- A `derived` claim carries `{formula, inputs: [claim ids]}`, and CI recomputes it.
- `pin` names the `course.lock.json` entry a fact belongs to, such as `vllm`.
- TTLs follow kernelspace: 90 days for prices and versions. The default for papers is 365 days [estimated].
- An expired claim never fails CI. The page shows "stale since <date>" and the weekly watcher lists it.
- A changed pin raises change cards for every claim tied to it (§10.1).

**`course.lock.json`** is the course lockfile (catalog §7). Each entry is `{key, kind: pypi|git|blog|dataset|model|container|tool, name, version|commit, url, sha256?, checkedAt, ttlDays, notes}`. A vendor tool with no repository to pin a commit of, such as Nsight Systems, has the kind `tool` and is pinned by its version. The site build and the grader kit read the same file, and `verify:pins` checks its entries. Edition 1's proposed entries (O-4, D-035), as W1-T01 wrote them into the file on 2026-11-04:

| Key | Proposed pin | Evidence |
|---|---|---|
| `vllm` | v0.33.0, commit `4ba787ec…324da5`. It was tagged on GitHub on 2026-11-01 and uploaded to PyPI on 2026-11-02. The fallback is v0.32.0, commit `5df63a72…28be` (vllm §3). | [measured] PyPI JSON. Requires Python ≥3.11,<3.15 and pins `torch==2.14.0`, `transformers>=5.16.1,<5.21.0`, `flashinfer-python==0.7.2.post1` and `xgrammar==0.2.8` [measured]. Wheels are CUDA 13.0 only, which needs a host driver of R580 or newer (vllm R4); no x.y.1 patch exists for 0.28-0.33 (vllm R1, R3) |
| `sglang` | v0.5.23, sha `297e54fd…6f90`. It was uploaded to PyPI on 2026-10-30 and released on GitHub on 2026-11-02 (sglang R1). | [measured] release feed. `pyproject.toml` pins `torch==2.14.1`, `transformers==5.19.0`, `flashinfer_python[cu13]==0.7.2` and `xgrammar==0.2.7` [measured]. The NVIDIA image is CUDA 13 only (sglang R5) |
| `inside-vllm` | commit `42172ad18fbc22c89d0063184e4570cc84186e16` (pre-MRV2) | catalog §3.5, checked 2026-10-24; full sha from vllm §3 |
| `nano-vllm`, `mini-sglang` | `bb823b3e…98ef8` and `9a91cfaf…58f2`; neither repo has tags. W1-T01 confirmed on 2026-11-04 that each is still the last commit on `main`. | vllm §3; sglang §4; the commit feeds [measured 2026-11-04] |
| `nsys`, `ncu`, `perfetto` | 2026.5.1 and 2026.3.1 (kind `tool`), and v59.1, commit `1e9c61e9…10cf6d` | sglang §4 [measured 2026-11-03]; on 2026-11-04 NVIDIA's download page offered nsys 2026.6.1 and its documentation header read ncu v2026.4.0, so W1-T02 re-checks both [measured] |
| `qwen3-0.6b` | Hugging Face revision to be pinned by W2-T16 | — |
| `burstgpt-v2` | source asset SHA-256 `a4d068a7…dda1f4`, CC BY 4.0 | kernelspace's `public/traces/README.md` |

**Why vLLM and SGLang each get their own environment.** The two engines pin different torch builds (2.14.0 against 2.14.1) and different xgrammar builds (0.2.8 against 0.2.7) [measured], so they cannot share one environment (§9.2). The kernelspace twins sit at vLLM v0.31.0 and SGLang v0.5.21 (catalog §3.5), and TR1 names that gap wherever it cites them.

**Tags in prose.** `verify:numbers` scans the compiled prose. Any digit run outside code, a claim reference, an id or a date must carry one of the four tags within its sentence, or the build fails.

**Synthetic data.** Every synthetic trace, workload or benchmark the site shows carries `synthetic: true` and renders a "synthetic" label (PRODUCT.md, "Evidence on Hand").

### 4.5 Knowledge components and refs

`content/kc/graph.yaml` lists KCs (`tr2.async-overlap`) with `requires`, `confusable` and `threshold` edges, kernelspace's graph shape. `verify:kc` checks that the graph is a DAG and that every item, game level and lab check names at least one KC. Ledger refs follow a typed grammar:
- `item:gen/<family>/<variant>`
- `play:<game>/<level>`
- `lab:<lab>`
- `trace:<trace>/<task>`
- `challenge:<lab>.<stage>`
- `receipt:<lab>.<stage>`
- `prove:<lab>`
- `predict:<lesson>#<id>`
- `review:<kc>`

KCs come from a ref→KC map at read time and are never stored (kernelspace's rule).

### 4.6 Compiler output

| Output | Where | Size target |
|---|---|---|
| Course index: modules, lessons, titles, routes and hours | `src/content/generated/index.json`, in the entry closure | ≤ 6 KB gz [estimated] |
| Course map: each module's prerequisites, artifacts and KCs, each KC's description and edges, and the ref→KC table (§4.5) | `src/content/generated/map.json`, one lazy chunk read by `/map`, the module pages and the progress code; kept out of the index because the index is in the entry closure | ≤ 12 KB gz [estimated] |
| One JSON per lesson, per module and per card | `src/content/generated/{lessons,modules,cards}/*.json`, one lazy chunk each through `import.meta.glob`, whose tables sit in `src/content/load-lessons.ts`: the index and the claims, which the front page and the games read, are in `load.ts` without them (D-059) | ≤ 40 KB gz each [estimated] |
| Learner's-agent export, with keys and answers stripped | `public/md/<module>/<lesson>.md`, `public/llms.txt` | — |
| Claims for `/about` and the claim chips | `public/claims.json` (lazy) | — |
| Search index (W3) | `public/search.json` (lazy) | ≤ 20 KB gz [estimated] |

`src/content/generated/` is git-ignored: `npm run build` runs the compiler first. The Markdown export *is* committed, and CI fails when it is stale, as kernelspace's "Export freshness" step does (W1-T35). The step compares the tree after the build with the commit, and `tests/content/export.test.ts` compiles `content/` in memory and compares it, byte for byte, with the files the commit holds, so `bun test` and the merge gates fail on a stale export too. The same test holds the committed files to the rule that the export carries no key (I3): no sentence of an item family's solutions or whys, and no line that serializes a field named for a key. The export's links are relative, so it holds on any base (D-058).

### 4.7 Content gates

`verify:content` covers schemas, ids, refs, the block cap, and links to games, labs, claims and KCs. `verify:claims` checks fields, recomputes derived claims and reports TTLs. `verify:numbers` checks tags. `verify:kc` checks the graph. The export-freshness check covers the Markdown export. The section 10.2 table lists every gate.

---

## 5. The simulation package, `packages/sim`

### 5.1 Rules (D-017)

- **Pure.** No DOM, no I/O, no clocks and no `Math.random`. It compiles under `tsconfig.pure.json` with `lib: ["ES2022"]` only.
- **Seeded.**
  - Every draw comes from kernelspace's splitmix32 (`vendor/kernelspace/src/lib/rng.ts`).
  - Sub-streams come from `rngFor(seed, salt) = splitmix32u(seed ^ hash32(salt))`.
  - Ranges are drawn without bias by rejection, never by `Math.floor(x * n)` on a float.
- **Integer time.**
  - Time is integer µs (`type Us = number`), and every value stays below 2^53. Probabilities are integer weights (permille, or totals of 2^16).
  - Floating point is used only where kernelspace's S5 card uses it: +, −, ×, ÷, `max` and `Math.round` in a fixed order, which IEEE 754 makes identical in every engine.
- **The determinism lint.** In `packages/sim/**` and `packages/play/**`:
  - It bans `Math.exp`, `expm1`, `log`, `log1p`, `log2`, `log10`, `pow`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `cbrt`, `hypot` and `random`.
    - `random` is unseeded. The other 22 are the functions that ECMA-262 does not precisely specify: each engine computes them with its own maths library. The note that opens the standard's "Function Properties of the Math Object" lists them with `random`, and `**` is Number::exponentiate, which the standard leaves implementation-approximated like `pow` [measured 2026-11-04 from the `es2026` tag of tc39/ecma262; the `es2025` tag's note lists the same 23].
    - They do differ in practice. Node 22.22.2 (V8) and Bun 1.3.14 (JavaScriptCore) return different bits from each of the 22 and from `**`, by up to 2 ulp, on from 13 (`atanh`) to 73,037 (`hypot`) of 200,000 inputs [measured 2026-11-04 on the dev host, by `tests/lint/math-engines.ts`]. They agree on the twelve that the standard specifies exactly, and those stay allowed: `abs`, `ceil`, `clz32`, `floor`, `fround`, `imul`, `max`, `min`, `round`, `sign`, `sqrt` (the correctly rounded root) and `trunc`. ES2025's `f16round` and ES2026's `sumPrecise` are exact in the standard too, and stay allowed.
  - It bans `**`, `Date`, `performance` and `crypto`.
  - It bans iteration over `Map` or `Set` where the order would reach output, unless the result is sorted.
  - It bans `Array.prototype.sort` without a comparator.
  Lookup tables needing transcendental functions, such as the exponential quantiles and the chi-square critical values, are generated by a build script under `scripts/tables/`, committed as integers, and re-checked by CI (kernelspace's lint, PLAN-100X §7.4).
- **Labelled.** Each model exports its notional-machine card id (§5.9).

### 5.2 Modules

| Module | Models | Used by | Wave |
|---|---|---|---|
| `core` | `Us`, ids, `rngFor`, unbiased `below(n)`, canonical JSON, integer statistics (nearest-rank percentiles, sums) | everything | W0 |
| `physics` | kernelspace's S5 card (vendored, unchanged): `stepCard(spec, tp, load)` gives a step's µs; table rows for H100 FP8, B200 FP8 and B200 NVFP4 | `steploop`, `bench`, the capstone's roofline | W0 |
| `host` | The host card: CPU µs per phase of a step (§5.3) | `steploop` | W0 |
| `workload` | Seeded request streams from tables or vendored slices (BurstGPT v2.0, Mooncake), with attribution | `steploop`, `bench`, `kv` | W0 |
| `steploop` | The engine step loop: CPU and GPU lanes, async scheduling, CUDA-graph modes and dispatch keys, the structured-output mask, speculation's step shape (§5.3) | The Loop, TR2, TR6's mask overlap, TR8, the capstone | W0 (v0), W1 (v1) |
| `lifecycle` | One request's path through vLLM's or SGLang's processes as data: stages, location, mechanism | Engine Floor, TR1 | W1 |
| `kv` | A hybrid KV manager: groups, a shared page pool, sliding windows, prefix hashing, adapter pages, events (§5.4) | The Pool, the `hybrid-kv` lab, TR5b | W1 |
| `spec` | The exact rejection sampler, chi-square, the acceptance-length model (§5.5) | The Verifier, the `rejection-sampler` lab, `steploop` | W1 |
| `bench` | Arrival processes, the client measurement model, statistics, the broken-benchmark corpus (§5.6) | Broken Bench, TR8, receipt verification | W1 |
| `trace` | `trace@1`, synthetic generation, attribution, structural checks, physics floors (§5.7) | Gap Hunt, the Trace Room, TR1 span checks, receipt verification | W1 |
| `tensor` | Shape, stride, view and copy rules; Triton-style grid coverage | Shape Shifter, TR0 | W2 |
| `backends` | Attention-backend selection as an ordered rule table from pinned data | Dispatch, TR4 | W2 |
| `tiers` | KV tiers (GPU, CPU, disk), connector operations, `kv-events@1` and a reference consumer | Switchyard, the `kv-publisher` lab, TR5b | W2 |

### 5.3 The step-loop model

```ts
// packages/sim/steploop/types.ts (sketch)
export interface StepLoopConfig {
  maxNumSeqs: number; maxBatchedTokens: number; chunkedPrefill: boolean
  asyncScheduling: boolean
  graphs: { mode: GraphModeId; captureSizes: readonly number[]; specializeLora?: boolean; specializeActiveLora?: boolean }   // the captured keys come from the runner's dispatcher
  structured?: { overlap: boolean }                            // the mask on or off; which requests have a grammar is the workload's (ReqSpec.structured)
  spec?: { k: number; alphaPermille: number; draftCostPermille: number; method?: SpecMethodId }   // draft length, acceptance, what a draft costs
  lora?: { maxLoras: number }                                  // the cap on adapters; which request has which is the workload's; feeds the runner's adapter field: MRV2 num_active_loras; MRV1's legacy has_lora (D-041)
  runner?: RunnerPresetId                                      // 'v1' | 'mrv2': picks the dispatcher; without it the loop keeps v0's padded-size rule
}
export interface HostCard {   // all integer µs; values are claims or [estimated] until fitted (below)
  scheduleBaseUs: Us; schedulePerSeqUs: Us; prepPerTokenUs: Us; launchPerKernelUs: Us
  kernelsPerLayer: number; graphReplayUs: Us; syncUs: Us; samplePerSeqUs: Us
  detokPerTokenUs: Us; maskPerSeqUs: Us; ipcUs: Us
}
export function runStepLoop(w: Workload, cfg: StepLoopConfig, host: HostCard, gpu: GpuCard,
                            opts: { horizonUs: Us }): StepLoopRun
export interface StepLoopRun {
  lanes: Timeline                 // spans on cpu-main (the mask fill is a `mask` span there) and gpu-stream
  steps: readonly StepStat[]      // batch, padded size, graph hit or miss, gpu µs, bubble µs
  reqs: readonly ReqStat[]        // TTFT, TPOT, end-to-end, in µs
  summary: Summary                // GPU busy ‰, tokens/s ×1000, TPOT p50 and p99
  violations: readonly Violation[] // e.g. a step used a token before it was sampled
}
```

**One step.** Each step runs schedule → prepare → launch on the CPU, then forward on the GPU, then sync (a device-to-host copy of the sampled ids), then sample and detokenize on the CPU.
- **Launch.** Without graphs, launch costs kernels × `launchPerKernelUs`. With graphs it is one replay, but only when the step's dispatch key was captured. The key is per runner (D-041): for MRV2, the padded token count, the request count, the uniform token count, the maximum query length and the active-adapter case; for MRV1's legacy key, the padded token count, uniform decode or not, and `has_lora`. Otherwise the step falls back to eager or piecewise, as the pinned graph mode's data says.
- **Async scheduling off.** The next step's schedule waits for this step's sampling.
- **Async scheduling on.** The next step's schedule, prepare and launch overlap this step's GPU forward. The next step's input ids come from the device, not a host round trip. The model checks the dependency: a configuration that reads a token before it is sampled raises a `Violation`.
- **The structured-output mask** runs on the engine core's thread per masked request and must finish before sampling. With overlap on, it runs during the forward.
- **The GPU step time** is the S5 card's `us` for the step's load (`seqs`, `tokens`, `kvTokens`, `attnPairs`), at the padded batch size when a graph pads it, minus S5's per-sequence host term `seqs × t_seq`. That term runs on the CPU lane instead, where async scheduling can hide it, and on the 70B card it replaces the host card's per-sequence schedule and sample phases, so no host work is counted twice. Hiding it is an extrapolation beyond S5's additive fit, and the card says so (D-044).

**Which engine the model follows.** At the pin:
- MRV2 has been the default runner since v0.29.0, and async scheduling the default since v0.14.0 (vllm M1, M6). The default preset is therefore `mrv2` with async on, and `v1` is the legacy preset.
- Dispatch keys are data per runner. MRV2 dispatches on a 7-field `BatchExecutionDescriptor` that carries `num_active_loras`. `has_lora` belongs to MRV1's `BatchDescriptor` and is taught as the legacy example (vllm G3-G5; D-041).
- Since v0.29.0, graph memory is reserved before the KV cache is sized, so the model's KV capacity subtracts it (vllm G9).
- Engine defaults that depend on GPU memory come from claims for each GPU class, at least the 4090 row and the H100 row (vllm M9; sglang G3).

**Where the numbers come from.** The S5 card's box is Llama-3-70B on its three fitted rows (kernelspace `docs/specs/s5.md` §3.5). The card already carries a fitted host term on its H100 FP8 row, t_seq ≈ 61.1 µs per running request per step, with a refit range of 53.0–69.9 µs [measured: kernelspace `docs/physics/report.json` at d478f91]. That is a fit "under this form", not a hardware fact. The host card splits host work into phases. Its values start as [estimated] presets labelled on the card, and W2-T22 re-fits them to the owner's reference traces once W2-T21 has captured them (O-5). Until then, every screen that shows host µs says "estimated".

### 5.4 The KV manager model

```ts
export interface KvGroupSpec { id: string; kind: 'full' | 'sliding' | 'state'
                               layers: number; padLayers?: number; blockTokens: number
                               window?: number; statePages?: number; stateBytes?: number }
                               // one block of a group fills exactly one page (D-045); adapters are not groups
export interface KvSpec { poolPages: number; pageBytes: number; tokenBytes: number; paddingLayers: number
                          groups: readonly KvGroupSpec[]; prefixCaching: boolean
                          adapterSlots?: number }       // the engines' slots for adapters, in place of pages (D-042)
export type KvOp =                                      // a token is an integer id below 2^32: blocks are hashed from them
  | { op: 'admit'; req: number; prompt: readonly number[]; adapter?: number }
  | { op: 'append'; req: number; tokens: readonly number[] } | { op: 'finish'; req: number }
  | { op: 'load-adapter'; adapter: number; pages: number } | { op: 'unload-adapter'; adapter: number }
  | { op: 'reset' }
export function kvReference(spec: KvSpec): KvModel             // apply(op) → result; state(); events()
export function kvInvariants(spec: KvSpec, s: KvState): readonly string[]   // each begins with the id of the check it fails
export function kvOps(seed: Seed, spec: KvSpec, n: number, profile?: Partial<KvOpsProfile>): readonly KvOp[]
export function kvJudge(spec: KvSpec, ops: readonly KvOp[], candidate: KvModel): KvJudgement | null
```

- **One physical page pool with one page size** serves every group and every adapter (D-045). KV groups reach that size as vLLM's hybrid manager does at the pin: a preset groups layers, pads layers or inflates the attention block so each group's block is exactly one page, and the padding waste is reported (vllm K2). Adapters follow S-LoRA: an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages of the same pool, stored non-contiguously, which is the `pages` of its `load-adapter` op.
- **Putting adapters in that pool is the learner's design, not upstream's.** At the pins, vLLM keeps adapters in `max_loras` slots outside the KV pool, and SGLang in a fixed-slot `LoRAMemoryPool` (vllm K4; sglang X6). The model's In-production card says so, and the learner's allocator is compared against that slot baseline (D-042).
- **Groups.** A full-attention group keeps every block. A sliding group frees blocks that fall behind its window: for a request of L tokens it holds the blocks from ⌊max(0, L - W + 1) ÷ B⌋ on (`vllm.hybrid-kv.sliding-skipped-tokens`), which is 7 + 2 + 2 blocks for the design document's 112-token example [measured: `vllm.hybrid-kv.doc-example-blocks`, 2026-11-04]. A state group keeps its newest `statePages` blocks however long the request runs: the block that is full holds the state at its edge and is cached, and the newest holds the live state. Adapter pages are shared by every request that uses the adapter.
- **All or nothing.** An operation either succeeds or leaves the state untouched, lab 02's rule. Each works out what it needs first and refuses when the pool cannot supply it: an admit needs its new blocks to fit once the cached blocks of its hit have left the queue, and an append counts the blocks that its windows let go.
- **The free queue** holds the free and the cached pages in eviction order. An allocation takes the front, and a cached page that it takes loses its hash. A page nobody holds goes back to the back with a hash and to the front without one, a request's blocks last block first, and a hit takes its pages out of the queue and returns the ones it does not keep (`vllm.kv-pool.*`).
- **Prefix caching.** Block hashes chain over the parent hash, the token ids and the extra keys (the adapter id). The hit is the longest prefix that every group holds, found as a fixed point with full attention first (`vllm.hybrid-kv.n-group-lookup`), rounded down to a multiple of the least common multiple of the groups' block sizes, and never reaching the last token of the prompt. A block that two requests compute separately is cached once.
- **Events.** The model emits `BlockStored`, `BlockRemoved` and `AllBlocksCleared` in the shape of vLLM v0.33.0's KV events, which W1-T01 read at the pin on 2026-11-04 (claims `vllm.kv-events.*`):
  - An event is a tagged map whose `type` is the class name, and a batch is the array `[ts, events, data_parallel_rank]`, of which the model writes the first two, with `ts` the index of the operation. SGLang v0.5.23 encodes its events the same way and says so (`sglang.kv-events.encoding`).
  - `BlockStored` has seven fields without a default: `block_hashes`, `parent_block_hash`, `token_ids`, `block_size`, `lora_id` (deprecated), `medium` and `lora_name`. Its eight optional fields are `extra_keys`, `group_idx`, `kv_cache_spec_kind`, `kv_cache_spec_sliding_window`, `locality`, `ownership`, `session_id` and `lookahead_token_ids`.
  - `BlockRemoved` has `block_hashes`, `medium` and the optional `group_idx`, `locality` and `ownership`. `AllBlocksCleared` has no fields, and the block pool emits it only when a reset finds no block in use.
  - The adapter is already in the shape: both engines carry it as `lora_name` (`vllm.kv-events.adapter-field`, `sglang.kv-events.adapter-field`), and the adapter is part of the block hash through `extra_keys` (`vllm.kv-hash.lora-extra-key`).
- **Invariants.** Pages are conserved; reference counts never go below zero; a block table's length matches its group's rule; every stored or removed block is published exactly once. `kvInvariants` checks eight of them on a snapshot (`conservation`, `refcounts`, `tables`, `window`, `cache`, `queue`, `adapters`, `events`), and `kvJudge` adds the three that need a reference to compare with: `reply`, `hit` and `atomic`. The bestiary of TR5a §5 is a list of managers that each break one rule, and each must fail a named check.

### 5.5 The speculation sampler

```ts
export interface Dist { weights: readonly number[]; total: number }   // integer weights; p and q share one total, 2^16 in the course's worlds
export function verifyChain(p: readonly Dist[], q: readonly Dist[], draft: readonly number[], r: Rng): ChainResult
export function chiSquare(counts: readonly number[], p: Dist): { stat: number; df: number }
export const CRITICAL: Readonly<Record<'1e-3' | '1e-4', readonly number[]>> // ⌈1000 × the critical value⌉ by df, 0 to 255; generated table
export function expectedTokensPerRound(alphaPermille: number, gamma: number): number  // 1 + α + … + α^γ = (1 − α^(γ+1)) / (1 − α)
```

- **The accept step is exact in integers.** Draw `u` uniformly from `[0, q_x)` and accept when `u < p_x`. That accepts with probability min(1, p_x / q_x) with no floating point.
- **On rejection,** resample from the residual `r_x = max(0, p_x − q_x)` by its integer total.
- **A round** walks the drafts in order and stops at the first rejection. `ChainResult` holds each visited step (token, coin, accepted), the drafts accepted, how the round ended (`recovered` or `bonus`, with its draw and the draw's range) and the tokens emitted, which are the accepted drafts and one more.
- **Exactness.** The output distribution equals p, and the chi-square test checks it on fresh seeds (§8.3).
  - `chiSquare` pools the tokens whose expected count is under 5 (upstream's rule, claim vllm.spec.chi-square.min-expected [estimated]) and leaves out the tokens of weight 0. A draw of one of those is an infinite statistic, since p rules it out.
  - `CRITICAL[level][df]` is the least integer c with P(χ² > c ÷ 1000) ≤ the level, for df from 0 to 255 [estimated], so a test that rejects above c ÷ 1000 rejects an exact sampler no more often than its level. `scripts/tables/chi-square-critical.ts` writes it, and `scripts/vectors.ts --check` regenerates it.
  - The test follows no more than one distribution per seed (the first emitted token against p[0]), so the lab's error rate is the two seeds' and nothing more.
- **The bestiary** (`packages/sim/spec/bestiary.ts`) holds the six wrong samplers of TR6 §5, each a rule set for the same loop. Five of them move the output distribution by an amount that 20,000 draws [estimated] show. The boundary-inclusive comparison of SGLang PR #35798 does not: with integer coins it moves each affected token's probability by 1 ÷ 2^16 [derived]. The statistic sees it only through the tokens it lets past a target that rules them out, which is the sparse band's case, and the accept step shows it on every case if it is looked at exhaustively: for each token, exactly min(p_x, q_x) of the q_x coins must accept (`acceptStepViolations`). The measured rates are in `tests/sim/spec-rates.test.ts`.
- **The acceptance-length formula** and its repeated-product powers are kernelspace's `push-luck.ts` model (Leviathan, Kalman and Matias 2023).
- Draft trees are a stretch level, labelled as one. Edition 1 verifies chains.

### 5.6 The benchmark generator

```ts
export type ArrivalSpec =
  | { kind: 'poisson'; ratePerSMilli: number }               // via a committed exponential-quantile table
  | { kind: 'replay'; slice: SliceId; speedPermille: number } // vendored BurstGPT or Mooncake slices
  | { kind: 'closed'; clients: number; thinkUs: Us }
export interface BenchSpec { arrivals: ArrivalSpec; requests: number; warmupUs: Us; durationUs: Us
  outputCap?: number; prefixWarm?: boolean; clientCostUs?: Us; slo: { ttftUs: Us; tpotUs: Us } }
export function runBench(seed: Seed, spec: BenchSpec, server: ServerModel): BenchRun
export function summarize(run: BenchRun, o: { bootstrap: number; seed: Seed }): BenchSummary
export function brokenBenchCase(seed: Seed, opts?: { flaw?: BenchFlaw }): BrokenCase     // packages/sim/bench/broken.ts
export function correctBench(scene: BrokenScene, flaw: BenchFlaw): BrokenCorrection        // the corrected p99, from the scene alone
```

- **The server** is the step-loop model run coarse: async on, its step times from the S5 card. TR8's knee and TR2's bubbles therefore come from one model.
- **Every request keeps its intended send time** next to its actual send time.
  - Closed loop produces coordinated omission by construction: a stalled server delays sends, and latency is measured from the actual send.
  - Open loop sends on schedule.
- **Statistics.**
  - Percentiles use nearest rank on sorted integers.
  - The 95% interval on p99 is a percentile bootstrap with a seeded resampler (B = 1,000 [estimated]).
  - Goodput at SLO counts the requests that meet both their TTFT and TPOT objectives, per second.
  - Little's law gives a residual: mean concurrency against throughput × mean latency.
- **The broken-benchmark corpus** (`packages/sim/bench/broken*.ts`, W1-T32) extends kernelspace's four flaws (closed loop, capped output, warm cache, counted warm-up) with coordinated omission, a client queue hidden by the harness's timer, too few samples for a p99, a mean reported as a tail, a client-side bottleneck, and a "replay" that ignores the trace's timestamps, plus a control case with no flaw: ten flaws and a control (GAMES.md §11). Prefix-cache carry-over between runs (vllm B3) is the warm-cache flaw's real-world instance. Every claim is a p99 of the time to first token, timed from the due time (ASSESSMENT B5), so the corrected numbers compare across flaws. A case is a log of the coarse server and the claim of a harness that did one thing wrong; all of it is synthetic.
  - **The draw.** The seed picks the flaw (`seed mod 11`: any eleven consecutive seeds hold each once, and a uniform graded seed draws each with probability 1/11), and then the answer, the corrected p99, from a log-spaced grid that does not depend on the flaw's mechanism. The scene is built to reach it. That is kernelspace's rule (D39 in its wave-3 spec) with the flaw drawn first, so a label names how to correct the number and at most the regime it falls in. Closed loop, client queue hidden, client bottleneck and capped output can only happen to a server past its capacity (answers from 5 s to 120 s), and so can the replay's burst (2 s to 60 s). A freeze, the cause of coordinated omission, falls on a server at any load (0.35 s to 60 s). The counted warm-up and the control stay under capacity (70 ms to 2 s, and the control to 3 s with a few long prompts). Warm cache, too few samples and mean as tail draw either, so their answers run from 70 ms or 0.12 s to 120 s. Every range is a design parameter [estimated]. The scene's server is S5's "70B on H100" at TP 4, inside its fitted box (prompts up to 8,192 tokens), and its capacity on each traffic is measured by a saturation run, not assumed.
  - **The band.** The benchmark's own randomness is drawn again, never the answer, until the case keeps the band (`brokenBand`): the corrected p99 rests on at least 1,000 rows (ASSESSMENT B7), the flaw moves the number by 1.5 times or more (kernelspace's `BB_MIN_RATIO`; the control's claim is the corrected number), and the log shows the flaw: sends slip behind their due times for a freeze, a client queue and a client bottleneck, and the log is settled once the warm-up is out for the control and the counted warm-up (B8). A seed that no draw puts in band is returned flagged, and a session redraws from another seed (GAMES.md §2.1). Over seeds 0 to 9,999 the draw took 1.11 tries per case on average (23 at the most) and 3 seeds were out of band [measured 2026-11-04 by `ES_PROPERTY_SEEDS=10000 bun test tests/sim/bench-broken.test.ts`].
  - **The corrected number** is `correctBench(scene, flaw)`, a function of what the learner sees and the flaw's name, so the debrief shows arithmetic the learner could have done. It is one of three: the log's rows timed from their due times (control, mean as tail, coordinated omission, client queue hidden), the rows without the first max(100, 2 × `max_num_seqs`) = 128 by due time (counted warm-up, B8), or the benchmark run again with the flaw taken out of its setup (the other six: a Poisson loop at the claimed rate, no cap, a cold cache, a client that keeps up, 1,500 rows [estimated] after the warm-up, the trace's own timestamps). A flaw that does not apply to a scene corrects nothing. `correctedInterval` gives the 95% bootstrap interval on the corrected p99 (B = 1,000 [estimated]).
  - **Blind strategies.** `bestConstantPerLabel` is the share of cases that the best constant per flaw label passes within ±15% of the corrected p99, which ASSESSMENT §4.1 bounds at 15% [estimated]. On the cases of seeds 0 to 9,999 it is 10.2%, and between 6% and 15% for one flaw (15% for the counted warm-up) [measured, same run]. The constants are chosen on the cases they are judged on, so that is an upper bound that falls as the cases grow in number: 14.1% over the first 1,100 [measured 2026-11-04 by `bun test tests/sim/bench-broken.test.ts`]. A PR judges the constants chosen on half of 1,100 cases against the other half, 7.6% [measured, same run], and the nightly run judges the 10,000 cases in-sample.
  - **The claims** a flaw's debrief cites are `FLAW_CLAIMS`: the tools' source and guides at the pins (vLLM v0.33.0, SGLang v0.5.23) in `content/claims/vllm/bench.yaml`, `sglang/bench.yaml` and `broken-bench.yaml`, wrk2's own example of a pause, Schroeder et al.'s open and closed models, and two rules of kernelspace's T7.L2.

### 5.7 The trace model

**`trace@1`** stores spans in columns, with integer nanosecond timestamps relative to an origin.

```ts
export interface EsTrace {
  schema: 'enginespace/trace@1'
  meta: { source: 'synthetic' | 'owner' | 'learner'; engine?: string; version?: string
          gpu?: string; capturedAt?: string; sha256?: string; synthetic: boolean }
  strings: string[]                                 // name and category table
  tracks: { id: number; kind: 'cpu-thread' | 'cuda-api' | 'gpu-stream' | 'marker'; name: number }[]
  spans: { track: Int32Array; startNs: Float64Array; durNs: Float64Array; name: Int32Array
           cat: Int32Array; corr: Int32Array }      // corr: correlation id, −1 when none
  flows: { from: number; to: number; kind: 'launch' | 'sync' | 'copy' }[]
  marks: { tNs: number; name: number }[]            // step boundaries, NVTX ranges
}
export function traceFromRun(run: StepLoopRun, seed: Seed, jitter: JitterSpec): EsTrace  // synthetic
export function attribute(t: EsTrace, w: StepWindow): Attribution  // kernels, CPU gaps, overlap, TPOT split
export function traceChecks(t: EsTrace, floors?: Floors): readonly CheckResult[]
```

- **Synthetic traces** come from step-loop runs with seeded jitter. They carry `synthetic: true`, so their ground truth is exact.
- **Owner-captured traces** are normalized by the grader's exporter (§9.4), pinned by SHA-256 and dated, and published under `public/traces/`.
- **`attribute`** partitions a step window, from one step mark to the next, in integer ns (GAMES.md §6; ASSESSMENT T7):
  - GPU-busy, the union of kernel and copy spans on GPU streams, split into kernel and copy-only;
  - CPU-gap, GPU-idle time while the engine's main thread is busy;
  - both-idle, GPU-idle time while the main thread is idle too.
  The three sum to the window, which is the step's TPOT, exactly. Overlap, the main thread's busy time inside GPU-busy, is reported beside the partition as hidden CPU work.
- **`traceChecks`** checks:
  - time runs monotonically;
  - no two kernels overlap on one stream;
  - every kernel has a launch before it on its correlation id;
  - step marks contain their kernels;
  - each span is at least its physics floor (§8.5).

### 5.8 Smaller models

- **`lifecycle`** holds a request's path through vLLM and through SGLang as data. Each stage has a location (process, thread, device) and a mechanism: queue, IPC, copy, sync or compute. The model generates synthetic lifecycle traces for span checks. The content of the stages is pinned to the reading targets (`inside-vllm` 42172ad, `nano-vllm`, `mini-sglang`) and checked by W1-T16.
- **`tensor`** covers a buffer plus shape and strides:
  - view, reshape, permute, transpose, expand (stride 0) and slice change metadata only;
  - `contiguous()` copies;
  - a Triton-style grid of programs with BLOCK sizes covers a tensor with masks at the edges.
- **`backends`** is the pinned version's attention-backend choice, written as ordered rules over model and GPU features. It is data from claims, so a re-pin edits data rather than code.
- **`tiers`** covers GPU, CPU and disk tiers; the store, load, offload and evict operations; the `kv-events@1` stream; and a reference consumer that rebuilds the cache view from events. TR5b owns this minimal contract until The Wire's WR3 ships, per catalog §4's rule (D-034).

### 5.9 Notional-machine cards

Every world has a card in `content/cards/<world>.md` with three parts:
- **"Models"**, with each rule and its source claim;
- **"Ignores"**, the S5 card's style of list (kernelspace s5.md §3.5);
- **"Calibrated against"**, naming claims, fits or "nothing yet".

Every game, every graded task and the Trace Room show their card. `verify:games` fails a game whose card is missing.

### 5.10 Test strategy

| Layer | What | Runs |
|---|---|---|
| Unit | Each function's contract, with worked examples taken from lesson text | `bun test`, on every PR |
| Golden vectors | `tests/fixtures/sim/<model>.json` maps inputs to outputs and is regenerated only by `bun scripts/vectors.ts --write`. A diff is reviewed like code. The vendored S5 step vectors pass unchanged. | every PR |
| Properties | Seeded random inputs: 200 seeds on PRs and 10,000 nightly [estimated], through one knob, `ES_PROPERTY_SEEDS` (`tests/seeds.ts`), which `nightly.yml`'s `properties` job sets. The invariants are page conservation and refcounts (`kv`); disjoint kernels per stream, no read before sampling, and busy ≤ horizon (`steploop`); exactness under chi-square (`spec`); Little's law within tolerance on stable runs (`bench`); round-trips and checks that pass on synthetic traces (`trace`). | PR and nightly |
| Bestiary | Known-wrong implementations must fail and the reference must pass. Examples: FCFS against the reference schedule; a sampler that accepts with p/q and skips the residual; a leaky KV manager; a publisher that drops `BlockRemoved`; a closed-loop benchmark presented as open loop. This is kernelspace's rule: "every pass bar is proven against FCFS, SJF and the reference". | every PR |
| Bands and blind strategies | Graded seeds are drawn within difficulty bands. A scene-blind strategy, such as the best constant per label, must stay under the bound ASSESSMENT.md sets. | every PR (sampled), nightly (full) |
| Cross-runtime | The SHA-256 of canonical JSON for N fixed seeds per model is the same in Bun, Chromium, Firefox and WebKit | nightly, Playwright |
| Cross-language | `schemas/vectors/*.json` hold rng, sub-seed, challenge-token and canonical-JSON vectors. TypeScript writes them and the Python grader must match them. | `labs.yml` |
| Determinism lint | §5.1's banned APIs and syntax | every PR |

---

## 6. Games

### 6.1 Roster

Each game's rule is the concept it teaches (D-005). Six games are 3D, and every 3D game also has a 2D view and a DOM mirror. "Axes" names what each spatial dimension carries.

| Id | Game | Display name (D-049) | Module | The rule (= the concept) | 3D: objects, axes and camera | Graded artifact |
|---|---|---|---|---|---|---|
| `loop` | **The Loop** (front page) | **Service** · *the step loop* | TR2; TR6's mask level | A step costs the GPU about the same with one request or many, so every slot should stay live (the front page's lesson). The GPU idles whenever the CPU's work for the next step is not ready. You close the bubbles with async scheduling, CUDA graphs, capture sizes and dispatch keys, without letting a step read a token before it is sampled. | A CPU lane and a GPU lane run as parallel tracks along time. Batch slots stack across the track's width. Steps are slabs; kernel launches are combs that collapse into one replay slab when a graph hits; bubbles are open gaps on the GPU track. At the near end, the bay holds the tray of slots and the waiting requests, where the front page's visitor batches by hand (GAMES.md §3). Camera presets: along time, side and top. | TR2's "toggled until bubbles close" on fresh seeds (B) |
| `engine-floor` | **The Engine Floor** | **Back of House** · *a request's lifecycle* | TR1 | A request moves only when you name the mechanism that moves it (queue, IPC, copy, sync or compute) and where it runs. The map you build is then checked span by span against a trace. | Processes are platforms (API server, engine core, workers), with the GPU on a lower deck. Queues are buffers and IPC is a bridge. One request capsule travels. Camera stops follow the request. | Lifecycle map by span checks (B) |
| `pool` | **The Pool** | **The Reach-In** · *hybrid KV pages and adapters* | TR5a | One physical page pool serves every KV group and the adapters. A request runs only when all its groups' blocks and its adapter are resident. Sliding windows free pages, and you admit, preempt and load adapters to keep goodput up without running out. This is S-LoRA's design: at the pins, vLLM and SGLang keep adapters in slots, and the In-production card shows that (D-042). | A rack of physical pages, each at a fixed position for its whole life, with its group or adapter shown as a glyph rather than a shelf (a partitioned rack would draw what unified paging removes); a free line in eviction order along the rack's base; a request's block table is one thread per group to its pages; an adapter's pages are linked by their own thread, not contiguous (GAMES.md §8). Presets: front, per-group filter, top. | The `hybrid-kv` forge lab (B) |
| `verifier` | **The Verifier** | **The Tasting** · *speculative decoding's verifier* | TR6 | Accept a drafted token with probability min(1, p/q), and on rejection resample from the residual (p − q)⁺. The game runs your rule over 20,000 seeded draws [estimated], and only an exact rule's histogram matches p under chi-square. | Depth carries the draft chain: one skyline row per draft position, then a bonus row, each over the vocabulary, with columns that stack the overlap min(p, q), a reject cap where q > p and a recovery well where p > q. Drafted tokens drop onto their row, the walk stops at the first rejection, and the output skyline at the front converges on p (GAMES.md §10). | The `rejection-sampler` forge lab (B) |
| `shape-shifter` | **Shape Shifter** | **Sheet Pan** · *tensor views and copies* | TR0 | A tensor is a buffer plus a shape and strides. Views move no data and `contiguous()` copies. Reach the target layout with the fewest copies, then tile it with a Triton-style grid that covers every element once. | The tensor is a block of cells above a strip, the buffer. A thread runs through the cells in stride order and re-weaves on a view; cells move on a copy. Program instances are tiles over the block. | Items on fresh seeds (B); the TR0 forward lab (L) |
| `switchyard` | **The Switchyard** | **The Dumbwaiter** · *KV offload, connector and events* | TR5b | A KV block moves between GPU, CPU and disk only through the connector. Every move must be published in an order that lets a consumer rebuild the exact cache, and the consumer's view is checked after every event. | Three decks for the tiers, with blocks as cars on rails and events as signals. The consumer's ledger is a board beside the yard. | The `kv-publisher` forge lab (B); the toy connector (F) |
| `broken-bench` | **Broken Bench** (2D) | **The Inspection** · *benchmark methodology* | TR8 | A published number is wrong because of one flaw. You find the flaw from the setup and the logs, then predict the corrected p99 with an interval. | — | The seeded corpus (B) |
| `gap-hunt` | **Gap Hunt** (2D) | **The Tape** · *trace attribution* | TR3; capstone | Every ns of a step window belongs to exactly one category: TPOT = GPU-busy (kernel or copy-only) + CPU-gap + both-idle, with overlap reported beside it (GAMES.md §6). You mark spans until every ns is accounted for, then name the gap's cause from the launch queue. | — | Attribution of pinned and synthetic traces (B) |
| `dispatch` | **Dispatch** (2D) | **Line Check** · *attention backend selection* | TR4 | The engine picks an attention backend by matching model and GPU features against each backend's support. You predict the pick and its fallback before the reveal. | — | Items on fresh seeds from pinned data (B) |

The Loop and Gap Hunt live in **the Trace Room**, the course's world (catalog §3.5): owner-captured traces beside the step-loop sim.

The learner sees each game's display name over its subtitle (D-049); the Game column keeps the working names, which these docs use as shorthand. GAMES.md §2.6 gives every game's kitchen objects, cameras and materials in The Pass (D-047). No id, rule or object above changes.

### 6.2 The 3D gate, kept and amended (D-019)

kernelspace's seven-test gate (`games-3d.md` §2.3; PLAN-100X §5.4.0) still applies, with one change made by the owner's decision D-005.

- **Required:** tests 1 (intrinsic: winning means applying the concept), 3 (model-backed: every mark is computed by `packages/sim`), 4 (recurrence: used in at least 3 sessions, through levels, fresh seeds or later modules), 6 (load: pausable or turn-based, at most one new representation at a time, a 2D path, a DOM mirror and reduced motion) and 7 (debrief: a graded item or prediction names the concept).
- **Test 5 (schematic) is restated:** no photoreal hardware and no decorative particles behind prose. The look is The Pass (D-047): the design system applies its direction contract, and DESIGN.md documents the built world.
- **Test 2 (≥3 axes reasoned about together) becomes advisory** under D-005. Each 3D game names its axes in §6.1. A game whose third axis is weak keeps its 3D for attention, and its 2D view is a first-class path, never a degraded one.

`verify:games` checks the mechanical part: a display name and a subtitle (D-049), and a registered 2D view, mirror, debrief, card, keyboard map, KCs and sources, for every game.

### 6.3 Anatomy of a game

```
packages/play/<id>/
  session.ts     state, actions, reducer, scoring, the hidden reference ("ghost"), debrief data (pure)
  levels.ts      levels: setup(seed), win condition, the prediction to commit, KCs
  layout.ts      pure layout: sim state → positioned primitives, shared by the 2D view, the 3D scene and the poster
src/games/<id>/
  Game.tsx       Play → Debrief → Compose → In production → Build this (kernelspace's play sequence)
  View2D.tsx     SVG at ≤2,000 marks, Canvas2D above that (games-3d research)
  Scene3D.tsx    lazy; built only from scene-kit primitives
  Mirror.tsx     a DOM table of the full state, plus the live summary line
  Controls.tsx   HTML controls for every action
  Debrief.tsx
```

- **Registry.** `packages/play/registry.ts` records, for each game: id, module, title (the display name) and subtitle (the engine concept, D-049), KCs, `has3d`, the keyboard map, the levels, the card id and the source claims. `src/games/registry.ts` maps ids to lazy components (kernelspace's `PLAY_REGISTRY` pattern).
- **The action log is the record.** A run stores `{seed, level, actions[], rev}`. The score is a cache that can be recomputed: grading replays the actions through the pure reducer at grade time, so an edited score in IndexedDB changes nothing.
- **The ghost stays hidden.** The hidden reference runs in lockstep and is read only by the debrief, kernelspace's rule.
- **Modes.**
  - `practice` uses a fixed practice seed, and the front page uses it.
  - `graded` draws a fresh seed at start and stamps `unseen`.
  - Nothing locks: a learner can always practise.
- **Time.** Games are turn-based, or real-time with pause and step. Nothing is ever timed, and no score uses speed (PLAN-100X §10).

### 6.4 The scene kit, `src/scene/`

Every scene is built from these parts. A primitive takes positioned data from a `layout.ts` and draws it, and does nothing else.

| Part | Role |
|---|---|
| `Stage` | Wraps R3F's `<Canvas>` with: WebGL2 only; DPR capped by tier; `frameloop="demand"` by default and `always` only while animating; pause when hidden (`visibilitychange`) or offscreen (`IntersectionObserver`); context-loss handling; an error boundary that falls back to the 2D view; disposal on unmount. One live 3D canvas per page: other embeds show their 2D view until opened. |
| `tiers.ts`, `Governor` | Device tiers and adaptive quality (§6.6). |
| `CameraRig` | Named presets per scene, moved by buttons and keys. Transitions animate, or cut under reduced motion. Optional orbit uses `three/addons/controls/OrbitControls.js` and always has button equivalents (WCAG 2.5.7). |
| `SpanInstances`, `BlockGrid`, `Skyline`, `Rails`, `Links` | `InstancedMesh`-based primitives for spans and lanes, cell grids (pools, tensors), bar skylines, rails and dependency links. Per-instance transform plus a role index, which the design tokens resolve. |
| `LabelLayer` | All text is DOM, projected from anchor points and re-projected only when the camera moves. No in-canvas text, so no drei `Text` (PLAN-100X §5.4.0), and screen readers and zoom work. |
| `TimeAxis` | A scrolling µs window with ticks, in steps under reduced motion. |
| `Selection` | Pointer picks (`instanceId`) and keyboard selection share one model. The selection is mirrored by the DOM list's roving tabindex. |
| `PostFX` | Tiered post-processing (§6.5), in its own lazy chunk. |
| `scene-tokens.ts` | Reads the design system's CSS custom properties (`getComputedStyle`) into material parameters when the scene mounts and when the theme changes. Role names come from `src/design/tokens.ts`; values come from the design system, which applies D-047's direction contract (W0-T05). |

No drei (D-021). The kit implements its few helpers (adaptive DPR, a frame monitor, a camera rig) in under 2 KB gz each [estimated], following kernelspace's `Cube3D.tsx` ("no texture, no drei"). A later task that needs a drei helper adds an exact pin and a DECISIONS entry.

### 6.5 Post-processing within a budget

- **Source.** Effects come from three's own addons (`three/addons/postprocessing/`: `EffectComposer`, `RenderPass`, `UnrealBloomPass` at half resolution, FXAA through `ShaderPass`, and `OutputPass`). They are locked to `three` 0.185.1 and add no dependency (D-021). `SMAAPass` is not used: it alone is 35,631 B gz [measured 2026-11-04 by W0-T15, three 0.185.1, `gzip -9`], over the `postfx` budget below (D-023).
- **Loading.** The effects load in the `postfx` chunk, at tier 2 and above only.
- **Budget:**
  - at most two full-screen passes beyond the scene render;
  - at most 2.0 ms of GPU time per frame at tier 3 on the reference laptop [estimated], checked by hand at each wave's exit, because CI runners have no GPU;
  - `postfx` ≤ 25 KB gz [estimated].
- **When effects turn off.** Effects never change intensity faster than 3 Hz (WCAG 2.3.1). They switch off under `prefers-contrast: more` and when the tier drops below 2. Whether and where to use bloom at all is the look's call (D-047): The Pass blooms only what glows, the heat lamps' housings (`src/scene/postfx/plan.ts`), and DESIGN.md says that glow belongs to light sources alone. The kit only offers bloom within this budget.

### 6.6 Device tiers and adaptive quality

| | T0 | T1 | T2 | T3 |
|---|---|---|---|---|
| View | 2D only | 3D | 3D | 3D |
| DPR cap | — | 1.0 | 1.5 | 2.0 |
| Antialiasing | — | none | FXAA | FXAA |
| Post passes | — | 0 | ≤1 | ≤2 |
| Instances per scene | — | ≤10k | ≤30k | ≤50k |
| Animation cap | — | 30 fps | 60 fps | 60 fps |

All tier values are [estimated] and start from games-3d.md's proposals: at most 100 draw calls, at most 50k instances, DPR capped at 1.5, GPU memory under 200 MB per scene. Real-time shadow maps stay off at T1 and T2, and T3 allows one shadow-casting light at most [estimated].

**Starting tier.**
- **T0:**
  - WebGL2 is missing;
  - context creation with `failIfMajorPerformanceCaveat` fails (software rendering);
  - the learner chose 2D in Settings;
  - or the context was lost twice in a session.
- **T1:** `(pointer: coarse)`, `deviceMemory ≤ 4`, `hardwareConcurrency ≤ 4`, or a maximum texture size below 8192 [estimated thresholds].
- **T2:** everything else.
- **T3:** never a starting tier; reached only by the governor.
- `saveData` keeps the 3D from auto-loading but allows it on request. No `detect-gpu`: it fetches benchmark data from a CDN by default, which breaks I1 (D-022).

**The governor.**
- It samples frame times only while animating.
- **Down** a tier when the p95 over 2 s exceeds the tier budget × 1.2.
- **Up** a tier when p95 stays under budget × 0.6 for 10 s.
- At most one change per 5 s, never above the learner's cap.
- From T1 it offers 2D when p95 stays above 50 ms for 5 s, and switches only at the next pause [all estimated].

### 6.7 WebGL fallback

`Stage` catches a failed context creation, a shader compile error and `webglcontextlost`. On any of them it renders the game's 2D view in the same box and announces "3D view unavailable; showing the 2D view" through the game's live region. The session state survives the swap, because the session lives outside the view. It tries to restore once; after a second loss it stays 2D for the session. Edition 1 has no WebGPU path (D-020): WebGL2 is the guaranteed path, since Firefox on Linux and Android lacks WebGPU (games-3d research, 2026-10-03).

### 6.8 Input

- **One action stream.** Every input becomes a typed `GameAction` dispatched to the session: a 3D pick, a 2D click, a DOM control or a key.
- **Keys:**
  - matched by `event.code`, bound on the game's container rather than `window`, and ignored while focus is in a text field or on a control that uses the key natively (`Space` and `Enter` on a button, arrows in a radio group or listbox; GAMES.md §2.3);
  - common to every game: `Space` play/pause, `.` and `,` step forward and back, `[` and `]` previous and next level stage, `C` cycle camera preset, `V` toggle 2D/3D, `?` help;
  - each game adds its own keys in its registry entry, listed in the help dialog.
- **Pointer and touch.** A tap is a click. Camera gestures are optional, with button equivalents. No action needs a drag, a hover or speed. A 3D object is never the only way to select something: the DOM list always is one.

### 6.9 Accessibility

- **Semantics.**
  - The canvas is `aria-hidden="true"`, with a visually hidden note that the table below lists everything the view shows.
  - Controls are native buttons, radio groups and sliders (Radix primitives).
  - Selectable objects form a listbox with roving tabindex.
  - No `role="application"`.
- **Focus.** It is visible on every control, never obscured by sticky UI (WCAG 2.4.11), and returns to the trigger when a dialog closes. Changing views keeps focus on the same logical control.
- **Announcements.** One polite live region per game. Messages are queued and coalesced, at most one per turn and at most one per second during auto-play. Outcomes (win, fail, debrief ready) use `role="status"`.
- **Reduced motion.** It follows `prefers-reduced-motion` and is overridable both ways in Settings. Under it:
  - cameras cut;
  - time advances in steps;
  - nothing moves without input;
  - post-processing intensities never animate;
  - CSS transitions are off.
- **Non-colour encodings.** Every categorical distinction in a scene also has a position, shape or pattern index, and a label in the mirror (WCAG 1.4.1). Non-text contrast is 3:1 (WCAG 1.4.11), checked on the token pairs (§11.2).
- **Targets.** At least 24 × 24 CSS px (WCAG 2.5.8), and 44 px for primary game controls on touch [estimated], following kernelspace's chip rows. The page reflows to 320 px with no sideways scroll (WCAG 1.4.10).
- **Time.** Nothing is timed. Auto-play can be paused (WCAG 2.2.2).

### 6.10 Lazy-loading and the first-paint JavaScript budget (D-023)

- **Splitting.**
  - Every route is lazy, and every game's view is lazy.
  - Each 3D scene is its own chunk (`scene-<id>`) over one shared `three-vendor` chunk, set in `manualChunks` for `three` and `@react-three/fiber`.
  - `postfx` loads at tier 2 and above only.
  - Workers, lesson JSON and traces each load on demand.
- **Prefetching.**
  - On the front page, after LCP and on idle (`requestIdleCallback`, or after a 1.5 s timeout [estimated]), the `three-vendor` and `scene-loop` chunks are prefetched. This happens only at tier 1 or above, without `saveData`, and on a connection not reported as `2g`.
  - Elsewhere, route chunks get `modulepreload` when a navigation link is hovered or focused (`src/route-preload.ts`, D-059). The build writes a route table beside the entry, `<entry>.routes.json`: for each pattern of the route table the chunks its page needs besides the entry's, and for each game its component's (`scripts/pages/route-table.ts`). A link reads it the first time one is hovered or focused, and each chunk is preloaded once; a modulepreload fetches a module and runs nothing. Each document that `prepare-pages` writes preloads its own route's chunks from the same table (§3.2).
  - So the entry names no page's chunk. Vite gives each lazy import a list of the chunks it needs (`__vite__mapDeps`), and the entry's lists named every chunk of every page, about 19 B gz a name, on every page (D-023's W1 note). The entry's lazy imports keep no list but their stylesheets, and every other lazy import keeps only the chunks its importer has not already loaded (`build.modulePreload.resolveDependencies`, vite.config.ts).
- **First-paint budget**, gated by `verify:bundle` from Vite's manifest (§11.1):
  - The entry chunk and the chunks it imports statically (`react-vendor`) are ≤ 110 KB gz together, with a target of ≤ 100 KB [estimated].
  - The front page's first-paint closure (entry, the `front` route, The Loop's 2D view, the step-loop core and the content index) is ≤ 150 KB gz [estimated], with a target of ≤ 130 KB. D-053 to D-055 raised the gate during W1, and D-059 put it back and fitted the closure to it.
  - kernelspace's whole-app entry measured 115.7 KB gz [measured at its d31a770, recorded in its `verify-bundle.ts`], which makes these figures reachable.
  - Vite's modulepreload polyfill is off (`build.modulePreload.polyfill: false`, D-023's W1 note). Every browser since Firefox 115 and Safari 17 has `<link rel=modulepreload>`, and the polyfill cost 289 B gz of the front page's closure [measured 2026-11-04].

### 6.11 The front page: play first (D-004)

This section reads D-004 as "3D on a capable device within seconds, playable in 2D from the very first paint". The owner confirms or changes that reading through O-11.

1. **Static HTML (no JavaScript).**
   - It holds the heading, one line of promise and the poster: an inline SVG of The Loop at its practice seed.
   - `scripts/posters.ts` renders the poster at build time from the same `packages/play/loop/layout.ts` that the 2D view uses, so the poster is the 2D mirror's first frame.
   - The box reserves the game's final size, so nothing shifts later (CLS ≤ 0.1).
2. **Entry hydration.** The 2D Loop becomes playable with GAMES.md §3.1's "First loop" (D-043): the visitor places waiting requests into a tray of slots by hand, refills a slot when a request stops (continuous batching), and turns on overlap (async scheduling). The readouts are the model's clock in synthetic ticks, useful tokens, ghost tokens and GPU-busy ticks. CUDA graphs are left to TR2's levels. The DOM mirror sits under it.
3. **After LCP, at tier 1 or above.**
   - The 3D chunks load and the scene replaces the SVG in the same box: a crossfade, or a cut under reduced motion.
   - The session, and so the visitor's toggles, carry over.
   - "2D view" stays one keypress (`V`) away.
4. **The front-page challenge.**
   - At the practice seed the GPU lane shows a visible gap beside every step until overlap is on [derived from the seed and the synthetic tick card, printed on screen].
   - The last beat, `first-4-par`, is a seeded burst of 12 requests [estimated] against par in ticks. Its band makes both levers necessary: refill alone or overlap alone stays above par (GAMES.md §3) [estimated band, set in `levels.ts` and measured by its tests].
   - The debrief names what was done ("refilling kept every slot live; overlap planned the next step during this one, at the price of one thrown-away token per EOS stop") and links TR2 and the map.
   - A front-page run is practice and earns no credit (D-038).
5. **Below the fold.** The four outcomes, the map teaser and "Start TR1", in plain HTML.

---

## 7. Progress and evidence (D-024)

### 7.1 Stores

The IndexedDB database is `enginespace`, version 1.

| Store | Holds | Write rule |
|---|---|---|
| `events` | graded evidence (§7.2) | append-only; ids are unique; a write is never modified |
| `receipts` | parsed receipts with their verification report and hashes, but not the raw artifacts, which stay in the learner's bundle file | insert; re-verification adds a new report |
| `working` | settings, drafts, the current position, remembered tabs | last writer wins; never evidence |
| `meta` | `schemaVersion`, `deviceId`, `createdAt` | — |
| `checkpoints` | the state before an import, for undo | at most 3 kept [estimated] |

The core in `packages/ledger` is pure and holds the types, ids, codec, merge and a memory store. It ships a conformance suite that runs under Bun against the memory store and in Playwright against the IndexedDB store: kernelspace's `store-conformance.ts` design, re-implemented rather than vendored, because kernelspace's engine is coupled to its XP and store facade, as statespace found.

### 7.2 Event envelope and kinds

```ts
interface Envelope { id: string; v: 1; kind: Kind; ref: Ref; at: string /* ISO UTC */; tz: number
                     day: string /* local YYYY-MM-DD, frozen at write */; dev: string; rev?: string }
interface Graded { score: number /* [0,1] */; ok: boolean; provenance: Provenance; seed?: number
                   conf?: 'guess' | 'think' | 'sure' }
```

| Kind | Ref | Extra fields |
|---|---|---|
| `predict` | `predict:<lesson>#<id>` | value, reveal outcome |
| `item` | `item:gen/<family>/<variant>` | answer |
| `play` | `play:<game>/<level>` | actions (compressed), `actionsSha256` |
| `lab-check` | `lab:<lab>` | `wasmSha256`, per-check results, seeds |
| `prove` | `prove:<lab>` | the predicted reply and the module's actual reply |
| `trace-mark` | `trace:<trace>/<task>` | marks, attribution error |
| `challenge` | `challenge:<lab>.<stage>` | token, seed, nonce, `issuedOn` (not graded) |
| `receipt` | `receipt:<lab>.<stage>` | `receiptSha256`, challenge token, per-check verdicts with bounds, grader version, environment summary |
| `review` | `review:<kc>` | the Today grade |
| `ack` | `screen:<id>` or `change:<id>` | none |

### 7.3 Provenance

`Provenance = 'unseen' | 'proved' | 'gpu-verified' | 'practice' | 'assisted' | 'gpu-unverified' | 'self-reported'`.
- The weights are ASSESSMENT.md's call. `src/evidence/provenance.ts` holds the table, applies it at read time and never stores a weight, kernelspace's rule.
- ASSESSMENT.md §3.2 sets the table, with kernelspace's values carried over [estimated], and says when each provenance is stamped:
  - `unseen`, `proved` and `gpu-verified`: 1.0;
  - `practice` and `assisted`: 0.3;
  - `gpu-unverified` and `self-reported`: 0.
- Whether to rename `gpu-verified` and `gpu-unverified`, which also cover the L lane, is Q-9 in DECISIONS.md.
- `gpu-verified` replaces kernelspace's `field` at weight 0 for this course (D-001).

### 7.4 Write path, merge and tabs

- **Write path.** A graded result goes to a write-ahead outbox in `working` first, then to `events` in one transaction. A crash leaves at most a pending outbox entry, which the next start flushes (kernelspace's I9).
- **Other tabs.** A BroadcastChannel (`enginespace`) announces appends, so other tabs re-derive.
- **Schema guard.** A bundle that sees a newer `schemaVersion` goes read-only and asks for a reload.
- **Persistence.** `navigator.storage.persist()` is requested after the first graded event.

### 7.5 Export, import and backup

- **Export.** `enginespace/export@1` is one JSON file, gzip optional: `{schema, exportedAt, schemaVersion, device, events[], receipts[]}`.
- **Import.**
  - **Merge** takes the union by id. Identical payloads are a no-op. A clash on the same id keeps the earlier `at` and flags the other.
  - **Replace** writes a checkpoint first, so the import can be undone.
- **Backup nudge.** It appears after 7 days of new evidence without an export, because WebKit may clear script-written storage after seven days without interaction (statespace cites this as [webkit7d]; [unverified] here).
- **Evidence Pack (W3).** A one-file HTML export of credited artifacts. It is previewed, makes no requests, and describes artifacts rather than the learner (PLAN-100X §5.8).

---

## 8. The grading pipeline

### 8.1 Three lanes

| Lane | Where the work runs | Who checks | What becomes credit |
|---|---|---|---|
| **B** (browser) | the tab, on fresh seeds | the site's pure models | items, graded game runs, trace marks, forge labs (§8.2, §8.3) |
| **L** (local) | the learner's laptop CPU (TR0's forward pass) | the local grader against references, then the browser | receipts (§8.4) |
| **F** (field) | the learner's GPU, own or rented | the local grader against references, then the browser | receipts (§8.4) |

### 8.2 Browser checks on fresh seeds

- **The seed.** A graded attempt draws its seed with `crypto.getRandomValues` when it starts: unseen, though not secret (kernelspace S3). `band(seed)` rejects degenerate draws and draws again, and the reference answer is computed then by the pure model.
- **Items.** A family is a pure `Gen {kcs, make(seed, level), grade(answer), solution}`, as in kernelspace's K1. A page plans with the families' faces (their ids, titles, KCs and variants, `packages/play/items/catalog.ts`) and loads a family's code when it draws one of its items (`src/items/families.ts`, D-059), so Today, a lesson and a module page carry no family they do not draw from.
- **Graded game runs** are replayed from their action log at grade time (§6.3).
- **Trace tasks** grade the learner's span marks against the trace model's ground truth, for synthetic traces, or against the owner's annotations, for pinned traces. Tolerances are in ns, as ASSESSMENT.md sets.
- **No browser timing is ever graded** (catalog §7): `performance.now()` is coarsened, and wasm has no PMU.

### 8.3 Forge labs: host-driven property tests on the learner's wasm (D-025)

The B-lane builds are Rust crates on kernelspace's `kslab` ABI v2 (vendored unchanged): zero imports and no wasm-bindgen, built with `cargo build --release --target wasm32-unknown-unknown`. Edition 1 has three:

| Lab | Module | The learner writes | The host checks |
|---|---|---|---|
| `hybrid-kv` | TR5a | A hybrid KV manager with adapter pages, extending lab 02's optional `adapter_unified_paging` check | Six checks, one for each stage s1-s6 of TR5a §5. Each plays a script whose replies are known and then a seeded stream, and `kvJudge` judges every operation against `kvReference`: its reply, the hit, atomicity, §5.4's eight invariants on the state the module reports after the operation, and its events. The module reports its state through `ks_invoke` queries (`packages/sim/forge/kv-wire.ts`). |
| `rejection-sampler` | TR6 | The verify step: accept or reject, then residual resampling | Four exact checks first (every coin of the accept step, the residual, every draw of the walk over the weights, and rounds in which no coin matters), then chi-square on fresh seeds: 2 independent seeds × 20,000 draws at α = 1e-4 [estimated], so an exact sampler fails falsely with probability about 2 × 10⁻⁴ [derived]. Nightly runs measure the false-fail rate and each bestiary member's detection rate. |
| `kv-publisher` | TR5b | The engine-side event publisher | `kv-events@1` conformance: the reference consumer's view equals the truth after every op; ordering; reset semantics |

**The oracle stays outside the learner's code.** In kernelspace each check is compiled into the learner's wasm (`ks_run`). Here the site drives the module through the existing `ks_invoke` bridge with batches of operations, the **invoke protocol** (`src/forge/invoke.ts`), and checks each reply against `packages/sim` on fresh seeds. The crate's own `ks_run` checks still back `cargo test`, so the terminal and the browser agree, but credit comes from the host.
- Each run uses a fresh instance in `forge.worker`, with a 2 s timeout per check (kernelspace F1).
- A `--features reference` build names itself `<lab>@reference` and earns nothing.
- `prove` events come from kernelspace's Prove-it v2 design: with the agent closed, the learner predicts the module's replies to a seeded call list.

### 8.4 Receipts for the L and F lanes: challenge, grader, bundle, verification (D-027)

```
 browser                         learner's machine                          browser
 /receipts: "Get a challenge" →  enginespace grade tr8.replay.s1      →     /receipts: drop the bundle
   challenge event in the          --challenge es1:tr8.replay.s1:…            receipt.worker: caps, gunzip,
   ledger; token shown            fingerprint · run the lab on the            schema, hashes, binding,
                                   challenge's seeds · check vs references    re-checks, recomputation
                                   · capture traces and logs                  → receipt event: gpu-verified
                                  → receipts/<lab>-<stage>-<utc>.es.json.gz     or gpu-unverified, with reasons
```

**The challenge token.**

`es1:<lab>.<stage>:<seed, 8 hex>:<nonce, 16 base32>:<issued YYYYMMDD>:<fnv32, 8 hex>`

- The FNV-1a checksum catches typos and is not security.
- The browser records the issue as a `challenge` event.
- The grader derives every seeded input from the token with the same `rngFor` (§9.8). That covers prompts, arrival schedules, op streams and draft lengths.
- A token is single-use. It binds to the issuing device's ledger and expires after 14 days [estimated].

### 8.5 Verification rules (`packages/verify`, run in `receipt.worker`)

1. **Caps.** Compressed ≤ 32 MB and decompressed ≤ 256 MB [estimated]. Decompression uses the native `DecompressionStream('gzip')` with a byte counter that aborts (D-029).
2. **Schema.** Strict zod validation of `bundle@1` and `receipt@1`. Unknown top-level fields are rejected, and `ext` is ignored.
3. **Integrity.** The SHA-256 of every artifact's canonical bytes (`crypto.subtle`) must equal the receipt's entry.
4. **Binding.** The token must match an unexpired, unused `challenge` event in this ledger for this lab and stage. The seeds the receipt reports must equal the seeds derived from the token.
5. **Grader identity.** `grader.version` must be one this site build published, and `grader.sourceSha256` must equal that version's published source hash. If not, the receipt is `gpu-unverified`, with the reason shown.
6. **Pins.** The engine and its key libraries must match `course.lock.json`. An off-pin run is shown and labelled, and earns no credit unless the lab declares the version compatible.
7. **Correctness re-checks the browser can run** (ASSESSMENT §5.8 names them per lab):
   - TR0's argmax token ids against the pinned bank;
   - TR5b's event stream replayed against `tiers`, and its probe log's block hashes;
   - TR6's speculative and plain outputs, and TR1's instrumented fork against the plain run, compared under ASSESSMENT §5.7's tie-aware identity (D-046), with acceptance statistics recomputed from raw per-step counts;
   - TR1's span order against the learner's own map;
   - TR4's recorded errors against their tolerances.
   The rest is grader-attested (§8.6).
8. **Recomputation of performance evidence.** The browser recomputes from raw records every summary the receipt claims, using `packages/sim/bench` and `packages/sim/trace`, and requires agreement within the stated rounding:
   - percentiles, the bootstrap interval and goodput at SLO;
   - arrival adherence: an open-loop send later than its schedule by more than the lab's tolerance is coordinated omission, and it fails;
   - Little's law;
   - trace structure (§5.7);
   - the attribution partition: GPU-busy + CPU-gap + both-idle must equal each step window exactly, in integer ns (§5.7; ASSESSMENT T7).
9. **Physics floors.** No decode step may beat (weight bytes + KV bytes read) ÷ the fingerprinted GPU's datasheet memory bandwidth (HBM on an H100, GDDR on a 4090). No reported FLOP rate may exceed the datasheet peak at that precision. The numbers come from the hardware atlas's sourced claims (W2-T09). A "too good" number fails with its bound printed (statespace's I10: a bounded check prints its bound).
10. **Verdict.**
    - The verdict is per check: `pass`, `fail` or `attested`, with the bound printed.
    - The receipt is `gpu-verified` when every required check passes or is attested; ASSESSMENT.md §5.9 names the required checks per stage. It is `assisted` instead when its self-declared provenance says `assisted: code` or `agent: true` (ASSESSMENT §3.2). Otherwise it is `gpu-unverified`.
    - The verdict is computed at read time, the receipt itself never stores it, and verdicts are re-derived when the rules change (statespace §10.3).

Receipt fixtures run in CI: real bundles from the owner's GPU smoke runs (W2-T12) must pass. A forged bestiary built from them must fail, check by check: an edited p99, a re-signed hash, a reused token, a replayed old receipt, a closed-loop log, a trace too fast for its GPU, an unknown grader build, an attribution that does not partition its window, and a pair run on different seeds (ASSESSMENT §13).

### 8.6 What the pipeline proves, and what it does not

- **It proves:**
  - The work ran on seeds this device drew at grade time.
  - The artifacts are the ones hashed.
  - Every performance number the receipt claims follows from its raw records and respects physics.
  - The correctness checks ran in a grader build the site knows.
- **It does not prove** the absence of a determined forger. Someone who patches the grader, keeps its version string and fakes raw records consistently can still forge a receipt. No zero-server design can stop that, and this course issues no credential to third parties. The design makes honest work the easy path and makes casual forgery, such as typing a number, fail a named check. ASSESSMENT.md decides how grader-attested correctness counts. Provenance flags (`assisted`, `agent`, `guard`) are self-reported, statespace's honour-system rule.

---

## 9. The local grader (D-026)

### 9.1 What it is

`enginespace-grader` is a Python package that installs a command called `enginespace`.
- **Why Python.** vLLM and SGLang are Python, and so are their extension points (KV connectors, proposers, profiler hooks).
- **Its core** depends on the standard library plus `jsonschema==4.26.0` (statespace's pin). It runs inside each engine environment as a path dependency.
- **Its own tests** use the standard library's `unittest`, so they need no test framework.
- **It sends nothing anywhere** except pinned downloads (§9.7). Receipts are files the learner moves by hand.

### 9.2 Layout under `labs/`

```
labs/
  README.md                learner-facing: lanes, kits, how grading works
  agent-kit/               AGENTS.md, a fail-closed PreToolUse guard, settings, Socratic output style
                           (vendored from kernelspace labs/agent-kit, renamed and extended)
  forge/                   lane B: Rust → wasm
    Cargo.toml  Cargo.lock  rust-toolchain.toml (1.96.0 + wasm32-unknown-unknown)
    kit/                   kslab, vendored from kernelspace labs/kit at d478f91, unchanged
    hybrid-kv/  rejection-sampler/  kv-publisher/      each: src/lib.rs (harness), the TODO(you) file, tests/
  grader/                  the local grader
    pyproject.toml  uv.lock  README.md
    src/enginespace_grader/
      cli.py  challenge.py  rng.py  canonical.py  hashing.py  receipt.py  bundle.py
      fingerprint.py  pins.py  fetch.py  doctor.py
      checks/              allclose, teacher-forced agreement, chi-square from counts, percentiles
      trace/               torch-profiler Chrome JSON → trace@1; nsys SQLite export → trace@1
      bench/               the open-loop client: seeded schedule, per-request records
      labs/                one module per lab: tr0_forward, tr1_fork, tr3_profile, tr4_sweep,
                           tr5b_connector, tr6_proposer, tr7_reproduce, tr8_replay, capstone
    tests/                 unittest; CPU only in CI; GPU tests skip without CUDA
  envs/                    one locked environment per engine
    cpu/                   TR0 (CPU torch and transformers)
    vllm/                  TR3, TR4, TR5b, TR6, TR7, TR8, capstone
    sglang/                TR1 and TR3 reading runs; TR6's alternative
    nano-vllm/             TR1's fork
                           each: pyproject.toml, uv.lock, requirements.txt (hashed, from `uv export`), Dockerfile
  gpu/                     lab kits: LAB.md, lab.toml (env, stages, checks, inputs, budget, env-var allowlist), starter/
    tr0-forward/  tr1-fork/  tr3-profile/  tr4-sweep/  tr5b-connector/  tr6-proposer/
    tr7-reproduce/  tr8-replay/  capstone/
  runners/                 rented GPUs: runpod.md, lambda.md, modal_app.py
  references/manifest.json large inputs and outputs: url, sha256, bytes, licence, date
```

vLLM 0.33.0 and SGLang 0.5.23 pin different torch and xgrammar builds [measured], so each engine gets its own environment and its own lockfile. One uv project with declared conflicting extras was considered and rejected: separate projects are easier for an agent to change and for a learner to repair.

### 9.3 Install, with uv or pip, and rented GPUs

The site serves the kits as static files from `public/labs/`: a forge zip per lab, a GPU kit zip, and the grader wheel. A manifest gives every file's SHA-256 (W2-T10). The repo is public (D-060), so a learner may clone it, and the kits still ship as static downloads (D-007).

- **uv (recommended).** uv 0.10.2, statespace's pin. Python 3.12 is the proposed default; the grader declares `>=3.11,<3.15`, vLLM's range [measured].
  ```
  unzip enginespace-gpu-kit-<ver>.zip && cd enginespace-gpu-kit
  uv sync --locked --project envs/vllm
  uv run --project envs/vllm enginespace doctor
  uv run --project envs/vllm enginespace grade tr8.replay.s1 --challenge es1:…
  ```
- **pip.** Use Python 3.12 in a venv, run `pip install --require-hashes -r envs/vllm/requirements.txt`, then `pip install --no-deps ./grader`.
- **Rented GPUs.**
  - Each env ships a `Dockerfile` whose base is the engine's official image at the pinned tag where one exists [unverified per tag; W2-T11 checks]. It installs the locked environment and the kit.
  - `runners/runpod.md` and `runners/lambda.md` give the copy-paste session.
  - `runners/modal_app.py` builds the image from the lockfile, runs `enginespace grade` remotely, and writes the bundle back locally.
  - Pricing claims live in `content/claims`, with 90-day TTLs (PLAN-100X §6.3).

### 9.4 Commands

| Command | Does | Writes |
|---|---|---|
| `enginespace doctor` | Prints the fingerprint (§9.5) and checks pins, CUDA visibility, disk space and the model cache. It also checks the host driver against the pin's requirement: R580 or newer for v0.33.0's CUDA 13 wheels (vllm R4). It shows exactly what a receipt would record. | stdout |
| `enginespace fetch <lab>` | Downloads the lab's pinned inputs (model revision, dataset slice, reference bank) and checks their SHA-256 | cache |
| `enginespace grade <lab>.<stage> --challenge <token>` | Decodes the token, derives the seeds, runs the stage, checks correctness against references, and captures the performance evidence | `receipts/*.es.json.gz` |
| `enginespace receipt verify <file>` | Schema, hashes and token format: the browser's first three rules, run locally | stdout |
| `enginespace trace export <in> --format <fmt>` | Normalizes a trace into `trace@1`; `<fmt>` is `torch` (profiler Chrome JSON) or `nsys-sqlite` | a file |
| `enginespace selftest [--gpu]` | Runs the grader's own tests; `--gpu` adds the GPU smoke the owner runs at each re-pin | stdout |

### 9.5 Environment fingerprint

The grader collects the fingerprint from NVML through `nvidia-ml-py` when it can be imported (SGLang already depends on it [measured]), or else from `nvidia-smi --query-gpu` CSV, and from torch.

- **GPU:** name, memory, compute capability, SM count, maximum SM and memory clocks, power limit, PCIe generation and width, MIG mode, ECC mode, and virtualization mode.
- **Driver:** the driver version and CUDA driver version.
- **torch:** its version, `torch.version.cuda` and cuDNN.
- **Engine:** name, version and commit, plus the SHA-256 of the installed distribution's `RECORD`.
- **Effective engine configuration** (engine labs; ASSESSMENT §5.6), read from the engine's own log and configuration dump: the runner that actually ran (MRV2, or MRV1 after a fallback warning, vllm M2), the CUDA-graph mode after any downgrade (vllm G7), async scheduling on or off (vllm M6), the attention backend selected (vllm E2), and `max_num_batched_tokens` and `max_num_seqs`, which differ by GPU for the same command (vllm M9).
- **Key libraries:** flashinfer, xgrammar, triton and transformers.
- **Python and host:** the Python version; OS, kernel, architecture, CPU model, cores and RAM; whether it runs in a container.
- **Self-declared:** a host kind (`local`, `runpod`, `modal`, `lambda` or `other`).
- **Environment variables:** only those on the lab's allowlist (named `VLLM_*` and `SGLANG_*` variables).

**Never collected:** hostname, user name, IP or MAC addresses, GPU UUID or serial number, absolute paths (the grader makes them relative to the kit), tokens or keys (it never reads `HF_TOKEN` into a receipt), or the full environment.

### 9.6 The receipt format, `enginespace/receipt@1`

The zod schema in `packages/schema` is the single source. `scripts/export-schemas.ts` writes `schemas/receipt.schema.json`, which the grader validates against, and `verify:schema` fails when the two drift (D-030). ASSESSMENT.md decides which checks each stage requires. The outline below abbreviates the schema.

```yaml
$id: enginespace/receipt@1
required: [schema, lab, stage, challenge, createdAt, grader, environment, pins, inputs, artifacts, checks, provenance]
properties:
  schema:      { const: enginespace/receipt@1 }
  lab:         { pattern: '^(tr[0-8][ab]?|capstone)\.[a-z0-9-]+$' }        # e.g. tr8.replay
  stage:       { pattern: '^(tr[0-8][ab]?|capstone)\.[a-z0-9-]+\.s[0-9]+$' }
  challenge:   { token, seed, nonce, issuedOn }               # the browser re-derives and compares
  createdAt:   date-time (UTC)
  grader:      { name: enginespace-grader, version, sourceSha256 }   # hash over the package's files, sorted
  environment: { host, gpus[], driver, python, torch, engine, engineConfig?, libs[], envVars }   # §9.5; engineConfig on engine labs
  pins:        { lockSha256, envLockSha256, onPin: boolean, offPin: [names] }
  inputs:      [{ name, kind: model|dataset|prompts|reference, revision?, sha256, bytes }]
  artifacts:   [{ id, kind: outputs|trace|bench-log|sweep|events|counts|report|patch|log,
                  format, sha256, bytes, inBundle: boolean }]
  checks:      [{ id, kind: correctness|property|environment, pass, value?, bound?, tolerance?,
                  n?, detail, refSha256? }]                    # grader's results; the browser re-checks what it can
  performance: { kind: bench|trace|sweep|pair, claimed: object } # what the run reported; always recomputed
  provenance:  { assisted: none|explain|code, agent: boolean, guard: on|off }   # self-reported
  notes:       { type: string, maxLength: 2000 }               # plain text, rendered as text
  ext:         object
```

**The bundle, `enginespace/bundle@1`,** is `{schema, receipt, artifacts: {<id>: {encoding: json|text|base64, data}}}`, written as one gzipped JSON file, `.es.json.gz`. Traces travel as `trace@1` in columns, so they fit the caps. Python's `gzip` writes the file and the browser's native `DecompressionStream` reads it, so no zip library is needed (D-029).

**Correctness across machines.** Greedy outputs drift between GPUs, kernels and batch shapes, so the grader never requires a free-running exact match against a bank recorded on another machine. Instead:
- **Teacher-forced agreement.** The grader feeds the reference continuation and requires each reference token to be in the learner engine's top-k, with its log-probability within a tolerance per GPU class [estimated tolerances, set per lab].
- **Tie-aware same-machine identity** where that is the concept (D-046): TR1's instrumented fork against the plain run, and TR6's speculative against plain outputs, at temperature 0 on one machine. A sequence passes if it matches token for token, or if its first mismatch is a near tie, as ASSESSMENT §5.7 defines; strict token identity would fail honest runs whose batch shapes flip a tie.
- **TR0** compares against Hugging Face transformers in fp32 on the same CPU, to 1e-3 (catalog §3.5).

### 9.7 References and downloads

- **The manifest.** `labs/references/manifest.json` lists every large file with its URL, SHA-256, size, licence and date. Files live in GitHub Release assets or on Hugging Face at pinned revisions, never in git.
- **Reference banks.** The TR0 argmax bank, the teacher-forcing continuations and the owner's traces are produced by the owner (W2-T17, W2-T21) and published under `public/references/` and `public/traces/` with their hashes.
- **Downloads** send a generic User-Agent (`enginespace-grader/<version>`) and no identity. A hash mismatch stops the run.

### 9.8 The cross-language contract

The grader ports exactly what the site and the grader must agree on:
- `splitmix32`, `hash32` and `rngFor`;
- the challenge codec;
- canonical JSON (sorted keys, no whitespace, integers as integers, a fixed float format) and its SHA-256;
- the workload generators a stage uses: the arrival schedule, the prompt draw and the op streams.

TypeScript writes `schemas/vectors/*.json`, Python's tests read them, and `labs.yml` fails on any mismatch.

### 9.9 Privacy

`doctor` prints the exact receipt fields before any `grade` run writes them. Receipts never leave the machine unless the learner moves them, and the site stores the parsed receipt only in the learner's own IndexedDB.

---

## 10. CI on GitHub Actions

### 10.1 Workflows

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | pull request | **fast-gate:** `npm ci`, lint, `tsc -b`, the content compile, every `verify:*` in §10.2, build, `verify:bundle`, export freshness. **tests:** `bun test` (units, golden vectors, 200-seed properties, bestiaries). **e2e-smoke:** Playwright Chromium against `vite preview`, with axe at 360 and 1280 px on 8 routes and, from W1-T36, on the 16 pages and 5 level pages that W1 added (`e2e/routes.ts`), the reduced-motion scan of the same pages and a frame count of every 3D scene, a keyboard walk of the front-page game and of one level of each W1 game (`e2e/walks.spec.ts`), the network-isolation check and screenshots uploaded as artifacts, in four shards (target under 6 min each [estimated]; unsharded, the 78 specs did not finish in 15 min on a private repository's two-core runner [measured 2026-11-04, PR #1]). Playwright cuts the sorted list of tests into four runs of equal length, so a spec's file name is its place in the plan: W1-T36's 193 tests ran as four shards of 66, 61, 75 and 98 s on a 20-core laptop [measured 2026-11-08 at df76ca9], and a runner takes about 4 to 16 times as long per test [derived from PR #1's first run], so a shard is about 11 min of test time [estimated; no CI run has timed these tests] and the 6 min target is not met without more shards. |
| `deploy.yml` | push to `main`, and by hand | the fast gate and tests, then build, `prepare-pages`, `upload-pages-artifact` and `deploy-pages` (kernelspace's deploy) |
| `nightly.yml` | 03:17 UTC [estimated slot], and by hand | 10,000-seed properties; the cross-browser determinism hash (Chromium, Firefox, WebKit); full axe at 320, 360 and 1280 px on every route; keyboard walks of every game, one for every level of the registry (`e2e/walks.spec.ts`, W1-T36); the network check and reduced-motion emulation (no animation frames after settle) on every document; the LCP, INP and CLS lab profile; claim-expiry and link-rot reports. On failure it opens or updates one issue, as kernelspace does. |
| `labs.yml` | changes under `labs/**`, `schemas/**`, `packages/schema/**` or `packages/verify/**` | **forge:** Rust 1.96.0 with wasm32, `cargo test`, wasm builds of the reference and bestiary, `verify:labs` (the reference passes host checks; the bestiary fails). **grader:** `setup-uv`, `uv sync --locked`, `python -m unittest` (CPU), `verify:schema`, `verify:vectors`, receipt fixtures pass and forgeries fail. |
| `upstream-watch.yml` (W3) | weekly | Compares PyPI and GitHub releases with `course.lock.json` and opens an issue with draft change cards. It never merges anything, and its requests send a generic User-Agent. |

**Screenshots.**
- Static pages and 2D views compare with a small tolerance, using self-hosted fonts on a fixed runner image.
- 3D scenes are captured as artifacts and checked for "rendered and not blank" by sampling pixels, never by pixel diff. SwiftShader output is not a reference.
- Headless Chromium on a runner renders WebGL through SwiftShader. [measured 2026-11-04 at bac1d04, with Playwright 1.63.0 driving Chrome for Testing 149.0.7827.55] Playwright adds `--enable-unsafe-swiftshader` itself, and WebGL2 exists with no flag. `--use-angle=swiftshader` is what makes the page read the renderer as capable and draw its 3D pass, because the headless shell otherwise fails a context request that refuses a major performance caveat, and the site then stays in 2D. `playwright.config.ts` holds the flag and the measurement. The Chromium that Playwright 1.63.0 pins, Chrome for Testing 153.0.8010.12, was not on the measuring machine [unverified], so the first run on a runner prints the build and renderer it ran on (e2e/screenshots.spec.ts).
- Screenshot text is drawn with `--font-render-hinting=none`, which cut the difference between two headless modes from about 1.5% of the pixels to about 0.1% [measured 2026-11-04 at bac1d04, the front page's 2D pass at 360 and 1280 px].

### 10.2 Gates

| Gate | Fails when |
|---|---|
| `verify:content` | A schema, id, ref, link or block-cap violation |
| `verify:claims` | A missing source, quote or date; a derived claim that does not recompute; a new claim without a tag |
| `verify:numbers` | An untagged number in prose (§4.4) |
| `verify:kc` | A cycle; an item, level or check without a KC |
| `verify:items` | A non-deterministic generator; an out-of-band seed; a blind strategy above its bound |
| `verify:games` | A game missing its display name or subtitle (D-049), 2D view, mirror, debrief, card, keyboard map, KCs or sources; a session importing the DOM |
| `verify:determinism` | §5.1's lint; a changed golden vector without `--write` |
| `verify:boundaries` | §2.3's import rules; a static path from the entry to `three` |
| `verify:bundle` | §11.1's gated budgets |
| `verify:tokens` | A missing token role; a contrast pair under its threshold, once concrete values exist (§11.2) |
| `verify:schema` | A drift between the zod schemas and `schemas/*.schema.json` |
| `verify:vectors` | A TypeScript vector the Python port does not reproduce |
| `verify:vendor` | A vendored file whose SHA-256 differs from VENDOR.md |
| `verify:labs` | A reference module failing host checks; a bestiary module passing |
| `verify:pins` | A malformed `course.lock.json` entry (expiry is reported, never failed) |
| `verify:routes` | The route table, `prepare-pages` and the e2e route list disagree |

Kernelspace's pattern applies: the scaffold reserves each gate, and it prints `pending: <task>` and exits 0 until its owning task lands. The fast gate targets under 5 minutes [estimated].

### 10.3 Pinned tools and actions

| Tool or action | Pin | From |
|---|---|---|
| Node | 24 | kernelspace CI [measured] |
| Bun | 1.3.14 | kernelspace CI [measured] |
| Rust | 1.96.0, with `wasm32-unknown-unknown` | kernelspace `labs.yml` [measured] |
| uv | 0.10.2 | statespace CI [measured] |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) | kernelspace [measured] |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` (v7.0.0) | kernelspace [measured] |
| `oven-sh/setup-bun` | `0c5077e51419868618aeaa5fe8019c62421857d6` (v2.2.0) | kernelspace [measured] |
| `actions/cache` | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` (v6.1.0) | kernelspace [measured] |
| `actions/upload-pages-artifact` | `fc324d3547104276b827a68afc52ff2a11cc49c9` (v5.0.0) | kernelspace [measured] |
| `actions/deploy-pages` | `368f82528645a54fb793d4d04e342629a3f51346` (v5.0.1) | kernelspace [measured] |
| `astral-sh/setup-uv` | `1c37ad07a6a961277cf70c0d37d6f313000f5884` (v10.3.0) | statespace [measured] |
| `actions/upload-artifact` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7.0.2) | statespace [measured] |

Every job sets `permissions: contents: read` unless it needs more, and uses `persist-credentials: false` on checkout (kernelspace's CI).

Bun comes from `oven-sh/setup-bun`, which downloads the release from GitHub. That step may fail (`continue-on-error`). When it does, the next step installs the same release from npm, `npm install --global bun@<the pin>`, and fails unless `bun --version` prints the pin.
- **Why:** on 2026-11-09, GitHub's release downloads answered HTTP 504 throughout a GitHub incident. Every job that needed Bun stopped at that step, the first deploys of `main` among them [measured 2026-11-09].
- **Same build:** npm's `bun@1.3.14` reports `1.3.14+0d9b296af`, the build that GitHub's release ships [measured 2026-11-09].
- **Enforced by:** `tests/ci/workflows.test.ts`, which holds every Bun step to this pair.

---

## 11. Budgets

### 11.1 Performance

| Budget | Gate | Target | Basis | Checked by |
|---|---|---|---|---|
| Entry chunk and its static imports | ≤ 110 KB gz | ≤ 100 KB | [derived: kernelspace's larger app measured 115.7 KB, in one file that carried React; here React sits in `react-vendor`, so the row counts the entry and what it imports statically (D-023)] | `verify:bundle` (every PR) |
| Front-page first-paint closure | ≤ 150 KB gz | ≤ 130 KB | [estimated: about 60 KB React and ReactDOM, 15 KB router, 50 KB shell, 2D game and sim] | `verify:bundle` |
| CSS (first paint) | ≤ 30 KB gz | ≤ 20 KB | [estimated] | `verify:bundle` |
| Any other route's closure, excluding 3D | ≤ 200 KB gz | — | kernelspace's `/boot` and `/today` gate, 200 KB [measured precedent] | `verify:bundle` |
| `three-vendor` (three plus R3F) | ≤ 245 KB gz | — | [derived: kernelspace measured 238 to 242.4 KB] | `verify:bundle` |
| Each `scene-<id>` | ≤ 40 KB gz | — | kernelspace's scene gate [measured precedent] | `verify:bundle` |
| `postfx` | ≤ 25 KB gz | — | [estimated] | `verify:bundle` |
| `receipt.worker`, `forge.worker` | ≤ 60 KB and ≤ 40 KB gz | — | [estimated] | `verify:bundle` |
| Lesson JSON | ≤ 40 KB gz each | — | [estimated] | `verify:content` |
| LCP on the front page, mobile lab profile (Chromium, 4× CPU, 1.6 Mbit/s, 150 ms RTT) | ≤ 2.5 s | ≤ 1.5 s [estimated] | Core Web Vitals' "good" bound [unverified: not re-fetched on 2026-11-03]; the LCP element is static HTML | nightly |
| INP (game actions, lab profile) | ≤ 200 ms | ≤ 100 ms [estimated] | Core Web Vitals' "good" bound [unverified: not re-fetched on 2026-11-03] | nightly |
| CLS (front page, the 2D-to-3D swap included) | ≤ 0.1 | 0 [estimated] | Core Web Vitals' "good" bound [unverified: not re-fetched on 2026-11-03] | nightly |
| Main-thread task during play | none > 50 ms | — | [estimated]; sim batches over 8 ms run in a worker | nightly trace |
| Frame time p95 on the reference laptop | — | ≤ 16.7 ms at the current tier | [estimated] | by hand, each wave's exit; the governor at runtime |
| Frame time p95 on the reference phone | — | ≤ 33.3 ms at T1 | [estimated] | by hand, each wave's exit |
| First 3D frame after its chunk loads, reference laptop | — | ≤ 1.5 s | games-3d research [estimated] | by hand |
| Draw calls, instances, GPU memory per scene | ≤ 100, ≤ 50k, < 200 MB | — | games-3d research [estimated] | a test hook (`renderer.info`) in e2e |
| Site size on Pages | — | well under 1 GB | Pages' 1 GB site cap (games-3d research, checked 2026-10-03) | `verify:bundle` prints the total |

The reference devices are the owner's laptop and phone, named in W0-T24's exit record. CI runners have no GPU, so frame-time budgets are checked by hand at each wave's exit and by the governor at runtime, never gated in CI.

### 11.2 Accessibility (WCAG 2.2 AA)

| Budget | Gate | Checked by |
|---|---|---|
| axe serious or critical violations | 0 on every route at 360 and 1280 px (PR subset); 0 at 320, 360 and 1280 px on all routes (nightly) | Playwright and `@axe-core/playwright` |
| Sideways scroll at 320 px | none (WCAG 1.4.10) | nightly, kernelspace's `a11y.mjs` check, adapted |
| Keyboard walk | every game's level completable by keyboard alone; focus always visible and never obscured | e2e, per game |
| 3D alternatives | every 3D game has a 2D view and a DOM mirror; the canvas carries no unique information | `verify:games` |
| Reduced motion | no animation frame requested after a scene settles under `reducedMotion: 'reduce'` emulation | e2e |
| Text contrast | ≥ 4.5:1 for body text (WCAG 1.4.3) and ≥ 3:1 for large text and non-text marks (WCAG 1.4.3, 1.4.11), in-canvas marks included, on the design tokens' declared pairs | `verify:tokens` |
| Targets | ≥ 24 px (WCAG 2.5.8); primary game controls ≥ 44 px on touch [estimated] | e2e layout assertions |
| Flashing | none above 3 Hz | scene-kit unit tests on animation parameters |
| Screen-reader pass | NVDA (Windows) and VoiceOver (iOS) on the wave's new surfaces | the owner, at each wave's exit (W1-T37, W2-T40, W3-T12) |

---

## 12. Security and privacy

- **Meta CSP** in every document:
  ```
  default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
  font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:;
  object-src 'none'; base-uri 'self'; form-action 'none'
  ```
  - `'wasm-unsafe-eval'` serves the forge.
  - `'unsafe-inline'` styles serve Radix and React style injection, as in kernelspace.
  - There is no `'unsafe-eval'`.
  - A meta CSP cannot set `frame-ancestors` or govern workers, so workers fetch nothing (kernelspace `vite.config.ts`).
- **No third-party requests** (D-033). Fonts are self-hosted, there are no CDNs and no analytics, and an e2e test asserts that every request goes to the origin.
- **Untrusted input** means `.wasm` files, receipt bundles and imported exports.
  - Each is parsed in a worker, size-capped and schema-validated.
  - Each is rendered only as text, never as HTML.
  - Learner wasm has zero imports, the kslab invariant.
- **No `dangerouslySetInnerHTML`.** It is banned by lint, and content is a token tree (§4.1).
- **Learner identity.** The site never asks for a name or email address. The grader never records hostnames, user names or hardware serial numbers (§9.5). A tool or workflow that fetches from the web sends a generic User-Agent (§9.7, §10.1).

---

## 13. Vendored from kernelspace

Files are copied from kernelspace at d478f91 (2026-10-30) into `vendor/kernelspace/` and never edited in place, statespace's method.
- `vendor/kernelspace/VENDOR.md` records each file's path, SHA-256 and licence (MIT). kernelspace's `LICENSE` and the relevant `NOTICE` sections travel with the files.
- Wrappers outside `vendor/` hold every enginespace change.
- `scripts/vendor-drift.ts verify` re-hashes the files. `scripts/vendor-drift.ts diff <sha>` reads a newer kernelspace commit through read-only `git -C <path> show` and prints a reviewable update.

| kernelspace file | Disposition | enginespace home |
|---|---|---|
| `src/lib/rng.ts` | unchanged | re-exported by `packages/sim/core/rng.ts` |
| `src/lib/world/physics/card.ts`, `types.ts`; `tests/fixtures/physics/step-vectors.json`; the fitted parameter rows of `docs/physics/report.json` (with that file's SHA-256) | unchanged | `packages/sim/physics` |
| `src/lib/learner/fsrs.ts`, `tests/fixtures/fsrs/reference-vectors.json`, ts-fsrs's NOTICE section | unchanged, plus a shim for the two types it imports (`MemoryState`, `Rating`) | `src/items/today` |
| `labs/kit` (`kslab`, ABI v2) | unchanged | `labs/forge/kit` |
| `src/lib/forge/{abi,types,run}.ts`, `src/lib/wasm-lab.ts`, `src/lib/lab-worker.ts`, `src/workers/{lab.worker,lab-protocol}.ts` | unchanged, plus type shims for the two ledger types `run.ts` imports | wrapped by `src/forge`; enginespace's invoke protocol is its own module |
| `labs/agent-kit` | vendored, then renamed and extended | `labs/agent-kit` |
| `public/traces/{burstgpt-v2-busiest-hour,burstgpt-v2-busiest-minute,kimi-conversation}.json` and the attribution in their README | unchanged (CC BY 4.0; Apache-2.0) | `public/traces/`, read by `packages/sim/workload` through a build-time import |
| `scripts/a11y.mjs`, `scripts/prepare-pages.mjs`, `scripts/verify-bundle.ts`, the `vite:preloadError` handler in `src/main.tsx` | adapted: patterns re-implemented, not vendored | `scripts/`, `src/main.tsx` |
| `src/lib/ledger/*` | ideas only, re-implemented (§7) | `packages/ledger`, `src/evidence` |
| `src/lib/world/fleet-ex/{broken-bench,push-luck,knee}.ts` | ideas and formulas only, re-implemented; they depend on kernelspace's Fleet engine | `packages/sim/{bench,spec}` |

The kernelspace repo is only ever read, with `git show`, `git ls-tree` and `git grep`. Nothing in this design writes to it.

---

## 14. Exact dependency versions

**Rules.** Every npm dependency is pinned to an exact version: no `^` and no `~`. Where kernelspace uses the same package, the version is the one its `package-lock.json` resolves at d478f91 [measured 2026-11-03]; kernelspace's own `package.json` uses caret ranges, so the lockfile is the source. Installs use `npm ci`, and tests and scripts run under Bun (kernelspace's split). A dependency not listed here needs a DECISIONS entry and an exact pin.

**Runtime**

| Package | Version | Note |
|---|---|---|
| `react`, `react-dom` | 19.2.3 | |
| `react-router` | 7.18.1 | library mode |
| `three` | 0.185.1 | WebGL2; post-processing and orbit controls from its addons |
| `@react-three/fiber` | 9.6.1 | kernelspace's pin; 9.8.x existed on 2026-10-03 (games-3d research), and upgrading is optional |
| `zustand` | 5.0.14 | UI state outside sessions |
| `zod` | 4.3.5 | schemas, the receipt worker and JSON Schema export (`z.toJSONSchema`) |
| `clsx` | 2.1.1 | |
| `tailwind-merge` | 3.4.0 | |
| `class-variance-authority` | 0.7.1 | component variants |
| `@radix-ui/react-slot` | 1.2.4 | |
| `@radix-ui/react-dialog` | 1.1.15 | |
| `@radix-ui/react-tabs` | 1.1.13 | |
| `@radix-ui/react-toggle-group` | 1.1.11 | levers |
| `@radix-ui/react-switch` | 1.2.6 | |
| `@radix-ui/react-slider` | 1.3.6 | |
| `@radix-ui/react-tooltip` | 1.2.8 | never the only carrier of information |
| `@radix-ui/react-visually-hidden` | 1.2.3 | top-level in kernelspace's lockfile |
| `fuse.js` | 7.5.0 | W3 search, lazy |

**Development**

| Package | Version |
|---|---|
| `vite` | 7.3.0 |
| `@vitejs/plugin-react` | 5.1.2 |
| `typescript` | 5.9.3 |
| `@types/react` | 19.2.7 |
| `@types/react-dom` | 19.2.3 |
| `@types/three` | 0.185.1 |
| `@types/node` | 24.10.4 |
| `eslint`, `@eslint/js` | 9.39.2 |
| `typescript-eslint` | 8.52.0 |
| `eslint-plugin-react-hooks` | 7.0.1 |
| `eslint-plugin-react-refresh` | 0.4.26 |
| `globals` | 16.5.0 |
| `tailwindcss` | 3.4.19 |
| `@tailwindcss/typography` | 0.5.20 |
| `postcss` | 8.5.6 |
| `autoprefixer` | 10.4.23 |
| `@playwright/test` | 1.63.0 |
| `@axe-core/playwright` | 4.13.0 |
| `marked` | 18.0.6 (build-time only) |
| `js-yaml` | 4.1.1 (build-time only; a local `.d.ts` declares the one function used) |

**Not used** (D-021, D-022): `@react-three/drei`, `postprocessing`, `@react-three/postprocessing`, `detect-gpu`, `framer-motion`, MDX, any game engine, any analytics package.

**Icons and faces.** No icon or font package is used: the faces are self-hosted files, pinned by SHA-256 in `public/fonts/fonts.json` and not dependencies (D-050), and the icons are drawn in `src/design`. A later icon or font package needs a DECISIONS entry and an exact pin here.

**Python** (grader core; the engine envs are locked by `uv.lock`)

| Package | Version | From |
|---|---|---|
| `jsonschema` | 4.26.0 | statespace `bench/pyproject.toml` [measured] |
| build backend `uv_build` | 0.10.2 | statespace [measured] |
| `vllm` (env `vllm`) | 0.33.0 (0.33.1 instead if it exists when the owner captures traces, D-035's patch gate), proposed, confirmed by O-4 | PyPI, 2026-11-02 [measured] |
| `sglang` (env `sglang`) | 0.5.23, proposed, confirmed by O-4 | GitHub release, 2026-11-02 [measured] |
| `torch` | 2.14.0 in `vllm`; 2.14.1 in `sglang`; CPU 2.14.0 in `cpu` (proposed) | the engines' metadata [measured] |
| `transformers` | 5.19.0 in `cpu` (inside vLLM's range, and SGLang's pin) | the engines' metadata [measured] |

**Rust:** the toolchain is 1.96.0. Forge crates depend only on `std` and the vendored `kslab`, kernelspace's zero-dependency rule.

---

## 15. Module map

Hours are the catalog's [estimated] figures; the total is about 91 h.

| Module | h | Games | Sim modules | B (browser) | L/F (grader) | Wave |
|---|---|---|---|---|---|---|
| TR0 PyTorch and Triton reading | 7 | `shape-shifter` (3D) | `tensor` | items on shapes, strides and grid coverage | Qwen3-0.6B forward against HF to 1e-3 (L, CPU) | W2 |
| TR1 Read the engines | 10 | `engine-floor` (3D) | `lifecycle`, `trace` | lifecycle map by span checks | nano-vllm fork with lifecycle spans (F) | B: W1 · F: W2 |
| TR2 The step loop | 10 | `loop` (3D; the front page) | `steploop`, `physics`, `host` | toggled until the bubbles close | — | W0 (front page) · W1 |
| TR3 Profile a real engine | 12 | `gap-hunt` (2D) | `trace` | attribute 6-10 pinned traces | profile report on vLLM (F) | W2 |
| TR4 Backends as a consumer | 7 | `dispatch` (2D) | `backends` | predict-then-reveal items | backend sweeps (F) | W2 |
| TR5a Hybrid KV and adapter pages | 6 | `pool` (3D) | `kv` | `hybrid-kv` forge lab | — | W1 |
| TR5b Offload, connector, events | 8 | `switchyard` (3D) | `tiers`, `kv` | `kv-publisher` forge lab | toy connector in vLLM (F) | W2 |
| TR6 Speculation and structure | 8 | `verifier` (3D); `loop`'s mask level | `spec`, `steploop` | `rejection-sampler` forge lab; mask-overlap timeline | a proposer (F) | B: W1 · F: W2 |
| TR7 Contribute honestly | 6 | — | — | items on process rules | reproduce a published number; file the issue (F) | W2 |
| TR8 Benchmark like you mean it | 5 | `broken-bench` (2D) | `bench` | seeded broken-benchmark corpus | BurstGPT open-loop replay (F) | B: W1 · F: W2 |
| Capstone | 12 | `gap-hunt` on commit pairs | `trace`, `bench`, `physics` | attribute the pairs' pinned traces | reproduce a commit pair's delta, with goodput at SLO before and after (F) | W3 |

---

## 16. Open items and risks

- **Fresh pins.** vLLM 0.33.0 and SGLang 0.5.23 were days old on 2026-11-03 [measured].
  - vLLM has shipped no x.y.1 patch since 0.28.
  - v0.33.0's CUDA 13 wheels need a host driver of R580 or newer, and rental hosts' drivers are [unverified] (vllm U1). If the gate fails, v0.32.0 is the fallback (D-035, O-4).
- **No real traces yet.** The owner has not captured reference traces (PRODUCT.md). Until W2-T21 captures them and W2-T22 fits the host card to them, the Trace Room and Gap Hunt ship synthetic traces, labelled, and the host card stays [estimated].
- **Grader trust.** §8.6 states the limit. A receipt from an unknown grader build earns no credit.
- **Extension points move.** The proposer, connector and profiler hooks in vLLM and SGLang can change between minors. Each GPU lab keeps a per-pin shim in `labs/gpu/<lab>/starter/`, and the quarterly re-pin carries that cost (catalog §9 puts Engine Internals' upkeep at about 10 h a quarter [estimated]; PLAN.md §11 estimates 14-25 h [estimated], counting the trace re-capture and the host-card refit).
- **The Wire has not shipped.** TR5b owns a minimal connector contract and `kv-events@1` until WR3 ships, then reconciles (D-034).
- **Unverified mechanics:**
  - the SwiftShader flags on the Chromium that Playwright 1.63.0 pins, Chrome for Testing 153.0.8010.12: they were measured on 149.0.7827.55, and the first CI run of W0-T21's e2e suite prints the build (§10.1);
  - official engine images at the pinned tags (W2-T11);
  - WebKit's 7-day storage rule (§7.5).
- **Unmeasured budgets.** Bundle budgets are estimates until W0-T20 measures them. W0-T24 freezes them in DECISIONS.
- **Optional upgrades.** R3F 9.6.1 is behind 9.8.x and three 0.185.1 behind 0.186.x. Upgrading is optional and needs its own DECISIONS entry.
