/**
 * What the 2D view, the DOM mirror and (W1-T24) the 3D scene all draw (GAMES.md §8: "the rack, the rotation, the tickets, the kits, the
 * counters"): the state, read into pans, stations, tickets and the open ask.
 *
 * Every figure comes from the sim's manager, the one that made the state: a ticket's hit is the sim's fixed point over the groups, its
 * pans are the ones the sim's plan names, and a dump's price is the hit that the waiting line would still have without the pan. The
 * view does no rule of its own. It is a function of the state alone (the manager it reads is the state's own, rebuilt from the log if
 * the state came from elsewhere), and it never changes either.
 *
 * Names. The kitchen's word names an object and the engine's term rides beside it in the views that draw this: a pan is a page, a
 * station a group, a ticket a request, a table a session, a kit an adapter, and the rotation the free queue.
 */
import { kvHitFrom, kvTableRule } from '@es/sim/kv'
import type { KvPage } from '@es/sim/kv'
import { kitReady, loadSteps, peek, planOf } from './engine'
import type { PoolWork } from './engine'
import { labelOf } from './labels'
import type { AdmitPlan } from './manager'
import { priceOf } from './policy'
import { scoreOf, unservedOf } from './score'
import type { AskView, KitView, PanState, PanView, PoolState, PoolView, SegState, StationView, TicketView } from './types'

/** Pans in a row of the reach-in (GAMES.md §8: "in rows of 16"). */
export const COLS = 16

const two = (n: number): string => String(n + 1).padStart(2, '0')

/** The pans each waiting ticket's hit starts from, with the plan that said so. */
function plansOf(w: PoolWork): Map<number, AdmitPlan> {
  const plans = new Map<number, AdmitPlan>()
  for (const id of w.waiting) plans.set(id, planOf(w, id))
  return plans
}

/** A ticket's ruler: one row for each station, one segment for each block of the tokens it holds, or would. */
function rulerOf(w: PoolWork, id: number, plan: AdmitPlan | undefined): SegState[][] {
  const { level } = w
  const req = w.reqs[id]
  if (req.status !== 'waiting' && req.status !== 'running') return []
  const tokens = level.reqs[id].prompt.length + req.progress
  return level.spec.groups.map((group) => {
    const rule = kvTableRule(group, tokens)
    const edge = plan === undefined ? 0 : plan.hit / group.blockTokens
    const from = kvHitFrom(group, edge)
    const row: SegState[] = []
    for (let j = 0; j < rule.blocks; j++) {
      if (j < rule.skip) row.push('let-go')
      else if (req.status === 'running') row.push('held')
      else row.push(plan !== undefined && plan.hit > 0 && j >= from && j < edge ? 'hit' : 'fresh')
    }
    return row
  })
}

function ticketsOf(w: PoolWork, plans: ReadonlyMap<number, AdmitPlan>): TicketView[] {
  const { level } = w
  return level.reqs.map((def, id): TicketView => {
    const req = w.reqs[id]
    const plan = plans.get(id)
    const table = level.tables[def.table]
    return {
      id,
      no: two(id),
      table: def.table,
      letter: table.letter,
      turn: def.turn,
      turns: table.tickets,
      status: req.status,
      tokens: def.prompt.length + req.progress,
      out: def.out.length,
      progress: req.progress,
      adapter: def.adapter,
      hit: plan === undefined ? req.hit : plan.hit,
      fresh: plan === undefined ? null : plan.fresh,
      fits: plan === undefined ? null : plan.fits,
      kitReady: req.status !== 'waiting' ? null : def.adapter === null ? true : kitReady(w, def.adapter),
      ruler: rulerOf(w, id, plan),
      admits: req.admits,
      pulls: req.pulls,
      recomputed: req.recomputed,
      arrives: req.status === 'future' && req.at >= 0 ? req.at : null,
    }
  })
}

