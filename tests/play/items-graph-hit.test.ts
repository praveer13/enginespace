/*
 * W1-T14: `tr2.graph-hit`. The tests re-derive each key from the numbers that the ticket prints, hold the family's rules to the step loop v1
 * (the launch it spends and the graph it finds for the same numbers), and hold the family to the framework's own rules: deterministic, in
 * band, graded, explained, drawn answer first, and not passed by a habit.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  bandAcceptance,
  bandedSeeds,
  BAND_FLOOR,
  drawInBand,
  FAMILIES,
  familiesForKc,
  familyById,
  fixedSeeds,
  LEVELS,
  measureBlind,
  offeredAt,
  plain,
} from '@es/play/items'
import type { Item, Level } from '@es/play/items'
import { graphHit, graphModel } from '@es/play/items/families/tr2/graph-hit'
import type { Machine, Mode } from '@es/play/items/families/tr2/graph-hit'
import { HOST_PRESETS } from '@es/sim/host'
import { napkinSpec } from '@es/sim/physics'
import { PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER, runStepLoop, SMALL_CARD } from '@es/sim/steploop'
import type { GraphModeId, NapkinGpuCard, StepLoopConfig } from '@es/sim/steploop'
import { genWorkload } from '@es/sim/workload'
import { compileContent } from '../../scripts/content/build.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0x6a9)

interface Scene extends Machine {
  mode: Mode
  sizes: number[]
  tokens: number
  mixed: boolean
  chunk: number
}

/** The scene an item prints, read back from its params (which carry the numbers the ticket prints). */
const sceneOf = (item: Item): Scene => {
  const p = item.params as Record<string, number | string | boolean>
  return {
    layers: Number(p.layers),
    kernels: Number(p.kernels),
    launchUs: Number(p.launchUs),
    replayUs: Number(p.replayUs),
    mode: p.mode as Mode,
    sizes: String(p.sizes ?? '').split(',').filter(Boolean).map(Number),
    tokens: Number(p.tokens),
    mixed: p.mixed === true,
    chunk: Number(p.chunk),
  }
}

/** The seeds whose own variant is `variant` at `level` and that the band accepts: the ones a draw would serve. */
const served = (variant: string, level: Level): number[] => SEEDS.filter((seed) => graphHit.make(seed, level).variant === variant && graphHit.band(seed, level))

/** The numbers a ticket prints, by label. */
const printed = (item: Item): Record<string, number> =>
  Object.fromEntries(item.givens.flatMap((given) => (given.value.t === 'num' ? [[given.label, given.value.value]] : [])))

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr2.graph-hit')).toBe(graphHit)
    expect(FAMILIES).toContain(graphHit)
    expect(familiesForKc('tr2.graph-replay')).toEqual([graphHit])
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of graphHit.kcs) expect(ids.has(kc)).toBe(true)
    for (const level of LEVELS) expect(offeredAt(graphHit, level).map((variant) => variant.id)).toEqual(['hit-or-miss', 'launch-saved'])
  })

  test('its rules are the claims\': the padding, the modes\' routines and the pieces of a piecewise graph', () => {
    const claims = new Set(compileContent({ root }).claims.map((record) => record.claim.id))
    for (const id of ['vllm.cudagraph.padding', 'vllm.cudagraph.mode-routines', 'vllm.cudagraph.piecewise-partitions', 'vllm.cudagraph.piecewise-attention-outside']) {
      expect(claims.has(id), `the claim ${id}`).toBe(true)
    }
  })
})

