/*
 * The lessons' game blocks, as the e2e specs of W1b-T01 find them: every `:::game` directive of `content/modules/<module>/lessons/*.md`,
 * with the lesson's route (`/m/<module>/<file name>`), in the order the lesson has them. The content is read as text, so the spec needs no
 * compiler: tests/content/game-blocks.test.ts holds the compiled blocks to the registries, and this list is the same blocks.
 *
 * And the moves every lesson spec makes: start a block's level, find the game it opened, and read the ledger's `play` events.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')

export interface LessonGame {
  /** `/m/tr2/l3-async-scheduling-closes-the-bubble` */
  readonly route: string
  readonly game: string
  readonly level: string
  readonly mode: 'practice' | 'graded'
}

/** Every game block of the course's lessons, lesson by lesson, in the order of the files and of the blocks in each. */
export function lessonGames(): LessonGame[] {
  const modules = path.join(root, 'content/modules')
  const found: LessonGame[] = []
  for (const module of readdirSync(modules).sort()) {
    const dir = path.join(modules, module, 'lessons')
    let files: string[]
    try {
      files = readdirSync(dir).filter((name) => name.endsWith('.md') && !/^readme\.md$/i.test(name)).sort()
    } catch {
      continue
    }
    for (const file of files) {
      const text = readFileSync(path.join(dir, file), 'utf8')
      for (const match of text.matchAll(/^:::game\n([\s\S]*?)^:::$/gm)) {
        const field = (name: string) => new RegExp(`^${name}:\\s*(\\S+)\\s*$`, 'm').exec(match[1])?.[1] ?? ''
        const mode = field('mode')
        if (mode !== 'practice' && mode !== 'graded') throw new Error(`${module}/${file}: a game block whose mode is "${mode}"`)
        found.push({ route: `/m/${module}/${file.slice(0, -'.md'.length)}`, game: field('id'), level: field('level'), mode })
      }
    }
  }
  return found
}

/** The block's ticket: one per block, since no lesson names a game, a level and a mode twice (tests/content/game-blocks.test.ts). */
export const ticketOf = (page: Page, block: Pick<LessonGame, 'game' | 'level' | 'mode'>): Locator =>
  page.locator(`section[data-block="game"][data-play="${block.game}/${block.level}"][data-mode="${block.mode}"]`)

/** The game a block opened, under its ticket. */
export const embedOf = (page: Page, block: Pick<LessonGame, 'game' | 'level' | 'mode'>): Locator =>
  page.locator('.es-c-game[data-open]').filter({ has: ticketOf(page, block) }).locator('section[data-game]')

/** Starts a block's level with the keys: focus on its stub, and Enter. Returns the game it opened, once it is on the page. */
export async function startBlock(page: Page, block: Pick<LessonGame, 'game' | 'level' | 'mode'>): Promise<Locator> {
  const ticket = ticketOf(page, block)
  await ticket.getByRole('button', { name: 'Start level' }).focus()
  await page.keyboard.press('Enter')
  await expect(ticket).toHaveAttribute('data-phase', 'open')
  const game = embedOf(page, block)
  await expect(game).toBeVisible({ timeout: 60_000 })
  return game
}

/** One `play` event of the ledger, as IndexedDB holds it. */
export interface StoredPlay {
  id: string
  kind: 'play'
  ref: string
  at: string
  tz: number
  day: string
  dev: string
  v: number
  rev?: string
  seed?: number
  score: number
  ok: boolean
  provenance: string
  data: { actions: string; actionsSha256: string }
}

/**
 * Every `play` event in the ledger's IndexedDB, oldest first, and none while the app has not made its database: opening it from here
 * first would make an empty one of the app's version, with no store in it, and the app would then find no upgrade to make.
 */
export async function playEvents(page: Page): Promise<StoredPlay[]> {
  const rows = await page.evaluate(async () => {
    const made = (await indexedDB.databases()).some((database) => database.name === 'enginespace')
    if (!made) return []
    return new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open('enginespace')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('events')) {
          db.close()
          resolve([])
          return
        }
        const all = db.transaction('events').objectStore('events').getAll()
        all.onerror = () => reject(all.error)
        all.onsuccess = () => {
          db.close()
          resolve(all.result)
        }
      }
    })
  })
  return (rows as StoredPlay[]).filter((row) => row.kind === 'play').sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}
