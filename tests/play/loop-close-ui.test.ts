/*
 * `close` in the instrument frame, as markup (GAMES.md §2.6, §3.2; ASSESSMENT §4.3; REDESIGN §3.7; A§6.9; D-048): what the graded level puts on the page,
 * rendered on the server. The cards stand under the view in place of the readouts that a graded level hides; one control runs the whole stage;
 * the verdict says what the run came to against the bar; and a graded run opens on a seed drawn when it starts, with no undo. What needs a DOM,
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
import { FullView2D } from '@/games/loop/full/FullView2D'
import Game from '@/games/loop/Game'
import { BuildThis } from '@/games/loop/full/BuildThis'
import { CloseCards } from '@/games/loop/full/CloseCards'
import { Compose } from '@/games/loop/full/Compose'
import { FullControls } from '@/games/loop/full/FullControls'
import { FullDebrief } from '@/games/loop/full/FullDebrief'
import { FullMirror } from '@/games/loop/full/FullMirror'
import { FullReadout } from '@/games/loop/full/FullTape'
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
    restart: () => undefined,
    ledger: false,
    intro: { askShown: true, ring: null },
    guessSkipped: false,
    skipGuess: () => undefined,
  }
}

function outcomeOf(state: FullState): FullOutcome {
  let run = startRun(fullSession, { game: 'loop', level: state.level.id, seed: state.level.seed })
  run = { ...run, state }
  const finished = finishRun(fullSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: fullSession.view(finished.ghost) }
}

/** The reference run's levers set on the panel, then the run served. */
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
  test('is the frame\'s, with the level in its menu, a way into a graded run, and its pass rule in the goal line', () => {
    // The demo levels' level menu lists it too, graded (R-T17).
    expect(render(h(Game, null))).toContain('Every lever, on new numbers')
    const markup = render(h(FullService, { level: 'close', onLevel: () => undefined }))
    expect(markup).toContain('Every lever, on new numbers')
    expect(markup).toContain('· graded')
    expect(markup).toContain('data-full-mode="practice"')
    expect(markup).toContain('This level can be graded, on fresh numbers.')
    expect(markup).toContain('Start a graded run')
    expect(markup).toContain('Goal:')
    expect(markup).toContain('Passes with zero dependency violations')
    // One stage: no tabs for it.
    expect(markup).not.toContain('aria-label="Stages of the level"')
    // The practice levels offer no graded run.
    expect(render(h(FullService, { level: 'async', onLevel: () => undefined }))).not.toContain('Start a graded run')
  })

  test('a graded run draws its seed when it starts: the page says so, and offers no undo and no way back to the same numbers', () => {
    const markup = render(h(FullService, { level: 'close', mode: 'graded', onLevel: () => undefined }))
    expect(markup).toContain('Every lever, on new numbers')
    expect(markup).toContain('data-mode="graded"')
    expect(markup).toContain('data-full-mode="graded"')
    expect(markup).toContain('A graded run: fresh numbers drawn now, no undo, one run')
    expect(markup).toContain('Back to practice')
    expect(markup).not.toContain('>Undo<')
    // Two graded runs are two draws: the cards under the view print the run's numbers, and they differ from one draw to the next.
    const pages = new Set(Array.from({ length: 8 }, () => render(h(FullService, { level: 'close', mode: 'graded', onLevel: () => undefined }))))
    expect(pages.size).toBeGreaterThan(1)
  })
})