function pansOf(state: PoolState, plans: ReadonlyMap<number, AdmitPlan>): PanView[] {
  const { level, kv } = state
  const rank: (number | null)[] = kv.pages.map(() => null)
  kv.queue.forEach((page, at) => {
    rank[page] = at
  })
  const holders: number[][] = kv.pages.map(() => [])
  const blockOf: number[] = kv.pages.map(() => -1)
  for (const request of kv.requests) {
    for (const table of request.tables) {
      table.forEach((page, j) => {
        if (page === null) return
        if (!holders[page].includes(request.id)) holders[page].push(request.id)
        if (blockOf[page] < 0) blockOf[page] = j
      })
    }
  }
  const spoken: number[][] = kv.pages.map(() => [])
  for (const id of state.waiting) for (const page of plans.get(id)?.pages ?? []) spoken[page].push(id)
  return kv.pages.map((page: KvPage, id): PanView => {
    const common = { id, holders: holders[id], spokenFor: spoken[id], rank: rank[id] }
    if (page.st === 'adapter') return { ...common, state: 'adapter', station: null, kit: page.adapter, refs: 0, hash: null, tape: `kit ${page.adapter + 1}`, block: null }
    if (page.st === 'free') return { ...common, state: 'free', station: null, kit: null, refs: 0, hash: null, tape: null, block: null }
    const group = level.spec.groups[page.group]
    const label = page.hash === null ? undefined : labelOf(level, group.blockTokens, page.hash)
    const holder = holders[id][0]
    const own = holder === undefined ? null : level.tables[level.reqs[holder].table]
    const block = label !== undefined ? label.block : blockOf[id] >= 0 ? blockOf[id] : null
    const tape = label !== undefined ? label.text : own === null ? null : `${own.letter}·${block ?? 0}`
    if (page.st === 'cached') return { ...common, state: spoken[id].length > 0 ? 'shared' : 'cached', station: page.group, kit: null, refs: 0, hash: page.hash, tape, block }
    return { ...common, state: page.refs > 1 ? 'shared' : 'used', station: page.group, kit: null, refs: page.refs, hash: page.hash, tape, block }
  })
}

function kitsOf(w: PoolWork, state: PoolState): KitView[] {
  return w.level.kits.map((kit): KitView => {
    const landed = state.kits.find((entry) => entry.adapter === kit.id)
    const resident = state.kv.adapters.find((entry) => entry.id === kit.id)
    const uses = (id: number) => w.level.reqs[id].adapter === kit.id
    return {
      id: kit.id,
      rank: kit.rank,
      pages: kit.pages,
      state: landed === undefined ? 'absent' : landed.readyAt <= state.step ? 'ready' : 'loading',
      readyAt: landed === undefined ? null : landed.readyAt,
      pageIds: resident === undefined ? [] : resident.pages,
      users: state.running.filter(uses),
      wanted: state.waiting.filter(uses),
      loadSteps: loadSteps(w.level, kit.pages),
    }
  })
}

function askOf(w: PoolWork, state: PoolState): AskView | null {
  const ask = state.ask
  if (ask === null) return null
  switch (ask.kind) {
    case 'admit':
      return { kind: 'admit', candidates: ask.candidates }
    case 'evict': {
      const priced = priceOf(w, ask.candidates, ask.for === 'admit' ? ask.target : null)
      return { kind: 'evict', need: ask.need, for: ask.for, target: ask.target, candidates: ask.candidates, ...priced }
    }
    case 'preempt':
      return { kind: 'preempt', candidates: ask.candidates, stalled: ask.stalled }
    case 'prefetch':
      return { kind: 'prefetch', candidates: ask.candidates }
  }
}

/** What every view draws. */
export function poolView(state: PoolState): PoolView {
  const { level } = state
  const w = peek(state)
  const plans = plansOf(w)
  const stations: StationView[] = level.spec.groups.map((g, index) => ({
    index,
    id: g.id,
    kind: g.kind,
    layers: g.layers,
    padLayers: g.padLayers ?? 0,
    blockTokens: g.blockTokens,
    window: g.kind === 'sliding' ? (g.window ?? null) : null,
    statePages: g.kind === 'state' ? (g.statePages ?? null) : null,
  }))
  const pans = pansOf(state, plans)
  const tally: Record<PanState, number> = { free: 0, used: 0, cached: 0, shared: 0, adapter: 0, evicted: 0 }
  for (const pan of pans) tally[pan.state] += 1
  // The count a reader reads off the cabinet's door is the sim's own: a pan is held when a ticket holds it, and cached when it keeps its tape
  // and nobody does. A cached pan that a waiting ticket starts from is drawn as shared mise (green) but is still cached, and not held.
  const stock = { bare: 0, held: 0, cached: 0, kits: 0 }
  for (const page of state.kv.pages) {
    if (page.st === 'free') stock.bare += 1
    else if (page.st === 'used') stock.held += 1
    else if (page.st === 'cached') stock.cached += 1
    else stock.kits += 1
  }
  return {
    level: level.id,
    title: level.title,
    prompt: level.prompt,
    graded: level.graded,
    synthetic: true,
    step: state.step,
    cols: COLS,
    pans,
    stations,
    rotation: state.kv.queue,
    tickets: ticketsOf(w, plans),
    waiting: state.waiting,
    running: state.running,
    kits: kitsOf(w, state),
    ask: askOf(w, state),
    counts: scoreOf(state),
    predict: { ...level.predict, committed: state.predicted, open: state.history.length === 0 && !state.done },
    tally,
    stock,
    cap: level.cap,
    chunk: level.chunk,
    bar: level.bar,
    blockTokens: level.spec.groups.reduce((most, g) => Math.max(most, g.blockTokens), 1),
    dumped: state.dumped,
    done: state.done,
    incomplete: state.done && unservedOf(state) > 0,
  }
}
