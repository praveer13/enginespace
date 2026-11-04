/*
 * W0-T12 acceptance check 2, and the physics module around it (ARCHITECTURE §5.2, §13).
 *
 *   - kernelspace's 50 golden step vectors pass through the wrapper in packages/sim/physics, field for field and bit for bit,
 *     and the wrapper's `stepCard`, `NAPKIN` and `napkinSpec` are the vendored ones themselves.
 *   - The three fitted rows are checked against sources that are not the table they were typed from. The rows carry the report's
 *     full-precision parameters, so (a) they round to the report's `claimValues`, which are rounded separately; (b) running the
 *     card on them reproduces the report's two worked examples exactly, every field of `card` and of the napkin card, which
 *     also checks the chip and model shapes, since the report holds none; and (c) the TR2 curriculum's derived figures for the
 *     H100 row (3.9 ms of 17.7 ms, and 0.24 ms of 18.0 ms) come out of them.
 *   - `stepLoad` rebuilds the loads of the vendored fixture's two worked examples from their batches.
 *   - `stepSplit` is exact: the GPU part and the host part add up to the card's `us`.
 *
 * Numbers copied from kernelspace's docs/physics/report.json are [measured 2026-11-03, kernelspace d478f91, SHA-256 7bda67b9…].
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalJson } from '../../packages/sim/core'
import { NAPKIN, PHYSICS_ROWS, PHYSICS_SOURCE, napkinSpec, physicsRow, stepCard, stepLoad, stepSplit } from '../../packages/sim/physics'
import type { CardSpec, PhysicsRow, PhysicsRowKey, StepCard, StepLoad } from '../../packages/sim/physics'
import * as vendored from '../../vendor/kernelspace/src/lib/world/physics/card'
import fixture from '../../vendor/kernelspace/tests/fixtures/physics/step-vectors.json'

const root = path.resolve(import.meta.dirname, '../..')

interface Vector {
  name: string
  spec: string
  tp: number
  load: StepLoad
  card: StepCard
}
const specs = fixture.specs as Record<string, CardSpec>
const vectors = fixture.vectors as Vector[]
const named = (prefix: string): Vector => {
  const found = vectors.find((v) => v.name.startsWith(prefix))
  if (!found) throw new Error(`no vector named "${prefix}..."`)
  return found
}

describe('kernelspace\'s golden step vectors, through the wrapper', () => {
  test('the wrapper exports the vendored card, not a copy of it', () => {
    expect(stepCard).toBe(vendored.stepCard)
    expect(napkinSpec).toBe(vendored.napkinSpec)
    expect(NAPKIN).toBe(vendored.NAPKIN)
  })

  test('all 50 vectors reproduce: every field of every card is identical (toStrictEqual, so none is added or dropped)', () => {
    expect(vectors).toHaveLength(50)
    for (const v of vectors) expect({ name: v.name, card: stepCard(specs[v.spec], v.tp, v.load) }).toStrictEqual({ name: v.name, card: v.card })
  })

  test('the vectors cover both bounds and tensor parallelism 1 to 8, so the pass is not vacuous', () => {
    expect([...new Set(vectors.map((v) => v.card.bound))].sort()).toEqual(['flop', 'mem'])
    expect([...new Set(vectors.map((v) => v.tp))].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

/** The report's `claimValues` for each row: its parameters rounded to 0.01 (efficiencies) and 0.1 (the rest) [measured]. */
const CLAIMS: Record<PhysicsRowKey, { etaMem: number; etaFlop: number; layerUs: number; seqUs: number; linkGBs: number; harnessMs: number }> = {
  'h100-vllm-0-10-2-fp8': { etaMem: 0.89, etaFlop: 0.52, layerUs: 72.3, seqUs: 61.1, linkGBs: 213.2, harnessMs: 21.5 },
  'b200-vllm-0-10-2-fp8': { etaMem: 0.84, etaFlop: 0.46, layerUs: 61.8, seqUs: 32.6, linkGBs: 291.1, harnessMs: 52.3 },
  'b200-vllm-0-10-2-nvfp4': { etaMem: 0.76, etaFlop: 0.34, layerUs: 70, seqUs: 28.9, linkGBs: 283.7, harnessMs: 41.8 },
}

