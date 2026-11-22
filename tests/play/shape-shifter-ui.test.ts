/*
 * W2-T14: Tensor views in the instrument frame (GAMES.md §4.1, §4.5, §4.6; REDESIGN §2.6). Without a browser:
 *
 *   1. The frame's five exports: the 2D diagram, the lesson's DockView, the parts on each level, the named moments and the first move.
 *   2. The pickers offer every operation the reference's plan takes, on every target of a practice level and of fresh `fewest` draws, so a
 *      keyboard can always play the reference's plan; and the cells' geometry stays inside its box at every width the frame draws.
 *   3. The named moments: each is named the first time the session records it, said in the engine's words, and the first run's first move is
 *      the reference's first action, which the dock rings, and nothing else.
 *   4. The dock, the readout, the mirror and the result render from the view: the guess holds back until the intro has named the parts, the
 *      graded `grid` hides its counts until Launch, and the mirror lists every element.
 *   5. The fewest-copies bar is the model's optimum: the reference's copies on each `fewest` target are what `fewestPlan` makes.
 *   6. What stays under the hand (hand.ts): a second press at the last press's spot, moments after it, on another control is ignored, a
 *      picker's choice and a control pressed again never are; the page's scrolls that seat the drawing, show a named part and show the goal
 *      at the result go only as far as they keep the dock pinned and the ways on in view.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fewestPlan } from '@es/sim/tensor'
import { startRun } from '@es/play'
import { GAMES } from '@es/play/registry'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { ghostActions, shiftInit, shiftLevel, shiftReduce, shiftSession } from '@es/play/shape-shifter/session'
import type { ShiftAction, ShiftLevelId, ShiftState } from '@es/play/shape-shifter/types'
import { findBanned } from '@/copy/banned'
import { Controls } from '@/games/shape-shifter/Controls'
import { DockView } from '@/games/shape-shifter/DockView'
import { cellsLayout, choicesOf, flatAt, keyAction } from '@/games/shape-shifter/focus'
import { moveWords, partRows, shiftKit, shiftMoments } from '@/games/shape-shifter/kit'
import { Mirror } from '@/games/shape-shifter/Mirror'
import { ReadoutStrip } from '@/games/shape-shifter/ReadoutStrip'
import type { ShiftRun } from '@/games/shape-shifter/types'
import { View2D } from '@/games/shape-shifter/View2D'
import { changeLine } from '@/games/shape-shifter/announce'
import { earlyKey, heldKey, KEY_SETTLE, resultBy, SAME_SPOT, SAME_TIME, scrollToShow, seatBy, seatInBoxBy, strayPress } from '@/games/shape-shifter/hand'

const repo = path.resolve(import.meta.dirname, '../..')
const LEVELS = SHAPE_SHIFTER.levels.map((level) => level.id as ShiftLevelId)
const practice = (id: ShiftLevelId) => shiftLevel(id, SHAPE_SHIFTER.levels.find((level) => level.id === id)?.practiceSeed ?? 0)

function fakeRun(state: ShiftState, over: Partial<ShiftRun> = {}): ShiftRun {
  const view = shiftSession.view(state)
  return {
    game: 'shape-shifter',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view,
    score: shiftSession.score(state),
    ask: shiftSession.ask(state),
    done: state.done,
    turns: state.history.length,
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
    ...over,
  }
}

/** The states of the reference's run on a level, after a committed guess. */
function walk(id: ShiftLevelId, seed?: number): ShiftState[] {
  const level = seed === undefined ? practice(id) : shiftLevel(id, seed)
  const states = [shiftInit(level)]
  states.push(shiftReduce(states[0], { t: 'commit', prediction: level.tasks[0].answer }))
  for (const action of ghostActions(level)) {
    let state = states[states.length - 1]
    // A later target's guess is optional: the reference skips it.
    state = shiftReduce(state, action)
    states.push(state)
  }
  return states
}

