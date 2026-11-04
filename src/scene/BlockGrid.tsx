import { useMemo } from 'react'
import { MarkInstances } from './MarkInstances'
import { cellBox, type CellDatum } from './marks'

/*
 * BlockGrid (ARCHITECTURE §6.4; GAMES.md §2.3, the cell and the rack): cells (a token, a slot-step, a page, a tensor
 * element) as one instanced mesh. Each cell's form carries its state besides its colour: solid, an open groove, hollow, or
 * marked. Positions come from a game's layout.ts, so the grid draws and decides nothing.
 */

export interface BlockGridProps {
  cells: readonly CellDatum[]
  onPick?: (id: string) => void
  name?: string
}

export function BlockGrid({ cells, onPick, name = 'cells' }: BlockGridProps) {
  const boxes = useMemo(() => cells.map(cellBox), [cells])
  return <MarkInstances boxes={boxes} onPick={onPick} name={name} />
}
