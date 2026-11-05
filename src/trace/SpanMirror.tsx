import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Button } from '@/design/components/Button'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { mirrorGroups, ROWS_PER_LANE, ROWS_PER_LANE_ALL } from './mirror'
import { spanCat, spanName, styleName } from './model'
import type { Cursor, TraceIndex, Win } from './model'
import type { Command } from './state'
import { TABLE_KEYS } from './keys'
import { SlotGlyph } from './SlotGlyph'
import { LANE_WORDS, slotOfStyle, STYLE_WORDS } from './words'

/*
 * The mirror of the tape (ARCHITECTURE §6.9, GAMES.md §2.3): a DOM table of the spans in the window, a lane at a time, every figure
 * the canvas draws and none it does not. It is also the way to the cursor by keyboard and by screen reader. Its first cell is a
 * button, and the buttons are one tab stop: the arrows move among them, Home and End go to the ends, Page Up and Page Down go from
 * lane to lane, and each move puts the cursor on that span's start, so the lamp follows focus. `J` and `K` then walk its edges.
 *
 * The table sits on a ticket, as the kit's mirror does, and takes its responsive print from the same stylesheet: narrow, each row
 * prints as a block of its own, with each cell after its column's name.
 */

export interface SpanMirrorProps {
  index: TraceIndex
  /** The window the table lists. It may lag the tape's while the tape is being panned. */
  win: Win
  cursor: Cursor | null
  /** How the numbers are known: `synthetic`, or `measured`. The column heads say it once. */
  provenance: string
  dispatch: (command: Command) => void
}

const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

const head = (term: string, unit: string) => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

