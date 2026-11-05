import { useEffect, useMemo, useRef } from 'react'
import { latencyUs } from '@es/play/broken-bench/desk'
import { layoutHistogram, layoutTimeline, orderNo } from '@es/play/broken-bench/layout'
import { TABS, type BenchTab, type SceneView } from '@es/play/broken-bench/types'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { Clipboard } from './Clipboard'
import type { DeskApi } from './desk'
import { DueMark, SentMark } from './Marks'
import { Plot } from './Plot'
import { Tape } from './Tape'
import type { BenchRun } from './types'
import { useOrientation } from './useOrientation'

/*
 * The Inspection's 2D view (GAMES.md §11 "2D design", §2.6 "The Inspection"): the evidence board. It opens on the task, and then the
 * pass, where one of three sheets lies at a time: `histogram` is the whole log in one picture, `timeline` is a stretch of it drawn on
 * graph paper, and `rows` is the stopwatch's log on the printer's tape. The sheets all draw the same case and the same selected order,
 * which is the present and carries the lamp. The inspector's clipboard, with the report on trial and its setup, stands beside the pass
 * on a wide screen (the mirror's column holds it, src/games/broken-bench/Mirror.tsx) and above it on a narrow one, where this view holds
 * it: the same form drawn twice and one of them shown, so that a phone reads the report before the evidence, as the task goes.
 *
 * It is a first-class rendering of the same kitchen and not a chart: paper, steel, tape and the printer's dots. The drawings hold no
 * number but the ticks of a ruler; the times, counts and flags are DOM here, in the controls and in the mirror's tail.
 *
 * In a graded attempt the live readouts are hidden (ASSESSMENT §4.3): the desk still times and counts, but nothing says where the p99
 * sits, and the learner finds it by counting down the tail.
 */

const SHEET_NAMES: Readonly<Record<BenchTab, string>> = { rows: 'Rows', timeline: 'Timeline', histogram: 'Histogram' }

/** What each sheet is, for the line under it. The engine's term leads (GAMES.md §2.6, rule 2). */
const SHEET_NOTES: Readonly<Record<BenchTab, string>> = {
  rows: "The stopwatch's log on the printer's tape, one order to a line. Select an order, and the other sheets follow it.",
  timeline:
    'A stretch of the log around the selected order, one slip to an order. The ribbon-red dashes are the wait between when an order was due and when it was sent, which a stopwatch started at the send never times.',
  histogram:
    'Every order, in the order they were due, higher for a longer time to first token, and the same orders counted into stacks. The ruler is logarithmic. A hollow dot is an order the cut leaves out.',
}

function OrderTimes({ scene, desk }: { scene: SceneView; desk: DeskApi }) {
  const row = desk.selected === null ? null : scene.rows[desk.selected]
  if (row === undefined || row === null) {
    return (
      <p className="es-bench-order" data-empty="">
        Select an order, on the tape or on a sheet, to read its four times.
      </p>
    )
  }
  const ms = (us: number) => <span className="font-numeric">{formatReadout(us / 1000, 1)}</span>
  return (
    <Ticket as="div" lamp compact hole={false} width="full" head={`Order ${orderNo(row.id)}`} meta="selected" className="es-bench-order" data-order={row.id}>
      <dl className="es-bench-order__times" aria-label={`Order ${orderNo(row.id)}, selected, in milliseconds from the start of the run`}>
        <div>
          <dt>
            <DueMark className="es-bench-glyph" /> Due
          </dt>
          <dd>{ms(row.dueUs)}</dd>
        </div>
        <div>
          <dt>
            <SentMark className="es-bench-glyph" /> Sent
          </dt>
          <dd>{ms(row.sentUs)}</dd>
        </div>
        <div>
          <dt>First token</dt>
          <dd>{ms(row.firstUs)}</dd>
        </div>
        <div>
          <dt>Done</dt>
          <dd>{ms(row.doneUs)}</dd>
        </div>
      </dl>
    </Ticket>
  )
}

