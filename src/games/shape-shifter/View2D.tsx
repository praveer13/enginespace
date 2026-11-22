import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Glyph } from '@/design/components/Glyph'
import { Legend, type LegendEntry } from '@/design/components/Legend'
import { Marker } from '@/design/components/Marker'
import { PartPopover } from '@/games/kit/PartPopover'
import { usePhone } from '@/games/kit/usePhone'
import { programLabel, sharedLabel, shapeText, tupleText } from '@es/play/shape-shifter/labels'
import { SHIFT_PARTS } from '@es/play/shape-shifter/copy'
import type { BufferView, GridView, LayoutView, ShiftView } from '@es/play/shape-shifter/view'
import { COLS } from '@es/play/shape-shifter/view'
import { cellsLayout, CELL_MAX, CELLS_TALL, CELLS_TALL_PHONE, CELL_FLOOR, flatAt, programAt, selectionOf, type CellsLayout } from './focus'
import { keepDockNow } from './hand'
import type { ShiftPick, ShiftRun } from './types'

/*
 * Tensor views' diagram (GAMES.md §4.1, REDESIGN §2.6): the engine's own picture of a tensor, drawn flat.
 *
 *   - Shape and strides: one row per dimension (its size, and how far in the buffer one step along it moves), then the offset and whether
 *     the tensor is contiguous. The table's head carries the marker: it is the tensor now. Under it, the target: its shape, whether it must
 *     be contiguous, and how many elements already sit where it puts them.
 *   - The cells: one per element at its index, each holding its number (the address it had in the start's buffer). A rank-3 tensor is one
 *     grid per index of its first dimension, side by side, wrapping where they do not fit.
 *   - The stride order: one line through the cells in the order their addresses run, straight between neighbours in row order and an arc
 *     over the cells for any other step, from a dot to an arrowhead.
 *   - The buffer: every address from the lowest the tensor reads to the highest, in rows of 16, with the address under each row's first
 *     cell. An address it does not read is hollow; one that several elements read (stride 0) is dotted, with its count. After a copy the
 *     old buffer stays one turn, dashed, over the new one.
 *   - On `grid`: the tensor's cells, and each program's tile outlined over them with its index; a lane past the edge is a hollow cell
 *     outside the tensor, inside its tile. The program in hand carries the marker.
 *
 * Every number is DOM text, and the drawing holds no fact that State as a table does not: the drawing is hidden from assistive technology.
 * A press on a cell selects its element and marks its address in the buffer, and the other way about; a keyboard selects from the table.
 * Each region's name is its part's popover (copy.ts's rows, the same rows the parts list reads).
 *
 * At a desk the drawing stands beside the dock, so a tensor that grows or shrinks moves nothing in the dock. On a phone it stands in the
 * page's flow over the pinned dock, and the page takes a change of its height back (hand.ts), so the dock stays where it is.
 */

/** The width of a box, read as it is laid out and again whenever it changes. A first paint takes `initial`. */
function useRoom(initial: number): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [room, setRoom] = useState(initial)
  useLayoutEffect(() => {
    if (node === null) return
    const read = () => setRoom(Math.floor(node.clientWidth))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(read)
    watch.observe(node)
    return () => watch.disconnect()
  }, [node])
  return [setNode, room]
}

/** The drawing's root: every commit that redraws it runs the dock keeper before anything is painted (hand.ts). */
function useKeepDock() {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => keepDockNow(root.current))
  return root
}

