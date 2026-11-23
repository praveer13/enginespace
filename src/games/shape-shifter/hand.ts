/*
 * What stays under the learner's hand (GAMES.md §4.1, "Nothing moves under the hand").
 *
 *   A press that lands where the press before it landed, moments after it, on a control that was not the one pressed then, is a second
 *   press meant for the first control: the result, the next target's guess or the steppers came up under the pointer in between. It is
 *   ignored, so a double tap on contiguous() or Launch never presses Next level, New numbers or Skip the guess. A key press is ignored
 *   in two ways only: a picker takes focus to a choice as it opens, so a key that opened it, pressed again at once, would press that
 *   choice (earlyKey); and Enter held down on the operation bar or a picker repeats, and its repeats press nothing (heldKey). A control
 *   pressed again (a stepper's "one more" held down) is still the same control. A picker's choice pressed by a pointer is never a stray:
 *   the picker opens under the bar, never under the press that opened it, so a choice at that spot is one the learner scrolled to.
 *
 *   On a phone the drawing stands in the page's flow over the pinned dock, so the cells and the buffer are read with the page: a tensor
 *   that grows or shrinks would move a dock that stands in the flow (scrolled to the page's foot, or on a screen too short to pin it).
 *   The page is scrolled by the same amount in the same frame, so the dock, and the control in it, stay where the hand is.
 *
 *   On a phone's first run, the part the intro names is brought whole into view over the pinned dock, so the buffer it names is seen. And
 *   the first time the learner reaches into the pinned dock, the page is scrolled up to the goal line, as far as the dock stays pinned, so
 *   the goal, the table, the cells and the buffer stand together over it. When the run ends, the frame brings the drawing's top and the
 *   result's ways on into view; on a phone where the goal line fits over them too, it comes with them.
 */

/** A press: where, when, and the control it landed on (its tag, name and words; '' for none). */
export interface Press {
  readonly x: number
  readonly y: number
  readonly t: number
  readonly control: string
}

/** How near in space (px) and time (ms) a press must be to the one before it to be that press again [estimated: a double tap is 300 to 600 ms apart]. */
export const SAME_SPOT = 24
export const SAME_TIME = 800

/** Whether a pointer press is a stray: the press before it was at the same spot, just before, on another control. Pure. */
export function strayPress(before: Press | null, now: Press): boolean {
  if (before === null || now.control === '' || now.control === before.control) return false
  return now.t - before.t <= SAME_TIME && Math.hypot(now.x - before.x, now.y - before.y) <= SAME_SPOT
}

/** The control an event landed on, as words that stay the same when it is drawn again: '' where it landed on none, or on a picker's choice. */
function controlOf(target: EventTarget | null): string {
  const element = target instanceof Element ? target.closest('button, a[href], input, select, summary, [role="button"]') : null
  if (element === null || element.hasAttribute('data-choice')) return ''
  return `${element.tagName}|${element.getAttribute('aria-label') ?? ''}|${(element.textContent ?? '').trim()}`
}

/** Ignores stray presses inside `root` (see above). Returns the undo. */
export function guardPresses(root: HTMLElement): () => void {
  let before: Press | null = null
  let now: Press | null = null
  const down = (event: PointerEvent) => {
    before = now
    now = { x: event.clientX, y: event.clientY, t: event.timeStamp, control: controlOf(event.target) }
  }
  const click = (event: MouseEvent) => {
    // A key's click has no pointer (detail 0), and is never a stray.
    if (event.detail === 0 || now === null) return
    if (!strayPress(before, { ...now, control: controlOf(event.target) })) return
    event.preventDefault()
    event.stopPropagation()
  }
  root.addEventListener('pointerdown', down, true)
  root.addEventListener('click', click, true)
  return () => {
    root.removeEventListener('pointerdown', down, true)
    root.removeEventListener('click', click, true)
  }
}

/**
 * How long (ms) after a picker opens a key's press of one of its choices is still the key that opened it [estimated: two presses of Enter
 * meant as one land 80 to 250 ms apart, and a held key repeats after about 500 ms].
 */
export const KEY_SETTLE = 500

