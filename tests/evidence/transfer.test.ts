/*
 * Moving the ledger in and out (W0-T22; ARCHITECTURE §7.5): the steps that /evidence and /settings use, run against a real
 * engine on the memory store. The panels that draw them need a DOM, and run in a browser (e2e/settings.spec.ts and
 * e2e/evidence.spec.ts). What is checked here is the order of things and what each step says: an export is a file the learner
 * keeps, an import is previewed before it is written and can be undone, a file that is not ours is refused whole, and a
 * reset erases what the ledger holds and then runs what the page asked for.
 */
import { describe, expect, test } from 'bun:test'
import { decodeWorkingRecord } from '@es/ledger'
import type { LedgerEvent } from '@es/ledger'
import type { SavedFile } from '@/evidence/export'
import { commitImport, eraseDevice, exportAndSave, formatWhen, openImportFile, previewMode, undoImport } from '@/evidence/transfer'
import type { ImportFlow, PreviewFlow, TransferApi } from '@/evidence/transfer'
import { copy, EXAMPLES } from '../ledger/support'
import { openTab, SharedDb } from './support'

const event = (id: string, patch: Partial<LedgerEvent> = {}): LedgerEvent => ({ ...copy(EXAMPLES.item), id, ...patch }) as LedgerEvent

async function tab(...events: LedgerEvent[]) {
  const db = new SharedDb({ events })
  const opened = await openTab(db, null)
  return { ...opened, db, api: opened.engine as TransferApi }
}

const textOf = (file: SavedFile) => new TextDecoder().decode(file.bytes)

/** An export file made by another device, with these events. */
async function fileFrom(events: LedgerEvent[], gzip = false): Promise<File> {
  const other = await tab(...events)
  const out = await other.engine.exportLedger({ gzip })
  if (!out.ok) throw new Error('the other device could not export')
  return new File([out.bytes], out.filename)
}

const asPreview = (flow: ImportFlow): PreviewFlow => {
  if (flow.step !== 'preview') throw new Error(`expected a preview, got ${flow.step}`)
  return flow
}

describe('exportAndSave', () => {
  test('hands the file to the browser, and says what it saved', async () => {
    const { api } = await tab(event('a'), event('b'))
    const saved: SavedFile[] = []
    const outcome = await exportAndSave(api, false, (file) => saved.push(file))
    expect(outcome.ok).toBe(true)
    expect(saved).toHaveLength(1)
    expect(saved[0].filename).toBe('enginespace-export-2026-11-04.json')
    expect(saved[0].mime).toBe('application/json')
    if (!outcome.ok) return
    expect(outcome.saved).toEqual({ filename: saved[0].filename, events: 2, receipts: 0, bytes: saved[0].bytes.byteLength, gzip: false })
    expect(JSON.parse(textOf(saved[0])).events).toHaveLength(2)
  })

  test('compresses when asked, and the file is smaller than the text it holds', async () => {
    const { api } = await tab(...Array.from({ length: 40 }, (_, index) => event(`e${index}`)))
    const plain: SavedFile[] = []
    const zipped: SavedFile[] = []
    await exportAndSave(api, false, (file) => plain.push(file))
    const outcome = await exportAndSave(api, true, (file) => zipped.push(file))
    expect(zipped[0].filename).toBe('enginespace-export-2026-11-04.json.gz')
    expect(zipped[0].mime).toBe('application/gzip')
    expect(zipped[0].bytes.byteLength).toBeLessThan(plain[0].bytes.byteLength)
    expect(outcome.ok && outcome.saved.gzip).toBe(true)
  })

  test('remembers when the learner last exported, which the tape prints', async () => {
    const { api, engine } = await tab(event('a'))
    expect(engine.getSnapshot().lastExportAt).toBeUndefined()
    await exportAndSave(api, false, () => undefined)
    expect(engine.getSnapshot().lastExportAt).toBe('2026-11-04T09:00:00.000Z')
  })

  test('says why when the ledger refuses, and saves nothing', async () => {
    const refusing: Pick<TransferApi, 'exportLedger'> = { exportLedger: async () => ({ ok: false, error: 'read-only', detail: 'This tab is read-only.' }) }
    const saved: SavedFile[] = []
    expect(await exportAndSave(refusing, false, (file) => saved.push(file))).toEqual({ ok: false, detail: 'This tab is read-only.' })
    expect(saved).toEqual([])
  })

  test('says so when the browser will not save the file, and when the ledger will not open', async () => {
    const { api } = await tab(event('a'))
    const stubborn = await exportAndSave(api, false, () => {
      throw new Error('blocked download')
    })
    expect(stubborn).toEqual({ ok: false, detail: 'The browser would not save the file.' })
    const broken: Pick<TransferApi, 'exportLedger'> = {
      exportLedger: async () => {
        throw new Error('no database')
      },
    }
    expect(await exportAndSave(broken, false, () => undefined)).toEqual({ ok: false, detail: 'The ledger could not be opened, so nothing was exported.' })
  })
})

