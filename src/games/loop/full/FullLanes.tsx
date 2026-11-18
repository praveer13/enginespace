import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { FULL_DESK, FULL_DOCK, FULL_LANE_WORDS, FULL_PHONE, fullLaneLayout, type FullLaneGeometry, type FullLaneSource, type FullLaneLayout, type FullMark, type FullRow } from '@es/play/loop/full/lanes'
import { fullPart } from '@es/play/loop/full/parts'
import type { FullView } from '@es/play/loop/full/types'
import { SLOT_MARKS } from '@/design/code'
import { Glyph } from '@/design/components/Glyph'
import { Marker } from '@/design/components/Marker'
import '../loop.css'
import './full.css'

/*
 * The step loop's timing diagram on the five full levels (REDESIGN §3.7): the lanes of packages/play/loop/full/lanes.ts, in µs on the
 * model's clock, drawn on the graticule the demo levels use (loop.css). One x is one microsecond on every row.
 *
 *   - the CPU lane: one slab for each call (schedule, prepare, launch, sync, sample). Eager launches are a comb of thin ticks, and a CUDA
 *     graph replay is one framed slab, so the two differ by shape and not by colour alone;
 *   - a copy row where a level has host and device copies; one GPU row, "forward", with the batch size on each slab, the padded end of a
 *     forward hatched, and under it the strip "slots live 48 of 64"; on `mask`, the grammar mask's own row (vertical stripes);
 *   - idle on the GPU row as dashed boxes with a dimension line and its value ("bubble 764 µs");
 *   - now as the marker's cursor; the axis in µs; at a result, the reference run's forwards as hollow outlines under the learner's lanes, on
 *     the same axis.
 *
 * The label column is DOM, and each part's name opens its popover. The track is an SVG in a box of its own: on a phone it is wider than the
 * box, scrolls sideways inside it, and is scrolled after every change to keep now in view. Every figure on it is in the state table too.
 */

const PartPopover = lazy(() => import('@/games/kit/PartPopover').then((module) => ({ default: module.PartPopover })))

/** Below this width the diagram takes the phone's geometry [estimated: between the phone's 358 px and the narrowest desk box]. */
const NARROW = 560
/** The figure's inner padding, and the room over the lanes for now's word [estimated, the space steps]. */
const PAD = 12
const PAD_NARROW = 8
const HEAD = 14
/** How much wider than its box a phone's track is laid out, so a step reads at a width a finger can follow [estimated]. */
const PHONE_STRETCH = 1.9
/** Where the page keeps now in a scrolled track [estimated]. */
const NOW_IN_VIEW = 0.62

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

/** Whether words fit a width [estimated: 6.5 px a character at the micro size, and a margin]. */
const fits = (words: string, width: number): boolean => words.length * 6.5 + 8 <= width

export interface FullLanesProps {
  view: FullView
  size?: 'page' | 'dock'
  /** Lay the whole run out, instead of the last steps. */
  fit?: boolean
  /** The reference run's lanes, drawn as hollow outlines under the learner's, on the learner's axis. Implies the whole run. */
  reference?: FullLaneSource | null
  /** A node laid on a part's label (the first run's callout discs), by the part's id. */
  callouts?: Partial<Record<string, ReactNode>>
}

/** What the rows are called in the label column, and the part each opens. */
const ROW_PART: Readonly<Record<string, string>> = { cpu: 'cpu', forward: 'forward', live: 'live', mask: 'mask' }
const PHONE_LABEL: Readonly<Record<string, string>> = { cpu: 'CPU', copy: 'Copies', forward: 'GPU', live: 'live', mask: 'Mask' }

export function PartLabel({ id, children, interactive }: { id: string | undefined; children: string; interactive: boolean }) {
  const part = id === undefined ? undefined : fullPart(id)
  if (part === undefined || !interactive) return <span>{children}</span>
  return (
    <Suspense fallback={<span>{children}</span>}>
      <PartPopover part={part} trigger={children} variant="quiet" />
    </Suspense>
  )
}

/** The figure's name, for a screen reader: the state it shows, in words. */
function figureLabel(view: FullView): string {
  const c = view.counters
  const tag = view.synthetic ? 'synthetic' : 'derived and estimated'
  return `Timing diagram, ${view.title}, ${view.stage.title}. Step ${view.step}. Clock ${c.clockUs} µs, GPU busy ${c.gpuBusyUs} µs, bubble ${c.bubbleUs} µs, in µs on the model's clock, ${tag}.`
}

