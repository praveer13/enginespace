/*
 * The write-ahead outbox (ARCHITECTURE §7.4, kernelspace's I9). An event waits in `working` under `outbox:<id>`, and one
 * transaction then writes it to `events` and deletes the record. A crash between the two leaves the record, and the next start
 * flushes it. A record that does not decode as an event is never flushed and never deleted.
 */
import { describe, expect, test } from 'bun:test'
import { decodeEvent, MemoryStore, RESOLVERS } from '@es/ledger'
import type { Json, LedgerEvent, WorkingRecord } from '@es/ledger'
import { isOutboxKey, OUTBOX_PREFIX, outboxEntry, outboxKey, recoverOutbox, settleTx, stageTx } from '@/evidence/outbox'
import { copy, EXAMPLES } from '../ledger/support'

const AT = '2026-11-04T10:00:00.000Z'

const entryOf = (event: LedgerEvent): WorkingRecord => outboxEntry(event, AT, 'dev-a1')

describe('keys', () => {
  test('an outbox key is the prefix and the event id', () => {
    expect(OUTBOX_PREFIX).toBe('outbox:')
    expect(outboxKey('e1')).toBe('outbox:e1')
    expect(isOutboxKey('outbox:e1')).toBe(true)
    expect(isOutboxKey('settings:reduced-motion')).toBe(false)
    expect(isOutboxKey('xoutbox:e1')).toBe(false)
  })
})

describe('outboxEntry', () => {
  test('holds the event as the value, under the event\'s key, stamped with the time and the device', () => {
    const event = copy(EXAMPLES.play)
    const entry = entryOf(event)
    expect(entry.key).toBe(`outbox:${event.id}`)
    expect(entry.at).toBe(AT)
    expect(entry.dev).toBe('dev-a1')
    expect(entry.value).toEqual(event as unknown as Json)
  })

  test('is a record that the codec reads back, for every kind', () => {
    for (const event of Object.values(EXAMPLES)) {
      const entry = entryOf(copy(event))
      const decoded = decodeEvent(entry.value)
      expect(decoded.ok).toBe(true)
      expect(decoded.ok && decoded.value).toEqual(event)
    }
  })

  test('shares nothing with the event it was made from', () => {
    const event = copy(EXAMPLES.item)
    const entry = entryOf(event)
    ;(event.data.answer as { lo: number }).lo = 99
    expect((entry.value as { data: { answer: { lo: number } } }).data.answer.lo).toBe(1)
  })

  test('refuses a record the working codec would refuse, where the event is written and not at the next start', () => {
    expect(() => outboxEntry(copy(EXAMPLES.ack), 'yesterday', 'dev-a1')).toThrow('cannot stage')
    expect(() => outboxEntry(copy(EXAMPLES.ack), AT, 'not a device id!')).toThrow('cannot stage')
  })
})

describe('the two steps', () => {
  test('step one waits in working, and step two writes the events and deletes their records in one transaction', () => {
    const a = copy(EXAMPLES.ack)
    const b = copy(EXAMPLES.item)
    expect(stageTx(entryOf(a))).toEqual({ putWorking: [entryOf(a)] })
    expect(settleTx([a, b])).toEqual({ putEvents: [a, b], deleteWorkingKeys: [`outbox:${a.id}`, `outbox:${b.id}`] })
  })

  test('both steps against a store leave the event and no record', async () => {
    const store = new MemoryStore()
    await store.open()
    const event = copy(EXAMPLES.play)
    await store.commit(stageTx(entryOf(event)), RESOLVERS)
    expect((await store.readAll()).working.map((record) => record.key)).toEqual([`outbox:${event.id}`])
    await store.commit(settleTx([event]), RESOLVERS)
    const all = await store.readAll()
    expect(all.events).toEqual([event])
    expect(all.working).toEqual([])
  })

  test('a crash after step one leaves the event waiting, and a flush writes it', async () => {
    const store = new MemoryStore()
    await store.open()
    const event = copy(EXAMPLES.play)
    await store.commit(stageTx(entryOf(event)), RESOLVERS)
    // ... the tab dies here. The next start finds the record.
    const recovered = recoverOutbox((await store.readAll()).working)
    expect(recovered).toEqual({ events: [event], keys: [`outbox:${event.id}`], stuck: [] })
    await store.commit(settleTx(recovered.events), RESOLVERS)
    expect((await store.readAll()).events).toEqual([event])
    expect((await store.readAll()).working).toEqual([])
  })

  test('flushing is idempotent: a second flush, or the tab that was only slow, changes nothing', async () => {
    const store = new MemoryStore()
    await store.open()
    const event = copy(EXAMPLES.play)
    await store.commit(stageTx(entryOf(event)), RESOLVERS)
    await store.commit(settleTx([event]), RESOLVERS)
    const again = await store.commit(settleTx([event]), RESOLVERS)
    expect(again).toEqual({ eventIds: [], clashIds: [], receiptIds: [], workingKeys: [], metaClaimed: [] })
    expect((await store.readAll()).events).toEqual([event])
  })
})