/**
 * Whether a press of a picker's choice is a key pressed twice: a key's click (no pointer, `detail` 0) that came within KEY_SETTLE of the
 * picker opening (`openedAt` and `at` on the page's clock). A pointer's press is never one: the picker opens under the bar, away from it. Pure.
 */
export function earlyKey(openedAt: number, at: number, detail: number): boolean {
  return detail === 0 && at - openedAt < KEY_SETTLE
}

/**
 * Whether a key's press is Enter held down and repeating (`repeat`), which a button takes as one more press each time (Space presses once,
 * when it is let go). On the operation bar and in its pickers it is dropped: Enter held on an operation would otherwise open its picker and,
 * a moment later, press the choice in focus. A stepper's "one more" is not on the bar, so a key held there keeps counting. Pure.
 */
export function heldKey(event: { readonly repeat: boolean; readonly key: string }): boolean {
  return event.repeat && event.key === 'Enter'
}

/** The height (px) of a box's "More below" at its foot (shape-shifter.css, frame.css: 1.75rem), which a control seated in the box stays over. */
const MORE_BELOW = 28

/** The room (px) kept over a seated control's top, for its ring's edge. */
const SEAT_ABOVE = 8

/**
 * How far (px) a box that scrolls scrolls to show `target` whole over its foot's "More below", or its top where it is taller than the room:
 * 0 where it is shown already. Pure.
 */
export function seatInBoxBy(target: { top: number; bottom: number }, box: { top: number; bottom: number }, below = MORE_BELOW): number {
  const room = box.bottom - below
  const top = box.top + SEAT_ABOVE
  if (target.top >= top && target.bottom <= room) return 0
  if (target.top < top) return target.top - top
  return Math.min(target.bottom - room, target.top - top)
}

/**
 * Brings `target` into view inside the dock that holds it (or inside `within`, where given), by scrolling the boxes that scroll there and
 * never the page: a pinned dock whose steppers or picker scroll inside it keeps the control the intro rings over the readout, where the
 * learner can see it and press it.
 */
export function seatInDock(target: HTMLElement, within?: Element | null): void {
  const room = within ?? target.closest('[data-dock]')
  if (room === null) return
  for (let box = target.parentElement; box !== null && room.contains(box); box = box.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(box).overflowY) || box.scrollHeight <= box.clientHeight + 1) continue
    const by = seatInBoxBy(target.getBoundingClientRect(), box.getBoundingClientRect())
    if (Math.abs(by) >= 1) box.scrollTop += by
  }
}

/** Under 64rem: the drawing stands in the page's flow (shape-shifter.css). */
const NARROW = '(max-width: 63.999rem)'

/** The dock keeper of each frame on the page, so the drawing's own commit can run it (useKeepDock, View2D.tsx). */
const keepers = new WeakMap<Element, () => void>()

/**
 * Keeps the dock where it stands while the drawing in `frame` changes its height on a phone, and keeps the drawing seated over a pinned dock
 * (seatDrawing, below). While a level is played the drawing never gets shorter than it has been (its least height follows its tallest), so
 * a dock that stands just under it is never pulled up. A taller drawing pushes a pinned dock nowhere; one that stands in the flow is moved
 * down, and the page takes that back: the dock's place in the page is read after every scroll and after every pass, and a move between
 * the two is the drawing's doing. A pass runs in the drawing's own commit, before anything is painted or read, and again when the drawing's box is
 * resized. Returns the undo.
 */
