/*
 * Back of House's session (`engine-floor`, GAMES.md §2.5, §5 "Simulation API"; W1-T17): the contract every game keeps, the rules of the
 * actions, what a run does to the view, the scoring that reads the first stage that did not hold, and the replay that is the grade
 * (A§6.3: "grading replays the actions through the pure reducer").
 *
 * The first group fixes the world the session plays in, level by level, with the state hash of each house run: the same seed and the
 * same actions give the same hash in Bun and in every browser (D-017, e2e/engine-floor.spec.ts runs it in the page).
 */
import { describe, expect, test } from 'bun:test'
import { drawInBand, regrade, replay, stateHash } from '@es/play'
import type { GameAction } from '@es/play'
import { stopOfMistake } from '@es/play/engine-floor/engine'
import { MAX_PREDICTION } from '@es/play/engine-floor/facts'
import { LEVEL_IDS } from '@es/play/engine-floor/levels'
import { floorAsk, floorDebrief, floorDone, floorGhost, floorGrade, floorInit, floorLevel, floorReduce, floorScore, floorSession, floorView } from '@es/play/engine-floor/session'
import type { FloorAction, Mistake } from '@es/play/engine-floor/types'
import { houseActions, laidTo, levelOf, played, ranTo, truthOf, walk } from './engine-floor-support'

/** The state hash of each level's house run on its practice seed, and of its first state [measured 2026-11-04 at 5ffa2f9, with this task's files]. */
const GOLDENS: Readonly<Record<string, readonly [string, string]>> = {
  nano: ['884637cc', 'b9c916f1'],
  'nano-tp': ['7640f365', '04c263c6'],
  mini: ['cd7b4680', '0f447547'],
  inside: ['c03091bf', 'd2501a43'],
  vllm: ['749e7616', 'ba7e4f27'],
  sglang: ['02e69841', '39310107'],
  abort: ['85db6e4f', 'dca1a4e4'],
}

const vllm = levelOf('vllm')
const wrongAt = (level = vllm, index = 4): FloorAction[] => [
  { t: 'commit', prediction: 2 },
  ...level.reference.slice(0, index).map((stage): FloorAction => ({ t: 'lay', stage })),
  // Skip the stage at `index` and lay the one after it: the engine does not do that next.
  { t: 'lay', stage: level.reference[index + 1] },
]

describe('the contract (GAMES.md §2.5)', () => {
  test('builds each level on its seed, and refuses a level it does not have (the graded `map` is W1-T19\'s)', () => {
    for (const id of LEVEL_IDS) expect(floorLevel(id, 0).id).toBe(id)
    for (const id of ['map', 'constructor', '', 'nano ']) {
      expect(() => floorLevel(id, 0)).toThrow(RangeError)
      expect(() => floorSession.inBand(id, 0)).toThrow(RangeError)
    }
    expect(() => floorLevel('nano', -1)).toThrow()
  })

  test('is deterministic: a level on a seed is the same level, and its first state and its house run have the same hashes everywhere', () => {
    for (const id of LEVEL_IDS) {
      expect(floorLevel(id, 7)).toEqual(floorLevel(id, 7))
      const level = floorLevel(id, 0)
      expect([id, stateHash(floorGhost(level)), stateHash(floorInit(level))]).toEqual([id, ...GOLDENS[id]])
      expect(stateHash(floorGhost(level))).toBe(stateHash(floorGhost(floorLevel(id, 0))))
    }
  })

  test('a state is plain data with a canonical form: it round-trips through JSON, and holds no undefined', () => {
    const state = walk(vllm, ...wrongAt(), { t: 'run' })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    expect(Object.values(state).includes(undefined)).toBe(false)
    expect(() => stateHash(state)).not.toThrow()
  })

  test('starts unfinished and asks for the prediction, with the choices from none to the ceiling', () => {
    const state = floorInit(vllm)
    expect(floorDone(state)).toBe(false)
    expect(floorAsk(state)).toEqual({ kind: 'predict', choices: Array.from({ length: MAX_PREDICTION + 1 }, (_, i) => i) })
    expect(floorView(state).step).toBe('predict')
  })

  test('the house run finishes, passes its own grade, and is what the level says: the engine\'s path laid and run once', () => {
    for (const id of LEVEL_IDS) {
      const level = floorLevel(id, 0)
      const ghost = floorGhost(level)
      expect(floorDone(ghost)).toBe(true)
      expect(floorGrade(ghost, ghost)).toEqual({ score: 1, ok: true })
      expect([id, ghost.laid]).toEqual([id, level.reference])
      expect([id, ghost.prediction]).toEqual([id, truthOf(level.scenario)])
      expect([id, ghost.runs, ghost.mistake, ghost.served]).toEqual([id, 1, null, true])
      expect(floorAsk(ghost)).toBeNull()
    }
  })

  test('is in band on each practice seed, and the band is where seeds are drawn from: a drawn seed is in band, and the same entropy draws the same seed', () => {
    for (const id of LEVEL_IDS) {
      expect(floorSession.inBand(id, 0)).toBe(true)
      const seed = drawInBand(floorSession, id, 0xdeadbeef)
      expect(floorSession.inBand(id, seed)).toBe(true)
      expect(drawInBand(floorSession, id, 0xdeadbeef)).toBe(seed)
    }
  })
})

