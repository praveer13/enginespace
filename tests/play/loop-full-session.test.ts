/*
 * The full service's session (GAMES.md §2.5, §3.2): the contract around TR2's levels and TR6's mask lane, played as a learner plays them:
 * the prediction first, then the levers, then the bell through the night the sim serves; a stage closes on a night at the bar or on its
 * third night; the house is the ghost; the grade is each stage's best night against the house's; and a run replays from its log through
 * the game's one session (packages/play/loop/game.ts) to the same state.
 */
import { describe, expect, test } from 'bun:test'
import { applyAction, finishRun, startRun, stateHash } from '@es/play'
import { serviceSession } from '@es/play/loop/game'
import { FULL_SERVICE } from '@es/play/loop/entry'
import { buildFullLevel, FULL_LEVEL_IDS, NIGHTS_PER_STAGE } from '@es/play/loop/full/levels'
import { nightOf } from '@es/play/loop/full/night'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullState } from '@es/play/loop/full/types'
import { seeds } from '../seeds'

const play = (state: FullState, ...actions: FullAction[]): FullState => actions.reduce((s, a) => fullSession.reduce(s, a), state)
const start = (id: string, seed = 0): FullState => fullSession.init(fullSession.level(id, seed))
/** A level's pinned practice seed: the registry's. */
const practiceSeedOf = (id: string): number => FULL_SERVICE.find((level) => level.id === id)?.practiceSeed ?? 0
/** The seeds a search for a night of a kind walks, from the knob (tests/seeds.ts); it stops at the first. */
const SEEDS = seeds(0)

describe('a stage, in order', () => {
  test('the prediction comes first: the bell does not ring before it, and it is called once', () => {
    const s = start('async')
    expect(fullSession.ask(s)).toEqual({ kind: 'predict', stage: '70b' })
    expect(() => fullSession.reduce(s, { t: 'run', until: 'step' })).toThrow('commit the prediction before the first night')
    const called = play(s, { t: 'commit', prediction: 12000 })
    expect(fullSession.ask(called)).toEqual({ kind: 'serve', stage: '70b' })
    expect(() => fullSession.reduce(called, { t: 'commit', prediction: 1 })).toThrow('the prediction is committed already')
    expect(() => fullSession.reduce(s, { t: 'commit', prediction: -1 })).toThrow('a whole number of at least 0')
    expect(() => fullSession.reduce(start('mask'), { t: 'commit', prediction: 2 })).toThrow('there are 2 choices')
  })

  test('the bell rings the night fire by fire, and `decision` rings it to its end; both serve the same night', () => {
    let byStep = play(start('async'), { t: 'commit', prediction: 0 })
    const night = nightOf(byStep.level.stages[0], byStep.stages[0].levers)!
    for (let i = 0; i < night.fires.length; i++) {
      expect(fullSession.ask(byStep)?.kind ?? null).toBe(i === 0 ? 'serve' : null)
      byStep = play(byStep, { t: 'run', until: 'step' })
      expect(fullSession.view(byStep).step).toBe(i + 1)
    }
    const byDecision = play(start('async'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'decision' })
    expect(byStep.stages[0].served).toEqual(byDecision.stages[0].served)
    expect(byDecision.stages[0].served).toEqual([{ levers: byDecision.stages[0].levers, metric: night.metric, ok: false }])
    expect(fullSession.ask(byDecision)).toEqual({ kind: 'serve', stage: '70b' })
  })

  test('a lever is the stage\'s own: one it does not have is refused, and so is a capture on a stage with no rack', () => {
    const s = play(start('async'), { t: 'commit', prediction: 0 })
    expect(() => fullSession.reduce(s, { t: 'lever', name: 'runner', value: 'v1' })).toThrow('the 70b stage has no lever "runner"')
    expect(() => fullSession.reduce(s, { t: 'capture', sizes: [1] })).toThrow('the 70b stage has no mold rack')
    expect(() => fullSession.reduce(s, { t: 'lever', name: 'async', value: 'on' })).toThrow('the async lever is on or off')
    expect(() => fullSession.reduce(s, { t: 'stage', to: 'comb' })).toThrow('the level has no stage "comb"')
    expect(() => fullSession.reduce(s, { t: 'run', until: 'forever' as 'step' })).toThrow('run until "step" or "decision"')
  })

  test('the rack holds at most its molds, each once and in order, from the ladder', () => {
    const s = play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 })
    expect(play(s, { t: 'capture', sizes: [3, 7, 12] }).stages[1].levers.captureSizes).toEqual([3, 7, 12])
    expect(() => fullSession.reduce(s, { t: 'capture', sizes: [1, 2, 3, 4] })).toThrow('the rack holds at most 3 molds')
    expect(() => fullSession.reduce(s, { t: 'capture', sizes: [7, 3] })).toThrow('ascending order')
    expect(() => fullSession.reduce(s, { t: 'capture', sizes: [13] })).toThrow('there is no mold of 13')
  })

  test('a lever moved in the middle of a night puts that night aside; the next ring serves anew with the levers as they are', () => {
    let s = play(start('async'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' })
    expect(s.stages[0].night?.fires).toBe(2)
    s = play(s, { t: 'lever', name: 'async', value: true })
    expect(s.stages[0].night).toBeNull()
    s = play(s, { t: 'run', until: 'step' })
    expect(s.stages[0].night).toEqual({ levers: s.stages[0].levers, fires: 1 })
    expect(s.stages[0].night?.levers.async).toBe(true)
  })

  test('a mode whose routines leave the night no room does not serve: the bell does not ring it, and the panel says why', () => {
    for (const seed of SEEDS) {
      const level = buildFullLevel('graphs', seed)
      const modes = level.stages[2]
      if (modes.house.graphMode !== 'FULL_DECODE_ONLY') continue
      const s = play(fullSession.init(level), { t: 'stage', to: 'modes' }, { t: 'commit', prediction: 0 }, { t: 'lever', name: 'graphMode', value: 'FULL' })
      const view = fullSession.view(s)
      expect(view.canFire).toBe(false)
      expect(view.stage.resolved.mode).toBeNull()
      expect(view.stage.resolved.changes[view.stage.resolved.changes.length - 1]).toContain('more memory than the reach-in can spare')
      expect(view.stage.memory!.bytes).toBeGreaterThan(view.stage.memory!.budget)
      expect(() => fullSession.reduce(s, { t: 'run', until: 'step' })).toThrow('this mode does not serve tonight')
      return
    }
    throw new Error(`no seed of the first ${SEEDS.length} draws a night with room for decode graphs alone`)
  })
})

