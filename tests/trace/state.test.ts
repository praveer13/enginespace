/*
 * W1-T09, accept 2: every action works from the keyboard. The reducer is the one place a key, a button, a table row and a pointer
 * end up, so this walks the instrument through it: the window, the cursor, a mark made and tagged and labelled and removed, the
 * cause, and what is said aloud for each.
 */
import { describe, expect, test } from 'bun:test'
import { matchKey } from '@/trace/key-rules'
import type { KeyPress } from '@/trace/key-rules'
import { keyProblems, COMMON_KEYS } from '@es/play'
import { CATEGORIES } from '@/trace/marks'
import { cursorNs, edgeNear, spanName, windowAt } from '@/trace/model'
import type { Cursor } from '@/trace/model'
import { REPEATING, TRACE_KEYS } from '@/trace/keys'
import { commandOfKey, describeCursor, initialState, reduce } from '@/trace/state'
import type { Command, TapeState } from '@/trace/state'
import { night } from './support'

const index = night()
const run = (state: TapeState, ...commands: Command[]): TapeState => commands.reduce((s, c) => reduce(s, c, index), state)
const lastLane = index.lanes[index.lanes.length - 1]
const text = (s: TapeState) => s.say?.text ?? ''

describe('the first view', () => {
  const s = initialState(index)

  test('opens on the first step with a margin, the cursor on the first span in it, and nothing pending', () => {
    expect(s.win.fromNs).toBeLessThan(index.steps[0].fromNs)
    expect(s.win.toNs).toBeGreaterThan(index.steps[0].toNs)
    expect(s.cursor).not.toBeNull()
    expect(s.pending).toBeNull()
    expect(s.notes.marks).toEqual([])
    expect(s.say).toBeNull()
  })

  test('opens the cursor on a block you can see: a span of at least a hundredth of the window, not a hairline', () => {
    for (const step of [2, 5, 9, 14]) {
      const window = { fromNs: index.steps[step].fromNs - 100_000, toNs: index.steps[step].toNs + 100_000 }
      const at = initialState(index, { window })
      const span = (at.cursor as Cursor).span
      expect(index.trace.spans.startNs[span]).toBeGreaterThanOrEqual(at.win.fromNs)
      expect(index.trace.spans.durNs[span]).toBeGreaterThanOrEqual((at.win.toNs - at.win.fromNs) / 100)
    }
  })

  test('opens on the window it is given', () => {
    const at = initialState(index, { window: { fromNs: 20_000_000, toNs: 30_000_000 } })
    expect(at.win).toEqual({ fromNs: 20_000_000, toNs: 30_000_000 })
  })
})