describe('the actions', () => {
  const level = levelOf('nano')
  const [first, second, third] = level.reference

  test('the prediction is written once, as a whole number from none to the ceiling, and before anything is laid', () => {
    expect(() => walk(level, { t: 'lay', stage: first })).toThrow(RangeError)
    expect(() => walk(level, { t: 'run' })).toThrow(RangeError)
    expect(() => walk(level, { t: 'unlay' })).toThrow(RangeError)
    expect(() => walk(level, { t: 'move', from: 0, by: 1 })).toThrow(RangeError)
    for (const bad of [-1, MAX_PREDICTION + 1, 1.5, Number.NaN]) expect(() => walk(level, { t: 'commit', prediction: bad })).toThrow(RangeError)
    expect(walk(level, { t: 'commit', prediction: 0 }).prediction).toBe(0)
    expect(() => walk(level, { t: 'commit', prediction: 0 }, { t: 'commit', prediction: 1 })).toThrow(RangeError)
  })

  test('lay appends a stage of the tray, once, and records the turn that laid it', () => {
    const state = walk(level, { t: 'commit', prediction: 0 }, { t: 'lay', stage: first }, { t: 'lay', stage: second })
    expect(state.laid).toEqual([first, second])
    expect(state.laidAt).toEqual([1, 2])
    expect(state.turns).toBe(3)
    expect(() => walk(level, { t: 'commit', prediction: 0 }, { t: 'lay', stage: first }, { t: 'lay', stage: first })).toThrow(/already on the path/)
    expect(() => walk(level, { t: 'commit', prediction: 0 }, { t: 'lay', stage: 'vllm.http-request' })).toThrow(/not in the tray/)
  })

  test('unlay takes the last stage off, or takes the path back to a number of stages, and takes the verdict with it', () => {
    const laid = laidTo(level, 5)
    expect(floorReduce(laid, { t: 'unlay' }).laid).toEqual(level.reference.slice(0, 4))
    expect(floorReduce(laid, { t: 'unlay', to: 2 }).laid).toEqual(level.reference.slice(0, 2))
    expect(floorReduce(laid, { t: 'unlay', to: 0 }).laid).toEqual([])
    for (const bad of [5, -1, 1.5]) expect(() => floorReduce(laid, { t: 'unlay', to: bad })).toThrow(RangeError)
    const ran = floorReduce(laid, { t: 'run' })
    expect(ran.ran).toBe(5)
    expect(floorReduce(ran, { t: 'unlay' }).ran).toBe(4)
    expect(floorReduce(ran, { t: 'unlay', to: 1 }).ran).toBe(1)
    expect(() => floorReduce(floorInit(level), { t: 'unlay' })).toThrow(RangeError)
    // A stage taken off is in the tray again, where it was.
    expect(floorView(floorReduce(laid, { t: 'unlay' })).tray.map((tile) => tile.id)).toEqual(level.tray.filter((id) => !level.reference.slice(0, 4).includes(id)))
  })

  test('move swaps a stage with its neighbour, carries the turn that laid it, and takes the verdict below the place it changed', () => {
    const laid = laidTo(level, 4)
    const moved = floorReduce(laid, { t: 'move', from: 1, by: 1 })
    expect(moved.laid).toEqual([first, third, second, level.reference[3]])
    expect(moved.laidAt).toEqual([1, 3, 2, 4])
    expect(floorReduce(moved, { t: 'move', from: 2, by: -1 }).laid).toEqual(laid.laid)
    const ran = floorReduce(laid, { t: 'run' })
    expect(floorReduce(ran, { t: 'move', from: 2, by: 1 }).ran).toBe(2)
    expect(floorReduce(ran, { t: 'move', from: 0, by: 1 }).ran).toBe(0)
    for (const [from, by] of [[0, -1], [3, 1], [4, 1], [-1, 1], [1.5, 1], [1, 2], [1, 0]] as const) {
      expect(() => floorReduce(laid, { t: 'move', from, by: by as -1 | 1 })).toThrow(RangeError)
    }
  })

  test('run needs a stage that no run has judged: a second run of the same path, or of nothing, is refused', () => {
    expect(() => floorReduce(laidTo(level, 0), { t: 'run' })).toThrow(/nothing new to run/)
    const ran = ranTo(level, 3)
    expect(() => floorReduce(ran, { t: 'run' })).toThrow(/nothing new to run/)
    expect(floorReduce(floorReduce(ran, { t: 'lay', stage: level.reference[3] }), { t: 'run' }).runs).toBe(2)
  })

  test('refuses an action it does not have, and every action once the run is over', () => {
    expect(() => floorReduce(laidTo(level, 2), { t: 'fire' } as unknown as FloorAction)).toThrow(/no action "fire"/)
    const done = floorGhost(level)
    for (const action of houseActions(level).slice(0, 3)) expect(() => floorReduce(done, action)).toThrow(/run is over/)
  })
})

