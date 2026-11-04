# enginespace: decision log

**Status:** D-001 to D-006 are the owner's decisions of 2026-11-03. D-007 to D-013 restate the product record the owner confirmed the same day (`PRODUCT.md`). D-014 to D-042 are **proposed** by [ARCHITECTURE.md](ARCHITECTURE.md) and wait for the owner's review. D-043 to D-046 are **proposed** by the design review of 2026-11-03, which settled contradictions between the design files; they wait for the owner too. The open owner questions, O-1 to O-11, and the course-design questions, Q-1 to Q-12, are at the end. **Date:** 2026-11-03.

**How to read a record.** Each record carries six fields:
- **Decision**, in one or two sentences.
- **Context**: why the question came up, with sources.
- **Alternatives**: what else was weighed. An alternative that came from a source names it; one marked [design] was weighed here and came from no source.
- **Consequences**: what the decision changes in code, content or process.
- **Revisit when**: the trigger that reopens it.
- **Status**, one of:

| Status | Meaning |
|---|---|
| `owner-decided <date>` | The owner made this decision. Change it only by a new record that supersedes it. |
| `owner-confirmed <date>` | Part of the product record the owner confirmed. |
| `assumed` | Taken from kernelspace's plan and written into the product record, but not separately confirmed by the owner. |
| `proposed` | Written by this design. Authoring uses it as the default until the owner accepts or changes it. |
| `accepted <date>` / `changed <date>` / `superseded by D-nnn` | After the owner's review. Leave the text and add the outcome. |

**Tags.** The tags follow ARCHITECTURE.md: [measured], [derived], [estimated] and [unverified]. Every upstream fact carries a date.

## Index

| # | Decision in one line | Status |
|---|---|---|
| D-001 | GPU work is graded. The catalog's "field evidence at weight 0" rule is retired for this course, and credit still never comes from a self-reported number, an LLM grader or a server. | owner-decided 2026-11-03 |
| D-002 | Build the whole course, TR0-TR8 plus the capstone; the no-GPU modules (TR1, TR2, TR5a, TR6, TR8) ship first. | owner-decided 2026-11-03 |
| D-003 | The stack: Vite, React 19, TypeScript, Three.js through react-three-fiber, Tailwind and bun tests, served statically on GitHub Pages with zero servers. | owner-decided 2026-11-03 |
| D-004 | The front page opens on a playable 3D scene of the step loop ("Play first"). | owner-decided 2026-11-03 |
| D-005 | The course has interactive games, several of them impressive 3D, and each game's rule is the concept it teaches. | owner-decided 2026-11-03 |
| D-006 | The visual identity is chosen separately; the architecture and backlog choose no colours, fonts or visual style. | owner-decided 2026-11-03 |
| D-007 | The name is enginespace; the repo is `praveer13/enginespace`, private for now; the course is a kernelspace specialization. | owner-confirmed 2026-11-03 |
| D-008 | The learner is a kernelspace graduate; T5 L1-L10 is a hard prerequisite; the course is Rust-first and teaches only enough PyTorch to read the engines. | owner-confirmed 2026-11-03 |
| D-009 | Zero servers and nothing collected: no telemetry and no accounts; progress stays on the device and can be exported. | owner-confirmed 2026-11-03 |
| D-010 | Credit comes only from deterministic checks. There is no LLM-graded credit, no grading server and no graded browser timing. | owner-confirmed 2026-11-03 |
| D-011 | One vLLM minor and one SGLang minor are pinned and re-pinned quarterly. The reading targets are pinned, and reference traces are owner-captured, SHA-256-pinned and dated. | owner-confirmed 2026-11-03 |
| D-012 | Every number is a claim with a source, a date and a TTL; synthetic data is labelled; every browser world carries a card saying what it models and ignores. | owner-confirmed 2026-11-03 |
| D-013 | WCAG 2.2 AA, every core surface usable at 360 px and by keyboard, zero serious axe violations; 3D needs reduced motion and a non-3D path. | assumed (PRODUCT.md) |
| D-014 | One Vite app with internal TypeScript packages, not npm workspaces. | proposed |
| D-015 | One origin; receipts and wasm are handled in workers; no instrument origin. | proposed |
| D-016 | Content is Markdown with YAML front matter and eight directive types, compiled to JSON at build time; no MDX and no HTML from content. | proposed |
| D-017 | A pure, seeded simulation package with integer time and kernelspace's determinism lint. | proposed |
| D-018 | One rule, many views: every game is a pure session, and its 3D, 2D and DOM views share it. | proposed |
| D-019 | kernelspace's seven-test 3D gate stays, with its dimensionality test made advisory by D-005. | proposed |
| D-020 | Edition 1 uses WebGL2 only, with no WebGPU path. | proposed |
| D-021 | No game engine, no drei and no in-canvas text; post-processing comes from three's own addons. | proposed |
| D-022 | Device tiers come from local hints and a frame-time governor, not detect-gpu. | proposed |
| D-023 | A first-paint JavaScript budget, and a front page that paints a 2D step loop first and upgrades to 3D after LCP. | proposed |
| D-024 | The evidence ledger is re-implemented on kernelspace's envelope; provenance weights come from ASSESSMENT.md and apply at read time. | proposed |
| D-025 | Browser-lane builds are Rust → wasm on kernelspace's kslab ABI v2, graded by host-driven property tests whose oracle sits outside the learner's code. | proposed |
| D-026 | The local grader is Python, with one locked environment per engine. | proposed |
| D-027 | Receipts are bound to a single-use challenge issued by the learner's browser. | proposed |
| D-028 | Verification recomputes from raw artifacts, checks correctness across machines by teacher-forced agreement, and applies physics floors. | proposed |
| D-029 | A receipt bundle is one gzipped JSON file, read with the browser's native `DecompressionStream`. | proposed |
| D-030 | One schema source: zod, exported to committed JSON Schema, validated in Python with `jsonschema` 4.26.0. | proposed |
| D-031 | kernelspace files are vendored at d478f91, with VENDOR.md and a drift script. | proposed |
| D-032 | npm dependencies are pinned exactly, to kernelspace's lockfile versions; npm installs and Bun tests; Node 24, Bun 1.3.14. | proposed |
| D-033 | No third-party requests from the site; fonts are self-hosted. | proposed |
| D-034 | TR5b owns a minimal KV connector contract and `kv-events@1` until The Wire's WR3 ships. | proposed |
| D-035 | Proposed edition-1 pins: vLLM v0.33.0 (v0.32.0 if the R580 driver gate fails) and SGLang v0.5.23, pinned by SHA. | proposed; owner confirms (O-4) |
| D-036 | Build process: four waves, S/M/L tasks for Sonnet agents in isolation, Opus exit reviews, stacked wave PRs that the owner merges. | proposed |
| D-037 | The Keep stage ships in W1: Today, on kernelspace's vendored FSRS. | proposed |
| D-038 | A front-page run is practice and earns no credit. | proposed |
| D-039 | W1 ships the browser parts of TR1, TR6 and TR8; their GPU parts ship with W2. | proposed |
| D-040 | The 2026-10-24 pre-build gates: the TR2 spike becomes W0-T13's acceptance; the pick form is not a gate for this repo unless the owner says otherwise (O-7). | proposed |
| D-041 | Dispatch keys follow the pinned default runner, MRV2's `BatchExecutionDescriptor`; `has_lora` is taught as MRV1's legacy key. This corrects the catalog. | proposed |
| D-042 | Adapter pages in the KV pool are taught as S-LoRA's design, built by the learner. Upstream vLLM and SGLang use adapter slots at the pins. This corrects the catalog's framing. | proposed |
| D-043 | The front page plays GAMES.md §3.1's "First loop": the visitor batches requests by hand, refills, and turns on overlap; CUDA graphs stay in TR2's levels. | proposed (design review); the owner confirms with O-11 |
| D-044 | On the "70B on H100" card, S5's per-sequence host term t_seq runs on the CPU lane, not inside the GPU step, so host work is counted once; hiding it is labelled an extrapolation. | proposed (design review); the owner confirms |
| D-045 | The KV pool has one page size: KV groups unify to it as vLLM's hybrid manager does, and adapters take S-LoRA's page count. ARCHITECTURE §5.4's mixed `pageUnits` is dropped. | proposed (design review) |
| D-046 | Same-machine output comparisons (TR1's instrumented fork, TR6's speculative runs) use ASSESSMENT §5.7's tie-aware identity, not strict token identity. | proposed (design review) |

