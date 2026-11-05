/*
 * Back of House's page as markup (GAMES.md §2.6, §5; A§6.9, D-048, D-049): what the 2D view, the controls, the mirror and the debrief put on
 * the page, rendered on the server so that the structure a screen reader and a stylesheet get can be read. What needs a DOM, a focus or a
 * timer (the roving tabindex as it moves, the live region as it speaks, the ink in the drawing) is walked in a browser by
 * e2e/engine-floor.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { finishRun, startRun } from '@es/play'
import { floorGhost, floorInit, floorReduce, floorSession, floorView } from '@es/play/engine-floor/session'
import type { FloorAction, FloorState } from '@es/play/engine-floor/types'
import { changeLine } from '@/games/engine-floor/announce'
import { Controls } from '@/games/engine-floor/Controls'
import { Debrief } from '@/games/engine-floor/Debrief'
import Game from '@/games/engine-floor/Game'
import { Mirror } from '@/games/engine-floor/Mirror'
import { handoffWords, permalink, plain, splitCode } from '@/games/engine-floor/text'
import type { FloorOutcome } from '@/games/engine-floor/types'
import { fakeRun, laidTo, levelOf, ranTo, truthOf, walk } from './engine-floor-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/engine-floor' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const vllm = levelOf('vllm')
const nano = levelOf('nano')

/** A finished run as the shell hands it to the debrief: the grade, the debrief and the reference's view. */
function outcomeOf(state: FloorState): FloorOutcome {
  let run = startRun(floorSession, { game: 'engine-floor', level: state.level.id, seed: state.level.seed })
  run = { ...run, state }
  const finished = finishRun(floorSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: floorView(finished.ghost) }
}

/** A path with a stage that does not hold, run, and then fixed and finished: a run whose first mistake the debrief names. */
function mistaken(level = vllm): FloorState {
  const wrong: FloorAction[] = [{ t: 'commit', prediction: 3 }, ...level.reference.slice(0, 4).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'lay', stage: level.reference[5] }, { t: 'run' }]
  return walk(level, ...wrong, { t: 'unlay', to: 4 }, ...level.reference.slice(4).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' })
}

describe('the page names the game as D-049 says, and opens on the first level', () => {
  test('the display name over its engine concept, the level and its mode on a tape label, and no working name', () => {
    const markup = render(h(Game, null))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">Back of House<\/h2><p class="es-type-body[^"]*">a request&#x27;s lifecycle<\/p>/)
    expect(markup).toContain('nano-vllm · practice')
    expect(markup).toContain('data-game="engine-floor"')
    expect(markup).not.toContain('The Engine Floor')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-type-heading">Back of House<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'abort' }))).toContain('vLLM, the client leaves · practice')
    expect(render(h(Game, { level: 'sglang' }))).toContain('SGLang at the pin · practice')
    expect(render(h(Game, { level: 'map' }))).toContain('nano-vllm · practice')
    expect(render(h(Game, { level: 'constructor' }))).toContain('nano-vllm · practice')
  })

  test('has Play and Debrief and no other stage, the keys button, and no view switch: the game has no 3D scene yet, and its 2D view is the whole of it', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('>Play</button>')
    expect(markup).toContain('>Debrief</button>')
    expect(markup).not.toContain('>Compose<')
    expect(markup).toContain('>Keys</button>')
    expect(markup).not.toContain('aria-label="View"')
    expect(markup).not.toContain('3D view')
    expect(markup).toContain('data-surface="2d"')
  })

  test('keeps the notional-machine card to hand, in its three parts, and holds no number', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('What this world models')
    for (const part of ['Models.', 'Ignores.', 'Calibrated against.']) expect(markup).toContain(part)
    expect(markup.slice(markup.indexOf('data-floor-card'))).not.toMatch(/data-tag=/)
  })
})

