/*
 * Progress, derived (ASSESSMENT §3.3, ARCHITECTURE §7 and §4.5): what a learner holds, read from their events and from content when a
 * page draws, and never stored. The map and the module pages show it (W1-T06).
 *
 * `deriveProgress` takes the ledger's events and what content says (the compiled map, the game registry's KCs, the home module of a
 * game), and nothing else. It reads no clock, no store, no setting and no working record, and it writes nothing, so the same events
 * and the same content always give the same answer, and deleting the events gives back an empty course. tests/progress/ holds that
 * line: one test draws the answer from a ledger and from a copy of it, one reads this folder's imports, and one scans it for a write.
 *
 * Knowledge components (ASSESSMENT §3.3), each from the events that the ref-to-KC map (kcmap.ts) sends to it:
 *   practised  any graded event, at any weight: even a failed attempt, and a result that earns nothing
 *   earned     at least one event that passed at full weight (provenance `unseen`, `proved` or `gpu-verified`)
 *   kept       earned, and then a correct review or item on a fresh seed, unassisted, 30 days or more after it was first earned
 * A state includes the ones before it. A prediction earns nothing (ASSESSMENT §4.7), and a KC no ref reaches is never practised.
 *
 * A module's loop (ARCHITECTURE §3.1: Predict, Play, Build, Prove, Keep) counts the events of the kinds that step writes, among the
 * events that belong to the module: by their ref (counts.ts), by the KCs they are evidence for, and by the labs that the module lists.
 * ASSESSMENT §9's "browser-complete" and "complete" are not derived here: they need an exit ticket and a Prove-it, and no event
 * says either yet.
 */
import { weightOf } from '@es/ledger/provenance'
import { GRADED_KINDS } from '@es/ledger/types'
import type { LedgerEvent } from '@es/ledger/types'
import type { CourseMap } from '@es/schema/compiled'
import { moduleOfKc, moduleOfRef, parseRef } from '@es/schema/refs'
import { kcsOfRef } from './kcmap'
import type { KcSources } from './kcmap'

/** A KC is kept when the learner got it right again on a fresh seed this many days after earning it (ASSESSMENT §3.3) [estimated]. */
export const KEPT_AFTER_DAYS = 30
const DAY_MS = 86_400_000

export const KC_STATES = ['none', 'practised', 'earned', 'kept'] as const
export type KcState = (typeof KC_STATES)[number]

export interface KcProgress {
  readonly id: string
  readonly state: KcState
  /** Graded events that are evidence for it. */
  readonly events: number
  /** When it was first earned: the `at` of the earliest event that passed at full weight. */
  readonly earnedAt?: string
}

/** How many attempts, and how they were worth: a pass at full weight is credited, and a pass at part of one (practice, assisted) is partial. */
export interface Tally {
  readonly tried: number
  readonly credited: number
  readonly partial: number
}

export interface LoopProgress {
  /** Predict: predictions made. They earn no credit (ASSESSMENT §4.7). */
  readonly predicted: number
  /** Play: game runs, items and trace marks. */
  readonly play: Tally
  /** Build: lab checks and receipts. */
  readonly build: Tally
  /** Prove: whether any result passed with the agent closed (provenance `proved`). */
  readonly proved: boolean
  /** Keep: Today's reviews. */
  readonly keep: Tally
}

export interface KcCounts {
  readonly total: number
  /** KCs in the state `practised` or past it. */
  readonly practised: number
  /** KCs in the state `earned` or `kept`. */
  readonly earned: number
  readonly kept: number
}

export interface ModuleProgress {
  readonly module: string
  /** The module's KCs, in the order of the graph. */
  readonly kcs: readonly KcProgress[]
  readonly counts: KcCounts
  readonly loop: LoopProgress
  /** Graded events that belong to the module. */
  readonly events: number
}

export interface Progress {
  readonly modules: ReadonlyMap<string, ModuleProgress>
  /** Every KC of the graph. */
  readonly kcs: ReadonlyMap<string, KcProgress>
  /** Counted over every KC of the graph. */
  readonly counts: KcCounts
  /** The graded events read: a challenge and an acknowledgement are not graded and are left out. */
  readonly events: number
}

type GradedEvent = Exclude<LedgerEvent, { kind: 'challenge' | 'ack' }>
const GRADED = new Set<string>(GRADED_KINDS)
const isGraded = (event: LedgerEvent): event is GradedEvent => GRADED.has(event.kind)

interface MutableTally {
  tried: number
  credited: number
  partial: number
}
const emptyTally = (): MutableTally => ({ tried: 0, credited: 0, partial: 0 })

function tallyOf(tally: MutableTally, event: GradedEvent): void {
  tally.tried += 1
  if (!event.ok) return
  const weight = weightOf(event.provenance)
  if (weight === 1) tally.credited += 1
  else if (weight > 0) tally.partial += 1
}

/** Whether an event earns the KCs it is evidence for: it passed at full weight, and it is not a prediction, which moves no credit (ASSESSMENT §4.7). */
const earns = (event: GradedEvent): boolean => event.kind !== 'predict' && event.ok && weightOf(event.provenance) === 1

interface MutableLoop {
  predicted: number
  play: MutableTally
  build: MutableTally
  proved: boolean
  keep: MutableTally
  events: number
}
const emptyLoop = (): MutableLoop => ({ predicted: 0, play: emptyTally(), build: emptyTally(), proved: false, keep: emptyTally(), events: 0 })

