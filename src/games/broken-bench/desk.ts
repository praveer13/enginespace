import type { Dispatch, SetStateAction } from 'react'
import { cutOf, harnessDesk, readingOf, tailOf } from '@es/play/broken-bench/desk'
import type { Clock, Desk, Reading, TailLine } from '@es/play/broken-bench/desk'
import type { SceneView } from '@es/play/broken-bench/types'
import type { BenchRun } from './types'

/*
 * The inspector's desk on the page (GAMES.md §11, "Controls"): what the learner has set the stopwatch and the cut to, and which order of
 * the log the lamp is on. These are the board's own, held above the shell with the page and not in the session: the session's actions are
 * the ones GAMES.md §11 lists, and the court never reads the desk. A setting is kept only while its case is on the board. The key names
 * the case, so a new case starts with the report's own settings and nothing is cleared by an effect.
 *
 * The desk starts as the report read the log: the harness's clock and its own warm-up. Moving the stopwatch to the due time, or the cut to
 * the course's rule, is the learner's act, and the tail and the sheets answer at once.
 */

/** What the learner changed at the desk of one case. Anything not set is the report's own. */
export interface DeskSettings {
  readonly key: string
  readonly clock?: Clock
  readonly cut?: number
  readonly selected?: number | null
}

export const NO_SETTINGS: DeskSettings = { key: '' }

export type Move = 'next' | 'previous' | 'first' | 'last' | { readonly by: number }

export interface DeskApi extends Desk {
  /** The report's own settings: the clock its timer started at and the warm-up it declared. */
  readonly harness: Desk
  /** The order the lamp is on, by its place in the log. */
  readonly selected: number | null
  readonly reading: Reading
  readonly tail: readonly TailLine[]
  setClock(clock: Clock): void
  setCut(cut: number): void
  select(index: number | null): void
  move(by: Move): void
}

/** The key of the case on the board: a new case, or a new seed, is a new desk. */
export const deskKey = (run: BenchRun): string => `${run.level}|${run.seed}|${run.view.caseNo}`

const readings = new WeakMap<readonly object[], Map<string, { reading: Reading; tail: TailLine[] }>>()

/** The reading and the tail at these settings, worked out once for each clock and cut of a log. */
function readAt(scene: SceneView, desk: Desk): { reading: Reading; tail: TailLine[] } {
  let byDesk = readings.get(scene.rows)
  if (byDesk === undefined) {
    byDesk = new Map()
    readings.set(scene.rows, byDesk)
  }
  const cut = cutOf(scene.rows, desk.cut)
  const id = `${desk.clock}|${cut}`
  let known = byDesk.get(id)
  if (known === undefined) {
    const reading = readingOf(scene.rows, { clock: desk.clock, cut })
    known = { reading, tail: tailOf(scene.rows, { clock: desk.clock, cut }, reading) }
    byDesk.set(id, known)
  }
  return known
}

/**
 * The desk of the case on the board, or null once the court has risen. `settings` is the page's state and `set` its setter; neither
 * is a hook here, so the slots of the shell, which are plain functions called in its render, can each ask for the desk.
 */
export function deskFor(settings: DeskSettings, set: Dispatch<SetStateAction<DeskSettings>>, run: BenchRun): DeskApi | null {
  const scene = run.view.scene
  if (scene === null) return null
  const key = deskKey(run)
  const mine = settings.key === key ? settings : { key }
  const harness = harnessDesk(scene.claim.timerStartsAt, scene.harnessCut)
  const clock = mine.clock ?? harness.clock
  const cut = cutOf(scene.rows, mine.cut ?? harness.cut)
  const selected = mine.selected ?? null
  const last = scene.rows.length - 1
  const change = (patch: Partial<DeskSettings>) => set((before) => ({ ...(before.key === key ? before : { key }), ...patch, key }))
  const { reading, tail } = readAt(scene, { clock, cut })

  const select = (index: number | null) => change({ selected: index === null ? null : Math.max(0, Math.min(index, last)) })
  const move = (by: Move) => {
    const at = selected
    if (by === 'first') return select(cut)
    if (by === 'last') return select(last)
    if (at === null) return select(by === 'previous' ? last : cut)
    if (by === 'next') return select(at + 1)
    if (by === 'previous') return select(at - 1)
    return select(at + by.by)
  }

  return {
    clock,
    cut,
    harness,
    selected,
    reading,
    tail,
    setClock: (next) => change({ clock: next }),
    setCut: (next) => change({ cut: cutOf(scene.rows, next) }),
    select,
    move,
  }
}

/** Orders the tape prints at once, around the selection: a phone's height holds fewer, and each prints as a block of its own there. */
export const TAPE_ORDERS = { landscape: 21, portrait: 9 } as const

/** The first order the tape prints: the stretch holds the selection in its middle, or starts at the cut when nothing is selected. */
export function tapeStart(count: number, selected: number | null, cut: number, size: number): number {
  const centre = selected ?? cut + Math.floor(size / 2)
  return Math.max(0, Math.min(centre - Math.floor(size / 2), count - size))
}
