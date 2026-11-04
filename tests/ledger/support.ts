/**
 * Helpers for the ledger tests: one valid example of every kind, a seeded generator of ledgers whose ids collide on purpose, and
 * the small flows (read, plan, commit) that the app's import and undo will run against a store.
 *
 * The generator draws from the vendored splitmix32, so a seed names the same ledger everywhere. Its events are made with
 * `stampEvent`, so each one has passed the codec: a generator that wrote an invalid event would throw here, where the bug is.
 */
import { splitmix32u } from '../../vendor/kernelspace/src/lib/rng'
import { stampEvent, normalizeLedger, planImport, planUndo, RESOLVERS } from '@es/ledger'
import type {
  Checkpoint,
  Draft,
  EventOf,
  ImportMode,
  ImportPlan,
  Kind,
  Ledger,
  LedgerEvent,
  LedgerStore,
  ReceiptRecord,
  UndoPlan,
  VerificationReport,
} from '@es/ledger'
import { KINDS } from '@es/ledger'

export const HEX_A = 'a'.repeat(64)
export const HEX_B = 'b'.repeat(64)
export const HEX_C = '0123456789abcdef'.repeat(4)

export const TOKEN = 'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d'
const base = (id: string) => ({ id, v: 1 as const, at: '2026-11-04T09:30:00.000Z', tz: -480, day: '2026-11-04', dev: 'dev-a1' })

