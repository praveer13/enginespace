/*
 * The viewer's state and every command that changes it, as one pure reducer (ARCHITECTURE §6.8: one action stream). A key, a
 * button, a table row and a pointer on the paper all become one of these commands, so the keyboard reaches everything the pointer
 * does and the tests walk the whole instrument without a browser.
 *
 * The state is the window the tape shows, the cursor (the event edge the learner stands on, which is where the heat lamp falls), a
 * mark being made, the marks, the cause, and the last thing to say aloud. Moving the cursor off the paper moves the window to
 * follow it. A command that cannot apply (a mark with no cursor, a tag with nothing to tag) changes nothing but what is said.
 */
import { formatReadout } from '@/design/format'
import { addMark, CATEGORY_WORDS, cleanLabel, relabel, removeMark, retag, withCause } from './marks'
import type { Annotations, Category } from './marks'
import {
  cursorNs,
  edgeNear,
  firstCursor,
  spanCat,
  spanName,
  spansInWindow,
  spanStart,
  stepEdge,
  stepLane,
  windowAt,
} from './model'
import type { Cursor, TraceIndex, Win } from './model'
import { clampWindow, fitWindow, PAN_SHARE, panWindow, revealNs, sameWindow, zoomWindow } from './viewport'

export interface Pending {
  /** The ns the mark started at: the edge the cursor stood on. */
  readonly ns: number
  readonly category: Category | null
  readonly label: string
}

export interface Say {
  /** Counts up, so the same sentence twice in a row is spoken twice. */
  readonly seq: number
  readonly text: string
}

export interface TapeState {
  readonly win: Win
  /**
   * The window the span table lists. It is the window, except while the tape is being panned or zoomed continuously (a held arrow, a
   * drag, a wheel): then it stays where it was until `settle`, because a table that rewrites its rows sixty times a second costs the
   * page more to lay out and paint than the canvas does, and nobody reads it at that speed.
   */
  readonly mirrorWin: Win
  readonly cursor: Cursor | null
  readonly pending: Pending | null
  readonly notes: Annotations
  /** The mark that Category, Label and Remove act on: the one just made, or the one chosen in the list. */
  readonly active: number | null
  readonly say: Say | null
  /** Counts up when focus should follow the cursor to its row in the table. */
  readonly focusSeq: number
}

export type Command =
  | { readonly t: 'zoom'; readonly dir: 1 | -1 }
  | { readonly t: 'zoomAt'; readonly dir: 1 | -1; readonly ns: number }
  | { readonly t: 'pan'; readonly dir: 1 | -1 }
  | { readonly t: 'panBy'; readonly ns: number }
  /** The tape has rested: the table lists the window it shows now. */
  | { readonly t: 'settle' }
  | { readonly t: 'fit'; readonly what: 'step' | 'all' }
  | { readonly t: 'bell'; readonly dir: 1 | -1 }
  | { readonly t: 'edge'; readonly dir: 1 | -1 }
  | { readonly t: 'lane'; readonly dir: 1 | -1 }
  | { readonly t: 'select'; readonly cursor: Cursor; readonly focus?: boolean }
  | { readonly t: 'mark' }
  | { readonly t: 'category'; readonly category: Category }
  | { readonly t: 'cause' }
  | { readonly t: 'label'; readonly text: string }
  | { readonly t: 'remove' }
  | { readonly t: 'cancel' }
  | { readonly t: 'activate'; readonly id: number }

export interface Setup {
  /** The window to open on. Default: the first step, with a margin. */
  readonly window?: Win
  readonly notes?: Annotations
  /** A tape that cannot be marked: its mark commands only say so. */
  readonly readOnly?: boolean
}

const ns = (n: number): string => `${formatReadout(n)} ns`

export function initialState(index: TraceIndex, setup: Setup = {}): TapeState {
  const win = clampWindow(setup.window ?? fitWindow(index.steps[0] ?? index.extent, index.extent), index.extent)
  const cursor = firstInWindow(index, win) ?? firstCursor(index)
  return { win, mirrorWin: win, cursor, pending: null, notes: setup.notes ?? { marks: [], cause: null, nextId: 1 }, active: null, say: null, focusSeq: 0 }
}

/**
 * Where the cursor starts: in the first lane that has one, the first span that begins inside the window and is a block you can see
 * (at least a hundredth of the window long), else the first that begins inside it, else the first that touches it. A span that began
 * before the window is the last step's, and a hairline is a poor place for a lamp to open on.
 */
function firstInWindow(index: TraceIndex, win: Win): Cursor | null {
  const lanes = spansInWindow(index, win, 64)
  const visible = (win.toNs - win.fromNs) / 100
  for (const found of lanes) {
    const inside = found.spans.filter((span) => spanStart(index, span) >= win.fromNs)
    const block = inside.find((span) => index.trace.spans.durNs[span] >= visible) ?? inside[0]
    if (block !== undefined) return { span: block, edge: 'start' }
  }
  for (const found of lanes) if (found.spans.length > 0) return { span: found.spans[0], edge: 'start' }
  return null
}

