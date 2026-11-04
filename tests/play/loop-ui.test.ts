/*
 * Service's page as markup (GAMES.md §2.6, §3; A§6.9, D-048, D-049): what the 2D view, the controls, the mirror and the debrief put on
 * the page, rendered on the server so that the structure a screen reader and a stylesheet get can be read. What needs a DOM, a focus
 * or a timer (the roving tabindex, Auto, the live region as it speaks) is walked in a browser by the task's own run.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { finishRun, startRun, applyAction } from '@es/play'
import { askOf, hang, initState, setOverlap, step } from '@es/play/loop/engine'
import { buildLevel } from '@es/play/loop/levels'
import { loopGhost, loopSession, loopView } from '@es/play/loop/session'
import type { LoopLevelId, LoopState, LoopView } from '@es/play/loop/types'
import { changeLine } from '@/games/loop/announce'
import { Controls } from '@/games/loop/Controls'
import { Debrief } from '@/games/loop/Debrief'
import Game from '@/games/loop/Game'
import { Mirror } from '@/games/loop/Mirror'
import type { LoopOutcome } from '@/games/loop/types'
import { View2D } from '@/games/loop/View2D'
import { fakeRun, handLevel, houseNight, statesOfHouseNight } from './loop-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/loop' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const levelState = (id: LoopLevelId, seed = 1): LoopState => initState(buildLevel(id, seed))
const fill = (s: LoopState, n: number): LoopState => {
  let state = s
  for (let i = 0; i < n; i++) state = hang(state, state.waiting[0])
  return state
}

/** A finished run as the shell hands it to the debrief: the grade, the debrief and the reference's view. */
function outcomeOf(state: LoopState): { outcome: LoopOutcome; ghost: LoopState } {
  const level = state.level
  const ghost = loopGhost(level)
  let run = startRun(loopSession, { game: 'loop', level: level.id, seed: level.seed })
  // The state is reached by hand, so the run's own record is empty; the finish only needs the state and the level.
  run = { ...run, state }
  const finished = finishRun(loopSession, run)
  if (finished === null) throw new Error('the state is not finished')
  return { outcome: { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: loopView(finished.ghost) }, ghost }
}

describe('the page names the game as D-049 says, and opens on the first level', () => {
  test('the display name over its engine concept, the level and its mode on a tape label, and no working name', () => {
    const markup = render(h(Game, null))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">Service<\/h2><p class="es-type-body[^"]*">the step loop<\/p>/)
    expect(markup).toContain('Fill the rail · practice')
    expect(markup).toContain('data-game="loop"')
    expect(markup).not.toContain('The Loop')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-type-heading">Service<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'first-3-gap' }))).toContain('Mind the gap · practice')
    expect(render(h(Game, { level: 'first-4-par' }))).toContain('Your turn · practice')
    expect(render(h(Game, { level: 'close' }))).toContain('Fill the rail · practice')
    expect(render(h(Game, { level: 'constructor' }))).toContain('Fill the rail · practice')
  })

  test('has Play and Debrief and no other stage, a view switch only if it had a 3D scene, and the keys button', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('>Play</button>')
    expect(markup).toContain('>Debrief</button>')
    expect(markup).not.toContain('>Compose<')
    expect(markup).not.toContain('3D view')
    expect(markup).toContain('>Keys</button>')
  })

  test('keeps the notional-machine card to hand, in its three parts, with the tick costs as synthetic Readouts', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('What this world models')
    for (const part of ['Models.', 'Ignores.', 'Calibrated against.']) expect(markup).toContain(part)
    expect(count(markup.slice(markup.indexOf('data-loop-card')), /data-tag="synthetic"/g)).toBe(4)
  })
})

