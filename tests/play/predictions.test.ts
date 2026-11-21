/*
 * W1b-T02 and R-T09: how each lesson prediction is revealed, and what the pure model says its answer is (packages/play/predictions;
 * ARCHITECTURE §4.3, §7.2; ASSESSMENT §4.7; D-067). The lessons hold 43 `predict` blocks. Each is revealed in one of two ways, and against no
 * key that anything stores (A§1, I3). This file holds the table to the lessons and the model to the lessons' own figures:
 *
 *   - the table has a row for each of the 43 and for no other; 20 are revealed after the run of a game block that follows them, 23 at commit,
 *     and the lesson's own `reveal` says the same as the row;
 *   - for each prediction that a run answers, the game block's level is played on a seed to its end, the reading is taken from the finished
 *     run's record, and it equals the figure that the lesson's own test computes from the numbers of the prompt (tests/content/tr*-demos.ts),
 *     which is the independent check that the prompt asks about the world the run was played in;
 *   - a reading is of one game and level: a run of another is refused, and a graded block's run, on a seed of its own, reads the same world;
 *   - each prediction revealed at commit has an answer that takes no run, equals the lesson's own figure, takes its numbers from its prompt,
 *     shows its working in the engine's words, and cites claims that exist, with the source that each claim gives;
 *   - the pairs where a lesson's prediction and its level's opening prediction ask the same quantity are listed, and a change to either prompt
 *     fails until the row says it again.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compiledLessonSchema } from '@es/schema'
import type { CompiledBlock } from '@es/schema'
import { GAMES, levelOf } from '@es/play'
import { gradePrediction } from '@es/play/predictions/grade'
import type { PredictAnswer } from '@es/play/predictions/grade'
import { FLOOR_QUESTION } from '@es/play/engine-floor/copy'
import { POOL_COPY } from '@es/play/pool/copy'
import { copyOf as shiftCopyOf } from '@es/play/shape-shifter/copy'
import { buildLevel as shiftLevel } from '@es/play/shape-shifter/levels'
import { isAnswered, isAtCommit, isHeld, NO_BLOCK, PLAN, planOf, UNLISTED } from '@es/play/predictions/plan'
import { SAME, sameFor } from '@es/play/predictions/same'
import { commitFor, MODULES_WITH_COMMITS, MODULES_WITH_READINGS, referenceFor } from '@es/play/predictions/truth'
import { findBanned } from '@/copy/banned'
import { TOTAL_AFTER_GAME, TOTAL_AT_COMMIT, TOTAL_PREDICTIONS } from '../content/module-counts'
import { answeringBlock } from '@/content/render/model'
import { compileContent } from '../../scripts/content/build.ts'
import { repo } from '../content/support.ts'
import { PREDICTIONS as TR0 } from '../content/tr0-demos.ts'
import { PREDICTIONS as TR1 } from '../content/tr1-demos.ts'
import { PREDICTIONS as TR2 } from '../content/tr2-demos.ts'
import { PREDICTIONS as TR5A } from '../content/tr5a-demos.ts'
import { PREDICTIONS as TR6 } from '../content/tr6-demos.ts'
import { PREDICTIONS as TR8 } from '../content/tr8-demos.ts'
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
const atCommit = predictions.filter(({ plan }) => isAtCommit(plan))

/** A prompt as the learner reads it, without the tags that follow its numbers. */
const untagged = (prompt: string): string => prompt.replace(/ \[(?:measured|derived|estimated|unverified)\]/g, '')

const claims = new Map(
  (JSON.parse(compiled.outputs.find((output) => output.path === 'public/claims.json')!.text) as { claims: { id: string; source?: { title: string } }[] }).claims.map((claim) => [claim.id, claim]),
)

/** The figure that each lesson's own test computes for a prediction, from the numbers of its prompt and the course's own functions. */
const LESSON_FIGURES: Readonly<Record<string, { readonly unit: string; readonly reference: () => number }>> = { ...TR0, ...TR1, ...TR2, ...TR5A, ...TR8 }