describe('the window', () => {
  const s = initialState(index)

  test('zoom in halves it about the cursor and zoom out doubles it, and each says how wide it is', () => {
    const length = s.win.toNs - s.win.fromNs
    const inn = run(s, { t: 'zoom', dir: 1 })
    expect(inn.win.toNs - inn.win.fromNs).toBe(Math.round(length / 2))
    expect(text(inn)).toMatch(/ns across\.$/)
    const out = run(inn, { t: 'zoom', dir: -1 })
    expect(out.win.toNs - out.win.fromNs).toBe(length)
  })

  test('zoom in stops where it must, and says so', () => {
    let z = s
    for (let i = 0; i < 40; i++) z = run(z, { t: 'zoom', dir: 1 })
    expect(text(z)).toBe('Zoomed in as far as it goes.')
    let o = s
    for (let i = 0; i < 40; i++) o = run(o, { t: 'zoom', dir: -1 })
    expect(text(o)).toBe('The whole tape is in view.')
  })

  test('pan moves a quarter of the window, back and on, and says nothing', () => {
    const length = s.win.toNs - s.win.fromNs
    const right = run(s, { t: 'pan', dir: 1 })
    expect(right.win.fromNs - s.win.fromNs).toBe(Math.round(length * 0.25))
    expect(run(right, { t: 'pan', dir: -1 }).win).toEqual(s.win)
    expect(right.say).toBe(s.say)
  })

  test('fit step shows the step the window is in, and fit all the whole tape', () => {
    const later = run(s, { t: 'bell', dir: 1 }, { t: 'bell', dir: 1 })
    const fitted = run(later, { t: 'pan', dir: 1 }, { t: 'fit', what: 'step' })
    const at = windowAt(index, Math.round((fitted.win.fromNs + fitted.win.toNs) / 2))
    expect(at).toBe(2)
    expect(text(fitted)).toBe(`Step 3 of ${index.steps.length}.`)
    const all = run(s, { t: 'fit', what: 'all' })
    expect(all.win.fromNs).toBeLessThanOrEqual(index.extent.fromNs)
    expect(all.win.toNs).toBeGreaterThanOrEqual(index.extent.toNs)
  })

  test('the bells go from step to step, keep the cursor on its lane inside the new step, and stop at the ends', () => {
    const onLane = run(s, { t: 'select', cursor: edgeNear(index, lastLane, index.steps[0].fromNs) as Cursor })
    const next = run(onLane, { t: 'bell', dir: 1 })
    expect(text(next)).toContain(`Step 2 of ${index.steps.length}`)
    expect(index.spanLane[(next.cursor as Cursor).span]).toBe(lastLane.index)
    const t = cursorNs(index, next.cursor as Cursor)
    expect(t).toBeGreaterThanOrEqual(index.steps[1].fromNs)
    expect(text(run(next, { t: 'bell', dir: -1, }, { t: 'bell', dir: -1 }))).toBe('That is the first step.')
    let end = s
    for (let i = 0; i < index.steps.length + 2; i++) end = run(end, { t: 'bell', dir: 1 })
    expect(text(end)).toBe('That is the last step.')
  })

  test('the table follows a discrete move at once, and lags a continuous one until the tape rests', () => {
    expect(s.mirrorWin).toBe(s.win)
    // A pan by key or by drag, and a wheel zoom, leave the table where it was: it is not rewritten sixty times a second.
    const panned = run(s, { t: 'pan', dir: 1 }, { t: 'panBy', ns: 500_000 }, { t: 'zoomAt', dir: 1, ns: s.win.fromNs + 1_000_000 })
    expect(panned.win).not.toEqual(s.win)
    expect(panned.mirrorWin).toBe(s.win)
    expect(run(panned, { t: 'settle' }).mirrorWin).toBe(panned.win)
    expect(run(run(panned, { t: 'settle' }), { t: 'settle' }).mirrorWin).toBe(panned.win)
    // Every other command that moves the window takes the table with it.
    for (const command of [{ t: 'zoom', dir: 1 }, { t: 'fit', what: 'all' }, { t: 'bell', dir: 1 }, { t: 'edge', dir: 1 }] as Command[]) {
      const moved = run(panned, command)
      expect(moved.mirrorWin).toBe(moved.win === panned.win ? panned.mirrorWin : moved.win)
    }
    expect(run(panned, { t: 'zoom', dir: 1 }).mirrorWin).toEqual(run(panned, { t: 'zoom', dir: 1 }).win)
    expect(run(panned, { t: 'bell', dir: 1 }).mirrorWin).toEqual(run(panned, { t: 'bell', dir: 1 }).win)
  })

  test('drag and wheel pan and zoom where they are told', () => {
    const dragged = run(s, { t: 'panBy', ns: 1_000_000 })
    expect(dragged.win.fromNs - s.win.fromNs).toBe(1_000_000)
    const wheeled = run(s, { t: 'zoomAt', dir: 1, ns: s.win.fromNs })
    expect(wheeled.win.fromNs).toBe(s.win.fromNs)
  })
})

