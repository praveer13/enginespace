import { PrinterTape } from '@/design/components/PrinterTape'
import type { PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import type { NumberTag } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'
import { cursorNs, spanCat, spanName, styleName } from './model'
import type { Cursor, TraceIndex } from './model'
import { SlotGlyph } from './SlotGlyph'
import { LANE_WORDS, slotOfStyle, STYLE_WORDS } from './words'

/*
 * The cursor's readout strip: the event the cursor is on, one ruled row for each of its facts. The figures are Readouts in ns with the
 * trace's provenance, and nothing here is the true partition of the step, only what the trace says of one event.
 */

export interface CursorTapeProps {
  index: TraceIndex
  cursor: Cursor | null
  tag: NumberTag
  source?: string
}

export function CursorTape({ index, cursor, tag, source }: CursorTapeProps) {
  if (cursor === null) return <PrinterTape label="The event at the cursor" lines={[]} empty="No event at the cursor. The trace has none." />
  const span = cursor.span
  const lane = index.lanes[index.spanLane[span]]
  const style = styleName(index, span)
  const ns = (value: number) => <Readout value={value} unit="ns" tag={tag} source={source} size="sm" />
  const corr = index.trace.spans.corr[span]
  const lines: PrinterTapeLine[] = [
    {
      id: 'event',
      label: 'event',
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
          <SlotGlyph slot={slotOfStyle(style)} size="0.95em" />
          {spanName(index, span)}
        </span>
      ),
    },
    {
      id: 'lane',
      label: 'lane',
      value: (
        <span>
          {LANE_WORDS[lane.kind]} <span className="text-text-2">· {lane.name}</span>
        </span>
      ),
    },
    {
      id: 'kind',
      label: 'kind',
      value: (
        <span>
          {STYLE_WORDS[style]}
          {spanCat(index, span) !== STYLE_WORDS[style] ? <span className="text-text-2"> · {spanCat(index, span)}</span> : null}
        </span>
      ),
    },
    { id: 'cursor', label: cursor.edge === 'start' ? 'at its start' : 'at its end', value: ns(cursorNs(index, cursor)) },
    { id: 'duration', label: 'lasts', value: ns(index.trace.spans.durNs[span]) },
    { id: 'corr', label: 'correlation id', value: corr < 0 ? <span>none</span> : <span className="font-numeric">{formatReadout(corr)}</span> },
  ]
  return <PrinterTape label="The event at the cursor" lines={lines} />
}
