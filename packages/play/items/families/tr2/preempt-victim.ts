/**
 * `tr2.preempt-victim`: how a scheduler that spends one token budget chooses what runs, and what it does when the KV pool runs dry (TR2,
 * lesson 2; KC `tr2.one-budget`: say how a scheduler that spends one token budget on running and waiting requests together chooses what
 * runs, and what it does when the KV pool runs out). It is the exit item of lesson 2 that "gives the order requests joined and asks which
 * is preempted".
 *
 * At vLLM v0.33.0 (the course's pin) the scheduler has no prefill phase and no decode phase: each request has the tokens it has computed and the tokens
 * it should have, and each step hands out one budget so that every request catches up (claim vllm.scheduler.no-phases). It serves the running requests
 * first and the waiting ones after them, out of the one budget (vllm.scheduler.order), and gives a waiting request the smaller of what it still needs and
 * what is left (vllm.scheduler.chunk-to-budget). When a running request needs a block and the pool has none, the scheduler preempts a running request.
 * Under first come, first served the victim is the last request in the running list; under the priority policy it is the one with the largest priority
 * value, and among those the latest arrival (claims vllm.scheduler.preemption-victim, vllm.scheduler.preemption-lowest-priority). Preemption is recompute
 * only: the victim's blocks are freed, its computed tokens go back to 0, and it returns to the front of the waiting queue (vllm.scheduler.preemption-recompute).
 * It comes back for all the tokens it has, its output so far as well as its prompt (vllm.scheduler.resume-tokens). The rule is the pinned code's:
 * `max(running, key=(priority, arrival_time))`, or `running[-1]`.
 *
 * What the variants ask:
 *   victim   which of five running requests is preempted first, drawn answer first over the five. A request is the victim; one is the last to join, one the
 *            oldest, one holds the most blocks, one the fewest and one is the request that asked for the block (first come, first served); or the priority
 *            policy, where a request has the largest value, one has the smallest, one joined last, one arrived first, one asked, and in half the scenes two share
 *            the largest value and the later arrival is the victim (levels 0 to 3);
 *   restart  the tokens that the engine computes for the victim before its next new token, when none of its blocks is still cached: its prompt and its output
 *            so far (levels 1 to 3);
 *   chunk    the tokens of a waiting prompt that one step takes, when requests are decoding and chunked prefill is on: the smaller of the prompt and the budget
 *            less what the decodes take (levels 0 to 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the learner is alone with the
 * numbers, and level 3 changes the surface: `victim` does not say in which order the requests joined, only when each arrived; `restart` asks for the last
 * step of the recompute under a budget; and `chunk` gives the decodes drafts, so each takes more than a token.
 *
 * tests/play/items-preempt-victim.test.ts holds `restart` and `chunk` to the step loop, and the choice of the victim to a second statement of the rule.
 */
