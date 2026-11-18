/*
 * The graded `map` of Request path as markup (GAMES.md §5; ASSESSMENT §4.3; REDESIGN §3.6; W1-T19, R-T29): what the frame, the dock, the
 * swimlane, the table and the result put on the page, rendered on the server. The keyboard walk, the live region as it speaks and the trace
 * viewer drawn are walked in a browser by e2e/engine-floor-map.spec.ts.
 *
 * The things this file holds the page to:
 *   - the level that can be graded offers a graded run in the foot strip, and says before the run its pass rule, that it has one run and no
 *     undo, and that it has no live readout; a level that cannot be graded has no such offer;
 *   - the card names the engine, the stage list holds the engine's whole vocabulary, and the page keeps the path's length and its columns to
 *     itself until the one run has been judged: a column appears when the route first reaches it;
 *   - after the run nothing can be edited, the stage list says why it is closed, and the result reads the path against the trace;
 *   - a graded run's way on is another fresh scenario, and a practice run's is the same level again or a graded run.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { finishRun, startRun } from '@es/play'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import { MAP_LEVEL, buildLevel } from '@es/play/engine-floor/levels'
import { floorGhost, floorReduce, floorSession, floorView } from '@es/play/engine-floor/session'
import { stagesOf } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevel, FloorState } from '@es/play/engine-floor/types'
import { changeLine } from '@/games/engine-floor/announce'
import { Controls, ReadoutStrip } from '@/games/engine-floor/Controls'
import { Debrief } from '@/games/engine-floor/Debrief'
import Game from '@/games/engine-floor/Game'
import { Mirror } from '@/games/engine-floor/Mirror'
import type { FloorOutcome } from '@/games/engine-floor/types'
import { Swimlane } from '@/games/engine-floor/View2D'
import { seeds } from '../seeds'
import { fakeRun, truthOf, walk } from './engine-floor-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/engine-floor' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0

/** A map level whose engine is vLLM, so that the text the tests look for is known: the first seed from 0 that draws it. */
const SEED = seeds(0).find((seed) => buildLevel(MAP_LEVEL, seed).scenario.engine === 'vllm' && buildLevel(MAP_LEVEL, seed).scenario.tp === 1) as number
const level: FloorLevel = buildLevel(MAP_LEVEL, SEED)
const ids = level.reference

const committed = (laid: readonly string[] = []): FloorState => walk(level, { t: 'commit', prediction: truthOf(level.scenario) }, ...laid.map((stage): FloorAction => ({ t: 'lay', stage })))
const ran = (laid: readonly string[]): FloorState => floorReduce(committed(laid), { t: 'run' })
const graded = (state: FloorState) => fakeRun(state, { mode: 'graded', seed: level.seed })

/** A finished run as the frame hands it to the result. */
function outcomeOf(state: FloorState): FloorOutcome {
  let run = startRun(floorSession, { game: 'engine-floor', level: MAP_LEVEL, seed: level.seed })
  run = { ...run, state }
  const finished = finishRun(floorSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: floorView(finished.ghost) }
}

const result = (state: FloorState, mode: 'graded' | 'practice' = 'graded') =>
  render(h(Debrief, { run: fakeRun(state, { mode, seed: level.seed }), outcome: outcomeOf(state), next: null, onNext: () => undefined, onGraded: () => undefined }))

describe('the level that can be graded says so, and what a graded run is, before the run', () => {
  test('in practice the foot strip offers a graded run on a fresh scenario; a level that cannot be graded offers none', () => {
    const markup = render(h(Game, { level: 'map' }))
    expect(markup).toContain('data-floor-mode="practice"')
    expect(markup).toContain('Start a graded run')
    const nano = render(h(Game, { level: 'nano', mode: 'graded' }))
    expect(nano).not.toContain('Start a graded run')
    expect(nano).toContain('data-mode="practice"')
  })

  test('a graded run says so: one run, no undo, the way back to practice, and no Undo in the foot strip', () => {
    const markup = render(h(Game, { level: 'map', mode: 'graded' }))
    expect(markup).toContain('data-mode="graded"')
    expect(markup).toContain('Graded: a fresh scenario, one run, no undo.')
    expect(markup).toContain('Back to practice')
    expect(markup).not.toMatch(/>Undo</)
  })

  test('the pass rule stands in the goal line and in the dock before the run, with no undo and no live readout in a graded run', () => {
    const markup = render(h(Game, { level: 'map', mode: 'graded' }))
    expect(markup).toContain(FLOOR_COPY.map.passRule as string)
    const dock = render(h(Controls, { run: graded(committed(ids.slice(0, 3))) }))
    expect(dock).toContain('data-floor-graded-note="graded"')
    expect(dock).toContain('one run and no undo')
    expect(dock).toContain('It has no live readout')
    expect(dock).toContain('<strong>Pass rule:</strong>')
    const readout = render(h(ReadoutStrip, { view: floorView(committed(ids.slice(0, 3))), mode: 'graded' }))
    expect(readout).toContain('No live readout in a graded run')
    expect(readout).not.toContain('boundaries crossed')
  })
})

