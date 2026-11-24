/*
 * W2-T06's acceptance checks, in Playwright's Chromium, on /receipts:
 *
 *   1. Tokens decode with the shared codec. The page issues a challenge for a lab and a stage, and the token on the ticket is one that
 *      packages/schema's `checkChallenge` takes apart into the parts that were drawn: the stage that was chosen, the seed and the nonce
 *      that the browser's entropy gave (the spec answers `crypto.getRandomValues` from a queue, as e2e/today.spec.ts does), and the
 *      day. The challenge is written to the learner's IndexedDB as one `challenge` event, and nothing is asked of the network: this page
 *      sends nothing anywhere (I1).
 *   2. Expired and used tokens are shown as such. A ledger with a challenge in each state shows each in words, and only an open one offers
 *      a copy; a used one leads to the receipt that used it.
 *   3. The page passes a keyboard walk and axe. The walk is Tab, the keys of a select, Enter and Space, from the top of the document to the
 *      copy of the first token, with a focus ring at every stop and nothing covering it; axe runs in every state of the page at a
 *      phone's width and a laptop's, and a phone's width has no sideways scroll.
 *
 * And what stands behind them. The copy puts the token, and the command, on the clipboard, and a browser that refuses leaves the text
 * selected for the learner. A receipt opens at `#<sha256>`, takes focus, and the way back returns to the lists; a hash that names no
 * receipt, and a record that is not a receipt, say so. `?stage=` opens the page on a stage.
 *
 * How it runs. Through the config's `baseURL` (`vite preview` over a fresh build), under e2e/support/site.ts's watch, which fails a spec
 * whose page asks for anything outside the origin, has its policy refuse something, or throws. The ledger is seeded the way the app and
 * the importer write it (e2e/support/receipts.ts), into the IndexedDB that the app made.
 *
 *   npx playwright test e2e/receipts.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { checkChallenge, parseChallenge } from '@es/schema/challenge'
import { drawParts } from '../src/receipts/challenge'
import { RECEIPTS } from '../src/receipts/copy'
import { Ledger, wordsOf } from '../tests/receipts/support'
import { put, seeded } from './support/receipts'
import { walkOf } from './support/front'
import { clipped, expect, open, quiet, test, withSettings } from './support/site'

const ROUTE = '/receipts'
const WORDS = [0x0badc0de, 0x12345678, 0x0abcdef0, 0x13572468]
const STAGE = 'tr8.replay.s2'
/** A stage of a lab with a page, which prints the page's own command; STAGE's lab has none and prints that it is not published. */
const PAGE_STAGE = 'tr0.forward.s3'
const pageCommand = (token: string) => `uv run --project envs/cpu enginespace grade ${PAGE_STAGE} --challenge ${token} --assisted <none|explain|code> --agent <yes|no>`

declare global {
  interface Window {
    __queue?: number[]
  }
}

/** The page's entropy is answered from `window.__queue` when it holds enough, and is the browser's own otherwise. */
test.beforeEach(async ({ context }) => {
  await withSettings(context, { view3d: false })
  await context.addInitScript(() => {
    window.__queue = []
    const real = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      const queue = window.__queue ?? []
      if (array instanceof Uint32Array && queue.length >= array.length) {
        for (let at = 0; at < array.length; at += 1) array[at] = queue.shift() ?? 0
        return array
      }
      return real(array as Uint32Array)
    }) as typeof crypto.getRandomValues
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The page's pieces                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const lab = (page: Page) => page.getByLabel('Lab', { exact: true })
const stage = (page: Page) => page.getByLabel('Stage', { exact: true })
const getChallenge = (page: Page) => page.getByRole('button', { name: 'Get a challenge' })
const ticket = (page: Page, id = STAGE) => page.getByRole('region', { name: `Challenge for ${id}` })
const token = (page: Page) => page.locator('[data-token]').first()
/** The lines of the list of challenges: the list of receipts has lines of its own. */
const rows = (page: Page) => page.getByRole('list', { name: 'Challenges issued by this browser' }).getByRole('listitem')

/** Chooses a lab and a stage, with the learner's own controls, and asks for a challenge. */
async function issue(page: Page, labId = 'tr8.replay', stageId = STAGE): Promise<void> {
  await lab(page).selectOption(labId)
  await stage(page).selectOption(stageId)
  await getChallenge(page).click()
  await expect(ticket(page, stageId)).toBeVisible()
}

/** The tokens' text without the line-break hints, as the learner would copy it. */
const tokenText = async (page: Page): Promise<string> => ((await token(page).textContent()) ?? '').trim()

/** Every event in the app's own IndexedDB. */
const events = (page: Page): Promise<{ id: string; kind: string; ref: string; data: { token: string; seed: number; nonce: string; issuedOn: string } }[]> =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction('events').objectStore('events').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(all.result)
          }
        }
      }),
  )