---

## Owner decisions, 2026-11-03

### D-001 · GPU work is graded

- **Status:** owner-decided 2026-11-03.
- **Decision:** Learners do GPU work on a local GPU or a rented one (RunPod, Modal, Lambda and similar), and that work earns credit. The catalog's rule giving field evidence weight 0 is retired for this course. Credit still never comes from a self-reported number, an LLM grader or a server. A local grader checks correctness against references, and performance evidence (a trace, a benchmark log) is checked for internal consistency.
- **Context:** kernelspace's `SPECIALIZATIONS.md` §7 (2026-10-24) kept "field points at weight 0", and kernelspace's `provenance.ts` weights `field` at 0. Engine Internals is the most GPU-bound course after Kernels: about 35% of its hours run in the browser [derived, catalog §3.5].
- **Alternatives:** keep field evidence at weight 0, as the catalog did; or grade GPU work on a server, which D-009 forbids.
- **Consequences:**
  - A new provenance, `gpu-verified`, replaces `field` for this course. ASSESSMENT.md sets its weight.
  - The grader, the challenge, the receipt and verification are built: D-026 to D-030 and ARCHITECTURE §8 and §9.
  - ARCHITECTURE §8.6 states plainly what a zero-server pipeline cannot prove.
- **Revisit when:** a forged receipt passes verification in the bestiary or in the wild, or the owner adds a grading server.

### D-002 · Build the whole course, no-GPU modules first

- **Status:** owner-decided 2026-11-03.
- **Decision:** Build TR0-TR8 and the capstone. Within it, the no-GPU modules (TR1, TR2, TR5a, TR6, TR8) ship first.
- **Context:** The 2026-10-24 tie-break recommended "Engine Internals Part 1" (TR1, TR2, TR5a, TR6 and TR8 plus a browser capstone, about 47 learner hours and about 85% browser-graded) as the next build. The owner widened that to the whole course and kept the order.
- **Alternatives:** Part 1 only, which was the tie-break's pick; or Fleet Ops first, as the catalog's §9 says.
- **Consequences:** The waves are W0 (scaffold, design-system hookup, front page), W1 (the no-GPU modules), W2 (the GPU modules and the grader) and W3 (capstone, polish, launch). D-039 places the GPU parts of TR1, TR6 and TR8.
- **Revisit when:** W1's exit review shows the review load cannot carry W2.

### D-003 · Stack

- **Status:** owner-decided 2026-11-03.
- **Decision:** Vite, React 19 and TypeScript, Three.js through react-three-fiber, Tailwind, and tests on bun. The build is static on GitHub Pages, with zero servers. This is kernelspace's toolchain (its `package.json` at origin/master).
- **Context:** PRODUCT.md, "Stack": "the same toolchain as kernelspace, so its patterns carry over."
- **Alternatives:** none were weighed. This was the owner's call.
- **Consequences:** D-014 and D-032 fix the layout and pins.
- **Revisit when:** a requirement cannot be met statically.

### D-004 · The front page opens on a playable 3D step loop

- **Status:** owner-decided 2026-11-03.
- **Decision:** The front page opens on a playable 3D scene of the step loop. "Play first."
- **Context:** PRODUCT.md principle 5: "The first minute is hands-on." The step loop is TR2's subject and the catalog's "Why is the GPU idle 300 µs between steps?"
- **Alternatives:** a pitch page with a video; or a 2D demo only [design].
- **Consequences:** D-023 makes the front page paint a playable 2D step loop from static HTML first and swap in the 3D scene after LCP. The 3D is what a capable device shows within its first seconds, while LCP stays fast on every device. The Loop is W0's centrepiece (W0-T13, W0-T16, W0-T17, W0-T18).
- **Interpretation to confirm (O-11):** "opens on a playable 3D scene" is read as "the game on the front page is 3D on a capable device within seconds of load, and playable in 2D from the very first paint". Putting the 3D into the first paint itself would add about 285 KB gz before LCP [derived: the 245 KB `three-vendor` and 40 KB scene gates].
- **Revisit when:** the nightly LCP gate fails because of the 3D swap, or the owner answers O-11 differently.

### D-005 · Games, several of them impressive 3D, each rule the concept

- **Status:** owner-decided 2026-11-03.
- **Decision:** The course has interactive games, several of them impressive 3D, and each game's rule is the concept it teaches.
- **Context:** kernelspace's PLAN-100X §5.4.0 and its OD9 kept 3D opt-in, behind a seven-test gate, until 3D was shown to teach as well as linked 2D views. The owner chose 3D games for this course, "to catch attention and make it fun".
- **Alternatives:** kernelspace's "2D default, 3D opt-in" (PLAN-100X OD9).
- **Consequences:** ARCHITECTURE §6.1 has six 3D games and three 2D games. D-019 keeps the parts of the gate that guard learning (intrinsic rule, model-backed, debriefed, low load with a 2D path) and makes the dimensionality test advisory.
- **Revisit when:** a pre-registered comparison (a W3 stretch) shows a 3D game teaching worse than its 2D view.

### D-006 · The visual identity is chosen separately

- **Status:** owner-decided 2026-11-03.
- **Decision:** The visual identity is being chosen separately. This architecture and backlog choose no colours, fonts or visual style. They describe scenes, objects, cameras and interactions only.
- **Context:** The parallel design work under `impeccable` writes DESIGN.md and its tokens.
- **Alternatives:** none.
- **Consequences:**
  - W0-T05 wires a token contract whose placeholder values are CSS system colours and system font stacks. Those are the browser's defaults, not a palette.
  - W0-T06 applies DESIGN.md's values when they land.
  - Scene materials read the tokens (ARCHITECTURE §6.4).
- **Revisit when:** DESIGN.md lands. W0-T06 then closes this record's dependency.

