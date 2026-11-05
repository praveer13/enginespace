/*
 * `close` on Service's page, as markup (GAMES.md §2.6, §3.2; ASSESSMENT §4.3; A§6.9; D-048): what the graded level puts on the page, rendered on the
 * server. The cards stand under the view in place of the readouts that a graded level hides; the controls serve the whole night at one ring;
 * the verdict says what the night came to against the bar; and a graded run opens on a seed drawn when it starts, with no undo. What needs a DOM,
 * a focus or a timer is walked in a browser by e2e/loop-close.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { finishRun, startRun } from '@es/play'
import { compile } from '@es/play/loop/full/compose'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullState } from '@es/play/loop/full/types'
import FullService from '@/games/loop/FullService'
import Game from '@/games/loop/Game'
import { BuildThis } from '@/games/loop/full/BuildThis'
import { CloseCards } from '@/games/loop/full/CloseCards'
import { Compose } from '@/games/loop/full/Compose'
import { FullControls } from '@/games/loop/full/FullControls'
import { FullDebrief } from '@/games/loop/full/FullDebrief'
import { FullMirror } from '@/games/loop/full/FullMirror'
import { FullTape } from '@/games/loop/full/FullTape'
import { Production } from '@/games/loop/full/Production'
import { verdictWords } from '@/games/loop/full/tags'
import type { FullOutcome, FullRun } from '@/games/loop/full/types'
import { fullChangeLine } from '@/games/loop/full/useFullControls'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/loop' }, element))
const play = (state: FullState, ...actions: FullAction[]): FullState => actions.reduce((s, a) => fullSession.reduce(s, a), state)
const SEED = 16
const start = (seed = SEED): FullState => fullSession.init(fullSession.level('close', seed))

function runOf(state: FullState, mode: 'practice' | 'graded' = 'practice'): FullRun {
  const view = fullSession.view(state)
  return {
    game: 'loop',
    level: state.level.id,
    mode,
    seed: state.level.seed,
    view,
    score: view.counters,
    ask: fullSession.ask(state),
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
  }
}

function outcomeOf(state: FullState): FullOutcome {
  let run = startRun(fullSession, { game: 'loop', level: state.level.id, seed: state.level.seed })
  run = { ...run, state }
  const finished = finishRun(fullSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: fullSession.view(finished.ghost) }
}

/** The house's levers set on the panel, then the night served. */
const served = (state: FullState, mutate: Partial<FullState['stages'][0]['levers']> = {}): FullState => {
  const house = state.level.stages[0].house
  const levers = { ...house, ...mutate }
  return play(
    state,
    { t: 'commit', prediction: state.level.stages[0].answer },
    { t: 'lever', name: 'async', value: levers.async },
    { t: 'lever', name: 'inputIds', value: levers.inputIds },
    { t: 'lever', name: 'runner', value: levers.runner },
    { t: 'lever', name: 'graphMode', value: levers.graphMode },
    { t: 'capture', sizes: levers.captureSizes },
    { t: 'run', until: 'decision' },
  )
}

describe('the page of `close`', () => {
  test('is Service\'s, with the level on its docket, a way into a graded run, and every stage of the play sequence', () => {
    const docket = render(h(Game, null))
    expect(docket.slice(docket.indexOf('data-loop-docket'))).toContain('Close the bubbles')
    const markup = render(h(FullService, { level: 'close', onLevel: () => undefined }))
    expect(markup).toContain('Close the bubbles · practice')
    expect(markup).toContain('data-full-mode="practice"')
    expect(markup).toContain('This level can be graded, on fresh numbers.')
    expect(markup).toContain('Start a graded run')
    for (const stage of ['>Play</button>', '>Debrief</button>', '>Compose</button>', '>In production</button>', '>Build this</button>']) expect(markup).toContain(stage)
    // One stage: no tabs for it.
    expect(markup).not.toContain('aria-label="Stages of the level"')
    // The practice levels offer no graded run.
    expect(render(h(FullService, { level: 'async', onLevel: () => undefined }))).not.toContain('Start a graded run')
  })

  test('a graded run draws its seed when it starts: the page says so, and offers no undo and no way back to the same numbers', () => {
    const markup = render(h(FullService, { level: 'close', mode: 'graded', onLevel: () => undefined }))
    expect(markup).toContain('Close the bubbles · graded')
    expect(markup).toContain('data-mode="graded"')
    expect(markup).toContain('data-full-mode="graded"')
    expect(markup).toContain('A graded run: fresh numbers drawn now, no undo, one night')
    expect(markup).toContain('Back to practice')
    expect(markup).not.toContain('>Undo<')
    // Two graded runs are two draws: the cards under the view print the night's numbers, and they differ from one draw to the next.
    const pages = new Set(Array.from({ length: 8 }, () => render(h(FullService, { level: 'close', mode: 'graded', onLevel: () => undefined }))))
    expect(pages.size).toBeGreaterThan(1)
  })
})