function loopOf(loop: MutableLoop, event: GradedEvent): void {
  loop.events += 1
  switch (event.kind) {
    case 'predict':
      loop.predicted += 1
      break
    case 'play':
    case 'item':
    case 'trace-mark':
      tallyOf(loop.play, event)
      break
    case 'lab-check':
    case 'receipt':
      tallyOf(loop.build, event)
      break
    case 'review':
      tallyOf(loop.keep, event)
      break
    case 'prove':
      break
  }
  if (event.ok && event.provenance === 'proved') loop.proved = true
}

interface KcEvidence {
  events: number
  /** The earliest time that an event passed at full weight, in ms, and that event's `at`. */
  earned?: { ms: number; at: string }
  /** The times of the correct, unassisted reviews and items on fresh seeds, in ms: what keeps a KC. */
  fresh: number[]
}

/** The state that the evidence of one KC amounts to. */
function stateOf(evidence: KcEvidence | undefined): KcState {
  if (evidence === undefined) return 'none'
  if (evidence.earned === undefined) return 'practised'
  const after = evidence.earned.ms + KEPT_AFTER_DAYS * DAY_MS
  return evidence.fresh.some((ms) => ms >= after) ? 'kept' : 'earned'
}

function countsOf(states: readonly KcState[]): KcCounts {
  return {
    total: states.length,
    practised: states.filter((state) => state !== 'none').length,
    earned: states.filter((state) => state === 'earned' || state === 'kept').length,
    kept: states.filter((state) => state === 'kept').length,
  }
}

/**
 * What the learner's events amount to against the course's content. `homeModule` is a game's home module, which the game
 * registry knows (counts.ts). The events may come in any order, and an event with a time that is not one is left out of what keeps a KC.
 */
export function deriveProgress(
  events: readonly LedgerEvent[],
  map: Pick<CourseMap, 'modules' | 'kcs'>,
  sources: KcSources,
  homeModule: (game: string) => string | undefined,
): Progress {
  const graph = new Set(map.kcs.map((kc) => kc.id))
  const ownerOfLab = new Map(map.modules.flatMap((module) => module.labs.map((lab): [string, string] => [lab, module.id])))

  const evidence = new Map<string, KcEvidence>()
  const loops = new Map<string, MutableLoop>(map.modules.map((module) => [module.id, emptyLoop()]))
  let read = 0

  for (const event of events) {
    if (!isGraded(event)) continue
    read += 1
    const kcs = kcsOfRef(event.ref, sources).filter((id) => graph.has(id))
    const passed = earns(event)
    // The ledger's codec holds `at` to an ISO instant. An event that somehow has no time can be earned but never keeps anything.
    const parsed = Date.parse(event.at)
    const ms = Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
    const fresh = (event.kind === 'review' || event.kind === 'item') && event.ok && (event.provenance === 'unseen' || event.provenance === 'proved')

    for (const id of kcs) {
      const known = evidence.get(id) ?? { events: 0, fresh: [] }
      known.events += 1
      if (passed && (known.earned === undefined || ms < known.earned.ms)) known.earned = { ms, at: event.at }
      if (fresh && Number.isFinite(ms)) known.fresh.push(ms)
      evidence.set(id, known)
    }

    // The modules the event belongs to: by its ref, by the lab that a module lists, and by the KCs it is evidence for.
    const owners = new Set<string>()
    const byRef = moduleOfRef(event.ref, homeModule)
    if (byRef !== null) owners.add(byRef)
    else {
      const ref = parseRef(event.ref)
      const lab = ref?.kind === 'lab' || ref?.kind === 'prove' ? ownerOfLab.get(ref.lab) : undefined
      if (lab !== undefined) owners.add(lab)
    }
    for (const id of kcs) owners.add(moduleOfKc(id))
    for (const owner of owners) {
      const loop = loops.get(owner)
      if (loop !== undefined) loopOf(loop, event)
    }
  }

  const kcs = new Map<string, KcProgress>()
  for (const kc of map.kcs) {
    const known = evidence.get(kc.id)
    kcs.set(kc.id, { id: kc.id, state: stateOf(known), events: known?.events ?? 0, ...(known?.earned === undefined ? {} : { earnedAt: known.earned.at }) })
  }

  const modules = new Map<string, ModuleProgress>()
  for (const module of map.modules) {
    const own = module.kcs.flatMap((id) => kcs.get(id) ?? [])
    const loop = loops.get(module.id) ?? emptyLoop()
    modules.set(module.id, {
      module: module.id,
      kcs: own,
      counts: countsOf(own.map((kc) => kc.state)),
      loop: { predicted: loop.predicted, play: loop.play, build: loop.build, proved: loop.proved, keep: loop.keep },
      events: loop.events,
    })
  }

  return { modules, kcs, counts: countsOf([...kcs.values()].map((kc) => kc.state)), events: read }
}

/**
 * The module the course would go on with: the first one in the course's order that can be opened and whose KCs are not all earned.
 * A planned module cannot be opened, and one with no KCs yet has nothing to finish. Null when there is none. This advises and never
 * locks (ARCHITECTURE §1, I9): every module opens whatever this says.
 */
export function nextModule(modules: readonly { id: string; status: string }[], progress: Progress): string | null {
  for (const module of modules) {
    if (module.status === 'planned') continue
    const counts = progress.modules.get(module.id)?.counts
    const finished = counts !== undefined && counts.total > 0 && counts.earned === counts.total
    if (!finished) return module.id
  }
  return null
}
