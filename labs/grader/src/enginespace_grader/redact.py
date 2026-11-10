"""What a receipt never holds (ARCHITECTURE section 9.5, 9.9), and how the grader keeps it out.

A receipt is a file the learner moves by hand, and it can end up in a forum post or an issue. Section 9.5 lists what the grader never collects: the host name,
the user name, an IP or MAC address, a GPU's UUID or serial number, an absolute path, a token or a key, and the whole environment. Three layers hold that:

  1. Nothing is collected by default. The fingerprint (fingerprint.py) is built from named facts of a known shape, and the one place that it takes text from the
     environment is the lab's allowlist of `VLLM_*` and `SGLANG_*` variables. It never asks NVML or `nvidia-smi` for a UUID, a serial number or a bus address.
  2. Free text that does come from the machine is scrubbed. `scrub_value` cleans the value of an allowlisted variable, and `scrub_text` cleans a log before a lab
     keeps it as an artifact: whatever looks personal becomes a placeholder, and a path under the kit becomes relative to it.
  3. A last look at the finished fingerprint (`find_leaks`) fails closed: a field that still holds something personal is dropped, or, if the receipt needs it, the
     grader stops and says which field.

What counts as personal is of two kinds. A *pattern* recognises a shape: an absolute path, a URL, an IP or MAC address, a UUID (a GPU's `GPU-...` among them),
a PCI bus address, and the shapes of the common tokens. A *literal* is something this machine knows about itself: its host name, the user's name, the home
folder, and the value of any variable whose name says it holds a secret (`HF_TOKEN` is the example the architecture names). The values of those variables are read
only to recognise them again: they are never written anywhere.

The patterns err toward scrubbing. A log that is scrubbed keeps every line that the engine-config reader looks for (engine_config.py): none of the shapes below
occurs in them, and a test holds that. The numbers here (the length limits) are design parameters [estimated].
"""

from __future__ import annotations

import getpass
import os
import platform
import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

__all__ = ["REDACTED", "Sensitive", "find_leaks", "is_secret_name", "scrub_text", "scrub_value"]

#: What an allowlisted variable records when its value held something personal: the variable was set, and its value is withheld.
REDACTED = "<redacted>"

#: The longest value of an environment variable that a receipt records [estimated]; the schema allows 256.
MAX_VALUE_CHARS = 256

#: Literals shorter than this are only recognised as a whole value, never inside other text [estimated]: a user called `ann` is not worth mangling "channel".
MIN_LITERAL_CHARS = 4

#: A variable one of whose words (the parts of its name between underscores) is one of these holds a secret. vLLM's own `/server_info` leaves out the names with KEY in
#: them, which is the same idea. TOKEN counts only as the last word (`HF_TOKEN`, `AUTH_TOKEN`), since `VLLM_SHARED_EXPERTS_STREAM_TOKEN_THRESHOLD` and
#: `VLLM_MAX_TOKENS_PER_EXPERT_FP4_MOE` are about counts of tokens: 6 of the 303 names in vLLM's envs.py at v0.33.0 have TOKEN in them for that reason, and the only
#: name that holds a secret, VLLM_API_KEY, has KEY [measured 2026-11-09, vLLM v0.33.0 at 4ba787e].
SECRET_WORDS = frozenset(
    {"KEY", "KEYS", "KEYFILE", "APIKEY", "SECRET", "SECRETS", "PASSWORD", "PASSWD", "PASSPHRASE", "CREDENTIAL", "CREDENTIALS", "COOKIE", "COOKIES", "AUTH", "PRIVATE"}
)


def is_secret_name(name: str) -> bool:
    """Whether the name of a variable says that it holds a secret (a key, a token, a password, a credential)."""
    words = [word for word in re.split(r"[^A-Za-z0-9]+", name.upper()) if word]
    return any(word in SECRET_WORDS for word in words) or (bool(words) and words[-1] == "TOKEN")


