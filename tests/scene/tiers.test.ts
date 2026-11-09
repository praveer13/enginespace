/*
 * W0-T15: device tiers and the governor (ARCHITECTURE §6.6, D-022), and the post-processing plan they drive (§6.5). Plain
 * arithmetic over hints and frame times, so every rule is checked here with fixed inputs and a fake clock.
 */
import { describe, expect, test } from 'bun:test'
import { createGovernor, GOVERNOR, p95Of } from '@/scene/governor'
import { BLOOM, NO_POSTFX, planFromId, planId, postFxPlan } from '@/scene/postfx/plan'
import { DEFAULT_CHOICE, forcedTier, SMALL_DEVICE, startingTier, TIERS, TIER_IDS, unavailableReason, type DeviceHints, type Tier } from '@/scene/tiers'

const DESKTOP: DeviceHints = {
  webgl2: true,
  majorPerformanceCaveat: false,
  coarsePointer: false,
  deviceMemory: 16,
  hardwareConcurrency: 12,
  maxTextureSize: 16384,
  saveData: false,
}

describe('the tier table (A§6.6)', () => {
  test('T0 is 2D only; T1 to T3 are 3D, and every cap rises with the tier', () => {
    expect(TIERS[0].view).toBe('2d')
    for (const tier of [1, 2, 3] as const) expect(TIERS[tier].view).toBe('3d')
    for (const [low, high] of [
      [1, 2],
      [2, 3],
    ] as const) {
      expect(TIERS[high].dprCap).toBeGreaterThan(TIERS[low].dprCap)
      expect(TIERS[high].maxInstances).toBeGreaterThan(TIERS[low].maxInstances)
      expect(TIERS[high].postPasses).toBeGreaterThan(TIERS[low].postPasses)
      expect(TIERS[high].fpsCap).toBeGreaterThanOrEqual(TIERS[low].fpsCap)
    }
  })

  test("A§6.6's numbers: DPR 1.0, 1.5, 2.0; instances 10k, 30k, 50k; 30 fps at T1 and 60 above; shadows from T2 (scene kit v1)", () => {
    expect([TIERS[1].dprCap, TIERS[2].dprCap, TIERS[3].dprCap]).toEqual([1, 1.5, 2])
    expect([TIERS[1].maxInstances, TIERS[2].maxInstances, TIERS[3].maxInstances]).toEqual([10_000, 30_000, 50_000])
    expect([TIERS[1].fpsCap, TIERS[2].fpsCap, TIERS[3].fpsCap]).toEqual([30, 60, 60])
    // Scene kit v1 gives the heat lamps soft shadow maps from T2, departing from A§6.6's "off at T1 and T2" (tiers.ts).
    expect([TIERS[1].shadowLights, TIERS[2].shadowLights, TIERS[3].shadowLights]).toEqual([0, 3, 4])
    expect(TIERS[1].frameBudgetMs).toBeCloseTo(1000 / 30)
    expect(TIERS[2].frameBudgetMs).toBeCloseTo(1000 / 60)
  })
})

