/*
 * W2b-T100: Trace attribution's session, the pure rules (GAMES.md §6): the actions and what each refuses, the marks that a case starts with,
 * the grade of each level (the place and the cause together on `gap`, the 95% bar on `attribute`, the count on `graphs`, the correlation id
 * on `read`), the log that replays, and a state that has a canonical JSON form (a trace is typed arrays, so a state must not hold one).
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson } from '@es/sim/core'
import { applyAction, regrade, replay, startRun, stateHash } from '@es/play'
import { caseOf, readTarget } from '@es/play/gap-hunt/engine'
import { ghostActions, huntAsk, huntInit, huntReduce, MARKS_MAX } from '@es/play/gap-hunt/session'
import { PASS_PERCENT } from '@es/play/gap-hunt/score'
import type { HuntAction, HuntLevel } from '@es/play/gap-hunt/types'
import { checkHunt, huntPass, spanView } from '@es/sim/trace'
import { mainThreadSpans, randomWalk, S, stateAfter } from './gap-hunt-support'

const GRADED_SEED = 1000
const level = (id: 'read' | 'graphs' | 'gap' | 'attribute', seed = GRADED_SEED): HuntLevel => S.level(id, seed)
const throws = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ''
}

/** The reference's actions for case 0 only, up to but not including the submit. */
const refCase = (l: HuntLevel): HuntAction[] => {
  const all = ghostActions(l)
  return all.slice(0, all.findIndex((a) => a.t === 'submit'))
}

describe('the opening guess and the order of a case', () => {
  test('gap, attribute and graphs open on a guess; read does not', () => {
    for (const id of ['gap', 'attribute', 'graphs'] as const) expect(huntAsk(huntInit(level(id)))).toEqual({ kind: 'commit', case: 0 })
    expect(huntAsk(huntInit(level('read')))).toEqual({ kind: 'mark', case: 0 })
    expect(huntAsk(stateAfter(level('gap'), { t: 'commit', prediction: 0 }))).toEqual({ kind: 'mark', case: 0 })
  })

  test('a mark, an unmark, a cause or a submit before the guess is refused, and a second guess too', () => {
    const l = level('attribute')
    const c = caseOf(l, 0)
    const start = huntInit(l)
    expect(throws(() => huntReduce(start, { t: 'mark', from: c.fromNs, to: c.toNs, category: 'kernel' }))).toContain('guess')
    expect(throws(() => huntReduce(start, { t: 'cause', event: 0 }))).toContain('guess')
    expect(throws(() => huntReduce(start, { t: 'submit' }))).toContain('guess')
    expect(throws(() => huntReduce(start, { t: 'unmark', index: 0 }))).toContain('guess')
    const guessed = huntReduce(start, { t: 'commit', prediction: 2 })
    expect(throws(() => huntReduce(guessed, { t: 'commit', prediction: 1 }))).toContain('once')
  })

  test('a guess is a whole number, and a category index for gap and attribute', () => {
    const start = huntInit(level('gap'))
    for (const bad of [-1, 1.5, 4, Number.NaN]) expect(throws(() => huntReduce(start, { t: 'commit', prediction: bad }))).not.toBe('')
    expect(throws(() => huntReduce(huntInit(level('read')), { t: 'commit', prediction: 0 }))).toContain('no opening guess')
  })

  test('the run is over after the last submit, and nothing follows it', () => {
    const l = level('gap', 1)
    const done = ghostActions(l).reduce(huntReduce, huntInit(l))
    expect([done.done, S.done(done), S.ask(done)]).toEqual([true, true, null])
    expect(throws(() => huntReduce(done, { t: 'submit' }))).toContain('over')
  })
})