describe('the model, held to the step loop v1', () => {
  /** A small-model card with `layers` layers: the loop prices launches by the card's layers. */
  const cardOf = (layers: number): NapkinGpuCard => ({ ...SMALL_CARD, spec: napkinSpec(SMALL_CARD.spec.chip, { ...SMALL_CARD.spec.model, layers }) })
  const hostOf = (m: Machine) => ({ ...HOST_PRESETS.mrv2.card, launchPerKernelUs: m.launchUs, kernelsPerLayer: m.kernels, graphReplayUs: m.replayUs })
  const configOf = (mode: GraphModeId, sizes: readonly number[], slots: number): StepLoopConfig => ({
    maxNumSeqs: slots,
    maxBatchedTokens: 4096,
    chunkedPrefill: true,
    asyncScheduling: false,
    inputIds: 'device',
    graphs: { mode, captureSizes: mode === 'NONE' ? [] : sizes },
    runner: 'mrv2',
  })
  /** `rows` requests of one prompt token and three tokens out: step 0 is a batch of prompts (mixed), step 1 a plain decode batch of `rows`. */
  const run = (m: Machine, mode: GraphModeId, sizes: readonly number[], rows: number) => {
    const workload = genWorkload(1, { requests: rows, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'const', value: 3 } } })
    return runStepLoop(workload, configOf(mode, sizes, 128), hostOf(m), cardOf(m.layers), { horizonUs: 1_000_000_000 })
  }
  const launchOf = (result: ReturnType<typeof run>, step: number): number => {
    const span = result.lanes['cpu-main'].find((s) => s.step === step && s.kind === 'launch')
    return span === undefined ? 0 : span.endUs - span.startUs
  }

  test('the launch phase of a step is kernels × layers × launch when it is launched one by one, one replay in FULL, and a replay a piece in PIECEWISE', () => {
    expect(PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER).toBe(1)
    for (const seed of SEEDS.slice(0, 40)) {
      const item = graphHit.make(seed, 2, 'launch-saved')
      const m = sceneOf(item)
      const sizes = [8]
      // A decode batch of eight rows, which every mode finds a graph for.
      const eager = run(m, 'NONE', sizes, 8)
      const full = run(m, 'FULL', sizes, 8)
      const pieces = run(m, 'PIECEWISE', sizes, 8)
      expect(launchOf(eager, 1)).toBe(graphModel.eagerUs(m))
      expect(launchOf(full, 1)).toBe(graphModel.replayedUs(m, 'FULL'))
      expect(launchOf(pieces, 1)).toBe(graphModel.replayedUs(m, 'PIECEWISE'))
      expect(graphModel.savedUs(m, 'FULL')).toBe(launchOf(eager, 1) - launchOf(full, 1))
      expect(graphModel.savedUs(m, 'PIECEWISE')).toBe(launchOf(eager, 1) - launchOf(pieces, 1))
    }
  })

  test('the graph a step finds is the model\'s outcome: for a plain decode batch, and for a batch that adds prompts, in each mode', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const item = graphHit.make(seed, 2, 'hit-or-miss')
      const scene = sceneOf(item)
      // The loop's own batch: `tokens` rows of one token each. Row 0 of the run is a batch of prompts, and row 1 a plain decode batch.
      const result = run(scene, scene.mode, scene.sizes, scene.tokens)
      const step = result.steps[scene.mixed ? 0 : 1]
      expect(step.tokens).toBe(scene.tokens)
      const outcome = item.answer.kind === 'choice' ? item.answer.correct : ''
      expect(graphModel.outcome(scene.mode, scene.mixed, scene.sizes, scene.tokens)).toBe(outcome)
      const padded = graphModel.padded(scene.sizes, scene.tokens)
      if (outcome === 'exact') expect([step.mode, step.paddedTokens]).toEqual(['FULL', scene.tokens])
      else if (outcome === 'padded') expect([step.mode, step.paddedTokens]).toEqual(['FULL', padded])
      else if (outcome === 'pieces') expect([step.mode, step.paddedTokens]).toEqual(['PIECEWISE', padded])
      else expect([step.mode, step.paddedTokens]).toEqual(['NONE', scene.tokens])
      checked += 1
    }
    expect(checked).toBe(SEEDS.length)
  })

  test('the padding is the smallest size that holds the step, and nothing above the largest', () => {
    expect(graphModel.padded([4, 9, 16], 5)).toBe(9)
    expect(graphModel.padded([4, 9, 16], 9)).toBe(9)
    expect(graphModel.padded([4, 9, 16], 17)).toBeNull()
    expect(graphModel.outcome('FULL', false, [4, 9, 16], 9)).toBe('exact')
    expect(graphModel.outcome('FULL_DECODE_ONLY', true, [4, 9, 16], 9)).toBe('eager')
    expect(graphModel.outcome('PIECEWISE', true, [4, 9, 16], 5)).toBe('pieces')
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(graphHit, level)) {
        const item = graphHit.make(seed, level, variant.id)
        expect(graphHit.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(graphHit, item, { seed, level, variant: variant.id })).toEqual([])
        expect(graphHit.grade(item, keyOf(item)).ok).toBe(true)
        expect(graphHit.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers, and the same one each time', () => {
    for (const level of LEVELS) {
      const seen = new Set(SEEDS.map((seed) => graphHit.make(seed, level).variant))
      expect(seen).toEqual(new Set(['hit-or-miss', 'launch-saved']))
    }
  })

  test('is in the world of a synthetic engine: every scene number the ticket prints is tagged, and no digit is in a sentence', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of LEVELS) {
        const item = graphHit.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...graphHit.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
      }
    }
  })
})

