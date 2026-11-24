# enginespace GPU kit {{VERSION}}

The local half of the Engine Internals labs (ARCHITECTURE section 9). This folder holds the grader, one locked environment for each engine, and what a lab needs beside them. It is one folder, and it runs from wherever you unzip it.

| Folder | Holds |
|---|---|
| `grader/` | the `enginespace` command, as a uv project (the grader {{VERSION}}, source hash `{{SOURCE_HASH}}`) |
| `envs/` | one locked uv project for each engine, each with a hashed `requirements.txt` and a `Dockerfile`; `envs/README.md` says which engine runs which lab |
| `references/` | `manifest.json`, the pinned list of large files that `enginespace fetch <lab>` downloads |
| `course.lock.json` | the engine pins that `enginespace doctor` compares your environment with |
{{OPTIONAL_ROWS}}

## Which environment each lab uses

Run each lab in its own environment, with `--project envs/<folder>` in place of `envs/vllm` in the commands below. `envs/README.md` gives the engine pins.

| Lab | Folder | Where it runs |
|---|---|---|
| `tr0.forward` (TR0, the forward pass) | `envs/cpu` | your laptop's CPU, no GPU |
| `tr1.fork` (TR1, the nano-vllm fork) | `envs/nano-vllm` | a GPU |
| `tr3.profile`, `tr4.sweep`, `tr5b.connector`, `tr6.proposer`, `tr7.reproduce`, `tr8.replay`, `capstone.pair` | `envs/vllm` | a GPU |
| TR1 and TR3 reading runs, and TR6's alternative | `envs/sglang` | a GPU |

## Check what you downloaded

The course site lists this file's size and SHA-256 in `labs/manifest.json`. Compare them before you unpack it:

```sh
sha256sum enginespace-gpu-kit-{{VERSION}}.zip
```

## Install with uv 0.10.2

The commands use `envs/vllm`; TR0 uses `envs/cpu`, which needs no GPU and is the only one to install on a laptop.

```sh
unzip enginespace-gpu-kit-{{VERSION}}.zip && cd enginespace-gpu-kit
uv sync --locked --project envs/vllm
uv run --project envs/vllm enginespace doctor
uv run --project envs/vllm enginespace version
```

`enginespace version` prints the grader's source hash. It has to be the one in the table above, and the course site only credits a receipt from a grader build it published.

## Install with pip

Use Python 3.12 in a virtual environment:

```sh
pip install --require-hashes -r envs/vllm/requirements.txt
pip install --no-deps ./grader
```

## Rent a GPU

Each environment has a `Dockerfile`. Build it from this folder: `docker build -f envs/vllm/Dockerfile -t enginespace-vllm .`. Nobody has built these images yet [unverified], and the course's first runs will say.

## What this kit does not do

It sends nothing anywhere. A receipt is a file that you drop on the course site's receipts page, and only `enginespace fetch` downloads, from the pinned addresses of `references/manifest.json`.
