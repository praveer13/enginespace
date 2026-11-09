/*
 * W1-T19: the page of Back of House's graded `map` as markup (GAMES.md §5; ASSESSMENT §4.3; A§6.9, D-048): what the controls, the mirror, the
 * 2D view and the debrief put on the page, rendered on the server so that the structure a screen reader and a stylesheet get can be read.
 * What needs a DOM, a focus, a timer or the lazy trace viewer (the keyboard walk, the live region as it speaks, the tape drawn) is walked in a
 * browser by e2e/engine-floor-map.spec.ts.
 *
 * The things this file holds the page to:
 *   - the graded level says what mode it is in and offers the other, the levels are a row of plates, and a level that cannot be graded has no
 *     such offer;
 *   - the order names the engine, the tray holds the engine's whole vocabulary, and the page keeps the path's length and the plan of its house
 *     to itself until the one run has been judged;
 *   - after the run nothing can be edited, the tray says why it is closed, and the debrief reads the path against the tape: a row for each
 *     laid stage, the first that parted from it marked with a word and not a colour alone, and the viewer in the page;
 *   - a graded run's way on is another fresh scenario, and a practice run's is what it was.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { finishRun, startRun } from '@es/play'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import { MAP_LEVEL, buildLevel } from '@es/play/engine-floor/levels'
import { floorGhost, floorInit, floorReduce, floorSession, floorView } from '@es/play/engine-floor/session'
import { stagesOf } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevel, FloorState } from '@es/play/engine-floor/types'
import { changeLine } from '@/games/engine-floor/announce'
import { Controls } from '@/games/engine-floor/Controls'
import { Debrief } from '@/games/engine-floor/Debrief'
import Game from '@/games/engine-floor/Game'
import { GradedBar, LevelList } from '@/games/engine-floor/LevelRail'
import { Mirror } from '@/games/engine-floor/Mirror'
import { View2D } from '@/games/engine-floor/View2D'
import type { FloorOutcome } from '@/games/engine-floor/types'
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

/** A finished run as the shell hands it to the debrief. */
function outcomeOf(state: FloorState): FloorOutcome {
  let run = startRun(floorSession, { game: 'engine-floor', level: MAP_LEVEL, seed: level.seed })
  run = { ...run, state }
  const finished = finishRun(floorSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: floorView(finished.ghost) }
}

const debrief = (state: FloorState, over: { mode?: 'graded' | 'practice'; graded?: boolean; practice?: boolean; next?: boolean } = {}) =>
  render(
    h(Debrief, {
      run: fakeRun(state, { mode: over.mode ?? 'graded', seed: level.seed }),
      outcome: outcomeOf(state),
      next: over.next ? { id: 'x', title: 'Next' } : null,
      onNext: () => undefined,
      onGraded: over.graded === false ? null : () => undefined,
      onPractice: over.practice === false ? null : () => undefined,
    }),
  )

describe('the page opens the graded level in practice, and in a graded run when it is asked to', () => {
  test('in practice it names the level and its mode on a tape label, and offers a graded run on a fresh scenario of any of the five engines', () => {
    const markup = render(h(Game, { level: 'map' }))
    expect(markup).toContain('The lifecycle map · practice')
    expect(markup).toContain('data-mode="practice"')
    expect(markup).toContain('data-floor-mode="practice"')
    expect(markup).toContain('This level can be graded, on a fresh scenario of any of the five engines.')
    expect(markup).toContain('>Start a graded run</button>')
    expect(markup).toContain('>Undo</button>')
  })

  test('in a graded run it says so: a fresh scenario, no undo and one run, with the way back to practice, and no Undo plate', () => {
    const markup = render(h(Game, { level: 'map', mode: 'graded' }))
    expect(markup).toContain('The lifecycle map · graded')
    expect(markup).toContain('data-mode="graded"')
    expect(markup).toContain('data-floor-mode="graded"')
    expect(markup).toContain('A graded run: a fresh scenario, no undo and one run.')
    expect(markup).toContain('>Back to practice</button>')
    expect(markup).not.toContain('>Undo</button>')
    expect(markup).not.toContain('>Start a graded run</button>')
  })

  test('a level that cannot be graded has no graded bar, even when it is asked for graded: it opens in practice', () => {
    for (const id of ['nano', 'vllm', 'abort']) {
      const markup = render(h(Game, { level: id, mode: 'graded' }))
      expect(markup).toContain('· practice')
      expect(markup).not.toContain('· graded')
      expect(markup).not.toContain('data-floor-mode')
      expect(markup).not.toContain('Start a graded run')
    }
  })

  test('a graded run is on a fresh scenario each time: the pages draw their own, of every engine, and the order says which', () => {
    const engines = new Set<string>()
    const requests = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const markup = render(h(Game, { level: 'map', mode: 'graded' }))
      const order = /data-engine="([a-z-]+)" data-streaming="(true|false)" data-tp="([12])" data-abort="(true|false)" data-prefix-hit="(true|false)" data-n="([12])"/.exec(markup)
      expect(order).not.toBeNull()
      engines.add((order as RegExpExecArray)[1])
      requests.add((order as RegExpExecArray).slice(1).join())
    }
    expect(engines.size).toBeGreaterThanOrEqual(4)
    expect(requests.size).toBeGreaterThan(20)
  })
})