describe('before the prediction: the drawing does not answer it, and the tray is closed', () => {
  const markup = render(h(Controls, { run: fakeRun(floorInit(vllm)) }))

  test('asks how many process boundaries a sampled token crosses, with a plate for each answer from none to five, and the stub is disabled until one is picked', () => {
    expect(markup).toContain('How many process boundaries does a sampled token cross on its way to the client?')
    for (const n of [0, 1, 2, 3, 4, 5]) expect(markup).toContain(`aria-label="${n} ${n === 1 ? 'boundary' : 'boundaries'}"`)
    expect(markup).not.toContain('aria-label="6 boundaries"')
    expect(count(markup, /aria-pressed="false"[^>]*aria-label="\d boundar/g) + count(markup, /aria-label="\d boundar[^>]*aria-pressed="false"/g)).toBe(6)
    expect(markup).toMatch(/<button[^>]*class="es-stub__pull"[^>]*disabled=""[^>]*>.*Commit the prediction/)
  })

  test('shows the scenario in words, which is the card of the level (engine, pin, features), and not the level\'s note, which is about the architecture', () => {
    expect(markup).toContain('streams its answer')
    expect(markup).toContain('one rank')
    expect(markup).toContain('no prefix hit')
    expect(markup).toContain('vllm-project/vllm at 4ba787e')
    expect(markup).toContain('read 2026-11-04')
    expect(markup).not.toContain('data-floor-prompt')
    expect(markup).not.toContain('batch_queue')
  })

  test('the tray says it is closed and shows no card, so that no place on a card answers the prediction', () => {
    expect(markup).toContain('The tray opens when the prediction is written down.')
    expect(markup).not.toContain('data-stage=')
    expect(markup).not.toContain('es-floor-tile')
    expect(count(markup, /es-ticket__head/g)).toBe(2)
  })

  test('the path says where the request begins and has its stub disabled', () => {
    expect(markup).toContain('Nothing is laid. The first stage starts where the request begins')
    expect(markup).toContain('client · http-client')
    expect(markup).toMatch(/<button[^>]*class="es-stub__pull"[^>]*disabled=""[^>]*>.*Run the path/)
  })
})