describe('closing the stages', () => {
  test('a night at the bar closes its stage; three nights close it anyway, and the level is over when every stage is closed', () => {
    let s = play(start('async'), { t: 'commit', prediction: 0 })
    for (let night = 1; night <= NIGHTS_PER_STAGE; night++) {
      expect(fullSession.done(s)).toBe(false)
      s = play(s, { t: 'run', until: 'decision' })
      expect(s.stages[0].served).toHaveLength(night)
    }
    expect(() => fullSession.reduce(s, { t: 'run', until: 'step' })).toThrow('this stage is over')
    expect(fullSession.view(s).stages[0]).toMatchObject({ closed: true, passed: false })
    s = play(s, { t: 'stage', to: 'small' }, { t: 'commit', prediction: 0 }, { t: 'lever', name: 'async', value: true }, { t: 'run', until: 'decision' })
    expect(fullSession.view(s).stages[1]).toMatchObject({ closed: true, passed: true })
    expect(fullSession.done(s)).toBe(true)
    expect(fullSession.ask(s)).toBeNull()
  })
})

describe('the house, the grade and the debrief', () => {
  test.each(FULL_LEVEL_IDS.map((id) => [id]))('%s: the house finishes, passes its own bar with a score of 1, and is the same twice', (id) => {
    const level = fullSession.level(id, practiceSeedOf(id))
    const ghost = fullSession.ghost(level)
    expect(fullSession.done(ghost)).toBe(true)
    expect(fullSession.grade(ghost, ghost)).toEqual({ score: 1, ok: true })
    expect(stateHash(ghost)).toBe(stateHash(fullSession.ghost(fullSession.level(id, practiceSeedOf(id)))))
    expect(fullSession.debrief(ghost, ghost).names).toBeNull()
  })

  test.each(FULL_LEVEL_IDS.map((id) => [id]))('%s: a learner who serves the naive configuration until the stage closes fails, and the debrief names the lever', (id) => {
    const level = fullSession.level(id, practiceSeedOf(id))
    let s = fullSession.init(level)
    for (const stage of level.stages) {
      s = play(s, { t: 'stage', to: stage.id }, { t: 'commit', prediction: 0 })
      for (let night = 0; night < stage.nights && !s.stages[s.at].served.some((n) => n.ok); night++) s = play(s, { t: 'run', until: 'decision' })
    }
    expect(fullSession.done(s)).toBe(true)
    const grade = fullSession.grade(s, fullSession.ghost(level))
    expect(grade.ok).toBe(false)
    expect(grade.score).toBeLessThan(1)
    const debrief = fullSession.debrief(s, fullSession.ghost(level))
    const missed = level.stages.find((_, i) => !s.stages[i].served.some((n) => n.ok))!
    // A practice stage names its lever; the graded stage weighs each lever from the configuration served, and names the one worth the most.
    if (missed.bar === 'throughput') expect(['async', 'graphMode', 'capture', 'runner']).toContain((debrief.names as { lever: string }).lever)
    else expect(debrief.names).toEqual({ lever: missed.levers[0] })
    expect(debrief.sentence).toContain(missed.title)
  })
})

