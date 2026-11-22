import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { programLabel, shapeText, tupleText } from '@es/play/shape-shifter/labels'
import type { GridView, LayoutView } from '@es/play/shape-shifter/view'
import type { ShiftPick, ShiftRun } from './types'

/*
 * Tensor views' state as a table (GAMES.md §4.1, "State as a table"; A§6.9): DOM tables that list everything the diagram shows, so a screen
 * reader, a zoomed page and a phone read what the cells, the line and the buffer show, and nothing is only in the picture. The shape and
 * stride table, then one row per element: its index, the address it reads and its number. On `grid`, one row per program: its index, its
 * lanes and its masked lanes. A row's first cell selects it, as a press on the drawing does, and the arrow keys move along the rows.
 */

const n = (value: number) => <span className="font-numeric">{value}</span>

const DIM_COLUMNS: readonly MirrorColumn[] = [
  { key: 'dim', head: 'Dimension' },
  { key: 'size', head: 'Size', numeric: true },
  { key: 'stride', head: 'Stride', numeric: true },
]

const ELEMENT_COLUMNS: readonly MirrorColumn[] = [
  { key: 'index', head: 'Index' },
  { key: 'address', head: 'Address', numeric: true },
  { key: 'element', head: 'Element', numeric: true },
  { key: 'note', head: 'Note' },
]

const TARGET_COLUMNS: readonly MirrorColumn[] = [
  { key: 'index', head: 'Index' },
  { key: 'element', head: 'Element', numeric: true },
]

/** The index of the element at `flat` in a tensor of `shape`, in row-major order. */
function indexAt(shape: readonly number[], flat: number): number[] {
  const index: number[] = []
  let rest = flat
  for (let d = shape.length - 1; d >= 0; d--) {
    const size = shape[d] ?? 1
    index[d] = rest % size
    rest = Math.floor(rest / size)
  }
  return index
}

const PROGRAM_COLUMNS: readonly MirrorColumn[] = [
  { key: 'program', head: 'Program' },
  { key: 'lanes', head: 'Lanes', numeric: true },
  { key: 'masked', head: 'Masked lanes', numeric: true },
  { key: 'cells', head: 'Elements covered', numeric: true },
]

function noteOf(layout: LayoutView, flat: number): string {
  const cell = layout.cells[flat]
  const words: string[] = []
  if (cell.shared) words.push('reads an address others read too (stride 0)')
  if (cell.marked) words.push('not where the target puts it')
  if (layout.jump !== null && flat === layout.jump) words.push('the stride order jumps here')
  return words.join('; ')
}

