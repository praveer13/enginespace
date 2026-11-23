/*
 * W2b-T100, DC-E: every sentence that states a fact about the run is built from the state and compared with an independent recomputation on
 * 200 random walks. The readouts (the marks, the unaccounted ns, the overlap), the goal lines and the debrief of Trace attribution are made by
 * `packages/play/gap-hunt/copy.ts` and `debrief.ts` from figures of the state; this file recounts those figures ns by ns, with difference arrays
 * that share no code with the package or with the model's `checkHunt`, and finds the 'largest misattributed span' by walking every ns of the
 * step, which the debrief finds by cutting at the marks' edges.
 *
 * No goal line or readout, practice or graded, holds the answer to its guess: the copy is a function of the level's id, whether it is graded and
 * how many steps it holds, and of the learner's own marks, and never of the case.
 *
 * The goal line and the stems read the form's word from the key of src/copy/terms.ts (`GAP_WORD`): `copyOf` takes it as an argument, so a word
 * other than the key's changes every line that names it.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { caseOf } from '@es/play/gap-hunt/engine'
import { causeLine, copyOf, marksLine, stepLine, unaccountedLine } from '@es/play/gap-hunt/copy'
import { CATEGORY_PHRASES, debriefOf, largestWrong } from '@es/play/gap-hunt/debrief'
import { huntInit, huntReduce } from '@es/play/gap-hunt/session'
import type { HuntAction, HuntLevel } from '@es/play/gap-hunt/types'
import { GAP_WORD } from '@/copy/terms'
import { seeds } from '../seeds'
import { brute, LEVELS, mainThreadSpans, randomWalk, S } from './gap-hunt-support'

setDefaultTimeout(120_000)

const SEEDS = seeds(1)
const WALKS = Array.from({ length: 200 }, (_, i) => i + 1)

describe('the readouts are the state, recounted', () => {
  for (const [name, chunk] of [['walks 1 to 100', WALKS.slice(0, 100)], ['walks 101 to 200', WALKS.slice(100)]] as const) {
    test(`${name}: marks, unaccounted ns and overlap match a recount ns by ns, before the submit and after it`, () => {
      for (const walk of chunk) {
        const id = (['gap', 'attribute'] as const)[walk % 2]
        const level = S.level(id, 1000 + walk)
        const { actions } = randomWalk(level, walk)
        let state = huntInit(level)
        // The state just before each case's submit is the one with the learner's whole answer on screen.
        for (const action of actions) {
          if (action.t === 'submit') {
            const view = S.view(state)
            const run = state.runs[state.at]
            const b = brute(level, state.at, run.marks)
            const mine = run.marks.length - run.locked
            expect([walk, view.unaccountedNs]).toEqual([walk, b.unaccounted])
            expect([walk, view.overlap]).toEqual([walk, b.conflict > 0])
            expect([walk, view.lines.marks]).toEqual([walk, mine === 0 ? 'No marks yet' : mine === 1 ? '1 mark' : `${mine} marks`])
            expect([walk, view.lines.cause]).toEqual([walk, run.cause === null ? 'No cause is named yet' : 'A cause is named'])
            expect([walk, view.lines.unaccounted]).toEqual([walk, id === 'attribute' ? (b.unaccounted === 0 ? 'Unaccounted: 0 ns, every ns of the step is marked' : `Unaccounted: ${b.unaccounted} ns`) : null])
            expect([walk, view.lines.overlap]).toEqual([walk, b.conflict > 0 ? 'Marks of different categories overlap' : null])
            expect([walk, view.lines.step]).toEqual([walk, `Step ${state.at + 1} of ${level.cases.length}`])
          }
          state = huntReduce(state, action)
        }
      }
    })
  }

  test('plurals and units are right at 0, 1 and many', () => {
    expect([marksLine(0), marksLine(1), marksLine(2), marksLine(12)]).toEqual(['No marks yet', '1 mark', '2 marks', '12 marks'])
    expect([unaccountedLine(0), unaccountedLine(1), unaccountedLine(2500)]).toEqual(['Unaccounted: 0 ns, every ns of the step is marked', 'Unaccounted: 1 ns', 'Unaccounted: 2500 ns'])
    expect([causeLine(false), causeLine(true)]).toEqual(['No cause is named yet', 'A cause is named'])
    expect([stepLine(0, 1), stepLine(1, 3)]).toEqual(['Step 1 of 1', 'Step 2 of 3'])
    const rules = (needed: number) => copyOf({ ...S.level('gap', 1000), needed } as HuntLevel, GAP_WORD).passRule
    expect(rules(1)).toContain('each of 1 new step,')
    expect(rules(3)).toContain('each of 3 new steps,')
  })
})

describe('the debrief names the largest misattributed span, recounted ns by ns', () => {
  for (const [name, chunk] of [['walks 1 to 100', WALKS.slice(0, 100)], ['walks 101 to 200', WALKS.slice(100)]] as const) {
    test(`${name}: its span is the longest maximal run of one (reference, marks) pair that is not right, and the sentence says its length, category and place`, () => {
      let named = 0
      for (const walk of chunk) {
        const level = S.level('attribute', 1000 + walk)
        const { state } = randomWalk(level, walk)
        const first = state.runs.findIndex((run) => run.result?.passed !== true)
        expect(first).toBeGreaterThanOrEqual(0)
        const run = state.runs[first]
        const c = caseOf(level, first)
        const b = brute(level, first, run.marks)
        const window = c.toNs - c.fromNs
        const short = b.right * 100 < window * 95 || b.conflict > 0
        const result = run.result!
        expect([walk, result.rightNs, result.unaccountedNs]).toEqual([walk, b.right, b.unaccounted])
        const sentence = debriefOf(state).sentence
        if (!short) continue
        // The marks fall short: the sentence is about the largest wrong stretch, found by walking every ns.
        const wrong = b.wrong!
        const found = largestWrong(c, run.marks)!
        expect([walk, found.toNs - found.fromNs, found.fromNs - c.fromNs]).toEqual([walk, wrong.len, wrong.from])
        const gotWord = wrong.got === 'none' ? 'left without a mark' : wrong.got === 'many' ? 'marked as more than one category' : `marked as ${CATEGORY_PHRASES[(['kernel', 'copy', 'cpu-gap', 'both-idle'] as const)[wrong.got]]}`
        const truthWord = CATEGORY_PHRASES[(['kernel', 'copy', 'cpu-gap', 'both-idle'] as const)[wrong.truth]]
        expect([walk, sentence]).toEqual([walk, `The largest stretch you got wrong is ${wrong.len} ns of ${truthWord}, ${gotWord}, ${wrong.from} ns into the step.`])
        named++
      }
      // Random marks nearly never reach 95%, so the sentence is checked on almost every walk.
      expect(named).toBeGreaterThan(chunk.length - 5)
    })
  }

  test('a run that matches the reference says so, and names no span', () => {
    const level = S.level('attribute', 1000)
    const ghost = S.ghost(level)
    const d = S.debrief(ghost, ghost)
    expect(d.names).toBeNull()
    expect(d.sentence).toContain('You matched the reference')
  })

  test('a right partition with a wrong cause names the cause, by its name, and the place of the cause in the log', () => {
    const level = S.level('attribute', 1000)
    const c = caseOf(level, 0)
    const ref = c.split
    const cause = ref.largestGap!.cause
    const wrongCause = mainThreadSpans(level, 0).find((i) => i !== cause)!
    const actions: HuntAction[] = [
      { t: 'commit', prediction: 0 },
      ...ref.marks.map((m): HuntAction => ({ t: 'mark', from: m.fromNs, to: m.toNs, category: m.category })),
      { t: 'cause', event: wrongCause },
      { t: 'submit' },
    ]
    const state = actions.reduce(huntReduce, huntInit(level))
    // The other two cases are not played: the run is not over, but the first case is, and the debrief reads it.
    const d = debriefOf(state)
    expect(d.sentence).toContain('The cause is `')
    expect(d.sentence).toContain('where two spans cover the same time, the inner one')
    expect(d.names).toEqual({ turn: actions.length - 2 })
  })
})

describe('no goal line or readout holds the answer to its guess', () => {
  test('the copy of a level is a function of its id, whether it is graded and how many steps it holds, and of the form\'s word: never of the case', () => {
    for (const id of LEVELS) {
      const seen = new Map<string, string>()
      for (const seed of [0, 1, 2, 3, ...SEEDS.slice(0, 60)]) {
        const level = S.level(id, seed)
        const key = `${level.graded}/${level.needed}`
        const text = JSON.stringify(copyOf(level, GAP_WORD))
        expect([id, seed, seen.get(key) ?? text]).toEqual([id, seed, text])
        seen.set(key, text)
      }
    }
  })

  test('the count that `graphs` asks for is in no line of its copy: no digit at all', () => {
    for (const seed of [0, 1, 2, 3, 1000]) {
      const c = copyOf(S.level('graphs', seed), GAP_WORD)
      expect(`${Object.values(c.goal).join(' ')} ${c.prompt} ${c.predict?.ask ?? ''}`).not.toMatch(/\d/)
    }
  })

  test('the view holds no field of the reference, and its lines are the ones the figures of the marks make', () => {
    const view = S.view(huntInit(S.level('attribute', 1000)))
    expect(Object.keys(view).sort()).toEqual(['at', 'canSubmit', 'cause', 'edges', 'graded', 'guess', 'level', 'lines', 'marks', 'of', 'overlap', 'passed', 'phase', 'unaccountedNs', 'window'])
    expect(Object.keys(view.lines).sort()).toEqual(['cause', 'marks', 'overlap', 'step', 'unaccounted'])
  })
})

describe("the goal line and the stems read the form's word from the key of src/copy/terms.ts", () => {
  const named = ['gap', 'attribute'] as const
  test('the key is "CPU gap" today, and each level that names the form says the key\'s word', () => {
    for (const id of named) {
      for (const seed of [0, 1000]) {
        const text = JSON.stringify(copyOf(S.level(id, seed), GAP_WORD))
        expect([id, seed, text.includes(GAP_WORD)]).toEqual([id, seed, true])
      }
    }
    const attribute = copyOf(S.level('attribute', 1000), GAP_WORD)
    expect(attribute.goal.aim).toContain(`kernel, copy-only, ${GAP_WORD} or both idle`)
  })

  test('another word changes every line that names the form, and the key\'s word is left in none', () => {
    for (const id of named) {
      for (const seed of [0, 1000]) {
        const level = S.level(id, seed)
        const before = JSON.stringify(copyOf(level, GAP_WORD))
        const after = JSON.stringify(copyOf(level, 'bubble'))
        expect([id, seed, after.includes('bubble'), after.includes(GAP_WORD), before === after]).toEqual([id, seed, true, false, false])
      }
    }
  })

  test('the debrief restates no word of the form: it says what each category is', () => {
    for (const phrase of Object.values(CATEGORY_PHRASES)) expect(phrase).not.toContain(GAP_WORD)
  })
})