export function keepDock(frame: HTMLElement, seat: () => void): () => void {
  const dock = frame.querySelector<HTMLElement>('[data-dock]')
  const drawing = frame.querySelector<HTMLElement>('[data-frame-diagram]')
  if (dock === null || drawing === null) return () => {}
  // Where the dock stood: its top in the page (which no scroll changes while it stands in the flow), and whether it was pinned at the foot.
  let top = 0
  let pinned = false
  let tallest = 0
  const read = () => {
    const box = dock.getBoundingClientRect()
    top = box.top + window.scrollY
    pinned = getComputedStyle(dock).position === 'sticky' && Math.abs(box.bottom - window.innerHeight) < 1
  }
  read()
  // A new size of the screen lays the drawing out afresh, from its own height.
  const resized = () => {
    tallest = 0
    drawing.style.minHeight = ''
    read()
  }
  const pass = () => {
    if (!window.matchMedia(NARROW).matches || frame.getAttribute('data-phase') !== 'play') {
      if (tallest > 0) resized()
      else read()
      return
    }
    // A pinned dock stays at the foot whatever the drawing does; one in the flow has moved by the change of its top in the page.
    const moved = pinned ? 0 : dock.getBoundingClientRect().top + window.scrollY - top
    if (Math.abs(moved) >= 0.5) window.scrollBy({ top: moved, behavior: 'instant' })
    const high = drawing.getBoundingClientRect().height
    if (high > tallest) {
      tallest = high
      drawing.style.minHeight = `${high}px`
    }
    seat()
    read()
  }
  keepers.set(frame, pass)
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(pass)
  watch?.observe(drawing)
  window.addEventListener('scroll', read, { passive: true })
  window.addEventListener('resize', resized, { passive: true })
  return () => {
    keepers.delete(frame)
    watch?.disconnect()
    drawing.style.minHeight = ''
    window.removeEventListener('scroll', read)
    window.removeEventListener('resize', resized)
  }
}

/** Runs the dock keeper of the frame that holds `node`, if it has one: from the drawing's layout effect, in the commit that changed it. */
export function keepDockNow(node: Element | null): void {
  const frame = node?.closest('section[data-game]')
  if (frame !== null && frame !== undefined) keepers.get(frame)?.()
}

/** The region of the drawing a part names, for the parts whose region is in the drawing. */
const REGION: Readonly<Record<string, string>> = {
  table: '[data-shift-table]',
  target: '[data-shift-target]',
  order: '[data-shift-cells]',
  slices: '[data-shift-cells]',
  buffer: '[data-shift-buffer-box]',
  shared: '[data-shift-buffer-box]',
  tensor: '[data-shift-launch]',
  program: '[data-shift-grid]',
  mask: '[data-shift-grid]',
}

/** How far (px) the page scrolls to bring a box whole into view between `above` and `below`: 0 where it is whole already. Pure. */
export function scrollToShow(box: { top: number; bottom: number }, above: number, below: number): number {
  if (box.bottom <= below && box.top >= above) return 0
  // A box taller than the room shows its top.
  if (box.bottom - box.top > below - above || box.top < above) return box.top - above
  return box.bottom - below
}

/**
 * On a phone's first run, each part the intro walk names is brought whole into view over the pinned dock. `parts` are the level's part
 * ids, in the walk's order. In a lesson (`embedded`) the game stands far down the page and the page is the learner's: nothing scrolls until
 * the learner has pressed, typed or focused inside the frame, and then the part the walk names at that moment is shown. Returns the undo.
 */
export function showNamedParts(frame: HTMLElement, parts: readonly string[], embedded = false): () => void {
  let shown: string | null = null
  let acted = !embedded
  const look = () => {
    if (!acted) return
    const walk = frame.querySelector('[data-intro-walk]')?.getAttribute('data-intro-walk') ?? null
    if (walk === shown) return
    shown = walk
    const selector = walk === null ? undefined : REGION[parts[Number(walk)] ?? '']
    const region = selector === undefined ? null : frame.querySelector(selector)
    const dock = frame.querySelector('[data-dock]')
    if (region === null || dock === null || !window.matchMedia(NARROW).matches) return
    const above = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + 8
    const pinned = getComputedStyle(dock).position === 'sticky'
    const below = pinned ? dock.getBoundingClientRect().top - 8 : window.innerHeight - 8
    const by = scrollToShow(region.getBoundingClientRect(), above, below)
    if (by !== 0) window.scrollBy({ top: by, behavior: 'instant' })
  }
  const act = () => {
    if (acted) return
    acted = true
    look()
  }
  const watch = new MutationObserver(look)
  watch.observe(frame, { subtree: true, attributes: true, attributeFilter: ['data-intro-walk'], childList: true })
  if (embedded) {
    frame.addEventListener('pointerdown', act, true)
    frame.addEventListener('keydown', act, true)
    frame.addEventListener('focusin', act)
  }
  look()
  return () => {
    watch.disconnect()
    frame.removeEventListener('pointerdown', act, true)
    frame.removeEventListener('keydown', act, true)
    frame.removeEventListener('focusin', act)
  }
}

