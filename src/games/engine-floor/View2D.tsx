import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { SOURCE_LATER } from '@es/play/engine-floor/copy'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import { ARROW_WORDS, fitRow, LANES_DESK, LANES_PHONE, layoutLanes, lanesOfView, type LaneGeometry, type LaneRow, type Lanes } from '@es/play/engine-floor/lanes'
import type { FloorView, LaidView } from '@es/play/engine-floor/types'
import { MECHANISM_ORDER, MECHANISM_WORDS, placeName, stageName } from '@es/play/engine-floor/words'
import type { Mechanism } from '@es/sim/lifecycle'
import { Glyph, Icon } from '@/design/components/Glyph'
import { Legend } from '@/design/components/Legend'
import { Marker } from '@/design/components/Marker'
import { TextLink } from '@/design/components/TextLink'
import { Code } from './Code'
import { HandoffGlyph } from './HandoffGlyph'
import { handoffWords, permalink, plain } from './text'
import type { FloorRun } from './types'
import { useAnnouncements } from './useFloorControls'

/*
 * Request path's diagram (REDESIGN §3.6): the swimlane the learner plays on. One column per process with its threads as thin sub-columns, the
 * GPU's streams at the right, and time running down. Each laid stage is a row: a node in the column of the place it lands in, its name as
 * code, and an arrow from the node before labelled with its mechanism as a mark and a word. The amber "now" line and ring sit on the row the
 * next stage starts from. A stage that stopped the run is a red triangle with the word "stopped".
 *
 * The positions are packages/play/engine-floor/lanes.ts's, from the view alone, so the diagram draws only what the session's view exposes:
 * before the prediction no column, and in a sealed run a column only once the route reaches it. The words and the marks are DOM over one SVG
 * of lines: a row's name is a button that opens what the stage is (its mechanism, its process and its source), the same facts the table
 * under the frame lists.
 *
 * The box fits fourteen rows at 1440 x 900 (the row is fitted to the box's height); a longer path scrolls inside it and keeps the row of
 * "now" in view. On a phone the columns are narrow and the box scrolls sideways too, keeping the current column in view.
 */