describe('before the run: the card names the engine, and the page keeps the path to itself', () => {
  test('the card names the engine, which the level\'s title does not', () => {
    expect(render(h(Controls, { run: graded(committed()) }))).toContain(ENGINE_NAMES[level.scenario.engine])
  })

  test('the stage list holds the engine\'s whole vocabulary and four others, once the prediction is in', () => {
    const markup = render(h(Controls, { run: graded(committed()) }))
    expect(count(markup, /data-stage="/g)).toBe(stagesOf(level.scenario.engine).length + 4)
  })

  test('the path says that the request goes once, and the table does not say how long the path is', () => {
    const state = committed(ids.slice(0, 3))
    expect(render(h(Controls, { run: graded(state) }))).toContain('One run: lay every stage you mean to before you run the path.')
    const mirror = render(h(Mirror, { run: graded(state) }))
    expect(mirror).not.toContain(`of the ${ids.length}`)
    expect(mirror).not.toContain(String(ids.length))
  })

  test('the swimlane builds with the route: the request\'s own column first, then each column as the route reaches it', () => {
    const empty = render(h(Swimlane, { view: floorView(committed()) }))
    expect(empty).toContain('data-columns="1"')
    expect(empty).toContain('data-sealed="true"')
    const view = floorView(committed(ids.slice(0, 4)))
    const reached = new Set([view.entry, ...view.laid.flatMap((stage) => [stage.from, stage.to])].map((place) => (place.device === 'gpu' ? 'gpu' : place.process)))
    const four = render(h(Swimlane, { view }))
    expect(count(four, /data-process="/g)).toBe(reached.size)
    const all = new Set(ids.flatMap((id) => stagesOf(level.scenario.engine).filter((stage) => stage.id === id)).flatMap((stage) => [stage.from, stage.to]).map((place) => (place.device === 'gpu' ? 'gpu' : place.process)))
    expect(reached.size).toBeLessThan(all.size)
  })
})

describe('after the run: nothing can be edited, and the stage list says why it is closed', () => {
  test('a run that stopped the request closes the list, and offers no way to take the path back', () => {
    const state = ran([ids[0], ids[2]])
    const markup = render(h(Controls, { run: graded(state) }))
    expect(markup).toContain('The run is over, and the stage list is closed.')
    expect(markup).not.toContain('Take the path back')
    expect(render(h(Swimlane, { view: floorView(state) }))).not.toContain('data-sealed')
  })

  test('a path that is home says so, in the words of a list with other requests\' stages in it', () => {
    expect(render(h(Controls, { run: graded(floorGhost(level)) }))).toContain('The stages left are not on this request’s path.')
  })

  test('the live line says that the level is over, whether the request stopped or the path ended short', () => {
    expect(changeLine(floorView(committed([ids[0], ids[2]])), floorView(ran([ids[0], ids[2]])))).toContain('The level is over.')
    expect(changeLine(floorView(committed(ids.slice(0, 3))), floorView(ran(ids.slice(0, 3))))).toContain('The level is over.')
  })
})

describe('the result of a graded run: passed or not, and the path read against the trace', () => {
  test('a path that is home passes, with every stage the trace\'s, and says what the level asks of fresh scenarios', () => {
    const markup = result(floorGhost(level))
    expect(markup).toContain('data-verdict="Passed"')
    expect(markup).toContain('data-floor-graded="passed"')
    expect(markup).toContain('The whole path was right on its one run')
    expect(markup).toContain('data-floor-tape="" data-whole="true"')
    expect(count(markup, /data-row-state="matched"/g)).toBe(ids.length)
    expect(markup).toContain('Your path against the trace')
    expect(markup).toContain('a bar that is an estimate')
  })

  test('a path that did not hold does not pass, and names the first stage that did not hold', () => {
    const markup = result(ran([ids[0], ids[2]]))
    expect(markup).toContain('data-verdict="Not yet"')
    expect(markup).toContain('data-floor-graded="missed"')
    expect(markup).toContain('data-floor-first-wrong=""')
    expect(markup).toContain('data-row-state="differs"')
  })

  test('the way on is another fresh scenario; there is no next level', () => {
    const markup = result(floorGhost(level))
    expect(markup).toContain('>Another fresh scenario<')
    expect(markup).not.toContain('Next level')
  })

  test('a practice run of the level says it earns nothing, and offers a graded run', () => {
    const markup = result(floorGhost(level), 'practice')
    expect(markup).toContain('data-floor-graded="practice"')
    expect(markup).toContain('it earns nothing')
    expect(markup).toContain('>Start a graded run<')
  })
})