function LayoutMirror({ id, layout, pick, onPick }: { id: string; layout: LayoutView; pick: ShiftPick | null; onPick: (pick: ShiftPick | null) => void }) {
  const shape = layout.table.map((row) => row.size)
  const strides = layout.table.map((row) => row.stride)
  const dimRows: MirrorRow[] = layout.table.map((row) => ({ id: `dim-${row.dim}`, cells: { dim: n(row.dim), size: n(row.size), stride: n(row.stride) } }))
  const elementRows: MirrorRow[] = layout.cells.map((cell) => ({
    id: `element-${cell.flat}`,
    cells: { index: <span className="font-numeric">{tupleText(cell.index)}</span>, address: n(cell.address), element: n(cell.element), note: noteOf(layout, cell.flat) },
  }))
  const old = layout.old
  return (
    <>
      <MirrorTable
        id={id}
        head="Shape and strides"
        caption="The tensor now: each dimension's size and stride, in elements"
        summary={
          <>
            Shape <span className="font-numeric">{tupleText(shape)}</span>, strides <span className="font-numeric">{tupleText(strides)}</span>, offset {n(layout.offset)},{' '}
            {layout.contiguous ? 'contiguous' : 'not contiguous'}. Copies {n(layout.readouts.copies)}, elements moved {n(layout.readouts.moved)}, operations {n(layout.readouts.operations)}.
            Target: shape <span className="font-numeric">{shapeText(layout.target.shape)}</span>, contiguous {layout.target.contiguous ? 'required' : 'not required'},{' '}
            {n(layout.target.inPlace)} of {n(layout.target.of)} elements in place{layout.target.met ? ', reached' : ''}. The buffer holds addresses {n(layout.buffer.first)} to{' '}
            {n(layout.buffer.first + layout.buffer.cells.length - 1)}
            {old === null ? '' : '; a copy wrote it this turn, and the old buffer is shown dashed over it'}. Every figure is the course&apos;s model.
          </>
        }
        columns={DIM_COLUMNS}
        rows={dimRows}
      />
      <MirrorTable
        head="Elements"
        caption="Every element in logical order: its index, the address it reads, and its number, the address it had in the start's buffer"
        columns={ELEMENT_COLUMNS}
        rows={elementRows}
        selectedId={pick?.kind === 'element' ? `element-${pick.flat}` : null}
        onSelect={(row) => {
          const flat = Number(row.slice('element-'.length))
          onPick(pick?.kind === 'element' && pick.flat === flat ? null : { kind: 'element', flat })
        }}
      />
      <MirrorTable
        head="Target"
        caption="The target's elements in logical order: the index each one has in the target, and its number"
        columns={TARGET_COLUMNS}
        rows={layout.target.elements.map((element, flat) => ({
          id: `target-${flat}`,
          cells: { index: <span className="font-numeric">{tupleText(indexAt(layout.target.shape, flat))}</span>, element: n(element) },
        }))}
      />
    </>
  )
}

function GridMirror({ id, grid, pick, onPick }: { id: string; grid: GridView; pick: ShiftPick | null; onPick: (pick: ShiftPick | null) => void }) {
  const rows: MirrorRow[] = grid.programs.map((program, at) => ({
    id: `program-${at}`,
    cells: { program: <span className="font-numeric">{programLabel(program.index)}</span>, lanes: n(program.lanes), masked: n(program.masked), cells: n(program.cells.length) },
  }))
  const r = grid.readouts
  return (
    <MirrorTable
      id={id}
      head="Programs"
      caption="Every program of the grid as it is set: its index, its lanes and the lanes its mask turns off"
      summary={
        <>
          Tensor <span className="font-numeric">{shapeText(grid.shape)}</span>. BLOCK <span className="font-numeric">{tupleText(grid.block)}</span>, grid{' '}
          <span className="font-numeric">{tupleText(grid.grid)}</span>: {n(grid.programCount)} programs, at most {n(grid.cap)}.
          {grid.readoutsShown ? (
            <>
              {' '}
              Lanes {n(r.lanes)}, masked {n(r.masked)}, covered {n(r.covered)} of {n(r.of)}.
            </>
          ) : (
            ' A graded run shows the counts after Launch.'
          )}{' '}
          Every figure is the course&apos;s model.
        </>
      }
      columns={PROGRAM_COLUMNS}
      rows={grid.readoutsShown ? rows : rows.map((row) => ({ ...row, cells: { ...row.cells, masked: '–', cells: '–' } }))}
      empty={grid.programCount > grid.cap ? 'More programs than the level allows: none is drawn.' : 'No program yet.'}
      selectedId={pick?.kind === 'program' ? `program-${pick.at}` : null}
      onSelect={(row) => onPick({ kind: 'program', at: Number(row.slice('program-'.length)) })}
    />
  )
}

export function Mirror({ run, pick, onPick }: { run: ShiftRun; pick: ShiftPick | null; onPick: (pick: ShiftPick | null) => void }) {
  const { view } = run
  if (view.grid !== null) return <GridMirror id={run.mirrorId} grid={view.grid} pick={pick} onPick={onPick} />
  if (view.layout === null) return null
  return <LayoutMirror id={run.mirrorId} layout={view.layout} pick={pick} onPick={onPick} />
}