#: Names of accounts and machines that identify nobody: the user of a container, a cloud image or a CI runner. They are not worth hiding, and a log that is scrubbed
#: of the word `runner` or `root` loses lines that say "model runner". A person whose own name is an ordinary word in a vLLM log has the same loss; that is the cost
#: of scrubbing words, and the paths, which are where a user name shows up, are scrubbed whatever the name.
GENERIC_NAMES = frozenset(
    {
        "root", "admin", "administrator", "user", "users", "ubuntu", "debian", "fedora", "centos", "ec2-user", "runner", "nobody", "docker", "jovyan", "vscode", "pod",
        "localhost", "host", "default", "worker", "builder", "build", "ci", "cloud", "gpu", "node", "master", "main", "test", "tester", "guest", "demo", "sandbox",
    }
)

_HEX = "0-9A-Fa-f"
_STOP = r"""\s'"<>|;,()\[\]{}"""

# A URL, whole: its host, its path and any credentials in it go together.
_URL = re.compile(rf"\b[A-Za-z][A-Za-z0-9+.\-]*://[^{_STOP}]+")
# The shapes of the common tokens: Hugging Face, GitHub, OpenAI-style, Slack, AWS, Google, and a JWT.
_TOKEN = re.compile(
    r"\b(?:hf_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_\-]{20,}|xox[abprs]-[A-Za-z0-9\-]{10,}"
    r"|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_\-]{30,}|eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,})"
)
_BEARER = re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/=\-]{16,}", re.IGNORECASE)
_SECRET_PAIR = re.compile(
    r"""(?i)\b((?:hf_token|hugging_face_hub_token|api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd)\b['"]?\s*[:=]\s*['"]?)[^\s'",;)}\]]{4,}"""
)
# A serial number, where a tool names it as one: `Serial Number : 1320423009876` (nvidia-smi -q), `serial=...`, and `serial 1320423009876`.
_SERIAL = re.compile(r"""(?i)\b(serial(?:[ _\-]?(?:number|no))?\b(?:['"]?\s*[:=]\s*['"]?|\s+(?=[0-9]{8,}\b)))[A-Za-z0-9\-]{6,}""")
# A GPU's UUID: the form that NVML prints today (`GPU-` and a UUID), the older one (groups of 16, 8, 8, 8 and 24 digits), a MIG device's, and a bare UUID.
_GPU_UUID = re.compile(rf"\b(?:MIG-|GPU-)+[{_HEX}]{{8,}}(?:-[{_HEX}]{{4,}})+(?:/[0-9]+){{0,2}}")
_UUID = re.compile(rf"\b[{_HEX}]{{8}}-[{_HEX}]{{4}}-[{_HEX}]{{4}}-[{_HEX}]{{4}}-[{_HEX}]{{12}}\b")
_PCI = re.compile(rf"\b[{_HEX}]{{4,8}}:[{_HEX}]{{2}}:[{_HEX}]{{2}}\.[0-7]\b")
_MAC = re.compile(rf"(?<![\w:\-])(?:[{_HEX}]{{2}}[:\-]){{5}}[{_HEX}]{{2}}(?![\w:\-])")
_IPV6 = re.compile(
    rf"(?<![\w:.])(?:(?:[{_HEX}]{{1,4}}:){{7}}[{_HEX}]{{1,4}}|(?:[{_HEX}]{{1,4}}:){{1,7}}:(?:[{_HEX}]{{1,4}}(?::[{_HEX}]{{1,4}}){{0,5}})?"
    rf"|::(?:[{_HEX}]{{1,4}}(?::[{_HEX}]{{1,4}}){{0,6}})?)(?![\w:])"
)
_IPV4 = re.compile(r"(?<![\w.])([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(?![\w]|\.[0-9])")
# An absolute path: POSIX (`/x/y`, `~/x`), Windows (`C:\x`, `C:/x`) and a UNC share. A `/` inside a word (`FLASH_ATTN/TRITON`, `and/or`) is not the start of one.
_POSIX_PATH = re.compile(rf"(?<![A-Za-z0-9_.\-~$%])/(?=[A-Za-z0-9_.\-~$%@+])[^{_STOP}]*")
_HOME_PATH = re.compile(rf"(?<![A-Za-z0-9_.~])~/[^{_STOP}]*")
_WINDOWS_PATH = re.compile(rf"(?<![A-Za-z0-9_])[A-Za-z]:[\\/][^{_STOP}]*|\\\\[A-Za-z0-9_.$\-]+\\[^{_STOP}]+")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


