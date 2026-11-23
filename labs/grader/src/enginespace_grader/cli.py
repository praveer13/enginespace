"""The `enginespace` command (ARCHITECTURE section 9.4): one table of commands, each loaded only when it is named.

    enginespace doctor                                   print the fields a receipt would record, and check the pins and the host driver
    enginespace fetch <lab>                              download the files that a lab pins, and keep only those that hash to the pin
    enginespace grade <lab>.<stage> --challenge <token>  grade a stage on a challenge from the site, and write its bundle
    enginespace receipt verify <file>                    the browser's first three rules, run locally
    enginespace selftest [--gpu]                         the grader's own tests; --gpu adds the GPU smoke
    enginespace trace export <input> --format <fmt>      normalise a torch-profiler or nsys capture into trace@1
    enginespace version                                  the grader's name, version and source hash

A command is a function of the arguments after its name, and it imports what it uses when it runs, so
`--version` and `doctor` do not load `jsonschema`. The pattern is statespace's (bench/statespace/cli.py at 7b6938c).

Exit status: 0 when the command did what it was asked and found nothing wrong, 1 when it found something wrong (a check failed, a file was not verified),
2 for a usage error or a file that cannot be read, and 3 when it could not run (a `GraderError`: a bad token, a lab this install does not have, and so on).
The only command that makes a network request is `fetch`, which downloads the pinned files of a lab with a generic User-Agent and no identity (fetch.py);
nothing else leaves the machine.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from . import GRADER_NAME, __version__
from .errors import GraderError

__all__ = ["COMMANDS", "main", "usage"]

EXIT_OK, EXIT_FAILED, EXIT_USAGE, EXIT_COULD_NOT_RUN = 0, 1, 2, 3


def _doctor(argv: Sequence[str]) -> int:
    from . import doctor

    return doctor.main(argv)


def _fetch(argv: Sequence[str]) -> int:
    from . import fetch

    return fetch.main(argv)


def _selftest(argv: Sequence[str]) -> int:
    from . import selftest

    return selftest.main(argv)


def _version(argv: Sequence[str]) -> int:
    from .identity import identity

    parser = argparse.ArgumentParser(prog="enginespace version", description="Print the grader's name, version and source hash.")
    parser.add_argument("--json", action="store_true", help="print the receipt's grader object as JSON")
    args = parser.parse_args(list(argv))
    found = identity()
    if args.json:
        sys.stdout.write(json.dumps(found.as_object(), indent=2) + "\n")
    else:
        sys.stdout.write(f"{found.name} {found.version}\nsource sha256 {found.source_sha256}\n")
    return EXIT_OK


def _receipt(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(prog="enginespace receipt", description="Work with receipt bundles.")
    commands = parser.add_subparsers(dest="receipt_command", metavar="verify", required=True)
    verify = commands.add_parser(
        "verify",
        help="the browser's first three rules, run locally: caps, schema and token, and artifact hashes",
        description="Check bundles as the site's first three rules do: the caps, the schema and the token, and every artifact's hash. "
        "Exit status: 0 every file verified, 1 one was not, 2 one could not be read.",
    )
    verify.add_argument("files", nargs="+", metavar="FILE", help="a .es.json.gz bundle")
    verify.add_argument("--json", action="store_true", help="print the findings as JSON")
    args = parser.parse_args(list(argv))
    from . import verify as verification

    return verification.main(args.files, args.json)


def _trace(argv: Sequence[str]) -> int:
    help_text = "usage: enginespace trace export <input> --format torch|nsys-sqlite [--out FILE] [options]\n\n`enginespace trace export --help` says more.\n"
    if argv and argv[0] == "export":
        from .trace import export

        return export.main(argv[1:])
    wanted = bool(argv) and argv[0] in ("-h", "--help")
    (sys.stdout if wanted else sys.stderr).write(help_text)
    return EXIT_OK if wanted else EXIT_USAGE


def _grade(argv: Sequence[str]) -> int:
    from . import fingerprint
    from .grade import local_pins, resolve_provenance, run_stage
    from .labs import lab_of_stage_id, load_lab
    from .receipt import enum_values

    parser = argparse.ArgumentParser(
        prog="enginespace grade",
        description="Grade one stage on the challenge that the site issued for it, and write its bundle. "
        "Exit status: 0 every check passed, 1 a check failed (the bundle is written all the same), 2 a usage error, 3 the stage could not run.",
    )
    parser.add_argument("stage", metavar="<lab>.<stage>", help="a stage id, such as tr8.replay.s2")
    parser.add_argument("--challenge", required=True, metavar="TOKEN", help="the token from the Receipts page, whole")
    parser.add_argument("--out", default="receipts", metavar="DIR", help="where the bundle goes (default: receipts)")
    parser.add_argument("--host-kind", default="local", choices=enum_values("environment", "host", "kind"), help="where this run happens, as the receipt records it (self-declared)")
    parser.add_argument("--assisted", choices=enum_values("provenance", "assisted"), help="how much help you had (self-declared; undeclared records the most)")
    parser.add_argument("--agent", choices=("yes", "no"), help="whether an agent worked on the lab (self-declared; undeclared records yes)")
    parser.add_argument("--notes", help="plain text for the receipt, at most 2,000 characters; it is shown as text and never graded")
    args = parser.parse_args(list(argv))

    stage_id: str = args.stage
    lab = load_lab(lab_of_stage_id(stage_id))
    provenance, notes = resolve_provenance(args.assisted, args.agent)
    for note in notes:
        sys.stderr.write(note + "\n")
    found = fingerprint.gather(args.host_kind, engine=fingerprint.engine_for(lab.environment), env_allow=lab.env_allowlist)
    for note in found.notes:
        sys.stderr.write(f"note: {note}\n")
    outcome = run_stage(
        lab,
        stage_id,
        args.challenge,
        out_dir=Path(args.out),
        environment=found.environment,
        pins=local_pins(lab),
        provenance=provenance,
        notes=args.notes,
    )
    from .fetch import shown  # here and not at the top: the table loads a command only when it runs

    failed = outcome.failed_checks
    sys.stdout.write(f"graded {stage_id} with {GRADER_NAME} {__version__}\n")
    sys.stdout.write(f"  wrote {shown(outcome.path)} ({outcome.stats.compressed_bytes:,} bytes)\n")
    sys.stdout.write(f"  checks: {len(outcome.receipt['checks']) - len(failed)} passed, {len(failed)} failed\n")
    for check in failed:
        sys.stdout.write(f"    FAIL {check['id']}: {check['detail'] or 'no detail'}\n")
    sys.stdout.write(f"  receipt id {outcome.stats.receipt_sha256}\n")
    sys.stdout.write(f"Check it here with `enginespace receipt verify {shown(outcome.path)}`, then drop it on the Receipts page.\n")
    return EXIT_OK if not failed else EXIT_FAILED


#: name -> (what runs it, what it does).
COMMANDS: dict[str, tuple[Callable[[Sequence[str]], int], str]] = {
    "doctor": (_doctor, "print the fields that a receipt would record about this machine, and check the pins and the host driver"),
    "fetch": (_fetch, "download the files that a lab pins into the cache, and keep only those whose SHA-256 is the manifest's: fetch <lab>"),
    "grade": (_grade, "grade a stage on a challenge token from the site, and write its bundle: grade <lab>.<stage> --challenge <token>"),
    "receipt": (_receipt, "receipt verify <file>: the browser's first three rules, run locally"),
    "trace": (_trace, "trace export <input> --format torch|nsys-sqlite: normalise a profiler capture into trace@1"),
    "selftest": (_selftest, "run the grader's own checks, and its tests where they are installed (--gpu adds the GPU smoke, and fails with no CUDA GPU)"),
    "version": (_version, "print the grader's name, version and source hash"),
}


def usage() -> str:
    width = max(len(name) for name in COMMANDS)
    rows = "\n".join(f"  {name.ljust(width)}  {what}" for name, (_run, what) in COMMANDS.items())
    return f"usage: enginespace <command> [options]\n\ncommands:\n{rows}\n\n`enginespace <command> --help` says more.\n"


def main(argv: Sequence[str] | None = None) -> int:
    # A console that cannot show a character (a Windows code page, say) prints an escape in its place and does not stop the command.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(errors="backslashreplace")
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in ("-h", "--help"):
        sys.stdout.write(usage())
        return EXIT_OK if args else EXIT_USAGE
    if args[0] == "--version":
        sys.stdout.write(f"{GRADER_NAME} {__version__}\n")
        return EXIT_OK
    name = args[0]
    if name not in COMMANDS:
        sys.stderr.write(f"enginespace: unknown command {name!r}\n\n{usage()}")
        return EXIT_USAGE
    try:
        return COMMANDS[name][0](args[1:])
    except GraderError as error:
        sys.stderr.write(f"enginespace: {error}\n")
        return EXIT_COULD_NOT_RUN
    except KeyboardInterrupt:
        sys.stderr.write("enginespace: interrupted\n")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
