/*
 * The conformance suite has teeth. A suite that every store passes proves nothing until a store that breaks a rule fails it,
 * so each store below breaks one rule of the contract on purpose (ARCHITECTURE §7.1) and must fail the case that states it.
 * The idea is ASSESSMENT.md §13's: check the checks.
 */
import { describe, expect, test } from 'bun:test'
import { checkpointMeta, MemoryStore } from '@es/ledger'
import type { Checkpoint, CheckpointMeta, CommitResult, LedgerEvent, Resolvers, StoreContents, StoreTx } from '@es/ledger'
import { makeAssert, runStoreConformance, STORE_CONFORMANCE_CASES } from '@es/ledger/conformance'
import type { MakeStore } from '@es/ledger/conformance'

/** The names of the cases a store fails. */
async function failures(makeStore: MakeStore): Promise<string[]> {
  const failed: string[] = []
  await runStoreConformance(makeStore, makeAssert(), (name, error) => {
    if (error !== undefined) failed.push(name)
  }).catch(() => undefined)
  return failed
}

/** A store that ignores the rule it is given for events and applies its own. */
class WithEventRule extends MemoryStore {
  private readonly rule: Resolvers['event']
  constructor(rule: Resolvers['event']) {
    super()
    this.rule = rule
  }
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    return super.commit(tx, { ...resolve, event: this.rule })
  }
}

/** Applies the events last, after everything else has been written: a failure in them leaves the rest behind. */
class NotAtomic extends MemoryStore {
  override async commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    const { putEvents, ...rest } = tx
    const first = await super.commit(rest, resolve)
    const second = await super.commit({ putEvents }, resolve)
    return { ...first, eventIds: second.eventIds, clashIds: second.clashIds }
  }
}

/** Writes before it deletes and clears. */
class PutsFirst extends MemoryStore {
  override async commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    const { clear, deleteEventIds, deleteReceiptIds, deleteWorkingKeys, deleteMeta, deleteCheckpointIds, ...puts } = tx
    const result = await super.commit(puts, resolve)
    await super.commit({ clear, deleteEventIds, deleteReceiptIds, deleteWorkingKeys, deleteMeta, deleteCheckpointIds }, resolve)
    return result
  }
}

/** Hands out the very objects it was given. */
class SharesReferences extends MemoryStore {
  private readonly live = new Map<string, LedgerEvent>()
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    for (const event of tx.putEvents ?? []) this.live.set(event.id, event)
    return super.commit(tx, resolve)
  }
  override async readAll(): Promise<StoreContents> {
    const all = await super.readAll()
    return { ...all, events: all.events.map((event) => this.live.get(event.id) ?? event) }
  }
}

/** Never drops a checkpoint. */
class KeepsEveryCheckpoint extends MemoryStore {
  private readonly every: Checkpoint[] = []
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    if (tx.putCheckpoint !== undefined) this.every.push(structuredClone(tx.putCheckpoint))
    return super.commit(tx, resolve)
  }
  override async listCheckpoints(): Promise<CheckpointMeta[]> {
    return this.every.map(checkpointMeta).reverse()
  }
}

/** Takes a claim for an overwrite. */
class ClaimsOverwrite extends MemoryStore {
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    const { putMetaIfAbsent, ...rest } = tx
    return super.commit({ ...rest, putMeta: { ...rest.putMeta, ...putMetaIfAbsent } }, resolve)
  }
}

/** Never says that two events clashed. */
class SilentOnClashes extends MemoryStore {
  override async commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    return { ...(await super.commit(tx, resolve)), clashIds: [] }
  }
}

/** Keeps whatever record it is told to, whatever the rule says. */
class WithWorkingRule extends MemoryStore {
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    return super.commit(tx, { ...resolve, working: (existing) => existing })
  }
}

class WithReceiptRule extends MemoryStore {
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    return super.commit(tx, { ...resolve, receipt: (_existing, incoming) => incoming })
  }
}

/** Forgets the reports of a receipt when it is listed again: it keeps only the first record it saw. */
class FirstReceiptWins extends MemoryStore {
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    return super.commit(tx, { ...resolve, receipt: (existing) => existing })
  }
}

/** Reports a checkpoint list with the payload still in it. */
class ListsPayloads extends MemoryStore {
  override async listCheckpoints(): Promise<CheckpointMeta[]> {
    const metas = await super.listCheckpoints()
    return Promise.all(metas.map(async (meta) => ({ ...meta, ...(await this.readCheckpoint(meta.id)) }))) as unknown as CheckpointMeta[]
  }
}