/** The report's two worked examples, each with the card it printed for the row's fit and for the napkin (η = 1) card [measured]. */
const EXAMPLES = [
  {
    id: '41187 (TPOT, InferenceX; 4 users at about 1k in and 1k out)',
    row: 'h100-vllm-0-10-2-fp8' as const,
    tp: 4,
    load: { seqs: 4, tokens: 4, kvTokens: 5529, attnPairs: 5529 },
    napkin: { memBytes: 17863967840, flops: 144723485440, linkBytes: 15728640, memS: 0.0053325277134328355, flopS: 7.312960355735219e-5, fixedS: 0, linkS: 0, stepS: 0.0053325277134328355, bound: 'mem', us: 5333 },
    card: { memBytes: 17863967840, flops: 144723485440, linkBytes: 15728640, memS: 0.0059916041723964445, flopS: 0.00014063385299490809, fixedS: 0.006024405223470141, linkS: 7.37888565954353e-5, stepS: 0.01208979825246202, bound: 'mem', us: 12090 },
    measuredMs: 11.776147370379336,
    cardErrorFraction: 0.02665155417552767,
  },
  {
    id: '40518 (TTFT, InferenceX; an 8k prompt beside 3 decodes)',
    row: 'b200-vllm-0-10-2-fp8' as const,
    tp: 1,
    load: { seqs: 4, tokens: 7376, kvTokens: 30875, attnPairs: 27207753 },
    napkin: { memBytes: 75608560000, flops: 1112077092024320, linkBytes: 0, memS: 0.00945107, flopS: 0.24712824267207112, fixedS: 0, linkS: 0, stepS: 0.24712824267207112, bound: 'flop', us: 247128 },
    card: { memBytes: 75608560000, flops: 1112077092024320, linkBytes: 0, memS: 0.01125127380952381, flopS: 0.5372353101566764, fixedS: 0.0050709489707082755, linkS: 0, stepS: 0.5423062591273846, bound: 'flop', us: 542306 },
    measuredMs: 654.017546446994,
    cardErrorFraction: -0.17080817946533144,
  },
] satisfies { id: string; row: PhysicsRowKey; tp: number; load: StepLoad; napkin: StepCard; card: StepCard; measuredMs: number; cardErrorFraction: number }[]

