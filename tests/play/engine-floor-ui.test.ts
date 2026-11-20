/*
 * Request path's page as markup (REDESIGN §2.6, §3.5, §3.6; R-T29): the frame, the swimlane, the dock, the table and the result, rendered on
 * the server so that the structure a screen reader and a stylesheet get can be read. What needs a DOM, a focus or a timer (the roving
 * tabindex as it moves, the popovers, the live region as it speaks, the scroll that keeps "now" in view) is walked in a browser by
 * e2e/engine-floor.spec.ts.
 *
 * The things this file holds the page to:
 *   - the instrument frame: the title and role line, the level menu as one control, the goal line, the diagram, its legend and the dock;
 *   - before the prediction no column and no tile, the prediction required with a line that says why there is no skip, and held back while
 *     the intro names the parts;
 *   - the stage list: a tile per stage with its mechanism's mark and word, its name as code and where it runs, a chip per process, typed text;
 *   - the swimlane: a row per laid stage, a stopped row marked with a red triangle and the word, and the dock's stop note with the rule and
 *     the mechanism laid there;
 *   - what the game gives the frame (the five exports): the parts, the moments, the first move, the dock view and the first ask;
 *   - the result: the first stage that did not hold, the prediction on one number line, and two engines' paths with their differences marked;
 *   - no banned word in anything the page renders.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { finishRun, startRun } from '@es/play'
import { FLOOR_COPY, FLOOR_MOMENTS, floorPartsOf, partClaim } from '@es/play/engine-floor/copy'
import { floorGhost, floorSession, floorView } from '@es/play/engine-floor/session'
import type { FloorAction, FloorLevelId, FloorState } from '@es/play/engine-floor/types'
import { findBanned } from '@/copy/banned'
import { introAct, introSteps } from '@/games/kit/first-move'
import { changeLine } from '@/games/engine-floor/announce'
import { Controls, ReadoutStrip } from '@/games/engine-floor/Controls'
import { Debrief } from '@/games/engine-floor/Debrief'
import { DockView } from '@/games/engine-floor/DockView'
import Game from '@/games/engine-floor/Game'
import { floorKit, floorStep, partRows } from '@/games/engine-floor/kit'
import { Mirror } from '@/games/engine-floor/Mirror'
import { handoffWords, permalink, plain, readoutOf, splitCode } from '@/games/engine-floor/text'
import type { FloorOutcome } from '@/games/engine-floor/types'
import { bandEmpty, heldHeight, matches, platformsOf, roomInSight } from '@/games/engine-floor/useFloorControls'
import { FloorLegend, StageFacts, Swimlane } from '@/games/engine-floor/View2D'
import { fakeRun, laidTo, levelOf, ranTo, truthOf, walk } from './engine-floor-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/engine-floor' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const text = (markup: string) => markup.replace(/<code[^>]*>[\s\S]*?<\/code>/g, ' ').replace(/<[^>]+>/g, ' ')
const vllm = levelOf('vllm')
const nano = levelOf('nano')
const LEVELS: readonly FloorLevelId[] = ['nano', 'nano-tp', 'mini', 'inside', 'vllm', 'sglang', 'abort', 'map']
const lay = (stage: string): FloorAction => ({ t: 'lay', stage })

/** A finished run as the frame hands it to the result: the grade, the debrief and the reference's view. */
function outcomeOf(state: FloorState): FloorOutcome {
  let run = startRun(floorSession, { game: 'engine-floor', level: state.level.id, seed: state.level.seed })
  run = { ...run, state }
  const finished = finishRun(floorSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: floorView(finished.ghost) }
}

/** A path with a stage that does not hold, run, then fixed and finished: a run whose first mistake the result names. */
function mistaken(level = vllm): FloorState {
  return walk(level, { t: 'commit', prediction: 3 }, ...level.reference.slice(0, 4).map(lay), lay(level.reference[5]), { t: 'run' }, { t: 'unlay', to: 4 }, ...level.reference.slice(4).map(lay), { t: 'run' })
}

const stopped = walk(vllm, { t: 'commit', prediction: 2 }, lay(vllm.reference[0]), lay('vllm.h2d'), { t: 'run' })
const dock = (state: FloorState, over: Parameters<typeof fakeRun>[1] = {}) => render(h(Controls, { run: fakeRun(state, over) }))
const result = (state: FloorState, next: { id: string; title: string } | null = { id: 'nano-tp', title: 'nano-vllm on two GPUs' }) =>
  render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next, onNext: () => undefined }))

