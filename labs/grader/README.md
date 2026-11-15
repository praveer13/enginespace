# enginespace-grader

The local grader of the course (ARCHITECTURE §9, D-026). It installs one command, `enginespace`, which runs a lab stage on your machine, checks the work against references, and writes one receipt bundle that the course site verifies in your browser. It sends nothing anywhere but the pinned downloads of `enginespace fetch`: a receipt is a file, and you move it by hand.

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
| `enginespace doctor [--lab LAB] [--engine-log FILE] [--engine-config FILE]` | prints the fields a receipt would record about this machine, and notes for what it could not read | the fingerprint in W2-T03; still a stub for the checks, which arrive with W2-T04 |
| `enginespace grade <lab>.<stage> --challenge <token>` | decodes the token, runs the stage on the seeds it derives, checks the work, writes `receipts/<lab>-<stage>-<utc>.es.json.gz` | W2-T02 (the labs themselves arrive with their tasks) |
| `enginespace receipt verify <file>` | the browser's first three rules, run here | W2-T02 |
| `enginespace selftest [--gpu]` | the grader's own checks, and its tests where they are installed | W2-T02; `--gpu` stops with a message until a GPU lab exists (W2-T12) |
| `enginespace version` | the name, the version and the source hash | W2-T02 |
| `enginespace fetch <lab>` | downloads the files that a lab pins, resumes a download that stopped, and keeps only the bytes whose SHA-256 is the manifest's | W2-T05 |
| `enginespace trace export <in> --format <fmt>` | normalises a torch-profiler Chrome trace (`torch`) or an Nsight Systems SQLite export (`nsys-sqlite`) into `trace@1` | W2-T19 |

Exit status: 0 when the command did what it was asked and found nothing wrong; 1 when it found something wrong (a check failed, a file was not verified); 2 for a usage error or a file that cannot be read; 3 when it could not run (a bad token, a lab this install does not have, a pin check that does not exist yet).

### `grade`

```sh
uv run --project labs/grader enginespace grade tr8.replay.s2 --challenge es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:16eee4ae --assisted none --agent no
```

The token comes from the Receipts page, whole. The grader refuses a token whose checksum, date or parts do not hold, and one for another stage. It warns, and still grades, when the token is more than 14 days old [estimated, A§8.4]: the browser decides about expiry, and the site refuses an expired token.

A receipt is written whether the stage's checks passed or not, because the site shows a failed check with its reason. The status is 1 when one failed.

**Provenance is self-reported.** `--assisted none|explain|code` and `--agent yes|no`, or `ENGINESPACE_ASSISTED` and `ENGINESPACE_AGENT`. When you declare nothing, the receipt records the most help (`assisted: code`, `agent: true`), because a declaration that is unsure should declare more help and not less (the rule of statespace's `check`). It is never a penalty: it changes a weight (ASSESSMENT §3.2). The guard is recorded `on` unless the agent kit's switch is off (`ES_SOLO=0`).

**What a receipt never holds** (A§9.5): a host name, a user name, an address, a GPU's UUID or serial number, an absolute path, a token or a key. The schema has no field that could hold one, and refuses a key that it does not name.

### `fetch`

```sh
uv run --project labs/grader enginespace fetch tr0.forward
uv run --project labs/grader enginespace fetch tr0.forward --manifest references/manifest.json --cache /mnt/disk/enginespace
```

A lab's large inputs (a model's weights, a dataset slice, the owner's reference banks) are not in the kit. They are listed in the references manifest, `labs/references/manifest.json` ([labs/references/README.md](../references/README.md)), each with its URL, SHA-256, size and licence, and `fetch` downloads the ones that list the lab you name into your cache. It looks for the manifest in `references/manifest.json` or `labs/references/manifest.json`, in the folder you run it from or one above it (the kit's folder, or a checkout of the repository), and `--manifest` names one. The cache is `--cache`, else `ENGINESPACE_CACHE`, else `enginespace/references` in your user cache folder (`~/.cache`), outside the kit, so a new kit does not make you download a model again.

