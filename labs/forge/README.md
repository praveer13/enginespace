# labs/forge

The forge labs: Rust crates that a learner builds to `wasm32-unknown-unknown` and drops on `/labs/<lab>`, which grades them in the tab (ARCHITECTURE §8.3, D-025). This file is for the people and the agents who write labs. The learner's own README is `README.template.md`, which the packer fills for each lab's zip ("Packing", below).

## What is here

| Path | What |
|---|---|
| `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` | The workspace, its lockfile, and the toolchain pin: Rust 1.96.0 with the wasm32 target (ARCHITECTURE §10.3). The lockfile holds the crates of this folder and nothing fetched. |
| `kit/` | `kslab`, kernelspace's lab kit, byte for byte as `vendor/kernelspace/labs/kit` holds it. `tests/forge/labs.test.ts` and `verify:labs` compare the two, so change the vendored copy through `vendor/kernelspace/VENDOR.md` and copy it here, and never edit `kit/`. |
| `toy/` | The host's own practice lab, a rotation (an LRU free queue). It exists so that every state of the host can be shown with a real Rust build, and each real lab copies its shape. |
| `rejection-sampler/` | The `rejection-sampler` lab of TR6 (W1-T27): the verify step of speculative decoding, exact in integers. "The rejection-sampler lab", below. |
| `hybrid-kv/` | TR5a's lab (W1-T22): a hybrid KV cache manager over one page pool, with adapters in the same pool. Six checks, one for each stage of the lab. Its wire, its reference and its bestiary are bigger than the toy's ("A lab with a manager in it", below). |
| `README.template.md` | The learner's README, with `{{PLACEHOLDERS}}` that `scripts/pack-labs.ts` fills from the lab's entry in `src/forge/labs.ts` (its title, lead, checks and wasm). Nothing in it is the repository's business, because the learner cannot read the repository. |

## The shape of a lab

A lab is one crate beside `kit/`, with these parts.

- **`src/lib.rs`, the harness** (marked DO NOT EDIT). It declares the checks with kslab's `CheckDef`, exports `ks_run` (the crate's own checks, which `cargo test` runs on the learner's machine), and exports `ks_invoke`, the bridge that the site drives. The bridge is a line protocol: one command goes in, one text reply comes out, and an error starts with `err`. It holds no logic of the lab's subject, because every command calls the learner's code.
- **The learner's file** (`src/rotation.rs` in the toy), the only file marked `TODO(you)`. In the template it holds `todo!()`, which traps the call that reaches it. The site then says "not implemented yet" with the panic's words and the file and line, and the other checks still run.
- **`reference/`**, the reference solution. The `reference` feature builds it in the learner's place and names the module `<lab>@reference`, which the site shows and never credits. The `solved` feature builds the same file under the lab's own name, for the tests of the host: it is how a credited run is made without a learner. No zip carries this folder.
- **`bestiary/`**, the wrong modules (ASSESSMENT §4.5), one source file and one cargo feature each, and `bestiary.json`, which says what each must do: the checks it must fail and the status it must fail them in (`fail`, `trap` or `timeout`), the checks it must pass, so that a mistake is caught by the checks that are named for it, and optionally which checks to run, because a member that never returns costs a time limit for every check that reaches its loop. No zip carries this folder either.
- **`tests/`**, the crate's own tests: the checks on their default seeds and on 32 more seeds [estimated; kernelspace's rule], and the bridge.

The site's side is in three places. The oracle is `packages/sim/forge/<lab>.ts`: a model of what a right module answers, and a plan for each check that turns a seed into batches of commands and judges the replies. The checks' ids, labels, stages and seeded flags must be the crate's, and `tests/forge/labs.test.ts` reads the Rust and fails when they differ. The registry is `src/forge/ids.ts` and `src/forge/labs.ts`. The runner is `src/forge/invoke.ts`, and `src/workers/forge.worker.ts` is where the module runs.

## A lab with a manager in it: `hybrid-kv`

The toy's module is a data structure that answers four commands. `hybrid-kv`'s is a whole manager, and the extra weight falls in four places. Read the toy first.

