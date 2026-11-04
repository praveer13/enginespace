// What a workload is (ARCHITECTURE §5.2 `workload`, §5.3, §5.6; WORLD §2.2): the requests a model serves, each with the time the
// client means to send it, the lengths it will have, and what it shares with other requests.

import type { AdapterId, PrefixGroupId, ReqId, Seed, Us } from '../core/types'
import type { SliceCredit } from './slices'

/** One request. A workload is a list of these in arrival order, and `id` is the index. */
export interface ReqSpec {
  readonly id: ReqId
  /**
   * When the client intends to send it, in µs from the start of the run. Latency is measured from here (WORLD §2.12), so a
   * run that sends late has not moved the clock. Never decreases from one request to the next.
   */
  readonly dueUs: Us
  /** Prompt length in tokens, at least 1. */
  readonly promptTokens: number
  /**
   * Tokens the request emits before it stops on EOS, at least 1. This is the truth about the request, not something the engine
   * knows: the scheduler learns the request has ended only when it emits EOS (WORLD §2.2), so a model must not read it to decide.
   */
  readonly outputTokens: number
  /** The prefix-sharing group the request belongs to, or null. Requests of one group start with the same prompt tokens. */
  readonly prefixGroup: PrefixGroupId | null
  /** How many leading prompt tokens the request shares with its group: at most `promptTokens`, and 0 without a group. */
  readonly prefixTokens: number
  /** The LoRA adapter the request asks for, or null for the base model. */
  readonly adapter: AdapterId | null
  /** Whether the request carries a grammar, so each step needs its structured-output mask. */
  readonly structured: boolean
}

/** Where a workload's numbers come from, which a screen must show (D-012). */
export type WorkloadOrigin =
  /** Drawn from tables and distributions written in the spec: synthetic, and labelled so. */
  | { readonly kind: 'synthetic' }
  /** Built from a recorded slice: its timing and lengths (`replay`), or its lengths only (`lengths`). Carries the slice's credit. */
  | { readonly kind: 'slice'; readonly use: 'replay' | 'lengths'; readonly credit: SliceCredit }

export interface Workload {
  /** The seed the workload was drawn from. */
  readonly seed: Seed
  readonly origin: WorkloadOrigin
  readonly reqs: readonly ReqSpec[]
}
