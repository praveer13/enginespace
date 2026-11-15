/**
 * The Reach-In's blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/pool-levels.test.ts): what a learner who reads nothing of
 * the night passes of its three graded levels, `evict`, `adapters` and `manager`.
 *
 * A blind learner answers each ask by position in the list it is shown and by nothing else: the first ticket on offer, the last, or none to
 * hang; the first pans or the last to dump; the first ticket or the last to pull; the first kit, the last, or none to bring in. Three
 * answers to the first ask, two to the second and third, three to the fourth are thirty-six strategies, and the best of them is the best
 * of any that picks by position. Each plays a whole night, and the session's own grade judges it against the house: no ticket left
 * unserved, and the house's price over its own at the level's bar (GAMES.md §8, "Scoring and pass").
 *
 * A night is played by the engine's own loop (`playPolicy`, which the session's reducer applies one action at a time) and frozen into the
 * state the session grades. It is the same night in a fraction of the time that thirty-six replays through the reducer take, and
 * tests/play/games-blind.test.ts holds the two to the same grade and the same counts.
 */
import { bandedSeeds, rowOf, typed } from '../blind'
import type { BlindProbe, BlindProbes } from '../blind'
import { freeze, freshWork, playPolicy } from './engine'
import type { Policy } from './engine'
import type { PoolAction, PoolLevel, PoolState } from './types'

/**
 * Banded seeds of each graded level, counting up from `FIRST_SEED` [estimated]: the best strategy passes 3.3%, 3.3% and 1.3% of 150 of
 * them [measured 2026-11-09 at 6a791ac, with this task's files; the header of tests/play/pool-levels.test.ts has the same figures],
 * nowhere near the bound, so 150 is a check that the levels stay hard and not a margin.
 */
export const POOL_SEEDS = 150

/** Where the sample starts, clear of the first 400 seeds that the gate reads the band on, as tests/play/pool-levels.test.ts starts its own. */
export const FIRST_SEED = 1000

type Pick = 'first' | 'last'

const ascending = (pages: readonly number[]): number[] => pages.slice().sort((a, b) => a - b)

/** A strategy that looks at nothing but the lists: which end of each list it takes, or none where none is allowed. */
const strategy =
  (admit: Pick | 'none', evict: Pick, preempt: Pick, prefetch: Pick | 'none'): Policy =>
  (_work, ask): PoolAction => {
    switch (ask.kind) {
      case 'admit':
        return { t: 'admit', req: admit === 'none' ? null : admit === 'first' ? ask.candidates[0] : ask.candidates[ask.candidates.length - 1] }
      case 'evict':
        return { t: 'evict', pages: ascending(evict === 'first' ? ask.candidates.slice(0, ask.need) : ask.candidates.slice(ask.candidates.length - ask.need)) }
      case 'preempt':
        return { t: 'preempt', req: preempt === 'first' ? ask.candidates[0] : ask.candidates[ask.candidates.length - 1] }
      case 'prefetch':
        return { t: 'prefetch', adapter: prefetch === 'none' ? null : prefetch === 'first' ? ask.candidates[0] : ask.candidates[ask.candidates.length - 1] }
    }
  }

const WORDS = { first: 'the first', last: 'the last', none: 'none' } as const

interface Blind {
  readonly id: string
  readonly describe: string
  readonly policy: Policy
}

/** The thirty-six strategies, by the end of each list they take. */
export const BLIND_POLICIES: readonly Blind[] = (['first', 'last', 'none'] as const).flatMap((admit) =>
  (['first', 'last'] as const).flatMap((evict) =>
    (['first', 'last'] as const).flatMap((preempt) =>
      (['none', 'first', 'last'] as const).map((prefetch): Blind => ({
        id: `admit-${admit}-dump-${evict}-pull-${preempt}-kit-${prefetch}`,
        describe: `hang ${WORDS[admit]} ticket on offer, dump ${WORDS[evict]} pans, pull ${WORDS[preempt]} ticket, bring in ${prefetch === 'none' ? 'no kit' : `${WORDS[prefetch]} kit`}`,
        policy: strategy(admit, evict, preempt, prefetch),
      })),
    ),
  ),
)

/** A night under a strategy, frozen into the state the session grades. */
export const nightUnder = (level: PoolLevel, policy: Policy): PoolState => freeze(playPolicy(freshWork(level, true), policy))

/** A graded level: the thirty-six strategies, on banded seeds. */
function levelProbe(id: string): BlindProbe {
  return (session, seeds = POOL_SEEDS) => {
    const play = typed<PoolLevel, PoolState, PoolAction>(session)
    const banded = bandedSeeds(session, id, seeds, FIRST_SEED)
    const passes = new Map<string, number>()
    for (const seed of banded) {
      const level = play.level(id, seed)
      const ghost = play.ghost(level)
      for (const blind of BLIND_POLICIES) {
        if (play.grade(nightUnder(level, blind.policy), ghost).ok) passes.set(blind.id, (passes.get(blind.id) ?? 0) + 1)
      }
    }
    return BLIND_POLICIES.map((blind) => rowOf(blind.id, blind.describe, passes.get(blind.id) ?? 0, banded.length))
  }
}

/** The probes of The Reach-In's graded levels. */
export const POOL_BLIND: BlindProbes = { evict: levelProbe('evict'), adapters: levelProbe('adapters'), manager: levelProbe('manager') }