describe('the levels: a row of plates, the current one marked, the one that can be graded said so', () => {
  const markup = render(h(LevelList, { levels: ENGINE_FLOOR.levels, current: 'map', onLevel: () => undefined }))

  test('lists the eight levels in order, as a navigation with a name', () => {
    expect(markup).toContain('<nav aria-label="Levels of Back of House"')
    const titles = [...markup.matchAll(/<button[^>]*>([^<]*)(?:<span[^>]*>[^<]*<\/span>)?<\/button>/g)].map((m) => m[1])
    expect(titles).toEqual(ENGINE_FLOOR.levels.map((entry) => entry.title))
    expect(titles).toHaveLength(8)
  })

  test('marks the current level, and says in words for a screen reader that the last can be graded', () => {
    expect(count(markup, /aria-current="step"/g)).toBe(1)
    expect(markup).toMatch(/data-variant="ink"[^>]*aria-current="step">The lifecycle map<span class="sr-only"> \(can be graded\)<\/span>/)
    expect(count(markup, /can be graded/g)).toBe(1)
  })

  test('the graded bar is there for the level that can be graded and for no other', () => {
    const entry = (id: string) => ENGINE_FLOOR.levels.find((candidate) => candidate.id === id) as (typeof ENGINE_FLOOR.levels)[number]
    const bar = (id: string, mode: 'practice' | 'graded', done = false) => render(h(GradedBar, { entry: entry(id), mode, done, onGraded: () => undefined, onPractice: () => undefined }))
    expect(bar('nano', 'practice')).toBe('')
    expect(bar('map', 'practice')).toContain('Start a graded run')
    expect(bar('map', 'graded')).toContain('Back to practice')
    // A graded run that is over offers another, and not the way back mid-run.
    expect(bar('map', 'graded', true)).toContain('Start a graded run')
  })
})

