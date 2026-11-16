/*
 * The full levels in the instrument frame, as markup (GAMES.md §2.6, §3.2; REDESIGN §3.7; A§6.9; D-048, D-049): what the docket, the controls, the
 * readout strip, the state table, the debrief, Compose, In production, Build this and the `keys` card put on the page, rendered on the server. What needs a DOM, a
 * focus or a timer (the roving ladder, Auto, the keys) is walked in a browser by e2e/loop-full.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { CORE_SCHEMA, load } from 'js-yaml'
import { finishRun, startRun } from '@es/play'
import { compile } from '@es/play/loop/full/compose'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { FULL_SERVICE } from '@es/play/loop/entry'
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullLevelId, FullState } from '@es/play/loop/full/types'
import { introSteps } from '@/games/kit/first-move'
import FullService from '@/games/loop/FullService'
import Game, { Docket } from '@/games/loop/Game'
import { KeysWaiting } from '@/games/loop/KeysWaiting'
import { BuildThis } from '@/games/loop/full/BuildThis'
import { Compose } from '@/games/loop/full/Compose'
import { FullControls } from '@/games/loop/full/FullControls'
import { FullDebrief } from '@/games/loop/full/FullDebrief'
import { FullMirror } from '@/games/loop/full/FullMirror'
import { FullReadout } from '@/games/loop/full/FullTape'
import { FullView2D } from '@/games/loop/full/FullView2D'
import { fullKit } from '@/games/loop/full/kit'
import { Production } from '@/games/loop/full/Production'
import { PRODUCTION } from '@/games/loop/full/production-lines'
import type { FullOutcome, FullRun } from '@/games/loop/full/types'
import { fullChangeLine } from '@/games/loop/full/useFullControls'

const root = path.resolve(import.meta.dirname, '../..')
const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/loop' }, element))
const play = (state: FullState, ...actions: FullAction[]): FullState => actions.reduce((s, a) => fullSession.reduce(s, a), state)
const start = (id: FullLevelId, seed = 0): FullState => fullSession.init(fullSession.level(id, seed))

function runOf(state: FullState): FullRun {
  const view = fullSession.view(state)
  return {
    game: 'loop',
    level: state.level.id,
    mode: 'practice',
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

describe('the docket: the step loop\'s levels under its name', () => {
  test('the demo\'s four, TR2\'s five, and the keys behind their card, waiting', () => {
    // The full levels' page carries the docket (R-T17 put the demo levels in the instrument frame, with its level menu).
    const markup = render(h(Docket, { current: 'first-1-fill', onOpen: () => undefined }))
    const docket = markup.slice(markup.indexOf('data-loop-docket'), markup.indexOf('</nav>', markup.indexOf('data-loop-docket')))
    for (const title of ['Demo', 'Fill the batch', 'Both levers', 'TR2 levels', 'Async scheduling on two cost cards', 'CUDA graphs: launches against replay', 'The V2 model runner', 'Every lever, on new numbers', 'The grammar mask inside a step', 'Keys']) {
      expect(docket).toContain(title)
    }
    expect(docket).toContain('· waiting')
    expect(docket).toMatch(/aria-current="true"[^>]*>Fill the batch/)
  })

  test('the demo levels\' frame names all nine levels in its one level menu', () => {
    const markup = render(h(Game, null))
    for (const title of ['Fill the batch', 'Both levers', 'Async scheduling on two cost cards', 'CUDA graphs: launches against replay', 'The V2 model runner', 'Every lever, on new numbers', 'The grammar mask inside a step']) {
      expect(markup).toContain(title)
    }
  })

  test('a lesson that embeds the game names its level, so the docket and the level menu are left out', () => {
    const markup = render(h(Game, { placement: 'embed' }))
    expect(markup).not.toContain('data-loop-docket')
    expect(markup).not.toContain('Level 1 of 9')
  })
})

describe('the full levels\' page, in the instrument frame', () => {
  test('names the game, its role and the level with its stage in the one level menu, and opens on the cost card, the lanes, the dock and the readout', () => {
    const markup = render(h(FullService, { level: 'async', onLevel: () => undefined }))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-frame__title">Step loop<\/h2>/)
    expect(markup).toContain('You are the scheduler.')
    expect(markup).toContain('stage 1 of 2: 70B on H100')
    expect(markup).toContain('aria-label="Stages of the level"')
    expect(markup).toContain('data-full-card')
    expect(markup).toContain('data-card-name="">70B on H100')
    expect(markup).toContain('data-full-lanes')
    expect(markup).toContain('data-full-controls')
    expect(markup).toContain('data-full-readout')
    expect(markup).toContain('State as a table')
    expect(markup).toContain('What this model leaves out')
    // The goal line carries the stage's own aim, what the learner controls, the number to beat and the end.
    expect(markup).toContain('Measure async scheduling on a large model.')
    expect(markup).toContain('Ends on a run close enough to the reference run&#x27;s, or after the third run.')
    // The frame's order: the title strip, the goal line, the diagram, the dock (its controls, then the readout), the state table.
    const at = ['es-frame__strip', 'es-frame__goal', 'data-full-card', 'data-full-controls', 'data-full-readout', 'data-state-table'].map((text) => markup.indexOf(text))
    expect(at.every((index, i) => index > -1 && (i === 0 || index > at[i - 1]))).toBe(true)
  })

  test('the graded level shows its pass rule in the goal line before the run, and hides its live readout, and says so', () => {
    const markup = render(h(FullService, { level: 'close', onLevel: () => undefined }))
    expect(markup).toContain('Passes with zero dependency violations and useful tokens per GPU-ms at least 97% of the reference run&#x27;s.')
    expect(markup).toContain('data-full-rule')
    expect(markup).toContain('Pass rule:')
    expect(markup).toContain('The live readout is hidden: this run is graded.')
    expect(markup).toContain('Start a graded run')
  })

  test('the controls: the prediction first, then (once it is committed) the stage\'s lever, Step, Auto and Run to the end', () => {
    const markup = render(h(FullControls, { run: runOf(start('async')) }))
    expect(markup).toContain('data-full-prediction="open"')
    expect(markup).toContain('Commit prediction')
    expect(markup).toContain('Step: commit the prediction first')
    // No lever stands before the prediction: no session action precedes it.
    expect(markup).not.toContain('data-full-levers')
    expect(markup).not.toContain('Async scheduling</span>')
    const called = render(h(FullControls, { run: runOf(play(start('async'), { t: 'commit', prediction: 12000 })) }))
    expect(called).toContain('data-full-prediction="called"')
    expect(called).toContain('12,000 µs')
    expect(called).toContain('Async scheduling')
    expect(called).toContain('The CPU schedules the next step while this one runs.')
    expect(called).toContain('>Auto<')
    expect(called).toContain('Run to the end')
    const served = render(h(FullControls, { run: runOf(play(start('async'), { t: 'commit', prediction: 12000 }, { t: 'run', until: 'decision' })) }))
    expect(served).toContain('Runs served')
    expect(served).toContain('Run 1')
  })

  test('the first run on a full level is the parts, the cost card\'s row, then the prediction, and no session action precedes the prediction', () => {
    for (const id of FULL_SERVICE.map((level) => level.id as FullLevelId)) {
      const kit = fullKit(id, FULL_SERVICE.find((level) => level.id === id)!.practiceSeed)
      expect(kit.firstAsk).toBe('required')
      expect(introSteps(kit.firstAsk, true)).toEqual(['parts', 'look', 'ask', 'point'])
      // The intro dispatches nothing before the ask: the only step that acts is `move`, and a required ask has none before it.
      expect(introSteps(kit.firstAsk, true)).not.toContain('move')
      const view = fullSession.view(start(id, FULL_SERVICE.find((level) => level.id === id)!.practiceSeed))
      expect(kit.askOpen?.(view)).toBe(true)
      expect(kit.isAsk?.({ t: 'commit', prediction: 1 })).toBe(true)
      expect(kit.isAsk?.({ t: 'run', until: 'step' })).toBe(false)
      expect(kit.look?.(view)?.label).toMatch(/card$/)
      // The pointed first move is the reference run's first, and it is legal on the stage's first state.
      expect(kit.firstMove).not.toBeNull()
      expect(() => fullSession.reduce(play(start(id, FULL_SERVICE.find((level) => level.id === id)!.practiceSeed), { t: 'commit', prediction: 0 }), kit.firstMove!)).not.toThrow()
      // The parts list names the cost card first, and every level draws the lanes' own parts.
      expect(kit.parts[0].id).toBe('cost-card')
      expect(kit.parts.map((part) => part.id)).toEqual(expect.arrayContaining(['cpu', 'forward', 'bubble']))
    }
  })

  test('the modes: five radios, the mode the backend lets run, and the graphs\' memory against the room the GPU spares', () => {
    const run = runOf(play(start('graphs'), { t: 'stage', to: 'modes' }, { t: 'commit', prediction: 0 }))
    const markup = render(h(FullControls, { run }))
    for (const mode of ['FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE: eager launches']) expect(markup).toContain(mode)
    expect(markup).toContain('data-full-resolved')
    expect(markup).toContain('data-full-memory')
    expect(markup).toMatch(/the GPU can spare for them/)
  })

  test('the capture sizes: a toggle button a size, pressed for each one captured, with vLLM\'s and SGLang\'s lists beside it', () => {
    const markup = render(h(FullControls, { run: runOf(play(start('graphs'), { t: 'stage', to: 'sizes' }, { t: 'commit', prediction: 0 })) }))
    expect((markup.match(/es-full-ladder__size/g) ?? []).length).toBe(12)
    expect((markup.match(/aria-pressed="true"[^>]*es-full-ladder__size|es-full-ladder__size[^>]*aria-pressed="true"/g) ?? []).length).toBeGreaterThan(0)
    expect(markup).toContain('vLLM’s own list starts')
    expect(markup).toContain('SGLang’s decode buckets start')
    expect(markup).toContain('cudagraph_capture_sizes')
  })

  test('the readout strip and the state table print µs on the model\'s clock, each figure with its tag for a screen reader and the strip with one stamp: never ticks', () => {
    const run = runOf(play(start('async'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' }))
    const strip = render(h(FullReadout, { view: run.view }))
    // One stamp for the strip: the least sure of its figures' tags, which opens the tag legend.
    expect((strip.match(/es-stamp__word/g) ?? []).length).toBe(1)
    expect(strip).toContain('data-word="estimated"')
    expect(strip).toContain('median TPOT')
    expect(strip).toContain('GPU busy')
    expect(strip).toContain('bubble per step')
    // Each µs keeps its tag for a screen reader.
    expect(strip).toMatch(/µs<\/span><span class="sr-only">, (derived|estimated)<\/span>/)
    const table = render(h(FullMirror, { run }))
    expect(table).toContain('<span class="sr-only"> µs, derived</span>')
    expect(table).toContain('<span class="sr-only"> µs, estimated</span>')
    expect(table).toContain('The GPU’s µs are derived from S5’s fit; the CPU’s are estimated.')
    expect(strip + table).not.toContain('ticks')
    const smallRun = runOf(play(start('async'), { t: 'stage', to: 'small' }, { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }))
    const small = render(h(FullReadout, { view: smallRun.view })) + render(h(FullMirror, { run: smallRun }))
    expect(small).toContain('data-word="synthetic"')
    expect(small).toContain('µs, synthetic')
    expect(small).not.toContain('µs, derived')
  })

  test('a closed-book stage prints only its step until its run is served, then the numbers', () => {
    const level = fullSession.level('close', 16)
    const before = fullSession.view(play(fullSession.init(level), { t: 'commit', prediction: 0 }))
    const hidden = render(h(FullReadout, { view: before }))
    expect(hidden).toContain('data-readout-hidden')
    expect(hidden).not.toContain('median TPOT')
    const after = fullSession.view(play(fullSession.init(level), { t: 'commit', prediction: 0 }, { t: 'run', until: 'decision' }))
    const shown = render(h(FullReadout, { view: after }))
    expect(shown).not.toContain('data-readout-hidden')
    expect(shown).toContain('median TPOT')
  })

  test('the diagram: the cost card\'s row, the reference run only once a run is served, and never in a closed-book stage before its result', () => {
    const start0 = runOf(start('async'))
    const first = render(h(FullView2D, { run: start0 }))
    expect(first).toContain('Cost card')
    expect(first).toContain('GPU forward')
    expect(first).toContain('CPU, schedule')
    expect(first).not.toContain('data-lanes-reference')
    const served = runOf(play(start('async'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'decision' }))
    const after = render(h(FullView2D, { run: served }))
    expect(after).toContain('data-lanes-reference')
    expect(after).toContain('data-ref-forward')
    // "Fit run" is on, because the reference run's lanes lie on the learner's axis.
    expect(after).toMatch(/aria-pressed="true"[^>]*data-fit-run|data-fit-run[^>]*aria-pressed="true"/)
  })
})

describe('the debrief, Compose, In production and Build this', () => {
  test('the reference run is finished and well served; a naive one names the lever worth the most; the primary control names the next level', () => {
    const level = fullSession.level('mrv2', 0)
    const good = outcomeOf(fullSession.ghost(level))
    const goodMarkup = render(h(FullDebrief, { run: runOf(fullSession.ghost(level)), outcome: good, next: null, onNext: () => undefined, embedded: true }))
    // A practice level has a number to beat and no pass rule: the verdict is "Finished (practice)", and the reference's stages match.
    expect(goodMarkup).toContain('Finished (practice)')
    expect(goodMarkup).toContain('every stage met the reference run’s clock within its margin.')
    let naive = fullSession.init(level)
    for (const stage of level.stages) {
      naive = play(naive, { t: 'stage', to: stage.id }, { t: 'commit', prediction: 0 })
      for (let i = 0; i < 3 && !naive.stages[naive.at].served.some((n) => n.ok); i++) naive = play(naive, { t: 'run', until: 'decision' })
    }
    const markup = render(h(FullDebrief, { run: runOf(naive), outcome: outcomeOf(naive), next: { id: 'mask', title: 'The grammar mask inside a step' }, onNext: () => undefined }))
    expect(markup).toContain('The lever worth the most:')
    expect(markup).toContain('the model runner')
    expect(markup).toContain('Next level: The grammar mask inside a step')
    expect(markup).toContain('Run again')
    expect(markup).toContain('New numbers')
    // Yours against the reference run, on one axis.
    expect(markup).toContain('data-versus')
  })

  test('the graded level\'s result is Passed or Not yet, with its verdict and its configuration against the reference run\'s', () => {
    const level = fullSession.level('close', 16)
    const ghost = fullSession.ghost(level)
    const markup = render(h(FullDebrief, { run: runOf(ghost), outcome: outcomeOf(ghost), next: null, onNext: () => undefined, embedded: true, onGraded: () => undefined }))
    expect(markup).toContain('Passed')
    expect(markup).toContain('data-full-verdict-debrief')
    expect(markup).toContain('data-full-config-table')
    expect(markup).toContain('Start a graded run')
  })

  test('each stage prints as a block of its own on narrow room, and each figure carries its column\'s name', () => {
    const level = fullSession.level('async', 0)
    const markup = render(h(FullDebrief, { run: runOf(fullSession.ghost(level)), outcome: outcomeOf(fullSession.ghost(level)), next: null, onNext: () => undefined }))
    // The result is the container the stylesheet's narrow table reads (full.css), and no table of it scrolls sideways of its own.
    expect(markup).toMatch(/class="es-fd-result"/)
    const table = markup.slice(markup.indexOf('data-full-stages-table'))
    for (const stage of level.stages) {
      const row = table.slice(table.indexOf(`data-stage-row="${stage.id}"`), table.indexOf('</tr>', table.indexOf(`data-stage-row="${stage.id}"`)))
      expect([...row.matchAll(/data-label="([^"]+)"/g)].map((match) => match[1])).toEqual(['Yours, best run', 'Reference', 'Your prediction, and the model’s'])
    }
  })

  test('Compose compiles the levers to the pinned engines\' configuration, and says in words what has no flag', () => {
    const level = buildFullLevel('async', 0)
    const off = compile(level.stages, level.stages.map((stage) => stage.naive))
    expect(off.vllm).toContain('--no-async-scheduling')
    expect(off.sglang).toContain('--disable-overlap-schedule')
    const on = compile(level.stages, level.stages.map((stage) => stage.house))
    expect(on.vllm).not.toContain('--no-async-scheduling')
    expect(on.notes.join(' ')).toContain('no flag')
    const graphs = buildFullLevel('graphs', 0)
    expect(compile(graphs.stages, graphs.stages.map((stage) => stage.house)).vllm.join(' ')).toContain('cudagraph_capture_sizes')
    const markup = render(h(Compose, { run: runOf(start('async')) }))
    expect(markup).toContain('vllm serve &lt;model&gt;')
    expect(markup).toContain('Run my configuration on this run and on three fresh runs')
  })

  test('In production cites claims that exist, for every level and for the keys', () => {
    const claimsDir = path.join(root, 'content/claims')
    const ids = new Set<string>()
    for (const file of readdirSync(claimsDir, { recursive: true }) as string[]) {
      if (!/\.ya?ml$/.test(file)) continue
      const parsed = load(readFileSync(path.join(claimsDir, file), 'utf8'), { schema: CORE_SCHEMA })
      if (Array.isArray(parsed)) for (const claim of parsed) ids.add(claim.id)
    }
    for (const [level, lines] of Object.entries(PRODUCTION)) for (const line of lines) for (const id of line.claims) expect([level, id, ids.has(id)]).toEqual([level, id, true])
    expect(render(h(Production, { level: 'graphs' }))).toContain('compilation_config.cudagraph_mode')
    expect(render(h(BuildThis, { level: 'async' }))).toContain('--no-async-scheduling')
  })

  test('the keys wait behind their card for the owner\'s tables, and the card names the script, the pin and the question', () => {
    const markup = render(h(KeysWaiting, null))
    expect(markup).toContain("Waiting for the owner&#x27;s tables")
    expect(markup).toContain('scripts/tables/vllm-dispatch.py')
    expect(markup).toContain('Q-10')
    expect(markup).toContain('data-keys-waiting="waiting"')
    expect(markup).toContain('BatchExecutionDescriptor')
    expect(markup).toContain('has_lora')
  })
})

describe('the live line', () => {
  test('says the step, its tokens, its padding, its launches and a wait; the run served against the reference run; and the stage changed', () => {
    const before = play(start('graphs'), { t: 'commit', prediction: 0 })
    const after = play(before, { t: 'run', until: 'step' }, { t: 'run', until: 'step' })
    expect(fullChangeLine(fullSession.view(play(before, { t: 'run', until: 'step' })), fullSession.view(after))).toMatch(/^Step 2: \d+ tokens?, 336 launches/)
    const served = play(before, { t: 'run', until: 'decision' })
    expect(fullChangeLine(fullSession.view(before), fullSession.view(served))).toContain('it misses the bar')
    expect(fullChangeLine(fullSession.view(before), fullSession.view(play(before, { t: 'stage', to: 'sizes' })))).toBe('Capture sizes and padding.')
  })
})
