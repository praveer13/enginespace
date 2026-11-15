/**
 * `tr5a.blocks-held`: the pages a request holds in each KV group of a hybrid model, and across the groups (TR5a; KCs `tr5a.kv-groups`,
 * `tr5a.sliding-free`, `tr5a.state-pages` and `tr5a.page-size-unification`). It is the exit item of TR5a's first lesson (level 2: a request
 * and a model whose groups are given) and of its second (level 3: a model given by its layer counts, so that the groups have to be worked
 * out first), and GAMES.md §8's Keep item "blocks held at L tokens". At vLLM v0.33.0, the course's pin, a group is a set of layers of one
 * kind that share a block table, and every group's block is one page of the pool (claims vllm.hybrid-kv.group-rules, vllm.hybrid-kv.single-pool):
 *
 *   full     holds every block of the request, ⌈L ÷ B⌉ pages.
 *   sliding  holds the blocks that cover the last W tokens. The token being computed reads itself and the W − 1 before it, so the tokens before
 *            L − W + 1 are skipped, and the group lets go of the whole blocks among them: ⌈L ÷ B⌉ − ⌊max(0, L − W + 1) ÷ B⌋
 *            (claim vllm.hybrid-kv.sliding-skipped-tokens).
 *   state    holds the newest S blocks, or all of a request that has fewer: min(⌈L ÷ B⌉, S) (claim vllm.hybrid-kv.mamba-hit; the model's
 *            `statePages`).
 *   layers   the planner gives every group the same number of layers, the fewest of any kind, or the most when that is under 1.5 times the
 *            fewest, and pads a group that comes up short (claims vllm.hybrid-kv.group-size, vllm.hybrid-kv.group-size-near,
 *            vllm.hybrid-kv.padding-layers). A recurrent layer's state is padded to the attention block, which is made the smallest multiple of the
 *            kernel's block whose page for a layer holds the state (claims vllm.hybrid-kv.page-unify, vllm.hybrid-kv.attn-block-inflate).
 *
 * What the variants ask:
 *   sliding      the pages one sliding group holds (KC tr5a.sliding-free; levels 0 to 2);
 *   hybrid       the pages a full group and m sliding groups hold in all (KCs tr5a.kv-groups, tr5a.sliding-free; levels 0 to 2);
 *   recurrent    the pages a full group and g state groups hold in all (KCs tr5a.kv-groups, tr5a.state-pages; levels 0 to 2);
 *   from-layers  the same for a model given by its full and sliding layer counts, so that the group size and the number of groups come first
 *                (KC tr5a.page-size-unification; levels 0, 1 and 3);
 *   from-state   the same for a model of attention and recurrent layers, where the attention block is grown to hold a state first (KC
 *                tr5a.page-size-unification; levels 0, 1 and 3).
 * The first three are the exit ticket of the first lesson and the last two the exit ticket of the second, which asks its items at level 3, so
 * the levels keep the two lessons' items apart: the second lesson's KC is not taught by the first, and the first's are not taught by the second.
 * At level 0 a worked example with other numbers comes first, and at level 1 the words of the first step.
 *
 * tests/play/items-tr5a-blocks-held.test.ts holds every rule to the sim (`kvTableRule`, `kvPagesHeld`, `buildKvSpec`). The scene is synthetic and
 * every number in it is [estimated]: the layer counts of the design document's examples (10 full and 20 sliding layers, Gemma-3-27b's 10 and
 * 52, gpt-oss-20b's 13 and 12) can come up among the draws, and the rest of the grid is the course's.
 */