- **The module reports its state.** After each operation the host asks for `pages`, `queue`, `requests`, `adapters`, `cache` and `events`, the way lab 02's `dump()` serves a Fleet page, so the learner's `snapshot()` and `take_events()` are part of the lab. `packages/sim/forge/kv-wire.ts` is the wire, and the header of the harness is the same table, line for line (`tests/forge/hybrid-kv-crate.test.ts` holds the two). A reply is cut at 4,096 bytes by the host [measured: `CALL_REPLY_MAX_BYTES` in `vendor/kernelspace/src/workers/lab-protocol.ts` at d478f91], so the bridge refuses to write a longer one and a pool has at most 128 pages [derived: a page takes about 22 bytes in `pages` and in `cache`].
- **The oracle is the model's own judge.** `packages/sim/forge/kv-plan.ts` builds, from the replies, a `KvModel` whose answers are the module's, and hands it to `kvJudge` with a `kvReference` beside it. So the reply, the hit, atomicity, the eight invariants and the events are judged by the code that The Reach-In game and the model's own tests use, and a plan is a list of segments (a pool, and operations), each with a fresh reference and a new `init`. `tests/forge/kv-module.ts` speaks the wire for any `KvModel`, which is how the plan is tested against the reference and the TypeScript bestiary without Rust.
- **The crate's own checks need no second reference.** Shipping a second manager in the harness would give the solution away, so `cargo test` plays the same scripts (`labs/forge/hybrid-kv/src/lib.rs`: a pool, operations, and the replies that `kvReference` gives them) and judges every operation without a model: the replies that the harness itself knows (a request that exists, an adapter that is not resident), the free count, the hit by its definition (the longest prefix that every group holds, found by stepping down), atomicity, the order of the queue after a finish, the invariants, and the events as runs of the request's own blocks. Its streams are its own (the kit's `Rng`) and adapt to the module's replies. The scripts are where the bestiary is caught on both sides, and `tests/forge/hybrid-kv-wasm.test.ts` and `-pack.test.ts` check that `cargo test` and the host pass and fail the same checks on every build.
- **The reference is a manager with policies, and a bestiary member is a policy.** `reference/manager.rs` is `Manager<P: Policy>`, the Rust statement of `packages/sim/kv/reference.ts`, operation for operation, with one hook for each rule a member breaks (`release`, `rule`, `adjust_hit`, `stored_copies`, `adapter_pages`, `reset_when_running`, `unhashed_to_front`, `refused_admit`). A member is a file of ten lines that includes the reference as a module and says which hook it breaks, so the ten members are ten sentences and not ten copies of 500 lines. A lab whose reference is small, like the toy's, keeps a copy per member.

The mapping from TypeScript's bestiary (`tests/sim/kv-bestiary.ts`) to the crate's is one to one, and `bestiary.json` lists for each member the checks it must fail and the checks it must pass; a check that the stream decides (a member that only sometimes shows in a seeded stream) is in neither list.

## What the site does with a module

1. **Load.** The file is hashed (SHA-256) and compiled in `forge.worker`. A module that imports anything, that has no `ks_invoke`, or that speaks another ABI than 2 is refused with its reason. The module's own `list` must name the lab's checks, in the lab's order.
2. **Check.** Each check runs in a fresh instance of the module, on a seed drawn when the run starts if the check draws one. The check's plan sends batches of commands through `ks_invoke`, and the oracle judges every reply. A check may spend 2 s [estimated] in the module, summed over its batches. A check that spends it ends in `timeout`, the worker is terminated, and the next check runs in a new worker.
3. **Record.** A run on fresh seeds that ran every check is written to the ledger as one `lab-check` event, with the module's SHA-256, the seeds and each check's status. A reference build, a replay of seeds the learner has seen, and a partial run are not written.

## Running it

```sh
cargo test --manifest-path labs/forge/Cargo.toml --workspace --features reference   # the crates' own checks, against the reference
bun scripts/verify-labs.ts                                                           # builds every variant and judges it through the host
bun scripts/verify-labs.ts --write                                                   # the same, and writes the builds to tests/fixtures/forge
```

`cargo test` without `--features reference` is red on the template, because the learner's file holds `todo!()`. A lab with one test for each check (`hybrid-kv` has them) runs a stage alone: `cargo test -p hybrid-kv one_group`. Never run `cargo test` with a bestiary feature on in the toy: its `spin` member is an infinite loop, natively as well as in wasm. (No member of the rejection-sampler or of `hybrid-kv` loops or traps, and `tests/forge/hybrid-kv-pack.test.ts` runs the members of `hybrid-kv` natively where there is Rust; nothing runs the rejection-sampler's.)

`verify:labs` is the gate of `scripts/verify.ts` that needs the pinned Rust toolchain, so `labs.yml` runs it. It builds the template, the reference, the solved build and every bestiary member, and fails when the template does not trap in every check, when the reference or the solved build fails a check on fresh seeds, when a reference run would be recorded, when a bestiary member does not end every named check in its named status on at least 99% [estimated] of 50 [estimated] fresh-seed runs, when a check that never returns is not stopped at its limit, or when a committed build in `tests/fixtures/forge` is not what the source builds. The "fresh" seeds of a judgement come from a fixed stream for each lab, kind of build and member (`gateSeeds` in `scripts/labs/judge.ts`), which a learner's run does not: a learner's seeds come from entropy, and a gate that drew the same way would fail by chance as often as the lab's statistical check does. A machine whose `rustup` holds the pinned compiler without the wasm32 target, and the same compiler under another name with it, builds with the second: the gate looks before it builds and never downloads.

