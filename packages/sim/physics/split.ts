// S5's step time without its per-sequence host term (ARCHITECTURE §5.3, D-044 (proposed)).
//
// S5 fitted `seqUs` as host work per running sequence per step and added it to the GPU time inside the card: its fixed term is
// layers · layerUs + seqs · seqUs. D-044 moves the second half to the CPU lane, where async scheduling can hide it, and says so on the
// card, since hiding a term S5 fitted as additive is an extrapolation. This is the split, as the step loop reads it:
//   - `hostSeqUs` is seqs · seqUs, rounded;
//   - `gpuUs` is the card's `us` minus that, so the GPU lane carries what S5 attributes to the device;
//   - the two add up to `us` exactly.
// Where the CPU lane puts `hostSeqUs` (which phase) is the step loop's choice, and whether the owner confirms D-044 is decided
// before W1-T12.

import { stepCard } from './card'
import type { CardSpec, StepLoad } from './card'
import type { Us } from '../core/types'

export interface StepSplit {
  /** The whole step as S5 prices it, integer µs. */
  readonly us: Us
  /** The step without the per-sequence host term. */
  readonly gpuUs: Us
  /** The per-sequence host term, seqs · seqUs. */
  readonly hostSeqUs: Us
}

export function stepSplit(spec: CardSpec, tp: number, load: StepLoad): StepSplit {
  const us = stepCard(spec, tp, load).us
  const hostSeqUs = Math.min(us, Math.round(load.seqs * spec.params.seqUs))
  return { us, gpuUs: us - hostSeqUs, hostSeqUs }
}