const today = (): string => new Date().toISOString().slice(0, 10).replaceAll('-', '')

/** Opens the page on a ledger that holds the seeded challenges and receipt (the app is opened once to make its database). */
async function visitSeeded(page: Page, route = ROUTE): Promise<ReturnType<typeof seeded>> {
  const ledger = seeded()
  await open(page, ROUTE)
  await put(page, { events: ledger.events, receipts: ledger.receipts })
  await page.goto(route)
  await expect(rows(page).first()).toBeVisible()
  await quiet(page, 300)
  return ledger
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 1. A token the page issues is one the shared codec reads                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('issuing a challenge', () => {
  test('prints a token that the shared codec takes apart into what was chosen and what the entropy gave, writes one event, and asks nothing of the network', async ({
    page,
    watch,
  }) => {
    await open(page, ROUTE)
    await expect(getChallenge(page)).toBeEnabled()
    await expect(stage(page)).toBeDisabled()
    await lab(page).selectOption('tr8.replay')
    await expect(stage(page)).toBeEnabled()
    await expect(stage(page).locator('option')).toHaveText(['Choose a stage', 's1 · a smoke replay (optional)', 's2 · the BurstGPT replay', 's3 · vllm bench serve (optional)'])
    await stage(page).selectOption(STAGE)
    await expect(page.getByText('It needs a GPU, yours or a rented one.')).toBeVisible()

    await page.evaluate((words) => {
      window.__queue = words
    }, WORDS)
    const before = watch.requests.length
    await getChallenge(page).click()
    await expect(ticket(page)).toBeVisible()

    const text = await tokenText(page)
    expect(checkChallenge(text).ok, text).toBe(true)
    const expected = drawParts(STAGE, today(), wordsOf(...WORDS))
    expect(parseChallenge(text)).toMatchObject({ stage: STAGE, seed: 0x0badc0de, nonce: expected.nonce, issuedOn: today() })
    expect(text.split(':')[2]).toBe('0badc0de')
    // STAGE's lab has no page, so the ticket prints no command, says so, and offers none to copy.
    await expect(page.getByText(`This lab is not published yet, so there is no command to run.`)).toBeVisible()
    await expect(ticket(page).getByRole('button', { name: 'Copy the command' })).toHaveCount(0)
    await expect(ticket(page)).not.toContainText('enginespace grade')

    // One event, in the learner's IndexedDB, of the kind and the ref that A§7.2 gives it, with the token's own parts.
    const stored = await events(page)
    expect(stored.filter((event) => event.kind === 'challenge')).toHaveLength(1)
    expect(stored[0]).toMatchObject({ kind: 'challenge', ref: `challenge:${STAGE}`, data: { token: text, seed: 0x0badc0de, nonce: expected.nonce, issuedOn: today() } })

    // It is listed, open, and counted on the tape.
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toHaveAttribute('data-state', 'open')
    await expect(rows(page).first()).toContainText(STAGE)
    await expect(page.getByRole('figure', { name: 'Challenges and results, counted' })).toContainText(/open\s*1/i)

    // I1: nothing was asked of the network. The origin's own typefaces load when a page first sets text in them (the command is set in the
    // mono), and that is all that may have been asked.
    await quiet(page)
    expect(watch.requests.slice(before).filter((path) => !path.startsWith('/fonts/')), 'requests made while a challenge was issued').toEqual([])
    expect(watch.strays).toEqual([])
  })

  test('is a challenge for the stage that was chosen, for every lab and stage the page offers', async ({ page }) => {
    await open(page, ROUTE)
    const labs = await lab(page).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean))
    expect(labs).toEqual(['tr0.forward', 'tr1.fork', 'tr3.profile', 'tr4.sweep', 'tr5b.connector', 'tr6.proposer', 'tr7.reproduce', 'tr8.replay', 'capstone.pair'])
    for (const labId of ['tr0.forward', 'capstone.pair']) {
      await lab(page).selectOption(labId)
      const stages = await stage(page).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean))
      expect(stages.length).toBeGreaterThanOrEqual(2)
      const last = stages[stages.length - 1]
      await stage(page).selectOption(last)
      await getChallenge(page).click()
      await expect(ticket(page, last)).toBeVisible()
      expect(parseChallenge(await tokenText(page))?.stage).toBe(last)
    }
    await expect(rows(page)).toHaveCount(2)
  })

  test('draws another token each time, keeps every one, and lists the newest first', async ({ page }) => {
    await open(page, ROUTE)
    await issue(page)
    const first = await tokenText(page)
    await getChallenge(page).click()
    await expect(rows(page)).toHaveCount(2)
    // The ticket swaps to the new token after the list grows, so poll until it shows one that is not the first.
    await expect.poll(() => tokenText(page)).not.toBe(first)
    const second = await tokenText(page)
    const stored = await events(page)
    expect(stored.map((event) => event.data.token).sort()).toEqual([first, second].sort())
    // The ticket shows the newest, and the list has both.
    await expect(rows(page).first().getByRole('button', { name: `Copy token for ${STAGE}` })).toBeVisible()
  })

  test('keeps the challenge across a reload, and an open challenge is still open', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page, ROUTE)
    await issue(page)
    const made = await tokenText(page)
    await page.reload()
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toHaveAttribute('data-state', 'open')
    // The ticket is gone (it printed once), and the list's copy still has the token.
    await expect(page.locator('[data-token]')).toHaveCount(0)
    await rows(page).first().getByRole('button', { name: `Copy token for ${STAGE}` }).click()
    await expect(page.getByText('Copied', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(made)
  })

  test('opens on the stage that the address asks for, and ignores one that no lab lists', async ({ page }) => {
    await page.goto(`${ROUTE}?stage=${STAGE}`)
    await expect(page.locator('h1')).toBeVisible()
    await expect(lab(page)).toHaveValue('tr8.replay')
    await expect(stage(page)).toHaveValue(STAGE)
    await getChallenge(page).click()
    await expect(ticket(page)).toBeVisible()
    await page.goto(`${ROUTE}?stage=nothing`)
    await expect(lab(page)).toHaveValue('')
    await expect(stage(page)).toBeDisabled()
  })

  test('says what is missing when the button is pressed with nothing chosen, and takes focus to the first control to fix', async ({ page }) => {
    await open(page, ROUTE)
    await getChallenge(page).click()
    await expect(page.getByRole('alert')).toHaveText('Choose a lab first.')
    await expect(lab(page)).toBeFocused()
    await expect(lab(page)).toHaveAttribute('aria-invalid', 'true')
    await lab(page).selectOption('tr4.sweep')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await getChallenge(page).click()
    await expect(page.getByRole('alert')).toHaveText('Choose a stage first.')
    await expect(stage(page)).toBeFocused()
    expect(await events(page)).toEqual([])
  })

  test('names the stage that is optional, and the one that runs on the laptop', async ({ page }) => {
    await open(page, ROUTE)
    await lab(page).selectOption('tr0.forward')
    await stage(page).selectOption('tr0.forward.s2')
    await expect(page.getByText("It runs on your laptop's CPU.")).toBeVisible()
    await stage(page).selectOption('tr0.forward.s1')
    await expect(page.getByText("It runs on your laptop's CPU. The module does not need it.")).toBeVisible()
  })

  test('has the stage of another lab cleared when the lab changes, so a token is never made for a stage that was left behind', async ({ page }) => {
    await open(page, ROUTE)
    await lab(page).selectOption('tr8.replay')
    await stage(page).selectOption(STAGE)
    await lab(page).selectOption('tr4.sweep')
    await expect(stage(page)).toHaveValue('')
    await getChallenge(page).click()
    await expect(page.getByRole('alert')).toHaveText('Choose a stage first.')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The copy                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('copying', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('puts the token, and the command, on the clipboard, and says so in words that a reader hears', async ({ page }) => {
    await open(page, ROUTE)
    await issue(page, 'tr0.forward', PAGE_STAGE)
    const made = await tokenText(page)
    const status = ticket(page, PAGE_STAGE).getByRole('status')
    await expect(status).toBeEmpty()

    await ticket(page, PAGE_STAGE).getByRole('button', { name: 'Copy the token' }).click()
    await expect(status).toHaveText('Copied the token.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(made)

    await ticket(page, PAGE_STAGE).getByRole('button', { name: 'Copy the command' }).click()
    await expect(status).toHaveText('Copied the command.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pageCommand(made))
  })

  test('copies the token of an open challenge from the list, and the word goes by itself', async ({ page }) => {
    await open(page, ROUTE)
    await issue(page)
    const made = await tokenText(page)
    const row = rows(page).first()
    await row.getByRole('button', { name: `Copy token for ${STAGE}` }).click()
    await expect(row.getByRole('status')).toHaveText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(made)
    await expect(row.getByRole('status')).toBeEmpty({ timeout: 8000 })
  })

  test('shows the token of an open challenge, selected, when the browser refuses to copy it from the list', async ({ page }) => {
    await open(page, ROUTE)
    await issue(page)
    const made = await tokenText(page)
    await page.reload()
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('refused')), configurable: true })
    })
    const row = rows(page).first()
    await row.getByRole('button', { name: `Copy token for ${STAGE}` }).click()
    await expect(row.getByRole('status')).toHaveText('The browser would not copy. The token is shown and selected: copy it yourself.')
    await expect(row.locator('.es-held__token')).toHaveText(made)
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(made)
  })

  test('leaves the token selected, and says so, when the browser refuses to copy it', async ({ page }) => {
    await open(page, ROUTE)
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('refused')), configurable: true })
    })
    await issue(page, 'tr0.forward', PAGE_STAGE)
    const made = await tokenText(page)
    await ticket(page, PAGE_STAGE).getByRole('button', { name: 'Copy the token' }).click()
    await expect(ticket(page, PAGE_STAGE).getByRole('status')).toHaveText('The browser would not copy. The text is selected: copy it yourself.')
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(made)

    await ticket(page, PAGE_STAGE).getByRole('button', { name: 'Copy the command' }).click()
    expect(await page.evaluate(() => window.getSelection()?.toString().replace(/\s+/g, ' '))).toBe(pageCommand(made))
  })

  test("prints, for a lab with a page, the lab page's own grade command, which runs in the kit as it is copied", async ({ page }) => {
    const id = 'tr0.forward.s3'
    await open(page, '/labs/tr0.forward')
    const onLab = (await page.locator('[data-command-line]').filter({ hasText: `grade ${id} ` }).first().textContent()) ?? ''
    expect(onLab).toContain('uv run --project envs/cpu enginespace grade')
    await open(page, ROUTE)
    await issue(page, 'tr0.forward', id)
    const made = await tokenText(page)
    const printed = ((await ticket(page, id).locator('.es-chit__command code').textContent()) ?? '').replace(/\s+/g, ' ').trim()
    expect(printed).toBe(onLab.replace('<token>', made))
    await ticket(page, id).getByRole('button', { name: 'Copy the command' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(onLab.replace('<token>', made))
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 2. Expired and used tokens are shown as such                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a ledger with a challenge in each state', () => {
  test('shows each in words, newest first, and offers a copy only for the open one', async ({ page }) => {
    const ledger = await visitSeeded(page)
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page).evaluateAll((items) => items.map((item) => `${item.getAttribute('data-stage')}:${item.getAttribute('data-state')}`))).resolves.toEqual([
      'tr8.replay.s2:open',
      'tr3.profile.s2:used',
      'tr4.sweep.s1:expired',
    ])
    await expect(rows(page).nth(0).locator('.es-held__state')).toHaveText('open')
    await expect(rows(page).nth(1).locator('.es-held__state')).toHaveText('used')
    await expect(rows(page).nth(2).locator('.es-held__state')).toHaveText('expired')
    await expect(page.getByRole('button', { name: /^Copy token for/ })).toHaveCount(1)
    await expect(rows(page).nth(0)).toContainText('good until')
    await expect(rows(page).nth(2)).toContainText('expired')
    await expect(rows(page).nth(1).getByRole('link')).toHaveAttribute('href', `/receipts#${ledger.record.sha256}`)
    await expect(page.getByRole('figure', { name: 'Challenges and results, counted' }).locator('.es-readout-strip__line')).toHaveText([/open\s*1/i, /used\s*1/i, /expired\s*1/i, /results\s*1/i])
  })

  test('leads from the used challenge to the receipt that used it, and says in the receipt that its challenge was used by it', async ({ page }) => {
    const ledger = await visitSeeded(page)
    await rows(page).nth(1).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/receipts#${ledger.record.sha256}$`))
    await expect(page.getByText('Used by this receipt.')).toBeVisible()
  })

  test('shows what the clock says: a challenge that is 14 days old is expired, and one a day short of it is open', async ({ page }) => {
    await open(page, ROUTE)
    const day = 86_400_000
    const ledger = new Ledger()
    const at = (ms: number) => new Date(Date.now() - ms).toISOString()
    ledger.challenge(at(14 * day + 60_000), 'tr8.replay.s2', 21)
    ledger.challenge(at(14 * day - 5 * 60_000), 'tr4.sweep.s1', 22)
    await put(page, { events: ledger.events })
    await page.reload()
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).evaluateAll((items) => items.map((item) => `${item.getAttribute('data-stage')}:${item.getAttribute('data-state')}`))).resolves.toEqual([
      'tr4.sweep.s1:open',
      'tr8.replay.s2:expired',
    ])
  })

  test('shows eight lines and offers the rest, when there are more', async ({ page }) => {
    await open(page, ROUTE)
    const ledger = new Ledger()
    for (let n = 0; n < 11; n += 1) ledger.challenge(new Date(Date.now() - (n + 1) * 3_600_000).toISOString(), 'tr8.replay.s2', 30 + n)
    await put(page, { events: ledger.events })
    await page.reload()
    await expect(rows(page)).toHaveCount(8)
    const more = page.getByRole('button', { name: 'Show all 11 challenges' })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(rows(page)).toHaveCount(11)
    await expect(page.getByRole('button', { name: 'Show the newest 8' })).toHaveAttribute('aria-expanded', 'true')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* One receipt, at its hash                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a receipt', () => {
  test('is listed with what the grader reported, opens at #<sha256> and takes focus, and the way back returns to the lists', async ({ page }) => {
    const ledger = await visitSeeded(page)
    const list = page.getByRole('list', { name: 'Results held by this browser' })
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText('The grader reports that every check passed.')
    await expect(list).toContainText('Not checked in this browser yet')
    await list.getByRole('link', { name: 'tr3.profile.s2' }).click()
    await expect(page).toHaveURL(new RegExp(`/receipts#${ledger.record.sha256}$`))
    const article = page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })
    await expect(article).toBeVisible()
    await expect(article).toBeFocused()
    await expect(page.getByRole('heading', { level: 2, name: 'tr3.profile.s2' })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'The run',
      'Where it ran',
      'Pins',
      'Inputs',
      'Artifacts',
      'What the grader checked',
      'What the run claimed',
      'Notes',
      'How this browser checked it',
    ])
    await expect(article).toContainText('Reported by the grader, not checked here')
    await expect(article).toContainText(ledger.record.sha256)
    await expect(article).toContainText('Example GPU 24GB')
    await expect(page.getByRole('heading', { name: 'Get a challenge' })).toHaveCount(0)

    await page.getByRole('link', { name: 'All results' }).click()
    await expect(page).toHaveURL(/\/receipts$/)
    await expect(page.getByRole('heading', { name: 'Your results' })).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Get a challenge' })).toBeVisible()

    // The browser's own Back and Forward walk the same two views.
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#${ledger.record.sha256}$`))
    await expect(article).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible()
  })

  test('opens straight from an address, and says so when this browser holds no receipt with that hash', async ({ page }) => {
    const ledger = await visitSeeded(page)
    await page.goto(`${ROUTE}#${'0'.repeat(64)}`)
    await expect(page.getByRole('heading', { level: 2, name: 'This browser holds no result with that hash' })).toBeVisible()
    await expect(page.getByText(RECEIPTS.notFoundNote)).toBeVisible()
    await page.goto(`${ROUTE}#${ledger.record.sha256}`)
    await expect(page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })).toBeVisible()
    // A fragment that is not a hash is no receipt's address: it shows the lists.
    await page.goto(`${ROUTE}#top`)
    await expect(page.getByRole('heading', { name: 'Get a challenge' })).toBeVisible()
  })

  test('shows a record that is not a receipt, listed and opened, with the reason, and puts nothing of it on the page as markup', async ({ page }) => {
    await open(page, ROUTE)
    const record = { sha256: 'a'.repeat(64), receipt: { schema: '<img src=x onerror=alert(1)>', note: '<script>alert(2)</script>' }, reports: [] }
    await put(page, { receipts: [record] })
    await page.reload()
    await expect(page.getByText('Not a receipt this build can read').first()).toBeVisible()
    await page.getByRole('link', { name: 'Not a receipt this build can read' }).click()
    await expect(page).toHaveURL(new RegExp(`#${'a'.repeat(64)}$`))
    const article = page.getByRole('article', { name: /not a receipt this build can read/ })
    await expect(article).toBeFocused()
    await expect(article).toContainText('schema:')
    expect(await page.locator('main img, main script').count()).toBe(0)
  })

  test('keeps its tables readable as tables at a laptop\'s width and a phone\'s', async ({ page }) => {
    const ledger = await visitSeeded(page)
    await page.goto(`${ROUTE}#${ledger.record.sha256}`)
    await expect(page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })).toBeVisible()
    for (const [width, height] of [[1280, 800], [360, 800]] as const) {
      await page.setViewportSize({ width, height })
      for (const name of ['Inputs of the run', 'Artifacts of the run', 'Checks that the grader ran']) {
        const table = page.getByRole('table', { name })
        await expect(table).toBeVisible()
        expect(await table.getByRole('columnheader').count(), `${name} at ${width}px`).toBeGreaterThanOrEqual(4)
        expect(await table.getByRole('row').count()).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 3. A keyboard walk, and axe                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('the keyboard, at 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('gets a challenge and copies it with the keys alone, with a focus ring at every stop and nothing covering it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page, ROUTE)
    const walk = walkOf(page)

    // From the top of the document to the first control of the page: the skip link, the board, then the deck's first slip.
    await walk.tabTo('Lab')
    // A select answers the characters of an option's name, and the arrows.
    await page.keyboard.type('tr8')
    await expect(lab(page)).toHaveValue('tr8.replay')
    expect((await walk.press('Tab')).name).toBe('Stage')
    await page.keyboard.press('ArrowDown')
    await expect(stage(page)).toHaveValue('tr8.replay.s1')
    await page.keyboard.press('ArrowDown')
    await expect(stage(page)).toHaveValue(STAGE)

    expect((await walk.press('Tab')).name).toBe('Get a challenge')
    await page.keyboard.press('Enter')
    await expect(ticket(page)).toBeVisible()
    // Focus stays on the button that asked for the ticket: nothing is taken from a keyboard that is in the middle of a task.
    expect((await walk.see()).name).toBe('Get a challenge')

    // The ticket's controls are the next stops, in the order that they stand on the paper: the lab's page (this lab has no command to copy), and the stub.
    expect((await walk.press('Tab')).name).toBe("The lab's page")
    expect((await walk.press('Tab')).name).toBe('Copy the token')
    await page.keyboard.press('Enter')
    await expect(ticket(page).getByRole('status')).toHaveText('Copied the token.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await tokenText(page))
    expect((await walk.press('Tab')).name).toBe(`Copy token for ${STAGE}`)

    expect(walk.trail.length, 'stops that the walk read').toBeGreaterThan(8)
    expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
  })

  test('walks the lists and a receipt: the link into it, the way back, and the stops of a ledger that holds all three states', async ({ page }) => {
    const ledger = await visitSeeded(page)
    const walk = walkOf(page)
    await walk.tabTo('Lab')
    await walk.tabTo(/^Copy token for tr8\.replay\.s2$/)
    await walk.press('Tab')
    expect((await walk.see()).name).toMatch(/result [0-9a-f]{8}$/)
    expect((await walk.press('Tab')).name).toBe('tr3.profile.s2')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#${ledger.record.sha256}$`))
    await expect(page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })).toBeFocused()
    // The receipt took focus below the way back, so Shift+Tab is one press from it.
    const back = await walk.press('Shift+Tab')
    expect(back.name).toBe('All results')
    expect(back.tag).toBe('a')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Your results' })).toBeFocused()
    // A programmatic move to a heading or a ticket is not a control, and draws no ring (src/receipts/receipts.css): those stops are not read.
    expect(walk.problems().filter((problem) => !/^(Your results|Receipt for)/.test(problem))).toEqual([])
  })
})

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']
const IMPACTS = new Set(['serious', 'critical'])

