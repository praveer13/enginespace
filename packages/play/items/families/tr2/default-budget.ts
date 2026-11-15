/**
 * `tr2.default-budget`: the token budget and the cap on sequences that an engine starts with, which depend on the card's memory (TR2, lesson 2;
 * KC `tr2.gpu-dependent-defaults`: say why the same server command is a different configuration on two GPUs, and name the defaults that move with
 * GPU memory).
 *
 * At vLLM v0.33.0 (the course's pin) `get_batch_defaults` picks `max_num_batched_tokens` and `max_num_seqs` from the memory of the card and from the
 * entry point, the server (`vllm serve`) or the offline `LLM` class. The rule is the sim's `vllmBatchDefaults` (packages/sim/steploop/engine-defaults.ts),
 * and each number is a claim:
 *   a card under 70 GiB, or an A100 whatever its memory   2,048 tokens for the server (claim vllm.batch-defaults.small.server-tokens), 8,192 for the offline
 *                                                          class (vllm.batch-defaults.small.offline-tokens), and 256 sequences (vllm.batch-defaults.small.seqs);
 *   a card of 70 GiB or more that is not an A100          8,192 tokens for the server (vllm.batch-defaults.large.server-tokens), 16,384 offline
 *                                                          (vllm.batch-defaults.large.offline-tokens), and 1,024 sequences (vllm.batch-defaults.large.seqs);
 *   a card of 160 GiB or more                              16,384 tokens for both entry points (vllm.batch-defaults.xlarge.tokens), and 1,024 sequences
 *                                                          (vllm.batch-defaults.xlarge.seqs).
 * The line is a memory of 70 GiB or more, and an A100 stays under it, because a large budget reduces its throughput (claims vllm.batch-defaults.threshold.large-gib,
 * vllm.batch-defaults.a100-throughput). The course's two lab cards are the
 * sim's: the RTX 4090 (24 GB) and the H100 (80 GB). A B200 is a card of 160 GiB or more by the claim that names it; any other card is a memory the ticket gives.
 * tests/play/items-default-budget.test.ts holds every number to its claim and the rule to the sim.
 *
 * What the variants ask:
 *   tier         the pair of defaults that a card and a command start with, one of three pairs for the server (levels 0 to 2) and of four, with the offline
 *                class, at level 3. The pair is drawn first, so each is the key on one seed in three, or in four (levels 0 to 3);
 *   budget-left  the tokens of a step's budget that are left for a waiting prompt once some requests are decoding: the budget less one token for each, because
 *                the scheduler serves the running requests first out of the same budget (claim vllm.scheduler.order) (levels 0 to 3);
 *   waiting      the requests still waiting after a burst has been given its first step: the burst less the cap on sequences, since the prompts are short enough
 *                that the budget is not what limits the step (levels 1 to 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the learner is alone with the
 * numbers, and level 3 changes the surface: the command may be the offline class, whose budget is not the server's, and a burst is given as clients and the
 * requests each sends.
 *
 * `band` has little to throw out: the answer is drawn first for `tier`, and `budget-left` and `waiting` draw their numbers from the card's own defaults.
 */
import { below, between, pick } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { vllmBatchDefaults } from '@es/sim/steploop/engine-defaults'
import type { VllmBatchDefaults } from '@es/sim/steploop/engine-defaults'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { derived, EXACT, given, measured, shown, workedPart } from './kit'

const FAMILY = 'tr2.default-budget'
const VERSION = 1
const KC = 'tr2.gpu-dependent-defaults'