describe('recoverOutbox', () => {
  test('flushes the records that decode as events, and leaves every other record out', () => {
    const good = copy(EXAMPLES.play)
    const working: WorkingRecord[] = [
      entryOf(good),
      { key: 'settings:reduced-motion', value: true, at: AT, dev: 'dev-a1' },
      { key: 'draft:tr2.l3', value: { text: 'not an event' }, at: AT, dev: 'dev-a1' },
    ]
    expect(recoverOutbox(working)).toEqual({ events: [good], keys: [`outbox:${good.id}`], stuck: [] })
  })

  test('leaves a record alone when its value is not an event', () => {
    const stuck: WorkingRecord[] = [
      { key: 'outbox:x1', value: 'text', at: AT, dev: 'dev-a1' },
      { key: 'outbox:x2', value: { id: 'x2', kind: 'quest' }, at: AT, dev: 'dev-a1' },
      { key: 'outbox:x3', value: { ...(copy(EXAMPLES.ack) as object), score: 1 } as unknown as Json, at: AT, dev: 'dev-a1' },
      { key: 'outbox:x4', value: { ...(copy(EXAMPLES.item) as object), score: 2 } as unknown as Json, at: AT, dev: 'dev-a1' },
    ]
    const recovered = recoverOutbox(stuck)
    expect(recovered.events).toEqual([])
    expect(recovered.keys).toEqual([])
    expect(recovered.stuck.map((entry) => entry.key)).toEqual(['outbox:x1', 'outbox:x2', 'outbox:x3', 'outbox:x4'])
    for (const entry of recovered.stuck) expect(entry.reason.length).toBeGreaterThan(0)
  })

  test('leaves a record alone when it holds an event filed under another id, which is somebody\'s mistake', () => {
    const event = copy(EXAMPLES.play)
    const misfiled: WorkingRecord = { ...entryOf(event), key: 'outbox:another-id' }
    const recovered = recoverOutbox([misfiled])
    expect(recovered.events).toEqual([])
    expect(recovered.stuck).toEqual([{ key: 'outbox:another-id', reason: `the event ${event.id} is filed under another id` }])
  })

  test('checks the event as strictly as an import does: an unknown key, a bad ref and a score out of range are refused', () => {
    const bad = [
      { ...copy(EXAMPLES.item), extra: 1 },
      { ...copy(EXAMPLES.item), ref: 'lesson:tr2.l3' },
      { ...copy(EXAMPLES.item), score: 1.5 },
      { ...copy(EXAMPLES.item), weight: 1 },
    ]
    const working = bad.map((event, index): WorkingRecord => ({ key: `outbox:bad${index}`, value: { ...event, id: `bad${index}` } as unknown as Json, at: AT, dev: 'dev-a1' }))
    const recovered = recoverOutbox(working)
    expect(recovered.events).toEqual([])
    expect(recovered.stuck).toHaveLength(bad.length)
  })

  test('an empty working store recovers nothing', () => {
    expect(recoverOutbox([])).toEqual({ events: [], keys: [], stuck: [] })
  })
})
