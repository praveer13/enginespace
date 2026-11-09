/*
 * W1b-T02: which run answers which prediction, and what the pure model reads from it (packages/play/predictions; ARCHITECTURE §4.3, §7.2;
 * ASSESSMENT §4.7). The lessons hold 39 `predict` blocks. Each is revealed after the game that follows it, against what the model computes
 * from that game's run and against no key that anything stores (A§1, I3), and this file holds the table to the lessons and the model to the
 * lessons' own figures:
 *
 *   - the table has a row for each of the 39 and for no other, and a row that names a game block names one that follows its prediction;
 *   - for each prediction that a run answers, the game block's level is played on a seed to its end, the reading is taken from the finished
 *     run's record, and it equals the figure that the lesson's own test computes from the numbers of the prompt (tests/content/tr*-demos.ts),
 *     which is the independent check that the prompt asks about the world the run was played in;
 *   - a reading is of one game and level: a run of another is refused, and a graded block's run, on a seed of its own, reads the same world;
 *   - each prediction that no run answers says why, in a sentence, and names one open task of the tracker.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compiledLessonSchema } from '@es/schema'
import type { CompiledBlock } from '@es/schema'
import { GAMES, levelOf } from '@es/play'
import { gradePrediction } from '@es/play/predictions/grade'
import type { PredictAnswer } from '@es/play/predictions/grade'
import { isAnswered, NO_BLOCK, PLAN, planOf, UNLISTED, WAITS_FOR } from '@es/play/predictions/plan'
import { MODULES_WITH_READINGS, referenceFor } from '@es/play/predictions/truth'
import { answeringBlock } from '@/content/render/model'
import { compileContent } from '../../scripts/content/build.ts'
import { trackerTasks } from '../ci/support.ts'
import { repo } from '../content/support.ts'
import { PREDICTIONS as TR1 } from '../content/tr1-demos.ts'
import { PREDICTIONS as TR2 } from '../content/tr2-demos.ts'
import { PREDICTIONS as TR5A } from '../content/tr5a-demos.ts'
import { finishedRun } from './predictions-support.ts'

type PredictBlock = Extract<CompiledBlock, { type: 'predict' }>
type GameBlock = Extract<CompiledBlock, { type: 'game' }>

const compiled = compileContent({ root: repo })
const lessons = compiled.outputs
  .filter((output) => output.path.startsWith('src/content/generated/lessons/'))
  .map((output) => compiledLessonSchema.parse(JSON.parse(output.text)))

/** Every prediction of the lessons, with its lesson, its place among the lesson's blocks and the game block that follows it for the table's row. */
const predictions = lessons.flatMap((lesson) =>
  lesson.blocks.flatMap((block, at) => {
    if (block.type !== 'predict') return []
    const plan = planOf(block.id)
    const place = isAnswered(plan) ? answeringBlock(lesson.blocks, at, plan) : -1
    return [{ lesson, at, block: block as PredictBlock, plan, place, game: place < 0 ? null : (lesson.blocks[place] as GameBlock) }]
  }),
)
const answered = predictions.filter(({ plan }) => isAnswered(plan))
const waiting = predictions.filter(({ plan }) => !isAnswered(plan))

/** The figure that each lesson's own test computes for a prediction, from the numbers of its prompt and the course's own functions. */
const LESSON_FIGURES: Readonly<Record<string, { readonly unit: string; readonly reference: () => number }>> = { ...TR1, ...TR2, ...TR5A }

const tracker = trackerTasks()

describe('the table of which run answers which prediction', () => {
  test('has a row for each of the lessons\' 39 predictions and for no other, in the lessons\' own order', () => {
    expect(predictions.length).toBe(39)
    expect(Object.keys(PLAN).sort()).toEqual(predictions.map(({ block }) => block.id).sort())
  })

  test('answers 17 of them by a run and leaves 22 waiting for a task', () => {
    expect([answered.length, waiting.length]).toEqual([17, 22])
  })

  test('a row that a run answers names a game block that follows its prediction in its own lesson, and a block of a game that this build has', () => {
    for (const { block, plan, place, game } of answered) {
      if (!isAnswered(plan)) continue
      expect([block.id, place >= 0]).toEqual([block.id, true])
      expect([block.id, game?.id, game?.level]).toEqual([block.id, plan.game, plan.level])
      const entry = GAMES.get(plan.game)
      expect([block.id, entry !== undefined && levelOf(entry, plan.level) !== undefined]).toEqual([block.id, true])
    }
  })

  test('the game block that answers a prediction is the first of its game and level after it: a block that came earlier does not count', () => {
    // tr5a.l4 plays `adapters` before its second prediction and after it: the second is answered by the graded block, which follows it.
    const l4 = predictions.filter(({ lesson }) => lesson.id === 'tr5a.l4')
    expect(l4.map(({ block, game }) => [block.id, game?.mode])).toEqual([
      ['tr5a.l4.p1', 'practice'],
      ['tr5a.l4.p2', 'graded'],
    ])
  })

  test('every prediction that a run answers has a reading, and none that waits has one', async () => {
    for (const { block, plan } of predictions) {
      const reading = await referenceFor(block.id)
      expect([block.id, reading !== undefined]).toEqual([block.id, isAnswered(plan)])
    }
    // TR6 and TR8 have no reading: every prediction of theirs waits.
    expect(MODULES_WITH_READINGS).toEqual(['tr1', 'tr2', 'tr5a'])
    expect(predictions.filter(({ lesson }) => /^tr(?:6|8)\./.test(lesson.id)).every(({ plan }) => !isAnswered(plan))).toBe(true)
  })

  test('imports nothing, so a lesson page that reads it loads no game and no model; the readings are a lazy part that its loader imports dynamically', () => {
    const source = (file: string) => readFileSync(path.join(repo, 'packages/play/predictions', file), 'utf8')
    expect(source('plan.ts').match(/^import /gm)).toBeNull()
    expect(source('truth.ts')).not.toMatch(/from '\.\/tr[0-9a-z]+'/)
    for (const part of MODULES_WITH_READINGS) expect(source('truth.ts')).toContain(`import('./${part}')`)
  })

  test('a name every object has is no prediction: it has the unlisted row, which waits like the rest', async () => {
    for (const name of ['constructor', 'toString', '__proto__', 'tr9.l1.p1']) {
      expect(planOf(name)).toBe(UNLISTED)
      expect(await referenceFor(name)).toBeUndefined()
    }
    expect(UNLISTED.task).toBe(WAITS_FOR)
    expect(NO_BLOCK.task).toBe(WAITS_FOR)
  })
})

