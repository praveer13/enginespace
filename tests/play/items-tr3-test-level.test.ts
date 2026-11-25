/*
 * W2b-T106: TR3's Tests. Each lesson of the module ends in a Test of three questions with at least one numeric (N5, answered), and the
 * questions test the lesson's own KCs (the design's lesson table). The lessons are written by later tasks, so the table of what each
 * Test asks is held here: the family, the variant and the level of each question. A later lesson's item blocks must name these, and the
 * test below holds, for each question, what the lesson would show before the answer: the worked step holds neither the key nor the
 * right option's words, and the first step of the solution is the rule alone (no figure, no code, no result).
 *
 * Lesson 4's Test also holds the game's graded `attribute` level, which is not an item and is not counted here.
 *
 * The word of the form is held here too: `CPU_GAP` of the families' kit is `GAP_WORD` of src/copy/terms.ts, which packages/play may not
 * import, and a stem that names the stretch reads it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { familyById, fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item, Level } from '@es/play/items'
import { CPU_GAP } from '@es/play/items/families/tr3/kit'
import { GAP_WORD } from '@/copy/terms'

interface Question {
  readonly family: string
  readonly variant: string
  readonly level: Level
}

interface LessonTest {
  readonly lesson: string
  /** The KCs the lesson adds, and whose items its Test asks. */
  readonly own: readonly string[]
  readonly questions: readonly Question[]
}

const q = (family: string, variant: string, level: Level): Question => ({ family: `tr3.${family}`, variant, level })

/** The Tests of the module's six lessons (the design's lesson table). */
const TESTS: readonly LessonTest[] = [
  { lesson: 'tr3.l1', own: ['tr3.trace-anatomy'], questions: [q('launch-and-kernel', 'which-kernel', 1), q('launch-and-kernel', 'which-kernel', 1), q('launch-and-kernel', 'lag', 1)] },
  { lesson: 'tr3.l2', own: ['tr3.capture-window', 'tr3.provider-preflight'], questions: [q('capture-window', 'which-steps', 1), q('capture-window', 'count', 1), q('provider-preflight', 'can-run', 1)] },
  { lesson: 'tr3.l3', own: ['tr3.graph-traces'], questions: [q('inside-a-graph', 'what-shows', 1), q('inside-a-graph', 'what-shows', 1), q('inside-a-graph', 'kernels', 1)] },
  { lesson: 'tr3.l4', own: ['tr3.partition', 'tr3.gap-cause'], questions: [q('which-category', 'stretch', 1), q('gap-cause', 'which-call', 1), q('gap-cause', 'three-parts', 1)] },
  { lesson: 'tr3.l5', own: ['tr3.step-floor', 'tr3.flat-curve'], questions: [q('floor', 'floor', 1), q('floor', 'kv-part', 1), q('flat-curve', 'which-bound', 1)] },
  { lesson: 'tr3.l6', own: ['tr3.capture-window', 'tr3.trace-anatomy'], questions: [q('capture-window', 'which-steps', 2), q('capture-window', 'count', 2), q('launch-and-kernel', 'which-kernel', 2)] },
]

const SEEDS = fixedSeeds(150, 0x7e53)
const root = path.resolve(import.meta.dirname, '../..')

const gen = (question: Question) => {
  const found = familyById(question.family)
  if (found === undefined) throw new Error(`no family ${question.family}`)
  return found
}