The builds in `tests/fixtures/forge` are what lets `bun test` check Rust's output without a Rust toolchain: the oracle, which is TypeScript, judges modules that were compiled from Rust, through the same worker. They are what the pinned compiler writes from this source, so `verify:labs` compares them byte for byte, and `--write` rewrites them when the source changes. If a compiler or a platform ever writes other bytes from the same source, the gate says which build differs. Write them on Linux with the pinned toolchain, as `labs.yml` runs it.

## The rejection-sampler lab

The verify step of speculative decoding (TR6 §5, ARCHITECTURE §5.5). The commis plates γ tokens ahead, and the chef keeps each with probability min(1, p/q), re-plates from the residual (p − q)⁺ at the first plate sent back, or plates a bonus token after a full run. Every weight is a whole number out of 65,536, so there is no float and the site can enumerate what a statistic could only sample.

The learner writes four functions in `src/verify.rs`, in the order of the checks:

| Function | Does | Checked by |
|---|---|---|
| `accept(px, qx, u)` | keeps the plate for exactly `min(px, qx)` of the `qx` coins `u` | `accept`: every coin of six hand plates and of one plate of each kind (p = 0, p < q, p = q, p > q) of a seeded pair |
| `residual(p, q)` | the excess `max(0, p − q)` of every dish | `residual`: three hand pairs and one seeded pair from each band of `packages/sim/spec` |
| `pick(weights, draw)` | the first dish whose running total passes the draw | `pick`: every draw of five hand lists, of the seeded residual in 1/16ths [estimated] and of a seeded list of eight weights adding up to 120 [estimated]: each dish by exactly its weight of the draws |
| `verify(p, q, draft, rng)` | one round | `round`: 16 rounds [estimated] each of four cases in which no coin matters, then `exact` |

`exact` is the chi-square the tracker and ASSESSMENT §4.5 name: the first token of 20,000 rounds on each of two seeds against `p[0]`, at α = 1e-4 [estimated for all three], with the critical values of the generated table (`packages/sim/spec/critical.ts`). The oracle is `packages/sim/forge/rejection-sampler.ts`, and its header says what each check sends.

**Why the checks are exhaustive where they can be.** The boundary-inclusive comparison of SGLang PR #35798 (claims `sglang.spec.pr-35798`, `sglang.spec.pr-35798-fix`, `sglang.spec.pr-35798-interior`) moves a dish's probability by 1/65,536 [derived], which 20,000 draws do not show: the chi-square sees it in about one trial in nine on dense targets [measured: 1,163 of 10,000 cases, 2026-11-04]. The coins can be tried one by one, so `accept` and `pick` do: exactly `min(p, q)` of the `q` coins must keep a plate, and each dish must be picked by exactly its weight of the draws. These are exact, with no false fail, and they accept any rule with the right counts (keeping the top coins instead of the bottom ones is exact too). `round` is exact for the same reason: its cases are built so that no coin matters, and a right module can only answer one way. Only `exact` can fail an honest learner, with probability about 1 − (1 − 1e-4)² ≈ 2e-4 per attempt [derived], and a failure never subtracts anything: the learner runs again on fresh seeds (ASSESSMENT §4.6).

**The bestiary** is the six wrong verify steps of TR6 §5, each a copy of the reference with one mistake. `bestiary.json` names, for each, the checks that must fail it and the checks that must pass it, and `verify:labs` holds each to them on every run. A dash is a check that no claim is made about, because the member passes it by chance on some seeds.

| Member | `accept` | `residual` | `pick` | `round` | `exact` |
|---|---|---|---|---|---|
| `accept-if-p-over-q` | fails | passes | passes | fails | — |
| `resample-from-p` | passes | passes | passes | fails | fails |
| `resample-from-q` | passes | passes | passes | fails | fails |
| `residual-off-by-one` | passes | fails | passes | fails | fails |
| `boundary-inclusive` | fails | passes | fails | — | — |
| `fly-lossy` | passes | passes | passes | fails | fails |

The p > q rule is exact on the rare pair whose every dish with p ≤ q has p = 0, where it keeps what p keeps, so the chi-square cannot be asked to fail it on every seed.

