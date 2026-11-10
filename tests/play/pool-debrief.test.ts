/*
 * W1-T23, the debrief of The Reach-In (GAMES.md §8 "Core loop": "Debrief with kernelspace's R(i) rule"; §2.1): the one sentence a run ends
 * on and the decision that mattered.
 *
 * kernelspace's rule: with R(i) = "the reference policy, taking over the learner's state before decision i, still reaches the bound", the
 * root cause is the latest learner decision d with R(d) true and R(d + 1) false. These tests hold the debrief to that definition, played
 * out through the session's own reducer, and hold its sentences to the kitchen's words: they carry no digit (the counters beside them are
 * Readouts that tag every number), and the places they name are tables that exist.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { drawInBand } from '@es/play'
import { naiveOf } from '@es/play/pool/bands'
import { engineBaseline, decisiveTurn, debriefOf } from '@es/play/pool/debrief'
import { POOL_LEVEL_IDS } from '@es/play/pool/types'
import type { PoolAction, PoolLevel, PoolState } from '@es/play/pool/types'
import { engine, blindLast, newest } from '@es/play/pool/policy'
import { poolReference, poolSession, slotBaseline, SHELF_SLOTS } from '@es/play/pool/session'
import { costOf, gradeOf, ratio, unservedOf } from '@es/play/pool/score'
import { bulk, houseActions, playThrough, practiceOf, stateAfter } from './pool-support'

// The debrief replays the house from every decision of a night, which takes a few seconds, and several on a loaded host.
setDefaultTimeout(120_000)

const S = poolSession

/** The price the house pays for the rest of a night from a state: the house takes over, through the reducer. */
function rest(state: PoolState): PoolState {
  let now = state
  while (!S.done(now)) {
    const ask = S.ask(now)
    if (ask === null) throw new Error('the night is not over, and nothing is asked')
    now = S.reduce(now, houseAnswer(now))
  }
  return now
}

/** The house's answer to the open ask of a state. */
const houseAnswer = (state: PoolState): PoolAction => poolReference(state, S.ask(state) as NonNullable<ReturnType<typeof S.ask>>)

/** R(i): from the state before decision `i` of the learner's log, the house still reaches the bar. */
function recovers(level: PoolLevel, log: readonly PoolAction[], i: number, ghost: PoolState): boolean {
  const end = rest(stateAfter(level, ...log.slice(0, i)))
  return unservedOf(end) === 0 && ratio(costOf(ghost.counts, level), costOf(end.counts, level)) >= level.bar
}

describe('the decision that mattered is kernelspace\'s: the latest decision after which the house could no longer pass', () => {
  for (const id of ['evict', 'adapters', 'manager'] as const) {
    test(`${id}: on 12 fresh seeds the engine's night names a decision d with R(d) true and R(d + 1) false, and no later decision does`, () => {
      let named = 0
      for (let entropy = 1; entropy <= 12; entropy++) {
        const level = S.level(id, drawInBand(S, id, entropy * 6151))
        const ghost = S.ghost(level)
        const mine = playThrough(level, naiveOf(level)).states.at(-1) as PoolState
        const log = mine.history
        const turn = decisiveTurn(mine, ghost)
        expect(S.grade(mine, ghost).ok).toBe(false)
        const before = Array.from({ length: log.length + 1 }, (_, i) => recovers(level, log, i, ghost))
        if (turn === null) {
          // No decision cost the bar by itself: there is none that the rule would name.
          for (let d = 0; d < log.length; d++) expect(before[d] && !before[d + 1] && log[d].t !== 'commit').toBe(false)
          continue
        }
        named += 1
        expect([id, entropy, before[turn], before[turn + 1]]).toEqual([id, entropy, true, false])
        for (let later = turn + 1; later < log.length; later++) expect(before[later] && !before[later + 1]).toBe(false)
        // The sentence names it, and carries the place of the decision for the page to number.
        const debrief = debriefOf(mine, ghost)
        expect(debrief.names).toEqual({ turn })
      }
      expect(named).toBeGreaterThan(6)
    })
  }

  test('a prediction in the log is no decision: it is never the decision that mattered, and the place shifts by one', () => {
    const level = practiceOf('evict')
    const ghost = S.ghost(level)
    const plain = playThrough(level, engine).actions
    const mineA = stateAfter(level, ...plain)
    const mineB = stateAfter(level, { t: 'commit', prediction: 3 }, ...plain)
    const a = decisiveTurn(mineA, ghost)
    const b = decisiveTurn(mineB, ghost)
    expect(a).not.toBeNull()
    expect(b).toBe((a as number) + 1)
    expect(mineB.history[b as number].t).not.toBe('commit')
  })

  test('the house\'s own night has none, and a night that only matches it is not a loss to explain', () => {
    for (const id of ['evict', 'adapters'] as const) {
      const level = practiceOf(id)
      const ghost = S.ghost(level)
      expect(decisiveTurn(ghost, ghost)).toBeNull()
      expect(debriefOf(ghost, ghost).names).toBeNull()
    }
  })
})

