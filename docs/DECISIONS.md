# enginespace: decision log

**Status:** D-001 to D-006 are the owner's decisions of 2026-11-03. D-007 to D-013 restate the product record the owner confirmed the same day (`PRODUCT.md`). D-014 to D-042 are **proposed** by [ARCHITECTURE.md](ARCHITECTURE.md) and wait for the owner's review. D-043 to D-046 are **proposed** by the design review of 2026-11-03, which settled contradictions between the design files; they wait for the owner too. D-047 records the visual world the owner chose on 2026-11-03, and D-048 and D-049 are **proposed** by the art direction that followed it. D-050 is **proposed** by the design system's build (W0-T05), D-051 by the settings page (W0-T22), and D-052 by the W0 wave PR. The W0 exit review (W0-T24, 2026-11-04) froze D-023's budgets, recorded D-040's spike result and D-047's finish verdict, and carried O-7, O-8 and O-9 over; its record is [docs/waves/W0-report.md](waves/W0-report.md). The open owner questions, O-1 to O-11, and the course-design questions, Q-1 to Q-12, are at the end. **Date:** 2026-11-03, updated 2026-11-04.

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
| D-006 | The visual identity is chosen separately; the architecture and backlog choose no colours, fonts or visual style. | owner-decided 2026-11-03; superseded in part by D-047 |
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
| D-023 | A first-paint JavaScript budget, and a front page that paints a 2D step loop first and upgrades to 3D after LCP. | proposed; budgets frozen 2026-11-04 (W0-T24) |
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
| D-040 | The 2026-10-24 pre-build gates: the TR2 spike becomes W0-T13's acceptance; the pick form is not a gate for this repo unless the owner says otherwise (O-7). | proposed; the spike passed (W0-T13, recorded 2026-11-04) |
| D-041 | Dispatch keys follow the pinned default runner, MRV2's `BatchExecutionDescriptor`; `has_lora` is taught as MRV1's legacy key. This corrects the catalog. | proposed |
| D-042 | Adapter pages in the KV pool are taught as S-LoRA's design, built by the learner. Upstream vLLM and SGLang use adapter slots at the pins. This corrects the catalog's framing. | proposed |
| D-043 | The front page plays GAMES.md §3.1's "First loop": the visitor batches requests by hand, refills, and turns on overlap; CUDA graphs stay in TR2's levels. | proposed (design review); the owner confirms with O-11 |
| D-044 | On the "70B on H100" card, S5's per-sequence host term t_seq runs on the CPU lane, not inside the GPU step, so host work is counted once; hiding it is labelled an extrapolation. | proposed (design review); the owner confirms |
| D-045 | The KV pool has one page size: KV groups unify to it as vLLM's hybrid manager does, and adapters take S-LoRA's page count. ARCHITECTURE §5.4's mixed `pageUnits` is dropped. | proposed (design review) |
| D-046 | Same-machine output comparisons (TR1's instrumented fork, TR6's speculative runs) use ASSESSMENT §5.7's tie-aware identity, not strict token identity. | proposed (design review) |
| D-047 | The visual identity is The Pass, a restaurant line kitchen and its expo pass. The direction contract in the front page's surface brief sets token values, faces and scene materials, and DESIGN.md is written from the built world at the end of W0. | owner-decided 2026-11-03; finish verdict `fix` on 2026-11-04 (W0-T25), with the owner |
| D-048 | The front page runs on GAMES.md's synthetic ticks and prints them as ticks, labelled synthetic. µs on the model's clock start with TR2's levels (W1-T13). | proposed (art direction) |
| D-049 | Every game gets an in-world display name in kitchen vocabulary, with its engine concept as a subtitle. Ids stay as they are. | proposed (art direction) |
| D-050 | The design system ships one light scheme, the line under its tubes, with a more-contrast variant and no dark scheme. Its faces are Big Shoulders Display, Doto (with Handjet's µ and ±), Permanent Marker, Atkinson Hyperlegible and Atkinson Hyperlegible Mono, self-hosted from Fontsource 5.3.0 and pinned by SHA-256. | proposed (W0-T05) |
| D-051 | A learner's settings are recorded in the ledger's `working` store, one key each, and a copy in `localStorage` lets every page honour them from its first paint without opening the ledger. | proposed (W0-T22) |
| D-052 | The nightly workflow runs on its schedule only when the repository variable `NIGHTLY_ENABLED` is `'true'`; a run started by hand always runs. | proposed (W0 wave PR) |

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

- **Status:** owner-decided 2026-11-03. Superseded in part by D-047 (2026-11-03): the "no visual choices yet" phase ends, and token values, faces and scene materials follow The Pass's direction contract.
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

- **Status:** proposed. Its budgets were frozen on 2026-11-04 by the W0 exit review (W0-T24), below.
- **Decision:**
  - The front page's static HTML holds the poster (an SVG of The Loop's first frame from the same layout code) and the heading.
  - The entry closure makes the 2D Loop playable.
  - The 3D chunks (three plus R3F at most 245 KB gz, the scene at most 40 KB gz) load after LCP.
  - The gates are: entry ≤ 110 KB gz; front-page first-paint closure ≤ 150 KB gz; LCP ≤ 2.5 s in the nightly mobile lab profile.
