import { useContext, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react'
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

/**
 * The processes the stage list's stages start in, from the client to the GPU, each by name. With the stages already laid, a process whose
 * stages are all laid keeps its place with a count of none, so the chips are the same from the first lay to the last.
 */
export function platformsOf(tray: readonly TileView[], present: Place, laid: readonly TileView[] = []): Platform[] {
  const counts = new Map<string, { count: number; rank: number }>()
  for (const [tile, one] of [...tray.map((tile) => [tile, 1] as const), ...laid.map((tile) => [tile, 0] as const)]) {
    const key = platformOf(tile.from)
    const seen = counts.get(key)
    if (seen === undefined) counts.set(key, { count: one, rank: FLOOR_KINDS.indexOf(floorKindOf(tile.from)) })
    else seen.count += one
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

/**
 * At a desk the instrument's body is one screen tall while the stage list is open (floor.css): once the prediction is in, the page brings
 * it whole into view, so the drawing, the list and Run the path stand on the screen together and the page has no reason to move again.
 * The prediction's own controls went with the press, so nothing is left under the pointer to move. On a phone the dock is pinned instead.
 */
function frameInView(list: HTMLElement | null): void {
  const body = list?.closest<HTMLElement>('.es-frame__body')
  if (body === null || body === undefined || !window.matchMedia('(min-width: 64rem)').matches) return
  const box = body.getBoundingClientRect()
  if (box.height <= window.innerHeight && (box.top < 0 || box.bottom > window.innerHeight)) body.scrollIntoView({ block: 'nearest' })
}

/*
 * The stage list is a box that scrolls on its own, wherever the game stands (floor.css): a lay, a filter or a typed letter changes what is
 * inside the box and nothing outside it, so the page, the field, the chips and the actions never move under the pointer or the caret.
 *
 * One move is left, inside the box. A stage laid with the box at its foot shortens it, the box is pulled up to its new foot, and the tile
 * above the one laid comes under the pointer or the finger. So the box keeps the laid row's room at its end while it stands there, and says
 * how many stages are above it. It gives the room back only where nobody can be about to press in it: as the box's own scroll takes the
 * room out of sight (a swipe), at once when the learner turns the wheel over it or uses a key in it, and when a mouse leaves it. The box
 * does not snap to a tile while it keeps room: the tile it stood on may be the one laid.
 */
interface BoxHold {
  readonly list: HTMLUListElement
  room: number
  /** Stops listening to the box. */
  readonly stop: () => void
}

/** How much of a box's kept room is still in sight: the room, less what its scroll has taken out of view. `null` once none is. */
export function roomInSight(room: number, scrollTop: number, clientHeight: number, scrollHeight: number): number | null {
  const seen = Math.min(room, scrollTop + clientHeight - (scrollHeight - room))
  return seen > 0.5 ? seen : null
}

/** Gives back what of a box's kept room the box's scroll has taken out of sight. Returns whether any room is still kept. */
function trimBox(hold: BoxHold): boolean {
  const { list } = hold
  if (!list.isConnected) return false
  const keep = roomInSight(hold.room, list.scrollTop, list.clientHeight, list.scrollHeight)
  if (keep === null) {
    unkeep(list)
    return false
  }
  hold.room = keep
  list.style.setProperty('--es-floor-kept', `${keep}px`)
  countAbove(list)
  return true
}

/** The box keeps `room` px at its end, where it says that the stages are above (floor.css), and stands still rather than snap. */
function keepRoom(list: HTMLUListElement, room: number): void {
  list.style.setProperty('--es-floor-kept', `${room}px`)
  list.style.scrollSnapType = 'none'
  list.dataset.kept = ''
  countAbove(list)
}

function unkeep(list: HTMLUListElement): void {
  list.style.removeProperty('--es-floor-kept')
  list.style.scrollSnapType = ''
  delete list.dataset.kept
  delete list.dataset.above
}

/** "3 stages": how many tiles lie wholly above what a box shows, in words. */
export function aboveWords(tops: readonly number[], boxTop: number, tileHeight: number): string {
  const above = tops.filter((top) => top + tileHeight <= boxTop + 0.5).length
  return `${above} ${above === 1 ? 'stage' : 'stages'}`
}

/** Writes how many stages lie above the box's top edge, for the words in its kept room (floor.css). */
function countAbove(list: HTMLUListElement): void {
  const tiles = Array.from(list.querySelectorAll<HTMLElement>('[data-stage]'))
  const height = tiles[0]?.getBoundingClientRect().height ?? 0
  const words = aboveWords(
    tiles.map((tile) => tile.getBoundingClientRect().top),
    list.getBoundingClientRect().top + list.clientTop,
    height,
  )
  if (list.dataset.above !== words) list.dataset.above = words
}

/**
 * How many tiles stand whole in a box once a row has been laid and its room kept: the tiles that are left, each shifted up by the laid row if
 * it stood below it. A box that would keep so much room that none is left whole is blank while stages remain, so it gives the room back.
 */
export function wholeAfterLay(tops: readonly number[], laidAt: number, room: number, tileHeight: number, boxTop: number, boxBottom: number): number {
  return tops.filter((top) => {
    if (top === laidAt) return false
    const at = top > laidAt ? top - room : top
    return at >= boxTop - 0.5 && at + tileHeight <= boxBottom + 0.5
  }).length
}

/** How long, in ms, a press on the spot where a tile has just come to stand under the pointer lays nothing. */
export const ARRIVAL_MS = 800

/** A point on the screen, in CSS px from the viewport's top left. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** How far, in px, a pointer may stray from where Commit was pressed and still be standing on that press: a hand's tremble, not a move. */
const SAME_SPOT = 10

/** Whether a press stands where Commit was pressed (`from`, or `null` once the pointer has left that spot). */
export function onSameSpot(press: Point, from: Point | null): boolean {
  return from !== null && Math.hypot(press.x - from.x, press.y - from.y) <= SAME_SPOT
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
  /** `press`: the click that committed, if a pointer made it (the tiles ignore a press on its spot until the pointer leaves it). */
  readonly commit: (press?: { readonly clientX: number; readonly clientY: number; readonly detail: number }) => void
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
  /** A filter chip that the keys reach is scrolled whole into its row. */
  readonly onChipFocus: (event: FocusEvent<HTMLDivElement>) => void
  /**
   * `at`: where a pointer pressed the tile, or `null` for a key. A pointer's next tile already stands where the learner is looking and is not
   * brought into view.
   */
  readonly lay: (id: string, index: number, at?: Point | null) => void
  readonly onTrayKey: (event: KeyboardEvent<HTMLUListElement>) => void
  readonly move: (index: number, by: -1 | 1) => void
  readonly takeBack: (to: number) => void
  readonly unlay: () => void
  readonly sendIt: () => void
}

export function useFloorControls(run: FloorRun, ring: string | null = null): FloorControls {
  const { view, dispatch } = run
  const [pick, setPick] = useState<number | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [stop, setStop] = useState<number | null>(null)
  const tray = useRef<HTMLUListElement>(null)
  const chips = useRef<HTMLDivElement>(null)
  const focusAfterLay = useRef<number | null>(null)
  const revealAfterLay = useRef(true)
  const focusAfterCommit = useRef(false)
  const focusAfterTakeBack = useRef(false)
  const boxHold = useRef<BoxHold | null>(null)
  const listTop = useRef<number | null>(null)
  const commitSpot = useRef<{ at: Point; stop: () => void } | null>(null)
  const arrival = useRef<{ at: Point; until: number } | null>(null)
  const setFilter = setChosen
  const setQuery = setText
  const query = text

  const platforms = platformsOf(view.tray, view.present, view.laid)
  const filter = chosen !== null && platforms.some((platform) => platform.key === chosen && platform.count > 0) ? chosen : null
  const tiles = view.tray.filter((tile) => (filter === null || platformOf(tile.from) === filter) && matches(tile, query))
  // Until the learner moves, the one tab stop is the stage the first run points at, else the first.
  const ringAt = ring === null ? -1 : tiles.findIndex((tile) => tile.id === ring)
  const tabStop = Math.min(stop ?? Math.max(ringAt, 0), Math.max(tiles.length - 1, 0))
  const choices = Array.from({ length: MAX_PREDICTION + 1 }, (_, i) => i)

  // The box gives back its kept room as its own scroll takes it out of sight; a new filter, a query or a restart gives it all back.
  const releaseBox = useCallback(() => {
    const held = boxHold.current
    if (held === null) return
    boxHold.current = null
    held.stop()
    unkeep(held.list)
  }, [])
  useEffect(() => releaseBox, [releaseBox])
  useEffect(() => {
    releaseBox()
  }, [chosen, text, releaseBox])
  useEffect(() => {
    if (view.laid.length === 0) releaseBox()
  }, [view.laid.length, releaseBox])

  // A box that snaps to a tile (a phone's) would settle a tile higher after a pointer lay, since the tile laid was the one it stood on, and
  // slide under the pointer. It goes back to where it stood. The words in a kept room count the stages above it anew.
  useLayoutEffect(() => {
    const top = listTop.current
    listTop.current = null
    if (top !== null && tray.current !== null) tray.current.scrollTop = top
    if (boxHold.current !== null) countAbove(boxHold.current.list)
  }, [view.tray])

  // After a stage is laid, focus follows to the next tile in the list, or to the chips when the filters leave none.
  useEffect(() => {
    const at = focusAfterLay.current
    if (at === null) return
    focusAfterLay.current = null
    const buttons = tray.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const next = buttons && buttons.length > 0 ? buttons[Math.min(at, buttons.length - 1)] : chips.current?.querySelector('button')
    next?.focus({ preventScroll: true })
    if (revealAfterLay.current) reveal(next)
  }, [view.tray])

  // After the prediction is committed, focus goes to the stage list: the next decision. A first run that points at a stage has
  // scrolled the list to it (the stage list's own effect runs first), so focus goes there, and Enter lays the move the intro points at;
  // otherwise the first tile is focused and brought into view.
  useEffect(() => {
    if (!focusAfterCommit.current || view.prediction === null) return
    focusAfterCommit.current = false
    const buttons = tray.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons || buttons.length === 0) return
    const ringed = ring === null ? undefined : Array.from(buttons).find((button) => button.closest('.es-floor-ring') !== null)
    const target = ringed ?? buttons[0]
    target.focus({ preventScroll: true })
    frameInView(tray.current)
    reveal(target)
  }, [view.prediction, ring])

  // After the path is taken back, focus goes to the first tile of the list, where the fix is chosen.
  useEffect(() => {
    if (!focusAfterTakeBack.current) return
    focusAfterTakeBack.current = false
    tray.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [view.laid.length])

  /*
   * At a desk the commit brings the frame whole into view, and on a phone the list opens in the dock: either way a tile can come to stand
   * where Commit was. A double click on Commit, or a second press before the pointer moves, would lay that tile, which the learner never
   * aimed at. So a press on the spot where Commit was pressed lays nothing until the pointer has left that spot.
   */
  const forgetCommitSpot = useCallback(() => {
    commitSpot.current?.stop()
    commitSpot.current = null
  }, [])
  useEffect(() => forgetCommitSpot, [forgetCommitSpot])
  const keepCommitSpot = useCallback(
    (at: Point) => {
      forgetCommitSpot()
      const moved = (event: PointerEvent) => {
        if (!onSameSpot({ x: event.clientX, y: event.clientY }, at)) forgetCommitSpot()
      }
      window.addEventListener('pointermove', moved, { passive: true, capture: true })
      window.addEventListener('pointerdown', moved, { passive: true, capture: true })
      commitSpot.current = {
        at,
        stop: () => {
          window.removeEventListener('pointermove', moved, { capture: true })
          window.removeEventListener('pointerdown', moved, { capture: true })
        },
      }
    },
    [forgetCommitSpot],
  )

  // In a lesson whose guess asks this level's question, its commit keeps the lesson's prediction too: one prompt (REDESIGN §2.5).
  const lesson = useContext(LessonGuessContext)
  const commit = useCallback((press?: { readonly clientX: number; readonly clientY: number; readonly detail: number }) => {
    if (pick === null) return
    if (press !== undefined && press.detail > 0) keepCommitSpot({ x: press.clientX, y: press.clientY })
    else forgetCommitSpot()
    focusAfterCommit.current = true
    lesson?.commit(pick)
    dispatch({ t: 'commit', prediction: pick })
  }, [pick, dispatch, lesson, keepCommitSpot, forgetCommitSpot])

  const lay = (id: string, index: number, at: Point | null = null) => {
    if (at !== null && onSameSpot(at, commitSpot.current?.at ?? null)) return
    // A tile that has just come to stand under the pointer (a box that gave back its room) is not pressed by a second press on the same spot.
    if (at !== null && arrival.current !== null && performance.now() < arrival.current.until && onSameSpot(at, arrival.current.at)) return
    arrival.current = null
    const byPointer = at !== null
    focusAfterLay.current = index
    revealAfterLay.current = !byPointer
    const list = tray.current
    const ownBox = list !== null && getComputedStyle(list).overflowY !== 'visible'
    listTop.current = byPointer && ownBox ? list.scrollTop : null
    const item = list?.querySelector<HTMLElement>(`[data-stage="${CSS.escape(id)}"]`)?.closest('li') ?? null
    // The laid row's room: the row and the gap that goes with it.
    const gapOf = item === null ? null : item.previousElementSibling !== null ? item : item.nextElementSibling
    const room = item === null ? 0 : item.getBoundingClientRect().height + (gapOf === null ? 0 : parseFloat(getComputedStyle(gapOf).marginTop))
    const nearFoot = list !== null && ownBox && byPointer && item !== null && list.scrollTop > 0 && list.scrollTop > list.scrollHeight - list.clientHeight - room + 0.5
    if (nearFoot && list !== null && item !== null) {
      // Room kept over room kept would leave the box blank while stages remain: the box gives its room back instead, and the tile above
      // the one laid comes under the pointer, where a press within a moment lays nothing.
      const tiles = Array.from(list.querySelectorAll<HTMLElement>('[data-stage]'))
      const box = list.getBoundingClientRect()
      const whole = wholeAfterLay(
        Array.from(list.children).map((row) => row.getBoundingClientRect().top),
        item.getBoundingClientRect().top,
        room,
        tiles[0]?.getBoundingClientRect().height ?? 0,
        box.top + list.clientTop,
        box.top + list.clientTop + list.clientHeight,
      )
      // At a desk only: on a phone the box keeps its room and says the stages are above, and the learner scrolls up to them.
      const atDesk = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 64rem)').matches
      if (atDesk && whole < 1 && tiles.length > 1) {
        releaseBox()
        if (at !== null) arrival.current = { at, until: performance.now() + ARRIVAL_MS }
        setStop(index)
        dispatch({ t: 'lay', stage: id })
        return
      }
    }
    if (nearFoot && list !== null && item !== null) {
      // A box that the lay would pull up (it stands within a row of its foot) keeps the laid row's room at its end, so it stays where it is.
      const held = boxHold.current
      if (held !== null && held.list === list) held.room += room
      else {
        releaseBox()
        const trim = () => {
          const kept = boxHold.current
          if (kept !== null && kept.list === list && !trimBox(kept)) releaseBox()
        }
        // The wheel over the box, a key in it, or a mouse leaving it: the learner is moving the list, or is not over it.
        const free = (event: Event) => {
          if (event.type === 'pointerleave' && (event as PointerEvent).pointerType !== 'mouse') return
          if (boxHold.current?.list === list) releaseBox()
        }
        list.addEventListener('scroll', trim, { passive: true })
        list.addEventListener('wheel', free, { passive: true })
        list.addEventListener('keydown', free)
        list.addEventListener('pointerleave', free)
        boxHold.current = {
          list,
          room,
          stop: () => {
            list.removeEventListener('scroll', trim)
            list.removeEventListener('wheel', free)
            list.removeEventListener('keydown', free)
            list.removeEventListener('pointerleave', free)
          },
        }
      }
      const kept = boxHold.current
      if (kept !== null) keepRoom(list, kept.room)
    }
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

  // A row of chips that scrolls sideways (a short desk's, a phone's) answers a wheel turned over it, which only goes up and down: the row
  // moves sideways by what the wheel moved, and the fade at its right edge goes once its last chip is in sight.
  useEffect(() => {
    const row = chips.current
    if (row === null) return
    const mark = () => {
      if (row.scrollWidth > row.clientWidth + 1 && row.scrollLeft + row.clientWidth < row.scrollWidth - 1) row.dataset.more = ''
      else delete row.dataset.more
    }
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || row.scrollWidth <= row.clientWidth + 1) return
      if (getComputedStyle(row).overflowX === 'visible') return
      const before = row.scrollLeft
      row.scrollLeft += event.deltaY
      if (row.scrollLeft !== before) event.preventDefault()
    }
    mark()
    row.addEventListener('scroll', mark, { passive: true })
    row.addEventListener('wheel', wheel, { passive: false })
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark)
    watch?.observe(row)
    return () => {
      row.removeEventListener('scroll', mark)
      row.removeEventListener('wheel', wheel)
      watch?.disconnect()
    }
  }, [view.step, platforms.length])

  // Chrome brings a focused control into view only when none of it shows, and the field and the chips share a row that scrolls sideways
  // on a phone (and at a short desk): a chip reached by the keys is brought whole into the row. A pointer's press is left alone, so a chip
  // half in view does not slide out from under it.
  const onChipFocus = (event: FocusEvent<HTMLDivElement>) => {
    const chip = event.target
    if (!(chip instanceof HTMLElement) || chip === event.currentTarget || !chip.matches(':focus-visible')) return
    chip.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return { run, view, choices, pick, setPick, commit, platforms, filter, setFilter, query, setQuery, tiles, tabStop, tray, chips, onChipFocus, lay, onTrayKey, move, takeBack, unlay, sendIt }
}
