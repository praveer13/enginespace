/*
 * W1b-T08, acceptance 3: the slot-baseline readout of the `hybrid-kv` page (TR5a §5, D-042) is held to the sim. The readout is one night of
 * adapter churn that an engine plays on a manager, and three things have to be true of it:
 *
 *   1. The night is the sim's. The pool's row is what the reference does with it, and each slot row is what the same pool with `adapterSlots`
 *      does with it, counted again from the operations and replies themselves, with the eight invariants of the pool holding after every
 *      operation and no more adapters resident than there are slots.
 *   2. A module is measured and not assumed. The plan sends the pool's operations to a module and counts what the module answers: the
 *      reference module (the TypeScript one and the Rust one that the site runs) gets the pool's row, and a module that is wrong in one of
 *      the bestiary's ways gets the row of what it did, with the operation at which it parted from the model.
 *   3. The readout never grades. The plan fails only on a reply that is not a reply, and the page's runner turns a trap into a missing row.
 *
 * The Rust builds are tests/fixtures/forge/hybrid-kv's, run through the real worker as the page runs them.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { createHost } from '../../src/forge/host'
import type { CallOutcome, ForgeHost } from '../../src/forge/host'
import { LabAbiError } from '../../vendor/kernelspace/src/lib/wasm-lab'
import { runSlotReadout } from '../../src/forge/readout'
import { browserPool } from '../../src/forge/worker-pool'
import { BATCH, HYBRID_KV_SPECS, kvInvariants, kvReference, SLOT_NIGHT, SLOT_NIGHT_SEED, slotNight, slotNightPlan, slotWorkload, wireOp, wireSpec } from '../../packages/sim'
import type { KvOp, KvResult, KvSpec, SlotNight, SlotRow } from '../../packages/sim'
import { BESTIARY } from '../sim/kv-bestiary'
import { seeds } from '../seeds'
import { drive, kvModule } from './kv-module'

setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const fixture = (name: string): ArrayBuffer => {
  const bytes = readFileSync(path.join(root, 'tests/fixtures/forge/hybrid-kv', `${name}.wasm`))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const host = createHost({ pool: browserPool() })
afterAll(() => host.dispose())

/** What a manager made of a list of operations, counted from its own replies: admits and loads that it said yes to. */
function recount(spec: KvSpec, ops: readonly KvOp[]): { row: SlotRow; replies: KvResult[]; resident: number } {
  const model = kvReference(spec)
  const replies: KvResult[] = []
  let admitted = 0
  let loads = 0
  let most = 0
  for (const op of ops) {
    const reply = model.apply(op)
    replies.push(reply)
    if (reply.ok && op.op === 'admit') admitted += 1
    if (reply.ok && op.op === 'load-adapter') loads += 1
    // The sim's own rules hold after every operation, with slots or without.
    expect(kvInvariants(spec, model.state()), `${wireOp(op)}`).toEqual([])
    most = Math.max(most, model.state().adapters.length)
  }
  return { row: { admitted, loads }, replies, resident: most }
}

/** A module's row for the night, from the wire: the TypeScript module that speaks it. */
function through(night: SlotNight, make: (spec: KvSpec) => ReturnType<typeof kvReference>) {
  const plan = slotNightPlan(night)
  const driven = drive(plan, kvModule(make))
  return { driven, yours: plan.yours() }
}