describe('import, previewed first', () => {
  test('a file is read and previewed in merge mode, and nothing is written', async () => {
    const { api, db } = await tab(event('here'))
    const before = db.commits
    const flow = asPreview(await openImportFile(api, await fileFrom([event('here'), event('new-1'), event('new-2')])))
    expect(flow.fileName).toMatch(/^enginespace-export-.*\.json$/)
    expect(flow.preview.mode).toBe('merge')
    expect(flow.preview.summary).toMatchObject({ fileEvents: 3, newEvents: 2, sameEvents: 1, clashedEvents: 0, removedEvents: 0 })
    expect(db.commits).toBe(before)
    expect((await db.data.readAll()).events.map((e) => e.id)).toEqual(['here'])
  })

  test('reads a gzip file by its bytes, whatever it is called', async () => {
    const { api } = await tab()
    const file = await fileFrom([event('a')], true)
    const flow = asPreview(await openImportFile(api, new File([file], 'my-backup.txt')))
    expect(flow.fileName).toBe('my-backup.txt')
    expect(flow.preview.summary.newEvents).toBe(1)
  })

  test('the same file in the other mode says what replace would remove', async () => {
    const { api } = await tab(event('only-here-1'), event('only-here-2'), event('both'))
    const merge = asPreview(await openImportFile(api, await fileFrom([event('both'), event('fresh')])))
    expect(merge.preview.summary.removedEvents).toBe(0)
    const replace = asPreview(await previewMode(api, merge, 'replace'))
    expect(replace.preview.mode).toBe('replace')
    expect(replace.preview.summary).toMatchObject({ fileEvents: 2, newEvents: 1, sameEvents: 1, removedEvents: 2 })
    // The text of the file is kept, so changing the mode reads nothing again.
    expect(replace.text).toBe(merge.text)
    expect(await previewMode(api, replace, 'replace')).toBe(replace)
  })

  test('a clash, where one id says two things, is counted and left for the preview to say', async () => {
    const { api } = await tab(event('x', { ref: 'item:gen/tr2.bubble-width/a' } as Partial<LedgerEvent>))
    const flow = asPreview(await openImportFile(api, await fileFrom([event('x', { ref: 'item:gen/tr2.bubble-width/b' } as Partial<LedgerEvent>)])))
    expect(flow.preview.summary.clashedEvents).toBe(1)
    expect(flow.preview.clashes).toHaveLength(1)
  })
})

