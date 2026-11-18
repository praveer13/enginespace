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
import { LOOP_COPY } from '@es/play/loop/copy'
import { busyGuess, LOOP_MET, LOOP_MOMENTS, LOOP_PARTS, openingLine } from '@es/play/loop/parts'
import { DOCK, laneLayout } from '@es/play/loop/lanes'
import { findBanned } from '@/copy/banned'
import { introParts, introSteps } from '@/games/kit/first-move'
import { momentAt } from '@/games/kit/moments'
import { changeLine } from '@/games/loop/announce'
import { Controls } from '@/games/loop/Controls'
import { Debrief } from '@/games/loop/Debrief'
import { DockView } from '@/games/loop/DockView'
import Game from '@/games/loop/Game'
import { loopKit, loopStep, partRows } from '@/games/loop/kit'
import { Mirror } from '@/games/loop/Mirror'
import { readoutItems } from '@/games/loop/strip'
import { LoopReadout } from '@/games/loop/Tape'
import type { LoopOutcome } from '@/games/loop/types'
import { LoopLegend } from '@/games/loop/Legend'
import { Lanes, View2D } from '@/games/loop/View2D'
import { fakeRun, houseNight, statesOfHouseNight } from './loop-support'

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

describe('the page: the instrument frame around the timing diagram (REDESIGN §2.6, §3.5)', () => {
  test('the title, its role line, the level menu over all nine levels, the goal line, and the frame\'s tools', () => {
    const markup = render(h(Game, null))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-frame__title">Step loop<\/h2><p class="es-frame__role">You are the scheduler.<\/p>/)
    expect(markup).toContain('Level 1 of 9 · Fill the batch · practice')
    expect(markup).toContain('data-game="loop"')
    // The goal line: the aim, what the learner controls, the number to beat, and when it ends.
    for (const part of Object.values(LOOP_COPY['first-1-fill'].goal)) expect(markup).toContain(part.replaceAll("'", '&#x27;'))
    for (const tool of ['>Diagram<', '>3D<', '>Parts<', '>How to play<', '>Keyboard<']) expect(markup).toContain(tool)
    expect(markup).toContain('data-surface="2d"')
    expect(markup).toContain('data-loop-view=""')
    expect(markup).not.toContain('The Loop')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-frame__title">Step loop<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'first-3-gap' }))).toContain('Level 3 of 9 · Close a bubble · practice')
    expect(render(h(Game, { level: 'first-4-par' }))).toContain('Level 4 of 9 · Both levers · practice')
    expect(render(h(Game, { level: 'no-such-level' }))).toContain('Level 1 of 9 · Fill the batch · practice')
    expect(render(h(Game, { level: 'constructor' }))).toContain('Level 1 of 9 · Fill the batch · practice')
  })

  test('the title block says what the drawing models and its clock, and keeps the notional-machine card to hand', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('Model of the step loop, after vLLM v0.33.0')
    expect(markup).toContain('Clock: synthetic ticks, not a measurement')
    expect(markup).toContain('What this model leaves out')
    expect(markup).toContain('State as a table')
  })
})