import { below, between, divCeil, pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { derived, EXACT, given, shown, workedPart } from './kit'

const FAMILY = 'tr2.preempt-victim'
const VERSION = 1
const KC = 'tr2.one-budget'

type VariantId = 'victim' | 'restart' | 'chunk'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'victim', title: 'Which request is preempted', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'restart', title: 'The tokens a victim computes again', kcs: [KC], levels: [1, 2, 3] },
  { id: 'chunk', title: 'The prompt a step takes', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Policy = 'fcfs' | 'priority'

/** One running request of a `victim` scene. */
export interface Running {
  readonly name: string
  /** KV blocks it holds. */
  readonly blocks: number
  /** The second it arrived. */
  readonly arrived: number
  /** Its priority value, for the priority policy. A larger value is a lower priority. */
  readonly priority: number
}

/**
 * The rule of the family, as the pinned code writes it: the victim is the last request of the running list under first come, first served, and under the
 * priority policy the maximum of the list by priority value and then arrival time. `running` is in the order the requests joined.
 */
export const preemptModel = {
  victim(policy: Policy, running: readonly Running[]): Running {
    if (policy === 'fcfs') return running[running.length - 1]
    return running.reduce((top, one) => (one.priority > top.priority || (one.priority === top.priority && one.arrived > top.arrived) ? one : top))
  },
  /** The tokens a returning victim must have computed before its next new token: all it has, since none of it is computed. */
  recompute: (prompt: number, generated: number): number => prompt + generated,
  /** The tokens carried by the last of the steps that recompute `tokens` under a budget, on an idle engine: the remainder, or a whole budget. */
  lastStep: (tokens: number, budget: number): number => tokens - budget * (divCeil(tokens, budget) - 1),
  /** The tokens of a waiting prompt that a step takes: the smaller of what the prompt needs and what the running requests leave of the budget. */
  take: (prompt: number, budget: number, decoding: number, perRequest: number): number => Math.min(prompt, budget - decoding * perRequest),
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Why a request of a `victim` scene is the one it is. */
type Role = 'key' | 'oldest' | 'asking' | 'largest' | 'smallest' | 'last' | 'lowest' | 'earliest' | 'tied'

interface VictimScene {
  readonly variant: 'victim'
  readonly policy: Policy
  /** Two requests share the largest priority value, and the key arrived later. */
  readonly tie: boolean
  /** The five requests, in the order they joined the running list. */
  readonly running: readonly Running[]
  /** The role of each, in the same order. */
  readonly roles: readonly Role[]
}

interface RestartScene {
  readonly variant: 'restart'
  readonly prompt: number
  readonly generated: number
  /** The budget of a step: level 3 only (0 below). */
  readonly budget: number
}

interface ChunkScene {
  readonly variant: 'chunk'
  readonly budget: number
  readonly decoding: number
  /** Drafts of each decoding request (level 3), so that it asks for `1 + drafts` tokens. */
  readonly drafts: number
  /** The waiting prompt is a system prompt and a user message: the learner adds them, so the prompt is never a number the ticket prints. */
  readonly system: number
  readonly user: number
}

const promptOf = (scene: ChunkScene): number => scene.system + scene.user

type Scene = VictimScene | RestartScene | ChunkScene

const NAMES: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** `count` distinct integers from `lo` to `hi`, ascending. */
function distinctSorted(rng: Rng, count: number, lo: number, hi: number): number[] {
  const chosen = new Set<number>()
  while (chosen.size < count) chosen.add(between(rng, lo, hi))
  return [...chosen].sort((a, b) => a - b)
}

/** The roles of the five requests, in the order they joined. Position 4 is the last to join; the key is the last under first come, first served. */
function drawVictim(level: Level, seed: Seed, purpose: string): VictimScene {
  const rng = itemRng(FAMILY, 'victim', level, seed, purpose)
  const policy: Policy = below(rng, 2) === 0 ? 'fcfs' : 'priority'
  const names = shuffle(rng, NAMES).slice(0, 5)
  if (policy === 'fcfs') {
    // Oldest first and key last; the three between are the one asking, the one holding the most and the one holding the fewest.
    const middle = shuffle(rng, ['asking', 'largest', 'smallest'] as const)
    const roles: Role[] = ['oldest', ...middle, 'key']
    const sorted = distinctSorted(rng, 5, 4, 60)
    const [lowest, ...rest] = sorted
    const highest = rest[rest.length - 1]
    const between3 = shuffle(rng, rest.slice(0, 3))
    const blocksOf: Record<string, number> = { smallest: lowest, largest: highest }
    let next = 0
    const blocks = roles.map((role) => blocksOf[role] ?? between3[next++])
    // Arrivals follow the order of joining under first come, first served.
    const arrivals = distinctSorted(rng, 5, 1, 90)
    return {
      variant: 'victim',
      policy,
      tie: false,
      running: names.map((name, at) => ({ name, blocks: blocks[at], arrived: arrivals[at], priority: 0 })),
      roles,
    }
  }
  const tie = below(rng, 2) === 0
  // The last to join is never the victim; the others are placed anywhere before it.
  const front = shuffle(rng, tie ? (['key', 'tied', 'asking', 'lowest'] as const) : (['key', 'earliest', 'asking', 'lowest'] as const))
  const roles: Role[] = [...front, 'last']
  const top = 4 + below(rng, 6)
  const priorityOf = (role: Role): number => (role === 'key' || role === 'tied' ? top : role === 'lowest' ? 1 : between(rng, 2, top - 1))
  // Arrival seconds are drawn apart from the order of joining: shuffled, then fixed up so that the roles hold. The newest request arrived last of all
  // (and joined last), the earliest arrived first of all, and where two share the largest value the key arrived later than the other.
  let arrivals = shuffle(rng, distinctSorted(rng, 5, 1, 90))
  const exchange = (a: number, b: number): void => {
    const copy = [...arrivals]
    copy[a] = arrivals[b]
    copy[b] = arrivals[a]
    arrivals = copy
  }
  const indexOf = (role: Role): number => roles.indexOf(role)
  exchange(indexOf('last'), arrivals.indexOf(Math.max(...arrivals)))
  if (!tie) exchange(indexOf('earliest'), arrivals.indexOf(Math.min(...arrivals)))
  else if (arrivals[indexOf('key')] < arrivals[indexOf('tied')]) exchange(indexOf('key'), indexOf('tied'))
  return {
    variant: 'victim',
    policy,
    tie,
    running: names.map((name, at) => ({ name, blocks: between(rng, 4, 60), arrived: arrivals[at], priority: priorityOf(roles[at]) })),
    roles,
  }
}

function drawRestart(level: Level, seed: Seed, purpose: string): RestartScene {
  const rng = itemRng(FAMILY, 'restart', level, seed, purpose)
  const prompt = 100 * between(rng, 3, 40)
  const generated = 10 * between(rng, 3, 60)
  return { variant: 'restart', prompt, generated, budget: level === 3 ? pick(rng, [512, 1024, 2048]) : 0 }
}

function drawChunk(level: Level, seed: Seed, purpose: string): ChunkScene {
  const rng = itemRng(FAMILY, 'chunk', level, seed, purpose)
  const budget = pick(rng, [1024, 2048, 4096, 8192])
  const drafts = level === 3 ? between(rng, 2, 4) : 0
  const per = 1 + drafts
  // The decodes take between a twentieth and a half of the budget, in steps of 8 requests, and never more than the 1,024 that a card's rail holds.
  const decoding = 8 * between(rng, Math.max(1, Math.floor(budget / per / 8 / 20)), Math.min(128, Math.floor(budget / per / 8 / 2)))
  const room = budget - decoding * per
  // A prompt is cut by the budget three times in five, and fits whole otherwise.
  const prompt = below(rng, 5) < 3 ? room + 50 * between(rng, 1, 40) : 10 * between(rng, 3, Math.floor((room - 10) / 10))
  const system = 10 * between(rng, 1, Math.floor(prompt / 10) - 1)
  return { variant: 'chunk', budget, decoding, drafts, system, user: prompt - system }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  return variant === 'victim' ? drawVictim(level, seed, purpose) : variant === 'restart' ? drawRestart(level, seed, purpose) : drawChunk(level, seed, purpose)
}

/** The index of the key among a scene's running requests. */
const keyOfVictim = (scene: VictimScene): number => scene.running.indexOf(preemptModel.victim(scene.policy, scene.running))

function isFair(scene: Scene): boolean {
  switch (scene.variant) {
    case 'victim': {
      // The roles hold: the rule picks the request that is the key, and no lure is the key as well.
      const key = keyOfVictim(scene)
      return scene.roles[key] === 'key' && scene.roles.filter((role) => role === 'key').length === 1
    }
    case 'restart':
      return scene.prompt > 0 && scene.generated > 0
    case 'chunk': {
      const room = scene.budget - scene.decoding * (1 + scene.drafts)
      return room >= 64 && promptOf(scene) >= 30 && promptOf(scene) !== room && scene.system > 0 && scene.user > 0
    }
  }
}

function paramsOf(scene: Scene): Params {
  switch (scene.variant) {
    case 'victim':
      return {
        policy: scene.policy,
        tie: scene.tie,
        names: scene.running.map((one) => one.name).join(''),
        blocks: scene.running.map((one) => one.blocks).join(','),
        arrived: scene.running.map((one) => one.arrived).join(','),
        priority: scene.running.map((one) => one.priority).join(','),
        roles: scene.roles.join(','),
      }
    case 'restart':
      return { prompt: scene.prompt, generated: scene.generated, budget: scene.budget }
    case 'chunk':
      return { budget: scene.budget, decoding: scene.decoding, drafts: scene.drafts, system: scene.system, user: scene.user }
  }
}

const ROLES: readonly string[] = ['key', 'oldest', 'asking', 'largest', 'smallest', 'last', 'lowest', 'earliest', 'tied']
const isRole = (value: string): value is Role => ROLES.includes(value)
const listOf = (value: unknown): string[] => (typeof value === 'string' && value !== '' ? value.split(',') : [])

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params
  if (item.variant === 'victim') {
    const names = typeof p.names === 'string' ? [...p.names] : []
    const blocks = listOf(p.blocks).map(Number)
    const arrived = listOf(p.arrived).map(Number)
    const priority = listOf(p.priority).map(Number)
    const roles = listOf(p.roles)
    if ((p.policy !== 'fcfs' && p.policy !== 'priority') || typeof p.tie !== 'boolean' || names.length !== 5 || roles.length !== 5 || !roles.every(isRole)) {
      throw new TypeError(`${FAMILY}: the params of victim are not a scene`)
    }
    return { variant: 'victim', policy: p.policy, tie: p.tie, running: names.map((name, at) => ({ name, blocks: blocks[at], arrived: arrived[at], priority: priority[at] })), roles }
  }
  if (item.variant === 'restart') {
    if (typeof p.prompt !== 'number' || typeof p.generated !== 'number' || typeof p.budget !== 'number') throw new TypeError(`${FAMILY}: the params of restart are not a scene`)
    return { variant: 'restart', prompt: p.prompt, generated: p.generated, budget: p.budget }
  }
  if (typeof p.budget !== 'number' || typeof p.decoding !== 'number' || typeof p.drafts !== 'number' || typeof p.system !== 'number' || typeof p.user !== 'number') {
    throw new TypeError(`${FAMILY}: the params of chunk are not a scene`)
  }
  return { variant: 'chunk', budget: p.budget, decoding: p.decoding, drafts: p.drafts, system: p.system, user: p.user }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const tokens = (value: number, mark: (v: number, u: string) => NumPart = derived): NumPart => mark(value, 'tokens')
const seconds = (value: number): NumPart => given(value, 's')
const blocks = (value: number): NumPart => given(value, 'blocks')

const nameOf = (scene: VictimScene, role: Role): string => scene.running[scene.roles.indexOf(role)].name
const named = (name: string): Rich => rich('Request ', code(name))
const listText = (scene: VictimScene): string => scene.running.map((one) => one.name).join(', ')

/** The facts a `victim` ticket prints, as lines. */
function victimGivens(scene: VictimScene, level: Level): Given[] {
  const lines: Given[] = []
  const byName = [...scene.running].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  // Below level 3 the running list is given, in the order the requests joined; at level 3 only the arrivals are, in the order of the names.
  const order = level === 3 ? byName : scene.running
  if (level < 3) lines.push({ label: 'running list, in the order requests joined', value: text(listText(scene)) })
  lines.push({ label: 'asking for a block', value: text(nameOf(scene, 'asking')) })
  if (scene.policy === 'priority') {
    for (const one of order) lines.push({ label: `priority value of ${one.name}`, value: given(one.priority, '') })
    for (const one of order) lines.push({ label: `arrived at, ${one.name}`, value: seconds(one.arrived) })
  } else {
    for (const one of order) lines.push({ label: `blocks held by ${one.name}`, value: blocks(one.blocks) })
    if (level === 3) for (const one of order) lines.push({ label: `arrived at, ${one.name}`, value: seconds(one.arrived) })
  }
  return lines
}

function victimStem(scene: VictimScene, level: Level): Rich {
  return rich(
    'In a synthetic engine at vLLM v0.33.0, five requests are running and the KV pool has no free block. The scheduler is giving ',
    ...named(nameOf(scene, 'asking')),
    ' its next block. ',
    scene.policy === 'fcfs' ? 'The policy is first come, first served' : 'The policy is priority',
    level === 3 && scene.policy === 'fcfs' ? ', and the requests joined the running list in the order they arrived. ' : '. ',
    'Which request does the scheduler preempt first?',
  )
}

const FIRST_STEP: Rich = rich('The pool has no free block, so the scheduler preempts a running request. Preemption is recompute only: the victim\'s blocks are freed, its computed tokens go back to zero, and it returns to the front of the waiting queue.')

function victimSteps(scene: VictimScene, level: Level): Step[] {
  const key = scene.running[keyOfVictim(scene)]
  if (scene.policy === 'fcfs') {
    const order = level === 3 ? rich('The requests joined in the order they arrived, so the list runs ', code(listText(scene)), '.') : rich('The running list is ', code(listText(scene)), '.')
    return [
      { text: FIRST_STEP },
      { text: rich('Under first come, first served the victim is the last request of the running list, the one that joined last. ', ...order, ' It ends in ', ...named(key.name), '.') },
      {
        text: rich(
          'The scheduler does not look at who asked, at who is oldest or at how much a request holds, so ',
          ...named(nameOf(scene, 'asking')),
          ', which asked, ',
          ...named(nameOf(scene, 'oldest')),
          ', which joined first, and ',
          ...named(nameOf(scene, 'largest')),
          ', which holds the most blocks, all stay.',
        ),
      },
    ]
  }
  const top = scene.running.reduce((most, one) => Math.max(most, one.priority), 0)
  const holders = scene.running.filter((one) => one.priority === top)
  return [
    { text: FIRST_STEP },
    {
      text: rich('Under the priority policy the victim is the lowest-priority request, which is the one with the largest priority value, and among requests with the same value the one that arrived last.'),
    },
    {
      text:
        holders.length === 1
          ? rich('The largest value is ', given(top, ''), ', and only ', ...named(key.name), ' has it, so it is the victim.')
          : rich('The largest value is ', given(top, ''), ', and ', ...named(holders[0].name), ' and ', ...named(holders[1].name), ' share it. ', ...named(key.name), ' arrived last, at ', seconds(key.arrived), ', so it is the victim.'),
    },
  ]
}

function restartSteps(scene: RestartScene): Step[] {
  const total = preemptModel.recompute(scene.prompt, scene.generated)
  const first: Step = {
    text: rich('Preemption is recompute only: the victim\'s blocks are freed and its computed tokens go back to zero, with none of them cached, so everything it has must be computed again.'),
  }
  const count: Step = {
    text: rich('What it has is its prompt and the output it generated so far, because the scheduler counts a returning request\'s output tokens as well as its prompt: ', given(scene.prompt, 'tokens'), ' + ', given(scene.generated, 'tokens'), ' = ', tokens(total), '.'),
    ...(scene.budget === 0 ? { result: tokens(total) } : {}),
  }
  if (scene.budget === 0) return [first, count]
  const steps = divCeil(total, scene.budget)
  const last = preemptModel.lastStep(total, scene.budget)
  return [
    first,
    count,
    {
      text: rich(
        'A step takes at most the budget of ',
        given(scene.budget, 'tokens'),
        ', so the ',
        tokens(total),
        ' go in ',
        derived(steps, 'steps'),
        ', and the last of them carries what is left: ',
        tokens(total),
        ' − ',
        derived(scene.budget * (steps - 1), 'tokens'),
        ' = ',
        tokens(last),
        '.',
      ),
      result: tokens(last),
    },
  ]
}

function chunkSteps(scene: ChunkScene): Step[] {
  const per = 1 + scene.drafts
  const taken = scene.decoding * per
  const room = scene.budget - taken
  const prompt = promptOf(scene)
  const key = preemptModel.take(prompt, scene.budget, scene.decoding, per)
  return [
    {
      text:
        scene.drafts === 0
          ? rich('The scheduler serves the running requests first, out of the same budget, and a request in decode asks for one token: ', given(scene.decoding, 'requests'), ' take ', tokens(taken), '.')
          : rich(
              'The scheduler serves the running requests first, out of the same budget, and gives each every token it has that is not computed yet, its drafts included, which is ',
              derived(per, 'tokens'),
              ' for a request in decode: ',
              given(scene.decoding, 'requests'),
              ' × ',
              derived(per, 'tokens'),
              ' = ',
              tokens(taken),
              '.',
            ),
    },
    { text: rich('That leaves ', given(scene.budget, 'tokens'), ' − ', tokens(taken), ' = ', tokens(room), ' of the budget for the waiting prompt.') },
    {
      text:
        prompt > room
          ? rich(
              'The prompt is ',
              given(scene.system, 'tokens'),
              ' + ',
              given(scene.user, 'tokens'),
              ' = ',
              tokens(prompt),
              '. A waiting request gets the smaller of what it still needs and what is left, and chunked prefill is on, so the prompt is cut to the ',
              tokens(room),
              ' that are left: this step takes ',
              tokens(key),
              ' of it.',
            )
          : rich(
              'The prompt is ',
              given(scene.system, 'tokens'),
              ' + ',
              given(scene.user, 'tokens'),
              ' = ',
              tokens(prompt),
              '. A waiting request gets the smaller of what it still needs and what is left, and that prompt is less than the ',
              tokens(room),
              ' that are left, so this step takes all of it: ',
              tokens(key),
              '.',
            ),
      result: tokens(key),
    },
  ]
}

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  return scene.variant === 'victim' ? victimSteps(scene, item.level) : scene.variant === 'restart' ? restartSteps(scene) : chunkSteps(scene)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The choice of `victim`                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Why a request is not the victim, by the rule that picks it: the sentence, and the misconception id. */
function lureFor(scene: VictimScene, role: Role, one: Running, level: Level): { why: Rich; miss: string } {
  const key = scene.running[keyOfVictim(scene)]
  switch (role) {
    case 'oldest':
      return { why: rich('This request joined first, so it is the last the scheduler would take. Under first come, first served the victim is the request that joined last, which is ', ...named(key.name), '.'), miss: `${FAMILY}.oldest-first` }
    case 'asking':
      return {
        why:
          scene.policy === 'fcfs'
            ? rich('This is the request that asked for the block. Asking does not make a request the victim: the scheduler takes the request that joined last, which is ', ...named(key.name), ', whoever needs the block.')
            : rich(
                'This is the request that asked for the block. Asking does not make a request the victim: the scheduler takes the request with the largest priority value',
                ...(scene.tie ? [' and, among those that share it, the later arrival'] : []),
                ', which is ',
                ...named(key.name),
                ', whoever needs the block.',
              ),
        miss: `${FAMILY}.the-one-asking`,
      }
    case 'largest':
      return { why: rich('This request holds the most blocks, but the scheduler does not weigh what a request holds. It takes the request that joined last, which is ', ...named(key.name), '.'), miss: `${FAMILY}.largest-holder` }
    case 'smallest':
      return { why: rich('This request holds the fewest blocks and would be the cheapest to compute again, but the scheduler does not weigh that. It takes the request that joined last, which is ', ...named(key.name), '.'), miss: `${FAMILY}.cheapest-to-redo` }
    case 'last':
      return {
        why: rich(
          'This is the newest request: it arrived last, at ',
          seconds(one.arrived),
          level === 3 ? '. ' : ', and it joined the running list last. ',
          'First come, first served would take it, but the policy here is priority, which looks at the priority value: ',
          ...named(key.name),
          ' has the largest, ',
          given(key.priority, ''),
          '.',
        ),
        miss: `${FAMILY}.last-to-join`,
      }
    case 'lowest':
      return {
        why: rich('This request has the smallest priority value, ', given(one.priority, ''), ', and the scheduler preempts the largest: its comment calls the victim the lowest-priority request, so a larger value is a lower priority.'),
        miss: `${FAMILY}.smallest-value`,
      }
    case 'earliest':
      return { why: rich('This request arrived first, at ', seconds(one.arrived), '. Arrival time only breaks a tie in the priority value, and ', ...named(key.name), ' has the largest value on its own.'), miss: `${FAMILY}.earliest-arrival` }
    case 'tied':
      return {
        why: rich('This request has the largest value too, ', given(one.priority, ''), ', but it arrived at ', seconds(one.arrived), ', before ', ...named(key.name), ', which arrived at ', seconds(key.arrived), '. A tie goes to the later arrival.'),
        miss: `${FAMILY}.tie-to-the-earlier`,
      }
    case 'key':
      // The request the rule picks has the role `key`; a scene whose roles do not hold is not a fair one, and the band refuses it.
      throw new RangeError(`${FAMILY}: the request ${one.name} is the key of a scene whose rule picks another`)
  }
}

function victimOptions(scene: VictimScene, level: Level, seed: Seed): ChoiceOption[] {
  const steps = victimSteps(scene, level)
  const keyIndex = keyOfVictim(scene)
  const keyWhy = scene.policy === 'fcfs' ? rich(...steps[1].text) : rich(...steps[1].text, ' ', ...steps[2].text)
  return shown(
    FAMILY,
    'victim',
    level,
    seed,
    scene.running.map((one, at): ChoiceOption => {
      const id = one.name.toLowerCase()
      if (at === keyIndex) return { id, text: named(one.name), why: keyWhy }
      const lure = lureFor(scene, scene.roles[at], one, level)
      return { id, text: named(one.name), why: lure.why, miss: lure.miss }
    }),
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const restartStem = (scene: RestartScene): Rich =>
  scene.budget === 0
    ? rich('In a synthetic engine at vLLM v0.33.0 a running request is preempted because the KV pool is dry. None of its blocks is cached when it returns. How many tokens must the engine compute for it before it can sample its next new token?')
    : rich('In a synthetic engine at vLLM v0.33.0 a running request is preempted because the KV pool is dry. None of its blocks is cached when it returns, and nothing else runs. How many tokens does the last step of its recompute carry?')

const chunkStem = (scene: ChunkScene): Rich =>
  rich(
    'In a synthetic engine at vLLM v0.33.0, with chunked prefill on, requests are decoding and a prompt waits to be taken in.',
    ...(scene.drafts > 0 ? [' Speculative decoding is on, and each decoding request carries drafts.'] : []),
    ' How many tokens of the prompt does this step take?',
  )

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene) }
  if (scene.variant === 'victim') {
    const key = scene.running[keyOfVictim(scene)]
    return finishItem(gen, {
      ...base,
      stem: victimStem(scene, level),
      givens: victimGivens(scene, level),
      worked: workedPart(level, victimSteps(scene, level), (attempt) => {
        const example = drawVictim(level, seed, `example-${attempt}`)
        return isFair(example) && example.running[keyOfVictim(example)].name !== key.name ? victimSteps(example, level) : null
      }),
      answer: { kind: 'choice', label: 'the request preempted first', options: victimOptions(scene, level, seed), correct: key.name.toLowerCase() },
    })
  }
  if (scene.variant === 'restart') {
    const key = scene.budget === 0 ? preemptModel.recompute(scene.prompt, scene.generated) : preemptModel.lastStep(preemptModel.recompute(scene.prompt, scene.generated), scene.budget)
    return finishItem(gen, {
      ...base,
      stem: restartStem(scene),
      givens: [
        { label: 'prompt', value: given(scene.prompt, 'tokens') },
        { label: 'output generated so far', value: given(scene.generated, 'tokens') },
        ...(scene.budget === 0 ? [] : [{ label: 'budget of a step', value: given(scene.budget, 'tokens') }]),
      ],
      worked: workedPart(level, restartSteps(scene), (attempt) => {
        const example = drawRestart(level, seed, `example-${attempt}`)
        const exampleKey = example.budget === 0 ? preemptModel.recompute(example.prompt, example.generated) : preemptModel.lastStep(preemptModel.recompute(example.prompt, example.generated), example.budget)
        return exampleKey !== key ? restartSteps(example) : null
      }),
      answer: { kind: 'numeric', label: scene.budget === 0 ? 'tokens to compute' : 'tokens in the last step', unit: 'tokens', truth: key, tolerance: EXACT },
    })
  }
  const per = 1 + scene.drafts
  const key = preemptModel.take(promptOf(scene), scene.budget, scene.decoding, per)
  return finishItem(gen, {
    ...base,
    stem: chunkStem(scene),
    givens: [
      { label: 'budget of a step', value: given(scene.budget, 'tokens') },
      { label: 'requests decoding', value: given(scene.decoding, 'requests') },
      ...(scene.drafts > 0 ? [{ label: 'drafts for each decoding request', value: given(scene.drafts, 'tokens') }] : []),
      { label: 'system prompt of the waiting request', value: given(scene.system, 'tokens') },
      { label: 'user message of the waiting request', value: given(scene.user, 'tokens') },
    ],
    worked: workedPart(level, chunkSteps(scene), (attempt) => {
      const example = drawChunk(level, seed, `example-${attempt}`)
      return isFair(example) && preemptModel.take(promptOf(example), example.budget, example.decoding, 1 + example.drafts) !== key ? chunkSteps(example) : null
    }),
    answer: { kind: 'numeric', label: 'tokens of the prompt', unit: 'tokens', truth: key, tolerance: EXACT },
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
    if (scene.variant === 'restart') {
      const total = preemptModel.recompute(scene.prompt, scene.generated)
      if (scene.budget === 0) {
        if (near(value, scene.prompt)) {
          return { id: `${FAMILY}.prompt-only`, message: rich('That is the prompt alone. The victim comes back for everything it has, and the output it generated is counted with the prompt.') }
        }
        if (near(value, scene.generated)) return { id: `${FAMILY}.output-only`, message: rich('That is the output alone. Its prompt has no computed tokens either, so it is computed again too.') }
        if (value === 0) return { id: `${FAMILY}.state-kept`, message: rich('Preemption keeps no copy of the state: the blocks are freed and the computed tokens go back to zero, so nothing is left to reuse.') }
        if (near(value, total + 1)) return { id: `${FAMILY}.one-more`, message: rich('The next new token is sampled from the last of these tokens, so it is not one more to compute.') }
        return null
      }
      if (near(value, scene.budget)) return { id: `${FAMILY}.a-whole-step`, message: rich('Every step but the last carries a whole budget. The last carries what is left of the recompute.') }
      if (near(value, divCeil(total, scene.budget))) return { id: `${FAMILY}.steps-for-tokens`, message: rich('That is how many steps the recompute takes. The question asks for the tokens in the last of them.') }
      if (near(value, preemptModel.lastStep(scene.prompt, scene.budget))) return { id: `${FAMILY}.prompt-only`, message: rich('That counts the prompt alone. The output the victim generated is computed again with it.') }
      return null
    }
    if (scene.variant === 'chunk') {
      const per = 1 + scene.drafts
      const prompt = promptOf(scene)
      const room = scene.budget - scene.decoding * per
      if (near(value, scene.budget)) return { id: `${FAMILY}.decodes-forgotten`, message: rich('That is the whole budget. The running requests are served first, out of the same budget, so the prompt gets only what they leave.') }
      if (scene.drafts > 0 && near(value, Math.min(prompt, scene.budget - scene.decoding))) {
        return { id: `${FAMILY}.drafts-forgotten`, message: rich('That gives each decoding request one token. With drafts on, a request in decode carries its drafts as well, so it takes more of the budget.') }
      }
      if (prompt > room && near(value, prompt)) {
        return { id: `${FAMILY}.whole-prompt`, message: rich('That is the whole prompt. It does not fit what the decodes leave of the budget, and chunked prefill cuts it to fit.') }
      }
      if (prompt <= room && near(value, room)) {
        return { id: `${FAMILY}.room-as-take`, message: rich('That is all that is left of the budget. The prompt needs less, and a waiting request gets the smaller of what it needs and what is left.') }
      }
      if (near(value, scene.system) || near(value, scene.user)) {
        return { id: `${FAMILY}.one-part`, message: rich('That is one part of the prompt. The system prompt and the user message are one prompt, and the step takes tokens from it as a whole.') }
      }
      return null
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const preemptVictim: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The victim, and the one budget',
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
  solution: (item) => solutionOf(item),
}
