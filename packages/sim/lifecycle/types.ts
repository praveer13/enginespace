// The lifecycle model's vocabulary (ARCHITECTURE §5.8; GAMES.md §5 "Simulation API"; the `lifecycle` card, content/cards/lifecycle.md):
// one request's path through an engine as a list of stages, each with a location and a mechanism, and each cited to a file of the
// engine at the commit that course.lock.json pins. Nothing here runs.
//
// The model is about where a request's DATA is, and how it got there. A stage starts where the one before it ended, and its
// mechanism is the way it crosses the boundary between its two places (legal.ts). Control that only starts work, such as the host
// calls that launch a kernel, is not a stage: the stage is the GPU running what was launched.

/** The id of this model's notional-machine card, `content/cards/lifecycle.md` (§5.9: each model exports its card id). */
export const LIFECYCLE_CARD_ID = 'lifecycle'

/**
 * The five engines of GAMES.md §5, in the order of its levels. `inside-vllm` is vLLM at the commit the post "Inside vLLM" analyses
 * (42172ad), which predates Model Runner V2; `vllm` is the pinned minor (v0.33.0); `sglang` is the pinned SGLang (v0.5.23); the other
 * two are the small reading targets.
 */
export const ENGINE_IDS = ['nano-vllm', 'mini-sglang', 'inside-vllm', 'vllm', 'sglang'] as const
export type EngineId = (typeof ENGINE_IDS)[number]

/**
 * How a stage moves a request, or what it does where it is (GAMES.md §5):
 *   - `call`: work in place, such as a function that schedules or detokenizes;
 *   - `queue`: a buffer between two threads, or between two steps of one thread;
 *   - `ipc`: between processes, over a socket (ZMQ, HTTP);
 *   - `shm`: between processes, through shared memory;
 *   - `h2d`: host to GPU, a copy; `d2h`: GPU to host, a copy;
 *   - `launch`: work handed to the GPU, which runs it there (a forward, or sampling);
 *   - `collective`: between the GPUs of two ranks (NCCL);
 *   - `sync`: the host waits until the GPU's work has landed.
 */
export const MECHANISMS = ['call', 'queue', 'ipc', 'shm', 'h2d', 'd2h', 'launch', 'collective', 'sync'] as const
export type Mechanism = (typeof MECHANISMS)[number]

/**
 * Where a request is. `thread` names a lane of execution inside the process: an OS thread, or an asyncio task of one event loop
 * where the pinned source gives that task a queue of its own (the stage says which). A GPU place is the process that owns the
 * device, with the stream as its thread. `rank` is the tensor-parallel rank, 0 for everything in a single-rank engine.
 */
export interface Place {
  readonly process: string
  readonly thread: string
  readonly device: 'host' | 'gpu'
  readonly rank: number
}

/**
 * The file a stage is read from, at the commit that course.lock.json pins for the engine (A§4.4, D-035). `line` is the 1-based line
 * of `quote`, and `symbol` is the definition that holds it (`Class.method`, or a function). `quote` is the source's own text, one
 * line, so that the citation can be checked: tests/sim/lifecycle-sources.test.ts does it against the unpacked tarballs. A permalink
 * is `https://github.com/${repo}/blob/${ref}/${path}#L${line}`.
 */
export interface SourceRef {
  readonly repo: string
  readonly ref: string
  readonly path: string
  readonly symbol: string
  readonly line: number
  readonly quote: string
}

/** One stage of a request's path. `label` is the engine's own term for it, with the symbol in backticks, as the tray shows it. */
export interface StageDef {
  /** Unique within an engine's paths, and the name of the stage's span in a lifecycle trace. It begins with the engine's prefix. */
  readonly id: string
  readonly mechanism: Mechanism
  readonly label: string
  readonly from: Place
  readonly to: Place
  readonly source: SourceRef
  /** The state the request is in once the stage is done, in the pinned code's own names, where that code names one (`RequestStatus`, `SequenceStatus`). */
  readonly state?: string
}

/**
 * A scenario of the graded `map` level (GAMES.md §5): the engine and four things about the request. `n` is the sampling parameter
 * `n`, the number of samples one request asks for. A scenario is valid only where the engine supports it (`supports` in paths.ts).
 */
export interface Scenario {
  readonly engine: EngineId
  readonly streaming: boolean
  readonly tp: 1 | 2
  readonly abort: boolean
  readonly prefixHit: boolean
  readonly n: 1 | 2
}

/** What an engine's paths can vary in. A client leaves mid-stream, so `abort` is only ever true with `streaming`. */
export interface Support {
  readonly streaming: readonly boolean[]
  readonly tp: readonly (1 | 2)[]
  readonly abort: readonly boolean[]
  readonly prefixHit: readonly boolean[]
  readonly n: readonly (1 | 2)[]
}

/**
 * One engine's paths, as data. `repo` and `ref` are where its stages are cited (the lock's commit for the engine's pin, which
 * tests/sim/lifecycle.test.ts compares) and `readOn` is the day the citations were read there, as an upstream fact is dated (rule 3,
 * A§4.4). `entry` is where a request begins and, unless it is aborted, ends, and `path` writes the stages of one scenario in order.
 * The citations are re-read at each re-pin (TR1 §10).
 */
export interface EngineDef {
  readonly id: EngineId
  readonly title: string
  readonly repo: string
  readonly ref: string
  readonly readOn: string
  readonly entry: Place
  readonly supports: Support
  readonly path: (sc: Scenario) => readonly StageDef[]
}

/** The rules a path keeps (GAMES.md §5). `start` is the first, and the rest name the kind of bridge a stage needed. */
export type Rule = 'start' | 'process' | 'thread' | 'device' | 'async'

/** What a failed check says: the rule, and a sentence that names the two places. */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly rule: Rule; readonly detail: string }
