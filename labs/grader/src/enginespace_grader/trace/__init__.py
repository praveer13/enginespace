"""Trace export (ARCHITECTURE section 9.4, W2-T19): a profiler's capture in, `enginespace/trace@1` out.

    model.py           the columns of `trace@1`: a builder that orders and interns as packages/sim/trace/builder.ts does, the checks of what JSON Schema
                       cannot say, and the canonical text whose SHA-256 is the trace's hash
    assemble.py        what the two readers share: which thread is the engine's, where the step windows are, what is kept, and how the columns are built
    torch_profiler.py  a torch-profiler (Kineto) Chrome-trace JSON, as `torch.profiler` and vLLM's `--profiler-config` write it
    nsys.py            an Nsight Systems SQLite export (`nsys export --type sqlite`)
    export.py          `enginespace trace export <input> --format torch|nsys-sqlite`

Both readers are written from the formats as they are remembered and documented, and no real capture was open when they were written (research U2): the owner's
first capture (W2-T21) is what checks them. Each says what it assumes, and a file that does not have what it needs stops the export with a message that names it,
and never with a trace that quietly lacks something.
"""