describe('what a run does to the view (GAMES.md §5: the capsule moves only as far as the stages hold)', () => {
  test('laid and not run, a stage is pencilled: it shows no source and no owner, the ticket has not moved, and the lamp is at the end of the path', () => {
    const view = floorView(laidTo(vllm, 3))
    expect(view.laid.map((stage) => stage.state)).toEqual(['pending', 'pending', 'pending'])
    expect(view.laid.every((stage) => stage.source === null && stage.owner === null)).toBe(true)
    expect(view.reached).toBe(0)
    expect(view.capsule).toEqual(view.entry)
    expect(view.present).toEqual(view.laid[2].to)
    expect([view.canRun, view.canUnlay, view.step, view.done]).toEqual([true, true, 'lay', false])
    expect(view.tray.length).toBe(vllm.tray.length - 3)
  })

  test('run on a path that holds: the ticket stands at the end of it, each stage shows its source and that it is the engine\'s, and the tray still waits', () => {
    const view = floorView(ranTo(vllm, 9))
    expect(view.laid.map((stage) => stage.state)).toEqual(Array(9).fill('ran'))
    expect(view.reached).toBe(9)
    expect(view.capsule).toEqual(view.laid[8].to)
    expect(view.stop).toBeNull()
    expect(view.mistake).toBeNull()
    expect(view.laid.every((stage) => stage.source !== null && stage.owner === 'vllm')).toBe(true)
    expect([view.canRun, view.done]).toEqual([false, false])
  })

  test('run on a path that does not: the ticket stands before the stage that failed, which is struck and cited, and the stages after it stay pencilled', () => {
    const state = walk(vllm, ...wrongAt(vllm, 4), { t: 'lay', stage: vllm.reference[6] }, { t: 'run' })
    const view = floorView(state)
    expect(view.laid.map((stage) => stage.state)).toEqual(['ran', 'ran', 'ran', 'ran', 'struck', 'pending'])
    expect(view.reached).toBe(4)
    expect(view.stop?.at).toBe(4)
    expect(view.stop?.laid.id).toBe(vllm.reference[5])
    expect(view.stop?.expected?.id).toBe(vllm.reference[4])
    expect(view.laid[4].source).not.toBeNull()
    expect(view.laid[5].source).toBeNull()
    // The next hand-off starts where the ticket was stopped, and not at the end of the stages that have no standing.
    expect(view.capsule).toEqual(view.laid[3].to)
    expect(view.present).toEqual(view.capsule)
    expect(floorAsk(state)).toEqual({ kind: 'lay', at: view.capsule, canRun: false })
  })

  test('the first stage that failed is recorded with the turn that laid it, found again from the engine\'s own path, and kept however the path changes', () => {
    const state = walk(vllm, ...wrongAt(vllm, 4), { t: 'run' })
    expect(state.mistake).toEqual({ index: 4, stage: vllm.reference[5], turn: 5 })
    expect(floorView(state).mistake).toEqual(stopOfMistake(vllm.scenario, state.mistake as Mistake))
    const fixed = walk(vllm, ...wrongAt(vllm, 4), { t: 'run' }, { t: 'unlay', to: 4 }, { t: 'lay', stage: vllm.reference[4] }, { t: 'run' })
    expect(fixed.mistake).toEqual(state.mistake)
    expect(floorView(fixed).stop).toBeNull()
    expect(floorView(fixed).mistake).not.toBeNull()
  })

  test('taking the path back below the run takes the stop with it: nothing is struck, and the lamp is at the end of the path again', () => {
    const state = walk(vllm, ...wrongAt(vllm, 4), { t: 'run' }, { t: 'unlay', to: 4 })
    const view = floorView(state)
    expect(view.stop).toBeNull()
    expect(view.laid.map((stage) => stage.state)).toEqual(['ran', 'ran', 'ran', 'ran'])
    expect(view.present).toEqual(view.laid[3].to)
  })

  test('the whole path held ends the run: the ticket is home, the step is over, and nothing more can be done', () => {
    const view = floorView(floorGhost(vllm))
    expect([view.step, view.done, view.canRun, view.canUnlay]).toEqual(['over', true, false, false])
    expect(view.capsule).toEqual(view.entry)
    expect(view.reached).toBe(view.stages)
  })

  test('shows the pin the stages are read at: the engine, the repository, the commit the course pins and the day it was read', () => {
    expect(floorView(floorInit(vllm)).pin).toEqual({ engine: 'vllm', title: 'vLLM v0.33.0', repo: 'vllm-project/vllm', ref: '4ba787ec9959e566d3b587a796dff07673324da5', readOn: '2026-11-04' })
    expect(floorView(floorInit(levelOf('nano'))).pin.repo).toBe('GeeeekExplorer/nano-vllm')
  })
})

