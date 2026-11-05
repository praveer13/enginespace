// The step-loop model's vocabulary (ARCHITECTURE §5.3; WORLD §2.1, §2.12): what a run is given, and what it returns.
//
// Nothing here runs. Every value is a plain number, string or array of them, so a run crosses a worker boundary, a canonical-JSON
// hash and the Python grader (§9.8) unchanged. Times are integer µs (§5.1). The front page prices its steps in synthetic ticks on
// the same integer clock, and its screens print them as ticks, never as µs (D-048).
//
// v0 was the TR2 spike (W0-T13, D-040): async scheduling on and off, a CUDA graph that is on or off with its capture sizes and
// padding, the dependency check, bubble metrics, and TTFT and TPOT per request. W1-T12 is v1. It adds the rest of §5.3's sketch:
// the runner (`runner`), the graph modes and the dispatch keys of both runners, adapters (`lora`), the structured-output mask
// (`structured`) and the speculative step (`spec`). Every v1 field is optional, and a configuration without them runs exactly as in
// v0: the same spans, the same numbers, and the same fields in the result (tests/fixtures/sim/steploop.json holds v0's goldens).

import type { Permille, ReqId, Tag, Us } from '../core/types'
import type { RunnerPresetId } from '../host/types'
import type { CardSpec } from '../physics/card'

// ---------------------------------------------------------------------------------------------------------------------------
// What a run is given

/**
 * What a step runs as, once the dispatcher has decided (WORLD §2.5; claim vllm.cudagraph.mode-routines): eagerly, as a run of
 * piecewise graphs with attention launched between them, or as one full graph.
 */
export type CudaGraphMode = 'NONE' | 'PIECEWISE' | 'FULL'

/**
 * The five modes of vLLM's `CUDAGraphMode` (claim vllm.cudagraph.modes). The first three are single modes. FULL_DECODE_ONLY and
 * FULL_AND_PIECEWISE are pairs, one mode for decode batches and one for the rest (`GRAPH_MODES` in ./graphs). Without a `runner`
 * the loop models only NONE and FULL, as v0 did.
 */
export type GraphModeId = CudaGraphMode | 'FULL_DECODE_ONLY' | 'FULL_AND_PIECEWISE'

/** The graph settings of a configuration: the mode, the sizes captured, and the two switches that decide which adapter cases are captured. */
export interface GraphSettings {
  readonly mode: GraphModeId
  /** Ascending, positive and distinct: the token counts a graph was captured for (`defaultCaptureSizes` is vLLM's list). Ignored when `mode` is `'NONE'`. */
  readonly captureSizes: readonly number[]
  /** `cudagraph_specialize_lora`: capture graphs with and without active adapters. On by default at the pin (claim vllm.cudagraph.lora-specialize). */
  readonly specializeLora?: boolean
  /** `specialize_active_lora`: capture a graph per count of active adapters, in powers of 2. Off by default (claim vllm.cudagraph.lora-count-specialize). */
  readonly specializeActiveLora?: boolean
}

/** The speculative methods of vLLM v0.33.0 that the model tells apart (claim vllm.spec.methods): what each does to the runner and to async scheduling. */
export type SpecMethodId = 'ngram' | 'ngram_gpu' | 'draft_model' | 'suffix' | 'custom_class' | 'eagle' | 'eagle3' | 'mtp' | 'dflash' | 'dspark'

/**
 * Speculative decoding's step shape (WORLD §2.7; claims vllm.scheduler.spec-drafts, spec.paper.expected-tokens). Each decode row
 * carries `1 + k` tokens: the sampled token and `k` drafts, which the verify step computes together. Each draft is accepted with
 * probability `alphaPermille`, until the first that is not, and the round emits the accepted drafts and one more token of its own.
 */
export interface SpecSettings {
  /** Drafts per round, at least 1. */
  readonly k: number
  /** The chance that a draft is accepted, as an integer out of 1,000. */
  readonly alphaPermille: number
  /** What drafting one token costs the GPU, as a share of a plain decode step of the same batch, out of 1,000. [estimated] until W2 measures it. */
  readonly draftCostPermille: number
  /** The method, which decides whether the V2 runner takes the configuration and whether async scheduling stays on (./runners). Default `'eagle'`. */
  readonly method?: SpecMethodId
}

