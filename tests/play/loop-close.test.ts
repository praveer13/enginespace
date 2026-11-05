/*
 * W1-T14: Service's `close` level, TR2's graded "toggled until the bubbles close" (GAMES.md §3.2, TR2 §5, ASSESSMENT §4.3). The tests hold the
 * level to what the task and ASSESSMENT say of it:
 *   - the bar is ASSESSMENT's: zero dependency violations, and useful tokens per GPU-ms at least 97% of the reference's (acceptance 3);
 *   - "everything on" fails graded seeds, through the memory budget (acceptance 2);
 *   - on the seeds a draw serves, the naive configuration misses the bar and the house meets it, the naive night loses a fifth of its clock and
 *     the house's loses at most three per cent (GAMES.md §3.2's band), and no habit passes more than 15% of single seeds (ASSESSMENT §4.1);
 * and the session around it: one night a seed, closed-book, graded by replay, with a debrief that names the lever worth the most.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { applyAction, finishRun, startRun, stateHash } from '@es/play'
import { FULL_SERVICE, LOOP } from '@es/play/loop/entry'
import { serviceSession } from '@es/play/loop/game'
import {
  BAR_PERMILLE,
  CLOSE_LADDER,
  closeCards,
  darkPermille,
  drawClose,
  DRAWS,
  HOUSE_DARK_PERMILLE,
  houseMenu,
  kneeHouse,
  KNEE_PERMILLE,
  leverWorth,
  meetsThroughput,
  NAIVE_DARK_PERMILLE,
  naiveLevers,
  throughputPermille,
  verdictOf,
} from '@es/play/loop/full/close'
import { buildFullLevel, defaultLevers, inFullBand, stageInBand } from '@es/play/loop/full/levels'
import { CARDS, drawnHost, graphBytes, hostOf, nightOf, resolvedMode, servingMode } from '@es/play/loop/full/night'
import { fullSession, nightMeetsBar } from '@es/play/loop/full/session'
import type { FullAction, FullState, Levers, StageWorld } from '@es/play/loop/full/types'
import { hostPreset } from '@es/sim/host'
import { gpuLayers } from '@es/sim/steploop'
import { seeds } from '../seeds'

// The level builds a night and a menu of nights for each seed it is asked about, and a loaded host takes several seconds for two hundred.
setDefaultTimeout(120_000)

const SEEDS = seeds(0)
const stageOf = (seed: number): StageWorld => buildFullLevel('close', seed).stages[0]
const BANDED = SEEDS.filter((seed) => inFullBand('close', seed))
const play = (state: FullState, ...actions: FullAction[]): FullState => actions.reduce((s, a) => fullSession.reduce(s, a), state)

/** The configuration with every switch on: async scheduling, the ids on the line, MRV2, the mode with the most routines, and a routine at every size the panel offers. */
const everythingOn = (stage: StageWorld): Levers => ({
  async: true,
  inputIds: 'device',
  graphMode: 'FULL_AND_PIECEWISE',
  captureSizes: [...(stage.ladder ?? [])],
  runner: 'mrv2',
  maskOverlap: true,
})

const pct = (part: number, whole: number) => `${((100 * part) / whole).toFixed(1)}%`

describe('the registry\'s record of close', () => {
  test('is a graded level of Service, between the V2 runner and the allergy card, with one stage and a practice seed that is in band', () => {
    const entry = FULL_SERVICE.find((level) => level.id === 'close')
    expect(entry).toEqual({ id: 'close', title: 'Close the bubbles', graded: true, practiceSeed: 16, stages: ['close'] })
    expect(FULL_SERVICE.map((level) => level.id)).toEqual(['async', 'graphs', 'mrv2', 'close', 'mask'])
    expect(LOOP.levels.find((level) => level.id === 'close')).toBe(entry)
    expect(inFullBand('close', entry!.practiceSeed)).toBe(true)
    // The first graded level of the game: the KCs its levers are about are the game's now.
    expect(LOOP.kcs).toEqual(expect.arrayContaining(['tr2.bubble', 'tr2.async-overlap', 'tr2.mrv2-delta', 'tr2.graph-modes', 'tr2.graph-memory']))
  })
})

