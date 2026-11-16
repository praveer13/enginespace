import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { requestName } from '@es/play/loop/copy'
import { loopPart } from '@es/play/loop/parts'
import { DOCK, fitGeometry, FRAME_DESK, FRAME_PHONE, LANE_WORDS, laneLayout, type LaneGeometry, type LaneLayout, type LaneSlab } from '@es/play/loop/lanes'
import type { LoopView } from '@es/play/loop/types'
import { SLOT_MARKS, type Slot } from '@/design/code'
import { Glyph } from '@/design/components/Glyph'
import { Legend } from '@/design/components/Legend'
import { Marker } from '@/design/components/Marker'
import type { LoopRunCore } from './types'
import './loop.css'

/*
 * The step loop's 2D view on the demo levels (REDESIGN §2.9, §3.1): the timing diagram an engineer reads in a profiler, drawn from the pure
 * lane layout (packages/play/loop/lanes.ts), so the 2D view, the lesson's dock and the 3D scene's Side camera put a tick at one x.
 *
 *   - the waiting queue, a row of request chips: each one admits its request into the first free slot, and the intro's ring sits on the
 *     first move's chip;
 *   - the CPU row, the engine core thread, with its `schedule` and `sync` calls as labelled slabs;
 *   - one GPU row per batch slot, whose label holds the request in it (or a dashed "empty"), and on which every forward draws the request's
 *     token, a ghost token or an empty slot;
 *   - idle as dashed boxes over the GPU rows, each closed one with a dimension line and its value ("bubble 3 ticks");
 *   - the now cursor at the CPU's clock, and the axis in synthetic ticks.
 *
 * The label column is DOM, and each part's name opens its popover (its sentence and its source). The track is an SVG in a box of its own:
 * on a phone it is wider than the box, scrolls sideways inside it, and is scrolled to keep now in view after every change. Every word and
 * number on the drawing is also in the state table under it, so the SVG is hidden from assistive technology and the figure is named by the
 * state it shows.
 */

/**
 * A part's popover (its sentence and its source) loads the first time the learner reaches for one: the route carries the names alone
 * (REDESIGN §4, "the source table is a lazy chunk").
 */
const loadPopover = () => import('@/games/kit/PartPopover')
const PartPopover = lazy(() => loadPopover().then((module) => ({ default: module.PartPopover })))

/** Below this width the diagram takes the phone's geometry [estimated: between the phone's 358 px and the narrowest desk box]. */
const NARROW = 560

/** Where the page keeps now in a scrolled track: this far across the visible part [estimated]. */
const NOW_IN_VIEW = 0.62

