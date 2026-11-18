/*
 * W2-T08, rule 7, the correctness re-checks the browser can run (ARCHITECTURE §8.5 rule 7, ASSESSMENT §5.7 and §5.8; D-046):
 *
 *   identity-tally     the tie-aware identity of D-046 re-tallied from per-sequence results: every sequence identical or tied at the first mismatch, at most 5% tied
 *   acceptance-counts  accepted never above proposed, tokens out = accepted + bonus, and a claimed acceptance equal to the totals
 *   argmax-bank        TR0's argmax ids at the positions of the owner's pinned bank
 *
 * Each passes on an honest artifact and fails on the smallest edit that breaks its rule, with the bound in the sentence. A re-check runs when the
 * receipt has the artifact it reads, whatever the stage, and fails when the stage requires it and there is none.
 */
import { describe, expect, test } from 'bun:test'
import { ACCEPTANCE_FORMAT, ARGMAX_FORMAT, IDENTITY_FORMAT, NEAR_TIE_MILLI, TIE_SHARE_PERMILLE } from '@es/verify'
import { sha256 } from '../schema/receipt-support'
import { edited, replayFixture } from './synthetic'
import type { Fixture } from './synthetic'
import { checkOf, verify } from './run'

/** The honest replay with one more artifact, written and hashed: a re-check reads it by its kind and format. */
function withArtifact(id: string, kind: 'outputs' | 'counts', format: string, data: object, banks: Fixture['context']['banks'] = {}): Fixture {
  const fixture = edited(replayFixture(), (bundle) => {
    bundle.receipt.artifacts.push({ id, kind, format, sha256: sha256('x'), bytes: 1, inBundle: true })
    bundle.artifacts[id] = { encoding: 'json', data }
  })
  return { ...fixture, context: { ...fixture.context, banks } }
}
const run = async (fixture: Fixture) => verify(fixture.bundle, fixture.context)

const identity = (first: number[], gapMilli: number[]) => ({ schema: IDENTITY_FORMAT, sequences: { first, gapMilli } })

describe('identity-tally (D-046)', () => {
  const same = (n: number) => Array.from({ length: n }, () => -1)

  test('passes sequences that are all identical, and prints the tally', async () => {
    const outcome = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity(same(40), same(40))))
    expect(checkOf(outcome, 'identity-tally')).toEqual({
      id: 'identity-tally',
      status: 'pass',
      bound: '40 sequences: 40 identical, 0 tie-diverged (a first mismatch at a gap of at most 0.05 nats [estimated]) and 0 diverged; none diverged, and the tie-diverged are within 5% [estimated].',
    })
  })

  test('passes a few sequences that differ at a near tie: a gap of 0.05 nats or less, and not more than 5% of them', async () => {
    const first = same(40)
    const gap = same(40)
    first[7] = 12
    gap[7] = NEAR_TIE_MILLI
    first[9] = 3
    gap[9] = 1
    const outcome = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity(first, gap)))
    expect(checkOf(outcome, 'identity-tally')?.status).toBe('pass')
    expect(checkOf(outcome, 'identity-tally')?.bound).toContain('38 identical, 2 tie-diverged')
    expect(TIE_SHARE_PERMILLE).toBe(50)
  })

  test('fails a sequence that differs where the gap is larger than a near tie: a different token that the model had a reason for', async () => {
    const first = same(40)
    const gap = same(40)
    first[7] = 12
    gap[7] = NEAR_TIE_MILLI + 1
    const outcome = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity(first, gap)))
    expect(checkOf(outcome, 'identity-tally')?.status).toBe('fail')
    expect(checkOf(outcome, 'identity-tally')?.bound).toBe(
      '40 sequences: 39 identical, 0 tie-diverged (a first mismatch at a gap of at most 0.05 nats [estimated]) and 1 diverged; a sequence that differs at more than a near tie fails.',
    )
  })

  test('fails when more than 5% of the sequences are tied: three of forty', async () => {
    const first = same(40)
    const gap = same(40)
    for (const at of [1, 2, 3]) {
      first[at] = 5
      gap[at] = 10
    }
    const outcome = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity(first, gap)))
    expect(checkOf(outcome, 'identity-tally')?.bound).toContain('3 tie-diverged')
    expect(checkOf(outcome, 'identity-tally')?.bound).toContain('at most 5% [estimated] may tie-diverge.')
  })

  test('is not made of a mismatch with no gap, or a gap with no mismatch, nor of a position below 0: the reader refuses the artifact, and says which row', async () => {
    const first = same(3)
    const gap = same(3)
    first[1] = 4
    const outcome = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity(first, gap)))
    expect(checkOf(outcome, 'identity-tally')?.bound).toBe('The artifact "identity" could not be read: sequences[1] has a gap exactly when it has a first mismatch.')
  })

  test('is left out when the receipt has no comparison, and does nothing for a stage that does not ask for it', async () => {
    expect(checkOf(await run(replayFixture()), 'identity-tally')).toBeUndefined()
  })
})

