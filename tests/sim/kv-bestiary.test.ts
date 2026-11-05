/*
 * The bestiary of the hybrid KV manager (ARCHITECTURE §5.10, TRACKER W1-T21, check 2; TR5a §5): each known-wrong manager must fail a
 * named check, and the reference must pass the same streams. tests/sim/kv-bestiary.ts lists the managers, each the reference with one
 * rule broken: a leaky free, a non-atomic admit, a window off by one, a double-counted adapter, a prefix hit that takes the union of the
 * groups in place of the intersection, an event published twice, and four more that move eviction order and the reset.
 */
import { describe, expect, test } from 'bun:test'
import { KV_CHECKS, KV_JUDGE_CHECKS, kvJudge, kvReference } from '../../packages/sim/kv'
import type { KvJudgement } from '../../packages/sim/kv'
import { BESTIARY } from './kv-bestiary'
import { opsOf, streamFor } from './kv-support'

const KNOWN = new Set<string>([...KV_CHECKS.map((c) => c.id), ...KV_JUDGE_CHECKS])

type Member = (typeof BESTIARY)[number]
const found = new Map<string, { seed: number; judgement: KvJudgement } | null>()

/** The first stream, among those that can show the fault, on which the member fails, with the judgement. Each member is run once. */
function firstCaught(member: Member): { seed: number; judgement: KvJudgement } | null {
  if (found.has(member.id)) return found.get(member.id) ?? null
  let result: { seed: number; judgement: KvJudgement } | null = null
  for (let seed = 0; seed < 80 && result === null; seed++) {
    const stream = streamFor(seed)
    if (!member.shows(stream.spec)) continue
    const judgement = kvJudge(stream.spec, opsOf(stream, 1500), member.make(stream.spec))
    if (judgement !== null) result = { seed, judgement }
  }
  found.set(member.id, result)
  return result
}

describe('the reference passes the streams the bestiary fails on', () => {
  test('on the first 40 seeds of the property streams, at 800 operations, with no check failing', () => {
    for (let seed = 0; seed < 40; seed++) {
      const stream = streamFor(seed)
      const judgement = kvJudge(stream.spec, opsOf(stream, 800), kvReference(stream.spec))
      expect([seed, judgement]).toEqual([seed, null])
    }
  }, 60_000)
})

describe('each known-wrong manager fails the check that names its fault', () => {
  test('there are the six that TR5a lists, and the checks they name are real ones', () => {
    for (const id of ['leaky-free', 'non-atomic-admit', 'window-off-by-one', 'double-counted', 'union-hit', 'published-twice']) {
      expect([id, BESTIARY.some((m) => m.id === id)]).toEqual([id, true])
    }
    for (const m of BESTIARY) expect([m.id, KNOWN.has(m.caughtBy)]).toEqual([m.id, true])
    expect(new Set(BESTIARY.map((m) => m.id)).size).toBe(BESTIARY.length)
  })

  for (const member of BESTIARY) {
    test(`${member.id}: ${member.title}, caught by ${member.caughtBy}`, () => {
      const caught = firstCaught(member)
      expect(caught).not.toBeNull()
      const { seed, judgement } = caught as { seed: number; judgement: KvJudgement }
      // The check that names the fault is among the ones that failed at the first operation that went wrong.
      const names = judgement.failures.map((f) => f.check)
      expect([member.id, seed, names.includes(member.caughtBy), names, judgement.failures[0].message]).toEqual([member.id, seed, true, names, judgement.failures[0].message])
    }, 60_000)
  }

  test('each is caught within a few hundred operations of its first fault, and says which operation and why', () => {
    for (const member of BESTIARY) {
      const caught = firstCaught(member)
      expect(caught).not.toBeNull()
      const { judgement } = caught as { seed: number; judgement: KvJudgement }
      expect(judgement.at).toBeGreaterThanOrEqual(0)
      expect(judgement.at).toBeLessThan(1500)
      expect(judgement.failures.length).toBeGreaterThan(0)
      for (const failure of judgement.failures) expect(failure.message.length).toBeGreaterThan(10)
    }
  }, 120_000)

  test('a right manager of the same spec passes every stream that catches a wrong one', () => {
    for (const member of BESTIARY) {
      const caught = firstCaught(member)
      const { seed } = caught as { seed: number; judgement: KvJudgement }
      const stream = streamFor(seed)
      expect([member.id, kvJudge(stream.spec, opsOf(stream, 1500), kvReference(stream.spec))]).toEqual([member.id, null])
    }
  }, 120_000)
})
