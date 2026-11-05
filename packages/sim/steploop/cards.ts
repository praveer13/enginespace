// The cost cards a run prices its steps with (ARCHITECTURE §5.3, WORLD §2.11): what the GPU lane charges for a step.
//
// Two cards exist:
//   - the S5 card on one of kernelspace's three fitted rows, "70B on H100" and its siblings, whose step times are a fit (`s5Card`),
//     with its host term on the CPU lane unless a caller keeps it in the GPU step (D-044, proposed);
//   - the front page's synthetic ticks (`TICK_CARD`), a world of the model's own invention (GAMES.md §3.1, D-043, D-048).
// The small-model napkin card (WORLD §2.11) waits for W1-T13, which is the first level to need it. The host card (`../host`) prices
// the CPU lane and is passed beside the GPU card.

import type { HostCard } from '../host/types'
import { physicsRow, stepCard, stepSplit } from '../physics'
import type { PhysicsRowKey, StepLoad } from '../physics'
import type { GpuCard, GpuCost, GpuWork, S5GpuCard, S5HostTerm, TickGpuCard } from './types'

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

/**
 * D-044's status. The decision is proposed, and the owner confirms it before W1-T12 (DECISIONS D-044, Q-2); W1-T12 builds its default and
 * every card that shows the choice says so. When the owner answers, this is the one place that changes: set `status` to `'accepted'`,
 * or move `placement` to `'in-gpu'` if the owner keeps S5's term inside the GPU step.
 */
export const D044 = { id: 'D-044', status: 'proposed', placement: 'on-cpu' } as const

/**
 * Where S5's per-sequence host term runs unless a caller says otherwise: on the CPU lane, where async scheduling can hide it (D-044,
 * proposed). Hiding it under the forward is an extrapolation beyond S5's additive fit, and the card says so.
 */
export const DEFAULT_HOST_TERM: S5HostTerm = D044.placement

/**
 * kernelspace's S5 step card on the fitted row `key` at tensor-parallel degree `tp`. The step times are the fit's: they hold inside
 * the row's box and are an extrapolation outside it (WORLD §4.2), and the fit's split between terms is not a hardware fact.
 * `hostTerm` says where S5's `seqs × t_seq` runs: on the CPU lane by default, which D-044 proposes and the owner has not yet
 * confirmed (`D044`), or inside the GPU step as S5 fitted it. Either way the term replaces the host card's per-sequence schedule and sample
 * phases, so no host work is counted on both lanes.
 */
export function s5Card(key: PhysicsRowKey, tp: number, hostTerm: S5HostTerm = DEFAULT_HOST_TERM): S5GpuCard {
  if (!Number.isSafeInteger(tp) || tp < 1) throw new RangeError(`tp must be an integer of at least 1, got ${tp}`)
  const row = physicsRow(key)
  const where = hostTerm === 'on-cpu' ? `host term on the CPU lane (${D044.id}, ${D044.status})` : 'host term inside the GPU step, as S5 fitted it'
  return Object.freeze({ kind: 's5', label: `${row.label} · TP ${tp} · ${where}`, tag: 'derived', synthetic: false, spec: row.spec, tp, hostTerm })
}

/** The transformer layers a card's model has: with the host card's kernels per layer, how many launches an eager step makes. */
export function gpuLayers(card: GpuCard): number {
  return card.kind === 'ticks' ? 0 : card.spec.model.layers
}

/** What the GPU lane charges for a step of `work`, and the per-sequence host work the card puts on the CPU lane. */
export function gpuCost(card: GpuCard, work: GpuWork): GpuCost {
  if (card.kind === 'ticks') return { gpuUs: card.forwardUs + (work.prefillSeqs > 0 ? card.admitUs : 0), hostSeqUs: null }
  const load: StepLoad = { seqs: work.seqs, tokens: work.tokens, kvTokens: work.kvTokens, attnPairs: work.attnPairs }
  if (card.hostTerm === 'in-gpu') return { gpuUs: stepCard(card.spec, card.tp, load).us, hostSeqUs: 0 }
  const split = stepSplit(card.spec, card.tp, load)
  return { gpuUs: split.gpuUs, hostSeqUs: split.hostSeqUs }
}
