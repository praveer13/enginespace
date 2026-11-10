/**
 * `tr5a.hit-length`: how many tokens a prefix hit covers when every KV group of a hybrid model must hold it (TR5a; KC `tr5a.hit-intersection`).
 * It is the exit item of TR5a's third lesson and GAMES.md §8's Keep item "hit length given these cached blocks". At vLLM v0.33.0, the course's pin,
 * a request whose prompt shares its first blocks with the cache starts computing at the token after them, the edge of the hit, and each kind of
 * group needs different blocks to be there (claims vllm.hybrid-kv.intersection, vllm.hybrid-kv.n-group-lookup):
 *
 *   full     the blocks 0 to m − 1, every one (claim vllm.hybrid-kv.downward-closed: so it accepts every edge below the one it accepts last);
 *   sliding  the ⌈(W − 1) ÷ B⌉ blocks just before the edge, or every block from the first when fewer than that come before it (claims
 *            vllm.hybrid-kv.sliding-hit-blocks, vllm.hybrid-kv.sliding-hit-prefix);
 *   state    the one block that holds the state at the edge (claim vllm.hybrid-kv.mamba-hit).
 *
 * The hit is the largest edge that every group accepts, in blocks, as tokens, and never one that covers the prompt's last token, which the
 * request computes itself to get its logits (claims vllm.kv-pool.max-hit-length, vllm.hybrid-kv.hit-alignment). It is not the longest hit of any
 * one group, and not the shortest of the groups' longest, because a window's accepted edges can have gaps: the engine's loop asks each group for its
 * longest edge within the length the last one allowed, and asks them all again while any of them lowers it. All the groups of a model here have
 * one block size, so the alignment is the block.
 *
 * What the variants ask:
 *   windows  a full group and two or three sliding groups: the tokens the hit covers (levels 0 to 2);
 *   states   a full group and two to four state groups, which hold the states at the edges where the request's earlier turns ended: the tokens the
 *            hit covers (levels 0 to 2);
 *   limiter  the hit is given, and the learner names the group that stops it from being one block longer, or says that none does because the
 *            last token does (the model of `windows` with two sliding groups, drawn answer first over four options; level 3).
 * The exit ticket of the lesson asks its items at level 2, so only the first two are drawn there, and the third is the changed surface that
 * Today asks of an idea whose memory is sturdy (level 3). At level 0 a worked example with other numbers comes first, and at level 1 the words
 * of the first step.
 *
 * tests/play/items-tr5a-hit-length.test.ts holds the rule to the sim's `kvFindHit`, run on the same blocks through the sim's hash chains. The
 * scene is synthetic and every number in it is [estimated]: the lesson's two caches (a prompt of 176 tokens with blocks 0 to 9, 6 to 8 and 7 to 9, and
 * the same with a hole in the first window's run) are among the draws.
 */
import { below, divCeil, divFloor, pick } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { blocksOf, blocksText, EXACT, shown, tokensOf, workedPart } from './kit'

const FAMILY = 'tr5a.hit-length'
const VERSION = 1
const KC = 'tr5a.hit-intersection'

