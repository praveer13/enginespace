# enginespace: decision log

**Status:** D-001 to D-006 are the owner's decisions of 2026-11-03. D-007 to D-013 restate the product record the owner confirmed the same day (`PRODUCT.md`). D-014 to D-042 are **proposed** by [ARCHITECTURE.md](ARCHITECTURE.md) and wait for the owner's review. D-043 to D-046 are **proposed** by the design review of 2026-11-03, which settled contradictions between the design files; they wait for the owner too. D-047 records the visual world the owner chose on 2026-11-03, and D-048 and D-049 are **proposed** by the art direction that followed it. D-050 is **proposed** by the design system's build (W0-T05), D-051 by the settings page (W0-T22), and D-052 by the W0 wave PR. The W0 exit review (W0-T24, 2026-11-04) froze D-023's budgets, recorded D-040's spike result and D-047's finish verdict, and carried O-7, O-8 and O-9 over; its record is [docs/waves/W0-report.md](waves/W0-report.md). D-058 records the owner's answer to O-1, the custom domain, on 2026-11-08. D-059 puts back D-023's budgets, which D-053 to D-057 had raised during W1, and supersedes those five, none of which was adopted. The W1 exit review (W1-T38, 2026-11-08) recorded what W1 built against D-023, D-035, D-037, D-039, D-041, D-042, D-044, D-045, D-047, D-048, D-049 and D-059, carried O-7, O-8 and O-9 over again, and filed O-12 to O-18 for what W1 changed without a record or left open; its record is [docs/waves/W1-report.md](waves/W1-report.md). D-060 records the owner's answer to O-2, given after that review: the repository is public from 2026-11-08 and GitHub Pages is on. It supersedes O-3's default, which said that nothing is published until the licences are decided; O-3 stays open, and until the owner answers it, enginespace's own code and content are all rights reserved. D-060 also records how two third-party checks that W0's report held back for the flip came out, what the history of the repository still carries, and how the first deploy went. The open owner questions, O-3 to O-11 and O-13 to O-18 (O-1, O-2 and O-12 are answered), and the course-design questions, Q-1 to Q-12, are at the end. **Date:** 2026-11-03, updated 2026-11-09.

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
| D-007 | The name is enginespace; the repo is `praveer13/enginespace`, private for now (public since 2026-11-08, D-060); the course is a kernelspace specialization. | owner-confirmed 2026-11-03 |
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
| D-023 | A first-paint JavaScript budget, and a front page that paints a 2D step loop first and upgrades to 3D after LCP. | proposed; budgets frozen 2026-11-04 (W0-T24); raised during W1 by D-053 to D-057 and restored on 2026-11-08 by D-059: the front page's gate is 150 KB and every other route's 200 KB; every row holds at the W1 exit (W1-T38) |
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
| D-035 | Proposed edition-1 pins: vLLM v0.33.0 (v0.32.0 if the R580 driver gate fails) and SGLang v0.5.23, pinned by SHA. | proposed; owner confirms (O-4, W1-T02, still open at the W1 exit) |
| D-036 | Build process: four waves, S/M/L tasks for Sonnet agents in isolation, Opus exit reviews, stacked wave PRs that the owner merges. | proposed |
| D-037 | The Keep stage ships in W1: Today, on kernelspace's vendored FSRS. | proposed; Today built in W1 (W1-T05), with 8 of the 26 item families the lessons name |
| D-038 | A front-page run is practice and earns no credit. | proposed |
| D-039 | W1 ships the browser parts of TR1, TR6 and TR8; their GPU parts ship with W2. | proposed; met at the W1 exit |
| D-040 | The 2026-10-24 pre-build gates: the TR2 spike becomes W0-T13's acceptance; the pick form is not a gate for this repo unless the owner says otherwise (O-7). | proposed; the spike passed (W0-T13, recorded 2026-11-04) |
| D-041 | Dispatch keys follow the pinned default runner, MRV2's `BatchExecutionDescriptor`; `has_lora` is taught as MRV1's legacy key. This corrects the catalog. | proposed; built by W1-T12, whose golden tables wait on Q-10 |
| D-042 | Adapter pages in the KV pool are taught as S-LoRA's design, built by the learner. Upstream vLLM and SGLang use adapter slots at the pins. This corrects the catalog's framing. | proposed; built in W1 (W1-T21 to W1-T25) |
| D-043 | The front page plays GAMES.md §3.1's "First loop": the visitor batches requests by hand, refills, and turns on overlap; CUDA graphs stay in TR2's levels. | proposed (design review); the owner confirms with O-11 |
| D-044 | On the "70B on H100" card, S5's per-sequence host term t_seq runs on the CPU lane, not inside the GPU step, so host work is counted once; hiding it is labelled an extrapolation. | proposed (design review); W1-T12's default; the owner confirms |
| D-045 | The KV pool has one page size: KV groups unify to it as vLLM's hybrid manager does, and adapters take S-LoRA's page count. ARCHITECTURE §5.4's mixed `pageUnits` is dropped. | proposed (design review); built by W1-T21 |
| D-046 | Same-machine output comparisons (TR1's instrumented fork, TR6's speculative runs) use ASSESSMENT §5.7's tie-aware identity, not strict token identity. | proposed (design review) |
| D-047 | The visual identity is The Pass, a restaurant line kitchen and its expo pass. The direction contract in the front page's surface brief sets token values, faces and scene materials, and DESIGN.md is written from the built world at the end of W0. | owner-decided 2026-11-03; finish verdict `fix` on 2026-11-04 (W0-T25), with the owner; W1's five game surfaces also ended `fix` (W1-T38) |
| D-048 | The front page runs on GAMES.md's synthetic ticks and prints them as ticks, labelled synthetic. µs on the model's clock start with TR2's levels (W1-T13). | proposed (art direction); its W1 half built by W1-T13 |
| D-049 | Every game gets an in-world display name in kitchen vocabulary, with its engine concept as a subtitle. Ids stay as they are. | proposed (art direction); met for W1's five games |
| D-050 | The design system ships one light scheme, the line under its tubes, with a more-contrast variant and no dark scheme. Its faces are Big Shoulders Display, Doto (with Handjet's µ and ±), Permanent Marker, Atkinson Hyperlegible and Atkinson Hyperlegible Mono, self-hosted from Fontsource 5.3.0 and pinned by SHA-256. | proposed (W0-T05) |
| D-051 | A learner's settings are recorded in the ledger's `working` store, one key each, and a copy in `localStorage` lets every page honour them from its first paint without opening the ledger. | proposed (W0-T22) |
| D-052 | The nightly workflow runs on its schedule only when the repository variable `NIGHTLY_ENABLED` is `'true'`; a run started by hand always runs. | proposed (W0 wave PR) |
| D-053 | The front page's first-paint gate is 151 KB: a second game that shares the run hook and the shell with Service splits the chunks that Service and the front page share, which costs about 870 B that the game cannot avoid. | superseded by D-059; not adopted |
| D-054 | The front page's first-paint gate is 152 KB: a third game reaches some of the modules that the front page shares with the first two and not others, so Rollup splits them again, which costs the closure 585 B. | superseded by D-059; not adopted |
| D-055 | The front page's first-paint gate is 154 KB: a fourth game, the first after The Loop to be built on the step loop's workload generator and cards, splits the chunk that The Loop's session shares with them, which costs the closure 2,098 B. | superseded by D-059; not adopted |
| D-056 | The gate of `/today` and `/m/:module` is 210 KB, up from 200 KB: both carry the registry of item families, which is static, and TR6's five families cost each closure about 17.2 KB, which took both over their gate. | superseded by D-059; not adopted |
| D-057 | Every other route's gate is 201 KB, up from 200 KB: each lesson and module adds its name to the loader's table, which every game route loads for its claims, and TR6's six names took `/play/broken-bench` 41 B over. | superseded by D-059; not adopted |
| D-058 | The site is served at https://enginespace.naigap.com, at the root of that origin: the deploy builds with the default base `/`, `public/CNAME` names the domain, and `VITE_BASE` stays for a preview or a fork under a subpath. This answers O-1. | owner-decided 2026-11-08 |
| D-059 | D-023's budgets stand: the front page's first-paint JavaScript at 150 KB and every other route at 200 KB, with no row of its own for any page. The build is fitted to them by the fixes D-053 to D-057 named (the preload map out of the entry, the item families on demand, the lessons' tables out of the content loader, a front page that carries what it runs) and by a game shell that loads its keys dialog when it is asked for. | proposed (W1 gates restore, 2026-11-08); supersedes D-053 to D-057; holds at the W1 exit |
| D-060 | The repository `praveer13/enginespace` is public from 2026-11-08, and GitHub Pages is on, with the source GitHub Actions and the custom domain `enginespace.naigap.com`; `PAGES_ENABLED` is set when W1 is on its way to `main`. This answers O-2. O-3 stays open and its default, that nothing is published until decided, is superseded: until the owner answers it, enginespace's own code and content are all rights reserved. | owner-decided 2026-11-08 |
| D-061 | `scripts/` and `tests/` are type-checked by `tsc -b` in `tsconfig.tools.json`, under the app's options, and the parts of Bun that they call are declared in `scripts/types/bun.d.ts` in place of `@types/bun`, which is not added. | proposed (W1b-T14) |

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
- **Decision:** The course is called enginespace, after kernelspace. The repo is `praveer13/enginespace`, private for now (it has been public since 2026-11-08: D-060). It is the Engine Internals specialization of kernelspace, and may cite kernelspace's lessons, labs and plays by id (T5.L7, lab 06).
- **Consequences:** The repo was private, so learners get the lab kits and the grader as static downloads from the site, not by cloning (ARCHITECTURE §9.3). O-2 asked about Pages on a private repo and was answered on 2026-11-08: the repo is public (D-060), a learner may clone it, and the kits still ship as static downloads.

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
  - The main origin is decided (`https://enginespace.naigap.com`, D-058), and a second origin would need a name of its own.
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
  - **Amended 2026-11-04 (the W1 carry-over, "W0 loose ends").** The banned `Math` members were ten: kernelspace's engine-dependent functions less `log2` and `log10` [measured 2026-11-04 from kernelspace's `scripts/verify-determinism.ts` at d478f91], and `random`. They are now ECMA-262's own list of the functions that the standard does not precisely specify, 22 and `random`. A§5.1 holds the list with the standard's tag and the measurement that two engines disagree on every one of them, and the lint, the gate and their tests follow (`eslint.config.js`, `scripts/verify-determinism.ts`, `tests/lint`).
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

- **Status:** proposed. Its budgets were frozen on 2026-11-04 by the W0 exit review (W0-T24), below. D-053 to D-057 raised three of them during W1, and D-059 put them back on 2026-11-08.
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
    - **The entry row measures the entry's own file, as gated.** A§11.1 derived its 110 KB from kernelspace's entry, which carried React. Here React, ReactDOM and the stores sit in `react-vendor`, so the entry file is 37,331 B while its static closure is 99,559 B [measured 2026-11-04 at 0512837]. The closure rows contain it, so nothing grows unchecked. The review recommends moving the 110 KB gate onto the entry's static closure, which changes only that row of `verify:bundle` (the report, §8). The W1 carry-over did it, below.
    - **`postfx` stays at 25 KB, so tier 3 antialiases with FXAA.** three's `SMAAPass` alone is 35,631 B gz [measured 2026-11-04 by W0-T15, `gzip -9`], so `src/scene/tiers.ts` uses FXAA at T3 in place of A§6.6's SMAA. A§6.6's row follows it since the W1 carry-over.
    - **Not measured at the freeze:** the two workers, which have no source yet; frame time p95 on the reference laptop and phone, the first 3D frame and post-processing GPU time, which are by hand on devices that O-9 has not named; GPU memory per scene, since `renderer.info` counts objects, not bytes; and main-thread tasks over 50 ms during play, which need the nightly trace.
    - **The lab gates are one desktop's numbers:** LCP 896 ms, INP 120 ms and CLS 0 at `0512837` [measured 2026-11-04]. If the nightly runner misses a gate that this host meets, look at the profile first (its flags, the runner's cores), and record what changes here.
  - **The entry row counts the entry's static closure (the W1 carry-over, "W0 loose ends", 2026-11-04).** `verify:bundle`'s `entry` row now sums the gzip of the entry chunk and every chunk it imports statically, JavaScript only: here the entry's own file and `react-vendor`, which every page loads before its own code. The gate (110 KB) and the target (100 KB) are A§11.1's, unchanged. They were derived from kernelspace's entry, one file that carried React, so a row that measured only the entry's file, 37,331 B here, bounded almost nothing: the front page's closure contained the entry, but a growth of `react-vendor` or of anything else the entry imports had no row of its own.
    - At the base of the change, `c80dfad`, the closure was 99,559 B: 10,441 B under the gate and 441 B under the target [measured 2026-11-04 at c80dfad].
    - **What the same change spent.** `src/App.tsx` gained focus, an announcement and scroll restoration on a route change (the report's follow-up). The rules are a chunk of their own, `src/route-change.ts` (564 B gz), which the root route loads after its first render, so that they stay out of the first paint. Written inline they cost 313 B in the entry, which took the front page's closure 102 B over its gate when it was 211 B under it (150 KB then) [measured 2026-11-04 on wave-1 at 5ffa2f9, built without the change]. The call that loads the chunk costs 67 B of the entry's closure and 72 B of the front page's, and the chunk is in neither [measured 2026-11-04 at 8c14e03, the wave-1 tip 34d790e with this branch, built with and without the call; 71 B and 84 B at 238a38c, on d287a14]. With the call the entry's closure is 99,948 B, 52 B under its target and 10,052 B under its gate, and the front page's closure is 147,760 B, 6,240 B under its gate (154 KB since D-055) [measured 2026-11-04 at 8c14e03]. React Router's `ScrollRestoration` alone cost 959 B in the entry [measured 2026-11-04 on `c80dfad` with that one component added], because its code sits in the chunk the router shares and cannot be split off, so the page keeps the offset of each history entry itself. The entry's target is close, and every task that grows the entry shares what is left of it: crossing the target gets a warning, not a failure, and the gate has 10 KB.
  - **W1, 2026-11-04: the modulepreload polyfill is off.**
    - Each lazy route adds its chunk names to the preload map that Vite keeps in the entry, about 19 B gz a name [measured by W1-T06]. When T12 merged, the front page's first-paint JavaScript was 149,870 B, 130 B under the gate [measured at 6076b2b].
    - `build.modulePreload.polyfill: false` (vite.config.ts) takes the polyfill for browsers without `<link rel=modulepreload>` (Firefox before 115, Safari before 17) out of the entry: 149,581 B, 419 B under the gate [measured at 6076b2b]. Those browsers still load every module, and Vite's preload helper falls back to `rel=preload` for them. No gate changed.
    - The 419 B are about 20 more chunk names, so the preload map, not the code, is now what fills the front page's closure. A route manifest outside the entry, or the hover-and-focus preloading of A§6.10, is the fix to plan before the gate is reached.
  - **At the W1 exit (W1-T38), 2026-11-08.** D-053 to D-057 raised three of these gates during W1, and D-059 put them back. At `wave-1`'s tip `35d5fd3` every row holds [measured 2026-11-08]: the entry's closure is 99,153 B (847 B under its target), the front page's first-paint JavaScript 147,678 B (2,322 B under 150 KB) and its CSS 18,469 B, the other routes 117,799 to 187,706 B against 200 KB, and the scenes 39,468 to 39,840 B against 40 KB, the closest 160 B under it. The course index took 341 B of the front page's room after D-059 measured it, about 49 B for each of W1-T15's seven lessons [derived]. The lab profile on the dev host read LCP 884 ms, CLS 0 and INP 136 ms [measured 2026-11-08 at 35d5fd3]. [docs/waves/W1-report.md](waves/W1-report.md) §3 has every row.
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
- **Consequences:** ARCHITECTURE §9. The kits ship as static downloads, which D-007 decided while the repo was private and D-060 keeps now that it is public.
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
- **Alternatives:** copying with edits, which drifts silently; or a git submodule, which brings all of kernelspace into this repo [design]. (This line said "a private repo" while the repo was private; it has been public since 2026-11-08: D-060.)
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
- **At the W1 exit (W1-T38), 2026-11-08.** W1-T01 wrote these pins into `course.lock.json` on 2026-11-04, and the claims that W1's content cites read their sources at them; a sample of 23 claims re-read on 2026-11-08 still quotes its sources (W1 report §6). The owner's confirmation, W1-T02, is still open, with the choices that W1-T01 listed beside the pins: Nsight Systems 2026.5.1 or the 2026.6.1 that the vendor's page called current, Nsight Compute 2026.3.1 or the documentation's 2026.4.0, and the R580 driver gate on the owner's GPUs and the rental hosts.
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
- **Built in W1 (W1-T05; recorded by W1-T38, 2026-11-08).** `/today` derives one FSRS card for each earned KC from the ledger at read time, and draws each item on a fresh seed from the item families. The lessons name 26 families and W1 built 8, so Today can draw items for the 9 KCs that those 8 assess, none of them TR1's, TR5a's or TR8's, and shows every other earned KC as unserved ([docs/waves/W1-report.md](waves/W1-report.md) §5).
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
- **Met at the W1 exit (W1-T38, 2026-11-08).** The module pages of TR1, TR6 and TR8 each say, under "The part that needs a GPU", that their lab (`tr1.fork`, `tr6.proposer`, `tr8.replay`) arrives with the grader (W2, D-039), and show its Build card without running it.

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
- **Built in W1 (W1-T12, W1-T13; recorded by W1-T38, 2026-11-08).** `packages/sim/steploop` holds both runners' dispatch as data from claims read at v0.33.0, and `dispatchV2` and `dispatchV1` agree with an independent port on 6,400 cases each [measured 2026-11-04 by W1-T12]. The golden tables from the pinned vLLM itself wait on the owner (Q-10), and so do Service's `keys` level and the adapters of `close`.
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
- **Built in W1 (W1-T21 to W1-T25; recorded by W1-T38, 2026-11-08).** The KV model, The Reach-In and the `hybrid-kv` lab keep adapters in pages of the one pool. The `adapters` level's debrief replays the seed with a fixed-slot baseline, and TR5a's fourth lesson states both engines' slots. The readout on the lab's page that would run the learner's module against the slot model (TR5a §5) is not built (W1-T22).
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
- **W1 ran on the default (recorded by W1-T38, 2026-11-08).** The owner's confirmation did not come before W1-T12, which built this record's default as a one-line switch in `packages/sim/steploop/cards.ts`. On the golden "everything on" family under async scheduling, the 70B card's clock reads 796,034 µs with t_seq on the CPU lane and 902,443 µs with it in the GPU step [measured 2026-11-04 by W1-T12]. Service's TR2 levels, `close` among them, run on it, so a change moves their goldens and the broken-bench corpus's `server.gpu` label (W1-T32). The owner's confirmation is still open.
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
- **Built in W1 (W1-T21; recorded by W1-T38, 2026-11-08).** `kvSpecProblems` refuses a group whose block is not one page, every group's block equals its page in the four presets, and an adapter of rank 8, 16 or 64 takes ⌈adapter bytes ÷ page bytes⌉ pages in each [measured 2026-11-04 by W1-T21]. The `hybrid-kv` lab holds a learner's manager to the same rules.
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
- **Finish, W1 (recorded by W1-T38, 2026-11-08).** impeccable's finish review ran on W1's five game surfaces: Service (on `/` and `/play/loop`), Back of House, The Reach-In, The Tasting and The Inspection, three rounds each, or four where a round asked only for a recapture.
  - **The verdicts.** Every surface ended `fix`, in the reviewer's own word, and none `ship`. Back of House and The Reach-In each drew one `rebuild`, in their first round, and neither drew a second.
  - **W0's findings.** W1 closed W0-T25's open findings and the two lights W0-T24 found: the 2D view is the kitchen drawn through the scene's shot, a fired 2D state is captured, both lights burn amber, the phone's lane tapes stand apart, and the off-ramp sizes are tokens or reasoned one-offs.
  - **What stays open.** The W1 report's §7 lists each surface's open material fixes, and the three that recur across the 3D scenes: the room does not fall into haze, the lamp's amber is a wash or a disc and not a pool on the steel, and the paper does not read as printed bond. Shipping with them listed, or scheduling the scene-kit task the report proposes, is the owner's call, as W0-T25's first check is.
  - **DESIGN.md.** The documenter described W1's kitchen, scene kit and games (`7593ab3`). The Ticket's "Doto head line over a dotted rule, a heading-face title", which The Inspection's review asked the documenter to strike as a kicker, is still in its Components section.
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
- **W1's half built (W1-T13; recorded by W1-T38, 2026-11-08).** Service's TR2 levels, the full service, print µs on the model's clock, each figure with its tag: synthetic on the small-model card, and derived or estimated on the 70B card. The front page still prints synthetic ticks. The Service redress moved the synthetic stamp off the 3D scene and the 2D drawing onto the printer tape, once at the tape's head, so D-012's label is the DOM's (the W1 report §8.2).
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
- **Met for W1's five games (recorded by W1-T38, 2026-11-08).** The registry carries Service, Back of House, The Reach-In, The Tasting and The Inspection, each over its subtitle, and `verify:games` passes on all five.
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

D-052 records how the W0 wave PR keeps the nightly from spending Actions minutes while the repository was private (O-2, answered on 2026-11-08: it is public, D-060).

### D-052 · The nightly runs on its schedule only when the owner turns it on

- **Status:** proposed (the W0 wave PR, 2026-11-04).
- **Decision:** every job of `nightly.yml` except `report` carries `if: ${{ github.event_name == 'workflow_dispatch' || vars.NIGHTLY_ENABLED == 'true' }}`. Until the owner sets the repository variable `NIGHTLY_ENABLED` to `'true'`, the 03:17 UTC schedule starts a run whose jobs are all skipped, and `report` files nothing because no job failed. A run started by hand from the Actions tab always runs every job.
- **Context:** the repository was private (O-2), so every run spent the account's Actions minutes. The `browsers` job alone has a 90-minute timeout and installs three browsers, and the four jobs together can approach 220 minutes a night [derived from the job timeouts: 90, 90, 30 and 10], which is more than a free plan's monthly allowance over a month. The `properties` job had 30 minutes while it was a reserved step. The W1 carry-over built it as the whole suite at 10,000 seeds on two workers, which took 1,097 s on the dev host [measured 2026-11-04 at 749a327] and takes longer on a runner [unverified], and gave it 90. A scheduled workflow only runs from the default branch, so nothing ran before `wave-0` merged. The repository has been public since 2026-11-08 (D-060), and standard GitHub-hosted runners in public repositories are free [measured from GitHub's docs, https://docs.github.com/en/billing/concepts/product-billing/github-actions, 2026-11-08], so the cost no longer holds a nightly back; whether to set the variable is the owner's call.
- **Alternatives:**
  - Leave the schedule on [design]: the cost lands on the owner's bill without a decision.
  - Drop the schedule until the repo is public [design]: `tests/ci/workflows.test.ts` pins the slot of A§10.1, and the slot should not move when the gate opens.
- **Consequences:** the checks the nightly owns (the full browser sweep, the lab profile, the TTL reports) run only by hand until the owner opts in. The pull-request gate (`ci.yml`) is unchanged. `deploy.yml` follows the same pattern with `PAGES_ENABLED` (O-2).
- **Revisit when:** the owner sets the variable. The repo went public on 2026-11-08 (D-060), where Actions minutes cost nothing, so the cost that made this the default is gone.

## The first-paint gate, W1

D-053 is the new record that D-023 asks for when a change must take a budget over its gate, D-054 is the next, and D-055 the one after. D-056 is the first for routes other than the front page, and D-057 the one after. Each raised a gate where it should have stopped: D-023's budgets are frozen, and the owner's rule is that no gate is weakened. D-059 superseded all five on 2026-11-08, none of them adopted, and fitted the build to D-023's budgets; their text stays as it was written.

### D-053 · The front page's first-paint gate is 151 KB, for the second game

- **Status:** superseded by D-059; not adopted. Proposed (W1-T28, 2026-11-04).
- **Decision:**
  - `verify:bundle` holds the front page's first-paint JavaScript to 151 KB gz, up from 150 KB. The target stays 130 KB, and no other gate changes.
  - `packages/play/keys.ts` holds the keys common to every game and `levelOf`, `registry.ts` re-exports them, and the call that makes `GAMES` is marked pure. A build in which nothing reads `GAMES` then leaves the registry out of the front page's closure, and with it the record of every game but Service's, which the front page reads from Service's own module.
- **Context:** all [measured 2026-11-04 at 1f2219f], gzip under Bun 1.3.14 as the gate counts it.
  - The wave tip alone: 149,572 B, 428 B under the gate.
  - With The Tasting's record registered and not its game: 149,576 B. Registering a game costs the closure 4 B, because the keys are apart and `GAMES` is marked pure.
  - With its game as well: 150,443 B, 443 B over the old gate and 557 B under the new one. Without the two changes to the registry the same tree is 151,007 B, 564 B more.
  - At 85d994f, with the Play index (W1-T06) in: 149,798 B alone, and 150,666 B with the game, 868 B more and 334 B under the new gate.
  - The game's 867 B are Rollup's chunking, and no code that the front page runs. A module goes into a chunk by the set of entries that reach it. The Tasting reaches the run hook, the live region, the view switch, the mirror table, the SVG helpers, the settings hook and the stats, which the front page and Service share, and it does not reach Service's own controls, card, tape and mirror. Those were one chunk of 13,059 B and are now two, of 4,832 B and 9,073 B. The settings hook and the stats take chunks of their own (520 B and 387 B), `int` joins `rng`, and the closure has 19 chunks against 17. A chunk costs its gzip header and the context it no longer shares, and a name of about 19 B in the entry's preload map (D-023's W1 note).
  - The game's route, `/play/verifier`, is 176,634 B against 200 KB. `/play/loop` is 186,142 B, from 183,521 B, for the same reason.
- **Alternatives:**
  - Keep the game out of the split [design]: it reaches the shared modules through the shell (`GameShell`) and the run hook (`useRun`), which every game uses, so the split is the price of a second game. A copy of the one hook that it takes from Service moved the closure by under 20 B [measured under Node's gzip at the tip before this one].
  - Merge small chunks with `output.experimentalMinChunkSize`: at 3,000, 6,000 and 12,000 B the closure was 152.9, 156.1 and 175.8 KB, and the pages were merged into shared chunks that the manifest no longer lists by name [measured on this task's branch before the keys were apart].
  - Take the preload map out of the entry: a route manifest outside it, or the hover-and-focus preloading of A§6.10, which D-023's W1 note plans. It changes how every route loads, so it is the owner's to schedule. This record takes the 443 B that the game needed at 1f2219f and leaves 557 B there.
- **Consequences:**
  - ARCHITECTURE §6.10 and §11.1 carry 151 KB. GAMES.md §3, "Budget" ("fit ARCHITECTURE's 150 KB gz first-paint closure"), is the owner's to follow.
  - A game that follows pays nothing for its record, and pays the split again only for a module that it reaches and the earlier games do not.
  - A lazy part of a game (its debrief, its 3D scene) that imports a module that only the game's own chunk uses makes Rollup export that module from the game's chunk, and a chunk that exports more than its game file does has no entry in the manifest, so `verify:bundle` reports the game as missing. The Tasting imports its debrief for that reason.
  - 334 B is the room that is left at 85d994f, about 17 chunk names.
- **Revisit when:** a change takes the closure over 151 KB, or the route manifest leaves the entry. D-054 revisits it for the third game.

### D-054 · The front page's first-paint gate is 152 KB, for the third game

- **Status:** superseded by D-059; not adopted. Proposed (W1-T17, 2026-11-04).
- **Decision:** `verify:bundle` holds the front page's first-paint JavaScript to 152 KB gz, up from 151 KB (D-053). The target stays 130 KB, and no other gate changes.
- **Context:** all [measured 2026-11-04], gzip under Bun 1.3.14 as the gate counts it, at the wave tip 5345384 and on this task's tree, which is the tip with Back of House's files.
  - The tip alone: 150,707 B in 19 chunks, 293 B under the gate.
  - With Back of House's record registered and not its game: 150,894 B in 20 chunks, 187 B more.
  - With its game as well: 151,292 B in 22 chunks, 292 B over the gate and 708 B under the new one. The game costs the closure 585 B in all.
  - It is Rollup's chunking again (D-053) and no code that the front page runs. A module goes into a chunk by the set of entries that reach it, and Back of House reaches some of the modules that the front page shares with the first two games and not others:
    - Its session reaches `rng` and not `int`, which were one chunk of 2,391 B and are now 1,938 B and 503 B. That is the 187 B of the record.
    - Its controls and debrief reach the readout, which was in the printer tape's chunk (2,384 B) and is now a chunk of 916 B beside the tape's 1,609 B.
    - It does not reach Service's SVG converter and orientation hook, which The Tasting takes from Service (Back of House has copies of its own, and D-053 measured a copy at under 20 B). They were in the shell's shared chunk (11,495 B) and are now a chunk of 508 B beside it (11,078 B).
    - The entry grew by 122 B and the Front page by 140 B, raw, for the names and the imports.
  - The game's route, `/play/engine-floor`, is 173,515 B against 200 KB. `/play/verifier` is 178,490 B and `/play/loop` 188,384 B; D-053 gave 176,634 B and 186,142 B.
- **Alternatives:**
  - Pin the shared modules to chunks of their own with `manualChunks` (the shell's, the printer tape's with the readout, the integer core's): 151,833 B, 541 B more than the same tree without it. A manual chunk pulls in every static dependency that is not assigned elsewhere, and the shell's chunk grew to 13.2 KB [measured on this task's branch, before the gate moved].
  - Reach the same modules as The Tasting [design]: Back of House could take the hook and the converter from Service and use an integer helper, so that its chunks are the games' before it. That would put the 508 B chunk back and not the other two, and a game should not import a helper for the chunk that it lands in. Not measured.
  - D-053's two: `output.experimentalMinChunkSize`, which made the closure larger and merged the pages out of the manifest, and the preload map outside the entry, which is the owner's to schedule.
- **Consequences:**
  - ARCHITECTURE §6.10 and §11.1 carry 152 KB.
  - A game that follows pays the split again for each module that it reaches and the games before it do not [derived from D-053 and this record]. 708 B is the room that is left at 5345384, and this game cost 585 B, so the next game may need a record of its own.
- **Revisit when:** a change takes the closure over 152 KB, or the route manifest leaves the entry. Three games in, each has moved the closure by its chunking and by almost nothing of its own, so the owner may prefer to stop the games from moving it. D-055 revisits it for the fourth game.

### D-055 · The front page's first-paint gate is 154 KB, for the fourth game

- **Status:** superseded by D-059; not adopted. Proposed (W1-T33, 2026-11-04).
- **Decision:** `verify:bundle` holds the front page's first-paint JavaScript to 154 KB gz, up from 152 KB (D-054). The target stays 130 KB, and no other gate changes.
- **Context:** all [measured 2026-11-04], gzip under Bun 1.3.14 as the gate counts it, at the wave tip f823a04 and on this task's tree, which is the tip with The Inspection's files.
  - The tip alone: 151,312 B in 22 chunks, 688 B under the gate.
  - With The Inspection's record registered and not its component: 153,281 B in 24 chunks, 1,969 B more.
  - With its component as well: 153,410 B in 25 chunks, 129 B more. That is 1,410 B over the gate and 590 B under the new one. The game costs the closure 2,098 B in all, against 585 B (D-054) and 867 B (D-053) for the games before it.
  - It is Rollup's chunking again (D-053, D-054), and no code that the front page runs, though some of it is code that the front page now carries. Most of the cost comes with the record and not the component, because the record carries the loader of the game's session. A module goes into a chunk by the set of entries that reach it. The Inspection is the first game after The Loop to be built on the step loop (the card says that its server is the step loop run coarse), so its session reaches the workload generator with its exponential table and the cards of the step loop's server, which the front page reaches through The Loop's session:
    - The Loop's session chunk (10.1 KB gz: `play/loop/{engine,levels,session}`, `sim/core/exp*` and `sim/workload/*`) is now three: The Loop's own (5.2 KB), the exponential table with the workload generator (5.2 KB), and the cards (2.3 KB: the vendored card, `sim/physics/*` and `sim/steploop/cards`), which were in the `run` chunk (4.2 KB) with the step loop's events, metrics and run. That chunk is now 3.4 KB.
    - The same modules cost 16.1 KB in four streams against 14.3 KB in two, 1.8 KB more. The cut is some of it: gzip loses what the pieces shared. The rest is code: the S5 card's rows (`sim/physics/rows`, 7.8 KB of source) were left out of the front page's closure because nothing it runs reads them, and the game's server reads them, so Rollup, which tree-shakes a module once for all of its readers, keeps them in the cards chunk that the front page loads.
    - The SVG converter of The Loop takes a chunk of 0.1 KB, the entry grew by 178 B and the Front page by 100 B, raw, for the names and the imports.
  - The game's route, `/play/broken-bench`, is 194,642 B against 200 KB, 5,358 B under it. `/play/loop` is 191,473 B, `/play/verifier` 179,710 B and `/play/engine-floor` 174,678 B; the tip alone gave 188,401 B, 178,502 B and 173,510 B. The routes of the other games grow because the chunks they share are more of them.
- **Alternatives:**
  - Pin the step loop's modules to a chunk of their own with `manualChunks`: a chunk of the workload and the cards took 0.9 KB of the 2.4 KB that the game cost at 5345384 and was not kept, since it changes how every game is chunked and D-054 measured the same kind of pin 541 B worse [measured on this task's branch before the rebase onto the third game].
  - Reach the same modules as The Loop [design]: the session would import the Loop's engine, levels and session for the chunk it lands in, and a game should not (D-054). Not measured.
  - D-053's two: `output.experimentalMinChunkSize`, which made the closure larger and merged the pages out of the manifest, and the preload map outside the entry, which is the owner's to schedule.
- **Consequences:**
  - ARCHITECTURE §6.10 and §11.1 carry 154 KB.
  - A game that follows pays the split again only for a module that it reaches and the games before it do not [derived from D-053, D-054 and this record]. The next game built on the step loop reaches leaves that are now apart, and pays little. 590 B is the room that is left at f823a04.
  - A lazy part of a game (its debrief, its 3D scene) that imports a module that only the game's own chunk uses makes Rollup export that module from the game's chunk, and `verify:bundle` then reports the game as missing from the manifest. The Inspection imports its debrief for that reason, as The Tasting does.
- **Revisit when:** a change takes the closure over 154 KB, or the route manifest leaves the entry. Four games in, the gate has moved three times by 4 KB in all (150 to 154 KB) for a front page whose own code has not grown, and the owner may prefer to end it with the route manifest of D-053 before a fifth game.

### D-056 · The gate of `/today` and `/m/:module` is 210 KB, for the item bank

- **Status:** superseded by D-059; not adopted. Proposed (W1-T30, 2026-11-05).
- **Decision:** `verify:bundle` holds the closure of `/today` and of `/m/:module`, JavaScript and CSS, to 210 KB gz, up from the 200 KB that every other route keeps (`ITEM_BANK_ROUTES` and `budgetOfRoute` in `scripts/verify-bundle.ts`). No other gate changes.
- **Context:** all [measured 2026-11-05], gzip under Bun 1.3.14 as the gate counts it, at the wave tip cc298cc and on this task's tree, which is the tip with TR6's files.
  - The registry of item families is static. `src/items/today/TodayView.tsx` reads `FAMILIES` when the page renders, and `src/items/ItemBlock.tsx` reads `familyById` for a lesson's `item` block, which `src/content/render/Blocks.tsx` imports, so the code of every family (its generator, its grader, and the words of its stems, its explanations and its worked steps) is in the closure of every page that renders blocks: the lesson page, the module page and Today.
  - With the registry as the tip has it, three families of TR2: `/today` is 191,026 B, `/m/:module` 190,003 B and `/m/:module/:lesson` 147,661 B. On the tree before W1-T14's two families (e85c683, with the one family of `tr2.bubble-width`) `/today` was 183,917 B, so a family costs about 3.5 KB there too.
  - With TR6's five: `/today` is 208,260 B (JavaScript 184.4 KB, CSS 23.8 KB), 8,260 B over 200 KB. `/m/:module` is 207,232 B, 7,232 B over. `/m/:module/:lesson` is 164,881 B, 35,119 B under. The three pages take about the same from the families, 17,234 B, 17,229 B and 17,220 B.
  - What each family's removal takes out of `/today`: `tr6.mask-fits` 4,492 B, `tr6.exactness-test` 4,190 B, `tr6.verify-shape` 3,228 B, `tr6.which-runner` 2,819 B and `tr6.mask-phases` 2,744 B, which is 17,473 B, more than the 17,234 B of the five together, since gzip shares what the five have in common. A family costs a page about 3.4 KB, most of it its words: the five files hold about 33,000 characters of string literals [measured by counting them].
  - The game routes carry no families. The five move them by 24 B (`/play/engine-floor`) and 21 B (`/play/broken-bench`), through Rollup's chunking, and they are 484 B and 171 B under 200 KB at this tip. This record leaves them alone, and a record for them is due before long.
  - The lessons and the module of TR6 are lazy chunks, and are in no closure but for their names in the entry's preload map.
- **Alternatives:**
  - Cut the families to fit: 8,260 B is almost half of what the five cost. Every sentence of a family is a stem, the explanation of a wrong option or a worked step, which is what an item is for, and the next family that is registered meets the same wall, so the cut would only move the question to the task after this one. Not done.
  - Load the families on demand: the registry is imported when Today or an item block needs it, and not with the page. `packages/play/items/index.ts` re-exports the registry, so the attempt's framework and the families are one chunk today, and `TodayView`, its session, `ItemBlock` and every test that reads `FAMILIES` from the index would change. It is the fix that ends the question, and it is the owner's to schedule, as D-053 says of the route manifest. Not measured.
  - Make `TodayView` lazy in `src/pages/Today.tsx`, or the item block lazy in `Blocks.tsx`: the page's static closure would leave the families out, and a learner would download the same bytes right after. It meets the number and not the budget. For the module page, which has no item block, a lazy `ItemBlock` would also be a real saving, and it is the one change here that would end that page's part of the question. Not done.
- **Consequences:**
  - ARCHITECTURE §11.1 carries 210 KB for the two pages, and 200 KB for every other route.
  - 1,740 B on `/today` and 2,768 B on `/m/:module` are the room that is left at cc298cc, which is less than one more family. The open tasks name eight more: two for TR1, two for TR2, one for TR5a and three for TR8, about 27 KB [derived: eight at 3.4 KB], which would take `/today` to about 235 KB. A gate that follows the item bank is a gate that moves with every family, so the registry should load on demand before the next family is registered.
- **Revisit when:** a change takes either page over 210 KB, or the registry loads on demand, which puts the rows back to 200 KB.

### D-057 · Every other route's gate is 201 KB, for the names of the lessons

- **Status:** superseded by D-059; not adopted. Proposed (W1-T30, 2026-11-05).
- **Decision:** `verify:bundle` holds every route other than the front page, `/today` and `/m/:module` to 201 KB gz, up from 200 KB (`BUDGETS.route`). The target stays absent, and no other gate changes.
- **Context:** all [measured 2026-11-05], gzip under Bun 1.3.14 as the gate counts it, at the wave tip ba7f1e6 built as it stands and on this task's tree, which is the tip with TR6's files.
  - A game's page loads `src/content/load.ts` for the claims that its debrief cites, and `load.ts` holds the tables of every lesson, module and card in the same chunk, so each lesson and module adds its path and its chunk's name to the closure of every game route. TR6's six cost the chunk 163 B, from 1,747 B to 1,910 B, about 27 B each. The course index, which the front page awaits, took 302 B for the six, from 1,668 B to 1,970 B, about 50 B each.
  - The tip alone: `/play/broken-bench` 199,891 B, 109 B under 200 KB, and `/play/engine-floor` 199,511 B, 489 B under; `/play/verifier` 196,742 B, `/play/loop` 196,898 B and `/play/pool` 193,873 B. The front page's first-paint JavaScript is 153,350 B, 650 B under its 154 KB.
  - With TR6: `/play/broken-bench` 200,041 B, 41 B over (150 B more), and `/play/engine-floor` 199,518 B (7 B more). The front page is 153,805 B, 195 B under (455 B more).
  - The lesson's file name is not the lever: shortening two of TR6's moved the game route by 7 B and the front page by 18 B, because gzip keeps what a name shares with the ones around it.
- **Alternatives:**
  - Split the claims out of `load.ts`, as `load-map.ts` already splits the map's tables, so that a game route loads the claims and not the lessons. It would take the 1.4 KB of tables off every game route and the per-lesson cost with it, and it adds a chunk to the front page, whose room is 195 B and a chunk costs a header and a name in the entry's preload map (D-053). Not measured, and the front page's gate would move with it.
  - The route manifest outside the entry, which D-053 leaves to the owner, and which would take the names out of the closures altogether. Not done.
  - Raise the game routes' gate alone: the gate is one row for every other route, and a second row for the games would be a second thing to follow.
- **Consequences:**
  - ARCHITECTURE §11.1 carries 201 KB. 959 B is the room that `/play/broken-bench` has left at ba7f1e6 with TR6, and 1,482 B for `/play/engine-floor`, about thirty more lessons at 27 B.
  - The front page has 195 B left, which is the cost of three lessons (about 76 B each, 50 B in the index and 27 B in the table): the front page's gate will need D-053's record again, or the names will have to leave the first paint.
- **Revisit when:** a change takes a route over 201 KB, or the claims or the route manifest leave the closure that the names are in.

## The custom domain, 2026-11-08

D-058 records the owner's answer to O-1, which leaves the table of open questions below.

### D-058 · The site is served at https://enginespace.naigap.com

- **Status:** owner-decided 2026-11-08.
- **Decision:**
  - The site's origin is `https://enginespace.naigap.com`, and the site sits at the root of it. The deploy builds and prepares with the default base `/`, so `deploy.yml` sets no `VITE_BASE`.
  - `public/CNAME` holds the one line `enginespace.naigap.com`, as kernelspace's does.
  - The base stays configurable for a preview or a fork that is served under a subpath: `VITE_BASE`, which `vite.config.ts` and `scripts/prepare-pages.ts` both read, and their tests for a subpath such as `/enginespace/` keep passing.
- **Context:**
  - O-1 asked for the custom domain. Its default was the project site, `praveer13.github.io/enginespace/`, built with `VITE_BASE=/enginespace/`.
  - The owner answered on 2026-11-08 and added the DNS record that day, a CNAME from `enginespace.naigap.com` to `praveer13.github.io` [measured 2026-11-08 with `host`: `enginespace.naigap.com` is an alias for `praveer13.github.io`, which has four IPv4 addresses, 185.199.108.153 to 185.199.111.153]. GitHub's docs say that a subdomain's CNAME record points at `<user>.github.io`, without the repository's name [measured from "Managing a custom domain for your GitHub Pages site", https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site, 2026-11-08].
  - kernelspace is served the same way. `kernelspace.naigap.com` is an alias for `praveer13.github.io` too [measured 2026-11-08 with `host`], its `public/CNAME` is the one line `kernelspace.naigap.com`, its `deploy.yml` says "Custom domain (kernelspace.naigap.com) is served from /", and its `vite.config.ts` reads the base from `VITE_BASE` [the last three measured at kernelspace d478f91, 2026-11-08].
  - The same page of GitHub's docs says: "If you are publishing from a custom GitHub Actions workflow, no CNAME file is created, and any existing CNAME file is ignored and is not required." [measured 2026-11-08] `deploy.yml` is such a workflow, so `public/CNAME` does not bind the domain here. The custom-domain setting of the repository's Pages does, and setting it is the owner's step. The file stays because kernelspace has it and because it names the domain in the repository, where a test holds it equal to this record.
  - Nothing in the build needs the origin as a string (checked 2026-11-08 at 72f163e). The meta CSP (§12) names only `'self'`, no document has a canonical link or an Open Graph tag, `prepare-pages` writes links relative to the base, and the content compiler writes `llms.txt` and the Markdown export with relative links.
- **Alternatives:**
  - Keep O-1's default, the project site under `/enginespace/`: it needs no DNS record and no custom-domain setting. Every address of it carries the repository's name, and the owner chose a domain beside kernelspace's instead.
  - Write `VITE_BASE: /` into `deploy.yml` [design]: it repeats the default, and `tests/ci/workflows.test.ts` holds the deploy to setting none.
  - A repository variable for the base, so that a fork could serve a subpath without editing the workflow [design]: it is one more setting for the owner to know, for a case the owner does not have. A fork edits `deploy.yml`.
  - Add a `SITE_ORIGIN` constant now [design]: nothing would read it.
- **Consequences:**
  - `deploy.yml` builds and prepares with the base `/`, and its header gives the owner's steps to turn it on, in order. Enable Pages with the source "GitHub Actions" (O-2 was answered later on 2026-11-08: the repository is public, D-060). Set the custom domain to `enginespace.naigap.com` and enforce HTTPS; GitHub says that option can take up to 24 hours to become available [measured from the page above, 2026-11-08]. Then set the repository variable `PAGES_ENABLED` to `'true'`. No agent calls GitHub's API or changes the repository's settings.
  - ARCHITECTURE §3.2, the README, PRODUCT.md, PLAN.md §14, TRACKER's W3-T16 and D-015 name the origin, and the comments of `vite.config.ts`, `src/main.tsx`, `src/content/load.ts` and `scripts/prepare-pages.ts` say that the base is `/` and a subpath is for a preview or a fork. The finished acceptance checks of W0-T04 and W0-T19 keep the `/enginespace/` they were built and tested under.
  - `tests/ci/workflows.test.ts` holds `deploy.yml` to the default base. `tests/pages/custom-domain.test.ts` builds the site without `VITE_BASE`, prepares it as the deploy does, serves the result as Pages does, and holds `dist/CNAME`, `public/CNAME` and this record to the same domain. The subpath tests keep `/enginespace/`.
  - The first thing that needs the site's absolute URL (a canonical link, an Open Graph tag, a sitemap, an absolute link in `llms.txt`) takes it from one constant, `SITE_ORIGIN = 'https://enginespace.naigap.com'`, beside `KERNELSPACE_ORIGIN` in `src/content/render/model.ts` or in a better home. The same test fails on a second spelling of the origin in code.
  - D-015: the main origin is decided, and a second origin would need a name of its own.
- **Revisit when:** the owner moves the site to another domain, a second origin is needed (D-015), or Pages publishes from a branch, where the custom-domain setting commits a `CNAME` file to the source branch [measured from the page above, 2026-11-08].

## The first-paint gate restored, 2026-11-08

D-059 puts back the budgets that D-053 to D-057 raised during W1, and supersedes those five records.

### D-059 · D-023's budgets stand, and the build fits them

- **Status:** proposed (W1 gates restore, 2026-11-08). It puts back D-023's budgets as the W0 exit review froze them, which needs nothing of the owner; the owner confirms the changes made to fit them. It supersedes D-053 to D-057, none of which was adopted.
- **Decision:**
  - `verify:bundle` holds the build to D-023's budgets: the front page's first-paint JavaScript to 150 KB gz (target 130 KB), and every other route, `/today` and `/m/:module` among them, to 200 KB. The 210 KB row of D-056 and its routes (`ITEM_BANK_ROUTES`, `budgetOfRoute`) are gone. `tests/bundle/budgets.test.ts` holds `BUDGETS` to D-023's values and names D-023 when it fails, so a change to any budget fails a test; the merge guard refuses a gate that is raised or added.
  - The build fits the budgets by the structural fixes that D-053 to D-057 named and left for the owner to schedule, and by one the build showed:
    1. **The entry names no page's chunk** (D-023's W1 note, D-053, D-057). Vite gave each of the entry's lazy routes the list of every chunk the page needs (`__vite__mapDeps`), so every page carried the names of every page's chunks. The entry's lazy imports now keep no list but their stylesheets, and every other lazy import keeps only the chunks that its importer has not already loaded (`build.modulePreload.resolveDependencies`). The build writes a route table beside the entry instead (`<entry>.routes.json`, `scripts/pages/route-table.ts`): a link that is hovered or focused preloads its route's chunks from it, as A§6.10 asked (`src/route-preload.ts`), and each document that `prepare-pages` writes preloads its own route's, as the front page's document does.
    2. **The item families load on demand** (D-056's "fix that ends the question"). Today and an item block plan with the families' faces (`packages/play/items/catalog.ts`) and load a family's code when they draw one of its items (`src/items/families.ts`), under the loading state of the ticket that is printing. The module page, which draws from no family, carries none.
    3. **The lessons' tables leave the content loader** (D-057). `src/content/load-lessons.ts` holds the tables of the modules, the lessons and the cards, as `load-map.ts` holds the map's, so the front page and the games, which read only the index and the claims through `load.ts`, carry no lesson's name.
    4. **The front page carries what it runs** (D-055). The tick card is apart from the two cards on S5's form (`packages/sim/steploop/s5.ts`), whose fitted rows only the full service and The Inspection read; the burst of the front page's levels is drawn without the exponential table, which only a Poisson process reads (`genFixedWorkload`, `packages/sim/workload/draw.ts`); and the front page's path into the step loop and the physics imports their files and not their barrels, through which Rollup had kept the fitted rows in the front page's chunks even once nothing on that path read them.
    5. **The game shell loads its keys dialog when it is asked for**, as the front page's does: the Keys button is there from the first paint, and the dialog's code (Radix's dialog, its focus trap and scroll lock) loads on a hover or a focus of the button, its press, or `?`.
- **Context:** all [measured 2026-11-08], gzip under Bun 1.3.14 as the gate counts it.
  - At the wave-1 tip 72f163e the front page's first-paint JavaScript was 153,808 B, `/today` 208,489 B, `/m/:module` 207,463 B, `/play/broken-bench` 200,125 B and `/play/engine-floor` 199,951 B, as `es1-merge.sh` had measured on 2026-11-05. At the tip cb7bc29 they are 153,795 B, 208,494 B, 207,469 B, 200,123 B and 199,937 B: four rows over D-023's gates and one 63 B under.
  - Each fix, applied in this order to a `vite build` of 72f163e, moved the rows by:
    1. the lessons' tables out of `load.ts`: the front page −1,050 B, `/play/broken-bench` −1,039 B, `/today`, `/map`, `/evidence` and `/play` about −1,045 B each;
    2. the cards on S5's form apart, and the imports by file: the front page −1,329 B and `/play/loop` −1,262 B; `/play/broken-bench` +432 B, which reads the rows and now has them in chunks of their own;
    3. the burst without the exponential table: the front page −3,276 B and `/play/loop` −3,269 B;
    4. the keys dialog on demand: every game's route −11,075 to −13,110 B;
    5. the families on demand: `/today` −26,847 B, `/m/:module` −26,863 B and `/m/:module/:lesson` −26,893 B; the front page and the games' routes +183 to +242 B, because the pages that draw items no longer reach `sim/core/int` and Rollup gave it a chunk apart from `rng`;
    6. no chunk in a lazy import's list that its importer has loaded: the front page −190 B, each scene −79 B, the other rows −15 to −322 B;
    7. the entry without the routes' lists, with the route table and the preloader: every row −806 to −834 B. The lists were 1,178 B of the entry, and the preloader takes about 360 B of that back.
  - On cb7bc29 with this record's tree, against D-023's gates: the entry's closure 99,153 B (10,847 B under 110 KB; 847 B under its target), the front page's first-paint JavaScript 147,337 B (2,663 B under 150 KB) and its CSS 18,469 B (11,531 B under 30 KB). The routes: `/today` 179,792 B (20,208 B under 200 KB), `/m/:module` 179,791 B (20,209 B), `/m/:module/:lesson` 137,326 B (62,674 B), `/map` 166,640 B (33,360 B), `/evidence` 166,419 B (33,581 B), `/settings` 174,733 B (25,267 B), `/design` 175,712 B (24,288 B), `/play` 134,587 B (65,413 B), `/play/broken-bench` 187,702 B (12,298 B), `/play/engine-floor` 186,153 B (13,847 B), `/play/verifier` 183,057 B (16,943 B), `/play/pool` 180,381 B (19,619 B), `/play/loop` 180,457 B (19,543 B), `/labs/:lab` 118,383 B (81,617 B), `/trace-room` 117,866 B (82,134 B), `/receipts` 117,801 B (82,199 B), `/about` 117,799 B (82,201 B) and `/changes` 117,800 B (82,200 B). The scenes are 39,559 B (`engine-floor`), 39,468 B (`loop`), 39,839 B (`pool`) and 39,564 B (`verifier`) against 40 KB. The route table is 1,426 B, read only when a link is reached for.
  - Fourteen of the pages and the games' components have chunks four to six levels deep under their own, and five have none [measured on 9b13bed with this tree, the tip before cb7bc29], so a navigation without the routes' lists would wait for them one level at a time. The route table keeps them in one round: on a hover, a focus or a document's own preloads.
- **Alternatives:**
  - Keep the raised gates. D-023's budgets are frozen and the owner's rule is that no gate is weakened. Each record had named the fix that would have ended its raise.
  - The Stage reads the reduced-motion, contrast and forced-colours preferences without the scene's tokens: −6.5 KB on the routes of Service, The Tasting and Back of House (−1.0 KB on The Reach-In's), but `scene-tokens` then counts in every scene's row, which took the four games' scenes over their frozen 40 KB (`scene-loop` 41,311 B, `scene-verifier` 41,408 B) [measured on 72f163e with fixes 1 to 3]. Not done.
  - React Router's production build, which the package ships beside its development build and does not export: −600 B on every page [measured on 72f163e]. Not done: it is reached only by a path outside the package's exports, which a re-pin could move without a word.
  - Merge small chunks: Rollup's `output.experimentalMinChunkSize` at 1,000 B took the front page +551 B and `/play/broken-bench` +1,143 B and merged three pages out of the manifest, and at 2,500 B the front page +3,486 B [measured on 72f163e with fixes 1 and 2]; one manual chunk for everything the front page shares took Rollup's dependencies of it along, the router among them, and the front page to 158,623 B [measured on 72f163e]. As D-053 and D-054 found.
  - Make Today's view, or the item block, lazy (D-056): the page's row would leave the families out and a learner would download them all right after. Loading each family when it is drawn ends the cost instead.
- **Consequences:**
  - ARCHITECTURE §6.10 and §11.1 carry 150 KB and 200 KB again, and §6.10 says how a route's chunks are preloaded; §3.2, §4.6 and §8.2 say where the routes' preloads, the lessons' tables and the families' code are. GAMES.md §3 measures Service against the restored gates.
  - A new family is a file, its place in the registry, its face in `catalog.ts` and its loader in `src/items/families.ts`: `tests/items/catalog.test.ts` fails until the four agree, and prints the face that is missing. A page that draws from it carries none of its code until it draws.
  - A new lesson adds nothing to a game's route or to `load.ts`, which the front page and the games read. Its name goes into `load-lessons.ts`, which only the module and lesson pages load, and about 50 B into the course index, which the front page awaits (D-057's figure). A new route or game adds to the route table, and not to the entry.
  - `verify:bundle` prints, without a verdict, what loads on demand that no row gates: each lazy part of a game with its route, and each other lazy part by what it adds to the entry. Service's full service is one: `route /play/loop with FullService` is 231,129 B, which would be 31,129 B over the 200 KB that every route has [measured on cb7bc29 with this tree]. Gating it, and fitting it, is the owner's to schedule.
  - What D-053 changed in the code to soften its cost stays (the keys and `levelOf` apart from the games' registry, and the registry's `GAMES` marked pure): only the five records' gates are not adopted.
  - The game pages' Keys button carries `aria-haspopup="dialog"` and `aria-expanded` itself, as Radix's trigger did.
  - Restored with this record, from the W1 audit of weakened checks: zod builds every schema jitless (`packages/schema/zod.ts`), so it no longer asks for `new Function('')`, the policy refuses nothing on any page, and the e2e watch tolerates no refusal (`KNOWN_REFUSALS` is empty, where W1 had let zod's probe onto `/today`, `/map` and every module's page); the exponential median's coverage check runs 2,000 seeds in [93%, 97%] again, as TRACKER W1-T31 asks (93.7% [measured 2026-11-08 on 72f163e]); the e2e scene spec bounds the whole scene's instances, not the moving props alone; the build test admits `src/items/Attempt.tsx` and the families' files by name as lazy parts, and no other file of `src/items`; two lint suppressions give their reason.
- **At the W1 exit (W1-T38, 2026-11-08).** Every row holds at `35d5fd3`, after W1-T15, W1-T35, W1-T36 and the documenter merged on top of this record: the front page's first-paint JavaScript is 147,678 B, 341 B more than this record measured, for the names of W1-T15's seven lessons in the course index, and `route /play/loop with FullService` reads 231,148 B [measured 2026-11-08]. The audit's findings that this record did not restore are listed in the W1 report's §9.1, and the four that need a ruling are O-13 to O-16.
- **Revisit when:** a change cannot fit a gate. It comes to the owner as a new record, and the gate does not move.

## The repository goes public, 2026-11-08

D-060 records the owner's answer to O-2, which leaves the table of open questions below, what the answer did to O-3, how the two checks that W0's report held back for the flip came out, what the history of the repository still carries, and how the first deploy went.

### D-060 · The repository is public, and GitHub Pages serves the site from it

- **Status:** owner-decided 2026-11-08.
- **Decision:**
  - `praveer13/enginespace` is public from 2026-11-08. The owner made it public, and did not take a paid plan to serve Pages from a private repository.
  - GitHub Pages is on, with the source "GitHub Actions" and the custom domain `enginespace.naigap.com` (D-058), which is verified on the owner's account. Enforcing HTTPS is the owner's step and does not turn itself on: once GitHub offers the option, the owner ticks "Enforce HTTPS" in Settings → Pages, or sets `https_enforced` through the Pages API. GitHub says the option can take up to 24 hours to become available [measured from GitHub's docs, 2026-11-08].
  - The repository variable `PAGES_ENABLED` is set when W1 is on its way to `main`, and not before: `wave-0`'s `deploy.yml` builds under `/enginespace/` [measured at 7ceb7c2, 2026-11-08], which the custom domain does not serve (D-058). The first deploy runs on the push that brings W1 to `main`, or by hand from `main`: `deploy.yml` has a `workflow_dispatch` trigger for that.
  - O-3 stays open. The owner made the repository public before deciding the licences, which supersedes O-3's default, "Nothing is published until decided." Until the owner answers O-3, enginespace's own code and content are all rights reserved: no LICENSE or LICENSE-CONTENT file exists, and no file carries an SPDX line for enginespace's own work.
- **Context:**
  - O-2 asked when the repo goes public. Its default was "Private, with the Pages plan to be confirmed by the owner", because GitHub Pages on a private repository needs a paid GitHub plan [unverified, 2026-11-03].
  - The owner added DNS records for enginespace and for statespace, both pointing at `praveer13.github.io`, and corrected a name in the same message with "statespace.naigap.com i mean". That correction names statespace's own domain and changes nothing for enginespace, so D-058 stands (O-12, answered below). The owner then asked for the site to be enabled at `enginespace.naigap.com`, and made the repository public.
  - O-3's default said "Nothing is published until decided." That sentence sat in the "Default until answered" column, which the course design wrote (4249418), and no owner answer backed it: `deploy.yml`'s header did not wait for O-3 either, and TRACKER's W3-T16 says that the repo visibility is the owner's choice. The owner's choice replaces the default.
  - Without a licence the default copyright laws apply: the owner keeps all rights to the source code, and no one may reproduce, distribute or create derivative works from it, while other users of GitHub.com have the right to view and fork a public repository [measured from GitHub's docs, https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository, 2026-11-08]. NOTICE, README.md and PRODUCT.md already said that the licences were undecided, and none claims one.
  - W0's report (§8) asked for two checks before the repository goes public: whether linking the Mooncake slice's Apache-2.0 text satisfies its section 4(a) [unverified], and the MIT labels on two agent-kit templates [unverified]. The licence audit of 2026-11-08 made both (see the Consequences).
  - With nothing deployed, the Pages API reported no certificate in the 110 minutes after the domain was set [measured 2026-11-08]. Until HTTPS is enforced the site is also served over http, and the forge's hashing fails there: a browser offers `crypto.subtle` on a secure page only (`src/forge/sha256.ts`).
- **Alternatives:**
  - O-2's default, a private repository on a paid plan [unverified, 2026-11-03]: the owner chose a public one.
  - Answer O-3 with the flip, on O-3's proposal of MIT for code and CC BY 4.0 for content [design]: a licence is the owner's choice, and one granted with a push stays with the copies made under it, while an unlicensed repository can still be licensed later [design]. The pair waits for the owner's answer.
- **Consequences:**
  - Everything committed is public, history included, and `wave-1` went up after this record, as PR #2. From now on a committed file, fixture or commit message carries no local path, no session id and no login name. The tree of `wave-1` has none, and neither has the message of any of its 233 commits [measured 2026-11-08 at 6418a20 with `git grep` and `git log`]. The task that wrote this record had found one, a scratch path in `tests/fixtures/play/broken-bench-flagged.json`, and removed it [measured 2026-11-08 at eeed409]. `tests/docs/publication.test.ts` fails on any of them in a tracked text file.
  - **`main`'s tip is clean, and history is not.** Older versions of five files carry what the rule keeps out. In AGENTS.md, docs/TRACKER.md and docs/waves/W0-report.md it is a local home path, which has the owner's login name in it. In research/upstream-vllm.md and tests/fixtures/play/broken-bench-flagged.json it is the path of a scratch folder, which has a session id and the login name in it [measured 2026-11-08 at 6418a20 with `git log -G` over the history of `wave-1`].
    - **The tip.** `main`'s tip carried the paths of docs/TRACKER.md and research/upstream-vllm.md, in its root commit 4249418, until PR #2 merged `wave-1`, which holds `wave-0`'s a4b3bdf, the commit that took them out. PR #2 merged as 9b7736c at 06:59 UTC on 2026-11-09, which is 22:59 on 2026-11-08 at the -0800 offset of this repository's commits [measured 2026-11-09 through GitHub's API; the local time is derived]. The tip carries none now: none of the 1,322 text files of its tree has a local path, a session id or the login name, and 43 binary files were not searched [measured 2026-11-09 at 1b402ca: the tree through GitHub's API, each file read from a local clone by its SHA, and searched with the pattern of `tests/docs/publication.test.ts`].
    - **The history.** `main`'s history holds the old versions of all five files, as `wave-1`'s does, and `wave-0`'s holds four of them (the fixture is from W1). PR #2 was a merge commit, with 4249418 and `wave-1`'s tip, 597433f, as its parents, and the commit where each file first carried its path is an ancestor of `main`: 4249418 for docs/TRACKER.md and research/upstream-vllm.md, 0dd073b for AGENTS.md, 5fe5192 for docs/waves/W0-report.md and a405a96 for the fixture [measured 2026-11-09 through GitHub's API, with its compare endpoint, for the commits that `git log -G` finds in the history of `wave-1`].
    - **A rewrite.** Rewriting history to remove them is the owner's call, and this record does not make it. 4249418 is the root of every branch, so a rewrite that reaches it changes the SHA of each of the 232 commits after it on `wave-1` [derived from `git rev-list --count 4249418..wave-1` at 6418a20], which the W1 report, this log and a fixture cite. It also changes `main`'s merge commits (9b7736c and 1b402ca), and so needs a force-push of `main`, and of every other branch that is pushed.
  - **The chi-square generator's history.** `scripts/tables/chi-square-critical.ts` first held (f6796c7, W1-T26) an incomplete-gamma routine whose header said that Q came from Numerical Recipes' series for P and its Lentz continued fraction. The licence audit of 2026-11-08 took it for a translation of the book's routines (finding licensing#5) [unverified against the book]: the audit worked from memory of the book, with no copy to compare against. The finding asked for the routine to be rewritten, and 72ca4e0 replaced it with one written from DLMF §8.7 and §8.9; the committed table `packages/sim/spec/critical.ts` is unchanged between the two [measured 2026-11-08 with `git diff`]. The first version stays in the history of `wave-1` and, since PR #2, of `main`. Rewriting it would change the SHAs of the 142 commits after f6796c7, which the W1 report, this log and a fixture cite [measured 2026-11-08: `git rev-list --count --ancestry-path f6796c7..6418a20`], and also `main`'s merge commits (9b7736c and 1b402ca), so it would need a force-push of `main`. The owner can still choose to rewrite it.
  - The third-party material carries its notices. `LICENSES/Apache-2.0.txt` is the Apache License 2.0 as published at apache.org, fetched on 2026-11-08 (SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`). NOTICE names the vLLM code that three files translate to TypeScript (`packages/sim/steploop/graphs.ts`, `tests/sim/graphs-oracle.ts` and `tests/sim/kv-support.ts`, each of which now begins with a header that says so and puts the Apache License on the translated parts alone, as NOTICE's section does), and the excerpts of nano-vllm, Mini-SGLang, vLLM and SGLang that the TR1 lessons, the claims and the lifecycle model quote, each project with its pinned commit, licence and copyright line. It also says which files under `vendor/kernelspace/` are enginespace's own, and the rounded-box distance of the soft shadows is credited to Inigo Quilez in `src/scene/props/materials.ts`.
  - W0's two checks are resolved. **Mooncake, section 4(a):** a name is not a copy of the licence, so the text is now in the repository (`LICENSES/Apache-2.0.txt`) and NOTICE's Mooncake bullet points at it and at apache.org. Mooncake has no NOTICE file at the commit that the slice is cut from (`b82b9f86ceb67bb809339b9088085f34329683bb` [measured 2026-11-08]), so section 4(d) has nothing to carry. **The MIT labels on the two agent-kit templates:** the licence audit found that the files under `labs/agent-kit/` are renames of the vendored files (`git log --follow` reaches the vendoring commit 654f2ce for all four [measured 2026-11-08 at eeed409]), that VENDOR.md's label is kernelspace's own classification of its configuration (its README puts code, tests and configuration under the MIT License and documentation under CC BY 4.0 [measured at kernelspace d478f91, 2026-11-08]), and that the files are the owner's own, so no third party's terms are involved. W0's report keeps its text.
  - The documents that said the repo is private, or that nothing is live, say what is true now: README.md, PRODUCT.md, PLAN.md, ARCHITECTURE (the tree, §9.3, §10.1 and the list of unverified mechanics) and W1's report; D-007, D-026, D-031, D-052 and D-058 point here. `deploy.yml`'s header says where each step that turns the deploy on stands. `scripts/pack-labs.ts` and `labs/forge/README.md` no longer give the repository's privacy as the reason the zips are committed. The notes of `ci.yml` and `nightly.yml` about a private repository's runner are dated measurements, and stay as they were written.
  - **The first deploy.** The deploy ran first on the push of PR #2's merge to `main` (9b7736c), and failed twice there, at `bun run test`: two tests ran past Bun's limit of 5 s for a test that sets none (5.28 s and 5.16 s in the first attempt, and one of them again in the second, at 9.68 s) [measured 2026-11-09 through GitHub's API: the logs of the two attempts]. PR #3 set that limit to 30 s [estimated], and merged as 1b402ca. The run on 1b402ca then failed twice at "Set up pinned Bun", because GitHub's release download of Bun 1.3.14 answered HTTP 504, while GitHub's status page had an incident open ("Increased timeouts due to surge in anonymous users") whose updates name 504 errors on release downloads [measured 2026-11-09: the logs of the two attempts, and https://www.githubstatus.com/api/v2/incidents.json]. PR #4 is still open, and proposes to install the pinned Bun from npm when that download fails [measured 2026-11-09 through GitHub's API]. The third attempt of that run succeeded, and its deploy job finished at 08:09 UTC, so the first deploy that succeeded ran from `main` at 1b402ca on 2026-11-09 [measured 2026-11-09 through GitHub's API]. The custom domain answers over http, from GitHub.com, and the Pages API reports no certificate and `https_enforced` false [measured 2026-11-09]. Enforce HTTPS is still the owner's step, or the orchestrator's when the owner asks for it, once GitHub issues the certificate.
  - The kits still ship as static downloads (D-007), now by design: a learner may clone the repository, and the site serves the same zips. Whether to turn the nightly on (D-052) is still the owner's call.
  - `tests/docs/publication.test.ts` holds `LICENSES/Apache-2.0.txt` to apache.org's bytes, NOTICE to the pins at which the lessons, the claims and the lifecycle model quote the four projects, the three translated files to their headers, the documents to what this record says (the records that it names as pointing here do point here, it does not call history clean, it says that `main`'s tip is clean while its history is not, and it says how the first deploy went), and the tracked text files to the search above. `tests/docs/custom-domain.test.ts` expects O-1, O-2 and O-12 out of the table of open questions, and `tests/ci/workflows.test.ts` expects the deploy to run on a push to `main` and by hand.
- **Revisit when:** the owner answers O-3 (LICENSE and LICENSE-CONTENT, NOTICE, README.md, PRODUCT.md and the NOTICE text of the lab zips in `scripts/pack-labs.ts` then change, and the zips are packed again), moves the site off GitHub Pages, or makes the repository private again.

---

## Scripts and tests are type-checked, 2026-11-09

D-061 closes the item that W0's report left open and W1's carried: `scripts/` and `tests/` were linted and never type-checked.

### D-061 · `scripts/` and `tests/` are type-checked, against a declaration of the parts of Bun that they call

- **Status:** proposed (W1b-T14, 2026-11-09). It adds no dependency, so it needs nothing of the owner; the owner may still prefer `@types/bun` (Alternatives).
- **Decision:**
  - `npm run typecheck` (`tsc -b`) builds a fourth project, `tsconfig.tools.json`, that holds `scripts/` and `tests/`. It extends `tsconfig.app.json`, so the strictness is the app's (strict, no unused locals or parameters, erasable syntax only, verbatim module syntax), and it adds Node's types, the DOM lib and Vite's ambient types, since both folders import `src/` and the packages and the project reads those too.
  - Two files are outside it: `tests/fixtures/design/readout-untagged.tsx` and `readout-ticks-not-synthetic.tsx`, which `tests/design/readout.test.ts` compiles and expects to fail. `tests/config.test.ts` holds the project's options and its two lists, and that every other TypeScript file under the two folders is in the program.
  - `@types/bun` is not added. `scripts/types/bun.d.ts` declares `bun:test`, the `Bun` global (`sleep`, `file`, `serve`, `spawn`, `CryptoHasher`), `HTMLRewriter` and `import.meta.dir`, as far as the two folders call them, and a call to anything else is a type error that names it. A matcher takes `unknown` where Bun's own take the type of the value under test, so a test that passes at run time does not fail to compile for how it spells its expectation.
  - Where the compiler is told to look away, the line says why. In `src/`, `packages/` and `scripts/` a cast through `unknown` has a comment on its lines, a `@ts` directive says why after it, and an `eslint-disable` says why after ` -- ` (so does any explicit `any`, which cannot be written without one); `tests/lint/casts.test.ts` holds it. Of the seven sites that gave no reason (W1-report §9.1, A21 and A22), six need no cast now: `MarkEntry` and `StoredAnswer` are JSON as the compiler reads JSON, the balk's point is built axis by axis, `Palette.colorOf` gives the glaze without the `null` geometry that a cast had passed, the camera rig's target never needed one, and Service's two sessions are assignable to `AnySession` as they are. The seventh, the vectors file that `verify:items --write` made, carries its reason, and so do four casts whose reason sat in a comment above them.
- **Context:**
  - W0's report (§8): "`scripts/` and `tests/` are linted but not type-checked, because no tsconfig covers them and Bun's types are not in A§14". W1's report (§12) carried it as inherited and still open, and W1b-T14 is the task.
  - The first run over both folders, with the declaration as it stands, found 85 errors in 40 files [measured 2026-11-09 at cdffd3e]. Most were small: a literal checked as an object where a variable would not be, `readonly` where a callback wants a mutable tuple, a parameter property that `erasableSyntaxOnly` refuses, an optional value that a test then reads, a `Buffer` whose backing store is not known to be unshared. None changed what a test asserts. Two fixes touched what a fake does and not what it asserts: a store that the engine opens read-only now implements the rest of `LedgerStore` too (the spread that built it had copied fields and no methods), and a path that a test popped is read with `.at(-1)`.
  - Bun's own typings take the type of the value under test: `toBe(expected: T)`, `toEqual(expected: T)`, `toStrictEqual(expected: T)` and `toContain(expected: T extends Iterable<infer U> ? U : T)` [measured 2026-11-09 from `packages/bun-types/test.d.ts` at the tag `bun-v1.3.14`, https://raw.githubusercontent.com/oven-sh/bun/bun-v1.3.14/packages/bun-types/test.d.ts].
- **Alternatives:**
  - `@types/bun`, pinned exactly [design]: it tracks Bun's releases, and it types the matchers by the value under test, which finds more and costs casts in tests that pass at run time. It is a dependency, and A§14 asks a record and an exact pin for one. If the owner wants it, A§14 and `package.json` take it and `scripts/types/bun.d.ts` goes.
  - One project for each folder [design]: both import the app, so each would read it again, and `tests/` imports `scripts/` besides.
  - Leaving the two fixtures in and excluding nothing: the type checker would fail on the two files that exist to make it fail.
  - Leaving `tests/` out and checking `scripts/` alone: `scripts/` is what the gates run, and `tests/` is what holds the gates.
- **Consequences:**
  - `tsc -b` took about 9 to 11 s before and takes about 17 to 19 s now [measured 2026-11-09 at cdffd3e, and with this task's changes, wall-clock on a laptop that other jobs shared]. The fast gate's budget is under 5 minutes [estimated, A§10.2].
  - The tests that were wrong for the compiler were mended in their types (a typed variable in place of a literal, `Level` where a block's level is a number, children in props where a component requires them), and `src/routes.tsx` types its table as routes that are not index routes, which every copy of the shell route needed.
  - `e2e/` and `playwright.config.ts` are still not type-checked: under the same options they give 31 errors in 19 files [measured 2026-11-09 at cdffd3e], 20 of them from axe's copy of Playwright's `Page` type, which is not the specs' copy. That is a task of its own.
- **Revisit when:** `@types/bun` is added to A§14, the suite calls a part of Bun that the declaration lacks and the declaration grows past what a file of types should be, or `e2e/` is brought into the check.

---

## Open owner questions

| # | Question | Default until answered | Needed by |
|---|---|---|---|
| O-3 | The content licence, and the code licence | Until answered, enginespace's own code and content are all rights reserved: no licence is granted. The proposal is kernelspace's pair: MIT for code, CC BY 4.0 for content. The owner made the repo public on 2026-11-08, before deciding (D-060), which supersedes the old default, "Nothing is published until decided." | W3-T15 |
| O-4 | Confirm the edition-1 pins (D-035), including the R580 driver gate on the owner's GPUs and on the rental hosts | vLLM v0.33.0 (v0.32.0 if the gate fails), SGLang v0.5.23 | W1-T02 |
| O-5 | Reference traces: which GPUs, how many, and the owner's GPU spend | 6-10 traces on a 4090 and an H100 [estimated], as the catalog's TR3 artifact says | W2-T21 |
| O-6 | The capstone's three commit pairs with a known delta | none; the capstone waits | W3-T01 |
| O-7 | Whether the 2026-10-24 pick-form gate still applies (D-040) | It does not gate this repo | W0-T24; carried over to the `wave-0` merge |
| O-8 | Owner review capacity per week for W0-W3 | kernelspace's 10 h/week cap (PLAN-100X OD11) | W0-T24; carried over to the `wave-0` merge |
| O-9 | The reference laptop and phone for frame-time checks | The owner's own devices, named in W0-T24's record | W0-T24; carried over to W1-T38, and by W1-T38 to W2-T41 |
| O-10 | Whether grader-attested correctness counts at full weight. ASSESSMENT.md owns this; it is listed here because it is the owner's call. | Full weight when every browser-runnable check also passes | W2-T08 |
| O-11 | Whether D-004 is met by a front page that is playable in 2D from the first paint and becomes 3D within seconds on a capable device (D-023) | Yes | W0-T18 |
| O-13 | A§6.6 allows no shadow-casting light at T1 and T2 and one at T3; scene kit v1 allows 3 at T2 and 4 at T3, and the test titled with A§6.6's numbers was rewritten to match (W1 report §9.1, A1). Amend A§6.6 by a record, or restore the limit, which takes the heat lamps' shadows away at T2 | The build's values, until the owner rules | the W2 scene-kit task (W1 report §7.4) |
| O-14 | ASSESSMENT §4.1 holds the best scene-blind strategy to 15% of single seeds, which no choice item of 6 or fewer options can meet (chance alone is at least 1/6). `verify:items` holds a choice item to the larger of 15% and chance plus three standard errors (A5). Rule in ASSESSMENT, or redesign the families with 7 or more options | The gate's reading | the next item family (W1 report §5) |
| O-15 | ASSESSMENT §4.6 and §13 want the nominal 95% bootstrap interval to cover within [93%, 97%] over 2,000 seeds, nightly. On a p99 of 1,000 rows it covers 92.6% [measured 2026-11-04 by W1-T31], and the 2,000-seed check on the p99 runs only under `ES_HEAVY=1`, which no workflow sets (A2). Raise the rows a p99 interval needs, widen the band, or take an exact order-statistic interval | The medians hold the band; the p99's check is opt-in | W2-T08 |
| O-16 | Service's full service loads on demand, and no row gates it: `route /play/loop with FullService` is 231,148 B, 31,148 B over the 200 KB that a route has [measured 2026-11-08 at 35d5fd3] (A4, D-059). Fit it, or decide by a record, before a row gates it | Printed, not gated | the next task that changes Service |
| O-17 | ASSESSMENT §4.3 grades `loop/graphs` (stages `sizes` and `modes`) and `loop/mask`, and §9 counts them for TR2's and TR6's browser-complete; W1 built them as practice, and `mask`'s graded task is the item family `tr6.mask-fits` (GAMES.md §3.2). Build graded replays of the levels, or amend ASSESSMENT to what was built | As built | the task that derives module completion (Q-5) |
| O-18 | W1-T27 rewrote ASSESSMENT §4.5's row for `rejection-sampler` to five required checks (four exact, and the chi-square), where it named the chi-square alone. Confirm, or make the four exact checks practice | Five required checks, as built | W2-T35 |

**Answered.** O-1, the custom domain, was answered by the owner on 2026-11-08, and its row has left the table: the site is served at `https://enginespace.naigap.com` (D-058). Two more were answered the same day, and their rows have left the table too:
- **O-2**, when the repo goes public: the repo is public, and GitHub Pages is on, with the source "GitHub Actions" and the custom domain `enginespace.naigap.com` (D-060). O-3 is still open, and its default, that nothing is published until decided, is superseded.
- **O-12**, which domain the owner's message of 2026-11-08 concerns: the owner's full message said that they had added DNS for enginespace and for statespace, both pointing at `praveer13.github.io`, and then added "statespace.naigap.com i mean". That correction names statespace's own domain, and it changes nothing for enginespace. D-058 (`enginespace.naigap.com`) stands, and the owner then asked for the site to be enabled at it (D-060).

**Carried over by the W0 exit review (W0-T24, 2026-11-04).** The owner has answered none of O-7, O-8 and O-9, so each keeps its default and moves to a later deadline ([docs/waves/W0-report.md](waves/W0-report.md) §7.3):
- **O-7.** W0 ran on the default, and no W0 task waited for demand data. W1 starts after W0-T24, so the answer is needed by the `wave-0` merge.
- **O-8.** W0's PR adds 74,824 lines outside the lockfile, the vendored copies, the fonts, the screenshot baselines, the test fixtures and the posters: 39,658 of code and 32,453 of tests [measured 2026-11-04, `main` 4249418 to `wave-0` 0512837]. 18 of its 19 S and M tasks went over the tracker's line bounds, by 1.2 to 8 times [derived]. A 10-hour week cannot read that line by line, so the answer shapes how W1 is sized and reviewed.
- **O-9.** No file this review could read names the owner's laptop or phone, and the review does not invent them. The lab profile ran on the owner's dev desktop, which is neither (the report, §2), so A§11.1's by-hand frame-time budgets are unmeasured. The answer is needed by W1-T38, the next exit that checks frame time by hand.

**Carried over again by the W1 exit review (W1-T38, 2026-11-08).** O-7 and O-8 wait on the `wave-0` merge, which has not happened, and O-9 is still unanswered, so W1's exit measured no frame time on a reference device either ([docs/waves/W1-report.md](waves/W1-report.md) §2). O-9 moves to W2's exit review, W2-T41. For O-8, W1 added 170,253 lines in 997 files [measured, `wave-0` 7ceb7c2 to `wave-1` 35d5fd3], and every one of its S and M tasks went over the tracker's line bound (the report, §11). O-12 to O-18 are new: each is a change that W1 made without a record, or a question that W1 left, and each says what it needs. O-12 was answered later the same day (above).

## Course-design questions

Q-1 to Q-8 come from [PLAN.md](PLAN.md) §14, and Q-9 to Q-12 from ASSESSMENT.md §14 and GAMES.md §15. Three are now proposed decisions; the rest stay open with their defaults.

| # | Question | Default until answered | Status | Needed by |
|---|---|---|---|---|
| Q-1 | Are H100 stages required for module completion (TR4's s4, an H100 target in TR7, an H100 side in the capstone)? | No: they earn their own KCs at full weight, and completion never requires renting an H100 | open, owner | W2-T26 |
| Q-2 | Where does S5's host term t_seq go? | The CPU lane, labelled an extrapolation | proposed as D-044 | W1-T12 |
| Q-3 | The front page's levers | GAMES.md §3.1's manual batching and overlap | proposed as D-043 | W0-T16 |
| Q-4 | Does a flag pair at one vLLM version count as a "pinned commit pair" for the capstone? | Yes, if the owner agrees | open, owner | W3-T01 |
| Q-5 | Is a `proved` event required for a module to count as complete (ASSESSMENT §9)? | Yes | open, owner; W1-T06 derives no completion state yet, since no exit-ticket or Prove-it event exists (W1-T38) | the task that derives module completion |
| Q-6 | Are AMD (ROCm), Apple and other non-NVIDIA GPUs out of scope for edition 1? | Yes | open, owner | W2-T04 |
| Q-7 | Tie-aware identity in place of strict token identity | Tie-aware | proposed as D-046 | W2-T35 |
| Q-8 | If no flash-attn build installs for nano-vllm on torch 2.14 and CUDA 13 (vllm U3), is Mini-SGLang TR1's fork target? | Yes | open; W2-T34 tests the install | W2-T34 |
| Q-9 | `gpu-verified` and `gpu-unverified` also cover the L lane (TR0 runs on a CPU). Rename them `receipt-verified` and `receipt-unverified`? | Keep the names; ASSESSMENT §2 says the L lane uses them | open; ARCHITECTURE §7.3 owns the names | W0-T10 |
| Q-10 | Who runs the dispatcher golden-table script at the pinned vLLM tag, and on what host (GAMES.md §15, question 3)? | The owner, on a CPU, as part of W1-T12's acceptance; whether a CPU-only run is enough is [unverified] | open, owner; W1-T12 shipped `scripts/tables/vllm-dispatch.py` and the 6,400 cases it runs for each dispatcher, and the run has not happened (`DISPATCH_TABLES.status` is `waiting`, and so is W1-T13's `keys` level); still open at the W1 exit (W1-T38) | W1-T12 |
| Q-11 | Keep Dispatch (TR4) as a game, or fold it into plain items (GAMES.md §7)? | Keep it; it drops without loss if the owner prefers items | open, owner | W2-T25 |
| Q-12 | Run a pre-registered, opt-in, on-device comparison of one flagship's 3D view against its 2D view in W3 (D-005's revisit)? | Not scheduled; TRACKER has no task for it | open, owner | W3 |