/** The box's size, read on the client; the server and the first paint lay out at the desk's. */
function useBox(ref: RefObject<HTMLDivElement | null>): { width: number; height: number } | null {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const read = () => {
      const width = Math.round(node.clientWidth)
      const height = Math.round(node.clientHeight)
      setBox((now) => (now !== null && now.width === width && now.height === height ? now : { width, height }))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return box
}

/** A lesson's dock draws the same swimlane small: no names beside the nodes, only the marks [estimated from the dock's 24rem]. */
const DOCK_LANES: LaneGeometry = { box: 340, gutter: 24, head: 22, start: 20, row: 20, threadMin: 22, threadMax: 70, pad: 8, tail: 8 }

/** The geometry for a box: a phone's under 480 px, the desk's otherwise, with the row fitted to the height so fourteen rows show. */
function geometryOf(box: { width: number; height: number } | null, size: 'frame' | 'dock'): LaneGeometry {
  if (size === 'dock') return box === null || box.width <= 0 ? DOCK_LANES : { ...DOCK_LANES, box: box.width }
  if (box === null || box.width <= 0) return LANES_DESK
  if (box.width < 480) return { ...LANES_PHONE, box: box.width }
  return { ...LANES_DESK, box: box.width, row: box.height > 0 ? fitRow(box.height + LANES_DESK.head, LANES_DESK) : LANES_DESK.row }
}

const STATE_WORDS: Readonly<Record<LaidView['state'], string>> = { ran: 'held', struck: 'stopped the request', pending: 'not run yet' }

/** The arrow's look by the stage's state: ink for a stage the request got through, pencil for one not run yet, and the second ink for the one that stopped it. */
const INK: Readonly<Record<LaidView['state'], { stroke: string; width: number; dash?: string }>> = {
  ran: { stroke: 'var(--es-paper-ink)', width: 1.5 },
  pending: { stroke: 'var(--es-text-2)', width: 1.25, dash: '4 3' },
  struck: { stroke: 'var(--es-paper-ink-2)', width: 1.75 },
}

const points = (path: LaneRow['path']): string => path.map(([x, y]) => `${x},${y}`).join(' ')

/** Where the "now" line runs: under the row of the present, or under the request's own row. */
const nowY = (lanes: Lanes): number | null => (lanes.cursor === null ? null : lanes.cursor.y + Math.round((lanes.cursor.row < 0 ? lanes.geometry.start : lanes.geometry.row) / 2) - 1)

/** The SVG of lines under the words: lifelines, separators, arrows, nodes and the cursor. Decoration for the words over it. */
function Ink({ lanes }: { lanes: Lanes }) {
  const { width, height, geometry: g, columns, rows, start } = lanes
  return (
    <svg className="es-lanes__ink" width={width} height={height - g.head} viewBox={`0 ${g.head} ${width} ${height - g.head}`} aria-hidden="true" focusable="false">
      {columns.map((column, at) => (
        <g key={column.key} data-lane-column={column.key}>
          {column.kind === 'line' ? <rect x={column.x0} y={g.head} width={column.w} height={height - g.head} className="es-lanes__gpu" /> : null}
          {at === 0 ? null : <line x1={column.x0} y1={0} x2={column.x0} y2={height} className="es-lanes__sep" />}
          {column.threads.map((thread) => (
            <line key={thread.key} x1={thread.x} y1={g.head} x2={thread.x} y2={height} className="es-lanes__life" />
          ))}
        </g>
      ))}
      {rows.map((row) => {
        const ink = INK[row.state]
        const end = row.path[row.path.length - 1]
        return (
          <g key={row.id} data-lane-arrow={row.index} data-state={row.state}>
            <polyline points={points(row.path)} fill="none" stroke={ink.stroke} strokeWidth={row.crosses ? ink.width + 0.75 : ink.width} strokeDasharray={!row.joined ? '2 3' : ink.dash} />
            <polygon points={`${end[0]},${end[1]} ${end[0] - 3.5},${end[1] - 6} ${end[0] + 3.5},${end[1] - 6}`} fill={ink.stroke} />
          </g>
        )
      })}
      <circle cx={start.x} cy={start.y} r={6} className="es-lanes__start" />
      {rows.map((row) =>
        row.state === 'struck' ? (
          <polygon key={row.id} points={`${row.x},${row.y - 7} ${row.x - 7},${row.y + 5} ${row.x + 7},${row.y + 5}`} className="es-lanes__struck" />
        ) : (
          <circle key={row.id} cx={row.x} cy={row.y} r={5} className={row.state === 'ran' ? 'es-lanes__node' : 'es-lanes__node es-lanes__node--pending'} />
        ),
      )}
    </svg>
  )
}

/** What a laid stage is, as its popover says: its mechanism, where it runs and its source, or why the source waits for a run. */
export function StageFacts({ stage }: { stage: LaidView }) {
  const words = MECHANISM_WORDS[stage.mechanism]
  return (
    <div className="es-floor-facts" data-stage-facts={stage.id}>
      <p className="es-floor-facts__mech">
        <HandoffGlyph mechanism={stage.mechanism} className="es-floor-facts__glyph" />
        <span>
          <strong>{words.tile}</strong>: {words.does}.
        </span>
      </p>
      <p>
        <Code>{stage.label}</Code>
      </p>
      <p className="text-text-2" data-stage-process="">
        Runs from <code>{placeName(stage.from)}</code> to <code>{placeName(stage.to)}</code>. The last run: {STATE_WORDS[stage.state]}.
      </p>
      {stage.source === null ? (
        <p className="text-text-2" data-source="later">
          {SOURCE_LATER}
        </p>
      ) : (
        <p className="es-floor-facts__source" data-source="">
          {stage.owner === null ? null : <>{ENGINE_NAMES[stage.owner]}: </>}
          <TextLink href={permalink(stage.source)}>
            <code>{stage.source.path}</code>
          </TextLink>{' '}
          · <code>{stage.source.symbol}</code> · line <span className="font-numeric">{stage.source.line}</span>
        </p>
      )}
    </div>
  )
}

/** The tools a row's popover offers in an open practice run: move the stage, or take the path back to it. */
export interface RowTools {
  readonly move: (index: number, by: -1 | 1) => void
  readonly takeBack: (to: number) => void
}

/** A row's popover: the stage's facts, and in an open run the tools. It is not modal: Escape, Close or a press outside close it. */
function RowSheet({ stage, view, tools, up, left, onClose }: { stage: LaidView; view: FloorView; tools: RowTools | null; up: boolean; left: number; onClose: () => void }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target === null || panel.current?.parentElement?.contains(target)) return
      onClose()
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const last = view.laid.length - 1
  return (
    <div ref={panel} className="es-pop__panel es-lanes__sheet" role="dialog" aria-labelledby={titleId} data-up={up || undefined} style={{ ['--sheet-left' as string]: `${left}px` }}>
      <div className="es-pop__head">
        <span className="es-pop__title" id={titleId}>
          Stage {stage.index + 1}: <code>{stageName(stage.label)}</code>
        </span>
        <button type="button" className="es-pop__close" aria-label="Close" onClick={onClose}>
          <Icon name="strike" />
        </button>
      </div>
      <div className="es-pop__body">
        <StageFacts stage={stage} />
        {tools === null || view.done ? null : (
          <div className="es-lanes__tools" role="group" aria-label={`Stage ${stage.index + 1}`}>
            <button type="button" className="es-floor-act" disabled={stage.index === 0} onClick={() => tools.move(stage.index, -1)}>
              Move up
            </button>
            <button type="button" className="es-floor-act" disabled={stage.index === last} onClick={() => tools.move(stage.index, 1)}>
              Move down
            </button>
            <button type="button" className="es-floor-act" onClick={() => tools.takeBack(stage.index)}>
              Take the path back to here
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The arrow's mark and word, beside its last leg. */
function Tag({ row, top }: { row: LaneRow; top: number }) {
  return (
    <span className="es-lanes__tag" data-side={row.tag.side} style={{ left: row.tag.x, top: row.tag.y - top }} aria-hidden="true">
      <HandoffGlyph mechanism={row.mechanism} className="es-lanes__tag-glyph" />
      {ARROW_WORDS[row.mechanism]}
    </span>
  )
}

export interface SwimlaneProps {
  view: FloorView
  /** The instrument's diagram, or a lesson's dock (small, no names, no popovers). */
  size?: 'frame' | 'dock'
  /** In practice, the tools a row's popover offers. */
  tools?: RowTools | null
}

/** The swimlane. */
export function Swimlane({ view, size = 'frame', tools = null }: SwimlaneProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const box = useBox(scroller)
  const dock = size === 'dock'
  const geometry = useMemo(() => geometryOf(box, size), [box, size])
  const lanes = useMemo(() => layoutLanes(lanesOfView(view), geometry), [view, geometry])
  const [open, setOpen] = useState<{ row: number; up: boolean } | null>(null)
  const [focusAt, setFocusAt] = useState<number | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const g = lanes.geometry
  const openRow = open !== null && open.row < view.laid.length ? open.row : null
  const now = nowY(lanes)

  // Keep the row of "now" in view: a longer path scrolls inside the box with the rows before it above (REDESIGN §3.6), and on a phone the
  // box scrolls sideways to the current column.
  const cursorRow = lanes.cursor?.row ?? lanes.rows.length - 1
  // The row to keep in view: the present's, or the row that stopped the run, which stands just under it.
  const keepRow = view.stop === null ? cursorRow : Math.max(cursorRow, view.stop.at)
  useLayoutEffect(() => {
    const node = scroller.current
    if (node === null) return
    const target = keepRow >= 0 ? lanes.rows[keepRow] : undefined
    const y = (target?.y ?? lanes.start.y) - g.head
    const x = target?.x ?? lanes.start.x
    const bottom = y + g.row * 1.5
    if (bottom > node.scrollTop + node.clientHeight) node.scrollTop = bottom - node.clientHeight
    else if (y - g.row < node.scrollTop) node.scrollTop = Math.max(0, y - g.row)
    // Sideways, the node and the start of its name: the node near the left with its name to the right, or the other way round.
    const right = target === undefined || target.side === 'right'
    const from = right ? x - 24 : x - Math.min(target.room, node.clientWidth - 96) - 24
    const to = right ? x + Math.min(target?.room ?? 120, 160) : x + 24
    if (from < node.scrollLeft + g.gutter || to > node.scrollLeft + node.clientWidth) node.scrollLeft = Math.max(0, right ? x - g.gutter - 24 : to - node.clientWidth)
    if (head.current !== null) head.current.style.transform = `translateX(${-node.scrollLeft}px)`
  }, [keepRow, lanes, g.row, g.head, g.gutter, scroller])

  const rowStop = Math.max(0, Math.min(focusAt ?? cursorRow, view.laid.length - 1))
  const onKey = (event: KeyboardEvent<HTMLOListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button.es-lanes__name'))
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0 || event.ctrlKey || event.altKey || event.metaKey) return
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(buttons.length - 1, next))
    setFocusAt(target)
    buttons[target]?.focus()
  }
  const close = (index: number) => {
    setOpen(null)
    list.current?.querySelector<HTMLButtonElement>(`[data-lane-row="${index}"] button.es-lanes__name`)?.focus()
  }

  return (
    <div className="es-lanes" data-floor-lanes="" data-size={dock ? 'dock' : box !== null && box.width < 480 ? 'phone' : 'desk'} data-sealed={view.sealed || undefined} data-columns={lanes.columns.length}>
      {/* The heads stand over the box and move sideways with it, and never over a row, so no row's name is ever under them. */}
      <div className="es-lanes__headbox" style={{ height: g.head }} aria-hidden="true">
          <div ref={head} className="es-lanes__head" style={{ width: lanes.width, height: g.head }} data-lane-head="">
            {lanes.columns.map((column) => (
              <div key={column.key} className="es-lanes__proc" data-kind={column.kind} data-process={column.key} style={{ left: column.x0, width: column.w }} title={column.title}>
                <span className="es-lanes__proc-name">
                  {column.name}
                  {column.id === null || dock ? null : <code className="es-lanes__proc-id"> {column.id}</code>}
                </span>
                {dock ? null : (
                  <span className="es-lanes__threads">
                    {column.threads.map((thread) => (
                      <span key={thread.key} className="es-lanes__thread" style={{ width: thread.w }} title={thread.name}>
                        <Glyph
                          shape={thread.gpu ? 'hexagon' : 'circle'}
                          className="es-lanes__thread-mark"
                          style={{ color: `var(--es-cat-${thread.gpu ? 'green' : 'blue'})` }}
                          edge={`var(--es-cat-${thread.gpu ? 'green' : 'blue'}-edge)`}
                        />
                        <span className="es-lanes__thread-name">{thread.name}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
      </div>
      {/* The box scrolls where the path is longer or wider than it, so the keyboard can reach it and scroll it. */}
      <div
        ref={scroller}
        className="es-lanes__scroll"
        data-lanes-scroll=""
        role="region"
        aria-label="Swimlane"
        tabIndex={0}
        onScroll={(event) => {
          if (head.current !== null) head.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`
        }}
      >
        <div className="es-lanes__sheet-box" style={{ width: lanes.width, height: lanes.height - g.head }}>
          {now === null || lanes.cursor === null ? null : (
            <>
              <span className="es-lanes__nowline" style={{ top: now - g.head, left: g.gutter, height: lanes.width - g.gutter - g.pad }} aria-hidden="true" data-lane-now-line="">
                <Marker kind="cursor" at={0} />
              </span>
              <svg
                className="es-marker__shape es-lanes__nowring"
                viewBox="0 0 24 24"
                style={{ left: lanes.cursor.row < 0 ? lanes.start.x : (lanes.rows[lanes.cursor.row]?.x ?? lanes.start.x), top: lanes.cursor.y - g.head }}
                aria-hidden="true"
                focusable="false"
                data-lane-now-ring=""
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
              {dock ? null : (
                <span className="es-lanes__now-word" style={{ top: now - g.head }} data-lane-now="">
                  <Marker word="now" />
                </span>
              )}
            </>
          )}
          <Ink lanes={lanes} />
          {dock ? null : (
            <span className="es-lanes__start-label" style={{ left: lanes.start.x + 12, top: lanes.start.y - g.head }} data-lane-start="">
              request
              {view.prediction === null ? <span className="es-lanes__start-note"> · the columns open once your boundaries guess is in</span> : null}
            </span>
          )}
          <span
            className="es-lanes__moment"
            style={{ left: g.gutter, top: (lanes.rows.at(-1)?.y ?? lanes.start.y) + Math.round(g.row / 2) - g.head }}
            aria-hidden="true"
            data-lane-moment=""
          />
          <ol ref={list} className="es-lanes__rows" aria-label="The path, stage by stage" onKeyDown={onKey} data-native-keys="ArrowUp ArrowDown Home End">
            {lanes.rows.map((row) => {
              const stage = view.laid[row.index]
              return (
                <li
                  key={row.id}
                  className="es-lanes__row es-pop"
                  data-lane-row={row.index}
                  data-state={row.state}
                  data-open={openRow === row.index || undefined}
                  style={{ top: row.y - g.row / 2 - g.head, height: g.row }}
                >
                  <span className="es-lanes__no font-numeric" aria-hidden="true">
                    {String(row.index + 1).padStart(2, '0')}
                  </span>
                  {dock ? null : <Tag row={row} top={row.y - g.row / 2} />}
                  {dock ? null : (
                    <button
                      type="button"
                      className="es-lanes__name"
                      data-side={row.side}
                      style={row.side === 'right' ? { left: row.x + 10, maxWidth: row.room } : { right: lanes.width - row.x + 10, maxWidth: row.room }}
                      tabIndex={row.index === rowStop ? 0 : -1}
                      aria-haspopup="dialog"
                      aria-expanded={openRow === row.index}
                      aria-label={`Stage ${row.index + 1}, ${STATE_WORDS[row.state]}: ${handoffWords(row.mechanism)}, ${plain(row.label)}. From ${placeName(stage.from)} to ${placeName(stage.to)}.`}
                      onClick={(event) => {
                        setFocusAt(row.index)
                        // The popover opens over its row when the row stands in the lower half of the box, so it stays in view.
                        const box = scroller.current?.getBoundingClientRect()
                        const at = event.currentTarget.getBoundingClientRect()
                        setOpen(openRow === row.index ? null : { row: row.index, up: box !== undefined && at.top - box.top > box.height / 2 })
                      }}
                    >
                      {row.state === 'struck' ? <span className="es-lanes__stopped">stopped</span> : null}
                      <code>{row.name}</code>
                    </button>
                  )}
                  {openRow === row.index ? <RowSheet stage={stage} view={view} tools={tools} up={open?.up ?? false} left={row.side === 'right' ? row.x + 10 : row.x - 330} onClose={() => close(row.index)} /> : null}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

/** The instrument's diagram. */
export function View2D({ run, tools = null, speaks = true }: { run: FloorRun; tools?: RowTools | null; speaks?: boolean }) {
  return speaks ? <Speaking run={run} tools={tools} /> : <Swimlane view={run.view} tools={tools} />
}

/** The diagram that says each change in the live region: it is drawn for the whole run, so the line of a run that ends is said too. */
function Speaking({ run, tools }: { run: FloorRun; tools: RowTools | null }) {
  useAnnouncements(run)
  return <Swimlane view={run.view} tools={tools} />
}

/** The legend under the diagram: the colour code of the columns and the stopped row, each with its shape and word, then the mechanisms drawn so far, each with its mark and word, then "now". */
export function FloorLegend({ view }: { view: FloorView }) {
  const drawn = new Set<Mechanism>(view.laid.map((stage) => stage.mechanism))
  const mechanisms = MECHANISM_ORDER.filter((mechanism) => drawn.has(mechanism))
  return (
    <div className="es-floor-legend" data-floor-legend="">
      <Legend
        label="Legend: the swimlane's code"
        entries={[
          { slot: 'blue', word: 'host thread' },
          { slot: 'green', word: 'GPU stream' },
          { slot: 'red', word: 'stopped' },
        ]}
      />
      <ul className="es-legend" aria-label="Legend: the mechanisms drawn">
        <li className="es-legend__entry">
          <span className="es-floor-key" aria-hidden="true" />
          <span>not run yet</span>
        </li>
        {mechanisms.map((mechanism) => (
          <li key={mechanism} className="es-legend__entry" data-legend-mechanism={mechanism}>
            <HandoffGlyph mechanism={mechanism} className="es-legend__glyph" />
            <span>{mechanism === 'h2d' || mechanism === 'd2h' ? MECHANISM_WORDS[mechanism].engine : ARROW_WORDS[mechanism]}</span>
          </li>
        ))}
        {view.done ? null : (
          <li className="es-legend__entry">
            <Marker />
          </li>
        )}
      </ul>
    </div>
  )
}
