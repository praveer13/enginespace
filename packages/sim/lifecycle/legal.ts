// The rules a path keeps (GAMES.md §5, "Why the rule is the concept"), as functions. `legal` judges one step of a laid path, `stageFits`
// judges a stage's own mechanism against the boundary it crosses, and `walk` judges a whole sequence. Engine Floor's session
// (W1-T17) puts the engine's reference path beside these; the model's own tests hold every reference path to them.
//
//   1. A stage starts where the last one ended.
//   2. A change of process needs IPC (ZMQ) or shared memory.
//   3. A change of thread inside a process needs a queue.
//   4. Host to GPU needs a host-to-device copy or a launch, and GPU to host needs a device-to-host copy.
//   5. Reading a value produced asynchronously (a non-blocking copy, a future, a launched kernel's output) needs a sync first.
//
// Rules 2 to 4 are one table: the boundary between a stage's two places decides which mechanisms may cross it.

import type { Mechanism, Place, Rule, StageDef, Verdict } from './types'
import { MECHANISMS } from './types'

/** The five rules in the words of GAMES.md §5, for a screen that explains a failure. */
export const RULES: Readonly<Record<Rule, string>> = {
  start: 'A stage starts where the last one ended.',
  process: 'A change of process needs IPC (ZMQ) or shared memory.',
  thread: 'A change of thread inside a process needs a queue.',
  device: 'Host to GPU needs a host-to-device copy or a launch, and GPU to host needs a device-to-host copy.',
  async: "Reading a value produced asynchronously (a non-blocking copy, a future, a launched kernel's output) needs a sync first.",
}

/** What lies between two places. `on-gpu` is work that stays on one GPU, and `across-gpus` is a hop between the GPUs of two ranks. */
export type Boundary = 'none' | 'thread' | 'process' | 'to-gpu' | 'to-host' | 'on-gpu' | 'across-gpus'

/** The mechanisms that may cross each boundary. Every stage of every path is held to this table (`stageFits`). */
export const FITS: Readonly<Record<Boundary, readonly Mechanism[]>> = {
  none: ['call', 'queue', 'sync'],
  thread: ['queue'],
  process: ['ipc', 'shm'],
  'to-gpu': ['h2d', 'launch'],
  'to-host': ['d2h'],
  'on-gpu': ['launch'],
  'across-gpus': ['collective'],
}

const BOUNDARY_RULE: Readonly<Record<Boundary, Rule>> = {
  none: 'start',
  thread: 'thread',
  process: 'process',
  'to-gpu': 'device',
  'to-host': 'device',
  'on-gpu': 'device',
  'across-gpus': 'device',
}

const MECHANISM_RULE: Readonly<Record<Mechanism, Rule>> = {
  call: 'start',
  queue: 'thread',
  ipc: 'process',
  shm: 'process',
  h2d: 'device',
  d2h: 'device',
  launch: 'device',
  collective: 'device',
  sync: 'start',
}

export const samePlace = (a: Place, b: Place): boolean => a.process === b.process && a.thread === b.thread && a.device === b.device && a.rank === b.rank

/** A place in words: `engine-core · main`, or `GPU of worker-1 (rank 1)`. */
export function describePlace(p: Place): string {
  return p.device === 'gpu' ? `the GPU of ${p.process} (rank ${p.rank})` : `${p.process} · ${p.thread}${p.rank > 0 ? ` (rank ${p.rank})` : ''}`
}

/** The boundary between two places. On the host, a different process outranks a different thread; a GPU is its process's, with its rank. */
export function boundaryOf(a: Place, b: Place): Boundary {
  if (a.device === 'host' && b.device === 'gpu') return 'to-gpu'
  if (a.device === 'gpu' && b.device === 'host') return 'to-host'
  if (a.device === 'gpu') return a.process === b.process && a.rank === b.rank ? 'on-gpu' : 'across-gpus'
  if (a.process !== b.process) return 'process'
  return a.thread === b.thread && a.rank === b.rank ? 'none' : 'thread'
}

