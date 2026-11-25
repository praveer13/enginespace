/*
 * The seed of the game on a page: from `data-seed` where the game writes it (the six built games), else from the test hook
 * `window.__esSeed` that a test build gives a game with `seedInPage: false` (src/games/kit/seed-hook.ts).
 */
import type { Page } from '@playwright/test'

export async function seedOf(page: Page, selector = 'section[data-game]'): Promise<number> {
  const seed = await page.evaluate((sel) => {
    const attribute = document.querySelector(sel)?.getAttribute('data-seed')
    if (attribute !== null && attribute !== undefined) return Number(attribute)
    return window.__esSeed?.() ?? null
  }, selector)
  if (seed === null || Number.isNaN(seed)) throw new Error('the page has no seed in data-seed and no test hook')
  return seed
}