describe('the pass bar is ASSESSMENT §4.3\'s: zero dependency violations, and useful tokens per GPU-ms at least 97% of the house\'s (acceptance 3)', () => {
  const world = { houseMetric: 100_000, houseTokens: 3_000 } as const

  test('is 97% exactly, in integers: a night at the line passes, and one µs of clock more does not', () => {
    expect(BAR_PERMILLE).toBe(970)
    // Tokens equal the house's: the clock may be at most 100/97 of the house's.
    const limit = Math.floor((100_000 * 100) / 97)
    expect(limit).toBe(103_092)
    expect(meetsThroughput(world, 3_000, limit, 0)).toBe(true)
    expect(meetsThroughput(world, 3_000, limit + 1, 0)).toBe(false)
    // The bar is a ratio of tokens to clock, so fewer tokens in the same clock fail it the same way.
    expect(meetsThroughput(world, 2_910, 100_000, 0)).toBe(true)
    expect(meetsThroughput(world, 2_909, 100_000, 0)).toBe(false)
    // A faster night than the house's passes, and the score caps at 1 elsewhere.
    expect(meetsThroughput(world, 3_000, 90_000, 0)).toBe(true)
    expect(throughputPermille(world, 3_000, 100_000, 0)).toBe(1000)
    expect(throughputPermille(world, 3_000, limit, 0)).toBe(970)
    expect(throughputPermille(world, 3_000, limit + 1, 0)).toBe(969)
  })

  test('a night that breaks the dependency fails whatever its speed, and a night the engine did not start never meets it', () => {
    expect(meetsThroughput(world, 3_000, 1_000, 1)).toBe(false)
    expect(throughputPermille(world, 3_000, 1_000, 1)).toBe(0)
    expect(meetsThroughput(world, 3_000, 0, 0)).toBe(false)
  })

  test('the stage says so: it is judged by throughput, serves one night, and is closed-book', () => {
    for (const seed of BANDED.slice(0, 20)) {
      const stage = stageOf(seed)
      expect([stage.bar, stage.nights, stage.sealed, stage.metric]).toEqual(['throughput', 1, true, 'clock'])
      expect(stage.levers).toEqual(['async', 'inputIds', 'runner', 'graphMode', 'capture'])
    }
  })

  test('async scheduling with the ids written by hand reads a token before it is sampled on every seed, and the night scores nothing, however fast', () => {
    let checked = 0
    for (const seed of BANDED.slice(0, 60)) {
      const stage = stageOf(seed)
      const night = nightOf(stage, { ...stage.house, inputIds: 'host' })
      expect(night).not.toBeNull()
      expect(night!.violations).toBeGreaterThan(0)
      expect(nightMeetsBar(stage, night!)).toBe(false)
      expect(throughputPermille(stage, night!.usefulTokens, night!.clockUs, night!.violations)).toBe(0)
      // The same night with the ids on the line breaks nothing: the house.
      expect(nightOf(stage, stage.house)!.violations).toBe(0)
      // Written by hand with async scheduling off, nothing is read early: the dependency is only broken by overlapping the plan.
      expect(nightOf(stage, { ...stage.house, async: false, inputIds: 'host' })!.violations).toBe(0)
      checked += 1
    }
    expect(checked).toBe(60)
  })
})