describe("the frame's five exports", () => {
  test('Game.tsx renders the frame with the diagram, the dock, the readout, the mirror and the result, and the kit gives DockView, parts, moments and a first move', () => {
    const game = readFileSync(path.join(repo, 'src/games/shape-shifter/Game.tsx'), 'utf8')
    for (const part of ['<Frame', '<View2D', '<Controls', '<ReadoutStrip', '<Mirror', '<Debrief']) expect([part, game.includes(part)]).toEqual([part, true])
    for (const id of LEVELS) {
      const kit = shiftKit(id, practice(id).seed)
      expect(kit.DockView).toBe(DockView)
      expect(kit.parts.length).toBeGreaterThan(0)
      expect(kit.parts.length).toBeLessThanOrEqual(5)
      expect(kit.moments).toBe(shiftMoments)
      expect(kit.firstMove).toEqual(ghostActions(practice(id))[0])
      expect(kit.firstMoveWords.length).toBeGreaterThan(5)
    }
  })

  test('each level has a goal line with its number, and the copy holds no banned word', () => {
    for (const id of LEVELS) {
      const view = shiftSession.view(shiftInit(practice(id)))
      const { goal } = view
      expect([id, /\d/.test(goal.beat)]).toEqual([id, true])
      for (const line of [goal.aim, goal.controls, goal.beat, goal.ends, view.predict.ask, ...partRows(id).map((part) => part.name)]) expect([id, line, findBanned(line)]).toEqual([id, line, []])
    }
  })

  test('the registry has the game, its loader brings the same record, and `fewest` is its Prove level', async () => {
    expect(GAMES.get('shape-shifter')).toBe(SHAPE_SHIFTER)
    const { GAME_RECORDS, GAME_COMPONENTS } = await import('@/games/registry')
    expect(await GAME_RECORDS['shape-shifter']()).toBe(SHAPE_SHIFTER)
    expect(GAME_COMPONENTS['shape-shifter']).toBeDefined()
    expect(SHAPE_SHIFTER.prove).toBe('fewest')
  })
})