type VariantId = 'tier' | 'budget-left' | 'waiting'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'tier', title: 'The defaults a card starts with', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'budget-left', title: 'The budget left for a prompt', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'waiting', title: 'The requests still waiting', kcs: [KC], levels: [1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The cards                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Tier = 'small' | 'large' | 'xlarge'
export type Entry = 'server' | 'offline'

/** A card of a scene: a named one the claims or the sim speak of, or a memory the ticket gives. */
export interface Card {
  readonly kind: 'rtx-4090' | 'h100' | 'a100' | 'b200' | 'memory'
  /** The memory in GiB that the ticket gives: of a card that is only a memory, and of the A100, which a ticket gives one that tempts. 0 for the other named cards. */
  readonly gib: number
}

const GIB = 1_073_741_824

/** The sim's chips, in bytes: the RTX 4090 of `s5.ts`'s napkin card and the H100 and B200 of `physics/rows.ts`. A100 and B200 are named by the claims alone. */
const NAMED: Readonly<Record<Exclude<Card['kind'], 'memory'>, { readonly text: string; readonly bytes: number }>> = {
  'rtx-4090': { text: 'RTX 4090 (24 GB)', bytes: 24_000_000_000 },
  h100: { text: 'H100 (80 GB)', bytes: 80_000_000_000 },
  a100: { text: 'A100', bytes: 80_000_000_000 },
  b200: { text: 'B200', bytes: 180_000_000_000 },
}

/** The pool of cards each tier draws from. A memory is a scenario number, and the line of 70 GiB is the claim's. */
const POOL: Readonly<Record<Tier, readonly Card[]>> = {
  small: [
    { kind: 'rtx-4090', gib: 0 },
    { kind: 'a100', gib: 80 },
    { kind: 'memory', gib: 32 },
    { kind: 'memory', gib: 48 },
    { kind: 'memory', gib: 64 },
  ],
  large: [
    { kind: 'h100', gib: 0 },
    { kind: 'memory', gib: 70 },
    { kind: 'memory', gib: 96 },
    { kind: 'memory', gib: 128 },
  ],
  xlarge: [
    { kind: 'b200', gib: 0 },
    { kind: 'memory', gib: 160 },
    { kind: 'memory', gib: 192 },
    { kind: 'memory', gib: 256 },
  ],
}

/** The memory the rule reads: what the ticket gives, or the named card's chip. */
const memoryOf = (card: Card): number => (card.kind === 'memory' || card.kind === 'a100' ? card.gib : NAMED[card.kind].bytes / GIB)

/** The defaults of a card at the pin: the sim's rule. */
export function defaultsOf(card: Card): VllmBatchDefaults {
  return vllmBatchDefaults({ memoryGiB: memoryOf(card), ...(card.kind === 'a100' ? { a100: true } : {}) })
}

/** The tier a card is in, and so the row of the claims it gets. */
export function tierOf(card: Card): Tier {
  const d = defaultsOf(card)
  return d.serverTokens === 2048 ? 'small' : d.offlineTokens === d.serverTokens ? 'xlarge' : 'large'
}

/** The tokens of budget a command gets on a card: the server's, or the offline class's. */
export const budgetOf = (card: Card, entry: Entry): number => (entry === 'server' ? defaultsOf(card).serverTokens : defaultsOf(card).offlineTokens)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Scene {
  readonly variant: VariantId
  readonly card: Card
  readonly entry: Entry
  /** `budget-left`: requests decoding, one token each. */
  readonly decoding: number
  /** `waiting`: the burst, as clients and the requests each sends (level 3), or as one number (clients 1). */
  readonly clients: number
  readonly each: number
}

/** The four pairs of defaults a command can start with. The outcome of `tier` is one of these. */
export interface Pair {
  readonly id: 'p-small-server' | 'p-large-server' | 'p-xlarge' | 'p-small-offline'
  readonly tokens: number
  readonly seqs: number
}

export const PAIRS: readonly Pair[] = [
  { id: 'p-small-server', tokens: 2048, seqs: 256 },
  { id: 'p-large-server', tokens: 8192, seqs: 1024 },
  { id: 'p-xlarge', tokens: 16384, seqs: 1024 },
  { id: 'p-small-offline', tokens: 8192, seqs: 256 },
]

const pairOf = (card: Card, entry: Entry): Pair => {
  const d = defaultsOf(card)
  const tokens = budgetOf(card, entry)
  const found = PAIRS.find((pair) => pair.tokens === tokens && pair.seqs === d.seqs)
  if (found === undefined) throw new RangeError(`${FAMILY}: no pair of defaults has ${tokens} tokens and ${d.seqs} sequences`)
  return found
}

/** A (card, command) that starts with `pair`: the card is drawn from the tiers that give it, and the entry point with it. */
function sceneFor(pair: Pair['id'], rng: Rng, level: Level): { card: Card; entry: Entry } {
  switch (pair) {
    case 'p-small-server':
      return { card: pick(rng, POOL.small), entry: 'server' }
    case 'p-large-server':
      return { card: pick(rng, POOL.large), entry: 'server' }
    case 'p-small-offline':
      return { card: pick(rng, POOL.small), entry: 'offline' }
    case 'p-xlarge': {
      // The largest pair is the server's on a card of 160 GiB or more, and at level 3 also the offline class's on a card of 70 GiB or more.
      const route = level === 3 ? below(rng, 3) : 0
      if (route === 0) return { card: pick(rng, POOL.xlarge), entry: 'server' }
      return { card: pick(rng, route === 1 ? POOL.large : POOL.xlarge), entry: 'offline' }
    }
  }
}

/** The pairs a level draws among: the server's three below level 3, and all four at level 3. */
const pairsAt = (level: Level): readonly Pair[] => (level === 3 ? PAIRS : PAIRS.slice(0, 3))

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  if (variant === 'tier') {
    const outcome = pairsAt(level)[below(rng, pairsAt(level).length)]
    return { variant, ...sceneFor(outcome.id, rng, level), decoding: 0, clients: 1, each: 1 }
  }
  const entry: Entry = level === 3 && variant === 'budget-left' ? pick(rng, ['server', 'offline']) : 'server'
  const card = pick(rng, POOL[pick(rng, ['small', 'large', 'xlarge'] as const)])
  const cap = defaultsOf(card).seqs
  if (variant === 'budget-left') {
    // Between 16 and a cap less 8 requests decode, in steps of 8.
    return { variant, card, entry, decoding: 8 * between(rng, 2, cap / 8 - 1), clients: 1, each: 1 }
  }
  // A burst of 50 to 750 requests more than the cap below it, in steps of 25 (a tier's cap is a multiple of 25 plus a remainder, so the burst never lands on it).
  const total = cap + 25 * between(rng, 2, Math.floor((3 * cap) / 25))
  if (level === 3) {
    const each = pick(rng, [5, 10, 20, 25, 50])
    return { variant, card, entry, decoding: 0, clients: Math.floor(total / each), each }
  }
  return { variant, card, entry, decoding: 0, clients: 1, each: total }
}