/**
 * Whether a stage starts where the request is (rule 1). When it does not, the rule named is the kind of bridge the request would
 * have needed to get there: `process`, `thread` or `device`, and `start` when the places differ in nothing but rank.
 */
export function legal(at: Place, next: StageDef): Verdict {
  if (samePlace(at, next.from)) return { ok: true }
  const gap = boundaryOf(at, next.from)
  const rule = BOUNDARY_RULE[gap]
  return { ok: false, rule, detail: `the request is at ${describePlace(at)}, and "${next.id}" starts at ${describePlace(next.from)}. ${RULES[rule]}` }
}

/** Whether a stage's mechanism is one that crosses the boundary between its own two places (rules 2 to 4). */
export function stageFits(stage: StageDef): Verdict {
  const gap = boundaryOf(stage.from, stage.to)
  if (FITS[gap].includes(stage.mechanism)) return { ok: true }
  const rule = gap === 'none' ? MECHANISM_RULE[stage.mechanism] : BOUNDARY_RULE[gap]
  return {
    ok: false,
    rule,
    detail: `"${stage.id}" goes from ${describePlace(stage.from)} to ${describePlace(stage.to)} by ${stage.mechanism}, and only ${FITS[gap].join(' or ')} crosses that. ${RULES[rule]}`,
  }
}

export interface WalkResult {
  /** How many stages were laid before the first that broke a rule: all of them when none did. */
  readonly reached: number
  /** The index of the first stage that broke a rule, or null. */
  readonly firstWrong: number | null
  readonly rule: Rule | null
  readonly detail: string | null
}

/**
 * Lays `stages` one after another from `entry` and stops at the first that breaks a rule. After a device-to-host copy the value is
 * not on the host yet, so the only stages that may follow before a `sync` are a queue, which carries the handle and reads nothing,
 * and the sync itself (rule 5).
 */
export function walk(entry: Place, stages: readonly StageDef[]): WalkResult {
  let at = entry
  let pending = false
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    const start = legal(at, stage)
    const fits = stageFits(stage)
    const verdict = !start.ok ? start : fits
    if (!verdict.ok) return { reached: i, firstWrong: i, rule: verdict.rule, detail: verdict.detail }
    if (pending && stage.mechanism !== 'queue' && stage.mechanism !== 'sync') {
      return {
        reached: i,
        firstWrong: i,
        rule: 'async',
        detail: `"${stage.id}" runs after a device-to-host copy and before any sync. ${RULES.async}`,
      }
    }
    if (stage.mechanism === 'd2h') pending = true
    else if (stage.mechanism === 'sync') pending = false
    at = stage.to
  }
  return { reached: stages.length, firstWrong: null, rule: null, detail: null }
}

export interface PathFacts {
  readonly stages: number
  readonly byMechanism: Readonly<Record<Mechanism, number>>
  /** Stages that change process on the host, which is what "a process boundary" counts (GAMES.md §5, Band and Predict). */
  readonly processHops: number
  /** How many different GPUs the path visits, by (process, rank). */
  readonly gpus: number
}

/** The counts that GAMES.md §5's band and prediction are made of. */
export function pathFacts(path: readonly StageDef[]): PathFacts {
  const byMechanism = Object.fromEntries(MECHANISMS.map((m) => [m, 0])) as Record<Mechanism, number>
  const gpus: string[] = []
  let processHops = 0
  for (const stage of path) {
    byMechanism[stage.mechanism]++
    if (boundaryOf(stage.from, stage.to) === 'process') processHops++
    for (const place of [stage.from, stage.to]) {
      const key = `${place.process}#${place.rank}`
      if (place.device === 'gpu' && !gpus.includes(key)) gpus.push(key)
    }
  }
  return { stages: path.length, byMechanism, processHops, gpus: gpus.length }
}
