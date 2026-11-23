/*
 * The two lines of "Defend your receipt" that say what an attempt is worth (ASSESSMENT §7.3): before it, and under its result. Defend.tsx draws them,
 * and a test reads them for each standing and window.
 */
import type { Marked } from '@es/sim/defend/tr0'
import type { ProveStake } from '@/prove/window'
import { DEFEND_COPY } from './copy'
import type { Standing } from './standing'

export interface Done {
  readonly marked: Marked
  readonly answers: readonly (readonly number[] | null)[]
  readonly at: number
  /** Whether it counted (a verified receipt, outside the window); whether anything was written at all is `standing`'s. */
  readonly counted: boolean
  /** Why the ledger did not take it, when it was written and refused. */
  readonly problem: string | null
}

/** The line that says what an attempt made now is worth. */
export function stakeLine(standing: Standing, stake: ProveStake | null, when: string | null): string {
  if (standing.kind === 'practice') return standing.why === 'synthetic' ? DEFEND_COPY.synthetic : DEFEND_COPY.unverified
  if (stake === null) return DEFEND_COPY.reading
  if (stake.counts || when === null) return DEFEND_COPY.counts
  return stake.last?.ok === false ? DEFEND_COPY.waitMissed(when) : DEFEND_COPY.waitPassed(when)
}

/** The line under a result: what the attempt was worth, and when the next one that counts opens. */
export function afterLine(standing: Standing, done: Done, when: string | null): string {
  if (standing.kind === 'practice') return standing.why === 'synthetic' ? DEFEND_COPY.practiceSynthetic : DEFEND_COPY.practiceNothing
  const words = when ?? ''
  if (done.counted) return done.marked.ok ? DEFEND_COPY.proved(words) : DEFEND_COPY.missed(words)
  return when === null ? DEFEND_COPY.practiceOpen : DEFEND_COPY.practice(words)
}