/**
 * How far (px) to scroll so the goal line stands at `above`, no further than the dock stays pinned: `natural` is where the dock's top would
 * stand in the page's flow, `pinned` where it stands now. Never up. Pure.
 */
export function seatBy(goalTop: number, above: number, natural: number, pinned: number): number {
  return Math.max(0, Math.min(goalTop - above, natural - pinned))
}

/**
 * The first press or focus in a phone's pinned dock, while the level is played, seats the drawing over it (see above); once seated, a
 * drawing that has grown is seated again (keepDock calls `again`). Returns the undo and `again`.
 */
export function seatDrawing(frame: HTMLElement): { undo: () => void; again: () => void } {
  const dock = frame.querySelector<HTMLElement>('[data-dock]')
  const drawing = frame.querySelector<HTMLElement>('[data-frame-diagram]')
  if (dock === null || drawing === null) return { undo: () => {}, again: () => {} }
  let seated = false
  const place = () => {
    if (frame.hasAttribute('data-intro') || frame.getAttribute('data-phase') !== 'play') return false
    if (!window.matchMedia(NARROW).matches || getComputedStyle(dock).position !== 'sticky') return false
    const goal = frame.querySelector('.es-frame__goal-box') ?? frame
    const above = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + 8
    const gap = parseFloat(getComputedStyle(drawing.parentElement ?? drawing).rowGap) || 0
    const by = seatBy(goal.getBoundingClientRect().top, above, drawing.getBoundingClientRect().bottom + gap, dock.getBoundingClientRect().top)
    if (by >= 1) window.scrollBy({ top: by, behavior: 'instant' })
    return true
  }
  const first = () => {
    if (!seated) seated = place()
  }
  dock.addEventListener('pointerdown', first, true)
  dock.addEventListener('focusin', first)
  return {
    undo: () => {
      dock.removeEventListener('pointerdown', first, true)
      dock.removeEventListener('focusin', first)
    },
    again: () => {
      if (seated) place()
    },
  }
}

/**
 * How far (px) to scroll, up, so the goal line stands at `above` at a phone's result, where the ways on (their foot at `ways`) stay over the
 * readout at the screen's foot (`foot`, the screen's height less the readout's): 0 where the goal is in view or would push them off. Pure.
 */
export function resultBy(goalTop: number, above: number, ways: number, foot: number): number {
  if (goalTop >= above) return 0
  return ways + (above - goalTop) <= foot ? goalTop - above : 0
}

/**
 * At a phone's result, the goal line is brought into view with the drawing and the ways on, where it fits (resultBy): in the same frame as
 * each scroll the frame makes to show the result, until the learner moves or presses anything. Returns the undo.
 */
export function showGoalAtResult(frame: HTMLElement): () => void {
  let stop: (() => void) | null = null
  const fit = () => {
    const goal = frame.querySelector('.es-frame__goal-box')
    const ways = frame.querySelector('.es-debrief__actions')
    if (goal === null || ways === null) return
    const above = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + 8
    const readout = frame.querySelector('.es-frame__readout')?.getBoundingClientRect().height ?? 0
    const by = resultBy(goal.getBoundingClientRect().top, above, ways.getBoundingClientRect().bottom, window.innerHeight - readout)
    if (by <= -1) window.scrollBy({ top: by, behavior: 'instant' })
  }
  const start = () => {
    stop?.()
    if (!window.matchMedia(NARROW).matches) return
    const end = () => {
      window.removeEventListener('scroll', fit)
      for (const kind of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(kind, end, true)
      window.clearTimeout(timer)
      stop = null
    }
    const timer = window.setTimeout(end, 3000)
    window.addEventListener('scroll', fit, { passive: true })
    for (const kind of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) window.addEventListener(kind, end, { capture: true, passive: true })
    stop = end
    requestAnimationFrame(fit)
  }
  let phase = frame.getAttribute('data-phase')
  const watch = new MutationObserver(() => {
    const now = frame.getAttribute('data-phase')
    if (now === phase) return
    phase = now
    if (now === 'result') start()
    else stop?.()
  })
  watch.observe(frame, { attributes: true, attributeFilter: ['data-phase'] })
  return () => {
    watch.disconnect()
    stop?.()
  }
}