describe("each lesson's Test asks three questions, one at least numeric, that test the lesson's own KCs", () => {
  for (const test_ of TESTS) {
    test(`${test_.lesson}: three questions, each variant offered at its level, a numeric one among them, and every own KC asked`, () => {
      expect(test_.questions).toHaveLength(3)
      const kinds = test_.questions.map((question) => {
        const family = gen(question)
        expect(offeredAt(family, question.level).some((variant) => variant.id === question.variant), `${question.family}/${question.variant} at ${question.level}`).toBe(true)
        return family.make(1, question.level, question.variant).answer.kind
      })
      expect(kinds).toContain('numeric')
      const asked = new Set(test_.questions.flatMap((question) => offeredAt(gen(question), question.level).find((variant) => variant.id === question.variant)?.kcs ?? []))
      for (const kc of test_.own) expect(asked.has(kc), `${test_.lesson} asks ${kc}`).toBe(true)
    })
  }

  test('lesson 4 asks the three-part numeric variant of the gap cause, and lesson 5 asks two numeric questions of the floor', () => {
    expect(TESTS[3].questions.some((question) => question.family === 'tr3.gap-cause' && question.variant === 'three-parts')).toBe(true)
    const five = TESTS[4].questions.filter((question) => question.family === 'tr3.floor')
    expect(five).toHaveLength(2)
    for (const question of five) expect(gen(question).make(1, question.level, question.variant).answer.kind).toBe('numeric')
  })

  test('the six Tests together ask every KC of the module that an item family earns', () => {
    const kcs = new Set(TESTS.flatMap((test_) => test_.questions.flatMap((question) => offeredAt(gen(question), question.level).find((variant) => variant.id === question.variant)?.kcs ?? [])))
    for (const kc of ['tr3.trace-anatomy', 'tr3.capture-window', 'tr3.graph-traces', 'tr3.partition', 'tr3.gap-cause', 'tr3.step-floor', 'tr3.flat-curve', 'tr3.provider-preflight']) expect(kcs.has(kc), kc).toBe(true)
  })

  test('no KC of the module that an item family earns keeps a `planned` line', () => {
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')) as { id: string; planned?: string }[]
    const tr3 = graph.filter((kc) => kc.id.startsWith('tr3.'))
    expect(tr3.length).toBeGreaterThanOrEqual(8)
    for (const kc of tr3) expect(kc.planned, kc.id).toBeUndefined()
  })
})

/** The correct option's words. */
function rightWords(item: Item): string[] {
  if (item.answer.kind === 'numeric') return []
  const { options, correct } = item.answer
  return [plain(options.find((option) => option.id === correct)?.text ?? [])]
}

describe("what a Test shows before the answer gives nothing away", () => {
  test('the part-worked step holds neither the key nor the right option, and the first step of the solution is the rule alone', () => {
    for (const test_ of TESTS) {
      for (const question of test_.questions) {
        const family = gen(question)
        for (const seed of SEEDS) {
          const item = family.make(seed, question.level, question.variant)
          const where = `${test_.lesson} ${question.family}/${question.variant} level ${question.level} seed ${seed}`
          for (const step of item.worked) {
            const words = plain(step.text)
            if (item.answer.kind === 'numeric') {
              const key = item.answer.truth
              expect(step.text.some((part) => part.t === 'num' && part.value === key), `${where}: ${words}`).toBe(false)
              expect(step.text.some((part) => part.t === 'code' && part.code.trim() === String(key)), `${where}: ${words}`).toBe(false)
              expect(step.result, where).toBeUndefined()
            }
            for (const text of rightWords(item)) expect(words.includes(text), `${where}: ${words}`).toBe(false)
          }
          const first = family.solution(item)[0]
          expect(first.text.every((part) => part.t === 'text'), where).toBe(true)
          expect(first.result, where).toBeUndefined()
          if (question.level === 1) expect(item.worked[0].text, where).toEqual(first.text)
        }
      }
    }
  })
})

describe("the form's word", () => {
  test('the families hold the word of src/copy/terms.ts, and the gap-cause stem reads it', () => {
    expect(CPU_GAP).toBe(GAP_WORD)
    for (const level of [0, 1, 2, 3] as const) {
      for (const seed of SEEDS.slice(0, 20)) {
        const item = familyById('tr3.gap-cause')?.make(seed, level, 'which-call')
        expect(item === undefined ? '' : plain(item.stem)).toContain(GAP_WORD)
      }
    }
  })

  test('no sentence of the module\'s second-half families names the stretch by another word', () => {
    for (const id of ['tr3.gap-cause', 'tr3.floor', 'tr3.flat-curve', 'tr3.provider-preflight']) {
      const family = familyById(id)
      if (family === undefined) throw new Error(id)
      for (const level of [0, 1, 2, 3] as const) {
        for (const variant of offeredAt(family, level)) {
          for (const seed of SEEDS.slice(0, 20)) {
            const item = family.make(seed, level, variant.id)
            const text = [item.stem, ...item.worked.map((step) => step.text), ...family.solution(item).map((step) => step.text), ...(item.answer.kind === 'choice' ? item.answer.options.flatMap((option) => [option.text, option.why]) : [])].map(plain).join(' ')
            expect(text.toLowerCase(), `${id}/${variant.id}`).not.toContain('bubble')
          }
        }
      }
    }
  })
})
