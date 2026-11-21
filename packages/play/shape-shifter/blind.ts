/**
 * Tensor views' blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/shape-shifter-levels.test.ts): what a learner who reads
 * nothing of the tensor passes of its two graded levels, `fewest` and `grid`.
 *
 * A blind learner answers by position and by habit and by nothing else. On `fewest` that is a fixed chain of at most four steps, each one
 * of four: `contiguous()`, a `view` to the target's shape (which the page shows), the first order of the `permute` picker, or the last. Those
 * are 340 chains, and they hold every habit that the level's targets are drawn against: copy first, copy at the end, copy before every
 * `view`, views alone. A chain plays each target in turn, and a target the chain does not reach ends the run. On `grid` it is one BLOCK
 * for each dimension, from the stepper's powers of two, with the grid left at `cdiv`: 36 launches, the same on every tensor.
 *
 * Each strategy is played through the session's own reducer and graded by its own grade, so a pass is a fact: three targets in a row,
 * each with the reference's copies and no `view` refused, or three tensors with the least masked lanes.
 */
import type { ShiftOp } from '@es/sim/tensor'
import { bandedSeeds, rowOf, typed } from '../blind'
import type { BlindProbe, BlindProbes } from '../blind'
import { ordersOf } from './engine'
import type { ShiftAction, ShiftLevel, ShiftState } from './types'

/** Where the sample starts, clear of the first 400 seeds that the gate reads the band on. */
export const FIRST_SEED = 1000

/** Banded seeds of each graded level [estimated]: a check that the levels stay hard, and not a margin. */
export const FEWEST_SEEDS = 120
export const GRID_SEEDS = 150

const SYMBOLS = ['copy', 'view-to-target', 'first-order', 'last-order'] as const
type Symbol = (typeof SYMBOLS)[number]

const WORDS: Readonly<Record<Symbol, string>> = {
  copy: 'contiguous()',
  'view-to-target': "a view to the target's shape",
  'first-order': "the picker's first permute",
  'last-order': "the picker's last permute",
}

/** Every chain of one to four symbols. */
export const CHAINS: readonly (readonly Symbol[])[] = (() => {
  let level: Symbol[][] = SYMBOLS.map((s) => [s])
  const out: Symbol[][] = [...level]
  for (let n = 2; n <= 4; n++) {
    level = level.flatMap((chain) => SYMBOLS.map((s) => [...chain, s]))
    out.push(...level)
  }
  return out
})()

function opOf(symbol: Symbol, state: ShiftState): ShiftOp | null {
  const level = state.level
  const run = state.runs[state.at]
  if (level.kind !== 'layout' || run.kind !== 'layout') return null
  switch (symbol) {
    case 'copy':
      return { op: 'contiguous' }
    case 'view-to-target':
      return { op: 'view', shape: level.tasks[state.at].goal.shape }
    default: {
      const orders = ordersOf(run.view.shape.length)
      if (orders.length === 0) return null
      return { op: 'permute', order: symbol === 'first-order' ? orders[0] : orders[orders.length - 1] }
    }
  }
}

/** A chain played on every target of a level, as far as it goes. */
function playChain(session: ReturnType<typeof typed<ShiftLevel, ShiftState, ShiftAction>>, level: ShiftLevel, chain: readonly Symbol[]): ShiftState {
  let state = session.init(level)
  while (!state.done) {
    const target = state.at
    for (const symbol of chain) {
      if (state.done || state.at !== target) break
      const op = opOf(symbol, state)
      if (op !== null) state = session.reduce(state, { t: 'op', op })
    }
    // A target that the chain did not reach cannot be left, so the run ends here, unfinished and graded as it stands.
    if (!state.done && state.at === target) break
  }
  return state
}

const fewestProbe: BlindProbe = (session, seeds = FEWEST_SEEDS) => {
  const play = typed<ShiftLevel, ShiftState, ShiftAction>(session)
  const banded = bandedSeeds(session, 'fewest', seeds, FIRST_SEED)
  const passes = CHAINS.map(() => 0)
  for (const seed of banded) {
    const level = play.level('fewest', seed)
    const ghost = play.ghost(level)
    CHAINS.forEach((chain, i) => {
      if (play.grade(playChain(play, level, chain), ghost).ok) passes[i]++
    })
  }
  return CHAINS.map((chain, i) => rowOf(`chain-${chain.join('-')}`, chain.map((s) => WORDS[s]).join(', then '), passes[i], banded.length))
}

const BLOCKS = [1, 2, 4, 8, 16, 32] as const

/** One BLOCK for each dimension, and a launch, on every tensor. */
function playBlocks(session: ReturnType<typeof typed<ShiftLevel, ShiftState, ShiftAction>>, level: ShiftLevel, blocks: readonly number[]): ShiftState {
  let state = session.init(level)
  while (!state.done) {
    const target = state.at
    blocks.forEach((value, dim) => {
      state = session.reduce(state, { t: 'block', dim, value })
    })
    state = session.reduce(state, { t: 'launch' })
    // A refused launch leaves the tensor open, and the strategy has nothing else to try.
    if (state.at === target && !state.done) return state
  }
  return state
}

const gridProbe: BlindProbe = (session, seeds = GRID_SEEDS) => {
  const play = typed<ShiftLevel, ShiftState, ShiftAction>(session)
  const banded = bandedSeeds(session, 'grid', seeds, FIRST_SEED)
  const pairs = BLOCKS.flatMap((a) => BLOCKS.map((b) => [a, b] as const))
  const passes = pairs.map(() => 0)
  for (const seed of banded) {
    const level = play.level('grid', seed)
    const ghost = play.ghost(level)
    pairs.forEach((pair, i) => {
      if (play.grade(playBlocks(play, level, pair), ghost).ok) passes[i]++
    })
  }
  return pairs.map((pair, i) => rowOf(`block-${pair[0]}x${pair[1]}`, `BLOCK ${pair[0]} by ${pair[1]} on every tensor, the grid at cdiv`, passes[i], banded.length))
}

/** The probes of Tensor views' graded levels. */
export const SHIFT_BLIND: BlindProbes = { fewest: fewestProbe, grid: gridProbe }