describe('the controls: Tap a ticket to hang it on the rail', () => {
  test('beat 1 offers six tickets as buttons named for what they do, one tab stop among them, and no overlap switch', () => {
    const markup = render(h(Controls, { run: fakeRun(levelState('first-1-fill')) }))
    for (const no of ['01', '02', '03', '04', '05', '06']) expect(markup).toContain(`aria-label="Hang ticket No. ${no} on the rail"`)
    expect(count(markup, /tabindex="0"/g)).toBe(1)
    expect(count(markup, /tabindex="-1"/g)).toBe(5)
    expect(markup).not.toContain('role="switch"')
    expect(markup).toContain('Tap a ticket to hang it on the rail (put a request in the batch)')
    expect(markup).toContain('aria-label="Ring the bell: fire the next step"')
  })

  test('the bell cannot ring and Auto cannot start while nothing is hung, and Auto says it is a switch and that Space works it', () => {
    const markup = render(h(Controls, { run: fakeRun(levelState('first-1-fill')) }))
    const ringDisabled = /<button[^>]*class="es-bell__button"[^>]*disabled=""/
    expect(markup).toMatch(ringDisabled)
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-keyshortcuts="Space"[^>]*disabled=""[^>]*>Auto<\/button>/)
    const hung = render(h(Controls, { run: fakeRun(fill(levelState('first-1-fill'), 2)) }))
    expect(hung).not.toMatch(ringDisabled)
    expect(hung).not.toMatch(/aria-pressed="false"[^>]*disabled=""/)
  })

  test('with every clip hung the waiting tickets are disabled and the page says why, and with none waiting it says so', () => {
    const full = render(h(Controls, { run: fakeRun(fill(levelState('first-1-fill'), 4)) }))
    expect(full).toContain('Every clip is hung: ring the bell.')
    expect(count(full, /aria-label="Hang ticket[^>]*disabled=""/g) + count(full, /disabled=""[^>]*aria-label="Hang ticket/g)).toBe(2)
    const none = render(h(Controls, { run: fakeRun(setOverlap(initState(handLevel([3])), true)) }))
    expect(none).toContain('Hang ticket No. 01')
    let allHung = hang(initState(handLevel([3, 3, 3, 3])), 0)
    for (const id of [1, 2, 3]) allHung = hang(allHung, id)
    expect(render(h(Controls, { run: fakeRun(allHung) }))).toContain('No tickets are waiting.')
  })

  test('from beat 3 on, one switch writes the next call during this fire, and its state is the lever\'s', () => {
    const off = render(h(Controls, { run: fakeRun(levelState('first-3-gap')) }))
    expect(off).toContain('role="switch"')
    expect(off).toContain('Write the next call during this fire')
    expect(off).toContain('overlap (async scheduling)')
    expect(off).toMatch(/role="switch"[^>]*aria-checked="false"/)
    const on = render(h(Controls, { run: fakeRun(setOverlap(levelState('first-3-gap'), true)) }))
    expect(on).toMatch(/role="switch"[^>]*aria-checked="true"/)
    expect(render(h(Controls, { run: fakeRun(levelState('first-2-slot')) }))).not.toContain('role="switch"')
  })
})

describe('the 2D view: the picture, the line\'s light and the clock', () => {
  test('is one image named by the state it shows, with the stations dark and the clock at 0 ticks, synthetic, before the first fire', () => {
    const markup = render(h(View2D, { run: fakeRun(levelState('first-1-fill')) }))
    expect(markup).toContain('data-loop-view')
    expect(markup).toContain('data-orientation="landscape"')
    expect(markup).toContain('role="img"')
    expect(markup).toContain('>dark<')
    expect(markup).toMatch(/Clock[^]*data-tag="synthetic"/)
    expect(markup).not.toContain('against par')
  })

  test('on the last level it shows par beside the clock, and the line lit while it cooks', () => {
    let s = setOverlap(levelState('first-4-par'), true)
    s = step(fill(s, 4))
    const markup = render(h(View2D, { run: fakeRun(s) }))
    expect(markup).toContain('against par')
    expect(markup).toContain('>98<')
    expect(markup).toContain('>busy<')
  })
})

