import clsx from 'clsx'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Ticket } from '@/design/components/Ticket'

/*
 * The mirror kit (ARCHITECTURE §6.9, GAMES.md §2.3): a DOM table of the whole state, with a summary line above it. The canvas and
 * the 2D view hold no fact the mirror does not, so a screen reader, a zoomed page and a phone read the same game. Column heads
 * are the engine's terms (GAMES.md §2.6, rule 2). A game's Mirror.tsx builds its rows from `view(state)` and passes its
 * numbers as Readouts, so every figure keeps its tag.
 *
 * The table sits on a ticket, the surface read text is printed on (D-047), with the ticket's name on its printed foot line. Where
 * the ticket is narrow, each row prints as a block of its own (components.css, "the mirror's table"): the row's header on a line,
 * then every cell under its column's name, so nothing is cut off at the paper's edge and nothing scrolls sideways (WCAG 1.4.10).
 * The table keeps its roles in both layouts, so a screen reader reads a table either way. With `onSelect`, a row's first cell is a button, and the buttons
 * form one tab stop that the arrow keys move along (roving tabindex), mirroring the selection a pointer makes in the scene.
 */

export interface MirrorColumn {
  /** The key of the cell in each row. The first column is the row's header. */
  key: string
  head: ReactNode
  /** The column's name as plain words, printed beside each cell when a row prints as a block. Default: `head` when it is text. */
  label?: string
  /** Numbers line up on the right. */
  numeric?: boolean
}

export interface MirrorRow {
  id: string
  cells: Readonly<Record<string, ReactNode>>
  /** Under the heat lamp: the row the next decision acts on. The lamp falls on the present and nowhere else. */
  lamp?: boolean
}

export interface MirrorTableProps {
  /** The id of the `<table>`, which a view's `aria-describedby` points at. */
  id?: string
  caption: ReactNode
  columns: readonly MirrorColumn[]
  rows: readonly MirrorRow[]
  /** The live summary line: the state in a sentence, above the table. */
  summary?: ReactNode
  /** The ticket's name, printed on its foot line. Default "Mirror". */
  head?: ReactNode
  /** What the table says before it has a row. */
  empty?: ReactNode
  selectedId?: string | null
  /** Makes each row's first cell a button that selects the row. */
  onSelect?: (id: string) => void
  className?: string
}

const MOVES: Readonly<Record<string, (index: number, last: number) => number>> = {
  ArrowDown: (index, last) => Math.min(index + 1, last),
  ArrowUp: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_, last) => last,
}

const labelOf = (column: MirrorColumn): string => column.label ?? (typeof column.head === 'string' ? column.head : column.key)

export function MirrorTable({ id, caption, columns, rows, summary, head = 'Mirror', empty = 'Nothing to list yet', selectedId = null, onSelect, className }: MirrorTableProps) {
  const captionId = useId()
  const [focused, setFocused] = useState<number | null>(null)
  // The one tab stop: the row a key or a click last reached, else the selected row, else the first.
  const stop = Math.min(focused ?? Math.max(rows.findIndex((row) => row.id === selectedId), 0), Math.max(rows.length - 1, 0))

  function onKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (!Object.hasOwn(MOVES, event.key) || event.ctrlKey || event.altKey || event.metaKey) return
    const move = MOVES[event.key]
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-row-button]')
    const at = Array.from(buttons).indexOf(event.target as HTMLButtonElement)
    if (at < 0) return
    event.preventDefault()
    const next = move(at, buttons.length - 1)
    setFocused(next)
    buttons[next]?.focus()
  }

  return (
    <Ticket as="section" width="full" hole={false} foot={[head]} className={clsx('es-mirror', className)} data-mirror="">
      {summary ? <p data-mirror-summary="">{summary}</p> : null}
      <div role="region" aria-labelledby={captionId} tabIndex={0} className="es-mirror__region mt-2">
        <table id={id} role="table" className="es-mirror__table w-full border-collapse text-left">
          <caption id={captionId} className="es-mirror__caption pb-2 text-left font-bold">
            {caption}
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={clsx('border-b border-edge py-2 pr-4 font-bold', column.numeric && 'text-right')} role="columnheader">
                  {column.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup" onKeyDown={onSelect ? onKeyDown : undefined} data-native-keys={onSelect ? 'ArrowUp ArrowDown Home End' : undefined}>
            {rows.length === 0 ? (
              <tr role="row" data-empty="">
                <td colSpan={columns.length} className="py-3" role="cell">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const selected = row.id === selectedId
                return (
                  <tr
                    key={row.id}
                    aria-current={selected ? 'true' : undefined}
                    data-selected={selected || undefined}
                    data-lamp={row.lamp || undefined}
                    className={clsx('border-b border-paper-rule', row.lamp && 'bg-lamp text-paper-ink')}
                    role="row"
                  >
                    {columns.map((column, position) => {
                      const content = row.cells[column.key] ?? null
                      const align = clsx('py-2 pr-4', column.numeric && 'text-right')
                      if (position > 0) {
                        return (
                          <td key={column.key} className={align} data-label={labelOf(column)} role="cell">
                            {content}
                          </td>
                        )
                      }
                      // The selected row is printed bold and underlined, the ribbon's own emphasis, never a stripe down its side.
                      return (
                        <th
                          key={column.key}
                          scope="row"
                          className={clsx(align, 'text-left', selected ? 'font-bold underline decoration-2 underline-offset-4' : 'font-normal')}
                          role="rowheader"
                        >
                          {onSelect ? (
                            <button
                              type="button"
                              data-row-button=""
                              aria-pressed={selected}
                              tabIndex={index === stop ? 0 : -1}
                              onClick={() => {
                                setFocused(index)
                                onSelect(row.id)
                              }}
                              className="text-left underline decoration-1 underline-offset-4"
                            >
                              {content}
                            </button>
                          ) : (
                            content
                          )}
                        </th>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Ticket>
  )
}