---

## The product record, confirmed 2026-11-03

### D-007 · Name, repo and family

- **Status:** owner-confirmed 2026-11-03.
- **Decision:** The course is called enginespace, after kernelspace. The repo is `praveer13/enginespace`, private for now. It is the Engine Internals specialization of kernelspace, and may cite kernelspace's lessons, labs and plays by id (T5.L7, lab 06).
- **Consequences:** The repo is private, so learners get the lab kits and the grader as static downloads from the site, not by cloning (ARCHITECTURE §9.3). See O-2 for Pages on a private repo.

### D-008 · Learner and prerequisite

- **Status:** owner-confirmed 2026-11-03.
- **Decision:** The learner is a backend engineer who has finished kernelspace's serving tracks. T5 L1-L10 is a hard prerequisite. The learner is Rust-first, so the course teaches only enough PyTorch to read vLLM and SGLang. They study alone, on a laptop with the site open, and run GPU work on their own or a rented GPU.
- **Consequences:**
  - The browser-lane builds are Rust → wasm (D-025).
  - TR0 teaches reading PyTorch and Triton.
  - `/map` names kernelspace prerequisites per module, and nothing locks.

### D-009 · Zero servers, nothing collected

- **Status:** owner-confirmed 2026-11-03.
- **Decision:** No always-on servers, no telemetry and no accounts. Progress stays on the learner's device and can be exported.
- **Consequences:** ARCHITECTURE I1 and §7, §12. The CSP sets `connect-src 'self'`. Fonts are self-hosted (D-033). An e2e test fails on any request that leaves the origin.

### D-010 · Credit only from deterministic checks

- **Status:** owner-confirmed 2026-11-03.
- **Decision:** Credit comes only from browser checks on seeds drawn at grade time, a local grader checking correctness against references, and performance evidence checked for internal consistency. There is no LLM-graded credit, no grading server and no graded browser timing.
- **Consequences:** ARCHITECTURE §8. The catalog's §7 timing rule stands: `performance.now()` is coarsened, so no browser timing is graded.

### D-011 · Pins and reference traces

- **Status:** owner-confirmed 2026-11-03.
- **Decision:** The course pins one vLLM minor and one SGLang minor and re-pins them each quarter. The reading targets are pinned: nano-vllm, Mini-SGLang, and "Inside vLLM" at commit 42172ad. Reference traces are captured by the owner on real GPUs, pinned by SHA-256 and dated.
- **Consequences:** `course.lock.json` (ARCHITECTURE §4.4); D-035 and O-4 for the first pins; W2-T21 for the traces; the W3 upstream watcher.

### D-012 · Numbers, synthetic data and model cards

- **Status:** owner-confirmed 2026-11-03.
- **Decision:**
  - Every number is a claim with a source, a date and a TTL, and a number that moves raises a change card.
  - Demonstration data is labelled synthetic.
  - Every simulated world carries a card saying what it models and what it ignores, and the real engine is authoritative.
- **Consequences:** The claims registry, `verify:claims` and `verify:numbers`, the notional-machine cards and `synthetic: true` on generated traces and workloads (ARCHITECTURE §4.4, §5.9).

### D-013 · Accessibility baseline

- **Status:** assumed. PRODUCT.md takes it from kernelspace's PLAN-100X §1 ("Reach") and says it was not separately confirmed.
- **Decision:** WCAG 2.2 AA; every core surface usable at 360 px and by keyboard; zero serious axe violations. 3D games need a reduced-motion setting and a non-3D path to the same concept.
- **Consequences:** ARCHITECTURE §6.9 and §11.2; D-018; D-019.
- **Revisit when:** the owner confirms it or changes it. Confirmation turns the status into `owner-confirmed`.

---

## Proposed by the architecture

### D-014 · One Vite app with internal packages

- **Status:** proposed.
- **Decision:** One Vite app, one `package.json` and one lockfile. Pure code lives in `packages/{sim,play,ledger,schema,verify}` as TypeScript projects reached through path aliases, not npm workspaces.
- **Context:** statespace uses npm workspaces (`apps/site`, `apps/instruments`, `packages/*`) because it runs two origins. kernelspace is one app. The brief asked for a choice between the two.
- **Alternatives:**
  - statespace's workspaces;
  - a flat `src/` with folders only, which would lose the no-DOM `tsconfig` that makes purity a type error [design].
- **Consequences:**
  - One `node_modules`, so worktree agents hard-link it (`cp -al`).
  - Purity holds through `tsconfig.pure.json` with no DOM lib, ESLint import fences and `verify:boundaries`.
  - Promoting to workspaces later moves no file.
- **Revisit when:** a second app or a TypeScript CLI appears.

### D-015 · One origin

- **Status:** proposed.
- **Decision:** The site uses one origin. The learner's wasm runs in a worker, with zero imports, kernelspace's Forge pattern. Receipt bundles and imported exports are parsed in a worker, size-capped and schema-validated, and rendered only as text.
- **Context:**
  - statespace put engines and untrusted parsing on a second origin, because Pyodide's worker failed inside kernelspace's opaque-origin sandbox (statespace ARCHITECTURE §4.3, §5).
  - enginespace runs no Pyodide and no engine in the page, and renders no imported HTML.
  - A second origin would also need a second custom domain, which is still undecided (O-1).
- **Alternatives:** statespace's instrument origin; or kernelspace's sandboxed iframe for learner JavaScript, which is not needed because no learner JavaScript runs [design].
- **Consequences:** ARCHITECTURE §2.1 and §12. There is one Pages site.
- **Revisit when:** the course runs learner Python or JavaScript in the page, or renders imported rich content.

### D-016 · Content format

- **Status:** proposed.
- **Decision:**
  - Lessons and module pages are Markdown with YAML front matter and container directives.
  - There are eight block types: prose, `predict`, `item`, `game`, `trace`, `lab`, `card` and `figure`.
  - The pages are compiled at build time to JSON. Prose becomes a restricted token tree, and React renders it.
  - js-yaml 4.1.1 and marked 18.0.6 run at build time only.
- **Context:** kernelspace writes lessons as TypeScript data files and exports Markdown for learners' agents. statespace compiles `content/` to JSON. PLAN-100X capped new block types at four, and statespace capped its content blocks at six.
- **Alternatives:**
  - kernelspace's TypeScript data files, hard to review as prose and needing a second export;
  - MDX, which turns content into code and adds a dependency;
  - JSON bodies inside the directives, readable by machines but noisy for people [design].
- **Consequences:**
  - The Markdown is itself the learner's-agent export, with keys stripped.
  - `dangerouslySetInnerHTML` is banned.
  - `verify:content` caps the block types.
- **Revisit when:** a lesson needs a ninth block type. Adding one reopens this record.

### D-017 · A pure, seeded simulation package

- **Status:** proposed.
- **Decision:**
  - `packages/sim` takes seeds, works in integer µs and integer probability weights, and draws from kernelspace's splitmix32.
  - It bans transcendental `Math` functions, `**`, `Date`, `performance`, `Math.random`, unordered iteration that reaches output, and comparator-less sorts.
  - Lookup tables are generated by scripts and committed as integers.
