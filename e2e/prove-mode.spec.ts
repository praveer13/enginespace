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
 */
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