const burstOf = (scene: Scene): number => scene.clients * scene.each

function isFair(scene: Scene): boolean {
  const d = defaultsOf(scene.card)
  if (scene.variant === 'waiting') return burstOf(scene) > d.seqs
  if (scene.variant === 'budget-left') return scene.decoding < d.seqs && scene.decoding < budgetOf(scene.card, scene.entry)
  return true
}

function paramsOf(scene: Scene): Params {
  return { card: scene.card.kind, gib: scene.card.gib, entry: scene.entry, decoding: scene.decoding, clients: scene.clients, each: scene.each }
}

const CARD_KINDS: readonly Card['kind'][] = ['rtx-4090', 'h100', 'a100', 'b200', 'memory']

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { card, gib, entry, decoding, clients, each } = item.params
  const kind = CARD_KINDS.find((candidate) => candidate === card)
  if (kind === undefined || typeof gib !== 'number' || (entry !== 'server' && entry !== 'offline') || typeof decoding !== 'number' || typeof clients !== 'number' || typeof each !== 'number') {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  return { variant: item.variant, card: { kind, gib }, entry, decoding, clients, each }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const tokensOf = (value: number): NumPart => measured(value, 'tokens')
const seqsOf = (value: number): NumPart => measured(value, 'sequences')

/** The command a scene starts the engine with: the server, or the offline class, as code. */
const commandOf = (entry: Entry): string => (entry === 'server' ? 'vllm serve my-model' : 'LLM(model="my-model")')

/** The card, as the ticket writes it: a named card as code, with a memory beside it only where the scene gives one. */
function cardGivens(card: Card): Given[] {
  if (card.kind === 'memory') return [{ label: 'card memory', value: given(card.gib, 'GiB') }]
  const named: Given = { label: 'card', value: code(NAMED[card.kind].text) }
  // An A100 is given with the memory that tempts: the rule keeps it in the small tier whatever it is.
  return card.kind === 'a100' ? [named, { label: 'card memory', value: given(card.gib, 'GiB') }] : [named]
}

/** The line between the two smaller tiers and the line to the largest, in GiB (claims vllm.batch-defaults.threshold.large-gib and vllm.batch-defaults.xlarge.tokens). */
export const LINE = 70
export const TOP = 160

/** Why a card gets the row it gets: the sentence that names the tier. */
function tierSentence(card: Card): Rich {
  const tier = tierOf(card)
  switch (card.kind) {
    case 'a100':
      return rich('An A100 stays in the smallest tier whatever its memory, because the source\'s own note says that a large budget reduces an A100\'s throughput.')
    case 'rtx-4090':
      return rich('The ', code('RTX 4090'), ' has less than ', measured(LINE, 'GiB'), ' of memory, so it is in the smallest tier.')
    case 'h100':
      return rich('The H100 has ', measured(LINE, 'GiB'), ' or more and is not an A100, so it is in the large tier.')
    case 'b200':
      return rich('A B200 is a card of ', measured(TOP, 'GiB'), ' or more, so it is in the largest tier.')
    case 'memory':
      return tier === 'small'
        ? rich('A card of ', given(card.gib, 'GiB'), ' is under the line of ', measured(LINE, 'GiB'), ', so it is in the smallest tier.')
        : tier === 'large'
          ? rich('A card of ', given(card.gib, 'GiB'), ' is at or over the line of ', measured(LINE, 'GiB'), ' and under ', measured(TOP, 'GiB'), ', so it is in the large tier.')
          : rich('A card of ', given(card.gib, 'GiB'), ' is at or over ', measured(TOP, 'GiB'), ', so it is in the largest tier.')
  }
}

/** The defaults of the card's row for a command: the sentence a solution closes with. */
function rowSentence(card: Card, entry: Entry): Rich {
  const pair = pairOf(card, entry)
  return rich(
    entry === 'server' ? 'On this tier ' : 'In the offline class, on this tier, ',
    code(entry === 'server' ? 'vllm serve' : 'LLM'),
    ' starts with ',
    code('max_num_batched_tokens'),
    ' ',
    tokensOf(pair.tokens),
    ' and ',
    code('max_num_seqs'),
    ' ',
    seqsOf(pair.seqs),
    '.',
  )
}

/** What each pair of defaults is, for the reason an option gives when it is not the card's. */
const PAIR_TEXT: Readonly<Record<Pair['id'], Rich>> = {
  'p-small-server': rich('what the server starts with on a card under ', measured(LINE, 'GiB'), ' or on an A100'),
  'p-large-server': rich('what the server starts with on a card of ', measured(LINE, 'GiB'), ' or more that is not an A100'),
  'p-xlarge': rich('what the server starts with on a card of ', measured(TOP, 'GiB'), ' or more, or what the offline class starts with on a card of ', measured(LINE, 'GiB'), ' or more'),
  'p-small-offline': rich('what the offline class starts with on a card under ', measured(LINE, 'GiB'), ' or on an A100'),
}

function tierSteps(scene: Scene): Step[] {
  const pair = pairOf(scene.card, scene.entry)
  return [
    { text: tierSentence(scene.card) },
    { text: rowSentence(scene.card, scene.entry) },
    { text: rich('So the pair is ', tokensOf(pair.tokens), ' and ', seqsOf(pair.seqs), ': the same command on a card of another tier is a different configuration.') },
  ]
}

function budgetSteps(scene: Scene): Step[] {
  const budget = budgetOf(scene.card, scene.entry)
  const left = budget - scene.decoding
  return [
    { text: tierSentence(scene.card) },
    { text: rowSentence(scene.card, scene.entry) },
    {
      text: rich('The scheduler serves the running requests first, out of the same budget, and a request in decode asks for one token: ', tokensOf(budget), ' − ', given(scene.decoding, 'tokens'), ' = ', derived(left, 'tokens'), ' are left for a waiting prompt.'),
      result: derived(left, 'tokens'),
    },
  ]
}

function waitingSteps(scene: Scene): Step[] {
  const d = defaultsOf(scene.card)
  const burst = burstOf(scene)
  const still = burst - d.seqs
  const total =
    scene.clients === 1
      ? rich('The burst is ', given(burst, 'requests'), '.')
      : rich('The burst is ', given(scene.clients, 'clients'), ' × ', given(scene.each, 'requests'), ' = ', derived(burst, 'requests'), '.')
  return [
    { text: tierSentence(scene.card) },
    { text: rich('A step holds at most ', code('max_num_seqs'), ' requests, and in this tier that is ', seqsOf(d.seqs), '. Each prompt is short enough that the token budget is not what limits the step, so the cap is.') },
    { text: rich(...total, ' The first step takes ', measured(d.seqs, 'requests'), ', and ', derived(burst, 'requests'), ' − ', measured(d.seqs, 'requests'), ' = ', derived(still, 'requests'), ' are still waiting.'), result: derived(still, 'requests') },
  ]
}

const solutionOf = (scene: Scene): Step[] => (scene.variant === 'tier' ? tierSteps(scene) : scene.variant === 'budget-left' ? budgetSteps(scene) : waitingSteps(scene))

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const PAIR_OPTION = (pair: Pair): Rich => rich(code('max_num_batched_tokens'), ' ', tokensOf(pair.tokens), ' and ', code('max_num_seqs'), ' ', seqsOf(pair.seqs))

function tierOptions(scene: Scene, level: Level, seed: Seed): ChoiceOption[] {
  const key = pairOf(scene.card, scene.entry)
  const reason = tierSteps(scene)
    .slice(0, 2)
    .flatMap((step) => [...step.text, text(' ')])
  return shown(
    FAMILY,
    'tier',
    level,
    seed,
    pairsAt(level).map(
      (pair): ChoiceOption => ({
        id: pair.id,
        text: PAIR_OPTION(pair),
        why: pair.id === key.id ? rich(...reason) : rich('That is ', ...PAIR_TEXT[pair.id], '. This ticket is not that: ', ...tierSentence(scene.card)),
        ...(pair.id === key.id ? {} : { miss: `${FAMILY}.${pair.id}-taken-for` }),
      }),
    ),
  )
}

const STEMS: Readonly<Record<VariantId, (scene: Scene) => Rich>> = {
  tier: (scene) =>
    rich('A team starts vLLM v0.33.0 with the command below and sets no other flag. Which defaults does the engine start with?', ...(scene.entry === 'offline' ? [' The offline class is the one the command starts.'] : [])),
  'budget-left': (scene) =>
    rich(
      scene.entry === 'server' ? 'A team starts vLLM v0.33.0 with the command below and sets no other flag.' : 'A team starts vLLM v0.33.0 with the offline class, as below, and sets no other flag.',
      ' In one step some requests are decoding, one token each, and a prompt waits. How many tokens of the step\'s budget are left for the prompt?',
    ),
  waiting: (scene) =>
    rich(
      'A team starts vLLM v0.33.0 with the command below and sets no other flag. The engine is idle when ',
      scene.clients === 1 ? 'a burst of requests arrives at once' : 'clients each send a burst of requests at once',
      ', every request a prompt of ',
      given(4, 'tokens'),
      '. After the first step has taken what the engine allows, how many requests are still waiting?',
    ),
}

function givensOf(scene: Scene): Given[] {
  const lines: Given[] = [...cardGivens(scene.card), { label: 'command', value: code(commandOf(scene.entry)) }]
  if (scene.variant === 'budget-left') lines.push({ label: 'requests decoding', value: given(scene.decoding, 'requests') })
  if (scene.variant === 'waiting') {
    if (scene.clients === 1) lines.push({ label: 'burst', value: given(burstOf(scene), 'requests') })
    else lines.push({ label: 'clients', value: given(scene.clients, '') }, { label: 'requests each', value: given(scene.each, 'requests') })
  }
  return lines
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene), stem: STEMS[scene.variant](scene), givens: givensOf(scene) }
  const gen = { id: FAMILY, version: VERSION }
  if (scene.variant === 'tier') {
    const key = pairOf(scene.card, scene.entry)
    return finishItem(gen, {
      ...base,
      worked: workedPart(level, tierSteps(scene), (attempt) => {
        const example = drawScene('tier', level, seed, `example-${attempt}`)
        return pairOf(example.card, example.entry).id !== key.id ? tierSteps(example) : null
      }),
      answer: { kind: 'choice', label: 'the defaults', options: tierOptions(scene, level, seed), correct: key.id },
    })
  }
  const truth = scene.variant === 'budget-left' ? budgetOf(scene.card, scene.entry) - scene.decoding : burstOf(scene) - defaultsOf(scene.card).seqs
  return finishItem(gen, {
    ...base,
    worked: workedPart(level, solutionOf(scene), (attempt) => {
      const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
      const exampleKey = example.variant === 'budget-left' ? budgetOf(example.card, example.entry) - example.decoding : burstOf(example) - defaultsOf(example.card).seqs
      return isFair(example) && exampleKey !== truth ? solutionOf(example) : null
    }),
    answer: { kind: 'numeric', label: scene.variant === 'budget-left' ? 'tokens left for the prompt' : 'requests still waiting', unit: scene.variant === 'budget-left' ? 'tokens' : 'requests', truth, tolerance: EXACT },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => isAbout(value, target, 0)

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    const d = defaultsOf(scene.card)
    if (scene.variant === 'budget-left') {
      const budget = budgetOf(scene.card, scene.entry)
      if (near(value, budget)) {
        return { id: `${FAMILY}.decodes-forgotten`, message: rich('That is the whole budget. The running requests are served first, out of the same budget, and each decode takes a token of it.') }
      }
      if (near(value, d.seqs - scene.decoding)) {
        return { id: `${FAMILY}.cap-as-budget`, message: rich('You took the cap on sequences for the budget. They are two settings: the budget counts tokens in a step, and the cap counts the requests in it.') }
      }
      const others = [...new Set(PAIRS.map((pair) => pair.tokens))].filter((tokens) => tokens !== budget)
      if (others.some((tokens) => near(value, tokens - scene.decoding))) {
        return { id: `${FAMILY}.other-tier`, message: rich('That is the budget of a card in another tier, or of the other entry point. The defaults move with the card\'s memory, and the server and the offline class have their own.') }
      }
      return null
    }
    const burst = burstOf(scene)
    if (near(value, burst - budgetOf(scene.card, 'server'))) {
      return { id: `${FAMILY}.budget-as-cap`, message: rich('You took the token budget for the cap. Each prompt is short, so the step is full of requests long before it is full of tokens.') }
    }
    for (const cap of [256, 1024]) {
      if (cap !== d.seqs && near(value, burst - cap)) {
        return { id: `${FAMILY}.other-tier`, message: rich('That uses the cap of a card in another tier. The cap is ', seqsOf(256), ' below ', measured(LINE, 'GiB'), ' and on an A100, and ', seqsOf(1024), ' on a card of ', measured(LINE, 'GiB'), ' or more.') }
      }
    }
    if (near(value, burst)) {
      return { id: `${FAMILY}.none-admitted`, message: rich('The first step takes requests, up to the cap, so some of the burst is no longer waiting after it.') }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const defaultBudget: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Defaults that move with the card',
  kcs: [KC],
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
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution: (item) => solutionOf(sceneOf(item)),
}
