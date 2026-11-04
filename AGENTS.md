# AGENTS.md

Rules for the coding agents that build enginespace, and for the people who work beside them.

enginespace is the Engine Internals course of the kernelspace family: a zero-server, browser-first site on Vite, React 19 and TypeScript, with Three.js for the 3D games and Bun for the tests. [README.md](README.md) says what the course is and how to run the site, and [PRODUCT.md](PRODUCT.md) is the product record.

The work is the backlog in [docs/TRACKER.md](docs/TRACKER.md): tasks named `W<wave>-T<nn>`, one pull request each. Its agent brief is the rule set for every task, and the first section below carries it word for word. If the two differ, the tracker wins, and `tests/docs/repo-docs.test.ts` fails until this file says what the tracker says. A§n is section n of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), D-nnn is a record in [docs/DECISIONS.md](docs/DECISIONS.md), and O-n is an open owner question there.

This file is for the agents that build the repository. The agent kit in the lab zips has an AGENTS.md of its own, for the learner's agent (A§9.2).

## The agent brief: rules for every task

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
7. **Numbers.** Tag every number in content and docs as [measured], [derived], [estimated] or [unverified], and date every upstream fact. In content, put facts in claims (A§4.4). Never invent a fact. If one cannot be sourced, mark it [unverified] and list it in the PR.
8. **Web requests.** Send a generic User-Agent, and never send the owner's name or email in a header, URL or payload. The site itself makes no third-party request.
9. **Look.** The visual identity is decided (D-047): The Pass, a restaurant line kitchen and its expo pass. Use only the token roles in `src/design/tokens.ts` and the components in `src/design/components`, once they exist. Put no literal colour or font name outside `src/design`. Game names and objects follow GAMES.md §2.6.
10. **Done means:**
    - `npm run lint`, `npm run typecheck`, `bun test`, `npm run build` and every `verify:*` the task touches pass;
    - the PR lists each acceptance check with its evidence;
    - you commit on the task branch, open a PR into the wave branch, and never merge.

The orchestrator is whoever dispatches your task. Set up with rules 1 and 2 before you change anything.

## Reading a task

A task line reads `ID · title · size · model · deps`, and its body gives the Goal, what to Read, the Files and the Accept checks. The task is done when every Accept check passes and its evidence is in the PR description. The model is `sonnet` for build tasks, `opus` for wave exit reviews and W0-T25's finish review, and `owner` for tasks only the owner can do: those block their dependants, and agents never simulate them. Numbers in Accept checks (seed counts, time limits, tolerances) are design parameters [estimated]. Pass bars for credit come from [docs/ASSESSMENT.md](docs/ASSESSMENT.md) and override any figure in the tracker.

## Branches, worktrees and merging

