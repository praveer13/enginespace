# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- **Site:** Vite, React 19 and TypeScript, with Three.js through react-three-fiber for the 3D games, styled with Tailwind. This is the same toolchain as kernelspace, so its patterns carry over. Tests run on bun.
- **Hosting:** a static build on GitHub Pages, with no servers behind it. The site's origin is `https://enginespace.naigap.com`, which the owner chose on 2026-11-08 (D-058). GitHub Pages is on for the repository, with that custom domain (2026-11-08, D-060), and serves the site once a push to `main` deploys it.
- **Repo:** `praveer13/enginespace`, public since 2026-11-08 (D-060). Until the licences are decided (O-3), enginespace's own code and content are all rights reserved.

The owner confirmed these on 2026-11-03, apart from the origin and the repo's visibility, which carry their own dates.

## Users

The learner is a kernelspace graduate: a backend engineer who has finished kernelspace's serving tracks.

- **Prerequisite:** T5 (LLM serving) is a hard prerequisite.
- **Background:** they are Rust-first, so the course teaches enough PyTorch to read vLLM and SGLang, and no more.
- **Setting:** they study alone. They work on a laptop with the site open, and run GPU work on a local GPU or a rented one (RunPod, Modal, Lambda and similar).
- **Not the primary audience:** ML engineers who already run vLLM and want the internals. They can take the course, but it is not designed around them.

## Product Purpose

enginespace is the Engine Internals specialization of kernelspace. It goes one layer down from kernelspace's serving tracks, from the serving system into the engine itself. The course promise has four parts:
1. Trace one request through vLLM and SGLang.
2. Attribute every microsecond of a token's latency (TPOT).
3. Benchmark the engine honestly.
4. Land one upstream contribution backed by evidence.

Success is the learner reaching the course's four outcomes:
1. Trace a request from the API server to the model runner, naming every queue, copy and sync.
2. Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it.
3. Implement a hybrid KV manager with adapter pages, the engine side of the KV connector and event contracts, and an exact rejection sampler.
4. Benchmark open-loop with confidence intervals, and land one upstream artifact under the project's AI-disclosure rules.

The source specification is `kernelspace/SPECIALIZATIONS.md` §3.5 (an untracked file in the kernelspace checkout), as amended below.

## Positioning

- **The gap it fills.** Free material already explains vLLM: nano-vllm, Mini-SGLang, the "Inside vLLM" post and the vLLM docs. None of it is graded, and none of it makes you run the engine's decisions yourself.
- **How enginespace teaches.** The learner plays the engine before reading it. They are the scheduler, the KV allocator, the profiler and the verifier, in a seeded world where each game's rule is the concept being taught. Then they prove the same skill on the real vLLM and SGLang, on a GPU.
- **The currency is evidence.** Credit comes from checks the learner cannot fake: fresh seeds in the browser, reference comparisons on the GPU, and traces whose numbers must agree with each other. Clicks earn nothing.

## Operating Context

- **Modules:** TR0-TR8 plus a capstone, about 91 learner hours.
- **Prerequisite:** kernelspace T5 L1-L10.
- **Where it builds on kernelspace:**
  - T0.L6's "scheduler tax", NCCL stall and KV-copy surprise;
  - the scheduler play;
  - labs 06 (the batching scheduler) and 07 (the radix cache), and their twins;
  - the broken-benchmark and knee exercises;
  - the BurstGPT field lab.
- **Three lanes of work:**
  - in the browser;
  - local work on a laptop;
  - GPU work, on the learner's own GPU or a rented one.
  The owner decided on 2026-11-03 that GPU work can be graded. This amends the catalog rule that gave field evidence weight 0.
- **Pinned upstreams:**
  - The course pins one vLLM minor and one SGLang minor, and re-pins them each quarter.
  - The reading targets are pinned too: nano-vllm, Mini-SGLang, and "Inside vLLM" at commit 42172ad.
- **Reference traces:** they are captured by the owner on real GPUs, pinned by sha256 and dated.
- **Learner GPU cost:** about $24-54 for the whole course (about 35 hours on a 4090 plus 6-8 H100 hours, at RunPod prices checked 2026-10-23).

## Capabilities and Constraints

- **No servers, nothing collected.**
  - No always-on servers, no telemetry, no accounts.
  - Progress stays on the learner's device and can be exported.
- **Credit comes from deterministic checks only:**
  - browser checks on seeds drawn at grade time;
  - a local grader, run on the learner's GPU, that checks correctness against reference outputs;
  - performance evidence (a trace or a benchmark output) that is checked for internal consistency, not trusted as a self-reported number.
  - There is no LLM-graded credit, no grading server, and no graded browser timing.
- **The browser world is a model.** Every simulated world carries a card saying what it models and what it ignores. The real engine is authoritative.
- **Every number is a claim with a source, a date and a TTL.** A number that moves raises a change card.
- **Upstream contributions** follow each project's rules. vLLM's guidelines say "Do not submit 'pure agent' PRs".
- **Undecided:**
  - the licences of enginespace's own code and content (kernelspace uses MIT for code and CC BY 4.0 for content). Until they are decided, both are all rights reserved.

## Brand Commitments

- **Name:** enginespace, chosen by the owner on 2026-11-03 to sit beside kernelspace.
- **Family:** it is a kernelspace specialization. It may refer to kernelspace's lessons, labs and plays by their ids, such as T5.L7 and lab 06.

## Evidence on Hand

- **Course specification:** `kernelspace/SPECIALIZATIONS.md` §3.5 gives the modules, hours, artifacts, resources, career and durability notes. §4 covers the topics this course owns, and §7 the evidence rules.
- **Market research from 2026-10-24** is not in this repo:
  - Engine Internals ranked #1 of 12 specializations on pay and disruption: 162 distinct roles at 43 employers, a median posted base of $254k, and 32 roles at $300k or more.
  - Cited posting: Anthropic's Performance Engineer, Inference Systems, at $350-850k.
- **Missing, and not to be invented:**
  - learner testimonials, enrollment numbers and completion rates;
  - real engine traces (the owner has not captured them yet);
  - partner data.
  Any demonstration data the site shows must be labelled synthetic.

## Product Principles

1. **Play the mechanism before reading it.** A game's rule is the concept itself, never decoration around a quiz.
2. **Prove, don't claim.** Numbers are measured or sourced, dated, and labelled when synthetic.
3. **The real engine is the final judge.** The browser world teaches; the GPU confirms.
4. **Zero servers, local-first.** Nothing about the learner leaves their machine unless they export it.
5. **The first minute is hands-on.** The front page opens on something the visitor plays, not on a pitch.

## Accessibility & Inclusion

Assumed from kernelspace's plan (PLAN-100X §1, Reach), not separately confirmed:
- WCAG 2.2 AA;
- every core surface usable at 360 px and by keyboard;
- zero serious axe violations.

3D games need a reduced-motion setting and a non-3D path to the same concept.
