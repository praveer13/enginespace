import { useId } from 'react'
import type { KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import type { NumberTag } from '@/design/components/Readout'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { CATEGORY_WORDS, LABEL_MAX, overlaps, unaccountedNs } from './marks'
import type { Annotations } from './marks'
import { spanName, stepOfWindow } from './model'
import type { TraceIndex } from './model'
import { SlotGlyph } from './SlotGlyph'
import type { Command, TapeState } from './state'
import { slotOfCategory } from './words'

/*
 * The marks ticket (GAMES.md §2.6, The Tape): every mark the learner has stuck on the tape, in time order, with its category, its
 * edges and its length in ns, and the label field for the mark being made or the one chosen. The counter on top is the tape's
 * "unaccounted ns" for the step the window is on: the length of the step that no tagged mark covers. It only subtracts what the
 * learner has marked, so it tells nothing of the true partition.
 *
 * A mark is chosen with the button in its first cell; the label field, the tag plates and Remove then act on it. Nothing here is
 * saved: a practice mark writes nothing to the ledger (A§1 I2), and the host takes the marks through `onChange`.
 */

export interface MarksTicketProps {
  index: TraceIndex
  state: TapeState
  readOnly: boolean
  tag: NumberTag
  source?: string
  /** The id of the label field, which `L` focuses. */
  labelId: string
  dispatch: (command: Command) => void
  /** Called when the label field is left with Enter or Escape: focus goes back to the tape. */
  onLabelDone: () => void
}

export function MarksTicket({ index, state, readOnly, tag, source, labelId, dispatch, onLabelDone }: MarksTicketProps) {
  const captionId = useId()
  const notes: Annotations = state.notes
  const marks = [...notes.marks].sort((a, b) => a.fromNs - b.fromNs || a.id - b.id)
  const counted = stepOfWindow(index, state.win)
  const open = unaccountedNs(notes.marks, counted)
  const crossings = overlaps(notes.marks)
  const target = state.pending !== null ? 'pending' : state.active !== null ? `mark-${state.active}` : null
  const current = state.pending !== null ? state.pending.label : (notes.marks.find((m) => m.id === state.active)?.label ?? '')

  function onLabelKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    event.preventDefault()
    // Escape in a text field is the field's own: it leaves the field and keeps the words.
    onLabelDone()
  }

  return (
    <Ticket as="section" width="full" hole={false} head="Marks" foot={[readOnly ? 'This tape is for reading' : 'Practice: nothing here is saved']} className="es-trace__marks" data-trace-marks="">
      <p data-marks-summary="" className="flex flex-wrap items-baseline gap-x-2">
        <span>
          {marks.length === 0 ? 'No marks yet.' : marks.length === 1 ? '1 mark.' : `${marks.length} marks.`}
        </span>
        <span>Unaccounted in this step:</span>
        <Readout value={open} unit="ns" tag={tag} source={source} size="sm" />
        <span>
          of <span className="font-numeric">{formatReadout(counted.toNs - counted.fromNs)}</span> ns
        </span>
      </p>
      {notes.cause === null ? null : (
        <p data-cause="">
          Cause named: <strong>{spanName(index, notes.cause)}</strong>
        </p>
      )}
      {crossings.length === 0 ? null : (
        <p className="flex items-start gap-2 text-paper-ink-2" role="status" data-overlaps="">
          <Icon name="alert" className="mt-1 shrink-0" />
          <span>
            {crossings
              .slice(0, 3)
              .map((c) => `Marks ${c.a} and ${c.b} overlap by ${formatReadout(c.ns)} ns`)
              .join('. ')}
            {crossings.length > 3 ? `, and ${crossings.length - 3} more` : ''}. A partition has none.
          </span>
        </p>
      )}
      {readOnly ? null : target === null ? (
        <p className="mt-3 text-text-2" data-label-hint="">
          Start a mark, or choose one below, to write words on its tape.
        </p>
      ) : (
        <div className="mt-3">
          <Field
            key={target}
            id={labelId}
            data-command="label"
            label="Label"
            hint={`Words for the tape, up to ${LABEL_MAX} letters. Enter leaves the field.`}
            defaultValue={current}
            maxLength={LABEL_MAX}
            autoComplete="off"
            onChange={(event) => dispatch({ t: 'label', text: event.currentTarget.value })}
            onKeyDown={onLabelKey}
          />
        </div>
      )}
      <div role="region" aria-labelledby={captionId} tabIndex={0} className="es-mirror__region mt-3">
        <table role="table" className="es-mirror__table w-full border-collapse text-left">
          <caption id={captionId} className="es-mirror__caption pb-2 text-left font-bold">
            Marks, in time order
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {['Mark', 'Category', 'From', 'To', 'Length'].map((name, at) => (
                <th key={name} scope="col" role="columnheader" className={clsx('border-b border-edge py-2 pr-4 font-bold', at >= 2 && 'text-right')}>
                  {at >= 2 ? (
                    <>
                      {name}
                      <span className="block text-sm font-normal text-text-2">ns, {tag}</span>
                    </>
                  ) : (
                    name
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {marks.length === 0 ? (
              <tr role="row" data-empty="">
                <td colSpan={5} className="py-3" role="cell">
                  Press M on an event edge, move to another edge, and press M again.
                </td>
              </tr>
            ) : (
              marks.map((mark) => {
                const active = mark.id === state.active
                return (
                  <tr key={mark.id} role="row" data-active={active || undefined} className="border-b border-paper-rule">
                    <th scope="row" role="rowheader" className={clsx('py-2 pr-4 text-left', active ? 'font-bold' : 'font-normal')}>
                      <button
                        type="button"
                        data-mark-button=""
                        data-mark={mark.id}
                        aria-pressed={active}
                        className={clsx('text-left underline underline-offset-4', active ? 'decoration-2' : 'decoration-1')}
                        onClick={() => dispatch({ t: 'activate', id: mark.id })}
                      >
                        {mark.label === '' ? `Mark ${mark.id}` : `Mark ${mark.id}: ${mark.label}`}
                      </button>
                    </th>
                    <td role="cell" data-label="Category" className="py-2 pr-4">
                      {mark.category === null ? (
                        <span className="text-text-2">not chosen</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <SlotGlyph slot={slotOfCategory(mark.category)} size="0.95em" />
                          {CATEGORY_WORDS[mark.category].term}
                        </span>
                      )}
                    </td>
                    <td role="cell" data-label="From, ns" className="py-2 pr-4 text-right">
                      <span className="font-numeric">{formatReadout(mark.fromNs)}</span>
                    </td>
                    <td role="cell" data-label="To, ns" className="py-2 pr-4 text-right">
                      <span className="font-numeric">{formatReadout(mark.toNs)}</span>
                    </td>
                    <td role="cell" data-label="Length, ns" className="py-2 pr-4 text-right">
                      <span className="font-numeric">{formatReadout(mark.toNs - mark.fromNs)}</span>
                    </td>
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
