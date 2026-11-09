/*
 * W0-T11's acceptance checks, in Playwright's Chromium:
 *
 *   1. The same conformance suite that Bun runs against the memory store passes against IndexedDB.
 *   2. An append in one tab shows in a second tab within 1 s.
 *   3. A database with a newer `schemaVersion` puts the app in read-only mode with a reload prompt.
 *   4. Export, clear, then import (merge) round-trips to byte-identical canonical JSON.
 *
 * The rest are the things only a browser can answer: the database's layout, a reload, a newer IndexedDB version, a version
 * change from another tab, a write that dies between its two steps, the persistence request, and the fallback to memory.
 *
 * How it runs. The spec builds e2e/support/ledger-harness.tsx into one script with Vite, and answers every request to a made-up
 * origin itself (`context.route`), so it needs no server, no build of the app and no network. A page on that origin is a real
 * secure context with a real IndexedDB, BroadcastChannel and `navigator.storage`. Two pages of one browser context are two
 * tabs of one profile. Any request to another origin fails the test (ARCHITECTURE §1, I1).
 *
 * Run it with `npx playwright test e2e/ledger-conformance.spec.ts`.
 */
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { build } from 'vite'
import { STORE_CONFORMANCE_CASES } from '../packages/ledger/conformance'
import { canonicalJson } from '../packages/ledger/merge'
import type { Draft } from '../packages/ledger/types'
import type { Harness } from './support/ledger-harness'

declare global {
  interface Window {
    __es: Harness
  }
}

const root = path.resolve(import.meta.dirname, '..')
/**
 * The aliases of vite.config.ts and tsconfig.app.json (tests/config.test.ts holds those two equal). They are written out
 * here, and not read from the config, so that this spec stays clear of the plugins that the app's build adds.
 */
const ALIASES = {
  '@': path.join(root, 'src'),
  ...Object.fromEntries(['sim', 'play', 'ledger', 'schema', 'verify'].map((name) => [`@es/${name}`, path.join(root, 'packages', name)])),
}
/** Nothing listens here: every request to it is answered by the routes below. */
const ORIGIN = 'http://localhost:4173'
const PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ledger harness</title></head><body><div id="root"></div><script src="/harness.js"></script></body></html>'

let bundle = ''

base.beforeAll(async () => {
  const built = await build({
    root,
    configFile: false,
    logLevel: 'error',
    resolve: { alias: ALIASES },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    esbuild: { jsx: 'automatic' },
    build: {
      write: false,
      minify: false,
      emptyOutDir: false,
      lib: { entry: path.join(root, 'e2e/support/ledger-harness.tsx'), formats: ['iife'], name: 'EsHarness', fileName: 'harness' },
    },
  })
  const outputs = (Array.isArray(built) ? built : [built]).flatMap((result) => ('output' in result ? result.output : []))
  const chunk = outputs.find((output) => output.type === 'chunk')
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('Vite built no script for the harness')
  bundle = chunk.code
})