- **Context:**
  - kernelspace measured its three plus R3F chunk at 238-242.4 KB gz and its whole-app entry at 115.7 KB gz (its `verify-bundle.ts` and games-3d research).
  - Blocking first paint on a roughly 280 KB scene would make the "Play first" page slow on phones.
- **Alternatives:** 3D in the first paint, which is slow on phones; or a static image with a "Play" button, which is not play-first [design].
- **Consequences:**
  - ARCHITECTURE §6.10, §6.11 and §11.1. These budgets are [estimated] until W0-T24 freezes them here. W0-T20 built the gate (`verify:bundle`, `scripts/verify-bundle.ts`) and the nightly lab profile (`e2e/perf.spec.ts`), and measured the front page with them (below). The gates, the targets and the lab profile's parameters named below are A§11.1's [estimated] figures.
  - **How the gate counts.** A size is gzip by `gzipSync` at its default level under Bun 1.3.14, one file at a time, in KB of 1,000 B. That is a little above the sizes in Vite's log, which Node compresses [measured 2026-11-04 at 0786abb: the entry chunk is 37,316 B under Bun and 36,910 B under Node], and D-051's route figures are `gzip -9` of an earlier build, so they do not compare with these. The front page's closure row is JavaScript: the entry, the front page's chunk and the course index that its loader awaits, with their static imports. A§11.1 gives CSS a row of its own. Another route's row counts JavaScript and CSS together, and a scene's row counts its chunk, its CSS and the chunks that only 3D reaches.
  - **Measured 2026-11-04 at 5a69685** (the bundle is byte for byte the wave tip 0a5ccf2's, which the files of W0-T20 do not touch) [measured]:
    - the entry chunk is 37,316 B (gate 110 KB, target 100 KB);
    - the front page's first-paint JavaScript is 149,590 B (gate 150 KB, so 410 B under it; target 130 KB, so 19,590 B over it), its CSS is 15,185 B (gate 30 KB, target 20 KB), its document is 8,165 B and its three preloaded fonts are 35,748 B;
    - the other routes run from 114,905 B (`/today`) to 177,663 B (`/play/loop`, with its game), against 200 KB; `/settings` is 171,018 B, `/evidence` 163,816 B and `/design` 157,356 B;
    - `three-vendor` is 238,603 B (gate 245 KB), `scene-loop` 15,432 B (gate 40 KB), `postfx` 5,469 B (gate 25 KB) and the lesson JSON 1,994 B (gate 40 KB); the workers have no source yet;
    - the site is 2,067,796 B in 79 files.
  - **The lab profile, measured 2026-11-04 at 5a69685** with Chrome for Testing 149.0.7827.55 from Playwright's cache, on an i5-13600KF with 20 threads that other processes kept at a load of 13 to 17; the CPU 4× slower, 1.6 Mbit/s, 150 ms of round trip, 360 × 800 at 2× with touch, gzip over HTTP [measured]:
    - LCP is 888 ms, the median of three cold loads (888, 896 and 884 ms; gate 2,500 ms, target 1,500 ms). The heading is the largest paint, and 7 requests and 71.7 KB had come over the link by then;
    - CLS is 0 in all three loads, with the 3D pass swapped in at 4.3 to 5.5 s (gate 0.1);
    - INP is 152 ms, the median of three plays of 57 taps over the four levels (144, 152 and 176 ms; gate 200 ms, target 100 ms). In the middle play the longest interaction was 67 ms of input delay, 7 ms of handlers and 78 ms to present.
  - **For W0-T24.**
    - The front page's closure is 410 B under its gate, so any growth in the entry, the front page's chunks or what they share fails `verify:bundle`. If A§11.1's 150 KB meant JavaScript and CSS together, the closure is 164,775 B and 14,775 B over it.
    - INP is mostly input delay and presentation, not handlers. The flags decide how long a frame takes to present: with `--use-angle=swiftshader`, which composites through SwiftShader's GL, the same page read an INP of 400 to 600 ms [measured 2026-11-04 at 0a5ccf2: the GPU process in `SwapBuffers` for up to 450 ms while the main thread idled]. The lab profile uses `--enable-unsafe-swiftshader` alone, and any other spec that times something should too.
    - These are one machine's numbers. The nightly runner's first runs calibrate the gates before they freeze.
  - **Frozen by the W0 exit review (W0-T24), 2026-11-04.** Every gate and target of A§11.1 stands as written, and each stays [estimated] as a design target. From this date a change to one is a new record here, with the measurement that justifies it. `verify:bundle` and the lab profile measure them as W0-T20 built them ("How the gate counts", above), and [docs/waves/W0-report.md](waves/W0-report.md) §3 holds the figures at the wave's tip, `0512837` [measured 2026-11-04]. The review settled these points:
    - **The front page's first-paint closure is JavaScript.** A§6.10 lists only modules (the entry, the front route, the 2D Loop, the step-loop core and the content index), A§11.1's basis adds up JavaScript (React and ReactDOM, the router, the shell, the 2D game and the sim), and A§11.1 gives first-paint CSS a row of its own. At the tip the closure is 148,747 B, 1,253 B under its gate, and its CSS is 16,637 B [measured 2026-11-04 at 0512837]. The two together, 165,384 B, are printed without a verdict.
    - **The thin margin is a rule for W1.** A task that touches the entry, `src/front`, `packages/play/loop` or the code they share runs `verify:bundle` and states its delta in its PR. A change that must go over the gate comes here as a new record, never as a quiet raise. The router accounts for much of the squeeze: about 31 KB gz against A§11.1's 15 KB basis [derived by W0-T01, 2026-11-03].
    - **The entry row measures the entry's own file, as gated.** A§11.1 derived its 110 KB from kernelspace's entry, which carried React. Here React, ReactDOM and the stores sit in `react-vendor`, so the entry file is 37,331 B while its static closure is 99,559 B [measured 2026-11-04 at 0512837]. The closure rows contain it, so nothing grows unchecked. The review recommends moving the 110 KB gate onto the entry's static closure, which changes only that row of `verify:bundle` (the report, §8).
    - **`postfx` stays at 25 KB, so tier 3 antialiases with FXAA.** three's `SMAAPass` alone is 35,631 B gz [measured 2026-11-04 by W0-T15, `gzip -9`], so `src/scene/tiers.ts` uses FXAA at T3 in place of A§6.6's SMAA. A§6.6's row is to follow.
    - **Not measured at the freeze:** the two workers, which have no source yet; frame time p95 on the reference laptop and phone, the first 3D frame and post-processing GPU time, which are by hand on devices that O-9 has not named; GPU memory per scene, since `renderer.info` counts objects, not bytes; and main-thread tasks over 50 ms during play, which need the nightly trace.
    - **The lab gates are one desktop's numbers:** LCP 896 ms, INP 120 ms and CLS 0 at `0512837` [measured 2026-11-04]. If the nightly runner misses a gate that this host meets, look at the profile first (its flags, the runner's cores), and record what changes here.
