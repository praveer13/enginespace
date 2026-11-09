// The two cost cards on S5's form (ARCHITECTURE §5.3, WORLD §2.11): kernelspace's S5 step card on one of its three fitted rows
// (`s5Card`), and the small-model napkin card of TR2's levels (`SMALL_CARD`). `./cards` holds the front page's tick card and what every
// run reads of a card, and says why these two live apart from it: the fitted rows that `s5Card` reads are no part of a page that runs
// only the ticks (D-059). The barrel re-exports both files.

import { napkinSpec } from '../physics/card'
import { physicsRow } from '../physics/rows'
import type { PhysicsRowKey } from '../physics/rows'
import type { NapkinGpuCard, S5GpuCard, S5HostTerm } from './types'

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

/**
 * The "small model" card of TR2's levels (WORLD §2.11, GAMES.md §3.2; W1-T13): S5's form at the datasheet bound, `NAPKIN`, on a small
 * model and a 24 GB card. S5 has no small-model row, so this is a napkin and not a fit, and a world of the model's own: every shape is a
 * round figure [estimated], and its screens say synthetic (D-012). A model of 0.6e9 parameters in 28 layers of width 1,024, with
 * 16-bit weights (1.2e9 bytes [derived]) and a 16-bit K and V for every layer (2 · 28 · 1,024 · 2 = 114,688 bytes a token [derived]),
 * on a card that reads 1e12 bytes and computes 1.6e14 operations a second, with 24e9 bytes. At these figures a decode step of 16 rows
 * over 256 tokens of context costs 1,670 µs [derived, tests/sim/steploop-cards.test.ts]: the forward of a small model is short enough
 * that the host's work per step is a large share of it, which is the regime TR2's levels need.
 */
export const SMALL_CARD: NapkinGpuCard = Object.freeze({
  kind: 'napkin',
  label: 'Small model on a 24 GB card · napkin (S5 at η = 1), synthetic',
  tag: 'estimated',
  synthetic: true,
  spec: Object.freeze(
    napkinSpec(
      Object.freeze({ bwBps: 1_000_000_000_000, peakFlops: 160_000_000_000_000, hbmBytes: 24_000_000_000 }),
      Object.freeze({ params: 600_000_000, layers: 28, hidden: 1024, kvBytesPerToken: 114_688, weightBytes: 1_200_000_000 }),
    ),
  ),
  tp: 1,
})