describe('the night is drawn from the seed', () => {
  test('the same seed gives the same night, and the lab\'s page plays the fixed one', () => {
    expect(JSON.stringify(slotNight())).toBe(JSON.stringify(slotNight(SLOT_NIGHT_SEED)))
    expect(JSON.stringify(slotNight(1))).not.toBe(JSON.stringify(slotNight(2)))
    expect(SLOT_NIGHT_SEED).toBe(0x4b07)
  })

  test('the requests keep to the parameters of the night: arrivals in order, prompts of 2 to 4 pages, two adapters and the base model', () => {
    const requests = slotWorkload(SLOT_NIGHT_SEED)
    expect(requests).toHaveLength(SLOT_NIGHT.arrivals)
    expect(requests.map((r) => r.arrive)).toEqual([...requests.map((r) => r.arrive)].sort((a, b) => a - b))
    for (const r of requests) {
      expect(r.tokens).toBeGreaterThanOrEqual(SLOT_NIGHT.prompt.min)
      expect(r.tokens).toBeLessThanOrEqual(SLOT_NIGHT.prompt.max)
      expect(r.decode).toBeGreaterThanOrEqual(SLOT_NIGHT.decode.min)
      expect(r.decode).toBeLessThanOrEqual(SLOT_NIGHT.decode.max)
      expect([null, 0, 1]).toContain(r.adapter)
    }
    // Both adapters are in play, so that the night is one of churn and not of one adapter.
    expect(new Set(requests.map((r) => r.adapter))).toEqual(new Set([null, 0, 1]))
  })

  test('one slot is what vLLM sets by default at the pin, as the claim says, so that a re-pin that moves the default moves this test first', () => {
    const claims = load(readFileSync(path.join(root, 'content/claims/vllm/kv.yaml'), 'utf8')) as { id: string; value: unknown; unit?: string; pin?: string }[]
    const claim = claims.find((entry) => entry.id === 'vllm.lora.max-loras-default')
    expect(claim, 'the claim that the readout\'s first slot count rests on').toBeDefined()
    expect([claim?.value, claim?.unit, claim?.pin]).toEqual([SLOT_NIGHT.slotCounts[0], 'slots', 'vllm'])
  })

  test('the pool is the adapter stage\'s, and the two adapters are the ones the stage loads: 4 and 8 pages', () => {
    const night = slotNight()
    expect(night.spec).toBe(HYBRID_KV_SPECS['one-group'])
    expect(night.adapters.map((a) => [a.rank, a.pages])).toEqual([
      [8, 4],
      [16, 8],
    ])
    expect(night.slots.map((s) => s.slots)).toEqual([...SLOT_NIGHT.slotCounts])
  })
})

describe('the readout is held to the sim', () => {
  const SEEDS = seeds(1).slice(0, 40)

  test.each([[SLOT_NIGHT_SEED], ...SEEDS.slice(0, 5).map((s) => [s])])('seed %d: the pool\'s row is the reference\'s own, counted again from its replies', (seed) => {
    const night = slotNight(seed)
    const counted = recount(night.spec, night.script)
    expect(counted.row).toEqual(night.pool)
    expect(counted.replies.map((r) => JSON.stringify(r))).toEqual(night.expected.map((r) => JSON.stringify(r)))
    // The pool keeps adapters as pages: both of them are resident at the most, which takes 12 of the 20 pages.
    expect(counted.resident).toBeLessThanOrEqual(night.adapters.length)
  })

  test.each([[SLOT_NIGHT_SEED], ...SEEDS.slice(0, 5).map((s) => [s])])('seed %d: each slot row is the same pool with that many slots, counted again, and never more adapters than slots', (seed) => {
    const night = slotNight(seed)
    for (const baseline of night.slots) {
      const spec = { ...night.spec, adapterSlots: baseline.slots }
      const counted = recount(spec, baseline.ops)
      expect(counted.row, `${baseline.slots} slot(s)`).toEqual(baseline.row)
      expect(counted.resident).toBeLessThanOrEqual(baseline.slots)
    }
  })

  test('over the lab\'s seeds the reference module is measured as the reference, and the engine never sends a call that the model cannot take', () => {
    for (const seed of SEEDS) {
      const night = slotNight(seed)
      const { driven, yours } = through(night, (spec) => kvReference(spec))
      expect(driven.ok, `seed ${seed}: ${driven.message}`).toBe(true)
      expect(yours, `seed ${seed}`).toEqual({ ...night.pool, differs: null })
      // The engine unloads only an adapter that nobody runs on, and loads only one that is not in: nothing it sends is refused for being wrong.
      const refusals = night.expected.flatMap((reply, i) => (reply.ok || ['no-pages', 'no-slot'].includes(reply.reason) ? [] : [`${wireOp(night.script[i])}: ${reply.reason}`]))
      expect(refusals, `seed ${seed}`).toEqual([])
    }
  })

  test('the night is a night of churn: the one-slot model swaps adapters, and the pool loads each of the two once', () => {
    const night = slotNight()
    expect(night.pool.loads).toBe(night.adapters.length)
    const one = night.slots.find((s) => s.slots === 1)
    const two = night.slots.find((s) => s.slots === 2)
    expect(one?.row.loads).toBeGreaterThan(night.adapters.length)
    expect(two?.row.loads).toBe(night.adapters.length)
    // Every row is a count of the same sixty arrivals.
    for (const row of [night.pool, ...night.slots.map((s) => s.row)]) expect(row.admitted).toBeLessThanOrEqual(night.arrivals)
  })
})

