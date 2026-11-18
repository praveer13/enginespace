import type { KcState } from '@/progress/derive'

/*
 * Which knowledge components each of a module's outcome sentences rests on (REDESIGN section 3.3). A module page draws a tick beside an
 * outcome when every one of its components is passed (earned or kept), read from the learner's events each time the page draws: the
 * tick is derived and stored nowhere. An outcome with no component behind it (a lesson of reading that no question grades) has no tick
 * to gain, and the page does not pretend it has.
 *
 * The list for a module is in the order of the module's `outcomes` in `module.md`. tests/map/outcomes.test.ts holds each id to the
 * compiled map and each module's list to the length of its outcomes.
 */
export const OUTCOME_KCS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  tr1: [
    ['tr1.five-mechanisms', 'tr1.small-engine-anatomy', 'tr1.phases-vs-one-budget', 'tr1.vllm-lifecycle', 'tr1.sglang-lifecycle'],
    ['tr1.five-mechanisms'],
    ['tr1.read-at-the-pin'],
    ['tr1.request-states', 'tr1.abort-path'],
  ],
  tr2: [
    ['tr2.step-calls', 'tr2.one-budget', 'tr2.gpu-dependent-defaults', 'tr2.bubble', 'tr2.mrv2-delta'],
    ['tr2.async-overlap', 'tr2.graph-replay', 'tr2.capture-padding', 'tr2.graph-modes'],
    ['tr2.dispatch-keys', 'tr2.graph-memory'],
    [],
  ],
  tr5a: [
    ['tr5a.kv-groups', 'tr5a.sliding-free', 'tr5a.state-pages'],
    ['tr5a.page-size-unification'],
    ['tr5a.hit-intersection'],
    ['tr5a.adapter-pages', 'tr5a.slots-vs-pages', 'tr5a.all-or-nothing'],
  ],
  tr6: [
    ['tr6.verify-shape'],
    ['tr6.exact-acceptance', 'tr6.residual-recovery', 'tr6.exactness-testing'],
    ['tr6.proposer-families', 'tr6.acceptance-length'],
    ['tr6.mask-phases', 'tr6.mask-overlap'],
  ],
  tr8: [
    ['tr8.latency-from-due', 'tr8.open-vs-closed', 'tr8.client-queue'],
    ['tr8.warmup-rule', 'tr8.min-n-tail', 'tr8.bootstrap-p99'],
    ['tr8.tool-defaults'],
    ['tr8.time-shaped-replay', 'tr8.goodput-denominator', 'tr8.littles-law'],
  ],
}

/** True for the states that count as passed. */
const passed = (state: KcState | undefined): boolean => state === 'earned' || state === 'kept'

/** For each outcome of a module, whether its components are all passed. False for an outcome with none, and for every outcome before the ledger is read. */
export function outcomesPassed(module: string, count: number, states: ReadonlyMap<string, KcState>, ready: boolean): boolean[] {
  const rows = OUTCOME_KCS[module] ?? []
  return Array.from({ length: count }, (_, at) => {
    const kcs = rows[at] ?? []
    return ready && kcs.length > 0 && kcs.every((id) => passed(states.get(id)))
  })
}