/** The audit of e2e/a11y.spec.ts: serious and critical violations fail, and so does any finding about the headings. */
async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
  const summary = (violation: (typeof results.violations)[number]) => `${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(' ')).join(' ; ')}`
  expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map(summary), `${label}: serious or critical violations`).toEqual([])
  expect(results.violations.filter((violation) => HEADING_RULES.includes(violation.id)).map(summary), `${label}: the heading outline`).toEqual([])
  const rest = results.violations.map((violation) => `${violation.id} [${violation.impact}] on ${violation.nodes.length} node${violation.nodes.length === 1 ? '' : 's'}`)
  console.log(`axe ${label}: ${results.passes.length + results.violations.length} rules, ${rest.length === 0 ? 'no violation' : rest.join(', ')}`)
  for (const finding of rest) test.info().annotations.push({ type: 'axe (does not fail)', description: `${label}: ${finding}` })
}

for (const width of [360, 1280]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('axe finds no serious or critical violation, and the headings are an outline, in every state of the page', async ({ page, context }) => {
      test.setTimeout(120_000)
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      // The empty page, with the lists blank.
      await open(page, ROUTE)
      await quiet(page)
      await audit(page, `/receipts, empty, at ${width} px`)

      // A challenge issued, and copied, with its ticket under the lamp.
      await issue(page)
      await ticket(page).getByRole('button', { name: 'Copy the token' }).click()
      await expect(ticket(page).getByRole('status')).toHaveText('Copied the token.')
      await quiet(page)
      await audit(page, `/receipts, a challenge issued, at ${width} px`)

      // A choice that was not made, and the message that says so.
      await page.reload()
      await getChallenge(page).click()
      await expect(page.getByRole('alert')).toBeVisible()
      await audit(page, `/receipts, a choice missing, at ${width} px`)

      // A ledger with a challenge in each state and a receipt, and the receipt opened, and a hash that names none, and a record that is not one.
      const ledger = seeded()
      await put(page, { events: ledger.events, receipts: [...ledger.receipts, { sha256: 'a'.repeat(64), receipt: { schema: 'something else' }, reports: [] }] })
      await page.reload()
      await expect(rows(page).first()).toBeVisible()
      await quiet(page)
      await audit(page, `/receipts, all three states, at ${width} px`)
      await page.goto(`${ROUTE}#${ledger.record.sha256}`)
      await expect(page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })).toBeVisible()
      await quiet(page)
      await audit(page, `/receipts, a receipt opened, at ${width} px`)
      await page.goto(`${ROUTE}#${'a'.repeat(64)}`)
      await expect(page.getByRole('article', { name: /not a receipt this build can read/ })).toBeVisible()
      await audit(page, `/receipts, a record that is not a receipt, at ${width} px`)
      await page.goto(`${ROUTE}#${'0'.repeat(64)}`)
      await expect(page.getByRole('heading', { level: 2, name: 'This browser holds no result with that hash' })).toBeVisible()
      await audit(page, `/receipts, no such receipt, at ${width} px`)
    })
  })
}