describe('a mark runs from one event edge to a later one', () => {
  const l = level('attribute')
  const c = caseOf(l, 0)
  const guessed = huntReduce(huntInit(l), { t: 'commit', prediction: 0 })

  test('between two edges of the step, with a category of the four', () => {
    const [a, b] = [c.edges[1], c.edges[2]]
    const next = huntReduce(guessed, { t: 'mark', from: a, to: b, category: 'cpu-gap' })
    expect(next.runs[0].marks).toEqual([{ fromNs: a, toNs: b, category: 'cpu-gap' }])
  })

  test('a start that is not an edge, an end before the start, a category of no name and a float are refused', () => {
    const [a, b] = [c.edges[1], c.edges[2]]
    const bad = (from: number, to: number, category: string = 'kernel') => throws(() => huntReduce(guessed, { t: 'mark', from, to, category: category as 'kernel' }))
    expect(bad(a + 1, b)).toContain('edge')
    expect(bad(a, b + 1)).toContain('edge')
    expect(bad(b, a)).toContain('later')
    expect(bad(a, a)).toContain('later')
    expect(bad(a, b, 'idle')).toContain('not a category')
    expect(bad(c.fromNs - 1, b)).not.toBe('')
    expect(bad(a + 0.5, b)).not.toBe('')
  })

  test(`a case holds at most ${MARKS_MAX} marks`, () => {
    let state = guessed
    const [a, b] = [c.edges[1], c.edges[2]]
    for (let k = 0; k < MARKS_MAX; k++) state = huntReduce(state, { t: 'mark', from: a, to: b, category: 'kernel' })
    expect(throws(() => huntReduce(state, { t: 'mark', from: a, to: b, category: 'kernel' }))).toContain('at most')
  })

  test('unmark takes back one mark of the learner, and never one the case started with', () => {
    const g = level('gap')
    const gc = caseOf(g, 0)
    const start = huntReduce(huntInit(g), { t: 'commit', prediction: 0 })
    expect(start.runs[0].locked).toBeGreaterThan(0)
    expect(throws(() => huntReduce(start, { t: 'unmark', index: 0 }))).toContain('no mark of yours')
    const [a, b] = [gc.edges[1], gc.edges[2]]
    const marked = huntReduce(start, { t: 'mark', from: a, to: b, category: 'cpu-gap' })
    const taken = huntReduce(marked, { t: 'unmark', index: start.runs[0].locked })
    expect(taken.runs[0].marks).toEqual(start.runs[0].marks)
    expect(throws(() => huntReduce(taken, { t: 'unmark', index: start.runs[0].locked }))).toContain('no mark of yours')
  })
})

describe('a cause is a span of the main thread that runs in the step', () => {
  test('a span of the main thread is accepted, a span of a GPU stream or one outside the step is refused, and null takes the cause back', () => {
    const l = level('gap')
    const c = caseOf(l, 0)
    const start = huntReduce(huntInit(l), { t: 'commit', prediction: 0 })
    const ok = mainThreadSpans(l, 0)[0]
    const named = huntReduce(start, { t: 'cause', event: ok })
    expect(named.runs[0].cause).toBe(ok)
    expect(huntReduce(named, { t: 'cause', event: null }).runs[0].cause).toBeNull()
    let gpu = -1
    let far = -1
    for (let i = 0; i < c.hunt.trace.spans.track.length; i++) {
      const v = spanView(c.hunt.trace, i)
      if (gpu < 0 && v.kind === 'gpu-stream') gpu = i
      if (far < 0 && v.kind === 'cpu-thread' && (v.endNs <= c.fromNs || v.startNs >= c.toNs)) far = i
    }
    expect(throws(() => huntReduce(start, { t: 'cause', event: gpu }))).toContain('main thread')
    if (far >= 0) expect(throws(() => huntReduce(start, { t: 'cause', event: far }))).toContain('main thread')
    expect(throws(() => huntReduce(start, { t: 'cause', event: 1e9 }))).not.toBe('')
    expect(throws(() => huntReduce(start, { t: 'cause', event: 0.5 }))).not.toBe('')
  })
})

describe('a submit needs what the level asks for', () => {
  test('attribute: every ns marked and a cause named; gap: a mark and a cause', () => {
    const l = level('attribute')
    const c = caseOf(l, 0)
    let state = huntReduce(huntInit(l), { t: 'commit', prediction: 0 })
    state = huntReduce(state, { t: 'cause', event: mainThreadSpans(l, 0)[0] })
    expect(throws(() => huntReduce(state, { t: 'submit' }))).toContain('every ns')
    state = huntReduce(state, { t: 'mark', from: c.fromNs, to: c.edges[c.edges.length - 2], category: 'kernel' })
    expect(throws(() => huntReduce(state, { t: 'submit' }))).toContain('every ns')
    expect(S.view(state).canSubmit).toBe(false)
    state = huntReduce(state, { t: 'mark', from: c.edges[c.edges.length - 2], to: c.toNs, category: 'kernel' })
    expect(S.view(state).canSubmit).toBe(true)
    expect(huntReduce(state, { t: 'submit' }).runs[0].result).not.toBeNull()

    const g = level('gap')
    let gs = huntReduce(huntInit(g), { t: 'commit', prediction: 0 })
    expect(throws(() => huntReduce(gs, { t: 'submit' }))).toContain('cause')
    gs = huntReduce(gs, { t: 'cause', event: mainThreadSpans(g, 0)[0] })
    expect(throws(() => huntReduce(gs, { t: 'submit' }))).toContain('mark the gap')
  })

  test('graphs has nothing to mark: the count ends the case', () => {
    const l = level('graphs')
    const c = caseOf(l, 0)
    const guessed = huntReduce(huntInit(l), { t: 'commit', prediction: c.kernels })
    expect(guessed.runs[0].result?.passed).toBe(true)
    expect(throws(() => huntReduce(huntInit(l), { t: 'mark', from: c.fromNs, to: c.toNs, category: 'kernel' }))).not.toBe('')
    const wrong = huntReduce(huntInit(l), { t: 'commit', prediction: c.kernels + 1 })
    expect(wrong.runs[0].result?.passed).toBe(false)
  })
})