- **Revisit when:** a change must take a budget over its gate; the first three nightly lab-profile runs on GitHub's runner have reported; or the owner names the reference devices (O-9), which turns the by-hand targets into checks. Until 2026-11-04 the trigger was "W0-T24 has measured the budgets".

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
  - TR5b owns a minimal KV connector contract and event schema, `kv-events@1`, mirroring the pinned vLLM version's KV event shapes. W1-T01 read them at v0.33.0 on 2026-11-04 (claims `vllm.kv-events.*`; ARCHITECTURE §5.4 lists the fields), and both engines already carry the adapter, as `lora_name`.
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

- **Status:** proposed; the owner confirms (O-7). The spike passed on 2026-11-04 (below).
- **Decision:**
  - The 8 h TR2 spike named by the 2026-10-24 next-build tie-break becomes the acceptance of W0-T13, the step-loop model. If it fails, W0 stops and the owner is asked.
  - The opt-in pick form is not a gate for this repo, because the owner decided on 2026-11-03 to build.
- **Context:** The tie-break's session record (2026-10-24) put two gates before any build: ship the pick form, then run the TR2 spike. kernelspace's `SPECIALIZATIONS.md` §9 still lists Fleet Ops first and its n ≥ 30 demand gate.
- **Consequences:** No W0 task waits for demand data.
- **Outcome, 2026-11-04 (W0-T13; recorded by W0-T24).** The spike passed. W0-T13 met all five of its checks, so its sixth, "stop and report to the owner", never fired, and no W0 task builds on a workaround. At the wave's tip, `0512837`, the evidence still holds [measured 2026-11-04, Bun 1.3.14 on the dev host]:
  - the 87 tests of `tests/sim/steploop*.test.ts` pass, and the golden vectors reproduce byte for byte;
  - a 100-step run of 64 requests takes 2.75 to 2.90 ms on a fresh process's first call and about 0.5 ms warm, against the 20 ms bound.
  The front page's levels run on the model, and `verify:games` finds 40% of the first 400 seeds in `first-4-par`'s band [measured 2026-11-04 at 0512837]. The pick form's half of this record still waits on O-7. The W0 report has the detail ([docs/waves/W0-report.md](waves/W0-report.md) §5).

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

