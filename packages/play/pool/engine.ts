/**
 * The Reach-In's engine (`pool`, GAMES.md §8): a night in the reach-in, played one step at a time by the learner's policy.
 *
 * The sim's manager (manager.ts, over `packages/sim/kv`) holds the pages and answers for every rule; this file is the order a step
 * does things in, which is the game's own:
 *   1. arrive   tickets whose time has come join the waiting line, a pulled ticket first;
 *   2. decode   every ticket on the line decodes a chunk, one after another, and a ticket that has decoded all it asked for is served at
 *               once, so that its pans are in the rotation before the next ticket decodes. The allocation of a ticket that grows takes
 *               the next pans of the rotation, free ones first and then the oldest cached (vllm.kv-pool.allocate-from-front). When even
 *               that cannot supply a ticket, the learner must pull one (preempt, by recompute: vllm.scheduler.preemption-recompute);
 *   3. settle   a kit that no ticket on the line or in the waiting line uses goes back, and its pans are free again;
 *   4. admit    while the line has a slot, the learner hangs a waiting ticket or none. A ticket hangs all or nothing, and when it needs
 *               more pans than are free, the learner says which cached pans to dump (evict). No ticket hangs in a step that pulled one;
 *   5. prefetch the learner may bring in a kit that a waiting ticket needs, which lands in a few steps and takes its pans from the same pool;
 *   6. tick     a step in which a slot was free and a waiting ticket had no kit is a stall step, and the clock moves on.
 * Time is the count of steps; a step decodes one chunk of tokens for every ticket on the line.
 *
 * A step stops where a decision is open, so a night is a few dozen asks and every step between them applies by itself (GAMES.md §2.1:
 * "a turn exists only where a decision changes something"). `advance` runs until an ask is open or the night is over, and an action
 * answers the ask. Both work on a `PoolWork`, a mutable copy of a state, so that a whole policy run (bands, the house, the debrief's
 * replays) costs no more than the sim's own calls; `freeze` turns a work into the plain state the session hands out, and `thaw` back.
 */
import { divFloor } from '@es/sim/core'
import { kvChain, kvExtraKey } from '@es/sim/kv'
import type { KvOp } from '@es/sim/kv'
import { PoolManager } from './manager'
import type { AdmitPlan, Chains } from './manager'
import type { PoolAction, PoolAsk, PoolCounts, PoolKitState, PoolLevel, PoolPending, PoolPhase, PoolReqState, PoolState } from './types'

/** No sane night asks this often between two decisions: it means a step that cannot end. */
const GUARD = 100_000

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** A night under construction. A work is spent when it has been frozen: the state owns its arrays. */
export interface PoolWork {
  readonly level: PoolLevel
  mgr: PoolManager
  step: number
  phase: PoolPhase
  reqs: Mutable<PoolReqState>[]
  waiting: number[]
  running: number[]
  fed: number[]
  kits: Mutable<PoolKitState>[]
  pending: PoolPending | null
  counts: Mutable<PoolCounts>
  turns: number
  ask: PoolAsk | null
  predicted: number | null
  dumped: number[]
  pulledNow: boolean
  done: boolean
  history: PoolAction[]
  /** When set, every hanging is noted here, for the bands (bands.ts). */
  trace: AdmitNote[] | null
  /** The plan of each waiting ticket, worked out at the sim's tick it holds for (`planOf`). Never carried to another work. */
  plans: (PlanMemo | undefined)[]
}

/** A plan, with the tick of the sim and the progress of the ticket it was worked out for. */
interface PlanMemo {
  readonly clock: number
  readonly progress: number
  readonly plan: AdmitPlan
}

/**
 * A hanging, noted for the bands: which ticket, how much of it the cache served, and how much a full-attention station alone would have
 * served. When the second is longer than the first, another station (a sliding window, a state) is what bound the hit.
 */