describe('import, committed and undone', () => {
  test('merging adds what is new, keeps a checkpoint, and an undo takes it out again', async () => {
    const { api, db, engine } = await tab(event('keep-1'), event('keep-2'))
    const flow = asPreview(await openImportFile(api, await fileFrom([event('keep-1'), event('add-1'), event('add-2')])))
    const done = await commitImport(api, flow)
    expect(done.step).toBe('done')
    if (done.step !== 'done') return
    expect(done.result.summary).toMatchObject({ mode: 'merge', newEvents: 2 })
    expect(done.result.checkpointId).not.toBeNull()
    expect((await db.data.readAll()).events.map((e) => e.id).sort()).toEqual(['add-1', 'add-2', 'keep-1', 'keep-2'])
    expect(engine.getSnapshot().checkpoints).toHaveLength(1)

    expect(await undoImport(api, done.result.checkpointId ?? undefined)).toEqual({ step: 'undone' })
    expect((await db.data.readAll()).events.map((e) => e.id).sort()).toEqual(['keep-1', 'keep-2'])
    expect(engine.getSnapshot().checkpoints).toHaveLength(0)
  })

  test('replacing makes the ledger the file`s, and an undo puts back what it removed', async () => {
    const { api, db } = await tab(event('mine-1'), event('mine-2'))
    const merge = asPreview(await openImportFile(api, await fileFrom([event('theirs')])))
    const replace = asPreview(await previewMode(api, merge, 'replace'))
    const done = await commitImport(api, replace)
    expect(done.step).toBe('done')
    expect((await db.data.readAll()).events.map((e) => e.id)).toEqual(['theirs'])
    expect(await undoImport(api)).toEqual({ step: 'undone' })
    expect((await db.data.readAll()).events.map((e) => e.id).sort()).toEqual(['mine-1', 'mine-2'])
  })

  test('what was earned after an import stays when the import is undone', async () => {
    const { api, db, engine } = await tab(event('before'))
    const flow = asPreview(await openImportFile(api, await fileFrom([event('imported')])))
    await commitImport(api, flow)
    const later = await engine.append({ kind: 'ack', ref: 'screen:welcome' })
    expect(later.ok).toBe(true)
    await undoImport(api)
    const ids = (await db.data.readAll()).events.map((e) => e.id)
    expect(ids).toContain('before')
    expect(ids).not.toContain('imported')
    expect(later.ok && ids).toContain(later.ok ? later.event.id : '')
  })

  test('importing what is here already changes nothing and keeps no checkpoint, so it cannot push a useful one out', async () => {
    const { api, engine } = await tab(event('same'))
    const flow = asPreview(await openImportFile(api, await fileFrom([event('same')])))
    const done = await commitImport(api, flow)
    expect(done.step === 'done' && done.result.checkpointId).toBeNull()
    expect(engine.getSnapshot().checkpoints).toHaveLength(0)
  })

  test('with nothing to undo, the undo says so', async () => {
    const { api } = await tab()
    const flow = await undoImport(api)
    expect(flow).toMatchObject({ step: 'refused' })
    expect(flow.step === 'refused' && flow.detail).toBe('There is no import to undo.')
  })
})

