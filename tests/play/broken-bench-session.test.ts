/*
 * The Inspection's session (GAMES.md §11 "Simulation API", §2.5): the contract every game keeps, and the court's own rules.
 *
 *   - The reference stands on every case of every level and passes its own grade, and a state and a run replay to the same hash.
 *   - An action is refused when it is not one: a flaw the court does not know, a range that does not hold the p99, a filing with
 *     nothing to file, an action after the court has risen. The refusal leaves the state as it was.
 *   - The court judges at the filing and keeps what it found in the state, but the view shows no ruling until the run is over, because
 *     the rulings hold the answers.
 *   - The grade is the share of the cases ruled right, and the level passes at ASSESSMENT §4.3's number (one case of one, four of five).
 *   - A graded level has no undo, and a practice one replays its log without the last action.
 */
import { describe, expect, test } from 'bun:test'
import { applyAction, decodeActions, encodeActions, finishRun, regrade, replay, startRun, stateHash, undoAction } from '@es/play'
import { benchAsk, benchCounts, benchDebrief, benchDone, benchGhost, benchGrade, benchInBand, benchInit, benchLevel, benchReduce, benchSession, benchView } from '@es/play/broken-bench/session'
import { caseOf } from '@es/play/broken-bench/cases'
import { LEVEL_IDS } from '@es/play/broken-bench/levels'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import type { Flaw } from '@es/play/broken-bench/types'
import { filing, play, rightAnswer } from './broken-bench-support'

const FLAW_OTHER = (flaw: Flaw): Flaw => BENCH_FLAWS[(BENCH_FLAWS.indexOf(flaw) + 1) % BENCH_FLAWS.length]

describe('the reference', () => {
  test.each(LEVEL_IDS)('%s: it finishes on every case, stands on all of them and passes its own grade', (id) => {
    const level = benchLevel(id, 0)
    const ghost = benchGhost(level)
    expect(benchDone(ghost)).toBe(true)
    expect(benchGrade(ghost, ghost)).toEqual({ score: 1, ok: true })
    const counts = benchCounts(ghost)
    expect(counts).toMatchObject({ cases: level.slots.length, filed: level.slots.length, casesRight: level.slots.length, flawsRight: level.slots.length })
    expect(benchDebrief(ghost, ghost).names).toBeNull()
  })

  test('it files the court\'s own interval, whose score is the interval\'s width in decades and nothing more', () => {
    const level = benchLevel('due', 0)
    const view = benchView(benchGhost(level))
    const ruling = view.rulings?.[0]
    expect(ruling?.scoreMilli).toBe(ruling?.truth.courtScoreMilli)
    expect(ruling?.prediction).toEqual({ p99Us: ruling?.truth.p99Us, loUs: ruling?.truth.ciLoUs, hiUs: ruling?.truth.ciHiUs })
  })
})

describe('determinism (D-017)', () => {
  test('the same seed and the same actions give the same state and the same hash, and a log replays to it', () => {
    const answer = (slot: Parameters<typeof rightAnswer>[0]) => rightAnswer(slot)
    const a = play('court', 5, answer)
    const b = play('court', 5, answer)
    expect(stateHash(a.state)).toBe(stateHash(b.state))
    expect(stateHash(a.state)).toMatch(/^[0-9a-f]{8}$/)
    const replayed = replay(benchSession, a.record)
    expect(replayed.ok).toBe(true)
    expect(replayed.ok && stateHash(replayed.state)).toBe(stateHash(a.state))
    // The log's text is canonical, and reads back as the same actions.
    expect(decodeActions(encodeActions(a.record.actions))).toEqual(a.record.actions)
  })

  test('another seed is another court', () => {
    const one = benchLevel('court', 1).slots
    const two = benchLevel('court', 2).slots
    expect(one).not.toEqual(two)
    expect(stateHash(benchInit(benchLevel('court', 1)))).not.toBe(stateHash(benchInit(benchLevel('court', 2))))
  })

  test('the state is small plain data: a level of seeds and flaws, and what was filed, and no rows', () => {
    const state = benchGhost(benchLevel('court', 3))
    expect(JSON.stringify(state).length).toBeLessThan(6000)
  })
})