describe('"everything on" fails graded seeds, through the memory budget (acceptance 2)', () => {
  test('on the seeds a draw serves, the engine would not start: the routines of every size take more memory than the reach-in has room for', () => {
    let refused = 0
    let hostPoor = 0
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      const levers = everythingOn(stage)
      const mode = resolvedMode(stage.support, levers).mode ?? 'NONE'
      const bytes = graphBytes(stage, levers, mode)
      const night = nightOf(stage, levers)
      if (night === null) {
        refused += 1
        expect(bytes).toBeGreaterThan(stage.graphBudget ?? 0)
        expect(servingMode(stage, levers).changes.at(-1)).toContain('more memory than the reach-in can spare')
      } else hostPoor += nightMeetsBar(stage, night) ? 1 : 0
    }
    console.log(`everything on: the engine would not start on ${refused} of ${BANDED.length} served seeds (${pct(refused, BANDED.length)}); it met the bar on ${hostPoor}`)
    expect(refused / BANDED.length).toBeGreaterThan(0.95)
    expect(hostPoor).toBe(0)
  })

  test('and the engine\'s own capture list, with the ids on the line, fails them too: a routine for every size up to twice the rail also takes the room', () => {
    let fails = 0
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      const night = nightOf(stage, defaultLevers(stage.slots, stage.budget))
      if (night === null || !nightMeetsBar(stage, night)) fails += 1
    }
    console.log(`the engine's defaults with the ids on the line fail ${fails} of ${BANDED.length} served seeds (${pct(fails, BANDED.length)})`)
    expect(fails / BANDED.length).toBeGreaterThan(0.95)
  })

  test('the room is what the house takes, to the byte: one routine more does not start, and the house starts', () => {
    for (const seed of BANDED.slice(0, 60)) {
      const stage = stageOf(seed)
      const mode = resolvedMode(stage.support, stage.house).mode ?? 'NONE'
      expect(graphBytes(stage, stage.house, mode)).toBe(stage.graphBudget as number)
      expect(servingMode(stage, stage.house).mode).toBe(mode)
      // A mold above the rail on the rack of a house that has none, or one mold more, takes the room.
      const ladder = stage.ladder ?? []
      const spare = ladder.find((size) => !stage.house.captureSizes.includes(size))!
      const more: Levers = { ...stage.house, graphMode: stage.house.graphMode === 'NONE' ? 'FULL_DECODE_ONLY' : stage.house.graphMode, captureSizes: [...stage.house.captureSizes, spare].sort((a, b) => a - b) }
      const moreBytes = graphBytes(stage, more, resolvedMode(stage.support, more).mode ?? 'NONE')
      if (moreBytes > (stage.graphBudget as number)) expect(nightOf(stage, more)).toBeNull()
    }
  })

  test('padding is paid for in memory: a mold one rung above the rail\'s takes more bytes for its tokens, and past the room the engine does not start', () => {
    let tried = 0
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      // FULL and PIECEWISE drill a graph at every size they are given, so a bigger mold takes more. (FULL_AND_PIECEWISE drills the full graph
      // for the rail's sizes alone, and a mold above the rail would trade it for a piecewise one.)
      if (!['FULL', 'PIECEWISE'].includes(stage.house.graphMode) || stage.house.captureSizes.length < 2) continue
      const [rail, ...rest] = stage.house.captureSizes
      const above = (stage.ladder ?? []).find((size) => size > rail && !rest.includes(size))
      if (above === undefined) continue
      const padded: Levers = { ...stage.house, captureSizes: [above, ...rest].sort((a, b) => a - b) }
      const mode = resolvedMode(stage.support, padded).mode ?? 'NONE'
      expect(graphBytes(stage, padded, mode)).toBeGreaterThan(stage.graphBudget as number)
      expect(nightOf(stage, padded)).toBeNull()
      tried += 1
    }
    expect(tried).toBeGreaterThan(10)
  })
})

