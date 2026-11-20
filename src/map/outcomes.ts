import type { KcState } from '@/progress/derive'

/*
 * A module page draws a tick beside an outcome when every knowledge component it rests on is passed (earned or kept), read from the
 * learner's events each time the page draws: the tick is derived and stored nowhere. Which components an outcome rests on is the module's
 * own: `outcome_kcs` in its `module.md`, one list for each outcome in the order of `outcomes`, which the compiler checks against the
 * KC graph. An outcome with no component behind it (a lesson of reading that no question grades) has an empty list, no tick to gain,
 * and the page does not pretend it has.
 */

/** True for the states that count as passed. */
const passed = (state: KcState | undefined): boolean => state === 'earned' || state === 'kept'

/** For each outcome of a module, whether its components are all passed. False for an outcome with none, and for every outcome before the ledger is read. */
export function outcomesPassed(rows: readonly (readonly string[])[], count: number, states: ReadonlyMap<string, KcState>, ready: boolean): boolean[] {
  return Array.from({ length: count }, (_, at) => {
    const kcs = rows[at] ?? []
    return ready && kcs.length > 0 && kcs.every((id) => passed(states.get(id)))
  })
}