describe('the page is the instrument frame', () => {
  test('the title and its role line, one level menu over the eight levels, and the goal line in its four parts', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('data-game="engine-floor"')
    expect(markup).toContain('>Request path</h2>')
    expect(markup).toContain('You trace one request.')
    expect(count(markup, /<option /g)).toBe(8)
    expect(markup).toContain(FLOOR_COPY.nano.goal.aim)
    expect(markup).toContain('Ends when the request reaches the client.')
    expect(markup).toContain('data-floor-lanes=""')
    expect(markup).toContain('data-floor-legend=""')
    expect(markup).toContain('data-floor-controls=""')
    expect(markup).toContain('data-floor-readout=""')
    expect(markup).toContain('State as a table')
    // The swimlane is the view, and the game has no 3D switch (R-T43 removed its scene).
    expect(markup).toContain('data-surface="2d"')
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'abort' }))).toContain('data-level="abort"')
    expect(render(h(Game, { level: 'map' }))).toContain('data-level="map"')
    expect(render(h(Game, { level: 'constructor' }))).toContain('data-level="nano"')
  })
})

describe('before the prediction', () => {
  test('no column and no tile: only the request at the top left, and a closed stage list that says when it opens', () => {
    const markup = dock(walk(vllm))
    expect(markup).toContain('The stage list opens when the prediction is in.')
    expect(markup).not.toContain('data-stage=')
    const lanes = render(h(Swimlane, { view: floorView(walk(vllm)) }))
    expect(lanes).toContain('data-columns="0"')
    expect(lanes).toContain('data-lane-start=""')
    expect(lanes).not.toContain('data-lane-row=')
  })

  test('the prediction is the session\'s commit: a number from none to five, Commit, no skip, and a line that says why', () => {
    const markup = dock(walk(vllm))
    expect(markup).toContain('How many process boundaries does a sampled token cross on its way to the client?')
    for (const n of [0, 1, 2, 3, 4, 5]) expect(markup).toContain(`aria-label="${n} ${n === 1 ? 'boundary' : 'boundaries'}"`)
    expect(markup).toContain('Commit the prediction')
    expect(markup).not.toContain('Skip the guess')
    expect(markup).toContain('data-floor-no-skip=""')
    expect(markup).toContain('No skip here: the level needs your prediction before the first stage')
  })

  test('while the intro names the parts the prediction waits: name first, then ask (P4)', () => {
    const markup = dock(walk(vllm), { intro: { askShown: false, ring: null } })
    expect(markup).not.toContain('Commit the prediction')
    expect(markup).toContain('The prediction comes after the parts')
  })

  test('the scenario card names the engine and the pin, and the level\'s note waits for the prediction, since it would answer it', () => {
    expect(dock(walk(vllm))).not.toContain('data-floor-prompt')
    const after = dock(laidTo(vllm, 0))
    expect(after).toContain('data-floor-prompt=""')
    expect(after).toContain('vLLM at the pin')
    expect(after).toContain('vllm-project/vllm')
  })
})

