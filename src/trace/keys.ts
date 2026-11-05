/*
 * The viewer's keys (ARCHITECTURE §6.8, GAMES.md §6 "Controls"): matched by `event.code`, bound on the viewer's own container so
 * that they act only while focus is inside it (WCAG 2.1.4), and left alone where the focused control uses the key itself (a text
 * field takes every key; a button takes Space and Enter; the span table takes the up and down arrows, Home, End and the page keys).
 *
 * Gap Hunt's keys are here under the same names: `+` and `−` zoom, the arrows pan, `J` and `K` walk the event edges of a lane, `M`
 * stands for Enter's "sets a mark's start or end" (Enter on a focused row is the table's own: it chooses the row), `1` to `4` choose
 * a category and `X` names the cause. A viewer can sit inside a game, whose shell binds `Space`, `.`, `,`, `[`, `]`, `C` and `V`
 * above it, so none of those is taken here: the step windows go by `<` and `>`, which are other chords.
 *
 * Every command has a button too (Toolbar.tsx), so a pointer and a touch screen reach what the keys do, and a test holds the two
 * lists equal.
 */
import type { KeyBinding } from '@es/play'

const digit = (n: 1 | 2 | 3 | 4, id: string, description: string): KeyBinding => ({ id, code: `Digit${n}`, key: String(n), label: String(n), description })

export const TRACE_KEYS: readonly KeyBinding[] = Object.freeze([
  { id: 'zoom-in', code: 'Equal', key: '+', label: '+', description: 'Zoom in, about the cursor' },
  { id: 'zoom-out', code: 'Minus', key: '-', label: '-', description: 'Zoom out' },
  { id: 'pan-left', code: 'ArrowLeft', label: 'Left', description: 'Pan the tape back in time' },
  { id: 'pan-right', code: 'ArrowRight', label: 'Right', description: 'Pan the tape on in time' },
  { id: 'fit-step', code: 'KeyF', label: 'F', description: 'Fit this step, bell to bell' },
  { id: 'fit-all', code: 'KeyA', label: 'A', description: 'Fit the whole tape' },
  { id: 'bell-prev', code: 'Comma', shift: true, key: '<', label: '<', description: 'Go to the previous step' },
  { id: 'bell-next', code: 'Period', shift: true, key: '>', label: '>', description: 'Go to the next step' },
  { id: 'edge-prev', code: 'KeyJ', label: 'J', description: 'Move to the previous event edge on this lane' },
  { id: 'edge-next', code: 'KeyK', label: 'K', description: 'Move to the next event edge on this lane' },
  { id: 'mark', code: 'KeyM', label: 'M', description: 'Start a mark at the cursor, and press again to finish it' },
  digit(1, 'category-kernel', 'Tag the mark: kernel (cooking)'),
  digit(2, 'category-copy', 'Tag the mark: copy (the dumbwaiter, nothing cooking)'),
  digit(3, 'category-cpu-gap', 'Tag the mark: CPU gap (dark while the expo writes)'),
  digit(4, 'category-both-idle', 'Tag the mark: both idle (everyone waiting)'),
  { id: 'cause', code: 'KeyX', label: 'X', description: 'Name the event at the cursor as the cause' },
  { id: 'label', code: 'KeyL', label: 'L', description: 'Write a label for the mark' },
  { id: 'remove', code: 'Delete', label: 'Delete', description: 'Remove the mark' },
  { id: 'remove-back', code: 'Backspace', label: 'Backspace', description: 'Remove the mark' },
  { id: 'cancel', code: 'Escape', label: 'Esc', description: 'Cancel the mark being made' },
  { id: 'help', code: 'Slash', shift: true, key: '?', label: '?', description: 'Show these keys' },
])

/** The groups the help dialog lists the keys under, in the order a learner thinks in: every key of the map is in exactly one. */
export const KEY_GROUPS: readonly { readonly title: string; readonly ids: readonly string[] }[] = [
  { title: 'Move the paper', ids: ['pan-left', 'pan-right', 'zoom-in', 'zoom-out', 'fit-step', 'fit-all'] },
  { title: 'Move the cursor', ids: ['edge-prev', 'edge-next', 'bell-prev', 'bell-next'] },
  { title: 'Mark', ids: ['mark', 'category-kernel', 'category-copy', 'category-cpu-gap', 'category-both-idle', 'cause', 'label', 'remove', 'remove-back', 'cancel'] },
  { title: 'Help', ids: ['help'] },
]

/** Keys that act again while they are held: moving the paper is continuous, and a command that is a decision is not. */
export const REPEATING: ReadonlySet<string> = new Set(['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'edge-prev', 'edge-next'])

/** The keys the span table takes for itself when focus is on a row, which the viewer's map leaves alone there. */
export const TABLE_KEYS = 'ArrowUp ArrowDown Home End PageUp PageDown'
