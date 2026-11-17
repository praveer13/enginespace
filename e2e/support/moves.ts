/*
 * R-T47: the moves of a learner, each done by the pointer or by the keyboard, for the walk of e2e/first-visit.spec.ts and the keep-list of
 * e2e/keep-list.spec.ts. A move says what it does in the learner's words; `how` says with what. By the keyboard a control gets focus (Tab's
 * end result, read by e2e/support/front.ts' `walkOf` so that a stop nobody could see is found) and Enter or Space; by the pointer it is clicked.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { familyById, plain } from '../../packages/play/items'
import { walkOf } from './front'

export type How = 'pointer' | 'keyboard'
export type Walk = ReturnType<typeof walkOf>

/**
 * What a keyboard user sees when focus lands: Tab brings the focused control into view, and `locator.focus()` does not always, when a
 * lazy part of the page has moved the control since it was last scrolled to. So the control is brought into view as Tab would, and then read.
 */
async function shown(page: Page, control: Locator): Promise<void> {
  // A page that is still settling (an image or a game's frame arriving above the control) moves it again, so the scroll is repeated until the
  // control stays on screen over two frames.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let tries = 0
        const settle = () => {
          const element = document.activeElement
          if (element === null || element === document.body || tries++ > 20) return resolve()
          const box = element.getBoundingClientRect()
          if (box.bottom > 0 && box.top < window.innerHeight) return resolve()
          element.scrollIntoView({ block: 'nearest', behavior: 'instant' })
          requestAnimationFrame(() => requestAnimationFrame(settle))
        }
        settle()
      }),
  )
  // The page's own scroll did not bring it (a lazy part arrived above it and moved it again): the control is centred, clear of the bars that stand at a screen's foot, as a scroll that honours the page's scroll padding leaves it.
  if (!(await control.evaluate((element) => { const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < window.innerHeight }))) await control.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
}

/** The learner's hands: what a walk does with a control. */
export interface Hands {
  readonly how: How
  readonly walk: Walk
  /** Press a button or follow a link. */
  press(target: Locator): Promise<void>
  /** Write into a field: a click and keys, or focus and keys. */
  write(field: Locator, text: string): Promise<void>
}

export function handsOf(page: Page, how: How): Hands {
  const walk = walkOf(page)
  return {
    how,
    walk,
    async press(target) {
      if (how === 'pointer') {
        await target.click()
        return
      }
      await target.focus()
      await shown(page, target)
      await walk.see()
      await page.keyboard.press('Enter')
    },
    async write(field, text) {
      if (how === 'pointer') await field.fill(text)
      else {
        await field.focus()
        await shown(page, field)
        await walk.see()
        await page.keyboard.type(text)
      }
    },
  }
}

declare global {
  interface Window {
    __queue?: number[]
  }
}

/** The page's entropy, answerable from `window.__queue` (as e2e/items.spec.ts does): a set's seeds are then the test's. */
export async function queueEntropy(context: import('@playwright/test').BrowserContext): Promise<void> {
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
}

/**
 * Answers one set of questions in an item block, every one right (or every one wrong), through to its tally. The block is `scope`, a
 * `section[data-block="item"]`. Each ticket's item is made from the seed, level and variant that the ticket prints, by the family's own
 * generator, so the right answer is the page's own.
 */
export async function answerSet(page: Page, scope: Locator, hands: Hands, which: 'right' | 'wrong' = 'right'): Promise<void> {
  const start = scope.getByRole('button', { name: /^(Start questions|New numbers)$/ })
  await hands.press(start.first())
  await expect(scope).toHaveAttribute('data-phase', 'asking', { timeout: 60_000 })
  for (let turn = 0; turn < 12; turn++) {
    const facts = await scope.evaluate((element) => ({
      family: element.getAttribute('data-family'),
      seed: Number(element.getAttribute('data-seed')),
      level: Number(element.getAttribute('data-level')),
      variant: element.getAttribute('data-variant') ?? '',
    }))
    const gen = familyById(facts.family ?? '')
    if (gen === undefined) throw new Error(`no generator for ${facts.family}`)
    const item = gen.make(facts.seed, facts.level as 0 | 1 | 2 | 3, facts.variant)
    const spec = item.answer
    if (spec.kind === 'numeric') {
      const wrong = [spec.truth + 7, spec.truth + 13, spec.truth * 2 + 5].find((value) => !gen.grade(item, { kind: 'numeric', value }).ok) ?? spec.truth + 999
      await hands.write(scope.locator('input.es-field__input'), String(which === 'right' ? spec.truth : wrong))
    } else {
      const option = spec.options.find((candidate) => (which === 'right') === (candidate.id === spec.correct)) ?? spec.options[0]
      const radio = scope.getByRole('radio', { name: plain(option.text) })
      if (hands.how === 'pointer') await radio.check()
      else {
        await radio.focus()
        await shown(page, radio)
        await hands.walk.see()
        await page.keyboard.press('Space')
      }
    }
    await hands.press(scope.getByRole('button', { name: /Check answer/ }))
    await expect(scope).toHaveAttribute('data-phase', 'revealed', { timeout: 60_000 })
    const last = scope.getByRole('button', { name: /See the (result|tally)/ })
    if ((await last.count()) > 0) {
      await hands.press(last.first())
      await expect(scope).toHaveAttribute('data-phase', 'done')
      return
    }
    await hands.press(scope.getByRole('button', { name: /Next question/ }))
    await expect(scope).toHaveAttribute('data-phase', 'asking')
  }
  throw new Error('a set of questions never reached its tally')
}