describe('the timing diagram (REDESIGN §2.9, §3.1)', () => {
  test('a waiting-queue row of request chips that admit, one tab stop among them, then the CPU row and a row per slot that reads empty', () => {
    const markup = render(h(View2D, { run: fakeRun(levelState('first-1-fill')) }))
    expect(markup).toMatch(/<figure[^>]*data-loop-view=""[^>]*aria-label="Timing diagram, Fill the batch\. Waiting: 6\. Slots filled: 0 of 4\. Steps: 0\. Clock: 0 ticks, synthetic\."/)
    for (const no of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) expect(markup).toContain(`aria-label="Admit request ${no} into a batch slot"`)
    expect(count(markup, /class="es-lanes__chip"[^>]*tabindex="0"/g) + count(markup, /tabindex="0"[^>]*class="es-lanes__chip"/g)).toBe(1)
    expect(markup).toContain('data-lane-label="queue"')
    expect(markup).toContain('CPU · engine core thread')
    for (let slot = 0; slot < 4; slot++) expect(markup).toMatch(new RegExp(`data-lane-label="slot-${slot}"[^]*?slot ${slot + 1}[^]*?data-empty="">empty<`))
    expect(markup).toContain('synthetic ticks')
    // Now: the marker's cursor, and nothing else on the drawing is amber.
    expect(markup).toMatch(/data-lane-now=""[^]*?data-kind="cursor"/)
  })

  test('the intro\'s ring sits on the first move\'s chip, and a diagram drawn for the 3D view\'s fallback takes no press', () => {
    const ringed = render(h(View2D, { run: fakeRun(levelState('first-1-fill')), ring: 0 }))
    expect(ringed).toMatch(/data-kind="ring"[^]*?data-req="0"/)
    const still = render(h(View2D, { run: fakeRun(levelState('first-1-fill')), interactive: false }))
    expect(still).not.toContain('Admit request')
    expect(still).toContain('data-req="0"')
  })

  test('mid-run: each slot\'s label holds the request in it, forwards draw a token per slot, and a bubble is a dashed box with its width on a dimension line', () => {
    const s = levelState('first-3-gap')
    const markup = render(h(View2D, { run: fakeRun(s) }))
    expect(markup).toMatch(/data-lane-label="slot-0"[^]*?data-req="0">R1</)
    expect(markup).toContain('data-use="token"')
    expect(markup).toContain('data-call="schedule"')
    expect(markup).toContain('data-call="sync"')
    expect(markup).toMatch(/data-lane-idle="idle\/1"/)
    expect(markup).toMatch(/data-lane-dim="dim\/1"[^]*?>(bubble )?3 ticks</)
  })

  test('a dimension line is whole between its end ticks, its value over it; a sync is hatched, so its yellow is never one mark with now', () => {
    const markup = render(h(View2D, { run: fakeRun(levelState('first-3-gap')) }))
    const dim = markup.slice(markup.indexOf('data-lane-dim="dim/1"'), markup.indexOf('</g>', markup.indexOf('data-lane-dim="dim/1"')))
    // One path: the left end tick, the line from end to end, the right end tick; no break in the line for the value.
    const d = /class="es-lanes__dim" d="M([\d.]+) ([\d.]+)v14M([\d.]+) ([\d.]+)H([\d.]+)M([\d.]+) ([\d.]+)v14"/.exec(dim)
    expect(d).not.toBeNull()
    const [a, top, from, y, to, b] = (d ?? []).slice(1, 7).map(Number)
    expect([from, to]).toEqual([a, b])
    expect(y).toBe(top + 7)
    // The value stands over the line, not on it.
    const valueY = Number(/class="es-lanes__dim-text"[^>]*? y="([\d.]+)"/.exec(dim)?.[1])
    expect(valueY).toBeLessThan(y)
    expect([...dim.matchAll(/<line/g)]).toHaveLength(0)
    expect(markup).toContain('id="es-lanes-sync"')
  })

  test('the reference run of the same level and seed is drawn as outlines under the learner\'s run, from the first state, and named once', () => {
    const level = buildLevel('first-1-fill', 1)
    const reference = loopView(loopGhost(level))
    const first = loopView(initState(level))
    const markup = render(h(Lanes, { view: first, reference: { view: reference, ahead: true } }))
    // Four slots live in the reference's one step, and its CPU calls: every forward on a slot row an outline, and nothing of the learner's.
    expect([...markup.matchAll(/data-ref-slab="slot-(\d)\/0"/g)].map((match) => match[1])).toEqual(['0', '1', '2', '3'])
    expect(markup).toMatch(/data-ref-slab="cpu\/0\/schedule"/)
    expect(markup).not.toContain('data-use="token"')
    expect([...markup.matchAll(/class="es-lanes__ref-text"/g)]).toHaveLength(1)
    // While a guess about the run ahead is open, nothing of the reference past now is drawn.
    const hidden = render(h(Lanes, { view: first, reference: { view: reference, ahead: false } }))
    expect(hidden).not.toContain('data-ref-slab')
    // A diagram that is passed no reference draws none.
    expect(render(h(Lanes, { view: first }))).not.toContain('data-ref-slab')
  })

  test('the legend carries the code\'s colours as this diagram uses them, and the marker for now', () => {
    const markup = renderToStaticMarkup(h(LoopLegend))
    for (const word of ['CPU work: schedule', 'sync: tokens read back', 'GPU work: a forward, a token per slot', 'idle, or an empty slot', 'the CPU’s clock']) expect(markup).toContain(word)
  })
})