describe('scoring (GAMES.md §5: stages placed correctly before the first wrong one, over the reference\'s stage count)', () => {
  test('a path that held on its first run is flawless: score 1, passed, nothing named', () => {
    const state = floorGhost(vllm)
    expect(floorScore(state)).toEqual({ laid: 22, held: 22, runs: 1, survived: 22, stages: 22 })
    expect(floorDebrief(state)).toEqual({ sentence: expect.stringContaining('Every hand-off held on the first run'), names: null })
  })

  test('a learner who runs a short path often and gets it right loses nothing: the score reads mistakes, and runs make none', () => {
    let state = walk(vllm, { t: 'commit', prediction: 2 })
    for (const stage of vllm.reference) state = floorReduce(floorReduce(state, { t: 'lay', stage }), { t: 'run' })
    expect(floorDone(state)).toBe(true)
    expect(state.runs).toBe(22)
    expect(floorGrade(state, floorGhost(vllm))).toEqual({ score: 1, ok: true })
  })

  test('one mistake costs the stages from where it was: the score is the stages that held before it, over the path, and the level is not passed', () => {
    const mine = walk(vllm, ...wrongAt(vllm, 4), { t: 'run' }, { t: 'unlay', to: 4 }, ...vllm.reference.slice(4).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' })
    expect(floorDone(mine)).toBe(true)
    expect(floorGrade(mine, floorGhost(vllm))).toEqual({ score: 4 / 22, ok: false })
    expect(floorScore(mine)).toMatchObject({ survived: 4, stages: 22, runs: 2 })
  })

  test('the first mistake found is the one that counts: a later one, or one found after the path was reordered, does not change it', () => {
    const level = levelOf('mini')
    const stages = level.reference
    const mine = walk(
      level,
      { t: 'commit', prediction: 3 },
      { t: 'lay', stage: stages[0] },
      { t: 'lay', stage: stages[2] },
      { t: 'run' },
      { t: 'unlay', to: 1 },
      ...stages.slice(1, 6).map((stage): FloorAction => ({ t: 'lay', stage })),
      { t: 'move', from: 3, by: 1 },
      { t: 'run' },
    )
    expect(mine.mistake?.index).toBe(1)
    expect(floorGrade({ ...mine, served: true }, floorGhost(level))).toEqual({ score: 1 / stages.length, ok: false })
  })

  test('the debrief names the lay that put the first wrong stage there, by its place in the log, and says why in the stop\'s own words', () => {
    const actions = [...wrongAt(vllm, 4), { t: 'run' } as const]
    const mine = walk(vllm, ...actions)
    const debrief = floorDebrief(mine)
    expect(debrief.names).toEqual({ turn: 5 })
    expect(actions[5]).toEqual({ t: 'lay', stage: vllm.reference[5] })
    expect(debrief.sentence).toContain('The first stage that did not hold.')
    expect(debrief.sentence).toBe(`The first stage that did not hold. ${stopOfMistake(vllm.scenario, mine.mistake as Mistake).sentence}`)
  })

  test('a level that allows one run ends on it, whatever it found: a path that held and stopped short is not passed, and the score is how far it got', () => {
    const once = { ...vllm, attempts: 1 }
    const short = walk(once, { t: 'commit', prediction: 2 }, ...once.reference.slice(0, 6).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' })
    expect(floorDone(short)).toBe(true)
    expect(short.served).toBe(false)
    expect(floorGrade(short, floorGhost(once))).toEqual({ score: 6 / 22, ok: false })
    expect(floorDebrief(short).sentence).toContain('stopped short')
    expect(() => floorReduce(short, { t: 'unlay' })).toThrow(/run is over/)
    const wrong = walk(once, ...wrongAt(once, 3), { t: 'run' })
    expect(floorDone(wrong)).toBe(true)
    expect(floorGrade(wrong, floorGhost(once))).toEqual({ score: 3 / 22, ok: false })
    expect(floorGrade(floorGhost(once), floorGhost(once))).toEqual({ score: 1, ok: true })
  })

  test('the grade is always a score in [0, 1] and a yes or no, whatever the path', () => {
    for (const mine of [floorGhost(vllm), walk(vllm, ...wrongAt(vllm, 0), { t: 'run' }), walk(vllm, ...wrongAt(vllm, 9), { t: 'run' })]) {
      const grade = floorGrade(mine, floorGhost(vllm))
      expect(grade.score).toBeGreaterThanOrEqual(0)
      expect(grade.score).toBeLessThanOrEqual(1)
      expect(typeof grade.ok).toBe('boolean')
    }
  })
})

describe('the log is the record (A§6.3, ASSESSMENT §4.3)', () => {
  test('replaying a played run gives the state it was played to, and grading it gives the grade, from the log alone', () => {
    const run = played('vllm', houseActions(vllm))
    const replayed = replay(floorSession, run.record)
    expect(replayed.ok && replayed.finished).toBe(true)
    const graded = regrade(floorSession, run.record)
    expect(graded.valid && graded.grade).toEqual({ score: 1, ok: true })
    expect(graded.valid && graded.hash).toBe(stateHash(run.state))
  })

  test('an edited score changes nothing: the stored result is read only to say whether it still matches', () => {
    const run = played('nano', houseActions(levelOf('nano')))
    expect(regrade(floorSession, { ...run.record, score: 1, ok: true })).toMatchObject({ valid: true, storedMatches: true })
    expect(regrade(floorSession, { ...run.record, score: 0.2, ok: false })).toMatchObject({ valid: true, grade: { score: 1, ok: true }, storedMatches: false })
  })

  test('a log that does not replay earns nothing, and says which action it was: a stage not in the tray, a lay before the prediction, an action after the end', () => {
    const level = levelOf('nano')
    const base = { game: 'engine-floor', level: 'nano', seed: 0 }
    const bad = (actions: GameAction[]) => regrade(floorSession, { ...base, actions })
    expect(bad([{ t: 'lay', stage: level.reference[0] }])).toMatchObject({ valid: false, at: 0 })
    expect(bad([{ t: 'commit', prediction: 0 }, { t: 'lay', stage: 'vllm.http-request' }])).toMatchObject({ valid: false, at: 1 })
    expect(bad([...houseActions(level), { t: 'run' }])).toMatchObject({ valid: false, at: houseActions(level).length })
    expect(bad(houseActions(level).slice(0, 4))).toMatchObject({ valid: false, reason: 'the log stops before the run is over, so it has no grade' })
  })

  test('the same log on the same seed is the same run in every replay, and another seed is another tray', () => {
    const actions = houseActions(levelOf('mini'))
    const a = played('mini', actions)
    const b = played('mini', actions)
    expect(stateHash(a.state)).toBe(stateHash(b.state))
    expect(stateHash(floorInit(floorLevel('mini', 1)))).not.toBe(stateHash(floorInit(floorLevel('mini', 0))))
  })
})