describe('the band (GAMES.md §3.2)', () => {
  test('accepts at least the 20% floor of the seeds, and says how many', () => {
    console.log(`close: ${BANDED.length} of ${SEEDS.length} seeds in band (${pct(BANDED.length, SEEDS.length)})`)
    expect(BANDED.length / SEEDS.length).toBeGreaterThanOrEqual(0.2)
    expect(BANDED.length).toBeGreaterThanOrEqual(50)
  })

  test('on a served seed the naive night loses a fifth of its clock to dark stretches and the house\'s loses at most three per cent; the naive misses the bar and the house meets it', () => {
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      const naive = nightOf(stage, stage.naive)!
      const house = nightOf(stage, stage.house)!
      expect(darkPermille(naive)).toBeGreaterThanOrEqual(NAIVE_DARK_PERMILLE)
      expect(darkPermille(house)).toBeLessThanOrEqual(HOUSE_DARK_PERMILLE)
      expect(nightMeetsBar(stage, house)).toBe(true)
      expect(nightMeetsBar(stage, naive)).toBe(false)
      expect(house.violations).toBe(0)
      // The naive night serves the same tickets: only the time differs.
      expect(naive.usefulTokens).toBe(house.usefulTokens)
      expect(stage.houseTokens).toBe(house.usefulTokens)
      expect(stage.houseMetric).toBe(house.metric)
    }
  })

  test('where the house drills a routine, the same configuration with none misses the bar: drilling earns its memory, or the house drills nothing', () => {
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      const bare = nightOf(stage, { ...stage.house, graphMode: 'NONE', captureSizes: [] })!
      if (stage.house.graphMode === 'NONE') expect(nightMeetsBar(stage, bare)).toBe(true)
      else expect(nightMeetsBar(stage, bare)).toBe(false)
    }
  })

  test('is a function of the seed, and a seed the band refuses still makes a level', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      expect(JSON.stringify(buildFullLevel('close', seed))).toBe(JSON.stringify(buildFullLevel('close', seed)))
      expect(stageInBand(stageOf(seed))).toBe(inFullBand('close', seed))
    }
  })
})

describe('the seed\'s draws: the workload, the host card, the backend and the room', () => {
  test('every draw is one of the level\'s declared values, and the same seed draws the same night', () => {
    for (const seed of SEEDS) {
      const d = drawClose(seed)
      expect(DRAWS.rails).toContain(d.slots)
      expect(DRAWS.budgets).toContain(d.budget)
      expect(DRAWS.supports).toContain(d.support)
      expect(DRAWS.replays).toContain(d.host.replayUs)
      expect(DRAWS.kernels).toContain(d.host.kernels)
      expect(d.requests === d.slots * 2 || d.requests === d.slots * 3).toBe(true)
      expect(drawClose(seed)).toEqual(d)
    }
    // Both cost cards are drawn, the small model's far more often.
    const cards = SEEDS.map((seed) => drawClose(seed).card)
    expect(cards).toContain('70b')
    expect(cards.filter((card) => card === 'small').length).toBeGreaterThan(cards.length / 2)
  })

  test('the host card is the runner\'s preset with its phases scaled by the draw and its three launch costs replaced; no field is anything but a whole number', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const stage = stageOf(seed)
      for (const runner of ['mrv2', 'v1'] as const) {
        const preset = hostPreset(runner).card
        const card = hostOf(stage, runner)
        expect(card).toEqual(drawnHost(preset, stage.host!))
        expect(card.launchPerKernelUs).toBe(stage.host!.launchUs)
        expect(card.kernelsPerLayer).toBe(stage.host!.kernels)
        expect(card.graphReplayUs).toBe(stage.host!.replayUs)
        expect(card.scheduleBaseUs).toBe(Math.round((preset.scheduleBaseUs * stage.host!.scalePermille) / 1000))
        for (const value of Object.values(card)) expect(Number.isInteger(value)).toBe(true)
      }
    }
    // The practice stages keep the presets as they stand.
    expect(hostOf(buildFullLevel('async', 0).stages[0], 'mrv2')).toBe(hostPreset('mrv2').card)
  })

  test('the workload is the seed\'s burst of tickets, with prompts and courses between the card\'s bounds', () => {
    for (const seed of BANDED.slice(0, 30)) {
      const stage = stageOf(seed)
      const night = nightOf(stage, stage.house)!
      expect(night.requests).toBe(stage.requests)
      expect(stage.prompts).toEqual([stage.budget >> 1, stage.budget * 2])
      expect(night.fires.length).toBeGreaterThan(stage.requests)
    }
  })

  test('the cards print what the model computes: the fires\' µs, the launches of tonight\'s host, and the room', () => {
    for (const seed of BANDED.slice(0, 30)) {
      const stage = stageOf(seed)
      const cards = closeCards(stage)
      const layers = gpuLayers(CARDS[stage.card])
      expect(cards.layers).toBe(layers)
      expect(cards.eagerLaunchUs).toBe(cards.launchUs * cards.kernels * layers)
      expect([cards.slots, cards.budget, cards.requests]).toEqual([stage.slots, stage.budget, stage.requests])
      expect(cards.roomBytes).toBe(stage.graphBudget as number)
      expect(cards.decodeUs.map((row) => row.rows)).toContain(stage.slots)
      // A decode fire gets no cheaper as rows are added.
      const times = cards.decodeUs.map((row) => row.us)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(cards.fullBudgetUs).toBeGreaterThan(0)
      expect(cards.mrv2.syncUs).toBeLessThanOrEqual(cards.v1.syncUs)
    }
  })
})