describe('the dock: what to do now, Step, and the levers', () => {
  test('before a slot holds a request, the prompt names the first request and Step is an outline that says why it waits', () => {
    const markup = render(h(Controls, { run: fakeRun(levelState('first-1-fill')) }))
    expect(markup).toContain('Tap R1 to admit it into slot 1.')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Step: fill a slot first<\/button>/)
    expect(markup).not.toContain('es-primary-button')
    expect(markup).not.toContain('role="switch"')
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-keyshortcuts="Space"[^>]*disabled=""[^>]*>Auto<\/button>/)
  })

  test('once a slot holds a request, Step is the amber primary button, the one control to act on now', () => {
    const markup = render(h(Controls, { run: fakeRun(fill(levelState('first-1-fill'), 4)) }))
    expect(markup).toContain('Press Step to run the next step.')
    expect(markup).toMatch(/class="es-primary-button"[^]*?<span class="es-primary-button__label">Step<\/span>/)
    expect(count(markup, /class="es-primary-button"/g)).toBe(1)
  })

  test('where the intro points at Step or the async switch, the marker\'s ring carries it and Step is not amber-filled', () => {
    const atStep = render(h(Controls, { run: fakeRun(levelState('first-2-slot')), ring: { t: 'run', until: 'step' } }))
    expect(atStep).toMatch(/data-kind="ring"[^]*?>Step<\/button>/)
    expect(atStep).not.toContain('es-primary-button')
    const atSwitch = render(h(Controls, { run: fakeRun(levelState('first-3-gap')), ring: { t: 'lever', name: 'async', value: true } }))
    expect(atSwitch).toMatch(/data-kind="ring"[^]*?role="switch"/)
  })

  test('a level that opens mid-run says so in its first line, with its step and the tokens already out', () => {
    expect(render(h(Controls, { run: fakeRun(levelState('first-2-slot')), opening: true }))).toContain('This run starts at step 2, with 4 tokens already out.')
    expect(render(h(Controls, { run: fakeRun(levelState('first-3-gap')), opening: true }))).toContain('This run starts at step 3, with 8 tokens already out.')
    expect(render(h(Controls, { run: fakeRun(levelState('first-1-fill')), opening: true }))).not.toContain('data-loop-opening')
    expect(render(h(Controls, { run: fakeRun(levelState('first-2-slot')), opening: false }))).not.toContain('data-loop-opening')
  })

  test('from level 3 on, one switch turns async scheduling on, and its state is the lever\'s', () => {
    const off = render(h(Controls, { run: fakeRun(levelState('first-3-gap')) }))
    expect(off).toContain('Async scheduling')
    expect(off).toContain('plan the next step while this one runs')
    expect(off).toMatch(/role="switch"[^>]*aria-checked="false"/)
    const on = render(h(Controls, { run: fakeRun(setOverlap(levelState('first-3-gap'), true)) }))
    expect(on).toMatch(/role="switch"[^>]*aria-checked="true"/)
    expect(render(h(Controls, { run: fakeRun(levelState('first-2-slot')) }))).not.toContain('role="switch"')
  })

  test('level 3 asks a guess in the view only: its numbers are the run\'s, and it is a form that dispatches nothing', () => {
    const guess = busyGuess(loopView(levelState('first-3-gap')))
    expect(guess).not.toBeNull()
    expect(guess!.window).toBe(7)
    expect(guess!.busy).toBe(4)
    const markup = render(h(Controls, { run: fakeRun(levelState('first-3-gap'), { dispatch: () => { throw new Error('the guess dispatched') } }) }))
    expect(markup).toContain('Async scheduling is off. Of the next 7 ticks, for how many is the GPU busy?')
    expect(markup).toContain('nothing records it')
    expect(render(h(Controls, { run: fakeRun(setOverlap(levelState('first-3-gap'), true)) }))).not.toContain('data-loop-guess')
    for (const id of ['first-1-fill', 'first-2-slot', 'first-4-par'] as const) expect(render(h(Controls, { run: fakeRun(levelState(id)) }))).not.toContain('data-loop-guess')
  })

  test('in the 3D view, which draws no chips, the dock lists the waiting requests as buttons', () => {
    const markup = render(h(Controls, { run: fakeRun(levelState('first-1-fill')), queue: true }))
    expect(markup).toContain('aria-label="Admit request R1 into a batch slot"')
    expect(render(h(Controls, { run: fakeRun(levelState('first-1-fill')) }))).not.toContain('Admit request')
  })

  test('the readout strip: step, tokens out, GPU busy and GPU idle under one stamp, with ghost tokens and the reference\'s clock where the level has them', () => {
    const ids = (id: LoopLevelId) => readoutItems(loopView(levelState(id))).map((item) => item.id)
    expect(ids('first-1-fill')).toEqual(['step', 'tokens', 'busy', 'idle'])
    expect(ids('first-3-gap')).toEqual(['step', 'tokens', 'busy', 'idle', 'ghost'])
    expect(ids('first-4-par')).toEqual(['step', 'tokens', 'busy', 'idle', 'ghost', 'clock'])
    const markup = renderToStaticMarkup(h(LoopReadout, { view: loopView(levelState('first-3-gap')), deltas: {} }))
    expect(count(markup, /class="es-stamp/g)).toBe(1)
    for (const label of ['step', 'tokens out', 'GPU busy', 'GPU idle', 'ghost tokens']) expect(markup).toContain(`>${label}</dt>`)
  })
})

