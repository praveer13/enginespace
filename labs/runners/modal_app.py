"""Grade a stage on a Modal GPU and write the bundle back to this machine (ARCHITECTURE section 9.3, W2-T11).

Run it from the root of the kit, on your own computer. It needs the `modal` package and a Modal account of yours; the grader itself runs in the container.

    uv run --with modal==1.6.4 python runners/modal_app.py selftest      # a dry run: no network, no account, nothing started
    uv run --with modal==1.6.4 python runners/modal_app.py plan --env vllm --stage tr8.replay.s1 --challenge 'es1:...'
    ES_MODAL_ENV=vllm ES_MODAL_GPU=H100 uv run --with modal==1.6.4 modal run runners/modal_app.py \\
        --stage tr8.replay.s1 --challenge 'es1:...' --assisted none --agent no

The image is the environment's own Dockerfile, built by Modal (`Image.from_dockerfile`, context = the kit), so the base is the official image at the pinned tag and the Python
packages are the locked ones, with the hash of every file (`uv sync --locked`). Nothing here installs anything else. The kit is added to the container as /work, and
`enginespace doctor`, `fetch` and `grade` run there. The bundle comes back as bytes, and is written under `--out` after its name has been checked.

What this file never does: it never reads, prints or sends a Modal token (the `modal` client reads MODAL_TOKEN_ID and MODAL_TOKEN_SECRET, or its own config file, by itself),
it passes no secret to the container, and it sends your name and your machine's to no one. `selftest` only looks whether the two variables are set.

The unit test, labs/grader/tests/test_runners.py, runs `selftest`, `plan` and the wiring against a stand-in for `modal` with invented credentials. No Modal call is ever made by a test.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

#: The four engine environments, as labs/envs names them (labs/grader/tests/test_envs.py holds this list to the folders).
ENVIRONMENTS = ("cpu", "vllm", "sglang", "nano-vllm")

#: What Modal's `gpu=` takes [measured 2026-11-15, modal.com/docs/guide/gpu; claim runners.modal.gpu-types]. The page lists no RTX 4090, so a 4090 run is a local or a RunPod one.
MODAL_GPUS = (
    "T4", "L4", "A10", "L40S", "A100", "A100-40GB", "A100-80GB", "RTX-PRO-6000", "H100", "H100!", "H200", "B200", "B200+", "B300",
)  # fmt: skip
DEFAULT_GPU = "H100"
#: The container's time limit, in seconds [estimated]: one stage of a lab, with its downloads, in one hour.
DEFAULT_TIMEOUT = 3600
#: A bundle larger than this is refused on its way back [estimated]: a receipt is a few hundred kilobytes (ARCHITECTURE section 9.6), and a return value is held in memory.
MAX_BUNDLE_BYTES = 64 * 1024 * 1024

#: Where the kit sits in the container, and where downloads are kept (a Modal Volume of the learner's own, so that a model is fetched once).
KIT_IN_CONTAINER = "/work"
CACHE_IN_CONTAINER = "/cache"
CACHE_VOLUME = "enginespace-cache"
APP_NAME = "enginespace-grade"
IGNORED = ("**/.git", "**/.venv", "**/__pycache__", "**/node_modules", "receipts", "**/*.es.json.gz")

# The shapes of a stage id and of a challenge token, as labs/grader/src/enginespace_grader/challenge.py writes them. The grader checks the token's date and checksum
# itself in the container; here a wrong shape is refused before a container is paid for. test_runners.py compares these patterns with the grader's.
_SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
STAGE_PATTERN = rf"(?:tr[0-8][ab]?|capstone)\.{_SLUG}\.s[0-9]+"
TOKEN_PATTERN = rf"es1:({STAGE_PATTERN}):[0-9a-f]{{8}}:[A-Z2-7]{{16}}:[0-9]{{8}}:[0-9a-f]{{8}}"
_STAGE = re.compile(STAGE_PATTERN)
_TOKEN = re.compile(TOKEN_PATTERN)
_BUNDLE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.es\.json\.gz")
_FROM = re.compile(r"^FROM\s+(\S+)\s*$", re.MULTILINE)

ASSISTED = ("none", "explain", "code")
AGENT = ("yes", "no")


class RunnerError(Exception):
    """A request that cannot be run, with the reason in words."""


def find_kit(start: Path | None = None) -> Path:
    """The kit's root: the folder above this file's, which holds `envs/`, `grader/` and `course.lock.json` in a kit, and in a checkout the `labs/` folder, which holds the first two."""
    here = start if start is not None else Path(__file__).resolve().parent
    return here.parent


def base_image(kit: Path, env: str) -> str:
    """The base that an environment's Dockerfile starts from: its single FROM line."""
    if env not in ENVIRONMENTS:
        raise RunnerError(f"the environment is one of {', '.join(ENVIRONMENTS)}, not {env!r}")
    dockerfile = kit / "envs" / env / "Dockerfile"
    try:
        text = dockerfile.read_text(encoding="utf-8")
    except OSError as error:
        raise RunnerError(f"cannot read {dockerfile}: {error.strerror or error}") from None
    found = _FROM.findall(text)
    if len(found) != 1:
        raise RunnerError(f"{dockerfile} must have exactly one FROM line, and it has {len(found)}")
    return str(found[0])


