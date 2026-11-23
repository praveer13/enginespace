/*
 * Prove mode on both of its levels (ASSESSMENT §7.2; W2b-T74): the verifier's `exact` and the shape-shifter's `fewest`, one table of cases
 * for the two, so that a third Prove level is one row.
 *
 *   1. After a passed Prove run the foot strip and the note under the result say the run was proved, with the time the next attempt that
 *      counts opens on the 24-hour clock of /receipts. The foot never says "Recorded as practice" of the run that ended (DC-D).
 *   2. The result offers no Next level, which would play a level outside the attestation; Leave Prove mode is the way on.
 *   3. The Progress page (/evidence) reads the run as proved.
 *   4. The first panel says a miss uses up the day.
 *   5. Start cannot be pressed before the record of past attempts has been read, with the page's processor throttled 30 times (DC-D).
 *   6. At 320 px the verifier's token names do not run together.
 *   7. An attempt left before its end (Leave Prove mode, a reload) is an event: the Progress page and the export show the miss, and the next
 *      panel says it was left (W2b-T78, DC-D).
 *   8. A second tab is told the truth: while the playing tab's record is alive it says an attempt is open in another tab, and once the record
 *      lapses it writes the attempt as left. A record from before the beat was written is read as lapsed.
 *   9. A graded run that is not a Prove run and is left after a move writes a left event, and no window applies to it.
 */
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { buildLevel as buildShift } from '../packages/play/shape-shifter/levels'
import type { ShiftOp } from '../packages/sim/tensor'
import { VERIFIER_PARTS } from '../packages/play/verifier/copy'
import { expect, open, quiet, test, withSettings } from './support/site'

const SHIFT_PARTS = ['table', 'buffer', 'order', 'target', 'shared', 'slices', 'tensor', 'program', 'block', 'grid-size', 'mask']

/** The attestation's own words and Start's. */
const ATTEST = 'My coding agent and any AI chat are closed.'
const START = 'Start the Prove run'

interface Case {
  readonly game: 'verifier' | 'shape-shifter'
  readonly level: string
  /** Plays the Prove run on the page to a passed result, as a learner who has the numbers in front of them. */
  play(page: Page): Promise<void>
}

const face = (op: ShiftOp): string => {
  if (op.op === 'view' || op.op === 'reshape' || op.op === 'expand') return `[${op.shape.join(', ')}]`
  if (op.op === 'permute') return `(${op.order.join(', ')})`
  if (op.op === 'transpose') return `${op.a} and ${op.b}`
  return ''
}

const CASES: readonly Case[] = [
  {
    game: 'verifier',
    level: 'exact',
    async play(page) {
      await page.locator('[data-state-table] summary').click()
      const rows = page.locator('[data-mirror] table').first().locator('tbody tr')
      const recipe: number[] = []
      for (let i = 0; i < (await rows.count()); i++) {
        const p = Number((await rows.nth(i).locator('td[data-label="p"]').innerText()).trim())
        const q = Number((await rows.nth(i).locator('td[data-label="q"]').innerText()).trim())
        recipe.push(Math.max(0, p - q))
      }
      for (const [token, weight] of recipe.entries()) await page.getByLabel(`Resample weight for token ${token}`, { exact: true }).fill(String(weight))
      await page.getByRole('button', { name: 'Submit the weights' }).click()
    },
  },
  {
    game: 'shape-shifter',
    level: 'fewest',
    async play(page) {
      const seed = Number(await page.locator('section[data-game="shape-shifter"]').getAttribute('data-seed'))
      for (const task of buildShift('fewest', seed).tasks) {
        if (await page.locator('[data-shift-predict]').isVisible()) await page.getByRole('button', { name: 'Skip the guess' }).click()
        for (const op of 'ghost' in task ? task.ghost : []) {
          await page.locator(`[data-shift-bar] [data-op="${op.op}"]`).click()
          if (op.op !== 'contiguous') await page.locator(`[data-shift-picker] [data-choice="${face(op)}"]`).click()
        }
      }
    },
  },
]

/** A learner who has met every part of the game, so that its first-run strip does not stand in the way. */
async function met(page: Page, game: Case['game']) {
  await withSettings(page.context(), { view3d: false })
  const parts = game === 'verifier' ? VERIFIER_PARTS.map((part) => part.id) : SHIFT_PARTS
  await page.addInitScript(([id, list]) => localStorage.setItem('es:intro', JSON.stringify({ [id as string]: list })), [game, parts])
}

