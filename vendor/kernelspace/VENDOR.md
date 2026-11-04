# vendor/kernelspace

Files copied from kernelspace, the course enginespace specializes, at one pinned commit (ARCHITECTURE.md section 13, D-031). They are kernelspace's stateless, tested parts: the seeded RNG, the S5 step card and its golden vectors, the FSRS memory model and its reference vectors, the Forge host and its Rust kit, the agent kit, and three trace slices. Everything coupled to kernelspace's own product stays behind.

| Field | Value |
|---|---|
| Pinned commit | `d478f91a0af590f03fcfd76ee73149fa70b28e51` |
| Commit date | 2026-10-30T11:47:41Z (04:47:41 -07:00) [measured 2026-11-03] |
| Branch | `origin/master`, as the owner's clone had it on 2026-11-03 [measured] |
| Vendored by | W0-T02, 2026-11-03 |
| Licence | MIT for kernelspace's code; a few files carry other terms (see Licence and provenance) |

## Rules

1. **Never edited in place.** `bun scripts/vendor-drift.ts verify` (the gate `verify:vendor`) recomputes every SHA-256 below. It fails on any difference, on a missing or unlisted file, on an executable bit and on a symlink. enginespace's changes live in wrappers outside `vendor/`. Besides this page and `.gitattributes`, the type shims in `shims/` are the only files here that are not copies. Which code may import from here is ARCHITECTURE.md section 2.3's rule.
2. **The paths are kernelspace's.** A file sits under `vendor/kernelspace/` at the path it has in kernelspace, so a row's path is also its `git show` path.
3. **No file named `AGENTS.md` or `CLAUDE.md`.** An agent working beside one is bound by it, and `verify` fails on either name. The agent kit's template keeps another name.
4. **Bytes stay bytes.** `.gitattributes` beside this file turns off line-ending conversion, so the hashes hold on every platform.
5. **kernelspace is only read.** `diff` runs `git -C <kernelspace> show` and nothing else there. It finds the checkout from `--repo`, then `KERNELSPACE_REPO`, then the sibling `../kernelspace` of this repository or of its main checkout. The location is written down nowhere.
6. **Updates are reviewed** (Updating, below).

## Modules, their homes and what each wrapper supplies

A home is where enginespace's wrapper lives (ARCHITECTURE.md section 13). The task named builds the wrapper, as TRACKER.md has it. TRACKER.md names no task for the kit and the traces, so those two name the first task that needs them [estimated].

| Module | Files | Home | Wrapper built by | The wrapper supplies |
|---|---|---|---|---|
| rng | `src/lib/rng.ts` | `packages/sim/core/rng.ts` re-exports it | W0-T12 | `rngFor(seed, salt)` and the unbiased `below(n)`, which this file lacks (section 5.1). `freshSeed()` stays out of `packages/sim`, since seeds are drawn on the main thread at grade time (invariant I3). The pure program includes `shims/ambient.d.ts` for `freshSeed`'s one `crypto` call |
| physics | `card.ts`, `types.ts`, `step-vectors.json` | `packages/sim/physics` | W0-T12 | the callers' shapes, built from claims (the card reads none), and the table rows taken from `report.json` (Referenced, not copied) |
| fsrs | `fsrs.ts`, `reference-vectors.json` | `src/items/today` | W1-T05 | the target retention, which is the caller's choice, and the two types it imports, through `shims/src/lib/learner/types.ts` |
| kit | `labs/kit/Cargo.toml`, `labs/kit/src/lib.rs` | `labs/forge/kit` | W1-T10 [estimated] | how `labs/forge` takes the crate is that task's call |
| forge | the seven TypeScript files of the Forge host | wrapped by `src/forge`; the invoke protocol is enginespace's own module | W1-T10 | the two ledger types `run.ts` imports, through `shims/src/lib/ledger/types.ts` |
| agent-kit | `labs/agent-kit/**` | `labs/agent-kit`, renamed and extended | W1-T11 | the rename, the protected-file path and enginespace's own text |
| traces | the three slices and their README | `public/traces/`, read by `packages/sim/workload` through a build-time import | W0-T12 [estimated] | the attribution wherever a slice is shown |
| licence | `LICENSE`, `NOTICE` | the repository's `NOTICE` carries the same text | W0-T02 | nothing |

## Manifest

