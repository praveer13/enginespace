/**
 * What the tests of TR1's item families share (W1b-T03): the claims they hold a family's facts to, the knowledge components of the graph, the
 * unpacked sources of the pins when a machine has them, and the checks that every family of the module runs the same way. Nothing here writes
 * anything.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from 'bun:test'
import { fixedSeeds, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Gen, Item, Level } from '@es/play/items'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'

export { claim, KC_IDS, root } from './items-tr6-support.ts'

/** The folder that holds the unpacked tarballs of the pins, each in `<repository>-<commit>` (tests/content/tr1-sources.test.ts says how to get them). */
export const SOURCES = process.env.ES_LIFECYCLE_SOURCES

/** The file of a repository at a commit in the unpacked tarballs, or null when this machine has no such tree. */
export function sourceFile(repository: 'vllm' | 'sglang' | 'mini-sglang' | 'nano-vllm', commit: string, file: string): string | null {
  if (SOURCES === undefined || SOURCES === '') return null
  const full = path.join(SOURCES, `${repository}-${commit}`, file)
  return existsSync(full) ? readFileSync(full, 'utf8') : null
}

/** What the family files of TR1 are held to, whatever a family asks: deterministic, well formed, graded as the key says, and no bare number in a sentence. */
export function expectWellMade(gen: Gen, seeds: readonly number[], perLevel = 60): void {
  for (const level of LEVELS) {
    for (const seed of seeds.slice(0, perLevel)) {
      for (const variant of offeredAt(gen, level)) {
        const item = gen.make(seed, level, variant.id)
        expect(gen.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(gen, item, { seed, level, variant: variant.id })).toEqual([])
        expect(gen.grade(item, keyOf(item)).ok).toBe(true)
        expect(gen.grade(item, wrongOf(item)).ok).toBe(false)
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...gen.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
      }
    }
  }
}

/** The share of the first `count` seeds at `level` and `variant` for which `pick` returns each value. */
export function shares<T extends string>(gen: Gen, level: Level, variant: string, pick: (item: Item) => T, count = 1000, salt = 0x5a17e): Map<T, number> {
  const out = new Map<T, number>()
  for (const seed of fixedSeeds(count, salt)) {
    const value = pick(gen.make(seed, level, variant))
    out.set(value, (out.get(value) ?? 0) + 1 / count)
  }
  return out
}

/** The key of a choice item, as the id of its right option. */
export const correctId = (item: Item): string => (item.answer.kind === 'choice' ? item.answer.correct : '')

/** The right option's text, as a learner reads it. */
export function correctText(item: Item): string {
  if (item.answer.kind !== 'choice') return ''
  const key = item.answer.correct
  return plain(item.answer.options.find((option) => option.id === key)?.text ?? [])
}

/** The number a given prints, by label. */
export function givenNumber(item: Item, label: string): number {
  const found = item.givens.find((given) => given.label === label)
  if (found === undefined || found.value.t !== 'num') throw new Error(`the ticket has no number "${label}"`)
  return found.value.value
}