async function openProve(page: Page, c: Case) {
  await met(page, c.game)
  await open(page, `/play/${c.game}?level=${c.level}&mode=prove`)
  await expect(page.locator('[data-prove-panel]')).toBeVisible()
  await expect(page.locator('[data-prove-panel]')).not.toHaveAttribute('data-stake', 'reading')
}

interface PlayRow {
  kind: string
  ref: string
  ok: boolean
  score: number
  provenance: string
  data: { actions: string; left: string }
}

/** The IndexedDB rows of a store, as the browser holds them. */
function rowsOf<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction(name, 'readonly').objectStore(name).getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(all.result as T[])
          }
        }
      }),
    store,
  )
}

/** The `play` events of this level that say the run was left before its end. */
async function leftEvents(page: Page, c: Case): Promise<PlayRow[]> {
  return (await rowsOf<PlayRow>(page, 'events')).filter((row) => row.kind === 'play' && row.ref === `play:${c.game}/${c.level}` && row.data.left !== undefined)
}

const workingKeys = async (page: Page): Promise<string[]> => (await rowsOf<{ key: string }>(page, 'working')).map((row) => row.key)

/** Puts a working record into the ledger's own store, as an older build would have written it. */
async function putWorking(page: Page, key: string, value: Record<string, string>) {
  await page.evaluate(
    ([name, data]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('meta', 'readonly').objectStore('meta').getAll()
          read.onsuccess = () => {
            const dev = (read.result as { key: string; value: string }[]).find((row) => row.key === 'deviceId')?.value ?? 'dev-test'
            const write = db.transaction('working', 'readwrite').objectStore('working').put({ key: name, value: data, at: new Date().toISOString(), dev })
            write.onerror = () => reject(write.error)
            write.onsuccess = () => {
              db.close()
              resolve()
            }
          }
        }
      }),
    [key, value] as const,
  )
}

async function start(page: Page) {
  await page.getByLabel(ATTEST).check()
  await page.getByRole('button', { name: START }).click()
  await expect(page.locator(`section[data-game]`)).toBeVisible()
  await quiet(page)
}

