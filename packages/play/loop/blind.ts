/**
 * Service's blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/loop-close.test.ts): the habits of a learner who reads nothing of
 * `close`, TR2's graded level.
 *
 * `close` is closed-book: one night a seed, served once with a configuration chosen from the cards. A habit is one configuration for every
 * seed. The library sets the three levers that the level teaches (async scheduling on, the next call's ids from the device, MRV2) to the
 * house's values, which gives every habit the best of those three, and varies what a seed decides: the graph mode (five) and the molds on
 * the rack (twenty racks of the sizes a night is likely to need, none of them read from the seed). With "everything on", a mold at every
 * size the panel offers, that is 82 habits. Each is played through the session, the prediction, the levers, the rack and the bell, and
 * graded against the house's night by the session's own grade: no dependency violation, and useful tokens per GPU-ms at least 97% of the
 * house's (ASSESSMENT §4.3).
 */
import { bandedSeeds, playActions, rowOf, typed } from '../blind'
import type { BlindProbe, BlindProbes } from '../blind'
import type { FullAction, FullLevel, FullState } from './full/types'

/**
 * Banded seeds of `close` [estimated]. The best habit passes 11.8% of 1,000 of them [measured 2026-11-09 at 6a791ac, with this task's
 * files]: the habits that drill no molds, in the seeds where the reach-in has no room for one and async scheduling alone closes the
 * bubbles. That is 3.2 points under the bound, and 500 seeds put it 2.2 standard errors under [derived].
 */
export const CLOSE_SEEDS = 500

const MODES = ['NONE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'FULL', 'FULL_AND_PIECEWISE'] as const

/** The racks a habit drills: none, one mold, and pairs and triples of the sizes a night is likely to need [estimated], as tests/play/loop-close.test.ts has them. */
const RACKS: readonly (readonly number[])[] = [[], [6], [8], [12], [16], [6, 64], [8, 64], [8, 128], [12, 96], [12, 128], [16, 64], [16, 96], [16, 128], [16, 192], [16, 256], [12, 160], [8, 320], [6, 384], [12, 192], [16, 32, 128]]

interface Habit {
  readonly id: string
  readonly describe: string
  readonly mode: (typeof MODES)[number]
  /** The molds on the rack, or null for a mold at every size the panel offers. */
  readonly rack: readonly number[] | null
}

/** The library: every mode with every rack (a mode that drills nothing has no rack), and everything on. */
const HABITS: readonly Habit[] = [
  ...MODES.flatMap((mode) =>
    RACKS.filter((rack) => mode !== 'NONE' || rack.length === 0).map(
      (rack): Habit => ({
        id: `${mode}[${rack.join(',')}]`,
        describe: `async scheduling, the ids from the device and MRV2, graph mode ${mode}${rack.length === 0 ? ' with no molds' : ` with molds of ${rack.join(', ')}`}`,
        mode,
        rack,
      }),
    ),
  ),
  { id: 'everything-on', describe: 'every switch on: graph mode FULL_AND_PIECEWISE and a mold at every size the panel offers', mode: 'FULL_AND_PIECEWISE', rack: null },
]

/** The actions of a habit on a level, as a learner takes them: the prediction, the levers, the rack, and the bell that serves the night. */
function actionsOf(habit: Habit, level: FullLevel): FullAction[] {
  const ladder = level.stages[0].ladder ?? []
  return [
    { t: 'commit', prediction: 0 },
    { t: 'lever', name: 'async', value: true },
    { t: 'lever', name: 'inputIds', value: 'device' },
    { t: 'lever', name: 'runner', value: 'mrv2' },
    { t: 'lever', name: 'graphMode', value: habit.mode },
    { t: 'capture', sizes: habit.rack === null ? ladder : habit.rack.filter((size) => ladder.includes(size)) },
    { t: 'run', until: 'decision' },
  ]
}

/** `close`: the best constant configuration of the library, on banded seeds. */
export const closeProbe: BlindProbe = (session, seeds = CLOSE_SEEDS) => {
  const play = typed<FullLevel, FullState, FullAction>(session)
  const banded = bandedSeeds(session, 'close', seeds)
  const passes = new Map<string, number>()
  for (const seed of banded) {
    const level = play.level('close', seed)
    const ghost = play.ghost(level)
    for (const habit of HABITS) {
      if (play.grade(playActions(play, level, actionsOf(habit, level)), ghost).ok) passes.set(habit.id, (passes.get(habit.id) ?? 0) + 1)
    }
  }
  return HABITS.map((habit) => rowOf(habit.id, habit.describe, passes.get(habit.id) ?? 0, banded.length))
}

/** The probes of Service's graded levels. */
export const LOOP_BLIND: BlindProbes = { close: closeProbe }
