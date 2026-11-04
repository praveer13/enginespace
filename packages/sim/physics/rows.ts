// The three rows kernelspace fitted the S5 step card to (ARCHITECTURE §5.2 `physics`, §13; WORLD §2.11, §4.1): Llama-3-70B on an
// H100 SXM and on a B200 at FP8, and on a B200 at NVFP4, under vLLM 0.10.2.
//
// Where every number comes from. All of them are [measured], meaning read on 2026-11-03 from kernelspace at d478f91 with
// `git show`, and none is edited:
//   - the fitted parameters, their refit ranges, the fitted box and the step envelope are the `rows` of docs/physics/report.json
//     (SHA-256 7bda67b9…, below), which the fit adopted on 2026-10-18 without the owner's signature;
//   - the chip and model shapes are the ones its generated table, src/lib/world/physics/table.ts, builds from its claims
//     (hw.h100-sxm.*, hw.b200.*, model.llama3-70b.*). The report holds no shapes.
// VENDOR.md ("Referenced, not copied") records why report.json is not copied: its points carry InferenceX's values, whose
// attribution stays in kernelspace.
//
// What the numbers are. The parameters are a fit "under this form", not hardware facts: the same data read by two other
// equally good forms splits the step differently (docs/specs/s5.md §3.4). A scene may show them as "the engine's numbers",
// and no item grades a learner on one (WORLD §1, item 7). The box is where the fit was checked: outside it, a screen says
// "napkin" or "estimated" (WORLD §4.2). `harnessMs` is the fit's TTFT residual, outside the engine, and `stepCard` never reads it.
//
// The vendored card and its golden vectors are tested in tests/vendor/physics.test.ts. The rows are tested in
// tests/sim/physics.test.ts against the report's own worked examples, its rounded claim values and a digest of its rows.

import type { CardSpec, ChipShape, ModelShape, RowBox, RowEnvelope } from './card'

export type PhysicsRowKey = 'h100-vllm-0-10-2-fp8' | 'b200-vllm-0-10-2-fp8' | 'b200-vllm-0-10-2-nvfp4'

/** Where the rows were read, for a card's "Calibrated against" line. */
export const PHYSICS_SOURCE = {
  tag: 'measured',
  readOn: '2026-11-03',
  repository: 'kernelspace',
  commit: 'd478f91a0af590f03fcfd76ee73149fa70b28e51',
  report: { path: 'docs/physics/report.json', sha256: '7bda67b919972343ed6fc93cf8655f5525ce6fada2f79b4a780c629404a60eb9' },
  shapes: 'src/lib/world/physics/table.ts',
  fitStatus: 'adopted by the build on 2026-10-18, unsigned',
  sweep: 'one InferenceX sweep: Llama-3.3-70B, vLLM 0.10.2, published 2025-10-29',
} as const

/** A closed interval: a parameter's range over the refits the fit's protocol runs. */
export interface ParamRange {
  readonly lo: number
  readonly hi: number
}

export interface PhysicsRow {
  readonly key: PhysicsRowKey
  /** The row as kernelspace labels it. */
  readonly label: string
  /** The card's inputs: chip, model and the fitted parameters. */
  readonly spec: CardSpec
  /** The fit's TTFT residual in ms: what the engine's admission-to-first-token window misses. Not physics, and not in the card. */
  readonly harnessMs: number
  /** The range each fitted parameter takes over the protocol's refits ("this fit's split; refit range x to y"). */
  readonly refit: {
    readonly etaMem: ParamRange
    readonly etaFlop: ParamRange
    readonly layerUs: ParamRange
    readonly seqUs: ParamRange
    readonly linkGBs: ParamRange
    readonly harnessMs: ParamRange
  }
  /** The configurations the row was fitted and checked on. */
  readonly box: RowBox
  /** The largest step the replays showed, per GPU where a division by TP applies. */
  readonly envelope: RowEnvelope
}

/** H100 SXM: HBM bandwidth 3.35 TB/s, FP8 dense peak 1,979 TFLOP/s, capacity 80 GB (claims hw.h100-sxm.hbm-bw, .fp8-dense, .hbm-capacity). */
const H100_SXM_FP8: ChipShape = { bwBps: 3_350_000_000_000, peakFlops: 1_979_000_000_000_000, hbmBytes: 80_000_000_000 }
/** B200: 8 TB/s, FP8 dense peak 4,500 TFLOP/s, 180 GB (hw.b200.*; kernelspace keeps a note on the 192 GB the vendor quotes). */
const B200_FP8: ChipShape = { bwBps: 8_000_000_000_000, peakFlops: 4_500_000_000_000_000, hbmBytes: 180_000_000_000 }
/** B200 at FP4: the same chip with a dense peak of 9,000 TFLOP/s (hw.b200.fp4-dense). */
const B200_FP4: ChipShape = { bwBps: 8_000_000_000_000, peakFlops: 9_000_000_000_000_000, hbmBytes: 180_000_000_000 }