describe('the three fitted rows', () => {
  test('are the H100 FP8, B200 FP8 and B200 NVFP4 rows, in that order, and physicsRow finds each', () => {
    expect(PHYSICS_ROWS.map((row) => row.key)).toEqual(['h100-vllm-0-10-2-fp8', 'b200-vllm-0-10-2-fp8', 'b200-vllm-0-10-2-nvfp4'])
    for (const row of PHYSICS_ROWS) expect(physicsRow(row.key)).toBe(row)
    expect(() => physicsRow('h200-vllm-0-10-2-fp8' as PhysicsRowKey)).toThrow(RangeError)
  })

  test('carry the report\'s parameters: each rounds to the report\'s claimValues (0.01 for the efficiencies, 0.1 for the rest)', () => {
    for (const row of PHYSICS_ROWS) {
      const claim = CLAIMS[row.key]
      const { params } = row.spec
      const round = (x: number, to: number) => Math.round(x / to) * to
      expect([round(params.etaMem, 0.01), round(params.etaFlop, 0.01)].map((x) => Number(x.toFixed(2)))).toEqual([claim.etaMem, claim.etaFlop])
      expect([params.layerUs, params.seqUs, params.linkGBs!, row.harnessMs].map((x) => Number(round(x, 0.1).toFixed(1)))).toEqual([claim.layerUs, claim.seqUs, claim.linkGBs, claim.harnessMs])
    }
  })

  test('match the report at full precision: a digest of each row\'s parameters, refit ranges, box and envelope, computed from report.json', () => {
    // The digest is the SHA-256 of the compact, key-sorted JSON of `rows[].{key, params, refit, box, envelope}` of docs/physics/report.json,
    // computed with Python's json module on 2026-11-04 from `git show d478f91:docs/physics/report.json`, read on 2026-11-03 (SHA-256 7bda67b9…). The report
    // is not in this repository (VENDOR.md, "Referenced, not copied"), so this is how a changed digit anywhere in the transcription is caught.
    const asReport = PHYSICS_ROWS.map((row) => {
      const { etaMem, etaFlop, layerUs, seqUs, linkGBs } = row.spec.params
      const pair = (r: { lo: number; hi: number }) => [r.lo, r.hi]
      return {
        key: row.key,
        params: { etaMem, etaFlop, layerUs, seqUs, linkGBs, harnessMs: row.harnessMs },
        refit: Object.fromEntries(Object.entries(row.refit).map(([name, range]) => [name, pair(range)])),
        box: row.box,
        envelope: row.envelope,
      }
    })
    const digest = createHash('sha256').update(canonicalJson(asReport), 'utf8').digest('hex')
    expect(digest).toBe('cbd5db50dc63390578add96600c369653d610890ca26c77d669fd09d7d6749b6')
  })

  test('hold each fitted parameter inside its refit range, with the ranges in order', () => {
    for (const row of PHYSICS_ROWS) {
      const { params } = row.spec
      const value = { etaMem: params.etaMem, etaFlop: params.etaFlop, layerUs: params.layerUs, seqUs: params.seqUs, linkGBs: params.linkGBs!, harnessMs: row.harnessMs }
      for (const [name, range] of Object.entries(row.refit)) {
        const v = value[name as keyof typeof value]
        expect(range.lo, `${row.key} ${name}`).toBeLessThanOrEqual(v)
        expect(v, `${row.key} ${name}`).toBeLessThanOrEqual(range.hi)
      }
    }
  })

  test('take S5\'s H100 host term as the curriculum states it: t_seq 61.1 µs, refit range 53.0 to 69.9 µs', () => {
    const h100 = physicsRow('h100-vllm-0-10-2-fp8')
    expect(h100.spec.params.seqUs.toFixed(1)).toBe('61.1')
    expect([h100.refit.seqUs.lo.toFixed(1), h100.refit.seqUs.hi.toFixed(1)]).toEqual(['53.0', '69.9'])
  })

  test('share their chip and model with the vendored fixture where the fixture has the same row', () => {
    expect(physicsRow('h100-vllm-0-10-2-fp8').spec.chip).toEqual(specs['h100-fp8-example-a'].chip)
    expect(physicsRow('h100-vllm-0-10-2-fp8').spec.model).toEqual(specs['h100-fp8-example-a'].model)
    expect(physicsRow('b200-vllm-0-10-2-fp8').spec.chip).toEqual(specs['b200-fp8-example-b'].chip)
    expect(physicsRow('b200-vllm-0-10-2-fp8').spec.model).toEqual(specs['b200-fp8-example-b'].model)
  })

  test('derive what can be derived: the KV bytes per token, and NVFP4\'s weight bytes at 4.5 bits a weight', () => {
    const [h100, b200, nvfp4] = PHYSICS_ROWS
    for (const row of PHYSICS_ROWS) expect(row.spec.model.kvBytesPerToken).toBe(2 * 80 * 8 * 128)
    expect(h100.spec.model.weightBytes).toBe(h100.spec.model.params)
    expect(nvfp4.spec.model.weightBytes).toBe((70_550_000_000 * 4.5) / 8)
    expect(nvfp4.spec.model.weightBytes).toBe(39_684_375_000)
    expect({ ...nvfp4.spec.model, weightBytes: 0 }).toEqual({ ...b200.spec.model, weightBytes: 0 })
    expect({ ...nvfp4.spec.chip, peakFlops: 0 }).toEqual({ ...b200.spec.chip, peakFlops: 0 })
    expect(nvfp4.spec.chip.peakFlops).toBe(2 * b200.spec.chip.peakFlops)
  })

  test('keep the boxes the fit was checked in: tensor-parallel degrees, 64 sequences and an 8,192-token budget', () => {
    expect(PHYSICS_ROWS.map((row) => row.box.tp)).toEqual([[2, 4, 8], [1, 2, 4, 8], [1, 2, 4]])
    for (const row of PHYSICS_ROWS) {
      expect(row.box.maxNumSeqs).toBe(64)
      expect(row.box.batchTokens).toBe(8192)
      expect(row.box.shapes).toEqual([{ isl: 1024, osl: 1024 }, { isl: 1024, osl: 8192 }, { isl: 8192, osl: 1024 }])
      expect(row.envelope.tokens).toBe(8192)
      expect(row.envelope.decodeSeqs).toBe(64)
    }
  })

  for (const example of EXAMPLES) {
    test(`reproduce the report's worked example ${example.id}: the row's card, and the napkin card, field for field`, () => {
      const row = physicsRow(example.row)
      expect(stepCard(row.spec, example.tp, example.load)).toStrictEqual(example.card)
      expect(stepCard(napkinSpec(row.spec.chip, row.spec.model), example.tp, example.load)).toStrictEqual(example.napkin)
      // The report's own error figure: the card against the published measurement.
      const cardMs = example.card.us / 1000
      expect((cardMs - example.measuredMs) / example.measuredMs).toBeCloseTo(example.cardErrorFraction, 3)
    })
  }

  test('the B200 FP8 row\'s harness term is the report\'s: 52.304… ms, the residual that turns 542.3 ms into 594.6 ms against the measured 654.0', () => {
    const b200 = physicsRow('b200-vllm-0-10-2-fp8')
    expect(b200.harnessMs).toBe(52.304301197230366)
    expect(Math.round((542.306 + b200.harnessMs) * 1e4) / 1e4).toBe(594.6103)
  })

  test('give the curriculum\'s derived figures: at TP 4 with 64 sequences of 1,024 tokens the host term is 3.9 ms of 17.7 ms, at TP 2 with 4 it is 0.24 ms of 18.0 ms', () => {
    const h100 = physicsRow('h100-vllm-0-10-2-fp8')
    const decode = (seqs: number, context: number) => stepLoad(Array.from({ length: seqs }, () => ({ kind: 'decode' as const, context })))
    const wide = stepSplit(h100.spec, 4, decode(64, 1024))
    expect([wide.us, wide.hostSeqUs]).toEqual([17684, 3907])
    expect([(wide.us / 1000).toFixed(1), (wide.hostSeqUs / 1000).toFixed(1)]).toEqual(['17.7', '3.9'])
    const narrow = stepSplit(h100.spec, 2, decode(4, 1024))
    expect([narrow.us, narrow.hostSeqUs]).toEqual([18017, 244])
    expect([(narrow.us / 1000).toFixed(1), (narrow.hostSeqUs / 1000).toFixed(2)]).toEqual(['18.0', '0.24'])
  })

  test('record where they were read: the pinned commit and the report\'s SHA-256 are the ones VENDOR.md records', () => {
    const vendorPage = readFileSync(path.join(root, 'vendor/kernelspace/VENDOR.md'), 'utf8')
    const commit = /\| Pinned commit \| `([0-9a-f]{40})` \|/.exec(vendorPage)?.[1]
    const reference = /\| `docs\/physics\/report\.json` \| `([0-9a-f]{64})` \|/.exec(vendorPage)?.[1]
    expect(PHYSICS_SOURCE.commit).toBe(commit!)
    expect(PHYSICS_SOURCE.report.sha256).toBe(reference!)
    expect(PHYSICS_SOURCE.report.path).toBe('docs/physics/report.json')
    expect(PHYSICS_SOURCE.tag).toBe('measured')
    expect(PHYSICS_SOURCE.fitStatus).toContain('unsigned')
  })
})

