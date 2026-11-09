/*
 * W0-T18, accept 5: verify:numbers passes on the front page's copy. The copy is src/front/copy.ts, every fixed string the page prints,
 * and the gate reads it by the rule it applies to a lesson (scripts/verify-numbers.ts). The page's own numbers come from the model and
 * the course index through Readouts, each with its tag, so the copy holds none.
 *
 * And the copy says what the course says: the headline is the direction's, the four outcomes are PRODUCT.md's word for word, and each
 * lists the modules docs/PLAN.md §2 gives it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { untaggedNumbers } from '../../scripts/content/prose'
import { FRONT_COPY, frontCopyDiagnostics, main } from '../../scripts/verify-numbers'
import { frontCopy, HERO, MENU, NEXT, ORDER } from '../../src/front/copy'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('verify:numbers reads the front page\'s copy', () => {
  test('every string of the copy is read, and none holds a number that no tag covers', () => {
    const copy = frontCopy()
    expect(copy.length).toBeGreaterThan(30)
    expect(copy).toContain(HERO.headline)
    expect(copy).toContain(ORDER.dishes[0].outcome)
    expect(copy.flatMap((text) => untaggedNumbers(text))).toEqual([])
    expect(frontCopyDiagnostics()).toEqual([])
  })

  test('a number in the copy fails the gate, on the line of copy.ts that holds it', () => {
    const source = "export const X = {\n  a: 'Plain words.',\n  b: 'A rail of 4 clips.',\n}\n"
    const found = frontCopyDiagnostics(['Plain words.', 'A rail of 4 clips.'], source)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ gate: 'numbers', severity: 'error', code: 'untagged-number', file: FRONT_COPY, line: 3 })
    expect(found[0].message).toContain('"4"')
    // A tag, an id and a module's name are not untagged numbers.
    expect(frontCopyDiagnostics(['A rail of 4 clips [estimated].', 'TR5a and TR6, on an H100.'], source)).toEqual([])
  })

  test('the gate passes on the repository', () => {
    const lines: string[] = []
    const log = console.log
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
      expect(main([])).toBe(0)
    } finally {
      console.log = log
    }
    expect(lines.at(-1)).toContain('verify:numbers passed')
  })
})

describe('the copy says what the course says', () => {
  test('the headline is "Fire the next step.", and the primary action is "Start service"', () => {
    expect(HERO.headline).toBe('Fire the next step.')
    expect(HERO.start).toBe('Start service')
    expect(NEXT.start).toBe('Start TR1')
  })

  test('the four outcomes are PRODUCT.md\'s, word for word and in its order', () => {
    const product = read('PRODUCT.md')
    const list = product.slice(product.indexOf("Success is the learner reaching the course's four outcomes:"), product.indexOf('The source specification'))
    const outcomes = [...list.matchAll(/^\d\. (.+)$/gm)].map((match) => match[1].replaceAll("'", '’'))
    expect(outcomes).toHaveLength(4)
    expect(ORDER.dishes.map((dish) => dish.outcome)).toEqual(outcomes)
  })

  test('each outcome lists the modules that docs/PLAN.md §2 gives it', () => {
    const plan = read('docs/PLAN.md')
    const table = plan.slice(plan.indexOf('## 2. Outcomes'), plan.indexOf('## 3.'))
    const rows = table.split('\n').filter((line) => /^\| \d \|/.test(line))
    expect(rows).toHaveLength(4)
    rows.forEach((row, i) => {
      const modules = row.split('|')[3]
      for (const module of ORDER.dishes[i].modules) expect(modules.toLowerCase()).toContain(module.toLowerCase())
    })
  })

  test('the menu names the three lanes as ARCHITECTURE §8.1 does', () => {
    expect(MENU.lanes).toEqual({ B: 'browser', L: 'laptop', F: 'GPU' })
  })
})