describe('a module is measured, not assumed', () => {
  const night = slotNight()

  test('the plan sends init first and then the pool\'s operations, a hundred commands to a batch, and says what it counted', () => {
    const plan = slotNightPlan(night)
    const first = plan.next()!
    expect(first).toHaveLength(BATCH)
    expect(first[0]).toBe(wireSpec(night.spec))
    expect(first[0]).toBe('init 20 131072 1024 1 - full0:full:8:0:16:-:-')
    expect(first[1]).toBe(wireOp(night.script[0]))
    const whole = slotNightPlan(night)
    const driven = drive(whole, kvModule((spec) => kvReference(spec)))
    expect(driven.ok).toBe(true)
    expect(driven.commands).toBe(1 + night.script.length)
    expect(driven.message).toBe(`admitted ${night.pool.admitted} of ${night.arrivals} requests and loaded adapters ${night.pool.loads} times`)
    expect(whole.yours()).toEqual({ ...night.pool, differs: null })
  })

  test('a module that is wrong in the bestiary\'s ways gets the row of what it did, and the operation at which it parted from the model', () => {
    for (const id of ['double-counted', 'leaky-free']) {
      const member = BESTIARY.find((m) => m.id === id)!
      const { driven, yours } = through(night, (spec) => member.make(spec))
      expect(driven.ok, `${id}: ${driven.message}`).toBe(true)
      expect(yours, id).not.toBeNull()
      expect(yours!.differs, id).toMatch(/^operation \d+ of \d+, .+: the model answers "(ok|refused) .+", and the module answered "(ok|refused) .+"$/)
      expect([yours!.admitted, yours!.loads], id).not.toEqual([night.pool.admitted, night.pool.loads])
      // The row is the module's own: counted again from the replies of a model that is wrong the same way, to the same operations.
      const model = member.make(night.spec)
      let admitted = 0
      let loads = 0
      for (const op of night.script) {
        const reply = model.apply(op)
        if (reply.ok && op.op === 'admit') admitted += 1
        if (reply.ok && op.op === 'load-adapter') loads += 1
      }
      expect({ admitted: yours!.admitted, loads: yours!.loads }, id).toEqual({ admitted, loads })
    }
  })

  test('a member of the bestiary that the night cannot show is measured as the reference: the checks are what catch it', () => {
    const member = BESTIARY.find((m) => m.id === 'union-hit')!
    const { yours } = through(night, (spec) => member.make(spec))
    expect(yours).toEqual({ ...night.pool, differs: null })
  })

  test('a reply that is not a reply to its command ends the plan, with the operation and what the module said, and leaves no row', () => {
    const plan = slotNightPlan(night)
    const real = kvModule((spec) => kvReference(spec))
    const driven = drive(plan, (command) => (command.startsWith('load') ? 'banana' : real(command)))
    expect(driven.ok).toBe(false)
    expect(driven.message).toMatch(/^operation \d+ of \d+, load adapter \d+ \(\d+ pages\): the reply "banana" cannot be read: /)
    expect(plan.yours()).toBeNull()
  })

  test('a module that does not start for the night is told so, and one that answers too few commands is told how many', () => {
    const refusing = drive(slotNightPlan(night), () => 'err no')
    expect(refusing.ok).toBe(false)
    expect(refusing.message).toContain('the module did not start for the night')
    const plan = slotNightPlan(night)
    const batch = plan.next()!
    expect(plan.judge(batch.slice(1).map(() => 'ok'))).toBe(`the module answered ${batch.length - 1} of the ${batch.length} commands sent`)
    expect(plan.yours()).toBeNull()
  })

  test('nothing is read until every reply has been: a plan that has judged one batch of two has no row', () => {
    const plan = slotNightPlan(night)
    const real = kvModule((spec) => kvReference(spec))
    const first = plan.next()!
    expect(plan.judge(first.map(real))).toBeNull()
    expect(plan.yours()).toBeNull()
  })
})