- **Context:** kernelspace's determinism lint (PLAN-100X §7.4) and its S5 card's fixed operation order. Receipt verification (D-028) reuses these models, so they must produce identical results in every browser and in Bun.
- **Alternatives:** floating point with tolerances everywhere, which would make cross-browser hashes and exact chi-square inputs impossible [design].
- **Consequences:** ARCHITECTURE §5.1 and §5.10. Golden vectors run on every PR, and a cross-browser hash runs nightly.
- **Revisit when:** a model genuinely needs a transcendental function at runtime. A generated table is the default answer.

### D-018 · One rule, many views

- **Status:** proposed.
- **Decision:**
  - A game's state, actions, reducer, scoring, hidden reference and debrief live in a pure session (`packages/play/<id>`).
  - The 3D scene, the 2D view and the DOM mirror render the same state and dispatch the same actions.
  - A graded run is its seed plus its action log, and grading replays the log.
- **Context:** kernelspace's plays already keep the rules in `src/lib/world/*` and the session in plain functions, with the ghost read only by the debrief. PRODUCT.md requires a non-3D path to the same concept.
- **Alternatives:** separate 2D and 3D implementations, which drift, double the work and can teach different rules [design].
- **Consequences:** The 2D view is first-class: it is the front page's first paint and the poster. An edited score in IndexedDB changes nothing.
- **Revisit when:** never, while D-005 stands.

### D-019 · The 3D gate, kept and amended

- **Status:** proposed.
- **Decision:**
  - Tests 1 (intrinsic), 3 (model-backed), 4 (recurrence), 6 (load: pausable, a 2D path, a DOM mirror, reduced motion) and 7 (debrief) from kernelspace's seven-test gate are required.
  - Test 5 becomes "no photoreal hardware and no decorative effects behind prose; the look comes from DESIGN.md".
  - Test 2 (at least three axes reasoned about together) becomes advisory under D-005, and each 3D game names its axes.
- **Context:**
  - kernelspace `games-3d.md` §2.3 cites seductive details at about g = −0.33, and schematic over realistic visuals at 0.48 against −0.01 (Clark 2016, small k).
  - It also cites immersion that raised presence and lowered learning [secondary, as cited there].
  - The owner's D-005 asks for impressive 3D.
- **Alternatives:** kernelspace's gate unchanged, which would allow two 3D scenes at most and contradict D-005; or no gate, which risks seductive detail [design].
- **Consequences:** `verify:games` checks the mechanical tests. ARCHITECTURE §6.1 lists six 3D games with their axes.
- **Revisit when:** evidence from the W3 stretch comparison arrives.

### D-020 · WebGL2 only in edition 1

- **Status:** proposed.
- **Decision:** Every 3D scene targets WebGL2 through three 0.185.1 and R3F 9.6.1. There is no WebGPU path in edition 1.
- **Context:**
  - Firefox shipped no WebGPU on Linux or Android, and caniuse showed about 87% global support (games-3d research, checked 2026-10-03).
  - Every browser in the target set has WebGL2.
  - No game here needs compute shaders.
- **Alternatives:** `WebGPURenderer` with its WebGL2 fallback, which brings a larger chunk (about 285 KB gz for core plus the WebGPU path against about 188 KB, measured by kernelspace on 2026-10-03) and a second code path to test.
- **Consequences:** Smaller chunks and one rendering path to test.
- **Revisit when:** a game needs GPU compute, or R3F 10 ships stable with first-class WebGPU.

### D-021 · No game engine, no drei, no in-canvas text, post-processing from three's addons

- **Status:** proposed.
- **Decision:**
  - No Bevy, Godot, Unity, Babylon.js or PlayCanvas.
  - No `@react-three/drei`: the scene kit implements its few helpers itself.
  - All text in scenes is DOM.
  - Post-processing uses `three/addons/postprocessing/*`, locked to `three` 0.185.1.
- **Context:**
  - kernelspace rejected game engines on size (Godot's default wasm about 32 MB raw; a feature-heavy Bevy 0.19 app 26-28 MB raw), on accessibility and on having a second source of truth (games-3d research).
  - Its `Cube3D.tsx` ships "no texture, no drei".
  - PLAN-100X says "no drei `Text`".
- **Alternatives:**
  - drei, convenient but with a broad dependency tree;
  - pmndrs `postprocessing`, which merges effects more efficiently but is a new dependency with no version pinned in kernelspace [design].
- **Consequences:** ARCHITECTURE §6.4 and §6.5. Screen readers and zoom read all scene text.
- **Revisit when:** a scene's post-processing misses its 2 ms budget with three's passes, or a helper costs more to write than to depend on.

### D-022 · Device tiers without detect-gpu

- **Status:** proposed.
- **Decision:** The starting tier comes from local hints: WebGL2 support, `failIfMajorPerformanceCaveat`, coarse pointer, `deviceMemory`, `hardwareConcurrency` and maximum texture size. A frame-time governor then moves the tier with hysteresis.
- **Context:** detect-gpu 5.0.70 sits in kernelspace's lockfile through drei, but it fetches benchmark data from a CDN by default. That is a third-party request, which D-009 and D-033 forbid.
- **Alternatives:** detect-gpu with self-hosted benchmark data, a heavier asset that goes stale [design].
- **Consequences:** ARCHITECTURE §6.6. Tiers never step above the learner's cap.
- **Revisit when:** the tiers prove wrong on the reference devices at a wave's exit.

### D-023 · First-paint budget and a 2D-first front page

- **Status:** proposed.
- **Decision:**
  - The front page's static HTML holds the poster (an SVG of The Loop's first frame from the same layout code) and the heading.
  - The entry closure makes the 2D Loop playable.
  - The 3D chunks (three plus R3F at most 245 KB gz, the scene at most 40 KB gz) load after LCP.
  - The gates are: entry ≤ 110 KB gz; front-page first-paint closure ≤ 150 KB gz; LCP ≤ 2.5 s in the nightly mobile lab profile.
- **Context:**
  - kernelspace measured its three plus R3F chunk at 238-242.4 KB gz and its whole-app entry at 115.7 KB gz (its `verify-bundle.ts` and games-3d research).
  - Blocking first paint on a roughly 280 KB scene would make the "Play first" page slow on phones.
- **Alternatives:** 3D in the first paint, which is slow on phones; or a static image with a "Play" button, which is not play-first [design].
- **Consequences:** ARCHITECTURE §6.10, §6.11 and §11.1. These budgets are [estimated] until W0-T20 measures them and W0-T24 freezes them here.
- **Revisit when:** W0-T24 has measured the budgets.

### D-024 · The evidence ledger

- **Status:** proposed.
- **Decision:**
  - An append-only IndexedDB ledger re-implements kernelspace's event envelope: id, `v`, kind, ref, `at`, `tz`, `day`, device, `rev`, score, `ok`, provenance and seed.
  - It adds a write-ahead outbox, BroadcastChannel sync, a schema guard, and export plus merge-or-replace import with undo.
  - Provenance weights live in one module, are taken from ASSESSMENT.md, and apply at read time.