test.describe('at 320 px', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('no text is cut off at the right edge in any state, and the page does not scroll sideways', async ({ page }) => {
    await open(page, ROUTE)
    await issue(page)
    await quiet(page)
    for (const [label, state] of [['a challenge issued', await clipped(page)]] as const) {
      expect(state.scrolls, `${label}: pixels the page scrolls sideways`).toBeLessThanOrEqual(0)
      expect(state.text, `${label}: text past the right edge`).toEqual([])
    }
    const ledger = seeded()
    await put(page, { events: ledger.events, receipts: ledger.receipts })
    await page.reload()
    await expect(rows(page).first()).toBeVisible()
    await quiet(page)
    const lists = await clipped(page)
    expect(lists.scrolls, 'the lists: pixels the page scrolls sideways').toBeLessThanOrEqual(0)
    expect(lists.text, 'the lists: text past the right edge').toEqual([])
    await page.goto(`${ROUTE}#${ledger.record.sha256}`)
    await expect(page.getByRole('article', { name: 'Receipt for tr3.profile.s2' })).toBeVisible()
    await quiet(page)
    const detail = await clipped(page)
    expect(detail.scrolls, 'a receipt: pixels the page scrolls sideways').toBeLessThanOrEqual(0)
    expect(detail.text, 'a receipt: text past the right edge').toEqual([])
  })
})