/** A cursor in words, for the live region and the tape's readout: "Start of qkv_proj, a kernel on GPU stream 0, at 15,800 ns." */
export function describeCursor(index: TraceIndex, c: Cursor): string {
  const lane = index.lanes[index.spanLane[c.span]]
  return `${c.edge === 'start' ? 'Start' : 'End'} of ${spanName(index, c.span)}, ${spanCat(index, c.span)} on ${lane.name}, at ${ns(cursorNs(index, c))}.`
}

const say = (state: TapeState, text: string): TapeState => ({ ...state, say: { seq: (state.say?.seq ?? 0) + 1, text } })

const withWindow = (state: TapeState, win: Win): TapeState => (sameWindow(win, state.win) ? state : { ...state, win, mirrorWin: win })

/** A window change of a continuous move: the table stays until the tape rests. */
const withMovingWindow = (state: TapeState, win: Win): TapeState => (sameWindow(win, state.win) ? state : { ...state, win })

/** Where the cursor is, or the middle of the window when there is none or it is off the paper: what a zoom holds still. */
function anchorOf(state: TapeState, index: TraceIndex): number {
  if (state.cursor !== null) {
    const at = cursorNs(index, state.cursor)
    if (at >= state.win.fromNs && at <= state.win.toNs) return at
  }
  return Math.round((state.win.fromNs + state.win.toNs) / 2)
}

/** Moves the cursor, and the window after it if the cursor has left the paper. */
function moveTo(state: TapeState, index: TraceIndex, cursor: Cursor, focus: boolean): TapeState {
  const win = revealNs(state.win, cursorNs(index, cursor), index.extent)
  return { ...state, cursor, win, mirrorWin: sameWindow(win, state.win) ? state.mirrorWin : win, focusSeq: focus ? state.focusSeq + 1 : state.focusSeq }
}

const NO_MARKING = 'This tape is for reading. It takes no marks.'

