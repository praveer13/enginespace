"""The effective engine configuration (ARCHITECTURE section 9.5, ASSESSMENT section 5.6): what the engine actually ran with, read from its own words.

The same command gives a different run on another GPU or another day, so a receipt for an engine lab records what the engine *did*, and not what the learner asked
for (`environment.engineConfig`): the runner that ran (MRV2, or MRV1 after a fallback), the CUDA-graph mode after any downgrade, whether scheduling was async, the
attention backend it picked, and the two limits that depend on the GPU, `max_num_batched_tokens` and `max_num_seqs`. The grader reads them from two places that
the engine itself writes: its log, and a configuration dump (the `VllmConfig` as JSON).

This reads vLLM v0.33.0 (commit 4ba787e), the course's pin (D-035), and it is only as good as that reading. Each line below was read in the tag's source on
2026-11-09 [measured]; a re-pin moves them, and content/claims/vllm/logs.yaml holds the same facts with their quotes, so that the quarterly re-read finds them.

runner
  INFO `Using V2 Model Runner` (vllm/v1/worker/gpu_worker.py:513) is MRV2.
  WARNING `Model Runner V2 does not yet support ...; using the V1 model runner instead.` (vllm/config/vllm.py:761) or `Model Runner V2 requires Triton; using the V1
  model runner instead.` (vllm/config/vllm.py:754) is MRV1 after a fallback.
  Setting VLLM_USE_V2_MODEL_RUNNER=0 gives MRV1 *silently* (vllm/config/vllm.py:748), so the variable counts when the log names neither runner.
graphMode
  The mode the engine starts in is in the config dump (`compilation_config.cudagraph_mode`) and in the INFO line `Initializing a V1 LLM engine (v...) with config:
  ...` (vllm/v1/engine/core.py:140).
  Each downgrade after that is a WARNING that ends `; setting cudagraph_mode=X` (vllm/config/compilation.py:1414 to :1464) or `Overriding to X.`
  (vllm/config/compilation.py:1474), and the last one is the mode that ran. `enforce_eager` is a WARNING too (vllm/config/vllm.py:1773 and :1779).
asyncScheduling
  Nothing at INFO says so when it is on: the default is resolved quietly (vllm/config/vllm.py:1719). The config dump says (`scheduler_config.async_scheduling`).
  The log says when it is switched off (vllm/config/vllm.py:1699 to :1713) or when `non-default args` names it (vllm/entrypoints/common/startup.py:96).
attentionBackend
  INFO `Using X attention backend out of potential backends: [...]` for an automatic pick (vllm/platforms/cuda.py:509), and `Using AttentionBackendEnum.X backend.`
  for one the user named (vllm/platforms/cuda.py:448). The config dump names only a backend the user asked for (`attention_config.backend`).
maxNumBatchedTokens, maxNumSeqs
  The config dump says (`scheduler_config`). The log says `Chunked prefill is enabled with max_num_batched_tokens=N.` at INFO (vllm/config/scheduler.py:311),
  `Defaulting max_num_batched_tokens to N for ...` and `Defaulting max_num_seqs to N for ...` at DEBUG only (vllm/engine/arg_utils.py:3227 and :3237), and
  `non-default args` for what the user set (vllm/entrypoints/common/startup.py:96).

So at the pin the log alone cannot say whether async scheduling is on, and gives `max_num_seqs` only at DEBUG: a lab hands over the dump (the dev-mode endpoint
`/server_info?config_format=json` of `vllm serve`, with VLLM_SERVER_DEV_MODE=1, or the `VllmConfig` of an offline `LLM`, dumped with pydantic's `TypeAdapter`), or
runs with VLLM_LOGGING_LEVEL=DEBUG. A field that no source gives is *missing*, never guessed, and two sources that disagree make it missing too: they are from
different runs. A reading with a missing field has no `config`, because the receipt schema requires all six.

Only the six values leave this module. The dump and the log hold paths and the model's name; none of that is copied. A lab that keeps the log as an artifact
scrubs it first (redact.scrub_text), and the scrubbed log gives the same reading: the lines above hold nothing that the scrubber replaces.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

__all__ = ["FIELDS", "EngineConfigReading", "EngineRun", "dump_essentials", "read_engine_config"]

#: The fields of `environment.engineConfig`, in the schema's order (packages/schema/receipt.ts, `engineConfigSchema`).
FIELDS = ("runner", "graphMode", "asyncScheduling", "attentionBackend", "maxNumBatchedTokens", "maxNumSeqs")

#: The five modes of vLLM's `CUDAGraphMode` (vllm/config/compilation.py:39-47 at v0.33.0): the pairs are (decode routine, mixed routine).
GRAPH_MODES = ("NONE", "PIECEWISE", "FULL", "FULL_DECODE_ONLY", "FULL_AND_PIECEWISE")
_MODE_BY_VALUE: dict[Any, str] = {0: "NONE", 1: "PIECEWISE", 2: "FULL", (2, 0): "FULL_DECODE_ONLY", (2, 1): "FULL_AND_PIECEWISE"}

#: The longest `detail` that a check may have (packages/schema/receipt.ts, `checkSchema`).
DETAIL_LIMIT = 1000

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
_USING_V2 = re.compile(r"\bUsing V2 Model Runner\b")
_FALLBACK = re.compile(r"\bModel Runner V2 (?:does not yet support .+?|requires Triton); using the V1 model runner instead\.")
_INIT = re.compile(r"\bInitializing a V1 LLM engine \(v[0-9][0-9A-Za-z.+_\-]*\) with config: (?P<config>.*)")
_MODE_KEY = re.compile(r"""['"]?cudagraph_mode['"]?\s*[:=]\s*<?(?:CUDAGraphMode\.)?['"]?([A-Z][A-Z_]*)""")
_DOWNGRADE = re.compile(r"\bis not supported with .*; setting cudagraph_mode=([A-Z][A-Z_]*)\b")
_OVERRIDE = re.compile(r"\bCudagraph mode \S+ requires piecewise capture, but the loaded model provides neither a compiled submodule nor breakable CUDA graphs\. Overriding to ([A-Z][A-Z_]*)\.")
_EAGER = re.compile(r"\bEnforce eager set, disabling torch\.compile\b")
_BACKEND_AUTO = re.compile(r"\bUsing ([A-Z][A-Z0-9_]{0,63}) attention backend out of potential backends: \[")
_BACKEND_NAMED = re.compile(r"\bUsing (?:AttentionBackendEnum\.)?([A-Z][A-Z0-9_]{0,63}) backend\.")
_CHUNKED = re.compile(r"\bChunked prefill is enabled with max_num_batched_tokens=([0-9]+)\.")
_DEFAULT_TOKENS = re.compile(r"\bDefaulting max_num_batched_tokens to ([0-9]+) for ")
_DEFAULT_SEQS = re.compile(r"\bDefaulting max_num_seqs to ([0-9]+) for ")
_NON_DEFAULT = re.compile(r"\bnon-default args: (?P<args>\{.*\})")
_ASYNC_OFF = re.compile(
    r"\b(?:Async scheduling will be disabled because it is not supported|Async scheduling is disabled for ROCm DeepEP"
    r"|Async scheduling is disabled because the V1 model runner|Disabling asynchronous scheduling by default for pooling model)"
)
_BACKEND_NAME = re.compile(r"(?:AttentionBackendEnum\.)?([A-Z][A-Z0-9_]{0,63})")
_NON_DEFAULT_KEYS = (
    ("max_num_batched_tokens", re.compile(r"'max_num_batched_tokens': ([0-9]+)")),
    ("max_num_seqs", re.compile(r"'max_num_seqs': ([0-9]+)")),
    ("async_scheduling", re.compile(r"'async_scheduling': (True|False)")),
)


@dataclass(frozen=True)
class EngineRun:
    """What an engine lab hands the grader about one run of its engine (`StageResult.engine_run`)."""

    #: The engine's own log of the run, stdout and stderr as it printed them (more than one process may have written to it).
    log: str
    #: The configuration dump: the `VllmConfig` as a mapping or as JSON text, or the whole answer of `/server_info?config_format=json`. Optional, but see the module.
    config_dump: Mapping[str, Any] | str | None = None
    #: The environment that the engine ran in, for `VLLM_USE_V2_MODEL_RUNNER` alone: the one setting that changes the runner and leaves no line in the log.
    environ: Mapping[str, str] | None = None


@dataclass(frozen=True)
class EngineConfigReading:
    """What was read: the receipt's `engineConfig` when all six fields were found, and in any case which were, from where, and what is missing."""

    config: dict[str, Any] | None
    found: dict[str, Any]
    missing: tuple[str, ...]
    #: For each field found, where it came from, in a fixed phrase that holds nothing of the machine.
    evidence: dict[str, str]
    notes: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return self.config is not None

    def detail(self) -> str:
        """The reading as one line of plain text for a check's `detail`."""
        parts = [f"{name} {self.found[name]!s} ({self.evidence[name]})" for name in FIELDS if name in self.found]
        if self.missing:
            parts.append("not found: " + ", ".join(self.missing))
        parts.extend(self.notes)
        text = "; ".join(parts)
        return text if len(text) <= DETAIL_LIMIT else text[: DETAIL_LIMIT - 3] + "..."


