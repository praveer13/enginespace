// Graph memory, and the KV cache that is sized after it (ARCHITECTURE §5.3, "Which engine the model follows"; WORLD §2.4, §2.5;
// GAMES.md §3.2's `keys` level).
//
// Since v0.29.0 vLLM reserves the memory that CUDA graphs will take before it sizes the KV cache (claim vllm.cudagraph.memory-profiling-since).
// MRV2 estimates it while the engine is still profiling, before the real cache is allocated (claim vllm.cudagraph.memory-before-kv), and the
// memory the KV cache may take is the requested memory minus the profiled non-KV memory minus that estimate (claim vllm.cudagraph.memory-subtracted).
// The estimate is applied by default (claim vllm.cudagraph.memory-estimate-default). So every graph a learner captures is memory that the cache
// does not get, and a KV-capacity prediction that ignores the graphs is off by their sum (research vllm G9).
//
// The estimate is a sum over the captured graphs: the profile captures the largest ones, records what each took and extrapolates the
// delta to the rest (claim vllm.cudagraph.memory-profile-extrapolates). The model prices one graph at a fixed part plus a part for each token of its padded size.
// Both parts are [estimated]: no capture has been measured on a card yet, and W2's traces may fit them. "Requested memory" is
// the card's memory times `gpu_memory_utilization`, which is 0.92 by default (claim vllm.cache.gpu-memory-utilization-default).

import { divCeil, divFloor } from '../core/int'
import type { CapturedGraph } from './graphs'
import type { S5GpuCard } from './types'

/** What one captured graph holds. */
export interface GraphMemoryModel {
  /** Bytes every graph holds, whatever its size: nodes, parameters and a share of the pool. */
  readonly baseBytes: number
  /** Bytes for each token of the padded size it was captured at: the intermediates of one token's pass. */
  readonly perTokenBytes: number
}

/** [estimated] 8 MiB a graph and 16 KiB a token: a capture of vLLM's 51 default sizes in two modes (102 graphs) then takes 1,144 MiB [derived]. */
export const GRAPH_MEMORY_MODEL: GraphMemoryModel = Object.freeze({ baseBytes: 8 * 1024 * 1024, perTokenBytes: 16 * 1024 })

/** The bytes the graphs hold: the sum over the captured graphs of the fixed part and the part for their tokens. */
export function graphReservationBytes(graphs: readonly Pick<CapturedGraph, 'numTokens'>[], model: GraphMemoryModel = GRAPH_MEMORY_MODEL): number {
  let total = 0
  for (const graph of graphs) total += model.baseBytes + model.perTokenBytes * graph.numTokens
  return total
}

/** What the engine has to divide on one GPU, in bytes. */
export interface MemoryPlan {
  /** The card's memory. */
  readonly hbmBytes: number
  /** `gpu_memory_utilization`, out of 1,000: 920 by default. */
  readonly utilizationPermille: number
  /** The weights on this GPU. */
  readonly weightBytes: number
  /** The activations' peak on this GPU, which profiling measures and the model takes as an input. [estimated] */
  readonly workspaceBytes: number
  /** The graphs' estimate (`graphReservationBytes`). */
  readonly graphBytes: number
  /** `VLLM_MEMORY_PROFILER_ESTIMATE_CUDAGRAPHS`, on by default: subtract the estimate before the cache is sized. Off, the graphs are captured out of what the cache left. */
  readonly applyGraphEstimate?: boolean
}

export interface KvBudget {
  /** The memory vLLM may use: the card's memory times the utilisation, rounded down. */
  readonly requestedBytes: number
  /** The weights and the activations. */
  readonly nonKvBytes: number
  /** The graphs' share that was taken off before the cache was sized: 0 when the estimate is not applied. */
  readonly graphBytes: number
  /** What the KV cache gets. 0 when the rest does not fit. */
  readonly kvBytes: number
  /** Whether the requested memory covers the non-KV memory and the graphs: vLLM refuses to start otherwise. */
  readonly fits: boolean
}

/** The KV cache's budget on one GPU: `requested − non-KV − graph estimate`, never below 0 (claim vllm.cudagraph.memory-subtracted). */
export function kvBudget(plan: MemoryPlan): KvBudget {
  for (const [name, value] of [['hbmBytes', plan.hbmBytes], ['weightBytes', plan.weightBytes], ['workspaceBytes', plan.workspaceBytes], ['graphBytes', plan.graphBytes]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be an integer of at least 0, got ${value}`)
  }
  if (!Number.isInteger(plan.utilizationPermille) || plan.utilizationPermille < 1 || plan.utilizationPermille > 1000) {
    throw new RangeError(`utilizationPermille is an integer from 1 to 1000, got ${plan.utilizationPermille}`)
  }
  const requestedBytes = divFloor(plan.hbmBytes * plan.utilizationPermille, 1000)
  const nonKvBytes = plan.weightBytes + plan.workspaceBytes
  const graphBytes = plan.applyGraphEstimate === false ? 0 : plan.graphBytes
  const room = requestedBytes - nonKvBytes - graphBytes
  return { requestedBytes, nonKvBytes, graphBytes, kvBytes: Math.max(0, room), fits: room > 0 }
}

/** Tokens the KV cache holds: its bytes over the bytes of one token on this GPU, rounded down. */
export function kvTokens(budget: Pick<KvBudget, 'kvBytes'>, kvBytesPerToken: number): number {
  if (!Number.isSafeInteger(kvBytesPerToken) || kvBytesPerToken < 1) throw new RangeError(`kvBytesPerToken is an integer of at least 1, got ${kvBytesPerToken}`)
  return divFloor(budget.kvBytes, kvBytesPerToken)
}

/**
 * The plan for the "70B on H100" card and its siblings, per GPU: the chip's memory, the weights and the KV bytes of a token divided
 * over the tensor-parallel degree (rounded up, so a split never gives the GPU less than its share), and the utilisation vLLM defaults to.
 * The activation workspace and the graphs' estimate are the caller's.
 */
export function memoryPlanFor(card: S5GpuCard, o: { readonly workspaceBytes: number; readonly graphBytes: number; readonly utilizationPermille?: number; readonly applyGraphEstimate?: boolean }): { plan: MemoryPlan; kvBytesPerToken: number } {
  const { chip, model } = card.spec
  return {
    plan: {
      hbmBytes: chip.hbmBytes,
      utilizationPermille: o.utilizationPermille ?? 920,
      weightBytes: divCeil(model.weightBytes, card.tp),
      workspaceBytes: o.workspaceBytes,
      graphBytes: o.graphBytes,
      ...(o.applyGraphEstimate === undefined ? {} : { applyGraphEstimate: o.applyGraphEstimate }),
    },
    kvBytesPerToken: divCeil(model.kvBytesPerToken, card.tp),
  }
}
