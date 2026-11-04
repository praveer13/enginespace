// The host card (ARCHITECTURE §5.2 `host`, §5.3; WORLD §2.11): what the CPU spends, in integer µs, on each phase of one engine step.

import type { Tag, Us } from '../core/types'

/**
 * CPU cost per phase of an engine step. Every field is an integer: µs, except `kernelsPerLayer`, which is a count. Where a
 * phase lands in a step is the step loop's (§5.3): schedule, prepare and launch on the CPU, the forward on the GPU, then sync, and sample and
 * detokenize on the CPU.
 */
export interface HostCard {
  /** `scheduler.schedule()`, whatever the batch: the fixed part. */
  readonly scheduleBaseUs: Us
  /** `scheduler.schedule()`, per running sequence. */
  readonly schedulePerSeqUs: Us
  /** Building the step's inputs, per token of the batch. MRV2 does this on the GPU, and so costs the CPU little. */
  readonly prepPerTokenUs: Us
  /** One kernel launched from Python, when the step does not replay a graph. */
  readonly launchPerKernelUs: Us
  /** Kernels launched per transformer layer when they are launched one by one. A count, not µs. */
  readonly kernelsPerLayer: number
  /** Launching one captured CUDA graph, when the step's dispatch key was captured. */
  readonly graphReplayUs: Us
  /** The sync that returns the sampled ids to the host. */
  readonly syncUs: Us
  /** Sampling and updating request state, per sequence, once the ids are back. */
  readonly samplePerSeqUs: Us
  /** Detokenizing, per token. In vLLM it runs in the frontend process, off the engine core's critical path (WORLD §2.1). */
  readonly detokPerTokenUs: Us
  /** Filling the structured-output bitmask, per masked sequence. */
  readonly maskPerSeqUs: Us
  /** Passing a step's result between the engine core and the frontend. */
  readonly ipcUs: Us
}

/** The runner presets the host card has values for (§5.3, D-041): MRV2 is vLLM's default at the pin, and V1 is the legacy runner. */
export type RunnerPresetId = 'v1' | 'mrv2'

export interface HostPreset {
  readonly id: RunnerPresetId
  /** What a picker calls it. */
  readonly label: string
  /** How the values are known. `estimated` until W2-T22 fits them to the owner's traces (WORLD §4.3). */
  readonly tag: Tag
  readonly card: HostCard
  /** The sentence the notional-machine card prints about this preset (§5.9), and every screen that shows its µs. */
  readonly cardLine: string
}