describe('the view: the kitchen of the night at the bell', () => {
  test('every ticket keeps its clip from its first fire to its last; a binned plate is a ticket\'s last row; with async on, the latest fire is on the fired rail', () => {
    let s = play(start('async'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'async', value: true })
    const clipOf = new Map<number, number>()
    for (let fire = 1; fire <= 30; fire++) {
      s = play(s, { t: 'run', until: 'step' })
      const view = fullSession.view(s)
      const latest = view.fires[view.fires.length - 1]
      latest.places.forEach((place, clip) => {
        if (place.req === null) return
        const was = clipOf.get(place.req)
        if (was !== undefined) expect([place.req, clip]).toEqual([place.req, was])
        clipOf.set(place.req, clip)
      })
      expect(view.firedRail?.map((clip) => clip.req)).toEqual(latest.places.map((place) => place.req))
      expect(latest.onLine).toBe(true)
      expect(view.counters.clockUs).toBe(latest.endUs)
    }
    const view = fullSession.view(play(s, { t: 'run', until: 'decision' }))
    expect(view.nightOver).toBe(true)
    expect(view.firedRail).toBeNull()
    const binned = view.fires.flatMap((fire) => fire.places.filter((place) => place.state === 'binned'))
    expect(binned.length).toBe(view.counters.ghostTokens)
    expect(view.counters.ghostTokens).toBeGreaterThan(0)
    expect(view.counters.tpotP50Us).toBeGreaterThan(0)
  })

  test('the comb, the rack and the allergy card are on the stages that have them, from the latest fire', () => {
    const comb = fullSession.view(play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' }))
    expect(comb.comb).toEqual({ layers: 28, calls: 336, perLayer: 12, mode: 'NONE' })
    expect(comb.rack).toBeNull()
    const graphs = fullSession.view(play(start('graphs'), { t: 'commit', prediction: 0 }, { t: 'lever', name: 'graphMode', value: 'FULL_AND_PIECEWISE' }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' }))
    expect(graphs.comb?.mode).toBe('FULL')
    expect(graphs.comb?.calls).toBe(1)
    expect(graphs.rack?.sizes).toEqual(graphs.levers.captureSizes)
    expect(graphs.rack?.picked).not.toBeNull()
    expect(graphs.allergy).toBeNull()
    const mask = fullSession.view(play(start('mask'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' }))
    expect(mask.allergy?.overlap).toBe(false)
    expect(mask.allergy?.fillUs).toBeGreaterThan(0)
  })

  test('µs on the model\'s clock: the small card is synthetic, the 70B card is not, and the tag follows', () => {
    const big = fullSession.view(start('async'))
    expect([big.unit, big.synthetic, big.tag]).toEqual(['µs', false, 'derived'])
    const small = fullSession.view(play(start('async'), { t: 'stage', to: 'small' }))
    expect([small.unit, small.synthetic, small.tag]).toEqual(['µs', true, 'estimated'])
  })
})

describe('the record', () => {
  test.each(FULL_LEVEL_IDS.map((id) => [id]))('%s: a run replays from its log through the game\'s one session to the same state', (id) => {
    let run = startRun(serviceSession, { game: 'loop', level: id, seed: practiceSeedOf(id) })
    const level = fullSession.level(id, practiceSeedOf(id))
    for (const stage of level.stages) {
      for (const action of [{ t: 'stage', to: stage.id }, { t: 'commit', prediction: stage.answer }] as FullAction[]) run = applyAction(serviceSession, run, action)
      for (const lever of stage.levers) {
        if (lever === 'capture') run = applyAction(serviceSession, run, { t: 'capture', sizes: stage.house.captureSizes } as FullAction)
        else if (lever === 'graphMode') run = applyAction(serviceSession, run, { t: 'lever', name: 'graphMode', value: stage.house.graphMode } as FullAction)
        else if (lever === 'runner') run = applyAction(serviceSession, run, { t: 'lever', name: 'runner', value: stage.house.runner } as FullAction)
        else run = applyAction(serviceSession, run, { t: 'lever', name: lever, value: stage.house[lever] } as FullAction)
      }
      run = applyAction(serviceSession, run, { t: 'run', until: 'decision' } as FullAction)
    }
    const finished = finishRun(serviceSession, run)
    expect(finished?.grade).toEqual({ score: 1, ok: true })
    let replayed = fullSession.init(level)
    for (const action of run.record.actions) replayed = fullSession.reduce(replayed, action as FullAction)
    expect(stateHash(replayed)).toBe(finished?.hash)
  })
})