- **Your branch** is `w<wave>/t<nn>-<slug>`, for example `w0/t04-ci`. One task is one branch and one pull request. Commit subjects begin with the task id, as in `W0-T04: CI workflows and the gate registry, with unbuilt gates reserved as pending`.
- **Your worktree** starts at the default branch. Rule 1 moves it onto your branch at the base SHA, and rule 2 gives it `node_modules` as hard links to the main checkout's, never as a symlink.
- **The wave branch** collects its wave's tasks (`wave-0` for W0). Each wave branch stacks on the previous unmerged one.
- **Your pull request** goes from your branch into the wave branch. Its description lists each acceptance check with its evidence (rule 10), names every file outside the task's list that you changed and why (rule 4), and lists every fact you could not source (rule 7). A task of size L starts with a short plan as the PR's first comment, before any code.
- **Merging is the owner's.** You never merge anything: not your pull request into the wave branch, and not the wave's pull request into `main` (W0-T24 leaves W0's open for the owner). The owner merges in order (D-036).

## Run the gates

Run these on your branch before you open the pull request. CI runs the same ones on every pull request (`.github/workflows/ci.yml`, A§10.1).

```sh
npm ci                # install the exact pins in package-lock.json; in a worktree, rule 2 replaces it
npm run lint          # ESLint, with the package fences and the determinism bans
npm run typecheck     # tsc -b: the app, the Node-side configs and the pure packages
bun test              # the tests under tests/; npm test runs the same
npm run build         # tsc -b, then vite build into dist/
npm run verify:all    # every verify:* gate
```

npm installs and builds, and Bun runs the tests and the scripts, so Bun must be on your PATH. `package-lock.json` is the only lockfile, and Bun's are git-ignored. `bunfig.toml` roots `bun test` at `tests/`, so Playwright specs never run as Bun tests: `npm run e2e` runs them (after `npx playwright install chromium`, once), and `npx playwright test --project=smoke` runs the subset that CI's e2e-smoke job runs. `playwright.config.ts` builds the site and serves it with `vite preview` itself, and reads `ES_CHROMIUM` for a host whose installed Chromium cannot start.

`scripts/verify.ts` is the gate registry. It holds every gate of A§10.2, and `package.json` reaches each one as `verify:<gate>`.
- `npm run verify:<gate>` runs one gate. `bun scripts/verify.ts all --stage source` runs one stage. A `source` gate reads the working tree, a `build` gate reads `dist/` and so runs after `npm run build`, and a `toolchain` gate needs the pinned Rust toolchain, which only `labs.yml` has. `bun scripts/verify.ts list` prints each gate's stage, whether it is live or pending, and the task that builds it.
- A gate whose script is not built yet prints `pending: <task>` and exits 0, so `verify:all` passes while a wave is half built. A task builds its gate by creating the script that the registry already names, and nothing else changes. `tests/ci/verify.test.ts` fails on a `scripts/verify-*.ts` file that no gate runs, and on a `verify:*` script in `package.json` that goes around the registry.
- The exit status is 0 when no gate that ran failed, 1 when one failed, and 2 for a usage error.
- `bun scripts/content/build.ts` compiles `content/` into `src/content/generated/`, `public/md/`, `public/llms.txt` and `public/claims.json`. `npm run dev` and `npm run build` run the same compiler, and the three content gates (`verify:content`, `verify:claims` and `verify:numbers`) run it without writing. A problem names the file and the line, and any error stops the build.

Lint and the gates enforce the repository's mechanical conventions, so a break shows on the first run:
- `packages/sim` and `packages/play` are pure and deterministic (A§5.1, D-017): no clock, no entropy, no engine-dependent `Math`, and no DOM, because they compile with `tsconfig.pure.json`. An `eslint-disable` comment has no effect in them.
- Imports follow the fences of A§2.3. Only `src/scene/**` and each game's `Scene3D.tsx` import `three` or `@react-three/fiber`, and only behind `React.lazy`.
- `dangerouslySetInnerHTML` is banned everywhere.

## Sibling repos are read-only

Rule 5 covers kernelspace and statespace. Read a committed file at the commit that a task or the architecture names, so that a moved checkout cannot change what you read. The architecture cites kernelspace at d478f91 (2026-10-30) and statespace at 7b6938c (2026-10-27). `<kernelspace>` and `<statespace>` below stand for the sibling checkouts: rule 5 gives kernelspace's path, and statespace sits beside it.

```sh
git -C <kernelspace> show d478f91:package.json
git -C <kernelspace> ls-tree -r --name-only d478f91 -- src/lib
git -C <kernelspace> grep -n splitmix32 d478f91 -- src/lib
git -C <statespace> show 7b6938c:docs/ARCHITECTURE.md
grep -n 'Engine Internals' <kernelspace>/SPECIALIZATIONS.md
```

The last file is untracked in kernelspace's checkout, so `git show` cannot reach it: `grep` it, and never edit it. Read-only means nothing is written there: no edit, no `git add`, no commit and no push.

`vendor/kernelspace/` holds the files that A§13 copies from kernelspace at d478f91. They are never edited in place (rule 4), and every enginespace change sits in a wrapper outside `vendor/`. `bun scripts/vendor-drift.ts verify` (the gate `verify:vendor`) re-hashes them against `vendor/kernelspace/VENDOR.md`, and `diff <sha>` reads a newer kernelspace commit through read-only `git show`.

## Pins and tags

**Tags** (rule 7; the Tags paragraph that opens ARCHITECTURE.md). Every number in content and docs carries one:
- [measured]: read or measured from the named source, on the stated date. A number you measure on a build also names the build's SHA.
- [derived]: arithmetic on tagged inputs.
- [estimated]: a judgment or a design target. Every budget is one.
- [unverified]: not checked against a primary source. It is never load-bearing until a named task checks it.

Identifiers (D-014, W0-T13, `receipt@1`), counts of named things, list numbering and thresholds that a standard defines go untagged. In content, facts live in claims with a source, a date and a TTL (A§4.4), and `verify:claims` and `verify:numbers` check them.

**Pins.**
- **npm packages** are exact: no `^`, no `~`, and the versions of A§14. `tests/smoke.test.ts` compares `package.json` and `package-lock.json` with that table. A package it does not list needs a DECISIONS record first (rule 6).
- **Tools and actions.** Node 24, Bun 1.3.14, Rust 1.96.0 (with the `wasm32-unknown-unknown` target) and uv 0.10.2 [measured from kernelspace's and statespace's CI, 2026-11-03]. Every GitHub Action is pinned by its full commit SHA, with its release in a comment (A§10.3), and `tests/ci/workflows.test.ts` compares the workflows with that table.
- **Upstream engines and data** (vLLM, SGLang, the reading targets, the profilers, the datasets and the models) are pinned in `course.lock.json` (A§4.4), which W1-T01 fills. The course pins one vLLM minor and one SGLang minor and re-pins them each quarter. A fact about an engine belongs to a pin and is cited at the pinned version, never at "latest" ([docs/PLAN.md](docs/PLAN.md) §11). The edition-1 pins are proposed (D-035) until the owner confirms them (O-4).
- **Vendored code** is pinned by commit and by SHA-256: `vendor/kernelspace/` is kernelspace at d478f91, and `VENDOR.md` lists each file's hash (A§13).

## Where things are

README.md's "What is in this repository" maps the tree and the documents. [docs/ASSESSMENT.md](docs/ASSESSMENT.md) owns credit and wins over every other file on it, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) owns the formats and the mechanics, and [docs/GAMES.md](docs/GAMES.md) §2.6 names the games and their kitchen objects (rule 9).
