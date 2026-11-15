"""The `enginespace` command: its table, its exit statuses, and `grade` end to end (ARCHITECTURE section 9.4)."""

from __future__ import annotations

import contextlib
import gzip
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from enginespace_grader import GRADER_NAME, __version__, cli, grade, labs
from enginespace_grader.identity import identity

from . import samples


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(list(argv))
    return status, out.getvalue(), err.getvalue()


class Table(unittest.TestCase):
    def test_the_commands_are_those_of_the_architecture(self) -> None:
        self.assertEqual(sorted(cli.COMMANDS), ["doctor", "fetch", "grade", "receipt", "selftest", "trace", "version"])
        status, out, _ = run("--help")
        self.assertEqual(status, 0)
        for name in cli.COMMANDS:
            self.assertIn(name, out)

    def test_no_command_is_a_usage_error_and_an_unknown_one_names_itself(self) -> None:
        status, out, _ = run()
        self.assertEqual((status, "usage: enginespace" in out), (2, True))
        status, _, err = run("frobnicate")
        self.assertEqual(status, 2)
        self.assertIn("'frobnicate'", err)

    def test_version_prints_the_name_the_version_and_the_source_hash(self) -> None:
        self.assertEqual(run("--version"), (0, f"{GRADER_NAME} {__version__}\n", ""))
        status, out, _ = run("version")
        self.assertEqual(status, 0)
        self.assertEqual(out, f"{GRADER_NAME} {__version__}\nsource sha256 {identity().source_sha256}\n")
        status, out, _ = run("version", "--json")
        self.assertEqual(json.loads(out), {"name": "enginespace-grader", "version": __version__, "sourceSha256": identity().source_sha256})

    def test_the_command_is_installed_and_runs_as_a_module(self) -> None:
        script = shutil.which("enginespace", path=str(Path(sys.executable).parent))
        self.assertIsNotNone(script, "the project's environment installs the command beside its interpreter")
        for command in ([sys.executable, "-m", "enginespace_grader", "version"], [str(script), "version"]):
            done = subprocess.run(command, capture_output=True, text=True, check=False, cwd=tempfile.gettempdir())
            self.assertEqual((done.returncode, done.stdout.splitlines()[0]), (0, f"{GRADER_NAME} {__version__}"), done.stderr)

    def test_importing_the_command_loads_neither_jsonschema_nor_the_commands(self) -> None:
        code = "import sys; import enginespace_grader.cli; print(sorted(m for m in ('jsonschema', 'enginespace_grader.bundle', 'enginespace_grader.verify', 'enginespace_grader.selftest', 'enginespace_grader.fetch') if m in sys.modules))"
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip(), "[]")

    def test_version_and_doctor_do_not_load_jsonschema(self) -> None:
        code = "import sys; from enginespace_grader import cli; cli.main(['version']); cli.main(['doctor']); print('jsonschema' in sys.modules)"
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip().splitlines()[-1], "False")


class Interrupt(unittest.TestCase):
    def test_an_interrupt_is_status_130_and_a_line_and_not_a_traceback(self) -> None:
        def interrupted(argv: object) -> int:
            raise KeyboardInterrupt

        with mock.patch.dict(cli.COMMANDS, {"version": (interrupted, "x")}):
            status, out, err = run("version")
        self.assertEqual((status, out, err), (130, "", "enginespace: interrupted\n"))

    def test_without_the_distribution_installed_the_version_is_one_that_no_site_list_has(self) -> None:
        code = (
            "import importlib.metadata as m\n"
            "def missing(name):\n"
            "    raise m.PackageNotFoundError(name)\n"
            "m.version = missing\n"
            "import enginespace_grader\n"
            "print(enginespace_grader.__version__)\n"
        )
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip(), "0+unknown")


class Doctor(unittest.TestCase):
    def test_it_prints_what_a_receipt_would_record_and_says_what_it_does_not_check(self) -> None:
        status, out, _ = run("doctor")
        self.assertEqual(status, 0)
        self.assertNotIn("stub", out)
        self.assertIn("not checked in this build", out)
        self.assertIn('"python"', out)

    def test_json_output_holds_the_environment_and_no_pin_check_without_an_environment(self) -> None:
        status, out, _ = run("doctor", "--json", "--host-kind", "modal")
        self.assertEqual(status, 0)
        report = json.loads(out)
        self.assertIsNone(report["pins"])
        self.assertEqual(report["environment"]["host"]["kind"], "modal")
        self.assertEqual(report["grader"]["name"], "enginespace-grader")

    def test_what_it_prints_is_what_a_receipt_would_take(self) -> None:
        from enginespace_grader import fingerprint
        from enginespace_grader.receipt import receipt_problems

        environment = fingerprint.collect("local")
        receipt = samples.sample_bundle()["receipt"]
        receipt["environment"] = environment
        self.assertEqual(receipt_problems(receipt), [])

    def test_a_container_is_found_by_the_marks_it_leaves_and_a_machine_without_them_is_not_one(self) -> None:
        from enginespace_grader import fingerprint

        with mock.patch.object(fingerprint.os.path, "exists", lambda path: True):
            self.assertTrue(fingerprint._in_container())
        with mock.patch.object(fingerprint.os.path, "exists", lambda path: False), mock.patch("builtins.open", side_effect=OSError):
            self.assertFalse(fingerprint._in_container())
        with mock.patch.object(fingerprint.os.path, "exists", lambda path: False), mock.patch("builtins.open", mock.mock_open(read_data="0::/kubepods/burstable/pod1\n")):
            self.assertTrue(fingerprint._in_container())
        with mock.patch.object(fingerprint.os.path, "exists", lambda path: False), mock.patch("builtins.open", mock.mock_open(read_data="0::/user.slice/session-1.scope\n")):
            self.assertFalse(fingerprint._in_container())

    def test_it_collects_no_name_of_the_machine_or_the_person(self) -> None:
        import getpass
        import platform
        import socket

        from enginespace_grader import fingerprint

        secrets = {socket.gethostname(), platform.node()}
        for find in (getpass.getuser, lambda: str(Path.home())):
            try:
                secrets.add(find())
            except (KeyError, OSError, RuntimeError):  # a container with no passwd entry for this user, or no home: there is that much less to look for
                pass
        text = json.dumps(fingerprint.collect())
        for secret in secrets:
            if len(secret) >= 4:
                self.assertNotIn(secret, text)


