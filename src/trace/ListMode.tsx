import { useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { EsTrace } from '@es/sim/trace'
import { busyIndex } from '@es/sim/trace/busy'
import { Button } from '@/design/components/Button'
import { formatReadout } from '@/design/format'
import { DEFAULT_SETTINGS } from '@/settings/model'
import { settingsStore } from '@/settings/store'
import { causeActions, causeSpans, pickActions, sides, stretchCategories, stretches } from './list'
import type { ListAction, Side, Stretch } from './list'
import { CATEGORIES, CATEGORY_WORDS, unaccountedNs } from './marks'
import type { Annotations, Category } from './marks'
import { buildIndex, spanEnd, spanName, spanStart } from './model'
import type { TraceIndex } from './model'
import { provenanceOf } from './provenance'
import { SlotGlyph } from './SlotGlyph'
import { LANE_WORDS, slotOfCategory } from './words'
import './list.css'

/*
 * The trace as a list, for a phone (GAMES.md §6 "Controls"; TR3's design, item 10; ASSESSMENT §4.3 counts it the same as the lanes).
 * At 390 px the lanes are 358 px wide, too narrow to read or mark, so below the narrow breakpoint a host shows a step as this table: one
 * row for each stretch between two edges where the GPU or the main thread changes what it does (list.ts), with what runs on each side
 * and four category radios, and under it the step's frames and calls in time order, each a radio for the cause.
 *
 * It holds no marks. They come in as `notes`, and a pick leaves as the session's actions (`mark`, `unmark`, `cause`) through `onActions`,
 * which the host applies (list.ts, `applyListActions`), so the same marks reach the same `trace-mark` event as the lanes write. Its own
 * state is the view only: the step it shows.
 *
 * Keys: Tab reaches each row's radios and the cause list, the arrows move among a group's radios and pick as they go, as radios do, and
 * `1` to `4` pick a category on the row that has focus, as they tag a mark on the lanes. A key held down picks once, and a step button
 * pressed twice within half a second moves one step.
 */

export interface ListModeProps {
  trace: EsTrace
  /** The trace's id. A different trace is a different list. */
  traceId: string
  /** The heading. Default: what the trace is, from its provenance. */
  title?: string
  /** The heading's level: 2 on its own page, 3 inside a section. */
  headingLevel?: 2 | 3
  /** The marks and the cause, as the host keeps them. */
  notes: Annotations
  /** Called with the actions a pick asks for, in the order they apply. */
  onActions: (actions: readonly ListAction[]) => void
  /** The step to open on, from 0. Default: the first. */
  initialStep?: number
}

/** A second press of a step button within this long is the same press [estimated]: DC-C's half a second. */
export const STEP_REPRESS_MS = 500

const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

function said(side: Side, none: string) {
  if (side.names.length === 0) return <span className="text-text-2">{none}</span>
  return (
    <>
      {side.names.map((name, at) => (
        <span key={name}>
          {at > 0 ? ', ' : null}
          <code className="es-type-mono">{name}</code>
        </span>
      ))}
      {side.more > 0 ? <> and {num(side.more)} more</> : null}
    </>
  )
}

/** Where a span starts, against the step's start: a frame may open before the step does. */
const when = (offsetNs: number) => (offsetNs < 0 ? <>{num(-offsetNs)} ns before the step</> : <>{num(offsetNs)} ns into the step</>)

/** The keys that pick on a radio: the arrows move the pick, Space makes it, and the digits name a category. Tab held down only moves focus. */
const PICKING_KEYS = /^(Arrow(Up|Down|Left|Right)|Space|Enter|NumpadEnter|Digit[1-4])$/

const GPU_NONE = 'nothing: the GPU is idle'
const CPU_NONE = 'nothing: the main thread is idle'

export function ListMode(props: ListModeProps) {
  return <List key={props.traceId} {...props} />
}

function List({ trace, title, headingLevel = 2, notes, onActions, initialStep = 0 }: ListModeProps) {
  const index = useMemo(() => buildIndex(trace), [trace])
  const busy = useMemo(() => busyIndex(trace), [trace])
  const provenance = useMemo(() => provenanceOf(trace.meta), [trace])
  const steps = index.steps
  const [step, setStep] = useState(() => Math.min(Math.max(0, initialStep), Math.max(0, steps.length - 1)))
  const lastStepPress = useRef(Number.NEGATIVE_INFINITY)
  const headingId = useId()
  const captionId = useId()
  const rowId = useId()
  const causeName = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, () => DEFAULT_SETTINGS)

  const win = steps[step]
  const rows = useMemo(() => (win === undefined ? [] : stretches(busy, win)), [busy, win])
  const sidesOf = useMemo(() => rows.map((row) => sides(index, row)), [index, rows])
  const causes = useMemo(() => (win === undefined ? [] : causeSpans(index, win)), [index, win])
  const picked = stretchCategories(rows, notes.marks)
  const done = picked.filter((category) => category !== null).length
  const unaccounted = win === undefined ? 0 : unaccountedNs(notes.marks, win)

  const pick = (row: number, category: Category) => {
    const actions = pickActions(rows, notes.marks, row, category)
    if (actions.length > 0) onActions(actions)
  }
  const name = (span: number | null) => {
    const actions = causeActions(notes, span)
    if (actions.length > 0) onActions(actions)
  }
  const go = (dir: 1 | -1) => {
    if ((dir < 0 && step === 0) || (dir > 0 && step === steps.length - 1)) return
    const now = performance.now()
    if (now - lastStepPress.current < STEP_REPRESS_MS) return
    lastStepPress.current = now
    setStep((at) => Math.min(Math.max(0, at + dir), steps.length - 1))
  }

  // A key held down picks once, and the digits pick a category on the row that has focus.
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    if (target.tagName !== 'INPUT' || event.ctrlKey || event.altKey || event.metaKey) return
    if (event.repeat && PICKING_KEYS.test(event.code)) {
      event.preventDefault()
      return
    }
    const digit = /^Digit([1-4])$/.exec(event.code)
    const row = target.getAttribute('data-row')
    if (digit === null || row === null || !settings.gameKeys || event.shiftKey) return
    event.preventDefault()
    const category = CATEGORIES[Number(digit[1]) - 1]
    pick(Number(row), category)
    target.closest('[role="radiogroup"]')?.querySelector<HTMLInputElement>(`input[value="${category}"]`)?.focus({ preventScroll: true })
  }

  return (
    <section className="es-tlist" aria-labelledby={headingId} tabIndex={-1} data-trace-list="" onKeyDown={onKeyDown}>
      <header className="es-tlist__head">
        <Heading id={headingId} className="es-type-heading">
          {title ?? (trace.meta.synthetic ? 'A synthetic trace' : 'A captured trace')}
        </Heading>
        <p className="es-type-body text-text-2">{provenance.line}</p>
      </header>
      {win === undefined ? (
        <p data-list-empty="">This trace has no step marks, so there is no step to list. The lanes show it whole.</p>
      ) : (
        <>
          <div className="es-tlist__steps" data-list-steps="">
            {/* Not disabled at the ends: a button that disables itself under the learner's finger drops focus to the page. */}
            <Button onClick={() => go(-1)} aria-disabled={step === 0 || undefined} data-list-step="prev">
              Previous step
            </Button>
            <p className="es-tlist__step" data-list-step-at="">
              Step {num(step + 1)} of {num(steps.length)}
              <span className="es-tlist__step-len">
                {num(win.toNs - win.fromNs)} ns long, {provenance.word}
              </span>
            </p>
            <Button onClick={() => go(1)} aria-disabled={step === steps.length - 1 || undefined} data-list-step="next">
              Next step
            </Button>
          </div>
          <p className="es-tlist__tally" data-list-tally="">
            <span>
              {num(done)} of {num(rows.length)} {rows.length === 1 ? 'stretch has' : 'stretches have'} a category.
            </span>{' '}
            <span>Unaccounted: {num(unaccounted)} ns of the step.</span>
          </p>
          <table role="table" className="es-tlist__table" aria-labelledby={captionId}>
            <caption id={captionId} className="es-tlist__caption">
              The step, a stretch at a time. A stretch ends where the GPU or the main thread starts or stops, or the GPU turns from a kernel to a copy. Every ns
              is {provenance.word}.
            </caption>
            <thead role="rowgroup" className="sr-only">
              <tr role="row">
                <th scope="col" role="columnheader">
                  Stretch
                </th>
                <th scope="col" role="columnheader">
                  On the GPU
                </th>
                <th scope="col" role="columnheader">
                  On the main thread
                </th>
                <th scope="col" role="columnheader">
                  Category
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((row: Stretch, at) => {
                const id = `${rowId}-${at}`
                const category = picked[at]
                return (
                  <tr key={`${row.fromNs}-${row.toNs}`} role="row" className="es-tlist__row" data-stretch={at} data-category={category ?? undefined}>
                    <th scope="row" role="rowheader" id={id} className="es-tlist__when">
                      <span className="es-tlist__n">Stretch {num(at + 1)}</span>{' '}
                      <span className="es-tlist__span">
                        {num(row.fromNs - win.fromNs)} ns into the step, {num(row.toNs - row.fromNs)} ns long
                      </span>
                    </th>
                    <td role="cell" className="es-tlist__side" data-side="gpu">
                      <span className="es-tlist__label">GPU</span> {said(sidesOf[at].gpu, GPU_NONE)}
                    </td>
                    <td role="cell" className="es-tlist__side" data-side="cpu">
                      <span className="es-tlist__label">Main thread</span> {said(sidesOf[at].cpu, CPU_NONE)}
                    </td>
                    <td role="cell" className="es-tlist__pick">
                      <div role="radiogroup" aria-labelledby={id} className="es-tlist__cats">
                        {CATEGORIES.map((c, n) => (
                          <label key={c} className="es-tlist__cat" data-cat={c} title={`${n + 1}: ${CATEGORY_WORDS[c].meaning}`}>
                            <input type="radio" name={id} value={c} data-row={at} checked={category === c} onChange={() => pick(at, c)} />
                            <SlotGlyph slot={slotOfCategory(c)} size="0.95em" />
                            <span>{CATEGORY_WORDS[c].term}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <fieldset className="es-tlist__cause" data-list-cause="">
            <legend className="es-tlist__legend">The cause</legend>
            <p className="es-tlist__hint">
              Which frame or call on the main thread left the GPU with nothing to run? The step’s frames and calls, in time order.
            </p>
            <label className="es-tlist__option">
              <input type="radio" name={causeName} value="" checked={notes.cause === null} onChange={() => name(null)} />
              <span>No cause named</span>
            </label>
            {causes.map((span) => (
              <CauseOption
                key={span}
                index={index}
                span={span}
                stepFrom={win.fromNs}
                group={causeName}
                checked={notes.cause === span}
                onPick={() => name(span)}
              />
            ))}
          </fieldset>
        </>
      )}
    </section>
  )
}

function CauseOption({
  index,
  span,
  stepFrom,
  group,
  checked,
  onPick,
}: {
  index: TraceIndex
  span: number
  stepFrom: number
  group: string
  checked: boolean
  onPick: () => void
}) {
  const lane = index.lanes[index.spanLane[span]]
  return (
    <label className="es-tlist__option" data-cause-span={span}>
      <input type="radio" name={group} value={span} checked={checked} onChange={onPick} />
      <span>
        <code className="es-type-mono">{spanName(index, span)}</code>
        <span className="es-tlist__span">
          {' '}
          · {LANE_WORDS[lane.kind]} · {when(spanStart(index, span) - stepFrom)}, {num(spanEnd(index, span) - spanStart(index, span))} ns long
        </span>
      </span>
    </label>
  )
}

export type TraceMode = 'list' | 'lanes'

/** The switch between the list and the lanes, on a phone: the list is the way to mark there, and the lanes are there to look at. */
export function TraceModes({ mode, onMode }: { mode: TraceMode; onMode: (mode: TraceMode) => void }) {
  return (
    <div role="group" aria-label="Show the trace as" className="es-tlist__modes" data-trace-modes="">
      <span className="es-tlist__modes-label" aria-hidden="true">
        Show as
      </span>
      <Button aria-pressed={mode === 'list'} onClick={() => onMode('list')} data-trace-mode="list">
        A list
      </Button>
      <Button aria-pressed={mode === 'lanes'} onClick={() => onMode('lanes')} data-trace-mode="lanes">
        Lanes
      </Button>
    </div>
  )
}
