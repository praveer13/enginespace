"""The rented-GPU runners (labs/runners, W2-T11): modal_app.py's dry run, its wiring, and the two documents.

Nothing here reaches the network or a Modal account. The credentials are invented values, `modal` is a stand-in that records what it was asked, and the documents are read
as files: their shell blocks must parse (`bash -n`), name only commands and flags that the grader has, and name the image tags that the Dockerfiles start from.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest import mock

from enginespace_grader import challenge, cli

REPO = Path(__file__).resolve().parents[3]
LABS = REPO / "labs"
RUNNERS = LABS / "runners"
CLAIMS = REPO / "content" / "claims"

#: A home folder, a scratch folder and a user folder, written in pieces so that this file does not hold them either (tests/grader/package.test.ts sweeps the grader's files for them).
LOCAL_PLACES = ("/ho" + "me/", "/t" + "mp/", "/Us" + "ers/")

#: Invented, and shaped like nothing that Modal issues: a stub is enough to show that the dry run looks at the two variables and prints neither.
STUB_ENVIRON = {"MODAL_TOKEN_ID": "ak-example-stub-id", "MODAL_TOKEN_SECRET": "as-example-stub-secret"}
STAGE = "tr8.replay.s1"
TOKEN = challenge.format_challenge(STAGE, 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104")


def load_modal_app() -> Any:
    """The file under a name of its own, so that it declares no Modal app on import (it does that only when it is loaded as `modal_app`)."""
    spec = importlib.util.spec_from_file_location("es_runners_under_test", RUNNERS / "modal_app.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    # No bytecode is written beside the file: the kit packer refuses a folder that holds build output (scripts/pack-kit.ts).
    was, sys.dont_write_bytecode = sys.dont_write_bytecode, True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = was
    return module


modal_app = load_modal_app()


class FakeImage:
    def __init__(self, calls: list[tuple[str, Any]]) -> None:
        self.calls = calls

    def env(self, values: dict[str, str]) -> FakeImage:
        self.calls.append(("env", dict(values)))
        return self

    def add_local_dir(self, local: str, remote: str, **options: Any) -> FakeImage:
        self.calls.append(("add_local_dir", (local, remote, options)))
        return self


class FakeModal(types.ModuleType):
    """A stand-in for the `modal` package: it records each call and starts nothing, so a test never needs an account."""

    def __init__(self, remote_result: dict[str, Any] | None = None) -> None:
        super().__init__("modal")
        self.calls: list[tuple[str, Any]] = []
        self.entrypoints: dict[str, Callable[..., Any]] = {}
        self.sent: list[dict[str, Any]] = []
        outer = self
        result = remote_result if remote_result is not None else {"commands": [], "bundles": {}, "stoppedAt": None}

        class Image:
            @staticmethod
            def from_dockerfile(path: str, **options: Any) -> FakeImage:
                outer.calls.append(("from_dockerfile", (path, options)))
                return FakeImage(outer.calls)

        class Volume:
            @staticmethod
            def from_name(name: str, **options: Any) -> str:
                outer.calls.append(("volume", (name, options)))
                return f"volume:{name}"

        class Remote:
            def __init__(self, function: Callable[..., Any]) -> None:
                self.function = function

            def remote(self, request: dict[str, Any]) -> dict[str, Any]:
                outer.sent.append(request)
                return result

        class App:
            def __init__(self, name: str) -> None:
                outer.calls.append(("app", name))

            def function(self, **options: Any) -> Callable[[Callable[..., Any]], Remote]:
                outer.calls.append(("function", options))
                return Remote

            def local_entrypoint(self) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
                def register(function: Callable[..., Any]) -> Callable[..., Any]:
                    outer.entrypoints[function.__name__] = function
                    return function

                return register

        self.Image, self.Volume, self.App = Image, Volume, App

    def call(self, name: str) -> Any:
        found = [value for key, value in self.calls if key == name]
        assert len(found) == 1, f"{name} was called {len(found)} times"
        return found[0]


def run_main(*argv: str, environ: dict[str, str] | None = None) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = modal_app.main(list(argv), environ if environ is not None else {})
    return status, out.getvalue(), err.getvalue()


class DryRun(unittest.TestCase):
    def test_selftest_passes_with_stubbed_credentials_and_prints_neither_value(self) -> None:
        status, out, err = run_main("selftest", environ=STUB_ENVIRON)
        self.assertEqual((status, err), (0, ""))
        self.assertIn("selftest passed (dry run: no network call was made)", out)
        self.assertIn("MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are set", out)
        for value in STUB_ENVIRON.values():
            self.assertNotIn(value, out)
        for env in modal_app.ENVIRONMENTS:
            self.assertIn(f"ok    {env}: ", out)

    def test_selftest_without_credentials_only_notes_it(self) -> None:
        status, out, _ = run_main("selftest", environ={})
        self.assertEqual(status, 0)
        self.assertIn("note  MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are not both set", out)

    def test_one_variable_alone_is_not_credentials(self) -> None:
        self.assertTrue(modal_app.credentials_in_environment(STUB_ENVIRON))
        self.assertFalse(modal_app.credentials_in_environment({"MODAL_TOKEN_ID": "ak-example-stub-id"}))
        self.assertFalse(modal_app.credentials_in_environment({"MODAL_TOKEN_ID": "x", "MODAL_TOKEN_SECRET": "  "}))

    def test_selftest_runs_with_no_network_and_no_modal_installed(self) -> None:
        self.assertNotIn("modal", sys.modules)
        with mock.patch("socket.socket", side_effect=AssertionError("the dry run opened a socket")):
            status, _, _ = run_main("selftest", environ=STUB_ENVIRON)
        self.assertEqual(status, 0)

    def test_selftest_fails_on_a_kit_whose_dockerfile_has_no_base(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            kit = Path(folder)
            for env in modal_app.ENVIRONMENTS:
                (kit / "envs" / env).mkdir(parents=True)
                (kit / "envs" / env / "Dockerfile").write_text("RUN true\n", encoding="utf-8")
            out = io.StringIO()
            self.assertEqual(modal_app.selftest(kit, STUB_ENVIRON, out), 1)
            self.assertIn("FAIL  vllm: ", out.getvalue())
            self.assertIn("selftest FAILED: 4 problems", out.getvalue())

    def test_it_runs_as_a_plain_script_too(self) -> None:
        done = subprocess.run([sys.executable, "-I", str(RUNNERS / "modal_app.py"), "selftest"], capture_output=True, text=True, env={}, check=False)
        self.assertEqual((done.returncode, done.stderr), (0, ""))
        self.assertIn("selftest passed", done.stdout)


class Plan(unittest.TestCase):
    def test_the_base_of_each_environment_is_its_dockerfiles_from_line(self) -> None:
        for env in modal_app.ENVIRONMENTS:
            lines = [line for line in (LABS / "envs" / env / "Dockerfile").read_text(encoding="utf-8").splitlines() if line.startswith("FROM ")]
            self.assertEqual(modal_app.base_image(LABS, env), lines[0].split()[1])

    def test_the_plan_is_data_with_the_grader_commands_in_order_and_no_credential(self) -> None:
        made = modal_app.plan(LABS, "vllm", STAGE, TOKEN, assisted="none", agent="no")
        self.assertEqual(made["gpu"], "H100")
        self.assertEqual(made["dockerfile"], "envs/vllm/Dockerfile")
        self.assertEqual([step[:2] for step in made["commands"]], [["enginespace", "doctor"], ["enginespace", "fetch"], ["enginespace", "grade"]])
        grade = made["commands"][-1]
        self.assertEqual(grade[grade.index("--host-kind") + 1], "modal")
        self.assertEqual(made["commands"][1][2], "tr8.replay")
        self.assertNotIn("MODAL", json.dumps(made))
        self.assertEqual(json.loads(json.dumps(made)), made)

    def test_the_cpu_environment_asks_for_no_gpu_and_no_fetch_leaves_the_step_out(self) -> None:
        made = modal_app.plan(LABS, "cpu", "tr0.forward.s1", TOKEN.replace(STAGE, "tr0.forward.s1"), assisted="code", agent="yes", fetch=False)
        self.assertIsNone(made["gpu"])
        self.assertEqual([step[1] for step in made["commands"]], ["doctor", "grade"])
        with self.assertRaises(modal_app.RunnerError):
            modal_app.plan(LABS, "cpu", STAGE, TOKEN, assisted="none", agent="no", gpu="H100")

    def test_a_request_the_grader_would_refuse_is_refused_before_a_container_is_paid_for(self) -> None:
        bad: list[dict[str, Any]] = [
            {"stage": "tr8.replay"},
            {"stage": "tr9.replay.s1"},
            {"challenge": "es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000"},
            {"challenge": "not a token"},
            {"assisted": "maybe"},
            {"agent": "perhaps"},
            {"gpu": "RTX-4090"},
            {"timeout": 5},
            {"env": "tensorrt"},
        ]
        for change in bad:
            args: dict[str, Any] = {"env": "vllm", "stage": STAGE, "challenge": TOKEN, "assisted": "none", "agent": "no", "gpu": None, "timeout": 3600} | change
            with self.subTest(change=change), self.assertRaises(modal_app.RunnerError):
                modal_app.plan(LABS, args["env"], args["stage"], args["challenge"], assisted=args["assisted"], agent=args["agent"], gpu=args["gpu"], timeout=args["timeout"])

    def test_the_token_and_stage_shapes_agree_with_the_graders(self) -> None:
        good = [(STAGE, TOKEN), ("tr3.profile.s12", challenge.format_challenge("tr3.profile.s12", 1, "AAAAAAAAAAAAAAAA", "20261105")), ("capstone.final.s1", challenge.format_challenge("capstone.final.s1", 2, "BBBBBBBBBBBBBBBB", "20261106"))]
        for stage, token in good:
            self.assertIsNotNone(challenge.parse_challenge(token), token)
            self.assertIsNotNone(re.fullmatch(modal_app.STAGE_PATTERN, stage), stage)
            self.assertIsNotNone(re.fullmatch(modal_app.TOKEN_PATTERN, token), token)
        for stage in ("tr8.replay", "tr9.x.s1", "tr8.Replay.s1", "tr8..s1", "tr8.replay.s", "tr8.replay.s1 ", "TR8.replay.s1"):
            self.assertIsNone(re.fullmatch(modal_app.STAGE_PATTERN, stage), stage)
        for token in (TOKEN + "0", TOKEN.replace("es1", "es2"), TOKEN.upper(), TOKEN[:-1]):
            self.assertIsNone(re.fullmatch(modal_app.TOKEN_PATTERN, token), token)

    def test_the_gpu_list_is_the_claims_list(self) -> None:
        text = (CLAIMS / "runners.yaml").read_text(encoding="utf-8")
        value = re.search(r"- id: runners\.modal\.gpu-types\n  value: '([^']+)'", text)
        assert value is not None
        self.assertEqual(tuple(value.group(1).split(", ")), modal_app.MODAL_GPUS)
        self.assertNotIn("4090", " ".join(modal_app.MODAL_GPUS))


class Wiring(unittest.TestCase):
    def test_the_image_is_the_dockerfile_with_the_kit_as_its_context_and_the_function_gets_the_gpu(self) -> None:
        fake = FakeModal()
        app, remote = modal_app.build_app(fake, LABS, "vllm", None, 1800)
        self.assertIsNotNone(app)
        path, options = fake.call("from_dockerfile")
        self.assertEqual(path, str(LABS / "envs" / "vllm" / "Dockerfile"))
        self.assertEqual(options, {"context_dir": str(LABS)})
        local, remote_path, kept = fake.call("add_local_dir")
        self.assertEqual((local, remote_path), (str(LABS), "/work"))
        self.assertIn("receipts", kept["ignore"])
        env = fake.call("env")
        self.assertEqual((env["ENGINESPACE_KIT"], env["ENGINESPACE_CACHE"], env["ES_MODAL_ENV"], env["ES_MODAL_GPU"]), ("/work", "/cache", "vllm", "H100"))
        function = fake.call("function")
        self.assertEqual((function["gpu"], function["timeout"]), ("H100", 1800))
        self.assertEqual(function["volumes"], {"/cache": "volume:enginespace-cache"})
        self.assertEqual(fake.call("volume")[1], {"create_if_missing": True})
        self.assertEqual(remote.function, modal_app.run_in_container)
        self.assertEqual(set(function), {"image", "timeout", "volumes", "gpu"})

    def test_no_secret_goes_to_the_container(self) -> None:
        fake = FakeModal()
        with mock.patch.dict(os.environ, STUB_ENVIRON):
            modal_app.build_app(fake, LABS, "sglang", "L40S", 600)
        function = fake.call("function")
        self.assertNotIn("secrets", function)
        self.assertEqual(function["gpu"], "L40S")
        everything = json.dumps([call for call in fake.calls if call[0] != "from_dockerfile"], default=str)
        for value in STUB_ENVIRON.values():
            self.assertNotIn(value, everything)

    def test_the_cpu_function_has_no_gpu_and_a_gpu_outside_the_list_is_refused(self) -> None:
        fake = FakeModal()
        modal_app.build_app(fake, LABS, "cpu", None, 600)
        self.assertNotIn("gpu", fake.call("function"))
        with self.assertRaises(modal_app.RunnerError):
            modal_app.build_app(FakeModal(), LABS, "vllm", "RTX-4090", 600)

    def test_the_entrypoint_sends_the_plan_and_writes_the_bundle_home(self) -> None:
        bundle = b"\x1f\x8b synthetic bundle bytes"
        fake = FakeModal({"commands": [{"command": ["enginespace", "grade"], "status": 0}], "bundles": {"tr8-replay-s1-20261104T010203Z.es.json.gz": bundle}, "stoppedAt": None})
        with tempfile.TemporaryDirectory() as folder, mock.patch.dict(sys.modules, {"modal": fake}), mock.patch.dict(os.environ, {"ES_MODAL_ENV": "vllm", "ES_MODAL_GPU": "H100"}):
            modal_app._declare_for_modal_cli()
            self.assertIn("main", fake.entrypoints)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                fake.entrypoints["main"](STAGE, TOKEN, "none", "no", out=str(Path(folder) / "receipts"))
            written = list((Path(folder) / "receipts").iterdir())
            self.assertEqual([path.name for path in written], ["tr8-replay-s1-20261104T010203Z.es.json.gz"])
            self.assertEqual(written[0].read_bytes(), bundle)
            self.assertIn("enginespace receipt verify", out.getvalue())
        self.assertEqual(len(fake.sent), 1)
        self.assertEqual(fake.sent[0]["environment"], "vllm")
        self.assertEqual(fake.sent[0]["commands"][-1][2], STAGE)
        modal_app.__dict__.pop("app", None)

    def test_a_run_that_stopped_or_returned_nothing_ends_in_an_error(self) -> None:
        for result in ({"commands": [], "bundles": {}, "stoppedAt": "enginespace doctor"}, {"commands": [], "bundles": {}, "stoppedAt": None}):
            fake = FakeModal(result)
            with tempfile.TemporaryDirectory() as folder, mock.patch.dict(sys.modules, {"modal": fake}):
                modal_app._declare_for_modal_cli()
                with self.assertRaises(SystemExit), contextlib.redirect_stdout(io.StringIO()):
                    fake.entrypoints["main"](STAGE, TOKEN, "none", "no", out=str(Path(folder) / "r"))
                self.assertFalse((Path(folder) / "r").exists())
            modal_app.__dict__.pop("app", None)


class InTheContainer(unittest.TestCase):
    def request(self) -> dict[str, Any]:
        return modal_app.plan(LABS, "vllm", STAGE, TOKEN, assisted="none", agent="no")

    def fake_runner(self, workdir: str, statuses: dict[str, int], seen: list[list[str]]) -> Callable[..., Any]:
        def runner(step: list[str], **options: Any) -> Any:
            seen.append(step)
            self.assertEqual(options["cwd"], workdir)
            name = step[1]
            if name == "grade":
                folder = Path(workdir) / "receipts"
                folder.mkdir(exist_ok=True)
                (folder / "tr8-replay-s1-20261104T010203Z.es.json.gz").write_bytes(b"synthetic")
                (folder / "notes.txt").write_text("not a bundle", encoding="utf-8")
            return subprocess.CompletedProcess(step, statuses.get(name, 0), stdout="", stderr="")

        return runner

    def test_the_commands_run_in_order_and_the_bundles_come_back(self) -> None:
        with tempfile.TemporaryDirectory() as workdir:
            seen: list[list[str]] = []
            result = modal_app.run_in_container(self.request(), runner=self.fake_runner(workdir, {}, seen), workdir=workdir)
        self.assertEqual([step[1] for step in seen], ["doctor", "fetch", "grade"])
        self.assertEqual(result["bundles"], {"tr8-replay-s1-20261104T010203Z.es.json.gz": b"synthetic"})
        self.assertIsNone(result["stoppedAt"])

    def test_a_failed_check_still_brings_its_bundle_but_a_failed_doctor_stops_the_run(self) -> None:
        with tempfile.TemporaryDirectory() as workdir:
            result = modal_app.run_in_container(self.request(), runner=self.fake_runner(workdir, {"grade": 1}, []), workdir=workdir)
        self.assertEqual(len(result["bundles"]), 1)
        with tempfile.TemporaryDirectory() as workdir:
            seen: list[list[str]] = []
            result = modal_app.run_in_container(self.request(), runner=self.fake_runner(workdir, {"doctor": 1}, seen), workdir=workdir)
        self.assertEqual((result["bundles"], result["stoppedAt"], [step[1] for step in seen]), ({}, "enginespace doctor", ["doctor"]))
        with tempfile.TemporaryDirectory() as workdir:
            result = modal_app.run_in_container(self.request(), runner=self.fake_runner(workdir, {"grade": 3}, []), workdir=workdir)
        self.assertEqual((result["bundles"], result["stoppedAt"]), ({}, "enginespace grade"))


class WriteBack(unittest.TestCase):
    def test_a_name_that_could_leave_the_folder_is_refused_and_nothing_is_written(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "receipts"
            for name in ("../x.es.json.gz", "/etc/x.es.json.gz", "a/b.es.json.gz", "x.json", ".hidden.es.json.gz", "x..y/../z.es.json.gz", "x\n.es.json.gz"):
                with self.subTest(name=name), self.assertRaises(modal_app.RunnerError):
                    modal_app.write_bundles({"ok.es.json.gz": b"a", name: b"b"}, out)
                self.assertFalse(out.exists())

    def test_an_empty_an_oversize_and_an_existing_bundle_are_refused(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            (out / "have.es.json.gz").write_bytes(b"mine")
            with self.assertRaises(modal_app.RunnerError):
                modal_app.write_bundles({"have.es.json.gz": b"theirs"}, out)
            self.assertEqual((out / "have.es.json.gz").read_bytes(), b"mine")
            with self.assertRaises(modal_app.RunnerError):
                modal_app.write_bundles({"empty.es.json.gz": b""}, out)
            with mock.patch.object(modal_app, "MAX_BUNDLE_BYTES", 4), self.assertRaises(modal_app.RunnerError):
                modal_app.write_bundles({"big.es.json.gz": b"12345"}, out)
            self.assertEqual(sorted(path.name for path in out.iterdir()), ["have.es.json.gz"])


def fenced(text: str, language: str = "bash") -> list[str]:
    return re.findall(rf"^```{language}\n(.*?)^```$", text, re.MULTILINE | re.DOTALL)


def claim_ids() -> set[str]:
    found: set[str] = set()
    for path in CLAIMS.rglob("*.yaml"):
        found.update(re.findall(r"^- id: (\S+)$", path.read_text(encoding="utf-8"), re.MULTILINE))
    return found


def help_text(*argv: str) -> str:
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()), contextlib.suppress(SystemExit):
        cli.main([*argv, "--help"])
    return out.getvalue()


@unittest.skipUnless(shutil.which("bash"), "bash is needed to parse the documents' blocks")
class Documents(unittest.TestCase):
    docs = {name: (RUNNERS / name).read_text(encoding="utf-8") for name in ("runpod.md", "lambda.md")}

    def test_every_shell_block_parses_and_leaves_no_placeholder_to_fill_by_hand(self) -> None:
        for name, text in self.docs.items():
            blocks = fenced(text)
            self.assertGreaterEqual(len(blocks), 4, name)
            for number, block in enumerate(blocks, start=1):
                with self.subTest(document=name, block=number):
                    done = subprocess.run(["bash", "-n"], input=block, capture_output=True, text=True, check=False)
                    self.assertEqual((done.returncode, done.stderr), (0, ""))
                    self.assertIsNone(re.search(r"<[A-Za-z_-]+>", block), "a <placeholder> is a shell redirect: use a variable on a line marked # EDIT")

    def test_every_value_the_reader_must_change_sits_on_a_line_marked_edit(self) -> None:
        for name, text in self.docs.items():
            for block in fenced(text):
                for line in block.splitlines():
                    if re.search(r"203\.0\.113\.|^KIT_SHA256='0{64}'|0badc0de|^STAGE=|^ENV_NAME=", line):
                        self.assertIn("# EDIT", line, f"{name}: {line}")

    def test_the_commands_and_flags_named_exist_in_the_grader(self) -> None:
        for name, text in self.docs.items():
            for block in fenced(text):
                for line in re.findall(r"enginespace (doctor|fetch|grade|receipt verify)\b([^\n]*)", block):
                    command = line[0].split()
                    helped = help_text(*command)
                    self.assertTrue(helped, f"{name}: no help for {command}")
                    for flag in re.findall(r"(?<![\w-])(--[a-z][a-z-]*)", line[1]):
                        self.assertIn(flag, helped, f"{name}: enginespace {line[0]} has no {flag}")
        grade = help_text("grade")
        for value in ("runpod", "lambda", "modal"):
            self.assertIn(value, grade)

    def test_the_images_in_the_documents_are_the_dockerfiles_bases_and_the_claims_tags(self) -> None:
        claims = (CLAIMS / "runners.yaml").read_text(encoding="utf-8") + (CLAIMS / "vllm" / "release.yaml").read_text(encoding="utf-8")
        bases = {env: modal_app.base_image(LABS, env) for env in ("vllm", "sglang", "nano-vllm", "cpu")}
        for ident in ("vllm.image.openai-tag", "sglang.image.tag", "runners.image.cuda-devel", "runners.image.python-slim"):
            self.assertIn(f"- id: {ident}\n", claims)
        for env, base in bases.items():
            self.assertIn(f"value: '{base}'", claims, env)
            if env != "cpu":
                self.assertIn(f"`{base}`", self.docs["runpod.md"], env)
        for env in ("vllm", "sglang", "nano-vllm"):
            self.assertIn(f"`{bases[env]}`", self.docs["lambda.md"], env)
        everything = "\n".join(self.docs.values())
        for image in set(re.findall(r"`((?:vllm/vllm-openai|lmsysorg/sglang|nvidia/cuda|python):[^`]+)`", everything)):
            self.assertIn(image, bases.values(), image)

    def test_every_claim_a_document_names_exists_and_every_image_claim_is_dated_and_measured(self) -> None:
        known = claim_ids()
        for name, text in self.docs.items():
            named = set(re.findall(r"claims? `([a-z0-9.-]+)`", text)) | set(re.findall(r"`((?:runners|vllm|sglang)\.[a-z0-9.-]+)`", text))
            self.assertTrue(named, name)
            self.assertEqual(sorted(named - known), [], name)
        runners = (CLAIMS / "runners.yaml").read_text(encoding="utf-8")
        for block in runners.split("\n- id: ")[1:]:
            ident = block.splitlines()[0]
            if ident.endswith(("openai-tag", "sglang.image.tag", "cuda-devel", "python-slim")) or ".image." in ident:
                self.assertIn("tag: measured", block, ident)
                self.assertRegex(block, r"accessed: 2026-11-15\n", ident)
                self.assertRegex(block, r"verifiedAt: 2026-11-15\n", ident)

    def test_the_documents_pin_uv_and_say_what_they_do_not_know(self) -> None:
        for name, text in self.docs.items():
            self.assertIn("[unverified]", text, name)
            self.assertIn("W2-T12", text, name)
        for block in fenced(self.docs["runpod.md"]):
            for pinned in re.findall(r"uv==([0-9.]+)", block):
                self.assertEqual(pinned, "0.10.2")

    def test_the_documents_hold_nothing_personal_and_claim_no_licence(self) -> None:
        for path in (*self.docs.values(), (RUNNERS / "modal_app.py").read_text(encoding="utf-8"), (CLAIMS / "runners.yaml").read_text(encoding="utf-8")):
            self.assertIsNone(re.search("|".join(LOCAL_PLACES) + r"|[\w.+-]@[a-z0-9-]+\.[a-z]{2,}", path))
            self.assertIsNone(re.search(r"SPDX|licensed under|license\s*=", path, re.IGNORECASE))
        addresses = set(re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", "\n".join(self.docs.values())))
        self.assertEqual({a for a in addresses if not a.startswith("203.0.113.")}, set())
        self.assertFalse(list(RUNNERS.glob("LICENSE*")))
