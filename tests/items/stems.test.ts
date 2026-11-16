/*
 * R-T24: a set never shows the same stem twice. Over the seed count of tests/seeds.ts, no question set that a built lesson draws holds
 * two questions with the same stem, and each item's answer key is the one its own seed makes (the key is a function of the seed that was used).
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAMILIES, startAttempt, stemKey } from '@es/play/items'
import type { Level } from '@es/play/items'
import { seeds } from '../seeds.ts'

const dir = join(import.meta.dir, '../../src/content/generated/lessons')
interface Block {
  type: string
  family?: string
  level?: number
  count?: number
}
const sets = new Map<string, { family: string; level: Level; count: number }>()
for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
  const lesson = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { blocks: Block[] }
  for (const block of lesson.blocks) {
    if (block.type === 'item' && block.family !== undefined && block.level !== undefined && block.count !== undefined) {
      sets.set(`${block.family}@${block.level}x${block.count}`, { family: block.family, level: block.level as Level, count: block.count })
    }
  }
}

describe('a question set never repeats a stem', () => {
  test('the lessons draw sets', () => {
    expect(sets.size).toBeGreaterThan(20)
  })

  for (const [name, { family, level, count }] of sets) {
    test(`${name}: ${seeds(1).length} sets of fresh seeds hold distinct stems and keys that follow their seeds`, () => {
      const gen = FAMILIES.find((candidate) => candidate.id === family)
      if (gen === undefined) throw new Error(`no family ${family}`)
      for (const base of seeds(1)) {
        const entropy = Array.from({ length: count }, (_, at) => (Math.imul(base, 2654435761) + at * 40503) >>> 0)
        const attempt = startAttempt(gen, level, entropy)
        const stems = attempt.served.map((served) => stemKey(served.item))
        expect(new Set(stems).size, `${name} from ${base}`).toBe(stems.length)
        for (const served of attempt.served) {
          // The key is a function of the seed that was used: making the item again from that seed gives the same item.
          const again = gen.make(served.seed, level)
          expect(again.rev).toBe(served.item.rev)
          expect(JSON.stringify(again.answer)).toBe(JSON.stringify(served.item.answer))
        }
      }
    })
  }
})