describe('the dock view, for a lesson: the same lanes at 464 x 240', () => {
  test('draws the compact lanes with no control of their own, and the readout', () => {
    const view = loopView(levelState('first-3-gap'))
    const live = { view, place: { scope: 's', key: 'k', anchor: 'a' } } as unknown as Parameters<typeof DockView>[0]['run']
    const markup = renderToStaticMarkup(h(DockView, { run: live }))
    expect(markup).toContain('data-size="dock"')
    expect(markup).not.toContain('Admit request')
    expect(markup).not.toContain('es-partpop')
    expect(markup).toContain('data-loop-readout')
    const layout = laneLayout(view, DOCK)
    expect(DOCK.width).toBe(464)
    expect(DOCK.queueHeight + DOCK.queueGap + DOCK.lanesHeight).toBe(240)
    expect(layout.height).toBeLessThanOrEqual(240)
  })
})

describe('what the step loop gives the frame: parts, moments, the first move', () => {
  test('the parts table has a row for every drawn object, each with its claim or as a model object, and a callout anchor', () => {
    const ids = LOOP_PARTS.map((part) => part.id)
    expect(ids).toEqual(['waiting', 'slot', 'cpu', 'gpu', 'step', 'now', 'empty', 'bubble', 'async', 'ghost', 'reference'])
    for (const part of LOOP_PARTS) {
      expect(part.sentence.length).toBeGreaterThan(0)
      if (part.claim !== undefined) expect(part.claim).toMatch(/^[a-z0-9.-]+$/)
    }
    // A model object has no claim: the popover says "model object" for it.
    expect(LOOP_PARTS.filter((part) => part.claim === undefined).map((part) => part.id)).toEqual(['now', 'empty', 'ghost', 'reference'])
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const) for (const row of partRows(id)) expect(row.anchor).toBeDefined()
  })

  test('the first level\'s first run names the brief\'s five parts, and each later level adds what it draws', () => {
    expect(introParts(partRows('first-1-fill'), [], false).map((part) => part.id)).toEqual(['waiting', 'slot', 'cpu', 'gpu', 'step'])
    const met = ['waiting', 'slot', 'cpu', 'gpu', 'step']
    expect(introParts(partRows('first-2-slot'), met, false).map((part) => part.id)).toEqual(['now', 'empty', 'bubble'])
    expect(introParts(partRows('first-3-gap'), [...met, 'now', 'empty', 'bubble'], false).map((part) => part.id)).toEqual(['async', 'ghost', 'reference'])
  })

  test('no demo level asks a guess of the session: the first run is parts, then a real first move, the reference run\'s first', () => {
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const) {
      const kit = loopKit(id, 1)
      expect(kit.firstAsk).toBe('none')
      expect(introSteps(kit.firstAsk, false)).toEqual(['parts', 'move'])
      // The move is legal on the level's first state.
      const start = initState(buildLevel(id, 1))
      expect(() => loopSession.reduce(start, kit.firstMove!)).not.toThrow()
    }
    expect(loopKit('first-1-fill', 1).firstMove).toEqual({ t: 'admit', req: 0 })
    expect(loopKit('first-1-fill', 1).firstMoveWords).toBe('Admit R1 into a batch slot')
    expect(loopKit('first-2-slot', 1).firstMove).toEqual({ t: 'run', until: 'step' })
    expect(loopKit('first-3-gap', 1).firstMove).toEqual({ t: 'lever', name: 'async', value: true })
    expect(loopKit('first-4-par', 1).firstMoveWords).toBe('Turn async scheduling on')
  })

  test('the four named moments are each said once, the first time their rule occurs, over the four levels played in a row', () => {
    const said = new Map<string, string>()
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par'] as const) {
      const kit = loopKit(id, 1)
      const seen = new Set<string>()
      const states = [...statesOfHouseNight(buildLevel(id, 1), { overlap: id === 'first-3-gap' || id === 'first-4-par' })]
      // On level 2 a slot is left empty for a step, as a learner who does not refill would.
      const views = (id === 'first-2-slot' ? [initState(buildLevel(id, 1)), step(step(initState(buildLevel(id, 1))))] : states).map((state) => loopView(state))
      for (let i = 1; i < views.length; i++) {
        const named = momentAt(kit.moments, seen, views[i - 1], views[i], i)
        if (named === null) continue
        for (const moment of named.ids) {
          // Said once in the level, and never before its rule occurred: its line is the rule's own, for this pair of views.
          expect(seen.has(moment)).toBe(false)
          seen.add(moment)
          if (!said.has(moment)) said.set(moment, id)
        }
      }
    }
    expect([...said.keys()].sort()).toEqual(['batching', 'bubble', 'empty', 'ghost'])
    expect(said.get('batching')).toBe('first-1-fill')
    expect(said.get('ghost')).toBe('first-3-gap')
    // Each line is the brief's, in the engine's words.
    const batching = LOOP_MOMENTS.find((moment) => moment.id === 'batching')!
    const one = loopView(levelState('first-1-fill'))
    const after = loopView(step(fill(levelState('first-1-fill'), 4)))
    expect(batching.line(one, after)).toBe('A step costs the GPU about the same for one request as for four. That is batching.')
    expect(LOOP_MOMENTS.find((moment) => moment.id === 'bubble')!.line(loopView(levelState('first-3-gap')), loopView(step(levelState('first-3-gap'))))).toBe('That gap is a bubble: the GPU waited 3 ticks for the CPU.')
  })

  test('the lesson dock\'s Step admits a waiting request while a slot is free, then steps, and stops at the end', () => {
    expect(loopStep(loopView(levelState('first-1-fill')))).toEqual({ t: 'admit', req: 0 })
    expect(loopStep(loopView(fill(levelState('first-1-fill'), 4)))).toEqual({ t: 'run', until: 'step' })
    expect(loopStep(loopView(loopGhost(buildLevel('first-1-fill', 1))))).toBeNull()
  })
})