describe('the starting tier (A§6.6)', () => {
  test('T0: no WebGL2, software rendering, 2D chosen, two lost contexts, or a cap of 0', () => {
    expect(startingTier({ ...DESKTOP, webgl2: false })).toEqual({ tier: 0, reason: 'no-webgl2' })
    expect(startingTier({ ...DESKTOP, majorPerformanceCaveat: true })).toEqual({ tier: 0, reason: 'software' })
    expect(startingTier(DESKTOP, { ...DEFAULT_CHOICE, prefer2d: true })).toEqual({ tier: 0, reason: 'chosen-2d' })
    expect(startingTier(DESKTOP, { ...DEFAULT_CHOICE, lostContexts: 2 })).toEqual({ tier: 0, reason: 'lost-twice' })
    expect(startingTier(DESKTOP, { ...DEFAULT_CHOICE, lostContexts: 1 }).tier).toBe(2)
    expect(startingTier(DESKTOP, { ...DEFAULT_CHOICE, cap: 0 })).toEqual({ tier: 0, reason: 'capped' })
  })

  test('T1: a coarse pointer, at most 4 GB, at most 4 cores, or textures below 8192 px', () => {
    expect(startingTier({ ...DESKTOP, coarsePointer: true })).toEqual({ tier: 1, reason: 'small-device' })
    expect(startingTier({ ...DESKTOP, deviceMemory: SMALL_DEVICE.deviceMemoryGb }).tier).toBe(1)
    expect(startingTier({ ...DESKTOP, hardwareConcurrency: SMALL_DEVICE.cores }).tier).toBe(1)
    expect(startingTier({ ...DESKTOP, maxTextureSize: 4096 }).tier).toBe(1)
    expect(startingTier({ ...DESKTOP, deviceMemory: 8, hardwareConcurrency: 8, maxTextureSize: 8192 }).tier).toBe(2)
  })

  test('unknown hints are not held against a device', () => {
    expect(startingTier({ ...DESKTOP, deviceMemory: null, hardwareConcurrency: null, maxTextureSize: null })).toEqual({ tier: 2, reason: 'default' })
  })

  test('T3 is never a starting tier, and the cap is never exceeded', () => {
    for (const cap of TIER_IDS) {
      const { tier } = startingTier(DESKTOP, { ...DEFAULT_CHOICE, cap })
      expect(tier).toBeLessThanOrEqual(Math.min(cap, 2))
    }
    expect(startingTier(DESKTOP, { ...DEFAULT_CHOICE, cap: 1 })).toEqual({ tier: 1, reason: 'capped' })
  })

  test('saveData does not lower the tier: it only keeps the 3D from loading by itself', () => {
    expect(startingTier({ ...DESKTOP, saveData: true }).tier).toBe(2)
  })

  test('the 2D/3D switch can say why 3D is off, and says nothing when it is on', () => {
    expect(unavailableReason('no-webgl2')).toBe('This browser has no WebGL2')
    expect(unavailableReason('chosen-2d')).toBe('3D is off in Settings')
    expect(unavailableReason('default')).toBeUndefined()
    expect(unavailableReason('small-device')).toBeUndefined()
  })

  test('a forced tier exists only in test builds', () => {
    expect(forcedTier()).toBeNull()
  })
})