describe('acceptance-counts', () => {
  const rounds = (proposed: number[], accepted: number[], bonus: number[], emitted: number[]) => ({ schema: ACCEPTANCE_FORMAT, rounds: { proposed, accepted, bonus, emitted } })

  test('passes counts in which accepted never passes proposed and tokens out are accepted plus the bonus', async () => {
    const outcome = await run(withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([4, 4, 4], [4, 2, 0], [1, 1, 1], [5, 3, 1])))
    expect(checkOf(outcome, 'acceptance-counts')).toEqual({
      id: 'acceptance-counts',
      status: 'pass',
      bound: '1 artifact: in every round accepted ≤ proposed and tokens out = accepted + bonus, and any claimed acceptance equals the totals.',
    })
  })

  test('fails a round that accepted more than was proposed', async () => {
    const outcome = await run(withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([4, 4], [4, 5], [1, 1], [5, 6])))
    expect(checkOf(outcome, 'acceptance-counts')?.bound).toBe('Round 1 accepted 5 of 4 proposed: accepted tokens never exceed proposed ones.')
  })

  test('fails a round whose tokens out are not accepted plus the bonus', async () => {
    const outcome = await run(withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([4, 4], [4, 2], [1, 1], [5, 4])))
    expect(checkOf(outcome, 'acceptance-counts')?.bound).toBe('Round 1 emitted 4 tokens, and its 2 accepted plus 1 bonus make 3.')
  })

  test('fails a claimed acceptance that is not the totals: a rate typed in', async () => {
    const fixture = withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([4, 4, 4], [4, 2, 0], [1, 1, 1], [5, 3, 1]))
    const claimed = edited(fixture, (bundle) => {
      const performance = bundle.receipt.performance
      if (performance !== undefined) performance.claimed.acceptance = { rounds: 3, proposed: 12, accepted: 6, ratePermille: 900 }
    })
    const outcome = await run({ ...claimed, context: fixture.context })
    expect(checkOf(outcome, 'acceptance-counts')?.bound).toBe('acceptance.ratePermille: the receipt claims 900 and the rows give 500, recomputed from the raw counts of 3 rounds.')
    const honest = edited(fixture, (bundle) => {
      const performance = bundle.receipt.performance
      if (performance !== undefined) performance.claimed.acceptance = { rounds: 3, proposed: 12, accepted: 6, ratePermille: 500 }
    })
    expect(checkOf(await run({ ...honest, context: fixture.context }), 'acceptance-counts')?.status).toBe('pass')
  })

  test('fails a negative count, which no round has', async () => {
    const outcome = await run(withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([4], [-1], [1], [0])))
    expect(checkOf(outcome, 'acceptance-counts')?.bound).toBe('Round 0 has a negative count.')
  })
})

describe('argmax-bank (TR0)', () => {
  const argmax = (positions: number[], ids: number[]) => ({ schema: ARGMAX_FORMAT, positions, ids })
  const bank = { positions: [3, 9, 27], ids: [101, 202, 303] }

  test('passes the ids of the bank at its positions, and any other position the receipt gives is not held', async () => {
    const fixture = withArtifact('argmax', 'outputs', ARGMAX_FORMAT, argmax([1, 3, 9, 27, 40], [7, 101, 202, 303, 8]), { 'tr8.replay.s2': bank })
    expect(checkOf(await run(fixture), 'argmax-bank')).toEqual({ id: 'argmax-bank', status: 'pass', bound: 'All 3 banked positions have the pinned bank\'s argmax token.' })
  })

  test('fails an id that is not the bank\'s, and names the position', async () => {
    const fixture = withArtifact('argmax', 'outputs', ARGMAX_FORMAT, argmax([3, 9, 27], [101, 999, 303]), { 'tr8.replay.s2': bank })
    expect(checkOf(await run(fixture), 'argmax-bank')?.bound).toBe("Position 9: the receipt's argmax is token 999, and the pinned bank has 202 (every banked position must agree).")
  })

  test('fails a position of the bank that the receipt leaves out', async () => {
    const fixture = withArtifact('argmax', 'outputs', ARGMAX_FORMAT, argmax([3, 9], [101, 202]), { 'tr8.replay.s2': bank })
    expect(checkOf(await run(fixture), 'argmax-bank')?.bound).toBe('Position 27 of the bank is not among the 2 positions the receipt gives.')
  })

  test('fails when the site holds no bank for the stage, and says whose recording it waits for', async () => {
    const fixture = withArtifact('argmax', 'outputs', ARGMAX_FORMAT, argmax([3], [101]))
    expect(checkOf(await run(fixture), 'argmax-bank')?.bound).toBe('This site holds no argmax bank for tr8.replay.s2 yet, so the ids cannot be compared.')
  })
})