describe('before the run: the order names the engine, and the page keeps the path to itself', () => {
  test('the order has an engine line beside the request\'s five, and the practice levels do not: their title is their engine', () => {
    const markup = render(h(Controls, { run: graded(floorInit(level)) }))
    expect(markup).toContain(`<span class="es-ticket-line__item">engine</span><span class="es-ticket-line__note">${ENGINE_NAMES[level.scenario.engine]}</span>`)
    expect(count(markup, /class="es-ticket-line"/g)).toBe(6)
    const practice = render(h(Controls, { run: fakeRun(floorInit(buildLevel('vllm', 0))) }))
    expect(practice).not.toContain('<span class="es-ticket-line__item">engine</span>')
    expect(count(practice, /class="es-ticket-line"/g)).toBe(5)
  })

  test('the tray holds the engine\'s whole vocabulary and four others, once the prediction is written: a card for each, one tab stop', () => {
    const markup = render(h(Controls, { run: graded(committed()) }))
    const vocabulary = stagesOf(level.scenario.engine).length
    expect(count(markup, /data-stage="/g)).toBe(vocabulary + 4)
    expect(markup).toContain(`data-count="${vocabulary + 4}"`)
    expect(markup).toContain('data-floor-prompt')
  })

  test('the path says that the ticket goes once, and the mirror does not say how long the path is', () => {
    const controls = render(h(Controls, { run: graded(committed(ids.slice(0, 3))) }))
    expect(controls).toContain('data-floor-once')
    expect(controls).toContain('One run. The ticket goes once')
    const mirror = render(h(Mirror, { run: graded(committed(ids.slice(0, 3))) }))
    expect(mirror).toContain('<span class="font-numeric">3</span> stages laid.')
    expect(mirror).not.toContain('in the engine&#x27;s path')
    // A practice level says it, as before.
    const practice = buildLevel('vllm', 0)
    expect(render(h(Mirror, { run: fakeRun(walk(practice, { t: 'commit', prediction: 2 }, { t: 'lay', stage: practice.reference[0] })) }))).toContain('in the engine&#x27;s path')
  })

  test('the drawing builds with the route: before a stage is laid it has the floor the request begins on and no more, and it says nothing of the engine\'s other floors', () => {
    const before = render(h(View2D, { run: graded(committed()) }))
    const engineCore = level.scenario.engine === 'vllm' ? 'ENGINE-CORE' : 'ENGINE-CORE'
    expect(before).toContain('data-floor-view')
    expect(before).not.toContain(engineCore)
    const after = render(h(View2D, { run: graded(ran(ids)) }))
    expect(after).toContain(engineCore)
  })
})

describe('after the run: nothing can be edited, and the tray says why it is closed', () => {
  test('a run that stopped the ticket closes the tray with the words of a level that is over, and offers no way to take the path back', () => {
    const wrong = ran([...ids.slice(0, 4), ids[5]])
    const markup = render(h(Controls, { run: graded(wrong) }))
    expect(markup).toContain('The run is over, and the tray is closed.')
    expect(markup).not.toContain('The ticket is home')
    expect(markup).toContain('data-floor-stop')
    expect(markup).not.toContain('Take the path back to where it stopped')
    expect(markup).not.toContain('data-floor-once')
    expect(markup).toMatch(/<button[^>]*class="es-stub__pull"[^>]*disabled=""[^>]*>.*Run the path/)
  })

  test('a path that held and stopped short is over too, and is not home', () => {
    const markup = render(h(Controls, { run: graded(ran(ids.slice(0, 6))) }))
    expect(markup).toContain('The run is over, and the tray is closed.')
    expect(markup).not.toContain('data-floor-stop')
  })

  test('a path that is home says so, in the words of a tray with other requests\' stages in it', () => {
    const markup = render(h(Controls, { run: graded(floorGhost(level)) }))
    expect(markup).toContain('The ticket is home. The stages left in the tray are not on this request’s path.')
  })

  test('the live line says that the level is over, whether the ticket stopped or the path ended short', () => {
    const before = (state: FloorState) => floorView(state)
    const wrong = [...ids.slice(0, 4), ids[5]]
    expect(changeLine(before(committed(wrong)), before(ran(wrong)))).toMatch(/^The ticket stopped at stage 5, after 4 stages that held\. .* The level is over\.$/)
    expect(changeLine(before(committed(ids.slice(0, 6))), before(ran(ids.slice(0, 6))))).toBe('Every stage held, and the path ends before the request is back where it began. The level is over.')
    expect(changeLine(before(committed(ids)), before(ran(ids)))).toBe('The ticket is home: every hand-off held, and the request is back where it began.')
  })
})

describe('the debrief of a graded run: passed or not, and the path read against the tape', () => {
  test('a path that is home is passed, with the whole path against the tape: a row for each stage, all the tape\'s, and no stage left over', () => {
    const markup = debrief(floorGhost(level))
    expect(markup).toContain('Every hand-off held.')
    expect(markup).toContain('data-floor-graded="passed"')
    expect(markup).toContain('<strong>Passed.</strong>')
    expect(markup).toContain('The whole path was right on its first run, and every stage matches a span of the tape, in order.')
    expect(markup).toContain('data-floor-tape="" data-whole="true"')
    expect(markup).toContain('your path is the tape’s, span for span')
    expect(count(markup, /data-row-state="matched"/g)).toBe(ids.length)
    expect(markup).not.toContain('data-row-state="differs"')
    expect(markup).not.toContain('data-row-state="unread"')
    expect(markup).not.toContain('data-tape-has')
    // A matched stage says it in words for a screen reader, beside its drawn tick, and prints nothing more.
    expect(count(markup, /<span class="sr-only">the tape’s stage<\/span>/g)).toBe(ids.length)
  })

  test('the table has the columns of the check: the stage, what was laid, its track, and where it starts and how long it lasts, in ns that are synthetic, said once in each head', () => {
    const markup = debrief(floorGhost(level))
    for (const head of ['Stage', 'You laid', 'On the track', 'Starts', 'Lasts']) expect(markup).toContain(`>${head}`)
    const table = markup.slice(markup.indexOf('data-floor-tape-table'), markup.indexOf('</table>'))
    // Counted in the check's own table: the viewer below it, when its chunk has already loaded in this process, says the same in its tables.
    expect(count(table, /ns, synthetic<\/span>/g)).toBe(2)
    // The figures are numerals of the printer, and the head carries their provenance, as the viewer's own tables do.
    expect(count(table, /<span class="font-numeric">[\d,]+<\/span>/g)).toBeGreaterThanOrEqual(3 * ids.length)
    expect(table).not.toContain('data-tag=')
    expect(table).toMatch(/engine-core · |main · |worker-1 · /)
  })

  test('says how many stages matched and how many the tape has, in Readouts that are derived; none is measured or estimated', () => {
    const markup = debrief(floorGhost(level))
    const counts = markup.slice(markup.indexOf('data-floor-tape-counts'), markup.indexOf('data-floor-tape-table'))
    expect(counts).toContain('Stages matched, in order: <span class="font-numeric">')
    expect(counts).toContain('Stage spans on the tape:')
    expect(count(counts, /data-tag="derived"/g)).toBe(2)
    // The verdict, the counts and the table: the part of the section that is this page's own, and not the viewer's.
    const tape = markup.slice(markup.indexOf('data-floor-tape'), markup.indexOf('</table>'))
    expect(tape).not.toContain('data-tag="measured"')
    expect(tape).not.toContain('data-tag="estimated"')
  })

  test('puts the trace viewer on the page: it is a lazy chunk, so the markup holds its place and says the tape is loading, or has the viewer once the chunk has loaded', () => {
    const markup = debrief(floorGhost(level))
    // Whether the chunk has loaded depends on what else this process has imported (a test file that imports the viewer statically loads it
    // for all), so the page may be either: the place with its words, or the viewer in it. Never neither.
    expect(markup).toMatch(/Loading the tape\.|<section[^>]* data-trace-view/)
    expect(markup).not.toContain('The tape could not be loaded')
  })

  test('a path that did not hold is not passed, names the first stage that did not hold, and marks it with a word and a drawn mark: the stages after it are not read', () => {
    const wrong = [...ids.slice(0, 4), ids[5], ...ids.slice(6)]
    const markup = debrief(ran(wrong))
    expect(markup).toContain('A hand-off broke.')
    expect(markup).toContain('data-floor-graded="missed"')
    expect(markup).toContain('<strong>Not passed.</strong>')
    expect(markup).toContain('The level asks for the whole path, right on its first run.')
    expect(markup).toContain('data-floor-first-wrong')
    expect(markup).toContain('data-whole="false"')
    expect(markup).toContain('Your path and the tape part at stage <span class="font-numeric">5</span>')
    expect(count(markup, /data-row-state="matched"/g)).toBe(4)
    expect(count(markup, /data-row-state="differs"/g)).toBe(1)
    expect(markup).toContain('not the tape’s stage')
    expect(markup).toContain('data-icon="strike"')
    expect(count(markup, /data-row-state="unread"/g)).toBe(wrong.length - 5)
    expect(markup).toContain('not read: an earlier stage parted from the tape')
    // Each row that is not the tape's says what the tape has at its place, and the row that parted has no span of its own.
    expect(count(markup, /data-tape-has/g)).toBe(wrong.length - 4)
    expect(markup).toContain('The tape has, at this place:')
    // A stage that was not read and is the tape's own at its place has nothing set beside it: swap two stages, and the rows after them agree with the tape.
    const swapped = [...ids.slice(0, 3), ids[4], ids[3], ...ids.slice(5)]
    const parted = debrief(ran(swapped))
    expect(count(parted, /data-row-state="differs"/g)).toBe(1)
    expect(count(parted, /data-row-state="unread"/g)).toBe(swapped.length - 4)
    expect(count(parted, /data-tape-has/g)).toBe(2)
    const row = markup.slice(markup.indexOf('data-row-state="differs"'), markup.indexOf('</tr>', markup.indexOf('data-row-state="differs"')))
    expect(row).toContain('no span')
  })

  test('a path that held and stopped short has its own title, and says the tape goes on', () => {
    const markup = debrief(ran(ids.slice(0, 6)))
    expect(markup).toContain('The path stopped short.')
    expect(markup).toContain('data-floor-graded="missed"')
    expect(markup).toContain('Every stage you laid is the tape’s, and the tape goes on: it has ')
    expect(markup).toContain('more stage spans after your last.')
    expect(markup).not.toContain('data-row-state="differs"')
  })

  test('the way on is another fresh scenario, on the stub and on a plate, with the way back to practice; there is no next level to be sent to', () => {
    const markup = debrief(floorGhost(level), { next: true })
    expect(markup).toContain('Another fresh scenario')
    expect(count(markup, /Another fresh scenario/g)).toBe(2)
    expect(markup).toContain('>Practice this level<')
    expect(markup).not.toContain('Play this level again')
    expect(markup).not.toContain('Shuffle the tray')
    expect(markup).not.toContain('Next level')
    expect(markup).not.toContain('Open the course map')
  })

  test('the level that asks for three scenarios says so in a Readout that is an estimate', () => {
    const markup = debrief(floorGhost(level))
    expect(markup).toMatch(/It asks that of <span class="es-readout"[^>]*><data class="es-readout__value" value="3">3<\/data><span class="es-readout__tag" data-tag="estimated">estimated<\/span><\/span> fresh scenarios, and each gets its own run\./)
  })
})

describe('the debrief of a practice run of the graded level', () => {
  test('says it is practice and earns nothing, offers the same level again, a new scenario and a graded run, and does not read the path as a pass', () => {
    const markup = debrief(floorGhost(level), { mode: 'practice' })
    expect(markup).toContain('data-floor-graded="practice"')
    expect(markup).toContain('<strong>Practice.</strong>')
    expect(markup).toContain('it earns nothing')
    expect(markup).not.toContain('Passed.')
    expect(markup).toContain('Play this level again')
    expect(markup).toContain('Try another scenario')
    expect(markup).not.toContain('Shuffle the tray')
    expect(markup).toContain('>Start a graded run<')
    // It is the last level: the stub is the course map, and the link is TR1.
    expect(markup).toContain('Open the course map')
    expect(markup).toContain('href="/m/tr1"')
    // The tape is read in practice too: the table, whole.
    expect(markup).toContain('data-floor-tape="" data-whole="true"')
  })

  test('the practice levels\' debriefs are what they were: no tape, no graded line, and Shuffle the tray', () => {
    const vllm = buildLevel('vllm', 0)
    const state = floorGhost(vllm)
    let run = startRun(floorSession, { game: 'engine-floor', level: 'vllm', seed: 0 })
    run = { ...run, state }
    const finished = finishRun(floorSession, run)
    if (finished === null) throw new Error('the state is not finished')
    const outcome: FloorOutcome = { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: floorView(finished.ghost) }
    const markup = render(h(Debrief, { run: fakeRun(state), outcome, next: { id: 'sglang', title: 'SGLang at the pin' }, onNext: () => undefined }))
    expect(markup).not.toContain('data-floor-tape')
    expect(markup).not.toContain('data-floor-graded')
    expect(markup).toContain('Shuffle the tray')
    expect(markup).toContain('Next level: <strong class="text-text-1">SGLang at the pin</strong>')
  })
})
