/*
 * /evidence as markup (W0-T22): the counts by kind and by module, the empty and loading states, the storage tape, and the
 * panels for export, import and reset, rendered on the server renderer with every input as a prop. What a click does is checked in
 * a real browser, in e2e/evidence.spec.ts and e2e/settings.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { KINDS } from '@es/ledger'
import type { CheckpointMeta, LedgerEvent } from '@es/ledger'
import { GAMES } from '@es/play'
import { countEvents, KIND_FACTS } from '@/evidence/counts'
import { EvidenceView, KindTable, ModuleTable } from '@/evidence/EvidenceView'
import { ExportPanel, SavedTape } from '@/evidence/ExportPanel'
import { ImportedTape, ImportPanel, ImportStatus, PreviewTicket } from '@/evidence/ImportPanel'
import { ResetPanel, ErasedLines } from '@/evidence/ResetPanel'
import { storageLines } from '@/evidence/storage-lines'
import { StorageTape } from '@/evidence/StorageTape'
import type { ImportFlow, PreviewFlow, TransferApi } from '@/evidence/transfer'
import { copy, EXAMPLES } from '../ledger/support'

const render = (element: ReactElement) => renderToString(createElement(StaticRouter, { location: '/evidence' }, element)).replaceAll('<!-- -->', '')
const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

const homeOf = (game: string) => GAMES.get(game)?.modules[0]
const MODULES = [
  { id: 'tr0', title: 'PyTorch for the Rust-first, and reading Triton' },
  { id: 'tr1', title: 'Read the engines' },
  { id: 'tr2', title: 'The step loop' },
  { id: 'tr8', title: 'Benchmark like you mean it' },
  { id: 'capstone', title: "Reproduce a commit pair's delta" },
]
const events = (): LedgerEvent[] => KINDS.map((kind) => ({ ...copy(EXAMPLES[kind]), id: `e-${kind}` }) as LedgerEvent)
const counts = (list: LedgerEvent[] = events()) => countEvents(list, homeOf)
const noop = () => undefined
const NO_API: TransferApi = {
  exportLedger: async () => ({ ok: false, error: 'failed', detail: '' }),
  previewImport: async () => ({ ok: false, error: 'failed', detail: '' }),
  importLedger: async () => ({ ok: false, error: 'failed', detail: '' }),
  undoImport: async () => ({ ok: false, error: 'failed', detail: '' }),
  reset: async () => ({ ok: false, error: 'failed', detail: '' }),
}

/** The cells of a table's body rows, as text, by the row's first cell. */
function rows(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, row] of html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const head = /<th[^>]*>(.*?)<\/th>/s.exec(row)?.[1] ?? ''
    const count = /<td[^>]*>(.*?)<\/td>/s.exec(row)?.[1] ?? ''
    out.set(text(head), text(count))
  }
  return out
}

