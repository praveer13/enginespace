import { useState, type CSSProperties } from 'react'
import type { PoolView } from '@es/play/pool/types'
import type { DockViewProps } from '@/games/kit/RunContext'
import { ReadoutStrip } from './ReadoutStrip'
import { Cell, PagePick, PartName } from './View2D'
import { reqName } from './words'

/*
 * KV page pool's compact view, for a lesson's dock (REDESIGN §2.5, §3.4): the run beside the prose, drawn flat and always in 2D. It is the
 * same run as the instrument's (RunContext.tsx), so it draws the same view: the running batch as a line of slots, the page grid in the state
 * the learner left it, the free queue's count, and the readout strip. Each region's name opens its part's popover, and a page the pointer
 * selects opens the KV page's, as in the instrument. The decisions themselves stay in the instrument: the dock's Step takes the first
 * option the decision lists (`poolStep`, kit.tsx), and Undo and Reset are the run's own.
 */

/** The largest cell, by rows, at the dock's width [estimated]: the grid stays near 220 px tall. */
const cellMax = (rows: number): number => Math.max(12, Math.min(28, Math.floor(220 / rows)))

export function DockView({ run }: DockViewProps<PoolView>) {
  const { view } = run
  const [selected, setSelected] = useState<number | null>(null)
  const rows = Math.ceil(view.pans.length / view.cols)
  const free = view.rotation.filter((id) => view.pans[id].state === 'free').length
  const cached = view.rotation.length - free
  const slots = Array.from({ length: view.cap }, (_, at) => view.running[at] ?? null)
  return (
    <div className="es-pool es-pooldock" data-pool-dock="" style={{ '--es-cols': view.cols, '--es-cell-max': `${cellMax(rows)}px` } as CSSProperties}>
      <div className="es-pooldock__row">
        <p className="es-pool__label">
          <PartName id="batch" />{' '}
          <span className="es-pool__count">
            <span className="font-numeric">{view.running.length}</span> of <span className="font-numeric">{view.cap}</span> slots
          </span>
        </p>
        <ol className="es-pooldock__slots" aria-label="Running batch">
          {slots.map((id, at) =>
            id === null ? (
              <li key={`empty-${at}`} className="es-pooldock__slot" data-empty="">
                empty
              </li>
            ) : (
              <li key={id} className="es-pooldock__slot" data-req={id}>
                {reqName(id)}
              </li>
            ),
          )}
        </ol>
      </div>
      <div className="es-pooldock__grid-box" data-pool-dock-grid="">
        <p className="es-pool__label">
          <PartName id="pool" />{' '}
          <span className="es-pool__count">
            free <span className="font-numeric">{view.stock.bare}</span> · in use <span className="font-numeric">{view.stock.held}</span> · cached{' '}
            <span className="font-numeric">{view.stock.cached}</span>
          </span>
          <PagePick view={view} page={selected} onClose={() => setSelected(null)} />
        </p>
        <ol className="es-pool__grid" aria-hidden="true">
          {view.pans.map((page) => (
            <Cell key={page.id} page={page} view={view} chosen={false} pointed={false} onSelect={() => setSelected(page.id)} selected={selected === page.id} />
          ))}
        </ol>
      </div>
      <p className="es-pool__label">
        <PartName id="free-queue" />{' '}
        <span className="es-pool__count">
          <span className="font-numeric">{free}</span> free, then <span className="font-numeric">{cached}</span> cached
        </span>
      </p>
      <ReadoutStrip view={view} />
    </div>
  )
}
