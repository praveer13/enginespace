/*
 * Import and undo (ARCHITECTURE §7.5): a file the learner chose is untrusted, so it is read within a limit, decoded by the
 * strict codec and planned before anything is written. The laws of merge and replace (200 seeds each) are tests/ledger's;
 * this file holds what the browser layer adds: reading a file, gzip, the refusals, and the preview.
 */
import { describe, expect, test } from 'bun:test'
import { buildExport, LIMITS, serializeExport } from '@es/ledger'
import type { CheckpointMeta, LedgerEvent } from '@es/ledger'
import { gzipBytes } from '@/evidence/export'
import { pickCheckpoint, planFromText, readImportFile, REFUSAL_MESSAGES, refuse } from '@/evidence/import'
import { copy, EXAMPLES, randomLedger, snapshot } from '../ledger/support'
import { MemoryStore } from '@es/ledger'

const AT = '2026-11-04T09:30:00.000Z'
const CONTEXT = { checkpointId: 'cp-1', at: '2026-11-10T08:00:00.000Z' }
const fileOf = (events: LedgerEvent[] = [copy(EXAMPLES.play)], device = 'dev-b2') => serializeExport(buildExport({ ledger: { events, receipts: [] }, device, exportedAt: AT }))

describe('readImportFile', () => {
  test('reads plain JSON', async () => {
    const text = fileOf()
    expect(await readImportFile(new Blob([text]))).toEqual({ ok: true, text })
  })

  test('reads gzip, sniffed by its first two bytes and not by a name', async () => {
    const text = fileOf()
    const zipped = await gzipBytes(new TextEncoder().encode(text))
    expect(await readImportFile(new File([zipped], 'backup.json'))).toEqual({ ok: true, text })
    expect(await readImportFile(new File([zipped], 'backup.json.gz'))).toEqual({ ok: true, text })
  })

  test('refuses a file over the limit before reading it', async () => {
    const big = new Blob([new Uint8Array(LIMITS.importBytes + 1)])
    expect(await readImportFile(big)).toEqual(refuse('too-large'))
  })

  test('refuses a gzip that inflates past the limit, and stops reading it', async () => {
    // 21 MiB of zeros is about 20 KB gzipped: a small file that is a large one.
    const bomb = await gzipBytes(new Uint8Array(LIMITS.importBytes + 1024 * 1024))
    expect(bomb.byteLength).toBeLessThan(1024 * 1024)
    expect(await readImportFile(new Blob([bomb]))).toEqual(refuse('too-large'))
  })

  test('refuses a gzip that is damaged', async () => {
    const zipped = await gzipBytes(new TextEncoder().encode(fileOf()))
    const damaged = zipped.slice(0, Math.floor(zipped.byteLength / 2))
    const result = await readImportFile(new Blob([damaged]))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('parse')
  })

  test('hands a file that is not JSON on to the codec, which says what is wrong', async () => {
    const read = await readImportFile(new Blob(['this is not json']))
    expect(read).toEqual({ ok: true, text: 'this is not json' })
    const planned = planFromText('this is not json', { events: [], receipts: [] }, 'merge', CONTEXT)
    expect(planned).toEqual(refuse('parse'))
  })
})