describe('the pickers and the geometry', () => {
  test("every operation of the reference's plan is a choice of its button, on the practice levels and on 40 fresh `fewest` draws", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i)
    const levels = [...LEVELS.filter((id) => id !== 'grid').map(practice), ...seeds.map((seed) => shiftLevel('fewest', seed))]
    let checked = 0
    for (const level of levels) {
      let state = shiftInit(level)
      for (const action of ghostActions(level)) {
        if (action.t !== 'op') continue
        const run = state.runs[state.at]
        if (run.kind !== 'layout') throw new Error('a layout level')
        expect(level.kind === 'layout' && level.offered.includes(action.op.op)).toBe(true)
        const offered = choicesOf(action.op.op, run.view.shape)
        expect([level.id, level.seed, action.op, offered.some((op) => JSON.stringify(op) === JSON.stringify(action.op))]).toEqual([level.id, level.seed, action.op, true])
        state = shiftReduce(state, action)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  test('a picker never offers the shape the tensor has, and `contiguous()` applies at once', () => {
    expect(choicesOf('view', [4, 6]).some((op) => op.op === 'view' && op.shape.join() === '4,6')).toBe(false)
    expect(choicesOf('view', [4, 6]).some((op) => op.op === 'view' && op.shape.join() === '24')).toBe(true)
    expect(choicesOf('transpose', [2, 3, 4])).toHaveLength(3)
    expect(choicesOf('permute', [2, 3, 4])).toHaveLength(5)
    expect(choicesOf('contiguous', [4, 6])).toEqual([{ op: 'contiguous' }])
  })

  test('the cells stay inside their box at every width the frame draws, and keep to the height they are given', () => {
    const shapes = [[24], [64], [4, 6], [6, 4], [2, 32], [8, 8], [2, 4, 4], [4, 2, 8], [4, 4, 4], [2, 2, 6]]
    for (const room of [250, 300, 358, 432, 580]) {
      for (const shape of shapes) {
        const box = cellsLayout(shape, room, 300)
        const n = shape.reduce((p, d) => p * d, 1)
        expect(box.at).toHaveLength(n)
        // A box narrower than the 14 px floor allows for a wide rank-2 tensor scrolls inside the diagram; every other fits its width.
        if (box.size > 14) expect([shape, room, box.width <= room]).toEqual([shape, room, true])
        expect(box.size).toBeGreaterThanOrEqual(14)
        expect(box.size).toBeLessThanOrEqual(32)
        for (const at of box.at) expect(at.y + box.size).toBeLessThanOrEqual(box.height + 0.5)
      }
    }
    // One dimension wraps into rows of equal length.
    const wrapped = cellsLayout([24], 432)
    expect(new Set(wrapped.at.map((at) => at.y)).size).toBe(2)
  })
})

describe('the named moments and the first run', () => {
  test('`views` names `view-free` on its first move, with the strides before and after, and `copy` on the copy', () => {
    const states = walk('views')
    const views = states.map((state) => shiftSession.view(state))
    const said = new Set<string>()
    const lines: string[] = []
    for (let i = 1; i < views.length; i++) {
      for (const moment of shiftMoments) {
        if (said.has(moment.id)) continue
        const line = moment.line(views[i - 1], views[i])
        if (line !== null) {
          said.add(moment.id)
          lines.push(line)
        }
      }
    }
    expect(lines[0]).toBe('The buffer did not move. transpose is a view: the strides went from (6, 1) to (1, 6).')
    expect([...said]).toEqual(['view-free', 'copy'])
    for (const line of lines) expect([line, findBanned(line)]).toEqual([line, []])
  })

  test('the dock holds the guess back until the intro reaches its ask, and the ring is on the first move alone', () => {
    const level = practice('views')
    const state = shiftInit(level)
    const held = renderToStaticMarkup(h(Controls, { run: fakeRun(state, { intro: { askShown: false, ring: null } }), mode: 'practice' }))
    expect(held).not.toContain('data-shift-predict')
    expect(held).toContain('data-shift-bar')
    const asked = renderToStaticMarkup(h(Controls, { run: fakeRun(state), mode: 'practice' }))
    expect(asked).toContain('data-shift-predict')
    const after = shiftReduce(state, { t: 'commit', prediction: 24 })
    const ring = shiftKit('views', level.seed).firstMove
    const ringed = renderToStaticMarkup(h(Controls, { run: fakeRun(after, { intro: { askShown: true, ring } }), mode: 'practice' }))
    expect(ringed.match(/es-marker__ring/g)?.length).toBe(1)
    expect(ringed).toMatch(/es-marker__ring"><button[^>]*data-op="transpose"/)
    expect(moveWords(ring)).toBe('Apply transpose(0, 1)')
  })
})

describe('the drawing, the readout and the table', () => {
  test('every level draws its view, its mirror and its compact view at its start and at the end of the reference run', () => {
    for (const id of LEVELS) {
      const states = walk(id)
      for (const state of [states[0], states[states.length - 1]]) {
        const run = fakeRun(state)
        expect(renderToStaticMarkup(h(View2D, { run, pick: null, onPick: () => undefined }))).toContain('data-shift-view')
        expect(renderToStaticMarkup(h(Mirror, { run, pick: null, onPick: () => undefined }))).toContain('<table')
        expect(renderToStaticMarkup(h(DockView, { run: { view: run.view } as never }))).toContain('data-shift-dock')
        expect(renderToStaticMarkup(h(ReadoutStrip, { view: run.view }))).toContain('data-shift-readout')
      }
    }
  })

  test('the mirror lists every element with its index, address and number, and a buffer cell selects the element that reads it', () => {
    const state = shiftReduce(shiftReduce(shiftInit(practice('views')), { t: 'commit', prediction: 24 }), { t: 'op', op: { op: 'transpose', a: 0, b: 1 } })
    const run = fakeRun(state)
    const html = renderToStaticMarkup(h(Mirror, { run, pick: null, onPick: () => undefined }))
    expect(html.match(/data-row-button/g)?.length ?? html.match(/element-/g)?.length).toBeGreaterThanOrEqual(24)
    const layout = run.view.layout
    if (layout === null) throw new Error('a layout view')
    expect(flatAt(layout, 1)).toBe(4)
    expect(layout.table.map((row) => row.stride)).toEqual([1, 6])
    expect(layout.readouts.moved).toBe(0)
  })

  test("every target of a view level is drawn as its elements in order, and State as a table lists them with their index in the target", () => {
    for (const level of [shiftLevel('fewest', 11), shiftLevel('fewest', 12345), practice('views'), practice('three-d')]) {
      for (let at = 0; at < level.tasks.length; at++) {
        const task = level.tasks[at]
        if (task === undefined || !('goal' in task)) throw new Error('a layout task')
        const state: ShiftState = { ...shiftInit(level), at }
        const run = fakeRun(state)
        const drawn = renderToStaticMarkup(h(View2D, { run, pick: null, onPick: () => undefined }))
        expect(drawn).toContain('data-shift-target-elements')
        expect(drawn).toContain('aria-expanded="false"')
        expect([...drawn.matchAll(/data-goal-element="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([...task.goal.elements])
        const table = renderToStaticMarkup(h(Mirror, { run, pick: null, onPick: () => undefined }))
        expect(table).toContain("The target&#x27;s elements in logical order")
        for (const element of task.goal.elements) expect(table).toContain(`>${element}</span>`)
      }
    }
  })

  test('a graded `grid` shows its counts after Launch only, and `L` launches', () => {
    const level = shiftLevel('grid', 7)
    expect(level.graded).toBe(true)
    let state = shiftInit(level)
    const hidden = renderToStaticMarkup(h(ReadoutStrip, { view: shiftSession.view(state) }))
    expect(hidden).toContain('data-hidden')
    expect(keyAction('launch', shiftSession.view(state), false)).toEqual({ t: 'launch' })
    expect(keyAction('launch', shiftSession.view(shiftInit(practice('views'))), false)).toBeNull()
    if (level.kind !== 'grid') throw new Error('grid is a grid level')
    for (const action of ghostActions(level).slice(0, level.tasks[0].block.length)) state = shiftReduce(state, action)
    expect(shiftSession.view(state).grid?.readoutsShown).toBe(false)
  })

  test('the live line says a view and a copy in the engine\'s words', () => {
    const states = walk('views')
    const views = states.map((state) => shiftSession.view(state))
    expect(changeLine(views[1], views[2])).toContain('A view: the buffer did not move.')
    expect(changeLine(views[2], views[3])).toContain('A copy: 24 elements moved into a new buffer.')
  })
})

describe('the fewest-copies bar is the model\'s optimum', () => {
  test("on every target of 30 fresh `fewest` draws, the reference's copies are what `fewestPlan` makes, and the reference's run passes", () => {
    for (let seed = 2000; seed < 2030; seed++) {
      const level = shiftLevel('fewest', seed)
      if (level.kind !== 'layout') throw new Error('fewest is a layout level')
      for (const task of level.tasks) {
        const plan = fewestPlan(task.start, task.goal)
        expect([seed, plan?.copies]).toEqual([seed, task.copies])
      }
      const run = startRun(shiftSession, { game: 'shape-shifter', level: 'fewest', seed })
      let state = run.state as ShiftState
      for (const action of ghostActions(level) as ShiftAction[]) state = shiftReduce(state, action)
      expect([seed, shiftSession.grade(state, shiftSession.ghost(level)).ok]).toEqual([seed, true])
    }
  })
})

describe('what stays under the hand', () => {
  const launch = { x: 200, y: 600, t: 1000, control: 'BUTTON||Launch' }

  test('a second press at the same spot, moments later, on the control that came up there is a stray; a press of the same control is not', () => {
    expect(strayPress(launch, { x: 202, y: 601, t: 1400, control: 'BUTTON||New numbers' })).toBe(true)
    expect(strayPress(launch, { x: 200, y: 600, t: 1000 + SAME_TIME, control: 'BUTTON||Next level: One block per head' })).toBe(true)
    expect(strayPress(launch, { x: 200, y: 600, t: 1001 + SAME_TIME, control: 'BUTTON||New numbers' })).toBe(false)
    expect(strayPress(launch, { x: 200 + SAME_SPOT + 1, y: 600, t: 1300, control: 'BUTTON||New numbers' })).toBe(false)
    expect(strayPress(launch, { x: 200, y: 600, t: 1200, control: 'BUTTON||Launch' })).toBe(false)
    // A press on no control, or on a picker's choice (which reads as none), and the first press of a page, are never strays.
    expect(strayPress(launch, { x: 200, y: 600, t: 1200, control: '' })).toBe(false)
    expect(strayPress(null, launch)).toBe(false)
  })

  test('a named part is scrolled whole into the room over the dock, its top first where it is taller than the room', () => {
    expect(scrollToShow({ top: 400, bottom: 500 }, 8, 560)).toBe(0)
    expect(scrollToShow({ top: 545, bottom: 638 }, 8, 557)).toBe(81)
    expect(scrollToShow({ top: -40, bottom: 60 }, 8, 557)).toBe(-48)
    expect(scrollToShow({ top: 300, bottom: 900 }, 8, 557)).toBe(292)
  })

  test('the drawing is seated as far as the goal line, and no further than the dock stays pinned; never up', () => {
    expect(seatBy(215, 8, 740, 565)).toBe(175)
    expect(seatBy(215, 8, 900, 565)).toBe(207)
    expect(seatBy(4, 8, 900, 565)).toBe(0)
    expect(seatBy(215, 8, 560, 565)).toBe(0)
  })

  test("a key's press of a picker's choice, moments after the picker opened, is the opening key pressed twice; a pointer's never is", () => {
    // Enter on `view`, then Enter again 80 or 250 ms later: the second landed on the choice the picker had focused, and applied it.
    expect(earlyKey(1000, 1080, 0)).toBe(true)
    expect(earlyKey(1000, 1250, 0)).toBe(true)
    expect(earlyKey(1000, 1000 + KEY_SETTLE, 0)).toBe(false)
    expect(earlyKey(1000, 1080, 1)).toBe(false)
  })

  test('Enter held down on the operation bar or a picker presses once: its repeats press nothing, however long it is held', () => {
    // Held on `view` past the picker's settle, Enter's repeats pressed the choice in focus and applied it.
    expect(heldKey({ repeat: true, key: 'Enter' })).toBe(true)
    expect(heldKey({ repeat: false, key: 'Enter' })).toBe(false)
    // Space presses when it is let go, once, however long it is held; the arrows that move along the bar repeat as they always have.
    expect(heldKey({ repeat: true, key: ' ' })).toBe(false)
    expect(heldKey({ repeat: true, key: 'ArrowRight' })).toBe(false)
    const controls = readFileSync(path.join(repo, 'src/games/shape-shifter/Controls.tsx'), 'utf8')
    expect(controls).toMatch(/className="es-shift-dock__ops"\s*onKeyDownCapture=\{\(event\) => \{\s*if \(heldKey\(event\)\) event\.preventDefault\(\)/)
  })

  test("the strip is held after the first move on `grid` only, where the first move is pressed again at its spot; the bar's buttons keep their own height beside a ring", () => {
    for (const id of LEVELS) expect([id, shiftKit(id, practice(id).seed).holdsStrip]).toEqual([id, id === 'grid'])
    const css = readFileSync(path.join(repo, 'src/games/shape-shifter/shape-shifter.css'), 'utf8')
    expect(css).toMatch(/\.es-shift-dock__bar,\s*\.es-shift-dock__choices \{\s*display: flex;\s*flex-wrap: wrap;\s*align-items: flex-start;/)
  })

  test("under 25rem the ring's word on a stepper takes no width of its own, and keeps its room under the ring", () => {
    const css = readFileSync(path.join(repo, 'src/games/shape-shifter/shape-shifter.css'), 'utf8')
    const narrow = css.slice(css.indexOf('@media (max-width: 24.999rem)'))
    expect(narrow).toMatch(/\.es-shift-dock__stepper \.es-shift-dock__ring \.es-marker__tab \{\s*position: absolute;/)
    expect(narrow).toMatch(/\.es-shift-dock__stepper \.es-shift-dock__ring \{\s*position: relative;\s*padding-bottom: calc\(var\(--es-space-1\) \+ 1\.25rem\);/)
  })

  test("the grid's steppers are groups focus can be put on, which press nothing: the guess closing puts focus there, not on \"one more\"", () => {
    const level = practice('grid')
    const state = shiftReduce(shiftInit(level), { t: 'commit', prediction: 80 })
    const markup = renderToStaticMarkup(h(Controls, { run: fakeRun(state), mode: 'practice' }))
    expect(markup).toMatch(/<div class="es-shift-dock__stepper" role="group" aria-label="BLOCK along dimension 0" data-stepper="BLOCK along dimension 0" tabindex="-1">/)
  })

  test("the ringed control is seated in a dock's box that scrolls: over its foot's \"More below\", with room for the ring's edge", () => {
    // 390 x 844, grid's first move: the ring at 735 to 779 in the dock's box at 565 to 753, under the readout.
    expect(seatInBoxBy({ top: 735, bottom: 779 }, { top: 565, bottom: 753 })).toBe(54)
    expect(seatInBoxBy({ top: 600, bottom: 644 }, { top: 565, bottom: 753 })).toBe(0)
    expect(seatInBoxBy({ top: 560, bottom: 604 }, { top: 565, bottom: 753 })).toBe(-13)
    // Taller than the room: its top, under the ring's edge.
    expect(seatInBoxBy({ top: 700, bottom: 900 }, { top: 565, bottom: 753 })).toBe(127)
  })

  test('a first move that was made keeps its ring\'s room, drawn empty, while the strip is held: the control is the same button, in the same place', () => {
    const level = practice('grid')
    const state = shiftReduce(shiftInit(level), { t: 'commit', prediction: 80 })
    const first = shiftKit('grid', level.seed).firstMove
    const on = renderToStaticMarkup(h(Controls, { run: fakeRun(state, { intro: { askShown: true, ring: first } }), mode: 'practice' }))
    const spent = renderToStaticMarkup(h(Controls, { run: fakeRun(state, { intro: { askShown: true, ring: null, spent: first } }), mode: 'practice' }))
    expect(on).toContain('class="es-marker es-shift-dock__ring"')
    expect(spent).toContain('class="es-marker es-shift-dock__ring es-shift-dock__ring--spent"')
    // The same markup but for the class: the button is not drawn again, and nothing round it changes its size.
    expect(spent.replace(' es-shift-dock__ring--spent', '')).toBe(on)
    const css = readFileSync(path.join(repo, 'src/games/shape-shifter/shape-shifter.css'), 'utf8')
    expect(css).toMatch(/\.es-shift-dock__ring:is\(\.es-shift-dock__ring--spent, \.es-shift-dock__ring--gone\) \.es-marker__ring \{\s*box-shadow: none;/)
    expect(css).toMatch(/\.es-shift-dock__ring--spent \.es-marker__tab \{\s*visibility: hidden;/)
    expect(css).toMatch(/\.es-shift-dock__ring--gone \.es-marker__tab \{\s*display: none;/)
  })

  test('at the result the goal comes into view only where the ways on stay over the readout', () => {
    expect(resultBy(-76, 8, 600, 753)).toBe(-84)
    expect(resultBy(-76, 8, 684, 753)).toBe(0)
    expect(resultBy(20, 8, 684, 753)).toBe(0)
  })
})
