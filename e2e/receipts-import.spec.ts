/*
 * W2-T07's acceptance checks (and the rules W2-T08 added to the list), in Playwright's Chromium, on /receipts: the slip a receipt comes back on, the receipt worker behind it, and the
 * ledger it writes to.
 *
 *   1. Oversized and zip-bomb files abort with a message. A file over the cap of rule 1, and a gzip file that inflates past the other cap, are
 *      refused on the slip with the rule that stopped them in the ribbon's red. The bomb is made in the page by `CompressionStream`, a few hundred
 *      KB that the real `DecompressionStream` of the worker stops at the cap; nothing is committed. Nothing is kept, and no token is spent.
 *   2. A tampered hash fails integrity. The file is refused at rule 3, the message names the artifact, and the challenge is still open.
 *   3. A reused token fails binding. A second receipt for a token that a first one spent is kept, labelled, with the reason, and the token stays the
 *      first receipt's.
 *   4. An unknown grader build gives `gpu-unverified`. W2-T10 published grader 0.1.0, and the honest sample is 0.1.0 with another source hash, so it is the case: rules 1 to 4 and 6
 *      pass, rule 5 fails and says why, and the receipt is kept as not credited. The same files with a published grader are held under Bun
 *      (tests/receipts/importer.test.ts).
 *
 * And the review's finding that a file inside the caps could still crash the tab (W2's grader track, review fixes): rule 1 bounds the bytes of a bundle, and a
 * parser's memory is not its bytes. 200 MB of nested brackets, and 250 MB of `[],` or `{},`, are a few hundred KB compressed and pass rule 1. Imported before
 * the fix, the nested file crashed the tab in 4.1 s, and the two wide ones took 38.5 and 37.5 s to be refused as "Invalid input" on a host with 31 GB, where
 * `JSON.parse` peaked at 5.1 and 6.1 GB resident, and crashed the tab in the review's run [measured 2026-11-10 in the headless shell of Chrome for Testing
 * 153.0.8010.12, which Playwright 1.63.0 pins]. Rule 2 now scans the text first (packages/verify/shape.ts), so each is refused with the bound in the message, the
 * page is alive to say so, and nothing is kept. Numbers were not counted then: 250 MB of `0,` or `-0,` (87 million values, in `receipt.ext` or in the data of a JSON artifact) passed the
 * scan, parsed in seconds, and crashed the tab in the canonical form [measured in the second review of W2's grader track, same Chromium], so rule 2 now counts the commas as well, and those four files
 * are refused too. A file of numbers inside the bound is read.
 *
 * And one long string. A JSON artifact that holds a string of more than 2^27 characters with a character outside Latin-1 in it (129 MiB of `a` after a "π", 133 KB compressed) crashed the tab in the canonical
 * form of rule 3, because `JSON.stringify` of such a string crashes the renderer [measured 2026-11-15 at ff47e8f, same Chromium]. The form is now written in pieces (packages/sim/core/json.ts), so that file, the same as a
 * member name, strings in nested arrays and a string of `π` alone are refused at rule 3 as a hash that does not match, with the tab alive.
 *
 * And what stands behind them. A file chosen with the learner's own picker and a file dropped on the slip both reach the worker; the receipt is
 * written with its report in one transaction, and a receipt that is imported again adds a report and no event. The page's lists, the tape and the
 * receipt's page all read what was kept. The slip is reachable with the keys alone, takes focus to its result, and passes axe in each state at
 * a phone's width and a laptop's. Nothing is sent anywhere.
 *
 * How it runs. Through the config's `baseURL` (`vite preview` over a fresh build), under e2e/support/site.ts's watch, which fails a spec whose
 * page asks for anything outside the origin, has its policy refuse something (a worker that tried to fetch, or to evaluate), or throws.
 *
 *   npx playwright test e2e/receipts-import.spec.ts
 */
import { gzipSync } from 'node:zlib'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { Ledger } from '../tests/receipts/support'
import { sampleBundle } from '../tests/schema/receipt-support'
import { daysAgo, put } from './support/receipts'
import { clipped, expect, open, quiet, test, withSettings } from './support/site'

const ROUTE = '/receipts'

/** The honest synthetic bundle of the receipt family's tests: no machine ran it, and its notes say so. */
const bundle = () => sampleBundle()
const NAME = 'tr3.profile-s2-20261109T120000Z.es.json.gz'
const fileOf = (value: unknown, name = NAME) => ({ name, mimeType: 'application/gzip', buffer: gzipSync(JSON.stringify(value)) })