- **Context:** statespace re-implemented rather than vendored kernelspace's ledger, because that ledger is coupled to XP, legacy migration and the store facade. kernelspace applies weights at read time so that a weight change rewrites no history.
- **Alternatives:** vendoring kernelspace's ledger with shims, which would be large and coupled [design].
- **Consequences:** ARCHITECTURE §7. A conformance suite runs against the memory store under Bun and the IndexedDB store in Playwright.
- **Revisit when:** ASSESSMENT.md needs an event kind §7.2 lacks.

### D-025 · Forge labs: Rust → wasm, graded by host-driven property tests

- **Status:** proposed.
- **Decision:**
  - The browser-lane builds (`hybrid-kv`, `rejection-sampler`, `kv-publisher`) are Rust crates on kernelspace's `kslab` ABI v2, vendored unchanged.
  - The site drives each module through `ks_invoke` with seeded operation batches, the invoke protocol, and checks every reply against `packages/sim`.
  - The crate's own `ks_run` checks still back `cargo test`.
- **Context:**
  - kernelspace compiles its checks into the learner's wasm, so a learner could edit the harness ("friction, not DRM").
  - statespace added host-side oracles.
  - The learner is Rust-first (D-008).
  - The catalog's TR5a artifact extends lab 02's optional `adapter_unified_paging` check.
- **Alternatives:**
  - Python in the page through Pyodide, a download of about 10 MB or more [estimated] that would need statespace's second origin;
  - TypeScript labs, which would lose the Rust-first fit and lab 02's continuity [design].
- **Consequences:** ARCHITECTURE §8.3. Every lab has a bestiary of wrong modules that must fail.
- **Revisit when:** a lab cannot be expressed as seeded operations with checkable replies.

### D-026 · The local grader: Python, one environment per engine

- **Status:** proposed.
- **Decision:**
  - `enginespace-grader` is a Python package (the `enginespace` command).
  - Its core needs only the standard library and `jsonschema==4.26.0`, and its tests use `unittest`.
  - The engine environments are separate uv projects with lockfiles: `envs/cpu`, `envs/vllm`, `envs/sglang` and `envs/nano-vllm`.
  - Install with uv 0.10.2 or pip with hashes. Python 3.12 is the default.
- **Context:**
  - vLLM and SGLang are Python.
  - vLLM 0.33.0 pins `torch==2.14.0` and `xgrammar==0.2.8`, while SGLang 0.5.23 pins `torch==2.14.1` and `xgrammar==0.2.7` [measured 2026-11-03 from PyPI and the v0.5.23 `pyproject.toml`], so they cannot share one environment.
  - statespace's Bench CLI uses uv with `uv_build` 0.10.2.
- **Alternatives:** one uv project with conflicting extras declared, which works but is harder for an agent or a learner to repair [design]; or a TypeScript CLI, which cannot import the engines.
- **Consequences:** ARCHITECTURE §9. The kits ship as static downloads, because the repo is private (D-007).
- **Revisit when:** the engines converge on one torch pin, or a lab needs both engines in one process.

### D-027 · Challenge-bound receipts

- **Status:** proposed.
- **Decision:**
  - The learner's browser issues a challenge token: `es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<fnv32>`.
  - The grader derives every seeded input from it.
  - The browser accepts a receipt only when it carries an unexpired, unused token from its own ledger for that lab and stage.
- **Context:** Without a server, the only fresh-seed authority is the learner's own browser. This is kernelspace's "unseen, not secret" carried to the GPU lane.
- **Alternatives:**
  - seeds chosen by the grader, which allow replay;
  - signing by a server, which D-009 forbids;
  - Sigstore attestations, which statespace keeps off by default (its OD-13) [design].
- **Consequences:** ARCHITECTURE §8.4. A token expires after 14 days [estimated].
- **Revisit when:** learners need to grade on a machine that cannot see the browser that issued the challenge. A copied token already covers a rented GPU.

### D-028 · Verification from raw data

- **Status:** proposed.
- **Decision:**
  - The browser recomputes every performance summary from raw records with `packages/sim`: percentiles, bootstrap intervals, goodput, arrival adherence, Little's law, trace structure and attribution sums.
  - It applies physics floors from the hardware atlas's sourced claims.
  - It re-runs every correctness check it can: banks, event replays, same-machine identity, counts.
  - The rest is grader-attested.
  - Correctness across machines uses teacher-forced agreement (top-k membership and a log-probability tolerance), never a free-running exact match.
- **Context:**
  - statespace's rule is that a receipt never trusts an exit code alone.
  - Greedy outputs drift across GPUs, kernels and batch shapes, so an exact-match bank would fail honest learners.
  - The catalog's Numerics course owns determinism and the logprob gap (BW5).
- **Alternatives:** trust the grader's summary, which is forgeable by typing; or exact-match banks, which are brittle [design].
- **Consequences:** ARCHITECTURE §8.5 and §8.6. A forged-receipt bestiary runs in CI.
- **Revisit when:** an honest receipt fails a floor or a tolerance. Fix the claim or the tolerance, and log it here.

### D-029 · Receipt bundles are gzipped JSON

- **Status:** proposed.
- **Decision:**
  - A bundle is one `.es.json.gz` file holding the receipt and its artifacts.
  - Python writes it with `gzip`, and the browser reads it with the native `DecompressionStream('gzip')`, counting bytes against a cap.
  - Traces travel as `trace@1` in columns.
- **Context:** One file is easier to move from a rented GPU than a folder. `fflate` sits in kernelspace's lockfile only as a transitive dependency.
- **Alternatives:** a zip read with `fflate`, a dependency and zip parsing; or a folder dropped with `webkitdirectory`, which is awkward on phones [design].
- **Consequences:** No archive library is needed. The caps are 32 MB compressed and 256 MB decompressed [estimated].
- **Revisit when:** a lab's artifacts outgrow the caps after column encoding.

### D-030 · One schema source

- **Status:** proposed.
- **Decision:**
  - zod schemas in `packages/schema` are the source for `receipt@1`, `bundle@1`, `trace@1`, the challenge, the content, the claims and the lockfile.
  - `z.toJSONSchema` exports committed files to `schemas/`.
  - The grader validates with `jsonschema` 4.26.0.
  - `verify:schema` fails on drift, and shared vectors bind the challenge codec, the RNG and canonical JSON across languages.
- **Context:** statespace keeps one JSON Schema source for TypeScript and Python.
- **Alternatives:** JSON Schema hand-written as the source, which loses zod's types in the site [design].
- **Consequences:** ARCHITECTURE §9.6 and §9.8.
- **Revisit when:** zod's JSON Schema export cannot express a constraint the grader needs.

### D-031 · Vendoring kernelspace

- **Status:** proposed.
- **Decision:**
  - Copy the files listed in ARCHITECTURE §13 from kernelspace at d478f91 (origin/master, 2026-10-30) into `vendor/kernelspace/`, never edited in place.
  - VENDOR.md records each file's path, SHA-256 and MIT licence, with the relevant NOTICE sections.
  - `scripts/vendor-drift.ts` verifies the files and diffs them against newer commits, reading kernelspace only through `git show`.