class Grade(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)
        self.lab = SampleLabForCli()
        labs.register(self.lab)
        self.addCleanup(labs.unregister, "tr3.profile")

    def grade(self, *extra: str, stage: str = "tr3.profile.s2", token: str | None = None, pins_known: bool = True) -> tuple[int, str, str]:
        """Runs `enginespace grade` on the sample lab. Unless a test asks for the real pin check (pins.py), the pins are the sample's."""
        from enginespace_grader.challenge import format_challenge

        token = token if token is not None else format_challenge(stage, 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104")
        env = {key: value for key, value in os.environ.items() if not key.startswith(("ENGINESPACE_", "ES_"))}
        with mock.patch.dict(os.environ, env, clear=True):
            if not pins_known:
                return run("grade", stage, "--challenge", token, "--out", str(self.folder), *extra)
            with mock.patch.object(grade, "local_pins", lambda lab: samples.sample_pins()):
                return run("grade", stage, "--challenge", token, "--out", str(self.folder), *extra)

    def test_a_stage_is_graded_and_the_next_step_is_named(self) -> None:
        status, out, err = self.grade("--assisted", "none", "--agent", "no", "--host-kind", "runpod")
        self.assertEqual(status, 0, err)
        written = sorted(self.folder.iterdir())
        self.assertEqual(len(written), 1)
        self.assertIn(f"wrote {written[0]}", out)
        self.assertIn("checks: 2 passed, 0 failed", out)
        self.assertIn("receipt id ", out)
        self.assertIn(f"enginespace receipt verify {written[0]}", out)
        with gzip.open(written[0], "rb") as packed:
            receipt: dict[str, Any] = json.loads(packed.read())["receipt"]
        self.assertEqual(receipt["provenance"], {"assisted": "none", "agent": False, "guard": "on"})
        self.assertEqual(receipt["environment"]["host"]["kind"], "runpod", "the host kind is what the learner declared")
        self.assertNotIn("not declared", err)

    def test_the_bundle_it_writes_verifies(self) -> None:
        self.grade("--assisted", "none", "--agent", "no")
        (path,) = self.folder.iterdir()
        status, out, _ = run("receipt", "verify", str(path))
        self.assertEqual(status, 0, out)

    def test_undeclared_provenance_is_recorded_as_the_most_help_and_said_on_stderr(self) -> None:
        status, _, err = self.grade()
        self.assertEqual(status, 0)
        self.assertIn("assisted and agent not declared", err)
        (path,) = self.folder.iterdir()
        with gzip.open(path, "rb") as packed:
            self.assertEqual(json.loads(packed.read())["receipt"]["provenance"], {"assisted": "code", "agent": True, "guard": "on"})

    def test_a_failed_check_is_status_1_and_the_receipt_is_written_all_the_same(self) -> None:
        self.lab.fail = True
        status, out, _ = self.grade("--assisted", "none", "--agent", "no")
        self.assertEqual(status, 1)
        self.assertIn("checks: 1 passed, 1 failed", out)
        self.assertIn("FAIL agreement", out)
        self.assertEqual(len(list(self.folder.iterdir())), 1)

    def test_a_lab_this_install_does_not_have_is_status_3_with_a_message(self) -> None:
        status, out, err = self.grade(stage="tr8.replay.s1")
        self.assertEqual((status, out), (3, ""))
        self.assertIn("enginespace: this installation of the grader has no lab tr8.replay", err)

    def test_a_stage_that_is_not_a_stage_id_is_status_3_and_says_what_one_looks_like(self) -> None:
        for stage in ("tr3", "tr3.profile", "profile.s2", "TR3.profile.s2", "../x.y.s1"):
            status, out, err = self.grade(stage=stage, token="x")
            self.assertEqual((status, out), (3, ""), stage)
            self.assertIn("is not a stage id such as tr8.replay.s2", err)

    def test_a_token_that_is_not_one_is_status_3_with_what_to_do(self) -> None:
        status, _, err = self.grade(token="nonsense")
        self.assertEqual(status, 3)
        self.assertIn("not a challenge token", err)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_without_a_course_lock_to_compare_with_a_run_stops_and_says_what_to_do(self) -> None:
        with mock.patch("enginespace_grader.pins.find_kit_root", return_value=None):
            status, out, err = self.grade(pins_known=False)
        self.assertEqual((status, out), (3, ""))
        self.assertIn("course.lock.json was not found", err)
        self.assertIn("ENGINESPACE_KIT", err)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_usage_errors_are_status_2(self) -> None:
        for argv in (["grade"], ["grade", "tr3.profile.s2"], ["grade", "tr3.profile.s2", "--challenge", "x", "--assisted", "lots"], ["receipt"], ["receipt", "verify"]):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                cli.main(argv)
            self.assertEqual(caught.exception.code, 2, argv)


class SampleLabForCli(samples.SampleLab):
    """The sample lab, as the one lab that `grade` finds by its id."""


if __name__ == "__main__":
    unittest.main()