@dataclass(frozen=True)
class Sensitive:
    """What this machine knows about itself that a receipt must not say. Every field is a tuple of literals; nothing here is ever written out."""

    hosts: tuple[str, ...] = ()
    users: tuple[str, ...] = ()
    folders: tuple[str, ...] = ()
    secrets: tuple[str, ...] = ()
    others: tuple[str, ...] = ()

    @classmethod
    def from_machine(cls, environ: Mapping[str, str] | None = None, extra: Iterable[str] = ()) -> Sensitive:
        """The host name, the user's name, the home and current folders, and the value of every variable whose name says it holds a secret.

        `extra` is anything else the caller knows is personal, such as a GPU's UUID or serial number if it ever has to look at one.
        """
        env = os.environ if environ is None else environ

        def collect(*candidates: Callable[[], str | None] | str | None) -> tuple[str, ...]:
            found: list[str] = []
            for candidate in candidates:
                try:
                    value = candidate() if callable(candidate) else candidate
                except (KeyError, OSError, RuntimeError):  # no passwd entry for this user, no home, no current folder: there is that much less to look for
                    continue
                if value and value not in found:
                    found.append(value)
            return tuple(found)

        hosts = collect(platform.node, env.get("HOSTNAME"), env.get("COMPUTERNAME"), env.get("HOST"))
        hosts += tuple(short for short in (host.split(".")[0] for host in hosts) if short and short not in hosts)
        hosts = tuple(host for host in hosts if host.lower() not in GENERIC_NAMES)
        users = tuple(user for user in collect(getpass.getuser, env.get("USER"), env.get("LOGNAME"), env.get("USERNAME"), env.get("LNAME")) if user.lower() not in GENERIC_NAMES)
        folders = collect(lambda: os.path.expanduser("~"), env.get("HOME"), env.get("USERPROFILE"), os.getcwd)
        secrets = tuple(sorted({value for name, value in env.items() if is_secret_name(name) and len(value) >= 6}))
        return cls(hosts=hosts, users=users, folders=folders, secrets=secrets, others=tuple(extra))

    def with_more(self, *values: str) -> Sensitive:
        """The same, and these values too."""
        return Sensitive(self.hosts, self.users, self.folders, self.secrets, self.others + tuple(value for value in values if value))

    def literals(self) -> list[tuple[str, str]]:
        """(literal, placeholder) pairs, longest first, so that a folder is replaced before the user name inside it."""
        pairs = [(value, "<host>") for value in self.hosts] + [(value, "<user>") for value in self.users]
        pairs += [(value, "<path>") for value in self.folders] + [(value, REDACTED) for value in self.secrets + self.others]
        return sorted({pair for pair in pairs if pair[0]}, key=lambda pair: (-len(pair[0]), pair[0], pair[1]))

    def is_exactly(self, text: str) -> bool:
        """Whether a whole value is one of the literals, however short."""
        return any(text == literal for literal, _ in self.literals())


def _relative(path: str, kit_root: str | None) -> str:
    """A path under the kit, relative to it; anything else, a placeholder. The user's name and the folders above the kit go with it."""
    if kit_root:
        root = kit_root.rstrip("/\\")
        if path == root:
            return "."
        for separator in ("/", "\\"):
            if root and path.startswith(root + separator):
                return path[len(root) + 1 :]
    return "<path>"


