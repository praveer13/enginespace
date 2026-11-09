/*
 * W1b-T05: TR5a's four item families in the browser. Every item block in TR5a's lessons draws items: the first lesson's exit ticket
 * (`tr5a.blocks-held` at level 2), the second's (the same family at level 3), the third's (`tr5a.hit-length`) and the fourth's two
 * (`tr5a.pages-for-adapter` and `tr5a.slots-vs-pages`). The spec plays an attempt at each, with entropy that makes every variant the block
 * can draw in turn, so that each kind of ticket is on screen once, and checks on each:
 *
 *   - the ticket is the one the family makes from the seed that the page shows, so the page and the family agree on the numbers;
 *   - a right answer is marked right and a wrong one is marked wrong and carries a diagnosis or the key, by keyboard-sized steps only;
 *   - axe finds no serious or critical violation in the asking state or the revealed one, at 360 and 1280 px, and at 360 px nothing
 *     runs past the edge (WCAG reflow), which the long lines of a cached-blocks list, a queue of adapters and a choice of deployments could.
 *
 * It runs in the `features` project (a spec that the smoke list does not name), over the same build as the others:
 *
 *   npx playwright test e2e/tr5a-items.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { familyById, fixedSeeds, offeredAt, startAttempt } from '../packages/play/items'
import type { Gen, Item, Level } from '../packages/play/items'
import { clipped, expect, open, quiet, test } from './support/site'

declare global {
  interface Window {
    __queue?: number[]
  }
}

interface Block {
  readonly route: string
  /** Which item block of the lesson's page it is, from the top. */
  readonly at: number
  readonly family: string
  readonly level: Level
  /** Tickets in an attempt. */
  readonly count: number
}

