import { useMemo } from 'react'
import { MarkInstances, type MarkMaterial } from './MarkInstances'
import { spanBox, type SpanDatum } from './marks'
import { useTrack } from './track'

/*
 * SpanInstances (ARCHITECTURE §6.4; GAMES.md §2.3, the slab, the comb and the lane): spans of time on lanes, as slabs of
 * one instanced mesh. Inside a TimeTrack it places each span on the track's clock; elsewhere `unitsPerTime` does.
 */

export interface SpanInstancesProps {
  spans: readonly SpanDatum[]
  /** Scene units per unit of time. Default: the TimeTrack's. */
  unitsPerTime?: number
  onPick?: (id: string) => void
  name?: string
  /** What the slabs are made of (MarkInstances): the code's marks by default, or the pass's steel. */
  material?: MarkMaterial
}

export function SpanInstances({ spans, unitsPerTime, onPick, name = 'spans', material }: SpanInstancesProps) {
  const track = useTrack()
  const scale = unitsPerTime ?? track?.unitsPerTime ?? 1
  const boxes = useMemo(() => spans.map((span) => spanBox(span, { unitsPerTime: scale })), [spans, scale])
  return <MarkInstances boxes={boxes} onPick={onPick} name={name} material={material} />
}
