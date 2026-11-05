# {{LAB_TITLE}}

enginespace forge lab `{{LAB_ID}}`. {{LEAD}} In the engine's words: {{ENGINE_TERM}}.

Real Rust, on your machine, with no server. You edit one file, prove it with `cargo test`, build it to WebAssembly and drop the `.wasm` on the lab's page on the enginespace site (`/labs/{{LAB_ID}}`). The page runs your module in your browser against the site's own checks and records the run on your device. Your code is never uploaded.

## What is in this folder

| Path | What |
|---|---|
| `{{TODO_FILE}}` | **Yours.** The only file marked `TODO(you)`. |
| `{{HARNESS_FILE}}` | The harness (DO NOT EDIT): the crate's own checks, and `ks_invoke`, the bridge the site drives. Reading it is allowed, and the header says which check catches which mistake. |
| `{{CRATE_DIR}}/tests/` | The crate's tests, which run those checks. |
| `kit/` | kslab, the small crate that gives your module its ABI: no dependencies and no imports. |
| `rust-toolchain.toml`, `Cargo.lock` | The compiler the checks were written against (Rust {{TOOLCHAIN}}, with the wasm32 target) and the lockfile. |
| `AGENTS.md`, `CLAUDE.md`, `.claude/` | Rules and a guard for a coding agent (below). |
| `NOTICE` | Whose code `kit/` and the guard are. |

## The loop

1. Read `{{TODO_FILE}}`, then the header of `{{HARNESS_FILE}}`.
2. `cargo test`, until every check is green. It starts red, because the file you edit holds `todo!()`.
3. `cargo build --release --target wasm32-unknown-unknown`
4. Drop `target/wasm32-unknown-unknown/release/{{ARTIFACT_NAME}}` on the lab's page.

The first time you run cargo here, rustup reads `rust-toolchain.toml` and fetches the compiler and the wasm32 target (`rustup toolchain install` does it by hand). No rustup yet? It is at <https://rustup.rs>. The archive's root is a Cargo workspace, so cargo writes `target/` here, one folder above the crate.

## The checks

{{CHECK_TABLE}}

## What the site does with your module

1. **Load.** The file is hashed (SHA-256) and compiled in a worker. A module that imports anything, has no `ks_invoke` or speaks another ABI than 2 is refused, with the reason.
2. **Check.** Each check runs in a fresh instance of your module, and a seeded check on a seed drawn when you drop the file. A check may spend {{CHECK_BUDGET}} s [estimated] in your module. One that spends it ends in `timeout`, and the next check runs.
3. **Record.** A run that ran every check on fresh seeds is written to your ledger on this device, with the module's SHA-256, the seeds and each check's status. A replay of seeds you have seen, and a run that skipped a check, are not.

A `todo!()` left in your code traps the call that reaches it. The site says "not implemented yet" with the panic's words, and the other checks still run. `cargo test` asks the same questions as the site, in Rust, so green here is the time to drop the module there. Only the site's run earns credit.

## Working with a coding agent

`AGENTS.md` and `.claude/` turn Claude Code into a tutor for this lab. It asks for the failing check, its invariant and your hypothesis before it hints, and a guard stops it from editing `{{TODO_FILE}}` and `{{HARNESS_FILE}}`. Another agent that reads `AGENTS.md` gets the rules and not the guard. It is friction, not DRM: `ES_SOLO=0` in your shell turns the guard off, and that is your call.

## Don't lose your work

On day one, in this folder:

```sh
git init && git add -A && git commit -m "{{LAB_ID}}: template"
```

Then commit as the checks go green. That history is your portfolio artifact, and a private remote keeps it safe.