/** The item blocks of TR5a's four lessons, as the lessons print them (content/modules/tr5a/lessons). */
const BLOCKS: readonly Block[] = [
  { route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches', at: 0, family: 'tr5a.blocks-held', level: 2, count: 3 },
  { route: '/m/tr5a/l2-one-pool-one-page-size', at: 0, family: 'tr5a.blocks-held', level: 3, count: 3 },
  { route: '/m/tr5a/l3-a-prefix-hit-must-hold-in-every-group', at: 0, family: 'tr5a.hit-length', level: 2, count: 3 },
  { route: '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots', at: 0, family: 'tr5a.pages-for-adapter', level: 2, count: 2 },
  { route: '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots', at: 1, family: 'tr5a.slots-vs-pages', level: 2, count: 1 },
]

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/**
 * How long a change of phase may take. The browser draws in software here (SwiftShader, playwright.config.ts), and the first attempt that a
 * fresh browser starts at 1280 px showed its first ticket after 9.4 s in one run and 7.3 s in another, where the three after it each took
 * about 0.5 s, on a machine at a load average of 40 to 50 [measured 2026-11-09 at fe0d66c with this spec's files]. A trace of the page showed
 * one 5.2 s task on its main thread whose profile was native time and no script, beside a 5.1 s task in the GPU process, so the wait is the
 * browser's and not the family's: the same stall came on a TR2 ticket when that one was first. Each wait on a phase takes the
 * longer limit, and no check is dropped.
 */
const PHASE = { timeout: 60_000 }
const inPhase = (container: Locator, name: string) => expect(container).toHaveAttribute('data-phase', name, PHASE)

/** The page's entropy is answered from `window.__queue` when it holds enough, and is the browser's own otherwise (as e2e/items.spec.ts does). */
test.beforeEach(async ({ context }) => {
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

function generator(block: Block): Gen {
  const gen = familyById(block.family)
  if (gen === undefined) throw new Error(`${block.family} has no generator`)
  return gen
}

/**
 * Attempts that between them make every variant the block can draw: the entropy for each ticket is found by asking the family what
 * an attempt of one ticket would draw from it, as the page does (`startAttempt`), until the variant wanted comes up.
 */
function plan(block: Block): { entropy: number[]; variants: string[] }[] {
  const gen = generator(block)
  const wanted = offeredAt(gen, block.level).map((variant) => variant.id)
  const pool = fixedSeeds(4000, 0x75a0 + block.at)
  const used = new Set<number>()
  const entropyFor = (variant: string): number => {
    for (const entropy of pool) {
      if (used.has(entropy)) continue
      const { served } = startAttempt(gen, block.level, [entropy])
      if (served[0].item.variant === variant) {
        used.add(entropy)
        return entropy
      }
    }
    throw new Error(`no entropy makes ${block.family}/${variant}`)
  }
  const tickets = wanted.map((variant) => ({ variant, entropy: entropyFor(variant) }))
  // Attempts of `count` tickets, the last one filled out with tickets of the variants again.
  const attempts: { entropy: number[]; variants: string[] }[] = []
  for (let from = 0; from < tickets.length; from += block.count) {
    const slice = tickets.slice(from, from + block.count)
    while (slice.length < block.count) slice.push({ variant: wanted[slice.length % wanted.length], entropy: entropyFor(wanted[slice.length % wanted.length]) })
    attempts.push({ entropy: slice.map((ticket) => ticket.entropy), variants: slice.map((ticket) => ticket.variant) })
  }
  return attempts
}

const blockOf = (page: Page, block: Block): Locator => page.locator('section[data-block="item"]').nth(block.at)
const control = (container: Locator, name: RegExp | string): Locator => container.getByRole('button', { name })

/** The ticket on screen: what it says it is, and the item that the family makes from its seed. */
async function ticketOf(container: Locator, block: Block): Promise<{ seed: number; variant: string; item: Item }> {
  const attributes = await container.evaluate((element) => ({
    seed: element.getAttribute('data-seed'),
    level: element.getAttribute('data-level'),
    variant: element.getAttribute('data-variant'),
  }))
  const seed = Number(attributes.seed)
  expect(Number(attributes.level)).toBe(block.level)
  const variant = attributes.variant ?? ''
  return { seed, variant, item: generator(block).make(seed, block.level, variant) }
}

/** A number that the family grades wrong for this ticket: the key moved by an amount no tolerance of these families takes in. */
function wrongNumber(gen: Gen, item: Item, truth: number): number {
  for (const candidate of [truth + 7, truth + 13, truth * 2 + 5, truth * 5 + 11]) {
    if (!gen.grade(item, { kind: 'numeric', value: candidate }).ok) return candidate
  }
  throw new Error(`${item.family}/${item.variant}: no wrong number found for a key of ${truth}`)
}

/** Writes the answer that is right for the ticket, or one that is wrong. A choice is ticked by the value of its radio, which is the option's id. */
async function fill(container: Locator, gen: Gen, item: Item, which: 'right' | 'wrong'): Promise<void> {
  const spec = item.answer
  if (spec.kind === 'numeric') {
    await container.locator('input.es-field__input').fill(String(which === 'right' ? spec.truth : wrongNumber(gen, item, spec.truth)))
  } else {
    const option = spec.options.find((candidate) => (which === 'right') === (candidate.id === spec.correct))
    if (option === undefined) throw new Error(`${item.family}/${item.variant}: no ${which} option`)
    await container.locator(`input[type="radio"][value="${option.id}"]`).check()
  }
}

/** What the reveal says of the verdict, once a ticket is checked: the heading, and for a numeric ticket the key, for a choice the options' own marks. */
async function expectVerdict(container: Locator, item: Item, right: boolean): Promise<void> {
  const reveal = container.locator('.es-item__reveal')
  await expect(reveal).toHaveAttribute('data-ok', right ? 'true' : 'false', PHASE)
  await expect(reveal.locator('.es-item__verdict')).toContainText(right ? 'Right.' : 'Not this one.')
  if (item.answer.kind === 'numeric') {
    await expect(reveal.locator('.es-item__keys')).toContainText('the key')
    if (!right) await expect(reveal.locator('.es-item__keys')).toContainText('you wrote')
  } else {
    // The option that is the key is marked, and a pick that is not it is marked too; the options' own words say why each is or is not.
    await expect(container.locator('.es-item__option[data-key="true"]')).toHaveCount(1)
    await expect(container.locator('.es-item__option[data-key="true"]')).toContainText(right ? 'Your pick, and right.' : 'Right.')
    await expect(container.locator('.es-item__option[data-yours="true"]')).toHaveCount(1)
    if (!right) await expect(container.locator('.es-item__option[data-yours="true"]')).toContainText('Your pick.')
  }
}

/** Axe over the block at hand, and at a phone's width the reflow of its text. The block is marked, since `clipped` looks at the first match of a selector. */
async function audit(page: Page, container: Locator, label: string, narrow: boolean): Promise<void> {
  await container.evaluate((element) => element.setAttribute('data-audit', 'on'))
  await quiet(page, 300)
  const results = await new AxeBuilder({ page }).withTags(TAGS).include('[data-audit="on"]').analyze()
  expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(5)
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  expect(
    serious.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`),
    `${label}: serious or critical`,
  ).toEqual([])
  if (narrow) {
    const cut = await clipped(page, '[data-audit="on"]')
    expect(cut.scrolls, `${label}: the page scrolls sideways`).toBeLessThanOrEqual(0)
    expect(cut.text, `${label}: text past the edge`).toEqual([])
  }
}

for (const width of [360, 1280]) {
  test.describe(`TR5a's item blocks at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const block of BLOCKS) {
      test(`${block.family} at level ${block.level}, in ${block.route.split('/').pop()}: every variant is on a ticket that the family makes, and answers are marked`, async ({ page }) => {
        test.setTimeout(240_000)
        const attempts = plan(block)
        await open(page, block.route)
        const container = blockOf(page, block)
        await expect(container).toContainText(block.family)
        // The block draws items: it is not the waiting ticket of a family that no task has built.
        await expect(container).not.toContainText('Not built yet')
        await inPhase(container, 'idle')

        let first = true
        for (const attempt of attempts) {
          await page.evaluate((entropy) => void (window.__queue = entropy.slice()), attempt.entropy)
          await control(container, first ? 'Start items' : 'New numbers').click()
          first = false
          await inPhase(container, 'asking')
          for (const [index, variant] of attempt.variants.entries()) {
            const { seed, variant: shown, item } = await ticketOf(container, block)
            expect(shown).toBe(variant)
            expect(seed).toBe(startAttempt(generator(block), block.level, [attempt.entropy[index]]).served[0].seed)
            await audit(page, container, `${block.family}/${variant} asking`, width === 360)
            // The first ticket of an attempt is answered right and the next wrong, so that both reveals are seen.
            const right = index % 2 === 0
            await fill(container, generator(block), item, right ? 'right' : 'wrong')
            await control(container, /Check the ticket/).click()
            await inPhase(container, 'revealed')
            await expectVerdict(container, item, right)
            // The solution is printed beneath the verdict, one line for each step, and ends with the key's own line.
            await expect(container.locator('.es-item__steps li')).not.toHaveCount(0)
            await audit(page, container, `${block.family}/${variant} revealed`, width === 360)
            await control(container, index === attempt.variants.length - 1 ? /Tally the tickets/ : /Next ticket/).click()
            if (index < attempt.variants.length - 1) await inPhase(container, 'asking')
          }
          await inPhase(container, 'done')
        }
      })
    }
  })
}
