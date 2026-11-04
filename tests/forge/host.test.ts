/*
 * W1-T10, acceptance 2: "An infinite loop traps at the 2 s per-check timeout", and the rest of what the host promises about a worker it
 * does not trust. These tests drive the host with a worker that answers from a script and a clock that moves when the test moves it
 * (tests/forge/fakes.ts), so that every limit is tested to the millisecond. The same host, with the real worker and a module that
 * really never returns, is tested in tests/forge/worker.test.ts and by verify:labs.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { createHost, hasWasmMagic } from '../../src/forge/host'
import { CHECK_BUDGET_MS, MAX_MODULE_BYTES, SETUP_BUDGET_MS } from '../../src/forge/protocol'
import { LabAbiError, LabTimeoutError } from '../../vendor/kernelspace/src/lib/wasm-lab'
import { FakeClock, FakePool, healthy, listOf } from './fakes'

const LIST = listOf('toy', [{ id: 'fill', label: 'fill', stage: 1, seeded: false }])
const REFERENCE_LIST = listOf('toy@reference', LIST.checks)

/** A file that looks like WebAssembly to the host's first look: the magic and a version. */
const wasm = (extra = 0): ArrayBuffer => {
  const bytes = new Uint8Array(8 + extra)
  bytes.set([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
  return bytes.buffer
}

/** Waits (in real time) until a condition holds: hashing a file takes the event loop a turn or two before the host's timer is set. */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 500; tries++) {
    if (condition()) return
    await Bun.sleep(1)
  }
  throw new Error('the host never reached the state the test waits for')
}