/** A store that only appends and never deletes. */
class NeverDeletes extends MemoryStore {
  override commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    const rest: StoreTx = { ...tx }
    for (const key of ['deleteEventIds', 'deleteReceiptIds', 'deleteWorkingKeys', 'deleteMeta', 'deleteCheckpointIds'] as const) delete rest[key]
    return super.commit(rest, resolve)
  }
}

describe('a store that keeps the contract fails nothing', () => {
  test('the memory store', async () => {
    expect(await failures(() => new MemoryStore())).toEqual([])
  })
})

describe('a store that breaks a rule fails the case that states it', () => {
  const EVENT_CLASH = 'a clash on an id keeps the earlier at, whichever arrives first, and flags the id'
  const BATCH_CLASH = 'two events with one id inside a batch settle to the earlier at'
  const cases: [string, MakeStore, string[]][] = [
    ['the later at wins a clash', () => new WithEventRule((existing, incoming) => (incoming.at > existing.at ? incoming : existing)), [EVENT_CLASH, BATCH_CLASH]],
    ['the stored event is the one that stays', () => new WithEventRule((existing) => existing), [EVENT_CLASH, BATCH_CLASH]],
    ['a later write modifies a stored event', () => new WithEventRule((_existing, incoming) => incoming), [EVENT_CLASH, BATCH_CLASH]],
    ['a failure leaves the rest of the commit behind', () => new NotAtomic(), ['a resolver that throws leaves no partial write']],
    ['it writes before it deletes', () => new PutsFirst(), ['a commit applies clear, then deletes, then puts', 'clear empties the stores it names and no others']],
    ['it hands out the objects it was given', () => new SharesReferences(), ['stored data is isolated from the caller']],
    ['it keeps every checkpoint', () => new KeepsEveryCheckpoint(), ['a store keeps only the newest checkpoints']],
    ['a claim overwrites', () => new ClaimsOverwrite(), ['putMetaIfAbsent claims a key once and never overwrites it']],
    ['it never says that events clashed', () => new SilentOnClashes(), [EVENT_CLASH, BATCH_CLASH]],
    ['the first working record wins', () => new WithWorkingRule(), ['working records are last-writer-wins']],
    ['a receipt is replaced and not joined', () => new WithReceiptRule(), ['a receipt is inserted once, and re-verification adds a report']],
    ['the first receipt stays', () => new FirstReceiptWins(), ['a receipt is inserted once, and re-verification adds a report']],
    ['the checkpoint list carries the payload', () => new ListsPayloads(), ['a checkpoint reads back whole, and the list holds counts only']],
    ['it never deletes', () => new NeverDeletes(), ['deletes remove events, receipts, working records, meta and checkpoints', 'a commit applies clear, then deletes, then puts']],
  ]

  test.each(cases)('%s', async (_what, makeStore, expected) => {
    const failed = await failures(makeStore)
    for (const name of expected) expect(failed).toContain(name)
    // A defect is caught by the case that states the rule, and not by every case.
    expect(failed.length).toBeLessThan(STORE_CONFORMANCE_CASES.length)
  })

  test('the cases named here all exist', () => {
    const names = new Set(STORE_CONFORMANCE_CASES.map((c) => c.name))
    for (const [, , expected] of cases) for (const name of expected) expect(names.has(name)).toBe(true)
  })
})

describe('the assert object', () => {
  const a = makeAssert()

  test('ok throws its message on a falsy value', () => {
    expect(() => a.ok(true, 'fine')).not.toThrow()
    expect(() => a.ok(0, 'zero is not ok')).toThrow('zero is not ok')
  })

  test('equal uses ===, and says what it expected and what it got', () => {
    expect(() => a.equal(1, 1, 'same')).not.toThrow()
    expect(() => a.equal(1, '1', 'types differ')).toThrow('types differ (expected 1, got 1)')
    expect(() => a.equal(undefined, null, 'nothing')).toThrow('expected null, got undefined')
  })

  test('deepEqual ignores the order of keys and nothing else', () => {
    expect(() => a.deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }, 'same')).not.toThrow()
    expect(() => a.deepEqual({ a: 1 }, { a: 2 }, 'differs')).toThrow('differs (expected {"a":2}, got {"a":1})')
    expect(() => a.deepEqual([1, 2], [2, 1], 'order')).toThrow('order')
  })
})

test('runStoreConformance rejects with the first failure, after it has run every case', async () => {
  const seen: string[] = []
  await expect(
    runStoreConformance(() => new NotAtomic(), makeAssert(), (name) => {
      seen.push(name)
    }),
  ).rejects.toThrow()
  expect(seen).toEqual(STORE_CONFORMANCE_CASES.map((c) => c.name))
})
