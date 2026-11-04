/*
 * W0-T10's acceptance check 1: "The conformance suite passes against the memory store."
 *
 * Each case of the suite runs as a test of its own, so a failure names the rule that broke. The suite is the same code that
 * W0-T11's Playwright spec runs against IndexedDB; this file adds what only the memory store promises.
 */
import { describe, expect, test } from 'bun:test'
import { MemoryStore, RESOLVERS, SCHEMA_VERSION } from '@es/ledger'
import { makeAssert, runStoreConformance, STORE_CONFORMANCE_CASES } from '@es/ledger/conformance'
import { copy, EXAMPLES } from './support'

describe('the conformance suite, against the memory store', () => {
  test('it has the cases that the contract needs', () => {
    expect(STORE_CONFORMANCE_CASES.length).toBeGreaterThanOrEqual(15)
    expect(new Set(STORE_CONFORMANCE_CASES.map((c) => c.name)).size).toBe(STORE_CONFORMANCE_CASES.length)
  })

  test.each(STORE_CONFORMANCE_CASES.map((c) => [c.name, c] as const))('%s', async (_name, conformanceCase) => {
    await conformanceCase.run(() => new MemoryStore(), makeAssert())
  })

  test('runStoreConformance runs them all and reports each', async () => {
    const seen: string[] = []
    const failed: string[] = []
    await runStoreConformance(
      () => new MemoryStore(),
      makeAssert(),
      (name, error) => {
        seen.push(name)
        if (error !== undefined) failed.push(name)
      },
    )
    expect(seen).toEqual(STORE_CONFORMANCE_CASES.map((c) => c.name))
    expect(failed).toEqual([])
  })

  test('every case makes its own store, so no case sees another\'s data', async () => {
    let made = 0
    await runStoreConformance(() => {
      made += 1
      return new MemoryStore()
    }, makeAssert())
    expect(made).toBeGreaterThanOrEqual(STORE_CONFORMANCE_CASES.length)
  })
})

describe('the memory store', () => {
  test('is seeded with copies', async () => {
    const event = copy(EXAMPLES.ack)
    const store = new MemoryStore({ events: [event], meta: { deviceId: 'dev-1', schemaVersion: SCHEMA_VERSION } })
    event.at = '2000-01-01T00:00:00.000Z'
    const info = await store.open()
    expect(info).toEqual({ backend: 'memory', schemaVersion: SCHEMA_VERSION, readOnly: false })
    expect((await store.readAll()).events[0].at).toBe(EXAMPLES.ack.at)
  })

  test('reads a copy each time', async () => {
    const store = new MemoryStore({ events: [copy(EXAMPLES.ack)] })
    await store.open()
    const first = await store.readAll()
    const second = await store.readAll()
    expect(first).toEqual(second)
    expect(first.events[0]).not.toBe(second.events[0])
  })

  test('does not write once it is closed, and writes again when it is opened', async () => {
    const store = new MemoryStore()
    await store.open()
    store.close()
    await expect(store.commit({ putEvents: [copy(EXAMPLES.ack)] }, RESOLVERS)).rejects.toThrow('closed')
    await store.open()
    await store.commit({ putEvents: [copy(EXAMPLES.ack)] }, RESOLVERS)
    expect((await store.readAll()).events).toHaveLength(1)
  })

  test('tells the app when another context upgrades the database, and stops when told to', async () => {
    const store = new MemoryStore()
    await store.open()
    let told = 0
    const stop = store.onVersionChange(() => {
      told += 1
    })
    let toldAfterStop = 0
    const stopped = store.onVersionChange(() => {
      toldAfterStop += 1
    })
    stopped()
    store.simulateVersionChange()
    expect(told).toBe(1)
    expect(toldAfterStop).toBe(0)
    await expect(store.commit({}, RESOLVERS)).rejects.toThrow('closed')
    stop()
  })

  test('reports the schema version it holds once one was written', async () => {
    const store = new MemoryStore()
    expect((await store.open()).schemaVersion).toBeNull()
    await store.commit({ putMeta: { schemaVersion: SCHEMA_VERSION } }, RESOLVERS)
    expect((await store.open()).schemaVersion).toBe(SCHEMA_VERSION)
  })
})
