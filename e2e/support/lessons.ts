/*
 * The lessons' game blocks, as the e2e specs of W1b-T01 find them: every `:::game` directive of `content/modules/<module>/lessons/*.md`,
 * with the lesson's route (`/m/<module>/<file name>`), in the order the lesson has them. The content is read as text, so the spec needs no
 * compiler: tests/content/game-blocks.test.ts holds the compiled blocks to the registries, and this list is the same blocks.
 *
 * And the moves every lesson spec makes: start a block's level, find the game it opened, and read the ledger's `play` events (W1b-T02 adds
 * its `predict` events).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { OPENERS } from '../../tests/content/openers-table'
import type { OpenerKind } from '../../tests/content/openers-table'

const root = path.resolve(import.meta.dirname, '../..')

export interface LessonGame {
  /** `/m/tr2/l3-async-scheduling-closes-the-bubble` */
  readonly route: string
  readonly game: string
  readonly level: string
  readonly mode: 'practice' | 'graded'
}

/** A lesson's id from its route: `/m/tr2/l3-async-scheduling-closes-the-bubble` is `tr2.l3`. */
export const lessonIdOfRoute = (route: string): string => {
  const [, , module, file] = route.split('/')
  return `${module}.${/^l\d+/.exec(file)?.[0] ?? file}`
}

/**
 * How the lesson at `route` opens, from the openers table of REDESIGN §2.5 (tests/content/openers-table.ts), so a content task that edits a
 * lesson to its row changes the table and no spec. The table's letter is the lesson's target: a lesson that has not been edited yet still
 * renders its old opener until its task lands.
 */
export const openerOfRoute = (route: string): OpenerKind => {
  const row = OPENERS.find((one) => one.lesson === lessonIdOfRoute(route))
  if (row === undefined) throw new Error(`${route} has no row in the openers table`)
  return row.opener
}

/** The routes of the lessons that have a game block and whose row in the openers table says `opener`, in course order. */
export const lessonRoutes = (opener: OpenerKind): string[] => {
  const wanted = new Set(OPENERS.filter((row) => row.opener === opener).map((row) => row.lesson))
  return [...new Set(lessonGames().map((game) => game.route))].filter((route) => wanted.has(lessonIdOfRoute(route)))
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

/** The block's run on the lesson page: one per block, since no lesson names a game, a level and a mode twice (tests/content/game-blocks.test.ts). */
export const ticketOf = (page: Page, block: Pick<LessonGame, 'game' | 'level' | 'mode'>): Locator =>
  page.locator(`[data-block="game"][data-play="${block.game}/${block.level}"][data-mode="${block.mode}"]`)

/** The game a block opened, inside its run. */
export const embedOf = (page: Page, block: Pick<LessonGame, 'game' | 'level' | 'mode'>): Locator => ticketOf(page, block).locator('section[data-game]')

/**
 * Starts a block's level with the keys, unless the lesson opened it already (an opening run starts with the page): focus on its control, and
 * Enter. Returns the game it opened, once it is on the page.
 */
export async function startBlock(page: Page, block: Pick<LessonGame, 'game' | 'level' | 'mode'>): Promise<Locator> {
  const ticket = ticketOf(page, block)
  if ((await ticket.getAttribute('data-phase')) !== 'open') {
    await ticket.getByRole('button', { name: /^(Play|Next level)/ }).focus()
    await page.keyboard.press('Enter')
  }
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
 * Every event in the ledger's IndexedDB, in no order, and none while the app has not made its database: opening it from here first would
 * make an empty one of the app's version, with no store in it, and the app would then find no upgrade to make.
 */
export async function ledgerEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
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
}

const byTime = (a: { at: string }, b: { at: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)

/** Every `play` event in the ledger's IndexedDB, oldest first. */
export async function playEvents(page: Page): Promise<StoredPlay[]> {
  return ((await ledgerEvents(page)) as StoredPlay[]).filter((row) => row.kind === 'play').sort(byTime)
}

/** One `predict` event of the ledger, as IndexedDB holds it (A§7.2). */
export interface StoredPredict {
  id: string
  kind: 'predict'
  ref: string
  at: string
  rev?: string
  seed?: number
  score: number
  ok: boolean
  provenance: string
  conf?: string
  data: { value: number | string | { lo: number; hi: number }; truth: number | string | { lo: number; hi: number }; unit?: string }
}

/** Every `predict` event in the ledger's IndexedDB, oldest first. */
export async function predictEvents(page: Page): Promise<StoredPredict[]> {
  return ((await ledgerEvents(page)) as StoredPredict[]).filter((row) => row.kind === 'predict').sort(byTime)
}