describe('the controls of a closed-book stage', () => {
  test('the prediction first, then every lever of the stage, and one button that serves the whole night: no bell, no Auto', () => {
    const markup = render(h(FullControls, { run: runOf(start()) }))
    expect(markup).toContain('data-full-prediction="open"')
    expect(markup).toContain('what share of the night does the line sit dark')
    expect(markup).toContain('In per cent')
    for (const lever of ['Write the next call during this fire', "The line fills the next call&#x27;s input ids", 'The V2 runner']) expect(markup).toContain(lever)
    for (const mode of ['FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE · call each dish']) expect(markup).toContain(mode)
    expect(markup).toContain('Serve the night')
    expect(markup).toContain('data-full-serve')
    expect(markup).not.toContain('>Auto<')
    expect(markup).not.toContain('Serve the rest')
    expect(markup).toContain('Call the prediction first: the night is served once it is called.')
  })

  test('the rack takes any sizes of the ladder, with no cap and no list of the engines\' beside it', () => {
    const run = runOf(start())
    const markup = render(h(FullControls, { run }))
    const stage = run.view.stage
    expect((markup.match(/es-full-ladder__size/g) ?? []).length).toBe(stage.ladder?.length)
    expect(markup).toContain('each takes memory out of the reach-in')
    expect(markup).not.toContain('at most')
    expect(markup).not.toContain('SGLang&#x27;s decode buckets start')
    expect((markup.match(/aria-pressed="true"[^>]*es-full-ladder__size|es-full-ladder__size[^>]*aria-pressed="true"/g) ?? []).length).toBeGreaterThan(0)
  })

  test('says nothing of the mode a lever resolves to or of the memory the routines take until the night is served, and says both after', () => {
    const before = render(h(FullControls, { run: runOf(play(start(), { t: 'commit', prediction: 0 })) }))
    expect(before).not.toContain('data-full-resolved')
    expect(before).not.toContain('data-full-memory')
    expect(before).not.toContain('Verdict')
    const after = render(h(FullControls, { run: runOf(served(start())) }))
    expect(after).toContain('data-full-resolved')
    expect(after).toContain('data-full-memory')
    expect(after).toContain('data-full-verdict="pass"')
    expect(after).toContain('The night meets the bar.')
    // The levers lock with the night: the stage is closed.
    expect(after).toMatch(/<fieldset[^>]*disabled=""/)
  })
})

describe('the cards', () => {
  test('are four slips under the view: the tickets, the line\'s fires, the expo\'s costs and the backend with the room, each figure a tagged Readout', () => {
    const run = runOf(start())
    const markup = render(h(FullMirror, { run }))
    expect(markup).toContain('data-close-cards')
    for (const head of ["Tonight&#x27;s tickets", 'What the line charges', 'What the expo charges tonight', 'The backend and the reach-in']) expect(markup).toContain(head)
    for (const tag of ['synthetic', 'estimated', 'derived']) expect(markup).toContain(`data-tag="${tag}"`)
    expect(markup).toContain('Every kernel of a fire, one by one')
    expect(markup).toContain('The reach-in can spare for routines')
    expect(markup).toContain('A drilled routine takes')
    expect(markup).toContain('No night has been served yet. Call the prediction, set the levers from the cards and serve the night.')
    // It is the mirror too: the table stands under the cards.
    expect(markup.indexOf('data-close-cards')).toBeLessThan(markup.indexOf('Mirror · '))
    const stage = run.view.stage.cards!
    expect(markup).toContain(`>${stage.budget}<`)
    expect(markup).toContain(stage.support)
  })

  test('print the room in the Readout\'s decimal units to a thousandth, so a learner\'s sum can meet it to the byte it would be refused at', () => {
    const run = runOf(start())
    const cards = run.view.stage.cards!
    const markup = render(h(CloseCards, { view: run.view }))
    expect(markup).toContain((cards.roomBytes / 1e6).toFixed(3))
    expect(markup).toContain((cards.graphBaseBytes / 1e6).toFixed(3))
    expect(markup).toContain((cards.graphTokenBytes / 1e3).toFixed(3))
  })

  test('the tape, the mirror and the 2D footer keep the house\'s clock to themselves until the night is served', () => {
    const before = runOf(play(start(), { t: 'commit', prediction: 0 }))
    const house = String(before.view.stage.houseMetric).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const markupBefore = render(h(FullMirror, { run: before })) + render(h(FullTape, { view: before.view }))
    expect(markupBefore).not.toContain('against the house')
    expect(markupBefore).not.toContain(`>${house}<`)
    const after = runOf(served(start()))
    const markupAfter = render(h(FullMirror, { run: after })) + render(h(FullTape, { view: after.view }))
    expect(markupAfter).toContain('against the house')
    expect(markupAfter).toContain(house)
  })
})