describe('a reading takes its question from the prompt, and its world from the run', () => {
  test.each(answered.map(({ block }) => [block.id] as const))('%s: the prompt says what the reading takes from it', async (id) => {
    const { block } = answered.find((entry) => entry.block.id === id)!
    const reading = await referenceFor(id)
    for (const phrase of reading!.says) expect([id, phrase, block.prompt.includes(phrase)]).toEqual([id, phrase, true])
    expect(reading!.says.length).toBeGreaterThan(0)
    // A sentence for the reveal, with no digit in it: the figures beside it are readouts that tag themselves.
    expect(reading!.reads).toMatch(/^[A-Z].*\.$/)
    expect(reading!.reads).not.toMatch(/\b\d/)
  })
})

describe('the game is played on a seed, and the reading of its run is the lesson\'s own figure', () => {
  test.each(answered.map(({ block }) => [block.id] as const))('%s', async (id) => {
    const { block, plan, game } = answered.find((entry) => entry.block.id === id)!
    if (!isAnswered(plan) || game === null) throw new Error(`${id} has no block`)
    const reading = (await referenceFor(id))!
    const record = await finishedRun(game.id, game.level, game.mode, 'a1b2c3d4')
    // The run ended: the level's own session says so, and the record is the learner's whole play, with the lesson's revision.
    expect([record.game, record.level, record.rev]).toEqual([plan.game, plan.level, 'a1b2c3d4'])
    expect(record.actions.length).toBeGreaterThan(0)
    const truth = reading.truth(record)
    const figure = LESSON_FIGURES[id]
    expect(figure).toBeDefined()
    expect(block.answer.kind === 'numeric' ? block.answer.unit : 'choice').toBe(figure.unit)
    expect([id, truth]).toEqual([id, figure.reference()])
  }, 120_000)

  test('a graded block runs on a seed of its own and reads the same world: the second prediction of tr5a.l4 is answered by a run on a drawn seed', async () => {
    const entry = predictions.find(({ block }) => block.id === 'tr5a.l4.p2')!
    const reading = (await referenceFor('tr5a.l4.p2'))!
    const record = await finishedRun('pool', 'adapters', 'graded')
    expect(record.seed).not.toBe(levelOf(GAMES.get('pool')!, 'adapters')!.practiceSeed)
    expect(reading.truth(record)).toBe(LESSON_FIGURES['tr5a.l4.p2'].reference())
    expect(entry.game?.mode).toBe('graded')
  }, 120_000)

  test('a reading is of the game and level of its row: a run of another level, or of another game, is refused', async () => {
    const mini = await finishedRun('engine-floor', 'mini', 'practice')
    const nano = (await referenceFor('tr1.l1.p1'))!
    expect(() => nano.truth(mini)).toThrow('answered by a run of engine-floor/nano, and the run is of engine-floor/mini')
    const comb = (await referenceFor('tr2.l5.p1'))!
    expect(() => comb.truth(mini)).toThrow('answered by a run of loop/graphs')
    const pool = (await referenceFor('tr5a.l1.p1'))!
    expect(() => pool.truth({ ...mini, game: 'pool' })).toThrow('answered by a run of pool/two-kinds')
  })

  test('the answer is the run\'s level and not a number that the prediction stores: the same question has another answer on another engine\'s run', async () => {
    // Three of TR1's predictions ask the same of three engines, and the three runs answer 0, 3 and 2: the table keeps no number among them.
    const boundaries = async (id: string, level: string) => (await referenceFor(id))!.truth(await finishedRun('engine-floor', level, 'practice'))
    expect([await boundaries('tr1.l1.p1', 'nano'), await boundaries('tr1.l3.p1', 'mini'), await boundaries('tr1.l4.p1', 'inside')]).toEqual([0, 3, 2])
  }, 120_000)
})