/** One valid event of every kind. Typed, so a type-checked run of this file would catch an example that left its type behind. */
export const EXAMPLES: { [K in Kind]: EventOf<K> } = {
  predict: {
    ...base('p1'),
    kind: 'predict',
    ref: 'predict:tr2.l3#tr2.l3.p1',
    score: 1,
    ok: true,
    provenance: 'unseen',
    seed: 7,
    conf: 'sure',
    rev: 'a1b2c3d4',
    data: { value: 300, truth: 312, unit: 'us' },
  },
  item: {
    ...base('i1'),
    kind: 'item',
    ref: 'item:gen/tr2.bubble-width/async-on',
    score: 0.5,
    ok: false,
    provenance: 'practice',
    data: { answer: { lo: 1, hi: 2 } },
  },
  play: {
    ...base('g1'),
    kind: 'play',
    ref: 'play:loop/close',
    score: 0.97,
    ok: true,
    provenance: 'unseen',
    seed: 4021,
    rev: '9f8e7d6c',
    data: { actions: 'H4sIAAAAAAAAA', actionsSha256: HEX_C },
  },
  'lab-check': {
    ...base('l1'),
    kind: 'lab-check',
    ref: 'lab:hybrid-kv',
    score: 0.5,
    ok: false,
    provenance: 'unseen',
    data: {
      wasmSha256: HEX_A,
      seeds: [11, 22],
      checks: [
        { id: 'adapter_unified_paging', status: 'pass', seed: 11 },
        { id: 'sliding_release', status: 'fail' },
      ],
    },
  },
  prove: {
    ...base('v1'),
    kind: 'prove',
    ref: 'prove:hybrid-kv',
    score: 1,
    ok: true,
    provenance: 'proved',
    data: { predicted: [3, 1, 2], actual: [3, 1, 2], agentClosed: true, wasmSha256: HEX_A },
  },
  'trace-mark': {
    ...base('t1'),
    kind: 'trace-mark',
    ref: 'trace:base-step/gap',
    score: 0.96,
    ok: true,
    provenance: 'unseen',
    data: { marks: [{ start: 0, end: 1200, category: 'gpu-busy' }], error: 0 },
  },
  challenge: {
    ...base('c1'),
    kind: 'challenge',
    ref: 'challenge:tr8.replay.s2',
    data: { token: TOKEN, seed: 0x0badc0de, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261104' },
  },
  receipt: {
    ...base('r1'),
    kind: 'receipt',
    ref: 'receipt:tr8.replay.s2',
    score: 1,
    ok: true,
    provenance: 'gpu-verified',
    data: {
      receiptSha256: HEX_B,
      challenge: TOKEN,
      checks: [
        { id: 'teacher-forced', verdict: 'attested', bound: 'at least 99% of positions' },
        { id: 'arrival-adherence', verdict: 'pass' },
      ],
      graderVersion: '0.1.0',
      environment: 'one GPU, one engine at the pin',
    },
  },
  review: {
    ...base('w1'),
    kind: 'review',
    ref: 'review:tr2.async-overlap',
    score: 1,
    ok: true,
    provenance: 'unseen',
    conf: 'think',
    data: { grade: 3 },
  },
  ack: { ...base('a1'), kind: 'ack', ref: 'screen:welcome' },
}

/** A deep copy that a test may mutate. */
export const copy = <T>(value: T): T => structuredClone(value)

/** A shallow copy of an object without the named members. */
export function omit(value: object, ...keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...value }
  for (const key of keys) delete out[key]
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A seeded generator                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Rng {
  /** An integer in [0, n). */
  int(n: number): number
  pick<T>(list: readonly T[]): T
  chance(p: number): boolean
}

export function rngOf(seed: number): Rng {
  const next = splitmix32u(seed)
  return {
    int: (n) => next() % n,
    pick: (list) => list[next() % list.length],
    chance: (p) => next() / 4294967296 < p,
  }
}

const INSTANTS = [
  '2026-11-01T08:00:00.000Z',
  '2026-11-02T16:30:00.000Z',
  '2026-11-03T00:15:00.000Z',
  '2026-11-03T23:59:59.999Z',
  '2026-11-04T09:30:00.000Z',
  '2026-11-05T12:00:00.000Z',
  '2026-11-06T21:45:00.000Z',
  '2026-11-08T03:00:00.000Z',
]
const ZONES = [-480, 0, 60, 330, 840]
const DEVICES = ['dev-a1', 'dev-b2']
const POOL = Array.from({ length: 12 }, (_, index) => `ev-${String(index).padStart(2, '0')}`)
const SHAS = ['1', '2', '3', '4', '5'].map((digit) => digit.repeat(64))
const SEEDS = [0, 1, 4021, 0xffffffff]

function randomDraft(r: Rng, kind: Kind): Draft {
  const graded = { score: r.pick([0, 0.25, 0.5, 1]), ok: r.chance(0.5), provenance: r.pick(['unseen', 'practice', 'assisted'] as const) }
  const optional = { ...(r.chance(0.3) ? { seed: r.pick(SEEDS) } : {}), ...(r.chance(0.3) ? { conf: r.pick(['guess', 'think', 'sure'] as const) } : {}) }
  switch (kind) {
    case 'predict':
      return { kind, ref: 'predict:tr2.l3#tr2.l3.p1', ...graded, ...optional, data: { value: r.int(1000), truth: r.int(1000) } }
    case 'item':
      return { kind, ref: `item:gen/tr2.bubble-width/v${r.int(3)}`, ...graded, ...optional, data: { answer: r.pick([1, 'b', [1, 2], { lo: 1, hi: 3 }, null]) } }
    case 'play':
      return {
        kind,
        ref: `play:loop/${r.pick(['close', 'async'])}`,
        ...graded,
        ...optional,
        data: { actions: `a${r.int(100)}`, actionsSha256: r.pick(SHAS) },
      }
    case 'lab-check':
      return {
        kind,
        ref: 'lab:hybrid-kv',
        ...graded,
        ...optional,
        data: { wasmSha256: r.pick(SHAS), seeds: [r.pick(SEEDS)], checks: [{ id: 'check_a', status: r.pick(['pass', 'fail', 'trap', 'timeout'] as const) }] },
      }
    case 'prove':
      return r.chance(0.5)
        ? { kind, ref: 'prove:kv-publisher', ...graded, ...optional, data: { predicted: r.int(9), actual: r.int(9), agentClosed: true, wasmSha256: r.pick(SHAS) } }
        : { kind, ref: 'prove:tr8.replay', ...graded, ...optional, data: { predicted: [r.int(9)], actual: null, agentClosed: r.chance(0.9), receiptSha256: r.pick(SHAS) } }
    case 'trace-mark':
      return { kind, ref: 'trace:base-step/gap', ...graded, ...optional, data: { marks: [{ start: 0, end: r.int(5000) }], error: r.int(100) } }
    case 'challenge': {
      const seed = r.pick(SEEDS)
      const nonce = Array.from({ length: 16 }, () => r.pick([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'])).join('')
      const issuedOn = r.pick(['20261101', '20261104', '20261230'])
      const stage = r.pick(['tr8.replay.s1', 'tr8.replay.s2', 'tr3.profile.s4'])
      const token = `es1:${stage}:${seed.toString(16).padStart(8, '0')}:${nonce}:${issuedOn}:00000000`
      return { kind, ref: `challenge:${stage}`, data: { token, seed, nonce, issuedOn } }
    }
    case 'receipt':
      return {
        kind,
        ref: 'receipt:tr8.replay.s2',
        ...graded,
        data: {
          receiptSha256: r.pick(SHAS),
          challenge: TOKEN,
          checks: [{ id: 'teacher-forced', verdict: r.pick(['pass', 'fail', 'attested'] as const) }],
          graderVersion: '0.1.0',
          environment: 'one GPU, one engine at the pin',
        },
      }
    case 'review':
      return { kind, ref: 'review:tr2.async-overlap', ...graded, ...optional, data: { grade: r.pick([1, 2, 3, 4] as const) } }
    case 'ack':
      return { kind, ref: r.pick(['screen:welcome', 'change:vllm-0-34']) }
  }
}

/** Stamps a draft with a chosen id, instant, zone and device, so a generated event is an event the codec accepts. */
export function eventOf(draft: Draft, id: string, at: string, tz: number, dev: string): LedgerEvent {
  return stampEvent({ clock: { nowIso: () => at, tzOffsetMinutes: () => tz }, newId: () => id, dev }, draft)
}

/**
 * An event for one id. Half the time the content depends on the id alone, so the same id in two ledgers is the same event;
 * otherwise it is drawn from the generator's stream, so the same id usually means a clash.
 */
function eventFor(r: Rng, id: string): LedgerEvent {
  const fixed = r.chance(0.5)
  const source = fixed ? rngOf(POOL.indexOf(id) + 1000) : r
  return eventOf(randomDraft(source, source.pick(KINDS)), id, source.pick(INSTANTS), source.pick(ZONES), source.pick(DEVICES))
}

const REPORTS: VerificationReport[] = [
  { at: '2026-11-05T08:00:00.000Z', report: { rules: 1, findings: [] } },
  { at: '2026-11-05T08:00:00.000Z', report: { rules: 1, findings: ['x'] } },
  { at: '2026-11-07T08:00:00.000Z', report: { rules: 2, findings: [] } },
  { at: '2026-11-09T08:00:00.000Z', report: { rules: 3, findings: [] } },
]

function receiptFor(r: Rng, sha256: string): ReceiptRecord {
  // The SHA-256 names the content, so one hash is one receipt; a damaged file that disagrees is rare.
  const receipt = r.chance(0.1) ? { n: 99 } : { n: SHAS.indexOf(sha256) }
  return { sha256, receipt, reports: REPORTS.filter(() => r.chance(0.4)) }
}

/** A ledger of up to `size` events and a few receipts, drawn from a small pool of ids so that two seeds overlap and clash. */
export function randomLedger(seed: number, size = 8): Ledger {
  const r = rngOf(seed)
  const events: LedgerEvent[] = []
  for (let n = r.int(size + 1); n > 0; n -= 1) events.push(eventFor(r, r.pick(POOL)))
  const receipts: ReceiptRecord[] = []
  for (let n = r.int(4); n > 0; n -= 1) receipts.push(receiptFor(r, r.pick(SHAS)))
  return { events, receipts }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Flows against a store                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ledger a store holds, in normal form. */
export async function snapshot(store: LedgerStore): Promise<Ledger> {
  const all = await store.readAll()
  return normalizeLedger({ events: all.events, receipts: all.receipts })
}

/** What the app's import does: read the store, plan against what it found, commit the plan's one transaction. */
export async function importInto(store: LedgerStore, file: Ledger, mode: ImportMode, checkpointId: string, at = '2026-11-10T08:00:00.000Z'): Promise<ImportPlan> {
  const plan = planImport(await snapshot(store), file, mode, { checkpointId, at })
  await store.commit(plan.tx, RESOLVERS)
  return plan
}

/** What the app's undo does: read the checkpoint and the store, plan the undo, commit it. */
export async function undoIn(store: LedgerStore, checkpointId: string): Promise<UndoPlan> {
  const checkpoint: Checkpoint | undefined = await store.readCheckpoint(checkpointId)
  if (checkpoint === undefined) throw new Error(`no checkpoint ${checkpointId}`)
  const plan = planUndo(await snapshot(store), checkpoint)
  await store.commit(plan.tx, RESOLVERS)
  return plan
}
