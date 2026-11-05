/**
 * Service's whole session (`loop`, GAMES.md §3): the front page's four levels ("First service", ./session.ts) and TR2's levels with
 * TR6's mask lane ("the full service", ./full/session.ts), as one session keyed by the level, which the registry loads and the replay
 * grader grades through. A full-service level, and a state of one, carries its stages, so every method after `level` knows whose
 * rules hold it.
 *
 * The front page imports ./session.ts and never this file, so the full service's rules (the step loop v1 and its cost cards) stay out
 * of its first paint (D-023).
 */
import type { AnySession } from '../types'
import { FULL_LEVEL_IDS } from './full/levels'
import { fullSession } from './full/session'
import { LEVEL_IDS } from './levels'
import { loopSession } from './session'

const FULL = fullSession as unknown as AnySession
const FIRST = loopSession as unknown as AnySession

/** Which session a level's id belongs to; a level of neither throws. */
function sessionOf(id: string): AnySession {
  if ((FULL_LEVEL_IDS as readonly string[]).includes(id)) return FULL
  if ((LEVEL_IDS as readonly string[]).includes(id)) return FIRST
  throw new RangeError(`Service has no level "${id}"`)
}

/** Whose rules hold a level or a state: the full service's carry their stages. */
const owner = (levelOrState: unknown): AnySession => ((levelOrState as { stages?: unknown }).stages !== undefined ? FULL : FIRST)

export const serviceSession: AnySession = {
  level: (id, seed) => sessionOf(id).level(id, seed),
  inBand: (id, seed) => sessionOf(id).inBand(id, seed),
  init: (level) => owner(level).init(level),
  ask: (state) => owner(state).ask(state),
  reduce: (state, action) => owner(state).reduce(state, action),
  view: (state) => owner(state).view(state),
  done: (state) => owner(state).done(state),
  score: (state) => owner(state).score(state),
  ghost: (level) => owner(level).ghost(level),
  grade: (mine, ghost) => owner(mine).grade(mine, ghost),
  debrief: (mine, ghost) => owner(mine).debrief(mine, ghost),
}