describe('the sentences are the kitchen\'s words, and carry no number', () => {
  test('a night that passes says so, with no digit and no decision', () => {
    for (const id of POOL_LEVEL_IDS) {
      const level = practiceOf(id)
      const ghost = S.ghost(level)
      const debrief = debriefOf(ghost, ghost)
      expect([id, debrief.names]).toEqual([id, null])
      expect(debrief.sentence).toMatch(/kept pace with the house|paid less than the house/)
      expect([id, /\d/.test(debrief.sentence)]).toEqual([id, false])
    }
  })

  test('a night that paid more says what the learner did, at a table that exists, with no digit, whoever played it', () => {
    const seen = new Set<string>()
    for (const id of POOL_LEVEL_IDS) {
      for (let entropy = 1; entropy <= 10; entropy++) {
        const level = S.level(id, drawInBand(S, id, entropy * 9973))
        const ghost = S.ghost(level)
        for (const policy of [engine, blindLast, newest]) {
          const mine = playThrough(level, policy).states.at(-1) as PoolState
          if (S.grade(mine, ghost).ok) continue
          const { sentence, names } = debriefOf(mine, ghost)
          expect(/\d/.test(sentence)).toBe(false)
          expect(sentence.length).toBeGreaterThan(60)
          const letters = [...sentence.matchAll(/table ([A-Z])/g)].map((match) => match[1])
          for (const letter of letters) expect(level.tables.map((table) => table.letter)).toContain(letter)
          if (names !== null) {
            // The debrief's type is every game's: Pool names a turn, and a lever would fail the first line.
            const { turn } = names as { readonly turn: number }
            expect(Number.isInteger(turn)).toBe(true)
            expect(turn).toBeGreaterThanOrEqual(0)
            expect(turn).toBeLessThan(mine.history.length)
            seen.add(sentence.replace(/table [A-Z]/g, 'table X').slice(0, 40))
          }
        }
      }
    }
    // The causes differ: the debrief is not one sentence for every loss.
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })

  test('a night that ends with tickets unserved says the line has to keep moving, and names no decision', () => {
    const level = practiceOf('evict')
    const ghost = S.ghost(level)
    const idle = playThrough(level, () => ({ t: 'admit', req: null })).states.at(-1) as PoolState
    const debrief = debriefOf(idle, ghost)
    expect(debrief.names).toBeNull()
    expect(debrief.sentence).toContain('unserved')
    expect(debrief.sentence).toContain('The line has to keep moving')
    expect(/\d/.test(debrief.sentence)).toBe(false)
  })

  test('the sentence for a given log is the same every time', () => {
    const level = practiceOf('manager')
    const ghost = S.ghost(level)
    const mine = playThrough(level, engine).states.at(-1) as PoolState
    expect(debriefOf(mine, ghost)).toEqual(debriefOf(mine, ghost))
  })
})

describe('the comparisons the debrief sets beside a night', () => {
  test('the engine\'s pool is the engine\'s policy played out: its counts, its price and its unserved tickets', () => {
    for (const id of POOL_LEVEL_IDS) {
      const level = practiceOf(id)
      const baseline = engineBaseline(level)
      const played = bulk(level, engine, true)
      expect(baseline.recomputedTokens).toBe(played.counts.recomputedTokens)
      expect(baseline.hitTokens).toBe(played.counts.hitTokens)
      expect(baseline.evictions).toBe(played.mgr.removed)
      expect(baseline.cost).toBe(costOf(played.counts, level))
      expect(baseline.unserved).toBe(unservedOf(played))
    }
  })

  test('the engine\'s pool pays more than the house on a fair seed, which is why the debrief shows it', () => {
    for (const id of POOL_LEVEL_IDS) {
      const level = S.level(id, drawInBand(S, id, 31337))
      const ghost = S.ghost(level)
      const baseline = engineBaseline(level)
      expect(baseline.cost).toBeGreaterThanOrEqual(S.score(ghost).cost)
    }
  })

  test('a shelf of fixed slots spends no pans on a kit, holds fewer kits, and is the same night otherwise (D-042)', () => {
    expect(SHELF_SLOTS).toBe(1)
    for (const id of ['adapters', 'manager'] as const) {
      const level = practiceOf(id)
      const shelf = slotBaseline(level)
      const pool = S.score(S.ghost(level))
      expect(shelf.completed).toBeGreaterThan(0)
      expect(shelf.completed + shelf.unserved).toBe(level.reqs.length)
      // One kit at a time on the shelf means a ticket waits for its kit more often than where a pool holds both.
      expect(shelf.adapterStallSteps).toBeGreaterThanOrEqual(pool.adapterStallSteps)
      expect(slotBaseline(level)).toEqual(shelf)
    }
  })

  test('the grade of the house\'s own log is 1, and the grade is the price over the house\'s, whatever the order of a log', () => {
    const level = practiceOf('evict')
    const ghost = S.ghost(level)
    const mine = stateAfter(level, ...houseActions(level))
    expect(gradeOf(mine, ghost)).toEqual({ score: 1, ok: true })
    expect(S.grade(mine, ghost)).toEqual({ score: 1, ok: true })
  })
})