describe('the controls of a closed-book stage', () => {
  test('the pass rule and the prediction first, then (once it is committed) every lever of the stage, and one control that runs the whole stage: no Step, no Auto', () => {
    const open = render(h(FullControls, { run: runOf(start()) }))
    expect(open).toContain('data-full-prediction="open"')
    expect(open).toContain('Pass rule:')
    expect(open).toContain('what share of the run does the GPU sit idle')
    expect(open).toContain('In per cent')
    expect(open).toContain('Run it: commit the prediction first')
    expect(open).not.toContain('data-full-levers')
    const markup = render(h(FullControls, { run: runOf(play(start(), { t: 'commit', prediction: 30 })) }))
    for (const lever of ['Async scheduling', 'Input ids filled on the GPU', 'V2 model runner']) expect(markup).toContain(lever)
    for (const mode of ['FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE: eager launches']) expect(markup).toContain(mode)
    expect(markup).toContain('>Run it<')
    expect(markup).not.toContain('>Auto<')
    expect(markup).not.toContain('Run to the end')
    expect(markup).toContain('One run, served once, whole.')
    // The closed book prints no comparison with the reference run before the run: e2e/loop-full.spec.ts looks for that phrase on the whole
    // page, and finds it once the run is served.
    expect(markup).not.toContain('reference run’s clock')
    expect(markup).not.toContain('against the reference run')
  })

  test('the capture sizes take any size of the ladder, with no cap and no list of the engines\' beside them', () => {
    const run = runOf(play(start(), { t: 'commit', prediction: 30 }))
    const markup = render(h(FullControls, { run }))
    const stage = run.view.stage
    expect((markup.match(/es-full-ladder__size/g) ?? []).length).toBe(stage.ladder?.length)
    expect(markup).toContain('Each size takes memory from the KV cache.')
    expect(markup).not.toContain('at most')
    expect(markup).not.toContain('SGLang’s decode buckets start')
    expect((markup.match(/aria-pressed="true"[^>]*es-full-ladder__size|es-full-ladder__size[^>]*aria-pressed="true"/g) ?? []).length).toBeGreaterThan(0)
  })

  test('says nothing of the mode a lever resolves to or of the memory the graphs take until the run is served, and says both after', () => {
    const before = render(h(FullControls, { run: runOf(play(start(), { t: 'commit', prediction: 0 })) }))
    expect(before).not.toContain('data-full-resolved')
    expect(before).not.toContain('data-full-memory')
    expect(before).not.toContain('Verdict')
    const after = render(h(FullControls, { run: runOf(served(start())) }))
    expect(after).toContain('data-full-resolved')
    expect(after).toContain('data-full-memory')
    expect(after).toContain('data-full-verdict="pass"')
    expect(after).toContain('The run meets the bar.')
    // The levers lock with the run: the stage is closed.
    expect(after).toMatch(/<fieldset[^>]*disabled=""/)
  })
})