describe('the mirror: every number the picture draws, and the printer tape beside it', () => {
  test('before a fire it says so, and carries the tape with the synthetic label on each figure and the kitchen\'s word beside the engine\'s term', () => {
    const markup = render(h(Mirror, { run: fakeRun(levelState('first-1-fill')) }))
    expect(markup).toContain('No fire has been rung yet.')
    expect(markup).toContain('id="mirror"')
    for (const term of ['useful tokens', 'ghost tokens', 'GPU busy', 'bubble', 'clock', 'ticks per step', 'clip paid for, empty']) expect(markup).toContain(term)
    // Seven figures are on the tape before a fire (the step clock says "not yet"), and each is a Readout that says synthetic.
    expect(count(markup, /data-tag="synthetic"/g)).toBe(7)
    expect(markup).toContain('Every figure is a synthetic tick or token.')
  })

  test('lists a row for each fire in the window, with its slots in words, how long the line was busy, the dark before it and its binned plates', () => {
    const state = setOverlap(fill(levelState('first-3-gap'), 0), true)
    let s = state
    while (s.reads < 4) s = step(fill(s, 4 - s.tray.filter((r) => r !== null).length))
    const markup = render(h(Mirror, { run: fakeRun(s) }))
    expect(markup).toContain('Slot 1: plate, ticket 01')
    expect(markup).toContain('binned plate, ticket')
    expect(markup).toContain('<th scope="col"')
    for (const head of ['Step', 'Slots', 'GPU busy', 'Bubble', 'Ghost tokens']) expect(markup).toContain(head)
    expect(markup).toContain('ticks, synthetic')
    expect(count(markup, /<tr[^>]*>/g)).toBe(1 + s.fires.length)
  })

  test('puts the heat lamp on the present fire only, and none once the night is over', () => {
    const level = buildLevel('first-4-par', 1)
    const states = [...statesOfHouseNight(level, { overlap: true })]
    const mid = render(h(Mirror, { run: fakeRun(states[Math.floor(states.length / 2)]) }))
    expect(count(mid, /data-lamp="true"/g)).toBe(1)
    const done = render(h(Mirror, { run: fakeRun(states[states.length - 1]) }))
    expect(count(done, /data-lamp="true"/g)).toBe(0)
  })

  test('adds up the fires older than the window in one row instead of dropping them, so the totals still match the tape', () => {
    const level = buildLevel('first-4-par', 1)
    const last = houseNight(level, { overlap: false })
    const markup = render(h(Mirror, { run: fakeRun(last) }))
    expect(markup).toContain('earlier: ')
    const view = loopView(last)
    // The row\'s busy ticks are the sum of the hidden fires\'.
    const hidden = Number(/earlier: (\d+)/.exec(markup)?.[1])
    expect(hidden).toBeGreaterThan(0)
    const busy = view.fires.slice(0, hidden).reduce((sum, fire) => sum + (fire.endUs - fire.startUs), 0)
    expect(markup).toContain(`>${busy}</td>`)
    expect(count(markup, /<tr[^>]*>/g)).toBe(1 + (view.fires.length - hidden) + 1)
  })
})

describe('the debrief and the end card', () => {
  const goalled = (id: LoopLevelId): LoopState => {
    let s = levelState(id)
    // The house plays it to the end.
    const ghost = loopGhost(s.level)
    s = ghost
    return s
  }

  test('a level before the last offers the next, the counters against the house\'s, and no compare, no anchor and no new numbers', () => {
    const { outcome } = outcomeOf(goalled('first-1-fill'))
    const run = fakeRun(goalled('first-1-fill'))
    const markup = render(h(Debrief, { run, outcome, next: { id: 'first-2-slot', title: 'A clip empties' }, onNext: () => undefined }))
    expect(markup).toContain('Well fired.')
    expect(markup).toContain('Next: A clip empties')
    expect(markup).toContain('Your service against the house&#x27;s')
    expect(count(markup, /<tbody>[^]*?<\/tbody>/g)).toBe(1)
    expect(count(markup, /<tr class="border-b border-paper-rule">/g)).toBe(5)
    expect(markup).not.toContain('The same night, served three ways')
    expect(markup).not.toContain('The real engine')
    expect(markup).not.toContain('New numbers')
    expect(markup).toContain('Play this level again')
  })

  test('a run that left a clip empty is told so, names the lever, and asks for a second go', () => {
    const level = buildLevel('first-2-slot', 1)
    let s = initState(level)
    s = step(step(s))
    s = step(s)
    const { outcome } = outcomeOf(s)
    const markup = render(h(Debrief, { run: fakeRun(s), outcome, next: { id: 'first-3-gap', title: 'Mind the gap' }, onNext: () => undefined }))
    expect(markup).toContain('Fire it again.')
    expect(markup).toContain('The lever worth the most:')
    expect(markup).toContain('Continuous batching: refilling a clip the moment it opens')
    expect(markup).toContain('A clip rode empty while a ticket waited.')
  })

  test('the last level is the end card: par against the clock, the night served three ways from one seed, the one true thing, the real engine, and the way on', () => {
    const state = goalled('first-4-par')
    const { outcome } = outcomeOf(state)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome, next: null, onNext: () => undefined }))
    expect(markup).toContain('Your service against par, the house&#x27;s run')
    // The compare view: your service, then firing the rail as a set, refilling clips, and refilling while the next call is written.
    expect([...markup.matchAll(/data-service="([a-z-]+)"/g)].map((match) => match[1])).toEqual(['mine', 'fired-as-set', 'refill', 'par'])
    expect(count(markup, /<svg [^>]*role="img"/g)).toBe(4)
    expect(markup).toContain('Static batching')
    expect(markup).toContain('Continuous batching with overlap (par)')
    expect(markup).toContain('firing the rail as a set')
    expect(markup).toContain('A decode step costs the GPU about the same with one request or four')
    // The real anchor: measured rows tagged with their source, and ratios derived.
    expect(markup).toContain('The real engine')
    expect(markup).toContain('ms, measured, InferenceX, published 2025-10-29')
    expect(markup).toContain('>11.8<')
    expect(markup).toContain('>19.5<')
    expect(markup).toMatch(/1\.66[^]*derived/)
    expect(markup).toMatch(/9\.7[^]*derived/)
    // The way on: the map is the primary action, TR2 is a link, and new numbers a button.
    expect(markup).toContain('Open the course map')
    expect(markup).toContain('href="/map"')
    expect(markup).toContain('Play the full loop (TR2)')
    expect(markup).toContain('href="/m/tr2"')
    expect(markup).toContain('New numbers')
  })

  test('the compare strips are the sim\'s three runs and the visitor\'s own on one scale, each with its clock, dark ticks and binned plates', () => {
    const state = goalled('first-4-par')
    const { outcome } = outcomeOf(state)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome, next: null, onNext: () => undefined }))
    // 255, 141 and 98 ticks are the practice seed's three services (tests/sim/steploop.test.ts).
    for (const clock of ['255', '141', '98']) expect(markup).toContain(`>${clock}<`)
    expect(markup).toContain('dark')
    expect(markup).toContain('binned plates')
  })
})

