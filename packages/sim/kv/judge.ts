// Judging a manager (ARCHITECTURE §8.3): run a list of operations through it and the reference side by side, and say where it first goes
// wrong and which check that breaks. The lab's host does this to a learner's module, one operation at a time through `ks_invoke`; the
// property tests and the bestiary do it to a manager in process.
//
// After every operation the judge asks:
//   reply        does it answer as the reference does: the same acceptance or refusal, the same pages free?
//   hit          for an admit, is the prefix hit the one every group holds (the intersection), and not another length?
//   atomic       if it refused, is the state exactly as it was before?
//   the checks of `kvInvariants`, on the state it now reports
//   events       are the events it published the reference's?
// It stops at the first operation that fails any of them, and lists every check that failed there.

import { canonicalJson } from '../core/json'
import { kvInvariants } from './invariants'
import { kvHitLength } from './lookup'
import { kvReference } from './reference'
import type { KvEvent, KvEventBatch, KvModel, KvOp, KvResult, KvSpec, KvState } from './types'

export interface KvFailure {
  /** A check of `KV_CHECKS` or `KV_JUDGE_CHECKS`. */
  readonly check: string
  readonly message: string
}

export interface KvJudgement {
  /** The index of the first operation that failed. */
  readonly at: number
  readonly op: KvOp
  readonly failures: readonly KvFailure[]
}

/** A snapshot without the clock, which a refused operation moves. */
const withoutStep = (s: KvState): string => canonicalJson({ ...s, step: 0 })

function describe(r: KvResult): string {
  return r.ok ? `ok with ${r.free} pages free${r.hit === undefined ? '' : ` and a hit of ${r.hit}`}` : `refused (${r.reason}) with ${r.free} pages free`
}

/** One event in a few words. */
function brief(e: KvEvent | undefined): string {
  if (e === undefined) return 'nothing'
  if (e.type === 'AllBlocksCleared') return 'AllBlocksCleared'
  if (e.type === 'BlockRemoved') return `BlockRemoved of ${e.block_hashes.join(',')} in group ${e.group_idx}`
  return `BlockStored of ${e.block_hashes.length} blocks from ${e.block_hashes[0]} in group ${e.group_idx}`
}

/** How two lists of batches differ: the first event that is not the same, or the count. */
function differ(got: readonly KvEventBatch[], want: readonly KvEventBatch[]): string {
  const a = got.flatMap(([, events]) => events)
  const b = want.flatMap(([, events]) => events)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (canonicalJson(a[i] ?? null) !== canonicalJson(b[i] ?? null)) return `published ${brief(a[i])} as its event ${i} of ${a.length}, and the reference publishes ${brief(b[i])} (of ${b.length})`
  }
  return `published its events in ${got.length} batches, and the reference in ${want.length}`
}

const same = (a: KvResult, b: KvResult): boolean => a.ok === b.ok && a.free === b.free && (a.ok && b.ok ? a.hit === b.hit : !a.ok && !b.ok && a.reason === b.reason)

/** Judges `candidate` on `ops` against `reference` (a fresh reference for `spec` by default). It returns null when every operation passed. */
export function kvJudge(spec: KvSpec, ops: readonly KvOp[], candidate: KvModel, reference: KvModel = kvReference(spec)): KvJudgement | null {
  let before = candidate.state()
  let seen = 0
  let seenRef = 0
  for (let at = 0; at < ops.length; at++) {
    const op = ops[at]
    const failures: KvFailure[] = []
    const fail = (check: string, message: string): void => {
      failures.push({ check, message })
    }

    // The reference's cache before an admit says what each group alone would have hit.
    const cacheBefore = op.op === 'admit' ? reference.state() : null
    const expected = reference.apply(op)
    const got = candidate.apply(op)
    if (!same(got, expected)) {
      if (op.op === 'admit' && cacheBefore !== null && got.ok && expected.ok && got.free === expected.free && got.hit !== expected.hit) {
        const found = kvHitLength(spec, cacheBefore, op.prompt, op.adapter ?? null)
        const groups = spec.groups.map((g) => `${g.id} ${found.perGroup[g.id]}`).join(', ')
        fail('hit', `admit ${op.req} reported a hit of ${got.hit} tokens, and the longest prefix every group holds is ${expected.hit} (alone, the groups would hit ${groups})`)
      } else {
        fail('reply', `${op.op} answered ${describe(got)}, and the reference answers ${describe(expected)}`)
      }
    }

    const after = candidate.state()
    for (const problem of kvInvariants(spec, after)) {
      const colon = problem.indexOf(':')
      fail(problem.slice(0, colon), problem.slice(colon + 2))
    }
    if (!got.ok && withoutStep(after) !== withoutStep(before)) fail('atomic', `${op.op} was refused (${got.reason}) and still changed the state`)
    if (op.op === 'load-adapter' && got.ok && spec.adapterSlots === undefined) {
      const loaded = after.adapters.find((a) => a.id === op.adapter)
      if (loaded === undefined || loaded.pages.length !== op.pages) {
        fail('adapters', `adapter ${op.adapter} was loaded with ${loaded === undefined ? 'no pages' : `${loaded.pages.length} pages`}, and the load asked for ${op.pages}`)
      }
    }

    const published = candidate.events().slice(seen)
    const wanted = reference.events().slice(seenRef)
    seen += published.length
    seenRef += wanted.length
    if (canonicalJson(published) !== canonicalJson(wanted)) fail('events', `${op.op} ${differ(published, wanted)}`)

    if (failures.length > 0) return { at, op, failures }
    before = after
  }
  return null
}