def check_request(stage: str, challenge: str, assisted: str, agent: str, gpu: str, env: str) -> None:
    """Refuse, in words, a request that the grader or Modal would refuse later and after the container was paid for."""
    if env not in ENVIRONMENTS:
        raise RunnerError(f"the environment is one of {', '.join(ENVIRONMENTS)}, not {env!r}")
    if _STAGE.fullmatch(stage) is None:
        raise RunnerError(f"{stage!r} is not a stage id such as tr8.replay.s1")
    found = _TOKEN.fullmatch(challenge)
    if found is None:
        raise RunnerError("the challenge is not a token of the form es1:<stage>:...: copy it whole from the Receipts page")
    if found.group(1) != stage:
        raise RunnerError(f"the challenge is for {found.group(1)}, and the stage is {stage}")
    if assisted not in ASSISTED:
        raise RunnerError(f"--assisted is one of {', '.join(ASSISTED)}, not {assisted!r}: declare how much help you had")
    if agent not in AGENT:
        raise RunnerError(f"--agent is yes or no, not {agent!r}: declare whether an agent worked on the lab")
    if env == "cpu":
        if gpu not in ("", "none"):
            raise RunnerError("the cpu environment runs without a GPU: leave the GPU out")
    elif gpu not in MODAL_GPUS:
        raise RunnerError(f"{gpu!r} is not a GPU type that Modal lists: {', '.join(MODAL_GPUS)}")


def commands(stage: str, challenge: str, assisted: str, agent: str, env: str, *, fetch: bool, out: str = "receipts") -> list[list[str]]:
    """The commands that run in the container, in order, from the kit's folder. Each one has to exit 0 for the next to run, `grade` apart: it exits 1 when a check of
    the lab failed, and then its bundle was written all the same, which is what the learner needs back (ARCHITECTURE section 9.4)."""
    lab = stage[: stage.rindex(".")]
    steps = [["enginespace", "doctor", "--env", env]]
    if fetch:
        steps.append(["enginespace", "fetch", lab])
    steps.append(
        ["enginespace", "grade", stage, "--challenge", challenge, "--host-kind", "modal", "--assisted", assisted, "--agent", agent, "--out", out]
    )
    return steps