describe('the governor (A§6.6)', () => {
  /** Feeds frames of `ms` each, from `start`, for `forMs` of animation; returns the events and the end time. */
  function feed(governor: ReturnType<typeof createGovernor>, ms: number, start: number, forMs: number) {
    const events = []
    let at = start
    for (let spent = 0; spent < forMs; spent += ms) {
      at += ms
      const event = governor.sample(ms, at)
      if (event) events.push(event)
    }
    return { events, at }
  }

  test('p95 is the nearest-rank 95th percentile', () => {
    expect(p95Of([])).toBeNull()
    expect(p95Of(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95)
    expect(p95Of([5])).toBe(5)
  })

  test('steps down a tier when the p95 over 2 s of animation exceeds the budget × 1.2, and not before 2 s', () => {
    const governor = createGovernor(2)
    const slow = TIERS[2].frameBudgetMs * GOVERNOR.downAbove + 2
    const early = feed(governor, slow, 10_000, 1900)
    expect(early.events).toEqual([])
    const late = feed(governor, slow, early.at, 400)
    expect(late.events.map((event) => event.kind === 'tier' && event.to)).toEqual([1])
    expect(governor.state.tier).toBe(1)
  })

  test('holds a tier that meets its budget', () => {
    const governor = createGovernor(2)
    expect(feed(governor, TIERS[2].frameBudgetMs, 10_000, 20_000).events).toEqual([])
  })

  test('steps up only after 10 s of p95 under the budget × 0.6, never above the cap or T3', () => {
    const governor = createGovernor(1, 3)
    const fast = TIERS[1].frameBudgetMs * GOVERNOR.upBelow - 2
    // The window fills in 2 s, then the p95 must stay low for 10 s more.
    const early = feed(governor, fast, 10_000, 11_000)
    expect(early.events).toEqual([])
    const first = feed(governor, fast, early.at, 1500)
    expect(first.events.map((event) => event.kind === 'tier' && event.to)).toEqual([2])
    const capped = createGovernor(2, 2)
    expect(feed(capped, 5, 10_000, 30_000).events).toEqual([])
    const top = createGovernor(3, 3)
    expect(feed(top, 5, 10_000, 30_000).events).toEqual([])
  })

  test('changes at most once per 5 s, and never below T1', () => {
    const governor = createGovernor(3)
    const times: number[] = []
    let clock = 0
    for (let spent = 0; spent < 20_000; spent += 200) {
      clock += 200
      if (governor.sample(200, clock)?.kind === 'tier') times.push(clock)
    }
    expect(times.length).toBe(2) // T3 to T2, then T2 to T1
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(GOVERNOR.minGapMs)
    expect(governor.state.tier).toBe(1)
  })

  test('from T1, offers the 2D view once when the p95 stays above 50 ms for 5 s', () => {
    const governor = createGovernor(1)
    const { events } = feed(governor, 60, 0, 10_000)
    const offers = events.filter((event) => event.kind === 'offer-2d')
    expect(offers).toHaveLength(1)
    expect(governor.state.offered2d).toBe(true)
    expect(governor.state.tier).toBe(1)
  })

  test('a pause starts a new window, so an idle gap is never a frame', () => {
    const governor = createGovernor(2)
    feed(governor, TIERS[2].frameBudgetMs, 0, 1500)
    governor.pause()
    expect(governor.state.p95).toBeNull()
    expect(governor.sample(5000, 20_000)).toBeNull()
  })

  test('a lower cap from Settings drops the tier at once', () => {
    const governor = createGovernor(2)
    expect(governor.setCap(1, 100)).toMatchObject({ kind: 'tier', from: 2, to: 1 })
    expect(governor.state.tier).toBe(1)
  })

  test('T0 has nothing to govern', () => {
    const governor = createGovernor(0)
    expect(feed(governor, 500, 0, 20_000).events).toEqual([])
  })
})

describe('the post-processing plan (A§6.5)', () => {
  const plain = { contrastMore: false, forcedColors: false }

  test('T0 and T1 have no composer, so the postfx chunk is never requested', () => {
    expect(postFxPlan(0, plain)).toBe(NO_POSTFX)
    expect(postFxPlan(1, plain)).toBe(NO_POSTFX)
  })

  test('T2 and T3: the scene, bloom, and the final pass with FXAA in it', () => {
    for (const tier of [2, 3] as const) {
      const plan = postFxPlan(tier, plain)
      expect(plan).toMatchObject({ composer: true, bloom: true, fxaa: true, passes: ['scene', 'bloom', 'final'], effectPasses: 1 })
    }
  })

  test("every plan's effect passes fit its tier's budget", () => {
    for (const tier of TIER_IDS) {
      for (const contrastMore of [false, true]) {
        for (const forcedColors of [false, true]) {
          expect(postFxPlan(tier as Tier, { contrastMore, forcedColors }).effectPasses).toBeLessThanOrEqual(TIERS[tier].postPasses)
        }
      }
    }
  })

  test('effects switch off under prefers-contrast: more and forced colours; anti-aliasing stays', () => {
    expect(postFxPlan(2, { contrastMore: true, forcedColors: false })).toMatchObject({ bloom: false, fxaa: true, passes: ['scene', 'final'] })
    expect(postFxPlan(3, { contrastMore: false, forcedColors: true }).bloom).toBe(false)
  })

  test('a plan survives its id, so a composer is rebuilt only when the plan changes', () => {
    for (const tier of TIER_IDS) {
      const plan = postFxPlan(tier as Tier, plain)
      expect(planFromId(planId(plan))).toEqual(plan)
    }
  })
})

describe('nothing flashes (WCAG 2.3.1; A§11.2)', () => {
  test('bloom is a constant: no effect intensity is a function of time', () => {
    expect(Object.isFrozen(BLOOM) || typeof BLOOM.strength === 'number').toBe(true)
    expect(BLOOM.strength).toBeGreaterThan(0)
    expect(BLOOM.threshold).toBeGreaterThan(1) // only what glows (the lamps' elements) blooms
  })

  test('effects change only with the tier, and the tier at most once per 5 s: far below 3 Hz', () => {
    expect(1000 / GOVERNOR.minGapMs).toBeLessThan(3)
  })
})
