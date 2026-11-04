/*
 * The schema guard (ARCHITECTURE §7.4): a bundle goes read-only, and asks for a reload, as soon as it learns that a newer one
 * owns the data. W0-T11's acceptance check 3 at the level of the pure checks; e2e/ledger-conformance.spec.ts checks it in a
 * real browser against a database that a newer bundle wrote.
 */
import { describe, expect, test } from 'bun:test'
import type { ReadOnlyReason, StoreInfo } from '@es/ledger'
import { checkMessage, checkStoreInfo, checkVersionChange, createGuard, READ_ONLY_NOTES, readOnlyNote } from '@/evidence/guard'

const REASONS: ReadOnlyReason[] = ['newer-schema', 'newer-idb', 'versionchange']
const open = (schemaVersion: number | null): StoreInfo => ({ backend: 'idb', schemaVersion, readOnly: false })

describe('checkStoreInfo', () => {
  test('a database at a newer IndexedDB version is read-only for the reason the store gave', () => {
    expect(checkStoreInfo(1, { backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' })).toBe('newer-idb')
    expect(checkStoreInfo(1, { backend: 'idb', schemaVersion: null, readOnly: true })).toBe('newer-idb')
  })

  test('a newer schemaVersion inside the database is read-only', () => {
    expect(checkStoreInfo(1, open(2))).toBe('newer-schema')
    expect(checkStoreInfo(1, open(1000))).toBe('newer-schema')
  })

  test('an equal, an older or a missing schemaVersion is not a reason', () => {
    expect(checkStoreInfo(2, open(2))).toBeNull()
    expect(checkStoreInfo(2, open(1))).toBeNull()
    expect(checkStoreInfo(2, open(null))).toBeNull()
  })
})

describe('checkMessage', () => {
  test('a message from a newer bundle is a reason, since its events may not be readable here', () => {
    expect(checkMessage(1, { schemaVersion: 2 })).toBe('newer-schema')
  })

  test('a message from the same or an older bundle is not', () => {
    expect(checkMessage(2, { schemaVersion: 2 })).toBeNull()
    expect(checkMessage(2, { schemaVersion: 1 })).toBeNull()
  })

  test('a version that is not a usable number is not a reason: the channel is untrusted input', () => {
    for (const schemaVersion of [Number.NaN, Number.POSITIVE_INFINITY, '9', null, undefined, {}, [], true]) {
      expect(checkMessage(1, { schemaVersion })).toBeNull()
    }
  })
})

test('a version change is always a reason', () => {
  expect(checkVersionChange()).toBe('versionchange')
})

describe('createGuard', () => {
  test('starts writable', () => {
    const guard = createGuard(1)
    expect(guard.readOnly).toBe(false)
    expect(guard.reason).toBeUndefined()
  })

  test('latches on the first reason and keeps it, and tells its owner once', () => {
    const told: ReadOnlyReason[] = []
    const guard = createGuard(1, (reason) => told.push(reason))
    expect(guard.storeInfo(open(1))).toBe(false)
    expect(guard.message({ schemaVersion: 1 })).toBe(false)
    expect(told).toEqual([])

    expect(guard.message({ schemaVersion: 2 })).toBe(true)
    expect(guard.readOnly).toBe(true)
    expect(guard.reason).toBe('newer-schema')
    // Later reasons do not replace it, and do not tell again.
    expect(guard.versionChange()).toBe(true)
    expect(guard.storeInfo({ backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' })).toBe(true)
    expect(guard.reason).toBe('newer-schema')
    expect(told).toEqual(['newer-schema'])
  })

  test('each of the three reasons latches it', () => {
    const idb = createGuard(1)
    idb.storeInfo({ backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' })
    expect(idb.reason).toBe('newer-idb')

    const schema = createGuard(1)
    schema.storeInfo(open(5))
    expect(schema.reason).toBe('newer-schema')

    const change = createGuard(1)
    change.versionChange()
    expect(change.reason).toBe('versionchange')
  })

  test('plays an older and a newer bundle by the version it is given', () => {
    expect(createGuard(1).storeInfo(open(2))).toBe(true)
    expect(createGuard(2).storeInfo(open(2))).toBe(false)
    expect(createGuard(3).storeInfo(open(2))).toBe(false)
  })
})

describe('the notes', () => {
  test('there is a note for every reason, and it says what to do: reload', () => {
    expect(Object.keys(READ_ONLY_NOTES).sort()).toEqual([...REASONS].sort())
    for (const reason of REASONS) {
      expect(readOnlyNote(reason)).toBe(READ_ONLY_NOTES[reason])
      expect(readOnlyNote(reason)).toMatch(/Reload to /)
    }
  })

  test('each note says that this tab saves nothing and that the evidence is safe', () => {
    for (const reason of REASONS) {
      expect(readOnlyNote(reason)).toContain('read-only')
      expect(readOnlyNote(reason)).toContain('Your evidence is safe')
    }
  })
})