describe('a re-check over nothing is not a pass (the review of W2\'s grader track)', () => {
  const rounds = (proposed: number[], accepted: number[], bonus: number[], emitted: number[]) => ({ schema: ACCEPTANCE_FORMAT, rounds: { proposed, accepted, bonus, emitted } })

  test('identity-tally fails an artifact with no sequence: an identity over no sequence is no identity', async () => {
    const outcome = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity([], [])))
    expect(checkOf(outcome, 'identity-tally')).toEqual({
      id: 'identity-tally',
      status: 'fail',
      bound: 'The artifact "identity" holds no sequence, so no run was compared with another: an identity over no sequence is no identity.',
    })
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
  })

  test('acceptance-counts fails an artifact with no round, though no round broke a rule, and names the artifact', async () => {
    const outcome = await run(withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([], [], [], [])))
    expect(checkOf(outcome, 'acceptance-counts')).toEqual({
      id: 'acceptance-counts',
      status: 'fail',
      bound: 'The artifact "acceptance" holds no round of speculation, so there is nothing to count: accepted ≤ proposed and tokens out = accepted + bonus say nothing about no round.',
    })
  })

  test('fails when one artifact of two is empty, since the other\'s rounds do not make up for it', async () => {
    const fixture = edited(withArtifact('first', 'counts', ACCEPTANCE_FORMAT, rounds([4], [2], [1], [3])), (bundle) => {
      bundle.receipt.artifacts.push({ id: 'second', kind: 'counts', format: ACCEPTANCE_FORMAT, sha256: sha256('x'), bytes: 1, inBundle: true })
      bundle.artifacts.second = { encoding: 'json', data: rounds([], [], [], []) }
    })
    const outcome = await run({ ...fixture, context: { ...fixture.context, banks: {} } })
    expect(checkOf(outcome, 'acceptance-counts')?.bound).toContain('The artifact "second" holds no round of speculation')
  })

  test('still passes a single round: one is something to count', async () => {
    const outcome = await run(withArtifact('acceptance', 'counts', ACCEPTANCE_FORMAT, rounds([4], [0], [1], [1])))
    expect(checkOf(outcome, 'acceptance-counts')?.status).toBe('pass')
    const one = await run(withArtifact('identity', 'outputs', IDENTITY_FORMAT, identity([-1], [-1])))
    expect(checkOf(one, 'identity-tally')?.status).toBe('pass')
  })

  test('argmax-bank fails a bank that holds no position, which every id would agree with', async () => {
    const fixture = withArtifact('argmax', 'outputs', ARGMAX_FORMAT, { schema: ARGMAX_FORMAT, positions: [3], ids: [101] }, { 'tr8.replay.s2': { positions: [], ids: [] } })
    expect(checkOf(await run(fixture), 'argmax-bank')?.bound).toBe("This site's argmax bank for tr8.replay.s2 holds no position, so the ids cannot be compared: every id agrees with a bank of nothing.")
  })
})

describe('an artifact of rule 7 that cannot be read', () => {
  test('fails with the first thing wrong with it, whichever re-check reads it', async () => {
    const cases: [string, string, object, RegExp][] = [
      ['acceptance-counts', ACCEPTANCE_FORMAT, { schema: ACCEPTANCE_FORMAT, rounds: { proposed: [1], accepted: [1], bonus: [1] } }, /rounds has no field "emitted"/],
      ['acceptance-counts', ACCEPTANCE_FORMAT, { schema: ACCEPTANCE_FORMAT, extra: 1, rounds: {} }, /it has a field "extra"/],
      ['acceptance-counts', ACCEPTANCE_FORMAT, { schema: 'enginespace/acceptance@2', rounds: {} }, /its schema is "enginespace\/acceptance@2"/],
      ['acceptance-counts', ACCEPTANCE_FORMAT, { schema: ACCEPTANCE_FORMAT, rounds: { proposed: [1.5], accepted: [1], bonus: [1], emitted: [2] } }, /rounds\.proposed\[0\] is not an integer below 2\^53/],
    ]
    for (const [id, format, data, expected] of cases) {
      const outcome = await run(withArtifact('counts', 'counts', format, data))
      expect(checkOf(outcome, id)?.status).toBe('fail')
      expect(checkOf(outcome, id)?.bound).toMatch(expected)
    }
  })
})