describe('the stage list', () => {
  test('a tile per stage, laid by a press: its mechanism\'s mark and word, its name as code and where it runs; one tab stop', () => {
    const state = laidTo(vllm, 0)
    const markup = dock(state)
    const view = floorView(state)
    expect(count(markup, /data-stage="/g)).toBe(view.tray.length)
    expect(count(markup, /class="es-floor-tile" tabindex="0"/g)).toBe(1)
    expect(markup).toContain('aria-label="Lay queue: input_queue. From engine-core · input-thread to engine-core · main."')
    expect(markup).toMatch(/data-handoff="queue"[^>]*>.*?<span class="es-floor-tile__mech">queue<\/span><code class="es-floor-tile__name">input_queue<\/code>/)
    expect(markup).toContain('engine-core · input-thread → engine-core · main')
  })

  test('a chip for each process the stages start in, the request\'s own marked here, and a field that filters by typed words', () => {
    const view = floorView(laidTo(vllm, 0))
    const platforms = platformsOf(view.tray, view.present)
    expect(platforms.find((platform) => platform.here)?.key).toBe('client')
    expect(platforms.map((platform) => platform.key)).toContain('GPU')
    const markup = dock(laidTo(vllm, 0))
    expect(markup).toContain('aria-label="Show the stages that start in"')
    expect(markup).toContain('Filter the stages by words')
    const queues = view.tray.filter((tile) => matches(tile, 'queue'))
    expect(queues.length).toBeGreaterThan(0)
    expect(queues.every((tile) => tile.mechanism === 'queue' || /queue/i.test(tile.label))).toBe(true)
    expect(view.tray.filter((tile) => matches(tile, 'engine-core ZMQ')).length).toBeGreaterThan(0)
    expect(view.tray.filter((tile) => matches(tile, 'no stage has these words'))).toEqual([])
  })

  test('the first run\'s ring sits on the tile of the reference path\'s first stage, with its word', () => {
    const markup = render(h(Controls, { run: fakeRun(laidTo(nano, 0)), ring: nano.reference[0] }))
    expect(markup).toMatch(new RegExp(`es-floor-ring.*?data-stage="${nano.reference[0]}"`))
    expect(markup).toContain('first move')
    expect(count(markup, /es-marker__ring/g)).toBe(1)
  })

  test('Run the path is the amber control once there is a stage to run, and Remove last takes one off', () => {
    expect(dock(laidTo(vllm, 0))).toMatch(/data-state="disabled".*Run the path/)
    const markup = dock(laidTo(vllm, 2))
    expect(markup).toMatch(/class="es-primary-button" data-state="default".*?Run the path/)
    expect(markup).toContain('Remove last')
  })

  test('a lay keeps the list\'s height where the page would else be pulled up: the room it held, cut to the screen\'s foot, until the list fills it', () => {
    // A list of 600 px from 300 px down a screen of 900 px loses a row of 48 px at the page's foot: it keeps all 600 px.
    expect(heldHeight(600, 300, 852, 900)).toBe(600)
    // Scrolled up by 30 px, the 30 px of the room below the screen's foot go: nobody sees them go, and the page cannot be pulled up.
    expect(heldHeight(600, 330, 882, 900)).toBe(570)
    // Scrolled up by a row or more, the list ends under the screen's foot by itself, and the room is given back whole.
    expect(heldHeight(600, 348, 900, 900)).toBeNull()
    // A list that ends below the screen's foot keeps nothing: the page has room under it.
    expect(heldHeight(600, 100, 1000, 900)).toBeNull()
    // Remove last puts the row back, and the list fills the room again by itself.
    expect(heldHeight(600, 300, 900, 900)).toBeNull()
  })

  test('a phone\'s list box keeps a lay\'s room at its end while it is in sight, and gives back what its scroll takes out of sight', () => {
    // A box 132 px tall at its foot (scrollTop 1274 of 1406) keeps the 44 px of a row laid there: all of it is in sight.
    expect(roomInSight(44, 1274, 132, 1406)).toBe(44)
    // Scrolled up by 30 px, 30 px of the room have gone under the box's foot: 14 px are kept.
    expect(roomInSight(44, 1244, 132, 1406)).toBe(14)
    // Scrolled up by a row or more, none of it shows, and the room goes.
    expect(roomInSight(44, 1230, 132, 1406)).toBeNull()
    expect(roomInSight(132, 1100, 132, 1406)).toBeNull()
  })

  test('the band under the pinned filters says the stages are above once no tile of the list starts in it', () => {
    // The last tile starts 20 px under the bar's foot at 149 px: it is whole in the band.
    expect(bandEmpty(169, 149)).toBe(false)
    expect(bandEmpty(149, 149)).toBe(false)
    // It starts under the bar: what shows of it is an edge, and the band holds no whole tile.
    expect(bandEmpty(120, 149)).toBe(true)
    expect(bandEmpty(null, 149)).toBe(true)
  })
})

describe('the swimlane', () => {
  test('a row per laid stage: its number, its arrow\'s mark and word, and its name as a button that opens what it is', () => {
    const markup = render(h(Swimlane, { view: floorView(laidTo(vllm, 5)) }))
    expect(count(markup, /data-lane-row="/g)).toBe(5)
    expect(count(markup, /class="es-lanes__tag"/g)).toBe(5)
    expect(markup).toMatch(/class="es-lanes__tag"[^>]*>.*?data-handoff="ipc".*?IPC<\/span>/)
    expect(count(markup, /aria-haspopup="dialog"/g)).toBe(5)
    expect(count(markup, /class="es-lanes__name"[^>]*tabindex="0"/g)).toBe(1)
    expect(markup).toContain('<code>/v1/completions</code>')
    // A column per process, the request's own first.
    expect(markup).toContain('data-columns="4"')
    expect(markup.indexOf('data-process="client"')).toBeLessThan(markup.indexOf('data-process="gpu"'))
  })

  test('the "now" line and ring stand on the row the next stage starts from, and not at all once the run is over', () => {
    const open = render(h(Swimlane, { view: floorView(laidTo(vllm, 3)) }))
    expect(count(open, /data-lane-now=""/g)).toBe(1)
    expect(count(open, /data-lane-now-ring=""/g)).toBe(1)
    const over = render(h(Swimlane, { view: floorView(ranTo(vllm, vllm.reference.length)) }))
    expect(over).not.toContain('data-lane-now')
  })

  test('a stopped run marks its row with a red triangle and the word, and the rows after it stay pencilled', () => {
    const markup = render(h(Swimlane, { view: floorView(stopped) }))
    expect(markup).toContain('data-lane-row="1" data-state="struck"')
    expect(markup).toContain('<span class="es-lanes__stopped">stopped</span>')
    expect(count(markup, /class="es-lanes__struck"/g)).toBe(1)
  })

  test('the legend says each mark in a word: a host thread, a GPU stream, not run yet, stopped, now, and each mechanism drawn', () => {
    const markup = render(h(FloorLegend, { view: floorView(laidTo(vllm, 10)) }))
    for (const word of ['host thread', 'GPU stream', 'not run yet', 'stopped', 'IPC', 'queue', 'call', 'host-to-device copy']) expect(text(markup)).toContain(word)
    expect(markup).toContain('es-marker__word')
  })

  test('a stage\'s popover names its mechanism, its process and its source; before a run has judged it, why its source waits', () => {
    const pending = floorView(laidTo(vllm, 4)).laid[3]
    const before = render(h(StageFacts, { stage: pending }))
    expect(before).toContain('IPC · socket')
    expect(before).toContain('api-server · handler-task')
    expect(before).toContain('engine-core · input-thread')
    expect(before).toContain('data-source="later"')
    const judged = floorView(ranTo(vllm, 4)).laid[3]
    const after = render(h(StageFacts, { stage: judged }))
    expect(after).toContain('data-source=""')
    expect(after).toContain(`href="${judged.source === null ? 'none' : permalink(judged.source)}"`)
  })
})

describe('a stopped run in the dock', () => {
  test('says the rule in the engine\'s terms with the places, names the mechanism laid there, and offers the way back', () => {
    const markup = dock(stopped)
    expect(markup).toContain('data-stop="process"')
    expect(markup).toContain('Stopped at stage <span class="font-numeric">2</span>. A change of process needs IPC (ZMQ) or shared memory.')
    expect(markup).toContain('The request is at')
    expect(markup).toContain('data-floor-wrong-mechanism="h2d"')
    expect(markup).toContain('<strong>copy · host to device</strong>')
    expect(markup).toContain('Take the path back to stage 2')
  })

  test('a stage legal where the request is and not the engine\'s next cites the pinned source of the engine\'s own', () => {
    const markup = dock(walk(nano, { t: 'commit', prediction: 0 }, lay(nano.reference[0]), lay(nano.reference[2]), { t: 'run' }))
    expect(markup).toContain('data-stop="path"')
    expect(markup).toContain('Legal here, and not the stage this engine makes next.')
    expect(markup).toContain('nanovllm/engine/scheduler.py')
  })
})

describe('the readout strip', () => {
  test('stages laid, boundaries crossed, copies and syncs, counted from the laid path under one derived stamp', () => {
    const view = floorView(laidTo(vllm, 15))
    expect(readoutOf(view)).toEqual([
      { id: 'laid', value: 15 },
      { id: 'boundaries', value: 2 },
      { id: 'copies', value: 2 },
      { id: 'syncs', value: 1 },
    ])
    const markup = render(h(ReadoutStrip, { view, mode: 'practice' }))
    for (const word of ['stages laid', 'boundaries crossed', 'copies', 'syncs']) expect(markup).toContain(word)
    expect(count(markup, /data-word="derived"/g)).toBe(1)
  })
})

describe('what Request path gives the frame', () => {
  test('the parts: the first level names the five of REDESIGN §3.5, every row has a sentence, and a level adds its own', () => {
    expect(partRows('nano').slice(0, 5).map((part) => part.name)).toEqual(['The request', 'Processes', 'Stage list', 'A hop', 'Boundaries crossed'])
    for (const id of LEVELS) for (const part of floorPartsOf(id)) expect(part.sentence.length).toBeGreaterThan(20)
    for (const id of LEVELS) expect(partRows(id).map((part) => part.id)).toEqual(floorPartsOf(id).map((part) => part.id))
    expect(floorPartsOf('nano-tp').map((part) => part.id)).toContain('shm')
    expect(floorPartsOf('nano').map((part) => part.id)).not.toContain('threads')
  })

  test('the first run: the prediction is required, the look dispatches nothing, and the first move is the reference path\'s first stage', () => {
    for (const id of LEVELS) {
      const kit = floorKit(id, 0)
      expect(kit.firstAsk).toBe('required')
      expect(introSteps(kit.firstAsk, true)).toEqual(['parts', 'look', 'ask', 'point'])
      const sent: FloorAction[] = []
      introAct('look', kit, (action) => sent.push(action))
      expect(sent).toEqual([])
      const look = kit.look?.(floorView(walk(levelOf(id))))
      expect(look).not.toBeNull()
      expect(render(h('p', null, look?.detail))).toContain('Its source shows once a run has judged it')
      if (id === 'map') {
        // The graded map's reference is its answer: nothing is pointed at.
        expect(kit.firstMove).toBeNull()
        expect(kit.firstMoveWords).toBe('')
      } else {
        expect(kit.firstMove).toEqual({ t: 'lay', stage: levelOf(id).reference[0] })
        // Always legal once the prediction is in.
        expect(() => floorSession.reduce(laidTo(levelOf(id), 0), kit.firstMove as FloorAction)).not.toThrow()
      }
      expect(kit.isAsk?.({ t: 'commit', prediction: 1 })).toBe(true)
      expect(kit.askOpen?.(floorView(walk(levelOf(id))))).toBe(true)
      expect(kit.askOpen?.(floorView(laidTo(levelOf(id), 0)))).toBe(false)
    }
  })

  test('the named moments: a process boundary, a copy, a sync and a stop, each said once its run first meets it', () => {
    const view = (state: FloorState) => floorView(state)
    const said = (before: FloorState, after: FloorState) => FLOOR_MOMENTS.flatMap((moment) => (moment.at(view(before), view(after)) === null ? [] : [moment.id]))
    expect(said(laidTo(vllm, 14), ranTo(vllm, 14))).toEqual(['process', 'copy'])
    expect(said(laidTo(vllm, 16), ranTo(vllm, 16))).toEqual(['process', 'copy', 'sync'])
    expect(said(walk(vllm, { t: 'commit', prediction: 2 }, lay(vllm.reference[0]), lay('vllm.h2d')), stopped)).toContain('stopped')
    const line = FLOOR_MOMENTS[0].line(view(ranTo(vllm, 4)), 0)
    expect(line).toBe('That hop crosses a process boundary: it is IPC, not a function call.')
  })

  test('the dock view draws the same swimlane small, with the readout, and its Step runs the path as laid', () => {
    const state = laidTo(vllm, 6)
    const live = { ...fakeRun(state), place: { key: 'x', scope: 'l', anchor: 'a' }, gameTitle: 'Request path', levelTitle: 'vLLM at the pin', askOpen: false, step: null, stepWords: '', DockView: null, touched: 0 }
    const markup = render(h(DockView, { run: live as never }))
    expect(markup).toContain('data-floor-dock=""')
    expect(markup).toContain('data-size="dock"')
    expect(count(markup, /data-lane-row="/g)).toBe(6)
    expect(markup).toContain('data-floor-readout=""')
    expect(floorStep(floorView(state))).toEqual({ t: 'run' })
    expect(floorStep(floorView(walk(vllm)))).toBeNull()
  })
})

describe('the parts table\'s sources', () => {
  test('every claim a part names on a level is a claim of the course, and a part with none is a model object', () => {
    const ids = new Set<string>()
    const walkDir = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const at = path.join(dir, entry.name)
        if (entry.isDirectory()) walkDir(at)
        else if (entry.name.endsWith('.yaml')) for (const match of readFileSync(at, 'utf8').matchAll(/^- id: (\S+)$/gm)) ids.add(match[1])
      }
    }
    walkDir(path.join(import.meta.dirname, '../../content/claims'))
    expect(ids.size).toBeGreaterThan(100)
    for (const id of LEVELS) for (const part of floorPartsOf(id)) {
      const claim = partClaim(part, id)
      if (claim !== undefined) expect([id, part.id, ids.has(claim)]).toEqual([id, part.id, true])
    }
    expect(partClaim(floorPartsOf('vllm').find((part) => part.id === 'request') as never, 'vllm')).toBeUndefined()
  })
})

describe('the table under the frame', () => {
  test('a row per laid stage: its mechanism in words, its places, what the run found, and its source once judged', () => {
    const markup = render(h(Mirror, { run: fakeRun(stopped) }))
    expect(markup).toContain('The path so far')
    expect(markup).toContain('IPC · socket')
    expect(markup).toContain('stopped the request')
    expect(markup).toContain('client · http-client')
  })
})

describe('the result', () => {
  test('the verdict word, the sentence, the next level first, and the prediction beside the path\'s count on one number line', () => {
    const markup = result(floorGhost(nano))
    expect(markup).toContain('Finished (practice)')
    expect(markup).toContain('Every hand-off held on the first run')
    expect(markup).toContain('Next level: nano-vllm on two GPUs')
    expect(markup).toContain('data-floor-prediction-result=""')
    expect(markup).toContain('es-numline')
    expect(markup).toContain('Your prediction was right.')
  })

  test('a path that broke names the first stage that did not hold and the mechanism laid there, beside the engine\'s, from their sources', () => {
    const markup = result(mistaken())
    expect(markup).toContain('data-floor-first-wrong=""')
    expect(markup).toContain('The first stage that did not hold')
    expect(count(markup, /data-cite=""/g)).toBe(2)
  })

  test('two engines\' paths side by side, drawn small, with the processes only one has and the facts that differ marked in words', () => {
    const markup = result(floorGhost(vllm))
    expect(markup).toContain('Two engines&#x27; paths, side by side')
    expect(count(markup, /class="es-floor-mini"/g)).toBe(2)
    expect(markup).toContain('data-floor-path-of="vllm"')
    expect(markup).toContain('data-floor-path-of="sglang"')
    expect(markup).toContain('· only here')
    expect(markup).toContain('· differs')
    expect(markup).toContain('How the two paths differ')
  })

  test('the prediction\'s answer is the path\'s own count', () => {
    for (const id of LEVELS.filter((one) => one !== 'map')) expect(floorGhost(levelOf(id)).prediction).toBe(truthOf(levelOf(id).scenario))
  })
})

describe('the live line says what changed, one sentence for a turn (A§6.9)', () => {
  test('the prediction, a stage laid, the path taken back, a run that held and one that stopped, in the engine\'s words', () => {
    expect(changeLine(floorView(walk(vllm)), floorView(laidTo(vllm, 0)))).toContain('Prediction written down')
    expect(changeLine(floorView(laidTo(vllm, 0)), floorView(laidTo(vllm, 1)))).toContain('Laid stage 1')
    expect(changeLine(floorView(laidTo(vllm, 3)), floorView(ranTo(vllm, 3)))).toContain('3 stages held')
    const before = walk(vllm, { t: 'commit', prediction: 2 }, lay(vllm.reference[0]), lay('vllm.h2d'))
    expect(changeLine(floorView(before), floorView(stopped))).toContain('The request stopped at stage 2')
  })
})

describe('the words', () => {
  test('a text with the engine\'s names in backticks is split into plain and code, and a mechanism is said with its kind', () => {
    expect(splitCode('the `waiting` queue')).toEqual([
      { code: false, text: 'the ' },
      { code: true, text: 'waiting' },
      { code: false, text: ' queue' },
    ])
    expect(plain('the `waiting` queue')).toBe('the waiting queue')
    expect(handoffWords('ipc')).toBe('IPC · socket')
    expect(handoffWords('h2d')).toBe('copy · host to device')
  })

  test('no banned word or phrase in anything the page renders, on every level, before, during, stopped and at the result', () => {
    for (const id of LEVELS) {
      const level = levelOf(id)
      const states: FloorState[] = [walk(level), laidTo(level, 0), laidTo(level, 5), ranTo(level, 5), walk(level, { t: 'commit', prediction: 1 }, lay(level.reference[0]), lay(level.reference[2]), { t: 'run' })]
      for (const state of states) {
        const markup = render(h(Game, { level: id })) + dock(state) + render(h(Swimlane, { view: floorView(state) })) + render(h(Mirror, { run: fakeRun(state) })) + render(h(FloorLegend, { view: floorView(state) }))
        expect([id, findBanned(text(markup)).map((found) => found.rule)]).toEqual([id, []])
      }
      if (id !== 'map') expect([id, findBanned(text(result(floorGhost(level)))).map((found) => found.rule)]).toEqual([id, []])
      for (const part of floorPartsOf(id)) expect(findBanned(`${part.name} ${part.sentence}`)).toEqual([])
    }
    expect(findBanned(text(result(mistaken())))).toEqual([])
  })
})
