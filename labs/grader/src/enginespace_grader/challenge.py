"""The challenge token (ARCHITECTURE section 8.4, D-027), and the object that a receipt records for it.

    es1:<lab>.<stage>:<seed, 8 hex>:<nonce, 16 base32>:<issued YYYYMMDD>:<fnv32, 8 hex>

The learner's browser issues the token and the grader derives every seeded input from it with the generators of rng.py. The TypeScript side is
packages/schema/challenge.ts, which settles what the architecture leaves open, and `schemas/vectors/challenge.json` holds the cases: tokens that
are taken, with the parts read from each, tokens that are refused, each wrong in one way, and the receipt's `challenge` object. tests/test_challenge.py
runs every one. The rules:
  - A token is read whole, with no text around it. Python's `$` also matches before a final line feed, so every pattern here is matched with
    `fullmatch`, and the caller trims what the learner pasted.
  - The stage is a stage id such as `tr8.replay.s2`: a lab (a module, a dot, lower-case words joined by single hyphens), then `.s` and the number.
  - The seed is 8 lower-case hex digits, an unsigned 32-bit integer. The nonce is 16 characters of RFC 4648 base32 in upper case, which is 80 bits
    [derived: 16 x 5]. The date is a day of the Gregorian calendar, in years 1 to 9999.
  - The checksum is the FNV-1a hash of the token's text up to the last colon, as 8 lower-case hex digits. It catches a mistyped or cut-off token and is
    not security (section 8.4).

Whether a token is unexpired and unused is for the browser's ledger, which knows the events. The grader knows the clock, so it can tell the learner that
a token has passed its 14 days before they spend a GPU hour on it (`age_in_days`).
"""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from .rng import Rng, hash32, rng_for

__all__ = [
    "CHALLENGE_TAG",
    "NONCE_ALPHABET",
    "NONCE_LENGTH",
    "TOKEN_LIFETIME_DAYS",
    "Challenge",
    "ChallengeCheck",
    "ChallengeProblem",
    "age_in_days",
    "challenge_checksum",
    "challenge_object_problems",
    "check_challenge",
    "format_challenge",
    "is_calendar_day",
    "is_issue_date",
    "parse_challenge",
]

#: The token's version tag. A change to the format is a new tag, and a reader refuses a tag it does not know.
CHALLENGE_TAG = "es1"
#: The nonce's characters: RFC 4648's base32 alphabet, in order.
NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
NONCE_LENGTH = 16
#: How long a token lasts [estimated, ARCHITECTURE section 8.4]. The browser enforces it; the grader only warns.
TOKEN_LIFETIME_DAYS = 14

# The pieces, written with explicit classes, as packages/schema/refs.ts writes them, so that the pattern means the same in both languages.
_SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
_MODULE = r"(?:tr[0-8][ab]?|capstone)"
_LAB = rf"{_MODULE}\.{_SLUG}"
_STAGE = rf"{_LAB}\.s[0-9]+"
_TOKEN = re.compile(rf"{CHALLENGE_TAG}:({_STAGE}):([0-9a-f]{{8}}):([A-Z2-7]{{{NONCE_LENGTH}}}):([0-9]{{8}}):([0-9a-f]{{8}})")
_STAGE_ID = re.compile(_STAGE)
_LAB_ID = re.compile(_LAB)
_NONCE = re.compile(rf"[A-Z2-7]{{{NONCE_LENGTH}}}")
_DATE = re.compile(r"[0-9]{8}")

ChallengeProblem = Literal["shape", "date", "checksum"]