for (const c of CASES) {
  test.describe(`Prove mode: ${c.game} / ${c.level}`, () => {
    test.describe.configure({ timeout: 120_000 })

    test('a passed run is proved in the foot and under the result, on the 24-hour clock, with no Next level and a Progress row that says so', async ({ page }) => {
      await openProve(page, c)
      await start(page)
      await c.play(page)
      const foot = page.locator('[data-prove-foot]')
      const after = page.locator('[data-prove-after]')
      await expect(after).toHaveAttribute('data-prove-after', 'proved')
      for (const line of [foot, after]) {
        await expect(line).toContainText('Proved, with your agent closed. The next attempt that counts opens at ')
        await expect(line).toContainText(/opens at \d{2}:\d{2} (today|tomorrow)\./)
      }
      const text = (await foot.innerText()) + (await after.innerText())
      expect(text).not.toContain('Recorded as practice')
      expect(text).not.toMatch(/\b[AP]M\b/i)
      // No way on that leaves Prove mode: Leave Prove mode and Run again are the controls; there is no Next level.
      await expect(page.getByRole('button', { name: /^Next level/ })).toHaveCount(0)
      await expect(foot.getByRole('link', { name: 'Leave Prove mode' })).toBeVisible()
      // A run played again starts at practice weight, and the foot says so of that run.
      await page.getByRole('button', { name: 'Run again' }).click()
      await expect(foot).toContainText('Recorded as practice; the next attempt that counts opens at ')
      // The Progress page reads the run as proved.
      await open(page, '/evidence')
      await expect(page.locator('main')).toContainText(/Played .*, agent closed/)
    })

    test('leaving an attempt that counted is an event: the Progress page and the export show the miss, and the next panel says it was left', async ({ page }) => {
      await openProve(page, c)
      await start(page)
      await page.locator('[data-prove-foot]').getByRole('link', { name: 'Leave Prove mode' }).click()
      await expect.poll(() => leftEvents(page, c)).toHaveLength(1)
      const [event] = await leftEvents(page, c)
      expect(event).toMatchObject({ kind: 'play', ref: `play:${c.game}/${c.level}`, ok: false, score: 0, provenance: 'proved', data: { actions: '[]' } })
      expect(Number.isFinite(Date.parse(event.data.left))).toBe(true)
      expect((await workingKeys(page)).filter((key) => key.startsWith('prove-open:'))).toEqual([])
      // The Progress page reads it as a left attempt.
      await open(page, '/evidence')
      await expect(page.locator('main')).toContainText(/Left .*, agent closed, before its end/)
      // The export holds it.
      await open(page, '/settings')
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export evidence' }).click()])
      const file = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8')) as { events: { ref: string; ok: boolean; data: { left?: string } }[] }
      expect(file.events.filter((e) => e.data.left !== undefined).map((e) => [e.ref, e.ok])).toEqual([[`play:${c.game}/${c.level}`, false]])
      // The next panel says so, and a run begun then is practice: no second seed counts.
      await open(page, `/play/${c.game}?level=${c.level}&mode=prove`)
      await expect(page.locator('[data-prove-stake]')).toContainText('was left before its end, so it counts as a miss')
      await expect(page.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'practice')
    })

    test('no control, Back, Forward or edited address gives a second counting seed: Restart and New numbers are absent, and a run begun after leaving is practice', async ({ page }) => {
      await met(page, c.game)
      await open(page, `/play/${c.game}?level=${c.level}`)
      await open(page, `/play/${c.game}?level=${c.level}&mode=prove`)
      await expect(page.locator('[data-prove-panel]')).not.toHaveAttribute('data-stake', 'reading')
      await start(page)
      const seed = await page.locator('section[data-game]').getAttribute('data-seed')
      await expect(page.getByRole('button', { name: 'Restart level' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'New numbers' })).toHaveCount(0)
      // Back leaves the attempt; Forward is a new page that finds it spent.
      await page.goBack()
      await expect(page.locator('section[data-game]')).toBeVisible()
      await page.goForward()
      await expect(page.locator('[data-prove-panel]')).toBeVisible()
      await expect(page.locator('[data-prove-stake]')).toContainText('was left before its end, so it counts as a miss')
      await start(page)
      await expect(page.locator('[data-prove-foot]')).toContainText('Recorded as practice')
      expect(await leftEvents(page, c)).toHaveLength(1)
      // An edited address that names another level is not a Prove run at all.
      await open(page, `/play/${c.game}?level=${c.level === 'exact' ? 'overlap' : 'views'}&mode=prove`)
      await expect(page.locator('[data-prove-panel]')).toHaveCount(0)
      expect(seed).not.toBeNull()
    })

    test('a reload in the middle of an attempt writes it as left: the panel after it says so, and nothing is drawn again that counts', async ({ page }) => {
      await openProve(page, c)
      await start(page)
      await page.reload()
      await expect(page.locator('[data-prove-panel]')).toBeVisible()
      await expect(page.locator('[data-prove-stake]')).toContainText('was left before its end, so it counts as a miss')
      expect(await leftEvents(page, c)).toHaveLength(1)
      expect((await workingKeys(page)).filter((key) => key.startsWith('prove-open:'))).toEqual([])
    })

    test('a second tab says an attempt is open in another tab, and writes it as left once the playing tab has been silent for a lapse', async ({ context, page }) => {
      // Both tabs run with the processor throttled four times, as a busy machine would: the second tab must still tell the truth.
      await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await openProve(page, c)
      await start(page)
      const other = await context.newPage()
      await (await context.newCDPSession(other)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await other.clock.install()
      await met(other, c.game)
      await open(other, `/play/${c.game}?level=${c.level}&mode=prove`)
      const stake = other.locator('[data-prove-stake]')
      await expect(stake).toContainText('An attempt that counts is open in another tab')
      await expect(stake).not.toContainText('was left')
      await expect(other.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'practice')
      expect(await leftEvents(other, c)).toHaveLength(0)
      // The playing tab's own page is told nothing: it is still playing.
      await expect(page.locator('section[data-game]')).toBeVisible()
      // Silence for longer than a lapse: the second tab writes the attempt as left.
      await other.clock.fastForward(150_000)
      await expect(stake).toContainText('was left before its end, so it counts as a miss')
      await expect.poll(() => leftEvents(other, c)).toHaveLength(1)
    })

    test('a record from before the beat was written is read as lapsed and written as an event', async ({ page }) => {
      await openProve(page, c)
      const began = new Date(Date.now() - 2 * 3_600_000).toISOString()
      await putWorking(page, `prove-open:play:${c.game}/${c.level}`, { at: began })
      await page.reload()
      await expect(page.locator('[data-prove-stake]')).toContainText('was left before its end, so it counts as a miss')
      await expect.poll(() => leftEvents(page, c)).toHaveLength(1)
      expect((await leftEvents(page, c))[0].data.left).toBe(began)
      await expect.poll(async () => (await workingKeys(page)).filter((key) => key.startsWith('prove-open:'))).toEqual([])
    })

    test('the first panel says a miss uses up the day', async ({ page }) => {
      await openProve(page, c)
      await expect(page.locator('[data-prove-stake]')).toContainText('a miss uses up the day')
    })

    test('Start cannot be pressed before the record of past attempts is read, with the processor throttled 30 times', async ({ page }) => {
      await met(page, c.game)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 30 })
      // From the first draw of the panel, every change to the page records whether Start could be pressed while the panel still read the record.
      await page.addInitScript(() => {
        const seen = { reading: 0, pressable: 0 }
        ;(window as unknown as { __proveSeen: typeof seen }).__proveSeen = seen
        const look = () => {
          const panel = document.querySelector('[data-prove-panel]')
          if (panel === null || panel.getAttribute('data-stake') !== 'reading') return
          seen.reading += 1
          const box = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')
          if (box !== null && !box.checked) box.click()
          const button = [...panel.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start the Prove run')
          if (button !== undefined && !button.disabled && box?.checked === true) seen.pressable += 1
        }
        new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true })
      })
      await page.goto(`/play/${c.game}?level=${c.level}&mode=prove`)
      await expect(page.locator('[data-prove-panel]')).toBeVisible({ timeout: 60_000 })
      await expect(page.locator('[data-prove-panel]')).not.toHaveAttribute('data-stake', 'reading', { timeout: 60_000 })
      const seen = await page.evaluate(() => (window as unknown as { __proveSeen: { reading: number; pressable: number } }).__proveSeen)
      expect(seen.reading, 'the panel was seen reading the record at least once').toBeGreaterThan(0)
      expect(seen.pressable, 'Start was pressable while the panel read the record').toBe(0)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      await expect(page.getByRole('button', { name: START })).toBeEnabled()
    })
  })
}