describe('planFromText', () => {
  test('previews a merge without writing anything', async () => {
    const store = new MemoryStore({ events: [copy(EXAMPLES.item)] })
    await store.open()
    const before = await snapshot(store)
    const planned = planFromText(fileOf([copy(EXAMPLES.play), copy(EXAMPLES.item)]), before, 'merge', CONTEXT)
    expect(planned.ok).toBe(true)
    if (!planned.ok) return
    const { preview, plan } = planned.planned
    expect(preview.mode).toBe('merge')
    expect(preview.summary).toMatchObject({ fileEvents: 2, newEvents: 1, sameEvents: 1, clashedEvents: 0, removedEvents: 0 })
    expect(preview.duplicates).toBe(0)
    expect(preview.exportedAt).toBe(AT)
    expect(preview.device).toBe('dev-b2')
    expect(plan.checkpoint?.id).toBe('cp-1')
    // Planning is pure: the store is as it was.
    expect(await snapshot(store)).toEqual(before)
  })

  test('previews a replace: it says what would go', () => {
    const current = { events: [copy(EXAMPLES.item), copy(EXAMPLES.ack)], receipts: [] }
    const planned = planFromText(fileOf([copy(EXAMPLES.play)]), current, 'replace', CONTEXT)
    expect(planned.ok && planned.planned.preview.summary).toMatchObject({ mode: 'replace', newEvents: 1, removedEvents: 2 })
  })

  test('lists the ids that clash, and which event stays', () => {
    const mine = { ...copy(EXAMPLES.play), at: '2026-11-04T09:00:00.000Z' }
    const theirs = { ...copy(EXAMPLES.play), at: '2026-11-04T10:00:00.000Z', score: 0.1 }
    const planned = planFromText(fileOf([theirs]), { events: [mine], receipts: [] }, 'merge', CONTEXT)
    expect(planned.ok && planned.planned.preview.clashes).toEqual([{ id: mine.id, kept: mine, flagged: theirs }])
  })

  test('counts the records a file repeated', () => {
    const file = JSON.parse(fileOf([copy(EXAMPLES.play)])) as { events: unknown[] }
    file.events.push(file.events[0])
    const planned = planFromText(JSON.stringify(file), { events: [], receipts: [] }, 'merge', CONTEXT)
    expect(planned.ok && planned.planned.preview.duplicates).toBe(1)
  })

  test('refuses what the codec refuses, with the codec\'s own words', () => {
    const empty = { events: [], receipts: [] }
    expect(planFromText('{', empty, 'merge', CONTEXT)).toEqual(refuse('parse'))
    expect(planFromText('[]', empty, 'merge', CONTEXT)).toEqual(refuse('unknown-format'))
    expect(planFromText(JSON.stringify({ schema: 'something/else@1' }), empty, 'merge', CONTEXT)).toEqual(refuse('unknown-format'))
    const newer = JSON.parse(fileOf()) as { schemaVersion: number }
    newer.schemaVersion = 99
    expect(planFromText(JSON.stringify(newer), empty, 'merge', CONTEXT)).toEqual(refuse('newer-schema'))
    const tampered = JSON.parse(fileOf()) as { events: { score: number }[] }
    tampered.events[0].score = 7
    const refused = planFromText(JSON.stringify(tampered), empty, 'merge', CONTEXT)
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.error).toBe('invalid')
    expect(!refused.ok && refused.detail).toContain('events[0]')
  })

  test('a seeded ledger imported twice plans nothing the second time', async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const file = randomLedger(seed)
      const text = serializeExport(buildExport({ ledger: file, device: 'dev-b2', exportedAt: AT }))
      const first = planFromText(text, { events: [], receipts: [] }, 'merge', CONTEXT)
      expect(first.ok).toBe(true)
      if (!first.ok) continue
      const second = planFromText(text, first.planned.plan.next, 'merge', CONTEXT)
      expect(second.ok && second.planned.plan.checkpoint).toBeNull()
      expect(second.ok && second.planned.plan.tx).toEqual({})
    }
  })
})

describe('pickCheckpoint', () => {
  const list: CheckpointMeta[] = [
    { id: 'new', reason: 'import-merge', at: '2026-11-05T00:00:00.000Z', addedEvents: 1, restoredEvents: 0, addedReceipts: 0, restoredReceipts: 0 },
    { id: 'old', reason: 'import-replace', at: '2026-11-04T00:00:00.000Z', addedEvents: 2, restoredEvents: 1, addedReceipts: 0, restoredReceipts: 0 },
  ]

  test('is the newest by default, and the one asked for by id', () => {
    expect(pickCheckpoint(list)?.id).toBe('new')
    expect(pickCheckpoint(list, 'old')?.id).toBe('old')
  })

  test('is null when there is none', () => {
    expect(pickCheckpoint([])).toBeNull()
    expect(pickCheckpoint(list, 'missing')).toBeNull()
  })
})

test('every refusal has a message', () => {
  for (const code of ['too-large', 'parse', 'unknown-format', 'newer-schema', 'invalid', 'read-only', 'no-checkpoint', 'failed'] as const) {
    expect(REFUSAL_MESSAGES[code].length).toBeGreaterThan(10)
  }
  expect(REFUSAL_MESSAGES['newer-schema']).toContain('reload')
})