export interface StepLoopConfig {
  /** The cap on requests running at once (vLLM's `max_num_seqs`). At least 1. */
  readonly maxNumSeqs: number
  /** One step's token budget (`max_num_batched_tokens`): decodes first, then prefill chunks. At least 1. */
  readonly maxBatchedTokens: number
  /**
   * Whether a prompt may be cut into chunks to fit the budget (on by default in vLLM at the pin, vllm M8). Off, a prompt is
   * admitted whole or not at all, and a prompt longer than the budget can never run, so the run refuses it up front.
   */
  readonly chunkedPrefill: boolean
  /** The next step is scheduled, prepared and launched while this one's forward runs (§5.3, vllm M6, M7). */
  readonly asyncScheduling: boolean
  /**
   * How requests join the running set. `'continuous'`, the default, admits a waiting request whenever a slot is free at a step
   * boundary, as vLLM does (vllm M8). `'static'` forms a batch and admits nothing while any request of the previous one is still
   * live in the engine's view, which is the front page's first lane (GAMES.md §3.1, D-043): the slot a stopped request leaves
   * stays empty until the whole batch is done. A request is live until the engine has read its stop, so with async scheduling the
   * ghost step of a batch's last request is still part of that batch.
   */
  readonly batching?: 'continuous' | 'static'
  /**
   * Where the next step's input token ids are written from (§5.3: "the next step's input ids come from the device, not a host
   * round trip"). `'device'`: the GPU copies each request's sampled id into the next step's inputs itself, as MRV2's GPU-side
   * input preparation does (vllm M5), so the CPU never reads a token that is not sampled yet. `'host'`: the CPU reads the
   * sampled ids back and writes them, which needs the previous step's tokens on the host first. With async scheduling the
   * previous step is still in flight, so the CPU reads a token before it is sampled and the run raises a `Violation`.
   */
  readonly inputIds: 'device' | 'host'
  readonly graphs: GraphSettings
  /**
   * The runner whose dispatcher picks each step's graph (D-041): `'mrv2'`, the default runner at the pin, dispatches on a
   * seven-field `BatchExecutionDescriptor` and `'v1'`, the legacy runner, on a five-field `BatchDescriptor` with `has_lora`.
   * Without it the loop keeps v0's rule: a step replays a graph if its token count, padded to the smallest captured size, was
   * captured, and the modes are NONE and FULL. With it every mode works, and `StepStat.mode` says what each step ran as.
   */
  readonly runner?: RunnerPresetId
  /** Adapters (D-041, D-042). The workload says which request asks for which adapter, and the loop counts the distinct adapters of each step; `maxLoras` caps them in the running set, as the scheduler does (claim vllm.lora.admission-cap). */
  readonly lora?: { readonly maxLoras: number }
  /**
   * The structured-output mask (WORLD §2.8). The workload says which requests carry a grammar. `overlap`: build a step's mask while
   * its forward runs (claim vllm.mask.overlap), and not after the forward has ended. Either way a mask that needs the token a step
   * still has in flight waits for that token (claim vllm.mask.deferred-sampling).
   */
  readonly structured?: { readonly overlap: boolean }
  readonly spec?: SpecSettings
}

/** What the GPU card prices: one step's batch, after any padding. */
export interface GpuWork {
  /** Sequences in the step, padding not counted (a padded token is not a sequence the host schedules). */
  readonly seqs: number
  /** Of those, the sequences that run a prefill chunk this step (a request's admission is one). */
  readonly prefillSeqs: number
  /** Tokens the GPU computes, padding included. */
  readonly tokens: number
  /** KV entries read or written, padding included (§5.3, S5's `K`). */
  readonly kvTokens: number
  /** Causal attention token pairs, padding included (S5's `A`). */
  readonly attnPairs: number
}

/** What a step costs on the two lanes, as the GPU card sees it. */
export interface GpuCost {
  /** The forward on the GPU stream, in integer µs. */
  readonly gpuUs: Us
  /**
   * The per-sequence host work the card puts on the CPU lane, in the schedule phase, or null when the card says nothing about it.
   * A number, even 0, means the card accounts for that work itself, so it replaces the host card's per-sequence schedule and
   * sample phases and no host work is counted twice (D-044, proposed). S5 does: its own `seqs × t_seq` is either inside `gpuUs`
   * (0 here) or this number.
   */
  readonly hostSeqUs: Us | null
}