describe('actions', () => {
  const start = () => benchInit(benchLevel('due', 0))
  const slot = start().level.slots[0]

  test('every seed is in band, because the corpus\'s band is kept inside the case (GAMES.md §2.1)', () => {
    for (const id of LEVEL_IDS) for (const seed of [0, 1, 7, 4_294_967_295]) expect(benchInBand(id, seed)).toBe(true)
    expect(() => benchInBand('rain-and-relay', 0)).toThrow('no level "rain-and-relay"')
    expect(() => benchInBand('due', -1)).toThrow()
    expect(() => benchInBand('due', 2 ** 32)).toThrow()
  })

  test('a level the Inspection does not have is refused, and so is a level that was never dealt', () => {
    expect(() => benchLevel('constructor', 0)).toThrow('no level "constructor"')
    expect(() => benchLevel('', 0)).toThrow()
  })

  test('naming a flaw can be changed until the ruling is filed', () => {
    let s = start()
    s = benchReduce(s, { t: 'flaw', flaw: 'none' })
    s = benchReduce(s, { t: 'flaw', flaw: 'warm-cache' })
    expect(s.picks[0]).toBe('warm-cache')
    expect(benchAsk(s)).toEqual({ caseNo: 1, cases: 1, needs: 'prediction' })
  })

  test('a flaw the court does not know is refused, and leaves the state as it was', () => {
    const before = start()
    expect(() => benchReduce(before, { t: 'flaw', flaw: 'tail-latency' as Flaw })).toThrow('knows no flaw')
    expect(() => benchReduce(before, { t: 'flaw', flaw: 'constructor' as Flaw })).toThrow('knows no flaw')
    expect(before.picks[0]).toBeNull()
  })

  test('a prediction is whole positive microseconds, and the range holds the p99', () => {
    const s = start()
    const bad: [number, number, number, string][] = [
      [0, 0, 1, 'at least one'],
      [1.5, 1, 2, 'whole number'],
      [Number.NaN, 1, 2, 'whole number'],
      [100, 200, 300, 'must hold the p99'],
      [100, 50, 90, 'must hold the p99'],
      [2_000_000_000_000, 1, 3_000_000_000_000, 'more than eleven days'],
    ]
    for (const [p99Us, loUs, hiUs, why] of bad) expect(() => benchReduce(s, { t: 'predict', p99Us, loUs, hiUs })).toThrow(why)
    expect(benchReduce(s, { t: 'predict', p99Us: 100, loUs: 100, hiUs: 100 }).predictions[0]).toEqual({ p99Us: 100, loUs: 100, hiUs: 100 })
  })

  test('filing needs a flaw and a prediction, and says which is missing', () => {
    expect(() => benchReduce(start(), { t: 'submit' })).toThrow('name a flaw')
    const named = benchReduce(start(), { t: 'flaw', flaw: slot.flaw })
    expect(() => benchReduce(named, { t: 'submit' })).toThrow('write down a p99')
  })

  test('the sheet is an action too, and a sheet the board does not have is refused', () => {
    expect(benchReduce(start(), { t: 'view', v: 'timeline' }).tab).toBe('timeline')
    expect(start().tab).toBe('histogram')
    expect(() => benchReduce(start(), { t: 'view', v: 'tail' as 'rows' })).toThrow('no sheet')
  })

  test('an action the Inspection does not have is refused', () => {
    expect(() => benchReduce(start(), { t: 'bribe' } as never)).toThrow('no action "bribe"')
  })

  test('no action follows the last ruling', () => {
    const done = benchGhost(benchLevel('due', 0))
    expect(() => benchReduce(done, { t: 'view', v: 'rows' })).toThrow('has risen')
    const run = play('due', 0, rightAnswer)
    expect(() => applyAction(benchSession, run, { t: 'view', v: 'rows' })).toThrow('over')
  })
})