export function SpanMirror({ index, win, cursor, provenance, dispatch }: SpanMirrorProps) {
  const captionId = useId()
  // The lanes that have been asked to list every span they can, and not only the first few.
  const [all, setAll] = useState<ReadonlySet<number>>(new Set())
  const toggle = (lane: number) =>
    setAll((current) => {
      const next = new Set(current)
      if (next.has(lane)) next.delete(lane)
      else next.add(lane)
      return next
    })
  const groups = mirrorGroups(index, win, cursor, all)
  const listed = groups.reduce((total, group) => total + group.spans.length, 0)
  const touching = groups.reduce((total, group) => total + group.total, 0)

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
    const table = event.currentTarget.closest('table')
    const buttons = Array.from(table?.querySelectorAll<HTMLButtonElement>('button[data-row-button]') ?? [])
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0) return
    const lane = (button: HTMLButtonElement) => button.dataset.lane
    let next = -1
    if (event.key === 'ArrowDown') next = Math.min(at + 1, buttons.length - 1)
    else if (event.key === 'ArrowUp') next = Math.max(at - 1, 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else if (event.key === 'PageDown') next = buttons.findIndex((button, i) => i > at && lane(button) !== lane(buttons[at]))
    else if (event.key === 'PageUp') {
      const first = buttons.findIndex((button) => lane(button) === lane(buttons[at]))
      next = first > 0 ? buttons.findIndex((button) => lane(button) === lane(buttons[first - 1])) : 0
    } else return
    event.preventDefault()
    if (next < 0 || next === at) return
    buttons[next].focus()
    dispatch({ t: 'select', cursor: { span: Number(buttons[next].dataset.span), edge: 'start' } })
  }

  return (
    <Ticket as="section" width="full" hole={false} foot={['Mirror · the spans in the window']} className="es-mirror es-trace__spans" data-mirror="" data-trace-mirror="">
      <p data-mirror-summary="">
        {num(touching)} spans touch the window, in {num(groups.length)} lanes. The table lists {num(listed)}
        {touching > listed ? <>: the first {num(ROWS_PER_LANE)} of each lane, and a button under a lane lists more</> : null}. Every ns is {provenance}.
      </p>
      <div role="region" aria-labelledby={captionId} tabIndex={0} className="es-mirror__region mt-2">
        <table role="table" className="es-mirror__table w-full border-collapse text-left">
          <caption id={captionId} className="es-mirror__caption pb-2 text-left font-bold">
            Spans in the window, a lane at a time
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader" className="border-b border-edge py-2 pr-4 font-bold">
                Span
              </th>
              <th scope="col" role="columnheader" className="border-b border-edge py-2 pr-4 font-bold">
                Lane
              </th>
              <th scope="col" role="columnheader" className="border-b border-edge py-2 pr-4 font-bold">
                Kind
              </th>
              <th scope="col" role="columnheader" className="border-b border-edge py-2 pr-4 text-right font-bold">
                {head('Start', `ns, ${provenance}`)}
              </th>
              <th scope="col" role="columnheader" className="border-b border-edge py-2 pr-4 text-right font-bold">
                {head('Duration', `ns, ${provenance}`)}
              </th>
              <th scope="col" role="columnheader" className="border-b border-edge py-2 pr-4 text-right font-bold">
                Correlation
              </th>
            </tr>
          </thead>
          {groups.length === 0 ? (
            <tbody role="rowgroup">
              <tr role="row" data-empty="">
                <td colSpan={6} className="py-3" role="cell">
                  No span touches this window. Pan or zoom out to find the tape.
                </td>
              </tr>
            </tbody>
          ) : null}
          {groups.map((group) => (
            <tbody key={group.lane.index} role="rowgroup" data-native-keys={TABLE_KEYS} onKeyDown={onKeyDown}>
              <tr role="row" data-lane-row="">
                <th scope="rowgroup" colSpan={6} role="rowheader" className="es-trace__lane-row pt-4 pb-1 text-left">
                  {LANE_WORDS[group.lane.kind]} <span className="text-text-2">· {group.lane.name}</span>
                  <span className="text-text-2">
                    {' '}
                    · {num(group.total)} in the window
                  </span>
                </th>
              </tr>
              {group.spans.map((span) => {
                const here = cursor !== null && cursor.span === span
                const style = styleName(index, span)
                const startNs = index.trace.spans.startNs[span]
                const durNs = index.trace.spans.durNs[span]
                const corr = index.trace.spans.corr[span]
                return (
                  <tr
                    key={span}
                    role="row"
                    data-lamp={here || undefined}
                    data-cursor-row={here || undefined}
                    className={clsx('border-b border-paper-rule', here && 'bg-lamp text-paper-ink')}
                  >
                    <th scope="row" role="rowheader" className={clsx('py-2 pr-4 text-left', here ? 'font-bold' : 'font-normal')}>
                      <button
                        type="button"
                        data-row-button=""
                        data-span={span}
                        data-lane={group.lane.index}
                        aria-pressed={here}
                        tabIndex={here || (cursor === null && span === group.spans[0] && group === groups[0]) ? 0 : -1}
                        className="text-left underline decoration-1 underline-offset-4"
                        onClick={() => dispatch({ t: 'select', cursor: { span, edge: cursor !== null && cursor.span === span ? cursor.edge : 'start' } })}
                      >
                        {spanName(index, span)}
                        {here && cursor !== null ? <span className="sr-only">, cursor on its {cursor.edge}</span> : null}
                      </button>
                    </th>
                    <td role="cell" data-label="Lane" className="py-2 pr-4">
                      {group.lane.name}
                    </td>
                    <td role="cell" data-label="Kind" className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1">
                        <SlotGlyph slot={slotOfStyle(style)} size="0.95em" />
                        {STYLE_WORDS[style]}
                        {spanCat(index, span) !== STYLE_WORDS[style] ? <span className="text-text-2"> · {spanCat(index, span)}</span> : null}
                      </span>
                    </td>
                    <td role="cell" data-label="Start, ns" className="py-2 pr-4 text-right">
                      {num(startNs)}
                    </td>
                    <td role="cell" data-label="Duration, ns" className="py-2 pr-4 text-right">
                      {num(durNs)}
                    </td>
                    <td role="cell" data-label="Correlation" className="py-2 pr-4 text-right">
                      {corr < 0 ? <span className="text-text-2">none</span> : num(corr)}
                    </td>
                  </tr>
                )
              })}
              {group.total > ROWS_PER_LANE ? (
                <tr role="row" data-more="">
                  <td colSpan={6} role="cell" className="py-2">
                    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Button size="sm" aria-expanded={all.has(group.lane.index)} onClick={() => toggle(group.lane.index)}>
                        {all.has(group.lane.index) ? `List the first ${ROWS_PER_LANE} only` : `List ${Math.min(group.total, ROWS_PER_LANE_ALL)} spans of ${LANE_WORDS[group.lane.kind]}`}
                      </Button>
                      {all.has(group.lane.index) && group.total > ROWS_PER_LANE_ALL ? (
                        <span className="text-text-2">{num(group.total)} touch the window: zoom in to list the rest.</span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          ))}
        </table>
      </div>
    </Ticket>
  )
}