describe('the mirror: every number the picture draws, and the step readout beside it', () => {
  test('before a step it says so, and carries the readout with the synthetic label on each figure, in the engine\'s terms alone', () => {
    const markup = render(h(Mirror, { run: fakeRun(levelState('first-1-fill')) }))
    expect(markup).toContain('No step has run yet.')
    expect(markup).toContain('id="mirror"')
    for (const term of ['output tokens', 'ghost tokens', 'GPU busy', 'bubble', 'clock', 'ticks per step', 'empty slots, paid for']) expect(markup).toContain(term)
    // Seven figures are on the tape before a fire (the step clock says "not yet"), and each is a Readout that says synthetic.
    expect(count(markup, /data-tag="synthetic"/g)).toBe(7)
    expect(markup).toContain('Every figure is a synthetic tick or token.')
  })

  test('lists a row for each step in the window, with its slots in words, how long the GPU was busy, the bubble before it and its ghost tokens', () => {
    const state = setOverlap(fill(levelState('first-3-gap'), 0), true)
    let s = state
    while (s.reads < 4) s = step(fill(s, 4 - s.tray.filter((r) => r !== null).length))
    const markup = render(h(Mirror, { run: fakeRun(s) }))
    expect(markup).toContain('Slot 1: output token, request R1')
    expect(markup).toContain('ghost token, request R')
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

  test('a level before the last offers the next, the counters against the reference run\'s, and no compare, no anchor and no new numbers', () => {
    const { outcome } = outcomeOf(goalled('first-1-fill'))
    const run = fakeRun(goalled('first-1-fill'))
    const markup = render(h(Debrief, { run, outcome, next: { id: 'first-2-slot', title: 'A clip empties' }, onNext: () => undefined }))
    expect(markup).toContain('Passed.')
    expect(markup).toContain('Next: A clip empties')
    expect(markup).toContain('Your run against the reference run&#x27;s')
    expect(count(markup, /<tbody>[^]*?<\/tbody>/g)).toBe(1)
    // Level 1 draws no ghost token, bubble or paid-for empty slot: a counter that is nothing in both runs is left out of the table.
    expect(count(markup, /<tr class="border-b border-paper-rule">/g)).toBe(2)
    expect(markup).toContain('Clock (ticks, synthetic)')
    expect(markup).not.toContain('Ghost tokens')
    expect(markup).not.toContain('The same requests, served three ways')
    expect(markup).not.toContain('The real engine')
    expect(markup).not.toContain('New numbers')
    expect(markup).toContain('Play this level again')
  })

  test('a run that left a slot empty is told so, names the lever, and asks for a second go', () => {
    const level = buildLevel('first-2-slot', 1)
    let s = initState(level)
    s = step(step(s))
    s = step(s)
    const { outcome } = outcomeOf(s)
    const markup = render(h(Debrief, { run: fakeRun(s), outcome, next: { id: 'first-3-gap', title: 'Mind the gap' }, onNext: () => undefined }))
    expect(markup).toContain('Not yet.')
    expect(markup).toContain('The lever worth the most:')
    expect(markup).toContain('Continuous batching: refilling a slot the moment it frees')
    expect(markup).toContain('A slot ran empty while a request waited.')
  })

  test('the last level is the end card: the reference run against the clock, the same requests served three ways from one seed, the one true thing, the real engine, and the way on', () => {
    const state = goalled('first-4-par')
    const { outcome } = outcomeOf(state)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome, next: null, onNext: () => undefined }))
    expect(markup).toContain('Your run against the reference run, whose clock is the number to beat')
    // The compare view: your run, then the batch run as a set, a slot refilled the moment it frees, and refilling with async scheduling.
    expect([...markup.matchAll(/data-service="([a-z-]+)"/g)].map((match) => match[1])).toEqual(['mine', 'fired-as-set', 'refill', 'par'])
    expect(count(markup, /<svg [^>]*role="img"/g)).toBe(4)
    expect(markup).toContain('Static batching')
    expect(markup).toContain('Continuous batching with async scheduling (the reference)')
    expect(markup).toContain('the batch runs as a set, then the next one starts')
    expect(markup).toContain('A decode step costs the GPU about the same with one request or four')
    // The real anchor: measured rows tagged with their source, and ratios derived.
    expect(markup).toContain('The real engine')
    expect(markup).toContain('ms, measured, InferenceX, published 2025-10-29')
    expect(markup).toContain('>11.8<')
    expect(markup).toContain('>19.5<')
    expect(markup).toMatch(/1\.66[^]*derived/)
    expect(markup).toMatch(/9\.7[^]*derived/)
    // The way on: the course is the primary action, TR2 is a link, and new numbers a button.
    expect(markup).toContain('Open the course')
    expect(markup).toContain('href="/map"')
    expect(markup).toContain('Play the full loop (TR2)')
    expect(markup).toContain('href="/m/tr2"')
    expect(markup).toContain('New numbers')
  })

  test('the compare strips are the sim\'s three runs and the visitor\'s own on one scale, each with its clock, bubble ticks and ghost tokens', () => {
    const state = goalled('first-4-par')
    const { outcome } = outcomeOf(state)
    const markup = render(h(Debrief, { run: fakeRun(state), outcome, next: null, onNext: () => undefined }))
    // 255, 141 and 98 ticks are the practice seed's three services (tests/sim/steploop.test.ts).
    for (const clock of ['255', '141', '98']) expect(markup).toContain(`>${clock}<`)
    expect(markup).toContain('bubble <')
    expect(markup).toContain('ghost tokens <')
  })
})

