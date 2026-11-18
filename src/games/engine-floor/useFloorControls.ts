import { useContext, useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { LessonGuessContext } from '@/games/kit/lessonGuess'
import { MAX_PREDICTION } from '@es/play/engine-floor/facts'
import type { FloorView, TileView } from '@es/play/engine-floor/types'
import { FLOOR_KINDS, MECHANISM_WORDS, floorKindOf, placeName } from '@es/play/engine-floor/words'
import type { Place } from '@es/sim/lifecycle'
import { changeLine } from './announce'
import type { FloorRun } from './types'

/*
 * The state behind Request path's dock (Controls.tsx): the prediction's pick, the stage list's filters (a process, and typed text), which
 * tile holds the tab stop, and where focus goes after a stage is laid. The pieces in Controls.tsx draw it.
 *
 * What the learner does is the session's and lives in the run (A§6.3): this holds only what a view needs to be usable by keyboard, so a
 * restart or an undo can never leave the dock disagreeing with the session.
 */

/** The process a stage starts in, or the GPU for a stage that starts on one. */
export const platformOf = (place: Place): string => (place.device === 'gpu' ? 'GPU' : place.process)

export interface Platform {
  readonly key: string
  /** How many stages left in the list start there. */
  readonly count: number
  /** The request is in this process now (the present): where the next stage starts. */
  readonly here: boolean
}

/** The processes the stage list's stages start in, from the client to the GPU, each by name. */
export function platformsOf(tray: readonly TileView[], present: Place): Platform[] {
  const counts = new Map<string, { count: number; rank: number }>()
  for (const tile of tray) {
    const key = platformOf(tile.from)
    const seen = counts.get(key)
    if (seen === undefined) counts.set(key, { count: 1, rank: FLOOR_KINDS.indexOf(floorKindOf(tile.from)) })
    else seen.count += 1
  }
  return [...counts.entries()]
    .sort((a, b) => a[1].rank - b[1].rank || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, { count }]) => ({ key, count, here: key === platformOf(present) }))
}

/** Whether a tile matches typed text: every word in its label, its mechanism's words or either place, in any case. */
export function matches(tile: TileView, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return true
  const mechanism = MECHANISM_WORDS[tile.mechanism]
  const text = [tile.label.replaceAll('`', ''), mechanism.tile, mechanism.engine, placeName(tile.from), placeName(tile.to)].join(' ').toLowerCase()
  return words.every((word) => text.includes(word))
}

/** Brings a tile into view by the least scrolling: its list, then the dock, and the page only when the dock itself is out of view. */
export function reveal(tile: HTMLElement | null | undefined): void {
  tile?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** The announcement for every change of the view, once the first one has been seen. The diagram calls it: it is drawn for the whole run. */
export function useAnnouncements(run: Pick<FloorRun, 'view' | 'announce'>): void {
  const seen = useRef<FloorView | null>(null)
  const { view, announce } = run
  useEffect(() => {
    const before = seen.current
    seen.current = view
    if (before === null) return
    const line = changeLine(before, view)
    if (line !== '') announce(line)
  }, [view, announce])
}

/** The dock's state and handlers, shared by the pieces wherever a page puts them. */
export interface FloorControls {
  readonly run: FloorRun
  readonly view: FloorView
  readonly choices: readonly number[]
  readonly pick: number | null
  readonly setPick: (n: number) => void
  readonly commit: () => void
  readonly platforms: readonly Platform[]
  readonly filter: string | null
  readonly setFilter: (key: string | null) => void
  readonly query: string
  readonly setQuery: (text: string) => void
  /** The stage list's tiles that the filters show. */
  readonly tiles: readonly TileView[]
  readonly tabStop: number
  readonly tray: RefObject<HTMLUListElement | null>
  readonly chips: RefObject<HTMLDivElement | null>
  readonly lay: (id: string, index: number) => void
  readonly onTrayKey: (event: KeyboardEvent<HTMLUListElement>) => void
  readonly move: (index: number, by: -1 | 1) => void
  readonly takeBack: (to: number) => void
  readonly unlay: () => void
  readonly sendIt: () => void
}

export function useFloorControls(run: FloorRun): FloorControls {
  const { view, dispatch } = run
  const [pick, setPick] = useState<number | null>(null)
  const [chosen, setFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [stop, setStop] = useState(0)
  const tray = useRef<HTMLUListElement>(null)
  const chips = useRef<HTMLDivElement>(null)
  const focusAfterLay = useRef<number | null>(null)
  const focusAfterCommit = useRef(false)
  const focusAfterTakeBack = useRef(false)

  const platforms = platformsOf(view.tray, view.present)
  const filter = chosen !== null && platforms.some((platform) => platform.key === chosen) ? chosen : null
  const tiles = view.tray.filter((tile) => (filter === null || platformOf(tile.from) === filter) && matches(tile, query))
  const tabStop = Math.min(stop, Math.max(tiles.length - 1, 0))
  const choices = Array.from({ length: MAX_PREDICTION + 1 }, (_, i) => i)

  // After a stage is laid, focus follows to the next tile in the list, or to the chips when the filters leave none.
  useEffect(() => {
    const at = focusAfterLay.current
    if (at === null) return
    focusAfterLay.current = null
    const buttons = tray.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const next = buttons && buttons.length > 0 ? buttons[Math.min(at, buttons.length - 1)] : chips.current?.querySelector('button')
    next?.focus({ preventScroll: true })
    reveal(next)
  }, [view.tray])

  // After the prediction is committed, focus goes to the stage list: the next decision.
  useEffect(() => {
    if (!focusAfterCommit.current || view.prediction === null) return
    focusAfterCommit.current = false
    tray.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [view.prediction])

  // After the path is taken back, focus goes to the first tile of the list, where the fix is chosen.
  useEffect(() => {
    if (!focusAfterTakeBack.current) return
    focusAfterTakeBack.current = false
    tray.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [view.laid.length])

  // In a lesson whose guess asks this level's question, its commit keeps the lesson's prediction too: one prompt (REDESIGN §2.5).
  const lesson = useContext(LessonGuessContext)
  const commit = useCallback(() => {
    if (pick === null) return
    focusAfterCommit.current = true
    lesson?.commit(pick)
    dispatch({ t: 'commit', prediction: pick })
  }, [pick, dispatch, lesson])

  const lay = (id: string, index: number) => {
    focusAfterLay.current = index
    setStop(index)
    dispatch({ t: 'lay', stage: id })
  }

  const onTrayKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0 || event.ctrlKey || event.altKey || event.metaKey) return
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(buttons.length - 1, next))
    setStop(target)
    buttons[target]?.focus({ preventScroll: true })
    reveal(buttons[target])
  }

  const move = (index: number, by: -1 | 1) => dispatch({ t: 'move', from: index, by })
  const takeBack = (to: number) => {
    focusAfterTakeBack.current = true
    dispatch({ t: 'unlay', to })
  }
  const unlay = () => {
    if (view.canUnlay) dispatch({ t: 'unlay' })
  }
  const sendIt = () => {
    if (view.canRun) dispatch({ t: 'run' })
  }

  return { run, view, choices, pick, setPick, commit, platforms, filter, setFilter, query, setQuery, tiles, tabStop, tray, chips, lay, onTrayKey, move, takeBack, unlay, sendIt }
}