describe('the cursor', () => {
  const s = initialState(index)

  test('K and J walk the edges of the cursor’s lane, say where it is, and ask for focus to follow', () => {
    const k = run(s, { t: 'edge', dir: 1 })
    expect(k.cursor).not.toEqual(s.cursor)
    expect(text(k)).toBe(describeCursor(index, k.cursor as Cursor))
    expect(text(k)).toMatch(/^(Start|End) of .+, \w+ on .+, at [\d,]+ ns\.$/)
    expect(k.focusSeq).toBe(s.focusSeq + 1)
    expect(run(k, { t: 'edge', dir: -1 }).cursor).toEqual(s.cursor)
  })

  test('a walk off either end of the lane says so and stays', () => {
    let z: TapeState = run(s, { t: 'select', cursor: edgeNear(index, lastLane, -1) as Cursor })
    z = run(z, { t: 'edge', dir: -1 })
    expect(text(z)).toBe('That is the first edge on this lane.')
    const far = run(s, { t: 'select', cursor: edgeNear(index, lastLane, 1e15) as Cursor }, { t: 'edge', dir: 1 })
    expect(text(far)).toBe('That is the last edge on this lane.')
  })

  test('the window follows a cursor that walks off the paper', () => {
    let z = run(s, { t: 'select', cursor: edgeNear(index, lastLane, index.steps[0].fromNs) as Cursor })
    for (let i = 0; i < 300; i++) z = run(z, { t: 'edge', dir: 1 })
    const at = cursorNs(index, z.cursor as Cursor)
    expect(at).toBeGreaterThanOrEqual(z.win.fromNs)
    expect(at).toBeLessThanOrEqual(z.win.toNs)
  })

  test('a lane step goes to the neighbouring lane at the same time', () => {
    const onGpu = run(s, { t: 'select', cursor: edgeNear(index, lastLane, index.steps[0].fromNs + 1_000_000) as Cursor })
    const up = run(onGpu, { t: 'lane', dir: -1 })
    expect(index.spanLane[(up.cursor as Cursor).span]).toBe(lastLane.index - 1)
    expect(text(run(onGpu, { t: 'lane', dir: 1 }))).toBe('There is no lane there.')
  })

  test('select puts the cursor on an edge and only asks for focus when it is told to', () => {
    const edge: Cursor = { span: lastLane.order[3], edge: 'end' }
    expect(run(s, { t: 'select', cursor: edge }).focusSeq).toBe(s.focusSeq)
    expect(run(s, { t: 'select', cursor: edge, focus: true }).focusSeq).toBe(s.focusSeq + 1)
    expect(run(s, { t: 'select', cursor: edge }).cursor).toEqual(edge)
  })
})