import { below, divCeil, divFloor, pick } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich } from '../../rich'
import type { Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { blocksOf, EXACT, gcd, groupSizeOf, groupsFor, groupsOf, heldBy, layersOf, pagesOf, skippedTokens, tokensOf, workedPart } from './kit'

const FAMILY = 'tr5a.blocks-held'
const VERSION = 1
const KC_GROUPS = 'tr5a.kv-groups'
const KC_SLIDING = 'tr5a.sliding-free'
const KC_STATE = 'tr5a.state-pages'
const KC_UNIFY = 'tr5a.page-size-unification'

type VariantId = 'sliding' | 'hybrid' | 'recurrent' | 'from-layers' | 'from-state'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'sliding', title: 'The pages a sliding group still holds', kcs: [KC_SLIDING], levels: [0, 1, 2] },
  { id: 'hybrid', title: 'The pages a full group and sliding groups hold', kcs: [KC_GROUPS, KC_SLIDING], levels: [0, 1, 2] },
  { id: 'recurrent', title: 'The pages a full group and state groups hold', kcs: [KC_GROUPS, KC_STATE], levels: [0, 1, 2] },
  { id: 'from-layers', title: 'The pages of a model given by its layers', kcs: [KC_UNIFY], levels: [0, 1, 3] },
  { id: 'from-state', title: 'The pages of a model with recurrent layers', kcs: [KC_UNIFY], levels: [0, 1, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The groups of a model given by its layer counts: the group size, and the groups of the full kind and of the other kind. */
export function layerGrouping(full: number, other: number): { readonly size: number; readonly full: number; readonly other: number } {
  const size = groupSizeOf([full, other])
  return { size, full: groupsFor(full, size), other: groupsFor(other, size) }
}

/** Whether the most layers of any kind is under 1.5 times the fewest, so that the planner takes the most as its group size. */
export const isNear = (a: number, b: number): boolean => 2 * Math.max(a, b) < 3 * Math.min(a, b)

/**
 * The attention block after the planner has grown it to hold a recurrent layer's state: the smallest multiple of the kernel's block, `base`
 * tokens, whose block for one layer (`tokenBytes` a token) is at least `stateBytes` (claim vllm.hybrid-kv.attn-block-inflate).
 */
export const grownBlock = (base: number, tokenBytes: number, stateBytes: number): number => base * divCeil(stateBytes, base * tokenBytes)

interface Sliding {
  readonly variant: 'sliding'
  readonly tokens: number
  readonly block: number
  readonly window: number
}
interface Hybrid {
  readonly variant: 'hybrid'
  readonly tokens: number
  readonly block: number
  readonly window: number
  /** Sliding groups. */
  readonly groups: number
}
interface Recurrent {
  readonly variant: 'recurrent'
  readonly tokens: number
  readonly block: number
  /** State groups. */
  readonly groups: number
  /** Pages a state group keeps. */
  readonly kept: number
}
interface FromLayers {
  readonly variant: 'from-layers'
  readonly tokens: number
  readonly block: number
  readonly window: number
  readonly full: number
  readonly sliding: number
}
interface FromState {
  readonly variant: 'from-state'
  readonly tokens: number
  /** Tokens in the kernel's block, from which the attention block grows. */
  readonly base: number
  readonly tokenBytes: number
  readonly stateBytes: number
  readonly attention: number
  readonly recurrent: number
  readonly kept: number
}
type Scene = Sliding | Hybrid | Recurrent | FromLayers | FromState

/** The pages the scene's request holds, by the rule of each kind of group and the planner's grouping. */
export function pagesOfScene(scene: Scene): number {
  switch (scene.variant) {
    case 'sliding':
      return heldBy.sliding(scene.tokens, scene.block, scene.window)
    case 'hybrid':
      return heldBy.full(scene.tokens, scene.block) + scene.groups * heldBy.sliding(scene.tokens, scene.block, scene.window)
    case 'recurrent':
      return heldBy.full(scene.tokens, scene.block) + scene.groups * heldBy.state(scene.tokens, scene.block, scene.kept)
    case 'from-layers': {
      const grouping = layerGrouping(scene.full, scene.sliding)
      return grouping.full * heldBy.full(scene.tokens, scene.block) + grouping.other * heldBy.sliding(scene.tokens, scene.block, scene.window)
    }
    case 'from-state': {
      const block = grownBlock(scene.base, scene.tokenBytes, scene.stateBytes)
      const grouping = layerGrouping(scene.attention, scene.recurrent)
      return grouping.full * heldBy.full(scene.tokens, block) + grouping.other * heldBy.state(scene.tokens, block, scene.kept)
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const BLOCKS = [16, 32] as const
/** Windows of the course's invented sliding layers, in tokens. Irregular on purpose: a window is rarely a whole number of blocks. */
const WINDOWS = [32, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640, 768, 1024] as const
const STATE_BLOCKS = [32, 48, 64] as const

/** One draw in a hundred: whether the request is still short of the window or of the state's pages. */
const FILLING_SHARE = 14

function drawSliding(level: Level, seed: Seed, purpose: string): Sliding {
  const rng = itemRng(FAMILY, 'sliding', level, seed, purpose)
  const block = pick(rng, BLOCKS)
  const filling = below(rng, 100) < FILLING_SHARE
  // A request still short of its window holds every block it has; a longer one has let go of the blocks behind the window.
  const window = pick(rng, WINDOWS.filter((w) => w >= (filling ? 3 : 2) * block))
  const tokens = filling ? block + 1 + below(rng, window - 2 * block) : window + block + below(rng, 5 * window)
  return { variant: 'sliding', tokens, block, window }
}

function drawHybrid(level: Level, seed: Seed, purpose: string): Hybrid {
  const rng = itemRng(FAMILY, 'hybrid', level, seed, purpose)
  const block = pick(rng, BLOCKS)
  const window = pick(rng, WINDOWS.filter((w) => w >= 2 * block && w <= 512))
  const groups = 2 + below(rng, 5)
  return { variant: 'hybrid', tokens: window + block + below(rng, 4096 - window - block), block, window, groups }
}

function drawRecurrent(level: Level, seed: Seed, purpose: string): Recurrent {
  const rng = itemRng(FAMILY, 'recurrent', level, seed, purpose)
  const block = pick(rng, STATE_BLOCKS)
  const groups = 2 + below(rng, 5)
  const kept = pick(rng, [2, 2, 2, 3, 3, 4])
  const filling = below(rng, 100) < FILLING_SHARE
  // A request that fills fewer than `kept` blocks holds all of them in a state group; a longer one holds `kept`, however long it runs.
  const tokens = filling ? 1 + below(rng, (kept - 1) * block) : (kept + 1) * block + 1 + below(rng, 4096 - (kept + 1) * block - 1)
  return { variant: 'recurrent', tokens, block, groups, kept }
}

function drawFromLayers(level: Level, seed: Seed, purpose: string): FromLayers {
  const rng = itemRng(FAMILY, 'from-layers', level, seed, purpose)
  let fewest: number
  let most: number
  if (below(rng, 100) < 40) {
    // The most is under 1.5 times the fewest: the planner takes the most (a drafter's extra layer pads a group and does not double the groups).
    fewest = 6 + below(rng, 25)
    most = fewest + 1 + below(rng, Math.floor((fewest - 1) / 2))
  } else {
    // The most is at least 1.5 times the fewest: the planner takes the fewest, and the longer kind makes several groups.
    fewest = 4 + below(rng, 13)
    most = Math.min(64, Math.ceil((3 * fewest) / 2) + below(rng, 4 * fewest))
  }
  const slidingIsMore = below(rng, 2) === 0
  const window = pick(rng, [32, 48, 64, 96, 128, 192, 256])
  const block = 16
  return {
    variant: 'from-layers',
    tokens: window + block + below(rng, 4096 - window - block),
    block,
    window,
    full: slidingIsMore ? fewest : most,
    sliding: slidingIsMore ? most : fewest,
  }
}

function drawFromState(level: Level, seed: Seed, purpose: string): FromState {
  const rng = itemRng(FAMILY, 'from-state', level, seed, purpose)
  const base = 16
  const tokenBytes = pick(rng, [512, 1024, 2048])
  // The state is a number of half-blocks of one layer, from one and a half to five blocks, so the block grows by one to five steps.
  const halves = pick(rng, [3, 4, 5, 6, 7, 8, 10])
  const stateBytes = (halves * base * tokenBytes) / 2
  const kept = pick(rng, [2, 2, 2, 3])
  let fewest: number
  let most: number
  if (below(rng, 100) < 35) {
    fewest = 6 + below(rng, 17)
    most = fewest + 1 + below(rng, Math.floor((fewest - 1) / 2))
  } else {
    fewest = 4 + below(rng, 9)
    most = Math.min(48, Math.ceil((3 * fewest) / 2) + below(rng, 3 * fewest))
  }
  const attentionIsMore = below(rng, 4) === 0
  const block = grownBlock(base, tokenBytes, stateBytes)
  return {
    variant: 'from-state',
    tokens: (kept + 1) * block + 1 + below(rng, 4096 - (kept + 1) * block - 1),
    base,
    tokenBytes,
    stateBytes,
    attention: attentionIsMore ? most : fewest,
    recurrent: attentionIsMore ? fewest : most,
    kept,
  }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  switch (variant) {
    case 'sliding':
      return drawSliding(level, seed, purpose)
    case 'hybrid':
      return drawHybrid(level, seed, purpose)
    case 'recurrent':
      return drawRecurrent(level, seed, purpose)
    case 'from-layers':
      return drawFromLayers(level, seed, purpose)
    case 'from-state':
      return drawFromState(level, seed, purpose)
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The wrong answers that a learner's rule gives                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What each tempting rule gives for a scene, by the name of the misconception it encodes. A rule that has no reading for a scene is absent. */
function mistakes(scene: Scene): Readonly<Record<string, number>> {
  switch (scene.variant) {
    case 'sliding': {
      const { tokens, block, window } = scene
      return {
        'all-blocks': heldBy.full(tokens, block),
        'window-in-blocks': divCeil(window, block),
        'window-rounded-down': divFloor(window, block),
        'window-off-by-one': heldBy.full(tokens, block) - divFloor(Math.max(0, tokens - window), block),
        'released-not-held': divFloor(skippedTokens(tokens, window), block),
        'tokens-not-pages': tokens,
      }
    }
    case 'hybrid': {
      const full = heldBy.full(scene.tokens, scene.block)
      const slide = heldBy.sliding(scene.tokens, scene.block, scene.window)
      return { 'all-full': (1 + scene.groups) * full, 'one-sliding': full + slide, 'no-full': scene.groups * slide, 'full-only': full }
    }
    case 'recurrent': {
      const full = heldBy.full(scene.tokens, scene.block)
      const state = heldBy.state(scene.tokens, scene.block, scene.kept)
      return { 'state-grows': (1 + scene.groups) * full, 'one-state': full + state, 'no-full': scene.groups * state, 'full-only': full }
    }
    case 'from-layers': {
      const { tokens, block, window } = scene
      const full = heldBy.full(tokens, block)
      const slide = heldBy.sliding(tokens, block, window)
      const grouping = layerGrouping(scene.full, scene.sliding)
      const ratio = gcd(scene.full, scene.sliding)
      const fewest = Math.min(scene.full, scene.sliding)
      return {
        'per-layer': scene.full * full + scene.sliding * slide,
        'one-each': full + slide,
        'by-ratio': (scene.full / ratio) * full + (scene.sliding / ratio) * slide,
        'smallest-only': groupsFor(scene.full, fewest) * full + groupsFor(scene.sliding, fewest) * slide,
        'all-full': (grouping.full + grouping.other) * full,
      }
    }
    case 'from-state': {
      const { tokens, base, tokenBytes, stateBytes, attention, recurrent, kept } = scene
      const block = grownBlock(base, tokenBytes, stateBytes)
      const grouping = layerGrouping(attention, recurrent)
      const full = heldBy.full(tokens, block)
      const state = heldBy.state(tokens, block, kept)
      const fewest = Math.min(attention, recurrent)
      return {
        'block-not-grown': grouping.full * heldBy.full(tokens, base) + grouping.other * heldBy.state(tokens, base, kept),
        'state-grows': (grouping.full + grouping.other) * full,
        'smallest-only': groupsFor(attention, fewest) * full + groupsFor(recurrent, fewest) * state,
        'per-layer': attention * full + recurrent * state,
        'one-each': full + state,
      }
    }
  }
}

/** Whether a scene makes a fair question (the band). All integer arithmetic. */
function isFair(scene: Scene): boolean {
  const key = pagesOfScene(scene)
  const wrong = mistakes(scene)
  switch (scene.variant) {
    case 'sliding': {
      // The window is at least two blocks, so a sliding group holds at least two pages when it has let go of any.
      if (scene.window < 2 * scene.block) return false
      const all = heldBy.full(scene.tokens, scene.block)
      // A request that has outgrown its window has let go of a block, and one that has not holds every block it has, and fewer than the window's.
      return scene.tokens >= scene.window + scene.block ? key < all : key === all && all < divCeil(scene.window, scene.block)
    }
    case 'hybrid':
      return scene.tokens >= scene.window + scene.block && key !== wrong['all-full']
    case 'recurrent': {
      const blocks = heldBy.full(scene.tokens, scene.block)
      // Either the request fills more than `kept` blocks (the state groups have stopped growing) or fewer (they have not started to).
      return blocks >= scene.kept + 2 ? key !== wrong['state-grows'] : blocks < scene.kept && key !== wrong['no-full']
    }
    case 'from-layers':
      // Whichever rule of the planner the scene tests must give an answer of its own: the 1.5 rule where the kinds are near, and the several
      // groups of the longer kind where they are not.
      return (
        scene.tokens >= scene.window + scene.block &&
        [wrong['per-layer'], wrong['all-full'], isNear(scene.full, scene.sliding) ? wrong['smallest-only'] : wrong['one-each']].every((value) => value !== key)
      )
    case 'from-state':
      return [wrong['block-not-grown'], wrong['state-grows'], isNear(scene.attention, scene.recurrent) ? wrong['smallest-only'] : wrong['one-each']].every((value) => value !== key)
  }
}

function paramsOf(scene: Scene): Params {
  const { variant, ...rest } = scene
  void variant
  return rest
}

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const read = (name: string): number => {
    const value = item.params[name]
    if (typeof value !== 'number') throw new TypeError(`${FAMILY}: the param ${name} of ${item.variant} is not a number`)
    return value
  }
  switch (item.variant) {
    case 'sliding':
      return { variant: 'sliding', tokens: read('tokens'), block: read('block'), window: read('window') }
    case 'hybrid':
      return { variant: 'hybrid', tokens: read('tokens'), block: read('block'), window: read('window'), groups: read('groups') }
    case 'recurrent':
      return { variant: 'recurrent', tokens: read('tokens'), block: read('block'), groups: read('groups'), kept: read('kept') }
    case 'from-layers':
      return { variant: 'from-layers', tokens: read('tokens'), block: read('block'), window: read('window'), full: read('full'), sliding: read('sliding') }
    case 'from-state':
      return {
        variant: 'from-state',
        tokens: read('tokens'),
        base: read('base'),
        tokenBytes: read('tokenBytes'),
        stateBytes: read('stateBytes'),
        attention: read('attention'),
        recurrent: read('recurrent'),
        kept: read('kept'),
      }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit: string, digits?: number): NumPart => num(value, { unit, tag: 'synthetic', ...(digits === undefined ? {} : { digits }) })
const synthetic = {
  tokens: (value: number) => tokensOf(value, 'synthetic'),
  layers: (value: number) => layersOf(value, 'synthetic'),
  groups: (value: number) => groupsOf(value, 'synthetic'),
  pages: (value: number) => pagesOf(value, 'synthetic'),
}

/** The key as the last step's result: always in `pages`, so that it is the key's own unit whether the count is one or many. */
const pagesResult = (value: number): NumPart => num(value, { unit: 'pages', tag: 'derived' })

/** The planner's 1.5, a claim of the pin (vllm.hybrid-kv.group-size-near), written as the engine writes it. */
const NEAR: NumPart = num(1.5, { unit: 'x', tag: 'measured', digits: 1 })

/** How a sliding group reads: the sentence that the ticket carries, so that the key rests on a rule that the ticket states. */
function windowRule(window: number): Rich {
  return rich('reads the last ', synthetic.tokens(window), ' (the token being computed and the ', tokensOf(window - 1), ' before it), and gives a block back once every token in it is behind that window')
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The solutions                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

function slidingSteps(s: { tokens: number; block: number; window: number }): Step[] {
  const blocks = heldBy.full(s.tokens, s.block)
  const skipped = skippedTokens(s.tokens, s.window)
  const released = divFloor(skipped, s.block)
  const held = blocks - released
  const first: Step = {
    text: rich('The request holds ', synthetic.tokens(s.tokens), ', which fill ', synthetic.tokens(s.tokens), ' ÷ ', synthetic.tokens(s.block), ' rounded up = ', blocksOf(blocks), ', counted from the first.'),
    result: blocksOf(blocks),
  }
  const second: Step =
    skipped === 0
      ? { text: rich('The request is shorter than the window, so no token is behind it yet and no block has been given back.'), result: blocksOf(0) }
      : {
          text: rich(
            'The tokens behind the window number ',
            synthetic.tokens(s.tokens),
            ' − ',
            synthetic.tokens(s.window),
            ' + one = ',
            tokensOf(skipped),
            '. The group gives back the whole blocks among them: ',
            tokensOf(skipped),
            ' ÷ ',
            synthetic.tokens(s.block),
            ' rounded down = ',
            blocksOf(released),
            '.',
          ),
          result: blocksOf(released),
        }
  return [first, second, { text: rich('The group holds ', blocksOf(blocks), ' − ', blocksOf(released), ' = ', pagesResult(held), '.'), result: pagesResult(held) }]
}

function hybridSteps(s: Hybrid): Step[] {
  const full = heldBy.full(s.tokens, s.block)
  const slide = heldBy.sliding(s.tokens, s.block, s.window)
  const total = full + s.groups * slide
  return [
    { text: rich('The full-attention group holds every block of the request: ', synthetic.tokens(s.tokens), ' ÷ ', synthetic.tokens(s.block), ' rounded up = ', pagesOf(full), '.'), result: pagesOf(full) },
    {
      text: rich(
        'Each sliding group has ',
        tokensOf(skippedTokens(s.tokens, s.window)),
        ' behind its window and gives back the whole blocks among them, ',
        blocksOf(divFloor(skippedTokens(s.tokens, s.window), s.block)),
        ', so it holds ',
        pagesOf(full),
        ' − ',
        blocksOf(divFloor(skippedTokens(s.tokens, s.window), s.block)),
        ' = ',
        pagesOf(slide),
        '.',
      ),
      result: pagesOf(slide),
    },
    { text: rich('Across the groups the request holds ', pagesOf(full), ' + ', synthetic.groups(s.groups), ' × ', pagesOf(slide), ' = ', pagesResult(total), '.'), result: pagesResult(total) },
  ]
}

function recurrentSteps(s: Recurrent): Step[] {
  const full = heldBy.full(s.tokens, s.block)
  const state = heldBy.state(s.tokens, s.block, s.kept)
  const total = full + s.groups * state
  return [
    { text: rich('The full-attention group holds every block of the request: ', synthetic.tokens(s.tokens), ' ÷ ', synthetic.tokens(s.block), ' rounded up = ', pagesOf(full), '.'), result: pagesOf(full) },
    {
      text:
        full > s.kept
          ? rich('A state group holds a fixed number of pages: the newest ', synthetic.pages(s.kept), ', however long the request runs. The request fills more blocks than that, so each holds ', pagesOf(state), '.')
          : rich('A state group holds the newest ', synthetic.pages(s.kept), ', or every block of a request that has fewer. This request fills ', blocksOf(full), ', so each holds ', pagesOf(state), '.'),
      result: pagesOf(state),
    },
    { text: rich('Across the groups the request holds ', pagesOf(full), ' + ', synthetic.groups(s.groups), ' × ', pagesOf(state), ' = ', pagesResult(total), '.'), result: pagesResult(total) },
  ]
}

/** The group-size step of a grouping by layer counts, with the rule in words. */
function sizeStep(a: number, b: number, nameA: string, nameB: string): Step {
  const fewest = Math.min(a, b)
  const most = Math.max(a, b)
  const size = groupSizeOf([a, b])
  return {
    text: rich(
      'The planner gives every group the same number of layers. The kinds have ',
      synthetic.layers(a),
      ' of ',
      nameA,
      ' and ',
      synthetic.layers(b),
      ' of ',
      nameB,
      '. The most, ',
      layersOf(most, 'derived'),
      ', is ',
      size === most ? 'under' : 'not under',
      ' ',
      NEAR,
      ' the fewest, ',
      layersOf(fewest, 'derived'),
      ', so the group size is the ',
      size === most ? 'most' : 'fewest',
      ': ',
      layersOf(size, 'derived'),
      '.',
    ),
    result: layersOf(size, 'derived'),
  }
}

function fromLayersSteps(s: FromLayers): Step[] {
  const grouping = layerGrouping(s.full, s.sliding)
  const full = heldBy.full(s.tokens, s.block)
  const slide = heldBy.sliding(s.tokens, s.block, s.window)
  const total = grouping.full * full + grouping.other * slide
  return [
    sizeStep(s.full, s.sliding, 'full attention', 'sliding window'),
    {
      text: rich(
        'Each kind makes as many groups as its layers fill, rounded up, and the last is padded: full attention ',
        layersOf(s.full, 'synthetic'),
        ' ÷ ',
        layersOf(grouping.size, 'derived'),
        ' rounded up = ',
        groupsOf(grouping.full),
        ', sliding window ',
        layersOf(s.sliding, 'synthetic'),
        ' ÷ ',
        layersOf(grouping.size, 'derived'),
        ' rounded up = ',
        groupsOf(grouping.other),
        '.',
      ),
      result: groupsOf(grouping.full + grouping.other),
    },
    {
      text: rich(
        'A full group holds ',
        synthetic.tokens(s.tokens),
        ' ÷ ',
        synthetic.tokens(s.block),
        ' rounded up = ',
        pagesOf(full),
        '. A sliding group gives back the ',
        blocksOf(divFloor(skippedTokens(s.tokens, s.window), s.block)),
        ' behind its window of ',
        synthetic.tokens(s.window),
        ' and holds ',
        pagesOf(slide),
        '.',
      ),
      result: pagesOf(slide),
    },
    {
      text: rich('Across the groups the request holds ', groupsOf(grouping.full), ' × ', pagesOf(full), ' + ', groupsOf(grouping.other), ' × ', pagesOf(slide), ' = ', pagesResult(total), '.'),
      result: pagesResult(total),
    },
  ]
}

function fromStateSteps(s: FromState): Step[] {
  const block = grownBlock(s.base, s.tokenBytes, s.stateBytes)
  const unit = s.base * s.tokenBytes
  const steps = divCeil(s.stateBytes, unit)
  const grouping = layerGrouping(s.attention, s.recurrent)
  const full = heldBy.full(s.tokens, block)
  const state = heldBy.state(s.tokens, block, s.kept)
  const total = grouping.full * full + grouping.other * state
  return [
    {
      text: rich(
        'One attention layer holds ',
        synthetic.tokens(s.base),
        ' × ',
        num(s.tokenBytes, { unit: 'bytes', tag: 'synthetic' }),
        ' = ',
        num(unit, { unit: 'bytes', tag: 'derived' }),
        ' of a block, and a recurrent layer\'s state is ',
        num(s.stateBytes, { unit: 'bytes', tag: 'synthetic' }),
        '. The block grows by ',
        tokensOf(s.base, 'synthetic'),
        ' until it holds a state: ',
        num(steps, { unit: steps === 1 ? 'step' : 'steps', tag: 'derived' }),
        ', so the block is ',
        tokensOf(block),
        '.',
      ),
      result: tokensOf(block),
    },
    sizeStep(s.attention, s.recurrent, 'attention', 'recurrent state'),
    {
      text: rich(
        'That makes ',
        groupsOf(grouping.full),
        ' of attention and ',
        groupsOf(grouping.other),
        ' of state. An attention group holds ',
        synthetic.tokens(s.tokens),
        ' ÷ ',
        tokensOf(block),
        ' rounded up = ',
        pagesOf(full),
        ', and a state group holds only its newest ',
        pagesOf(state),
        '.',
      ),
      result: pagesOf(state),
    },
    {
      text: rich('Across the groups the request holds ', groupsOf(grouping.full), ' × ', pagesOf(full), ' + ', groupsOf(grouping.other), ' × ', pagesOf(state), ' = ', pagesResult(total), '.'),
      result: pagesResult(total),
    },
  ]
}

function stepsOfScene(scene: Scene): Step[] {
  switch (scene.variant) {
    case 'sliding':
      return slidingSteps(scene)
    case 'hybrid':
      return hybridSteps(scene)
    case 'recurrent':
      return recurrentSteps(scene)
    case 'from-layers':
      return fromLayersSteps(scene)
    case 'from-state':
      return fromStateSteps(scene)
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function stemAndGivens(scene: Scene): { stem: Rich; givens: Given[] } {
  switch (scene.variant) {
    case 'sliding':
      return {
        stem: rich('A request holds ', synthetic.tokens(scene.tokens), '. One sliding-window group of the model ', ...windowRule(scene.window), '. How many pages does that group hold for the request?'),
        givens: [
          { label: 'tokens in the request', value: given(scene.tokens, 'tokens') },
          { label: 'tokens in a block', value: given(scene.block, 'tokens') },
          { label: 'window of the group', value: given(scene.window, 'tokens') },
        ],
      }
    case 'hybrid':
      return {
        stem: rich(
          'A model has one full-attention group, which keeps every block of a request, and ',
          synthetic.groups(scene.groups),
          ' of sliding-window layers. A sliding group ',
          ...windowRule(scene.window),
          '. How many pages does a request of ',
          synthetic.tokens(scene.tokens),
          ' hold across all the groups?',
        ),
        givens: [
          { label: 'tokens in the request', value: given(scene.tokens, 'tokens') },
          { label: 'tokens in a block', value: given(scene.block, 'tokens') },
          { label: 'full-attention groups', value: given(1, 'group') },
          { label: 'sliding-window groups', value: given(scene.groups, 'groups') },
          { label: 'window of a sliding group', value: given(scene.window, 'tokens') },
        ],
      }
    case 'recurrent':
      return {
        stem: rich(
          'A model has one full-attention group, which keeps every block of a request, and ',
          synthetic.groups(scene.groups),
          ' of recurrent layers. A state group keeps the newest ',
          synthetic.pages(scene.kept),
          ' of a request, or all of them when the request has fewer. How many pages does a request of ',
          synthetic.tokens(scene.tokens),
          ' hold across all the groups?',
        ),
        givens: [
          { label: 'tokens in the request', value: given(scene.tokens, 'tokens') },
          { label: 'tokens in a block', value: given(scene.block, 'tokens') },
          { label: 'full-attention groups', value: given(1, 'group') },
          { label: 'state groups', value: given(scene.groups, 'groups') },
          { label: 'pages a state group keeps', value: given(scene.kept, 'pages') },
        ],
      }
    case 'from-layers':
      return {
        stem: rich(
          'vLLM\'s planner at v0.33.0 groups the layers of the model below so that every group has the same number of layers, and pads a group that comes up short. Every layer costs the same bytes for a token. A sliding-window layer ',
          ...windowRule(scene.window),
          '. How many pages does a request of ',
          synthetic.tokens(scene.tokens),
          ' hold across all the groups?',
        ),
        givens: [
          { label: 'full-attention layers', value: given(scene.full, 'layers') },
          { label: 'sliding-window layers', value: given(scene.sliding, 'layers') },
          { label: 'window of a sliding layer', value: given(scene.window, 'tokens') },
          { label: 'tokens in a block', value: given(scene.block, 'tokens') },
          { label: 'tokens in the request', value: given(scene.tokens, 'tokens') },
        ],
      }
    case 'from-state':
      return {
        stem: rich(
          'vLLM\'s planner at v0.33.0 groups the layers of the model below and brings every group\'s block to one page size. A state group keeps the newest ',
          synthetic.pages(scene.kept),
          ' of a request, or all of them when the request has fewer. How many pages does a request of ',
          synthetic.tokens(scene.tokens),
          ' hold across all the groups?',
        ),
        givens: [
          { label: 'attention layers', value: given(scene.attention, 'layers') },
          { label: 'recurrent layers', value: given(scene.recurrent, 'layers') },
          { label: 'key and value of a token in an attention layer', value: given(scene.tokenBytes, 'bytes') },
          { label: 'state of a recurrent layer', value: given(scene.stateBytes, 'bytes') },
          { label: 'tokens in the kernel\'s block', value: given(scene.base, 'tokens') },
          { label: 'pages a state group keeps', value: given(scene.kept, 'pages') },
          { label: 'tokens in the request', value: given(scene.tokens, 'tokens') },
        ],
      }
  }
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const { stem, givens } = stemAndGivens(scene)
  const key = pagesOfScene(scene)
  const worked = workedPart(level, stepsOfScene(scene), (attempt) => {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    return isFair(example) && pagesOfScene(example) !== key && example.tokens !== scene.tokens ? stepsOfScene(example) : null
  })
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem,
      givens,
      worked,
      answer: { kind: 'numeric', label: scene.variant === 'sliding' ? 'pages the group holds' : 'pages the request holds', unit: 'pages', truth: key, tolerance: EXACT },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What each misconception says to the learner who gave its number: one sentence, in the numbers of this scene. */
function messageFor(id: string, scene: Scene, value: number): Rich | null {
  const mine = pagesOf(value, 'derived')
  if (scene.variant === 'sliding') {
    const skipped = skippedTokens(scene.tokens, scene.window)
    switch (id) {
      case 'all-blocks':
        return rich('That is every block of the request, ', mine, '. A sliding group gives back the blocks that lie wholly behind its window, so it holds fewer.')
      case 'window-in-blocks':
        return heldBy.full(scene.tokens, scene.block) === pagesOfScene(scene)
          ? rich('That is the window counted in blocks. This request has not filled its window yet, so it holds every block it has.')
          : rich('That is the window counted in whole blocks. A window seldom starts on a block\'s edge, so it touches one block more than that.')
      case 'window-rounded-down':
        return rich('That rounds the window down to whole blocks. A block that the window touches is held whole, so the window rounds up, and the blocks it touches can be one more.')
      case 'window-off-by-one':
        return rich(
          'You counted the tokens behind the window one short, ',
          tokensOf(skipped - 1),
          '. The token being computed reads itself and the ',
          tokensOf(scene.window - 1),
          ' before it, so the first ',
          tokensOf(skipped),
          ' tokens of the request are behind the window.',
        )
      case 'released-not-held':
        return rich('That is the number of blocks the group has given back. The pages it holds are the rest.')
      case 'tokens-not-pages':
        return rich('That is a count of tokens. A page holds one block of them, so pages are tokens ÷ the tokens in a block.')
      default:
        return null
    }
  }
  if (scene.variant === 'hybrid') {
    switch (id) {
      case 'all-full':
        return rich('That counts every group as a full-attention group, ', mine, ' in all. The sliding groups give back the blocks behind their window, so they hold fewer.')
      case 'one-sliding':
        return rich('That counts one sliding group. Each of the ', synthetic.groups(scene.groups), ' keeps a table of its own, and holds pages of its own.')
      case 'full-only':
        return rich('That is the full-attention group alone. The sliding groups hold pages too.')
      case 'no-full':
        return rich('That leaves out the full-attention group, which holds every block of the request.')
      default:
        return null
    }
  }
  if (scene.variant === 'recurrent') {
    switch (id) {
      case 'state-grows':
        return rich('That counts a state group as a full-attention group, ', mine, ' in all. A state group keeps a fixed number of pages, however long the request runs.')
      case 'one-state':
        return rich('That counts one state group. Each of the ', synthetic.groups(scene.groups), ' keeps pages of its own.')
      case 'full-only':
        return rich('That is the full-attention group alone. The state groups hold pages too.')
      case 'no-full':
        return rich('That leaves out the full-attention group, which holds every block of the request.')
      default:
        return null
    }
  }
  switch (id) {
    case 'all-full':
      return rich('That counts every group as a full-attention group. The sliding groups give back the blocks behind their window, so they hold fewer.')
    case 'state-grows':
      return rich('That counts a state group as a full-attention group. A state group keeps a fixed number of pages, however long the request runs.')
    case 'per-layer':
      return rich('That gives every layer a table of its own. Layers of one kind share a block table, in groups of the same size.')
    case 'one-each':
      return rich('That counts one group of each kind. The planner makes groups of the same number of layers, so a kind with more layers than that makes more than one group.')
    case 'by-ratio':
      return rich('That groups by the ratio of the layer counts, which makes many small groups. The planner groups by the fewest layers of any kind instead, and pads.')
    case 'smallest-only':
      return rich('That takes the fewest layers as the group size. When the most is under ', NEAR, ' the fewest, the planner takes the most, so that one extra layer pads a group and does not double the groups.')
    case 'block-not-grown':
      return rich('That keeps the attention block at the kernel\'s size. The block grows until it holds a recurrent layer\'s state, and a larger block holds fewer pages.')
    default:
      return null
  }
}

/** The order the rules are tried in: a number that two rules give is named by the first, so the likelier misreading goes first. */
const ORDER: readonly string[] = [
  'all-blocks',
  'window-off-by-one',
  'window-in-blocks',
  'window-rounded-down',
  'released-not-held',
  'tokens-not-pages',
  'all-full',
  'state-grows',
  'smallest-only',
  'block-not-grown',
  'by-ratio',
  'per-layer',
  'one-each',
  'one-sliding',
  'one-state',
  'no-full',
  'full-only',
]

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    const key = pagesOfScene(scene)
    const wrong = mistakes(scene)
    for (const id of ORDER) {
      const target = wrong[id]
      if (target === undefined || target === key || value !== target) continue
      const message = messageFor(id, scene, value)
      if (message !== null) return { id: `${FAMILY}.${id}`, message }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const blocksHeld: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Pages a request holds',
  kcs: [KC_GROUPS, KC_SLIDING, KC_STATE, KC_UNIFY],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'))
  },
  grade: (item, response) => gradeNumeric(item, response, RULES),
  solution: (item) => stepsOfScene(sceneOf(item)),
}