- **A file is kept only if its bytes hash to the manifest's SHA-256.** A download goes to a hidden `.<name>.<start of the hash>.part` file beside its place and is renamed to that place when it matches. A hash that does not match stops the command (status 1), deletes the partial file and says so, and so does a server that sends more than the manifest pins. A server that announces another size, or answers a resume with other bytes than were asked for, stops it (status 1) before a byte is written and leaves a partial file as it was: the answer is wrong, and not what had arrived. A file already in the cache is hashed again each time, so a changed one is downloaded again.
- **A download that stopped resumes.** A dropped connection, a timeout and Ctrl-C keep what arrived. Run the command again and it sends `Range: bytes=<n>-` and goes on from there; a server that ignores the range sends the whole file, and the download starts again.
- **What it sends.** A GET per file, with the User-Agent `enginespace-grader/<version>` and the headers HTTP needs. No cookie, no credential and no token (`HF_TOKEN` is never read), and no name of yours in a header or a URL. The URLs are https, and a redirect from https stays on https; plain http is allowed only to `127.0.0.1`, `localhost` and `[::1]`, which is how the tests serve a file from a folder. Your proxy settings are used, except for those.
- **It checks the room first.** A file that does not fit on the disk is a message before the download and not a full disk after it.

A lab finds its entries with `fetch.load_manifest(fetch.find_manifest()).for_lab("tr0.forward")`, reads each fetched file with `fetch.cached_file(reference)`, which hashes it again, and records it as `reference.as_input()`, the entry that the receipt's `inputs` take (A§9.6). `fetch` does not run during `grade`: a lab that finds a file missing says to run it.

### `receipt verify`

Rules 1 to 3 of A§8.5, on a `.es.json.gz` file:

1. **Caps.** At most 32 MB compressed and 256 MB once decompressed [estimated], counted while the file is decompressed, so a zip bomb stops with a message.
2. **Schema.** `bundle@1` and `receipt@1`, strictly, and the challenge token. Before the text is parsed it is scanned once, and a text that nests more than 64 levels deep, or holds more than 4,194,304 arrays, objects and strings (member names included) [estimated], is refused unparsed: the caps bound a file's bytes, and a parser's memory is not its bytes. `enginespace grade` refuses to write such a bundle.
3. **Integrity.** The SHA-256 and the byte count of every artifact's canonical bytes equal the receipt's entry. A tampered hash is rejected, and the message names the artifact.

The other rules need what a file cannot show about itself: the ledger of the browser that issued the token (binding), the list of grader builds the site published (identity), the pins, and every number recomputed from the raw records (A§8.5 rules 4 to 10). A file that passes these three can still be refused there, and a receipt is not signed: it records what was reported (A§8.6).

### `trace export`

```sh
uv run --project labs/grader enginespace trace export rank0.pt.trace.json --format torch --out rank0.trace.json \
  --engine vllm --engine-version 0.33.0 --gpu "NVIDIA GeForce RTX 4090" --captured-at 2026-11-20T10:00:00Z
uv run --project labs/grader enginespace trace export report.sqlite --format nsys-sqlite --step-name '^my_step \d+$' --out report.trace.json
```

It normalises a profiler capture into `trace@1` (ARCHITECTURE §5.7): the columns that the trace viewer, the attribution and the checks read, written as canonical text, so that the trace's SHA-256 is the same in the grader and in the browser. `meta.sha256` is the hash of the capture it was made from; `meta` leaves out whatever the capture and the flags do not say (the site's check T1 wants a learner's trace to name its engine, version, GPU and capture time, and the command says which are missing). `--source synthetic` labels a made-up capture, and `--source owner` is for the owner's reference traces.