describe('each level passes only on what it asks', () => {
  test("read: the kernel marked carries the correlation id of the launch call named, and any other pair fails", () => {
    const l = level('read')
    const c = caseOf(l, 0)
    const target = readTarget(c)!
    const k = spanView(c.hunt.trace, target.kernel)
    const right = stateAfter(l, { t: 'cause', event: target.launch }, { t: 'mark', from: k.startNs, to: k.endNs, category: 'kernel' }, { t: 'submit' })
    expect(right.runs[0].result?.passed).toBe(true)
    // The right kernel with another call named.
    const other = mainThreadSpans(l, 0).find((i) => i !== target.launch && spanView(c.hunt.trace, i).kind === 'cpu-thread')!
    const wrongCall = stateAfter(l, { t: 'cause', event: other }, { t: 'mark', from: k.startNs, to: k.endNs, category: 'kernel' }, { t: 'submit' })
    expect(wrongCall.runs[0].result?.passed).toBe(false)
    // The right call with a mark that is not that kernel.
    const wrongMark = stateAfter(l, { t: 'cause', event: target.launch }, { t: 'mark', from: c.fromNs, to: c.toNs, category: 'kernel' }, { t: 'submit' })
    expect(wrongMark.runs[0].result?.passed).toBe(false)
  })

  test('gap: the place and the cause together; either alone fails, and the categories inside the gap are not counted', () => {
    const l = level('gap')
    const c = caseOf(l, 0)
    const gap = c.split.largestGap!
    const prefix: HuntAction[] = [{ t: 'commit', prediction: 0 }]
    const play = (marks: HuntAction[], cause: number | null) => stateAfter(l, ...prefix, ...marks, { t: 'cause', event: cause }, { t: 'submit' }).runs[0].result
    const whole: HuntAction = { t: 'mark', from: gap.fromNs, to: gap.toNs, category: 'cpu-gap' }
    expect(play([whole], gap.cause)?.passed).toBe(true)
    // Another category of idle over the whole gap still has its two edges.
    expect(play([{ ...whole, category: 'both-idle' } as HuntAction], gap.cause)?.passed).toBe(true)
    // The right place, a wrong cause.
    const wrong = mainThreadSpans(l, 0).find((i) => i !== gap.cause)!
    expect(play([whole], wrong)?.passed).toBe(false)
    expect(play([whole], wrong)?.causeOk).toBe(false)
    // The right cause, a place that stops short of the edge by one edge.
    const inner = c.edges.filter((e) => e > gap.fromNs && e < gap.toNs)
    if (inner.length > 0) expect(play([{ t: 'mark', from: gap.fromNs, to: inner[0], category: 'cpu-gap' }], gap.cause)?.passed).toBe(false)
    // The stretch just after the gap, with the right cause: not the gap's edges.
    const b = c.edges.find((e) => e > gap.toNs)!
    expect(play([{ t: 'mark', from: gap.toNs, to: b, category: 'cpu-gap' }], gap.cause)?.passed).toBe(false)
  })

  test(`attribute: ${PASS_PERCENT}% of the window's ns in the right category, with the cause, and not one ns under`, () => {
    const l = level('attribute')
    const c = caseOf(l, 0)
    const ref = c.split.marks
    const window = c.toNs - c.fromNs
    const marksOf = (flip: number[]) => ref.map((m, i): HuntAction => ({ t: 'mark', from: m.fromNs, to: m.toNs, category: flip.includes(i) ? (m.category === 'kernel' ? 'copy' : 'kernel') : m.category }))
    const cause = c.split.largestGap!.cause
    const result = (flip: number[]) => stateAfter(l, { t: 'commit', prediction: 0 }, ...marksOf(flip), { t: 'cause', event: cause }, { t: 'submit' }).runs[0].result!
    expect(result([]).passed).toBe(true)
    // Flip the smallest segments one by one: the run passes while the wrong ns are at most 5% of the window, and fails at the first segment past it.
    const order = ref.map((m, i) => ({ i, ns: m.toNs - m.fromNs })).sort((x, y) => x.ns - y.ns)
    let wrong = 0
    const flipped: number[] = []
    for (const { i, ns } of order) {
      flipped.push(i)
      wrong += ns
      const r = result(flipped)
      expect([wrong, r.rightNs]).toEqual([wrong, window - wrong])
      expect([wrong, r.passed]).toEqual([wrong, wrong * 100 <= window * (100 - PASS_PERCENT)])
      if (wrong * 100 > window * (100 - PASS_PERCENT)) break
    }
    // A right partition with a wrong cause fails.
    const other = mainThreadSpans(l, 0).find((i) => i !== cause)!
    expect(stateAfter(l, { t: 'commit', prediction: 0 }, ...marksOf([]), { t: 'cause', event: other }, { t: 'submit' }).runs[0].result?.passed).toBe(false)
  })

  test("the bar is the model's: `huntPass` at the same cut, on the same marks", () => {
    const l = level('attribute')
    const c = caseOf(l, 0)
    const marks = c.split.marks.map((m) => ({ ...m }))
    expect(huntPass(checkHunt(c.hunt, marks, c.split.largestGap!.cause))).toBe(true)
    const w = c.toNs - c.fromNs
    const cut = Math.floor((w * (100 - PASS_PERCENT)) / 100)
    expect(cut).toBeGreaterThan(0)
    const bent = [{ fromNs: c.fromNs, toNs: c.fromNs + cut + 1, category: marks[0].category === 'kernel' ? 'copy' : 'kernel' } as const, ...marks]
    expect(huntPass(checkHunt(c.hunt, [{ ...bent[0] }, ...marks.filter((m) => m.fromNs >= c.fromNs + cut + 1)], c.split.largestGap!.cause))).toBe(false)
  })

  test('a level passes only when every case does, and the score is the share that passed', () => {
    const l = level('gap')
    const actions = ghostActions(l)
    const ends = actions.map((a, i) => (a.t === 'submit' ? i : -1)).filter((i) => i >= 0)
    expect(ends).toHaveLength(3)
    const all = actions.reduce(huntReduce, huntInit(l))
    expect(S.grade(all, all)).toEqual({ score: 1, ok: true })
    // The third case with a wrong cause.
    const wrongCause = mainThreadSpans(l, 2).find((i) => i !== caseOf(l, 2).split.largestGap!.cause)!
    const bent = actions.map((a, i) => (a.t === 'cause' && i > ends[1] ? ({ t: 'cause', event: wrongCause } as HuntAction) : a))
    const two = bent.reduce(huntReduce, huntInit(l))
    const grade = S.grade(two, all)
    expect(grade.ok).toBe(false)
    expect(grade.score).toBeCloseTo(2 / 3, 10)
    expect(S.score(two)).toMatchObject({ passed: 2, of: 3 })
  })
})