export interface AdmitNote {
  readonly req: number
  readonly turn: number
  readonly tokens: number
  readonly hit: number
  readonly full: number
  readonly step: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading a work                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The prompt a ticket hangs with: its script's, and after a pull what it had decoded before it was pulled (recompute only). */
export function promptOf(level: PoolLevel, req: number, progress: number): readonly number[] {
  const def = level.reqs[req]
  return progress === 0 ? def.prompt : def.prompt.concat(def.out.slice(0, progress))
}

const promptNow = (w: PoolWork, req: number): readonly number[] => promptOf(w.level, req, w.reqs[req].progress)

/**
 * The hash chains of every ticket's whole sequence, prompt and reply, worked out once for a level: any prompt a ticket hangs with, its
 * own or one that a pull lengthened, is a prefix of its sequence, so it takes the first of each chain and the sim hashes nothing again.
 */
const chainTables = new WeakMap<PoolLevel, Chains[]>()

export function chainsOfReq(level: PoolLevel, req: number): Chains {
  let all = chainTables.get(level)
  if (all === undefined) {
    all = new Array<Chains>(level.reqs.length)
    chainTables.set(level, all)
  }
  let known: Chains | undefined = all[req]
  if (known === undefined) {
    const def = level.reqs[req]
    const sequence = def.prompt.concat(def.out)
    const chains = new Map<number, readonly number[]>()
    for (const group of level.spec.groups) {
      if (!chains.has(group.blockTokens)) chains.set(group.blockTokens, kvChain(sequence, divFloor(sequence.length, group.blockTokens), group.blockTokens, kvExtraKey(def.adapter)))
    }
    known = chains
    all[req] = known
  }
  return known
}

/**
 * What hanging a ticket now would do: the sim's plan, on the ticket's prompt as it stands. A plan holds until the sim's next operation,
 * and the line asks for it again and again between two (the ask, the policy's choice, the hanging), so it is kept until then.
 */
export function planOf(w: PoolWork, req: number): AdmitPlan {
  const clock = w.mgr.clock()
  const progress = w.reqs[req].progress
  const known = w.plans[req]
  if (known !== undefined && known.clock === clock && known.progress === progress) return known.plan
  const plan = w.mgr.plan(promptNow(w, req), w.level.reqs[req].adapter, chainsOfReq(w.level, req))
  w.plans[req] = { clock, progress, plan }
  return plan
}

export const kitResident = (w: PoolWork, adapter: number): boolean => w.kits.some((kit) => kit.adapter === adapter)
export const kitReady = (w: PoolWork, adapter: number): boolean => w.kits.some((kit) => kit.adapter === adapter && kit.readyAt <= w.step)

/** Steps a kit takes to land: one, and one more for each `loadRate` pans. */
export const loadSteps = (level: PoolLevel, pages: number): number => 1 + Math.floor(pages / level.loadRate)

/** Whether a kit can be brought in now: a slot is free (the engines' policy), or the pool can supply its pans. */
function canLoad(w: PoolWork, adapter: number): boolean {
  const slots = w.level.spec.adapterSlots
  if (slots !== undefined) return w.kits.length < slots
  return w.level.kits[adapter].pages <= w.mgr.supply()
}

/** Kits that waiting tickets need and that are not in the pool, in the order the waiting line wants them. */
export function wantedKits(w: PoolWork): number[] {
  const wanted: number[] = []
  for (const id of w.waiting) {
    const adapter = w.level.reqs[id].adapter
    if (adapter !== null && !kitResident(w, adapter) && !wanted.includes(adapter)) wanted.push(adapter)
  }
  return wanted
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Starting a night                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The night before anything has happened: an empty reach-in, every first ticket on its way. Not yet advanced. A `quiet` night publishes
 * no events (manager.ts), which is all a run played in bulk needs to skip.
 */
export function freshWork(level: PoolLevel, quiet = false): PoolWork {
  const reqs: Mutable<PoolReqState>[] = level.reqs.map((req) => ({
    status: 'future',
    at: req.turn === 0 ? req.delay : -1,
    progress: 0,
    hit: 0,
    recomputed: 0,
    admits: 0,
    pulls: 0,
    doneAt: null,
  }))
  const mgr = new PoolManager(level.spec)
  mgr.quiet = quiet
  return {
    level,
    mgr,
    step: 0,
    phase: 'arrive',
    reqs,
    waiting: [],
    running: [],
    fed: [],
    kits: [],
    pending: null,
    counts: { recomputedTokens: 0, hitTokens: 0, completed: 0, preemptions: 0, adapterStallSteps: 0, evictions: 0 },
    turns: 0,
    ask: null,
    predicted: null,
    dumped: [],
    pulledNow: false,
    done: false,
    history: [],
    trace: null,
    plans: [],
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Freezing and thawing                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The manager of every state the session has handed out. A state is plain data, so it carries no manager; the session keeps the one that
 * made it here, never to be changed (a `thaw` clones it). A state that was not made by this session, one read back from JSON, say, is
 * not here, and `rebuild` replays its log to get the manager it describes. So the table is only a cache, and `reduce` is a function of
 * the state and the action alone.
 */
const managers = new WeakMap<PoolState, PoolManager>()

/** The plain state of a work. The work must not be used afterwards, because the state now owns its arrays. */
export function freeze(w: PoolWork): PoolState {
  const state: PoolState = {
    level: w.level,
    history: w.history,
    step: w.step,
    phase: w.phase,
    reqs: w.reqs,
    waiting: w.waiting,
    running: w.running,
    fed: w.fed,
    kits: w.kits,
    pending: w.pending,
    counts: { ...w.counts, evictions: w.mgr.removed },
    turns: w.turns,
    ask: w.ask,
    predicted: w.predicted,
    dumped: w.dumped,
    pulledNow: w.pulledNow,
    done: w.done,
    kv: w.mgr.state(),
  }
  managers.set(state, w.mgr)
  return state
}

/** The night a state describes, played again from its log: the manager that the state's pages came from. */
export function rebuild(state: PoolState): PoolManager {
  const w = freshWork(state.level)
  advance(w)
  for (const action of state.history) {
    applyAction(w, action)
    advance(w)
  }
  return w.mgr
}

/** The manager of a state, for reading: the session's own, which nothing may change. A state the session did not make is replayed. */
export function managerOf(state: PoolState): PoolManager {
  let known = managers.get(state)
  if (known === undefined) {
    known = rebuild(state)
    managers.set(state, known)
  }
  return known
}

/** A work over a state's fields, copied, on the given manager. */
function workOf(state: PoolState, mgr: PoolManager): PoolWork {
  return {
    level: state.level,
    mgr,
    step: state.step,
    phase: state.phase,
    reqs: state.reqs.map((req) => ({ ...req })),
    waiting: state.waiting.slice(),
    running: state.running.slice(),
    fed: state.fed.slice(),
    kits: state.kits.map((kit) => ({ ...kit })),
    pending: state.pending,
    counts: { ...state.counts },
    turns: state.turns,
    ask: state.ask,
    predicted: state.predicted,
    dumped: [],
    pulledNow: state.pulledNow,
    done: state.done,
    history: state.history.slice(),
    trace: null,
    plans: [],
  }
}

/** A work to change, copied from a state, with a manager of its own. */
export const thaw = (state: PoolState): PoolWork => workOf(state, managerOf(state).clone())

/** A work to read: the state's own manager, so that nothing may be applied to it. For the view's prices and the policies' questions. */
export const peek = (state: PoolState): PoolWork => workOf(state, managerOf(state))

/** A copy of a work in the middle of a night, for the debrief's what-ifs. */
export function copyWork(w: PoolWork): PoolWork {
  return { ...w, mgr: w.mgr.clone(), reqs: w.reqs.map((req) => ({ ...req })), waiting: w.waiting.slice(), running: w.running.slice(), fed: w.fed.slice(), kits: w.kits.map((kit) => ({ ...kit })), counts: { ...w.counts }, dumped: w.dumped.slice(), history: w.history.slice(), trace: null, plans: [] }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The step                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Whether every ticket has been served. */
const allServed = (w: PoolWork): boolean => w.reqs.every((req) => req.status === 'done')

function apply(w: PoolWork, op: KvOp): void {
  const result = w.mgr.apply(op)
  if (!result.ok) throw new Error(`internal: the sim refused ${op.op} (${result.reason})`)
}

/** Tickets whose time has come join the waiting line, in ticket order. */
function arrive(w: PoolWork): void {
  w.reqs.forEach((req, id) => {
    if (req.status === 'future' && req.at >= 0 && req.at <= w.step) {
      req.status = 'waiting'
      w.waiting.push(id)
    }
  })
}

/** A ticket is served: its pans go back to the rotation, tail first, and its table starts to think about its next ticket. */
function serve(w: PoolWork, id: number): void {
  apply(w, { op: 'finish', req: id })
  const req = w.reqs[id]
  req.status = 'done'
  req.doneAt = w.step
  w.running.splice(w.running.indexOf(id), 1)
  w.counts.completed += 1
  const next = w.level.reqs[id].next
  if (next !== null) w.reqs[next].at = w.step + 1 + w.level.reqs[next].delay
  if (allServed(w)) w.done = true
}

/** The next ticket on the line that has not decoded in this step. */
const nextUnfed = (w: PoolWork): number | null => w.running.find((id) => !w.fed.includes(id)) ?? null

/**
 * A ticket decodes a chunk. Its pans come from the front of the rotation. If even the whole rotation cannot supply them, the ticket is
 * stalled and the learner must pull a ticket, this one or another. A ticket that has decoded everything it asked for is served at once.
 */
function feed(w: PoolWork, id: number): void {
  const def = w.level.reqs[id]
  const req = w.reqs[id]
  const chunk = def.out.slice(req.progress, req.progress + w.level.chunk)
  const result = w.mgr.apply({ op: 'append', req: id, tokens: chunk })
  if (!result.ok) {
    if (result.reason !== 'no-pages') throw new Error(`internal: the sim refused an append (${result.reason})`)
    w.ask = { kind: 'preempt', candidates: w.running.slice(), stalled: id }
    return
  }
  req.progress += chunk.length
  w.fed.push(id)
  if (req.progress >= def.out.length) serve(w, id)
}

/** A kit goes back when no ticket on the line or in the waiting line uses it (a kit stays while any ticket using it is on the rail). */
function settle(w: PoolWork): void {
  for (const kit of w.kits.slice()) {
    const uses = (id: number) => w.level.reqs[id].adapter === kit.adapter
    if (w.running.some(uses) || w.waiting.some(uses)) continue
    apply(w, { op: 'unload-adapter', adapter: kit.adapter })
    w.kits.splice(w.kits.indexOf(kit), 1)
  }
}

/** Raises the admit ask, or moves on. */
function raiseAdmit(w: PoolWork): void {
  if (w.pulledNow || w.running.length >= w.level.cap || w.waiting.length === 0) {
    w.phase = 'prefetch'
    return
  }
  const candidates: number[] = []
  for (const id of w.waiting) {
    const adapter = w.level.reqs[id].adapter
    if (adapter !== null && !kitReady(w, adapter)) continue
    if (planOf(w, id).fits) candidates.push(id)
  }
  if (candidates.length === 0) w.phase = 'prefetch'
  else w.ask = { kind: 'admit', candidates }
}

/** Raises the prefetch ask, or moves on. */
function raisePrefetch(w: PoolWork): void {
  const candidates = wantedKits(w).filter((adapter) => canLoad(w, adapter))
  if (candidates.length === 0) w.phase = 'tick'
  else w.ask = { kind: 'prefetch', candidates }
}

/** A step ends: a free slot beside a ticket that waits only for its kit is a stall, and the clock moves on. */
function tick(w: PoolWork): void {
  if (w.running.length < w.level.cap) {
    const stalled = w.waiting.some((id) => {
      const adapter = w.level.reqs[id].adapter
      return adapter !== null && !kitReady(w, adapter)
    })
    if (stalled) w.counts.adapterStallSteps += 1
  }
  w.step += 1
  w.fed = []
  w.pulledNow = false
  if (w.step >= w.level.stepCap) {
    w.done = true
    return
  }
  w.phase = 'arrive'
}

/**
 * Runs the night until a decision is open or it is over. A work with an ask open does nothing: the ask is answered by `applyAction`.
 * The ask that stops it is the work's `ask`.
 */
export function advance(w: PoolWork): void {
  for (let guard = 0; ; guard++) {
    if (guard > GUARD) throw new Error('internal: the night does not advance')
    if (w.done || w.ask !== null) return
    switch (w.phase) {
      case 'arrive':
        arrive(w)
        w.phase = 'decode'
        break
      case 'decode': {
        const id = nextUnfed(w)
        if (id === null) w.phase = 'settle'
        else feed(w, id)
        break
      }
      case 'settle':
        settle(w)
        w.phase = 'admit'
        break
      case 'admit':
        raiseAdmit(w)
        break
      case 'prefetch':
        raisePrefetch(w)
        break
      case 'tick':
        tick(w)
        break
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pieces an action does                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Hangs a waiting ticket now: the sim admits it, and the counts take what the cache did not serve. */
function commitAdmit(w: PoolWork, id: number): void {
  const def = w.level.reqs[id]
  const req = w.reqs[id]
  const prompt = promptNow(w, id)
  if (w.trace !== null) {
    const detail = w.mgr.hitDetail(prompt, def.adapter, chainsOfReq(w.level, id))
    const full = w.level.spec.groups.reduce((most, group, g) => (group.kind === 'full' ? Math.max(most, detail.perGroup[g]) : most), 0)
    w.trace.push({ req: id, turn: def.turn, tokens: prompt.length, hit: detail.hit, full, step: w.step })
  }
  w.mgr.chains = chainsOfReq(w.level, id)
  const result = w.mgr.apply({ op: 'admit', req: id, prompt, ...(def.adapter === null ? {} : { adapter: def.adapter }) })
  w.mgr.chains = null
  if (!result.ok) throw new Error(`internal: the sim refused a hanging (${result.reason})`)
  const hit = result.hit ?? 0
  req.status = 'running'
  req.hit = hit
  req.admits += 1
  req.recomputed += prompt.length - hit
  w.counts.recomputedTokens += prompt.length - hit
  w.counts.hitTokens += hit
  w.waiting.splice(w.waiting.indexOf(id), 1)
  w.running.push(id)
  w.pending = null
  w.ask = null
}

/** Brings a kit in now: the sim loads its pans, and it lands in a few steps. */
function commitLoad(w: PoolWork, adapter: number): void {
  const kit = w.level.kits[adapter]
  apply(w, { op: 'load-adapter', adapter, pages: kit.pages })
  w.kits.push({ adapter, readyAt: w.step + loadSteps(w.level, kit.pages) })
  w.pending = null
  w.ask = null
}

/** The cached pans that a ticket's hanging leaves alone: the ones its hit starts from are not offered to be dumped. */
function dumpable(w: PoolWork, plan: AdmitPlan | null): number[] {
  if (plan === null || plan.pages.length === 0) return w.mgr.cachedRotation()
  const keep = new Set(plan.pages)
  return w.mgr.cachedRotation().filter((page) => !keep.has(page))
}

/** Starts a hanging: it goes through at once when the free pans cover it, and otherwise the learner is asked what to dump. */
function beginAdmit(w: PoolWork, id: number): void {
  const plan = planOf(w, id)
  const need = Math.max(0, plan.fresh - w.mgr.freeCount())
  if (need === 0) {
    commitAdmit(w, id)
    return
  }
  w.pending = { kind: 'admit', req: id }
  w.ask = { kind: 'evict', need, candidates: dumpable(w, plan), for: 'admit', target: id }
}

function beginLoad(w: PoolWork, adapter: number): void {
  const slots = w.level.spec.adapterSlots !== undefined
  const need = slots ? 0 : Math.max(0, w.level.kits[adapter].pages - w.mgr.freeCount())
  if (need === 0) {
    commitLoad(w, adapter)
    return
  }
  w.pending = { kind: 'load', adapter }
  w.ask = { kind: 'evict', need, candidates: dumpable(w, null), for: 'prefetch', target: adapter }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Answers the open ask. Throws a RangeError for an action the ask does not allow: the UI offers only legal moves (GAMES.md §8), so a
 * violation can only come from a log that was edited. The prediction may come first, once, before any decision.
 */
export function applyAction(w: PoolWork, action: PoolAction): void {
  if (w.done) throw new RangeError('the night is over, so no action can follow')
  w.dumped = []
  switch (action.t) {
    case 'commit': {
      if (w.history.length > 0 || w.predicted !== null) throw new RangeError('the prediction comes first, once, before any decision')
      if (!Number.isInteger(action.prediction) || action.prediction < 0) throw new RangeError('a prediction is a whole number of at least 0')
      w.predicted = action.prediction
      break
    }
    case 'admit': {
      const ask = w.ask
      if (ask === null || ask.kind !== 'admit') throw new RangeError('no ticket is being offered to hang')
      if (action.req === null) {
        w.ask = null
        w.phase = 'prefetch'
      } else {
        if (!ask.candidates.includes(action.req)) throw new RangeError(`ticket ${action.req} cannot hang now`)
        w.ask = null
        beginAdmit(w, action.req)
      }
      w.turns += 1
      break
    }
    case 'evict': {
      const ask = w.ask
      if (ask === null || ask.kind !== 'evict') throw new RangeError('no pans are being asked for')
      if (!Array.isArray(action.pages) || action.pages.length !== ask.need) throw new RangeError(`dump exactly ${ask.need} pans`)
      if (new Set(action.pages).size !== action.pages.length) throw new RangeError('a pan can be dumped once')
      for (const page of action.pages) if (!ask.candidates.includes(page)) throw new RangeError(`pan ${page} is not a cached pan that can be dumped`)
      for (const page of action.pages) w.mgr.dump(page)
      w.dumped = action.pages.slice().sort((a, b) => a - b)
      const pending = w.pending
      w.ask = null
      if (pending === null) throw new Error('internal: pans were dumped for nothing')
      if (pending.kind === 'admit') commitAdmit(w, pending.req)
      else commitLoad(w, pending.adapter)
      w.turns += 1
      break
    }
    case 'preempt': {
      const ask = w.ask
      if (ask === null || ask.kind !== 'preempt') throw new RangeError('no ticket is being asked for')
      if (!ask.candidates.includes(action.req)) throw new RangeError(`ticket ${action.req} is not on the line`)
      apply(w, { op: 'finish', req: action.req })
      const req = w.reqs[action.req]
      req.status = 'waiting'
      req.pulls += 1
      req.at = w.step
      w.running.splice(w.running.indexOf(action.req), 1)
      const fed = w.fed.indexOf(action.req)
      if (fed >= 0) w.fed.splice(fed, 1)
      w.waiting.unshift(action.req)
      w.counts.preemptions += 1
      w.pulledNow = true
      w.ask = null
      w.turns += 1
      break
    }
    case 'prefetch': {
      const ask = w.ask
      if (ask === null || ask.kind !== 'prefetch') throw new RangeError('no kit is being offered')
      if (action.adapter === null) {
        w.ask = null
        w.phase = 'tick'
      } else {
        if (!ask.candidates.includes(action.adapter)) throw new RangeError(`kit ${action.adapter} cannot come in now`)
        w.ask = null
        beginLoad(w, action.adapter)
      }
      w.turns += 1
      break
    }
    default:
      throw new RangeError(`The Reach-In has no action "${String((action as { t?: unknown }).t)}"`)
  }
  w.history.push(action)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A whole night under a policy                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What decides: given the work and the open ask, the action that answers it. */
export type Policy = (w: PoolWork, ask: PoolAsk) => PoolAction

/**
 * Plays a work to the end under `policy`, from wherever it stands, or to the first decision at which `until` holds. Returns the same work.
 * `until` is for a night played only to see whether the price stays under a line: the price only grows, so a night that has crossed the
 * line has no way back, and the rest of it need not be played.
 */
export function playPolicy(w: PoolWork, policy: Policy, until?: (w: PoolWork) => boolean): PoolWork {
  advance(w)
  for (let decisions = 0; !w.done; decisions++) {
    if (decisions > GUARD) throw new Error('internal: the policy does not finish the night')
    if (w.ask === null) throw new Error('internal: the night is not over, and nothing is asked')
    if (until !== undefined && until(w)) break
    applyAction(w, policy(w, w.ask))
    advance(w)
  }
  return w
}
