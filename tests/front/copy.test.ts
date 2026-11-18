/*
 * The front page's copy (REDESIGN §3.1; W0-T18's accept 5): verify:numbers passes on it. The copy is src/front/copy.ts, every fixed string the page prints,
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
import { COACH_PARTS, CREDIT, DOCK, frontCopy, HERO, OUTCOMES, PATH, RESULT } from '../../src/front/copy'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('verify:numbers reads the front page\'s copy', () => {
  test('every string of the copy is read, and none holds a number that no tag covers', () => {
    const copy = frontCopy()
    expect(copy.length).toBeGreaterThan(30)
    expect(copy).toContain(HERO.headline)
    expect(copy).toContain(OUTCOMES.list[0].outcome)
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
  test('the headline, the paragraph and the live line are the brief\'s, and the left column holds no procedure', () => {
    expect(HERO.headline).toBe('Run one step of an LLM inference engine.')
    expect(HERO.lede).toBe(
      'enginespace is a course on the internals of vLLM and SGLang, for engineers who finished kernelspace’s serving track. You run each mechanism, read the code that implements it, then prove it on a real GPU.',
    )
    expect(HERO.live).toBe('The panel on the right is live. It takes about a minute.')
    expect(HERO.skip).toBe('Skip the demo and see the course')
    // No numbered steps and no imperative to follow: the instrument's goal line and coach strip are the only instructions on the page.
    for (const line of [HERO.lede, HERO.live, HERO.short]) expect(line).not.toMatch(/^\s*\d+[.)]|\b(?:press|tap|click)\b/i)
  })

  test('the coach strip names the five parts of the first level, in the brief\'s order, and the result\'s way on says what it does', () => {
    expect(COACH_PARTS.map((part) => part.id)).toEqual(['waiting', 'slot', 'cpu', 'gpu', 'step'])
    expect(COACH_PARTS.map((part) => part.line.split(':')[0])).toEqual(['Waiting queue', 'Batch slots', 'CPU lane', 'GPU lane', 'Step'])
    expect(DOCK.stepWaits).toBe('Step: fill a slot first')
    expect(RESULT.nextDemo).toBe('Next demo level')
    // "Start" is the way on's own word, from the pointer: the copy holds what follows it.
    expect(RESULT.course).toBe('the course')
    expect(RESULT.bridge).toContain('You just ran the step loop by hand.')
  })

  test('credit is said in the course\'s own words: a lesson is done when its Test is passed, and practice records nothing', () => {
    expect(CREDIT.lines).toHaveLength(3)
    expect(CREDIT.lines[0]).toContain('Test is passed')
    expect(CREDIT.lines[1]).toContain('records nothing')
  })

  test('the four outcomes are PRODUCT.md\'s, word for word and in its order', () => {
    const product = read('PRODUCT.md')
    const list = product.slice(product.indexOf("Success is the learner reaching the course's four outcomes:"), product.indexOf('The source specification'))
    const outcomes = [...list.matchAll(/^\d\. (.+)$/gm)].map((match) => match[1].replaceAll("'", '’'))
    expect(outcomes).toHaveLength(4)
    expect(OUTCOMES.list.map((row) => row.outcome)).toEqual(outcomes)
  })

  test('each outcome lists the modules that docs/PLAN.md §2 gives it', () => {
    const plan = read('docs/PLAN.md')
    const table = plan.slice(plan.indexOf('## 2. Outcomes'), plan.indexOf('## 3.'))
    const rows = table.split('\n').filter((line) => /^\| \d \|/.test(line))
    expect(rows).toHaveLength(4)
    rows.forEach((row, i) => {
      const modules = row.split('|')[3]
      for (const module of OUTCOMES.list[i].modules) expect(modules.toLowerCase()).toContain(module.toLowerCase())
    })
  })

  test('the path names the three lanes as ARCHITECTURE §8.1 does', () => {
    expect(PATH.lanes).toEqual({ B: 'browser', L: 'laptop', F: 'GPU' })
  })
})
