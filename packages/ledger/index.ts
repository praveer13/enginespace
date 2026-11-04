// The evidence ledger core (ARCHITECTURE §7, D-024): the event envelope and its ten kinds, ids, the strict codec, merge, import and
// undo, a memory store and the provenance names. The IndexedDB adapter, the outbox and the tab sync live in src/evidence
// (W0-T11). This package imports packages/schema and nothing else of ours (§2.3, enforced by ESLint and verify:boundaries),
// and it builds under tsconfig.app.json.
//
// How the pieces fit:
//   write   stampEvent(context, draft) makes and checks an event; store.commit({ putEvents: [event] }, RESOLVERS) keeps it.
//   read    store.readAll() gives the events and receipts; every status is derived from them when it is shown.
//   export  buildExport({ ledger, device, exportedAt }), then serializeExport(file): the same ledger is the same bytes.
//   import  parseExport(text), then planImport(ledger, file, mode, { checkpointId, at }); show plan.summary, then commit plan.tx.
//   undo    store.listCheckpoints() and readCheckpoint(id), then planUndo(ledger, checkpoint); commit plan.tx.
//
// conformance.ts is the contract every store keeps. It is test support, so this index leaves it out: import
// '@es/ledger/conformance' where a store is under test.
export * from './types'
export * from './ids'
export * from './codec'
export * from './merge'
export * from './memory-store'
export * from './provenance'
