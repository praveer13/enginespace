import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { MAX_PREDICTION } from '@es/play/engine-floor/facts'
import type { FloorView, TileView } from '@es/play/engine-floor/types'
import { FLOOR_KINDS, floorKindOf } from '@es/play/engine-floor/words'
import type { Place } from '@es/sim/lifecycle'
import { changeLine } from './announce'
import type { FloorRun } from './types'

/*
 * The state behind Back of House's controls (Controls.tsx): the prediction's pick, the platform filter, which tile of the tray the tab stop
 * is on and where focus goes after a stage is laid, and which laid stage is selected for moving. The pieces in Controls.tsx draw it.
 *
 * What the learner does is the session's and lives in the run (A§6.3): this holds only what a view needs to be usable by keyboard, so a swap
 * of views, a restart or an undo can never leave the controls disagreeing with the session.
 */

/** The platform a stage starts on: the process it runs in, or the line for a stage that starts on the GPU. */
export const platformOf = (place: Place): string => (place.device === 'gpu' ? 'GPU' : place.process)

export interface Platform {
  readonly key: string
  /** How many stages left in the tray start there. */
  readonly count: number
  /** The ticket is on this platform now (the present): the place the next stage should start. */
  readonly here: boolean
}

/** The platforms the tray's stages start on: the floors from the dining room down, each by name. */
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

/** The announcement for every change of the view, once the first one has been seen. */
function useAnnouncements(run: FloorRun): void {
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

/** The controls' state and handlers, shared by the pieces wherever a page puts them. */
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
  /** The tray's tiles that the filter shows. */
  readonly tiles: readonly TileView[]
  readonly tabStop: number
  readonly tray: RefObject<HTMLUListElement | null>
  readonly chips: RefObject<HTMLDivElement | null>
  readonly send: RefObject<HTMLDivElement | null>
  readonly lay: (id: string, index: number) => void
  readonly onTrayKey: (event: KeyboardEvent<HTMLUListElement>) => void
  /** The laid stage selected for moving, or null. */
  readonly selected: number | null
  readonly select: (index: number | null) => void
  /** The laid stage that holds the tab stop: the selected one, else the last. */
  readonly rowStop: number
  readonly rows: RefObject<HTMLOListElement | null>
  readonly onRowKey: (event: KeyboardEvent<HTMLOListElement>) => void
  readonly move: (index: number, by: -1 | 1) => void
  readonly takeBack: (to: number) => void
  readonly unlay: () => void
  readonly sendIt: () => void
}

export function useFloorControls(run: FloorRun): FloorControls {
  const { view, dispatch } = run
  const [pick, setPick] = useState<number | null>(null)
  const [chosen, setFilter] = useState<string | null>(null)
  const [stop, setStop] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [rowAt, setRowAt] = useState<number | null>(null)
  const rows = useRef<HTMLOListElement>(null)
  const tray = useRef<HTMLUListElement>(null)
  const chips = useRef<HTMLDivElement>(null)
  const send = useRef<HTMLDivElement>(null)
  const focusAfterLay = useRef<number | null>(null)
  const focusAfterCommit = useRef(false)
  const focusAfterTakeBack = useRef(false)
  useAnnouncements(run)

  const platforms = platformsOf(view.tray, view.present)
  const filter = chosen !== null && platforms.some((platform) => platform.key === chosen) ? chosen : null
  const tiles = filter === null ? view.tray : view.tray.filter((tile) => platformOf(tile.from) === filter)
  const tabStop = Math.min(stop, Math.max(tiles.length - 1, 0))
  const choices = Array.from({ length: MAX_PREDICTION + 1 }, (_, i) => i)

  // After a stage is laid, focus follows to the next tile in the tray, or to the chips when the filter has none left.
  useEffect(() => {
    const at = focusAfterLay.current
    if (at === null) return
    focusAfterLay.current = null
    const buttons = tray.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const next = buttons && buttons.length > 0 ? buttons[Math.min(at, buttons.length - 1)] : chips.current?.querySelector('button')
    next?.focus()
  }, [view.tray])

  // After the prediction is committed, focus goes to the tray: the next decision.
  useEffect(() => {
    if (!focusAfterCommit.current || view.prediction === null) return
    focusAfterCommit.current = false
    tray.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [view.prediction])

  // After the path is taken back, focus goes to the first tile of the tray, where the fix is chosen.
  useEffect(() => {
    if (!focusAfterTakeBack.current) return
    focusAfterTakeBack.current = false
    tray.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [view.laid.length])

  const commit = useCallback(() => {
    if (pick === null) return
    focusAfterCommit.current = true
    dispatch({ t: 'commit', prediction: pick })
  }, [pick, dispatch])

  const lay = (id: string, index: number) => {
    focusAfterLay.current = index
    setStop(index)
    setSelected(null)
    setRowAt(null)
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
    buttons[target]?.focus()
  }

  const select = (index: number | null) => {
    setRowAt(index)
    setSelected((now) => (now === index ? null : index))
  }
  const onRowKey = (event: KeyboardEvent<HTMLOListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button.es-floor-row__main'))
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0 || event.ctrlKey || event.altKey || event.metaKey) return
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(buttons.length - 1, next))
    setRowAt(target)
    buttons[target]?.focus()
  }
  const move = (index: number, by: -1 | 1) => {
    setSelected(index + by)
    setRowAt(index + by)
    dispatch({ t: 'move', from: index, by })
  }
  const takeBack = (to: number) => {
    focusAfterTakeBack.current = true
    setSelected(null)
    setRowAt(null)
    dispatch({ t: 'unlay', to })
  }
  const unlay = () => {
    setSelected(null)
    setRowAt(null)
    dispatch({ t: 'unlay' })
  }
  const sendIt = () => {
    if (view.canRun) dispatch({ t: 'run' })
  }

  const last = Math.max(view.laid.length - 1, 0)
  const rowStop = Math.min(rowAt ?? last, last)
  return {
    run,
    view,
    choices,
    pick,
    setPick,
    commit,
    platforms,
    filter,
    setFilter,
    tiles,
    tabStop,
    tray,
    chips,
    send,
    lay,
    onTrayKey,
    selected: selected !== null && selected < view.laid.length ? selected : null,
    select,
    rowStop,
    rows,
    onRowKey,
    move,
    takeBack,
    unlay,
    sendIt,
  }
}
