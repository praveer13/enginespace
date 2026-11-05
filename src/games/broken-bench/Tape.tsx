import clsx from 'clsx'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { latencyUs } from '@es/play/broken-bench/desk'
import { orderNo } from '@es/play/broken-bench/layout'
import type { SceneView } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'
import { TAPE_ORDERS, tapeStart, type DeskApi } from './desk'
import { useOrientation } from './useOrientation'
import { DueMark, SentMark } from './Marks'

/*
 * The stopwatch's log on the printer's tape (GAMES.md §11 "2D design": row tables; §2.6: "the log's rows are each order's times"): one
 * printed line for each order, in the order they came, with the time each was due, sent, answered and finished, and the time to first
 * token that the desk's stopwatch gives. The selected order is under the lamp: it is the present, and the only amber on the tape.
 *
 * The tape is a listbox with a roving tab stop, as the scene kit's lists are (A§6.9): arrows move the selection by an order, Page Up and
 * Page Down by ten, Home and End to the first order the desk measures and the last, and focus follows the selection. A log is a
 * thousand lines or more, so the tape prints a stretch of it around the selection, and the keys carry it along. The orders the cut
 * leaves out are printed in the quiet ink, with their reason in words for a screen reader.
 *
 * Times are milliseconds from the start of the run, in the printer's dots; the head of each column says so, and that they are synthetic.
 */

const KEYS: Readonly<Record<string, 'next' | 'previous' | 'first' | 'last' | { by: number }>> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  Home: 'first',
  End: 'last',
  PageDown: { by: 10 },
  PageUp: { by: -10 },
}

const ms = (us: number) => formatReadout(us / 1000, 1)

export function Tape({ scene, desk }: { scene: SceneView; desk: DeskApi }) {
  const { rows } = scene
  const size = TAPE_ORDERS[useOrientation()]
  const start = tapeStart(rows.length, desk.selected, desk.cut, size)
  const shown = rows.slice(start, start + size)
  const stop = desk.selected ?? shown[0]?.id ?? null
  const options = useRef(new Map<number, HTMLLIElement>())
  const follow = useRef(false)
  const noteId = useId()

  // A key moved the selection: focus goes to the order it now rests on, which the stretch has moved to hold.
  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    if (desk.selected !== null) options.current.get(desk.selected)?.focus({ preventScroll: true })
  }, [desk.selected])

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (Object.hasOwn(KEYS, event.key)) {
      event.preventDefault()
      event.stopPropagation()
      follow.current = true
      desk.move(KEYS[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      if (stop !== null) desk.select(stop)
    }
  }

  const head = desk.clock === 'due' ? 'from the due time' : 'from the send'
  return (
    <figure className="es-bench-tape" data-bench-tape="">
      <div className="es-bench-tape__housing" aria-hidden="true">
        <span className="es-bench-tape__slot" />
      </div>
      <div className="es-bench-tape__paper">
        <p id={noteId} className="sr-only">
          Times are in milliseconds from the start of the run, and synthetic. The arrow keys move the selected order, Page Up and Page Down move ten, and Home and End go to the first
          order the desk measures and the last.
        </p>
        <p className="es-bench-tape__heads" aria-hidden="true">
          <span>No.</span>
          <span>
            <DueMark /> due
          </span>
          <span>
            <SentMark /> sent
          </span>
          <span>first token</span>
          <span>done</span>
          <span>time to first token, {head}</span>
        </p>
        <ul
          role="listbox"
          aria-label="The stopwatch's log, one order to a line, in the order they came"
          aria-describedby={noteId}
          className="es-bench-tape__lines"
          onKeyDown={onKeyDown}
          data-native-keys="ArrowUp ArrowDown Home End PageUp PageDown"
        >
          {shown.map((row) => {
            const selected = desk.selected === row.id
            const left = row.id < desk.cut
            return (
              <li
                key={row.id}
                ref={(node) => {
                  if (node) options.current.set(row.id, node)
                  else options.current.delete(row.id)
                }}
                role="option"
                aria-selected={selected}
                aria-label={`Order ${orderNo(row.id)}: due ${ms(row.dueUs)}, sent ${ms(row.sentUs)}, first token ${ms(row.firstUs)}, done ${ms(row.doneUs)}; time to first token ${ms(latencyUs(row, desk.clock))} ${head}${left ? '; left out by the cut' : ''}`}
                tabIndex={row.id === stop ? 0 : -1}
                data-selected={selected || undefined}
                data-cut={left || undefined}
                data-order={row.id}
                className={clsx('es-bench-tape__line')}
                onClick={() => desk.select(row.id)}
              >
                <span aria-hidden="true" data-label="No.">
                  {orderNo(row.id)}
                </span>
                <span aria-hidden="true" data-label="due">
                  {ms(row.dueUs)}
                </span>
                <span aria-hidden="true" data-label="sent">
                  {ms(row.sentUs)}
                </span>
                <span aria-hidden="true" data-label="first">
                  {ms(row.firstUs)}
                </span>
                <span aria-hidden="true" data-label="done">
                  {ms(row.doneUs)}
                </span>
                <span aria-hidden="true" data-label="to first token">
                  {ms(latencyUs(row, desk.clock))}
                </span>
              </li>
            )
          })}
        </ul>
        <span className="es-bench-tape__tear" aria-hidden="true" />
      </div>
    </figure>
  )
}