export function FullLanes({ view, size = 'page', fit = false, reference = null, callouts = {} }: FullLanesProps) {
  const [box, measured] = useWidth(size === 'dock' ? FULL_DOCK.width : FULL_DESK.width)
  const phone = size === 'page' && measured < NARROW
  const pad = size === 'dock' || phone ? PAD_NARROW : PAD
  const base: FullLaneGeometry = size === 'dock' ? FULL_DOCK : phone ? FULL_PHONE : FULL_DESK
  const room = Math.max(measured - pad * 2, base.labelWidth + 120)
  const geometry = useMemo<FullLaneGeometry>(() => {
    if (size === 'dock') return { ...base, width: room }
    const track = room - base.labelWidth
    return { ...base, width: base.labelWidth + (phone ? Math.round(track * PHONE_STRETCH) : track) }
  }, [base, room, size, phone])
  const whole = fit || reference !== null
  const until = reference === null ? undefined : Math.max(view.clockUs, reference.clockUs)
  const layout = useMemo(() => fullLaneLayout(view, geometry, { fit: whole, ...(until === undefined ? {} : { until }) }), [view, geometry, whole, until])
  const refLayout = useMemo(() => (reference === null ? null : fullLaneLayout(reference, geometry, { fit: true, until })), [reference, geometry, until])
  const track = useRef<HTMLDivElement>(null)
  const scrolls = geometry.width > room + 1
  const interactive = size === 'page'

  useLayoutEffect(() => {
    const element = track.current
    if (element === null || !scrolls) return
    const visible = element.clientWidth
    const at = layout.now.x - layout.scale.x
    element.scrollLeft = Math.max(0, Math.min(element.scrollWidth - visible, at - visible * NOW_IN_VIEW))
  }, [layout.now.x, layout.scale.x, scrolls])

  const refHeight = reference === null ? 0 : phone || size === 'dock' ? 22 : 30
  return (
    <figure
      ref={box}
      className="es-lanes es-fl"
      data-loop-view=""
      data-full-lanes=""
      data-size={size === 'dock' ? 'dock' : phone ? 'phone' : 'desk'}
      aria-label={figureLabel(view)}
      style={{ '--es-lanes-label': `${base.labelWidth}px`, '--es-lanes-pad': `${pad}px`, '--es-lanes-head': `${HEAD}px` } as CSSProperties}
    >
      <div className="es-lanes__body" style={{ height: `${layout.height + HEAD + refHeight}px` }}>
        <div className="es-lanes__labels" data-lane-labels="">
          {layout.rows.map((row) => (
            <RowLabel key={row.id} row={row} phone={phone || size === 'dock'} interactive={interactive} callout={callouts[ROW_PART[row.id] ?? row.id]} />
          ))}
          {refLayout === null ? null : (
            <div className="es-lanes__row-label es-lanes__name" data-lane-label="reference" style={{ top: `${layout.axis.y + HEAD}px`, height: `${refHeight}px` }}>
              <span className="es-fl__ref-key" aria-hidden="true" />
              <span>{phone || size === 'dock' ? 'Reference' : 'Reference run'}</span>
            </div>
          )}
          <div className="es-lanes__axis-name" style={{ height: `${geometry.axisHeight}px` }}>
            {phone || size === 'dock' ? 'µs' : FULL_LANE_WORDS.axis}
          </div>
        </div>
        <div
          ref={track}
          className="es-lanes__track"
          data-lanes-track=""
          data-scrolls={scrolls || undefined}
          {...(scrolls ? { role: 'region', 'aria-label': 'Time track', tabIndex: 0 } : {})}
        >
          <Track layout={layout} reference={refLayout} refHeight={refHeight} />
        </div>
      </div>
    </figure>
  )
}

function RowLabel({ row, phone, interactive, callout }: { row: FullRow; phone: boolean; interactive: boolean; callout: ReactNode }) {
  const words = phone ? (PHONE_LABEL[row.id] ?? row.label) : row.label
  const part = ROW_PART[row.id]
  return (
    <div className="es-lanes__row-label es-lanes__name" data-lane-label={row.id} style={{ top: `${row.y + HEAD}px`, height: `${row.height}px` }}>
      {callout}
      {row.id === 'cpu' ? <Glyph shape={SLOT_MARKS.blue.glyph} className="es-lanes__glyph" style={{ color: 'var(--es-lane-cpu)' }} edge="var(--es-cat-blue-edge)" /> : null}
      {row.id === 'forward' ? <Glyph shape={SLOT_MARKS.green.glyph} className="es-lanes__glyph" style={{ color: 'var(--es-lane-gpu)' }} edge="var(--es-cat-green-edge)" /> : null}
      <PartLabel id={part} interactive={interactive}>
        {words}
      </PartLabel>
    </div>
  )
}

