# Engine environments

One locked uv project per engine (ARCHITECTURE section 9.2, D-026). Each folder holds `pyproject.toml`, `uv.lock`, a hashed `requirements.txt` made from the lock by `uv export`, and a `Dockerfile`.

| Folder | Runs | Engine pin (course.lock.json) | Python |
|---|---|---|---|
| `cpu/` | TR0's forward pass on the CPU | torch 2.14.0 (CPU wheel on Linux), transformers 5.19.0 | 3.11 to 3.14 |
| `vllm/` | TR3, TR4, TR5b, TR6, TR7, TR8, the capstone | vLLM 0.33.0 (torch 2.14.0, xgrammar 0.2.8) | 3.11 to 3.14 |
| `sglang/` | TR1 and TR3 reading runs, TR6's alternative | SGLang 0.5.23 (torch 2.14.1, xgrammar 0.2.7) | 3.11 to 3.14 |
| `nano-vllm/` | TR1's fork | nano-vllm at commit bb823b3 (torch 2.14.0) | 3.11 and 3.12 |

vLLM and SGLang pin different torch and xgrammar builds, so they cannot share an environment. nano-vllm declares Python below 3.13.

The pins are **proposed** (D-035, O-4): they were built on by default on 2026-11-15, and a change of pin re-locks the environments (`bash labs/envs/relock.sh`).

## Use

From a kit, or from `labs/` of a checkout, with uv 0.10.2:

```sh
uv sync --locked --project envs/vllm        # installs from the lock, with the hash of every file; needs a GPU host for the engine to run
uv run --project envs/vllm enginespace doctor
```

Never run `uv sync` on an engine environment on a machine without a GPU: the wheels are gigabytes. `uv lock --check` needs none of them.

With pip, in a Python 3.12 virtual environment:

```sh
pip install --require-hashes -r envs/vllm/requirements.txt
pip install --no-deps ./grader
```

`requirements.txt` leaves out the grader and, for nano-vllm, the engine itself, because pip cannot hash a path or a git commit: install them in a step of their own (`pip install --no-deps ./grader`, and for nano-vllm `pip install --no-deps git+https://github.com/GeeeekExplorer/nano-vllm@bb823b3e06983d71485a8e1f23715ebd87d98ef8`). The CPU environment's Linux wheel of torch is `2.14.0+cpu`, served by `--extra-index-url https://download.pytorch.org/whl/cpu`.

## Change a pin

1. Change the pin in `course.lock.json` (and its DECISIONS record) and the same version in the environment's `pyproject.toml`.
2. Run `bash labs/envs/relock.sh`. It locks all four and writes the four `requirements.txt`.
3. `bash labs/envs/relock.sh --check` is what CI runs: it fails on a stale lock or a stale export.

The grader's tests (`labs/grader/tests/test_envs.py`) fail while a `pyproject.toml` disagrees with `course.lock.json`.

The Dockerfiles are untested until the owner's smoke run (W2-T12).