describe('a prediction that no run answers', () => {
  test('names the task its reveal waits on, which the tracker has and still holds open', () => {
    const tasks = new Set(waiting.map(({ plan }) => (isAnswered(plan) ? '' : plan.task)))
    expect([...tasks]).toEqual([WAITS_FOR])
    const text = tracker.get(WAITS_FOR) ?? ''
    expect(text.split('\n', 1)[0]).toMatch(/^#### \[[ ~]\] W2-T43 · Predictions that no run answers yet/)
    expect(text).toContain('`PLAN`')
  })

  test('says why in a sentence of its own: what the question carries that no run of the lesson\'s game holds', () => {
    for (const { block, plan } of waiting) {
      if (isAnswered(plan)) continue
      expect([block.id, plan.why]).toEqual([block.id, expect.stringMatching(/^[A-Z][^]*\.$/)])
      expect([block.id, /\d/.test(plan.why)]).toEqual([block.id, false])
    }
    expect(new Set(waiting.map(({ plan }) => (isAnswered(plan) ? '' : plan.why))).size).toBeGreaterThanOrEqual(15)
  })

  test('a lesson that has no game has no run to reveal after, and says so', () => {
    const lonely = predictions.filter(({ lesson }) => !lesson.blocks.some((block) => block.type === 'game'))
    expect(lonely.map(({ block }) => block.id)).toEqual(['tr2.l7.p1'])
    expect(lonely.every(({ plan }) => !isAnswered(plan))).toBe(true)
    expect((planOf('tr2.l7.p1') as { why: string }).why).toContain('no game')
  })

  test('every one of them is a prediction whose figure the lesson computes: nothing here is a prediction without an answer, only without a run to read it from', () => {
    for (const { block } of waiting.filter(({ lesson }) => /^tr(?:1|2|5a)\./.test(lesson.id))) expect([block.id, LESSON_FIGURES[block.id] !== undefined]).toEqual([block.id, true])
  })
})

describe('grading a prediction (ASSESSMENT §4.7)', () => {
  const numeric = (rel_tol: number): PredictAnswer => ({ kind: 'numeric', unit: 'us', rel_tol })
  const choice: PredictAnswer = { kind: 'choice', options: [{ id: 'a-yes', text: 'Yes' }, { id: 'b-no', text: 'No' }] }
  const interval: PredictAnswer = { kind: 'interval', unit: 'ms' }

  test('a number is right within the relative tolerance of the truth, at its edge too, and exact when the tolerance is 0', () => {
    expect(gradePrediction(numeric(0.1), 95, 100)).toEqual({ ok: true, score: 1 })
    expect(gradePrediction(numeric(0.1), 110, 100)).toEqual({ ok: true, score: 1 })
    expect(gradePrediction(numeric(0.1), 111, 100)).toEqual({ ok: false, score: 0 })
    expect(gradePrediction(numeric(0), 3, 3)).toEqual({ ok: true, score: 1 })
    expect(gradePrediction(numeric(0), 3.01, 3)).toEqual({ ok: false, score: 0 })
    expect(gradePrediction(numeric(0.02), Number.NaN, 3).ok).toBe(false)
  })

  test('a choice is right when it is the id of the right option, and an id that is no option of the prediction is refused', () => {
    expect(gradePrediction(choice, 'a-yes', 'a-yes')).toEqual({ ok: true, score: 1 })
    expect(gradePrediction(choice, 'b-no', 'a-yes')).toEqual({ ok: false, score: 0 })
    expect(() => gradePrediction(choice, 'c-maybe', 'a-yes')).toThrow('not an option')
  })

  test('a range holds the truth or does not, and scores by the width it costs in decades: a tight range that holds it scores near 1', () => {
    const tight = gradePrediction(interval, { lo: 99, hi: 101 }, 100)
    const wide = gradePrediction(interval, { lo: 10, hi: 1000 }, 100)
    const miss = gradePrediction(interval, { lo: 10, hi: 50 }, 100)
    expect([tight.ok, wide.ok, miss.ok]).toEqual([true, true, false])
    expect(tight.score).toBeGreaterThan(wide.score)
    expect(wide.score).toBeGreaterThan(miss.score)
    expect(tight.score).toBeGreaterThan(0.95)
    expect(miss.score).toBeGreaterThan(0)
    // Written the wrong way round, a range is read the way it was meant.
    expect(gradePrediction(interval, { lo: 101, hi: 99 }, 100)).toEqual(tight)
  })

  test('a value of the wrong shape, or a range that is not of positive numbers, is a bug and not a learner\'s mistake: it throws', () => {
    expect(() => gradePrediction(numeric(0.1), 'a-yes', 100)).toThrow(TypeError)
    expect(() => gradePrediction(choice, 3, 'a-yes')).toThrow(TypeError)
    expect(() => gradePrediction(interval, 100, 100)).toThrow(TypeError)
    expect(() => gradePrediction(interval, { lo: 0, hi: 5 }, 3)).toThrow('positive')
  })
})