describe('the counts by kind', () => {
  const html = render(createElement(KindTable, { all: counts().all }))

  test('lists every kind, in the ledger`s order, each with its name, its id and what it is', () => {
    expect([...html.matchAll(/data-kind="([^"]+)"/g)].map((match) => match[1])).toEqual([...KINDS])
    for (const kind of KINDS) {
      expect(decode(html)).toContain(KIND_FACTS[kind].name)
      expect(html).toContain(`<code class="es-ledger__id">${kind}</code>`)
      expect(decode(html)).toContain(KIND_FACTS[kind].what)
    }
  })

  test('is a table with a caption and column heads that a screen reader can use', () => {
    expect(html).toContain('<caption class="sr-only">Events in the ledger, by kind</caption>')
    expect([...html.matchAll(/<th scope="col"/g)]).toHaveLength(2)
    expect([...html.matchAll(/<th scope="row"/g)].length).toBe(KINDS.length + 1)
  })

  test('counts through the readout, tagged measured, and ends with the total', () => {
    expect([...html.matchAll(/data-tag="measured"/g)]).toHaveLength(KINDS.length + 1)
    expect(rows(html).get('All events')).toBe('10 measured in this browser')
    expect(rows(html).get(`${KIND_FACTS.play.name} play ${KIND_FACTS.play.what}`)).toBe('1 measured')
  })

  test('marks the two kinds that carry no result as not graded, and no other', () => {
    expect([...html.matchAll(/not graded/g)]).toHaveLength(2)
    for (const kind of ['challenge', 'ack']) expect(new RegExp(`data-kind="${kind}".*?not graded`, 's').test(html)).toBe(true)
  })

  test('a kind with none is a dash that a screen reader reads as "none", and is quiet', () => {
    const empty = render(createElement(KindTable, { all: counts([copy(EXAMPLES.play) as LedgerEvent]).all }))
    expect(empty).toContain('<span aria-hidden="true">—</span><span class="sr-only">none</span>')
    expect(empty).toContain('data-kind="item" data-empty="true"')
    expect(empty).not.toContain('data-kind="play" data-empty')
    // A number is never printed without its tag: only the played kind and the total are numbers.
    expect([...empty.matchAll(/data-tag="measured"/g)]).toHaveLength(2)
  })
})

describe('the counts by module', () => {
  test('lists the course`s modules in its order, with a link and the title, and counts each', () => {
    const html = render(createElement(ModuleTable, { counts: counts(), modules: MODULES }))
    expect([...html.matchAll(/data-module="([^"]+)"/g)].map((match) => match[1])).toEqual(['tr0', 'tr1', 'tr2', 'tr8', 'capstone', 'none'])
    expect(html).toContain('href="/m/tr2"')
    expect(decode(html)).toContain('The step loop')
    const table = rows(html)
    expect(table.get('tr2 The step loop')).toBe('4 measured')
    expect(table.get('tr8 Benchmark like you mean it')).toBe('2 measured')
    expect(table.get('tr0 PyTorch for the Rust-first, and reading Triton')).toBe('— none')
    expect(table.get('All events')).toBe('10 measured in this browser')
  })

  test('the events that name no module have a row of their own, and the rows add up to the total', () => {
    const html = render(createElement(ModuleTable, { counts: counts(), modules: MODULES }))
    expect(rows(html).get('No module Traces, forge labs and acknowledgements belong to no one module.')).toBe('4 measured')
    const parts = ['tr2 The step loop', 'tr8 Benchmark like you mean it', 'No module Traces, forge labs and acknowledgements belong to no one module.'].map((key) => Number.parseInt(rows(html).get(key) ?? '0', 10))
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10)
  })

  test('has no "no module" row when every event names one', () => {
    const placed = [copy(EXAMPLES.predict), copy(EXAMPLES.receipt)] as LedgerEvent[]
    expect(render(createElement(ModuleTable, { counts: counts(placed), modules: MODULES }))).not.toContain('data-module="none"')
  })

  test('before the course index loads, lists the modules that have events and nothing else', () => {
    const html = render(createElement(ModuleTable, { counts: counts(), modules: null }))
    expect([...html.matchAll(/data-module="([^"]+)"/g)].map((match) => match[1])).toEqual(['tr2', 'tr8', 'none'])
  })

  test('a module that is not in the index is still shown by its id when it has no title to give', () => {
    const html = render(createElement(ModuleTable, { counts: counts(), modules: [{ id: 'tr2', title: '' }] }))
    expect(rows(html).get('tr2')).toBe('4 measured')
  })
})

describe('the page', () => {
  const view = (patch: Partial<Parameters<typeof EvidenceView>[0]> = {}) =>
    render(createElement(EvidenceView, { ready: true, counts: counts(), modules: MODULES, side: createElement('p', { 'data-slot': 'side' }, 'tape'), files: createElement('p', { 'data-slot': 'files' }, 'files'), ...patch }))

  test('has one h1, "Evidence", and the counts, then the means to keep a copy', () => {
    const html = view()
    expect([...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1])).toEqual(['Evidence'])
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((match) => match[1])).toEqual(['By kind', 'By module', 'Keep a copy'])
    expect(html).toContain('data-slot="files"')
    expect(html).toContain('<aside class="es-page__side" aria-label="The ledger"><p data-slot="side">')
  })

  test('says that it stays on this device, and that a count is a count of events and not credit', () => {
    const body = decode(view())
    expect(body).toContain('nothing here is sent anywhere, and nothing is collected')
    expect(body).toContain('Events written, not credit:')
  })

  test('derives nothing about credit: no score, no percent, no weight, no progress', () => {
    const body = text(view())
    expect(body).not.toMatch(/\bXP\b|percent|%|\bscore\b|weight|progress|complete/i)
  })

  test('an empty ledger is a blank ticket with the way to the menu, and still offers the means to import', () => {
    const html = view({ counts: counts([]) })
    expect(html).toContain('Nothing in the ledger yet')
    expect(html).toContain('Open the menu')
    expect(html).toContain('href="/map"')
    expect(html).not.toContain('es-ledger')
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((match) => match[1])).toEqual(['Nothing in the ledger yet', 'Keep a copy'])
    expect(html).toContain('data-slot="files"')
  })

  test('says it is printing while the ledger opens, and shows no count it does not have', () => {
    const html = view({ ready: false, counts: counts([]) })
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Printing your evidence')
    expect(html).not.toContain('es-ledger')
    expect(html).not.toContain('Nothing in the ledger yet')
  })
})

