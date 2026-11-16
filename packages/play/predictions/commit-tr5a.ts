/**
 * TR5a's predictions that are revealed at commit (D-067): the question carries a model or a cache of its own that no level of the pool plays
 * (a model of 12 and 13 layers, a returning request with its blocks named). Each answer is `packages/sim/kv` on those numbers, and takes no run.
 * tests/play/predictions.test.ts holds each to the figure that tests/content/tr5a-demos.ts computes.
 */
import { buildKvSpec, kvFindHit, kvPreset } from '@es/sim/kv'
import { figure } from './figure'
import type { Commit } from './types'

/** The KV groups that the planner makes of a model of `full` full-attention layers and `sliding` sliding-window layers, every layer costing the same bytes. */
function groupsOf(full: number, sliding: number): { groups: number; size: number } {
  const spec = buildKvSpec(
    { tokenBytes: 1024, baseBlockTokens: 16, kinds: [{ kind: 'full', layers: full }, { kind: 'sliding', layers: sliding, window: 64 }] },
    100,
  )
  return { groups: spec.groups.length, size: spec.groups[0].layers + (spec.groups[0].padLayers ?? 0) }
}

/** The block numbers `from` to `to`, both counted. */
const blocks = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** The prefix hit, in tokens, of a returning request of 330 tokens on the `state` model: the full group holds blocks 0 to 7, each state group the blocks 2 and 5. */
function stateHit(): { tokens: number; block: number } {
  const spec = kvPreset('state')
  const block = spec.groups[0].blockTokens
  const held = spec.groups.map((group) => new Set(group.kind === 'full' ? blocks(0, 7) : [2, 5]))
  // A block's hash is its number: no hash needs to be a real one for the lookup to run.
  const chain = blocks(0, 10).map((n) => 1000 + n)
  const hit = kvFindHit(spec, (group, hash) => held[group].has(hash - 1000), spec.groups.map(() => chain), 330 - 1).hit
  return { tokens: hit, block }
}

export const COMMITS: Readonly<Record<string, Commit>> = {
  'tr5a.l2.p1': {
    says: ['12 sliding-window layers', '13 full-attention layers', 'same number of layers'],
    working: [
      'A KV cache group holds layers of one attention type, and every group has the same page size, so the planner gives each group the same number of layers and pads a group that comes up short.',
      `The 13 full-attention layers fill a group of ${groupsOf(13, 12).size}, and the 12 sliding-window layers fill another group of ${groupsOf(13, 12).size}, with 1 layer of padding.`,
      `The planner makes ${groupsOf(13, 12).groups} KV cache groups of this model.`,
    ],
    sources: [{ claim: 'vllm.hybrid-kv.group-size-example', text: 'vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size (the 1.5 rule)' }],
    tag: 'derived',
    truth: () => groupsOf(13, 12).groups,
  },
  'tr5a.l3.p2': {
    says: ['330 tokens', 'blocks numbered 0 to 7', 'blocks 2 and 5', '32 tokens in a block'],
    working: [
      'A prefix hit has to hold in every group. A full group needs every block before the edge, and a state group needs the one block just before it.',
      `The state groups hold the blocks 2 and 5, so they accept an edge after 3 blocks or after 6 blocks, and the full group holds every block up to 7, so both are fine for it.`,
      `The largest edge is after 6 blocks of ${stateHit().block} tokens, which is ${figure(stateHit().tokens)} tokens, and it is under the 329 tokens that a hit may cover, because a hit never reaches the last token.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => stateHit().tokens,
  },
}
