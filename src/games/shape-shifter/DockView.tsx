import type { CSSProperties } from 'react'
import { programLabel, shapeText, tableLine, tupleText } from '@es/play/shape-shifter/labels'
import type { ShiftView } from '@es/play/shape-shifter/view'
import type { DockViewProps } from '@/games/kit/RunContext'
import { ReadoutStrip } from './ReadoutStrip'
import { cellsLayout } from './focus'
import { PartName } from './View2D'

/*
 * Tensor views' compact view, for a lesson's dock (GAMES.md §4.1, "DockView"; REDESIGN §2.5): the same run as the instrument's, drawn flat
 * in 464 x 240. The table as one line, then the cells and the buffer at 14 px a cell, which fits 64 elements; on `grid`, the tensor's cells
 * and the tiles. The operations themselves stay in the instrument; the dock's Undo and Reset are the run's own.
 */

const SMALL = 14

function LayoutDock({ view }: { view: ShiftView }) {
  const layout = view.layout
  if (layout === null) return null
  const shape = layout.table.map((row) => row.size)
  const box = cellsLayout(shape, 16 * SMALL + 200)
  const scale = SMALL / box.size
  return (
    <div className="es-shift es-shift-dockview" data-shift-dock="">
      <p className="es-shift__label">
        <PartName id="table" />{' '}
        <span className="es-shift__count font-numeric">
          {tableLine({ shape, strides: layout.table.map((row) => row.stride), offset: layout.offset })}
        </span>
      </p>
      <div className="es-shift__cells" style={{ width: box.width * scale, height: box.height * scale, '--es-cell': `${SMALL}px` } as CSSProperties} aria-hidden="true">
        {layout.cells.map((cell) => {
          const at = box.at[cell.flat] ?? { x: 0, y: 0 }
          return (
            <span key={cell.flat} className="es-shift__cell" style={{ left: at.x * scale, top: at.y * scale }} data-marked={cell.marked || undefined} data-shared={cell.shared || undefined}>
              {cell.element}
            </span>
          )
        })}
      </div>
      <p className="es-shift__label">
        <PartName id="buffer" />{' '}
        <span className="es-shift__count">
          target <span className="font-numeric">{shapeText(layout.target.shape)}</span>, <span className="font-numeric">{layout.target.inPlace}</span> of{' '}
          <span className="font-numeric">{layout.target.of}</span> in place
        </span>
      </p>
      <ol className="es-shift__buffer" style={{ '--es-addr': `${SMALL}px` } as CSSProperties} aria-hidden="true">
        <li className="es-shift__buffer-row">
          <span className="es-shift__addresses">
            {layout.buffer.cells.map((cell) => (
              <span key={cell.address} className="es-shift__addr" data-read={cell.element === null ? undefined : ''} data-shared={cell.reads > 1 || undefined}>
                {cell.element ?? ''}
              </span>
            ))}
          </span>
        </li>
      </ol>
      <ReadoutStrip view={view} />
    </div>
  )
}

function GridDock({ view }: { view: ShiftView }) {
  const grid = view.grid
  if (grid === null) return null
  return (
    <div className="es-shift es-shift-dockview" data-shift-dock="">
      <p className="es-shift__label">
        <PartName id="tensor" />{' '}
        <span className="es-shift__count">
          <span className="font-numeric">{shapeText(grid.shape)}</span> · BLOCK <span className="font-numeric">{tupleText(grid.block)}</span> · grid{' '}
          <span className="font-numeric">{tupleText(grid.grid)}</span>
        </span>
      </p>
      <p className="es-shift__count">
        {grid.programs.length === 0 ? 'No program drawn: more than the level allows.' : grid.programs.map((program) => programLabel(program.index)).join(' ')}
      </p>
      <ReadoutStrip view={view} />
    </div>
  )
}

export function DockView({ run }: DockViewProps<ShiftView>) {
  return run.view.grid !== null ? <GridDock view={run.view} /> : <LayoutDock view={run.view} />
}