test.beforeEach(async ({ context }) => {
  await withSettings(context, { view3d: false })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The page's pieces                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const panel = (page: Page) => page.getByRole('region', { name: 'Bring a receipt back' })
const choose = (page: Page) => panel(page).getByRole('button', { name: /^Choose (a|another) file$/ })
const slip = (page: Page) => panel(page).locator('.es-import__slip')
const rules = (page: Page) => panel(page).locator('.es-rule')
const statuses = (page: Page) => rules(page).evaluateAll((items) => items.map((item) => `${item.getAttribute('data-rule')}:${item.getAttribute('data-status')}`))
const status = (page: Page) => panel(page).locator('p.sr-only[role="status"]')
const receiptRows = (page: Page) => page.getByRole('list', { name: 'Receipts held by this browser' }).getByRole('listitem')
const challengeRows = (page: Page) => page.getByRole('list', { name: 'Challenges issued by this browser' }).getByRole('listitem')

interface Stored {
  events: { id: string; kind: string; ref: string; ok?: boolean; score?: number; provenance?: string; data: { receiptSha256?: string; challenge?: string; checks?: { id: string; verdict: string }[]; environment?: string; graderVersion?: string } }[]
  receipts: { sha256: string; receipt: { lab: string; stage: string }; reports: { at: string; report: { v: number; ran: number; rules: { id: string; status: string }[] } }[] }[]
}

/** Everything in the app's own IndexedDB that the importer writes: the events, and the receipts with their reports. */
const stored = (page: Page): Promise<Stored> =>
  page.evaluate(
    () =>
      new Promise<Stored>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(['events', 'receipts'])
          const events = transaction.objectStore('events').getAll()
          const receipts = transaction.objectStore('receipts').getAll()
          transaction.oncomplete = () => {
            db.close()
            resolve({ events: events.result as Stored['events'], receipts: receipts.result as Stored['receipts'] })
          }
          transaction.onerror = () => reject(transaction.error)
        }
      }),
  )

/** The page with the ledger holding a challenge for the sample receipt's token, issued a day ago. */
async function visit(page: Page, route = ROUTE): Promise<{ token: string }> {
  const { token } = bundle().receipt.challenge
  await open(page, ROUTE)
  const ledger = new Ledger()
  ledger.challengeFor(daysAgo(1), token)
  await put(page, { events: ledger.events })
  await page.goto(route)
  await expect(challengeRows(page).first()).toBeVisible()
  await quiet(page, 300)
  return { token }
}

/** Chooses a file with the learner's own picker, as a keyboard does: the stub is focused, and Enter opens the chooser. */
async function chooseWithKeys(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await choose(page).focus()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await chooser).setFiles(file)
}

/** Drops a file on the slip: the events a browser sends, with a DataTransfer that holds the file. */
async function dropOnSlip(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ name, mimeType, bytes }) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }))
      return data
    },
    { name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] },
  )
  await page.locator('.es-drop').dispatchEvent('dragover', { dataTransfer: transfer })
  await expect(page.locator('.es-drop[data-over]')).toHaveCount(1)
  await page.locator('.es-drop').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.locator('.es-drop[data-over]')).toHaveCount(0)
}

/** Hands the input a file that is made in the page, as one big to carry across the protocol would be. */
async function chooseMadeInPage(page: Page, make: 'oversized' | 'bomb'): Promise<void> {
  await page.evaluate(async (kind) => {
    let file: File
    if (kind === 'oversized') {
      file = new File([new Uint8Array(33 * 1024 * 1024)], 'too-big.es.json.gz')
    } else {
      // 300 MiB of zeros through the browser's own gzip: about 300 KB, which inflates past the cap of 256 MiB.
      const zeros = new Uint8Array(1024 * 1024)
      let sent = 0
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 300) controller.close()
          else {
            sent += 1
            controller.enqueue(zeros)
          }
        },
      })
      file = new File([await new Response(source.pipeThrough(new CompressionStream('gzip'))).blob()], 'bomb.es.json.gz')
    }
    const field = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (field === null) throw new Error('the slip has no file input')
    const data = new DataTransfer()
    data.items.add(file)
    field.files = data.files
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }, make)
}

/** One run of a made file: `text` once, or repeated until it fills `megabytes` MiB. */
interface Segment {
  text: string
  megabytes?: number
}

/**
 * Hands the input a gzip file that is made in the page from segments of text, as a few hundred KB through the browser's own compressor: the text inside is as
 * large as the segments say, and nothing is committed. The text is streamed to the compressor in pieces of about a MiB.
 */
