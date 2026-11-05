import { useId, useMemo, type MouseEvent } from 'react'
import { sheetSvg } from '@es/play/broken-bench/layout'
import type { Sheet } from '@es/play/broken-bench/layout'
import { svgToReact } from './svg'

/*
 * A sheet of graph paper, pinned to the pass (GAMES.md §11 "2D design"): the drawing `layout.ts` makes, painted as SVG. The drawing holds
 * no number but the ticks of its ruler and an order's number; every count, time and flag is DOM, in the tail, the notes and the readout
 * under it, so the picture carries nothing that is only in the picture (D-021, GAMES.md §2.6 rule 7).
 *
 * A tap on an order's slip selects the order, as a tap on its line of the tape does (GAMES.md §11, "Controls"). The drawing is an image
 * to assistive technology and the tape is how a keyboard selects, so a slip is never the only way to select an order (A§6.8).
 */
export function Plot({ sheet, onSelect }: { sheet: Sheet; onSelect?: (order: number) => void }) {
  const id = `es-bench-pool-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const drawing = useMemo(() => svgToReact(sheetSvg(sheet, id)), [sheet, id])
  function tap(event: MouseEvent<HTMLDivElement>) {
    if (onSelect === undefined) return
    const order = (event.target as Element).closest('[data-row]')?.getAttribute('data-row')
    if (order !== null && order !== undefined) onSelect(Number(order))
  }
  return (
    <div className="es-bench-sheet" data-orientation={sheet.orientation} onClick={tap}>
      {drawing}
    </div>
  )
}
