/*
 * Type shim for src/lib/learner/fsrs.ts, which imports `MemoryState` and `Rating` from '@/lib/learner/types'.
 *
 * That module is kernelspace's whole learner model (cards, sessions, tickets, placement), and enginespace inherits
 * none of it. These two declarations are copied from kernelspace's src/lib/learner/types.ts at d478f91, character for
 * character, and `bun scripts/vendor-drift.ts diff <sha>` compares them with the same declarations in a newer commit.
 * The wrapper maps the specifier to this file (VENDOR.md, "Type shims").
 */

/** FSRS grade: Again, Hard, Good, Easy. */
export type Rating = 1 | 2 | 3 | 4

/** FSRS-6 memory state. `stability` in days (the interval at which R = 0.9), `difficulty` in [1, 10]. */
export interface MemoryState {
  stability: number
  difficulty: number
}
