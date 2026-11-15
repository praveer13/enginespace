/**
 * The Reach-In's levels (GAMES.md §8, "Levels"): the model each one plays, the night it plays it on, the pool it plays it in, and what
 * the learner is asked to predict first.
 *
 * Every level is the same game on a different model: the sim's presets (`packages/sim/kv`, D-045) give the groups, and the workload
 * (workload.ts) gives the night. A level changes three things: which kinds of layer the model has, how full the pool is, and whether
 * recipe kits compete for the pool. The numbers of the nights, the pool sizes, the stall weight and the pass mark are the game's own and
 * synthetic [estimated]. The sim's presets are the ones the `hybrid-kv` lab uses, so the pages of a ticket here are the pages the lab's
 * oracle counts.
 *
 * `evict`, `adapters` and `manager` are graded, on a seed drawn at the start (ASSESSMENT §4.3). `manager` is mixed: its seed picks the
 * model, so a fresh seed is a fresh manager to run.
 */
import { assertSeed, below, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { kvAdapterCatalog, kvPagesHeld, kvPreset } from '@es/sim/kv'
import type { KvPresetId } from '@es/sim/kv'
import { POOL_COPY } from './copy'
import type { PoolLevel, PoolLevelId, PoolPredict } from './types'
import { POOL_LEVEL_IDS } from './types'
import { buildWorkload } from './workload'
import type { WorkloadSpec } from './workload'

/** The pass mark [estimated]: ASSESSMENT §4.3 sets the bar for the graded levels, "a score of at least 0.95". */
export const PASS_SCORE = 0.95

/** Tokens a stalled step costs [estimated]: the prefill a step forgoes, as three chunks of decode. */
export const STALL_WEIGHT = 24

/** Tokens a ticket decodes in one step: one block of the base model. */
export const CHUNK = 16

/** Pans a step of landing carries: a kit of this many pans, and fewer, lands in one step [estimated]. */
export const LOAD_RATE = 8

interface Shape {
  readonly preset: KvPresetId
  readonly pool: number
  readonly cap: number
  readonly workload: WorkloadSpec
  /** Ranks of the kits on offer. */
  readonly ranks: readonly number[]
  readonly predict: 'pages' | 'stations' | 'state' | 'kit'
}

const BASE: WorkloadSpec = {
  tables: 5,
  turns: [2, 3],
  standing: 2,
  standingTokens: [32, 48],
  standingShare: 700,
  firstTokens: [24, 56],
  nextTokens: [16, 40],
  outChunks: [2, 3],
  think: [0, 2],
  spread: [0, 1],
  chunk: CHUNK,
  kits: [],
}

const SHAPES: Readonly<Record<Exclude<PoolLevelId, 'manager'>, Shape>> = {
  'one-group': {
    preset: 'one-group',
    pool: 44,
    cap: 3,
    workload: { ...BASE, tables: 6, turns: [2, 3], think: [0, 1] },
    ranks: [],
    predict: 'pages',
  },
  'two-kinds': {
    preset: 'two-kinds',
    pool: 104,
    cap: 4,
    workload: { ...BASE, tables: 7, turns: [2, 3], think: [0, 1], standingShare: 900, pinFirst: 112 },
    ranks: [],
    predict: 'pages',
  },
  evict: {
    preset: 'two-kinds',
    pool: 112,
    cap: 4,
    workload: { ...BASE, tables: 8, turns: [2, 3], think: [0, 1], standingShare: 900 },
    ranks: [],
    predict: 'pages',
  },
  'same-size': {
    preset: 'same-size',
    pool: 208,
    cap: 3,
    workload: { ...BASE, tables: 6, turns: [2, 3], think: [0, 1], standingShare: 900 },
    ranks: [],
    predict: 'stations',
  },
  state: {
    preset: 'state',
    pool: 64,
    cap: 3,
    workload: { ...BASE, tables: 6, turns: [2, 3], think: [0, 1] },
    ranks: [],
    predict: 'state',
  },
  adapters: {
    preset: 'two-kinds',
    pool: 160,
    cap: 4,
    workload: { ...BASE, tables: 9, turns: [2, 3], think: [0, 1], kits: [0, 1, null] },
    ranks: [8, 64],
    predict: 'kit',
  },
}

/** The shape of `manager` on a seed: the model and the kits are drawn, so that a fresh seed is a fresh manager. */
function managerShape(seed: Seed): Shape {
  const rng = rngFor(seed, 'pool/manager')
  const preset = (['two-kinds', 'two-kinds', 'same-size', 'state'] as const)[below(rng, 4)]
  const night = { ...BASE, turns: [2, 3] as const, think: [0, 1] as const, kits: [0, 1, null] }
  const model = {
    'two-kinds': { pool: 160, workload: { ...night, tables: 9 } },
    'same-size': { pool: 288, workload: { ...night, tables: 8, outChunks: [3, 5] as const } },
    state: { pool: 96, workload: { ...night, tables: 8, outChunks: [3, 5] as const } },
  }[preset]
  return {
    preset,
    pool: model.pool,
    cap: 4,
    workload: model.workload,
    ranks: [8, 64],
    predict: 'pages',
  }
}

export const isLevelId = (id: string): id is PoolLevelId => (POOL_LEVEL_IDS as readonly string[]).includes(id)

/** The titles of the levels, for the registry's record. */
export const levelTitle = (id: PoolLevelId): string => POOL_COPY[id].title

/** The levels that are graded (ASSESSMENT §4.3: `pool/evict`, `pool/adapters` and `pool/manager`). */
export const GRADED: readonly PoolLevelId[] = ['evict', 'adapters', 'manager']

/** The level `id` on `seed`. Throws for a level that The Reach-In does not have. */
export function buildLevel(id: string, seed: Seed): PoolLevel {
  if (!isLevelId(id)) throw new RangeError(`The Reach-In has no level "${id}"`)
  assertSeed(seed)
  const shape = id === 'manager' ? managerShape(seed) : SHAPES[id]
  const spec = kvPreset(shape.preset, shape.pool, { prefixCaching: true })
  const kits = shape.ranks.length === 0 ? [] : kvAdapterCatalog(spec, shape.ranks)
  const { tables, reqs } = buildWorkload(seed, shape.workload)
  const chunks = reqs.reduce((sum, req) => sum + req.out.length / CHUNK, 0)
  const chain = tables.map((table) => reqs.filter((req) => req.table === table.id).reduce((sum, req) => sum + req.out.length / CHUNK + 1 + req.delay, 0))
  const predict = predictionOf(shape.predict, spec, kits, reqs[0].prompt.length)
  return {
    id,
    seed,
    graded: GRADED.includes(id),
    preset: shape.preset,
    spec,
    kits,
    tables,
    reqs,
    cap: shape.cap,
    chunk: CHUNK,
    loadRate: LOAD_RATE,
    // Twice the longer of two floors, with a margin [estimated]: the line's work shared over its slots, and the longest table's tickets in turn.
    // A policy that hangs one ticket at a time needs about `cap` times the first, so it does not make it, and the house always does.
    stepCap: Math.ceil(2 * Math.max(chunks / shape.cap, ...chain)) + 12,
    stallWeight: STALL_WEIGHT,
    bar: PASS_SCORE,
    predict,
  }
}

/** What to predict (GAMES.md §8: "Predict the pages a request will hold, per group"), worked out by the sim's own arithmetic. */
function predictionOf(kind: Shape['predict'], spec: ReturnType<typeof kvPreset>, kits: PoolLevel['kits'], firstTokens: number): PoolPredict {
  switch (kind) {
    case 'pages':
      return { answer: kvPagesHeld(spec, firstTokens) }
    case 'stations':
      return { answer: spec.groups.length }
    case 'state':
      return { answer: spec.groups.reduce((sum, g) => sum + (g.kind === 'state' ? (g.statePages ?? 0) : 0), 0) }
    case 'kit':
      return { answer: kits.reduce((most, kit) => Math.max(most, kit.pages), 0) }
  }
}