describe('the court judges at the filing and tells nothing until it has risen', () => {
  test('on a court, the view of case 2 carries no ruling of case 1, and the debrief carries all of them', () => {
    let run = startRun(benchSession, { game: 'broken-bench', level: 'court', seed: 0 })
    for (const action of filing(rightAnswer(run.state.level.slots[0]))) run = applyAction(benchSession, run, action)
    const view = benchView(run.state)
    expect(view.done).toBe(false)
    expect(view.caseNo).toBe(2)
    expect(view.filed).toBe(1)
    expect(view.rulings).toBeNull()
    expect(run.state.rulings[0]).not.toBeNull()
    expect(JSON.stringify(view)).not.toContain(run.state.level.slots[0].flaw)
    const finished = play('court', 0, rightAnswer)
    expect(benchView(finished.state).rulings).toHaveLength(5)
  })

  test('the scene on the board never carries the flaw, the answer, the stall or the cold start', () => {
    for (const id of LEVEL_IDS) {
      const state = benchInit(benchLevel(id, 0))
      const scene = benchView(state).scene
      expect(scene).not.toBeNull()
      const text = JSON.stringify({ ...scene, rows: undefined })
      expect(text).not.toContain('stalls')
      expect(text).not.toContain('slowdownPermille')
      expect(Object.keys(scene ?? {})).not.toContain('flaw')
      const built = caseOf(state.level.slots[0])
      expect(text).not.toContain(String(built.truth.correction.p99Us))
    }
  })

  test('the ruling holds the true flaw and the recomputed number once the run is over', () => {
    const slot = benchLevel('warm', 0).slots[0]
    const wrong = play('warm', 0, () => ({ flaw: FLAW_OTHER(slot.flaw), p99Us: 1000, loUs: 900, hiUs: 1100 }))
    const [ruling] = benchView(wrong.state).rulings ?? []
    expect(ruling.trueFlaw).toBe(slot.flaw)
    expect(ruling.named).toBe(FLAW_OTHER(slot.flaw))
    expect(ruling.flawOk).toBe(false)
    expect(ruling.right).toBe(false)
    expect(ruling.truth.p99Us).toBe(caseOf(slot).truth.correction.p99Us)
  })
})

