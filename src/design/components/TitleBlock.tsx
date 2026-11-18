import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Popover } from './Popover'
import '../parts.css'

/*
 * The title block: one quiet line under an instrument that says what the drawing is, as an engineering drawing's corner does
 * (REDESIGN 2.6 and 2.8). What it is a model of, its clock, and "What this model leaves out", which opens the model's full card in
 * a wide sheet. The card is never inlined into the page.
 */

export interface TitleBlockProps {
  /** "Model of the KV page pool: one pool, pages of one size, no network". */
  model: ReactNode
  /** "Clock: synthetic ticks". */
  clock?: ReactNode
  /** The model's full card: what it leaves out, and why. */
  leavesOut?: ReactNode
  className?: string
}

export function TitleBlock({ model, clock, leavesOut, className }: TitleBlockProps) {
  return (
    <div className={clsx('es-titleblock', className)}>
      <span className="es-titleblock__model">{model}</span>
      {clock ? <span className="es-titleblock__clock">{clock}</span> : null}
      {leavesOut ? (
        <Popover variant="quiet" width="wide" title="What this model leaves out" trigger="What this model leaves out">
          {leavesOut}
        </Popover>
      ) : null}
    </div>
  )
}