def scrub_text(
    text: str,
    *,
    kit_root: str | os.PathLike[str] | None = None,
    sensitive: Sensitive | None = None,
    ips: bool = True,
) -> tuple[str, int]:
    """`text` with what looks personal replaced by a placeholder, and how many replacements were made.

    `kit_root` is the folder of the lab's kit: a path under it becomes relative to it (`receipts/x.es.json.gz`), and every other absolute path becomes `<path>`.
    `sensitive` defaults to this machine's own (`Sensitive.from_machine`). `ips=False` leaves dotted numbers alone, for fields such as a kernel release
    (`5.15.167.4-microsoft-standard-WSL2`) that read like an address and are not one.
    """
    known = Sensitive.from_machine() if sensitive is None else sensitive
    root = os.fspath(kit_root) if kit_root is not None else None
    count = 0

    def replace(pattern: re.Pattern[str], placeholder: str | Callable[[re.Match[str]], str], current: str) -> str:
        nonlocal count
        changed, made = pattern.subn(placeholder, current)
        count += made
        return changed

    def checked_ipv4(found: re.Match[str]) -> str:
        nonlocal count
        if all(int(part) <= 255 for part in found.groups()):
            count += 1
            return "<ip>"
        return found.group(0)

    def keep_name(found: re.Match[str]) -> str:
        return found.group(1) + "<secret>"

    def path(found: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return _relative(found.group(0), root)

    cleaned = replace(_URL, "<url>", text)
    cleaned = replace(_TOKEN, "<secret>", cleaned)
    cleaned = replace(_BEARER, keep_name, cleaned)
    cleaned = replace(_SECRET_PAIR, keep_name, cleaned)
    cleaned = replace(_SERIAL, lambda found: found.group(1) + "<serial>", cleaned)
    cleaned = replace(_GPU_UUID, "<gpu-uuid>", cleaned)
    cleaned = replace(_UUID, "<uuid>", cleaned)
    cleaned = replace(_PCI, "<pci>", cleaned)
    cleaned = replace(_MAC, "<mac>", cleaned)
    if ips:
        cleaned = replace(_IPV6, "<ip>", cleaned)
        cleaned = _IPV4.sub(checked_ipv4, cleaned)
    for pattern in (_WINDOWS_PATH, _HOME_PATH, _POSIX_PATH):
        cleaned = pattern.sub(path, cleaned)
    for literal, placeholder in known.literals():
        if len(literal) >= MIN_LITERAL_CHARS:
            cleaned = replace(re.compile(rf"(?<![A-Za-z0-9_]){re.escape(literal)}(?![A-Za-z0-9_])"), placeholder, cleaned)
    return cleaned, count


def scrub_value(value: str, *, kit_root: str | os.PathLike[str] | None = None, sensitive: Sensitive | None = None) -> str:
    """The text a receipt records for an environment variable's value: the value itself when it is a plain setting, and `<redacted>` when it held anything
    personal, was too long for the receipt, or has a control character in it. A setting is a word, a number, or a short list of them, so a value is never
    half scrubbed: `/srv/models/m` as a whole is a place on a machine, and its location grades nothing.
    """
    known = Sensitive.from_machine() if sensitive is None else sensitive
    stripped = value.strip()
    if len(stripped) > MAX_VALUE_CHARS or _CONTROL.search(stripped) or known.is_exactly(stripped):
        return REDACTED
    _, found = scrub_text(stripped, kit_root=kit_root, sensitive=known)
    return REDACTED if found else stripped


def find_leaks(document: Any, sensitive: Sensitive | None = None, *, ips: bool = False, skip: Iterable[str] = ()) -> list[str]:
    """JSON Pointers to the strings of `document` that still hold something personal, in document order. It names the places and never quotes what it found.

    The finished fingerprint goes through this before it is used (fingerprint.py), with `ips=False`: its fields have a fixed shape, and a kernel release is not an
    address. The values of environment variables were scrubbed with `ips=True` when they were read. `skip` names keys whose values are one of a fixed set of
    words (`kind`, `mig`, `ecc`, `virtualization`) and so cannot hold anything of the machine's, even for a user who happens to be called `local`.
    """
    known = Sensitive.from_machine() if sensitive is None else sensitive
    skipped = frozenset(skip)
    found: list[str] = []

    def holds(text: str) -> bool:
        return scrub_text(text, sensitive=known, ips=ips)[1] > 0

    def walk(node: Any, place: str) -> None:
        if isinstance(node, str):
            if holds(node):
                found.append(place or "/")
        elif isinstance(node, Mapping):
            for key, child in node.items():
                here = f"{place}/{str(key).replace('~', '~0').replace('/', '~1')}"
                if isinstance(key, str) and holds(key):
                    found.append(here)
                if key not in skipped:
                    walk(child, here)
        elif isinstance(node, (list, tuple)):
            for index, child in enumerate(node):
                walk(child, f"{place}/{index}")

    walk(document, "")
    return list(dict.fromkeys(found))
