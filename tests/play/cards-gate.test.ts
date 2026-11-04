/*
 * W1-T07 acceptance check 2: `verify:games` fails when a registered game's card is missing (ARCHITECTURE §5.9, §6.2).
 *
 * W0-T14's gate already looked for `content/cards/<card>.md`. This task gives the gate what a card is: the file must be one that
 * the content compiler accepts (three parts, claims that exist, a source for each rule). So there are three ways to lack a card,
 * and each fails the gate by its own message: no card id in the registry, no file, and a file that does not compile. The first
 * tests give the toy game of W0-T14 each of them. The last run the real registry against a copy of this checkout.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GAMES } from '@es/play'
import { checkGames, main, worldAt } from '../../scripts/verify-games'
import type { GateInput, Report } from '../../scripts/verify-games'
import { TOY, memoryFiles, toyFiles } from './support'

const root = path.resolve(import.meta.dirname, '../..')

function gate(world: GateInput['world'], files = toyFiles()): Promise<Report> {
  return checkGames({ games: [TOY], componentIds: ['toy'], files: memoryFiles(files), world })
}
const said = (report: Report) => report.findings.map((finding) => finding.message)
const CARD = 'content/cards/toy-world.md'

describe('the toy game\'s card, three ways to lack it', () => {
  test('a card the compiler accepts passes', async () => {
    expect(said(await gate({ cardIds: new Set(['toy-world']) }))).toEqual([])
  })

  test('a registry entry with no card id fails, and says to name one', async () => {
    const report = await checkGames({ games: [{ ...TOY, card: '' }], componentIds: ['toy'], files: memoryFiles(toyFiles()), world: { cardIds: new Set(['toy-world']) } })
    expect(said(report)).toEqual([expect.stringContaining('no notional-machine card: name the card id')])
  })

  test('a card file that is not there fails, by name, once and not twice', async () => {
    const files = toyFiles()
    files.delete(CARD)
    expect(said(await gate({ cardIds: new Set() }, files))).toEqual([`the notional-machine card is missing: ${CARD} (A§5.9)`])
  })

  test('a card file that is there and does not compile fails, and sends the author to verify:content for the lines', async () => {
    const messages = said(await gate({ cardIds: new Set(['another-world']) }))
    expect(messages).toEqual([expect.stringContaining(`the notional-machine card ${CARD} does not compile`)])
    expect(messages[0]).toContain('three parts, claims that exist and a source for each rule (A§5.9)')
    expect(messages[0]).toContain('Run verify:content for the lines')
  })

  test('while the cards are not known (no content/cards folder), only the file is looked for, as before', async () => {
    expect(said(await gate({}))).toEqual([])
  })
})

describe('the real registry, against this checkout', () => {
  test('every registered game has a card that the compiler accepts', () => {
    const world = worldAt(root)
    expect(GAMES.games.length).toBeGreaterThan(0)
    for (const game of GAMES.games) expect([game.id, world.cardIds?.has(game.card)]).toEqual([game.id, true])
  })

  describe('with its card taken away', () => {
    const trees: string[] = []
    afterAll(() => trees.forEach((tree) => rmSync(tree, { recursive: true, force: true })))

    /** A copy of what the gate reads, with the card of `loop` removed or spoiled. */
    function copy(change: (dir: string, card: string) => void): string {
      const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-cards-'))
      trees.push(dir)
      cpSync(path.join(root, 'content'), path.join(dir, 'content'), { recursive: true })
      cpSync(path.join(root, 'src/games'), path.join(dir, 'src/games'), { recursive: true })
      const card = GAMES.games[0].card
      change(dir, path.join(dir, 'content/cards', `${card}.md`))
      return dir
    }

    async function run(dir: string): Promise<{ status: number; out: string; err: string }> {
      const log = console.log
      const error = console.error
      const out: string[] = []
      const err: string[] = []
      console.log = (...args: unknown[]) => void out.push(args.join(' '))
      console.error = (...args: unknown[]) => void err.push(args.join(' '))
      try {
        return { status: await main(dir), out: out.join('\n'), err: err.join('\n') }
      } finally {
        console.log = log
        console.error = error
      }
    }

    test('the copy with the card passes, so the failures below are the card\'s', async () => {
      const result = await run(copy(() => undefined))
      expect(result.err).toBe('')
      expect(result.status).toBe(0)
      expect(result.out).toContain('verify-games: ok')
    })

    test('a missing card file fails the gate, names the game and the file, and exits 1', async () => {
      const game = GAMES.games[0]
      const result = await run(copy((_dir, card) => rmSync(card)))
      expect(result.status).toBe(1)
      expect(result.err).toContain(`verify-games: ${game.id}: the notional-machine card is missing: content/cards/${game.card}.md (A§5.9)`)
      expect(result.err).toContain('verify-games: 1 problem')
    })

    test('a card file that lost a part fails the gate as a card that does not compile', async () => {
      const game = GAMES.games[0]
      const result = await run(copy((_dir, card) => writeFileSync(card, `---\nid: ${game.card}\nkind: notional-machine\ntitle: A card with one part\nworld: steploop\nstatus: draft\n---\n\n## Models\n\n- A rule (D-044).\n`)))
      expect(result.status).toBe(1)
      expect(result.err).toContain(`verify-games: ${game.id}: the notional-machine card content/cards/${game.card}.md does not compile`)
    })
  })
})