interface GpuCardBase {
  /** What a picker or a card line calls it. */
  readonly label: string
  /** How the step times are known (§0, "Tags"). */
  readonly tag: Tag
  /** Whether the numbers are a world of the model's own invention, which a screen must say (D-012). */
  readonly synthetic: boolean
}

/**
 * Where S5's per-sequence host term `seqs × t_seq` runs (D-044, proposed; the owner confirms it before W1-T12, and until then
 * `'on-cpu'` is the default of `s5Card`, with `D044` saying so).
 * `'in-gpu'`: inside the GPU step, as S5 fitted it. `'on-cpu'`: on the CPU lane, where async scheduling can hide it, which is an
 * extrapolation beyond S5's additive fit and which the notional-machine card says.
 */
export type S5HostTerm = 'in-gpu' | 'on-cpu'

/** kernelspace's S5 step card on one of its fitted rows (§5.2 `physics`): "70B on H100" and its two siblings. */
export interface S5GpuCard extends GpuCardBase {
  readonly kind: 's5'
  readonly spec: CardSpec
  /** The tensor-parallel degree the card is priced at. */
  readonly tp: number
  readonly hostTerm: S5HostTerm
}

/**
 * The front page's synthetic ticks (GAMES.md §3.1, D-043, D-048): a forward of `forwardUs`, and `admitUs` more when the step runs
 * a prefill, whatever else it carries. A tick is one unit of the integer clock.
 */
export interface TickGpuCard extends GpuCardBase {
  readonly kind: 'ticks'
  readonly forwardUs: Us
  readonly admitUs: Us
}

export type GpuCard = S5GpuCard | TickGpuCard

// ---------------------------------------------------------------------------------------------------------------------------
// What a run returns

/**
 * The lanes the loop draws (§5.3). The structured-output mask is drawn on `cpu-main`, as a `mask` span, because vLLM's engine core
 * thread fills it itself (claim vllm.mask.overlap): a lane of its own would show that thread idle while it works.
 */
export type LaneId = 'cpu-main' | 'gpu-stream'

/**
 * What a span is. On `cpu-main`: `schedule`, `prepare` and `launch` (the step's CPU work before its forward), `mask` (filling the
 * structured-output bitmask), `sync` (the blocking call that returns the sampled ids to the host) and `sample` (updating requests
 * from them and checking stops). On `gpu-stream`: `forward`, which holds the draft too when the step speculates. A phase that costs
 * 0 leaves no span, and a wait leaves a gap, not a span.
 */
export type SpanKind = 'schedule' | 'prepare' | 'launch' | 'mask' | 'sync' | 'sample' | 'forward'

export interface Span {
  /** The index of the step it belongs to, from 0 in launch order. */
  readonly step: number
  readonly kind: SpanKind
  readonly startUs: Us
  readonly endUs: Us
}

/** Each lane's spans in time order. Spans on one lane never overlap, and every span lies inside the run's horizon. */
export interface Timeline {
  readonly 'cpu-main': readonly Span[]
  readonly 'gpu-stream': readonly Span[]
}

/** Whether a step replayed a captured graph: `'off'` when graphs are off, `'hit'` when its padded size was captured, `'miss'` when it was not. */
export type GraphResult = 'off' | 'hit' | 'miss'

export interface StepStat {
  /** The step's index in launch order, from 0. */
  readonly index: number
  /** Rows in the batch: one per sequence. */
  readonly seqs: number
  /** Of those, the rows that run a prefill chunk. */
  readonly prefillSeqs: number
  /** Of those, the rows whose request had already stopped when the token came back: one token computed and thrown away (WORLD §2.6). Known once the step is read back, and 0 until then. */
  readonly ghostSeqs: number
  /** Tokens the batch carries. */
  readonly tokens: number
  /** Tokens the GPU computed: `tokens`, or the captured size that padded them. */
  readonly paddedTokens: number
  readonly graph: GraphResult
  /** What the step ran as: `'FULL'` or `'PIECEWISE'` on a hit, else `'NONE'`. Present only when the configuration has a `runner`. */
  readonly mode?: CudaGraphMode
  /** Length of the step's forward span (0 if the horizon cut it away). */
  readonly gpuUs: Us
  /** GPU idle time between the previous forward and this one, while `cpu-main` was busy: the GPU waiting on the CPU. 0 for the first step. */
  readonly bubbleUs: Us
  /** Distinct adapters among the step's rows. Present only when the configuration has `lora`. */
  readonly activeLoras?: number
  /** CPU µs spent filling the step's bitmask, wherever the fill ran. Present only when the configuration has `structured`. */
  readonly maskUs?: Us
  /** GPU µs the step's drafts cost, inside its forward span. Present only when the configuration has `spec`. */
  readonly draftUs?: Us
}