describe('marking', () => {
  const start = run(initialState(index), { t: 'select', cursor: { span: lastLane.order[2], edge: 'start' } })

  test('M starts a mark at the cursor and M again at another edge finishes it, the mark active and said aloud', () => {
    const a = run(start, { t: 'mark' })
    expect(a.pending?.ns).toBe(cursorNs(index, start.cursor as Cursor))
    expect(text(a)).toContain('Mark started at')
    const b = run(a, { t: 'edge', dir: 1 }, { t: 'mark' })
    expect(b.pending).toBeNull()
    expect(b.notes.marks.length).toBe(1)
    expect(b.active).toBe(1)
    const mark = b.notes.marks[0]
    expect(mark.fromNs).toBe(cursorNs(index, start.cursor as Cursor))
    expect(mark.toNs).toBe(cursorNs(index, (b.cursor as Cursor)))
    expect(text(b)).toMatch(/^Mark 1: no category yet, [\d,]+ ns to [\d,]+ ns, [\d,]+ ns long\.$/)
  })

  test('a mark made backwards is the same stretch', () => {
    const forward = run(start, { t: 'mark' }, { t: 'edge', dir: 1 }, { t: 'mark' }).notes.marks[0]
    const there = run(start, { t: 'edge', dir: 1 })
    const backward = run(there, { t: 'mark' }, { t: 'edge', dir: -1 }, { t: 'mark' }).notes.marks[0]
    expect([backward.fromNs, backward.toNs]).toEqual([forward.fromNs, forward.toNs])
  })

  test('a mark of no length is refused, and the mark being made stays', () => {
    const a = run(start, { t: 'mark' }, { t: 'mark' })
    expect(a.notes.marks).toEqual([])
    expect(a.pending).not.toBeNull()
    expect(text(a)).toContain('no length')
  })

  test('a category key tags the mark being made, and then the mark just made', () => {
    const pending = run(start, { t: 'mark' }, { t: 'category', category: 'cpu-gap' })
    expect(pending.pending?.category).toBe('cpu-gap')
    expect(text(pending)).toBe('The mark being made is CPU gap.')
    const done = run(pending, { t: 'edge', dir: 1 }, { t: 'mark' })
    expect(done.notes.marks[0].category).toBe('cpu-gap')
    const retagged = run(done, { t: 'category', category: 'kernel' })
    expect(retagged.notes.marks[0].category).toBe('kernel')
    expect(text(retagged)).toBe('Mark 1 is Kernel.')
  })

  test('every category has a key that does this', () => {
    for (const category of CATEGORIES) {
      const id = `category-${category}`
      expect(commandOfKey(id)).toEqual({ t: 'category', category })
      expect(TRACE_KEYS.some((key) => key.id === id)).toBe(true)
    }
  })

  test('a tag with nothing to tag, and a label with nothing to label, say so', () => {
    expect(text(run(start, { t: 'category', category: 'copy' }))).toBe('No mark to tag. Press M to start one.')
    expect(text(run(start, { t: 'label', text: 'x' }))).toBe('No mark to label. Press M to start one.')
    expect(text(run(start, { t: 'remove' }))).toBe('No mark to remove.')
  })

  test('a label goes to the mark being made and then to the active mark, cleaned', () => {
    const pending = run(start, { t: 'mark' }, { t: 'label', text: '  the   sync ' })
    expect(pending.pending?.label).toBe('the sync')
    const done = run(pending, { t: 'edge', dir: 1 }, { t: 'mark' })
    expect(done.notes.marks[0].label).toBe('the sync')
    expect(run(done, { t: 'label', text: 'drained the queue' }).notes.marks[0].label).toBe('drained the queue')
  })

  test('remove takes the active mark away, and escape cancels the mark being made, then lets the active one go', () => {
    const done = run(start, { t: 'mark' }, { t: 'edge', dir: 1 }, { t: 'mark' })
    const removed = run(done, { t: 'remove' })
    expect(removed.notes.marks).toEqual([])
    expect(text(removed)).toBe('Mark 1 removed.')
    const a = run(start, { t: 'mark' }, { t: 'cancel' })
    expect(a.pending).toBeNull()
    expect(text(a)).toBe('Mark cancelled.')
    expect(run(done, { t: 'cancel' }).active).toBeNull()
    expect(run(done, { t: 'cancel' }).notes.marks.length).toBe(1)
  })

  test('the cause is the span at the cursor, one at a time, and a second press lets it go', () => {
    const a = run(start, { t: 'cause' })
    expect(a.notes.cause).toBe((start.cursor as Cursor).span)
    expect(text(a)).toBe(`${spanName(index, (start.cursor as Cursor).span)} is named as the cause.`)
    const moved = run(a, { t: 'edge', dir: 1 }, { t: 'edge', dir: 1 }, { t: 'cause' })
    expect(moved.notes.cause).not.toBe(a.notes.cause)
    const same = run(a, { t: 'cause' })
    expect(same.notes.cause).toBeNull()
  })

  test('choosing a mark in the list makes it active and brings the window to it', () => {
    const done = run(start, { t: 'mark' }, { t: 'edge', dir: 1 }, { t: 'mark' }, { t: 'fit', what: 'all' }, { t: 'zoom', dir: 1 })
    const far = reduce(done, { t: 'panBy', ns: 40_000_000 }, index)
    const back = reduce(far, { t: 'activate', id: 1 }, index)
    expect(back.active).toBe(1)
    const mark = back.notes.marks[0]
    expect(mark.fromNs).toBeGreaterThanOrEqual(back.win.fromNs)
    expect(mark.fromNs).toBeLessThanOrEqual(back.win.toNs)
    expect(reduce(done, { t: 'activate', id: 99 }, index)).toBe(done)
  })

  test('a tape for reading takes no marks, and says so', () => {
    for (const command of [{ t: 'mark' }, { t: 'cause' }, { t: 'remove' }, { t: 'category', category: 'copy' }, { t: 'label', text: 'x' }] as Command[]) {
      const read = reduce(start, command, index, { readOnly: true })
      expect(read.notes).toBe(start.notes)
      expect(text(read)).toBe('This tape is for reading. It takes no marks.')
    }
  })
})

