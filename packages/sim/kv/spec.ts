// The arithmetic of a spec (ARCHITECTURE §5.4, D-045): that every group's block is exactly one page, how many blocks a group holds for a
// request of a given length, which blocks a prefix hit needs, and how many pages an adapter takes.
//
// A group's rule says which of a request's blocks it keeps. For a request of L tokens, the group's table has ⌈L ÷ B⌉ entries, one per
// block of B tokens, and its first `skip` entries have been let go (null):
//   full      skip = 0
//   sliding   skip = ⌊max(0, L - W + 1) ÷ B⌋. The next token attends to itself and the W - 1 before it, so the tokens before
//             L - W + 1 are skipped, and a block is let go once every token in it is skipped (vllm.hybrid-kv.sliding-skipped-tokens)
//   state     skip = max(0, ⌈L ÷ B⌉ - statePages): the newest `statePages` blocks stay
// The blocks held are the entries from `skip` on. For a 112-token request with 16-token blocks and a 32-token window that is
// 7 - 5 = 2 sliding blocks, which is the 11 blocks of vLLM's worked example once the full group's 7 are added to the two sliding groups'
// 2 each (vllm.hybrid-kv.doc-example-blocks).

import { divCeil, divFloor } from '../core/int'
import type { KvGroupSpec, KvSpec } from './types'

/** A pool, a block or a token count beyond this is not a model of anything: it is a typo that would take a minute to simulate. */
const LIMIT = 1 << 20

const isCount = (x: unknown, min: number): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= min

function gcd(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const r = x % y
    x = y
    y = r
  }
  return x
}

/**
 * The tokens that a prefix hit is a multiple of: the least common multiple of the groups' block sizes. A hit that ended inside a block
 * of any group would leave that group without the block's tokens, so the engine rounds a hit down to this (vllm.hybrid-kv.hit-alignment).
 */
export function kvAlignment(spec: KvSpec): number {
  let lcm = 1
  for (const g of spec.groups) {
    lcm = (lcm / gcd(lcm, g.blockTokens)) * g.blockTokens
    if (!Number.isSafeInteger(lcm) || lcm > LIMIT) throw new RangeError(`the groups' block sizes have a least common multiple beyond ${LIMIT}`)
  }
  return lcm
}

/** Bytes in one block of `group`: the layers it serves and pads, each holding `blockTokens` tokens. D-045 says this is `spec.pageBytes`. */
export function kvBlockBytes(spec: KvSpec, group: KvGroupSpec): number {
  return (group.layers + (group.padLayers ?? 0)) * group.blockTokens * spec.tokenBytes
}

/**
 * What is wrong with a spec, in sentences; empty when there is nothing. The one that matters most is D-045's: a group whose block is not
 * exactly one page would teach a pool that no engine uses at the pins.
 */
export function kvSpecProblems(spec: KvSpec): readonly string[] {
  const problems: string[] = []
  const bad = (text: string) => problems.push(text)
  if (!isCount(spec.poolPages, 1) || spec.poolPages > LIMIT) bad(`poolPages must be an integer from 1 to ${LIMIT}, got ${spec.poolPages}`)
  if (!isCount(spec.pageBytes, 1)) bad(`pageBytes must be a positive integer, got ${spec.pageBytes}`)
  if (!isCount(spec.tokenBytes, 1)) bad(`tokenBytes must be a positive integer, got ${spec.tokenBytes}`)
  if (typeof spec.prefixCaching !== 'boolean') bad(`prefixCaching must be true or false, got ${String(spec.prefixCaching)}`)
  if (spec.adapterSlots !== undefined && !isCount(spec.adapterSlots, 1)) bad(`adapterSlots must be a positive integer when it is set, got ${spec.adapterSlots}`)
  if (spec.groups.length === 0) bad('a spec has at least one group')
  const seen = new Set<string>()
  let padding = 0
  for (const g of spec.groups) {
    const name = `group "${g.id}"`
    if (typeof g.id !== 'string' || g.id === '') bad(`a group needs an id, got ${JSON.stringify(g.id)}`)
    else if (seen.has(g.id)) bad(`${name} appears twice`)
    seen.add(g.id)
    if (g.kind !== 'full' && g.kind !== 'sliding' && g.kind !== 'state') bad(`${name}: kind must be full, sliding or state, got ${String(g.kind)}`)
    if (!isCount(g.layers, 1)) bad(`${name}: layers must be a positive integer, got ${g.layers}`)
    if (g.padLayers !== undefined && !isCount(g.padLayers, 0)) bad(`${name}: padLayers must be a non-negative integer when it is set, got ${g.padLayers}`)
    if (!isCount(g.blockTokens, 1) || g.blockTokens > LIMIT) bad(`${name}: blockTokens must be an integer from 1 to ${LIMIT}, got ${g.blockTokens}`)
    if (g.kind === 'sliding') {
      if (!isCount(g.window, 2)) bad(`${name}: a sliding group needs a window of at least 2 tokens, got ${String(g.window)}`)
      if (g.statePages !== undefined) bad(`${name}: only a state group has statePages`)
    } else if (g.kind === 'state') {
      if (!isCount(g.statePages, 1)) bad(`${name}: a state group needs statePages of at least 1, got ${String(g.statePages)}`)
      if (g.window !== undefined) bad(`${name}: only a sliding group has a window`)
      if (g.stateBytes !== undefined) {
        if (!isCount(g.stateBytes, 1)) bad(`${name}: stateBytes must be a positive integer when it is set, got ${g.stateBytes}`)
        else if (isCount(g.blockTokens, 1) && isCount(spec.tokenBytes, 1) && g.stateBytes > g.blockTokens * spec.tokenBytes) {
          bad(`${name}: a layer's state of ${g.stateBytes} bytes does not fit its ${g.blockTokens * spec.tokenBytes}-byte slice of a block`)
        }
      }
    } else if (g.window !== undefined || g.statePages !== undefined || g.stateBytes !== undefined) {
      bad(`${name}: a full group has neither a window nor statePages`)
    }
    if (g.kind === 'sliding' && g.stateBytes !== undefined) bad(`${name}: only a state group has stateBytes`)
    if (isCount(g.layers, 1) && isCount(g.blockTokens, 1) && isCount(spec.tokenBytes, 1) && isCount(spec.pageBytes, 1)) {
      const bytes = kvBlockBytes(spec, g)
      if (bytes !== spec.pageBytes) bad(`${name}: a block is ${bytes} bytes, and the page is ${spec.pageBytes}: every group's block must be exactly one page (D-045)`)
    }
    padding += g.padLayers ?? 0
  }
  if (!isCount(spec.paddingLayers, 0)) bad(`paddingLayers must be a non-negative integer, got ${spec.paddingLayers}`)
  else if (spec.paddingLayers !== padding) bad(`paddingLayers is ${spec.paddingLayers}, and the groups pad ${padding} layers`)
  if (problems.length === 0) {
    try {
      kvAlignment(spec)
    } catch (e) {
      bad(e instanceof Error ? e.message : String(e))
    }
  }
  return problems
}