type VariantId = 'windows' | 'states' | 'limiter'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'windows', title: 'The hit of a full group and sliding groups', kcs: [KC], levels: [0, 1, 2] },
  { id: 'states', title: 'The hit of a full group and state groups', kcs: [KC], levels: [0, 1, 2] },
  { id: 'limiter', title: 'The group that limits a hit', kcs: [KC], levels: [3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

type Kind = 'full' | 'sliding' | 'state'

interface Scene {
  readonly variant: VariantId
  readonly prompt: number
  /** Tokens in a block, the same in every group. */
  readonly block: number
  /** The window of the sliding groups in tokens, or 0 for a model whose other groups are state groups. */
  readonly window: number
  /** The blocks each group has cached, by number from the first block of the prompt: the full group first, then the others. */
  readonly held: readonly (readonly number[])[]
  /** `limiter` only: the group the key names, as an index into `held`, or `held.length` for none of them. */
  readonly limiter: number
}

const kindOf = (scene: Scene, group: number): Kind => (group === 0 ? 'full' : scene.window > 0 ? 'sliding' : 'state')

/** The blocks a sliding group needs just before the edge of a hit: ⌈(W − 1) ÷ B⌉ (claim vllm.hybrid-kv.sliding-hit-blocks). */
export const needBlocks = (window: number, block: number): number => divCeil(window - 1, block)

/** The most blocks a hit may cover: whole blocks below the prompt's last token (claim vllm.kv-pool.max-hit-length). */
export const maxEdge = (prompt: number, block: number): number => divFloor(prompt - 1, block)

/** Whether one group accepts a hit of `edge` blocks, from the blocks it has cached. */
export function accepts(kind: Kind, cached: ReadonlySet<number>, edge: number, need: number): boolean {
  if (kind === 'state') return cached.has(edge - 1)
  // A sliding group reads the `need` blocks before the edge, or all of them from the first when there are fewer; a full group, all of them.
  for (let at = kind === 'full' || edge < need ? 0 : edge - need; at < edge; at += 1) if (!cached.has(at)) return false
  return true
}

/** The edges, in blocks, that group `group` accepts. */
export function acceptedEdges(scene: Scene, group: number): number[] {
  const cached = new Set(scene.held[group])
  const kind = kindOf(scene, group)
  const need = scene.window > 0 ? needBlocks(scene.window, scene.block) : 1
  const out: number[] = []
  for (let edge = 1; edge <= maxEdge(scene.prompt, scene.block); edge += 1) if (accepts(kind, cached, edge, need)) out.push(edge)
  return out
}

/** The hit in blocks: the largest edge that every group accepts, or 0. */
export function hitEdge(scene: Scene): number {
  const edges = scene.held.map((_, group) => new Set(acceptedEdges(scene, group)))
  for (let edge = maxEdge(scene.prompt, scene.block); edge >= 1; edge -= 1) if (edges.every((accepted) => accepted.has(edge))) return edge
  return 0
}

/** The tokens a hit of the scene covers. */
export const hitTokens = (scene: Scene): number => hitEdge(scene) * scene.block

/** The longest edge a group accepts, or 0. */
const longestOf = (scene: Scene, group: number): number => Math.max(0, ...acceptedEdges(scene, group))

/** The scene again with its groups read by another rule, for a wrong answer that a learner's rule would give. */
function hitBy(scene: Scene, kinds: (group: number) => Kind, need: number): number {
  const sets = scene.held.map((cached) => new Set(cached))
  for (let edge = maxEdge(scene.prompt, scene.block); edge >= 1; edge -= 1) {
    if (sets.every((cached, group) => accepts(kinds(group), cached, edge, need))) return edge * scene.block
  }
  return 0
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const WINDOW_BLOCK = 16
const STATE_BLOCK = 32
const WINDOWS = [32, 48, 64, 80] as const

const run = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, at) => from + at)

interface Shape {
  readonly block: number
  readonly nbFull: number
  readonly prompt: number
}

/** A prompt of `nbFull` whole blocks, with a partial block after them unless the prompt ends on a block's edge. */
function drawPrompt(rng: Rng, block: number, aligned: boolean | null): Shape {
  const nbFull = 8 + below(rng, 13)
  const ends = aligned ?? below(rng, 100) < 35
  return { block, nbFull, prompt: nbFull * block + (ends ? 0 : 1 + below(rng, block - 1)) }
}

/**
 * Caches in which the groups meet at `edge` blocks. `limiter` names the group that cannot take one block more: the full group (0) has the blocks
 * below the edge and no more, a sliding group has a run that ends at the block before the edge. Every other group reaches past it. `strict` makes
 * every other group accept the edge after it too, so that exactly one group stops the hit, or none does when `limiter` is the number of groups.
 */
function meetingWindows(rng: Rng, shape: Shape, window: number, sliding: number, edge: number, limiter: number): number[][] {
  const need = needBlocks(window, shape.block)
  const held: number[][] = []
  const room = shape.nbFull - edge
  held.push(run(0, Math.min(shape.nbFull, limiter === 0 ? edge : edge + 1 + below(rng, Math.max(1, room))) - 1))
  for (let group = 1; group <= sliding; group += 1) {
    const last = group === limiter ? edge - 1 : edge + below(rng, Math.max(1, room))
    const required = edge < need ? 0 : edge - need
    held.push(run(Math.max(0, required - below(rng, 3)), Math.min(last, shape.nbFull - 1)))
  }
  return held
}

/** Caches in which one sliding group has lost a block from the middle of its run, as in the lesson's second cache. */
function holedWindows(rng: Rng, shape: Shape, window: number, sliding: number, top: number): number[][] {
  const need = needBlocks(window, shape.block)
  const holed = 1 + below(rng, sliding)
  const held: number[][] = [run(0, Math.min(shape.nbFull, top + below(rng, 2)) - 1)]
  for (let group = 1; group <= sliding; group += 1) {
    const blocks = run(Math.max(0, top - need - 1 - below(rng, 3)), Math.min(shape.nbFull - 1, top - 1 + below(rng, 2)))
    held.push(group === holed ? blocks.filter((block) => block !== top - 2) : blocks)
  }
  return held
}

/** Caches in which no edge is common: the head of the full group's prefix was evicted, or two windows lie apart. */
function apartWindows(rng: Rng, shape: Shape, window: number, sliding: number): number[][] {
  const need = needBlocks(window, shape.block)
  const tops = Array.from({ length: sliding }, () => need + 2 + below(rng, Math.max(1, shape.nbFull - need - 2)))
  if (below(rng, 100) < 60 || sliding < 2) {
    // The first block of the full group is gone, so the full group accepts no edge at all.
    return [run(1, Math.min(shape.nbFull, Math.max(...tops)) - 1), ...tops.map((top) => run(Math.max(0, top - need - 1), top - 1))]
  }
  // The first sliding group's run ends before the second begins to be read.
  const low = need + 1 + below(rng, 2)
  const high = low + need + 1 + below(rng, Math.max(1, shape.nbFull - low - need - 1))
  const rest = tops.slice(2).map((top) => run(Math.max(0, top - need - 1), top - 1))
  return [run(0, Math.min(shape.nbFull, high) - 1), run(0, low - 1), run(Math.min(shape.nbFull - 2, high - need - 1), Math.min(shape.nbFull - 1, high - 1)), ...rest]
}

function drawWindows(level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, 'windows', level, seed, purpose)
  const window = pick(rng, WINDOWS)
  const sliding = below(rng, 100) < 60 ? 2 : 3
  const shape = drawPrompt(rng, WINDOW_BLOCK, null)
  const top = maxEdge(shape.prompt, shape.block)
  const need = needBlocks(window, shape.block)
  const regime = below(rng, 100)
  let held: number[][]
  if (regime < 60) {
    const edge = 2 + below(rng, top - 1)
    held = meetingWindows(rng, shape, window, sliding, edge, below(rng, sliding + 1))
  } else if (regime < 90) {
    held = holedWindows(rng, shape, window, sliding, Math.min(top, need + 3 + below(rng, Math.max(1, top - need - 2))))
  } else {
    held = apartWindows(rng, shape, window, sliding)
  }
  return { variant: 'windows', prompt: shape.prompt, block: shape.block, window, held, limiter: 0 }
}