export function View2D({ run, desk }: { run: BenchRun; desk: DeskApi | null }) {
  const { view } = run
  const orientation = useOrientation()
  const scene = view.scene
  const rows = scene?.rows
  const clock = desk?.clock
  const latencies = useMemo(() => (rows === undefined || clock === undefined ? [] : rows.map((row) => latencyUs(row, clock))), [rows, clock])

  // A new case is a new board: focus goes to its task, so a keyboard lands where the reading starts. The first render does not.
  const head = useRef<HTMLDivElement>(null)
  const shown = useRef(view.caseNo)
  useEffect(() => {
    if (shown.current === view.caseNo) return
    shown.current = view.caseNo
    head.current?.focus({ preventScroll: true })
  }, [view.caseNo])

  if (scene === null || desk === null) {
    return (
      <div className="es-bench-board" data-bench-board="" data-done="">
        <p className="es-bench-closed" role="status">
          The court has risen. Every ruling is filed, and the debrief reads them.
        </p>
      </div>
    )
  }

  const practice = run.mode === 'practice'
  const choose = (next: BenchTab) => {
    run.dispatch({ t: 'view', v: next })
    run.announce(`${SHEET_NAMES[next]} sheet.`)
  }

  return (
    <div className="es-bench-board" data-bench-board="" data-tab={view.tab} data-orientation={orientation}>
      <div ref={head} tabIndex={-1} role="group" className="es-bench-case" aria-label={view.cases === 1 ? view.title : `${view.title}, case ${view.caseNo} of ${view.cases}`}>
        <p className="es-bench-prompt">{view.prompt}</p>
        {view.cases > 1 ? (
          <p className="es-bench-progress" role="status">
            <TapeLabel size="sm" tilt="right">
              case {view.caseNo} of {view.cases}
            </TapeLabel>{' '}
            {view.filed === 0 ? 'none filed yet' : `${view.filed} filed`}
          </p>
        ) : null}
      </div>
      <Clipboard className="es-bench-clip--inline" scene={scene} caseNo={view.caseNo} cases={view.cases} />
      <div className="es-bench-pass">
        <div role="group" aria-label="Sheet" className="es-bench-tabs">
          {TABS.map((tab) => (
            <Button key={tab} size="sm" variant={tab === view.tab ? 'ink' : 'plate'} aria-pressed={tab === view.tab} onClick={() => choose(tab)}>
              {SHEET_NAMES[tab]}
            </Button>
          ))}
        </div>
        <div className="es-bench-sheetbox" data-sheet={view.tab}>
          {view.tab === 'rows' ? <Tape scene={scene} desk={desk} /> : null}
          {view.tab === 'timeline' ? <Plot sheet={layoutTimeline({ orientation, rows: scene.rows, selected: desk.selected })} onSelect={desk.select} /> : null}
          {view.tab === 'histogram' ? (
            <Plot
              sheet={layoutHistogram({
                orientation,
                latencies,
                cut: desk.cut,
                selected: desk.selected,
                claimUs: scene.claim.valueUs,
                p99Us: practice ? desk.reading.p99Us : null,
              })}
              onSelect={desk.select}
            />
          ) : null}
        </div>
        <p className="es-bench-sheetnote">{SHEET_NOTES[view.tab]}</p>
        {view.tab === 'histogram' ? (
          <p className="es-bench-flags" data-flags="">
            <span>
              Reported <Readout value={scene.claim.valueUs / 1000} digits={1} unit="ms" tag="synthetic" size="sm" />
            </span>
            {practice ? (
              <span>
                At the desk <Readout value={desk.reading.p99Us / 1000} digits={1} unit="ms" tag="synthetic" size="sm" />
              </span>
            ) : null}
            <span>
              Measured <Readout value={desk.reading.n} tag="synthetic" size="sm" /> orders
            </span>
          </p>
        ) : null}
        <OrderTimes scene={scene} desk={desk} />
      </div>
    </div>
  )
}
