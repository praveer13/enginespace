/*
 * IdbStore under Bun, where there is no IndexedDB. What can be checked without one is how it reads the browser's answers when
 * it opens a database: nothing there, a newer version, a failure. Everything that needs a database is the conformance suite's,
 * which e2e/ledger-conformance.spec.ts runs against IndexedDB in Chromium.
 */
import { describe, expect, test } from 'bun:test'
import { DB_NAME, deleteDatabase, IDB_VERSION, IdbStore } from '@/evidence/idb-store'

/** A factory whose open() fails the way a browser does: an event on the request, after the call returns. */
function failingFactory(error: { name: string }): { factory: IDBFactory; opened: { name: string; version: number | undefined }[] } {
  const opened: { name: string; version: number | undefined }[] = []
  const factory = {
    open(name: string, version?: number) {
      opened.push({ name, version })
      const request: Partial<Omit<IDBOpenDBRequest, 'error'>> & { error: unknown } = { error }
      queueMicrotask(() => request.onerror?.call(request as IDBOpenDBRequest, { preventDefault: () => undefined } as Event))
      return request
    },
  } as unknown as IDBFactory
  return { factory, opened }
}

describe('IdbStore.open', () => {
  test('the database is enginespace at version 1', () => {
    expect(DB_NAME).toBe('enginespace')
    expect(IDB_VERSION).toBe(1)
  })

  test('rejects where there is no IndexedDB, so the engine can fall back to memory', async () => {
    await expect(new IdbStore().open()).rejects.toThrow('IndexedDB is not available')
  })

  test('reports a newer database as read-only, and does not reject', async () => {
    const { factory, opened } = failingFactory({ name: 'VersionError' })
    const store = new IdbStore({ name: 'throwaway', factory })
    expect(await store.open()).toEqual({ backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' })
    expect(opened).toEqual([{ name: 'throwaway', version: 1 }])
    // It holds no connection, so it neither reads nor writes.
    await expect(store.readAll()).rejects.toThrow('not open')
    await expect(store.commit({ putMeta: { schemaVersion: 1 } }, { event: (a) => a, receipt: (a) => a, working: (a) => a })).rejects.toThrow('not open')
  })

  test('rejects any other failure to open, so the engine can fall back to memory', async () => {
    const { factory } = failingFactory({ name: 'UnknownError' })
    await expect(new IdbStore({ factory }).open()).rejects.toMatchObject({ name: 'UnknownError' })
  })

  test('rejects when the browser throws at once, as it can in a sandboxed frame', async () => {
    const factory = {
      open() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    } as unknown as IDBFactory
    await expect(new IdbStore({ factory }).open()).rejects.toMatchObject({ name: 'SecurityError' })
  })

  test('reads and checkpoints reject before it is opened', async () => {
    const store = new IdbStore({ factory: failingFactory({ name: 'x' }).factory })
    await expect(store.readAll()).rejects.toThrow('not open')
    await expect(store.listCheckpoints()).rejects.toThrow('not open')
    await expect(store.readCheckpoint('c1')).rejects.toThrow('not open')
    await expect(store.commit({ putMeta: { schemaVersion: 1 } }, { event: (a) => a, receipt: (a) => a, working: (a) => a })).rejects.toThrow('not open')
  })

  test('an empty commit needs no database', async () => {
    const store = new IdbStore({ factory: failingFactory({ name: 'x' }).factory })
    expect(await store.commit({}, { event: (a) => a, receipt: (a) => a, working: (a) => a })).toEqual({
      eventIds: [],
      clashIds: [],
      receiptIds: [],
      workingKeys: [],
      metaClaimed: [],
    })
  })

  test('close() is safe at any time, and version-change listeners can be removed', () => {
    const store = new IdbStore({ factory: failingFactory({ name: 'x' }).factory })
    store.close()
    store.close()
    const off = store.onVersionChange(() => undefined)
    off()
  })
})

describe('deleteDatabase', () => {
  test('rejects where there is no IndexedDB', async () => {
    await expect(deleteDatabase('throwaway')).rejects.toThrow('IndexedDB is not available')
  })
})