function drawStates(level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, 'states', level, seed, purpose)
  const groups = 2 + below(rng, 3)
  const shape = drawPrompt(rng, STATE_BLOCK, null)
  const top = maxEdge(shape.prompt, shape.block)
  // The request's earlier turns ended at a few edges, and a state group saved the state of each in the block before it. The hit is the
  // largest edge that every state group saved and that the full group's prefix reaches, so it is drawn first, and the other edges are drawn so
  // that each one above it is missing from some group.
  const none = below(rng, 100) < 30
  const edge = none ? 0 : 1 + below(rng, top)
  const saved: number[][] = Array.from({ length: groups }, () => (none ? [] : [edge - 1]))
  const others = new Set<number>()
  const extra = 1 + below(rng, 3)
  while (others.size < Math.min(extra + (none ? 2 : 0), top - (none ? 0 : 1))) {
    const candidate = 1 + below(rng, top)
    if (candidate !== edge) others.add(candidate)
  }
  for (const other of [...others].sort((a, b) => a - b)) {
    // An edge above the hit, or any edge when there is no hit, is missing from one group at least: it cannot be common to all of them.
    const lacking = other > edge || none ? below(rng, groups) : -1
    for (let group = 0; group < groups; group += 1) if (group !== lacking && below(rng, 100) < 75) saved[group].push(other - 1)
  }
  const fullEnd = none ? 1 + below(rng, shape.nbFull) : below(rng, 100) < 25 ? edge : edge + below(rng, shape.nbFull - edge + 1)
  const held: number[][] = [run(0, fullEnd - 1)]
  for (const blocks of saved) held.push(blocks.length === 0 ? [Math.max(0, top - 1)] : [...new Set(blocks)].sort((a, b) => a - b))
  return { variant: 'states', prompt: shape.prompt, block: shape.block, window: 0, held, limiter: 0 }
}