describe('stepLoad', () => {
  test('rebuilds the loads of the vendored fixture\'s two worked examples from their batches (docs/specs/s5.md §3.6, §3.7)', () => {
    // Example A: four decoding sequences at context 1,382.25, taken as 5,529 / 4 in total; four equal sequences cannot make the odd total,
    // so the batch is three at 1,382 and one at 1,383.
    const a = named('example A')
    expect(stepLoad([1382, 1382, 1382, 1383].map((context) => ({ kind: 'decode' as const, context })))).toEqual(a.load)
    // Example B: a 7,373-token prompt prefilled in one step beside three decodes at 7,834.
    const b = named('example B')
    expect(stepLoad([{ kind: 'prefill', chunk: 7373, done: 0 }, ...[0, 1, 2].map(() => ({ kind: 'decode' as const, context: 7834 }))])).toEqual(b.load)
  })

  test('a prefill chunk after earlier chunks reads the whole prefix: K = h + p and A = p·h + p(p+1)/2', () => {
    expect(stepLoad([{ kind: 'prefill', chunk: 4, done: 10 }])).toEqual({ seqs: 1, tokens: 4, kvTokens: 14, attnPairs: 4 * 10 + 10 })
    // Two chunks of the same prompt make the same attention pairs as one chunk, which is why the step card can chunk freely.
    const whole = stepLoad([{ kind: 'prefill', chunk: 100, done: 0 }])
    const first = stepLoad([{ kind: 'prefill', chunk: 40, done: 0 }])
    const second = stepLoad([{ kind: 'prefill', chunk: 60, done: 40 }])
    expect(first.attnPairs + second.attnPairs).toBe(whole.attnPairs)
    expect(first.tokens + second.tokens).toBe(whole.tokens)
  })

  test('an empty batch carries nothing; a decode-only batch has T = seqs and K = A', () => {
    expect(stepLoad([])).toEqual({ seqs: 0, tokens: 0, kvTokens: 0, attnPairs: 0 })
    const load = stepLoad([{ kind: 'decode', context: 5 }, { kind: 'decode', context: 9 }])
    expect(load).toEqual({ seqs: 2, tokens: 2, kvTokens: 14, attnPairs: 14 })
  })

  test('rejects counts that are not integers in range, and a step too large to count exactly', () => {
    expect(() => stepLoad([{ kind: 'decode', context: 0 }])).toThrow(RangeError)
    expect(() => stepLoad([{ kind: 'decode', context: 1.5 }])).toThrow(RangeError)
    expect(() => stepLoad([{ kind: 'prefill', chunk: 0, done: 0 }])).toThrow(RangeError)
    expect(() => stepLoad([{ kind: 'prefill', chunk: 5, done: -1 }])).toThrow(RangeError)
    expect(() => stepLoad([{ kind: 'prefill', chunk: 2 ** 27, done: 2 ** 27 }])).toThrow(RangeError)
  })
})