describe('the tray: hand-off cards, one tab stop, and a platform to narrow them', () => {
  const state = laidTo(vllm, 0)
  const markup = render(h(Controls, { run: fakeRun(state) }))

  test('the level\'s note appears once the prediction is written, with your prediction beside it', () => {
    expect(markup).toContain('data-floor-prompt')
    expect(markup).toContain('batch_queue')
    expect(markup).toMatch(/your prediction<\/span><\/span><span class="font-numeric[^"]*">2<\/span>/)
  })

  test('has a card for every stage left, each a button named for its hand-off, its label and its places, and the cards are one tab stop', () => {
    expect(count(markup, /data-stage="/g)).toBe(vllm.tray.length)
    expect(markup).toContain('data-count="26"')
    expect(markup).toContain('Lay spike · queue: the scheduler&#x27;s waiting queue. From engine-core · main to engine-core · main.')
    expect(markup).toContain('Lay dumbwaiter down · h2d: step inputs to the GPU (prepare_inputs). From engine-core · main to GPU of engine-core.')
    const tray = markup.slice(markup.indexOf('data-floor-tray'), markup.indexOf('data-floor-path'))
    expect(count(tray, /class="es-ticket es-floor-tile"[^>]*tabindex="0"/g) + count(tray, /tabindex="0"[^>]*class="es-ticket es-floor-tile"/g)).toBe(1)
    expect(count(tray, /tabindex="-1"/g)).toBe(vllm.tray.length - 1)
    expect(tray).toContain('data-native-keys="arrows"')
    expect(tray).not.toMatch(/data-stage="[^"]*"[^>]*disabled=""/)
  })

  test('the platforms narrow the tray: All, and one chip for each platform a card starts on, each with how many, and the one the ticket is on says so', () => {
    const chips = markup.slice(markup.indexOf('Show the stages that start on'), markup.indexOf('<ul'))
    expect(chips).toContain('>All</button>')
    const names = [...chips.matchAll(/aria-pressed="(?:true|false)"[^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)*)/g)].map((m) => m[1].replace(/<[^>]*>/g, '').trim())
    expect(names[0]).toBe('All')
    expect(names.some((name) => name.startsWith('client'))).toBe(true)
    expect(names.some((name) => name.startsWith('the line · GPU'))).toBe(true)
    expect(chips).toContain(' · here')
    // The counts add up to the tray's cards.
    const counts = [...chips.matchAll(/aria-hidden="true"> (\d+)<\/span>/g)].map((m) => Number(m[1]))
    expect(counts.reduce((a, b) => a + b, 0)).toBe(vllm.tray.length)
  })

  test('the tray closes once the ticket is home: the cards left in it are other engines\' stages, and it shows none', () => {
    for (const level of [vllm, nano]) {
      const done = render(h(Controls, { run: fakeRun(floorGhost(level)) }))
      expect(done).toContain('The ticket is home. The stages left in the tray belong to other engines.')
      expect(done).not.toContain('data-stage=')
    }
  })
})

describe('the path: an ordered list, one row for each stage, and the stub that runs it', () => {
  test('lists each laid stage in order with its number, hand-off and places, one tab stop among the rows, and the stub live', () => {
    const markup = render(h(Controls, { run: fakeRun(laidTo(vllm, 3)) }))
    const path = markup.slice(markup.indexOf('data-floor-path'))
    expect(path).toContain('aria-label="The laid path, in order"')
    expect(path).toContain('3 stages laid')
    expect(path).toContain('aria-label="Stage 1, not run yet: ticket window · ipc, POST /v1/completions (create_completion). From client · http-client to api-server · handler-task."')
    expect(count(path, /class="es-floor-row__main"[^>]*tabindex="0"/g) + count(path, /tabindex="0"[^>]*class="es-floor-row__main"/g)).toBe(1)
    expect(count(path, /class="es-floor-row__main"/g)).toBe(3)
    expect(path).not.toMatch(/<button[^>]*class="es-stub__pull"[^>]*disabled=""/)
    expect(path).toContain('aria-keyshortcuts="Backspace"')
    expect(path).not.toContain('Move up')
  })

  test('a stage that held is marked with a drawn tick and the word, and the foot line counts the runs and the stages that held', () => {
    const markup = render(h(Controls, { run: fakeRun(ranTo(vllm, 5)) }))
    const path = markup.slice(markup.indexOf('data-floor-path'))
    expect(count(path, /data-state="ran"/g)).toBe(5)
    expect(path).toContain('1 run')
    expect(path).toContain('5 held')
    expect(path).toContain('held: ticket window')
    expect(path).not.toContain('data-floor-stop')
    expect(path).toMatch(/<button[^>]*class="es-stub__pull"[^>]*disabled=""/)
  })

  test('a stage that stopped the ticket is struck, and the ticket says why from the stage\'s source: the sentence, the engine\'s own stage and the stage laid, each cited', () => {
    const state = walk(vllm, { t: 'commit', prediction: 2 }, ...vllm.reference.slice(0, 4).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'lay', stage: vllm.reference[5] }, { t: 'run' })
    const path = render(h(Controls, { run: fakeRun(state) }))
    const note = path.slice(path.indexOf('data-floor-stop'))
    expect(path).toContain('data-stop="thread"')
    expect(note).toContain('The ticket stopped at stage')
    expect(note).toContain('A change of thread inside a process needs a queue.')
    expect(note).toContain('What vLLM at the pin does here')
    expect(note).toContain('What was laid')
    expect(note).toContain('vllm/v1/engine/core.py')
    expect(note).toContain('self.input_queue.put_nowait((request_type, request))')
    expect(note).toContain('https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/engine/core.py#L')
    expect(note).toContain('Take the path back to where it stopped')
    expect(count(path, /data-state="struck"/g)).toBe(1)
    expect(path).toMatch(/aria-label="Stage 5, stopped the ticket:/)
  })
})

describe('the mirror: the ordered stage table (GAMES.md §5, 2D path)', () => {
  test('before anything is laid it says so, and has the columns the spec names: stage, mechanism, from, to and source', () => {
    const markup = render(h(Mirror, { run: fakeRun(floorInit(vllm)) }))
    for (const head of ['Stage', 'Mechanism', 'From', 'To', 'Source']) expect(markup).toContain(`>${head}</th>`)
    expect(markup).toContain('No stage is laid yet. Write the prediction, then lay the first stage from the tray.')
    expect(markup).toContain('The prediction is still to be written.')
    expect(markup).toContain('The marks on the drawing')
  })

  test('lists every laid stage: its mechanism and places in the engine\'s terms, what the run found, and a source link only for a stage a run has judged', () => {
    const state = floorReduce(floorReduce(ranTo(vllm, 4), { t: 'lay', stage: vllm.reference[4] }), { t: 'lay', stage: vllm.reference[5] })
    const markup = render(h(Mirror, { run: fakeRun(state) }))
    expect(count(markup, /role="rowheader"/g)).toBe(6)
    expect(markup).toContain('>ipc</span>')
    expect(markup).toContain('held')
    expect(count(markup, /not run yet/g)).toBe(2)
    expect(count(markup, /shown once the run has judged it/g)).toBe(2)
    expect(count(markup, /github\.com\/vllm-project\/vllm\/blob\/4ba787ec9959e566d3b587a796dff07673324da5\//g)).toBe(4)
  })

  test('says what the drawing says: the stages laid of the path\'s, how many held, which stopped the ticket and where it stands, and that every figure is a count of stages', () => {
    const state = walk(vllm, { t: 'commit', prediction: 2 }, ...vllm.reference.slice(0, 4).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'lay', stage: vllm.reference[5] }, { t: 'run' })
    const markup = render(h(Mirror, { run: fakeRun(state) }))
    expect(markup).toContain('<span class="font-numeric">5</span> stages laid')
    expect(markup).toContain('4</span> held in the last run')
    expect(markup).toContain('stage <span class="font-numeric">5</span> stopped the ticket')
    expect(markup).toContain('Every figure is a count of stages in the model.')
    expect(markup).toContain('stopped the ticket')
    expect(markup).toContain('data-lamp="true"')
  })

  test('the key lists each hand-off with its kitchen word, its engine term and what it does', () => {
    const markup = render(h(Mirror, { run: fakeRun(floorInit(nano)) }))
    for (const word of ['ticket window', 'window shelf', 'spike', 'hands at work', 'dumbwaiter down', 'call to the line', 'halves across', 'dumbwaiter up', '&quot;Heard!&quot;']) {
      expect([word, markup.includes(word)]).toEqual([word, true])
    }
    expect(markup).toContain('a hop between processes, over a socket')
  })
})

describe('the debrief: the first wrong stage, the prediction, and two houses side by side (GAMES.md §5, step 6)', () => {
  test('a path that held on its first run is told so, names nothing, and offers the next level and the course', () => {
    const state = floorGhost(nano)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next: { id: 'nano-tp', title: 'nano-vllm on two GPUs' }, onNext: () => undefined }))
    expect(markup).toContain('Every hand-off held.')
    expect(markup).toContain('Every hand-off held on the first run')
    expect(markup).not.toContain('data-floor-first-wrong')
    expect(markup).toContain('It was right: the path has')
    expect(markup).toContain('Next level: <strong class="text-text-1">nano-vllm on two GPUs</strong>')
    expect(markup).toContain('>Next level<')
    const last = render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next: null, onNext: () => undefined }))
    expect(last).toContain('Open the course map')
    expect(last).toContain('href="/m/tr1"')
  })

  test('a path that broke names the first stage that did not hold, with the engine\'s own stage and the one laid, from their sources', () => {
    const state = mistaken()
    const markup = render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next: null, onNext: () => undefined }))
    expect(markup).toContain('A hand-off broke.')
    expect(markup).toContain('The first stage that did not hold.')
    expect(markup).toContain('data-floor-first-wrong')
    expect(markup).toContain('What vLLM at the pin does there')
    expect(markup).toContain('What was laid')
    expect(markup).toMatch(/did not: <span class="font-numeric">4<\/span> of /)
    // This run predicted three, and the path has two: the debrief says what the path has, and not that it was right.
    expect(markup).not.toContain('It was right: the path has')
    expect(markup).toMatch(/The path has <span class="es-readout"[^>]*><data class="es-readout__value" value="2">/)
    expect(markup).toContain('Runs: <span class="font-numeric">2</span>')
  })

  test('lays the two houses side by side: both drawn whole, and the facts that differ set in bold with a word for a screen reader', () => {
    const state = floorGhost(vllm)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next: { id: 'sglang', title: 'SGLang at the pin' }, onNext: () => undefined }))
    expect(markup).toContain('Two houses, side by side')
    expect(count(markup, /data-floor-house=""/g)).toBe(2)
    expect(count(markup, /data-floor-house=""><svg /g)).toBe(2)
    expect(markup).toContain('SGLang at the pin</strong> has the order desk, which vLLM at the pin does not.')
    for (const term of ['Where detokenizing runs', 'Hops over ZMQ', 'Spikes (queues) on the path', 'Stages in the path']) expect(markup).toContain(term)
    expect(markup).toContain('api-server · output-handler-task')
    expect(markup).toContain('detokenizer · main')
    expect(markup).toContain('(the houses differ)')
    expect(markup).not.toContain('How the ranks get the batch')
  })

  test('two houses that agree say so by not emphasising: a one-rank level has no row for the ranks, and a two-rank one sets how each engine sends the batch', () => {
    const tp = levelOf('nano-tp')
    const state = floorGhost(tp)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next: null, onNext: () => undefined }))
    expect(markup).toContain('How the ranks get the batch')
    expect(markup).toContain('shm')
    expect(markup).toContain('ipc')
  })

  test('every count in it is a Readout that says it is derived, and the prediction is the learner\'s own, printed untagged', () => {
    const state = floorGhost(vllm)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome: outcomeOf(state), next: null, onNext: () => undefined }))
    expect(count(markup, /data-tag="derived"/g)).toBeGreaterThan(10)
    expect(markup).not.toMatch(/data-tag="(?:measured|synthetic)"/)
    expect(markup).toMatch(/<strong>Your prediction:<\/strong><span class="font-numeric[^"]*">2<\/span>/)
  })
})