const test = base.extend({
  context: async ({ context }, use) => {
    const stray: string[] = []
    await context.route('**/*', (route) => {
      const url = route.request().url()
      if (!url.startsWith(`${ORIGIN}/`)) {
        stray.push(url)
        return route.abort()
      }
      const { pathname } = new URL(url)
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
      if (pathname === '/harness.js') return route.fulfill({ contentType: 'text/javascript', body: bundle })
      return route.fulfill({ status: 404, body: '' })
    })
    await use(context)
    expect(stray, 'the page makes no request that leaves its origin').toEqual([])
  },
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Helpers                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

async function load(page: Page): Promise<Page> {
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => window.__es !== undefined)
  return page
}

async function newTab(context: BrowserContext): Promise<Page> {
  return load(await context.newPage())
}

/** A tab with the app mounted on a database, once the ledger is open. */
async function openApp(context: BrowserContext, dbName: string, fixedAt?: string): Promise<Page> {
  const page = await newTab(context)
  await mountApp(page, dbName, fixedAt)
  return page
}

async function mountApp(page: Page, dbName: string, fixedAt?: string): Promise<void> {
  await page.evaluate((options) => window.__es.mount(options), { dbName, fixedAt })
  await expect(page.getByTestId('ready')).toHaveText('true')
}

const out = (page: Page, id: string) => page.getByTestId(id)
const dbName = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const ACK = { kind: 'ack', ref: 'screen:welcome' } satisfies Draft<'ack'>
const ITEM = { kind: 'item', ref: 'item:gen/tr2.bubble-width/async-on', score: 1, ok: true, provenance: 'unseen', data: { answer: 3 } } satisfies Draft<'item'>
const REVIEW = { kind: 'review', ref: 'review:tr2.async-overlap', score: 1, ok: true, provenance: 'unseen', data: { grade: 3 } } satisfies Draft<'review'>
const CHALLENGE = {
  kind: 'challenge',
  ref: 'challenge:tr8.replay.s2',
  data: { token: 'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d', seed: 0x0badc0de, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261104' },
} satisfies Draft<'challenge'>

/** An event as the store keeps it, for a test that writes straight to a store. */
const STORED_EVENT = { id: 'e1', v: 1, kind: 'ack', ref: 'screen:welcome', at: '2026-11-04T09:00:00.000Z', tz: 0, day: '2026-11-04', dev: 'dev-a1' } as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* 1. The conformance suite                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('accept 1: the conformance suite, against IndexedDB', () => {
  test('the page runs the cases of the suite that Bun runs, and all of them', async ({ page }) => {
    await load(page)
    expect(await page.evaluate(() => window.__es.caseNames())).toEqual(STORE_CONFORMANCE_CASES.map((conformanceCase) => conformanceCase.name))
    expect(STORE_CONFORMANCE_CASES.length).toBeGreaterThanOrEqual(15)
  })

  for (const [index, conformanceCase] of STORE_CONFORMANCE_CASES.entries()) {
    test(conformanceCase.name, async ({ page }) => {
      await load(page)
      expect(await page.evaluate((caseIndex) => window.__es.runCase(caseIndex), index)).toBeNull()
    })
  }
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What only a browser answers                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('IndexedDB itself', () => {
  test('the database is enginespace at version 1 with the five stores of ARCHITECTURE §7.1', async ({ page }) => {
    await load(page)
    const name = dbName('es-layout')
    await page.evaluate(async (n) => {
      const { handle } = await window.__es.openStore(n)
      window.__es.closeStore(handle)
    }, name)
    const dump = await page.evaluate((n) => window.__es.rawDump(n), name)
    expect(dump.version).toBe(1)
    expect(Object.keys(dump.stores).sort()).toEqual(['checkpoints', 'events', 'meta', 'receipts', 'working'])
  })

  test('what was written is there after the page reloads', async ({ page }) => {
    await load(page)
    const name = dbName('es-reopen')
    await page.evaluate(
      async ([n, event]) => {
        const { handle, info } = await window.__es.openStore(n)
        if (info.schemaVersion !== null) throw new Error('a fresh database has no schema version')
        await window.__es.storeCommit(handle, {
          putMeta: { schemaVersion: 1, deviceId: 'dev-a1', createdAt: '2026-11-04T09:00:00.000Z' },
          putEvents: [event as never],
          putWorking: [{ key: 'settings:reduced-motion', value: true, at: '2026-11-04T09:00:00.000Z', dev: 'dev-a1' }],
          putCheckpoint: { id: 'c1', reason: 'import-merge', at: '2026-11-04T09:00:00.000Z', addedEventIds: ['e1'], restoredEvents: [], addedReceiptIds: [], restoredReceipts: [] },
        })
        window.__es.closeStore(handle)
      },
      [name, STORED_EVENT] as const,
    )
    await page.reload()
    await page.waitForFunction(() => window.__es !== undefined)
    const seen = await page.evaluate(async (n) => {
      const { handle, info } = await window.__es.openStore(n)
      const all = await window.__es.storeReadAll(handle)
      const checkpoints = await window.__es.storeCheckpoints(handle)
      window.__es.closeStore(handle)
      return { info, events: all.events.map((event) => event.id), working: all.working.map((record) => record.key), meta: all.meta, checkpoints: checkpoints.map((c) => c.id) }
    }, name)
    expect(seen).toEqual({
      info: { backend: 'idb', schemaVersion: 1, readOnly: false },
      events: ['e1'],
      working: ['settings:reduced-motion'],
      meta: { schemaVersion: 1, deviceId: 'dev-a1', createdAt: '2026-11-04T09:00:00.000Z' },
      checkpoints: ['c1'],
    })
  })

  test('a database at a newer IndexedDB version opens read-only, and refuses to read or write', async ({ page }) => {
    await load(page)
    const name = dbName('es-newer-idb')
    await page.evaluate((n) => window.__es.rawUpgrade(n, 2), name)
    const result = await page.evaluate(async (n) => {
      const { handle, info } = await window.__es.openStore(n)
      const failures: string[] = []
      await window.__es.storeReadAll(handle).catch((error: Error) => failures.push(`read: ${error.message}`))
      await window.__es.storeCommit(handle, { putMeta: { schemaVersion: 1 } }).catch((error: Error) => failures.push(`commit: ${error.message}`))
      return { info, failures }
    }, name)
    expect(result.info).toEqual({ backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' })
    expect(result.failures).toHaveLength(2)
    // The newer database was left alone.
    expect((await page.evaluate((n) => window.__es.rawDump(n), name)).version).toBe(2)
  })

  test('a version change from another tab closes the connection and tells the app', async ({ context }) => {
    const a = await newTab(context)
    const b = await newTab(context)
    const name = dbName('es-versionchange')
    const handle = await a.evaluate(async (n) => (await window.__es.openStore(n)).handle, name)
    // The second tab upgrades the database. It can only finish if the first lets go, which is what the store must do.
    await b.evaluate((n) => window.__es.rawUpgrade(n, 2), name)
    await expect.poll(() => a.evaluate((h) => window.__es.versionChanges(h), handle)).toBe(1)
    const failure = await a.evaluate((h) => window.__es.storeReadAll(h).then(() => null, (error: Error) => error.message), handle)
    expect(failure).toContain('not open')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 2. Tabs                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('accept 2: an append in one tab shows in a second tab within 1 s', () => {
  test('through the hook, in the DOM of the second tab', async ({ context }, testInfo) => {
    const name = dbName('es-tabs')
    const a = await openApp(context, name)
    const b = await openApp(context, name)
    expect(await a.evaluate(() => window.__es.deviceId())).toBe(await b.evaluate(() => window.__es.deviceId()))

    const written = await a.evaluate((draft) => window.__es.append(draft), ITEM)
    if (!written.ok) throw new Error('not written')
    expect(written.durable).toBe(true)
    await expect(out(b, 'events').locator(`[data-id="${written.id}"]`)).toHaveCount(1)
    const seen = await b.evaluate((id) => window.__es.seenAt(id), written.id)
    if (seen === null) throw new Error('the second tab never showed the event')
    const latency = seen - written.startedAt
    // [measured] on the dev host, from the call to append in the first tab to the render that shows the event in the second.
    testInfo.annotations.push({ type: 'measured', description: `append to second tab's render: ${latency} ms` })
    console.log(`measured: append in tab A to render in tab B took ${latency} ms`)
    expect(latency).toBeLessThan(1000)

    // And back the other way, and a third tab that opens late sees both.
    const back = await b.evaluate((draft) => window.__es.append(draft), ACK)
    if (!back.ok) throw new Error('not written')
    await expect(out(a, 'events').locator(`[data-id="${back.id}"]`)).toHaveCount(1)
    const late = await openApp(context, name)
    await expect(out(late, 'count')).toHaveText('2')
  })

  test('and still within a second at 4x CPU slowdown, the lab profile of ARCHITECTURE §11.1', async ({ context }, testInfo) => {
    const name = dbName('es-tabs-slow')
    const a = await openApp(context, name)
    const b = await openApp(context, name)
    for (const page of [a, b]) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const written = await a.evaluate((draft) => window.__es.append(draft), ITEM)
    if (!written.ok) throw new Error('not written')
    await expect(out(b, 'events').locator(`[data-id="${written.id}"]`)).toHaveCount(1)
    const seen = await b.evaluate((id) => window.__es.seenAt(id), written.id)
    if (seen === null) throw new Error('the second tab never showed the event')
    const latency = seen - written.startedAt
    testInfo.annotations.push({ type: 'measured', description: `append to second tab's render at 4x CPU slowdown: ${latency} ms` })
    console.log(`measured: at 4x CPU slowdown, append in tab A to render in tab B took ${latency} ms`)
    expect(latency).toBeLessThan(1000)
  })

  test('a setting changed in one tab applies in the other', async ({ context }) => {
    const name = dbName('es-settings')
    const a = await openApp(context, name)
    const b = await openApp(context, name)
    await a.evaluate(() => window.__es.setWorking('settings:reduced-motion', true))
    await expect(out(b, 'working')).toHaveText('["settings:reduced-motion"]')
    await a.evaluate(() => window.__es.deleteWorking('settings:reduced-motion'))
    await expect(out(b, 'working')).toHaveText('[]')
  })

  test('an import, an undo and a reset in one tab show in the other', async ({ context }) => {
    const source = await openApp(context, dbName('es-source'), '2026-11-10T12:00:00.000Z')
    await source.evaluate((draft) => window.__es.append(draft), ITEM)
    await source.evaluate((draft) => window.__es.append(draft), REVIEW)
    const file = await source.evaluate(() => window.__es.exportLedger(false))
    if (!file.ok) throw new Error('export refused')

    const name = dbName('es-sync')
    const a = await openApp(context, name)
    const b = await openApp(context, name)
    expect(await a.evaluate((text) => window.__es.importText(text, 'merge'), file.text)).toMatchObject({ ok: true })
    await expect(out(b, 'count')).toHaveText('2')
    await expect(out(b, 'checkpoints')).toHaveText('1')
    await a.evaluate(() => window.__es.undoImport())
    await expect(out(b, 'count')).toHaveText('0')
    await a.evaluate((draft) => window.__es.append(draft), ACK)
    await expect(out(b, 'count')).toHaveText('1')
    await a.evaluate(() => window.__es.reset())
    await expect(out(b, 'count')).toHaveText('0')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 3. The schema guard                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('accept 3: a newer schemaVersion puts the app in read-only mode with a reload prompt', () => {
  test('a database that a newer bundle wrote', async ({ context }) => {
    const name = dbName('es-newer-schema')
    const page = await newTab(context)
    await page.evaluate(
      async ([n, event]) => {
        const { handle } = await window.__es.openStore(n)
        await window.__es.storeCommit(handle, {
          putMeta: { schemaVersion: 2, deviceId: 'dev-newer', createdAt: '2026-11-04T09:00:00.000Z' },
          putEvents: [event as never],
        })
        window.__es.closeStore(handle)
      },
      [name, STORED_EVENT] as const,
    )
    const before = await page.evaluate((n) => window.__es.rawDump(n), name)

    await mountApp(page, name)
    await expect(out(page, 'read-only')).toHaveText('true')
    await expect(out(page, 'reason')).toHaveText('newer-schema')
    await expect(out(page, 'notice')).toContainText('Reload to update')
    // A newer bundle owns the data: this one shows nothing of it.
    await expect(out(page, 'count')).toHaveText('0')

    // The reload prompt: an alert with what happened and what to do, and the button that does it.
    await expect(page.getByRole('alert')).toContainText('this tab is read-only and saves nothing')
    await expect(page.getByRole('alert')).toContainText('Your evidence is safe. Reload to update.')
    const reload = page.getByRole('button', { name: 'Reload' })
    await expect(reload).toBeVisible()

    // Every write refuses, and the database is exactly as the newer bundle left it.
    expect(await page.evaluate((draft) => window.__es.append(draft), ITEM)).toMatchObject({ ok: false, error: 'read-only' })
    expect(await page.evaluate(() => window.__es.setWorking('settings:reduced-motion', true))).toMatchObject({ ok: false, error: 'read-only' })
    expect(await page.evaluate(() => window.__es.reset())).toMatchObject({ ok: false, error: 'read-only' })
    expect(await page.evaluate(() => window.__es.exportLedger(false))).toMatchObject({ ok: false, error: 'read-only' })
    expect(await page.evaluate((n) => window.__es.rawDump(n), name)).toEqual(before)

    // The button reloads the page, which is how a newer bundle gets loaded.
    await page.evaluate(() => {
      ;(window as unknown as { marker: boolean }).marker = true
    })
    await Promise.all([page.waitForEvent('load'), reload.click()])
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBeUndefined()
  })

  test('a database at a newer IndexedDB version', async ({ context }) => {
    const name = dbName('es-newer-idb-app')
    const page = await newTab(context)
    await page.evaluate((n) => window.__es.rawUpgrade(n, 2), name)
    await mountApp(page, name)
    await expect(out(page, 'read-only')).toHaveText('true')
    await expect(out(page, 'reason')).toHaveText('newer-idb')
    await expect(page.getByRole('alert')).toContainText('Reload to update')
    expect(await page.evaluate((draft) => window.__es.append(draft), ITEM)).toMatchObject({ ok: false, error: 'read-only' })
  })

  test('a newer bundle in another tab: its hello stops this tab at once', async ({ context }) => {
    const name = dbName('es-hello')
    const open = await openApp(context, name)
    const other = await newTab(context)
    await expect(out(open, 'read-only')).toHaveText('false')
    await expect(open.getByRole('alert')).toHaveCount(0)
    await other.evaluate(() => window.__es.postRaw({ t: 'hello', from: 'a-newer-tab', schemaVersion: 2 }))
    await expect(out(open, 'read-only')).toHaveText('true')
    await expect(out(open, 'reason')).toHaveText('newer-schema')
    await expect(open.getByRole('alert')).toContainText('Reload to update')
    expect(await open.evaluate((draft) => window.__es.append(draft), ACK)).toMatchObject({ ok: false, error: 'read-only' })
  })

  test('messages from the same bundle, or noise on the channel, do not', async ({ context }) => {
    const name = dbName('es-noise')
    const open = await openApp(context, name)
    const other = await newTab(context)
    await other.evaluate(() => {
      window.__es.postRaw({ t: 'hello', from: 'a-peer', schemaVersion: 1 })
      window.__es.postRaw('noise')
      window.__es.postRaw({ t: 'hello', from: 'a-liar', schemaVersion: 'two' })
    })
    await open.waitForTimeout(150)
    await expect(out(open, 'read-only')).toHaveText('false')
    expect((await open.evaluate((draft) => window.__es.append(draft), ACK)).ok).toBe(true)
  })

  test('another tab upgrading the database: this one lets go and goes read-only', async ({ context }) => {
    const name = dbName('es-upgrade')
    const open = await openApp(context, name)
    await open.evaluate((draft) => window.__es.append(draft), ITEM)
    const other = await newTab(context)
    await other.evaluate((n) => window.__es.rawUpgrade(n, 2), name)
    await expect(out(open, 'read-only')).toHaveText('true')
    await expect(out(open, 'reason')).toHaveText('versionchange')
    await expect(out(open, 'notice')).toContainText('Reload to keep saving')
    // What it showed stays on the page, and nothing more is written.
    await expect(out(open, 'count')).toHaveText('1')
    expect(await open.evaluate((draft) => window.__es.append(draft), ACK)).toMatchObject({ ok: false, error: 'read-only' })
  })

  test('without a newer bundle, the shell shows no prompt', async ({ context }) => {
    const page = await openApp(context, dbName('es-quiet'))
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(out(page, 'read-only')).toHaveText('false')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 4. Export, clear and import                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('accept 4: export, clear, then import (merge) round-trips to byte-identical canonical JSON', () => {
  const AT = '2026-11-10T12:00:00.000Z'

  test('through a reload of the page, in the real IndexedDB', async ({ context }) => {
    const name = dbName('es-roundtrip')
    const page = await openApp(context, name, AT)
    for (const draft of [ITEM, ACK, REVIEW, CHALLENGE]) await page.evaluate((d) => window.__es.append(d), draft)
    await page.evaluate(() => window.__es.setWorking('settings:reduced-motion', true))
    await expect(out(page, 'count')).toHaveText('4')

    const first = await page.evaluate(() => window.__es.exportLedger(false))
    if (!first.ok) throw new Error('export refused')
    expect(first.events).toBe(4)
    expect(first.filename).toBe('enginespace-export-2026-11-10.json')
    // It is canonical JSON: parsing and writing it again with sorted keys and no whitespace gives the same bytes.
    expect(canonicalJson(JSON.parse(first.text))).toBe(first.text)
    expect(first.text).not.toContain('settings:')

    await page.reload()
    await page.waitForFunction(() => window.__es !== undefined)
    await mountApp(page, name, AT)
    await expect(out(page, 'count')).toHaveText('4')

    // Clear.
    expect(await page.evaluate(() => window.__es.reset())).toEqual({ ok: true })
    await expect(out(page, 'count')).toHaveText('0')
    const cleared = await page.evaluate((n) => window.__es.rawDump(n), name)
    expect(cleared.stores.events).toEqual([])
    expect(cleared.stores.working).toEqual([])
    expect(cleared.stores.checkpoints).toEqual([])
    // The device stays.
    expect(cleared.stores.meta).toHaveLength(3)

    // Import (merge).
    const imported = await page.evaluate((text) => window.__es.importText(text, 'merge'), first.text)
    expect(imported).toMatchObject({ ok: true, summary: { newEvents: 4, mode: 'merge' } })
    await expect(out(page, 'count')).toHaveText('4')

    const second = await page.evaluate(() => window.__es.exportLedger(false))
    if (!second.ok) throw new Error('export refused')
    expect(second.text).toBe(first.text)
    expect(second.text.length).toBe(first.text.length)
  })

  test('with gzip, through a File and the browser\'s own decompression', async ({ context }) => {
    const page = await openApp(context, dbName('es-gzip'), AT)
    for (const draft of [ITEM, ACK, REVIEW]) await page.evaluate((d) => window.__es.append(d), draft)
    const plain = await page.evaluate(() => window.__es.exportLedger(false))
    const zipped = await page.evaluate(() => window.__es.exportLedger(true))
    if (!plain.ok || !zipped.ok) throw new Error('export refused')
    expect(zipped.filename).toBe('enginespace-export-2026-11-10.json.gz')
    expect(zipped.magic).toEqual([0x1f, 0x8b])
    expect(zipped.text).toBe(plain.text)

    await page.evaluate(() => window.__es.reset())
    await expect(out(page, 'count')).toHaveText('0')
    expect(await page.evaluate(() => window.__es.importLastExport('merge'))).toMatchObject({ ok: true, summary: { newEvents: 3 } })
    await expect(out(page, 'count')).toHaveText('3')
    const again = await page.evaluate(() => window.__es.exportLedger(false))
    expect(again.ok && again.text).toBe(plain.text)
  })

  test('an import can be undone, and a replace restores the original', async ({ context }) => {
    const source = await openApp(context, dbName('es-undo-source'), AT)
    await source.evaluate((draft) => window.__es.append(draft), ITEM)
    await source.evaluate((draft) => window.__es.append(draft), REVIEW)
    const file = await source.evaluate(() => window.__es.exportLedger(false))
    if (!file.ok) throw new Error('export refused')

    const page = await openApp(context, dbName('es-undo'), AT)
    await page.evaluate((draft) => window.__es.append(draft), ACK)
    const preview = await page.evaluate((text) => window.__es.previewText(text, 'replace'), file.text)
    expect(preview).toMatchObject({ ok: true, preview: { summary: { mode: 'replace', newEvents: 2, removedEvents: 1 } } })
    await expect(out(page, 'count')).toHaveText('1')

    const replaced = await page.evaluate((text) => window.__es.importText(text, 'replace'), file.text)
    expect(replaced).toMatchObject({ ok: true, summary: { removedEvents: 1 } })
    await expect(out(page, 'count')).toHaveText('2')
    await expect(out(page, 'checkpoints')).toHaveText('1')
    expect(await page.evaluate(() => window.__es.undoImport())).toMatchObject({ ok: true })
    await expect(out(page, 'count')).toHaveText('1')
    await expect(out(page, 'events').locator('li')).toHaveText(['ack'])
    await expect(out(page, 'checkpoints')).toHaveText('0')
  })

  test('refuses a file that was edited, and changes nothing', async ({ context }) => {
    const page = await openApp(context, dbName('es-edited'), AT)
    await page.evaluate((draft) => window.__es.append(draft), ITEM)
    const file = await page.evaluate(() => window.__es.exportLedger(false))
    if (!file.ok) throw new Error('export refused')
    const edited = JSON.parse(file.text) as { events: { score: number }[] }
    edited.events[0].score = 7
    expect(await page.evaluate((text) => window.__es.importText(text, 'replace'), JSON.stringify(edited))).toMatchObject({ ok: false, error: 'invalid' })
    await expect(out(page, 'count')).toHaveText('1')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The write path                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('the write path', () => {
  test('an append reaches IndexedDB and leaves nothing in the outbox', async ({ context }) => {
    const name = dbName('es-write')
    const page = await openApp(context, name)
    const written = await page.evaluate((draft) => window.__es.append(draft), ITEM)
    if (!written.ok) throw new Error('not written')
    expect(written.durable).toBe(true)
    const dump = await page.evaluate((n) => window.__es.rawDump(n), name)
    expect((dump.stores.events as { id: string }[]).map((event) => event.id)).toEqual([written.id])
    // The outbox record is gone. (The device's own bookkeeping, such as the answer to the persistence request, is not the outbox.)
    expect((dump.stores.working as { key: string }[]).filter((record) => record.key.startsWith('outbox:'))).toEqual([])
    expect(dump.stores.meta).toHaveLength(3)
    await expect(out(page, 'unsaved')).toHaveText('0')
  })

  test('a write that died after step one is flushed by the next start', async ({ context }) => {
    const name = dbName('es-crash')
    const page = await newTab(context)
    const id = await page.evaluate(([n, draft]) => window.__es.stageOnly(n, draft as never), [name, ITEM] as const)
    const waiting = await page.evaluate((n) => window.__es.rawDump(n), name)
    expect(waiting.stores.events).toEqual([])
    expect((waiting.stores.working as { key: string }[]).map((record) => record.key)).toEqual([`outbox:${id}`])

    await mountApp(page, name)
    await expect(out(page, 'events').locator(`[data-id="${id}"]`)).toHaveCount(1)
    const after = await page.evaluate((n) => window.__es.rawDump(n), name)
    expect((after.stores.events as { id: string }[]).map((event) => event.id)).toEqual([id])
    expect(after.stores.working).toEqual([])
  })

  test('works on memory when IndexedDB fails to open, and says so', async ({ context }) => {
    await context.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      }
    })
    const page = await openApp(context, dbName('es-memory'))
    await expect(out(page, 'backend')).toHaveText('memory')
    await expect(out(page, 'read-only')).toHaveText('false')
    const written = await page.evaluate((draft) => window.__es.append(draft), ITEM)
    expect(written.ok && written.durable).toBe(true)
    await expect(out(page, 'count')).toHaveText('1')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Persistent storage                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('the persistence request', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const calls = { persist: 0, persisted: 0 }
      ;(window as unknown as { calls: typeof calls }).calls = calls
      const storage = navigator.storage
      storage.persist = async () => {
        calls.persist += 1
        return true
      }
      storage.persisted = async () => {
        calls.persisted += 1
        return false
      }
    })
  })

  const calls = (page: Page) => page.evaluate(() => (window as unknown as { calls: { persist: number; persisted: number } }).calls)

  test('is made once, after the first graded event, and not for an event that grades nothing', async ({ context }) => {
    const page = await openApp(context, dbName('es-persist'))
    expect(await calls(page)).toEqual({ persist: 0, persisted: 1 })
    await expect(out(page, 'persisted')).toHaveText('false')

    await page.evaluate((draft) => window.__es.append(draft), ACK)
    await page.evaluate((draft) => window.__es.append(draft), CHALLENGE)
    await page.waitForTimeout(100)
    expect((await calls(page)).persist).toBe(0)

    await page.evaluate((draft) => window.__es.append(draft), ITEM)
    await expect.poll(async () => (await calls(page)).persist).toBe(1)
    await expect(out(page, 'persisted')).toHaveText('true')

    await page.evaluate((draft) => window.__es.append(draft), REVIEW)
    await page.waitForTimeout(100)
    expect((await calls(page)).persist).toBe(1)
  })

  test('is not made again by a later session while the answer is fresh', async ({ context }) => {
    const name = dbName('es-persist-later')
    const page = await openApp(context, name)
    await page.evaluate((draft) => window.__es.append(draft), ITEM)
    await expect.poll(async () => (await calls(page)).persist).toBe(1)
    await expect(out(page, 'working')).toHaveText('["device:persist"]')

    await page.reload()
    await page.waitForFunction(() => window.__es !== undefined)
    await mountApp(page, name)
    await page.evaluate((draft) => window.__es.append(draft), REVIEW)
    await page.waitForTimeout(150)
    // The page is new, so its counters are, and the remembered answer keeps the request from being made.
    expect((await calls(page)).persist).toBe(0)
  })
})