describe('the house', () => {
  test('is the cheapest configuration, in graph memory, whose night is within 1% of the best of its menu', () => {
    expect(KNEE_PERMILLE).toBe(10)
    for (const seed of BANDED.slice(0, 60)) {
      const stage = stageOf(seed)
      const probe = { ...stage, graphBudget: null }
      const menu = houseMenu(stage).flatMap((levers) => {
        const night = nightOf(probe, levers)
        const mode = resolvedMode(stage.support, levers).mode ?? 'NONE'
        return night === null || night.violations > 0 ? [] : [{ clock: night.clockUs, bytes: graphBytes(probe, levers, mode) }]
      })
      const best = Math.min(...menu.map((entry) => entry.clock))
      const near = menu.filter((entry) => entry.clock * 1000 <= best * (1000 + KNEE_PERMILLE))
      const house = nightOf(probe, kneeHouse(probe))!
      expect(house.clockUs * 1000).toBeLessThanOrEqual(best * (1000 + KNEE_PERMILLE))
      expect(graphBytes(probe, kneeHouse(probe), resolvedMode(stage.support, kneeHouse(probe)).mode ?? 'NONE')).toBe(Math.min(...near.map((entry) => entry.bytes)))
    }
  })

  test('writes its mode as the one that runs: on a backend that cannot replay mixed batches, FULL is written as FULL_AND_PIECEWISE', () => {
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      expect(resolvedMode(stage.support, stage.house).mode).toBe(stage.house.graphMode)
      if (stage.support !== 'ALWAYS') expect(stage.house.graphMode).not.toBe('FULL')
    }
  })

  test('async scheduling on, the ids on the line and MRV2: the legacy runner and a hand-written call lose to it on every served seed', () => {
    for (const seed of BANDED.slice(0, 60)) {
      const stage = stageOf(seed)
      expect([stage.house.async, stage.house.inputIds, stage.house.runner]).toEqual([true, 'device', 'mrv2'])
      const legacy = nightOf(stage, { ...stage.house, runner: 'v1' })!
      expect(legacy.clockUs).toBeGreaterThanOrEqual(stage.houseMetric)
    }
  })
})

describe('the blind-strategy bound (ASSESSMENT §4.1)', () => {
  // A library of habits that read nothing of the seed: one configuration for every seed. The bound is 15% of single seeds [estimated].
  const MODES = ['NONE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'FULL', 'FULL_AND_PIECEWISE'] as const
  const SIZES: readonly (readonly number[])[] = [[], [6], [8], [12], [16], [6, 64], [8, 64], [8, 128], [12, 96], [12, 128], [16, 64], [16, 96], [16, 128], [16, 192], [16, 256], [12, 160], [8, 320], [6, 384], [12, 192], [16, 32, 128]]

  test('no habit passes more than 15% of the seeds a draw serves: the best constant configuration in a library of ninety', () => {
    const passes = new Map<string, number>()
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      for (const graphMode of MODES) {
        for (const sizes of SIZES) {
          if (graphMode === 'NONE' && sizes.length > 0) continue
          const levers: Levers = { async: true, inputIds: 'device', runner: 'mrv2', maskOverlap: true, graphMode, captureSizes: sizes.filter((size) => size <= stage.budget) }
          const night = nightOf(stage, levers)
          if (night !== null && nightMeetsBar(stage, night)) passes.set(`${graphMode}[${sizes.join(',')}]`, (passes.get(`${graphMode}[${sizes.join(',')}]`) ?? 0) + 1)
        }
      }
    }
    const best = [...passes].sort((a, b) => b[1] - a[1])[0]
    console.log(`the best habit of ninety passes ${best[0]} on ${pct(best[1], BANDED.length)} of ${BANDED.length} served seeds`)
    expect(best[1] / BANDED.length).toBeLessThanOrEqual(0.15)
  })

  test('the naive configuration, the engine\'s defaults and a hand-written call pass none', () => {
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      const naive = nightOf(stage, stage.naive)!
      expect(nightMeetsBar(stage, naive)).toBe(false)
      const defaults = nightOf(stage, defaultLevers(stage.slots, stage.budget))
      expect(defaults === null || !nightMeetsBar(stage, defaults)).toBe(true)
      const written = nightOf(stage, { ...defaultLevers(stage.slots, stage.budget), inputIds: 'host' })
      expect(written === null || !nightMeetsBar(stage, written)).toBe(true)
    }
  })
})

