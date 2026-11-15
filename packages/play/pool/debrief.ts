/**
 * KV page pool's debrief (GAMES.md §2.1, §8 "Core loop": "Debrief with kernelspace's R(i) rule"): one sentence that says what the run did,
 * and the decision that mattered.
 *
 * kernelspace's rule: with R(i) = "the reference policy, taking over the learner's state before decision i, still reaches the bound", the
 * root cause is the latest learner decision d with R(d) true and R(d + 1) false. So the debrief replays the learner's log, and at every
 * decision lets the reference take over and play the run out; the last decision after which the reference could still pass, and before
 * which it no longer could, is the one that cost the run its bar. The sentences are display copy in the engine's words (REDESIGN §2.7)
 * and carry no digit: the counts beside them are Readouts that tag every number, and the log's place of the decision is `names.turn`.
 * Rewording one moves no state hash: the debrief is read from a finished run and is never part of a state.
 */
import type { Debrief } from '../types'
import { advance, applyAction, copyWork, freshWork, playPolicy } from './engine'
import type { PoolWork } from './engine'
import { engine, house, priceOf } from './policy'
import { costOf, gradeOf, ratio, unservedOf } from './score'
import type { PoolAction, PoolCounts, PoolLevel, PoolState } from './types'

/** The reference's cost for this run. */
const houseCost = (ghost: PoolState): number => costOf(ghost.counts, ghost.level)

/** Whether the reference, taking over from `w`, still passes. */
function recovers(w: PoolWork, ghost: PoolState): boolean {
  const rest = playPolicy(copyWork(w), house)
  return unservedOf(rest) === 0 && ratio(houseCost(ghost), costOf(rest.counts, rest.level)) >= rest.level.bar
}

/** The place in the log of the decision after which the reference could no longer pass, or null when the log has none. */
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

/** The letters of the conversations behind some requests, in order, without repeats: `A`, `A and C`, `A, B and C`. */
function tablesOf(w: PoolWork, tickets: readonly number[]): string {
  const letters = tickets
    .map((id) => w.level.tables[w.level.reqs[id].table].letter)
    .filter((letter, at, all) => all.indexOf(letter) === at)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (letters.length <= 1) return letters.join('')
  return `${letters.slice(0, -1).join(', ')} and ${letters[letters.length - 1]}`
}

/** What the decisive decision was, in a sentence that names the conversations and not the numbers. */
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
        return `You evicted pages that a waiting request of conversation ${tablesOf(w, waiting)} was going to reuse. A prefix hit counts only as far as every KV group still holds its pages, so that request reused less and recomputed the rest. The reference evicts the cheapest pages, and these were not.`
      }
      if (returning.length > 0) {
        return `You evicted pages that conversation ${tablesOf(w, returning)} would reuse on its next turn. The conversation was still open, and the reference keeps an open conversation's pages before it evicts the free queue's next.`
      }
      return "You evicted pages the reference would have kept. The ones it keeps are the head of a conversation's prefix, which every later hit starts from, and the pages a waiting request reuses."
    }
    case 'admit': {
      if (action.req === null) {
        return 'You admitted no request while one fitted. The batch ran with a slot empty, and the running requests went on taking pages from the free queue, including the ones the waiting requests would have reused.'
      }
      const letter = w.level.tables[w.level.reqs[action.req].table].letter
      return `You admitted conversation ${letter}'s request before the request whose prefix the pool already held the most of. Admitted first, that request would have pinned its pages; instead the room for the next request came out of them.`
    }
    case 'preempt': {
      const letter = w.level.tables[w.level.reqs[action.req].table].letter
      return `You preempted conversation ${letter}'s request. The batch could not grow, and the reference preempts the request admitted last, which has decoded the least. The pages of the request you preempted went back to the free queue, and the batch paid to recompute them.`
    }
    case 'prefetch': {
      if (action.adapter === null) {
        return 'You loaded no adapter while a request waited for one. An adapter takes a few steps to load, so every step you waited was a step the batch ran beside a request that could not be admitted.'
      }
      return 'You loaded an adapter the waiting queue did not need first. An adapter takes a few steps to load and takes its pages from the same pool, so the request at the head of the queue waited, and the cached pages paid for the adapter.'
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
        'The run ended with requests unserved. The batch has to keep moving: admit a request whenever one fits, because a step with an empty slot is a step wasted, and the run has only so many steps.',
      names: null,
    }
  }
  if (grade.ok) {
    return {
      sentence:
        costOf(mine.counts, mine.level) < houseCost(ghost)
          ? 'You paid less than the reference. You kept pages that it would have evicted, and the tokens it would have recomputed stayed prefix hits.'
          : "You matched the reference. The pages that waiting requests would reuse stayed in the pool, the head of each conversation outlived its tail, and the rest went in the free queue's order.",
      names: null,
    }
  }
  const turn = decisiveTurn(mine, ghost)
  if (turn === null) {
    return { sentence: 'The run cost more than the reference, and no single decision made the difference. The counts beside this say where the tokens went.', names: null }
  }
  return { sentence: causeOf(mine, turn), names: { turn } }
}

/** The counts of a run played by a policy, with the requests it left unserved. */
export interface Baseline extends PoolCounts {
  readonly cost: number
  readonly unserved: number
}

/** What the engine's own pool, first come first served and the free queue's order, pays on this level and seed. For the debrief's comparison. */
export function engineBaseline(level: PoolLevel): Baseline {
  const w = playPolicy(freshWork(level, true), engine)
  return { ...w.counts, evictions: w.mgr.removed, cost: costOf(w.counts, level), unserved: unservedOf(w) }
}
