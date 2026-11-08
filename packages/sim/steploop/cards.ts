// The cost cards a run prices its steps with (ARCHITECTURE §5.3, WORLD §2.11): what the GPU lane charges for a step.
//
// Three cards exist:
//   - the S5 card on one of kernelspace's three fitted rows, "70B on H100" and its siblings, whose step times are a fit (`s5Card`),
//     with its host term on the CPU lane unless a caller keeps it in the GPU step (D-044, proposed);
//   - the small-model napkin card of TR2's levels (`SMALL_CARD`, WORLD §2.11), S5's form at the datasheet bound on a small model,
//     synthetic (W1-T13);
//   - the front page's synthetic ticks (`TICK_CARD`), a world of the model's own invention (GAMES.md §3.1, D-043, D-048).
// The host card (`../host`) prices the CPU lane and is passed beside the GPU card.
//
// This file holds the tick card and what every run reads of a card (`gpuCost`, `gpuLayers`), and `./s5` the two cards on S5's form.
// The front page runs the tick card, so this file is in its first-paint closure, and a module goes into a chunk with everything it
// imports: the fitted rows that `s5Card` reads (`../physics/rows`) would ride along with it to every page that runs a step, the front
// page among them (D-055, D-059). The barrel re-exports both files.

import type { HostCard } from '../host/types'
import { stepCard } from '../physics/card'
import type { StepLoad } from '../physics/card'
import { stepSplit } from '../physics/split'
import type { GpuCard, GpuCost, GpuWork, TickGpuCard } from './types'

/** The id of this model's notional-machine card, `content/cards/trace-room-steploop.md` (§5.9: each model exports its card id). */
export const STEPLOOP_CARD_ID = 'trace-room-steploop'

/**
 * The front page's world, host and GPU in one frozen object, so `runStepLoop(w, cfg, TICK_CARD, TICK_CARD, opts)` runs it
 * (GAMES.md §3.1, "The front-page world"). A step costs 2 ticks of CPU planning (the schedule phase), 4 ticks of GPU forward
 * with 1 more tick when the step admits a request, and 1 tick of CPU reading (the sync phase), whatever the batch holds.
 * Without overlap a step therefore takes 7 ticks, of which the GPU is busy 4. With overlap it takes the larger of the GPU's 4
 * and the CPU's 3. Every tick count is [estimated]: a world of the model's own invention, and its screens say synthetic
 * (D-012, D-048). A tick is one unit of the model's integer clock. The card launches no kernels and has no graph, so a graph
 * mode leaves it unchanged.
 */
export const TICK_CARD: HostCard & TickGpuCard = Object.freeze({
  scheduleBaseUs: 2,
  schedulePerSeqUs: 0,
  prepPerTokenUs: 0,
  launchPerKernelUs: 0,
  kernelsPerLayer: 0,
  graphReplayUs: 0,
  syncUs: 1,
  samplePerSeqUs: 0,
  detokPerTokenUs: 0,
  maskPerSeqUs: 0,
  ipcUs: 0,
  kind: 'ticks',
  label: 'Synthetic ticks (the front page)',
  tag: 'estimated',
  synthetic: true,
  forwardUs: 4,
  admitUs: 1,
})

/** The transformer layers a card's model has: with the host card's kernels per layer, how many launches an eager step makes. */
export function gpuLayers(card: GpuCard): number {
  return card.kind === 'ticks' ? 0 : card.spec.model.layers
}

/** What the GPU lane charges for a step of `work`, and the per-sequence host work the card puts on the CPU lane. */
export function gpuCost(card: GpuCard, work: GpuWork): GpuCost {
  if (card.kind === 'ticks') return { gpuUs: card.forwardUs + (work.prefillSeqs > 0 ? card.admitUs : 0), hostSeqUs: null }
  const load: StepLoad = { seqs: work.seqs, tokens: work.tokens, kvTokens: work.kvTokens, attnPairs: work.attnPairs }
  // A napkin card says nothing about the host, so the host card prices the per-sequence phases (null).
  if (card.kind === 'napkin') return { gpuUs: stepCard(card.spec, card.tp, load).us, hostSeqUs: null }
  if (card.hostTerm === 'in-gpu') return { gpuUs: stepCard(card.spec, card.tp, load).us, hostSeqUs: 0 }
  const split = stepSplit(card.spec, card.tp, load)
  return { gpuUs: split.gpuUs, hostSeqUs: split.hostSeqUs }
}
