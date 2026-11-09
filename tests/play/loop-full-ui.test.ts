/*
 * The full service on Service's page, as markup (GAMES.md §2.6, §3.2; A§6.9; D-048, D-049): what the docket, the controls, the tape, the
 * mirror, the debrief, Compose, In production, Build this and the `keys` card put on the page, rendered on the server. What needs a DOM, a
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
import { fullSession } from '@es/play/loop/full/session'
import type { FullAction, FullLevelId, FullState } from '@es/play/loop/full/types'
import FullService from '@/games/loop/FullService'
import Game from '@/games/loop/Game'
import { KeysWaiting } from '@/games/loop/KeysWaiting'
import { BuildThis } from '@/games/loop/full/BuildThis'
import { Compose } from '@/games/loop/full/Compose'
import { FullControls } from '@/games/loop/full/FullControls'
import { FullDebrief } from '@/games/loop/full/FullDebrief'
import { FullMirror } from '@/games/loop/full/FullMirror'
import { FullTape } from '@/games/loop/full/FullTape'
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

describe('the docket: Service\'s levels under its name', () => {
  test('the first service\'s four, the full service\'s five, and the keys behind their card, waiting', () => {
    const markup = render(h(Game, null))
    const docket = markup.slice(markup.indexOf('data-loop-docket'), markup.indexOf('</nav>', markup.indexOf('data-loop-docket')))
    for (const title of ['First service', 'Fill the rail', 'Your turn', 'The full service', 'Write during the fire', 'Drilled routines', 'The V2 runner', 'Close the bubbles', 'The allergy card', 'Keys']) {
      expect(docket).toContain(title)
    }
    expect(docket).toContain('· waiting')
    expect(docket).toMatch(/aria-current="true"[^>]*>Fill the rail/)
  })

  test('a lesson that embeds the game names its level, so the docket is left out', () => {
    expect(render(h(Game, { placement: 'embed' }))).not.toContain('data-loop-docket')
  })
})

describe('the full service\'s page', () => {
  test('names the game as D-049 says, opens on the level it is given, with its stages and every stage of the play sequence', () => {
    const markup = render(h(FullService, { level: 'async', onLevel: () => undefined }))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">Service<\/h2>/)
    expect(markup).toContain('Write during the fire · practice')
    for (const stage of ['>Play</button>', '>Debrief</button>', '>Compose</button>', '>In production</button>', '>Build this</button>']) expect(markup).toContain(stage)
    expect(markup).toContain('aria-label="Stages of the level"')
    expect(markup).toContain('>70B on H100')
    expect(markup).toContain('data-full-view')
    expect(markup).toContain('What this world models')
    // The tape follows the controls, in their column; the mirror stands under the view's switches.
    const at = ['data-shell-column="controls"', 'data-full-controls', 'es-printer', 'aria-label="Stages of this game"', 'Mirror · '].map((text) => markup.indexOf(text))
    expect(at.every((index, i) => index > -1 && (i === 0 || index > at[i - 1]))).toBe(true)
  })

  test('the controls: the prediction first, under the lamp, then the stage\'s lever, the bell, Auto and the rest of the night', () => {
    const markup = render(h(FullControls, { run: runOf(start('async')) }))
    expect(markup).toContain('data-full-prediction="open"')
    expect(markup).toContain('>Call it')
    expect(markup).toContain('Write the next call during this fire')
    expect(markup).toContain('async scheduling')
    expect(markup).toContain('Serve the rest')
    expect(markup).toContain('Call the prediction first')
    const called = render(h(FullControls, { run: runOf(play(start('async'), { t: 'commit', prediction: 12000 }, { t: 'run', until: 'decision' })) }))
    expect(called).toContain('data-full-prediction="called"')
    expect(called).toContain('12,000 µs')
    expect(called).toContain('Nights served')
  })

  test('the modes: five plates, the mode the backend lets run, and the routines\' memory against the room the reach-in spares', () => {
    const run = runOf(play(start('graphs'), { t: 'stage', to: 'modes' }))
    const markup = render(h(FullControls, { run }))
    for (const mode of ['FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE · call each dish']) expect(markup).toContain(mode)
    expect(markup).toContain('data-full-resolved')
    expect(markup).toContain('data-full-memory')
    expect(markup).toMatch(/the reach-in can spare/)
  })

  test('the rack\'s ladder: a plate a size, pressed for each mold, with vLLM\'s and SGLang\'s lists beside it', () => {
    const markup = render(h(FullControls, { run: runOf(play(start('graphs'), { t: 'stage', to: 'sizes' })) }))
    expect((markup.match(/es-full-ladder__size/g) ?? []).length).toBe(12)
    expect((markup.match(/aria-pressed="true"[^>]*es-full-ladder__size|es-full-ladder__size[^>]*aria-pressed="true"/g) ?? []).length).toBeGreaterThan(0)
    expect(markup).toContain('vLLM&#x27;s own list starts')
    expect(markup).toContain('SGLang&#x27;s decode buckets start')
  })

  test('the tape and the mirror print µs on the model\'s clock with the card\'s tags: never ticks', () => {
    const run = runOf(play(start('async'), { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }, { t: 'run', until: 'step' }))
    // The tape stands beside the controls (the shell's `beside`), the mirror under the view.
    const markup = render(h(FullMirror, { run })) + render(h(FullTape, { view: run.view }))
    expect(markup).toContain("the model&#x27;s clock · line derived, expo estimated")
    expect(markup).toContain('data-tag="derived"')
    expect(markup).toContain('data-tag="estimated"')
    expect(markup).not.toContain('ticks')
    expect(markup).toContain('GPU busy')
    const smallRun = runOf(play(start('async'), { t: 'stage', to: 'small' }, { t: 'commit', prediction: 0 }, { t: 'run', until: 'step' }))
    const small = render(h(FullMirror, { run: smallRun })) + render(h(FullTape, { view: smallRun.view }))
    expect(small).toContain("the model&#x27;s clock · synthetic")
    expect(small).not.toContain('data-tag="derived"')
  })
})

describe('the debrief, Compose, In production and Build this', () => {
  test('the house\'s run is well served; a naive one names the lever worth the most', () => {
    const level = fullSession.level('mrv2', 0)
    const good = outcomeOf(fullSession.ghost(level))
    expect(render(h(FullDebrief, { run: runOf(fullSession.ghost(level)), outcome: good, next: null, onNext: () => undefined }))).toContain('Well served.')
    let naive = fullSession.init(level)
    for (const stage of level.stages) {
      naive = play(naive, { t: 'stage', to: stage.id }, { t: 'commit', prediction: 0 })
      for (let i = 0; i < 3 && !naive.stages[naive.at].served.some((n) => n.ok); i++) naive = play(naive, { t: 'run', until: 'decision' })
    }
    const markup = render(h(FullDebrief, { run: runOf(naive), outcome: outcomeOf(naive), next: { id: 'mask', title: 'The allergy card' }, onNext: () => undefined }))
    expect(markup).toContain('Serve it again.')
    expect(markup).toContain('The lever worth the most:')
    expect(markup).toContain('the model runner')
    expect(markup).toContain('Next: The allergy card')
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
    expect(markup).toContain('Run my policy on tonight and on three fresh nights')
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
    expect(render(h(BuildThis, { level: 'async' }))).toContain('tr3.profile.s4')
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
  test('says the fire, its plates, its padding, its calls and a wait; the night served against the house; and the stage changed', () => {
    const before = play(start('graphs'), { t: 'commit', prediction: 0 })
    const after = play(before, { t: 'run', until: 'step' }, { t: 'run', until: 'step' })
    expect(fullChangeLine(fullSession.view(play(before, { t: 'run', until: 'step' })), fullSession.view(after))).toMatch(/^Fire 2: \d+ plates?, 336 calls/)
    const served = play(before, { t: 'run', until: 'decision' })
    expect(fullChangeLine(fullSession.view(before), fullSession.view(served))).toContain('it misses the bar')
    expect(fullChangeLine(fullSession.view(before), fullSession.view(play(before, { t: 'stage', to: 'sizes' })))).toBe('The mold rack.')
  })
})
