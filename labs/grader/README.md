# enginespace-grader

The local grader of the course (ARCHITECTURE §9, D-026). It installs one command, `enginespace`, which runs a lab stage on your machine, checks the work against references, and writes one receipt bundle that the course site verifies in your browser. It sends nothing anywhere: a receipt is a file, and you move it by hand.

Its core needs the Python standard library and one package, `jsonschema` 4.26.0. Python 3.11 to 3.14 (vLLM's range, A§9.3).

## Run it

The kits that the site serves carry the grader (W2-T10 packs them). From a checkout of the repository, with [uv](https://docs.astral.sh/uv/) 0.10.2:

```sh
uv sync --locked --project labs/grader        # installs from uv.lock, with the hash of every file
uv run --project labs/grader enginespace --help
uv run --project labs/grader enginespace selftest
```

## The commands

| Command | Does | Built in |
|---|---|---|
| `enginespace doctor` | prints the fields a receipt would record about this machine | a stub in W2-T02: host facts only; W2-T03 and W2-T04 build the rest |
| `enginespace grade <lab>.<stage> --challenge <token>` | decodes the token, runs the stage on the seeds it derives, checks the work, writes `receipts/<lab>-<stage>-<utc>.es.json.gz` | W2-T02 (the labs themselves arrive with their tasks) |
| `enginespace receipt verify <file>` | the browser's first three rules, run here | W2-T02 |
| `enginespace selftest [--gpu]` | the grader's own checks, and its tests where they are installed | W2-T02; `--gpu` stops with a message until a GPU lab exists (W2-T12) |
| `enginespace version` | the name, the version and the source hash | W2-T02 |
| `enginespace fetch <lab>` | downloads a lab's pinned inputs and checks their SHA-256 | W2-T05 |
| `enginespace trace export <in> --format <fmt>` | normalises a trace into `trace@1` | W2-T19 |

Exit status: 0 when the command did what it was asked and found nothing wrong; 1 when it found something wrong (a check failed, a file was not verified); 2 for a usage error or a file that cannot be read; 3 when it could not run (a bad token, a lab this install does not have, a pin check that does not exist yet).

### `grade`

```sh
uv run --project labs/grader enginespace grade tr8.replay.s2 --challenge es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:16eee4ae --assisted none --agent no
```

The token comes from the Receipts page, whole. The grader refuses a token whose checksum, date or parts do not hold, and one for another stage. It warns, and still grades, when the token is more than 14 days old [estimated, A§8.4]: the browser decides about expiry, and the site refuses an expired token.

A receipt is written whether the stage's checks passed or not, because the site shows a failed check with its reason. The status is 1 when one failed.

**Provenance is self-reported.** `--assisted none|explain|code` and `--agent yes|no`, or `ENGINESPACE_ASSISTED` and `ENGINESPACE_AGENT`. When you declare nothing, the receipt records the most help (`assisted: code`, `agent: true`), because a declaration that is unsure should declare more help and not less (the rule of statespace's `check`). It is never a penalty: it changes a weight (ASSESSMENT §3.2). The guard is recorded `on` unless the agent kit's switch is off (`ES_SOLO=0`).

**What a receipt never holds** (A§9.5): a host name, a user name, an address, a GPU's UUID or serial number, an absolute path, a token or a key. The schema has no field that could hold one, and refuses a key that it does not name.

### `receipt verify`

Rules 1 to 3 of A§8.5, on a `.es.json.gz` file:

1. **Caps.** At most 32 MB compressed and 256 MB once decompressed [estimated], counted while the file is decompressed, so a zip bomb stops with a message.
2. **Schema.** `bundle@1` and `receipt@1`, strictly, and the challenge token.
3. **Integrity.** The SHA-256 and the byte count of every artifact's canonical bytes equal the receipt's entry. A tampered hash is rejected, and the message names the artifact.

The other rules need what a file cannot show about itself: the ledger of the browser that issued the token (binding), the list of grader builds the site published (identity), the pins, and every number recomputed from the raw records (A§8.5 rules 4 to 10). A file that passes these three can still be refused there, and a receipt is not signed: it records what was reported (A§8.6).

## The contract with the site

The grader and the site must agree on a few things exactly (A§9.8, D-030), and TypeScript is the source of each:

- **The schemas.** `packages/schema` (zod) is the one definition of `receipt@1`, `bundle@1`, the challenge and `trace@1`. `bun scripts/export-schemas.ts` writes them to `schemas/*.schema.json` and, byte for byte, to `src/enginespace_grader/schemas/`, because the grader is installed by itself and validates with that copy. `verify:schema` fails when a copy differs.
- **The generator and the codec.** `splitmix32u`, `hash32`, `rngFor` and the challenge token (`rng.py`, `challenge.py`); canonical JSON and SHA-256 (`canonical.py`, `hashing.py`). `schemas/vectors/*.json` holds what the TypeScript code does, and `tests/` runs every vector. A vector that the port does not reproduce fails the grader job of `labs.yml`.
- **Canonical JSON** is RFC 8785 for the values this project writes, and strict: a whole number of 2^53 or more, NaN and a lone surrogate have no canonical form. Python's `repr` and `json.dumps` write `1e-07` and `1.0`, so neither is used for a number.

## The hash of the grader

`grader.sourceSha256` identifies the build, and the site compares it with the list of builds it published (A§8.5 rule 5). It is the SHA-256 over the files of the import package, `enginespace_grader/`: for each file, in the order of the UTF-8 bytes of its path (relative to the package, `/` between the parts), the path, a NUL byte, the length in decimal, a NUL byte and the file's bytes. `__pycache__`, `.pyc` files, files that start with a dot and anything that is not a regular file are left out. The source tree and an installed wheel hold the same files, so they give the same hash: `enginespace version` prints it, and `tests/test_identity.py` and `tests/grader/package.test.ts` pin the algorithm with one tree of two files.

## Writing a lab

A lab is a module under `src/enginespace_grader/labs/` named for its id (`tr8_replay` for `tr8.replay`) that exports `LAB`, an instance of a `Lab` subclass. `labs/__init__.py` says what it receives (`StageContext`: the decoded challenge, the stage, a scratch folder, and `rng(salt)` for every seeded input) and what it returns (`StageResult`: inputs, artifacts, checks, what it claims to have measured). It must not choose a seed of its own, must not write a path or a name into a receipt, and must report a learner's failure as a check with `pass: false`.

## The tests

```sh
uv run --project labs/grader python -m unittest         # from the root of the repository
uv run --project labs/grader python -m unittest labs.grader.tests.test_rng -v
```

The tests use the standard library's `unittest` and run on the CPU. They pass on CPython 3.11, 3.12, 3.13 and 3.14, the range the package declares [measured 2026-11-09, 3.11.14 to 3.14.3, also with `-X dev -W error`]; `labs.yml` runs the runner's default interpreter. Run from the root of the repository, `python -m unittest` searches only folders that are packages, so `labs/`, `labs/grader/` and `labs/grader/tests/` each have an `__init__.py`; without them the command would find no test and, on Python 3.11, pass: it exits 0 there and 5 from Python 3.12 on [measured 2026-11-09, CPython 3.11.14 to 3.14.3]. `tests/test_discovery.py` and `tests/grader/package.test.ts` hold them in place. `uv lock --check --project labs/grader` checks that `uv.lock` is current.

`tests/fixtures/grader/` (at the root of the repository) holds a synthetic bundle that this grader wrote, with an invented machine and a fixed identity that is not a published build. The Python suite requires the file to be what the grader writes now (`tests/test_fixture.py`), and `tests/grader/bundle-fixture.test.ts` reads it with the browser's own primitives (`DecompressionStream`, the zod schemas, `canonicalJson`, `crypto`) and requires rules 1 to 3 to pass and the receipt's identity hash to be the one in `sample.expected.json`. So what the grader writes is what the site reads, with neither language needing the other at test time. After a change that is meant to alter the file: `uv run --project labs/grader python -m labs.grader.tests.fixture`.

## Layout

```
pyproject.toml  uv.lock  README.md
src/enginespace_grader/
  cli.py  grade.py  verify.py  selftest.py  doctor.py      the commands
  challenge.py  rng.py  canonical.py  hashing.py           the cross-language contract
  receipt.py  bundle.py  schemas.py  identity.py           the receipt, the bundle, the packaged schemas, the grader's hash
  fingerprint.py                                           host facts (W2-T03 builds the rest)
  labs/                                                    the plug-in interface; one module for each lab arrives with its task
  schemas/                                                 written by scripts/export-schemas.ts
tests/                                                     unittest
```

The pyproject has no `license` field, on purpose: the licence of enginespace's own code is the owner's decision (O-3, D-060).