export interface ReqStat {
  readonly id: ReqId
  /** When the client meant to send it. Latency counts from here (WORLD §2.12). */
  readonly dueUs: Us
  /** Tokens it emitted within the run. */
  readonly tokens: number
  /** Tokens computed for it after it had stopped, which the engine threw away. */
  readonly ghostTokens: number
  /** Whether it emitted all its output within the run. */
  readonly finished: boolean
  /** From the due time to the end of the sample span of the step that emitted its first token; null before that. */
  readonly ttftUs: Us | null
  /** Time per output token after the first, rounded to whole µs: the first token's end to the last one's, over the tokens between. Null below two tokens. */
  readonly tpotUs: Us | null
  /** From the due time to its last token, once it finished. */
  readonly e2eUs: Us | null
}

export interface Summary {
  /** When the run ended: the end of its last span, or the horizon if the run was cut there. */
  readonly clockUs: Us
  readonly steps: number
  /** Requests that emitted all their output. */
  readonly finished: number
  /** Tokens that reached a request. */
  readonly usefulTokens: number
  /** Tokens computed for a request that had stopped. Only async scheduling makes them. */
  readonly ghostTokens: number
  /** Tokens a graph padded onto steps and the GPU computed for nothing. */
  readonly paddedTokens: number
  readonly gpuBusyUs: Us
  /** `gpuBusyUs` over `clockUs`, as an integer out of 1,000. */
  readonly gpuBusyPermille: Permille
  /** GPU idle time between forwards while `cpu-main` was busy (A§5.7's CPU-gap, from the first forward to the last). */
  readonly bubbleUs: Us
  /** Steps with a bubble before them. */
  readonly bubbles: number
  /** CPU launch calls: one per kernel on an eager step, one per graph replay. */
  readonly launches: number
  readonly eagerSteps: number
  /** Useful tokens per second, times 1,000. */
  readonly tokensPerSMilli: number
  readonly ttftP50Us: Us | null
  readonly ttftP99Us: Us | null
  readonly tpotP50Us: Us | null
  readonly tpotP99Us: Us | null
  /** CPU µs spent filling bitmasks, over the run. Present only when the configuration has `structured`. */
  readonly maskUs?: Us
  /** GPU µs the drafts cost, over the run. Present only when the configuration has `spec`. */
  readonly draftUs?: Us
  /** What speculation did. Present only when the configuration has `spec`. */
  readonly spec?: SpecSummary
}

/** What the speculative rounds of a run did, counted when each step is read back. */
export interface SpecSummary {
  /** Decode rows read back, which are the rounds. A ghost row is not one. */
  readonly rounds: number
  /** Drafts those rounds carried. */
  readonly drafted: number
  /** Of those, the drafts the target accepted. */
  readonly accepted: number
  /** Tokens the rounds emitted, before a request's own length cut any of them off: the accepted drafts and one more per round. */
  readonly emitted: number
  /** What a round emits on average, 1 + α + … + α^k, as an integer out of 1,000 (claim spec.paper.expected-tokens): `emitted / rounds` approaches it. */
  readonly expectedPerRoundMilli: number
}

/** A dependency broken: the CPU read tokens before the step that samples them returned (§5.3). Every graded level counts these (ASSESSMENT §4.3). */
export interface Violation {
  readonly kind: 'read-before-sample'
  /** The step that read them. */
  readonly step: number
  /** When its prepare phase began, which is when the CPU read. */
  readonly atUs: Us
  /** How many of the step's rows read a token whose step was still in flight. */
  readonly rows: number
}

export interface StepLoopRun {
  /** The window the run covers, as it was given. */
  readonly horizonUs: Us
  readonly lanes: Timeline
  readonly steps: readonly StepStat[]
  /** One per request of the workload, in order. */
  readonly reqs: readonly ReqStat[]
  readonly summary: Summary
  readonly violations: readonly Violation[]
}