describe('the tape that says where the evidence is kept', () => {
  const ledger = (patch: Partial<Parameters<typeof storageLines>[0]> = {}): Parameters<typeof storageLines>[0] => ({
    ready: true,
    backend: 'idb',
    persisted: true,
    events: events(),
    receipts: [],
    unsaved: 0,
    ...patch,
  })
  const line = (lines: ReturnType<typeof storageLines>, id: string) => lines.find((candidate) => candidate.id === id)

  test('an ordinary ledger: IndexedDB, kept safe, the counts, and when it was last exported', () => {
    const lines = storageLines(ledger({ lastExportAt: '2026-11-04T09:30:00.000Z' }))
    expect(lines.map((candidate) => candidate.id)).toEqual(['kept', 'persisted', 'events', 'receipts', 'export'])
    expect(line(lines, 'kept')?.value).toBe('IndexedDB')
    expect(line(lines, 'persisted')?.value).toBe('yes')
    expect(typeof line(lines, 'export')?.value).toBe('string')
  })

  test('the browser`s answer about keeping the storage is yes, not yet, or unknown', () => {
    expect(line(storageLines(ledger({ persisted: true })), 'persisted')?.value).toBe('yes')
    expect(line(storageLines(ledger({ persisted: false })), 'persisted')?.value).toBe('not yet')
    expect(line(storageLines(ledger({ persisted: null })), 'persisted')?.value).toBe('unknown')
  })

  test('on memory the evidence is not saved: the tape says so in the ribbon`s red, and asks for an export', () => {
    const lines = storageLines(ledger({ backend: 'memory', persisted: null }))
    expect(line(lines, 'kept')).toMatchObject({ value: 'memory only', tone: 'ink-2' })
    expect(line(lines, 'lost')).toMatchObject({ tone: 'ink-2' })
    expect(line(lines, 'persisted')).toBeUndefined()
  })

  test('a ledger that is still opening says so, and has nothing to say about safety', () => {
    const lines = storageLines(ledger({ ready: false, backend: null, persisted: null, events: [] }))
    expect(line(lines, 'kept')?.value).toBe('opening')
    expect(line(lines, 'persisted')).toBeUndefined()
  })

  test('never exported is plain until there is evidence, and red once there is', () => {
    expect(line(storageLines(ledger({ events: [] })), 'export')).toMatchObject({ value: 'never', tone: 'ink' })
    expect(line(storageLines(ledger()), 'export')).toMatchObject({ value: 'never', tone: 'ink-2' })
  })

  test('events not yet saved are a line of their own', () => {
    expect(line(storageLines(ledger({ unsaved: 2 })), 'unsaved')).toMatchObject({ label: 'waiting to save', tone: 'ink-2' })
    expect(line(storageLines(ledger({ unsaved: 0 })), 'unsaved')).toBeUndefined()
  })

  test('as a tape: the counts are readouts, and a ledger still opening is a printer warming up', () => {
    const html = render(createElement(StorageTape, { ledger: ledger() }))
    expect(html).toContain('aria-label="Where your evidence is kept"')
    expect([...html.matchAll(/data-tag="measured"/g)]).toHaveLength(2)
    expect(render(createElement(StorageTape, { ledger: ledger({ ready: false, backend: null, events: [] }) }))).toContain('Warming up')
  })
})

describe('export', () => {
  test('is a button and a switch for compression, with a status region that is there from the start', () => {
    const html = render(createElement(ExportPanel, { api: NO_API }))
    expect(html).toMatch(/<button[^>]*>Export evidence<\/button>/)
    expect(html).toContain('Compress the file')
    expect(html).toContain('<div role="status" class="es-xfer__status"></div>')
    expect(decode(html)).toContain('this file is the only backup there is')
  })

  test('what it saved is printed: the file`s name, its events and receipts, and its size, each number tagged', () => {
    const html = render(createElement(SavedTape, { saved: { filename: 'enginespace-export-2026-11-04.json', events: 12, receipts: 1, bytes: 3072, gzip: false } }))
    expect(text(html)).toContain('enginespace-export-2026-11-04.json')
    expect(text(html)).toMatch(/events 12 measured/)
    expect(text(html)).toMatch(/receipts 1 measured/)
    expect(text(html)).toMatch(/size 3\.0 KB measured/)
    expect([...html.matchAll(/data-tag="measured"/g)]).toHaveLength(3)
  })

  test('a file under a kilobyte is printed in bytes, and a compressed one says so', () => {
    const html = render(createElement(SavedTape, { saved: { filename: 'a.json.gz', events: 1, receipts: 0, bytes: 640, gzip: true } }))
    expect(text(html)).toMatch(/size, gzip 640 B measured/)
  })
})

