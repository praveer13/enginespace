import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent } from 'react'
import { TapeLabel } from '@/design/components/TapeLabel'
import { useSceneTokens } from '@/design/scene-tokens'
import { rowAt, tapeGeometry, timeToX, xToTime } from './geometry'
import { CATEGORY_WORDS } from './marks'
import { pickSpan, spanEnd, spanName, spanStart } from './model'
import type { TraceIndex } from './model'
import { paintTape, patternsFor } from './paint'
import { buildPlan, createPlan } from './plan'
import type { DrawPlan } from './plan'
import { SlotGlyph } from './SlotGlyph'
import type { Command, TapeState } from './state'
import { recordFrame } from './test-hook'
import { tapeTheme } from './theme'
import { ruler, rulerLabel } from './viewport'
import { LANE_WORDS, slotOfCategory } from './words'

/*
 * The tape (GAMES.md §2.6, The Tape): the canvas that draws the lanes, and the DOM over it. The canvas draws marks and blocks of
 * dots and holes and writes no text. Everything that reads is DOM positioned on the same boxes: the lane names on masking tape, the
 * ruler's numbers beside the feed holes, the words on the tape that marks are stuck with. The whole of it is hidden from assistive
 * technology, because the table below lists every span in the window and the marks ticket lists every mark (A§6.9).
 *
 * Input. A press and a drag on the paper pans it; a press without a drag picks the span under it, and the nearer of its edges
 * becomes the cursor. The wheel with Ctrl or Meta zooms, and a sideways wheel or Shift pans. None of it is needed: every command is
 * a key and a button as well (WCAG 2.5.7).
 */

export interface TapeProps {
  index: TraceIndex
  state: TapeState
  dispatch: Dispatch<Command>
  /** Whether marks can be stuck on the tape: it has a rail for them. */
  rail: boolean
}

/** A press that moves less than this many CSS px is a click. */
const DRAG_PX = 4
/** A span within this many CSS px of a click is picked, so a thin span can be hit. */
const PICK_SLACK_PX = 4
/** About how wide a ruler number's character is, in CSS px, for leaving off the ones the paper's edge would cut [estimated]. */
const TICK_CHAR_PX = 8

interface Frame {
  readonly g: ReturnType<typeof tapeGeometry>
  readonly props: TapeProps
  readonly theme: ReturnType<typeof tapeTheme>
  readonly ruler: ReturnType<typeof ruler>
  /** Everything the picture is a function of: a new frame is drawn only when one of these is not the one that was drawn. */
  readonly inputs: readonly unknown[]
}