/** A region's name, as its part's popover. Tensor views' engines are PyTorch and Triton, so the engine line names the right one. */
export function PartName({ id, children }: { id: string; children?: ReactNode }) {
  const part = SHIFT_PARTS.find((row) => row.id === id)
  if (part === undefined) return <>{children}</>
  const library = part.engine?.startsWith('tl.') === true || part.engine?.startsWith('triton.') === true ? 'Triton' : 'PyTorch'
  return (
    <PartPopover
      part={part}
      trigger={children}
      engineLine={
        part.engine === undefined ? null : (
          <>
            In {library}: <code>{part.engine}</code>.
          </>
        )
      }
    />
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The table and the target                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const n = (value: number) => <span className="font-numeric">{value}</span>

function Table({ layout }: { layout: LayoutView }) {
  return (
    <section className="es-shift__table" aria-label="Shape and strides" data-shift-table="">
      <h3 className="es-shift__label">
        <PartName id="table" />
        <Marker word="now" className="es-shift__now" />
      </h3>
      <table className="es-shift__metadata" aria-hidden="true">
        <thead>
          <tr>
            <th scope="col">dim</th>
            <th scope="col">size</th>
            <th scope="col">stride</th>
          </tr>
        </thead>
        <tbody>
          {layout.table.map((row) => (
            <tr key={row.dim} data-dim={row.dim}>
              <th scope="row">{n(row.dim)}</th>
              <td>{n(row.size)}</td>
              <td data-stride={row.stride === 0 ? 'zero' : undefined}>{n(row.stride)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="es-shift__meta" data-shift-meta="">
        offset {n(layout.offset)} · contiguous <strong>{layout.contiguous ? 'yes' : 'no'}</strong>
      </p>
      {/* On a phone the table is one line over the cells (GAMES.md §4.1). */}
      <p className="es-shift__line" data-shift-line="">
        shape <span className="font-numeric">{tupleText(layout.table.map((row) => row.size))}</span> · strides{' '}
        <span className="font-numeric" data-shift-strides="">
          {tupleText(layout.table.map((row) => row.stride))}
        </span>{' '}
        · offset {n(layout.offset)} · contiguous {layout.contiguous ? 'yes' : 'no'}
      </p>
    </section>
  )
}

/** The target's rows: its elements in logical order, a run of the last dimension's size each, grouped by first index at rank 3. */
function targetRows(shape: readonly number[], elements: readonly number[]): { readonly slice: number | null; readonly rows: readonly (readonly number[])[] }[] {
  const width = shape.length === 0 ? elements.length : (shape[shape.length - 1] ?? 1)
  const rows: number[][] = []
  for (let i = 0; i < elements.length; i += Math.max(1, width)) rows.push(elements.slice(i, i + Math.max(1, width)))
  if (shape.length < 3) return [{ slice: null, rows }]
  const per = shape[1] ?? 1
  const groups: { slice: number; rows: number[][] }[] = []
  for (let s = 0; s < (shape[0] ?? 1); s++) groups.push({ slice: s, rows: rows.slice(s * per, (s + 1) * per) })
  return groups
}

/** The target drawn as its numbers: one box per row, in order, so what to reach can be read before the first move. */
function TargetElements({ shape, elements, open }: { shape: readonly number[]; elements: readonly number[]; open: boolean }) {
  const groups = targetRows(shape, elements)
  return (
    <div className="es-shift__goal" aria-hidden="true" data-shift-target-elements="" data-open={open || undefined}>
      <p className="es-shift__goal-note">{shape.length === 1 ? 'Its elements in order:' : shape.length === 3 ? 'Its elements in order, a box per row, grouped by the first index [i]:' : 'Its elements in order, a box per row:'}</p>
      {groups.map((group) => (
        <div key={group.slice ?? 'all'} className="es-shift__goal-group">
          {group.slice === null ? null : <span className="es-shift__goal-tag">[{group.slice}]</span>}
          <span className="es-shift__goal-rows">
            {group.rows.map((row, r) => (
              <span key={r} className="es-shift__goal-row">
                {row.map((element, c) => (
                  <span key={c} className="es-shift__goal-cell font-numeric" data-goal-element={element}>
                    {element}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function Target({ layout }: { layout: LayoutView }) {
  const { target } = layout
  // On a phone the target's numbers wait behind a toggle, so the cells and the buffer keep their place over the pinned dock; at a desk
  // they stand under the target line and the toggle is not drawn (shape-shifter.css).
  const [open, setOpen] = useState(false)
  return (
    <section className="es-shift__target" aria-label="Target" data-shift-target="" data-met={target.met || undefined}>
      <h3 className="es-shift__label">
        <PartName id="target" />
        <span className="es-shift__count">{target.met ? 'reached' : layout.status === 'failed' ? 'failed' : 'to reach'}</span>
      </h3>
      <p className="es-shift__target-line">
        shape <span className="font-numeric">{shapeText(target.shape)}</span> · contiguous {target.contiguous ? 'required' : 'not required'} ·{' '}
        <span data-shift-inplace="">
          {n(target.inPlace)} of {n(target.of)} in place
        </span>
        <button type="button" className="es-shift__goal-toggle" aria-expanded={open} onClick={() => setOpen(!open)} data-shift-target-toggle="">
          {open ? 'hide its order' : 'show its order'}
        </button>
      </p>
      <TargetElements shape={target.shape} elements={target.elements} open={open} />
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The cells and the stride order                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The stride order as an SVG path over the cells: straight between neighbours in row order, an arc over the cells otherwise. */
function orderPath(layout: LayoutView, box: CellsLayout): { d: string; start: { x: number; y: number } | null } {
  const half = box.size / 2
  const centre = (flat: number) => {
    const at = box.at[flat] ?? { x: 0, y: 0 }
    return { x: at.x + half, y: at.y + half }
  }
  if (layout.order.length === 0) return { d: '', start: null }
  const first = centre(layout.order[0].from)
  let d = `M${first.x} ${first.y}`
  for (const step of layout.order) {
    const a = centre(step.from)
    const b = centre(step.to)
    if (!step.arc) {
      d += ` L${b.x} ${b.y}`
      continue
    }
    // An arc bows to the left of its direction, by a part of its length and never more than a cell and a half.
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const bow = Math.min(length * 0.2, box.size * 0.9)
    const cx = (a.x + b.x) / 2 + (dy / length) * bow
    const cy = (a.y + b.y) / 2 - (dx / length) * bow
    d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`
  }
  return { d, start: first }
}

function Cells({ layout, pick, onPick, room, tall }: { layout: LayoutView; pick: number | null; onPick: (flat: number | null) => void; room: number; tall: number }) {
  const shape = layout.table.map((row) => row.size)
  const box = cellsLayout(shape, room, tall)
  const path = orderPath(layout, box)
  const chosen = selectionOf(layout, pick)
  // A cell is keyed by its element, so a view that moves the element to a new index moves its cell there (240 ms, none under reduced
  // motion); elements that share an address (stride 0) are told apart by their turn among them.
  const seen = new Map<number, number>()
  const placed = layout.cells.map((cell) => {
    const turn = seen.get(cell.element) ?? 0
    seen.set(cell.element, turn + 1)
    return { cell, key: `${cell.element}:${turn}`, at: box.at[cell.flat] ?? { x: 0, y: 0 }, jump: layout.jump !== null && (cell.flat === layout.jump || cell.flat === layout.jump - 1) }
  })
  return (
    <div className="es-shift__cells" style={{ width: box.width, height: box.height, '--es-cell': `${box.size}px` } as CSSProperties} aria-hidden="true">
      {box.tags.map((tag) => (
        <span key={tag.label} className="es-shift__slice" style={{ left: tag.x, top: tag.y }} data-shift-slice="">
          {tag.label}
        </span>
      ))}
      {/* Three layers: the cells' fills, the stride order over them, and the numbers over the line, so the line never hides a number. */}
      {placed.map(({ cell, key, at, jump }) => (
        <span
          key={key}
          className="es-shift__cell"
          style={{ left: at.x, top: at.y }}
          data-flat={cell.flat}
          data-element={cell.element}
          data-marked={cell.marked || undefined}
          data-shared={cell.shared || undefined}
          data-jump={jump || undefined}
          data-selected={chosen?.flat === cell.flat || (chosen !== null && cell.address === chosen.address) || undefined}
          onClick={() => onPick(pick === cell.flat ? null : cell.flat)}
        />
      ))}
      <svg className="es-shift__order" width={box.width} height={box.height} viewBox={`0 0 ${box.width} ${box.height}`} data-shift-order="">
        <defs>
          <marker id="es-shift-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 8 4 0 8Z" className="es-shift__arrow" />
          </marker>
        </defs>
        {path.start === null ? null : (
          <>
            <path d={path.d} className="es-shift__thread" markerEnd="url(#es-shift-arrow)" />
            <circle cx={path.start.x} cy={path.start.y} r={3.5} className="es-shift__thread-start" />
          </>
        )}
      </svg>
      {placed.map(({ cell, key, at, jump }) => (
        <span
          key={key}
          className="es-shift__number"
          style={{ left: at.x, top: at.y }}
          data-number={cell.element}
          data-marked={cell.marked || undefined}
          data-shared={cell.shared || undefined}
          data-jump={jump || undefined}
        >
          {cell.element}
        </span>
      ))}
    </div>
  )
}

function Buffer({ buffer, old = false, selected, onPick, room }: { buffer: BufferView; old?: boolean; selected: number | null; onPick?: (address: number) => void; room: number }) {
  const size = Math.max(CELL_FLOOR, Math.min(usePhone() ? 18 : 28, Math.floor(room / COLS)))
  const rows: (typeof buffer.cells)[] = []
  for (let i = 0; i < buffer.cells.length; i += COLS) rows.push(buffer.cells.slice(i, i + COLS))
  return (
    <ol className="es-shift__buffer" data-old={old || undefined} style={{ '--es-addr': `${size}px` } as CSSProperties} aria-hidden="true" data-shift-buffer={old ? 'old' : 'now'}>
      {rows.map((row) => (
        <li key={row[0].address} className="es-shift__buffer-row">
          <span className="es-shift__addresses">
            {row.map((cell) => (
              <span
                key={cell.address}
                className="es-shift__addr"
                data-address={cell.address}
                data-read={cell.element === null ? undefined : ''}
                data-shared={cell.reads > 1 || undefined}
                data-selected={selected === cell.address || undefined}
                onClick={onPick === undefined || cell.element === null ? undefined : () => onPick(cell.address)}
              >
                {cell.element ?? ''}
                {cell.reads > 1 ? <span className="es-shift__reads">{sharedLabel(cell.reads)}</span> : null}
              </span>
            ))}
          </span>
          <span className="es-shift__address-tag">{row[0].address}</span>
        </li>
      ))}
    </ol>
  )
}

function LayoutDrawing({ layout, pick, onPick }: { layout: LayoutView; pick: number | null; onPick: (flat: number | null) => void }) {
  const [cellsBox, cellsRoom] = useRoom(480)
  // On a phone the table's line, the cells and the buffer stand together over the pinned dock: the cells keep to CELLS_TALL_PHONE.
  const tall = usePhone() ? CELLS_TALL_PHONE : CELLS_TALL
  const chosen = selectionOf(layout, pick)
  const root = useKeepDock()
  return (
    <div ref={root} className="es-shift" data-shift-view="layout" data-status={layout.status} data-callout-after="">
      <div className="es-shift__side">
        <Table layout={layout} />
        <Target layout={layout} />
      </div>
      <div className="es-shift__main" ref={cellsBox}>
        <section className="es-shift__cells-box" aria-label="Elements by index" data-shift-cells="">
          <h3 className="es-shift__label">
            <span>Elements</span>
            <span className="es-shift__count">
              <span className="es-shift__wide">by index, with the </span>
              <PartName id="order" />
              {layout.table.length === 1 ? <span className="es-shift__wide"> · one dimension, wrapped to fit</span> : null}
            </span>
          </h3>
          <Cells layout={layout} pick={pick} onPick={onPick} room={cellsRoom} tall={tall} />
        </section>
        <section className="es-shift__buffer-box" aria-label="Buffer" data-shift-buffer-box="">
          <h3 className="es-shift__label">
            <PartName id="buffer" />
            <span className="es-shift__count">
              {layout.old === null ? (
                <>
                  addresses {n(layout.buffer.first)} to {n(layout.buffer.first + layout.buffer.cells.length - 1)}
                </>
              ) : (
                <>
                  new, after a copy<span className="es-shift__wide">; the old one, dashed, goes next turn</span>
                </>
              )}
            </span>
          </h3>
          {layout.old === null ? null : <Buffer buffer={layout.old} old selected={null} room={cellsRoom} />}
          <Buffer buffer={layout.buffer} selected={chosen?.address ?? null} onPick={(address) => onPick(flatAt(layout, address))} room={cellsRoom} />
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The grid of programs                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */


function GridDrawing({ grid, pick, onPick }: { grid: GridView; pick: ShiftPick | null; onPick: (pick: ShiftPick | null) => void }) {
  const [box, room] = useRoom(480)
  const [rows, cols] = [grid.shape[0] ?? 1, grid.shape[1] ?? 1]
  const drawn = grid.programs.length > 0
  const tallRows = drawn ? Math.max(rows, (grid.grid[0] ?? 1) * (grid.block[0] ?? 1)) : rows
  const wideCols = drawn ? Math.max(cols, (grid.grid[1] ?? 1) * (grid.block[1] ?? 1)) : cols
  const high = usePhone() ? CELLS_TALL_PHONE + 56 : CELLS_TALL
  const size = Math.max(4, Math.min(CELL_MAX, Math.floor(room / wideCols), Math.floor(high / tallRows)))
  const inHand = programAt(grid, pick)
  const root = useKeepDock()
  const covered = new Set<string>()
  for (const program of grid.programs) for (const cell of program.cells) covered.add(cell.join())
  const cells: ReactNode[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cells.push(<span key={`${r}-${c}`} className="es-shift__cell" data-tensor="" data-uncovered={drawn && !covered.has(`${r},${c}`) ? '' : undefined} style={{ left: c * size, top: r * size }} />)
  const lanes: ReactNode[] = []
  const tiles = grid.programs.map((program, at) => {
    const top = (program.index[0] ?? 0) * (grid.block[0] ?? 1)
    const left = (program.index[1] ?? 0) * (grid.block[1] ?? 1)
    for (let r = top; r < top + (grid.block[0] ?? 1); r++)
      for (let c = left; c < left + (grid.block[1] ?? 1); c++) if (r >= rows || c >= cols) lanes.push(<span key={`m-${r}-${c}`} className="es-shift__lane" style={{ left: c * size, top: r * size }} />)
    return (
      <span
        key={program.index.join()}
        className="es-shift__tile"
        data-program={program.index.join(',')}
        data-in-hand={at === inHand || undefined}
        style={{ left: left * size, top: top * size, width: (grid.block[1] ?? 1) * size, height: (grid.block[0] ?? 1) * size }}
        onClick={() => onPick({ kind: 'program', at })}
      >
        {/* A tile too narrow for its index names it in the table only. */}
        {(grid.block[1] ?? 1) * size >= 44 ? <span className="es-shift__tile-tag">{programLabel(program.index)}</span> : null}
      </span>
    )
  })
  return (
    <div ref={root} className="es-shift" data-shift-view="grid" data-callout-after="">
      <div className="es-shift__side">
        <section className="es-shift__table" aria-label="The launch" data-shift-launch="">
          <h3 className="es-shift__label">
            <PartName id="tensor" />
            <Marker word="now" className="es-shift__now" />
          </h3>
          <p className="es-shift__meta">
            shape <span className="font-numeric">{shapeText(grid.shape)}</span>
          </p>
          <p className="es-shift__meta">
            <PartName id="block" /> <span className="font-numeric">{tupleText(grid.block)}</span> · <PartName id="grid-size" />{' '}
            <span className="font-numeric">{tupleText(grid.grid)}</span>
          </p>
          <p className="es-shift__meta" data-shift-programs="">
            <PartName id="program">programs</PartName> {n(grid.programCount)} of at most {n(grid.cap)}
            {grid.programCount > grid.cap ? <span className="es-shift__count"> · too many to launch</span> : null}
          </p>
        </section>
      </div>
      <div className="es-shift__main" ref={box}>
        <section className="es-shift__cells-box" aria-label="Tensor and programs" data-shift-grid="">
          <h3 className="es-shift__label">
            <span>Tiles</span>
            <span className="es-shift__count">
              one program each; a lane past the edge is <PartName id="mask">masked</PartName>
            </span>
          </h3>
          <div className="es-shift__cells" style={{ width: wideCols * size, height: tallRows * size, '--es-cell': `${size}px` } as CSSProperties} aria-hidden="true" data-small={size < 14 || undefined}>
            {cells}
            {lanes}
            {tiles}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The diagram and its legend                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface DiagramProps {
  run: ShiftRun
  pick: ShiftPick | null
  onPick: (pick: ShiftPick | null) => void
}

export function View2D({ run, pick, onPick }: DiagramProps) {
  const { view } = run
  if (view.grid !== null) return <GridDrawing grid={view.grid} pick={pick} onPick={onPick} />
  if (view.layout === null) return null
  return <LayoutDrawing layout={view.layout} pick={pick?.kind === 'element' ? pick.flat : null} onPick={(flat) => onPick(flat === null ? null : { kind: 'element', flat })} />
}

/** The legend under the diagram: the states a cell takes on this level, by colour and pattern, and the line's ends. */
export function ShiftLegend({ view }: { view: ShiftView }) {
  if (view.grid !== null) {
    const entries: LegendEntry[] = [
      { slot: 'blue', word: 'an element, covered' },
      { slot: 'white', word: 'a masked lane, past the edge' },
      { slot: 'yellow', word: 'not covered' },
    ]
    return (
      <div className="es-shift__legend" data-shift-legend="">
        <Legend entries={entries} label="Legend: the grid" />
        <p className="es-shift__key">An outline is one program&apos;s tile, with its index.</p>
      </div>
    )
  }
  const entries: LegendEntry[] = [
    { slot: 'blue', word: 'an element' },
    { slot: 'white', word: 'an address not read' },
    ...(view.level === 'stride-zero' ? [{ slot: 'brown' as const, word: 'read by several, stride 0' }] : []),
    { slot: 'yellow', word: 'not where the target puts it' },
    { slot: 'red', word: 'where the stride order jumps' },
  ]
  return (
    <div className="es-shift__legend" data-shift-legend="">
      <Legend entries={entries} label="Legend: a tensor" />
      <p className="es-shift__key">
        <Glyph shape="circle" className="es-shift__key-dot" /> The line runs from its dot to its arrow in address order. A dashed buffer is the old one, for one turn after a copy.
      </p>
    </div>
  )
}