describe('the session: one night, closed-book, graded by replay', () => {
  const start = (seed = 16): FullState => fullSession.init(fullSession.level('close', seed))

  test('the prediction is the naive night\'s dark share in per cent, called first; the bell serves the whole night at one ring, and the stage is then closed', () => {
    const s = start()
    const stage = s.level.stages[0]
    expect(fullSession.ask(s)).toEqual({ kind: 'predict', stage: 'close' })
    expect(stage.prediction).toMatchObject({ kind: 'number', unit: '%' })
    const naive = nightOf(stage, stage.naive)!
    expect(stage.answer).toBe(Math.round((100 * naive.bubbleUs) / naive.clockUs))
    expect(() => fullSession.reduce(s, { t: 'run', until: 'step' })).toThrow('commit the prediction before the first night')
    const called = play(s, { t: 'commit', prediction: stage.answer })
    expect(fullSession.ask(called)).toEqual({ kind: 'serve', stage: 'close' })
    // One ring, whether it asks for a fire or for the rest, serves the whole night.
    for (const until of ['step', 'decision'] as const) {
      const served = play(called, { t: 'run', until })
      expect(served.stages[0].served).toHaveLength(1)
      expect(served.stages[0].night?.fires).toBe(nightOf(stage, stage.naive)!.fires.length)
      expect(fullSession.done(served)).toBe(true)
      expect(fullSession.ask(served)).toBeNull()
      expect(() => fullSession.reduce(served, { t: 'run', until })).toThrow('this stage is over')
    }
  })

  test('the panel keeps what a lever resolves to and the memory the routines take to itself until the night is served, and tells it after', () => {
    const s = play(start(), { t: 'commit', prediction: 0 })
    const closed = fullSession.view(s).stage
    expect(closed.sealed).toBe(true)
    expect(closed.memory).toBeNull()
    expect(closed.resolved.changes).toEqual([])
    expect(closed.cards).not.toBeNull()
    expect(closed.cards?.roomBytes).toBe(s.level.stages[0].graphBudget as number)
    expect(closed.verdict).toBeNull()
    const served = fullSession.view(play(s, { t: 'run', until: 'decision' })).stage
    expect(served.closed).toBe(true)
    expect(served.memory).not.toBeNull()
    expect(served.verdict).not.toBeNull()
    // The practice stages show both at once, as they did.
    const practice = fullSession.view(play(fullSession.init(fullSession.level('graphs', 0)), { t: 'stage', to: 'modes' })).stage
    expect([practice.sealed, practice.memory === null, practice.cards]).toEqual([false, false, null])
  })

  test('the levers are the stage\'s: the ids come from the device or the host, and the rack takes any sizes of the ladder, in order, with no cap', () => {
    const s = play(start(), { t: 'commit', prediction: 0 })
    const stage = s.level.stages[0]
    const ladder = stage.ladder as readonly number[]
    expect(ladder).toEqual(CLOSE_LADDER.filter((size) => size <= stage.budget))
    expect(play(s, { t: 'lever', name: 'inputIds', value: 'device' }).stages[0].levers.inputIds).toBe('device')
    expect(() => fullSession.reduce(s, { t: 'lever', name: 'inputIds', value: 'both' })).toThrow('the input ids come from the "device" or the "host"')
    expect(play(s, { t: 'capture', sizes: ladder }).stages[0].levers.captureSizes).toEqual(ladder)
    expect(() => fullSession.reduce(s, { t: 'capture', sizes: [ladder[1], ladder[0]] })).toThrow('ascending order')
    expect(() => fullSession.reduce(s, { t: 'capture', sizes: [stage.budget + 1] })).toThrow('there is no mold of')
    expect(() => fullSession.reduce(play(fullSession.init(fullSession.level('async', 0))), { t: 'lever', name: 'inputIds', value: 'host' })).toThrow('has no lever "inputIds"')
  })

  test('a configuration the engine would not start is a night that failed: the learner is not told before the ring, and the debrief says why', () => {
    const s0 = start()
    const stage = s0.level.stages[0]
    const refusing = everythingOn(stage)
    let s = play(s0, { t: 'commit', prediction: 0 }, { t: 'lever', name: 'async', value: true }, { t: 'lever', name: 'inputIds', value: 'device' }, { t: 'lever', name: 'runner', value: 'mrv2' })
    s = play(s, { t: 'lever', name: 'graphMode', value: refusing.graphMode }, { t: 'capture', sizes: refusing.captureSizes })
    expect(fullSession.view(s).canFire).toBe(true)
    s = play(s, { t: 'run', until: 'decision' })
    const served = s.stages[0].served[0]
    expect(served).toMatchObject({ ok: false, refused: true, metric: 0, tokens: 0, violations: 0 })
    const view = fullSession.view(s)
    expect(view.stage.verdict).toMatchObject({ kind: 'refused', throughputPermille: null })
    expect(view.stage.verdict?.reason).toContain('more memory than the reach-in can spare')
    expect(fullSession.grade(s, fullSession.ghost(s.level))).toEqual({ score: 0, ok: false })
    const debrief = fullSession.debrief(s, fullSession.ghost(s.level))
    expect(debrief.sentence).toContain('would not start')
    expect(debrief.names).toMatchObject({ lever: expect.stringMatching(/^(graphMode|capture)$/) })
  })

  test('a night that broke the dependency scores 0 and says so; the lever worth the most is the ids, async scheduling being right', () => {
    let s = play(start(), { t: 'commit', prediction: 0 })
    const stage = s.level.stages[0]
    s = play(s, { t: 'lever', name: 'async', value: true }, { t: 'lever', name: 'runner', value: 'mrv2' })
    s = play(s, { t: 'lever', name: 'inputIds', value: 'host' }, { t: 'lever', name: 'graphMode', value: stage.house.graphMode }, { t: 'capture', sizes: stage.house.captureSizes })
    s = play(s, { t: 'run', until: 'decision' })
    const view = fullSession.view(s)
    expect(view.stage.verdict?.kind).toBe('violation')
    expect(view.stage.verdict?.violations).toBeGreaterThan(0)
    expect(fullSession.grade(s, fullSession.ghost(s.level))).toEqual({ score: 0, ok: false })
    const debrief = fullSession.debrief(s, fullSession.ghost(s.level))
    expect(debrief.sentence).toContain('read a token before it was sampled')
    // Async scheduling was right; the ids were not: the lever named is the ids.
    expect(debrief.names).toEqual({ lever: 'inputIds' })
  })

  test('the house, played in order, passes with a score of 1 and nothing for the debrief to name; the same run replays from its log to the same state', () => {
    for (const seed of [16, 3, 15]) {
      const level = fullSession.level('close', seed)
      const ghost = fullSession.ghost(level)
      expect(fullSession.grade(ghost, ghost)).toEqual({ score: 1, ok: true })
      expect(fullSession.debrief(ghost, ghost).names).toBeNull()
      expect(fullSession.view(ghost).stage.verdict).toMatchObject({ kind: 'pass', throughputPermille: 1000 })
      let run = startRun(serviceSession, { game: 'loop', level: 'close', seed })
      const stage = level.stages[0]
      const house = stage.house
      for (const action of [
        { t: 'commit', prediction: stage.answer },
        { t: 'lever', name: 'async', value: house.async },
        { t: 'lever', name: 'inputIds', value: house.inputIds },
        { t: 'lever', name: 'runner', value: house.runner },
        { t: 'lever', name: 'graphMode', value: house.graphMode },
        { t: 'capture', sizes: house.captureSizes },
        { t: 'run', until: 'decision' },
      ] as FullAction[]) {
        run = applyAction(serviceSession, run, action)
      }
      const finished = finishRun(serviceSession, run)
      expect(finished?.grade).toEqual({ score: 1, ok: true })
      let replayed = fullSession.init(level)
      for (const action of run.record.actions) replayed = fullSession.reduce(replayed, action as FullAction)
      expect(stateHash(replayed)).toBe(finished?.hash)
    }
  })

  test('a slow night fails the bar by degrees: async scheduling alone, on a seed that needs routines, serves fewer tokens for each ms than 97% of the house\'s', () => {
    let seen = 0
    for (const seed of BANDED) {
      const stage = stageOf(seed)
      if (stage.house.graphMode === 'NONE') continue
      let s = play(fullSession.init(fullSession.level('close', seed)), { t: 'commit', prediction: 0 })
      s = play(s, { t: 'lever', name: 'async', value: true }, { t: 'lever', name: 'inputIds', value: 'device' }, { t: 'lever', name: 'runner', value: 'mrv2' }, { t: 'run', until: 'decision' })
      const verdict = fullSession.view(s).stage.verdict
      expect(verdict?.kind).toBe('slow')
      expect(verdict?.throughputPermille).toBeLessThan(BAR_PERMILLE)
      expect(fullSession.grade(s, fullSession.ghost(s.level)).ok).toBe(false)
      seen += 1
      if (seen >= 20) break
    }
    expect(seen).toBe(20)
  })
})