export function reduce(state: TapeState, command: Command, index: TraceIndex, options: { readOnly?: boolean } = {}): TapeState {
  switch (command.t) {
    case 'zoom':
    case 'zoomAt': {
      const anchor = command.t === 'zoomAt' ? command.ns : anchorOf(state, index)
      const win = zoomWindow(state.win, command.dir > 0 ? 0.5 : 2, anchor, index.extent)
      return sameWindow(win, state.win)
        ? say(state, command.dir > 0 ? 'Zoomed in as far as it goes.' : 'The whole tape is in view.')
        : say({ ...state, win, mirrorWin: command.t === 'zoom' ? win : state.mirrorWin }, `${ns(win.toNs - win.fromNs)} across.`)
    }
    case 'pan':
      return withMovingWindow(state, panWindow(state.win, command.dir * (state.win.toNs - state.win.fromNs) * PAN_SHARE, index.extent))
    case 'panBy':
      return withMovingWindow(state, panWindow(state.win, command.ns, index.extent))
    case 'settle':
      return sameWindow(state.mirrorWin, state.win) ? state : { ...state, mirrorWin: state.win }
    case 'fit': {
      const centre = Math.round((state.win.fromNs + state.win.toNs) / 2)
      const at = windowAt(index, centre)
      if (command.what === 'all' || at < 0) return say(withWindow(state, fitWindow(index.extent, index.extent)), 'The whole tape is in view.')
      return say(withWindow(state, fitWindow(index.steps[at], index.extent)), `Step ${at + 1} of ${index.steps.length}.`)
    }
    case 'bell': {
      if (index.steps.length === 0) return say(state, 'This tape has no step marks.')
      const at = windowAt(index, Math.round((state.win.fromNs + state.win.toNs) / 2))
      const next = Math.min(index.steps.length - 1, Math.max(0, at + command.dir))
      if (next === at) return say(state, command.dir > 0 ? 'That is the last step.' : 'That is the first step.')
      const win = fitWindow(index.steps[next], index.extent)
      const lane = state.cursor === null ? null : index.lanes[index.spanLane[state.cursor.span]]
      const cursor = (lane === null ? null : edgeNear(index, lane, index.steps[next].fromNs)) ?? firstInWindow(index, win) ?? state.cursor
      return say({ ...state, win, mirrorWin: win, cursor }, `Step ${next + 1} of ${index.steps.length}, ${ns(index.steps[next].toNs - index.steps[next].fromNs)} long.`)
    }
    case 'edge': {
      const found = state.cursor === null ? firstCursor(index) : stepEdge(index, state.cursor, command.dir)
      if (found === null) return say(state, state.cursor === null ? 'This tape has no events.' : command.dir > 0 ? 'That is the last edge on this lane.' : 'That is the first edge on this lane.')
      return say(moveTo(state, index, found, true), describeCursor(index, found))
    }
    case 'lane': {
      const found = state.cursor === null ? firstCursor(index) : stepLane(index, state.cursor, command.dir)
      if (found === null) return say(state, 'There is no lane there.')
      return say(moveTo(state, index, found, true), describeCursor(index, found))
    }
    case 'select':
      return say(moveTo(state, index, command.cursor, command.focus === true), describeCursor(index, command.cursor))
    case 'mark': {
      if (options.readOnly) return say(state, NO_MARKING)
      if (state.cursor === null) return say(state, 'Stand on an event edge first.')
      const here = cursorNs(index, state.cursor)
      if (state.pending === null) return say({ ...state, pending: { ns: here, category: null, label: '' } }, `Mark started at ${ns(here)}. Move to the other edge and press M again.`)
      const made = addMark(state.notes, state.pending.ns, here, state.pending.category, state.pending.label)
      if (!made.ok) return say(state, made.why)
      const { mark } = made
      const words = mark.category === null ? 'no category yet' : CATEGORY_WORDS[mark.category].term
      return say({ ...state, notes: made.notes, pending: null, active: mark.id }, `Mark ${mark.id}: ${words}, ${ns(mark.fromNs)} to ${ns(mark.toNs)}, ${ns(mark.toNs - mark.fromNs)} long.`)
    }
    case 'category': {
      if (options.readOnly) return say(state, NO_MARKING)
      const word = CATEGORY_WORDS[command.category].term
      if (state.pending !== null) return say({ ...state, pending: { ...state.pending, category: command.category } }, `The mark being made is ${word}.`)
      if (state.active === null) return say(state, 'No mark to tag. Press M to start one.')
      return say({ ...state, notes: retag(state.notes, state.active, command.category) }, `Mark ${state.active} is ${word}.`)
    }
    case 'cause': {
      if (options.readOnly) return say(state, NO_MARKING)
      if (state.cursor === null) return say(state, 'Stand on an event first.')
      const span = state.cursor.span
      if (state.notes.cause === span) return say({ ...state, notes: withCause(state.notes, null) }, `${spanName(index, span)} is no longer named as the cause.`)
      return say({ ...state, notes: withCause(state.notes, span) }, `${spanName(index, span)} is named as the cause.`)
    }
    case 'label': {
      if (options.readOnly) return say(state, NO_MARKING)
      if (state.pending !== null) return { ...state, pending: { ...state.pending, label: cleanLabel(command.text) } }
      if (state.active === null) return say(state, 'No mark to label. Press M to start one.')
      return { ...state, notes: relabel(state.notes, state.active, command.text) }
    }
    case 'remove': {
      if (options.readOnly) return say(state, NO_MARKING)
      if (state.active === null) return say(state, 'No mark to remove.')
      return say({ ...state, notes: removeMark(state.notes, state.active), active: null }, `Mark ${state.active} removed.`)
    }
    case 'cancel': {
      if (state.pending !== null) return say({ ...state, pending: null }, 'Mark cancelled.')
      return state.active === null ? state : { ...state, active: null }
    }
    case 'activate': {
      const mark = state.notes.marks.find((m) => m.id === command.id)
      if (mark === undefined) return state
      const words = mark.category === null ? 'no category yet' : CATEGORY_WORDS[mark.category].term
      const win = revealNs(state.win, mark.fromNs, index.extent)
      return say({ ...state, active: mark.id, win, mirrorWin: win }, `Mark ${mark.id}: ${words}, ${ns(mark.fromNs)} to ${ns(mark.toNs)}.`)
    }
  }
}

/** The command a key of the viewer's map stands for, or null when the key is not a command of the reducer (`help`, `label`). */
export function commandOfKey(id: string): Command | null {
  switch (id) {
    case 'zoom-in':
      return { t: 'zoom', dir: 1 }
    case 'zoom-out':
      return { t: 'zoom', dir: -1 }
    case 'pan-left':
      return { t: 'pan', dir: -1 }
    case 'pan-right':
      return { t: 'pan', dir: 1 }
    case 'fit-step':
      return { t: 'fit', what: 'step' }
    case 'fit-all':
      return { t: 'fit', what: 'all' }
    case 'bell-prev':
      return { t: 'bell', dir: -1 }
    case 'bell-next':
      return { t: 'bell', dir: 1 }
    case 'edge-prev':
      return { t: 'edge', dir: -1 }
    case 'edge-next':
      return { t: 'edge', dir: 1 }
    case 'mark':
      return { t: 'mark' }
    case 'cause':
      return { t: 'cause' }
    case 'remove':
    case 'remove-back':
      return { t: 'remove' }
    case 'cancel':
      return { t: 'cancel' }
    case 'category-kernel':
      return { t: 'category', category: 'kernel' }
    case 'category-copy':
      return { t: 'category', category: 'copy' }
    case 'category-cpu-gap':
      return { t: 'category', category: 'cpu-gap' }
    case 'category-both-idle':
      return { t: 'category', category: 'both-idle' }
    default:
      return null
  }
}