/** The width of an element, kept fresh as it resizes. The first paint (and a server render) uses `fallback`. */
function useWidth(fallback: number): [RefObject<HTMLElement | null>, number] {
  const ref = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const read = () => {
      const next = Math.floor(element.clientWidth)
      if (next > 0) setWidth((now) => (now === next ? now : next))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** The colour slot of a CPU call: a sync is yellow, every other call is CPU work. */
const callSlot = (kind: string): Slot => (kind === 'sync' ? 'yellow' : 'blue')

/** A slab's own words, where the slab is wide enough to hold them. */
function slabWords(slab: LaneSlab): string | null {
  if (slab.row === 'cpu') return slab.kind
  if (slab.use === 'token' && slab.req !== null && slab.req !== undefined) return requestName(slab.req)
  if (slab.use === 'ghost') return LANE_WORDS.ghost
  return null
}

/** Whether words fit a width [estimated: 6.5 px a character at the micro size, and a margin]. */
const fits = (words: string, width: number): boolean => words.length * 6.5 + 8 <= width

/** The figure's name, for a screen reader: the state it shows, in words. */
function figureLabel(view: LoopView): string {
  const filled = view.rail.filter((slot) => slot.req !== null).length
  return `Timing diagram, ${view.title}. Waiting: ${view.waiting.length}. Slots filled: ${filled} of ${view.slots}. Steps: ${view.step}. Clock: ${view.clockUs} ticks, synthetic.`
}

export interface LanesProps {
  view: LoopView
  /** The size to draw at: the page's diagram (desk or phone by its width) or the lesson's compact dock. */
  size?: 'page' | 'dock'
  /** Admits a waiting request into the first free slot: the chips are buttons. Without it they are drawn, and take no press. */
  onAdmit?: (req: number) => void
  /** The request whose chip carries the intro's ring. */
  ring?: number | null
  /** Where focus goes once the queue has no chip left to take it: the Step control, outside the drawing. */
  focusAfter?: () => void
}

/** The step loop's timing diagram. */
export function Lanes({ view, size = 'page', onAdmit, ring = null, focusAfter }: LanesProps) {
  const [box, boxWidth] = useWidth(size === 'dock' ? DOCK.width : FRAME_DESK.width)
  const base: LaneGeometry = size === 'dock' ? DOCK : boxWidth < NARROW ? FRAME_PHONE : FRAME_DESK
  const sizeName = size === 'dock' ? 'dock' : base === FRAME_PHONE ? 'phone' : 'desk'
  const narrow = sizeName !== 'desk'
  // The figure's padding takes a little of its width; the rest is the label column and the track. A track that would draw a tick too
  // narrow is laid out wider than the room, and scrolls.
  const pad = narrow ? PAD_NARROW : PAD
  const room = Math.max(boxWidth - pad * 2, base.labelWidth + 1)
  const geometry = useMemo(() => fitGeometry(base, room), [base, room])
  const layout = useMemo(() => laneLayout(view, geometry), [view, geometry])
  const track = useRef<HTMLDivElement>(null)
  const scrolls = geometry.width > room + 1

  // Keep now in view: after every change, the track is scrolled so that now stands a little past the middle of what shows.
  useLayoutEffect(() => {
    const element = track.current
    if (element === null || !scrolls) return
    const visible = element.clientWidth
    const at = layout.now.x - layout.scale.x
    element.scrollLeft = Math.max(0, Math.min(element.scrollWidth - visible, at - visible * NOW_IN_VIEW))
  }, [layout.now.x, layout.scale.x, scrolls])

  return (
    <figure
      ref={box}
      className="es-lanes"
      data-loop-view=""
      data-size={sizeName}
      aria-label={figureLabel(view)}
      style={{ '--es-lanes-label': `${base.labelWidth}px`, '--es-lanes-pad': `${pad}px`, '--es-lanes-head': `${HEAD}px` } as CSSProperties}
    >
      <Queue layout={layout} view={view} onAdmit={onAdmit} ring={ring} focusAfter={focusAfter} interactive={size === 'page'} narrow={narrow} />
      <div className="es-lanes__body" style={{ height: `${layout.height - layout.geometry.queueHeight - layout.geometry.queueGap + HEAD}px` }}>
        <RowLabels layout={layout} interactive={size === 'page'} narrow={narrow} />
        <div
          ref={track}
          className="es-lanes__track"
          data-lanes-track=""
          data-scrolls={scrolls || undefined}
          // A track that scrolls is a region the keyboard can reach, so its arrows scroll it (WCAG 2.1.1).
          {...(scrolls ? { role: 'region', 'aria-label': 'Time track', tabIndex: 0 } : {})}
        >
          <Track layout={layout} />
        </div>
      </div>
    </figure>
  )
}

/** The figure's inner padding, in px: the lanes are laid out in what is left [estimated, the space steps 3 and 2]. */
const PAD = 12
const PAD_NARROW = 8
/** Room over the lanes for now's word at the cursor's head, in px [estimated]. */
const HEAD = 14

interface QueueProps {
  layout: LaneLayout
  view: LoopView
  onAdmit?: (req: number) => void
  ring: number | null
  focusAfter?: () => void
  interactive: boolean
  narrow: boolean
}

/** The waiting queue: its name, then a chip per request that fits, and a count of the rest. */
function Queue({ layout, view, onAdmit, ring, focusAfter, interactive, narrow }: QueueProps) {
  const g = layout.geometry
  const list = useRef<HTMLUListElement>(null)
  const [stop, setStop] = useState(0)
  const focusAt = useRef<number | null>(null)
  const chips = layout.queue.chips
  const tabStop = Math.min(stop, Math.max(chips.length - 1, 0))
  const waitingKey = view.waiting.join(',')

  // An admitted request leaves the queue: focus follows to the chip that took its place, or on to Step when none is left to press.
  useLayoutEffect(() => {
    const at = focusAt.current
    if (at === null) return
    focusAt.current = null
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (buttons !== undefined && buttons.length > 0) buttons[Math.min(at, buttons.length - 1)].focus()
    else focusAfter?.()
  }, [waitingKey, view.canHang, focusAfter])

  const onKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0 || event.ctrlKey || event.altKey || event.metaKey) return
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(buttons.length - 1, next))
    setStop(target)
    buttons[target]?.focus()
  }

  const chipStyle = { width: `${g.chipWidth}px`, height: `${Math.min(g.queueHeight, 48)}px` }
  return (
    <div className="es-lanes__queue" style={{ minHeight: `${g.queueHeight + g.queueGap}px` }}>
      <div className="es-lanes__name" data-lane-label="queue">
        <PartName id="waiting" interactive={interactive} />
      </div>
      {chips.length === 0 ? (
        <p className="es-lanes__empty-queue">No requests are waiting.</p>
      ) : (
        <ul ref={list} className="es-lanes__chips" aria-label="Waiting requests" onKeyDown={onAdmit === undefined ? undefined : onKey} data-native-keys="arrows" data-waiting={view.waiting.length}>
          {chips.map((chip, index) => {
            const node =
              onAdmit === undefined ? (
                <span className="es-lanes__chip" style={chipStyle} data-req={chip.req}>
                  {chip.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="es-lanes__chip"
                  style={chipStyle}
                  data-req={chip.req}
                  disabled={!view.canHang}
                  tabIndex={index === tabStop ? 0 : -1}
                  aria-label={`Admit request ${chip.label} into a batch slot`}
                  onClick={() => {
                    focusAt.current = index
                    setStop(index)
                    onAdmit(chip.req)
                  }}
                >
                  {chip.label}
                </button>
              )
            return (
              <li key={chip.req}>
                {ring === chip.req ? (
                  <Marker kind="ring" word="first move" className="es-lanes__ring">
                    {node}
                  </Marker>
                ) : (
                  node
                )}
              </li>
            )
          })}
          {layout.queue.more > 0 ? (
            <li className="es-lanes__more" aria-label={`${layout.queue.more} more waiting`}>
              +{layout.queue.more}
              {narrow ? null : ' more'}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  )
}

/**
 * A part's name: on the page it opens the part's popover (its sentence and its source); in the dock it is the name alone. Until the learner
 * first presses it, it is a plain trigger drawn as the popover's own; the press loads the popover, opens it, and keeps focus on its trigger.
 */
function PartName({ id, interactive, children }: { id: string; interactive: boolean; children?: ReactNode }) {
  const part = loopPart(id)
  const [asked, setAsked] = useState(false)
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLSpanElement>(null)
  // The press that loaded the popover swaps the plain trigger for the popover's own: focus goes to it once, when it arrives.
  const handOver = useRef(false)
  useEffect(() => {
    if (!handOver.current) return
    const trigger = holder.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
    if (trigger === null || trigger === undefined) return
    handOver.current = false
    trigger.focus({ preventScroll: true })
  })
  if (part === undefined) return <>{children}</>
  const name = children ?? part.name
  if (!interactive) return <span>{name}</span>
  const plain = (
    <span className="es-pop es-partpop" data-variant="quiet">
      <button
        type="button"
        className="es-pop__trigger"
        aria-haspopup="dialog"
        aria-expanded={false}
        data-part={id}
        onPointerEnter={() => void loadPopover()}
        onFocus={() => void loadPopover()}
        onClick={() => {
          handOver.current = true
          setAsked(true)
          setOpen(true)
        }}
      >
        {name}
      </button>
    </span>
  )
  return (
    <span ref={holder} className="contents">
      {asked ? (
        <Suspense fallback={plain}>
          <PartPopover part={part} trigger={name} open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : (
        plain
      )}
    </span>
  )
}

/** The label column: the CPU row's name, each slot's name with the request it holds, and the axis's unit. */
function RowLabels({ layout, interactive, narrow }: { layout: LaneLayout; interactive: boolean; narrow: boolean }) {
  const top = layout.geometry.queueHeight + layout.geometry.queueGap - HEAD
  const firstSlot = layout.rows.find((row) => row.lane === 'gpu')
  return (
    <div className="es-lanes__labels" data-lane-labels="">
      {layout.rows.map((row) => (
        <div key={row.id} className="es-lanes__row-label es-lanes__name" data-lane-label={row.id} style={{ top: `${row.y - top}px`, height: `${row.height}px` }}>
          {row.lane === 'cpu' ? (
            <>
              <Glyph shape={SLOT_MARKS.blue.glyph} className="es-lanes__glyph" style={{ color: 'var(--es-lane-cpu)' }} edge="var(--es-cat-blue-edge)" />
              <PartName id="cpu" interactive={interactive}>
                {narrow ? LANE_WORDS.cpuShort : LANE_WORDS.cpu}
              </PartName>
            </>
          ) : row.label === null ? null : (
            <>
              {row === firstSlot ? <Glyph shape={SLOT_MARKS.green.glyph} className="es-lanes__glyph" style={{ color: 'var(--es-lane-gpu)' }} edge="var(--es-cat-green-edge)" /> : <span className="es-lanes__glyph" />}
              <span className="es-lanes__slotname">{narrow ? String((row.slot ?? 0) + 1) : LANE_WORDS.slot(row.slot ?? 0)}</span>
              {row.req === null ? (
                <span className="es-lanes__holds" data-empty="">
                  {LANE_WORDS.empty}
                </span>
              ) : (
                <span className="es-lanes__holds" data-req={row.req}>
                  {requestName(row.req)}
                </span>
              )}
            </>
          )}
        </div>
      ))}
      <div className="es-lanes__axis-name" style={{ height: `${layout.geometry.axisHeight}px` }}>
        {LANE_WORDS.axis}
      </div>
    </div>
  )
}

/** The time track, as SVG: the graticule, the slabs, the idle boxes and their dimension lines, now, and the axis. */
function Track({ layout }: { layout: LaneLayout }) {
  const { scale, geometry: g } = layout
  const y0 = g.queueHeight + g.queueGap - HEAD
  const height = layout.height - y0
  const lanesBottom = layout.axis.y
  const latest = layout.slabs.reduce((most, slab) => (slab.kind === 'forward' ? Math.max(most, slab.step) : most), -1)
  // Minor lines on every tick where a tick is wide enough to show one; major lines on the axis's labelled ticks.
  const minor: number[] = []
  if (scale.pxPerTick >= 6) for (let t = Math.ceil(scale.start); t <= scale.end; t++) minor.push(scale.x + (t - scale.start) * scale.pxPerTick)
  return (
    <div className="es-lanes__plot" style={{ width: `${scale.width}px`, height: `${height}px` }}>
    <svg className="es-lanes__svg" width={scale.width} height={height} viewBox={`${scale.x} ${y0} ${scale.width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="es-lanes-ghost" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="es-lanes__hatch" x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      <g data-lanes-graticule="">
        {minor.map((x) => (
          <line key={`m${x}`} className="es-lanes__minor" x1={x} x2={x} y1={y0} y2={lanesBottom} />
        ))}
        {layout.axis.ticks.map((tick) => (
          <line key={`M${tick.t}`} className="es-lanes__major" x1={tick.x} x2={tick.x} y1={y0} y2={lanesBottom} />
        ))}
        {layout.rows.map((row) => (
          <line key={row.id} className="es-lanes__rule" x1={scale.x} x2={scale.x + scale.width} y1={row.y} y2={row.y} />
        ))}
        <line className="es-lanes__rule" x1={scale.x} x2={scale.x + scale.width} y1={lanesBottom} y2={lanesBottom} />
      </g>
      <g data-lanes-slabs="">
        {layout.slabs.map((slab) => {
          const words = slabWords(slab)
          const on = slab.row === 'cpu' ? callSlot(slab.kind) : slab.use === 'token' ? 'green' : 'paper'
          const inset = slab.row === 'cpu' ? 0 : 2
          return (
            <g key={slab.id}>
              <rect
                className="es-lanes__slab"
                data-slab={slab.id}
                data-call={slab.row === 'cpu' ? slab.kind : undefined}
                data-use={slab.use}
                data-new={slab.kind === 'forward' && slab.step === latest ? '' : undefined}
                x={slab.x + 0.5}
                y={slab.y + inset + 0.5}
                width={Math.max(0, slab.width - 1)}
                height={Math.max(0, slab.height - inset * 2 - 1)}
              />
              {words !== null && fits(words, slab.width) && slab.height >= 14 ? (
                <text className="es-lanes__slab-text" data-on={on} x={slab.x + 5} y={slab.y + slab.height / 2} dominantBaseline="central">
                  {words}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
      <g data-lanes-idle="">
        {layout.idle.map((box) => (
          <g key={box.id}>
            <rect className="es-lanes__idle" data-lane-idle={box.id} x={box.x + 1} y={box.y + 1} width={Math.max(0, box.width - 2)} height={Math.max(0, box.height - 2)} />
            {fits(LANE_WORDS.idle, box.width) ? (
              <text className="es-lanes__idle-text" x={box.x + 5} y={box.y + 12}>
                {LANE_WORDS.idle}
              </text>
            ) : null}
          </g>
        ))}
        {layout.dims.map((dim) => (
          <Dimension key={dim.id} id={dim.id} x0={dim.x0} x1={dim.x1} y={dim.y} label={dim.label} short={LANE_WORDS.ticks(dim.ticks)} value={String(dim.ticks)} />
        ))}
      </g>
      <g data-lanes-axis="">
        {layout.axis.ticks.map((tick) => (
          <g key={tick.t}>
            <line className="es-lanes__tick" x1={tick.x} x2={tick.x} y1={lanesBottom} y2={lanesBottom + 4} />
            <text className="es-lanes__tick-label" x={tick.x} y={lanesBottom + 6} textAnchor={tick.x <= scale.x + 4 ? 'start' : 'middle'} dominantBaseline="hanging">
              {tick.t}
            </text>
          </g>
        ))}
      </g>
    </svg>
      {/* Now: the marker's cursor, 2 px of amber in its edge through every row, its word at the head. */}
      <span className="es-lanes__now" data-lane-now="" style={{ top: `${layout.now.y0 - y0}px`, height: `${layout.now.y1 - layout.now.y0}px` }}>
        <Marker kind="cursor" at={(layout.now.x - scale.x) / scale.width} />
      </span>
    </div>
  )
}

/** A dimension line: end ticks at the interval's two edges, and its value on a slip of paper on the line. */
function Dimension({ id, x0, x1, y, label, short, value }: { id: string; x0: number; x1: number; y: number; label: string; short: string; value: string }) {
  const width = x1 - x0
  // The whole words where they fit across the box (a slip may run a little past its ends), else the ticks, else the number alone.
  const words = [label, short].find((candidate) => fits(candidate, width + 16)) ?? value
  const slip = words.length * 6.5 + 10
  const mid = x0 + width / 2
  return (
    <g data-lane-dim={id}>
      <line className="es-lanes__dim" x1={x0 + 2} x2={x1 - 2} y1={y} y2={y} />
      <line className="es-lanes__dim" x1={x0 + 2} x2={x0 + 2} y1={y - 6} y2={y + 6} />
      <line className="es-lanes__dim" x1={x1 - 2} x2={x1 - 2} y1={y - 6} y2={y + 6} />
      <rect className="es-lanes__dim-slip" x={mid - slip / 2} y={y - 9} width={slip} height={18} />
      <text className="es-lanes__dim-text" x={mid} y={y} textAnchor="middle" dominantBaseline="central">
        {words}
      </text>
    </g>
  )
}

/** The legend under the diagram: the code's colours as they are used here, and the marker. */
export function LoopLegend() {
  return (
    <Legend
      className="es-lanes__legend"
      label="Legend: step loop"
      entries={[
        { slot: 'blue', word: 'CPU work: schedule' },
        { slot: 'yellow', word: 'sync: tokens read back' },
        { slot: 'green', word: 'GPU work: a forward, a token per slot' },
        { slot: 'white', word: 'idle, or an empty slot' },
      ]}
      now="the CPU’s clock"
    />
  )
}

/**
 * The 2D view as the game's page draws it: the diagram, with the chips as the admit controls, and the ring on the intro's first move. In
 * the 3D view's box (the Stage paints it first and keeps it as its fallback) it is drawn with no controls of its own.
 */
export function View2D({ run, ring = null, interactive = true }: { run: LoopRunCore; ring?: number | null; interactive?: boolean }) {
  const { view, dispatch } = run
  const host = useRef<HTMLDivElement>(null)
  const toStep = () => host.current?.closest('[data-game]')?.querySelector<HTMLButtonElement>('[data-loop-step] button:not(:disabled)')?.focus()
  return (
    <div ref={host} className="contents">
      <Lanes
        view={view}
        ring={ring}
        onAdmit={interactive ? (req) => (view.canHang && view.waiting.includes(req) ? dispatch({ t: 'admit', req }) : undefined) : undefined}
        focusAfter={toStep}
      />
    </div>
  )
}