describe('what the live region says', () => {
  const level = buildLevel('first-3-gap', 1)
  const view = (s: LoopState): LoopView => loopView(s)

  test('a ticket hung is said with its number and its clip', () => {
    const before = view(initState(buildLevel('first-1-fill', 1)))
    const after = view(hang(initState(buildLevel('first-1-fill', 1)), 2))
    expect(changeLine(before, after)).toBe('Ticket 03 hung on clip 1.')
  })

  test('a fire is said with its plates and its empty places, and a clip that opens with a ticket waiting is said as a decision', () => {
    let s = fill(initState(buildLevel('first-1-fill', 1)), 3)
    const before = view(s)
    s = step(s)
    expect(changeLine(before, view(s))).toBe('Fire 1 rung: 3 plates, 1 empty place.')
    // Two tickets end at the third fire of beat 2, and the loop waits for the visitor.
    const second = initState(buildLevel('first-2-slot', 1))
    const mid = step(second)
    const ended = step(mid)
    expect(changeLine(view(mid), view(ended))).toBe('Fire 3 rung: 4 plates. A clip is open and a ticket waits.')
    expect(askOf(ended)).not.toBeNull()
  })

  test('a binned plate is said once it is known, and the overlap switch is said when it flips', () => {
    let s = setOverlap(initState(level), true)
    const lines: string[] = []
    let before = view(setOverlap(initState(level), false))
    lines.push(changeLine(before, view(s)))
    while (s.reads < 4) {
      before = view(s)
      s = step(s)
      lines.push(changeLine(before, view(s)))
    }
    expect(lines[0]).toBe('Overlap on: the next call is written during the fire.')
    expect(lines.some((line) => line.includes('2 plates were binned: a course fired for a ticket that had already ended.'))).toBe(true)
    expect(changeLine(view(s), view(setOverlap(s, false)))).toBe('Overlap off.')
  })

  test('nothing changed, or another level\'s view, is not said', () => {
    const v = view(initState(level))
    expect(changeLine(v, v)).toBe('')
    expect(changeLine(v, view(initState(buildLevel('first-1-fill', 1))))).toBe('')
  })

  test('a whole night is announced one sentence at a time, and every sentence is plain words (no markup, no raw numbers beyond counts)', () => {
    const lines: string[] = []
    const states = [...statesOfHouseNight(buildLevel('first-4-par', 1), { overlap: true })]
    states.forEach((s, i) => {
      if (i > 0) lines.push(changeLine(view(states[i - 1]), view(s)))
    })
    expect(lines.filter((line) => line !== '').length).toBeGreaterThan(30)
    for (const line of lines) expect(line).not.toMatch(/[<>&]/)
  })
})

describe('the first frame of the page is a decision to make', () => {
  test('the practice seed opens with an empty rail and six tickets waiting, so the first tap is possible at once', () => {
    const run = fakeRun(levelState('first-1-fill'))
    expect(run.view.rail.every((clip) => clip.req === null)).toBe(true)
    expect(run.view.waiting).toEqual([0, 1, 2, 3, 4, 5])
    expect(run.view.canHang).toBe(true)
    expect(run.view.deciding).toBe(true)
    expect(run.ask).not.toBeNull()
  })

  test('is untouched by playing: a level\'s first state, hash-wise, is the same each time it is built', () => {
    const a = applyAction(loopSession, startRun(loopSession, { game: 'loop', level: 'first-1-fill', seed: 1 }), { t: 'admit', req: 0 })
    const b = applyAction(loopSession, startRun(loopSession, { game: 'loop', level: 'first-1-fill', seed: 1 }), { t: 'admit', req: 0 })
    expect(a.state).toEqual(b.state)
  })
})