describe('import', () => {
  const preview = (mode: 'merge' | 'replace', summary: Partial<PreviewFlow['preview']['summary']> = {}): PreviewFlow => ({
    step: 'preview',
    fileName: 'backup.json',
    text: '{}',
    preview: {
      mode,
      summary: { mode, fileEvents: 140, newEvents: 120, sameEvents: 15, clashedEvents: 5, removedEvents: 30, fileReceipts: 2, newReceipts: 1, changedReceipts: 0, removedReceipts: 0, ...summary },
      clashes: [],
      duplicates: 0,
      exportedAt: '2026-11-03T10:15:00.000Z',
      device: 'abcdef0123456789',
    },
  })
  const ticket = (flow: PreviewFlow, busy = false) => render(createElement(PreviewTicket, { flow, busy, onMode: noop, onImport: noop, onCancel: noop }))

  test('the panel starts with a button that chooses a file, a file input that is not shown, and nothing else', () => {
    const html = render(createElement(ImportPanel, { api: NO_API, checkpoints: [] }))
    expect(html).toMatch(/<button[^>]*>Choose a file<\/button>/)
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden=""[^>]*aria-label="Evidence file"/)
    expect(html).toContain('accept=".json,.gz,application/json,application/gzip"')
    expect(html).not.toContain('Import preview')
    expect(html).not.toContain('Undo the last import')
    expect(html).toContain('<div role="status" class="es-xfer__status"></div>')
  })

  test('a merge preview says what is new, what is here, and what clashes, and offers to merge', () => {
    const html = ticket(preview('merge'))
    const body = text(html)
    expect(body).toMatch(/events in the file 140 measured/)
    expect(body).toMatch(/new here 120 measured/)
    expect(body).toMatch(/here already 15 measured/)
    expect(body).toMatch(/clash: same id, other content 5 measured/)
    expect(body).not.toContain('removed')
    expect(html).toMatch(/<button[^>]*>.*Import and merge.*<\/button>/s)
    expect(body).toContain('backup.json')
    expect(body).toMatch(/by device abcdef01 \./)
  })

  test('a replace preview says what it would remove, and offers to replace', () => {
    const html = ticket(preview('replace', { removedReceipts: 2 }))
    expect(text(html)).toMatch(/here, not in the file: removed 30 measured/)
    expect(text(html)).toMatch(/receipts removed 2 measured/)
    expect(html).toMatch(/<button[^>]*>.*Import and replace.*<\/button>/s)
    expect(html).toContain('aria-pressed="true">Replace</button>')
  })

  test('the two ways are plates in a named group, merge pressed for a merge', () => {
    const html = ticket(preview('merge'))
    expect(html).toContain('aria-pressed="true">Merge</button>')
    expect(html).toContain('aria-pressed="false">Replace</button>')
    expect(decode(html)).toContain('Adds what is new and removes nothing.')
  })

  test('a file that repeats records says so, once each', () => {
    const flow = preview('merge')
    expect(text(ticket(flow))).not.toContain('repeats')
    expect(text(ticket({ ...flow, preview: { ...flow.preview, duplicates: 3 } }))).toMatch(/repeated in the file, counted once 3 measured/)
  })

  test('while a step is working, nothing in the ticket can be pressed twice', () => {
    const html = ticket(preview('merge'), true)
    expect(html).toContain('aria-busy="true"')
    expect([...html.matchAll(/aria-pressed="[^"]+"[^>]*disabled=""|disabled=""[^>]*aria-pressed/g)].length).toBeGreaterThan(0)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Cancel<\/button>/)
  })

  test('what an import did is printed on the tape: new events, what a replace removed, new receipts', () => {
    const done = (mode: 'merge' | 'replace'): Extract<ImportFlow, { step: 'done' }> => ({
      step: 'done',
      fileName: 'backup.json',
      result: { ok: true, summary: { ...preview(mode).preview.summary }, clashes: 0, duplicates: 0, checkpointId: 'cp-1' },
    })
    const merged = text(render(createElement(ImportedTape, { flow: done('merge') })))
    expect(merged).toMatch(/how merge/)
    expect(merged).toMatch(/new events 120 measured/)
    expect(merged).not.toContain('removed')
    const replaced = text(render(createElement(ImportedTape, { flow: done('replace') })))
    expect(replaced).toMatch(/how replace/)
    expect(replaced).toMatch(/removed 30 measured/)
  })

  const finished = (over: { checkpointId: string | null; clashes?: number; summary?: Partial<PreviewFlow['preview']['summary']> }): Extract<ImportFlow, { step: 'done' }> => ({
    step: 'done',
    fileName: 'backup.json',
    result: {
      ok: true,
      summary: { ...preview('merge').preview.summary, ...over.summary },
      clashes: over.clashes ?? 0,
      duplicates: 0,
      checkpointId: over.checkpointId,
    },
  })

  test('an import that changed the ledger prints its tape, and one that changed nothing says so in a sentence', () => {
    expect(text(render(createElement(ImportStatus, { flow: finished({ checkpointId: 'cp-1' }) })))).toMatch(/new events 120 measured/)
    const nothing = render(createElement(ImportStatus, { flow: finished({ checkpointId: null, summary: { newEvents: 0, newReceipts: 0 } }) }))
    expect(text(nothing)).toBe('Nothing changed: everything in backup.json was here already.')
    expect(nothing).not.toContain('es-printer')
  })

  test('an import that only replaced events, with the same ids and other content, still changed the ledger and says so', () => {
    const flow = finished({ checkpointId: 'cp-3', clashes: 4, summary: { newEvents: 0, newReceipts: 0, removedEvents: 0 } })
    const html = render(createElement(ImportStatus, { flow }))
    expect(text(html)).not.toContain('Nothing changed')
    expect(text(html)).toMatch(/ids that clashed 4 measured/)
    expect(html).toContain('data-tone="ink-2"')
    // No clash, no line.
    expect(text(render(createElement(ImportStatus, { flow: finished({ checkpointId: 'cp-3' }) })))).not.toContain('clashed')
  })

  test('an undo is done in one sentence, and the other steps print nothing', () => {
    expect(text(render(createElement(ImportStatus, { flow: { step: 'undone' } })))).toBe('The import was undone.')
    for (const flow of [{ step: 'idle' }, { step: 'refused', detail: 'x' }, preview('merge')] as ImportFlow[]) expect(render(createElement(ImportStatus, { flow }))).toBe('')
  })

  test('with an import to undo, the panel says what it was and offers to take it back', () => {
    const checkpoints: CheckpointMeta[] = [
      { id: 'cp-2', reason: 'import-replace', at: '2026-11-04T09:30:00.000Z', addedEvents: 3, restoredEvents: 2, addedReceipts: 0, restoredReceipts: 0 },
      { id: 'cp-1', reason: 'import-merge', at: '2026-11-03T09:30:00.000Z', addedEvents: 9, restoredEvents: 0, addedReceipts: 0, restoredReceipts: 0 },
    ]
    const html = render(createElement(ImportPanel, { api: NO_API, checkpoints }))
    expect(decode(html)).toContain('Last import: a replace on')
    expect(html).toMatch(/<button[^>]*>Undo the last import<\/button>/)
    expect(decode(html)).toContain('what you have earned since stays')
    // Only the newest is offered.
    expect([...html.matchAll(/Undo the last import/g)]).toHaveLength(1)
    expect(decode(render(createElement(ImportPanel, { api: NO_API, checkpoints: checkpoints.slice(1) })))).toContain('Last import: a merge on')
  })
})

describe('reset', () => {
  test('is one button that opens the question, and says what it erases and that it offers an export first', () => {
    const html = render(createElement(ResetPanel, { api: NO_API, holds: { events: 12, receipts: 1, checkpoints: 2 }, onErased: noop }))
    expect(html).toMatch(/<button[^>]*>.*Reset this device.*<\/button>/s)
    expect(decode(html)).toContain('your evidence, your receipts, your undo points and these settings')
    expect(decode(html)).toContain('It asks first, and offers an export.')
    expect(html).not.toContain('role="dialog"')
    expect(html).toContain('<div role="status" class="es-xfer__status"></div>')
  })

  test('the question says what would go, with each count through the readout', () => {
    const html = render(createElement(ErasedLines, { holds: { events: 12, receipts: 1, checkpoints: 2 } }))
    expect(text(html)).toMatch(/graded results 12 measured/)
    expect(text(html)).toMatch(/receipts 1 measured/)
    expect(text(html)).toMatch(/undo points 2 measured/)
    expect(text(html)).toMatch(/your settings, back to their defaults/)
    expect([...html.matchAll(/data-tag="measured"/g)]).toHaveLength(3)
  })
})