describe('what the live region says', () => {
  const level = buildLevel('first-3-gap', 1)
  const view = (s: LoopState): LoopView => loopView(s)

  test('a request admitted is said with its name and its slot', () => {
    const before = view(initState(buildLevel('first-1-fill', 1)))
    const after = view(hang(initState(buildLevel('first-1-fill', 1)), 2))
    expect(changeLine(before, after)).toBe('Request R3 admitted into slot 1.')
  })

  test('a step is said with its output tokens and its empty slots, and a slot that frees with a request waiting is said as a decision', () => {
    let s = fill(initState(buildLevel('first-1-fill', 1)), 3)
    const before = view(s)
    s = step(s)
    expect(changeLine(before, view(s))).toBe('Step 1 ran: 3 output tokens, 1 empty slot.')
    // Two requests finish at the third step of beat 2, and the loop waits for the visitor.
    const second = initState(buildLevel('first-2-slot', 1))
    const mid = step(second)
    const ended = step(mid)
    expect(changeLine(view(mid), view(ended))).toBe('Step 3 ran: 4 output tokens. A slot is free and a request waits.')
    expect(askOf(ended)).not.toBeNull()
  })

  test('a ghost token is said once it is known, and the async scheduling switch is said when it flips', () => {
    let s = setOverlap(initState(level), true)
    const lines: string[] = []
    let before = view(setOverlap(initState(level), false))
    lines.push(changeLine(before, view(s)))
    while (s.reads < 4) {
      before = view(s)
      s = step(s)
      lines.push(changeLine(before, view(s)))
    }
    expect(lines[0]).toBe('Async scheduling on: the next step is planned while this one runs.')
    expect(lines.some((line) => line.includes('2 ghost tokens were computed for a request that had already finished.'))).toBe(true)
    expect(changeLine(view(s), view(setOverlap(s, false)))).toBe('Async scheduling off.')
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

/**
 * The four demo levels read in the engine's words (R-T14, REDESIGN §2.7): no word and no phrase the copy guard bans reaches a learner,
 * in a view's text, in its labels, or in a line the live region says. The rendered routes are the e2e scan's; this is the same guard over
 * the markup the components write on the server.
 */
describe('the demo levels say nothing in the kitchen\'s words', () => {
  const IDS: readonly LoopLevelId[] = ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par']
  /** What a reader meets in markup: its text, and the attributes that name or describe something. */
  const readable = (markup: string): string[] => [
    ...markup
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((line) => line.replaceAll('&#x27;', "'").replaceAll('&amp;', '&').trim())
      .filter((line) => line !== ''),
    ...[...markup.matchAll(/ (?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((match) => match[1].replaceAll('&#x27;', "'").replaceAll('&amp;', '&')),
  ]
  const banned = (markup: string): string[] => readable(markup).flatMap((text) => findBanned(text).map((found) => `${found.match} (${found.rule}) in "${text.slice(0, 80)}"`))

  test('the page, its controls, its drawing and its mirror, at the start and mid-run, on every level', () => {
    for (const id of IDS) {
      const states = [...statesOfHouseNight(buildLevel(id, 1), { overlap: id === 'first-3-gap' || id === 'first-4-par' })]
      expect(banned(render(h(Game, { level: id })))).toEqual([])
      for (const s of [levelState(id), states[Math.floor(states.length / 2)], states[states.length - 1]]) {
        const run = fakeRun(s)
        expect(banned(render(h(Controls, { run })) + render(h(View2D, { run })) + render(h(Mirror, { run })))).toEqual([])
      }
    }
  })

  test('the debrief and the end card, on every level, whether the run passed or not', () => {
    const empty = step(step(step(initState(buildLevel('first-2-slot', 1)))))
    const runs: [LoopLevelId, LoopState][] = [...IDS.map((id): [LoopLevelId, LoopState] => [id, loopGhost(levelState(id).level)]), ['first-2-slot', empty]]
    for (const [id, s] of runs) {
      const next = id === 'first-4-par' ? null : { id: 'first-2-slot', title: 'Refill a slot' }
      expect(banned(render(h(Debrief, { run: fakeRun(s), outcome: outcomeOf(s).outcome, next, onNext: () => undefined })))).toEqual([])
    }
  })

  test('the parts table, the named moments, the opening lines, the guess and the first moves', () => {
    const lines: string[] = []
    for (const part of LOOP_PARTS) lines.push(part.name, part.sentence)
    for (const id of IDS) {
      const states = [...statesOfHouseNight(buildLevel(id, 1), { overlap: id === 'first-3-gap' || id === 'first-4-par' })].map((state) => loopView(state))
      for (let i = 1; i < states.length; i++) for (const moment of LOOP_MOMENTS) lines.push(moment.line(states[i - 1], states[i]) ?? '')
      const kit = loopKit(id, 1)
      lines.push(kit.firstMoveWords, kit.stepWords ?? '', openingLine(states[0]) ?? '', busyGuess(states[0])?.question ?? '', busyGuess(states[0])?.reveal ?? '', LOOP_MET[id])
      lines.push(renderToStaticMarkup(h(LoopReadout, { view: states[states.length - 1], deltas: {} })))
    }
    expect(lines.flatMap((line) => findBanned(line).map((found) => `${found.match} in "${line.slice(0, 80)}"`))).toEqual([])
  })

  test('every line the live region says over a whole run', () => {
    for (const id of IDS) {
      const states = [...statesOfHouseNight(buildLevel(id, 1), { overlap: id !== 'first-1-fill' && id !== 'first-2-slot' })]
      for (let i = 1; i < states.length; i++) expect(findBanned(changeLine(loopView(states[i - 1]), loopView(states[i])))).toEqual([])
    }
  })
})
