// Per-GPU engine defaults (ARCHITECTURE §5.3, "Which engine the model follows"; WORLD §2.3): the numbers an engine starts with on a
// 24 GB card and on an 80 GB one, read from the pinned source as claims. The same command is a different configuration on a 4090 and
// on an H100 (research vllm M9), so a run of the model, and every F-lane artifact, names the card it ran on.
//
// The rows are data, and tests/sim/engine-defaults.test.ts holds every number to the claim named beside it: a re-pin that changes a
// claim fails that test until this file follows. `vllmBatchDefaults` is the rule behind vLLM's rows (`get_batch_defaults`), and the
// bucket functions are SGLang's lists of captured sizes (claims sglang.cudagraph.decode-buckets, sglang.cudagraph.prefill-buckets).

/** The two GPU classes of the course's labs: the learner's 4090, and the H100 hours of W2 (PRODUCT.md, "Learner GPU cost"). */
export type GpuClassId = 'rtx-4090' | 'h100'

/** vLLM's `get_batch_defaults` for one tier of card memory (claims vllm.batch-defaults.*). */
export interface VllmBatchDefaults {
  /** `max_num_batched_tokens` for `vllm serve`. */
  readonly serverTokens: number
  /** `max_num_batched_tokens` for the offline `LLM` class. */
  readonly offlineTokens: number
  /** `max_num_seqs`, for both. */
  readonly seqs: number
}

/** SGLang's defaults that depend on the card's memory (claims sglang.sched.chunked-prefill-size.small, sglang.sched.chunked-prefill-size.large, sglang.cudagraph.decode-max-bs.small, sglang.cudagraph.decode-max-bs.large). */
export interface SglangDefaults {
  readonly chunkedPrefillSize: number
  /** The largest batch whose decode runs in a graph: below tensor-parallel size 4, and from it. */
  readonly decodeGraphMaxBs: { readonly tpBelow4: number; readonly tp4Up: number }
}

export interface EngineDefaults {
  readonly gpu: GpuClassId
  /** What a picker or a card line calls it. */
  readonly label: string
  /** The memory class the engines' source puts the card in, from SGLang's own comment (claims sglang.cudagraph.decode-max-bs.small, sglang.cudagraph.decode-max-bs.large). */
  readonly memoryClass: string
  readonly vllm: VllmBatchDefaults
  readonly sglang: SglangDefaults
}

/**
 * `get_batch_defaults` (claims vllm.batch-defaults.threshold.large-gib, vllm.batch-defaults.xlarge.tokens, vllm.batch-defaults.xlarge.seqs): a card of 160 GiB or more gets the largest
 * numbers, a card of 70 GiB or more that is not an A100 or a GB10 gets the large ones, and every other card the small ones. An A100 has the
 * memory and stays small, because large defaults cost it throughput.
 */
export function vllmBatchDefaults(card: { readonly memoryGiB: number; readonly a100?: boolean; readonly gb10?: boolean }): VllmBatchDefaults {
  if (!Number.isFinite(card.memoryGiB) || card.memoryGiB < 0) throw new RangeError(`memoryGiB is a size of at least 0, got ${card.memoryGiB}`)
  if (card.memoryGiB >= 160) return { serverTokens: 16384, offlineTokens: 16384, seqs: 1024 }
  if (card.memoryGiB >= 70 && card.a100 !== true && card.gb10 !== true) return { serverTokens: 8192, offlineTokens: 16384, seqs: 1024 }
  return { serverTokens: 2048, offlineTokens: 8192, seqs: 256 }
}

/**
 * The rows at the pin. The 4090 has 24 GB, under vLLM's 70 GiB line, and SGLang's source files it with the A10 and the 5090 in its 20 to
 * 35 GiB class [derived]. The H100 has 80 GB, over the line and not an A100, and SGLang files it with the A100 in its 60 to 90 GiB class.
 */