SHA-256 of each file's bytes, which are the bytes of the pinned commit's blob. Counts in the Note column were counted from those bytes. The licences are explained under Licence and provenance.

<!-- vendor-manifest:begin -->
| Path | Module | SHA-256 | Licence | Note |
|---|---|---|---|---|
| `src/lib/rng.ts` | rng | `078ef989d77ca4c88f8b2fe55cc130bd7561770780b397ae2511ef1404da6817` | MIT | `splitmix32` and `splitmix32u`, the FNV-1a `hash32`, `shuffledOrder`, `exportOrder` and `freshSeed` |
| `src/lib/world/physics/card.ts` | physics | `3ee8463cd9adec09b278dde96d3c421f0a30e9b19e491058f3ac6e936d00f84e` | MIT | the S5 step card: `stepCard`, `NAPKIN`, `napkinSpec`; pure, and it reads no claims |
| `src/lib/world/physics/types.ts` | physics | `e65c62f3f59dd733ecd7c8b34e43a61ba2ac2364541ea356352c5c1aabe57938` | MIT | the card's types and the shape of a calibrated row; types only |
| `tests/fixtures/physics/step-vectors.json` | physics | `5f9f90a7a9d8356f1af2cd3046269b05fb041c23c2c953afe08234a8a0b87f4b` | MIT | the golden step vectors, 50 of them [measured 2026-11-03] |
| `src/lib/learner/fsrs.ts` | fsrs | `1e9707550bcee605acf0b6e1afc80f20db0a991fd2447129460aa2a6ae5918f4` | MIT; ts-fsrs MIT | the FSRS-6 memory model: `nextMemory`, `retrievability`, `intervalDays`; transcribes ts-fsrs 5.4.2 |
| `tests/fixtures/fsrs/reference-vectors.json` | fsrs | `67761a28cf8ab22609dabc92743bc31ea1e0f148663e8d9413d26f8d13c9efd3` | MIT; ts-fsrs MIT | ts-fsrs 5.4.2's output: 2,000 replays of 1 to 12 reviews [measured 2026-11-03] |
| `labs/kit/Cargo.toml` | kit | `af7d3d7e8d90a6198e1f9d31046cafac3217cb958b3a3a0574bbd6fb81b81b3d` | MIT | the `kslab` crate's manifest; no dependencies |
| `labs/kit/src/lib.rs` | kit | `faf92453c85299f0eb62e1e04c4a002d92f4da821e6dbeb4318b15ecfe0cbe69` | MIT | the `kslab` crate: the ABI glue a forge lab module links, with zero dependencies and zero imports |
| `src/lib/forge/abi.ts` | forge | `3f695f16d757fc0fd8510c5494e23576bd0621e89b25a45278756de87973d4e6` | MIT | ABI v2 table and reply parsers; pure |
| `src/lib/forge/types.ts` | forge | `71267e21c23d076ce8dd02d7b9362f358d4eaf8c9d86b9d40fbe1b9bc69434d5` | MIT | host types |
| `src/lib/forge/run.ts` | forge | `fafb5f5f1de914c270da2a7401e3eca5ffcf1b321b369fe2832e2efebafe5aa3` | MIT | per-check driver: a fresh instance per check, a budget per check, the credit rule |
| `src/lib/wasm-lab.ts` | forge | `64044b2fc7c3e9a775a0e44fe8d9ca456415291312ef7f30cb9a4d3815b31c53` | MIT | the host: zero imports, `ks_run`, `ks_invoke` |
| `src/lib/lab-worker.ts` | forge | `11794d144c025be04a49b88ff9641732ce84a4b735d5ccf142d36fbb5a47e30b` | MIT | main-thread client: timeouts, worker replacement |
| `src/workers/lab.worker.ts` | forge | `da80ac4d9a2f0dc8e5d2eac16acda586c497895e06c490cdac1e578bab235889` | MIT | the worker that runs untrusted modules |
| `src/workers/lab-protocol.ts` | forge | `fcaedb8e56e259709604646605cd5e30d779b848adc0e3704a3304e7288e99de` | MIT | worker messages and reply caps |
| `labs/agent-kit/AGENTS.template.md` | agent-kit | `56e50a16b813093427d3bd2a357135b00da15cd4f672ad21f6adb296e0c520e8` | MIT | per-lab agent instructions template; configuration, which kernelspace's README files with code |
| `labs/agent-kit/hooks/ks-guard.sh` | agent-kit | `6bc17427a21957ab1b07ee11a6aa39cc9c62844f9b2abc862d9b43b7cbb38a11` | MIT | the fail-closed PreToolUse hook, POSIX sh |
| `labs/agent-kit/output-styles/kernelspace-socratic.md` | agent-kit | `ef9e7a2db736b614a2f9a515e2b6d6541a08bf3f7826c7c9e638624a1f615e04` | MIT | the Socratic output style; configuration, as above |
| `labs/agent-kit/settings.template.json` | agent-kit | `8e4ca462e15e2be2d1702b5dd56e4ef5bb20fba7267c1de5fd1a16c10b74aff0` | MIT | deny rule, hook entry and output style |
| `public/traces/README.md` | traces | `4f293507b01931b6392d23e3f42f4104ac1f7e05cd1ddcaf2088fc3f69d72e5f` | CC BY 4.0 | what each slice is, its source and licence, and how it was cut; documentation |
| `public/traces/burstgpt-v2-busiest-hour.json` | traces | `09116e1cc0dde5eee52a7cd76babda826f29db9e71e65ea7af7fdaf890c2de8c` | CC BY 4.0 (BurstGPT) | BurstGPT v2.0, the busiest hour: 480 requests [measured 2026-11-03] |
| `public/traces/burstgpt-v2-busiest-minute.json` | traces | `5e44491f7fcc1b72c5756397e67bb993c9d34e95002ea78fe76d3dd5afafed07` | CC BY 4.0 (BurstGPT) | BurstGPT v2.0, the busiest minute, sampled: 40 requests [measured 2026-11-03] |
| `public/traces/kimi-conversation.json` | traces | `af38c3266964de80805ae6e058894b38c95d90f104624acdced9add01d9fe8b6` | Apache-2.0 (Mooncake) | Mooncake's Kimi conversation trace, the first ten minutes: 1,200 requests [measured 2026-11-03] |
| `LICENSE` | licence | `37775d2022edca6400e14682d381ca10c0da223db1898308e7f06ad57e5307f5` | MIT | kernelspace's MIT licence, byte for byte |
| `NOTICE` | licence | `4e5546244281b35a700c34a80df5b82c2284cce4454db19edf1122cc5c5a3ec7` | MIT; ts-fsrs MIT | kernelspace's third-party notices (ts-fsrs), byte for byte |
<!-- vendor-manifest:end -->