- **Context:** statespace vendors kernelspace's stateless, tested code the same way. kernelspace is MIT-licensed (its `LICENSE` at d478f91).
- **Alternatives:** copying with edits, which drifts silently; or a git submodule, which brings all of kernelspace into a private repo [design].
- **Consequences:** `verify:vendor` in the fast gate. The S5 card, the RNG, FSRS, the kslab ABI and the forge host stay identical to kernelspace's.
- **Revisit when:** kernelspace changes a vendored file. Diff it, review it, then re-vendor.

### D-032 · Exact npm pins from kernelspace's lockfile

- **Status:** proposed.
- **Decision:**
  - Every npm dependency is pinned exactly.
  - Where kernelspace uses the same package, the version is its `package-lock.json` resolution at d478f91 (ARCHITECTURE §14).
  - `npm ci` installs, and Bun 1.3.14 runs tests and scripts, on Node 24, kernelspace's split.
- **Context:** The brief asked for exact versions from kernelspace wherever the same package is used. kernelspace's `package.json` uses caret ranges, so its lockfile is the source.
- **Alternatives:** Bun as the package manager; or the newer versions statespace pins (React 19.3.1, Vite 7.3.7), which do not match kernelspace [design].
- **Consequences:** Any new dependency needs a record here and an exact pin.
- **Revisit when:** a security advisory affects a pin, or the quarterly re-pin.

### D-033 · No third-party requests

- **Status:** proposed.
- **Decision:** The site makes no request outside its origin. Fonts are self-hosted, and there are no CDNs, embeds or analytics. The CSP sets `connect-src 'self'`, and an e2e test enforces it.
- **Context:** kernelspace loads Google Fonts and allows several third parties (its `vite.config.ts` CSP). enginespace's D-009 promises that nothing is collected.
- **Alternatives:** kernelspace's disclosed third parties [design].
- **Consequences:** DESIGN.md's fonts are bundled. Their licences go into NOTICE.
- **Revisit when:** a feature needs a third party. Disclose it, and record it here.

### D-034 · A minimal connector contract and `kv-events@1` until The Wire ships

- **Status:** proposed.
- **Decision:**
  - TR5b owns a minimal KV connector contract and event schema, `kv-events@1`, mirroring the pinned vLLM version's KV event shapes [unverified until W1-T01 checks the pin].
  - When The Wire's WR3 ships the Switchyard's contract, enginespace reconciles with it.
- **Context:**
  - Catalog §4 makes WR3 the owner of the connector contract and event schema. TR5b implements the engine side. The citing course owns a minimal version when the owner course has not shipped.
  - At the pins, both engines publish `BlockStored`, `BlockRemoved` and `AllBlocksCleared` over ZMQ (vllm K8, sglang H2).
  - vLLM's connector method set is additive from v0.31.0 to `main` and ships a reference `ExampleConnector` with unit tests (vllm K6, K9).
  - A connector that does not subclass `SupportsHMA` silently turns the hybrid KV manager off (vllm K3).
- **Alternatives:** wait for The Wire, which is not on the build schedule here [design].
- **Consequences:** `packages/sim/tiers`, the `kv-publisher` lab and the Switchyard game (ARCHITECTURE §5.8).
- **Revisit when:** The Wire ships WR3.

### D-035 · Proposed edition-1 pins

- **Status:** proposed; the owner confirms (O-4).
- **Decision:**
  - Pin vLLM v0.33.0 (commit `4ba787ec9959e566d3b587a796dff07673324da5`).
  - Pin SGLang v0.5.23 (sha `297e54fd105e974cdf401e5b4d20253a22c16f90`).
  - Pin nano-vllm at `bb823b3e06983d71485a8e1f23715ebd87d98ef8` and Mini-SGLang at `9a91cfafe754aa85daee49998176275667eb58f2`.
  - Pin "Inside vLLM" at `42172ad18fbc22c89d0063184e4570cc84186e16`.
  - Lock each engine environment with uv.
  - **Driver gate:** v0.33.0's wheels are CUDA 13 only and need a host driver of R580 or newer. If the owner's capture GPUs or the cheapest rentable 4090 hosts run older drivers, pin v0.32.0 (`5df63a7203cdb9328d824a27b682e77c7b9928be`), the last minor with CUDA 12.9 builds, instead.
  - **Patch gate:** if a v0.33.1 exists on the day the owner captures traces, take it.
- **Context:**
  - vLLM v0.33.0 was tagged on GitHub on 2026-11-01 and uploaded to PyPI on 2026-11-02. SGLang v0.5.23 was uploaded to PyPI on 2026-10-30 and released on GitHub on 2026-11-02 [measured 2026-11-03; vllm R1-R4, sglang R1].
  - Minor releases arrive about every 14 days: a median of 13.8 days for vLLM and 14.1 days for SGLang [derived; vllm R2, sglang R3].
  - vLLM has shipped no x.y.1 patch from 0.28 through 0.33 [measured; vllm R1, R3].
  - kernelspace's lab twins stay at vLLM v0.31.0 and SGLang v0.5.21 (catalog §3.5). Their scheduler facts still hold (vllm M12).
  - The research agents recommended these pins (`research/upstream-vllm.md` §3, `research/upstream-sglang.md` §4).
- **Alternatives:**
  - kernelspace's twins (v0.31.0, v0.5.21), already two minors behind, and on vLLM still falling back to MRV1 for n-gram;
  - v0.32.0 outright, whose only advantage is CUDA 12.9 (vllm §3).
- **Consequences:**
  - `course.lock.json` records the pins.
  - `enginespace doctor` checks the host driver against the pin.
  - W1 content cites `docs.vllm.ai/en/v0.33.0/`.
  - The reference traces are pinned to this version, so the pin never moves mid-quarter.
  - The first quarterly re-pin falls about 2027-02 [estimated].
- **Revisit when:** every quarter, through the upstream watcher (W3-T06), or when the driver gate fails.

### D-036 · Build process

- **Status:** proposed.
- **Decision:**
  - Four waves.
  - Tasks are sized S, M or L. Each is one PR, executable by a Sonnet agent in isolation from the task text and the docs it names.
  - Each wave ends with an Opus review.
  - Each wave branch stacks on the previous unmerged one, and the owner merges.
- **Context:** The owner's working pattern for kernelspace's waves: Sonnet for granular tasks, Opus for architecture and whole-wave review, stacked PRs merged by the owner, and just-in-time verification rather than repeated full sweeps.
- **Alternatives:** statespace's tracker with owner-review hours per task, which is heavier [design].
- **Consequences:** TRACKER.md's format and its shared agent brief.
- **Revisit when:** the owner changes the working pattern.

### D-037 · Keep ships in W1

- **Status:** proposed.
- **Decision:** Today, the spaced review of earned KCs, ships with W1 on kernelspace's vendored FSRS (a transcription of ts-fsrs 5.4.2's memory model, checked against recorded vectors).
- **Context:** Catalog §7 requires every module to run Predict → Play → Build → Prove → Keep.
- **Alternatives:** defer Keep to W3, which would leave W1's modules without their loop [design].
- **Consequences:** W1-T05.
- **Revisit when:** ASSESSMENT.md changes the Keep design.