- **`--format torch`** reads a torch-profiler Chrome trace (`torch.profiler`, or vLLM's `--profiler-config`): `kernel`, `gpu_memcpy` and `gpu_memset` events on the GPU's streams, the `cuda_runtime` calls with their correlation ids, `cpu_op` and `python_function` frames, and `ProfilerStep#<n>` annotations as the steps. Times are read as decimal text and converted to integer ns without a double in between.
- **`--format nsys-sqlite`** reads an `nsys export --type sqlite` file, read-only: the `CUPTI_ACTIVITY_KIND_*` tables, `NVTX_EVENTS` for the steps (`--step-name` says which ranges), `StringIds` and `TARGET_INFO_GPU`. A capture taken with `--cuda-graph-trace=node` shows the nodes of a graph as kernels with the replay's correlation id, which is how the trace keeps them under one `cudaGraphLaunch`. **The table and column names are [unverified]** against the pinned nsys (2026.5.1, proposed): no nsys was available when it was written, and the owner's first capture (W2-T21) checks them. A table or column that is missing stops the command and names it.

What it decides, and says: the engine's main thread is the one that carries the steps (`--main-thread` names another), and other threads are left out. A CPU step range does not contain the kernels it launched, because the GPU runs after the CPU has left the step, so a step's window is the GPU's: from the first start to the last end of the GPU work that the step's launch calls started. Work outside the first and last step mark is left out and counted. A kernel whose launch was on another thread gets correlation id -1, and the site's T4 fails it, so the trace says that no launch can be shown before it. Nothing is moved or rounded to make a check pass. Every name goes through `redact.scrub_text` first, since a Python frame's name holds a path. The command prints what it left out, and `traceChecks` on the site (T2 to T5) is the judge of the result.

What an Nsight Systems export cannot give is the engine's Python frames, so the main thread is busy in such a trace only while a CUDA call runs and its CPU-gap time is a lower bound. A memset is GPU work that `trace@1` does not count as busy (the model reads `kernel` and `copy`), and is carried under the category `memset`.

## The fingerprint, and what a receipt never holds

`enginespace doctor` prints the `environment` that `enginespace grade` will write into a receipt, before any run writes it (A§9.5, A§9.9). Both call `fingerprint.gather` with the same arguments, so what `doctor` prints is what the receipt holds. A source that is missing, broken or silent costs a field and a note, never the run, and the notes say which.

| Field | Read from |
|---|---|
| `gpus`, `driver` | NVML through `nvidia-ml-py` (the module `pynvml`) when it imports and starts, else the CSV of `nvidia-smi --query-gpu`; the CUDA version of the driver from `nvidia-smi --version` or the table it prints. The SM count, which neither gives, and the whole list when both are missing, come from torch. The CSV has no column for the virtualization mode, so that field is left out on that path. |
| `torch` | the installed distribution, and `torch.version.cuda` and cuDNN when torch imports (which takes seconds) |
| `engine` | the engine's distribution: its version, the commit if pip recorded one for a build from git (PEP 610), and the SHA-256 of its `RECORD`, read as bytes. Re-hashing the installed files against `RECORD` is the pin check's work (W2-T04). |
| `libs` | flashinfer, xgrammar, triton and transformers, when installed |
| `host` | the operating system (`/etc/os-release`, or `sysctl` on macOS), the kernel release, the architecture, the CPU model, the cores, the RAM, and whether the process is in a container |
| `envVars` | only the `VLLM_*` and `SGLANG_*` variables on the lab's allowlist (`Lab.env_allowlist`), each scrubbed |

**What it never holds** (A§9.5): a host name, a user name, an IP or MAC address, a GPU's UUID or serial number, an absolute path, a token or a key, or the whole environment. Three layers keep them out, and `redact.py` explains each. The code never asks for them: not NVML's `nvmlDeviceGetUUID`, `nvmlDeviceGetSerial` or `nvmlDeviceGetPciInfo`, and not the `uuid`, `serial` or `pci.bus_id` columns of `nvidia-smi`. Text that does come from the machine is scrubbed: an allowlisted variable whose value holds a path, an address, a URL or a token is recorded as `<redacted>`, a name that says it holds a secret (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `AUTH`) is never recorded even on the allowlist, and `redact.scrub_text` cleans an engine's log before a lab keeps it as an artifact (a path under the kit becomes relative to it, every other path becomes `<path>`). And the finished fingerprint is looked at once more: a field that still holds something personal is left out with a note, and a field the receipt needs stops the run. The strict schema stands behind all three, since it has no field that could hold one.

The tests seed a host name, a user name, a GPU UUID and serial number, absolute paths and `HF_TOKEN` into the environment of a *subprocess* (never of the test runner), put a fake NVML and a fake `nvidia-smi` in its way that would hand over a UUID and a serial number to anyone who asked, run `doctor` and the flow of `grade` in it, and look for every seeded value in everything that came out (`tests/test_privacy.py`). Their own inputs are checked first: the seeds are in the subprocess's environment, and the search finds a seeded value in an output that holds one.

### The effective engine configuration

An engine lab's receipt also records what the engine *did* (`environment.engineConfig`): the runner that ran (MRV2, or MRV1 after a fallback), the CUDA-graph mode after any downgrade, whether scheduling was async, the attention backend, and `max_num_batched_tokens` and `max_num_seqs`, which differ by GPU for the same command (ASSESSMENT §5.6). The lab hands the grader its engine's log and, if it has one, the configuration dump (`StageResult.engine_run`), and `engine_config.py` reads the six fields from them. It reads vLLM v0.33.0 only, the course's pin, and the lines it looks for are quoted with their files and lines in `content/claims/vllm/logs.yaml`.

At that pin the log alone is not enough [measured 2026-11-09, vLLM v0.33.0 at 4ba787e]. A default start prints no line that says async scheduling is on, and prints `max_num_seqs` at DEBUG only. So a lab also hands over the configuration dump: the answer of `/server_info?config_format=json` (a dev-mode endpoint, with `VLLM_SERVER_DEV_MODE=1`), or the `VllmConfig` of an offline `LLM` dumped as JSON. A field that no source gives is missing and is never guessed, and two sources that disagree make it missing too. A reading with a field missing records no `engineConfig` (the receipt schema needs all six) and one failed `engine-config` check that says what was not found; the receipt is written all the same, so that a run is not lost for a log line. `enginespace doctor --engine-log FILE --engine-config FILE` shows what the grader would read from an earlier run. A lab that keeps the log as an artifact (so that the site can read the same configuration) scrubs it first with `redact.scrub_text`, and keeps `engine_config.dump_essentials(dump)` of the dump: the five values the reading uses, with no model name, folder or environment (the dump of `/server_info` has all three).

The reading is tested on logs and dumps written by hand from the pinned source's format strings (`tests/synthetic/`, labelled SYNTHETIC), because no engine ran: W2-T12's recordings of the owner's runs must be read by the same code, and whatever they show that the synthetic files do not is a finding for this module.

## The contract with the site

The grader and the site must agree on a few things exactly (A§9.8, D-030), and TypeScript is the source of each:

- **The schemas.** `packages/schema` (zod) is the one definition of `receipt@1`, `bundle@1`, the challenge, `trace@1` and `references@1`, the manifest that `fetch` reads. `bun scripts/export-schemas.ts` writes them to `schemas/*.schema.json` and, byte for byte, to `src/enginespace_grader/schemas/`, because the grader is installed by itself and validates with that copy. `verify:schema` fails when a copy differs.
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

The tests use the standard library's `unittest` and run on the CPU. Nothing in them asks the machine they run on, apart from one test that fingerprints it and requires the result to fit a receipt: the sources of the fingerprint are parameters (`fingerprint.Probes`), and the tests give them recorded `nvidia-smi` output, a fake NVML (`tests/fake_nvml.py`) and logs in `tests/synthetic/`, all written by hand with invented values (its README says so). They pass on CPython 3.11, 3.12, 3.13 and 3.14, the range the package declares [measured 2026-11-09, 3.11.14 to 3.14.3, also with `-X dev -W error`]; `labs.yml` runs the runner's default interpreter. Run from the root of the repository, `python -m unittest` searches only folders that are packages, so `labs/`, `labs/grader/` and `labs/grader/tests/` each have an `__init__.py`; without them the command would find no test and, on Python 3.11, pass: it exits 0 there and 5 from Python 3.12 on [measured 2026-11-09, CPython 3.11.14 to 3.14.3]. `tests/test_discovery.py` and `tests/grader/package.test.ts` hold them in place. `uv lock --check --project labs/grader` checks that `uv.lock` is current.

`tests/fixtures/grader/` (at the root of the repository) holds a synthetic bundle that this grader wrote, with an invented machine and a fixed identity that is not a published build. The Python suite requires the file to be what the grader writes now (`tests/test_fixture.py`), and `tests/grader/bundle-fixture.test.ts` reads it with the browser's own primitives (`DecompressionStream`, the zod schemas, `canonicalJson`, `crypto`) and requires rules 1 to 3 to pass and the receipt's identity hash to be the one in `sample.expected.json`. So what the grader writes is what the site reads, with neither language needing the other at test time. After a change that is meant to alter the file: `uv run --project labs/grader python -m labs.grader.tests.fixture`.

## Layout

```
pyproject.toml  uv.lock  README.md
src/enginespace_grader/
  cli.py  grade.py  verify.py  selftest.py  doctor.py      the commands
  challenge.py  rng.py  canonical.py  hashing.py           the cross-language contract
  receipt.py  bundle.py  schemas.py  identity.py           the receipt, the bundle, the packaged schemas, the grader's hash
  fingerprint.py  redact.py  engine_config.py              the fingerprint; what a receipt never holds; the effective engine configuration
  fetch.py                                                 the references manifest, and the downloads it pins (W2-T05)
  trace/                                                   `trace export`: model.py (the columns, as the site writes them), assemble.py, torch_profiler.py, nsys.py, export.py (W2-T19)
  labs/                                                    the plug-in interface; one module for each lab arrives with its task
  schemas/                                                 written by scripts/export-schemas.ts
tests/                                                     unittest
```

The pyproject has no `license` field, on purpose: the licence of enginespace's own code is the owner's decision (O-3, D-060).