## Referenced, not copied

ARCHITECTURE.md section 13 takes the fitted parameter rows of `docs/physics/report.json` and cites that file's SHA-256, so the file is not copied. Besides the fitted parameters it holds, per fitted point, the measured TPOT and TTFT and the InferenceX run URL (`rows[].points[]`). kernelspace attributes InferenceX's values in `src/data/physics/points/ATTRIBUTION.md` (docs/specs/s5.md, S5-D30), and this set does not carry that attribution, so the points stay in kernelspace. `diff` compares the hash at a newer commit and says when the rows need extracting again.

<!-- vendor-references:begin -->
| Path | SHA-256 | Taken from it |
|---|---|---|
| `docs/physics/report.json` | `7bda67b919972343ed6fc93cf8655f5525ce6fada2f79b4a780c629404a60eb9` | the fitted parameter rows (`rows[].params`) of the H100 FP8, B200 FP8 and B200 NVFP4 fits, extracted into `packages/sim/physics` by W0-T12, which cites this SHA-256 |
<!-- vendor-references:end -->

## Type shims

Each shim satisfies an import that leaves the set, and a type-only import costs nothing at run time.

| Imported by | Import | Satisfied by |
|---|---|---|
| `src/lib/learner/fsrs.ts` | `MemoryState`, `Rating` from `@/lib/learner/types` | `shims/src/lib/learner/types.ts` |
| `src/lib/forge/run.ts` | `LabCheckDetail`, `LabRunV2` from `../ledger/types` | `shims/src/lib/ledger/types.ts` |
| `src/lib/rng.ts` | the global `crypto`, in a program with no DOM or Node lib | `shims/ambient.d.ts` |

The first two shims restate declarations from kernelspace's own types modules, character for character. `LabRunV2` needs `Provenance`, so that is restated too. `diff` compares each restated declaration with the same one at the new commit.