**Error rates**, measured on 2026-11-04 [measured]. `tests/forge/rejection-sampler-rates.test.ts` measures them through the host on the committed builds, and `tests/sim/rejection-sampler-rates.ts` at the model's level for many more cases (W1-T26's `tests/sim/spec-rates.test.ts` measures the sampler itself).

| | Through the host and the builds (1,500 runs a row) | The model (cases) |
|---|---|---|
| False fail of the reference, any check | 0 of 1,500 | 9 of 50,000 (nominal 2e-4 [derived], bound 5e-4 [estimated]) |
| `resample-from-p`, `resample-from-q`, `residual-off-by-one`, `fly-lossy`: `exact` | 1,500 of 1,500 each | 20,000 of 20,000 each (smallest statistic 2.98 to 10.71 times the limit) |
| `accept-if-p-over-q`: `exact` alone | 1,499 and 1,496 of 1,500 | 9,990 of 10,000 |
| `boundary-inclusive`: `exact` alone | 160 and 183 of 1,500 | 1,163 of 10,000 |
| Every check named in `bestiary.json`, besides `exact` | 1,500 of 1,500 | |

The host's runs and the model's draw different seeds, and the rows of the host's table with two numbers are two rows of the report that measured the same member on other seeds.

## Packing: what a learner downloads

```sh
bun scripts/pack-labs.ts            # writes public/labs/enginespace-<lab>.zip for every lab of src/forge/labs.ts, and public/labs/manifest.json
bun scripts/pack-labs.ts --check    # writes nothing; fails when the committed public/labs is not what the sources pack to
```

The site serves the zips as static files, and the repository is private, so the zips are committed and a source that changes without a repack fails `bun test`. Repack after any change under `labs/forge` or `labs/agent-kit`, and commit `public/labs`. The zips are reproducible (`scripts/labs/zip.ts` says how): the same sources give the same bytes on every machine, and `manifest.json` lists each zip's SHA-256 and size and, so that a change to a binary shows in a diff, the SHA-256 of every member.

A zip is one folder, `enginespace-<lab>/`, and the folder is a Cargo workspace.

| In the zip | From |
|---|---|
| `<crate>/Cargo.toml`, `src/`, `tests/` | the lab's crate, byte for byte. `reference/` and `bestiary/` are withheld, and so is anything built |
| `kit/` | `labs/forge/kit`, which is the vendored kslab |
| `Cargo.toml`, `Cargo.lock` | generated: the workspace of the kit and this one crate, with the release profile of `labs/forge/Cargo.toml`, and this lockfile's two packages |
| `rust-toolchain.toml`, `.gitignore` | `labs/forge` |
| `README.md` | `README.template.md` |
| `AGENTS.md`, `CLAUDE.md`, `.claude/` | the agent kit, `labs/agent-kit`: kernelspace's, renamed and extended (`vendor/kernelspace/VENDOR.md`, D-031) |
| `NOTICE` | kernelspace's MIT licence, for `kit/` and the agent kit |

A new lab needs no change to the packer. Add the crate and its entry in `src/forge/labs.ts`, then run it. It finds the two files that matter by what they say: the harness is `<crate>/src/lib.rs` and must carry `DO NOT EDIT`, and the learner's file is the one `src/` file that opens with `//! TODO(you)`. The agent kit's guard protects those two (see below). A crate folder may hold `Cargo.toml`, `src/` and `tests/`, which ship, and `reference/`, `bestiary/` and `target/`, which do not. An entry of any other name stops the packer until `SHIPPED` or `WITHHELD` in `scripts/pack-labs.ts` says which it is, so a new kind of file is a decision and not an accident.

**The guard.** `labs/agent-kit/hooks/es-guard.sh` is kernelspace's `ks-guard.sh` with the names changed and one flag added, `--harness`, which only changes what it says when it blocks. Every zip's `.claude/settings.json` runs it twice, once for the learner's file ("yours to write") and once for the harness ("stays as shipped"), and denies `Edit` on both. It is friction and not DRM, as in kernelspace: `ES_SOLO=0` turns it off. `tests/forge/guard.test.ts` unpacks the toy's zip, runs the hook commands that its `settings.json` names with the payloads Claude Code sends, and holds the hook to being the vendored one: the shipped file, without the blocks it marks `# >>> enginespace`, is the vendored file with the names changed.

**The build.** `tests/forge/pack-build.test.ts` unpacks the toy's zip and builds it offline from its own lockfile. The module is the repository's template build byte for byte, the template's tests are red, and with the reference in the learner's file they are green and the host credits the module. It needs the pinned compiler, so it skips where there is none, and `labs.yml` does not run it yet.