def is_calendar_day(year: int, month: int, day: int) -> bool:
    """Whether the three numbers name a day of the Gregorian calendar, in years 1 to 9999."""
    if year < 1 or year > 9999 or month < 1 or month > 12 or day < 1:
        return False
    leap = (year % 4 == 0 and year % 100 != 0) or year % 400 == 0
    days = (31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    return day <= days[month - 1]


def is_issue_date(text: str) -> bool:
    """Whether `text` is 8 digits that name a day of the calendar, as `YYYYMMDD`."""
    if _DATE.fullmatch(text) is None:
        return False
    return is_calendar_day(int(text[:4]), int(text[4:6]), int(text[6:]))


def challenge_checksum(body: str) -> str:
    """The checksum of a token whose text before the last colon is `body`: 8 lower-case hex digits."""
    return f"{hash32(body):08x}"


@dataclass(frozen=True)
class Challenge:
    """A token taken apart. The checksum has been checked."""

    token: str
    stage: str
    seed: int
    nonce: str
    issued_on: str
    checksum: str

    @property
    def lab(self) -> str:
        """The lab of the stage: `tr8.replay` for `tr8.replay.s2`."""
        return self.stage.rsplit(".", 1)[0]

    @property
    def body(self) -> str:
        """The token's text up to the last colon."""
        return self.token[: self.token.rindex(":")]

    @property
    def issued_date(self) -> dt.date:
        return dt.date(int(self.issued_on[:4]), int(self.issued_on[4:6]), int(self.issued_on[6:]))

    def rng(self, salt: str) -> Rng:
        """The stream for one purpose of the stage: `rng_for(seed, salt)`, as the site derives it."""
        return rng_for(self.seed, salt)

    def as_object(self) -> dict[str, Any]:
        """The receipt's `challenge` object: the token and its parts, which the browser derives again and compares."""
        return {"token": self.token, "seed": self.seed, "nonce": self.nonce, "issuedOn": self.issued_on}


@dataclass(frozen=True)
class ChallengeCheck:
    """What `check_challenge` found: the parts of a good token, or what is wrong with a bad one."""

    challenge: Challenge | None = None
    problem: ChallengeProblem | None = None
    message: str = ""

    @property
    def ok(self) -> bool:
        return self.challenge is not None


_SHAPE_MESSAGE = "must be a challenge token es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<checksum> (ARCHITECTURE section 8.4)"


def check_challenge(token: str) -> ChallengeCheck:
    """Takes a token apart and says what is wrong with it, if anything: its shape, then its date, then its checksum."""
    if not isinstance(token, str):
        return ChallengeCheck(problem="shape", message=_SHAPE_MESSAGE)
    found = _TOKEN.fullmatch(token)
    if found is None:
        return ChallengeCheck(problem="shape", message=_SHAPE_MESSAGE)
    stage, seed, nonce, issued_on, checksum = found.groups()
    if not is_issue_date(issued_on):
        return ChallengeCheck(problem="date", message=f"the issue date {issued_on} is not a day of the calendar")
    expected = challenge_checksum(token[: token.rindex(":")])
    if checksum != expected:
        return ChallengeCheck(problem="checksum", message=f"the checksum is {checksum}, and the token's text gives {expected}")
    return ChallengeCheck(challenge=Challenge(token=token, stage=stage, seed=int(seed, 16), nonce=nonce, issued_on=issued_on, checksum=checksum))


def parse_challenge(token: str) -> Challenge | None:
    """A token taken apart, or None when it is not a token."""
    return check_challenge(token).challenge


def format_challenge(stage: str, seed: int, nonce: str, issued_on: str) -> str:
    """The token for these parts, with its checksum. It raises `ValueError`, listing what is wrong with parts that do not make a token."""
    problems: list[str] = []
    if not isinstance(stage, str) or _STAGE_ID.fullmatch(stage) is None:
        problems.append(f"the stage {stage!r} is not a stage id such as tr8.replay.s2")
    if type(seed) is not int or seed < 0 or seed > 0xFFFF_FFFF:
        problems.append(f"the seed {seed!r} is not an unsigned 32-bit integer")
    if not isinstance(nonce, str) or _NONCE.fullmatch(nonce) is None:
        problems.append(f"the nonce {nonce!r} is not {NONCE_LENGTH} characters of A to Z and 2 to 7")
    if not isinstance(issued_on, str) or not is_issue_date(issued_on):
        problems.append(f"the issue date {issued_on!r} is not a day of the calendar written YYYYMMDD")
    if problems:
        raise ValueError("challenge: " + "; ".join(problems))
    body = f"{CHALLENGE_TAG}:{stage}:{seed:08x}:{nonce}:{issued_on}"
    return f"{body}:{challenge_checksum(body)}"


def _is_uint32(value: object) -> bool:
    """Whether a number read from JSON is an unsigned 32-bit integer. A number written `195936478.0` is one, as it is in JavaScript, which has no other kind of number; a bool is not."""
    if isinstance(value, bool):
        return False
    if isinstance(value, float):
        return value.is_integer() and 0 <= value <= 0xFFFF_FFFF
    return isinstance(value, int) and 0 <= value <= 0xFFFF_FFFF


def challenge_object_problems(value: object) -> list[str]:
    """What is wrong with a receipt's `challenge` object, as sentences: empty when it is good.

    It has exactly the keys token, seed, nonce and issuedOn; its token is a good token; its seed is an unsigned 32-bit integer; and its
    seed, nonce and issue date are the token's own.
    """
    if not isinstance(value, Mapping):
        return ["the challenge must be an object"]
    fields: Mapping[str, object] = value
    problems: list[str] = []
    for key in fields:
        if key not in ("token", "seed", "nonce", "issuedOn"):
            problems.append(f"{key!r} is not a field of a challenge")
    for key in ("token", "seed", "nonce", "issuedOn"):
        if key not in fields:
            problems.append(f"the field {key!r} is missing")
    token, seed, nonce, issued_on = (fields.get(key) for key in ("token", "seed", "nonce", "issuedOn"))
    if "seed" in fields and not _is_uint32(seed):
        problems.append("the seed must be an unsigned 32-bit integer")
    if "nonce" in fields and (not isinstance(nonce, str) or _NONCE.fullmatch(nonce) is None):
        problems.append(f"the nonce must be {NONCE_LENGTH} characters of A to Z and 2 to 7 (RFC 4648 base32)")
    if "issuedOn" in fields and (not isinstance(issued_on, str) or not is_issue_date(issued_on)):
        problems.append("the issue date must be a day of the calendar written YYYYMMDD")
    if "token" in fields:
        checked = check_challenge(token) if isinstance(token, str) else ChallengeCheck(problem="shape", message=_SHAPE_MESSAGE)
        if checked.challenge is None:
            problems.append(f"the token {checked.message}")
        else:
            parts = checked.challenge
            if "seed" in fields and seed != parts.seed:
                problems.append("the seed must be the seed in the token")
            if "nonce" in fields and nonce != parts.nonce:
                problems.append("the nonce must be the nonce in the token")
            if "issuedOn" in fields and issued_on != parts.issued_on:
                problems.append("the issue date must be the issue date in the token")
    return problems


def age_in_days(challenge: Challenge, today: dt.date | None = None) -> int:
    """How many days ago the token was issued: 0 on the day, negative for a date in the future (a clock that is wrong, or a token from tomorrow).

    `today` is the date in UTC, which is read from the clock when it is left out.
    """
    now = today if today is not None else dt.datetime.now(dt.timezone.utc).date()
    return (now - challenge.issued_date).days