/** Throws a RangeError that lists every problem of a spec, or returns when there are none. */
export function assertKvSpec(spec: KvSpec): void {
  const problems = kvSpecProblems(spec)
  if (problems.length > 0) throw new RangeError(`not a KV spec: ${problems.join('; ')}`)
}

/** How a request of `tokens` tokens fills a group's table: its length in blocks, and how many leading entries have been let go. */
export interface KvTableRule {
  readonly blocks: number
  readonly skip: number
}

export function kvTableRule(group: KvGroupSpec, tokens: number): KvTableRule {
  const blocks = tokens <= 0 ? 0 : divCeil(tokens, group.blockTokens)
  if (group.kind === 'sliding') {
    const window = group.window ?? 2
    const skipped = tokens - window + 1
    return { blocks, skip: skipped <= 0 ? 0 : divFloor(skipped, group.blockTokens) }
  }
  if (group.kind === 'state') return { blocks, skip: Math.max(0, blocks - (group.statePages ?? 1)) }
  return { blocks, skip: 0 }
}

/**
 * Pages that group `groupId` holds for a request of `tokens` tokens (GAMES.md §8, `blocksHeld`). The doc's example is 7 for the full
 * group and 2 for each sliding group of `two-kinds`, at 112 tokens.
 */
export function kvBlocksHeld(spec: KvSpec, groupId: string, tokens: number): number {
  const group = spec.groups.find((g) => g.id === groupId)
  if (group === undefined) throw new RangeError(`the spec has no group "${groupId}"`)
  const rule = kvTableRule(group, tokens)
  return rule.blocks - rule.skip
}

/** Pages that every group together holds for a request of `tokens` tokens. */
export function kvPagesHeld(spec: KvSpec, tokens: number): number {
  let total = 0
  for (const g of spec.groups) {
    const rule = kvTableRule(g, tokens)
    total += rule.blocks - rule.skip
  }
  return total
}

/**
 * How many blocks before its edge a group needs cached for a prefix hit. A full group needs every block from the start, and the others
 * need the blocks the next token reads: a sliding group the ⌈(W - 1) ÷ B⌉ before the edge (vllm.hybrid-kv.sliding-hit-blocks), a state
 * group the one that holds the state at the edge (vllm.hybrid-kv.mamba-hit).
 */
export function kvHitBlocks(group: KvGroupSpec): number {
  if (group.kind === 'full') return Number.POSITIVE_INFINITY
  return group.kind === 'sliding' ? divCeil((group.window ?? 2) - 1, group.blockTokens) : 1
}

/**
 * The first block of a hit of `blocks` whole blocks: the hit is the blocks from there to `blocks - 1`. A group that has fewer blocks
 * than it needs before the edge is served from the start (vllm.hybrid-kv.sliding-hit-prefix).
 */
export function kvHitFrom(group: KvGroupSpec, blocks: number): number {
  return Math.max(0, blocks - kvHitBlocks(group))
}

// ---------------------------------------------------------------------------------------------------------------------------
// Adapters

/** Pages an adapter of `adapterBytes` bytes takes from a pool of `pageBytes`-byte pages: ⌈adapter bytes ÷ page bytes⌉ (D-045, S-LoRA). */
export function kvAdapterPages(adapterBytes: number, pageBytes: number): number {
  if (!isCount(adapterBytes, 1)) throw new RangeError(`an adapter has at least 1 byte, got ${adapterBytes}`)
  if (!isCount(pageBytes, 1)) throw new RangeError(`a page has at least 1 byte, got ${pageBytes}`)
  return divCeil(adapterBytes, pageBytes)
}

/** The shape of a LoRA adapter: what its weights add up to. */
export interface KvLoraShape {
  readonly hidden: number
  readonly layers: number
  /** Projections that carry an adapter in each layer, such as q, k, v and o. */
  readonly targets: number
  readonly dtypeBytes: number
}

/**
 * Bytes of a LoRA adapter of the given rank: for each target of each layer, a down matrix of rank × hidden and an up matrix of
 * hidden × rank. The sizes the presets use are the model's own and synthetic [estimated]; the formula is how a LoRA adapter is built.
 */
export function kvLoraBytes(shape: KvLoraShape, rank: number): number {
  if (!isCount(rank, 1)) throw new RangeError(`a rank is a positive integer, got ${rank}`)
  return 2 * rank * shape.hidden * shape.targets * shape.layers * shape.dtypeBytes
}