describe('the keys', () => {
  const event = (code: string, key = '', shiftKey = false): KeyPress => ({
    code,
    key,
    shiftKey,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    preventDefault: () => undefined,
  })

  test('are a legal map: slug ids, real codes, no key used twice, and none that move focus', () => {
    // The checks a game’s keys pass (packages/play/registry.ts), less the rule that a game’s keys avoid the common ones, which this map does on purpose for `help`.
    const problems = keyProblems(TRACE_KEYS.filter((key) => key.id !== 'help'))
    expect(problems.filter((problem) => !/is already the key for/.test(problem))).toEqual([])
    const chords = TRACE_KEYS.map((key) => `${key.code}${key.shift === true ? '+Shift' : ''}`)
    expect(new Set(chords).size).toBe(chords.length)
    expect(new Set(TRACE_KEYS.map((key) => key.id)).size).toBe(TRACE_KEYS.length)
  })

  test('take none of the keys a game’s shell binds above it, but ? for help', () => {
    const shell = COMMON_KEYS.filter((key) => key.id !== 'help')
    for (const own of TRACE_KEYS) {
      for (const common of shell) expect(`${own.code}${own.shift === true}`).not.toBe(`${common.code}${common.shift === true}`)
    }
    expect(TRACE_KEYS.find((key) => key.id === 'help')).toMatchObject({ code: 'Slash', shift: true })
  })

  test('each stands for a command of the reducer, except the two the component answers', () => {
    const own = TRACE_KEYS.filter((key) => commandOfKey(key.id) === null).map((key) => key.id)
    expect(own.sort()).toEqual(['help', 'label'])
  })

  test('match what a keyboard sends: + with or without shift, - on the main row, < and > with shift', () => {
    const id = (e: KeyPress) => matchKey(TRACE_KEYS, e)?.id
    expect(id(event('Equal', '='))).toBe('zoom-in')
    expect(id(event('Equal', '+', true))).toBe('zoom-in')
    expect(id(event('Minus', '-'))).toBe('zoom-out')
    expect(id(event('ArrowLeft'))).toBe('pan-left')
    expect(id(event('Comma', '<', true))).toBe('bell-prev')
    expect(id(event('Period', '>', true))).toBe('bell-next')
    expect(id(event('Comma', ','))).toBeUndefined()
    expect(id(event('Period', '.'))).toBeUndefined()
    expect(id(event('KeyJ', 'j'))).toBe('edge-prev')
    expect(id(event('KeyK', 'k'))).toBe('edge-next')
    expect(id(event('Digit3', '3'))).toBe('category-cpu-gap')
    expect(id(event('Digit3', '#', true))).toBeUndefined()
    expect(id(event('Backspace', 'Backspace'))).toBe('remove-back')
    expect(id(event('Slash', '?', true))).toBe('help')
  })

  test('only the moves of the paper repeat while a key is held', () => {
    expect([...REPEATING].sort()).toEqual(['edge-next', 'edge-prev', 'pan-left', 'pan-right', 'zoom-in', 'zoom-out'])
    for (const id of REPEATING) expect(TRACE_KEYS.some((key) => key.id === id)).toBe(true)
  })

  test('walk the whole instrument without a pointer: a mark, tagged, named a cause, and the window moved', () => {
    // A cursor on a kernel's start: the learner got here with the table's arrows, and the keys take it from there.
    let s = run(initialState(index), { t: 'select', cursor: { span: lastLane.order[2], edge: 'start' } })
    const press = (code: string, key = '', shift = false): void => {
      const binding = matchKey(TRACE_KEYS, event(code, key, shift))
      const command = binding === undefined ? null : commandOfKey(binding.id)
      if (command !== null) s = reduce(s, command, index)
    }
    const before = s.win
    press('KeyM', 'm')
    press('Digit1', '1')
    press('KeyK', 'k')
    press('KeyM', 'm')
    press('KeyX', 'x')
    press('Equal', '=')
    press('ArrowRight')
    press('Period', '>', true)
    expect(s.notes.marks.length).toBe(1)
    expect(s.notes.marks[0].category).toBe('kernel')
    expect(s.notes.cause).not.toBeNull()
    expect(s.win).not.toEqual(before)
  })
})
