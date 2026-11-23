/*
 * TR0's Tests ask their questions part-worked: the first step of the solution is shown before the learner answers. That step must not
 * give the answer away. For every item block of a lesson's "Exit check", at the level the block asks at, and for every variant offered
 * there, the step shown holds neither the key nor the correct option's words. For the grid and the sync families it is the rule alone:
 * it holds no figure of the scene and names no line of the ticket, so it cannot say which program, how many programs, which line waits
 * or how many times.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { familyById, fixedSeeds, isLevel, offeredAt, plain } from '@es/play/items'
import type { Item, Level } from '@es/play/items'

const root = path.resolve(import.meta.dirname, '../..')
const LESSONS = path.join(root, 'content/modules/tr0/lessons')
const SEEDS = fixedSeeds(200, 0x7e57)

/** The item blocks of each lesson's Exit check: their family and level. */
function testBlocks(): { lesson: string; family: string; level: Level }[] {
  const out: { lesson: string; family: string; level: Level }[] = []
  for (const file of readdirSync(LESSONS).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(path.join(LESSONS, file), 'utf8')
    const start = text.indexOf('\n## Exit check')
    if (start < 0) continue
    const next = text.indexOf('\n## ', start + 1)
    const section = text.slice(start, next < 0 ? undefined : next)
    for (const m of section.matchAll(/:::item\nfamily: ([\w.-]+)\nlevel: (\d)/g)) {
      const level = Number(m[2])
      if (!isLevel(level)) throw new Error(`${file}: level ${m[2]}`)
      out.push({ lesson: file, family: m[1], level })
    }
  }
  return out
}

/** The correct option's words, and the same words without their first word ("program (4, 1)" also as "(4, 1)"). */
function keyTexts(item: Item): string[] {
  if (item.answer.kind === 'numeric') return []
  const { options, correct } = item.answer
  const words = plain(options.find((option) => option.id === correct)?.text ?? [])
  const rest = words.split(' ').slice(1).join(' ')
  return rest.length > 0 && /\d/.test(rest) ? [words, rest] : [words]
}

describe("a Test's part-worked step does not give the answer away", () => {
  const blocks = testBlocks()

  test('the five lessons have Exit checks, and the grid and sync families are asked part-worked in them', () => {
    expect(new Set(blocks.map((block) => block.lesson)).size).toBe(5)
    expect(blocks.some((block) => block.family === 'tr0.grid-cover' && block.level === 1)).toBe(true)
    expect(blocks.some((block) => block.family === 'tr0.find-the-sync' && block.level === 1)).toBe(true)
  })

  test('the step shown before the answer holds neither the key nor the right option', () => {
    for (const block of blocks) {
      const gen = familyById(block.family)
      if (gen === undefined) throw new Error(`no family ${block.family}`)
      for (const variant of offeredAt(gen, block.level)) {
        for (const seed of SEEDS) {
          const item = gen.make(seed, block.level, variant.id)
          const where = `${block.lesson} ${block.family}/${variant.id} seed ${seed}`
          for (const step of item.worked) {
            const words = plain(step.text)
            if (item.answer.kind === 'numeric') {
              const key = item.answer.truth
              expect(step.text.some((part) => part.t === 'num' && part.value === key), `${where}: ${words}`).toBe(false)
              expect(step.text.some((part) => part.t === 'code' && part.code.trim() === String(key)), `${where}: ${words}`).toBe(false)
              expect(step.result, where).toBeUndefined()
            }
            for (const text of keyTexts(item)) expect(words.includes(text), `${where}: ${words}`).toBe(false)
          }
        }
      }
    }
  })

  test('for the grid and the sync families it is the rule alone: no figure of the scene and no line of the ticket', () => {
    for (const block of blocks.filter((candidate) => candidate.family === 'tr0.grid-cover' || candidate.family === 'tr0.find-the-sync')) {
      const gen = familyById(block.family)
      if (gen === undefined) throw new Error(`no family ${block.family}`)
      for (const variant of offeredAt(gen, block.level)) {
        for (const seed of SEEDS) {
          const item = gen.make(seed, block.level, variant.id)
          for (const step of item.worked) {
            const where = `${block.family}/${variant.id} seed ${seed}: ${plain(step.text)}`
            expect(step.text.every((part) => part.t === 'text'), where).toBe(true)
            expect(/\d/.test(plain(step.text)), where).toBe(false)
          }
        }
      }
    }
  })
})