### D-038 · Front-page runs are practice

- **Status:** proposed.
- **Decision:** The front page's game runs at a fixed practice seed and writes nothing to the ledger; ASSESSMENT.md §3.1 chose nothing over a `practice` event. Credit needs a graded run on a fresh seed.
- **Context:** PRODUCT.md: "Clicks earn nothing."
- **Consequences:** The poster, the first paint and the challenge are the same for every visitor and deterministic for screenshots.

### D-039 · Placing the GPU parts of the W1 modules

- **Status:** proposed.
- **Decision:** W1 ships the browser parts of TR1, TR6 and TR8. Their GPU artifacts (TR1's nano-vllm fork, TR6's proposer and TR8's BurstGPT replay) ship in W2 with the grader.
- **Context:** D-002 says the no-GPU modules ship first. Catalog §3.5 gives TR1, TR6 and TR8 one F-lane artifact each.
- **Consequences:** A W1 module page lists its F artifact as "arrives with the grader".

### D-040 · The 2026-10-24 pre-build gates

- **Status:** proposed; the owner confirms (O-7).
- **Decision:**
  - The 8 h TR2 spike named by the 2026-10-24 next-build tie-break becomes the acceptance of W0-T13, the step-loop model. If it fails, W0 stops and the owner is asked.
  - The opt-in pick form is not a gate for this repo, because the owner decided on 2026-11-03 to build.
- **Context:** The tie-break's session record (2026-10-24) put two gates before any build: ship the pick form, then run the TR2 spike. kernelspace's `SPECIALIZATIONS.md` §9 still lists Fleet Ops first and its n ≥ 30 demand gate.
- **Consequences:** No W0 task waits for demand data.

### D-041 · Dispatch keys follow the pinned default runner

- **Status:** proposed.
- **Decision:**
  - TR2, The Loop's `keys` level and `packages/sim/steploop` teach CUDA-graph dispatch keys as data for each runner.
  - MRV2's 7-field `BatchExecutionDescriptor` is the default runner's key: `cg_mode`, `num_tokens`, `num_reqs`, `uniform_token_count`, `max_query_len`, `num_active_loras`, `num_ubatches`.
  - MRV1's `BatchDescriptor`, which holds `has_lora`, is taught as the legacy example.
  - The published design doc's 4-field tuple is shown as stale.
- **Context:**
  - The catalog says TR2 teaches "CUDA-graph modes and their dispatch keys (`has_lora` among them)".
  - At v0.33.0 `has_lora` sits only on the MRV1 path, and MRV2 has been the default for all models since v0.29.0 [measured 2026-11-03; vllm M1, G3-G5].
  - SGLang keys its graphs by padded batch size or token count from bucket lists (sglang G2).
- **Alternatives:** teach `has_lora` as the catalog wrote it, which is true only of the legacy runner [design].
- **Consequences:**
  - The claims for W1-T01 and W1-T12.
  - The In-production card for The Loop's `keys` level shows both engines' keys.
- **Revisit when:** a re-pin changes the descriptor.

### D-042 · Adapter pages are the learner's design

- **Status:** proposed.
- **Decision:**
  - TR5a and The Pool teach one page pool shared by KV groups and adapters as S-LoRA's design, which the learner builds in `hybrid-kv`.
  - Every In-production card and lesson says that at the pins vLLM keeps adapters in `max_loras` GPU slots, with a CPU LRU and an admission cap on distinct adapters, and that SGLang uses a fixed-slot `LoRAMemoryPool`.
  - The learner's allocator is measured against that slot baseline.
- **Context:** The catalog's TR5a line, "adapter pages in the same pool (S-LoRA)", reads as an upstream mechanism. Neither engine pages adapters in the KV pool at the pins [measured 2026-11-03; vllm K4, sglang X6].
- **Alternatives:** drop adapter paging from TR5a [design]. That would lose lab 02's `adapter_unified_paging` continuity, which the catalog builds on.
- **Consequences:** The claims for W1-T01, and the content of W1-T21 to W1-T25.
- **Revisit when:** an engine ships adapter paging in its KV pool.

---

## Proposed by the design review, 2026-11-03

Each record settles a contradiction between two design files that a build task would otherwise hit. Each takes the default the files already named where one existed.

### D-043 · The front page plays "First loop"

- **Status:** proposed; the owner confirms it with O-11.
- **Decision:**
  - The front page runs GAMES.md §3.1's "First loop" (levels `first-1-fill` to `first-4-par`). The visitor places waiting requests into a tray of 4 slots by hand, refills a slot when a request stops (continuous batching), and turns on overlap (async scheduling). The last beat is a seeded burst of 12 requests against par in synthetic ticks, whose band makes both levers necessary (the slot and request counts are level parameters [estimated]).
  - CUDA graphs, capture sizes and dispatch keys stay in TR2's levels of the same game.
- **Context:** ARCHITECTURE §6.11 and TRACKER W0-T16 had three levers (async scheduling, CUDA graphs and a batch cap) and a win at a GPU-busy bar. GAMES.md §3.1 has manual admission, refill and overlap, because its brief asks the visitor to schedule a batch and learn continuous batching and overlap (GAMES.md §13, item 1; PLAN.md Q-3). One idea in a 60-120 s run [estimated] is easier to land than three, and the same session continues into TR2.
- **Alternatives:** ARCHITECTURE's three levers [design]; a non-interactive demo, which D-004 rules out.
- **Consequences:** ARCHITECTURE §6.11 and TRACKER W0-T16 follow GAMES.md §3.1. W0-T16's session carries the synthetic tick card and manual admission (GAMES.md §3, "Simulation API").
- **Revisit when:** the owner answers O-11, or the front-page run fails its band or the nightly LCP gate.

### D-044 · S5's per-sequence host term runs on the CPU lane

- **Status:** proposed; the owner confirms it before W1-T12.
- **Decision:**
  - On the "70B on H100" cost card, the GPU lane takes S5's step time minus `seqs × t_seq`, and t_seq goes on the CPU lane as the per-sequence host work, where async scheduling can hide it.
  - On that card t_seq replaces the host card's per-sequence schedule and sample phases, so no host work is counted twice. The host card's other phases are added and stay [estimated] until W2-T22 fits them.
  - The card says that hiding t_seq under the forward is an extrapolation beyond S5's additive fit, and W2-T22 checks it against the owner's H100 trace.
- **Context:** ARCHITECTURE §5.3 took the GPU step from S5's `us`, which already includes `seqs × t_seq` ("host work per running sequence per step" in S5's types), and then added the host card's per-sequence phases on the CPU lane (GAMES.md §13, item 2; WORLD §2.11; PLAN.md Q-2, whose default this is). S5 fitted vLLM 0.10.2, before async scheduling became the default in v0.14.0 (vllm M6); whether its harness ran with async scheduling is [unverified].
- **Alternatives:** keep t_seq inside the GPU step as S5 fitted it, which leaves async scheduling nothing to hide on the 70B card [design].
- **Consequences:** ARCHITECTURE §5.3, WORLD §2.11 and §4.4, TR2 §1, GAMES.md §3.2, and W1-T12's goldens.
- **Revisit when:** W2-T22's fit, or the owner's H100 trace shows that the per-sequence host work does not overlap the forward.