describe('the live line says what changed, one sentence for a turn (A§6.9)', () => {
  const view = (state: FloorState) => floorView(state)

  test('the prediction, a stage laid, the path taken back, and a stage moved', () => {
    const start = floorInit(vllm)
    const committed = floorReduce(start, { t: 'commit', prediction: truthOf(vllm.scenario) })
    expect(changeLine(view(start), view(committed))).toBe('Prediction written down: 2 process boundaries. The tray is open.')
    const laid = floorReduce(committed, { t: 'lay', stage: vllm.reference[0] })
    expect(changeLine(view(committed), view(laid))).toBe('Laid stage 1: POST /v1/completions (create_completion).')
    expect(changeLine(view(laid), view(floorReduce(laid, { t: 'unlay' })))).toBe('The path is back to 0 stages.')
    const two = floorReduce(laid, { t: 'lay', stage: vllm.reference[1] })
    expect(changeLine(view(two), view(floorReduce(two, { t: 'move', from: 0, by: 1 })))).toContain('Stage 1 is now')
    expect(changeLine(view(laid), view(laid))).toBe('')
  })

  test('a run: how many held, where the ticket stopped and why in plain words, and that the ticket is home', () => {
    const laid = laidTo(vllm, 3)
    expect(changeLine(view(laid), view(floorReduce(laid, { t: 'run' })))).toContain('3 stages held.')
    const wrong = walk(vllm, { t: 'commit', prediction: 2 }, ...vllm.reference.slice(0, 4).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'lay', stage: vllm.reference[5] })
    const stopped = changeLine(view(wrong), view(floorReduce(wrong, { t: 'run' })))
    expect(stopped).toContain('The ticket stopped at stage 5, after 4 stages that held.')
    expect(stopped).toContain('A change of thread inside a process needs a queue.')
    expect(stopped).not.toContain('`')
    const almost = ranTo(nano, nano.reference.length - 1)
    const home = floorReduce(floorReduce(almost, { t: 'lay', stage: nano.reference[nano.reference.length - 1] }), { t: 'run' })
    expect(changeLine(view(almost), view(home))).toBe('The ticket is home: every hand-off held, and the request is back where it began.')
    expect(changeLine(view(laidTo(nano, 0)), view(laidTo(levelOf('vllm'), 0)))).toBe('')
  })
})

describe('the words of the page', () => {
  test('a text with the engine\'s names in backticks is split into plain and code, and the plain form drops the ticks', () => {
    expect(splitCode('POST `/v1/completions` (`create_completion`)')).toEqual([
      { code: false, text: 'POST ' },
      { code: true, text: '/v1/completions' },
      { code: false, text: ' (' },
      { code: true, text: 'create_completion' },
      { code: false, text: ')' },
    ])
    expect(plain('POST `/v1/completions` (`create_completion`)')).toBe('POST /v1/completions (create_completion)')
    expect(splitCode('``')).toEqual([])
  })

  test('a hand-off is said in the kitchen\'s word and then the engine\'s, and a source is linked at the commit it is cited at', () => {
    expect(handoffWords('queue')).toBe('spike · queue')
    expect(handoffWords('sync')).toBe('"Heard!" · sync')
    expect(permalink({ repo: 'a/b', ref: 'abc', path: 'x/y.py', symbol: 's', line: 7, quote: 'q' })).toBe('https://github.com/a/b/blob/abc/x/y.py#L7')
  })
})
