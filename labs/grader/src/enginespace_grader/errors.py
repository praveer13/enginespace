"""The one exception the grader raises on purpose.

A `GraderError` is a problem that the person at the keyboard can act on, such as a token that is mistyped or a lab that this install does not
have. Its message says what happened and what to do, and the command line prints it, without a traceback, and exits with status 1. Anything
else that escapes is a bug in the grader and shows its traceback.
"""

from __future__ import annotations

__all__ = ["GraderError"]


class GraderError(Exception):
    """A refusal with a message for the learner."""
