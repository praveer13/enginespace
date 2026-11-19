import { lazy, Suspense, useId, useMemo, type ReactNode } from 'react'
import { COORDINATED_OMISSION } from '@es/play/broken-bench/copy'
import { latencyUs } from '@es/play/broken-bench/desk'
import { layoutHistogram, layoutTimeline, orderNo } from '@es/play/broken-bench/layout'
import type { BenchTab, SceneView } from '@es/play/broken-bench/types'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Marker } from '@/design/components/Marker'
import { Toggle } from '@/design/components/Toggle'
import { formatReadout } from '@/design/format'
import type { DeskApi } from './desk'
import { LOG_ROWS, logStart } from './desk'
import { DueMark, SentMark } from './Marks'
import { Plot } from './Plot'
import { Claim, Setup } from './Report'
import type { BenchRun } from './types'
import { useOrientation } from './useOrientation'

/*
 * Broken benchmark's 2D view (GAMES.md §11 "2D design", REDESIGN §3.5): the latency histogram on a logarithmic axis and the log's timeline,
 * with the switch and the cut over the chart they change, and the report on trial beside it. One of three sheets lies at a time: `histogram`
 * is the whole log in one picture, `timeline` is a stretch of it, and `rows` is the log itself, a line for each request. The sheets all draw
 * the same case and the same selected request, which is the present and carries the marker (amber).
 *
 * The switch is the game's first move to feel: it counts each request from its send time or from its due time, and the histogram, the
 * flags and the readout answer at once. It changes the view and files nothing, so it is not an action of the session; the page holds it
 * with the desk (desk.ts). Where the p99 moves when it is flipped to the due time in practice, the moment is named once (REDESIGN §3.5).
 *
 * The drawings hold no number but the ticks of a ruler; the times, counts and flags are DOM, in the readout, the report and the log. In a
 * graded attempt the live p99 is hidden (ASSESSMENT §4.3): the desk still times and counts, but nothing says where the p99 sits.
 */

// The log loads when its sheet is chosen. It is handed the game's own tools, since a lazy chunk that imported them would take the game's entry
// from the manifest (verify:bundle).
const Log = lazy(() => import('./Log'))
const LOG_TOOLS = { latencyUs, orderNo, LOG_ROWS, logStart, useOrientation, DueMark, SentMark }

const SHEET_NAMES: Readonly<Record<BenchTab, string>> = { rows: 'Log', timeline: 'Timeline', histogram: 'Histogram' }
/** The order the sheets are offered in: the whole log first, then a stretch of it, then the log's own lines. */
const ORDER: readonly BenchTab[] = ['histogram', 'timeline', 'rows']

const ms = (us: number) => <span className="font-numeric">{formatReadout(us / 1000, 1)}</span>

function RequestTimes({ scene, desk }: { scene: SceneView; desk: DeskApi }) {
  const row = desk.selected === null ? null : scene.rows[desk.selected]
  if (row === undefined || row === null) {
    return null
  }
  return (
    <dl className="es-bench-request" data-order={row.id} aria-label={`Request ${orderNo(row.id)}, selected, in milliseconds from the start of the run`}>
      <div className="es-bench-request__name">
        <dt className="sr-only">Selected</dt>
        <dd>
          <Marker word="selected" />
          <strong>Request {orderNo(row.id)}</strong>
        </dd>
      </div>
      <div>
        <dt>
          <DueMark className="es-bench-glyph" /> due
        </dt>
        <dd>{ms(row.dueUs)}</dd>
      </div>
      <div>
        <dt>
          <SentMark className="es-bench-glyph" /> sent
        </dt>
        <dd>{ms(row.sentUs)}</dd>
      </div>
      <div>
        <dt>first token</dt>
        <dd>{ms(row.firstUs)}</dd>
      </div>
      <div>
        <dt>done</dt>
        <dd>{ms(row.doneUs)}</dd>
      </div>
    </dl>
  )
}