async function chooseTextMadeInPage(page: Page, name: string, segments: Segment[]): Promise<void> {
  await page.evaluate(
    async ({ file: fileName, parts }) => {
      const encoder = new TextEncoder()
      const MIB = 1024 * 1024
      // Each segment as the bytes that are sent: once, or as a piece of about a MiB that is sent as many times as it takes.
      const pieces = parts.map((part) => encoder.encode(part.megabytes === undefined ? part.text : part.text.repeat(Math.max(1, Math.floor(MIB / part.text.length)))))
      let at = 0
      let sent = 0
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          for (;;) {
            const part = parts[at]
            if (part === undefined) {
              controller.close()
              return
            }
            if (part.megabytes === undefined) {
              controller.enqueue(pieces[at])
              at += 1
              return
            }
            if (sent >= part.megabytes) {
              at += 1
              sent = 0
              continue
            }
            sent += 1
            controller.enqueue(pieces[at])
            return
          }
        },
      })
      const file = new File([await new Response(source.pipeThrough(new CompressionStream('gzip'))).blob()], fileName)
      const field = document.querySelector<HTMLInputElement>('input[type="file"]')
      if (field === null) throw new Error('the slip has no file input')
      const data = new DataTransfer()
      data.items.add(file)
      field.files = data.files
      field.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { file: name, parts: segments },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* An honest receipt                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('an honest receipt', () => {
  test('chosen with the keys, is checked in the worker, kept with its report, and listed; a grader build that is not the published one makes it not credited', async ({ page, watch }) => {
    await visit(page)
    const before = watch.requests.length
    await expect(slip(page)).toContainText('Drop a receipt')
    await expect(status(page)).toBeEmpty()

    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()

    // Rule by rule: the file is whole, answers the challenge, and the engine is the pin; the grader is not the build this site published under that version. Rules 7 to 9 are W2-T08's:
    // the sample's toy trace has no capture time, the site declares no step count for its stage and its GPU is not in the atlas, so recomputation and the floors fail.
    expect(await statuses(page)).toEqual(['caps:pass', 'schema:pass', 'integrity:pass', 'binding:pass', 'grader:fail', 'pins:pass', 'rechecks:pass', 'recomputation:fail', 'floors:fail'])
    await expect(rules(page).nth(0)).toContainText('bytes compressed')
    await expect(rules(page).nth(2)).toContainText('2 artifacts hashed over canonical bytes')
    await expect(rules(page).nth(3)).toContainText('Bound to the challenge this browser issued for tr3.profile.s2')
    await expect(rules(page).nth(4)).toContainText('enginespace-grader 0.1.0 is not the build this site published under that version.')
    await expect(rules(page).nth(4)).toContainText('The site published version 0.1.0 with source hash')
    await expect(rules(page).nth(5)).toContainText('vllm 0.33.0 is the pin.')

    // What it is worth now: nothing yet, and why.
    await expect(slip(page)).toContainText('not credited')
    await expect(slip(page)).toContainText('T6: This site declares no step count for tr3.profile.s2.')
    await expect(status(page)).toContainText('Kept in your ledger. Not credited.')

    // The ledger has the receipt and the event that spent its token, written together, and the report beside the receipt.
    const found = await stored(page)
    expect(found.receipts).toHaveLength(1)
    expect(found.receipts[0].receipt).toMatchObject({ lab: 'tr3.profile', stage: 'tr3.profile.s2' })
    expect(found.receipts[0].reports).toHaveLength(1)
    expect(found.receipts[0].reports[0].report).toMatchObject({ v: 1, ran: 10 })
    expect(found.receipts[0].reports[0].report.rules.map((rule) => `${rule.id}:${rule.status}`)).toEqual(['caps:pass', 'schema:pass', 'integrity:pass', 'binding:pass', 'grader:fail', 'pins:pass', 'rechecks:pass', 'recomputation:fail', 'floors:fail'])
    const events = found.events.filter((event) => event.kind === 'receipt')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      ref: 'receipt:tr3.profile.s2',
      ok: false,
      score: 0,
      provenance: 'gpu-unverified',
      data: { receiptSha256: found.receipts[0].sha256, graderVersion: '0.1.0', environment: 'Example GPU 24GB, vllm 0.33.0, driver 580.82.07' },
    })
    // The grader's three checks are attested, and the browser's own are pass or fail.
    expect(events[0].data.checks?.filter((check) => ['agreement', 'runner', 'engine-integrity'].includes(check.id)).map((check) => check.verdict)).toEqual(['attested', 'attested', 'attested'])
    expect(events[0].data.checks?.find((check) => check.id === 'T2')?.verdict).toBe('pass')

    // The page reads what was kept: the receipt is in the list, the challenge is used by it, and the tape counts both.
    await expect(receiptRows(page)).toHaveCount(1)
    await expect(receiptRows(page).first()).toContainText('not credited')
    await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'used')
    await expect(challengeRows(page).first()).toContainText(`receipt ${found.receipts[0].sha256.slice(0, 8)}`)
    await expect(page.getByRole('figure', { name: 'Challenges and receipts, counted' }).locator('.es-printer__line')).toHaveText([/open\s*0/i, /used\s*1/i, /expired\s*0/i, /receipts\s*1/i])

    // The check made no request: the worker reads the file it was handed, and the files of the site it was made of.
    await quiet(page)
    expect(watch.requests.slice(before).filter((path) => !path.startsWith('/fonts/') && !/^\/assets\/receipt\.worker-[\w-]+\.js$/.test(path)), 'requests made while a receipt was checked').toEqual([])
    expect(watch.strays).toEqual([])
  })

  test('dropped on the slip, is the same receipt: the same hash, and the slip shows the filament while the file is over it', async ({ page }) => {
    await visit(page)
    await dropOnSlip(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    const first = (await stored(page)).receipts[0].sha256
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    await expect(slip(page).getByRole('link', { name: 'Open the receipt' })).toHaveAttribute('href', `/receipts#${first}`)
  })

  test('takes focus to its result when the check ends, and leads to the receipt\'s page, which lists the rules that were run', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    await expect(slip(page)).toBeFocused()

    await slip(page).getByRole('link', { name: 'Open the receipt' }).click()
    const article = page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })
    await expect(article).toBeVisible()
    const checked = article.locator('.es-receipt__part', { hasText: 'How this browser checked it' })
    await expect(checked.locator('.es-rule')).toHaveCount(9)
    await expect(checked.locator('.es-import__verdict[data-rule="verdict"]')).toBeVisible()
    await expect(checked).toContainText('re-checked here')
    await expect(checked).toContainText('attested by grader 0.1.0')
    await expect(checked).toContainText('not credited')
    await expect(article).toContainText('Used by this receipt.')
  })

  test('imported again, adds the report of the new check and writes no second event: it is the receipt that spent the token, and it is bound again', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Checked again' })).toBeVisible()
    await expect(slip(page)).toContainText('This receipt was in your ledger already.')
    expect((await statuses(page))[3]).toBe('binding:pass')
    const found = await stored(page)
    expect(found.receipts).toHaveLength(1)
    expect(found.receipts[0].reports).toHaveLength(2)
    expect(found.events.filter((event) => event.kind === 'receipt')).toHaveLength(1)
    await expect(receiptRows(page)).toHaveCount(1)
  })

  test('survives a reload: the receipt and its report are read back from the ledger, and the page lists the rules it was checked by', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    const { sha256 } = (await stored(page)).receipts[0]
    await page.goto(`${ROUTE}#${sha256}`)
    const article = page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })
    await expect(article).toBeVisible()
    await expect(article.locator('.es-rule')).toHaveCount(9)
    await expect(article.locator('.es-rule[data-rule="grader"]')).toHaveAttribute('data-status', 'fail')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 1. Oversized and zip-bomb files abort with a message                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a file that is over a cap', () => {
  test('is refused by its size when it is over 32 MB, with the cap in the message, and nothing is kept', async ({ page }) => {
    await visit(page)
    await chooseMadeInPage(page, 'oversized')
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible({ timeout: 30_000 })
    await expect(slip(page).locator('[data-state="error"]')).toBeVisible()
    await expect(slip(page)).toContainText('The file is 34,603,008 bytes, and the site reads at most 33,554,432 compressed (the cap of rule 1).')
    expect(await statuses(page)).toEqual(['caps:fail', 'schema:skipped', 'integrity:skipped', 'binding:skipped', 'grader:skipped', 'pins:skipped', 'rechecks:skipped', 'recomputation:skipped', 'floors:skipped'])
    await expect(slip(page)).toContainText('Nothing was kept and no challenge was spent.')
    const found = await stored(page)
    expect(found.receipts).toEqual([])
    expect(found.events.filter((event) => event.kind === 'receipt')).toEqual([])
    await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'open')
  })

  test('that is a zip bomb is stopped at the cap while it is decompressed, in the worker, with the cap in the message, and nothing is kept', async ({ page }) => {
    test.setTimeout(120_000)
    await visit(page)
    await chooseMadeInPage(page, 'bomb')
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible({ timeout: 90_000 })
    await expect(slip(page)).toContainText('It holds more than the 268,435,456 bytes that the site reads once decompressed (the cap of rule 1), so it stopped there.')
    expect((await statuses(page))[0]).toBe('caps:fail')
    expect((await stored(page)).receipts).toEqual([])
    await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'open')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* A file inside the caps whose shape would run the parser out of memory                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a file inside the caps that is built to run the parser out of memory', () => {
  /** The shapes the review measured to crash the tab in `JSON.parse`, at its sizes: each passes rule 1 (a few hundred KB compressed, under 256 MB inside). */
  const BOMBS: { name: string; file: string; segments: Segment[]; message: RegExp }[] = [
    {
      name: '200 MB of nested brackets, 100 million levels deep',
      file: 'nested.es.json.gz',
      segments: [{ text: '[', megabytes: 100 }, { text: ']', megabytes: 100 }],
      message: /The JSON inside nests more than 64 levels deep, and the site parses at most that \[estimated\]/,
    },
    {
      name: '250 MB of empty arrays, 87 million of them',
      file: 'arrays.es.json.gz',
      segments: [{ text: '[' }, { text: '[],', megabytes: 250 }, { text: '[]]' }],
      message: /The JSON inside holds more than 4,194,304 arrays, objects and strings \(member names included\)/,
    },
    {
      name: '250 MB of empty objects, 87 million of them',
      file: 'objects.es.json.gz',
      segments: [{ text: '[' }, { text: '{},', megabytes: 250 }, { text: '{}]' }],
      message: /The JSON inside holds more than 4,194,304 arrays, objects and strings \(member names included\)/,
    },
  ]

  /**
   * A file of numbers inside the caps and inside the node bound (the second review): `0,` and `-0,` are no node, and 250 MB of them crashed the tab in the canonical form, which makes a
   * string and a slot for each (22 s, a peak of 4.17 GB [measured in the second review, the same Chromium]), in the receipt's \`ext\` and in a JSON artifact alike. Rule 2 counts the commas.
   */
  const marked = (change: (document: ReturnType<typeof sampleBundle>) => void): [string, string] => {
    const document = sampleBundle()
    change(document)
    const [head, tail] = JSON.stringify(document).split('"@@"')
    return [head, tail]
  }
  const [extHead, extTail] = marked((document) => {
    ;(document.receipt as { ext: unknown }).ext = '@@'
  })
  const [artifactHead, artifactTail] = marked((document) => {
    ;(document.artifacts.trace as { data: unknown }).data = '@@'
  })
  const commaMessage = /The JSON inside holds more than 16,777,216 commas outside its strings/
  for (const [place, head, tail] of [
    ['receipt.ext', extHead, extTail],
    ['the data of a JSON artifact', artifactHead, artifactTail],
  ] as const) {
    for (const unit of ['0,', '-0,']) {
      BOMBS.push({
        name: `250 MB of ${unit} in ${place}`,
        file: 'numbers.es.json.gz',
        segments: [{ text: `${head}{"pad":[` }, { text: unit, megabytes: 250 }, { text: `0]}${tail}` }],
        message: commaMessage,
      })
    }
  }

  for (const bomb of BOMBS) {
    test(`is refused at rule 2 with the bound in the message, unparsed, the tab alive, and nothing kept: ${bomb.name}`, async ({ page }) => {
      test.setTimeout(150_000)
      let crashed = false
      page.on('crash', () => {
        crashed = true
      })
      await visit(page)
      await chooseTextMadeInPage(page, bomb.file, bomb.segments)
      await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible({ timeout: 120_000 })
      expect(crashed, 'the tab crashed').toBe(false)
      expect(await statuses(page)).toEqual(['caps:pass', 'schema:fail', 'integrity:skipped', 'binding:skipped', 'grader:skipped', 'pins:skipped', 'rechecks:skipped', 'recomputation:skipped', 'floors:skipped'])
      await expect(rules(page).nth(1)).toContainText(bomb.message)
      await expect(slip(page)).toContainText('Nothing was kept and no challenge was spent.')
      const found = await stored(page)
      expect(found.receipts).toEqual([])
      expect(found.events.filter((event) => event.kind === 'receipt')).toEqual([])
      await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'open')
      // The page is still the learner's: the slip takes the honest file next.
      await chooseWithKeys(page, fileOf(bundle()))
      await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    })
  }

  /**
   * One long string in a JSON artifact (the second review of W2's rest track, finding 1). In the pinned Chromium, `JSON.stringify` of a parsed string longer than 2^27 characters that
   * holds one outside Latin-1 crashed the renderer in rule 3's canonical form: "π" and 129 MiB of `a` is about 133 KB compressed, and passed rules 1 and 2 (2.1 s to the crash, 0.72 GB
   * [measured 2026-11-15 at ff47e8f]). The canonical form now writes a long string in pieces (packages/sim/core/json.ts), so each file is a hash that does not match (rule 3, the artifact named),
   * never a crash. Nothing is committed: the strings are made in the page.
   */
  const LONG_STRINGS: { name: string; segments: Segment[] }[] = [
    { name: '"π" and 129 MiB of `a` as one value', segments: [{ text: `${artifactHead}"π` }, { text: 'a', megabytes: 129 }, { text: `"${artifactTail}` }] },
    { name: '"π" and 129 MiB of `a` as a member name', segments: [{ text: `${artifactHead}{"π` }, { text: 'a', megabytes: 129 }, { text: `":1}${artifactTail}` }] },
    {
      name: '"π" and 100 MiB of `a` in each of two strings, in nested arrays',
      segments: [{ text: `${artifactHead}[["π` }, { text: 'a', megabytes: 100 }, { text: '"],[["π' }, { text: 'a', megabytes: 100 }, { text: `"]]]${artifactTail}` }],
    },
    { name: '120 Mi characters of `π` and nothing else (240 MiB, near the cap of rule 1)', segments: [{ text: `${artifactHead}"` }, { text: 'π', megabytes: 120 }, { text: `"${artifactTail}` }] },
  ]
  for (const long of LONG_STRINGS) {
    test(`is refused at rule 3, naming the artifact, the tab alive, and nothing kept: ${long.name}`, async ({ page }) => {
      test.setTimeout(150_000)
      let crashed = false
      page.on('crash', () => {
        crashed = true
      })
      await visit(page)
      await chooseTextMadeInPage(page, 'long.es.json.gz', long.segments)
      await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible({ timeout: 120_000 })
      expect(crashed, 'the tab crashed').toBe(false)
      expect(await statuses(page)).toEqual(['caps:pass', 'schema:pass', 'integrity:fail', 'binding:skipped', 'grader:skipped', 'pins:skipped', 'rechecks:skipped', 'recomputation:skipped', 'floors:skipped'])
      await expect(rules(page).nth(2)).toContainText('Artifact "trace": its data in the bundle hashes to')
      expect((await stored(page)).receipts).toEqual([])
      await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'open')
    })
  }

  test('reads a file of numbers that is inside the bound on commas, which cost a parser next to nothing, and says it is no bundle', async ({ page }) => {
    test.setTimeout(150_000)
    let crashed = false
    page.on('crash', () => {
      crashed = true
    })
    await visit(page)
    // 12 MiB of integers: 6.3 million of them in one array, inside the bound of 16,777,216 commas, with no array, object or string beyond the one that holds them.
    await chooseTextMadeInPage(page, 'numbers.es.json.gz', [{ text: '[' }, { text: '0,', megabytes: 12 }, { text: '0]' }])
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible({ timeout: 120_000 })
    expect(crashed, 'the tab crashed').toBe(false)
    expect((await statuses(page)).slice(0, 2)).toEqual(['caps:pass', 'schema:fail'])
    await expect(rules(page).nth(1)).toContainText('(the file): ')
    await expect(rules(page).nth(1)).not.toContainText('The JSON inside')
  })

  // The review of W2's rest track: a list of millions of empty objects and numbers in `receipt.artifacts` is inside rule 1's caps and all three shape bounds, and zod made an issue for
  // each before it applied the list's own bound [measured, build 32b30c4: the tab crashed after 22 s at 4.5 GB]. Rule 2 counts the schema's lists before the schema sees them.
  const listed = (members: Segment[]): Segment[] => {
    const [head = '', tail = ''] = JSON.stringify({ ...bundle(), receipt: { ...bundle().receipt, artifacts: ['@@'] } }).split('["@@"]')
    return [{ text: `${head}[` }, ...members, { text: `]${tail}` }]
  }
  for (const [label, segments] of [
    ['3.8 million {} and 12.6 million 0 in receipt.artifacts (the file that crashed the tab)', [{ text: '{},', megabytes: 11 }, { text: '0,', megabytes: 24 }, { text: '0' }]],
    ['524,288 zeros in receipt.artifacts (the small file that made the check break)', [{ text: '0,', megabytes: 1 }, { text: '0' }]],
  ] as const) {
    test(`refuses ${label} at rule 2, naming the list, and the tab lives`, async ({ page }) => {
      test.setTimeout(200_000)
      let crashed = false
      page.on('crash', () => {
        crashed = true
      })
      await visit(page)
      await chooseTextMadeInPage(page, 'listed.es.json.gz', listed([...segments]))
      await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible({ timeout: 150_000 })
      expect(crashed, 'the tab crashed').toBe(false)
      expect((await statuses(page)).slice(0, 2)).toEqual(['caps:pass', 'schema:fail'])
      await expect(rules(page).nth(1)).toContainText('/receipt/artifacts: holds more than the 64 entries that it may')
      await expect(rules(page).nth(1)).not.toContainText('may be a good one')
    })
  }
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Files that are not receipts                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a file that is not a receipt', () => {
  test('is refused when it is not gzip, or is gzip cut short, with a message that says what a bundle is', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a bundle') })
    await expect(slip(page)).toContainText('It is not a gzip file: a bundle is a .es.json.gz file, as `enginespace grade` writes it.')
    const whole = gzipSync(JSON.stringify(bundle()))
    await chooseWithKeys(page, { name: 'cut.es.json.gz', mimeType: 'application/gzip', buffer: whole.subarray(0, Math.floor(whole.length / 2)) })
    await expect(slip(page)).toContainText('The gzip data is damaged or cut short, so it cannot be read.')
    expect((await stored(page)).receipts).toEqual([])
  })

  test('is refused at rule 2 when it is JSON of another shape, and names the place', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf({ hello: 'world' }))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible()
    expect(await statuses(page)).toEqual(['caps:pass', 'schema:fail', 'integrity:skipped', 'binding:skipped', 'grader:skipped', 'pins:skipped', 'rechecks:skipped', 'recomputation:skipped', 'floors:skipped'])
    await expect(rules(page).nth(1)).toContainText('/schema:')
  })

  test('puts nothing of the file on the page as markup: a file name with a tag in it is text', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, { name: '<img src=x onerror=alert(1)>.es.json.gz', mimeType: 'application/gzip', buffer: Buffer.from('nope') })
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible()
    await expect(slip(page)).toContainText('<img src=x onerror=alert(1)>.es.json.gz')
    expect(await panel(page).locator('img').count()).toBe(0)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 2. A tampered hash fails integrity                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a tampered hash', () => {
  test('fails integrity and names the artifact: the file is refused, nothing is kept, and the challenge is still open', async ({ page }) => {
    await visit(page)
    const tampered = bundle()
    const entry = tampered.receipt.artifacts.find((artifact) => artifact.id === 'trace')
    if (entry === undefined) throw new Error('the sample has no trace')
    entry.sha256 = '1'.repeat(64)
    await chooseWithKeys(page, fileOf(tampered))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible()
    expect(await statuses(page)).toEqual(['caps:pass', 'schema:pass', 'integrity:fail', 'binding:skipped', 'grader:skipped', 'pins:skipped', 'rechecks:skipped', 'recomputation:skipped', 'floors:skipped'])
    await expect(rules(page).nth(2)).toContainText('Artifact "trace": its data in the bundle hashes to')
    await expect(rules(page).nth(2)).toContainText(`the receipt lists ${'1'.repeat(64)}`)
    await expect(slip(page)).toContainText('An artifact in the bundle is not the one the receipt lists.')
    const found = await stored(page)
    expect(found.receipts).toEqual([])
    expect(found.events.map((event) => event.kind)).toEqual(['challenge'])
    await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'open')
  })

  test('is taken once it is mended: the same learner brings the honest file next, and it is kept', async ({ page }) => {
    await visit(page)
    const tampered = bundle()
    const entry = tampered.receipt.artifacts.find((artifact) => artifact.id === 'log')
    if (entry !== undefined) entry.bytes += 1
    await chooseWithKeys(page, fileOf(tampered))
    await expect(rules(page).nth(2)).toContainText('Artifact "log": its data in the bundle is 21 bytes, and the receipt lists 22.')
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    expect((await stored(page)).receipts).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 3. A reused token fails binding                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a reused token', () => {
  test('fails binding for a second receipt: it is kept with the reason, and the token stays the first receipt\'s', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    const first = (await stored(page)).receipts[0].sha256

    // The same stage and token, another run: its notes differ, so it is another receipt.
    const second = bundle()
    second.receipt.notes = 'A second run on the same challenge.'
    await chooseWithKeys(page, fileOf(second, 'second.es.json.gz'))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    expect((await statuses(page))[3]).toBe('binding:fail')
    await expect(rules(page).nth(3)).toContainText(`spent by receipt ${first.slice(0, 8)} already`)
    await expect(rules(page).nth(3)).toContainText('single-use')
    await expect(slip(page)).toContainText('not credited')

    const found = await stored(page)
    expect(found.receipts).toHaveLength(2)
    await expect(receiptRows(page)).toHaveCount(2)
    await expect(challengeRows(page).first()).toContainText(`receipt ${first.slice(0, 8)}`)
  })

  test('fails binding for a token this browser never issued, a friend\'s receipt, and says where such a receipt is imported', async ({ page }) => {
    await open(page, ROUTE)
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    expect((await statuses(page))[3]).toBe('binding:fail')
    await expect(rules(page).nth(3)).toContainText("This browser's ledger holds no challenge with this token.")
    await expect(rules(page).nth(3)).toContainText('imported there')
  })

  test('fails binding for a token that has expired, and says when it did', async ({ page }) => {
    const { token } = bundle().receipt.challenge
    await open(page, ROUTE)
    const ledger = new Ledger()
    ledger.challengeFor(daysAgo(20), token)
    await put(page, { events: ledger.events })
    await page.reload()
    await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'expired')
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    expect((await statuses(page))[3]).toBe('binding:fail')
    await expect(rules(page).nth(3)).toContainText('The token expired at')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 4. An unknown grader build gives gpu-unverified                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('an unknown grader build', () => {
  test('gives gpu-unverified: the receipt is kept with the reason shown, and credits nothing', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf(bundle()))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    await expect(rules(page).locator('xpath=self::*[@data-rule="grader"]')).toHaveAttribute('data-status', 'fail')
    const event = (await stored(page)).events.find((candidate) => candidate.kind === 'receipt')
    expect(event).toMatchObject({ provenance: 'gpu-unverified', ok: false, score: 0 })
    // The progress the learner sees does not move: the ledger has a receipt that earned nothing.
    await expect(slip(page).locator('.es-import__worth')).toHaveText('not credited')
  })

  test('has the same standing when the engine is off the pin: the receipt is kept, and rule 6 fails with what the course pins', async ({ page }) => {
    await visit(page)
    const offPin = bundle()
    if (offPin.receipt.environment.engine !== undefined) offPin.receipt.environment.engine.version = '0.32.0'
    await chooseWithKeys(page, fileOf(offPin))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    expect((await statuses(page))[5]).toBe('pins:fail')
    await expect(rules(page).nth(5)).toContainText('vllm 0.32.0 is off the pin: the course pins vllm 0.33.0.')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The ledger that cannot be written                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

test('keeps nothing and says so when the ledger would not take the receipt', async ({ page }) => {
  await visit(page)
  // A write to the receipts store that fails: the page's own database refuses the transaction.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: string | string[], mode?: IDBTransactionMode) {
      const names = Array.isArray(stores) ? stores : [stores]
      if (mode === 'readwrite' && names.includes('receipts')) throw new DOMException('the disk is full', 'QuotaExceededError')
      return original.call(this, stores, mode)
    }
  })
  await chooseWithKeys(page, fileOf(bundle()))
  await expect(slip(page).getByRole('heading', { level: 3, name: 'Not kept' })).toBeVisible()
  await expect(slip(page)).toContainText('The browser could not save the change, and nothing was changed.')
  expect((await statuses(page)).length).toBe(9)
  expect((await stored(page)).receipts).toEqual([])
  await expect(challengeRows(page).first()).toHaveAttribute('data-state', 'open')
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The keyboard, axe, and the width                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const IMPACTS = new Set(['serious', 'critical'])

/** The audit of e2e/a11y.spec.ts: serious and critical violations fail, and so does any finding about the headings. */
async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
  const summary = (violation: (typeof results.violations)[number]) => `${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(' ')).join(' ; ')}`
  expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map(summary), `${label}: serious or critical violations`).toEqual([])
  expect(results.violations.filter((violation) => ['heading-order', 'page-has-heading-one', 'empty-heading'].includes(violation.id)).map(summary), `${label}: the heading outline`).toEqual([])
}

for (const width of [360, 1280]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('axe finds no serious or critical violation in any state of the slip, and the page does not scroll sideways', async ({ page }) => {
      test.setTimeout(120_000)
      await visit(page)
      await quiet(page)
      await audit(page, `/receipts, the slip waiting, at ${width} px`)

      await chooseWithKeys(page, fileOf(bundle()))
      await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
      await quiet(page)
      await audit(page, `/receipts, a receipt kept, at ${width} px`)
      const kept = await clipped(page)
      expect(kept.scrolls, 'a receipt kept: pixels the page scrolls sideways').toBeLessThanOrEqual(0)
      expect(kept.text, 'a receipt kept: text past the right edge').toEqual([])

      const tampered = bundle()
      const entry = tampered.receipt.artifacts.find((artifact) => artifact.id === 'trace')
      if (entry !== undefined) entry.sha256 = '1'.repeat(64)
      await chooseWithKeys(page, fileOf(tampered))
      await expect(slip(page).getByRole('heading', { level: 3, name: 'Not a receipt this browser can read' })).toBeVisible()
      await quiet(page)
      await audit(page, `/receipts, a file refused, at ${width} px`)
      const refused = await clipped(page)
      expect(refused.scrolls, 'a file refused: pixels the page scrolls sideways').toBeLessThanOrEqual(0)
      expect(refused.text, 'a file refused: text past the right edge').toEqual([])

      const found = (await stored(page)).receipts[0]
      await page.goto(`${ROUTE}#${found.sha256}`)
      await expect(page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })).toBeVisible()
      await quiet(page)
      await audit(page, `/receipts, a receipt that has been checked, at ${width} px`)
    })
  })
}

test.describe('at 320 px', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('no text is cut off at the right edge when a long file name and a long hash are on the slip', async ({ page }) => {
    await visit(page)
    await chooseWithKeys(page, fileOf(bundle(), `${'a-very-long-file-name-'.repeat(8)}.es.json.gz`))
    await expect(slip(page).getByRole('heading', { level: 3, name: 'Kept in your ledger' })).toBeVisible()
    await quiet(page)
    const state = await clipped(page)
    expect(state.scrolls, 'pixels the page scrolls sideways').toBeLessThanOrEqual(0)
    expect(state.text, 'text past the right edge').toEqual([])
  })
})