/** The words on a mark where its box holds them. */
function markWords(mark: FullMark): string | null {
  if (mark.kind === 'call') return mark.label
  if (mark.kind === 'replay' || mark.kind === 'forward' || mark.kind === 'padding' || mark.kind === 'live' || mark.kind === 'mask' || mark.kind === 'copy') return mark.label
  return null
}

function Track({ layout, reference, refHeight }: { layout: FullLaneLayout; reference: FullLaneLayout | null; refHeight: number }) {
  const { scale, geometry: g } = layout
  const y0 = -HEAD
  const lanesBottom = layout.axis.y
  const refTop = lanesBottom + 4
  const axisY = lanesBottom + (reference === null ? 0 : refHeight + 4)
  const height = axisY + g.axisHeight - y0
  const latest = layout.marks.reduce((most, mark) => (mark.kind === 'forward' ? Math.max(most, mark.step) : most), -1)
  return (
    <div className="es-lanes__plot" style={{ width: `${scale.width}px`, height: `${height}px` }}>
      <svg className="es-lanes__svg" width={scale.width} height={height} viewBox={`${scale.x} ${y0} ${scale.width} ${height}`} aria-hidden="true" focusable="false">
        <defs>
          <pattern id="es-fl-pad" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="es-fl__hatch" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
          <pattern id="es-fl-mask" width="5" height="5" patternUnits="userSpaceOnUse">
            <line className="es-fl__stripe" x1="2.5" y1="0" x2="2.5" y2="5" />
          </pattern>
        </defs>
        <g data-lanes-graticule="">
          {layout.axis.ticks.map((tick) => (
            <line key={`M${tick.t}`} className="es-lanes__major" x1={tick.x} x2={tick.x} y1={y0} y2={axisY} />
          ))}
          {layout.rows.map((row) => (
            <line key={row.id} className="es-lanes__rule" x1={scale.x} x2={scale.x + scale.width} y1={row.y} y2={row.y} />
          ))}
          <line className="es-lanes__rule" x1={scale.x} x2={scale.x + scale.width} y1={lanesBottom} y2={lanesBottom} />
          {reference === null ? null : <line className="es-lanes__rule" x1={scale.x} x2={scale.x + scale.width} y1={axisY} y2={axisY} />}
        </g>
        <g data-lanes-slabs="">
          {layout.marks.map((mark) => {
            const words = markWords(mark)
            const showWords = words !== null && fits(words, mark.width) && mark.height >= 14
            const common = { 'data-mark': mark.kind, 'data-slab': mark.id, 'data-step': mark.step }
            if (mark.kind === 'eager') {
              const mid = mark.y + mark.height / 2
              return (
                <g key={mark.id} {...common} className="es-fl__eager" data-call={mark.call}>
                  <rect className="es-fl__spine" x={mark.x} y={mid - 1.5} width={mark.width} height={3} />
                  {(mark.ticks ?? []).map((x) => (
                    <line key={x} className="es-fl__tick" x1={x} x2={x} y1={mark.y + 6} y2={mark.y + mark.height - 6} />
                  ))}
                  {mark.label !== null && fits(mark.label, mark.width) ? (
                    <>
                      <rect className="es-fl__label-slip" x={mark.x + 2} y={mark.y + 2} width={mark.label.length * 6.5 + 6} height={14} />
                      <text className="es-lanes__slab-text" data-on="blue" x={mark.x + 5} y={mark.y + 9} dominantBaseline="central">
                        {mark.label}
                      </text>
                    </>
                  ) : null}
                </g>
              )
            }
            const inset = mark.row === 'cpu' || mark.row === 'mask' ? 0 : 2
            return (
              <g key={mark.id}>
                <rect
                  className={mark.kind === 'call' || mark.kind === 'replay' ? 'es-lanes__slab' : `es-lanes__slab es-fl__${mark.kind}`}
                  data-call={mark.kind === 'call' || mark.kind === 'replay' ? (mark.call ?? 'launch') : undefined}
                  data-fl={mark.kind}
                  data-new={mark.kind === 'forward' && mark.step === latest ? '' : undefined}
                  {...common}
                  x={mark.x + 0.5}
                  y={mark.y + inset + 0.5}
                  width={Math.max(0, mark.width - 1)}
                  height={Math.max(0, mark.height - inset * 2 - 1)}
                />
                {mark.kind === 'live' && mark.rows !== undefined && mark.slots !== undefined ? (
                  <rect className="es-fl__live-fill" x={mark.x + 0.5} y={mark.y + inset + 0.5} width={Math.max(0, (mark.width - 1) * (mark.rows / mark.slots))} height={Math.max(0, mark.height - inset * 2 - 1)} />
                ) : null}
                {mark.kind === 'replay' ? <rect className="es-fl__frame" x={mark.x + 3.5} y={mark.y + 3.5} width={Math.max(0, mark.width - 7)} height={Math.max(0, mark.height - 7)} /> : null}
                {showWords ? (
                  <text className="es-lanes__slab-text" data-on={mark.kind === 'forward' ? 'green' : mark.kind === 'call' || mark.kind === 'replay' ? (mark.call === 'sync' ? 'yellow' : 'blue') : 'paper'} x={mark.x + 5} y={mark.y + mark.height / 2} dominantBaseline="central">
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
              {fits(FULL_LANE_WORDS.idle, box.width) ? (
                <text className="es-lanes__idle-text" x={box.x + 5} y={box.y + 12}>
                  {FULL_LANE_WORDS.idle}
                </text>
              ) : null}
            </g>
          ))}
          {layout.dims.map((dim) => (
            <Dimension key={dim.id} id={dim.id} x0={dim.x0} x1={dim.x1} y={dim.y} label={dim.label} value={`${dim.us} µs`} />
          ))}
        </g>
        {reference === null ? null : (
          <g data-lanes-reference="" aria-hidden="true">
            {reference.marks
              .filter((mark) => mark.kind === 'forward')
              .map((mark) => (
                <rect key={mark.id} className="es-fl__ref" data-ref-forward={mark.step} x={mark.x + 0.5} y={refTop + 2.5} width={Math.max(0, mark.width - 1)} height={Math.max(0, refHeight - 5)} />
              ))}
            {reference.idle
              .filter((box) => box.before !== null)
              .map((box) => (
                <rect key={box.id} className="es-fl__ref-idle" x={box.x + 1} y={refTop + 2.5} width={Math.max(0, box.width - 2)} height={Math.max(0, refHeight - 5)} />
              ))}
          </g>
        )}
        <g data-lanes-axis="">
          {layout.axis.ticks.map((tick) => (
            <g key={tick.t}>
              <line className="es-lanes__tick" x1={tick.x} x2={tick.x} y1={axisY} y2={axisY + 4} />
              <text className="es-lanes__tick-label" x={tick.x} y={axisY + 6} textAnchor={tick.x <= scale.x + 4 ? 'start' : tick.x >= scale.x + scale.width - 4 ? 'end' : 'middle'} dominantBaseline="hanging">
                {tick.t.toLocaleString('en-US')}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <span className="es-lanes__now" data-lane-now="" style={{ top: `${layout.now.y0 - y0}px`, height: `${axisY - layout.now.y0}px` }}>
        <Marker kind="cursor" at={(layout.now.x - scale.x) / scale.width} />
      </span>
    </div>
  )
}

/** A dimension line: end ticks at the interval's two edges, and its value on a slip of paper on the line. */
function Dimension({ id, x0, x1, y, label, value }: { id: string; x0: number; x1: number; y: number; label: string; value: string }) {
  const width = x1 - x0
  // The whole words where they fit across the box, else the value, else the number alone; a box too narrow for any keeps its line and its ends,
  // and its value is in the state table. The slip never runs past the box, so it covers no forward beside it.
  const words = [label, value, value.replace(' µs', '')].find((candidate) => candidate.length * 6.5 + 10 <= width)
  const slip = words === undefined ? 0 : words.length * 6.5 + 10
  const mid = x0 + width / 2
  return (
    <g data-lane-dim={id}>
      <line className="es-lanes__dim" x1={x0 + 2} x2={x1 - 2} y1={y} y2={y} />
      <line className="es-lanes__dim" x1={x0 + 2} x2={x0 + 2} y1={y - 6} y2={y + 6} />
      <line className="es-lanes__dim" x1={x1 - 2} x2={x1 - 2} y1={y - 6} y2={y + 6} />
      {words === undefined ? null : (
        <>
          <rect className="es-lanes__dim-slip" x={mid - slip / 2} y={y - 9} width={slip} height={18} />
          <text className="es-lanes__dim-text" x={mid} y={y} textAnchor="middle" dominantBaseline="central">
            {words}
          </text>
        </>
      )}
    </g>
  )
}