describe('the table of which run answers which prediction', () => {
  test('has a row for each of the lessons\' predictions and for no other, in the lessons\' own order', () => {
    expect(predictions.length).toBe(TOTAL_PREDICTIONS)
    expect(Object.keys(PLAN).sort()).toEqual(predictions.map(({ block }) => block.id).sort())
  })

  test("reveals the counts of the table's rows after a run and at commit (20 and 23 today), and leaves none held", () => {
    expect([answered.length, atCommit.length, predictions.filter(({ plan }) => isHeld(plan)).length]).toEqual([TOTAL_AFTER_GAME, TOTAL_AT_COMMIT, 0])
  })

  test("the lesson's own `reveal` says what the row says", () => {
    for (const { block, plan } of predictions) expect([block.id, block.reveal]).toEqual([block.id, isAtCommit(plan) ? 'at-commit' : 'after-game'])
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

  test('every prediction that a run answers has a reading and no answer at commit, and every one revealed at commit has an answer and no reading', async () => {
    for (const { block, plan } of predictions) {
      const reading = await referenceFor(block.id)
      const answer = await commitFor(block.id)
      expect([block.id, reading !== undefined, answer !== undefined]).toEqual([block.id, isAnswered(plan), isAtCommit(plan)])
    }
    // TR6 and TR8 have no reading: no run of their games answers a prediction, so every prediction of theirs is revealed at commit.
    expect(MODULES_WITH_READINGS).toEqual(['tr0', 'tr1', 'tr2', 'tr5a'])
    expect(MODULES_WITH_COMMITS).toEqual(['tr0', 'tr1', 'tr2', 'tr5a', 'tr6', 'tr8'])
    expect(predictions.filter(({ lesson }) => /^tr(?:6|8)\./.test(lesson.id)).every(({ plan }) => isAtCommit(plan))).toBe(true)
  })

  test('plan.ts and same.ts import nothing, so a lesson page that reads them loads no game and no model; the readings and the answers are lazy parts that the loader imports dynamically', () => {
    const source = (file: string) => readFileSync(path.join(repo, 'packages/play/predictions', file), 'utf8')
    expect(source('plan.ts').match(/^import /gm)).toBeNull()
    expect(source('same.ts').match(/^import /gm)).toBeNull()
    expect(source('truth.ts')).not.toMatch(/from '\.\/(?:commit-)?tr[0-9a-z]+'/)
    for (const part of MODULES_WITH_READINGS) expect(source('truth.ts')).toContain(`import('./${part}')`)
    for (const part of MODULES_WITH_COMMITS) expect(source('truth.ts')).toContain(`import('./commit-${part}')`)
  })

  test('a name every object has is no prediction: it has the unlisted row, a question to hold, and no reading and no answer', async () => {
    for (const name of ['constructor', 'toString', '__proto__', 'tr9.l1.p1']) {
      expect(planOf(name)).toBe(UNLISTED)
      expect(await referenceFor(name)).toBeUndefined()
      expect(await commitFor(name)).toBeUndefined()
    }
    for (const held of [UNLISTED, NO_BLOCK]) {
      expect(isHeld(held)).toBe(true)
      expect(findBanned(held.why)).toEqual([])
      expect(held.why).toMatch(/^[A-Z][^]*\.$/)
      expect(held.why).not.toMatch(/\d|[RW][0-9]?-T\d\d|D-\d\d\d/)
    }
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

  test("tr2.l1.p1 is answered by a run of loop/first-3-gap: the level is played on a seed, and the reading is the lesson's figure, whatever the seed", async () => {
    const entry = predictions.find(({ block }) => block.id === 'tr2.l1.p1')!
    expect(entry.plan).toEqual({ game: 'loop', level: 'first-3-gap' })
    expect(entry.game?.level).toBe('first-3-gap')
    const reading = (await referenceFor('tr2.l1.p1'))!
    for (const seed of [undefined, 'a1b2c3d4'] as const) {
      const record = await finishedRun('loop', 'first-3-gap', 'practice', seed)
      expect(reading.truth(record)).toBeCloseTo(LESSON_FIGURES['tr2.l1.p1'].reference(), 10)
      expect(reading.truth({ ...record, seed: record.seed + 1 })).toBeCloseTo(100 * 4 / 7, 10)
    }
    expect(LESSON_FIGURES['tr2.l1.p1'].reference()).toBeCloseTo(57.142857, 5)
  }, 120_000)

  test('the answer is the run\'s level and not a number that the prediction stores: the same question has another answer on another engine\'s run', async () => {
    // Three of TR1's predictions ask the same of three engines, and the three runs answer 0, 3 and 2: the table keeps no number among them.
    const boundaries = async (id: string, level: string) => (await referenceFor(id))!.truth(await finishedRun('engine-floor', level, 'practice'))
    expect([await boundaries('tr1.l1.p1', 'nano'), await boundaries('tr1.l3.p1', 'mini'), await boundaries('tr1.l4.p1', 'inside')]).toEqual([0, 3, 2])
  }, 120_000)
})

/** The figure that the lesson's own test computes for a prediction revealed at commit, in the shape of the answer: a number, or the id of an option. */
function lessonFigure(id: string): number | string {
  const figure = (TR6 as Readonly<Record<string, { reference: () => number | string }>>)[id] ?? LESSON_FIGURES[id]
  if (figure === undefined) throw new Error(`no figure for ${id}`)
  return figure.reference()
}

describe('a prediction revealed at commit (D-067)', () => {
  test('is every prediction that no level of its game answers: 23 of them, in every module that has a lesson of its own question', () => {
    expect(atCommit.map(({ block }) => block.id)).toEqual([
      'tr0.l1.p2', 'tr0.l4.p2',
      'tr1.l2.p2', 'tr1.l2.p1', 'tr1.l4.p2', 'tr1.l5.p3', 'tr1.l5.p2', 'tr1.l7.p2',
      'tr2.l2.p1', 'tr2.l3.p1', 'tr2.l6.p2', 'tr2.l7.p1',
      'tr5a.l2.p1', 'tr5a.l3.p2',
      'tr6.l1.p1', 'tr6.l2.p1', 'tr6.l3.p1', 'tr6.l4.p1', 'tr6.l5.p1',
      'tr8.l1.p1', 'tr8.l2.p1', 'tr8.l3.p1', 'tr8.l4.p1',
    ])
  })

  test.each(atCommit.map(({ block }) => [block.id] as const))("%s: its answer takes no run, and is the lesson's own figure", async (id) => {
    const { block } = atCommit.find((entry) => entry.block.id === id)!
    const answer = (await commitFor(id))!
    // It takes no argument: nothing of a run, a seed or the learner reaches it.
    expect(answer.truth.length).toBe(0)
    const truth = answer.truth()
    const figure = lessonFigure(id)
    if (block.answer.kind === 'numeric') {
      const lesson = TR6 as Readonly<Record<string, { unit: string }>>
      expect(block.answer.unit).toBe((lesson[id] ?? LESSON_FIGURES[id]).unit)
      expect(typeof truth).toBe('number')
      expect(Math.abs(Number(truth) - Number(figure))).toBeLessThan(1e-9 * Math.max(1, Math.abs(Number(figure))))
    } else {
      expect(truth).toBe(figure)
    }
    // The answer is right by the lesson's own grading: the exact value of the model passes the block's tolerance.
    expect(gradePrediction(block.answer, truth, truth).ok).toBe(true)
  })

  test.each(atCommit.map(({ block }) => [block.id] as const))('%s: the prompt says what the working takes from it, and the working is in the engine\'s words, with no task and no decision in it', async (id) => {
    const { block } = atCommit.find((entry) => entry.block.id === id)!
    const answer = (await commitFor(id))!
    const prompt = untagged(block.prompt)
    expect(answer.says.length).toBeGreaterThan(0)
    for (const phrase of answer.says) expect([id, phrase, prompt.includes(phrase)]).toEqual([id, phrase, true])
    expect(answer.working.length).toBeGreaterThanOrEqual(2)
    for (const line of [...answer.working, ...answer.sources.map((source) => source.text)]) {
      expect([id, line, /^\S/.test(line)]).toEqual([id, line, true])
      expect([id, line, findBanned(line)]).toEqual([id, line, []])
      expect([id, line, /\b[RW][0-9]?-T\d\d\b|\bD-\d{3}\b|\b[0-9a-f]{40}\b/.test(line)]).toEqual([id, line, false])
    }
    // The last line of the working is the answer: it ends in a figure or in the option's own words.
    expect(answer.working[answer.working.length - 1]).toMatch(/\.$/)
  })

  test('a claim that an answer cites exists, and the source it prints is the source of that claim', async () => {
    let cited = 0
    for (const { block } of atCommit) {
      const answer = (await commitFor(block.id))!
      for (const source of answer.sources) {
        if (source.claim === undefined) continue
        cited += 1
        const claim = claims.get(source.claim)
        expect([block.id, source.claim, claim !== undefined]).toEqual([block.id, source.claim, true])
        expect([block.id, source.claim, claim?.source?.title]).toEqual([block.id, source.claim, source.text])
      }
    }
    expect(cited).toBeGreaterThanOrEqual(8)
  })

  test('an answer read from a source says where, and one worked from the question\'s numbers alone cites none', async () => {
    const asked = await Promise.all(['tr1.l5.p3', 'tr1.l7.p2', 'tr6.l4.p1', 'tr1.l4.p2'].map(async (id) => [id, (await commitFor(id))!.sources.length] as const))
    expect(asked.every(([, n]) => n >= 1)).toBe(true)
    for (const id of ['tr2.l3.p1', 'tr2.l6.p2', 'tr8.l4.p1']) expect((await commitFor(id))!.sources).toEqual([])
  })

  test('the figures the lessons print are held by the lessons\' own tests: a fact about a source is a claim, a count of the lesson\'s own is a table', async () => {
    // tr1.l4.p2 reads two counts of the lesson's own table, which has no claim: its source says so.
    const counted = (await commitFor('tr1.l4.p2'))!
    expect(counted.sources.map((source) => source.claim)).toEqual([undefined])
    expect(counted.tag).toBe('derived')
    expect((await commitFor('tr1.l5.p3'))!.tag).toBe('measured')
  })
})

describe('a question to hold', () => {
  test('no row of the table is one: every prediction of the lessons has a reveal', () => {
    expect(predictions.filter(({ plan }) => isHeld(plan))).toEqual([])
    expect(Object.values(PLAN).every((plan) => isAnswered(plan) || isAtCommit(plan))).toBe(true)
  })
})

describe('the pairs of a lesson prediction and a level\'s opening prediction that ask for the same quantity', () => {
  /** The level's opening question as the game asks it. */
  const levelPrompt = (game: string, level: string): string | undefined => {
    if (game === 'engine-floor') return FLOOR_QUESTION
    if (game === 'pool') return (POOL_COPY as Readonly<Record<string, { predict: { ask: string } }>>)[level]?.predict.ask
    // Tensor views' question is read from the level on its practice seed, the run a lesson's practice block plays.
    if (game === 'shape-shifter') return shiftCopyOf(shiftLevel(level, levelOf(GAMES.get(game)!, level)?.practiceSeed ?? 0)).predict.ask
    return undefined
  }

  test('each row holds the two prompts word for word: the lesson\'s as the lesson writes it, and the level\'s as the game asks it', () => {
    expect(SAME.length).toBeGreaterThanOrEqual(7)
    for (const pair of SAME) {
      const entry = predictions.find(({ block }) => block.id === pair.lesson)
      expect([pair.lesson, entry !== undefined]).toEqual([pair.lesson, true])
      expect([pair.lesson, untagged(entry!.block.prompt)]).toEqual([pair.lesson, pair.lessonPrompt])
      expect([pair.lesson, levelPrompt(pair.game, pair.level)]).toEqual([pair.lesson, pair.levelPrompt])
      expect(pair.quantity.length).toBeGreaterThan(10)
    }
  })

  test('a row is for a game and a level that this build has, a lesson prediction once, and its unit is the level\'s', () => {
    expect(new Set(SAME.map((pair) => pair.lesson)).size).toBe(SAME.length)
    for (const pair of SAME) {
      const entry = GAMES.get(pair.game)
      expect([pair.lesson, entry !== undefined && levelOf(entry, pair.level) !== undefined]).toEqual([pair.lesson, true])
      expect(sameFor(pair.lesson)).toBe(pair)
    }
    expect(sameFor('tr1.l7.p1')).toBeUndefined()
    expect(sameFor('constructor')).toBeUndefined()
  })

  test('the pairs of a game ask for what its level asks: the same unit of answer, in the same words', () => {
    for (const pair of SAME) {
      const entry = predictions.find(({ block }) => block.id === pair.lesson)!
      const unit = entry.block.answer.kind === 'numeric' ? entry.block.answer.unit : ''
      if (pair.game === 'engine-floor') expect([pair.lesson, unit]).toEqual([pair.lesson, 'boundaries'])
      if (pair.game === 'pool') expect([pair.lesson, ['pages', 'groups'].includes(unit)]).toEqual([pair.lesson, true])
      if (pair.game === 'shape-shifter') expect([pair.lesson, unit]).toEqual([pair.lesson, shiftCopyOf(shiftLevel(pair.level, levelOf(GAMES.get(pair.game)!, pair.level)?.practiceSeed ?? 0)).predict.unit])
    }
  })
})

describe("the sentences of the predictions are in the engine's words", () => {
  test('no reading says a word or names a task that a learner should not meet', async () => {
    for (const { block, plan } of predictions) {
      if (!isAnswered(plan)) continue
      const reading = (await referenceFor(block.id))!
      expect([block.id, findBanned(reading.reads)]).toEqual([block.id, []])
      expect([block.id, /\b[RW][0-9]?-T\d\d\b|\bD-\d{3}\b/.test(reading.reads)]).toEqual([block.id, false])
    }
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
