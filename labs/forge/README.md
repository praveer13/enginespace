# labs/forge

The forge labs: Rust crates that a learner builds to `wasm32-unknown-unknown` and drops on `/labs/<lab>`, which grades them in the tab (ARCHITECTURE §8.3, D-025). This file is for the people and the agents who write labs. The learner's own README is packed with each lab's zip (W1-T11).

## What is here

| Path | What |
|---|---|
| `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` | The workspace, its lockfile, and the toolchain pin: Rust 1.96.0 with the wasm32 target (ARCHITECTURE §10.3). The lockfile holds the crates of this folder and nothing fetched. |
| `kit/` | `kslab`, kernelspace's lab kit, byte for byte as `vendor/kernelspace/labs/kit` holds it. `tests/forge/labs.test.ts` and `verify:labs` compare the two, so change the vendored copy through `vendor/kernelspace/VENDOR.md` and copy it here, and never edit `kit/`. |
| `toy/` | The host's own practice lab, a rotation (an LRU free queue). It exists so that every state of the host can be shown with a real Rust build, and each real lab copies its shape. |

## The shape of a lab

A lab is one crate beside `kit/`, with these parts.

- **`src/lib.rs`, the harness** (marked DO NOT EDIT). It declares the checks with kslab's `CheckDef`, exports `ks_run` (the crate's own checks, which `cargo test` runs on the learner's machine), and exports `ks_invoke`, the bridge that the site drives. The bridge is a line protocol: one command goes in, one text reply comes out, and an error starts with `err`. It holds no logic of the lab's subject, because every command calls the learner's code.
- **The learner's file** (`src/rotation.rs` in the toy), the only file marked `TODO(you)`. In the template it holds `todo!()`, which traps the call that reaches it. The site then says "not implemented yet" with the panic's words and the file and line, and the other checks still run.
- **`reference/`**, the reference solution. The `reference` feature builds it in the learner's place and names the module `<lab>@reference`, which the site shows and never credits. The `solved` feature builds the same file under the lab's own name, for the tests of the host: it is how a credited run is made without a learner. No zip carries this folder.
- **`bestiary/`**, the wrong modules (ASSESSMENT §4.5), one source file and one cargo feature each, and `bestiary.json`, which says what each must do: the checks it must fail and the status it must fail them in (`fail`, `trap` or `timeout`), the checks it must pass, so that a mistake is caught by the checks that are named for it, and optionally which checks to run, because a member that never returns costs a time limit for every check that reaches its loop. No zip carries this folder either.
- **`tests/`**, the crate's own tests: the checks on their default seeds and on 32 more seeds [estimated; kernelspace's rule], and the bridge.

The site's side is in three places. The oracle is `packages/sim/forge/<lab>.ts`: a model of what a right module answers, and a plan for each check that turns a seed into batches of commands and judges the replies. The checks' ids, labels, stages and seeded flags must be the crate's, and `tests/forge/labs.test.ts` reads the Rust and fails when they differ. The registry is `src/forge/ids.ts` and `src/forge/labs.ts`. The runner is `src/forge/invoke.ts`, and `src/workers/forge.worker.ts` is where the module runs.

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

`cargo test` without `--features reference` is red on the template, because the learner's file holds `todo!()`. Never run `cargo test` with a bestiary feature on: the `spin` member is an infinite loop, natively as well as in wasm.

`verify:labs` is the gate of `scripts/verify.ts` that needs the pinned Rust toolchain, so `labs.yml` runs it. It builds the template, the reference, the solved build and every bestiary member, and fails when the template does not trap in every check, when the reference or the solved build fails a check on fresh seeds, when a reference run would be recorded, when a bestiary member does not end every named check in its named status on at least 99% [estimated] of 50 [estimated] fresh-seed runs, when a check that never returns is not stopped at its limit, or when a committed build in `tests/fixtures/forge` is not what the source builds. A machine whose `rustup` holds the pinned compiler without the wasm32 target, and the same compiler under another name with it, builds with the second: the gate looks before it builds and never downloads.

The builds in `tests/fixtures/forge` are what lets `bun test` check Rust's output without a Rust toolchain: the oracle, which is TypeScript, judges modules that were compiled from Rust, through the same worker. They are what the pinned compiler writes from this source, so `verify:labs` compares them byte for byte, and `--write` rewrites them when the source changes. If a compiler or a platform ever writes other bytes from the same source, the gate says which build differs. Write them on Linux with the pinned toolchain, as `labs.yml` runs it.
