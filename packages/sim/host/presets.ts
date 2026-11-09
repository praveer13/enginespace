// The host card's presets (ARCHITECTURE §5.3; WORLD §2.11, §4.3; DECISIONS D-041).
//
// Every value below is [estimated]: an order of magnitude chosen for the model to be run, not read from a source and not fitted
// to any trace. No owner trace exists yet (PRODUCT.md, "Evidence on Hand"). W2-T22 fits these to the owner's vLLM traces and
// replaces them with per-phase medians as claims; until then every screen that shows a host µs says "estimated", and no graded
// answer depends on one (WORLD §1, item 4).
//
// The one anchor is S5's host term. kernelspace's fit on the H100 FP8 row puts host work at t_seq = 61.1 µs per running
// sequence per step, with a refit range of 53.0 to 69.9 µs [measured: kernelspace docs/physics/report.json at d478f91, read
// 2026-11-03; a fit under S5's additive form, for vLLM 0.10.2]. The legacy preset's two per-sequence phases (30 + 31) add up to
// it, so the small-model card and the 70B card cost a sequence about the same on the legacy runner [derived]. On the 70B card
// the step loop replaces both phases by t_seq itself, so nothing is counted twice (D-044, proposed).
//
// What the presets say about the runners, in order of confidence:
//   - MRV2 prepares inputs and samples on the GPU and avoids CPU syncs in the step loop (vllm M5, read at v0.33.0 on 2026-11-03), so
//     against V1 it has a small `prepPerTokenUs`, a cheaper sync and cheaper per-sequence sampling work;
//   - the scheduler belongs to the engine core and both runners sit behind it (vllm M7), so `scheduleBaseUs` and
//     `schedulePerSeqUs` agree;
//   - the remaining phases do not depend on the runner and are the same.
// The sizes of every field are judgments [estimated], and 12 kernels per layer is a round figure for a Llama-style layer launched eagerly.

import type { HostCard, HostPreset, RunnerPresetId } from './types'

const SHARED = {
  scheduleBaseUs: 150,
  schedulePerSeqUs: 30,
  launchPerKernelUs: 6,
  kernelsPerLayer: 12,
  graphReplayUs: 30,
  detokPerTokenUs: 10,
  maskPerSeqUs: 40,
  ipcUs: 100,
} as const

const V1: HostCard = Object.freeze({ ...SHARED, prepPerTokenUs: 8, syncUs: 60, samplePerSeqUs: 31 })
const MRV2: HostCard = Object.freeze({ ...SHARED, prepPerTokenUs: 2, syncUs: 20, samplePerSeqUs: 15 })

const line = (runner: string) =>
  `Host phase costs for the ${runner} runner are [estimated] orders of magnitude, not fitted to any trace: W2-T22 fits them to the owner's reference traces, and until then every host µs on screen says "estimated".`

/** The presets are frozen: a model that wants other costs copies a card and changes the copy. */
export const HOST_PRESETS: Readonly<Record<RunnerPresetId, HostPreset>> = Object.freeze({
  mrv2: Object.freeze({ id: 'mrv2', label: 'MRV2 (vLLM default since v0.29.0)', tag: 'estimated', card: MRV2, cardLine: line('MRV2') }),
  v1: Object.freeze({ id: 'v1', label: 'V1 (legacy runner)', tag: 'estimated', card: V1, cardLine: line('V1') }),
} as const)

/** The preset of a runner. */
export function hostPreset(id: RunnerPresetId): HostPreset {
  return HOST_PRESETS[id]
}