describe('hit-or-miss', () => {
  test('is drawn answer first: each outcome is the key on about a quarter of the seeds, and `eager` has its three causes', () => {
    const keys = new Map<string, number>()
    const causes = new Map<string, number>()
    for (const seed of SEEDS) {
      const item = graphHit.make(seed, 2, 'hit-or-miss')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      keys.set(item.answer.correct, (keys.get(item.answer.correct) ?? 0) + 1)
      expect(item.answer.options.map((option) => option.id).sort()).toEqual(['eager', 'exact', 'padded', 'pieces'])
      if (item.answer.correct !== 'eager') continue
      const scene = sceneOf(item)
      const largest = scene.sizes[scene.sizes.length - 1]
      const cause = scene.tokens > largest ? (scene.mode === 'PIECEWISE' ? 'above under PIECEWISE' : 'above under a whole-graph mode') : 'a prompt chunk under FULL_DECODE_ONLY'
      causes.set(cause, (causes.get(cause) ?? 0) + 1)
    }
    for (const id of ['eager', 'exact', 'padded', 'pieces']) {
      expect(keys.get(id) ?? 0).toBeGreaterThan(SEEDS.length / 6)
      expect(keys.get(id) ?? 0).toBeLessThan(SEEDS.length / 3)
    }
    expect([...causes.keys()].sort()).toEqual(['a prompt chunk under FULL_DECODE_ONLY', 'above under PIECEWISE', 'above under a whole-graph mode'])
  })

  test('the step is described by its mode and kind, and at level 3 by its decode rows and its prompt chunk, which add up to its tokens', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const two = graphHit.make(seed, 2, 'hit-or-miss')
      const three = graphHit.make(seed, 3, 'hit-or-miss')
      expect(two.givens.map((given) => given.label)).toEqual(['mode', 'tokens in the step', 'captured sizes'])
      const scene = sceneOf(three)
      const shown = printed(three)
      expect(shown['decode rows'] + (shown['prompt chunk'] ?? 0)).toBe(scene.tokens)
      expect(scene.mixed ? shown['prompt chunk'] : undefined).toBe(scene.mixed ? scene.chunk : undefined)
      if (scene.mixed) expect(scene.chunk).toBeGreaterThanOrEqual(2)
      expect(scene.tokens - scene.chunk).toBeGreaterThanOrEqual(1)
    }
  })

  test('every option says why, a lure names the misconception it encodes, and the reasons carry the scene\'s numbers as tagged parts', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const item = graphHit.make(seed, 2, 'hit-or-miss')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(30)
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toMatch(/^tr2\.graph-hit\.[a-z-]+$/)
      }
      const reasons = item.answer.options.flatMap((option) => option.why)
      expect(reasons.some((part) => part.t === 'num')).toBe(true)
      for (const part of reasons) if (part.t === 'num') expect(['synthetic', 'derived']).toContain(part.tag)
    }
  })

  test('a wrong pick is diagnosed by the lure it is: the misconception id rides on the grade', () => {
    const misses = new Set<string>()
    for (const seed of SEEDS) {
      const item = graphHit.make(seed, 2, 'hit-or-miss')
      if (item.answer.kind !== 'choice') continue
      for (const option of item.answer.options) {
        const graded = graphHit.grade(item, { kind: 'choice', pick: option.id })
        if (option.id === item.answer.correct) expect(graded.diagnosis).toBeUndefined()
        else {
          expect(graded.ok).toBe(false)
          expect(graded.diagnosis?.id).toBe(option.miss)
          misses.add(String(option.miss))
        }
      }
    }
    // Every misconception the family encodes shows up somewhere in the draws.
    expect([...misses].sort()).toEqual(
      [
        'tr2.graph-hit.decode-graphs-serve-all',
        'tr2.graph-hit.graph-at-every-size',
        'tr2.graph-hit.ignores-the-mode',
        'tr2.graph-hit.misses-a-hit',
        'tr2.graph-hit.pads-a-hit',
        'tr2.graph-hit.pieces-in-a-whole-mode',
        'tr2.graph-hit.pieces-without-a-graph',
        'tr2.graph-hit.rounds-to-the-largest',
      ].sort(),
    )
  })
})