describe('the lever worth the most', () => {
  test('is weighed from the learner\'s own configuration, one lever set to the house\'s at a time, and is not negative for the house', () => {
    for (const seed of BANDED.slice(0, 40)) {
      const stage = stageOf(seed)
      for (const entry of leverWorth(stage, stage.house)) expect(entry.gain).toBe(0)
      const worth = leverWorth(stage, stage.naive)
      expect(worth.map((entry) => entry.lever)).toEqual(['async', 'graphMode', 'capture', 'runner'])
      for (const entry of worth) expect(entry.gain).toBeGreaterThanOrEqual(0)
    }
  })

  test('verdicts read a served night: a pass, a slow night, a violation and a refusal', () => {
    const stage = stageOf(16)
    const base = { levers: stage.house, metric: stage.houseMetric, ok: true, tokens: stage.houseTokens, violations: 0 }
    expect(verdictOf(stage, base, null)).toMatchObject({ kind: 'pass', throughputPermille: 1000 })
    expect(verdictOf(stage, { ...base, ok: false, metric: stage.houseMetric * 2 }, null)).toMatchObject({ kind: 'slow', throughputPermille: 500 })
    expect(verdictOf(stage, { ...base, ok: false, violations: 3 }, null)).toMatchObject({ kind: 'violation', throughputPermille: null, violations: 3 })
    expect(verdictOf(stage, { ...base, ok: false, refused: true }, 'x')).toMatchObject({ kind: 'refused', reason: 'x' })
  })
})

describe('the naive configuration', () => {
  test('is every lever off: the legacy runner, the next call after the fire, the ids by hand, no routine drilled, and the engine\'s own capture list behind the mode', () => {
    for (const seed of BANDED.slice(0, 20)) {
      const stage = stageOf(seed)
      expect(stage.naive).toEqual(naiveLevers(stage.slots, stage.budget))
      expect([stage.naive.async, stage.naive.inputIds, stage.naive.runner, stage.naive.graphMode]).toEqual([false, 'host', 'v1', 'NONE'])
      expect(stage.start).toEqual(stage.naive)
    }
  })
})
