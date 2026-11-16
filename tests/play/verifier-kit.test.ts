/*
 * What the rejection sampler gives the instrument frame (R-T30; REDESIGN §2.6): its parts on a level, its first run, the move the dock's
 * Step takes, and the one named moment, where the draws of 10, 100 and 1,000 settle on the overlap. Pure: the frame's own behaviour is
 * tests/play/frame.test.ts's and tests/play/intro.test.ts's, and the browser's is e2e/verifier.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { SETTLED_ROUNDS, VERIFIER_MOMENTS, firstMoveOf, lookLine, moveWords, partsOf } from '@es/play/verifier/copy'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierGhost, verifierReduce, verifierSession } from '@es/play/verifier/session'
import type { VerifierAction, VerifierLevelId } from '@es/play/verifier/types'
import { introSteps } from '@/games/kit/first-move'
import { partRows, verifierKit, verifierStep } from '@/games/verifier/kit'
import { PRACTICE, houseActions, stateAfter } from './verifier-support'

const S = verifierSession

describe('the first run on every level', () => {
  test('the parts are the level\'s own rows, in the list\'s order, and the kit reads the same rows as the table', () => {
    for (const [id] of PRACTICE) {
      const kit = verifierKit(id)
      expect(kit.parts.map((part) => part.id)).toEqual(partsOf(id).map((part) => part.id))
      expect(kit.parts).toEqual(partRows(id))
      expect(kit.levelParts?.(id)).toEqual(partsOf(id).map((part) => part.id))
    }
  })

  test('the order is the parts, a look at one token\'s bars, the level\'s own ask, and then play', () => {
    for (const [id, seed] of PRACTICE) {
      const kit = verifierKit(id)
      const view = S.view(stateAfter(buildLevel(id, seed)))
      expect(kit.firstAsk).toBe('required')
      const look = kit.look?.(view) ?? null
      expect([id, look !== null]).toEqual([id, id !== 'gamma'])
      expect(introSteps(kit.firstAsk, look !== null)).toEqual(look === null ? ['parts', 'ask', 'point'] : ['parts', 'look', 'ask', 'point'])
      if (look !== null) {
        expect(look.label).toBe('Token 0')
        expect(look.detail).toMatch(/^Token 0: the target gives it \d+ of 64/)
      }
      expect(kit.askOpen?.(view)).toBe(true)
      expect(kit.askWords?.(view)).toBeTruthy()
    }
  })

  test('the look holds the two shares of the token, and never the overlap, which is the answer', () => {
    for (const id of ['overlap', 'chain'] as const) {
      const view = S.view(stateAfter(buildLevel(id, id === 'chain' ? 1 : 0)))
      const line = lookLine(view, 0) ?? ''
      expect(line).toContain(`${view.rows[0].p[0]} of 64`)
      expect(line).toContain(`${view.rows[0].q?.[0]} of 64`)
      expect(line).not.toMatch(/α|alpha|overlap/)
    }
  })

  test('the ask is answered by a commit on `overlap` and `chain`, by the temperature-0 answer on `greedy-ngram`, and by nothing else', () => {
    const answers = (id: VerifierLevelId, action: VerifierAction) => verifierKit(id).isAsk?.(action)
    expect(answers('overlap', { t: 'commit', prediction: 3 })).toBe(true)
    expect(answers('chain', { t: 'commit', prediction: 2000 })).toBe(true)
    expect(answers('greedy-ngram', { t: 'judge', kept: true })).toBe(true)
    expect(answers('exact', { t: 'sculpt', token: 0, delta: 1 })).toBe(false)
    expect(answers('overlap', { t: 'draw', n: 10 })).toBe(false)
  })

  test('the pointed first move is legal on its level, and is never one of the reference\'s own actions that gives the answer away', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const move = firstMoveOf(id)
      expect(verifierKit(id).firstMove).toEqual(move)
      expect(verifierKit(id).firstMoveWords).toBe(moveWords(move))
      // Legal from the point where the level's own ask has been answered.
      const answered = id === 'overlap' || id === 'chain' ? stateAfter(level, houseActions(level)[0]) : id === 'greedy-ngram' ? stateAfter(level, houseActions(level)[0]) : stateAfter(level)
      expect(() => verifierReduce(answered, move)).not.toThrow()
      // The reference's actions are the answer: a commit of the exact overlap, the exact weights, the five bugs, the best length.
      expect(houseActions(level)).not.toContainEqual(move)
      expect(verifierKit(id).firstMoveKind).toBe('a first move that gives no answer away')
    }
  })

  test('its words name the move without a stop, since the intro goes on with a clause', () => {
    for (const [id] of PRACTICE) expect(verifierKit(id).firstMoveWords).not.toMatch(/[.,;:]$/)
  })
})

describe('the dock\'s Step', () => {
  test('waits for the level\'s own ask, then takes the first harmless move, and plays a level to its end with legal moves only', () => {
    for (const [id, seed] of PRACTICE) {
      let state = stateAfter(buildLevel(id, seed))
      const view = S.view(state)
      if (id === 'overlap' || id === 'chain' || id === 'greedy-ngram') {
        expect([id, verifierStep(view)]).toEqual([id, null])
        state = stateAfter(buildLevel(id, seed), ...houseActions(buildLevel(id, seed)).slice(0, 1))
      }
      for (let turns = 0; turns < 12; turns++) {
        const move = verifierStep(S.view(state))
        if (move === null) break
        state = verifierReduce(state, move)
      }
      expect(() => verifierGhost(buildLevel(id, seed))).not.toThrow()
    }
  })
})

describe('the draws settle on the overlap, and the moment is named once', () => {
  const moment = VERIFIER_MOMENTS.find((candidate) => candidate.id === 'draws-settle')

  test('a line is said when the rounds drawn reach a thousand, with the accepted share and the overlap', () => {
    const level = buildLevel('overlap', 0)
    const committed = stateAfter(level, { t: 'commit', prediction: 38 })
    const view = (...draws: number[]) => S.view(draws.reduce((state, n) => verifierReduce(state, { t: 'draw', n }), committed))
    const line = moment?.line(view(10, 100), view(10, 100, 1000)) ?? null
    expect(line).toMatch(/^After 1,110 rounds the accepted share is 0\.\d{3}, and the overlap of p and q is 19\/32\. The accepted share settles on the overlap: that is the acceptance rate α\.$/)
    expect(SETTLED_ROUNDS).toBe(1000)
  })

  test('and only then: not on a small batch, not once it was said, not before the prediction, not on another level', () => {
    const level = buildLevel('overlap', 0)
    const committed = stateAfter(level, { t: 'commit', prediction: 38 })
    const view = (...draws: number[]) => S.view(draws.reduce((state, n) => verifierReduce(state, { t: 'draw', n }), committed))
    expect(moment?.line(view(), view(10))).toBeNull()
    expect(moment?.line(view(10), view(10, 100))).toBeNull()
    expect(moment?.line(view(1000), view(1000, 1000))).toBeNull()
    const before = S.view(stateAfter(level))
    expect(moment?.line(before, before)).toBeNull()
    const exact = buildLevel('exact', 0)
    const e = (n: number) => S.view(stateAfter(exact, { t: 'preset', from: 'p' }, { t: 'draw', n }))
    expect(moment?.line(S.view(stateAfter(exact, { t: 'preset', from: 'p' })), e(1000))).toBeNull()
  })

  test('the kit places it beside the accepted share in the readout, and it is the only moment', () => {
    expect(VERIFIER_MOMENTS).toHaveLength(1)
    expect(verifierKit('overlap').moments).toHaveLength(1)
  })
})
