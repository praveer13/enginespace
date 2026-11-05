// The hash of a block (ARCHITECTURE §5.4, D-045): what prefix caching keys the cache on.
//
// A block's hash chains the hash of the block before it, its token ids and its extra keys (vllm.kv-hash.chain): two blocks are the same
// block only when every token before them and in them is the same. The extra key is the adapter, for a block of an adapter's request
// (vllm.kv-hash.lora-extra-key), so the same tokens under two adapters are different blocks.
//
// vLLM defaults to SHA-256 (vllm.kv-hash.sha256-default). The model needs a hash that an integer-only program computes the same way in
// every runtime, in the Python grader and in a Rust module (§5.1, §9.8), that is cheap, and that a pool of a few thousand blocks never
// collides in. This is two chains of the splitmix32 mixing step that kernelspace's generator uses (vendor/kernelspace/src/lib/rng.ts),
// one per half of the result. In words, for a 53-bit result with `lo` its low 32 bits and `hi` its high 21:
//
//   mix(h, x)  h = (h + x + 0x9e3779b9) mod 2^32; h ^= h >> 16; h = h × 0x21f0aaad mod 2^32; h ^= h >> 15;
//              h = h × 0x735a2d97 mod 2^32; h ^= h >> 15; return h
//   a = mix(mix(0x6a09e667 ^ parent_lo, 1), parent_hi)         b = mix(mix(0xbb67ae85 ^ parent_hi, 2), parent_lo)
//   a = mix(a, length)                                           b = mix(b, length)         (length = the block's token count)
//   for each token t:   a = mix(a, t)                            b = mix(b, t ^ 0x5bd1e995)
//   a = mix(a, extra)                                            b = mix(b, extra ^ 0x1b873593)
//   hash = (b >> 11) × 2^32 + a
//
// where a token and `extra` are read as unsigned 32-bit integers, `^` is on 32-bit values, and `parent` is 0 for the first block
// (a hash is 0 with a chance of 2^-53, which the model ignores). `extra` is 0 for the base model and the adapter's id plus 1 for an
// adapter, so an adapter's id never collides with the base's.

const TWO_32 = 4294967296

function mix(h: number, x: number): number {
  let v = (h + x + 0x9e3779b9) | 0
  v ^= v >>> 16
  v = Math.imul(v, 0x21f0aaad)
  v ^= v >>> 15
  v = Math.imul(v, 0x735a2d97)
  v ^= v >>> 15
  return v
}

/**
 * The hash of the block that holds `tokens[from … to - 1]`, after the block with hash `parent` (0 for none), under the extra key
 * `extra`. The result is an integer from 0 to 2^53 - 1.
 */
export function kvBlockHash(parent: number, tokens: readonly number[], from: number, to: number, extra: number): number {
  const lo = parent >>> 0
  const hi = (parent - lo) / TWO_32
  let a = mix(mix(0x6a09e667 ^ lo, 1), hi)
  let b = mix(mix(0xbb67ae85 ^ hi, 2), lo)
  const length = to - from
  a = mix(a, length)
  b = mix(b, length)
  for (let i = from; i < to; i++) {
    const t = tokens[i]
    a = mix(a, t)
    b = mix(b, t ^ 0x5bd1e995)
  }
  a = mix(a, extra)
  b = mix(b, extra ^ 0x1b873593)
  return (b >>> 11) * TWO_32 + (a >>> 0)
}

/**
 * The chain of the first `blocks` blocks of `tokens`, each `blockTokens` long: `chain[j]` is the hash of block j, which holds
 * `tokens[j × blockTokens … (j + 1) × blockTokens - 1]`. The caller keeps `blocks × blockTokens` within the tokens it has.
 */
export function kvChain(tokens: readonly number[], blocks: number, blockTokens: number, extra: number): number[] {
  const chain = new Array<number>(blocks)
  let parent = 0
  for (let j = 0; j < blocks; j++) {
    parent = kvBlockHash(parent, tokens, j * blockTokens, (j + 1) * blockTokens, extra)
    chain[j] = parent
  }
  return chain
}

/** The extra key of a request: 0 for the base model, the adapter's id plus 1 for an adapter. */
export const kvExtraKey = (adapter: number | null | undefined): number => (adapter === null || adapter === undefined ? 0 : adapter + 1)