export function Tape({ index, state, dispatch, rail }: TapeProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(960)
  const tokens = useSceneTokens()
  const theme = useMemo(() => tapeTheme(tokens.roles), [tokens])
  const g = useMemo(
    () =>
      tapeGeometry(
        index.lanes.map((lane) => lane.rows),
        width,
        { rail },
      ),
    [index, width, rail],
  )
  const { win } = state
  const scale = useMemo(() => ruler(win, g.plotW), [win, g.plotW])
  const noteId = useId()

  // The paper's width, from the box it sits in. The observer reports once on observing, so the first width arrives at mount.
  useEffect(() => {
    const el = wrap.current
    if (el === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // One draw a frame at most, from whatever the latest render says, and none when the render changed nothing the picture shows (the
  // table lagging behind, a sentence for the live region): the canvas is drawn on demand and rests otherwise.
  const latest = useRef<Frame | null>(null)
  const painted = useRef<readonly unknown[] | null>(null)
  const plan = useRef<DrawPlan | null>(null)
  const frame = useRef(0)
  // A layout effect, so that the frame is asked for in the commit that changed the picture and not after it: an ordinary effect runs
  // after the browser has painted, and a pan that moved every frame would be drawn every other one.
  useLayoutEffect(() => {
    const inputs = [g, theme, index, state.win, state.cursor, state.pending?.ns ?? null, state.notes.marks, state.active, state.notes.cause, rail]
    latest.current = { g, props: { index, state, dispatch, rail }, theme, ruler: scale, inputs }
    if (frame.current !== 0) return
    const last = painted.current
    if (last !== null && inputs.every((input, at) => Object.is(input, last[at]))) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = canvas.current
      const f = latest.current
      if (el === null || f === null) return
      painted.current = f.inputs
      const started = performance.now()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const px = [Math.round(f.g.width * dpr), Math.round(f.g.height * dpr)]
      if (el.width !== px[0] || el.height !== px[1]) {
        el.width = px[0]
        el.height = px[1]
      }
      const ctx = el.getContext('2d')
      if (ctx === null) return
      plan.current ??= createPlan()
      const s = f.props.state
      buildPlan(plan.current, f.props.index, s.win, f.g)
      const at = (ns: number) => timeToX(f.g, s.win, ns)
      const inside = (x: number) => x >= f.g.plotX && x <= f.g.plotX + f.g.plotW
      const holeXs = f.ruler.ticks.filter((t) => inside(at(t.ns)))
      paintTape(
        {
          ctx,
          dpr,
          g: f.g,
          theme: f.theme,
          patterns: patternsFor(f.theme, dpr),
          index: f.props.index,
          win: s.win,
          plan: plan.current,
          cursor: s.cursor,
          pendingNs: s.pending === null ? null : s.pending.ns,
          marks: s.notes.marks,
          active: s.active,
          cause: s.notes.cause,
          rail: f.props.rail,
        },
        { minor: holeXs.filter((t) => !t.major).map((t) => at(t.ns)), major: holeXs.filter((t) => t.major).map((t) => at(t.ns)) },
      )
      recordFrame(performance.now() - started, plan.current.total, plan.current.visited)
    })
  })
  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
    },
    [],
  )

  // The wheel: Ctrl or Meta zooms about the pointer, a sideways wheel or Shift pans. A plain wheel is the page's. It has to be a native
  // listener, because React's is passive and a zoom must stop the browser's own.
  const live = useRef({ g, win, dispatch })
  useEffect(() => {
    live.current = { g, win, dispatch }
  })
  useEffect(() => {
    const el = wrap.current
    if (el === null) return undefined
    const onWheel = (event: WheelEvent) => {
      const { g: geometry, win: window_, dispatch: send } = live.current
      const rect = el.getBoundingClientRect()
      const x = event.clientX - rect.left
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        if (event.deltaY !== 0) send({ t: 'zoomAt', dir: event.deltaY < 0 ? 1 : -1, ns: Math.round(xToTime(geometry, window_, Math.max(geometry.plotX, x))) })
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault()
        const delta = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
        send({ t: 'panBy', ns: Math.round((delta * (window_.toNs - window_.fromNs)) / geometry.plotW) })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // A press on the paper: a drag pans it, a click picks the span under it.
  const drag = useRef<{ id: number; startX: number; lastX: number; moved: boolean } | null>(null)
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = wrap.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const at = local(event)
    if (at.x < g.plotX) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, startX: at.x, lastX: at.x, moved: false }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d === null || d.id !== event.pointerId) return
    const at = local(event)
    if (!d.moved && Math.abs(at.x - d.startX) > DRAG_PX) d.moved = true
    if (d.moved) {
      dispatch({ t: 'panBy', ns: Math.round(((d.lastX - at.x) * (win.toNs - win.fromNs)) / g.plotW) })
      d.lastX = at.x
    }
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (d === null || d.id !== event.pointerId || d.moved) return
    const at = local(event)
    const t = xToTime(g, win, at.x)
    const slack = (PICK_SLACK_PX * (win.toNs - win.fromNs)) / g.plotW
    if (rail && at.y >= g.rail.y && at.y < g.rail.y + g.rail.h) {
      const hit = [...state.notes.marks].reverse().find((mark) => mark.fromNs - slack <= t && t <= mark.toNs + slack)
      if (hit !== undefined) dispatch({ t: 'activate', id: hit.id })
      return
    }
    const place = rowAt(g, at.y)
    if (place === null) return
    const span = pickSpan(index, index.lanes[place.lane], place.row, t, slack)
    if (span === null) return
    const edge = Math.abs(t - spanStart(index, span)) <= Math.abs(t - spanEnd(index, span)) ? 'start' : 'end'
    dispatch({ t: 'select', cursor: { span, edge }, focus: true })
  }

  const x = (ns: number) => timeToX(g, win, ns) - g.plotX
  const marks = state.notes.marks.filter((mark) => mark.toNs > win.fromNs && mark.fromNs < win.toNs).slice(-60)
  const cause = state.notes.cause
  // Where the cause's tape sticks: the middle of its span on the paper, or null when there is none or it is off the paper.
  const causeAt =
    rail && cause !== null && x(spanEnd(index, cause)) > 0 && x(spanStart(index, cause)) < g.plotW ? (x(spanStart(index, cause)) + x(spanEnd(index, cause))) / 2 : null

  return (
    <>
      <p id={noteId} className="sr-only">
        The tape is drawn on a canvas. The table of spans below lists every span in the window, and the marks ticket lists every mark.
      </p>
      <div
        ref={wrap}
        className="es-trace__tape"
        aria-hidden="true"
        tabIndex={-1}
        data-stacked={g.stacked || undefined}
        data-trace-tape=""
        style={{ height: g.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <canvas ref={canvas} className="es-trace__canvas" style={{ width: g.width, height: g.height }} />
        <div className="es-trace__lanes">
          {index.lanes.map((lane) => {
            const box = g.lanes[lane.index]
            return (
              <div key={lane.index} className="es-trace__lane" data-kind={lane.kind} style={{ top: box.y, height: box.h, width: g.stacked ? g.width : g.gutter }}>
                <TapeLabel size="sm" tilt={lane.index % 2 === 0 ? 'left' : 'right'}>
                  {LANE_WORDS[lane.kind]}
                </TapeLabel>
                <span className="es-trace__lane-name">{lane.name}</span>
              </div>
            )
          })}
          {rail && !g.stacked ? (
            <div className="es-trace__lane" data-kind="rail" style={{ top: g.rail.y, height: g.rail.h, width: g.gutter }}>
              <TapeLabel size="sm" tilt="right">
                your marks
              </TapeLabel>
            </div>
          ) : null}
        </div>
        <div className="es-trace__plot" style={{ left: g.plotX, width: g.plotW, height: g.height }}>
          {scale.ticks
            .filter((tick) => tick.major)
            .map((tick) => ({ tick, text: rulerLabel(tick.ns, scale.format) }))
            // A number is centred on its tick, and one the paper's edge would cut is left off: its neighbour says the same.
            .filter(({ tick, text }) => x(tick.ns) - (text.length * TICK_CHAR_PX) / 2 >= 0 && x(tick.ns) + (text.length * TICK_CHAR_PX) / 2 <= g.plotW)
            .map(({ tick, text }) => (
              <span key={tick.ns} className="es-trace__tick" style={{ left: x(tick.ns), top: 19 }}>
                {text}
              </span>
            ))}
          {rail
            ? marks.map((mark) => {
                const left = x(mark.fromNs)
                const right = Math.max(x(mark.toNs), left + 14)
                const word = mark.label !== '' ? mark.label : mark.category === null ? 'no category' : CATEGORY_WORDS[mark.category].term
                return (
                  <span
                    key={mark.id}
                    className="es-trace__mark"
                    data-active={mark.id === state.active || undefined}
                    style={{ left, width: right - left, top: g.rail.y + 4, height: g.rail.h - 8 }}
                  >
                    {mark.category === null ? null : <SlotGlyph slot={slotOfCategory(mark.category)} size="0.85em" />}
                    <span className="es-trace__mark-text">{word}</span>
                  </span>
                )
              })
            : null}
          {causeAt === null ? null : (
            // Stuck on the paper at the span, and turned to the side with room: the left half of the paper reads rightwards from the span.
            <span
              className="es-trace__cause"
              style={{ top: g.rail.y + g.rail.h - 8, ...(causeAt < g.plotW / 2 ? { left: Math.max(0, causeAt - 6) } : { right: Math.max(0, g.plotW - causeAt - 6) }) }}
            >
              <TapeLabel size="sm" tilt="right">
                cause: {cause === null ? '' : spanName(index, cause)}
              </TapeLabel>
            </span>
          )}
        </div>
      </div>
    </>
  )
}