test('at 320 x 640 the verifier names its six tokens without running them together', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await met(page, 'verifier')
  await open(page, '/play/verifier?level=overlap')
  await quiet(page)
  const boxes = await page.locator('.es-vf__row').first().locator('.es-vf__name').evaluateAll((all) => all.map((name) => {
    const r = name.getBoundingClientRect()
    return { left: r.left, right: r.right, text: name.textContent }
  }))
  expect(boxes).toHaveLength(6)
  for (let i = 1; i < boxes.length; i++) expect([boxes[i - 1].text, boxes[i].text, boxes[i - 1].right <= boxes[i].left + 0.5]).toEqual([boxes[i - 1].text, boxes[i].text, true])
})

test.describe('a graded run that is not a Prove run', () => {
  const verifier = CASES[0]

  test('left after a move it writes a left event, stamped unseen, and one left before any move writes nothing', async ({ page }) => {
    await met(page, 'verifier')
    await open(page, '/play/verifier?level=exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(page.locator('section[data-game]')).toHaveAttribute('data-mode', 'graded')
    await quiet(page)
    // No move yet: leaving writes nothing.
    await page.getByRole('link', { name: 'enginespace', exact: true }).first().click()
    await expect(page).not.toHaveURL(/\/play\//)
    await open(page, '/evidence')
    expect(await leftEvents(page, verifier)).toHaveLength(0)
    // One move, then the page is left.
    await open(page, '/play/verifier?level=exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await quiet(page)
    await page.getByLabel('Resample weight for token 3', { exact: true }).fill('1')
    await page.keyboard.press('Tab')
    await page.getByRole('link', { name: 'enginespace', exact: true }).first().click()
    await expect(page).not.toHaveURL(/\/play\//)
    await expect.poll(() => leftEvents(page, verifier)).toHaveLength(1)
    const [event] = await leftEvents(page, verifier)
    // A graded run, not a Prove run: it is `unseen`, a miss, with the seed it was drawn on, and no window applies to it.
    expect(event).toMatchObject({ ok: false, score: 0, provenance: 'unseen' })
    await open(page, '/evidence')
    await expect(page.locator('main')).toContainText(/Left .*, before its end/)
    await expect(page.locator('main')).not.toContainText(', agent closed, before its end')
    await open(page, `/play/verifier?level=exact&mode=prove`)
    await expect(page.locator('[data-prove-panel]')).not.toHaveAttribute('data-stake', 'reading')
    await expect(page.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'counts')
  })
})