### D-045 · One page size in the KV pool

- **Status:** proposed.
- **Decision:**
  - `packages/sim/kv`, The Pool and the `hybrid-kv` lab use one page size in bytes for the whole pool.
  - KV groups reach it as vLLM's hybrid manager does at the pin: layers are grouped, layers are padded, or the attention block is inflated, so each group's block is exactly one page (vllm K2; the design doc's cases, vllm TR5a notes). A preset reports the padding waste this costs.
  - Adapters follow S-LoRA: an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages of the same pool, stored non-contiguously.
  - ARCHITECTURE §5.4's mixed `pageUnits` is dropped.
- **Context:** A§5.4 let one page hold blocks of different sizes. That is neither vLLM's design for KV groups nor S-LoRA's (GAMES.md §13, item 4; WORLD §10, item 3; TR5a §11, item 1), and it had to be settled before W1-T21.
- **Alternatives:** mixed page units, which would teach a pool that no engine uses at the pins [design].
- **Consequences:** A§5.4's types; W1-T21 and W1-T22; The Pool's `same-size` and `state` levels; TR5a's lesson `tr5a.l2`.
- **Revisit when:** a re-pinned engine stops unifying page sizes across KV groups.

### D-046 · Tie-aware same-machine identity

- **Status:** proposed.
- **Decision:** Where a stage compares two runs on one machine at temperature 0 (TR1's instrumented fork against the plain one, and TR6's speculative against plain outputs), it uses ASSESSMENT §5.7's tie-aware identity. A sequence passes if it is identical, or if its first mismatch falls at a near tie, where the first run's top-2 log-probability gap is at most 0.05 nats [estimated]. At most 5% of sequences may tie-diverge [estimated]. Strict token identity is dropped from ARCHITECTURE §8.5 and §9.6.
- **Context:** Different batch shapes can flip a near tie in an honest run (D-028's context). ASSESSMENT §5.7 and §14 (item 2), PLAN.md Q-7 and TR6 §11 (item 2) asked for the change.
- **Alternatives:** strict token identity, which fails honest runs [design]; teacher-forced agreement alone, which cannot show on one machine that instrumentation or speculation changed nothing [design].
- **Consequences:** ARCHITECTURE §8.5 rule 7 and §9.6; TRACKER W2-T34 and W2-T35; GAMES.md §10's GPU lane.
- **Revisit when:** W2-T12's fixtures measure honest divergence rates.

---

## Open owner questions

| # | Question | Default until answered | Needed by |
|---|---|---|---|
| O-1 | The custom domain | `praveer13.github.io/enginespace/`, with `VITE_BASE=/enginespace/` | W3-T16 (launch) |
| O-2 | When the repo goes public. GitHub Pages on a private repository needs a paid GitHub plan [unverified, 2026-11-03]. | Private, with the Pages plan to be confirmed by the owner | W0-T04 (deploy job) |
| O-3 | The content licence, and the code licence | kernelspace's pair: MIT for code, CC BY 4.0 for content. Nothing is published until decided. | W3-T15 |
| O-4 | Confirm the edition-1 pins (D-035), including the R580 driver gate on the owner's GPUs and on the rental hosts | vLLM v0.33.0 (v0.32.0 if the gate fails), SGLang v0.5.23 | W1-T02 |
| O-5 | Reference traces: which GPUs, how many, and the owner's GPU spend | 6-10 traces on a 4090 and an H100 [estimated], as the catalog's TR3 artifact says | W2-T21 |
| O-6 | The capstone's three commit pairs with a known delta | none; the capstone waits | W3-T01 |
| O-7 | Whether the 2026-10-24 pick-form gate still applies (D-040) | It does not gate this repo | W0-T24 |
| O-8 | Owner review capacity per week for W0-W3 | kernelspace's 10 h/week cap (PLAN-100X OD11) | W0-T24 |
| O-9 | The reference laptop and phone for frame-time checks | The owner's own devices, named in W0-T24's record | W0-T24 |
| O-10 | Whether grader-attested correctness counts at full weight. ASSESSMENT.md owns this; it is listed here because it is the owner's call. | Full weight when every browser-runnable check also passes | W2-T08 |
| O-11 | Whether D-004 is met by a front page that is playable in 2D from the first paint and becomes 3D within seconds on a capable device (D-023) | Yes | W0-T18 |

## Course-design questions

Q-1 to Q-8 come from [PLAN.md](PLAN.md) §14, and Q-9 to Q-12 from ASSESSMENT.md §14 and GAMES.md §15. Three are now proposed decisions; the rest stay open with their defaults.

| # | Question | Default until answered | Status | Needed by |
|---|---|---|---|---|
| Q-1 | Are H100 stages required for module completion (TR4's s4, an H100 target in TR7, an H100 side in the capstone)? | No: they earn their own KCs at full weight, and completion never requires renting an H100 | open, owner | W2-T26 |
| Q-2 | Where does S5's host term t_seq go? | The CPU lane, labelled an extrapolation | proposed as D-044 | W1-T12 |
| Q-3 | The front page's levers | GAMES.md §3.1's manual batching and overlap | proposed as D-043 | W0-T16 |
| Q-4 | Does a flag pair at one vLLM version count as a "pinned commit pair" for the capstone? | Yes, if the owner agrees | open, owner | W3-T01 |
| Q-5 | Is a `proved` event required for a module to count as complete (ASSESSMENT §9)? | Yes | open, owner | W1-T06 |
| Q-6 | Are AMD (ROCm), Apple and other non-NVIDIA GPUs out of scope for edition 1? | Yes | open, owner | W2-T04 |
| Q-7 | Tie-aware identity in place of strict token identity | Tie-aware | proposed as D-046 | W2-T35 |
| Q-8 | If no flash-attn build installs for nano-vllm on torch 2.14 and CUDA 13 (vllm U3), is Mini-SGLang TR1's fork target? | Yes | open; W2-T34 tests the install | W2-T34 |
| Q-9 | `gpu-verified` and `gpu-unverified` also cover the L lane (TR0 runs on a CPU). Rename them `receipt-verified` and `receipt-unverified`? | Keep the names; ASSESSMENT §2 says the L lane uses them | open; ARCHITECTURE §7.3 owns the names | W0-T10 |
| Q-10 | Who runs the dispatcher golden-table script at the pinned vLLM tag, and on what host (GAMES.md §15, question 3)? | The owner, on a CPU, as part of W1-T12's acceptance; whether a CPU-only run is enough is [unverified] | open, owner | W1-T12 |
| Q-11 | Keep Dispatch (TR4) as a game, or fold it into plain items (GAMES.md §7)? | Keep it; it drops without loss if the owner prefers items | open, owner | W2-T25 |
| Q-12 | Run a pre-registered, opt-in, on-device comparison of one flagship's 3D view against its 2D view in W3 (D-005's revisit)? | Not scheduled; TRACKER has no task for it | open, owner | W3 |
