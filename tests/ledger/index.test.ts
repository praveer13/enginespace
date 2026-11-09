/*
 * The package's public surface. Two star exports that give one name twice would drop it without a word, so this lists every name
 * a caller may count on, and checks that the contract's test support stays out of the production index.
 */
import { expect, test } from 'bun:test'
import * as ledger from '@es/ledger'
import * as conformance from '@es/ledger/conformance'

const VALUES = [
  // types.ts
  'SCHEMA_VERSION',
  'EVENT_VERSION',
  'EXPORT_SCHEMA',
  'LIMITS',
  'KINDS',
  'GRADED_KINDS',
  'CONFIDENCES',
  // ids.ts
  'uuidFactory',
  'seededIds',
  'systemClock',
  'dayOf',
  'isIsoInstant',
  'isLocalDay',
  // codec.ts
  'decodeEvent',
  'decodeReceiptRecord',
  'decodeWorkingRecord',
  'stampEvent',
  'fitsJson',
  'parseChallengeToken',
  'KIND_REFS',
  'IMPORT_ERROR_MESSAGES',
  'parseExport',
  'buildExport',
  'serializeExport',
  // merge.ts
  'canonicalJson',
  'sameJson',
  'compareEvents',
  'compareReceipts',
  'canonicalEvent',
  'mergeReceiptRecord',
  'lwwWorking',
  'RESOLVERS',
  'mergeEvents',
  'mergeReceipts',
  'mergeLedgers',
  'normalizeLedger',
  'sameLedger',
  'planImport',
  'planUndo',
  // memory-store.ts
  'MemoryStore',
  'checkpointMeta',
  // provenance.ts
  'PROVENANCES',
  'isProvenance',
  'PROVENANCE_WEIGHTS',
  'weightOf',
] as const

test('the index exports every name that a caller counts on', () => {
  for (const name of VALUES) expect(Object.keys(ledger)).toContain(name)
})

test('the index exports nothing else', () => {
  expect(Object.keys(ledger).sort()).toEqual([...VALUES].sort())
})

test('the conformance suite is reached by its own path and is not in the index', () => {
  for (const name of ['STORE_CONFORMANCE_CASES', 'runStoreConformance', 'makeAssert']) {
    expect(Object.keys(conformance)).toContain(name)
    expect(Object.keys(ledger)).not.toContain(name)
  }
})