describe('on the builds that Rust makes, through the worker that the page runs', () => {
  const night = slotNight()

  test.each(['reference', 'solved'])('%s is measured as the pool: its row is the sim\'s, and it parts from the model nowhere', async (name) => {
    await host.load(fixture(name))
    const readout = await runSlotReadout(host)
    expect(readout.status).toBe('ready')
    if (readout.status !== 'ready') return
    expect(readout.yours).toEqual({ ...night.pool, differs: null })
    expect(readout.night.pool).toEqual(night.pool)
  })

  test.each(['double-counted', 'leaky-free'])('%s is measured as what it does: another row, and the operation where it parts from the model', async (name) => {
    await host.load(fixture(name))
    const readout = await runSlotReadout(host)
    expect(readout.status).toBe('ready')
    if (readout.status !== 'ready') return
    expect([readout.yours.admitted, readout.yours.loads]).not.toEqual([night.pool.admitted, night.pool.loads])
    expect(readout.yours.differs).not.toBeNull()
    // The Rust module and its TypeScript twin do the same wrong thing, so they are measured the same.
    const member = BESTIARY.find((m) => m.id === name)!
    const twin = through(night, (spec) => member.make(spec))
    expect({ admitted: readout.yours.admitted, loads: readout.yours.loads }).toEqual({ admitted: twin.yours!.admitted, loads: twin.yours!.loads })
  })

  test('the template traps at its todo!(), and the readout says so and has no row: the slot rows need no module', async () => {
    await host.load(fixture('template'))
    const readout = await runSlotReadout(host)
    expect(readout.status).toBe('failed')
    if (readout.status !== 'failed') return
    expect(readout.message).toContain('not implemented yet: build the manager')
    expect(readout.night.slots.map((s) => s.row)).toEqual(night.slots.map((s) => s.row))
  })
})

describe('a module that cannot play the night loses its row and nothing else', () => {
  const night = slotNight()
  /** A host whose instance answers every call as `outcome` says, or whose instance cannot be opened. */
  const stub = (outcome: CallOutcome | Error): ForgeHost => ({
    load: () => Promise.reject(new Error('the stub loads nothing')),
    open: () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve({ call: () => Promise.resolve(outcome), close: () => Promise.resolve(undefined) })),
    dispose: () => undefined,
  })

  test('a trap says what the module said, a timeout says that the page stopped the night, and a module that leaves the ABI says so', async () => {
    const trapped = await runSlotReadout(stub({ kind: 'trap', replies: [], panic: 'panicked at hybrid-kv/src/manager.rs:12:9: not yet implemented: build the manager' }))
    expect(trapped).toMatchObject({ status: 'failed' })
    expect(trapped.status === 'failed' && trapped.message).toBe('not implemented yet: build the manager (hybrid-kv/src/manager.rs:12:9)')

    const timedOut = await runSlotReadout(stub({ kind: 'timeout' }), { budgetMs: 2000 })
    expect(timedOut.status === 'failed' && timedOut.message).toBe('the module was still playing it after 2 s, so the page stopped it.')

    const broken = await runSlotReadout(stub(new LabAbiError('the module answered outside its memory')))
    expect(broken.status === 'failed' && broken.message).toContain('answered outside its memory')
  })

  test('whatever happens, the sim\'s rows are there, so that the page can print them', async () => {
    for (const outcome of [{ kind: 'timeout' } as const, new Error('the worker died')]) {
      const readout = await runSlotReadout(stub(outcome))
      expect(readout.status).toBe('failed')
      if (readout.status === 'running') continue
      expect(readout.night.slots.map((s) => s.row)).toEqual(night.slots.map((s) => s.row))
    }
  })
})
