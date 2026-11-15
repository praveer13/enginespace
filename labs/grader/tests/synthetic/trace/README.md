# Synthetic trace fixtures

Everything in this folder is **synthetic**: written by hand for the tests of `enginespace trace export` (W2-T19), with invented values. No GPU ran, no profiler ran, and no machine produced these files. The repository is public, so no real host name, user name, path or serial number is in them: the one path in a Python frame's name is `/srv/example/...`, and the exporter turns it into `<path>`. The values are plausible, not measured: nothing here is a measurement of any engine or any GPU, and the trace room must label a trace made from them "synthetic" (`meta.source` is `synthetic`).

Both inputs tell the same story, so that the exporter's two readers can be held to one answer: three steps on one GPU, the first eager with a launch call per kernel, a copy in and a copy out, the second a CUDA graph replay (one `cudaGraphLaunch`, three kernels that share its correlation id: what `--cuda-graph-trace=node` shows), the third eager on two streams at once. Around them, what an exporter has to leave out: a warm-up kernel before the first step, a kernel after the last, another thread's CPU work, and (in the torch file) metadata, flow, instant and counter events.

| File | What it is |
|---|---|
| `torch-profiler-steps.json` | a torch-profiler Chrome trace, in the shape of Kineto's output as it is remembered: `ts` and `dur` in microseconds with a fraction, on a base of 1.731e15 µs (a double cannot hold its ns), `ProfilerStep#<n>` annotations, `cuda_runtime` calls and `kernel` and `gpu_memcpy` events that carry `args.correlation` |
| `nsys-export-steps.sql` | the SQL that builds an Nsight Systems SQLite export of the same run: `CUPTI_ACTIVITY_KIND_KERNEL`, `_MEMCPY`, `_MEMSET`, `_RUNTIME`, `NVTX_EVENTS`, `StringIds`, `TARGET_INFO_GPU` and `META_DATA_EXPORT`, with the API version suffixes that nsys puts on a call's name (`cudaLaunchKernel_v7000`). The test builds the database from it, so no binary file is committed. **The table and column names are [unverified]** against nsys 2026.5.1, the pin (proposed): no nsys was available (research U2), and W2-T21's first real capture checks them |
| `torch-profiler-steps.trace.json`, `nsys-export-steps.trace.json` | what the exporter writes from the two (the canonical text of a `trace@1`). The Python tests hold the exporter to these bytes; `tests/trace/export-fixtures.test.ts` reads them with the site's own `decodeTrace` and runs `traceChecks` on them (T2 to T5, each over something), recomputes each window's attribution, and writes them back to the same bytes. The `nsys` golden's `meta.sha256` is the hash of the database that this machine's SQLite built, and a test compares it with the database it builds itself |
| `tiny.trace.json` | five spans written by `TraceBuilder` and by the site's `traceBuilder` from the same calls, to hold the two builders to one ordering and one text |

The goldens were written with:

```sh
uv run --project labs/grader enginespace trace export labs/grader/tests/synthetic/trace/torch-profiler-steps.json --format torch \
  --source synthetic --engine example-engine --engine-version 0.0.0 --captured-at 2026-01-01T00:00:00Z \
  --out labs/grader/tests/synthetic/trace/torch-profiler-steps.trace.json

# the database is built from the .sql with sqlite3's executescript, in a folder outside the repository
uv run --project labs/grader enginespace trace export <that database> --format nsys-sqlite \
  --source synthetic --engine example-engine --engine-version 0.0.0 --captured-at 2026-01-01T00:00:00Z \
  --step-name '^engine_step \d+$' --out labs/grader/tests/synthetic/trace/nsys-export-steps.trace.json
```

`example-engine`, `0.0.0` and the capture time are invented. The GPU's name is a product name, as in `../README.md`.