describe('launch-saved', () => {
  test.each([0, 1, 2] as const)('at level %p the key is the eager launch time less the replay\'s, in µs, for FULL and for PIECEWISE', (level) => {
    const modes = new Set<string>()
    for (const seed of served('launch-saved', level)) {
      const item = graphHit.make(seed, level, 'launch-saved')
      const m = sceneOf(item)
      const shown = printed(item)
      expect(shown.layers).toBe(m.layers)
      const mode = m.mode === 'PIECEWISE' ? 'PIECEWISE' : 'FULL'
      modes.add(mode)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'µs', truth: graphModel.eagerUs(m) - graphModel.replayedUs(m, mode) })
      // The saving is at least a fifth of the eager launch time: the band's rule.
      expect(item.answer.kind === 'numeric' && item.answer.truth * 5).toBeGreaterThanOrEqual(graphModel.eagerUs(m))
    }
    expect([...modes].sort()).toEqual(['FULL', 'PIECEWISE'])
  })

  test('at level 3 the same question is asked and answered in milliseconds, with every time printed in them', () => {
    for (const seed of served('launch-saved', 3).slice(0, 80)) {
      const item = graphHit.make(seed, 3, 'launch-saved')
      const two = graphHit.make(seed, 2, 'launch-saved')
      const m = sceneOf(item)
      const mode = m.mode === 'PIECEWISE' ? 'PIECEWISE' : 'FULL'
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'ms', digits: 3, truth: graphModel.savedUs(m, mode) / 1000 })
      for (const given of item.givens) if (given.value.t === 'num' && given.value.unit !== 'layers' && given.value.unit !== 'kernels') expect(given.value.unit).toBe('ms')
      expect(two.answer).toMatchObject({ unit: 'µs' })
      expect(plain(graphHit.solution(item).flatMap((step) => step.text))).not.toContain('µs')
    }
  })

  test('the solution walks from the eager launch time to the saving, and ends in the key', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = graphHit.make(seed, level, 'launch-saved')
        const steps = graphHit.solution(item)
        expect(steps.length).toBeGreaterThanOrEqual(3)
        const last = steps[steps.length - 1].result
        expect(last?.value).toBe(item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)
        expect(last?.tag).toBe('derived')
      }
    }
  })

  test('a wrong number that a rule recognises is named, in words that say what was done', () => {
    let seen = 0
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = graphHit.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    for (const seed of served('launch-saved', 2)) {
      const item = graphHit.make(seed, 2, 'launch-saved')
      const m = sceneOf(item)
      const mode = m.mode === 'PIECEWISE' ? 'PIECEWISE' : 'FULL'
      expect(diagnose(item, graphModel.savedUs(m, mode))).toBe('right')
      expect(diagnose(item, graphModel.eagerUs(m))).toBe('tr2.graph-hit.forgot-the-replay')
      expect(diagnose(item, m.kernels * m.layers)).toBe('tr2.graph-hit.counted-launches')
      expect(diagnose(item, 123456789)).toBeUndefined()
      seen += 1
    }
    expect(seen).toBeGreaterThan(20)
  })
})

describe('the worked examples', () => {
  test('level 0 shows a whole solution with another outcome or other numbers, level 1 only the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const variant of ['hit-or-miss', 'launch-saved']) {
        const zero = graphHit.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(2)
        const one = graphHit.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(graphHit.make(seed, 2, variant).worked).toEqual([])
      }
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(graphHit, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(graphHit, level, entropy)
      expect(graphHit.band(seed, level)).toBe(true)
    }
  })

  test('the band refuses a saving under a fifth of the eager launch time, and a captured step with no size above it to name', () => {
    for (const seed of fixedSeeds(2000, 31)) {
      const level = 2
      const item = graphHit.make(seed, level)
      const m = sceneOf(item)
      const fair =
        item.variant === 'launch-saved'
          ? graphModel.savedUs(m, m.mode === 'PIECEWISE' ? 'PIECEWISE' : 'FULL') * 5 >= graphModel.eagerUs(m)
          : m.tokens >= 3 && (item.answer.kind !== 'choice' || item.answer.correct !== 'exact' || m.tokens < m.sizes[m.sizes.length - 1])
      expect(graphHit.band(seed, level)).toBe(fair)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(graphHit, level, bandedSeeds(graphHit, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) {
        if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
        else expect(row.rate).toBeLessThanOrEqual(row.bound)
      }
    }
  })
})

describe('a response of the wrong kind or an answer nobody could mean', () => {
  test('is wrong, and never throws', () => {
    const numeric = graphHit.make(SEEDS[2], 2, 'launch-saved')
    const choice = graphHit.make(SEEDS[2], 2, 'hit-or-miss')
    const responses = [
      { kind: 'choice' as const, pick: 'exact' },
      { kind: 'numeric' as const, value: Number.NaN },
      { kind: 'numeric' as const, value: Number.POSITIVE_INFINITY },
      { kind: 'numeric' as const, value: -5 },
      { kind: 'choice' as const, pick: '' },
    ]
    for (const response of responses) {
      expect(graphHit.grade(numeric, response).ok).toBe(false)
      expect(graphHit.grade(choice, response).ok || (response.kind === 'choice' && response.pick === (choice.answer.kind === 'choice' ? choice.answer.correct : ''))).toBe(
        response.kind === 'choice' && response.pick === (choice.answer.kind === 'choice' ? choice.answer.correct : ''),
      )
    }
    const level: Level = 2
    expect(offeredAt(graphHit, level).length).toBe(2)
  })
})
