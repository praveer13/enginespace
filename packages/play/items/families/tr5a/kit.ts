/**
 * What TR5a's item families share (W1b-T05): the page arithmetic of the hybrid KV model, the planner's group size, the way a set of blocks
 * is printed, and the generic parts of TR6's kit (the tolerances, the worked part of an item, the draws answer first), which TR5a takes as
 * they are. Each family keeps its own world, its own words and its own band in its own file.
 *
 * The rules here are the sim's (`packages/sim/kv/spec.ts`, `kvTableRule`, and `presets.ts`, `buildKvSpec`), written out again so that a family
 * brings no sim code with it (a family is a chunk of its own, D-059). tests/play/items-tr5a-*.test.ts holds every rule to the sim, and holds
 * the claims that each one rests on to what they say.
 *
 * Like the rest of packages/play it is pure (D-017): no DOM, no clock, no entropy, and no `Math.pow`, `**` or other function whose last bit
 * differs between engines.
 */
import { divCeil, divFloor, divRound } from '@es/sim/core'
import { code, num } from '../../rich'
import type { ItemTag, NumPart, Part } from '../../types'

export { ARITHMETIC, drawOutcome, EXACT, oneOf, shown, workedPart } from '../tr6/kit'
export type { Lure } from '../tr6/kit'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pages a group holds                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The pages that one group holds for a request of `tokens` tokens, by the rule of its kind (claims vllm.hybrid-kv.sliding-skipped-tokens,
 * vllm.hybrid-kv.mamba-hit and vllm.hybrid-kv.single-pool; the sim's `kvTableRule`). A block is `block` tokens.
 */
export const heldBy = {
  /** Every block of the request, from its first token to its last. */
  full: (tokens: number, block: number): number => divCeil(tokens, block),
  /**
   * The blocks that hold the last `window` tokens. The token being computed reads itself and the `window - 1` before it, so the tokens before
   * `tokens - window + 1` are skipped, and the group lets go of the whole blocks among them.
   */
  sliding: (tokens: number, block: number, window: number): number => divCeil(tokens, block) - divFloor(Math.max(0, tokens - window + 1), block),
  /** The newest `kept` blocks, or all of them when the request has fewer. */
  state: (tokens: number, block: number, kept: number): number => Math.min(divCeil(tokens, block), kept),
} as const

/** The tokens skipped by a sliding group, those before this one: `max(0, tokens - window + 1)`. */
export const skippedTokens = (tokens: number, window: number): number => Math.max(0, tokens - window + 1)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pages an adapter takes                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What an adapter is made of, for its weights per unit of rank (the sim's `kvLoraBytes` with the rank taken out). */
export interface AdapterShape {
  readonly hidden: number
  readonly layers: number
  readonly projections: number
  readonly weightBytes: number
}

/** What a page is made of: the layers of a group, the tokens of a block, and the bytes of a token in a layer (D-045: a block is a page). */
export interface PageShape {
  readonly layers: number
  readonly block: number
  readonly tokenBytes: number
}

/** The bytes an adapter weighs for each unit of its rank: a down matrix and an up matrix for each projection of each layer. */
export const unitBytes = (shape: AdapterShape): number => 2 * shape.hidden * shape.projections * shape.layers * shape.weightBytes

/** The bytes of a page. */
export const pageBytes = (shape: PageShape): number => shape.layers * shape.block * shape.tokenBytes

/** The pages an adapter of `rank` takes: its bytes over a page's, rounded up (the sim's `kvAdapterPages`). */
export const adapterPages = (rank: number, unit: number, page: number): number => divCeil(rank * unit, page)

/** The bytes of the adapter's last page that stay empty. */
export const emptyBytes = (rank: number, unit: number, page: number): number => adapterPages(rank, unit, page) * page - rank * unit

/** A share in percent to one decimal place: `part` over `whole`, rounded to the nearest tenth. */
export const percentOf = (part: number, whole: number): number => divRound(1000 * part, whole) / 10

/** The shapes of the course's invented adapters and pools. The lesson's adapter (65,536 bytes for each unit of rank, in pages of 163,840 bytes) is one of them. */
export const HIDDEN = [128, 192, 256, 320, 384, 512] as const
export const ADAPTED_LAYERS = [6, 8, 10, 12, 14, 16, 20, 24] as const
export const PROJECTIONS = [2, 3, 4] as const
export const GROUP_LAYERS = [5, 6, 7, 8, 9, 10, 11, 12, 14, 16] as const
export const TOKEN_BYTES = [512, 768, 1024, 1536, 2048] as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* How the planner groups layers                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The number of layers in every group: the fewest of any kind (claim vllm.hybrid-kv.group-size), or the most when that is under 1.5 times the
 * fewest (claim vllm.hybrid-kv.group-size-near). In integers: the most is under 1.5 times the fewest when twice the most is under three times it.
 */
export function groupSizeOf(counts: readonly number[]): number {
  const fewest = Math.min(...counts)
  const most = Math.max(...counts)
  return 2 * most < 3 * fewest ? most : fewest
}

/** The groups a kind of `layers` layers makes at a group size: `⌈layers ÷ size⌉` (claim vllm.hybrid-kv.padding-layers: the last is padded). */
export const groupsFor = (layers: number, size: number): number => divCeil(layers, size)

/** The greatest common divisor, for the grouping by the ratio of the layers that the design document's second case makes. */
export function gcd(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const r = x % y
    x = y
    y = r
  }
  return x
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A count with its unit in the singular or the plural. */
export const counted = (value: number, one: string, many: string, tag: ItemTag = 'derived'): NumPart => num(value, { unit: value === 1 ? one : many, tag })

export const pagesOf = (value: number, tag: ItemTag = 'derived'): NumPart => counted(value, 'page', 'pages', tag)
export const tokensOf = (value: number, tag: ItemTag = 'derived'): NumPart => counted(value, 'token', 'tokens', tag)
export const blocksOf = (value: number, tag: ItemTag = 'derived'): NumPart => counted(value, 'block', 'blocks', tag)
export const layersOf = (value: number, tag: ItemTag = 'synthetic'): NumPart => counted(value, 'layer', 'layers', tag)
export const groupsOf = (value: number, tag: ItemTag = 'derived'): NumPart => counted(value, 'group', 'groups', tag)

/**
 * A set of block numbers as a run of code: a run of three or more as `a to b`, the others one by one, all in order. `0 to 9` is ten blocks;
 * `6, 7, 9` is three. The numbers are names of blocks and not quantities, so they are code, as a list of sizes is in TR2's families.
 */
export function blocksText(blocks: readonly number[]): Part {
  const sorted = [...new Set(blocks)].sort((a, b) => a - b)
  const pieces: string[] = []
  let at = 0
  while (at < sorted.length) {
    let end = at
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1
    if (end - at >= 2) pieces.push(`${sorted[at]} to ${sorted[end]}`)
    else for (let i = at; i <= end; i += 1) pieces.push(String(sorted[i]))
    at = end + 1
  }
  return code(pieces.length === 0 ? 'none' : pieces.join(', '))
}
