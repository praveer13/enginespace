/**
 * Back of House's blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/engine-floor-map.test.ts): what a learner who reads nothing
 * of the request passes of the graded `map`. Each is played through the session, the prediction, the stages laid from the tray and the one
 * run, and graded by the session's own grade: the whole path right on its first run, and every stage matched to a span of the trace in
 * order (ASSESSMENT §4.3).
 *
 *   tray           the tray laid as it stands, which holds every stage of the engine and four of other engines';
 *   by-place       from where the ticket stands, the first tile of the tray that starts there, which reads the places and never the engine;
 *   one-path       the path of the scenario that the seeds ask most often, laid every time (a constant path is right for the seeds that
 *                  draw its scenario and for no other);
 *   per-engine     told which engine's card it is, the path of that engine's most-asked scenario: the habit of a learner who reads only the
 *                  engine off the card.
 *
 * The two constants are chosen on the seeds they are played on, so each is an upper bound on a path fixed in advance.
 */
import { entryOf } from '@es/sim/lifecycle'
import { bandedSeeds, playActions, rowOf, typed } from '../blind'
import type { BlindProbe, BlindProbes } from '../blind'
import { stageIn } from './stages'
import type { FloorAction, FloorLevel, FloorState } from './types'
import { placeKey } from './words'

/**
 * Banded seeds of `map` [estimated]. The draw picks the engine first, one in five, and then one of the scenarios it can be asked, so one
 * constant for each engine is right on 14.2% of the seeds by construction [derived: 1/5 × (1/2 + 1/12 + 3/24), as GAMES.md §5 has it],
 * 0.8 points under the bound. It reads 14.7% of 20,000 [measured 2026-11-09 at 6a791ac, with this task's files], and 20,000 put the standard
 * error at 0.25 points [derived]: a smaller sample puts it near the margin.
 */
export const MAP_SEEDS = 20_000

/** The actions that lay `ids`, those the tray has and the path has not got, and run once. A path with none of them has nothing to run. */
function laying(level: FloorLevel, ids: readonly string[]): FloorAction[] {
  const laid = ids.filter((id, at) => level.tray.includes(id) && ids.indexOf(id) === at)
  return laid.length === 0 ? [] : [{ t: 'commit', prediction: 0 }, ...laid.map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }]
}

/** From where the ticket stands, the first tile of the tray that starts there, until no tile does: the places read and the engine never. */
function byPlace(level: FloorLevel): string[] {
  const sc = level.scenario
  const laid: string[] = []
  let at = entryOf(sc.engine)
  for (let guard = 0; guard < level.tray.length; guard++) {
    const next = level.tray.find((id) => {
      const stage = stageIn(sc, id)
      return stage !== undefined && !laid.includes(id) && placeKey(stage.from) === placeKey(at)
    })
    const stage = next === undefined ? undefined : stageIn(sc, next)
    if (next === undefined || stage === undefined) break
    laid.push(next)
    at = stage.to
  }
  return laid
}

/** `map`: the tray, the places, the most-asked path, and the most-asked path of each engine. */
export const mapProbe: BlindProbe = (session, seeds = MAP_SEEDS) => {
  const play = typed<FloorLevel, FloorState, FloorAction>(session)
  const banded = bandedSeeds(session, 'map', seeds)
  const levels = banded.map((seed) => play.level('map', seed))
  const ghosts = levels.map((level) => play.ghost(level))

  // A scenario's path is its own: the seeds that draw it are the seeds a constant of that path can pass.
  const asked = new Map<string, number>()
  const byEngine = new Map<string, Map<string, number>>()
  for (const level of levels) {
    const path = level.reference.join('>')
    asked.set(path, (asked.get(path) ?? 0) + 1)
    const engine = byEngine.get(level.scenario.engine) ?? new Map<string, number>()
    engine.set(path, (engine.get(path) ?? 0) + 1)
    byEngine.set(level.scenario.engine, engine)
  }
  // The first path to reach the most seeds, in the order the seeds met them.
  const mostAsked = (counts: ReadonlyMap<string, number>): string[] => {
    let best = ''
    let most = 0
    for (const [path, count] of counts) {
      if (count > most) {
        most = count
        best = path
      }
    }
    return best === '' ? [] : best.split('>')
  }
  const one = mostAsked(asked)
  const engines = new Map([...byEngine].map(([engine, counts]) => [engine, mostAsked(counts)]))

  const passes = (path: (level: FloorLevel) => readonly string[]): number => {
    let passed = 0
    levels.forEach((level, at) => {
      const actions = laying(level, path(level))
      if (actions.length > 0 && play.grade(playActions(play, level, actions), ghosts[at]).ok) passed += 1
    })
    return passed
  }
  return [
    rowOf('tray', 'the tray laid as it stands', passes((level) => level.tray), levels.length),
    rowOf('by-place', 'from where the ticket stands, the first tile of the tray that starts there', passes(byPlace), levels.length),
    rowOf('one-path', 'the path of the scenario that the seeds ask most often, laid every time', passes(() => one), levels.length),
    rowOf('per-engine', `told which engine's card it is, the path of that engine's most-asked scenario`, passes((level) => engines.get(level.scenario.engine) ?? []), levels.length),
  ]
}

/** The probes of Back of House's graded level. */
export const ENGINE_FLOOR_BLIND: BlindProbes = { map: mapProbe }