/**
 * Llama-3-70B with FP8 weights and FP8 KV: 70.55e9 parameters, 80 layers, hidden size 8,192, one byte per weight, and
 * 2 · 80 · 8 · 128 = 163,840 KV bytes per token (model.llama3-70b.*).
 */
const LLAMA3_70B_FP8: ModelShape = { params: 70_550_000_000, layers: 80, hidden: 8192, kvBytesPerToken: 163_840, weightBytes: 70_550_000_000 }
/** The same model with NVFP4 weights, 4.5 bits each: 70.55e9 · 4.5 / 8 = 39,684,375,000 bytes [derived], and the KV still FP8. */
const LLAMA3_70B_NVFP4: ModelShape = { ...LLAMA3_70B_FP8, weightBytes: 39_684_375_000 }

const BOX_SHAPES = [
  { isl: 1024, osl: 1024 },
  { isl: 1024, osl: 8192 },
  { isl: 8192, osl: 1024 },
] as const

export const PHYSICS_ROWS: readonly PhysicsRow[] = [
  {
    key: 'h100-vllm-0-10-2-fp8',
    label: 'H100 SXM · vLLM 0.10.2 · FP8',
    spec: {
      chip: H100_SXM_FP8,
      model: LLAMA3_70B_FP8,
      params: { etaMem: 0.89, etaFlop: 0.52, layerUs: 72.25251796224599, seqUs: 61.05094662261563, linkGBs: 213.15738887561244 },
    },
    harnessMs: 21.478665880471507,
    refit: {
      etaMem: { lo: 0.87, hi: 0.91 },
      etaFlop: { lo: 0.5, hi: 0.56 },
      layerUs: { lo: 69.7665374279724, hi: 73.50750718808852 },
      seqUs: { lo: 52.98707020108217, hi: 69.92766815376628 },
      linkGBs: { lo: 160.56232288994428, hi: 250.3838841495788 },
      harnessMs: { lo: 17.493133189949308, hi: 23.118093753267996 },
    },
    box: { tp: [2, 4, 8], maxNumSeqs: 64, shapes: BOX_SHAPES, batchTokens: 8192 },
    envelope: { tokens: 8192, decodeSeqs: 64, kvTokensPerGpu: 129831.25, attnPairsPerGpu: 16775983.5 },
  },
  {
    key: 'b200-vllm-0-10-2-fp8',
    label: 'B200 · vLLM 0.10.2 · FP8',
    spec: {
      chip: B200_FP8,
      model: LLAMA3_70B_FP8,
      params: { etaMem: 0.84, etaFlop: 0.46, layerUs: 61.75659298019176, seqUs: 32.60538307323376, linkGBs: 291.10006545048697 },
    },
    harnessMs: 52.304301197230366,
    refit: {
      etaMem: { lo: 0.82, hi: 0.85 },
      etaFlop: { lo: 0.44, hi: 0.48 },
      layerUs: { lo: 61.088981674846195, hi: 62.153127966696886 },
      seqUs: { lo: 27.014896509716376, hi: 37.50425789057904 },
      linkGBs: { lo: 280.7530803947304, hi: 316.05307022116847 },
      harnessMs: { lo: 50.25279602023868, hi: 53.63217469307961 },
    },
    box: { tp: [1, 2, 4, 8], maxNumSeqs: 64, shapes: BOX_SHAPES, batchTokens: 8192 },
    envelope: { tokens: 8192, decodeSeqs: 64, kvTokensPerGpu: 265077, attnPairsPerGpu: 33561011 },
  },
  {
    key: 'b200-vllm-0-10-2-nvfp4',
    label: 'B200 · vLLM 0.10.2 · NVFP4',
    spec: {
      chip: B200_FP4,
      model: LLAMA3_70B_NVFP4,
      params: { etaMem: 0.76, etaFlop: 0.34, layerUs: 69.96641623759986, seqUs: 28.947309086175345, linkGBs: 283.73042692659664 },
    },
    harnessMs: 41.75697752543088,
    refit: {
      etaMem: { lo: 0.73, hi: 0.77 },
      etaFlop: { lo: 0.34, hi: 0.36 },
      layerUs: { lo: 69.1413976802407, hi: 70.9357279061238 },
      seqUs: { lo: 21.20372780487031, hi: 31.752009422436583 },
      linkGBs: { lo: 272.02106752083176, hi: 289.4547955191977 },
      harnessMs: { lo: 40.95016475379919, hi: 42.68375498498712 },
    },
    box: { tp: [1, 2, 4], maxNumSeqs: 64, shapes: BOX_SHAPES, batchTokens: 8192 },
    envelope: { tokens: 8192, decodeSeqs: 64, kvTokensPerGpu: 522859, attnPairsPerGpu: 33663286 },
  },
]

/** One of the three rows. */
export function physicsRow(key: PhysicsRowKey): PhysicsRow {
  const row = PHYSICS_ROWS.find((candidate) => candidate.key === key)
  if (row === undefined) throw new RangeError(`no physics row "${key}"`)
  return row
}