<!-- vendor-shims:begin -->
| Shim | Restates | Declarations |
|---|---|---|
| `shims/src/lib/learner/types.ts` | `src/lib/learner/types.ts` | `Rating`, `MemoryState` |
| `shims/src/lib/ledger/types.ts` | `src/lib/ledger/types.ts` | `Provenance`, `LabCheckDetail`, `LabRunV2` |
<!-- vendor-shims:end -->

A program that compiles the vendored files maps both specifiers in its `tsconfig`, and adds `ambient.d.ts` only when it has no DOM and no Node types (a program that has them already declares `crypto`):

```json
"paths": { "@/*": ["./src/*", "./vendor/kernelspace/shims/src/*"] },
"rootDirs": ["./vendor/kernelspace/src", "./vendor/kernelspace/shims/src"]
```

`tests/vendor/shims.test.ts` compiles the files this way, and shows that each shim is needed: without it the compiler reports the import it stands in for.

## Considered and not vendored

| What | Why |
|---|---|
| `scripts/a11y.mjs`, `scripts/prepare-pages.mjs`, `scripts/verify-bundle.ts`, the `vite:preloadError` handler in `src/main.tsx` | section 13: patterns re-implemented in `scripts/` and `src/main.tsx` |
| `src/lib/ledger/*` | section 13: ideas only, re-implemented (section 7) |
| `src/lib/world/fleet-ex/{broken-bench,push-luck,knee}.ts` | section 13: ideas and formulas only. They depend on kernelspace's Fleet engine |
| the rest of `src/lib/forge/` and `src/workers/` | the Forge's lessons-and-ledger logic (ladder, prove, race, watch and the rest), the Fleet and capstone workers, and the simulation worker. Section 13 takes the host only |
| the rest of `src/lib/world/physics/`, `tests/fixtures/physics/`, `docs/physics/` | Engine v2, the generated table, the fit and its protocol. Section 13 takes the card, its types and the step vectors |
| `public/traces/lmsys-chat-1m-published-shape.json` | a synthetic profile that section 13 does not list. The README says why kernelspace holds no LMSYS records |
| kernelspace's own tests of the vendored code (`tests/learner/fsrs.test.ts`, `tests/physics/card.test.ts`, `tests/forge/abi.test.ts`) | they import kernelspace modules this set leaves out. `tests/vendor/` re-checks the parts that matter against the vendored fixtures |
| `LICENSE-CONTENT` | the CC BY 4.0 text for kernelspace's documentation. One vendored file is documentation, the traces README, and the repository's `NOTICE` names the licence and links it |

## Licence and provenance

- **kernelspace's own licences.** Its README (section "License", at the pinned commit) puts its code, "meaning the site, the lab crates, the scripts, the tests and the configuration", under the MIT License, and its documentation and course content under CC BY 4.0. `LICENSE` beside this file is upstream's MIT text, byte for byte. The Licence column says `MIT` for code, tests, fixtures and configuration, `CC BY 4.0` for the one documentation file, and the source's own licence for the third-party data.
- **ts-fsrs** (MIT). `fsrs.ts` transcribes the memory model of ts-fsrs 5.4.2, and `reference-vectors.json` is that library's output. kernelspace's `NOTICE`, vendored here, carries the notice, and the repository's `NOTICE` reproduces it.
- **BurstGPT v2.0** (CC BY 4.0). The two BurstGPT slices say so in their `license` and `attribution` fields, and the traces README gives the attribution, the pinned source hash and each transformation.
- **Mooncake** (Apache-2.0). The Kimi slice says so in the same fields, and the README gives its source commit and hash.
- The repository's `NOTICE` carries kernelspace's section, with the MIT text, and the ts-fsrs section. `tests/vendor/drift.test.ts` fails if either drifts from the files here.

## Updating

```
bun scripts/vendor-drift.ts verify
bun scripts/vendor-drift.ts diff <sha> [--repo <path>] [--no-diff]
```

1. Run `diff <sha>` for the newer kernelspace commit and read it: the status of each file, the diff of each changed file, the hash of the referenced file, and whether each shim still restates its declarations.
2. Copy each changed file with the `git show` command the report prints, and set the pinned commit, its date and each changed hash in this file in the same commit.
3. A restated declaration that changed means its shim changes in the same review.
4. Run `bun test tests/vendor` and the fast gate. The shim test fails when an update adds an import the shims do not cover.
5. To add a file, copy it and add its row, with the hash from `git show <sha>:<path> | sha256sum`. To drop one, delete its row and the file.
