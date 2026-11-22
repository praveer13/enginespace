import { opText, tupleText } from '@es/play/shape-shifter/labels'
import { partsOf } from '@es/play/shape-shifter/copy'
import { ghostActions, shiftInit, shiftLevel } from '@es/play/shape-shifter/session'
import type { ShiftAction, ShiftLevelId } from '@es/play/shape-shifter/types'
import { shiftView } from '@es/play/shape-shifter/view'
import type { ShiftView } from '@es/play/shape-shifter/view'
import type { GameKit, KitMoment, KitPart } from '@/games/kit/first-move'
import { DockView } from './DockView'
import { plainWords } from './words'

/*
 * What Tensor views gives the instrument frame (REDESIGN §2.6): its parts on a level with where each is drawn, its named moments with the
 * object each is said beside, and its first run. The words are packages/play/shape-shifter/copy.ts's; this file only places them.
 */

/** Where each part is drawn, inside the frame: the intro's callout sits on it. */
const ANCHORS: Readonly<Record<string, string>> = {
  table: '[data-shift-table] .es-shift__label',
  buffer: '[data-shift-buffer-box] .es-shift__label',
  order: '[data-shift-cells] .es-shift__label',
  target: '[data-shift-target] .es-shift__label',
  shared: '[data-shift-buffer="now"] [data-shared]',
  slices: '[data-shift-slice]',
  tensor: '[data-shift-launch] .es-shift__label',
  program: '[data-shift-programs]',
  block: '[data-stepper="BLOCK along dimension 0"]',
  'grid-size': '[data-stepper="Grid along dimension 0"]',
  mask: '[data-shift-grid] .es-shift__label',
}

/** The parts the level draws, as the Parts list shows them, with the library's own name set as code. */
export const partRows = (level: ShiftLevelId): KitPart[] =>
  partsOf(level).map((part) => ({
    id: part.id,
    name: part.name,
    ...(ANCHORS[part.id] === undefined ? {} : { anchor: ANCHORS[part.id] }),
    sentence:
      part.engine === undefined ? (
        plainWords(part.sentence)
      ) : (
        <>
          {plainWords(part.sentence)} In {part.engine.startsWith('tl.') || part.engine.startsWith('triton.') ? 'Triton' : 'PyTorch'}: <code>{part.engine}</code>.
        </>
      ),
  }))

/** Where a named moment is said beside (GAMES.md §4.6). */
const NEAR: Readonly<Record<string, string>> = {
  'view-free': '[data-shift-table]',
  'view-refused': '[data-shift-cells] [data-jump], [data-shift-table]',
  copy: '[data-shift-buffer="now"]',
  'stride-zero': '[data-shift-buffer="now"] [data-shared], [data-shift-buffer="now"]',
  'wrong-order': '[data-shift-target]',
  'too-many': '[data-stepper="Grid along dimension 0"]',
  masked: '[data-shift-grid] [data-program]',
  uncovered: '[data-shift-grid] [data-uncovered], [data-shift-grid]',
  'not-pow2': '[data-stepper="BLOCK along dimension 0"]',
}

const MOMENT_IDS = ['view-free', 'view-refused', 'copy', 'stride-zero', 'wrong-order', 'too-many', 'masked', 'uncovered', 'not-pow2'] as const

/** A moment is named when the session first records it in the level: its line is the session's, with the code spans as words. */
export const shiftMoments: readonly KitMoment<ShiftView>[] = MOMENT_IDS.map((id) => ({
  id,
  line: (before, after) => {
    if (before.moments.some((m) => m.id === id)) return null
    const m = after.moments.find((candidate) => candidate.id === id)
    return m === undefined ? null : plainWords(m.line)
  },
  anchor: () => NEAR[id],
}))

const levelParts = (level: string): readonly string[] => partsOf(level as ShiftLevelId).map((part) => part.id)

/** The reference run's first action in words, as the intro points at it. */
export function moveWords(action: ShiftAction | null): string {
  if (action === null) return ''
  switch (action.t) {
    case 'op':
      return `Apply ${opText(action.op)}`
    case 'block':
      return `Set BLOCK along dimension ${action.dim} to ${action.value}`
    case 'grid':
      return `Set the grid along dimension ${action.dim} to ${action.value}`
    case 'launch':
      return 'Launch'
    case 'commit':
      return ''
  }
}

/** What the guess asks, before any operation of the first target. */
const askOpen = (view: ShiftView): boolean =>
  view.task.at === 0 && view.predict.guess === null && (view.layout === null ? view.grid?.block.every((b) => b === 1) === true : view.layout.readouts.operations === 0 && view.layout.jump === null)

/**
 * What Tensor views gives the frame (REDESIGN §2.6): its parts on this level, its named moments, its compact view and its first run. The
 * first ask is the level's guess, which the session lets the learner skip, and before it the learner reads the shape and stride table. The
 * pointed first move is the reference run's first action on this level and seed.
 */
export function shiftKit(levelId: ShiftLevelId, seed: number): GameKit<ShiftAction, ShiftView, never> {
  const level = shiftLevel(levelId, seed)
  const firstMove = ghostActions(level)[0] ?? null
  const start = shiftView(shiftInit(level))
  return {
    parts: partRows(levelId),
    moments: shiftMoments,
    firstMove,
    firstMoveWords: moveWords(firstMove),
    firstAsk: 'optional',
    // The first move is often pressed again where it was (a stepper's "one more", a second operation from the bar): the strip is held blank
    // until the hand leaves the dock, so the controls under it do not move.
    holdsStrip: true,
    askOpen,
    isAsk: (action) => action.t === 'commit',
    askWords: (view) => plainWords(view.predict.ask),
    look: () => {
      if (start.layout !== null) {
        const shape = start.layout.table.map((row) => row.size)
        const strides = start.layout.table.map((row) => row.stride)
        return {
          label: 'Shape and strides',
          title: 'Shape and strides',
          detail: `Shape ${tupleText(shape)}, strides ${tupleText(strides)}: one step along dimension ${shape.length - 1} moves ${strides[strides.length - 1] ?? 0} in the buffer${shape.length > 1 ? `, and one step along dimension 0 moves ${strides[0] ?? 0}` : ''}.`,
          anchor: '[data-shift-table]',
        }
      }
      if (start.grid !== null) {
        return {
          label: 'The tensor',
          title: 'The tensor',
          detail: `Shape ${tupleText(start.grid.shape)}: ${start.grid.shape[0]} rows of ${start.grid.shape[1]} elements, every one to be covered by exactly one program.`,
          anchor: '[data-shift-launch]',
        }
      }
      return null
    },
    levelParts,
    DockView,
  }
}
