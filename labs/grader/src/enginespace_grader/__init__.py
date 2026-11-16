"""The enginespace local grader (ARCHITECTURE section 9, D-026): the `enginespace` command and the code behind it.

It runs a lab stage on the learner's machine, checks the work against references, and writes one receipt bundle that the browser verifies. Its
core needs the standard library and `jsonschema`, and it sends nothing anywhere except the pinned downloads of `enginespace fetch` (fetch.py): a receipt is a file
that the learner moves by hand.

Importing the package imports nothing else, so a command loads only what it uses.
"""

from importlib.metadata import PackageNotFoundError, version as _distribution_version

__all__ = ["GRADER_NAME", "__version__"]

#: The package's name, which a receipt records as `grader.name`. It is the only grader there is.
GRADER_NAME = "enginespace-grader"

try:
    #: The version in pyproject.toml, as the installed distribution reports it. A receipt records it as `grader.version`.
    __version__ = _distribution_version(GRADER_NAME)
except PackageNotFoundError:  # run from a source tree that is not installed: a receipt then names a build that the site does not know
    __version__ = "0+unknown"