def _lines(log: str) -> list[str]:
    return [_ANSI.sub("", line).rstrip("\r") for line in log.splitlines()]


def _mode_name(value: Any) -> str | None:
    """A graph mode from the forms a dump or a log gives it: its name (with or without `CUDAGraphMode.`), its number, or its pair of numbers."""
    if isinstance(value, str):
        name = value.strip().upper().removeprefix("CUDAGRAPHMODE.")
        return name if name in GRAPH_MODES else None
    if isinstance(value, (list, tuple)) and len(value) == 2 and all(isinstance(item, int) and not isinstance(item, bool) for item in value):
        return _MODE_BY_VALUE.get(tuple(value))
    if isinstance(value, int) and not isinstance(value, bool):
        return _MODE_BY_VALUE.get(value)
    return None


def _positive(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _nested(document: Mapping[str, Any] | None, *path: str) -> Any:
    node: Any = document
    for key in path:
        if not isinstance(node, Mapping) or key not in node:
            return None
        node = node[key]
    return node


def _load_dump(raw: Mapping[str, Any] | str | None, notes: list[str]) -> tuple[Mapping[str, Any] | None, str]:
    """The dump as a mapping of the config, and as text if it came as a string (`/server_info?config_format=text` answers with `VllmConfig.__str__`)."""
    document: Any = raw
    if isinstance(raw, str):
        try:
            document = json.loads(raw)
        except ValueError:
            notes.append("the configuration dump is not JSON, so it was read as text")
            return None, raw
    if isinstance(document, Mapping) and "vllm_config" in document:
        document = document["vllm_config"]
    if isinstance(document, str):
        return None, document
    if isinstance(document, Mapping):
        return document, ""
    if document is not None:
        notes.append("the configuration dump is neither a mapping nor JSON text, so it was not read")
    return None, ""


def _first_mode(text: str) -> str | None:
    found = _MODE_KEY.search(text)
    return _mode_name(found.group(1)) if found else None


def _backend_name(value: Any) -> str | None:
    if isinstance(value, str):
        found = _BACKEND_NAME.fullmatch(value.strip())
        return found.group(1) if found and found.group(1) != "AUTO" else None
    return None


def _settle(candidates: list[tuple[Any, str]], field: str, notes: list[str]) -> tuple[Any, str] | None:
    """One value out of the sources that gave one. Sources that disagree give none: they are from different runs, and a note says so."""
    if not candidates:
        return None
    if len({repr(value) for value, _ in candidates}) > 1:
        notes.append(f"{field}: " + " and ".join(f"{value} from {where}" for value, where in candidates) + " disagree")
        return None
    return candidates[0]


@dataclass
class _Log:
    """What the lines of a log say, each with the place of the line, since a later line is a later event of the run."""

    runner: list[tuple[int, str, str]]
    config_line: int
    config_modes: list[str]
    changes: list[tuple[int, str, str]]
    eager: bool
    backends: list[tuple[str, str]]
    chunked: list[int]
    default_tokens: list[int]
    default_seqs: list[int]
    non_default: dict[str, Any]
    async_off: bool


def _scan(lines: list[str]) -> _Log:
    log = _Log([], -1, [], [], False, [], [], [], [], {}, False)
    for index, line in enumerate(lines):
        if _USING_V2.search(line):
            log.runner.append((index, "MRV2", "log: Using V2 Model Runner"))
        elif _FALLBACK.search(line):
            log.runner.append((index, "MRV1", "log: the Model Runner V2 fallback warning"))
        init = _INIT.search(line)
        if init:
            log.config_line = index
            mode = _first_mode(init.group("config"))
            if mode:
                log.config_modes.append(mode)
        if _EAGER.search(line):
            log.eager = True
        for pattern, where in ((_DOWNGRADE, "log: a downgrade warning"), (_OVERRIDE, "log: the piecewise override warning")):
            found = pattern.search(line)
            if found and found.group(1) in GRAPH_MODES:
                log.changes.append((index, found.group(1), where))
        for pattern, where in ((_BACKEND_AUTO, "log: the automatic pick"), (_BACKEND_NAMED, "log: the backend the user named")):
            found = pattern.search(line)
            if found:
                log.backends.append((found.group(1), where))
        for pattern, store in ((_CHUNKED, log.chunked), (_DEFAULT_TOKENS, log.default_tokens), (_DEFAULT_SEQS, log.default_seqs)):
            found = pattern.search(line)
            if found:
                store.append(int(found.group(1)))
        args = _NON_DEFAULT.search(line)
        if args:
            for key, pattern in _NON_DEFAULT_KEYS:
                named = pattern.search(args.group("args"))
                if named:
                    log.non_default[key] = named.group(1) == "True" if key == "async_scheduling" else int(named.group(1))
        if _ASYNC_OFF.search(line):
            log.async_off = True
    return log


def dump_essentials(raw: Mapping[str, Any] | str | None) -> dict[str, Any]:
    """The few values of a configuration dump that `read_engine_config` uses, as a small mapping with no path and no name in it, and read back the same.

    The dump holds the model's name, folders and the whole environment (`/server_info` adds `vllm_env` and `system_env`), so a lab that keeps it as an artifact, for the
    site to read the same configuration from, keeps this instead: the three limits, the graph mode by its name and the attention backend the user named.
    """
    dump, _ = _load_dump(raw, [])
    kept: dict[str, dict[str, Any]] = {}
    for section, key, clean in (
        ("scheduler_config", "max_num_batched_tokens", _positive),
        ("scheduler_config", "max_num_seqs", _positive),
        ("scheduler_config", "async_scheduling", lambda value: value if isinstance(value, bool) else None),
        ("compilation_config", "cudagraph_mode", _mode_name),
        ("attention_config", "backend", _backend_name),
    ):
        value = clean(_nested(dump, section, key))
        if value is not None:
            kept.setdefault(section, {})[key] = value
    return kept


def read_engine_config(run: EngineRun, engine: str = "vllm") -> EngineConfigReading:
    """The effective configuration of a run of `engine`, from its log and its configuration dump. Only vLLM is read (the module says what, and at which pin)."""
    if engine != "vllm":
        return EngineConfigReading(None, {}, FIELDS, {}, (f"this grader reads the effective engine configuration of vLLM only, and the lab runs {engine}",))
    notes: list[str] = []
    log = _scan(_lines(run.log))
    dump, dump_text = _load_dump(run.config_dump, notes)
    found: dict[str, Any] = {}
    evidence: dict[str, str] = {}

    def take(field: str, settled: tuple[Any, str] | None) -> None:
        if settled is not None:
            found[field], evidence[field] = settled

    # The runner: the last line that names one. Silence is MRV1 only when the environment says so.
    if log.runner:
        take("runner", (log.runner[-1][1], log.runner[-1][2]))
        if len({value for _, value, _ in log.runner}) > 1:
            notes.append("the log names both runners, and the later one is taken")
    elif run.environ is not None and "VLLM_USE_V2_MODEL_RUNNER" in run.environ:
        try:
            if int(run.environ["VLLM_USE_V2_MODEL_RUNNER"]) == 0:
                take("runner", ("MRV1", "env: VLLM_USE_V2_MODEL_RUNNER=0, which vLLM obeys without a word"))
        except ValueError:
            notes.append("VLLM_USE_V2_MODEL_RUNNER is not an integer, which vLLM refuses, so it says nothing about the runner")

    # The graph mode: where the engine began (the dump, the config line, or the enforce_eager warning, which the config logs before the engine's line is printed), then
    # each downgrade after the config line, and the last one wins.
    began_from = [(mode, "the dump") for mode in (_mode_name(_nested(dump, "compilation_config", "cudagraph_mode")), _first_mode(dump_text)) if mode]
    began_from += [(log.config_modes[-1], "the config line")] if log.config_modes else []
    began_from += [("NONE", "log: enforce eager")] if log.eager else []
    began = _settle(began_from, "graphMode", notes)
    after = [change for change in log.changes if change[0] > log.config_line]
    if after:
        take("graphMode", (after[-1][1], after[-1][2] + (f", after the engine began in {began[0]}" if began else "")))
    elif began:
        take("graphMode", (began[0], f"{began[1]}, with no downgrade in the log"))

    # Async scheduling: the dump, or the log's word that the user named it or that it was switched off.
    asynchronous = _nested(dump, "scheduler_config", "async_scheduling")
    take(
        "asyncScheduling",
        _settle(
            ([(asynchronous, "the dump")] if isinstance(asynchronous, bool) else [])
            + ([(log.non_default["async_scheduling"], "non-default args in the log")] if "async_scheduling" in log.non_default else [])
            + ([(False, "a warning in the log that it is off")] if log.async_off else []),
            "asyncScheduling",
            notes,
        ),
    )

    # The attention backend: what the log says was picked, else the backend that the dump says the user named.
    if log.backends:
        take("attentionBackend", log.backends[0])
        if len({name for name, _ in log.backends}) > 1:
            notes.append("the log picks more than one attention backend, and the first is taken")
    elif (named := _backend_name(_nested(dump, "attention_config", "backend"))) is not None:
        take("attentionBackend", (named, "the dump: the backend the user named"))

    # The two limits: the dump and the log's own lines agree or the field is missing; what the user typed (non-default args) counts when nothing else says.
    for field, key, logged in (("maxNumBatchedTokens", "max_num_batched_tokens", (log.chunked, log.default_tokens)), ("maxNumSeqs", "max_num_seqs", (log.default_seqs,))):
        sources = [(value, "the dump") for value in [_positive(_nested(dump, "scheduler_config", key))] if value]
        sources += [(lines[-1], "the log") for lines in logged if lines]
        if not sources and key in log.non_default:
            sources = [(log.non_default[key], "non-default args in the log")]
        take(field, _settle(sources, field, notes))

    missing = tuple(name for name in FIELDS if name not in found)
    return EngineConfigReading(
        {name: found[name] for name in FIELDS} if not missing else None,
        {name: found[name] for name in FIELDS if name in found},
        missing,
        evidence,
        tuple(notes),
    )