/** The switch, over the chart it changes. */
function Switch({ run, desk }: { run: BenchRun; desk: DeskApi }) {
  return (
    <div className="es-bench-switch" data-bench-switch="">
      <Toggle
        label="Latency from the due time"
        hint="Off counts each request from its send time."
        checked={desk.clock === 'due'}
        onCheckedChange={(on) => {
          desk.setClock(on ? 'due' : 'sent')
          run.announce(on ? 'Latency counts from the due time.' : 'Latency counts from the send time.')
        }}
      />
    </div>
  )
}

/** The warm-up cut, under the claim it is about. */
function Cut({ desk }: { desk: DeskApi }) {
  return (
    <div className="es-bench-cut" data-bench-cut="">
      <Field
        numeric
        label="Leave out the first"
        hint={<>The report left out {formatReadout(desk.harness.cut)} requests.</>}
        inputMode="numeric"
        autoComplete="off"
        defaultValue={String(desk.cut)}
        onChange={(event) => {
          const value = Number(event.target.value.replace(/[,\s]/g, ''))
          if (Number.isInteger(value) && value >= 0) desk.setCut(value)
        }}
      />
    </div>
  )
}

export interface View2DProps {
  run: BenchRun
  desk: DeskApi | null
  /** The coordinated-omission line, once it has been named in this level and while the switch is on the due time. */
  moment: string | null
  /** At a result, the report whose exhibits are drawn in place of the case. */
  exhibits: ReactNode
}

export function View2D({ run, desk, moment, exhibits }: View2DProps) {
  const { view } = run
  const orientation = useOrientation()
  const scene = view.scene
  const rows = scene?.rows
  const clock = desk?.clock
  const latencies = useMemo(() => (rows === undefined || clock === undefined ? [] : rows.map((row) => latencyUs(row, clock))), [rows, clock])
  const tabs = useId()

  if (scene === null || desk === null) {
    return (
      <div className="es-bench-board" data-bench-board="" data-done="">
        {exhibits}
      </div>
    )
  }

  const practice = run.mode === 'practice'
  const choose = (next: BenchTab) => {
    run.dispatch({ t: 'view', v: next })
    run.announce(`${SHEET_NAMES[next]} sheet.`)
  }

  return (
    <div className="es-bench-board" data-bench-board="" data-tab={view.tab} data-orientation={orientation} data-callout-after="">
      <div className="es-bench-claimbox">
        <Claim key={`claim-${view.caseNo}`} scene={scene} caseNo={view.caseNo} cases={view.cases} />
        <Cut key={`cut-${view.caseNo}`} desk={desk} />
        {moment === null ? null : (
          <p className="es-bench-moment" data-moment={COORDINATED_OMISSION.id} role="status">
            {moment}
          </p>
        )}
      </div>
      <div className="es-bench-chart">
        <div className="es-bench-chart__head">
          <Switch key={`switch-${view.caseNo}`} run={run} desk={desk} />
          <div role="group" aria-label="Sheet" className="es-bench-tabs" id={tabs}>
            {ORDER.map((tab) => (
              <Button key={tab} size="sm" variant={tab === view.tab ? 'ink' : 'plate'} aria-pressed={tab === view.tab} data-bench-tab={tab} onClick={() => choose(tab)}>
                {SHEET_NAMES[tab]}
              </Button>
            ))}
          </div>
        </div>
        <div className="es-bench-sheetbox" data-sheet={view.tab} data-callout-in="">
          {view.tab === 'rows' ? (
            <Suspense fallback={<p role="status">Reading the log…</p>}>
              <Log scene={scene} desk={desk} tools={LOG_TOOLS} />
            </Suspense>
          ) : null}
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
        <RequestTimes scene={scene} desk={desk} />
      </div>
      <div className="es-bench-setupbox">
        <Setup scene={scene} />
      </div>
    </div>
  )
}