describe('grade and debrief', () => {
  test('one case of one: right on the flaw, the number and the range passes, and anything less does not', () => {
    const ghost = benchGhost(benchLevel('due', 0))
    const right = play('due', 0, rightAnswer)
    expect(benchGrade(right.state, ghost)).toEqual({ score: 1, ok: true })
    const wrongFlaw = play('due', 0, (slot) => ({ ...rightAnswer(slot), flaw: FLAW_OTHER(slot.flaw) }))
    expect(benchGrade(wrongFlaw.state, ghost)).toEqual({ score: 0, ok: false })
    const wrongNumber = play('due', 0, (slot) => {
      const a = rightAnswer(slot)
      return { ...a, p99Us: Math.round(a.p99Us * 1.5), hiUs: Math.round(a.p99Us * 1.6) }
    })
    expect(benchGrade(wrongNumber.state, ghost)).toEqual({ score: 0, ok: false })
    const wideRange = play('due', 0, (slot) => {
      const a = rightAnswer(slot)
      return { ...a, loUs: Math.round(a.p99Us / 2), hiUs: a.p99Us * 2 }
    })
    expect(benchGrade(wideRange.state, ghost)).toEqual({ score: 0, ok: false })
  })

  test('the court passes at four cases of five, and the score is the share of cases that stood', () => {
    const level = benchLevel('court', 0)
    const ghost = benchGhost(level)
    const missing = (n: number) => play('court', 0, (slot, at) => (at < n ? { ...rightAnswer(slot), flaw: FLAW_OTHER(slot.flaw) } : rightAnswer(slot)))
    expect(benchGrade(missing(0).state, ghost)).toEqual({ score: 1, ok: true })
    expect(benchGrade(missing(1).state, ghost)).toEqual({ score: 0.8, ok: true })
    expect(benchGrade(missing(2).state, ghost)).toEqual({ score: 0.6, ok: false })
    expect(benchGrade(missing(5).state, ghost)).toEqual({ score: 0, ok: false })
  })

  test('the debrief names the first case that did not stand, and the flaw that was worth the most, in words without a digit', () => {
    const level = benchLevel('court', 0)
    const ghost = benchGhost(level)
    const slots = level.slots
    const run = play('court', 0, (slot, at) => (at === 2 ? { ...rightAnswer(slot), flaw: FLAW_OTHER(slot.flaw) } : rightAnswer(slot)))
    const debrief = benchDebrief(run.state, ghost)
    expect(debrief.names).toEqual({ lever: slots[2].flaw })
    expect(debrief.sentence).toContain('the third case')
    expect(debrief.sentence).toMatch(/^The court passed you/)
    expect(debrief.sentence).not.toMatch(/\d/)
    for (const id of LEVEL_IDS) expect(benchDebrief(benchGhost(benchLevel(id, 0)), benchGhost(benchLevel(id, 0))).sentence).not.toMatch(/\d/)
  })

  test('a single case that stands opens its sentence on what the learner did, since the ticket\'s heading already says the ruling stands', () => {
    // Seeds 0 and 1 deal each single-case level both of its flaws: `warm` and `sure` deal the fair inspection on seed 1.
    const sentences = (['due', 'warm', 'sure'] as const).flatMap((id) =>
      [0, 1].map((seed) => {
        const ghost = benchGhost(benchLevel(id, seed))
        return [id, seed, ghost.level.slots[0].flaw, benchDebrief(ghost, ghost).sentence] as const
      }),
    )
    expect(sentences.filter(([, , flaw]) => flaw === 'none')).toHaveLength(2)
    for (const [id, seed, flaw, sentence] of sentences) {
      expect([id, seed, /^You (named|found no flaw)\b/.test(sentence)]).toEqual([id, seed, true])
      expect([id, seed, flaw, /\bruling (stood|stands)\b/i.test(sentence)]).toEqual([id, seed, flaw, false])
    }
  })

  test('a number that is right with a range that is not names the range', () => {
    const level = benchLevel('sure', 0)
    const ghost = benchGhost(level)
    const run = play('sure', 0, (slot) => {
      const a = rightAnswer(slot)
      return { ...a, loUs: Math.round(a.p99Us * 0.5), hiUs: Math.round(a.p99Us * 3) }
    })
    expect(benchDebrief(run.state, ghost).names).toEqual({ lever: 'interval' })
  })

  test('the counts are the share of each part that stood, and the score is the interval scores added', () => {
    const level = benchLevel('court', 0)
    const run = play('court', 0, (slot, at) => (at === 0 ? { ...rightAnswer(slot), p99Us: 1, loUs: 1, hiUs: 1 } : rightAnswer(slot)))
    const counts = benchCounts(run.state)
    expect(counts).toMatchObject({ cases: 5, filed: 5, flawsRight: 5, numbersRight: 4, intervalsRight: 4, casesRight: 4 })
    expect(counts.scoreMilli).toBeGreaterThan(benchCounts(benchGhost(level)).scoreMilli)
  })
})

describe('the shell\'s run: replay, regrade and undo', () => {
  test('a finished run is graded from its log alone, and an edited score changes nothing', () => {
    const run = play('due', 0, rightAnswer)
    const finished = finishRun(benchSession, run)
    expect(finished?.grade).toEqual({ score: 1, ok: true })
    const stored = { ...run.record, score: 0, ok: false }
    const graded = regrade(benchSession, stored)
    expect(graded.valid).toBe(true)
    if (graded.valid) {
      expect(graded.grade).toEqual({ score: 1, ok: true })
      expect(graded.storedMatches).toBe(false)
    }
  })

  test('a log that stops early has no grade, and one that edits itself into another run does not replay', () => {
    const run = play('court', 0, rightAnswer)
    const early = { ...run.record, actions: run.record.actions.slice(0, 7) }
    expect(regrade(benchSession, early)).toMatchObject({ valid: false })
    const forged = { ...run.record, actions: [{ t: 'flaw', flaw: 'nonsense' }, ...run.record.actions] }
    expect(regrade(benchSession, forged)).toMatchObject({ valid: false })
  })

  test('undo takes the last action back by replaying the log without it', () => {
    let run = startRun(benchSession, { game: 'broken-bench', level: 'court', seed: 0 })
    const actions = filing(rightAnswer(run.state.level.slots[0]))
    for (const action of actions) run = applyAction(benchSession, run, action)
    expect(run.state.at).toBe(1)
    run = undoAction(benchSession, run)
    expect(run.state.at).toBe(0)
    expect(run.state.rulings[0]).toBeNull()
    expect(run.state.predictions[0]).not.toBeNull()
  })
})