def plan(kit: Path, env: str, stage: str, challenge: str, *, assisted: str, agent: str, gpu: str | None = None, fetch: bool = True, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """Everything a run would do, as data: what `plan` prints and `selftest` checks. It holds no credential and starts nothing."""
    chosen = gpu if gpu is not None else ("" if env == "cpu" else DEFAULT_GPU)
    check_request(stage, challenge, assisted, agent, chosen, env)
    if not isinstance(timeout, int) or isinstance(timeout, bool) or timeout < 60:
        raise RunnerError("the time limit is a whole number of seconds, 60 or more")
    return {
        "app": APP_NAME,
        "environment": env,
        "dockerfile": f"envs/{env}/Dockerfile",
        "base": base_image(kit, env),
        "context": ".",
        "gpu": chosen or None,
        "timeoutSeconds": timeout,
        "kitInContainer": KIT_IN_CONTAINER,
        "cacheVolume": {"name": CACHE_VOLUME, "mount": CACHE_IN_CONTAINER},
        "containerEnv": {"ENGINESPACE_KIT": KIT_IN_CONTAINER, "ENGINESPACE_CACHE": CACHE_IN_CONTAINER},
        "commands": commands(stage, challenge, assisted, agent, env, fetch=fetch),
    }


def credentials_in_environment(environ: Mapping[str, str]) -> bool:
    """Whether MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are both set. It looks at nothing else and returns no part of either value. The `modal` client also reads its own config file (`modal token set`), so a False here is a note and never a failure."""
    return all((environ.get(name) or "").strip() != "" for name in ("MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"))


# --------------------------------------------------------------------------------------------------------------------------------------------------------------
# In the container
# --------------------------------------------------------------------------------------------------------------------------------------------------------------

Runner = Callable[..., "subprocess.CompletedProcess[str]"]


def run_in_container(request: Mapping[str, Any], *, runner: Runner = subprocess.run, workdir: str = KIT_IN_CONTAINER) -> dict[str, Any]:
    """Run the request's commands in `workdir`, and return what to take home: the exit status of each command and the bytes of each bundle that `grade` wrote.

    A command that fails stops the run, except `grade` exiting 1: its bundle holds the failed check and its reason, and the site shows it. `runner` is `subprocess.run`, and a test passes a fake."""
    results: list[dict[str, Any]] = []
    out_dir = Path(workdir) / "receipts"
    for step in request["commands"]:
        step = [str(part) for part in step]
        done = runner(step, cwd=workdir, text=True, capture_output=True, check=False)
        sys.stdout.write(done.stdout or "")
        sys.stderr.write(done.stderr or "")
        results.append({"command": step[:2], "status": done.returncode})
        graded = step[:2] == ["enginespace", "grade"]
        if done.returncode != 0 and not (graded and done.returncode == 1):
            return {"commands": results, "bundles": {}, "stoppedAt": " ".join(step[:2])}
    bundles: dict[str, bytes] = {}
    if out_dir.is_dir():
        for path in sorted(out_dir.glob("*.es.json.gz")):
            bundles[path.name] = path.read_bytes()
    return {"commands": results, "bundles": bundles, "stoppedAt": None}


# --------------------------------------------------------------------------------------------------------------------------------------------------------------
# Back on this machine
# --------------------------------------------------------------------------------------------------------------------------------------------------------------


def write_bundles(bundles: Mapping[str, bytes], out: Path) -> list[Path]:
    """Write each returned bundle under `out`. A name that is not a plain `<name>.es.json.gz`, a bundle that is empty or larger than MAX_BUNDLE_BYTES, and a file that already exists are refused, so a container can never write outside `out` or replace a file of yours."""
    written: list[Path] = []
    if not bundles:
        return written
    for name, data in bundles.items():
        if _BUNDLE_NAME.fullmatch(name) is None or ".." in name:
            raise RunnerError(f"the container returned a file named {name!r}, which is not a bundle name; nothing was written for it")
        if not isinstance(data, bytes | bytearray) or not 0 < len(data) <= MAX_BUNDLE_BYTES:
            raise RunnerError(f"the bundle {name} is empty or larger than {MAX_BUNDLE_BYTES:,} bytes; it was not written")
        target = out / name
        if target.exists():
            raise RunnerError(f"{target} exists already; move it and run the stage again")
    out.mkdir(parents=True, exist_ok=True)
    for name, data in bundles.items():
        target = out / name
        target.write_bytes(bytes(data))
        written.append(target)
    return written


# --------------------------------------------------------------------------------------------------------------------------------------------------------------
# Modal
# --------------------------------------------------------------------------------------------------------------------------------------------------------------


def build_app(modal_module: Any, kit: Path, env: str, gpu: str | None, timeout: int) -> tuple[Any, Any]:
    """The Modal app and its one remote function, built from `modal_module` (the real `modal`, or a stand-in in the test). Nothing is started here: Modal builds the image when the app runs."""
    check_request("tr8.replay.s1", "es1:tr8.replay.s1:00000000:AAAAAAAAAAAAAAAA:20000101:00000000", "none", "no", gpu if gpu is not None else ("" if env == "cpu" else DEFAULT_GPU), env)
    chosen = gpu if gpu is not None else ("" if env == "cpu" else DEFAULT_GPU)
    image = (
        modal_module.Image.from_dockerfile(str(kit / "envs" / env / "Dockerfile"), context_dir=str(kit))
        .env({"ENGINESPACE_KIT": KIT_IN_CONTAINER, "ENGINESPACE_CACHE": CACHE_IN_CONTAINER, "ES_MODAL_ENV": env, "ES_MODAL_GPU": chosen})
        .add_local_dir(str(kit), KIT_IN_CONTAINER, ignore=list(IGNORED))
    )
    app = modal_module.App(APP_NAME)
    options: dict[str, Any] = {
        "image": image,
        "timeout": timeout,
        "volumes": {CACHE_IN_CONTAINER: modal_module.Volume.from_name(CACHE_VOLUME, create_if_missing=True)},
    }
    if chosen:
        options["gpu"] = chosen
    remote = app.function(**options)(run_in_container)
    return app, remote


def _selected() -> tuple[str, str | None, int]:
    env = os.environ.get("ES_MODAL_ENV", "vllm").strip() or "vllm"
    named = os.environ.get("ES_MODAL_GPU")
    gpu = named.strip() if named is not None else None
    raw = os.environ.get("ES_MODAL_TIMEOUT", "").strip()
    timeout = int(raw) if raw.isdigit() else DEFAULT_TIMEOUT
    return env, gpu, timeout


def _declare_for_modal_cli() -> None:
    """When `modal run` imports this file, define the app and the entrypoint named `main`. A plain `python modal_app.py selftest` never gets here.

    The wiring follows Modal's documentation and client source as read on 2026-11-15 (modal 1.6.4: `Image.from_dockerfile(path, context_dir=...)`, `Image.env`, `Image.add_local_dir`, `Volume.from_name`,
    `App.function(gpu=, timeout=, volumes=)`, `App.local_entrypoint`). No run on Modal has been made: that waits on the owner's smoke run (W2-T12), and until then it is [unverified]."""
    try:
        import modal  # noqa: PLC0415 - only where Modal is installed and asked for
    except ImportError:
        return
    env, gpu, timeout = _selected()
    kit = find_kit()
    app, remote = build_app(modal, kit, env, gpu, timeout)
    globals()["app"] = app

    @app.local_entrypoint()
    def main(stage: str, challenge: str, assisted: str, agent: str, out: str = "receipts", fetch: bool = True) -> None:
        wanted = plan(kit, env, stage, challenge, assisted=assisted, agent=agent, gpu=gpu, fetch=fetch, timeout=timeout)
        result = remote.remote(wanted)
        for step in result["commands"]:
            print(f"{' '.join(step['command'])}: exit {step['status']}")
        written = write_bundles(result["bundles"], Path(out))
        for path in written:
            print(f"wrote {path} ({path.stat().st_size:,} bytes): check it with `enginespace receipt verify {path}`")
        if result["stoppedAt"] is not None:
            raise SystemExit(f"stopped at {result['stoppedAt']}; read the lines above")
        if not written:
            raise SystemExit("the run finished and no bundle came back")


# --------------------------------------------------------------------------------------------------------------------------------------------------------------
# The command line of a plain `python modal_app.py`
# --------------------------------------------------------------------------------------------------------------------------------------------------------------

#: A challenge that is well formed and for no one: the checksum is not computed, so the grader would refuse it, which is what a dry run wants.
SAMPLE_STAGE = "tr8.replay.s1"
SAMPLE_CHALLENGE = "es1:tr8.replay.s1:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000"


def selftest(kit: Path, environ: Mapping[str, str], out: Any = None) -> int:
    """The dry run: for each environment, read its Dockerfile, make the plan and check the request rules; then say whether credentials are set. It makes no network call and starts nothing."""
    write = (out or sys.stdout).write
    failed = 0
    for env in ENVIRONMENTS:
        try:
            made = plan(kit, env, SAMPLE_STAGE, SAMPLE_CHALLENGE, assisted="none", agent="no")
            steps = [" ".join(step[:2]) for step in made["commands"]]
            write(f"  ok    {env}: {made['base']}, gpu {made['gpu'] or 'none'}, runs {', '.join(steps)}\n")
        except RunnerError as error:
            failed += 1
            write(f"  FAIL  {env}: {error}\n")
    refused = 0
    for stage, challenge, assisted in (("tr8.replay.s1", "es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000", "none"), ("not a stage", SAMPLE_CHALLENGE, "none"), (SAMPLE_STAGE, SAMPLE_CHALLENGE, "maybe")):
        try:
            plan(kit, "vllm", stage, challenge, assisted=assisted, agent="no")
        except RunnerError:
            refused += 1
    if refused == 3:
        write("  ok    a challenge for another stage, a bad stage id and an undeclared kind of help are refused\n")
    else:
        failed += 1
        write("  FAIL  a request that should be refused was planned\n")
    if credentials_in_environment(environ):
        write("  ok    MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are set (their values are never printed)\n")
    else:
        write("  note  MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are not both set here; `modal token set` keeps them in a file, and `modal run` needs one of the two\n")
    write("selftest passed (dry run: no network call was made)\n" if failed == 0 else f"selftest FAILED: {failed} problem{'' if failed == 1 else 's'}\n")
    return 0 if failed == 0 else 1


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="modal_app.py", description="Grade a stage on a Modal GPU (see the top of this file).")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("selftest", help="a dry run: read the Dockerfiles, make a plan, check the rules; no network, no account")
    shown = sub.add_parser("plan", help="print what a run would do, as JSON, and start nothing")
    shown.add_argument("--env", required=True, choices=ENVIRONMENTS)
    shown.add_argument("--stage", required=True)
    shown.add_argument("--challenge", required=True)
    shown.add_argument("--assisted", default="code", choices=ASSISTED, help="how much help you had; the default is the most, as the grader's is")
    shown.add_argument("--agent", default="yes", choices=AGENT, help="whether an agent worked on the lab; the default is yes, as the grader's is")
    shown.add_argument("--gpu", default=None)
    shown.add_argument("--no-fetch", action="store_true", help="leave out `enginespace fetch` (a lab that lists no download)")
    args = parser.parse_args(list(argv) if argv is not None else None)
    kit = find_kit()
    try:
        if args.command == "selftest":
            return selftest(kit, environ if environ is not None else os.environ)
        made = plan(kit, args.env, args.stage, args.challenge, assisted=args.assisted, agent=args.agent, gpu=args.gpu, fetch=not args.no_fetch)
    except RunnerError as error:
        sys.stderr.write(f"error: {error}\n")
        return 2
    sys.stdout.write(json.dumps(made, indent=2) + "\n")
    return 0


# `modal run` (and the container, which imports the file again) loads this file under its own name, `modal_app`. A plain `python modal_app.py` is `__main__`, and a test
# loads it under another name, so neither one declares an app.
if __name__ == "modal_app":
    _declare_for_modal_cli()

if __name__ == "__main__":
    raise SystemExit(main())
