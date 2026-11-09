/**
 * The Reach-In's debrief (GAMES.md §2.1, §8 "Core loop": "Debrief with kernelspace's R(i) rule"): one sentence that says what the run did,
 * and the decision that mattered.
 *
 * kernelspace's rule: with R(i) = "the reference policy, taking over the learner's state before decision i, still reaches the bound", the
 * root cause is the latest learner decision d with R(d) true and R(d + 1) false. So the debrief replays the learner's log, and at every
 * decision lets the house take over and play the night out; the last decision after which the house could still pass, and before which
 * it no longer could, is the one that cost the run its bar. The sentences carry no digit: the counters beside them are Readouts that tag
 * every number, and the log's place of the decision is `names.turn`.
 */
import type { Debrief } from '../types'
import { advance, applyAction, copyWork, freshWork, playPolicy } from './engine'
import type { PoolWork } from './engine'
import { engine, house, priceOf } from './policy'
import { costOf, gradeOf, ratio, unservedOf } from './score'
import type { PoolAction, PoolCounts, PoolLevel, PoolState } from './types'

/** The house's price for this night. */
const houseCost = (ghost: PoolState): number => costOf(ghost.counts, ghost.level)

/** Whether the house, taking over from `w`, still passes. */
function recovers(w: PoolWork, ghost: PoolState): boolean {
  const rest = playPolicy(copyWork(w), house)
  return unservedOf(rest) === 0 && ratio(houseCost(ghost), costOf(rest.counts, rest.level)) >= rest.level.bar
}

/** The place in the log of the decision after which the house could no longer pass, or null when the log has none. */
export function decisiveTurn(mine: PoolState, ghost: PoolState): number | null {
  const actions = mine.history
  const w = freshWork(mine.level, true)
  advance(w)
  const before: boolean[] = []
  for (let i = 0; i <= actions.length; i++) {
    before.push(recovers(w, ghost))
    if (i < actions.length) {
      applyAction(w, actions[i])
      advance(w)
    }
  }
  for (let d = actions.length - 1; d >= 0; d--) {
    if (before[d] && !before[d + 1] && actions[d].t !== 'commit') return d
  }
  return null
}

/** The letters of the tables behind some tickets, in order, without repeats: `A`, `A and C`, `A, B and C`. */
function tablesOf(w: PoolWork, tickets: readonly number[]): string {
  const letters = tickets
    .map((id) => w.level.tables[w.level.reqs[id].table].letter)
    .filter((letter, at, all) => all.indexOf(letter) === at)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (letters.length <= 1) return letters.join('')
  return `${letters.slice(0, -1).join(', ')} and ${letters[letters.length - 1]}`
}

/** What the decisive decision was, in a sentence that names the tables and not the numbers. */
function causeOf(mine: PoolState, d: number): string {
  const w = freshWork(mine.level, true)
  advance(w)
  for (let i = 0; i < d; i++) {
    applyAction(w, mine.history[i])
    advance(w)
  }
  const action: PoolAction = mine.history[d]
  const ask = w.ask
  switch (action.t) {
    case 'evict': {
      if (ask === null || ask.kind !== 'evict') break
      const { price, soon, spoken, seated } = priceOf(w, ask.candidates, ask.for === 'admit' ? ask.target : null)
      const dumped = action.pages.map((page) => ask.candidates.indexOf(page))
      const waiting = dumped.flatMap((at) => (price[at] > 0 ? spoken[at] : []))
      const returning = dumped.flatMap((at) => (soon[at] > 0 ? seated[at] : []))
      if (waiting.length > 0) {
        return `You dumped pans that a waiting ticket of table ${tablesOf(w, waiting)} was going to start from. A hit counts only as far as every station still holds its pans, so that ticket started from less and prepped the rest again. The house dumps the cheapest pans, and these were not.`
      }
      if (returning.length > 0) {
        return `You dumped pans that table ${tablesOf(w, returning)} would start from when it ordered again. The table was still seated, and the house spares a seated table's pans before it dumps the rotation's next.`
      }
      return 'You dumped pans the house would have kept. The ones it keeps are the head of an order, which every later hit starts from, and what a waiting ticket stands on.'
    }
    case 'admit': {
      if (action.req === null) {
        return 'You hung nothing while a ticket could hang. The line rode with a clip empty, and the tickets still cooking went on taking pans from the rotation, including the ones the waiting tickets stood on.'
      }
      const letter = w.level.tables[w.level.reqs[action.req].table].letter
      return `You hung table ${letter}'s ticket before the ticket the reach-in already held the most of. Hung first, that ticket would have pinned its pans, and instead the room for the next ticket came out of them.`
    }
    case 'preempt': {
      const letter = w.level.tables[w.level.reqs[action.req].table].letter
      return `You pulled table ${letter}'s ticket. The line could not grow, and the house pulls the ticket hung last, which has cooked the least. The pans of the ticket you pulled went back to the rotation, and the line paid to prep them again.`
    }
    case 'prefetch': {
      if (action.adapter === null) {
        return 'You brought no kit in while a ticket waited for one. A kit lands in a few steps, so every step you waited was a step the line stood idle beside a ticket that could not hang.'
      }
      return 'You brought in a kit the waiting line did not need first. A kit lands in a few steps and takes its pans from the same reach-in, so the ticket at the head of the line waited, and the cached pans paid for the kit.'
    }
    default:
      break
  }
  return 'A decision here cost the run its bar.'
}

/** The sentence a run ends on, and the decision that mattered. */
export function debriefOf(mine: PoolState, ghost: PoolState): Debrief {
  const grade = gradeOf(mine, ghost)
  if (unservedOf(mine) > 0) {
    return {
      sentence:
        'The night ended with tickets unserved. The line has to keep moving: hang a ticket whenever one can hang, because a step in which nothing hangs is a step the clips ride empty, and the night has only so many steps.',
      names: null,
    }
  }
  if (grade.ok) {
    return {
      sentence:
        costOf(mine.counts, mine.level) < houseCost(ghost)
          ? 'You paid less than the house. You kept pans that it would have dumped, and the tokens it would have prepped again stayed shared mise.'
          : "You kept pace with the house. The pans that waiting tickets stood on stayed in the reach-in, the head of each order outlived its tail, and the rest went in the rotation's order.",
      names: null,
    }
  }
  const turn = decisiveTurn(mine, ghost)
  if (turn === null) {
    return { sentence: 'The night cost more than the house paid, and no single decision made the difference. The counters beside this say where the tokens went.', names: null }
  }
  return { sentence: causeOf(mine, turn), names: { turn } }
}

/** The counts of a night played by a policy, with the tickets it left unserved. */
export interface Baseline extends PoolCounts {
  readonly cost: number
  readonly unserved: number
}

/** What the engine's pool, first come first served and the rotation as it comes, pays on this level and seed. For the debrief's comparison. */
export function engineBaseline(level: PoolLevel): Baseline {
  const w = playPolicy(freshWork(level, true), engine)
  return { ...w.counts, evictions: w.mgr.removed, cost: costOf(w.counts, level), unserved: unservedOf(w) }
}