describe('the verdict and the debrief', () => {
  test('the house\'s night is well served; a night with the ids written by hand is a violation, and one the engine would not start is refused', () => {
    const level = fullSession.level('close', SEED)
    const good = fullSession.ghost(level)
    expect(render(h(FullDebrief, { run: runOf(good), outcome: outcomeOf(good), next: null, onNext: () => undefined }))).toContain('Well served.')
    expect(verdictWords(fullSession.view(good).stage.verdict!)).toBe('The night meets the bar.')
    const hand = served(start(), { inputIds: 'host' })
    const handMarkup = render(h(FullDebrief, { run: runOf(hand), outcome: outcomeOf(hand), next: null, onNext: () => undefined }))
    expect(handMarkup).toContain('Serve it again.')
    expect(handMarkup).toContain('data-verdict="violation"')
    expect(handMarkup).toContain('fires that read a token before it was sampled')
    expect(handMarkup).toContain('The lever worth the most:')
    expect(handMarkup).toContain('the next call&#x27;s input ids')
    const stage = level.stages[0]
    const over = served(start(), { graphMode: 'FULL_AND_PIECEWISE', captureSizes: [...(stage.ladder ?? [])] })
    const overMarkup = render(h(FullDebrief, { run: runOf(over), outcome: outcomeOf(over), next: null, onNext: () => undefined }))
    expect(overMarkup).toContain('data-verdict="refused"')
    expect(overMarkup).toContain('more memory than the reach-in can spare')
  })

  test('sets the learner\'s configuration beside the house\'s, lever by lever, and marks what differs', () => {
    const naive = play(start(), { t: 'commit', prediction: 0 }, { t: 'run', until: 'decision' })
    const markup = render(h(FullDebrief, { run: runOf(naive), outcome: outcomeOf(naive), next: null, onNext: () => undefined }))
    expect(markup).toContain('data-full-config-table')
    for (const row of ['Async scheduling', "The next call&#x27;s input ids", 'The runner', 'The graph mode', 'The molds on the rack']) expect(markup).toContain(row)
    expect(markup).toContain('data-differs')
    expect(markup).toContain('not what the house did')
    const house = fullSession.ghost(fullSession.level('close', SEED))
    expect(render(h(FullDebrief, { run: runOf(house), outcome: outcomeOf(house), next: null, onNext: () => undefined }))).not.toContain('data-differs')
  })

  test('a graded run offers another graded run and practice; practice offers new numbers and a graded run', () => {
    const house = fullSession.ghost(fullSession.level('close', SEED))
    const outcome = outcomeOf(house)
    const graded = render(h(FullDebrief, { run: runOf(house, 'graded'), outcome, next: null, onNext: () => undefined, onGraded: () => undefined, onPractice: () => undefined }))
    expect(graded).toContain('Another graded run')
    expect(graded).toContain('Practice this level')
    expect(graded).not.toContain('New numbers')
    const practice = render(h(FullDebrief, { run: runOf(house), outcome, next: null, onNext: () => undefined, onGraded: () => undefined }))
    expect(practice).toContain('New numbers')
    expect(practice).toContain('Start a graded run')
    expect(practice).not.toContain('Another graded run')
  })

  test('the live line says the verdict, with no figure to read aloud twice', () => {
    const before = play(start(), { t: 'commit', prediction: 0 })
    const after = served(start())
    const line = fullChangeLine(fullSession.view(before), fullSession.view(after))
    expect(line).toContain('The night is served. The night meets the bar.')
    expect(line).not.toContain('against the house')
  })
})

describe('Compose, In production and Build this for `close`', () => {
  test('Compose writes one compilation_config for the mode and the sizes, a note for the ids with no flag, and runs the policy on fresh seeds', () => {
    const level = buildFullLevel('close', SEED)
    const house = compile(level.stages, level.stages.map((stage) => stage.house))
    expect(house.vllm.filter((line) => line.startsWith('--compilation-config'))).toHaveLength(1)
    expect(house.vllm.join(' ')).toContain('cudagraph_capture_sizes')
    expect(house.notes.join(' ')).toContain('Triton kernels on the GPU')
    const naive = compile(level.stages, level.stages.map((stage) => stage.naive))
    expect(naive.vllm).toContain('--no-async-scheduling')
    expect(naive.vllm).toContain('VLLM_USE_V2_MODEL_RUNNER=0 (in the environment)')
    expect(naive.notes.join(' ')).toContain('no flag in either engine')
    expect(naive.vllm.join(' ')).not.toContain('cudagraph_capture_sizes')
    expect(render(h(Compose, { run: runOf(start()) }))).toContain('Run my policy on tonight and on three fresh nights')
  })

  test('In production shows the overlap, the graphs and the runner\'s settings, and Build this points at TR3\'s lab', () => {
    const markup = render(h(Production, { level: 'close' }))
    for (const setting of ['--no-async-scheduling', 'compilation_config.cudagraph_mode', 'compilation_config.cudagraph_capture_sizes', 'VLLM_USE_V2_MODEL_RUNNER', 'MRV2 input preparation']) expect(markup).toContain(setting)
    expect(render(h(BuildThis, { level: 'close' }))).toContain('tr3.profile.s4')
  })
})
