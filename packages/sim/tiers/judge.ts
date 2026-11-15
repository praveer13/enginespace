// Judging a publisher (ARCHITECTURE §5.8, §8.3, the `kv-publisher` lab's host): run operations through it and the reference side by side,
// feed each batch it publishes to the reference consumer, and say where it first goes wrong and which check that breaks.
//
// After every operation the judge asks:
//   reply      does it answer as the reference does?
//   atomic     if it refused, is its state as it was, and did it publish nothing?
//   truth      is its state the reference's: the same blocks in the same tiers in the same recency order?
//   view       does the consumer's view of its events equal its own truth? (what a dropped BlockRemoved breaks)
//   ordering   does each batch's `ts` rise, and does it name the operation that published it?
//   reset      after a reset, is the view empty and did it publish AllBlocksCleared?
//   capacity   was a tier ever over its capacity as the consumer saw it?
//   events     are the events the reference's?
// It stops at the first operation that fails any of them, and lists every check that failed there.

import { canonicalJson } from '../core/json'
import { TiersConsumer } from './consumer'
import { tiersReference } from './reference'
import { TIER_IDS } from './types'
import type { TiersModel, TiersOp, TiersSpec, TiersState } from './types'

export const TIERS_CHECKS = ['reply', 'atomic', 'truth', 'view', 'ordering', 'reset', 'capacity', 'events'] as const
export type TiersCheckId = (typeof TIERS_CHECKS)[number]

export interface TiersFailure {
  readonly check: TiersCheckId
  readonly message: string
}

export interface TiersJudgement {
  readonly at: number
  readonly op: TiersOp
  readonly failures: readonly TiersFailure[]
}

const withoutStep = (s: TiersState): string => canonicalJson({ ...s, step: 0 })

/** Where two views of the tiers differ, in a sentence, or null. */
function viewGap(view: Record<string, readonly number[]>, state: TiersState): string | null {
  for (const t of state.tiers) {
    const truth = [...t.blocks].sort((a, b) => a - b)
    const seen = view[t.id]
    const missing = truth.filter((h) => !seen.includes(h))
    const extra = seen.filter((h) => !truth.includes(h))
    if (missing.length > 0) return `the consumer does not see ${missing.length} block(s) of ${t.id}, such as ${missing[0]}`
    if (extra.length > 0) return `the consumer still sees ${extra.length} block(s) that ${t.id} has dropped, such as ${extra[0]}`
  }
  return null
}

/** Judges `candidate` on `ops` against `reference` (a fresh reference for `spec` by default). It returns null when every operation passed. */
export function tiersJudge(spec: TiersSpec, ops: readonly TiersOp[], candidate: TiersModel, reference: TiersModel = tiersReference(spec)): TiersJudgement | null {
  const consumer = new TiersConsumer(spec)
  let before = candidate.state()
  let seen = 0
  let seenRef = 0
  let problemsSeen = 0
  for (let at = 0; at < ops.length; at++) {
    const op = ops[at]
    const failures: TiersFailure[] = []
    const fail = (check: TiersCheckId, message: string): void => {
      failures.push({ check, message })
    }
    const want = reference.apply(op)
    const got = candidate.apply(op)
    if (got.ok !== want.ok || (!got.ok && !want.ok && got.reason !== want.reason)) {
      fail('reply', `${op.op} answered ${got.ok ? 'ok' : `refused (${got.reason})`}, and the reference answers ${want.ok ? 'ok' : `refused (${want.reason})`}`)
    }
    const after = candidate.state()
    if (!got.ok && withoutStep(after) !== withoutStep(before)) fail('atomic', `${op.op} was refused and still changed the state`)
    if (withoutStep(after) !== withoutStep(reference.state())) fail('truth', `after ${op.op} its tiers are not the reference's`)

    const published = candidate.events().slice(seen)
    const wanted = reference.events().slice(seenRef)
    seen += published.length
    seenRef += wanted.length
    if (!got.ok && published.length > 0) fail('atomic', `${op.op} was refused and still published events`)
    for (const batch of published) {
      consumer.consume(batch)
      if (batch[0] !== at) fail('ordering', `a batch for ${op.op} number ${at} carries ts ${batch[0]}`)
    }
    for (const p of consumer.problems.slice(problemsSeen)) {
      if (p.check === 'ordering' || p.check === 'capacity') fail(p.check, p.message)
    }
    problemsSeen = consumer.problems.length

    const gap = viewGap(consumer.view(), after)
    if (gap !== null) fail('view', `after ${op.op}, ${gap}`)
    if (op.op === 'reset') {
      const cleared = published.some(([, events]) => events.some((e) => e.type === 'AllBlocksCleared'))
      const empty = TIER_IDS.every((id) => consumer.view()[id].length === 0)
      if (!cleared || !empty) fail('reset', `a reset ${cleared ? 'left the consumer with blocks' : 'was not announced by AllBlocksCleared'}`)
    }
    if (canonicalJson(published) !== canonicalJson(wanted)) fail('events', `${op.op} published events that are not the reference's`)

    if (failures.length > 0) return { at, op, failures }
    before = after
  }
  return null
}
