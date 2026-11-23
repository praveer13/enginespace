/**
 * Shared by Trace attribution's tests (tests/play/gap-hunt-*.test.ts): levels, runs built from a list of actions, random walks over the legal
 * actions, and a recomputation of what a run got right that shares no code with `packages/play/gap-hunt` or with the model's `checkHunt`: it
 * counts difference arrays over every ns of the step. Not a test: bun test collects only *.test.ts.
 */
import { GAP_HUNT } from '@es/play/gap-hunt/entry'
import { caseOf } from '@es/play/gap-hunt/engine'
import { huntInit, huntReduce, huntSession } from '@es/play/gap-hunt/session'
import type { HuntAction, HuntLevel, HuntLevelId, HuntState } from '@es/play/gap-hunt/types'
import { HUNT_CATEGORY_ORDER } from '@es/play/gap-hunt/types'
import { below, rngFor } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { spanCount, spanView } from '@es/sim/trace'
import type { Category } from '@es/sim/trace'

export const S = huntSession

export const practiceOf = (id: HuntLevelId): HuntLevel => S.level(id, GAP_HUNT.levels.find((level) => level.id === id)?.practiceSeed ?? 0)

/** The state after `actions`, from a level's first state. */
export const stateAfter = (level: HuntLevel, ...actions: HuntAction[]): HuntState => actions.reduce(huntReduce, huntInit(level))

export const LEVELS: readonly HuntLevelId[] = ['read', 'graphs', 'gap', 'attribute']

/** The main-thread spans of case `i` that overlap its step: what a cause can name. */
export function mainThreadSpans(level: HuntLevel, i: number): number[] {
  const c = caseOf(level, i)
  const out: number[] = []
  for (let k = 0; k < spanCount(c.hunt.trace); k++) {
    const v = spanView(c.hunt.trace, k)
    if ((v.kind === 'cpu-thread' || v.kind === 'cuda-api') && v.startNs < c.toNs && v.endNs > c.fromNs) out.push(k)
  }
  return out
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[below(rng, xs.length)]

/**
 * A random walk over the legal actions of a level, to its end: a guess, random marks between random edges with random categories, now and then
 * a mark taken back, a cause, and a submit as soon as one is legal (on `attribute`, after one mark over the whole step in a random category if
 * ns are still unaccounted). Every action it takes is legal, so the reducer never throws.
 */
export function randomWalk(level: HuntLevel, seed: Seed): { state: HuntState; actions: HuntAction[] } {
  const rng = rngFor(seed, 'gap-hunt-test/walk')
  let state = huntInit(level)
  const actions: HuntAction[] = []
  const take = (a: HuntAction): void => {
    state = huntReduce(state, a)
    actions.push(a)
  }
  while (!state.done) {
    const i = state.at
    const c = caseOf(level, i)
    if (level.id === 'graphs') {
      take({ t: 'commit', prediction: below(rng, 40) })
      continue
    }
    if (level.id !== 'read') take({ t: 'commit', prediction: below(rng, HUNT_CATEGORY_ORDER.length) })
    const marks = below(rng, 7)
    for (let k = 0; k < marks; k++) {
      const a = pick(rng, c.edges)
      const b = pick(rng, c.edges)
      if (a === b) continue
      take({ t: 'mark', from: Math.min(a, b), to: Math.max(a, b), category: pick(rng, HUNT_CATEGORY_ORDER) as Category })
      const run = state.runs[i]
      if (below(rng, 5) === 0 && run.marks.length > run.locked) take({ t: 'unmark', index: run.locked + below(rng, run.marks.length - run.locked) })
    }
    if (level.id === 'attribute' && S.view(state).unaccountedNs > 0) take({ t: 'mark', from: c.fromNs, to: c.toNs, category: pick(rng, HUNT_CATEGORY_ORDER) as Category })
    if (S.view(state).marks.filter((m) => !m.locked).length === 0) take({ t: 'mark', from: c.fromNs, to: c.edges[1], category: 'kernel' })
    take({ t: 'cause', event: pick(rng, mainThreadSpans(level, i)) })
    take({ t: 'submit' })
  }
  return { state, actions }
}

/** What the marks of case `i` of a state say of every ns of the step, counted ns by ns: the categories that cover it, as a bit set. */
export function coverOf(level: HuntLevel, i: number, marks: readonly { fromNs: number; toNs: number; category: Category }[]): Uint8Array {
  const c = caseOf(level, i)
  const n = c.toNs - c.fromNs
  const diff = HUNT_CATEGORY_ORDER.map(() => new Int32Array(n + 1))
  for (const m of marks) {
    const a = Math.max(m.fromNs, c.fromNs) - c.fromNs
    const b = Math.min(m.toNs, c.toNs) - c.fromNs
    if (b <= a) continue
    const d = diff[HUNT_CATEGORY_ORDER.indexOf(m.category)]
    d[a]++
    d[b]--
  }
  const out = new Uint8Array(n)
  HUNT_CATEGORY_ORDER.forEach((_, k) => {
    let run = 0
    for (let t = 0; t < n; t++) {
      run += diff[k][t]
      if (run > 0) out[t] |= 1 << k
    }
  })
  return out
}

/** The reference's category of every ns of the step, as an index of HUNT_CATEGORY_ORDER, counted from the model's partition. */
export function truthOf(level: HuntLevel, i: number): Uint8Array {
  const c = caseOf(level, i)
  const out = new Uint8Array(c.toNs - c.fromNs).fill(255)
  for (const s of c.split.marks) for (let t = s.fromNs; t < s.toNs; t++) out[t - c.fromNs] = HUNT_CATEGORY_ORDER.indexOf(s.category)
  return out
}

export interface Brute {
  /** ns no mark covers. */
  readonly unaccounted: number
  /** ns covered by exactly one category, the reference's. */
  readonly right: number
  /** ns covered by two categories or more. */
  readonly conflict: number
  /** The largest maximal run of ns with one (truth, got) pair that is not right: earliest on a tie. */
  readonly wrong: { readonly from: number; readonly len: number; readonly truth: number; readonly got: number | 'none' | 'many' } | null
}

/** Everything a run's marks got right and wrong in a case, recomputed ns by ns. */
export function brute(level: HuntLevel, i: number, marks: readonly { fromNs: number; toNs: number; category: Category }[]): Brute {
  const cover = coverOf(level, i, marks)
  const truth = truthOf(level, i)
  let unaccounted = 0
  let right = 0
  let conflict = 0
  let wrong: Brute['wrong'] = null
  let run: { from: number; len: number; truth: number; got: number | 'none' | 'many' } | null = null
  const close = (): void => {
    if (run !== null && (wrong === null || run.len > wrong.len)) wrong = run
    run = null
  }
  for (let t = 0; t < cover.length; t++) {
    const bits = cover[t]
    const count = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1) + ((bits >> 3) & 1)
    const got: number | 'none' | 'many' = count === 0 ? 'none' : count > 1 ? 'many' : Math.log2(bits)
    if (count === 0) unaccounted++
    if (count > 1) conflict++
    if (got === truth[t]) {
      right++
      close()
      continue
    }
    if (run !== null && (run as { truth: number; got: unknown }).truth === truth[t] && (run as { got: unknown }).got === got) (run as { len: number }).len++
    else {
      close()
      run = { from: t, len: 1, truth: truth[t], got }
    }
  }
  close()
  return { unaccounted, right, conflict, wrong }
}