## The art direction, 2026-11-03

D-047 is the owner's choice of visual world. D-048 and D-049 follow from it: one settles a clash the choice exposed, and the other names the games in the new world.

### D-047 · The visual identity is The Pass

- **Status:** owner-decided 2026-11-03, in impeccable's direction round (seed reference `seed:631f6361e61b6b7b`).
- **Decision:**
  - The course's visual world is The Pass, a restaurant line kitchen and its expo pass. Continuous batching is a line kitchen, and the learner is the expediter who fires each step.
  - The direction contract recorded in the front page's surface brief, `.impeccable/surfaces/src-front-frontpage-tsx.md` (its "Direction contract" section), is the authority on the world: its materials, its type voices and the front page's first viewport. Token values, faces and scene materials follow it.
  - DESIGN.md and `.impeccable/design.json` are written at the end of W0 by impeccable's documenter, from the built world (W0-T25). So W0-T06 no longer waits for DESIGN.md: it merges into W0-T05, and no W0 task waits for DESIGN.md.
- **Context:**
  - D-006 kept the architecture and backlog free of visual choices while the identity was chosen separately. W0-T05 was to wire placeholder values (CSS system colours and system font stacks), and W0-T06 was blocked until DESIGN.md landed.
  - On 2026-11-03 impeccable ran its direction round for the front page, a Persuade surface. The owner chose The Pass, impeccable's own pick and the first candidate on its ordered list, over the direction the roll assigned (the surface brief, FORM).
  - For a new world, impeccable writes DESIGN.md only at the finish, from what was built: a rulebook written before the build "gets defended against reality instead of describing it" (impeccable `reference/new-work.md` §5).
  - No comp exists for this direction, so the build is code-led. The contract's FIRST VIEWPORT and its signature interaction carry the ambition, and the finish review audits them in behaviour (new-work §6 and §7).