const sha256 = (buffer: ArrayBuffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex')

function setup(handler = healthy(LIST, (ops, id) => ({ type: 'replied', id, replies: ops.map((op) => `re:${op}`) }))) {
  const clock = new FakeClock()
  const pool = new FakePool(handler)
  return { clock, pool, host: createHost({ pool, timers: clock }) }
}

describe('load', () => {
  test('hashes the file, asks a worker to load it, and reports the lab, the reference flag and the checks the module lists', async () => {
    const { pool, host } = setup()
    const bytes = wasm(5)
    const loaded = await host.load(bytes)
    expect(loaded.sha256).toBe(sha256(bytes))
    expect(loaded).toMatchObject({ bytes: 13, lab: 'toy', reference: false, version: 1 })
    expect(loaded.list).toEqual(LIST)
    expect(pool.ports).toHaveLength(1)
    expect(pool.ports[0].types).toEqual(['load'])
  })

  test('names a reference build by its suffix, and the lab without it', async () => {
    const { host } = setup(healthy(REFERENCE_LIST, () => 'hang'))
    expect(await host.load(wasm())).toMatchObject({ lab: 'toy', reference: true })
  })

  test('refuses a file that does not begin with the WebAssembly magic, before any worker is asked', async () => {
    const { pool, host } = setup()
    const text = new TextEncoder().encode('fn main() {}').buffer as ArrayBuffer
    await expect(host.load(text)).rejects.toThrow(LabAbiError)
    await expect(host.load(text)).rejects.toThrow(/does not begin with \\0asm/)
    expect(pool.ports).toHaveLength(0)
    expect(hasWasmMagic(wasm())).toBe(true)
    expect(hasWasmMagic(new ArrayBuffer(2))).toBe(false)
  })

  test('refuses a file larger than the host reads', async () => {
    const { pool, host } = setup()
    await expect(host.load(wasm(MAX_MODULE_BYTES))).rejects.toThrow(/larger than the host reads/)
    expect(pool.ports).toHaveLength(0)
  })

  test('turns the worker\'s refusal into a LabAbiError with its words, and stops that worker', async () => {
    const { pool, host } = setup(() => ({ type: 'failed', id: 0, kind: 'abi', message: 'this module imports env.f.' }))
    await expect(host.load(wasm())).rejects.toThrow('this module imports env.f.')
    expect(pool.discarded).toEqual([pool.ports[0]])
  })

  test('stops a worker whose module will not finish loading, at the setup limit', async () => {
    const { clock, pool, host } = setup(() => 'hang')
    // The outcome is caught, not asserted, until the clock has moved: bun's `.rejects` waits for the promise by running the event loop.
    const outcome = host.load(wasm()).then(
      () => 'loaded',
      (e: unknown) => e,
    )
    await until(() => clock.pending > 0)
    clock.advance(SETUP_BUDGET_MS)
    expect(await outcome).toBeInstanceOf(LabTimeoutError)
    expect(pool.discarded).toHaveLength(1)
  })

  test('stops the worker of the last module when another is loaded', async () => {
    const { pool, host } = setup()
    await host.load(wasm())
    await host.load(wasm(1))
    expect(pool.ports).toHaveLength(2)
    expect(pool.discarded).toEqual([pool.ports[0]])
  })
})

describe('a session', () => {
  test('is a fresh instance: open, calls in order, and a close that hands back the trace', async () => {
    const { pool, host } = setup(
      healthy(LIST, (ops, id) => ({ type: 'replied', id, replies: ops.map((op) => `re:${op}`) })),
    )
    await host.load(wasm())
    const session = await host.open()
    expect(await session.call(['a', 'b'], CHECK_BUDGET_MS)).toEqual({ kind: 'replies', replies: ['re:a', 're:b'] })
    expect(await session.call(['c'], CHECK_BUDGET_MS)).toEqual({ kind: 'replies', replies: ['re:c'] })
    await session.close()
    expect(pool.ports[0].types).toEqual(['load', 'open', 'call', 'call', 'close'])
  })

  test('reports a trap with the replies before it, the panic text and the trace', async () => {
    const { host } = setup(healthy(LIST, (_ops, id) => ({ type: 'trapped', id, replies: ['ok'], panic: 'panicked at toy/src/rotation.rs:31:9: not yet implemented: build the rotation', trace: 'line' })))
    await host.load(wasm())
    const session = await host.open()
    expect(await session.call(['init 3', 'touch 1'], CHECK_BUDGET_MS)).toEqual({
      kind: 'trap',
      replies: ['ok'],
      panic: 'panicked at toy/src/rotation.rs:31:9: not yet implemented: build the rotation',
      trace: 'line',
    })
  })

  test('throws the worker\'s ABI refusal as a LabAbiError', async () => {
    const { host } = setup(healthy(LIST, (_ops, id) => ({ type: 'failed', id, kind: 'abi', message: 'your module replied with a pointer past the end of its memory: ABI violation.' })))
    await host.load(wasm())
    const session = await host.open()
    await expect(session.call(['x'], CHECK_BUDGET_MS)).rejects.toThrow(/ABI violation/)
  })

  test('a module that does not answer in time is stopped at the check\'s limit, and the call says `timeout`', async () => {
    const { clock, pool, host } = setup(healthy(LIST, () => 'hang'))
    await host.load(wasm())
    const session = await host.open()
    const calling = session.call(['touch 1'], CHECK_BUDGET_MS)
    await until(() => clock.pending > 0)
    clock.advance(CHECK_BUDGET_MS - 1)
    expect(pool.discarded).toHaveLength(0)
    clock.advance(1)
    expect(await calling).toEqual({ kind: 'timeout' })
    expect(CHECK_BUDGET_MS).toBe(2000)
    expect(pool.discarded).toEqual([pool.ports[0]])
  })

  test('after a timeout the next instance is made in a new worker that loads the same bytes, and the old session is over', async () => {
    let spin = true
    const { clock, pool, host } = setup(
      healthy(LIST, (ops, id) => (spin ? 'hang' : { type: 'replied', id, replies: ops.map(() => 'ok') })),
    )
    const bytes = wasm(3)
    await host.load(bytes)
    const first = await host.open()
    const calling = first.call(['x'], 500)
    await until(() => clock.pending > 0)
    clock.advance(500)
    expect(await calling).toEqual({ kind: 'timeout' })

    spin = false
    const second = await host.open()
    expect(pool.ports).toHaveLength(2)
    expect(pool.ports[1].types).toEqual(['load', 'open'])
    const reloaded = pool.ports[1].requests[0]
    expect(reloaded.type === 'load' && sha256(reloaded.bytes)).toBe(sha256(bytes))
    expect(await second.call(['y'], 500)).toEqual({ kind: 'replies', replies: ['ok'] })
    await expect(first.call(['z'], 500)).rejects.toThrow(/over/)
    expect(await first.close()).toBeUndefined()
  })

  test('opening an instance ends the last one', async () => {
    const { host } = setup()
    await host.load(wasm())
    const first = await host.open()
    const second = await host.open()
    await expect(first.call(['x'], 500)).rejects.toThrow(/over/)
    expect((await second.call(['x'], 500)).kind).toBe('replies')
  })

  test('a worker that dies mid-call is an error, and the next instance is made in a new worker', async () => {
    let dying = true
    const { pool, host } = setup(healthy(LIST, (ops, id) => (dying ? 'crash' : { type: 'replied', id, replies: ops.map(() => 'ok') })))
    await host.load(wasm())
    const session = await host.open()
    await expect(session.call(['x'], 500)).rejects.toThrow('the worker died')
    expect(pool.discarded).toHaveLength(1)
    dying = false
    const next = await host.open()
    expect((await next.call(['x'], 500)).kind).toBe('replies')
    expect(pool.ports).toHaveLength(2)
  })

  test('a replacement worker that cannot load the module is stopped, and the next instance tries again in another', async () => {
    // The first worker loads, and its call hangs. The second worker's load is refused. The third takes the module.
    let loads = 0
    const pool = new FakePool((request) => {
      if (request.type === 'load') {
        loads += 1
        return loads === 2 ? { type: 'failed', id: request.id, kind: 'abi', message: 'no memory export' } : { type: 'loaded', id: request.id, list: LIST }
      }
      if (request.type === 'open') return { type: 'opened', id: request.id }
      if (request.type === 'call') return loads === 1 ? 'hang' : { type: 'replied', id: request.id, replies: request.ops.map(() => 'ok') }
      return { type: 'closed', id: request.id }
    })
    const clock = new FakeClock()
    const host = createHost({ pool, timers: clock })
    await host.load(wasm())
    const first = await host.open()
    const calling = first.call(['x'], 500)
    await until(() => clock.pending > 0)
    clock.advance(500)
    expect(await calling).toEqual({ kind: 'timeout' })

    await expect(host.open()).rejects.toThrow('no memory export')
    expect(pool.ports).toHaveLength(2)
    expect(pool.discarded).toContain(pool.ports[1])

    const third = await host.open()
    expect(pool.ports).toHaveLength(3)
    expect(await third.call(['y'], 500)).toEqual({ kind: 'replies', replies: ['ok'] })
  })

  test('opening before a module is loaded is an error, not a worker', async () => {
    const { pool, host } = setup()
    await expect(host.open()).rejects.toThrow('no module is loaded')
    expect(pool.ports).toHaveLength(0)
  })

  test('dispose stops the worker and forgets the module', async () => {
    const { pool, host } = setup()
    await host.load(wasm())
    host.dispose()
    expect(pool.discarded).toEqual([pool.ports[0]])
    await expect(host.open()).rejects.toThrow('no module is loaded')
  })
})