describe('a file that is not ours is refused whole, and nothing is changed', () => {
  test.each([
    ['text that is not JSON', 'this is not json', "this file isn't valid JSON"],
    ['JSON that is not an export', '{"hello":1}', "this file isn't an enginespace export"],
    ['an export from a newer build', JSON.stringify({ schema: 'enginespace/export@9', exportedAt: '2026-11-04T09:00:00.000Z', schemaVersion: 9, device: 'x', events: [], receipts: [] }), 'this export was made by a newer version of enginespace: reload to update, then try again'],
  ])('%s', async (_, text, detail) => {
    const { api, db } = await tab(event('a'))
    const before = db.commits
    expect(await openImportFile(api, new File([text], 'bad.json'))).toEqual({ step: 'refused', detail })
    expect(db.commits).toBe(before)
  })

  test('one damaged record refuses the whole file, and says which', async () => {
    const { api } = await tab()
    const good = await fileFrom([event('a'), event('b')])
    const parsed = JSON.parse(await good.text()) as { events: Record<string, unknown>[] }
    parsed.events[1].score = 7
    const flow = await openImportFile(api, new File([JSON.stringify(parsed)], 'edited.json'))
    expect(flow.step).toBe('refused')
    expect(flow.step === 'refused' && flow.detail).toContain('events[1]')
  })

  test('a file over the limit is refused before it is read', async () => {
    const { api } = await tab()
    const flow = await openImportFile(api, new Blob([new Uint8Array(21 * 1024 * 1024)]))
    expect(flow).toEqual({ step: 'refused', detail: 'this file is over 20 MiB' })
  })

  test('a ledger that will not open is a refusal, not a crash', async () => {
    const broken: Pick<TransferApi, 'previewImport' | 'importLedger' | 'undoImport'> = {
      previewImport: async () => {
        throw new Error('no database')
      },
      importLedger: async () => {
        throw new Error('no database')
      },
      undoImport: async () => {
        throw new Error('no database')
      },
    }
    const refused = { step: 'refused', detail: 'The ledger could not be opened, so nothing was changed.' }
    expect(await openImportFile(broken, new File([JSON.stringify({ schema: 'enginespace/export@1' })], 'a.json'))).toMatchObject({ step: 'refused' })
    const { api } = await tab()
    const flow = asPreview(await openImportFile(api, await fileFrom([event('a')])))
    expect(await commitImport(broken, flow)).toEqual(refused)
    expect(await previewMode(broken, flow, 'replace')).toEqual(refused)
    expect(await undoImport(broken)).toEqual(refused)
  })
})

describe('eraseDevice', () => {
  test('erases the evidence, the receipts, the undo points and the settings, then runs what the page asked', async () => {
    const { api, engine, db } = await tab(event('a'), event('b'))
    const flow = asPreview(await openImportFile(api, await fileFrom([event('c')])))
    await commitImport(api, flow)
    await engine.setWorking('settings:reduced-motion', 'reduce')
    await engine.setWorking('settings:3d', false)
    expect(engine.getSnapshot().events).toHaveLength(3)
    expect(engine.getSnapshot().working.size).toBeGreaterThan(0)

    let after = 0
    expect(await eraseDevice(api, () => (after += 1))).toEqual({ ok: true })
    expect(after).toBe(1)
    const left = await db.data.readAll()
    expect(left.events).toEqual([])
    expect(left.receipts).toEqual([])
    expect(left.working).toEqual([])
    expect(engine.getSnapshot().checkpoints).toEqual([])
    // The device id stays: it describes this browser and not the learner.
    expect(left.meta.deviceId).toBeDefined()
  })

  test('runs nothing, and says why, when the ledger refuses', async () => {
    let after = 0
    const refusing: Pick<TransferApi, 'reset'> = { reset: async () => ({ ok: false, error: 'read-only', detail: 'This tab is read-only.' }) }
    expect(await eraseDevice(refusing, () => (after += 1))).toEqual({ ok: false, detail: 'This tab is read-only.' })
    const broken: Pick<TransferApi, 'reset'> = {
      reset: async () => {
        throw new Error('no database')
      },
    }
    expect(await eraseDevice(broken, () => (after += 1))).toEqual({ ok: false, detail: 'The ledger could not be opened, so nothing was erased.' })
    expect(after).toBe(0)
  })

  test('a key of the settings is a working key the ledger accepts, so the record erased here is the one the settings page wrote', () => {
    expect(decodeWorkingRecord({ key: 'settings:reduced-motion', value: 'reduce', at: '2026-11-04T09:00:00.000Z', dev: 'dev-a1' }).ok).toBe(true)
  })
})

describe('formatWhen', () => {
  test('prints an instant as a date and a time in the zone it is asked for', () => {
    expect(formatWhen('2026-11-04T09:30:00.000Z', 'UTC')).toBe('4 Nov 2026, 09:30')
    expect(formatWhen('2026-11-04T23:30:00.000Z', 'Asia/Kolkata')).toBe('5 Nov 2026, 05:00')
  })

  test('hands back text that is not an instant, so a page never prints "Invalid Date"', () => {
    expect(formatWhen('yesterday')).toBe('yesterday')
  })
})