- **Alternatives:**
  - the roll's assigned direction, Race Control (motorsport live-timing graphics), and the six catalog worlds the round declined, all from the round's hand of 2026-11-03 (impeccable's local state, not committed);
  - the category standard, a dark GPU-render landing page over a row of feature cards, which the contract's THESIS refuses.
- **Consequences:**
  - It supersedes D-006's "no visual choices yet". ARCHITECTURE, GAMES.md and TRACKER still pick no colour or face; the design system does, from the contract.
  - W0-T05 and W0-T06 merge into W0-T05: the design system applies The Pass's values directly, with no placeholder phase, and `verify:tokens` fails on any placeholder.
  - W0-T25, "Finish review and DESIGN.md (impeccable)", runs between W0-T21 and W0-T24. It discharges the contract's FINISH line: the finish review, its verdict, DESIGN.md, and provenance for every shipping raster.
  - GAMES.md §2.6 carries the world into every game. D-048 sets the front page's clock, and D-049 names the games.
  - The agent brief's "Look" rule (TRACKER) now points at the token roles and components in `src/design` and at GAMES.md §2.6.
  - Where an earlier text still says that DESIGN.md decides a look (D-019's restated test 5, A§6.2's test 5, A§6.5's bloom, A§14's font and icon packages), read: the contract decides, W0-T05 applies it, and W0-T25 documents it in DESIGN.md.
  - The contract stays in the surface brief. It never enters source, comments or any shipped file (new-work §5), and W0-T05 adds a test for that.
- **Finish, 2026-11-04 (W0-T25; recorded by W0-T24).** impeccable's finish review of the front page ran three times: one full review, then a verdict pass after each of two fix rounds, which is the limit for an unattended finish.
  - **The verdict.** The final disposition is `fix`, in the reviewer's own word, at its scope: the front page at 1440 and 390 px.
  - **Its open findings.** Two stay open. The 2D view's wells still read as a lane chart, and no fired 2D state was captured (its fix 5). The detector's record named no scanned path (its fix 8), which the W0 report's §6.5 now answers.
  - **Two more, outside its captures.** W0-T24 confirmed both in the built site. The front page's overlap switch lights its pilot lamp in board green when it is on, and the game page's 2D view lights "The line" in the GPU lane's green. Each is a code colour marking a state, against DESIGN.md's One Lamp rule.
  - **DESIGN.md.** DESIGN.md and `.impeccable/design.json` were written from the built world (`3e9d078`), and they leave both lights out of the rules.
  - **What waits on the owner.** W0-T25's first check, "ship, or the owner chose to ship with the open findings listed", waits on the owner ([docs/waves/W0-report.md](waves/W0-report.md) §6).
- **Revisit when:** the finish review returns `rebuild` twice, or the owner changes the world.

### D-048 · The front page's clock is synthetic ticks

- **Status:** proposed (art direction, 2026-11-03).
- **Decision:**
  - The front page runs on GAMES.md §3.1's synthetic tick card and prints its clock in ticks, labelled synthetic. The printer tape shows the step number, the ticks the step took and the stations busy. No µs figure appears on the front page.
  - µs on the model's clock appear from TR2's levels onward (W1-T13), where `steploop` runs its cost cards in integer µs (GAMES.md §3.2).
  - This settles the critic's open item on the front page's clock.
- **Context:**
  - The direction contract's FIRST VIEWPORT had the printer tape show microseconds per step. GAMES.md §3.1, A§6.11 and W0-T16 run the front page on synthetic ticks, and D-012 requires demonstration data to be labelled synthetic. The critic's review of the direction left the clash open.
  - The tick card has no scale to µs, so a µs figure on the front page would be invented. The round's own card for The Pass named the risk: kitchen time runs in minutes, so microseconds would have to ride on the printer's timestamps.
- **Alternatives:**
  - µs on the front page through a tick-to-µs scale [design]: an invented number in front of every visitor;
  - the "70B on H100" card's µs on the front page [design]: it would bring TR2's cost cards and their [estimated] host terms into a run that D-043 keeps to one idea;
  - no clock on the tape [design]: it would lose the arithmetic the run teaches, a step of 7 ticks without overlap against 4 with it (synthetic; GAMES.md §3.1).
- **Consequences:**
  - The surface brief's FIRST VIEWPORT now reads ticks, labelled synthetic.
  - W0-T16's counters and mirror and W0-T18's page copy show ticks with the synthetic label. W0-T05's `Readout` component carries the label.
  - W1-T13 switches the tape to µs on the model's clock for TR2's levels, with each cost card's tags.
- **Revisit when:** the owner's reference traces (W2-T21) give a measured anchor the front page could show honestly, or the owner asks for µs there.

### D-049 · Every game has an in-world display name

- **Status:** proposed (art direction, 2026-11-03).
- **Decision:**
  - Every game gets a display name in kitchen vocabulary, shown over its engine concept as a subtitle:

    | Id | Display name | Subtitle | Working name |
    |---|---|---|---|
    | `loop` | Service | the step loop | The Loop |
    | `shape-shifter` | Sheet Pan | tensor views and copies | Shape Shifter |
    | `engine-floor` | Back of House | a request's lifecycle | The Engine Floor |
    | `gap-hunt` | The Tape | trace attribution | Gap Hunt |
    | `dispatch` | Line Check | attention backend selection | Dispatch |
    | `pool` | The Reach-In | hybrid KV pages and adapters | The Pool |
    | `switchyard` | The Dumbwaiter | KV offload, connector and events | The Switchyard |
    | `verifier` | The Tasting | speculative decoding's verifier | The Verifier |
    | `broken-bench` | The Inspection | benchmark methodology | Broken Bench |

  - Ids stay as they are: game ids, level ids, actions, ledger refs, KCs, claims, routes and file names.
  - The working names stay as the design docs' shorthand. On screen, the display name leads, over its subtitle, and the working name is not shown.
- **Context:** In D-047's world the front page's game is a service, and the surface brief's Unresolved list asked for its name to change to match. The working names were chosen before the world was. Three of them carry metaphors the kitchen would contradict: a railway yard, an engine-room floor and a courtroom. The learner must still leave with the engine's terms, so the concept rides along as a subtitle.
- **Alternatives:**
  - keep the working names [design]: three metaphors that fight the kitchen;
  - rename the ids [design]: game and level ids sit in URLs (`/play/<id>`), in ledger refs (`play:<game>/<level>`, A§4.5) and in action logs, so renaming them would churn stored evidence for no learner gain;
  - kitchen names with no subtitle [design]: the learner would remember the kitchen and not the engine.
- **Consequences:**
  - GAMES.md §0 gains a display-name column, and §2.6 gives each game's kitchen objects, cameras and materials.
  - ARCHITECTURE §6.1 and TRACKER's game tasks carry the display names.
  - W0-T14's registry records each game's display name and subtitle, and `verify:games` fails a game without them.
  - Copy pairs the two vocabularies: the kitchen word names the object, and the engine term names the concept. The engine term leads wherever the learner will meet it again (GAMES.md §2.6).
- **Revisit when:** a learner test shows that a display name misleads about its concept, or the owner renames a game.

---

## The design system, 2026-11-03

D-050 records what W0-T05 decided while applying D-047's contract: the colour schemes the system ships, and the faces.

### D-050 · One light scheme, and the faces of The Pass

- **Status:** proposed (W0-T05, 2026-11-03).
- **Decision:**
  - **One light scheme.** The system ships the scene the contract describes, a bright line under fluorescent tubes and heat lamps, and its `prefers-contrast: more` variant, which darkens the quiet text, the edges and the lamp's filament. It ships no dark scheme. Every declared pair meets ARCHITECTURE §11.2 in both schemes (`verify:tokens`).
  - **The faces,** one per object of the kitchen:

    | Role | Face | The object |
    |---|---|---|
    | display, heading | Big Shoulders Display, weight 800 | stamped equipment plates and signage: a heavy condensed grotesk |
    | numeric, ticket | Doto, instanced with round dots at weight 900; Handjet for the two glyphs Doto lacks, µ and ± | the kitchen printer's impact dot matrix |
    | label | Permanent Marker | marker on masking tape |
    | body | Atkinson Hyperlegible, 400 and 700, upright and italic | long reading, in a face drawn for legibility that tells l, I and 1 and O and 0 apart |
    | mono | Atkinson Hyperlegible Mono | code and identifiers |

  - **Self-hosted, pinned, and not dependencies.** Each file was fetched once, on 2026-11-03, from a Fontsource npm package at version 5.3.0 through its jsDelivr mirror, with a generic User-Agent, in its Latin subset. `public/fonts/fonts.json` pins every file and its source by SHA-256. Doto and Handjet are Modified Versions made with fontTools 4.60.1 (the transforms are in `fonts.json`, and they rebuild byte for byte under `SOURCE_DATE_EPOCH`). No font package enters `package.json`, so ARCHITECTURE §14 gains no row. The nine files weigh 138,188 bytes in all [measured 2026-11-03, from the byte counts `fonts.json` pins]; a page downloads only the faces it sets.
  - **The licences:** SIL Open Font License 1.1 for all but Permanent Marker, which is under the Apache License 2.0. Each licence file sits beside its face in `public/fonts/`, and NOTICE carries each one.
- **Context:**
  - D-047's contract names the materials and the type voices, and its surface brief left the exact faces to the build ("chosen at build time"). W0-T05 asked whether a dark scheme earns its place, and to record why if not.
  - The physical scene decides light or dark (impeccable `reference/new-work.md` §4): the learner looks at a bright line, steel under tubes, white tickets under heat lamps. A dark kitchen is a different place, after service with the lights down, not this one dimmed.
  - Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono have no micro sign (U+00B5) [measured 2026-11-03, from the character maps of their Fontsource 5.3.0 Latin files]. The course writes µs in nearly every lesson, so the reading face is the original Atkinson Hyperlegible, which has it. Doto has no µ or ± either, so an 824-byte subset of Handjet [measured 2026-11-03, `fonts.json`], another dot-matrix face, carries those two glyphs under `unicode-range` and the numerals stay in dots.
- **Alternatives:**
  - a dark scheme [design]: it would double every declared pair and every scene material, and invent a second world the contract does not describe. WCAG 2.2 AA asks for contrast, not a dark mode, and readers who set `prefers-contrast: more` get the darker variant;
  - for the display face, the category's condensed defaults (Anton, Oswald, Bebas Neue) and four more grotesks weighed side by side (Sofia Sans Extra Condensed, Barlow Condensed, League Gothic, Antonio) [design]: Big Shoulders Display reads most like a stamped plate at 800;
  - for the dots, Handjet alone, which is more legible small but reads as an inkjet coder or an LCD rather than an impact printer, and Bitcount, which is a pixel face, not dots [design];
  - for the marker, Shantell Sans, Kalam, Gochi Hand and Just Another Hand [design]: Permanent Marker is the felt-tip capitals of a prep label;
  - for reading, Atkinson Hyperlegible Next (no µ), Public Sans and Libre Franklin [design].
- **Consequences:**
  - `src/design/tokens.ts` carries the roles and values, `tokens.css` is generated from it, and `verify:tokens` fails on a placeholder, on drift between the two, on a font role that does not start with a self-hosted face, and on a pair below its threshold.
  - Doto prints a period as a block of four dots, as a dot-matrix printer does. A Readout prints at 15 px or larger [estimated], so a decimal point reads as one.
  - `useSceneTokens()` re-reads on `prefers-color-scheme` as the tracker asks, though no scheme answers it yet.
  - W0-T25 documents these faces and schemes in DESIGN.md.
- **Revisit when:** the owner asks for a dark scheme; a learner test shows the dot-matrix numerals misread; or a pinned face's licence or source changes.

---

## The settings, 2026-11-04

D-051 records how W0-T22 keeps the learner's settings, which A§7.1 puts in `working` and D-038 keeps the front page from reading.

### D-051 · Settings are recorded in `working`, with a copy in localStorage for the first paint

- **Status:** proposed (W0-T22, 2026-11-04).
- **Decision:**
  - **The record.** Each setting is one `working` record (A§7.1): `settings:3d`, `settings:tier-cap`, `settings:reduced-motion` and `settings:game-keys`. A setting that was never chosen has no record and takes its default. A record that is missing, from another build or edited by hand is read as the default, and never stops a page from drawing.
  - **The copy.** The same choices sit in `localStorage` under `es:settings`, so that every page can read them synchronously, before it opens the ledger, and so that a change made in one tab reaches the others through the `storage` event. It is a cache and never the record: the Settings page, which opens the ledger, takes `working` as the truth and rewrites the copy to match, and Reset erases both.
  - **The document.** The root's `data-motion` attribute carries the reduced-motion override (`reduce` or `full`, absent while the system decides). `tokens.css`, `base.css` and the scene tokens already obey it, and `src/main.tsx` sets it before the first render.
  - **The readers.** The Stage, the game shell and the device-tier hook read the settings themselves, so no game passes them on. A game's own asks (`prefer2d`, `tierCap`, `allow3d`, `shortcuts`) can only hold a view or a key back further than the learner's settings do.
  - **A fourth setting.** "Game keys" turns every game's keys off (WCAG 2.1.4; GAMES.md §2.3 says "Shortcuts can be turned off in Settings"). The tracker's list for `/settings` names three; the game shell's `shortcuts` prop and `useGameInput`'s `enabled` already waited for it.
- **Context:**
  - The front page writes nothing and never opens IndexedDB (D-038; `useEvidence` says so), and its first paint must not flash 3D or motion at a learner who turned them off (A§6.9; A§6.6, where "the learner chose 2D" is a T0 reason). So its first paint cannot read `working`, and the settings need a store that a page can read at once.
  - The site already keeps two per-viewer conveniences in browser storage, both behind `try`/`catch` (the reload-once flag and the count of lost WebGL contexts, in `sessionStorage`).
- **Alternatives:**
  - `working` alone, read when the ledger opens [design]: the front page would open IndexedDB for every visitor, which D-038 and the first-paint budget (D-023) avoid, and a learner who chose reduced motion would see one load's worth of animation on every page.
  - `localStorage` alone [design]: A§7.1 puts settings in `working`, where Reset, the ledger's tab sync and the schema guard already apply, and a copy alone has none of them.
  - A cookie [design]: nothing is served, so a cookie would only carry a setting to a server that does not exist, against D-009's "nothing collected".
- **Consequences:**
  - `src/settings/` holds the model, the store and the rules, `src/pages/Settings.tsx` writes both, and the Stage, the game shell and `useDeviceTier` (so every game and the front page) read the store. The entry carries the model and the store, which the first render needs, and grew by 1,005 B gz [measured 2026-11-04 with `gzip -9`: the entry chunk is 35,668 B at fac1415 and 36,673 B at bf46468]; the rules and the views load with the pages that use them. The routes that read the store stay under A§11.1's 200 KB gz for a route other than the front page, excluding 3D: `/settings` is 166,238 B, `/evidence` 159,080 B and `/design` 151,616 B (148,005 B at fac1415), each the entry's closure and the route's own static imports, JavaScript and CSS [measured 2026-11-04 with `gzip -9` at bf46468].
  - If the browser blocks site data, nothing persists anyway: IndexedDB falls back to memory (A§7.4) and `localStorage` is unreadable. A change then applies in the tab that made it until that tab reloads.
  - A change the ledger refuses (a tab that has gone read-only) is shown at its control and applied nowhere, so the record and the copy never part.
- **Revisit when:** the ledger can be read before the first paint at no cost, or a browser stops offering `localStorage` to a first-party page.

## The nightly schedule, 2026-11-04

D-052 records how the W0 wave PR keeps the nightly from spending Actions minutes while the repository is private (O-2).

### D-052 · The nightly runs on its schedule only when the owner turns it on

- **Status:** proposed (the W0 wave PR, 2026-11-04).
- **Decision:** every job of `nightly.yml` except `report` carries `if: ${{ github.event_name == 'workflow_dispatch' || vars.NIGHTLY_ENABLED == 'true' }}`. Until the owner sets the repository variable `NIGHTLY_ENABLED` to `'true'`, the 03:17 UTC schedule starts a run whose jobs are all skipped, and `report` files nothing because no job failed. A run started by hand from the Actions tab always runs every job.
- **Context:** the repository is private (O-2), so every run spends the account's Actions minutes. The `browsers` job alone has a 90-minute timeout and installs three browsers, and the four jobs together can approach 160 minutes a night [derived from the job timeouts], which is more than a free plan's monthly allowance over a month. A scheduled workflow only runs from the default branch, so nothing ran before `wave-0` merged.
- **Alternatives:**
  - Leave the schedule on [design]: the cost lands on the owner's bill without a decision.
  - Drop the schedule until the repo is public [design]: `tests/ci/workflows.test.ts` pins the slot of A§10.1, and the slot should not move when the gate opens.
- **Consequences:** the checks the nightly owns (the full browser sweep, the lab profile, the TTL reports) run only by hand until the owner opts in. The pull-request gate (`ci.yml`) is unchanged. `deploy.yml` follows the same pattern with `PAGES_ENABLED` (O-2).
- **Revisit when:** the repo goes public, where Actions minutes cost nothing, or the owner sets the variable.

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
| O-7 | Whether the 2026-10-24 pick-form gate still applies (D-040) | It does not gate this repo | W0-T24; carried over to the `wave-0` merge |
| O-8 | Owner review capacity per week for W0-W3 | kernelspace's 10 h/week cap (PLAN-100X OD11) | W0-T24; carried over to the `wave-0` merge |
| O-9 | The reference laptop and phone for frame-time checks | The owner's own devices, named in W0-T24's record | W0-T24; carried over to W1-T38 |
| O-10 | Whether grader-attested correctness counts at full weight. ASSESSMENT.md owns this; it is listed here because it is the owner's call. | Full weight when every browser-runnable check also passes | W2-T08 |
| O-11 | Whether D-004 is met by a front page that is playable in 2D from the first paint and becomes 3D within seconds on a capable device (D-023) | Yes | W0-T18 |

**Carried over by the W0 exit review (W0-T24, 2026-11-04).** The owner has answered none of O-7, O-8 and O-9, so each keeps its default and moves to a later deadline ([docs/waves/W0-report.md](waves/W0-report.md) §7.3):
- **O-7.** W0 ran on the default, and no W0 task waited for demand data. W1 starts after W0-T24, so the answer is needed by the `wave-0` merge.
- **O-8.** W0's PR adds 74,824 lines outside the lockfile, the vendored copies, the fonts, the screenshot baselines, the test fixtures and the posters: 39,658 of code and 32,453 of tests [measured 2026-11-04, `main` 4249418 to `wave-0` 0512837]. 18 of its 19 S and M tasks went over the tracker's line bounds, by 1.2 to 8 times [derived]. A 10-hour week cannot read that line by line, so the answer shapes how W1 is sized and reviewed.
- **O-9.** No file this review could read names the owner's laptop or phone, and the review does not invent them. The lab profile ran on the owner's dev desktop, which is neither (the report, §2), so A§11.1's by-hand frame-time budgets are unmeasured. The answer is needed by W1-T38, the next exit that checks frame time by hand.

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
