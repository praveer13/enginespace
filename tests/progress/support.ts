/**
 * Helpers for the progress tests: a small course (modules, KCs and refs), the sources that map refs to its KCs, and a builder of
 * graded events. Nothing here reads the repository's content, so each test says exactly what it is about.
 */
import type { Provenance } from '@es/ledger'
import type { Kind, LedgerEvent } from '@es/ledger'
import type { CourseMap } from '@es/schema'
import type { KcSources } from '@/progress/kcmap'

const mod = (id: string, kcs: string[], labs: string[] = []) => ({ id, prereqs: [], artifacts: [], labs, kcs })
const kc = (id: string, module: string) => ({ id, module, description: `You can ${id}.`, requires: [] })

/** TR0 is planned with no KCs, TR1 has two, TR2 has three, TR5a has two and owns the forge lab `hybrid-kv`. */
export const MAP: Pick<CourseMap, 'modules' | 'kcs' | 'refs'> = {
  modules: [
    mod('tr0', []),
    mod('tr1', ['tr1.five-mechanisms', 'tr1.vllm-lifecycle']),
    mod('tr2', ['tr2.bubble', 'tr2.async-overlap', 'tr2.graph-replay']),
    mod('tr5a', ['tr5a.kv-groups', 'tr5a.adapter-pages'], ['hybrid-kv']),
    mod('capstone', []),
  ],
  kcs: [
    kc('tr1.five-mechanisms', 'tr1'),
    kc('tr1.vllm-lifecycle', 'tr1'),
    kc('tr2.bubble', 'tr2'),
    kc('tr2.async-overlap', 'tr2'),
    kc('tr2.graph-replay', 'tr2'),
    kc('tr5a.kv-groups', 'tr5a'),
    kc('tr5a.adapter-pages', 'tr5a'),
  ],
  refs: { 'predict:tr2.l3#tr2.l3.p1': ['tr2.async-overlap'] },
}

/**
 * The game `loop` exercises two KCs of TR2 and is TR2's; the variant `async-off` of the family `tr2.bubble-width` assesses one of them and
 * its variant `close-it` both; the lab `hybrid-kv` two of TR5a.
 */
export const SOURCES: KcSources = {
  refs: MAP.refs,
  game: (game) => (game === 'loop' ? ['tr2.bubble', 'tr2.async-overlap'] : []),
  variant: (family, variant) => {
    if (family !== 'tr2.bubble-width') return []
    return variant === 'async-off' ? ['tr2.bubble'] : variant === 'close-it' ? ['tr2.bubble', 'tr2.async-overlap'] : []
  },
  lab: (lab) => (lab === 'hybrid-kv' ? ['tr5a.kv-groups', 'tr5a.adapter-pages'] : []),
}

export const homeOf = (game: string): string | undefined => (game === 'loop' ? 'tr2' : undefined)

export const DAY = 86_400_000
export const T0 = Date.parse('2026-11-04T09:00:00.000Z')
export const isoAt = (days: number): string => new Date(T0 + days * DAY).toISOString()

export interface Made {
  ok?: boolean
  provenance?: Provenance
  /** Days after T0. */
  day?: number
}

let counter = 0

/**
 * A graded event with the fields that progress reads: its kind, ref, result and time. Its `data` is left out, because progress does
 * not read it; the cast says so.
 */
export function made(kind: Exclude<Kind, 'challenge' | 'ack'>, ref: string, { ok = true, provenance = 'unseen', day = 0 }: Made = {}): LedgerEvent {
  counter += 1
  const at = isoAt(day)
  return { id: `e${counter}`, v: 1, kind, ref, at, tz: 0, day: at.slice(0, 10), dev: 'dev-test', score: ok ? 1 : 0, ok, provenance } as unknown as LedgerEvent
}

/** An event that is not graded. */
export function ungraded(kind: 'challenge' | 'ack', ref: string): LedgerEvent {
  counter += 1
  return { id: `u${counter}`, v: 1, kind, ref, at: isoAt(0), tz: 0, day: '2026-11-04', dev: 'dev-test' } as unknown as LedgerEvent
}