export const ENGINE_DEFAULTS: Readonly<Record<GpuClassId, EngineDefaults>> = Object.freeze({
  'rtx-4090': Object.freeze({
    gpu: 'rtx-4090',
    label: 'RTX 4090 (24 GB)',
    memoryClass: '20 GiB to under 35 GiB',
    vllm: Object.freeze({ serverTokens: 2048, offlineTokens: 8192, seqs: 256 }),
    sglang: Object.freeze({ chunkedPrefillSize: 4096, decodeGraphMaxBs: Object.freeze({ tpBelow4: 48, tp4Up: 160 }) }),
  }),
  h100: Object.freeze({
    gpu: 'h100',
    label: 'H100 (80 GB)',
    memoryClass: '60 GiB to under 90 GiB',
    vllm: Object.freeze({ serverTokens: 8192, offlineTokens: 16384, seqs: 1024 }),
    sglang: Object.freeze({ chunkedPrefillSize: 8192, decodeGraphMaxBs: Object.freeze({ tpBelow4: 256, tp4Up: 512 }) }),
  }),
} as const)

/** The claim that holds each number of a row, by the path of the number, for the test and for the In-production card (W1-T13). */
export const ENGINE_DEFAULT_CLAIMS: Readonly<Record<GpuClassId, Readonly<Record<string, string>>>> = Object.freeze({
  'rtx-4090': Object.freeze({
    'vllm.serverTokens': 'vllm.batch-defaults.small.server-tokens',
    'vllm.offlineTokens': 'vllm.batch-defaults.small.offline-tokens',
    'vllm.seqs': 'vllm.batch-defaults.small.seqs',
    'sglang.chunkedPrefillSize': 'sglang.sched.chunked-prefill-size.small',
    'sglang.decodeGraphMaxBs.tpBelow4': 'sglang.cudagraph.decode-max-bs.small',
  }),
  h100: Object.freeze({
    'vllm.serverTokens': 'vllm.batch-defaults.large.server-tokens',
    'vllm.offlineTokens': 'vllm.batch-defaults.large.offline-tokens',
    'vllm.seqs': 'vllm.batch-defaults.large.seqs',
    'sglang.chunkedPrefillSize': 'sglang.sched.chunked-prefill-size.large',
    'sglang.decodeGraphMaxBs.tpBelow4': 'sglang.cudagraph.decode-max-bs.large',
  }),
})

export function engineDefaults(gpu: GpuClassId): EngineDefaults {
  return ENGINE_DEFAULTS[gpu]
}

function range(lo: number, end: number, step: number): number[] {
  const out: number[] = []
  for (let n = lo; n < end; n += step) out.push(n)
  return out
}

/**
 * SGLang's decode graph batch sizes without speculation: 1, 2, 4, 8 and 12, then 16 to 256 in steps of 8, then 272 to 496 in steps of 16,
 * then 512 up to `maxBs` in steps of 32, cut at `maxBs`, and `maxBs` itself added if it is missing (claim sglang.cudagraph.decode-buckets). A decode batch is
 * padded up to the next size in the list, and one above `maxBs` runs without a graph. On a 4090 with tensor parallelism below 4,
 * `maxBs` is 48 (claim sglang.cudagraph.decode-max-bs.small).
 */
export function sglangDecodeBuckets(maxBs: number): number[] {
  if (!Number.isSafeInteger(maxBs) || maxBs < 1) throw new RangeError(`maxBs is an integer of at least 1, got ${maxBs}`)
  const sizes = [1, 2, 4, 8, 12, ...range(16, 257, 8), ...range(272, 512, 16), ...range(512, maxBs + 1, 32)].filter((size) => size <= maxBs)
  if (!sizes.includes(maxBs)) sizes.push(maxBs)
  return sizes
}

/**
 * SGLang's prefill graph sizes, which count tokens and not requests: 4 to 32 in steps of 4, 48 to 256 in steps of 16, 288 to 512 in steps
 * of 32, 576 to 1,024 in steps of 64, 1,280 to 4,096 in steps of 256, then steps of 512, all cut at `maxTokens` (claims sglang.cudagraph.prefill-buckets,
 * sglang.cudagraph.prefill-max-default). The list is not extended to `maxTokens`.
 */
export function sglangPrefillBuckets(maxTokens: number): number[] {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new RangeError(`maxTokens is an integer of at least 1, got ${maxTokens}`)
  return [...range(4, 33, 4), ...range(48, 257, 16), ...range(288, 513, 32), ...range(576, 1025, 64), ...range(1280, 4097, 256), ...range(4608, maxTokens + 1, 512)].filter((size) => size <= maxTokens)
}

/** The size SGLang pads a decode batch of `n` to, or null when it is above the largest, and so runs without a graph. */
export function sglangPaddedSize(buckets: readonly number[], n: number): number | null {
  for (const size of buckets) if (size >= n) return size
  return null
}
