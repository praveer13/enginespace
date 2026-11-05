/**
 * `close`, TR2's graded level, "toggled until the bubbles close" (W1-T14; GAMES.md §3.2, TR2 §5, ASSESSMENT §4.3): one night per seed, served
 * once with a configuration the learner chose from the cards before any run, graded against the house's.
 *
 * Everything a seed draws is here: the workload (a burst of tickets), the cost card (the small model's napkin or the 70B fit), the host card
 * (the share the CPU's phases are scaled by, and the three costs of launching), the attention backend's graph support, the token budget, and
 * the room the cache has for routines. The house is found by the model, not designed: it is the cheapest configuration, in graph memory,
 * whose night is within 1% of the best of a small menu (`kneeHouse`), and the room is exactly what that configuration takes, so a
 * configuration that takes more does not start. The cards print every number the learner needs to work the house out, and no number of a run.
 *
 * The pass bar is ASSESSMENT §4.3's: zero dependency violations, and useful tokens per GPU-ms at least 97% of the house's.
 */
import { below, divFloor, divRound, pick, rngFor } from '@es/sim/core'
import type { Seed, Us } from '@es/sim/core'
import { hostPreset } from '@es/sim/host'
import { stepLoad } from '@es/sim/physics'
import { GRAPH_MEMORY_MODEL, gpuCost, gpuLayers, vllmCaptureSizes } from '@es/sim/steploop'
import type { BackendSupport } from '@es/sim/steploop'
import { decodeUs } from './sizes'
import { CARDS, graphBytes, hostOf, nightOf, resolvedMode } from './night'
import type { Night } from './night'
import type { CardId, CloseCards, Draft, HostDraw, Levers, LeverName, Served, StageWorld, Verdict } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The constants                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** ASSESSMENT §4.3: useful tokens per GPU-ms at least this much of the house's, out of 1,000 [estimated]. */
export const BAR_PERMILLE = 970

/** The capture sizes the panel offers: every size a graph can be drilled at, up to the token budget [estimated]. The rail's own sizes are on it. */
export const CLOSE_LADDER: readonly number[] = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 192, 256, 320, 384, 512]

/** The bubbles of the band (GAMES.md §3.2): the naive night loses at least this share of its clock to dark stretches, the house at most this [estimated]. */
export const NAIVE_DARK_PERMILLE = 200
export const HOUSE_DARK_PERMILLE = 30

/** The house is the cheapest configuration within this share of the best clock [estimated]. */
export const KNEE_PERMILLE = 10

/** The naive night is at least this much longer than the house's [estimated]: a visible margin past the bar. */
export const NAIVE_MARGIN_PERMILLE = 50

/** The share of seeds on the 70B card [estimated]: the other nine in ten are the small model's, where the host's work is a large share of a fire. */
const SHARE_70B_PERMILLE = 100

