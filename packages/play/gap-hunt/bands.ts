/**
 * The band of each level (GAMES.md §2.1, §6): which seeds make a fair question.
 *
 * The model draws every case from steps that are in its own band (`packages/sim/trace/hunt.ts`: the largest gap at least 1.5 times the second,
 * one main-thread span covering at least 60% of its lead-in, the window's non-kernel ns at least 10%, at most 12 segments), so a seed is fair
 * when the draw found its cases and the reference, played through the session's own reducer, passes every one. tests/play/gap-hunt-levels.test.ts
 * holds both on the seeds the gate reads and prints the share kept against §2.1's floor of 20%.
 */
import type { Seed } from '@es/sim/core'
import { buildLevel, isLevelId } from './levels'

/** Answers already worked out. A seed's answer never changes, and the gate asks for the same few hundred seeds again and again. */
const known = new Map<string, boolean>()

/** Most answers kept: far more than the gate asks for. */
const KEPT = 4096

/** Whether `seed` makes `id` a fair question. */
export function inLevelBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`Trace attribution has no level "${id}"`)
  const key = `${id}/${seed}`
  let answer = known.get(key)
  if (answer === undefined) {
    try {
      buildLevel(id, seed)
      answer = true
    } catch {
      // A draw that found no case in the model's band is a seed that is not fair.
      answer = false
    }
    if (known.size >= KEPT) known.clear()
    known.set(key, answer)
  }
  return answer
}