function drawLimiter(level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, 'limiter', level, seed, purpose)
  const window = pick(rng, WINDOWS)
  const sliding = 2
  const limiter = below(rng, sliding + 2)
  const none = limiter === sliding + 1
  const shape = drawPrompt(rng, WINDOW_BLOCK, none ? true : null)
  const top = maxEdge(shape.prompt, shape.block)
  // When none of them limits the hit, it reaches the last block below the last token and every group would take one block more.
  const edge = none ? top : 2 + below(rng, top - 2)
  return { variant: 'limiter', prompt: shape.prompt, block: shape.block, window, held: meetingWindows(rng, shape, window, sliding, edge, limiter), limiter }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  switch (variant) {
    case 'windows':
      return drawWindows(level, seed, purpose)
    case 'states':
      return drawStates(level, seed, purpose)
    case 'limiter':
      return drawLimiter(level, seed, purpose)
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The wrong answers that a learner's rule gives                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What each tempting rule gives for a scene, in tokens, by the name of the misconception. */
function mistakes(scene: Scene): Readonly<Record<string, number>> {
  const { block, window } = scene
  const longest = scene.held.map((_, group) => longestOf(scene, group) * block)
  const need = window > 0 ? needBlocks(window, block) : 1
  const out: Record<string, number> = {
    union: Math.max(...longest),
    'shortest-longest': Math.min(...longest),
    'full-only': longest[0],
    'whole-prompt': scene.prompt,
    'blocks-not-tokens': hitEdge(scene),
    'zero-hit': 0,
  }
  if (window > 0) {
    out['sliding-as-full'] = hitBy(scene, () => 'full', need)
    out['window-one-short'] = hitBy(scene, (group) => kindOf(scene, group), Math.max(1, need - 1))
  } else {
    out['state-as-full'] = hitBy(scene, () => 'full', 1)
  }
  return out
}

/** Whether a scene makes a fair question (the band). All integer arithmetic and, for a zero or a plain hit, a side draw that keeps them rare. */
function isFair(scene: Scene, lottery: Rng): boolean {
  const top = maxEdge(scene.prompt, scene.block)
  const whole = divFloor(scene.prompt, scene.block)
  if (scene.held.some((cached) => cached.length === 0 || cached.some((block) => block < 0 || block >= whole))) return false
  const edge = hitEdge(scene)
  if (scene.variant === 'limiter') {
    // The key is the group that lacks the next block, and no other does; or none, because the hit already reaches the last block below the last token.
    if (scene.limiter === scene.held.length) {
      // Every group would take one block more, if the last token allowed it.
      const need = needBlocks(scene.window, scene.block)
      return edge === top && edge >= 2 && scene.prompt % scene.block === 0 && scene.held.every((cached, group) => accepts(kindOf(scene, group), new Set(cached), edge + 1, need))
    }
    if (edge < 2 || edge >= top) return false
    const rejecting = scene.held.flatMap((_, group) => (acceptedEdges(scene, group).includes(edge + 1) ? [] : [group]))
    return rejecting.length === 1 && rejecting[0] === scene.limiter
  }
  const wrong = mistakes(scene)
  const zero = below(lottery, 6) === 0
  const plain = below(lottery, 6) === 0
  // No hit at all is a fair answer, and an instructive one, in about one item in twelve.
  if (edge === 0) return zero
  // An item whose key is the longest hit of one group, or the whole of what the last token allows, is a plain one: kept to a few.
  return wrong['union'] !== edge * scene.block || plain
}

function paramsOf(scene: Scene): Params {
  return { prompt: scene.prompt, block: scene.block, window: scene.window, held: scene.held.map((cached) => cached.join('.')).join(';'), limiter: scene.limiter }
}

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { prompt, block, window, held, limiter } = item.params
  if (typeof prompt !== 'number' || typeof block !== 'number' || typeof window !== 'number' || typeof held !== 'string' || typeof limiter !== 'number') {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  return {
    variant: item.variant,
    prompt,
    block,
    window,
    held: held.split(';').map((cached) => (cached === '' ? [] : cached.split('.').map(Number))),
    limiter,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit: string): NumPart => num(value, { unit, tag: 'synthetic' })
const syntheticTokens = (value: number): NumPart => tokensOf(value, 'synthetic')
const result = (value: number): NumPart => num(value, { unit: 'tokens', tag: 'derived' })

const ORDINAL = ['first', 'second', 'third', 'fourth'] as const

/** `the block 2`, `the blocks 0 to 6`: a noun in the singular or the plural, and the numbers as code. */
const listing = (noun: string, values: readonly number[]): Rich => rich(`the ${noun}${values.length === 1 ? '' : 's'} `, blocksText(values))

/** A group's name in a given line, in a sentence of the solution and in an option. */
function nameOf(scene: Scene, group: number): { readonly label: string; readonly plain: string } {
  if (group === 0) return { label: 'blocks the full group has cached', plain: 'The full group' }
  const kind = scene.window > 0 ? 'sliding' : 'state'
  return { label: `blocks the ${ORDINAL[group - 1]} ${kind} group has cached`, plain: `The ${ORDINAL[group - 1]} ${kind} group` }
}

function windowSentence(window: number): Rich {
  return rich('A sliding group reads the last ', syntheticTokens(window), ' (the token being computed and the ', tokensOf(window - 1), ' before it).')
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The solutions                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

function edgeSteps(scene: Scene): Step[] {
  const top = maxEdge(scene.prompt, scene.block)
  const edge = hitEdge(scene)
  const need = scene.window > 0 ? needBlocks(scene.window, scene.block) : 1
  const steps: Step[] = [
    {
      text: rich(
        'A hit never covers the last token of the prompt, and it ends on a block\'s edge. The prompt has ',
        syntheticTokens(scene.prompt),
        ', so the longest hit is the whole blocks below the last token: (',
        syntheticTokens(scene.prompt),
        ' − one) ÷ ',
        syntheticTokens(scene.block),
        ' rounded down = ',
        blocksOf(top),
        '.',
      ),
      result: blocksOf(top),
    },
    {
      text:
        scene.window > 0
          ? rich(
              'A full group accepts an edge when every block before it is cached. A sliding group accepts an edge when the ',
              blocksOf(need),
              ' before it are cached (that is (',
              syntheticTokens(scene.window),
              ' − one) ÷ ',
              syntheticTokens(scene.block),
              ' rounded up), or every block from the first when fewer than that come before it.',
            )
          : rich('A full group accepts an edge when every block before it is cached. A state group accepts an edge when the one block just before it is cached, because that block holds the state at the edge.'),
    },
  ]
  const lines = scene.held.map((_, group) => {
    const accepted = acceptedEdges(scene, group)
    return accepted.length === 0
      ? rich(nameOf(scene, group).plain, ' has ', ...listing('block', scene.held[group]), ', so it accepts no edge.')
      : rich(nameOf(scene, group).plain, ' has ', ...listing('block', scene.held[group]), ', so it accepts ', ...listing('edge', accepted), '.')
  })
  for (const line of lines) steps.push({ text: line })
  steps.push(
    edge === 0
      ? { text: rich('No edge is accepted by every group, so the hit is ', result(0), '.'), result: result(0) }
      : {
          text: rich('The largest edge that every group accepts is ', blocksOf(edge), ', which is ', blocksOf(edge), ' × ', syntheticTokens(scene.block), ' = ', result(edge * scene.block), '.'),
          result: result(edge * scene.block),
        },
  )
  return steps
}

/** The reason a group does or does not accept `edge`, for the options of `limiter`: the blocks it needs, and whether it has them. */
function reasonFor(scene: Scene, group: number, edge: number): Rich {
  const need = needBlocks(scene.window, scene.block)
  const kind = kindOf(scene, group)
  const cached = new Set(scene.held[group])
  const from = kind === 'full' || edge < need ? 0 : edge - need
  const wanted = run(from, edge - 1)
  const missing = wanted.filter((block) => !cached.has(block))
  const subject = nameOf(scene, group).plain
  if (missing.length === 0) return rich(subject, ' has ', ...listing('block', scene.held[group]), ', which covers ', ...listing('block', wanted), ' that the edge of ', blocksOf(edge), ' needs of it, so it accepts the edge.')
  return rich(subject, ' has ', ...listing('block', scene.held[group]), ', and the edge of ', blocksOf(edge), ' needs ', ...listing('block', wanted), ' of it. ', missing.length === 1 ? 'Block ' : 'Blocks ', blocksText(missing), missing.length === 1 ? ' is' : ' are', ' not cached, so it rejects the edge.')
}

function limiterOptions(scene: Scene, level: Level, seed: Seed): ChoiceOption[] {
  const edge = hitEdge(scene)
  const next = edge + 1
  const none = scene.limiter === scene.held.length
  const ids = ['full', 'first', 'second', 'none'] as const
  const options = ids.map((id, at): ChoiceOption => {
    if (at === scene.held.length) {
      return {
        id,
        text: rich('None of them: the last token'),
        why: none
          ? rich('Every group accepts the edge of ', blocksOf(next), ', but a hit never covers the last token of the prompt, and the prompt\'s last token is in the block after the ', blocksOf(edge), ', so ', blocksOf(edge), ' is as far as the hit goes.')
          : rich('The edge of ', blocksOf(next), ' is within what the last token allows, and ', nameOf(scene, scene.limiter).plain.toLowerCase(), ' does not accept it, so a group stops the hit.'),
        ...(none ? {} : { miss: `${FAMILY}.blames-the-last-token` }),
      }
    }
    return {
      id,
      text: rich(nameOf(scene, at).plain),
      why: reasonFor(scene, at, next),
      ...(at === scene.limiter ? {} : { miss: `${FAMILY}.blames-${id}` }),
    }
  })
  return shown(FAMILY, 'limiter', level, seed, options)
}

function limiterSteps(scene: Scene): Step[] {
  const edge = hitEdge(scene)
  const none = scene.limiter === scene.held.length
  const base = edgeSteps(scene).slice(0, -1)
  const tail: Step = none
    ? { text: rich('The hit is ', blocksOf(edge), ' and every group would accept one block more. Only the last token stops it.') }
    : { text: rich('The hit is ', blocksOf(edge), '. ', ...reasonFor(scene, scene.limiter, edge + 1)) }
  return [...base, tail]
}

function stepsOf(scene: Scene): Step[] {
  return scene.variant === 'limiter' ? limiterSteps(scene) : edgeSteps(scene)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function givensOf(scene: Scene): Given[] {
  const lines: Given[] = [
    { label: 'tokens in the prompt', value: given(scene.prompt, 'tokens') },
    { label: 'tokens in a block', value: given(scene.block, 'tokens') },
  ]
  if (scene.window > 0) lines.push({ label: 'window of a sliding group', value: given(scene.window, 'tokens') })
  scene.held.forEach((cached, group) => lines.push({ label: nameOf(scene, group).label, value: blocksText(cached) }))
  return lines
}

function stemOf(scene: Scene): Rich {
  const others = scene.held.length - 1
  const model =
    scene.window > 0
      ? rich('A model has one full-attention group and ', given(others, others === 1 ? 'sliding group' : 'sliding groups'), '. ', ...windowSentence(scene.window), ' ')
      : rich('A model has one full-attention group and ', given(others, 'state groups'), '. A block of a state group holds the state at its own end. ')
  const arrives = rich('A returning request has a prompt of ', syntheticTokens(scene.prompt), ', and its blocks are numbered from zero. The groups have cached the blocks below. ')
  if (scene.variant === 'limiter') {
    return rich(...model, ...arrives, 'The prefix hit covers ', tokensOf(hitTokens(scene)), '. Which group stops it from being one block longer?')
  }
  return rich(...model, ...arrives, 'How many tokens does the prefix hit cover?')
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene), stem: stemOf(scene), givens: givensOf(scene) }
  const gen = { id: FAMILY, version: VERSION }
  if (scene.variant === 'limiter') {
    const options = limiterOptions(scene, level, seed)
    const ids = ['full', 'first', 'second', 'none']
    return finishItem(gen, { ...base, worked: [], answer: { kind: 'choice', label: 'the group that limits the hit', options, correct: ids[scene.limiter] } })
  }
  const key = hitTokens(scene)
  const worked = workedPart(level, stepsOf(scene), (attempt) => {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    return isFair(example, itemRng(FAMILY, scene.variant, level, seed, `example-lottery-${attempt}`)) && hitTokens(example) !== key && example.prompt !== scene.prompt ? stepsOf(example) : null
  })
  return finishItem(gen, { ...base, worked, answer: { kind: 'numeric', label: 'tokens the hit covers', unit: 'tokens', truth: key, tolerance: EXACT } })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

function messageFor(id: string, scene: Scene, value: number): Rich | null {
  const mine = tokensOf(value)
  switch (id) {
    case 'union':
      return rich('That is the longest hit that any one group could serve, ', mine, '. A hit has to hold in every group, so it is the largest edge that all of them accept.')
    case 'shortest-longest':
      return rich('That is the shortest of the groups\' longest hits, ', mine, '. A group can accept an edge below its longest and reject its longest, so the shortest of the longest hits can be an edge that another group rejects. The hit is the largest edge that all of them accept.')
    case 'full-only':
      return rich('That is the full group\'s own hit, ', mine, '. The other groups hold fewer blocks, and the hit has to hold in them too.')
    case 'whole-prompt':
      return rich('A hit never covers the last token of the prompt: the request computes it itself, to get its logits.')
    case 'blocks-not-tokens':
      return rich('That is a count of blocks. The hit is that many blocks of ', syntheticTokens(scene.block), ', so multiply by the tokens in a block.')
    case 'sliding-as-full':
      return rich('That asks a sliding group for every block from the first. It needs only the blocks of its window just before the edge.')
    case 'state-as-full':
      return rich('That asks a state group for every block from the first. It needs only the one block that holds the state at the edge.')
    case 'window-one-short':
      return rich('That reads a window one block short. A sliding group needs ', blocksOf(needBlocks(scene.window, scene.block)), ' before the edge: (', syntheticTokens(scene.window), ' − one) ÷ ', syntheticTokens(scene.block), ' rounded up.')
    case 'zero-hit':
      return rich('Some edge is accepted by every group, so the hit is not nothing. Read each sliding group\'s window as the blocks just before the edge, a full group\'s as every block from the first, and find the largest edge that all of them accept.')
    default:
      return null
  }
}

const ORDER: readonly string[] = [
  'whole-prompt',
  'blocks-not-tokens',
  'zero-hit',
  'window-one-short',
  'sliding-as-full',
  'state-as-full',
  'shortest-longest',
  'union',
  'full-only',
]

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    const key = hitTokens(scene)
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

export const hitLength: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Prefix hit length',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'), itemRng(FAMILY, spec.id, level, seed, 'lottery'))
  },
  grade(item, response) {
    return item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)
  },
  solution: (item) => stepsOf(sceneOf(item)),
}