/** What a seed may draw [estimated]. */
export const DRAWS = {
  rails: [6, 8, 12, 16],
  waves: [2, 3],
  budgets: [64, 96, 128, 160, 192, 256, 320, 384],
  outputs: [
    [4, 12],
    [12, 28],
    [40, 80],
  ],
  scalesSmall: [250, 400, 600, 900, 1300],
  scales70b: [1000, 2000, 3000],
  /** The launch of one kernel: the small model's host launches fast on one in eight seeds, so that async scheduling alone hides it. */
  launchSmall: [3, 8, 8, 10, 10, 12, 12, 12],
  launch70b: [12, 16, 20],
  replays: [30, 60, 100],
  kernels: [12, 14],
  supports: ['ALWAYS', 'UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE'],
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The draw                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface CloseDraw {
  readonly card: CardId
  readonly slots: number
  readonly requests: number
  readonly budget: number
  readonly outputs: readonly [number, number]
  readonly host: HostDraw
  readonly support: BackendSupport
}

/** What a seed draws of the night, before the house is known. Every draw has a stream of its own, so adding one never moves another. */
export function drawClose(seed: Seed): CloseDraw {
  const rng = rngFor(seed, 'loop/full/close')
  const card: CardId = below(rng, 1000) < SHARE_70B_PERMILLE ? '70b' : 'small'
  const slots = pick(rng, DRAWS.rails)
  const requests = slots * pick(rng, DRAWS.waves)
  const budget = pick(rng, DRAWS.budgets)
  const outputs = pick(rng, DRAWS.outputs)
  const scalePermille = card === '70b' ? pick(rng, DRAWS.scales70b) : pick(rng, DRAWS.scalesSmall)
  const launchUs = card === '70b' ? pick(rng, DRAWS.launch70b) : pick(rng, DRAWS.launchSmall)
  const replayUs = pick(rng, DRAWS.replays)
  const kernels = pick(rng, DRAWS.kernels)
  const support = pick(rng, DRAWS.supports)
  return { card, slots, requests, budget, outputs, host: { scalePermille, launchUs, kernels, replayUs }, support }
}

/** The smallest rung of the ladder that is at least `n`. */
const rungAtLeast = (n: number): number => CLOSE_LADDER.find((rung) => rung >= n) ?? CLOSE_LADDER[CLOSE_LADDER.length - 1]

/** The sizes the panel offers on a seed: the ladder up to the token budget, which no graph may exceed. */
export const ladderFor = (budget: number): number[] => CLOSE_LADDER.filter((rung) => rung <= budget)

/** The configuration the stage opens on, and the naive one: nothing switched on, the legacy runner, and the ids written by hand. */
export function naiveLevers(slots: number, budget: number): Levers {
  return { async: false, inputIds: 'host', graphMode: 'NONE', captureSizes: vllmCaptureSizes({ maxNumSeqs: slots, maxBatchedTokens: budget }), runner: 'v1', maskOverlap: true }
}

export const CLOSE_COPY = {
  title: 'Close the bubbles',
  prompt:
    "Tonight's tickets are all due at once. Choose the configuration from the cards before a single fire: whether the next call is written during the fire and where its ids come from, the runner, the drilled routines and the molds on the rack. One night is served, and it is judged against the house's.",
  question: 'With nothing switched on (the legacy runner, the next call written after the fire, no routine drilled), what share of the night does the line sit dark?',
} as const

/** The stage before its house is known: everything a seed draws, the naive configuration, and a placeholder for the house. */
export function closeDraft(seed: Seed): Draft {
  const d = drawClose(seed)
  const naive = naiveLevers(d.slots, d.budget)
  return {
    id: 'close',
    title: CLOSE_COPY.title,
    prompt: CLOSE_COPY.prompt,
    card: d.card,
    levers: ['async', 'inputIds', 'runner', 'graphMode', 'capture'],
    start: naive,
    naive,
    house: naive,
    naiveFails: true,
    metric: 'clock',
    bar: 'throughput',
    slackPermille: 0,
    nights: 1,
    sealed: true,
    prediction: { kind: 'number', question: CLOSE_COPY.question, unit: '%', tolerancePermille: 150 },
    slots: d.slots,
    budget: d.budget,
    workloadSeed: seed,
    requests: d.requests,
    outputs: d.outputs,
    prompts: [d.budget >> 1, d.budget * 2],
    structuredPermille: 0,
    graphBudget: null,
    support: d.support,
    maskRowUs: hostPreset('mrv2').card.maskPerSeqUs,
    sizes: null,
    host: d.host,
    ladder: ladderFor(d.budget),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The house                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const probeOf = (draft: Draft): StageWorld => ({ ...draft, answer: 0, houseMetric: 0, houseTokens: 0 })

/** The configurations the house is chosen from: async scheduling on, the ids on the device, MRV2, and every mode with a mold for the rail and one for the budget. */
export function houseMenu(draft: Pick<Draft, 'slots' | 'budget'>): Levers[] {
  const rail = rungAtLeast(draft.slots)
  const budget = rungAtLeast(draft.budget)
  const lists = budget > rail ? [[rail], [rail, budget]] : [[rail]]
  const base = { async: true, inputIds: 'device', runner: 'mrv2', maskOverlap: true } as const
  const menu: Levers[] = [{ ...base, graphMode: 'NONE', captureSizes: [] }]
  for (const graphMode of ['FULL_DECODE_ONLY', 'PIECEWISE', 'FULL', 'FULL_AND_PIECEWISE'] as const) {
    for (const captureSizes of lists) menu.push({ ...base, graphMode, captureSizes })
  }
  return menu
}

/**
 * The house of a seed: of the menu's configurations that start and break no dependency, those whose night is within `KNEE_PERMILLE` of the
 * shortest, and of those the one that takes the least graph memory (then the fewest molds, then the shortest night). Its mode is the one that runs,
 * so on a backend that cannot replay mixed batches a request for FULL is written as the FULL_AND_PIECEWISE that it becomes.
 */
export function kneeHouse(draft: Draft): Levers {
  const probe = probeOf(draft)
  const scored: { levers: Levers; clock: number; bytes: number }[] = []
  for (const levers of houseMenu(draft)) {
    const night = nightOf(probe, levers)
    if (night === null || night.violations > 0) continue
    const mode = resolvedMode(draft.support, levers).mode ?? 'NONE'
    scored.push({ levers: { ...levers, graphMode: mode }, clock: night.clockUs, bytes: graphBytes(probe, levers, mode) })
  }
  const best = Math.min(...scored.map((entry) => entry.clock))
  const near = scored.filter((entry) => entry.clock * 1000 <= best * (1000 + KNEE_PERMILLE))
  near.sort((a, b) => a.bytes - b.bytes || a.levers.captureSizes.length - b.levers.captureSizes.length || a.clock - b.clock)
  return near[0].levers
}

/** The stage with its house, and the room the cache has for routines: exactly what the house's take. */
export function withHouse(draft: Draft): Draft {
  const house = kneeHouse(draft)
  const mode = resolvedMode(draft.support, house).mode ?? 'NONE'
  return { ...draft, house, graphBudget: graphBytes(probeOf(draft), house, mode) }
}

/** The dark share of a night's clock, out of 1,000. */
export const darkPermille = (night: Pick<Night, 'bubbleUs' | 'clockUs'>): number => (night.clockUs === 0 ? 0 : divRound(night.bubbleUs * 1000, night.clockUs))

/* ------------------------------------------------------------------------------------------------------------------ */
/* The bar and the verdict                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Useful tokens per GPU-ms against the house's, out of 1,000, rounded down (A§5.1: integers): `tokens ÷ clock` over `houseTokens ÷ houseClock`.
 * 0 for a night that broke the dependency or was never served.
 */
export function throughputPermille(world: Pick<StageWorld, 'houseMetric' | 'houseTokens'>, tokens: number, clockUs: Us, violations: number): number {
  if (violations > 0 || clockUs <= 0 || world.houseTokens <= 0) return 0
  return divFloor(tokens * world.houseMetric * 1000, clockUs * world.houseTokens)
}

/** Whether a night meets ASSESSMENT §4.3's bar, in integers and with no rounding: no violation, and tokens ÷ clock at least 97% of the house's. */
export function meetsThroughput(world: Pick<StageWorld, 'houseMetric' | 'houseTokens'>, tokens: number, clockUs: Us, violations: number): boolean {
  if (violations > 0 || clockUs <= 0) return false
  return tokens * world.houseMetric * 1000 >= BAR_PERMILLE * world.houseTokens * clockUs
}

/** What a served night came to against the bar. `reason` is why the engine would not start, for a refused one. */
export function verdictOf(world: StageWorld, served: Served, reason: string | null): Verdict {
  if (served.refused === true) return { kind: 'refused', throughputPermille: null, barPermille: BAR_PERMILLE, violations: 0, reason }
  const violations = served.violations ?? 0
  if (violations > 0) return { kind: 'violation', throughputPermille: null, barPermille: BAR_PERMILLE, violations, reason: null }
  const permille = throughputPermille(world, served.tokens ?? 0, served.metric, 0)
  return { kind: served.ok ? 'pass' : 'slow', throughputPermille: permille, barPermille: BAR_PERMILLE, violations: 0, reason: null }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The counterfactual                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The levers whose worth the debrief weighs, in the order it breaks ties: async scheduling with the ids it needs, the graphs, the runner. */
export const WORTH: readonly LeverName[] = ['async', 'graphMode', 'capture', 'runner']

/** The score a configuration earns on the stage's night: its throughput against the house's, 0 where it breaks the dependency or does not start. */
function scoreOf(world: StageWorld, levers: Levers): number {
  const night = nightOf(world, levers)
  return night === null ? 0 : throughputPermille(world, night.usefulTokens, night.clockUs, night.violations)
}

/**
 * What each lever is worth on this night, from the learner's configuration (GAMES.md §2.1: swap one lever to the reference's value, re-run,
 * and name the one worth the most): the throughput gained, out of 1,000, by setting only that lever to the house's. Async scheduling goes
 * with the ids it needs, and the graph mode and the sizes are weighed apart, so the debrief can say which of the two to change.
 */
export function leverWorth(world: StageWorld, mine: Levers): { lever: LeverName; gain: number }[] {
  const house = world.house
  const swaps: Record<string, Levers> = {
    async: { ...mine, async: house.async, inputIds: house.inputIds },
    graphMode: { ...mine, graphMode: house.graphMode, captureSizes: house.captureSizes },
    capture: { ...mine, captureSizes: house.captureSizes },
    runner: { ...mine, runner: house.runner },
  }
  const here = scoreOf(world, mine)
  return WORTH.map((lever) => ({ lever, gain: scoreOf(world, swaps[lever]) - here }))
}

/** Which levers differ from the house's. */
export function differing(world: StageWorld, mine: Levers): LeverName[] {
  const house = world.house
  const out: LeverName[] = []
  if (mine.async !== house.async || mine.inputIds !== house.inputIds) out.push('async')
  if (mine.graphMode !== house.graphMode) out.push('graphMode')
  if (mine.captureSizes.join() !== house.captureSizes.join()) out.push('capture')
  if (mine.runner !== house.runner) out.push('runner')
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The cards                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The cards of a closed-book stage (GAMES.md §3.2): all of it the model's arithmetic on the seed's draws, none of it a reading of a run. */
export function closeCards(world: StageWorld): CloseCards {
  const card = CARDS[world.card]
  const host = hostOf(world, 'mrv2')
  const legacy = hostOf(world, 'v1')
  const layers = gpuLayers(card)
  // A decode fire is priced at the context a ticket has, half way through its courses: its prompt's middle and half the courses' middle.
  const context = Math.max(1, Math.round((world.prompts[0] + world.prompts[1]) / 2 + (world.outputs[0] + world.outputs[1]) / 4))
  const rows = [...new Set([1, Math.ceil(world.slots / 2), world.slots])]
  const fullLoad = stepLoad([{ kind: 'prefill', chunk: world.budget, done: 0 }])
  return {
    requests: world.requests,
    prompts: world.prompts,
    outputs: world.outputs,
    slots: world.slots,
    budget: world.budget,
    layers,
    context,
    decodeUs: rows.map((count) => ({ rows: count, us: decodeUs(card, count, context) })),
    fullBudgetUs: gpuCost(card, { prefillSeqs: 1, ...fullLoad }).gpuUs,
    launchUs: host.launchPerKernelUs,
    kernels: host.kernelsPerLayer,
    replayUs: host.graphReplayUs,
    eagerLaunchUs: host.launchPerKernelUs * host.kernelsPerLayer * layers,
    mrv2: linesOf(host),
    v1: linesOf(legacy),
    support: world.support,
    roomBytes: world.graphBudget ?? 0,
    graphBaseBytes: GRAPH_MEMORY_MODEL.baseBytes,
    graphTokenBytes: GRAPH_MEMORY_MODEL.perTokenBytes,
  }
}

const linesOf = (host: ReturnType<typeof hostOf>) => ({
  scheduleBaseUs: host.scheduleBaseUs,
  schedulePerSeqUs: host.schedulePerSeqUs,
  prepPerTokenUs: host.prepPerTokenUs,
  syncUs: host.syncUs,
  samplePerSeqUs: host.samplePerSeqUs,
})
