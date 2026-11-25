/**
 * Trace attribution's blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/gap-hunt-levels.test.ts): what a learner who reads
 * nothing of the trace passes of its two graded levels, `gap` and `attribute`.
 *
 * A blind learner answers by position and by habit. On `gap` that is a place (the first gap of the step, or the last) and a cause chosen by
 * one habit for every case: the call that launched the work, the widest span of the main thread (in the step, or before the launch), the
 * first blocking call, the engine's longest schedule or prepare frame, or the last span before the gap. On `attribute` it is one category
 * for the whole step, or a split of the step into GPU-busy and not (no copy-only, no both idle), with the same cause habits. Each strategy
 * is played through the session's own reducer and graded by its own grade, so a pass is a fact: three steps in a row.
 *
 * The habits are given the places they pick from the model's own gaps, which a blind learner would see drawn: that is an upper bound on a
 * habit's rate, as the bound's other probes are. What no probe here does is read the cause, the one thing the level teaches.
 */
import { attributeSteps, causeKind, findCause, spanCount, spanView } from '@es/sim/trace'
import type { EsTrace, Mark } from '@es/sim/trace'
import { bandedSeeds, rowOf, typed } from '../blind'
import type { BlindProbe, BlindProbes } from '../blind'
import { caseOf } from './engine'
import type { CaseData } from './engine'
import type { HuntAction, HuntLevel, HuntState } from './types'

/** Where the sample starts, clear of the first 400 seeds that the gate reads the band on. */
export const FIRST_SEED = 1000

/** Banded seeds of each graded level [estimated]: a check that the levels stay hard, and not a margin. */
export const GAP_SEEDS = 100
export const ATTRIBUTE_SEEDS = 100

type Place = 'first' | 'last'
export const PLACES: readonly Place[] = ['first', 'last']

export const CAUSE_HABITS = ['launch-call', 'widest-span', 'widest-before-launch', 'blocking-call', 'host-frame', 'span-before-gap'] as const
export type CauseHabit = (typeof CAUSE_HABITS)[number]

const HABIT_WORDS: Readonly<Record<CauseHabit, string>> = {
  'launch-call': 'the call that launched the work that ended the gap',
  'widest-span': 'the widest span of the main thread in the step',
  'widest-before-launch': 'the widest span of the main thread before the launch',
  'blocking-call': 'the first blocking call near the gap',
  'host-frame': "the engine's longest schedule or prepare frame",
  'span-before-gap': 'the last span of the main thread that ends before the gap',
}

interface Gap {
  readonly fromNs: number
  readonly toNs: number
}

const isMain = (kind: string): boolean => kind === 'cpu-thread' || kind === 'cuda-api'

/** The gaps of a case's step, in time order. */
const gapsOf = (c: CaseData): readonly Gap[] => attributeSteps(c.hunt.trace)[c.hunt.step].gaps

/** The main-thread span a habit names for `gap`, or null when the habit finds none (then the case is not answered, and fails). */
export function habitCause(t: EsTrace, c: CaseData, gap: Gap, habit: CauseHabit): number | null {
  const lead = findCause(t, gap)
  const until = lead === null ? gap.toNs : lead.leadInToNs
  let best: number | null = null
  let bestKey = -Infinity
  const take = (i: number, key: number): void => {
    if (key > bestKey) {
      best = i
      bestKey = key
    }
  }
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (!isMain(v.kind)) continue
    const inStep = v.startNs < c.toNs && v.endNs > c.fromNs
    switch (habit) {
      case 'launch-call':
        if (v.kind === 'cuda-api' && v.startNs === until && v.durNs > 0) take(i, v.durNs)
        break
      case 'widest-span':
        if (inStep) take(i, v.durNs)
        break
      case 'widest-before-launch':
        if (v.startNs < until && v.endNs > gap.fromNs) take(i, v.durNs)
        break
      case 'blocking-call':
        if (v.kind === 'cuda-api' && inStep && causeKind(t, i) === 'sync') take(i, -Math.abs(v.startNs - gap.fromNs))
        break
      case 'host-frame':
        if (inStep && causeKind(t, i) === 'host') take(i, v.durNs)
        break
      case 'span-before-gap':
        if (inStep && v.endNs <= gap.fromNs) take(i, v.endNs)
        break
    }
  }
  return best
}

type Play = ReturnType<typeof typed<HuntLevel, HuntState, HuntAction>>

