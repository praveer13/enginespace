# enginespace

**Open vLLM and keep reading.** enginespace is the Engine Internals specialisation of [kernelspace](https://github.com/praveer13/kernelspace): a zero-server, browser-first course that goes one layer down from kernelspace's serving tracks, from the serving system into the engine itself.

> **Status: design.** The course design is written and under the owner's review (2026-11-03). The site and the games are being built, the browser-only modules first. Nothing here is live yet.

## What it is

You play the engine before you read it. In a seeded world, you are the scheduler, the KV allocator, the profiler and the verifier, and each game's rule is the concept it teaches. Then you prove the same skill on the real [vLLM](https://github.com/vllm-project/vllm) and [SGLang](https://github.com/sgl-project/sglang), on your own GPU or a rented one, with a local grader whose receipts your browser checks, with no server anywhere.

The course makes four promises:
1. **Trace one request** through vLLM and SGLang.
2. **Attribute every microsecond** of a token's latency (TPOT).
3. **Benchmark the engine honestly.**
4. **Land one upstream contribution** backed by evidence.

## Who it is for

A backend engineer who has finished kernelspace's serving track, T5 (lessons T5.L1-T5.L10), which is a hard prerequisite. You are Rust-first, so the course teaches enough PyTorch to read vLLM and SGLang, and no more. You study alone, on a laptop with the site open, and run GPU work on a local GPU or a rented one (RunPod, Modal, Lambda and similar).

ML engineers who already run vLLM can take it too, but it is not designed around them.

## What you will be able to do

1. Trace a request from the API server to the model runner, naming every queue, copy and sync.
2. Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it.
3. Implement a hybrid KV manager with adapter pages, the engine side of the KV connector and event contracts, and an exact rejection sampler.
4. Benchmark open loop with confidence intervals, and land one upstream artifact under the project's AI-disclosure rules.

## How it works

**The loop.** Every module runs Predict → Play → Build → Prove → Keep, kernelspace's learning loop:
- **Predict:** commit a number before the reveal.
- **Play:** play the mechanism by hand in the seeded world, then read the debrief against a hidden reference.
- **Build:** make it real, in Rust graded in your browser, or on the real engine graded by the local grader.
- **Prove:** defend it on fresh seeds with your coding agent closed.
- **Keep:** retrieve it later in Today, a 10-12-minute review [estimated] regenerated on fresh seeds.

**Three lanes.**
- **Browser:** lessons, games, items and the Rust forge labs, graded in the tab on seeds drawn when you start.
- **Local:** CPU work on your laptop (TR0's forward pass), graded by the local grader.
- **GPU:** labs on your own or a rented GPU, graded by the local grader. Its receipt is bound to a challenge your browser issued, and the browser re-checks it from the raw traces and logs.

**The games.** Nine games, one for every module except TR7 and the capstone, six of them in 3D, each 3D game with a 2D path, keyboard control and reduced motion. The learner sees each game's kitchen name (the look is The Pass, D-047) over its engine concept (D-049): Service (the step loop, on the front page), Sheet Pan (tensor views and copies), Back of House (a request's lifecycle), The Tape (trace attribution), Line Check (attention backend selection), The Reach-In (hybrid KV pages and adapters), The Dumbwaiter (KV offload, connector and events), The Tasting (speculative decoding's verifier) and The Inspection (benchmark methodology). The design docs keep the working names as shorthand (The Loop, Shape Shifter, The Engine Floor, Gap Hunt, Dispatch, The Pool, The Switchyard, The Verifier and Broken Bench), and [docs/GAMES.md](docs/GAMES.md) §0 maps the display names, the working names and the ids.

**The world.** The Trace Room puts a seeded step-loop simulator beside real engine traces that the owner captures on real GPUs, pinned by SHA-256 and dated. The owner has not captured any yet (2026-11-03), so until then the room shows traces labelled synthetic. Every simulated world says what it models and what it ignores, and the real engine is the final judge.

**The currency is evidence.** Credit comes from checks you cannot fake by typing a number: fresh seeds, references on your own machine, and performance evidence that must agree with itself and with physics. Clicks earn nothing. No LLM grades anything, and no server is involved.

## The modules

| Module | | Hours |
|---|---|---|
| [TR0](curriculum/TR0-pytorch-for-rust.md) | PyTorch for the Rust-first, and reading Triton | 7 |
| [TR1](curriculum/TR1-read-the-engines.md) | Read the engines: nano-vllm, Mini-SGLang and "Inside vLLM", mapped onto the pins | 10 |
| [TR2](curriculum/TR2-the-step-loop.md) | The step loop: async scheduling, the MRV2 delta, CUDA graphs and their dispatch keys | 10 |
| [TR3](curriculum/TR3-profile-a-real-engine.md) | Profile a real engine: the torch profiler, Perfetto and nsys graph traces | 12 |
| [TR4](curriculum/TR4-backends-as-a-consumer.md) | Attention backends as a consumer: FlashAttention 2, 3 and 4, FlashInfer and FlashMLA | 7 |
| [TR5a](curriculum/TR5a-hybrid-kv-and-adapter-pages.md) | Hybrid KV groups, and adapter pages in one pool | 6 |
| [TR5b](curriculum/TR5b-offload-connector-events.md) | Offload, the KV connector's engine side, and the event publisher | 8 |
| [TR6](curriculum/TR6-speculation-and-structure.md) | Speculation and structure: the exact rejection sampler, proposers, and the grammar mask's overlap | 8 |
| [TR7](curriculum/TR7-contribute-honestly.md) | Contribute honestly: reproduce a published number, and file it under each project's rules | 6 |
| [TR8](curriculum/TR8-benchmark-like-you-mean-it.md) | Benchmark like you mean it: open loop, coordinated omission, warm-up, and intervals on p99 | 5 |
| [Capstone](curriculum/CAPSTONE.md) | Reproduce a commit pair's delta, attribute it, explain it, and price it | 12 |

About 91 hours in all [estimated]; the hours in the table are estimates too. The browser parts of TR1, TR2, TR5a, TR6 and TR8 need no GPU and ship first.

## What it costs

The site needs no account, and nothing you do leaves your device unless you export it. The GPU half needs about 35 hours on an RTX 4090-class GPU and 6-8 hours on an H100 [estimated]: roughly $24-54 at RunPod's prices as read on 2026-11-03 [derived], or nothing on your own GPU. GPU work needs an NVIDIA driver of R580 or newer for the pinned vLLM's CUDA 13 wheels [measured from vLLM's install docs at v0.33.0, 2026-11-03]. Details, sources and alternatives are in [docs/PLAN.md](docs/PLAN.md) §10.

## The pins

The course pins one vLLM minor and one SGLang minor and re-pins them each quarter. The proposed edition-1 pins are vLLM v0.33.0 and SGLang v0.5.23, with nano-vllm, Mini-SGLang and "Inside vLLM" (commit `42172ad`) pinned as reading targets. Every number in the course is a claim with a source, a date and an expiry, and a number that moves raises a change card.

## Run it

The site is one Vite app (React 19, TypeScript, Tailwind) with one `package.json` and one lockfile. `npm` installs and builds, and [Bun](https://bun.sh) runs the tests and the scripts, so install both. The pinned toolchain is Node 24 and Bun 1.3.14 (ARCHITECTURE §10.3, read from kernelspace's CI [measured 2026-11-03]).

```sh
npm ci              # install the exact pins in package-lock.json
npm run dev         # the dev server, with hot reload
npm run lint        # ESLint
npm run typecheck   # tsc -b: the app, the Node-side configs, and the pure packages (no DOM)
npm test            # bun test: the unit and build tests in tests/
npm run build       # typecheck, then vite build into dist/, with dist/.vite/manifest.json
npm run preview     # serve dist/
```

The gates that check more than lint, the type checker and the tests live in one registry, `scripts/verify.ts`, and CI runs the same ones on every pull request (ARCHITECTURE §10.2). A gate whose script is not built yet prints `pending: <task>` and exits 0, so the run passes while the site is half built.

```sh
npm run verify:all           # every gate; each pending one names the task that builds it
npm run verify:determinism   # packages/sim and packages/play: no clock, no entropy, no engine-dependent Math (ARCHITECTURE §5.1)
npm run verify:boundaries    # the import fences of ARCHITECTURE §2.3, and no static path from src/main.tsx to three
npm run verify:content       # content/: schemas, ids, links and sizes, each problem with its file and line (verify:claims and verify:numbers check the facts and the tags)
npm run verify:routes        # the route table, prepare-pages and the e2e route list agree: a route that cannot be enumerated fails (ARCHITECTURE §3.2)
bun scripts/verify.ts list   # each gate with its stage, whether it is live or pending, and the task that builds it
```

The lessons, claims and knowledge components live in `content/`. `bun scripts/content/build.ts` compiles them into `src/content/generated/` (git-ignored), `public/md/`, `public/llms.txt` and `public/claims.json` (ARCHITECTURE §4), and `npm run dev` and `npm run build` run the same compiler, so an edit to a lesson reloads it in the dev server.

Every dependency is pinned to an exact version, with no `^` and no `~`, and the pins are ARCHITECTURE §14's table. A test compares `package.json` with that table. GitHub Pages serves the site under `/enginespace/` until a custom domain is chosen, so the deploy builds with `VITE_BASE=/enginespace/ npm run build`, and then runs `bun scripts/prepare-pages.ts` under the same base. Pages has no rewrite rules, so that script writes a document for every route it can enumerate (the route table, the course index, the game registry and the lab list), each with its own title, description and static shell, and a `404.html` that boots the app for every other address (ARCHITECTURE §3.2). Every document carries the meta CSP of ARCHITECTURE §12, which the build adds as the first element after `<meta charset>`, and the script fails unless each one does.

Working in a git worktree, or with a coding agent? Read [AGENTS.md](AGENTS.md) first. In a worktree, `node_modules` is hard-linked from the main checkout instead of installed (its rule 2), so `npm ci` is not the first step there.

## What is in this repository

| Path | What |
|---|---|
| [PRODUCT.md](PRODUCT.md) | the product record, confirmed by the owner on 2026-11-03 |
| [AGENTS.md](AGENTS.md) | the rules for the coding agents that build the repository: the tracker's agent brief, worktrees and merging, the gates, the sibling repos, pins and tags |
| [docs/PLAN.md](docs/PLAN.md) | the master plan: structure, loop, grading and world in brief, cost, upkeep, build waves, risks, open decisions |
| [curriculum/](curriculum/) | one design file per module and the capstone |
| [docs/ASSESSMENT.md](docs/ASSESSMENT.md) | the grading model: browser checks, the local grader and its receipts, consistency checks, Prove-it, cheating, what is never graded |
| [docs/WORLD.md](docs/WORLD.md) | the Trace Room: the seeded engine world, the trace corpus, calibration, the notional-machine cards |
| [docs/GAMES.md](docs/GAMES.md) | the games |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the site, the simulation package, the game framework, the grader, CI and budgets |
| [docs/DECISIONS.md](docs/DECISIONS.md) | the decision log and the owner's open questions |
| [docs/TRACKER.md](docs/TRACKER.md) | the build tasks, wave by wave |
| [research/](research/) | the dated upstream research behind the pins and claims |
| [src/](src/) | the app: the shell, the route table (`src/routes.tsx`), a page for each route (most are stubs until their tasks land), and `src/content/`, which loads the compiled content and draws the module and lesson pages as tickets, tape labels and the printer's tape |
| [content/](content/) | the course's words and data: `course.yaml` (the modules and their hours), `modules/<id>/` (a `module.md` and its `lessons/`), `claims/` (dated, sourced facts) and `kc/graph.yaml`. `scripts/content/` compiles them (ARCHITECTURE §4) |
| [packages/](packages/) | the five internal packages (`sim`, `play`, `ledger`, `schema`, `verify`), skeletons until their tasks land. `sim` and `play` compile without the DOM (`tsconfig.pure.json`) and obey the determinism lint. ESLint and `verify:boundaries` fence what each package may import |
| [scripts/](scripts/) | the gate registry (`verify.ts`), the gate scripts it runs, the content compiler (`scripts/content/`), and the build's page tooling: `prepare-pages.ts` and the meta CSP, the plan of documents and the document rewriter in `scripts/pages/` |
| [vendor/](vendor/) | files copied from kernelspace at d478f91 and never edited in place; `vendor/kernelspace/VENDOR.md` lists each one's SHA-256 (ARCHITECTURE §13) |
| [NOTICE](NOTICE) | the third-party notices that travel with the vendored files |
| [.github/workflows/](.github/workflows/) | CI: `ci.yml` for pull requests, `deploy.yml`, `nightly.yml` and `labs.yml` (ARCHITECTURE §10.1) |
| [tests/](tests/) | the Bun tests: the dependency pins, the routes, the configuration, the build's chunking, the lint fences and gates (`tests/lint`, with their bad files in `tests/fixtures/lint`), the CI workflows and the gate registry (`tests/ci`), the content compiler and its gates (`tests/content`), the vendored code (`tests/vendor`), and these documents (`tests/docs`) |
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `tailwind.config.ts` | the toolchain, on kernelspace's versions |

## The family

enginespace is a kernelspace specialisation, and it refers to kernelspace's lessons, labs and plays by their ids, such as T5.L7 and lab 06. [statespace](https://github.com/praveer13/statespace) is a sibling course by the same owner. The licences are still to be decided; kernelspace uses MIT for code and CC BY 4.0 for content.