describe('the cards', () => {
  test('are four cards under the view: the workload, the GPU\'s cost, the CPU\'s cost and the backend with the room, each figure a tagged Readout', () => {
    const run = runOf(start())
    const markup = render(h(FullView2D, { run })) + render(h(FullMirror, { run }))
    expect(markup).toContain('data-close-cards')
    for (const head of ['This run&#x27;s requests', 'What the GPU charges', 'What the CPU charges on this run', 'The backend and the memory']) expect(markup).toContain(head)
    // The page is `h1` and the frame's title `h2`, so a card's heading is the next level, and none is skipped (axe's heading-order; W1-T36).
    expect(markup.match(/<h3[ >]/g)).toHaveLength(4)
    expect(markup).not.toMatch(/<h4[ >]/)
    for (const tag of ['synthetic', 'estimated', 'derived']) expect(markup).toContain(`data-tag="${tag}"`)
    expect(markup).toContain('Every kernel of a step, launched eagerly')
    expect(markup).toContain('The GPU can spare for graphs')
    expect(markup).toContain('A captured graph takes')
    expect(markup).toContain('No run has been served yet. Commit the prediction, set the levers from the cards and run it.')
    // The cards stand under the lanes, ahead of the state table.
    expect(markup.indexOf('data-close-cards')).toBeLessThan(markup.indexOf('State · '))
    expect(markup.indexOf('data-full-lanes')).toBeLessThan(markup.indexOf('data-close-cards'))
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

  test('the readout strip, the state table and the diagram keep the reference run\'s clock to themselves until the run is served', () => {
    const before = runOf(play(start(), { t: 'commit', prediction: 0 }))
    const house = String(before.view.stage.houseMetric).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const markupBefore = render(h(FullMirror, { run: before })) + render(h(FullReadout, { view: before.view })) + render(h(FullView2D, { run: before }))
    expect(markupBefore).not.toContain('against the reference run')
    expect(markupBefore).not.toContain('data-lanes-reference')
    expect(markupBefore).not.toContain(`>${house}<`)
    const after = runOf(served(start()))
    const markupAfter = render(h(FullMirror, { run: after })) + render(h(FullReadout, { view: after.view })) + render(h(FullView2D, { run: after }))
    expect(markupAfter).toContain('against the reference run')
    expect(markupAfter).toContain('data-lanes-reference')
    expect(markupAfter).toContain(house)
  })
})

describe('the verdict and the debrief', () => {
  test('the reference run passes; a run with the ids written by hand is a violation, and one the engine would not start is refused', () => {
    const level = fullSession.level('close', SEED)
    const good = fullSession.ghost(level)
    expect(render(h(FullDebrief, { run: runOf(good), outcome: outcomeOf(good), next: null, onNext: () => undefined, embedded: true }))).toContain('Passed')
    expect(verdictWords(fullSession.view(good).stage.verdict!)).toBe('The run meets the bar.')
    const hand = served(start(), { inputIds: 'host' })
    const handMarkup = render(h(FullDebrief, { run: runOf(hand), outcome: outcomeOf(hand), next: null, onNext: () => undefined }))
    expect(handMarkup).toContain('Not yet')
    expect(handMarkup).toContain('data-verdict="violation"')
    expect(handMarkup).toContain('steps that read a token before it was sampled')
    expect(handMarkup).toContain('The lever worth the most:')
    expect(handMarkup).toContain('the next step&#x27;s input ids')
    const stage = level.stages[0]
    const over = served(start(), { graphMode: 'FULL_AND_PIECEWISE', captureSizes: [...(stage.ladder ?? [])] })
    const overMarkup = render(h(FullDebrief, { run: runOf(over), outcome: outcomeOf(over), next: null, onNext: () => undefined }))
    expect(overMarkup).toContain('data-verdict="refused"')
    expect(overMarkup).toContain('more memory than the GPU can spare for them')
  })

  test('sets the learner\'s configuration beside the reference run\'s, lever by lever, and marks what differs', () => {
    const naive = play(start(), { t: 'commit', prediction: 0 }, { t: 'run', until: 'decision' })
    const markup = render(h(FullDebrief, { run: runOf(naive), outcome: outcomeOf(naive), next: null, onNext: () => undefined }))
    expect(markup).toContain('data-full-config-table')
    for (const row of ['Async scheduling', 'Input ids', 'Model runner', 'CUDA graph mode', 'Capture sizes']) expect(markup).toContain(row)
    expect(markup).toContain('data-differs')
    expect(markup).toContain('not what the reference run did')
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
    expect(line).toContain('The run is served. The run meets the bar.')
    expect(line).not.toContain('against the reference run')
  })
})

describe('Compose, In production and Build this for `close`', () => {
  test('Compose writes one compilation_config for the mode and the sizes, a note for the ids with no flag, and runs the configuration on fresh seeds', () => {
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
    expect(render(h(Compose, { run: runOf(start()) }))).toContain('Run my configuration on this run and on three fresh runs')
  })

  test('In production shows the overlap, the graphs and the runner\'s settings, and Build this points at TR3\'s lab', () => {
    const markup = render(h(Production, { level: 'close' }))
    for (const setting of ['--no-async-scheduling', 'compilation_config.cudagraph_mode', 'compilation_config.cudagraph_capture_sizes', 'VLLM_USE_V2_MODEL_RUNNER', 'MRV2 input preparation']) expect(markup).toContain(setting)
    expect(render(h(BuildThis, { level: 'close' }))).toContain('TR3’s lab runs the experiments')
  })
})
