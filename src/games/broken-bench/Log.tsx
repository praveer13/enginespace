import clsx from 'clsx'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import type { ComponentType } from 'react'
import type { latencyUs as latency } from '@es/play/broken-bench/desk'
import type { Orientation, orderNo as order } from '@es/play/broken-bench/layout'
import type { SceneView } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'
import './log.css'
import type { DeskApi, LOG_ROWS as rowsOf, logStart as startOf } from './desk'

/*
 * The log (GAMES.md §11 "2D design": row tables; §2.6: "the log's rows are each request's times"): one line for each request, in the order
 * they came, with the time each was due, sent, answered and finished, and the time to first token that the switch's clock gives. The selected
 * request is the present, and the only amber in the log.
 *
 * The log is a listbox with a roving tab stop, as the scene kit's lists are (A§6.9): arrows move the selection by a request, Page Up and
 * Page Down by ten, Home and End to the first request the cut measures and the last, and focus follows the selection. A log is a thousand
 * lines or more, so the list shows a stretch of it around the selection, and the keys carry it along. The requests the cut leaves out are
 * in the quiet ink, with their reason in words for a screen reader.
 *
 * Times are milliseconds from the start of the run; the head of each column says so, and that they are synthetic.
 *
 * It loads when the Log sheet is chosen, and not before. It is handed the game's own tools (`LogTools`) and imports none of the game's
 * modules: a lazy chunk that imported them would take the game's own entry from the manifest (verify:bundle).
 */

/** What the game hands the log: the desk's arithmetic, the orientation, and the two ticks. */
export interface LogTools {
  latencyUs: typeof latency
  orderNo: typeof order
  LOG_ROWS: typeof rowsOf
  logStart: typeof startOf
  useOrientation: () => Orientation
  DueMark: ComponentType<{ className?: string }>
  SentMark: ComponentType<{ className?: string }>
}

const KEYS: Readonly<Record<string, 'next' | 'previous' | 'first' | 'last' | { by: number }>> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  Home: 'first',
  End: 'last',
  PageDown: { by: 10 },
  PageUp: { by: -10 },
}

const ms = (us: number) => formatReadout(us / 1000, 1)

export default function Log({ scene, desk, tools }: { scene: SceneView; desk: DeskApi; tools: LogTools }) {
  const { latencyUs, orderNo, LOG_ROWS, logStart, useOrientation, DueMark, SentMark } = tools
  const { rows } = scene
  const size = LOG_ROWS[useOrientation()]
  const start = logStart(rows.length, desk.selected, desk.cut, size)
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

  const head = desk.clock === 'due' ? 'from the due time' : 'from the send time'
  return (
    <figure className="es-bench-log" data-bench-log="">
      <div className="es-bench-log__paper">
        <p id={noteId} className="sr-only">
          Times are in milliseconds from the start of the run, and synthetic. The arrow keys move the selected request, Page Up and Page Down move ten, and Home and End go to the first
          request the cut measures and the last.
        </p>
        <p className="es-bench-log__heads" aria-hidden="true">
          <span>No.</span>
          <span>
            <DueMark /> due
          </span>
          <span>
            <SentMark /> sent
          </span>
          <span>first token</span>
          <span>done</span>
          <span>to first token, {head}</span>
        </p>
        <ul
          role="listbox"
          aria-label="The log, one request to a line, in the order they came"
          aria-describedby={noteId}
          className="es-bench-log__lines"
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
                aria-label={`Request ${orderNo(row.id)}: due ${ms(row.dueUs)}, sent ${ms(row.sentUs)}, first token ${ms(row.firstUs)}, done ${ms(row.doneUs)}; time to first token ${ms(latencyUs(row, desk.clock))} ${head}${left ? '; left out by the cut' : ''}`}
                tabIndex={row.id === stop ? 0 : -1}
                data-selected={selected || undefined}
                data-cut={left || undefined}
                data-order={row.id}
                className={clsx('es-bench-log__line')}
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
      </div>
    </figure>
  )
}