/** Plays `answer` on every case of `level`, as far as it can be played: a case it cannot answer ends the run, unfinished. */
function playAll(play: Play, level: HuntLevel, answer: (c: CaseData) => { marks: Mark[]; cause: number | null }): HuntState {
  let state = play.init(level)
  while (!state.done) {
    const i = state.at
    const { marks, cause } = answer(caseOf(level, i))
    try {
      state = play.reduce(state, { t: 'commit', prediction: 0 })
      for (const m of marks) state = play.reduce(state, { t: 'mark', from: m.fromNs, to: m.toNs, category: m.category })
      state = play.reduce(state, { t: 'cause', event: cause })
      state = play.reduce(state, { t: 'submit' })
    } catch {
      return state
    }
  }
  return state
}

const gapProbe: BlindProbe = (session, seeds = GAP_SEEDS) => {
  const play = typed<HuntLevel, HuntState, HuntAction>(session)
  const banded = bandedSeeds(session, 'gap', seeds, FIRST_SEED)
  const strategies = PLACES.flatMap((place) => CAUSE_HABITS.map((habit) => ({ place, habit })))
  const passes = strategies.map(() => 0)
  for (const seed of banded) {
    const level = play.level('gap', seed)
    const ghost = play.ghost(level)
    strategies.forEach(({ place, habit }, k) => {
      const state = playAll(play, level, (c) => {
        const gaps = gapsOf(c)
        const gap = place === 'first' ? gaps[0] : gaps[gaps.length - 1]
        return { marks: [{ fromNs: gap.fromNs, toNs: gap.toNs, category: 'cpu-gap' }], cause: habitCause(c.hunt.trace, c, gap, habit) }
      })
      if (play.grade(state, ghost).ok) passes[k]++
    })
  }
  return strategies.map(({ place, habit }, k) => rowOf(`${place}-gap-${habit}`, `the ${place} gap of every step, and ${HABIT_WORDS[habit]} as its cause`, passes[k], banded.length))
}

/** One category for the whole step, or a split of the step into GPU-busy (kernel) and not (CPU gap), from the model's own edges. */
const SPLITS = ['all-kernel', 'all-copy', 'all-cpu-gap', 'all-both-idle', 'busy-or-not'] as const
type Split = (typeof SPLITS)[number]

const SPLIT_WORDS: Readonly<Record<Split, string>> = {
  'all-kernel': 'the whole step as kernel',
  'all-copy': 'the whole step as copy-only',
  'all-cpu-gap': 'the whole step as the CPU gap',
  'all-both-idle': 'the whole step as both idle',
  'busy-or-not': 'GPU-busy time as kernel and everything else as the CPU gap',
}

function splitMarks(c: CaseData, split: Split): Mark[] {
  if (split === 'busy-or-not') {
    return c.split.marks.map((m) => ({ fromNs: m.fromNs, toNs: m.toNs, category: m.category === 'kernel' || m.category === 'copy' ? 'kernel' : 'cpu-gap' }))
  }
  return [{ fromNs: c.fromNs, toNs: c.toNs, category: split === 'all-kernel' ? 'kernel' : split === 'all-copy' ? 'copy' : split === 'all-cpu-gap' ? 'cpu-gap' : 'both-idle' }]
}

const attributeProbe: BlindProbe = (session, seeds = ATTRIBUTE_SEEDS) => {
  const play = typed<HuntLevel, HuntState, HuntAction>(session)
  const banded = bandedSeeds(session, 'attribute', seeds, FIRST_SEED)
  const strategies = SPLITS.flatMap((split) => CAUSE_HABITS.map((habit) => ({ split, habit })))
  const passes = strategies.map(() => 0)
  for (const seed of banded) {
    const level = play.level('attribute', seed)
    const ghost = play.ghost(level)
    strategies.forEach(({ split, habit }, k) => {
      const state = playAll(play, level, (c) => {
        const gaps = gapsOf(c)
        const widest = gaps.reduce((a, g) => (g.toNs - g.fromNs > a.toNs - a.fromNs ? g : a), gaps[0])
        return { marks: splitMarks(c, split), cause: habitCause(c.hunt.trace, c, widest, habit) }
      })
      if (play.grade(state, ghost).ok) passes[k]++
    })
  }
  return strategies.map(({ split, habit }, k) => rowOf(`${split}-${habit}`, `${SPLIT_WORDS[split]}, and ${HABIT_WORDS[habit]} as the largest gap's cause`, passes[k], banded.length))
}

/** The probes of Trace attribution's graded levels. */
export const HUNT_BLIND: BlindProbes = { gap: gapProbe, attribute: attributeProbe }