describe('stepSplit', () => {
  test('adds up exactly: gpuUs + hostSeqUs is the card\'s us, for every vendored vector', () => {
    for (const v of vectors) {
      const split = stepSplit(specs[v.spec], v.tp, v.load)
      expect(split.us).toBe(v.card.us)
      expect(split.gpuUs + split.hostSeqUs).toBe(split.us)
      expect(split.gpuUs).toBeGreaterThanOrEqual(0)
      expect(split.hostSeqUs).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(split.gpuUs) && Number.isInteger(split.hostSeqUs)).toBe(true)
    }
  })

  test('takes seqs · seqUs, rounded, off the GPU step: 4 · 69 µs of example A', () => {
    const a = named('example A')
    const split = stepSplit(specs[a.spec], a.tp, a.load)
    expect(split.hostSeqUs).toBe(276)
    expect(split.gpuUs).toBe(a.card.us - 276)
  })

  test('is within a microsecond of the card priced without the term, since the two roundings differ by at most 1', () => {
    for (const v of vectors) {
      const spec = specs[v.spec]
      const without = stepCard({ ...spec, params: { ...spec.params, seqUs: 0 } }, v.tp, v.load).us
      expect(Math.abs(stepSplit(spec, v.tp, v.load).gpuUs - without)).toBeLessThanOrEqual(1)
    }
  })

  test('leaves the napkin card alone: it has no host term', () => {
    const row = physicsRow('h100-vllm-0-10-2-fp8')
    const load = { seqs: 8, tokens: 8, kvTokens: 8000, attnPairs: 8000 }
    const split = stepSplit(napkinSpec(row.spec.chip, row.spec.model), 1, load)
    expect(split.hostSeqUs).toBe(0)
    expect(split.gpuUs).toBe(split.us)
  })

  test('never lets the host term exceed the step, even for a card that is all host term', () => {
    const spec: CardSpec = { ...napkinSpec(physicsRow('h100-vllm-0-10-2-fp8').spec.chip, { params: 1, layers: 1, hidden: 1, kvBytesPerToken: 0, weightBytes: 0 }), params: { ...NAPKIN, seqUs: 0.5 } }
    const split = stepSplit(spec, 1, { seqs: 3, tokens: 3, kvTokens: 0, attnPairs: 0 })
    expect(split.hostSeqUs).toBeLessThanOrEqual(split.us)
    expect(split.gpuUs).toBeGreaterThanOrEqual(0)
    expect(split.gpuUs + split.hostSeqUs).toBe(split.us)
  })
})

describe('the rows as data', () => {
  test('every row is a complete CardSpec the card accepts, at every tensor-parallel degree of its box', () => {
    for (const row of PHYSICS_ROWS as readonly PhysicsRow[]) {
      for (const tp of row.box.tp) {
        const card = stepCard(row.spec, tp, { seqs: 8, tokens: 8, kvTokens: 8 * 1024, attnPairs: 8 * 1024 })
        expect(Number.isInteger(card.us) && card.us > 0).toBe(true)
        expect(card.bound).toBe('mem')
      }
    }
  })

  test('a step grows with tensor-parallel work it divides and with the sequences it carries', () => {
    const h100 = physicsRow('h100-vllm-0-10-2-fp8')
    const load = (seqs: number) => stepLoad(Array.from({ length: seqs }, () => ({ kind: 'decode' as const, context: 1024 })))
    expect(stepCard(h100.spec, 4, load(64)).us).toBeGreaterThan(stepCard(h100.spec, 4, load(8)).us)
    // S5's own finding (§3.6): TP 2 to TP 8 is far less than the 4x the napkin says, because something per step does not divide by TP.
    const napkin = (tp: number) => stepCard(napkinSpec(h100.spec.chip, h100.spec.model), tp, load(4)).us
    const fitted = (tp: number) => stepCard(h100.spec, tp, load(4)).us
    expect(napkin(2) / napkin(8)).toBeGreaterThan(3.9)
    expect(fitted(2) / fitted(8)).toBeLessThan(2)
  })
})