describe('the log is the record', () => {
  test('a random walk of every level replays to the same state, hash and grade, and its state has a canonical JSON form', () => {
    for (const id of ['read', 'graphs', 'gap', 'attribute'] as const) {
      for (const seed of [0, 1000, 1001]) {
        const l = level(id, seed)
        const { state, actions } = randomWalk(l, seed + 7)
        expect(() => canonicalJson(state)).not.toThrow()
        const record = { game: 'gap-hunt', level: id, seed, actions }
        const back = replay(S as never, record)
        expect(back.ok).toBe(true)
        if (back.ok) expect(stateHash(back.state)).toBe(stateHash(state))
        const graded = regrade(S as never, record)
        expect(graded.valid).toBe(true)
      }
    }
  })

  test('a run played through the framework is the run replayed, action by action', () => {
    let run = startRun(S as never, { game: 'gap-hunt', level: 'gap', seed: 1000 })
    for (const a of ghostActions(run.level as HuntLevel)) run = applyAction(S as never, run, a)
    const graded = regrade(S as never, { ...run.record })
    expect(graded.valid && graded.grade).toEqual({ score: 1, ok: true })
  })

  test('the state holds the level as plain data, never a trace, and no display string beyond the levels and categories', () => {
    const state = huntInit(level('attribute'))
    const text = canonicalJson(state)
    expect(text).not.toContain('Float64')
    expect(Object.keys(state.level).sort()).toEqual(['cases', 'graded', 'id', 'needed', 'seed'])
  })

  test('a replay refuses an action out of order or one that the reducer refuses, naming it', () => {
    const l = level('gap')
    const c = caseOf(l, 0)
    const back = replay(S as never, { game: 'gap-hunt', level: 'gap', seed: 1000, actions: [{ t: 'mark', from: c.fromNs, to: c.toNs, category: 'kernel' } as HuntAction] })
    expect(back.ok).toBe(false)
  })
})

describe('the reference plays every level as a learner could', () => {
  test('its first case, action by action, never throws, and the guess of the reference is the largest category', () => {
    for (const id of ['gap', 'attribute'] as const) {
      const l = level(id, 1001)
      const [commit] = refCase(l)
      expect(commit).toEqual({ t: 'commit', prediction: caseOf(l, 0).largest })
    }
  })
})
