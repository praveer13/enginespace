/**
 * Shared by The Tasting's tests (tests/play/verifier*.test.ts): runs of the session built from actions, the house's answers read off
 * a level, the wrong answers a learner might give, and a run as the pieces of the page receive it. Not a test: bun test collects only
 * *.test.ts.
 */
import { finishRun, startRun } from '@es/play'
import type { Seed } from '@es/sim/core'
import { canonicalJson } from '@es/sim/core'
import { excessPlates, keptPlates, sweepOfLevel, tokensOf, thousandths } from '@es/play/verifier/state'
import { buildLevel } from '@es/play/verifier/levels'
import { verifierAsk, verifierGhost, verifierInit, verifierReduce, verifierSession } from '@es/play/verifier/session'
import type { VerifierAction, VerifierLevel, VerifierLevelId, VerifierState } from '@es/play/verifier/types'
import type { VerifierOutcome, VerifierRun } from '@/games/verifier/types'


/** The state after `actions`, from a level's first state. */
export const stateAfter = (level: VerifierLevel, ...actions: VerifierAction[]): VerifierState => actions.reduce(verifierReduce, verifierInit(level))

/** The level `id` on `seed`, and the state after `actions`. */
export const runOf = (id: VerifierLevelId, seed: Seed, ...actions: VerifierAction[]): VerifierState => stateAfter(buildLevel(id, seed), ...actions)

/** Sculpts the recipe from where it is to `target`. */
export function sculpt(state: VerifierState, target: readonly number[]): VerifierState {
  return target.reduce<VerifierState>((s, want, token) => (want === s.weights[token] ? s : verifierReduce(s, { t: 'sculpt', token, delta: want - s.weights[token] })), state)
}

/** The actions that give `target` as the recipe, from an empty one. */
export const sculptActions = (target: readonly number[]): VerifierAction[] =>
  target.flatMap((want, token): VerifierAction[] => (want === 0 ? [] : [{ t: 'sculpt', token, delta: want }]))

/** The house's answer to a level, as the actions that give it. */
export function houseActions(level: VerifierLevel): VerifierAction[] {
  switch (level.id) {
    case 'overlap':
      return [{ t: 'commit', prediction: keptPlates(level) }, { t: 'submit' }]
    case 'exact':
      return [...sculptActions(excessPlates(level)), { t: 'submit' }]
    case 'chain':
      return [{ t: 'commit', prediction: thousandths(tokensOf(level)) }, { t: 'submit' }]
    case 'greedy-ngram': {
      const favourite = level.p[0].indexOf(Math.max(...level.p[0]))
      return [{ t: 'judge', kept: level.draft === favourite }, ...sculptActions(level.p[0].map((w, x) => (x === level.draft ? 0 : w))), { t: 'submit' }]
    }
    case 'mutants':
      return [...level.cards.map((bug, card): VerifierAction => ({ t: 'label', card, bug })), { t: 'submit' }]
    case 'gamma':
      return [{ t: 'gamma', k: sweepOfLevel(level).best }, { t: 'submit' }]
  }
}

/** The levels a test walks, each on its practice seed. */
export const PRACTICE: readonly (readonly [VerifierLevelId, Seed])[] = [
  ['overlap', 0],
  ['exact', 0],
  ['chain', 1],
  ['greedy-ngram', 0],
  ['mutants', 0],
  ['gamma', 0],
]

/** A run as the pieces of The Tasting's page receive it (GameShell's `RunApi`), for a state, with every action a no-op: for server-rendering the page. */
export function fakeRun(state: VerifierState, over: Partial<VerifierRun> = {}): VerifierRun {
  const view = verifierSession.view(state)
  return {
    game: 'verifier',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view,
    score: view.counters,
    ask: verifierAsk(state),
    done: view.done,
    turns: 0,
    canUndo: false,
    dispatch: () => undefined,
    undo: () => undefined,
    announce: () => undefined,
    setAutoplay: () => undefined,
    mirrorId: 'mirror',
    phase: 'play',
    restart: () => undefined,
    goTo: () => undefined,
    ...over,
  }
}

/** A finished run as the shell hands it to the debrief: the grade, the debrief and the reference's view. */
export function outcomeOf(state: VerifierState): VerifierOutcome {
  const level = state.level
  const start = startRun(verifierSession, { game: 'verifier', level: level.id, seed: level.seed })
  // The state is reached by hand, so the run's own record is empty; the finish only needs the state and the level.
  const finished = finishRun(verifierSession, { ...start, state })
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: verifierSession.view(finished.ghost) }
}

/** The house's finished run on a level. */
export const houseRun = (id: VerifierLevelId, seed: Seed): VerifierState => verifierGhost(buildLevel(id, seed))

/** A state's canonical JSON: what the action log's hash is made of. */
export const textOf = (state: VerifierState): string => canonicalJson(state)
