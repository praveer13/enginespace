import { Component, lazy, Suspense, useId, useMemo, type ReactNode } from 'react'
import { traceOf } from '@es/play/engine-floor/spans'
import { stageIn } from '@es/play/engine-floor/stages'
import type { FloorView, SpanCheckView, SpanRowView } from '@es/play/engine-floor/types'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { Code } from './Code'
import { HandoffGlyph } from './HandoffGlyph'
import { handoffWords } from './text'

/*
 * The graded map against its tape (GAMES.md §5 "Scoring and pass"; ASSESSMENT §4.3, §4.4): once the one run has been judged, the stages the
 * learner laid are read against the stage spans of the scenario's lifecycle trace, in order (`spanCheck`), and the trace itself is on the
 * page in the trace viewer. This is the table of that reading, a row for each laid stage, and the tape under it.
 *
 * The tape is synthetic: the lifecycle model writes the path out with made-up durations, and the viewer and every figure here say so.
 * Nothing is shown before the run is judged, because the spans are named for the stages in the engine's order, which is the answer.
 *
 * The viewer is a lazy chunk. It is a whole instrument of its own, and a learner who does not open the debrief of a graded run should not
 * have downloaded it; the route's budget (verify:bundle) counts only what the page imports statically.
 */

const TraceView = lazy(() => import('@/trace/TraceView').then((module) => ({ default: module.TraceView })))

/**
 * Catches the viewer's chunk failing to load (an old tab after a deploy, a network that dropped): the table above is the whole check, and
 * the debrief must not be replaced by the app's error page for the want of the picture. Nothing is reported; the page collects nothing.
 */
class TapeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p role="status" className="text-text-2" data-floor-tape-missing="">
        The tape could not be loaded. The table above is the same check, row by row.
      </p>
    ) : (
      this.props.children
    )
  }
}

type RowState = 'matched' | 'differs' | 'unread'

/** A row's state: it is the tape's stage there, it is the first that is not, or an earlier stage already parted from the tape and this one was not read. */
const stateOf = (row: SpanRowView, check: SpanCheckView): RowState => (row.matched ? 'matched' : row.index === check.firstMismatch ? 'differs' : 'unread')

const count = (value: number) => <Readout value={value} tag="derived" size="sm" />

/** A figure of the tape, in ns of the synthetic trace: the column's head says so once, as the viewer's own tables do. */
const ns = (value: number | null) => (value === null ? <span className="text-text-2">no span</span> : <span className="font-numeric">{formatReadout(value)}</span>)

/** The stage with this id as the scenario has it, as a hand-off and a label; nothing when the tape has no stage there. */
function Stage({ view, id }: { view: FloorView; id: string | null }) {
  if (id === null) return <span className="text-text-2">the tape has no stage here</span>
  const stage = stageIn(view.scenario, id)
  if (stage === undefined) return <code className="es-type-mono">{id}</code>
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <HandoffGlyph mechanism={stage.mechanism} className="size-4 flex-none self-center" />
      <span className="es-type-ticket text-size-caption">{handoffWords(stage.mechanism)}</span>
      <span>
        <Code>{stage.label}</Code>
      </span>
    </span>
  )
}

/** What the check says in a sentence: the whole path, a part that parted from the tape at a stage, or a prefix of the tape. */
function Verdict({ check }: { check: SpanCheckView }) {
  const laid = check.rows.length
  if (check.whole) {
    return <>Every stage you laid is the tape’s stage at that place, and the tape has none left over: your path is the tape’s, span for span.</>
  }
  if (check.firstMismatch !== null) {
    const row = check.rows[check.firstMismatch]
    return (
      <>
        Your path and the tape part at stage <span className="font-numeric">{check.firstMismatch + 1}</span>
        {row.tape === null ? ': the tape has no stage there.' : ': the tape has a different stage there.'} The stages before it are the tape’s.
      </>
    )
  }
  return (
    <>
      Every stage you laid is the tape’s, and the tape goes on: it has {count(check.spans - laid)} more {check.spans - laid === 1 ? 'stage span' : 'stage spans'} after your last.
    </>
  )
}

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'step', head: 'Stage', label: 'Stage' },
  { key: 'laid', head: 'You laid', label: 'You laid' },
  { key: 'track', head: 'On the track', label: 'On the track' },
  {
    key: 'start',
    head: (
      <>
        Starts<span className="block text-sm font-normal text-text-2">ns, synthetic</span>
      </>
    ),
    label: 'Starts (ns, synthetic)',
    numeric: true,
  },
  {
    key: 'dur',
    head: (
      <>
        Lasts<span className="block text-sm font-normal text-text-2">ns, synthetic</span>
      </>
    ),
    label: 'Lasts (ns, synthetic)',
    numeric: true,
  },
]

/** The words a row says of its stage, in print and not in colour alone: the tape's stage (for a screen reader, with a drawn tick), or why it is not. */
const SAYS: Readonly<Record<RowState, string>> = { matched: 'the tape’s stage', differs: 'not the tape’s stage', unread: 'not read: an earlier stage parted from the tape' }

function rowOf(view: FloorView, row: SpanRowView, state: RowState): MirrorRow {
  return {
    id: `stage-${row.index}`,
    cells: {
      step: (
        <span className="inline-flex flex-wrap items-center gap-x-2" data-row-state={state}>
          <span className="font-numeric">{String(row.index + 1).padStart(2, '0')}</span>
          {state === 'matched' ? <Icon name="check" className="size-4 flex-none" /> : state === 'differs' ? <Icon name="strike" className="size-4 flex-none text-paper-ink-2" /> : null}
          {state === 'matched' ? <span className="sr-only">{SAYS[state]}</span> : <span className={state === 'differs' ? 'text-paper-ink-2' : 'text-text-2'}>{SAYS[state]}</span>}
        </span>
      ),
      laid: (
        <span className="flex flex-col gap-1">
          <Stage view={view} id={row.stage} />
          {/* A stage that is the tape's own and was not read, because an earlier one parted, has nothing to set beside it. */}
          {state === 'matched' || row.stage === row.tape ? null : (
            <span className="flex flex-col gap-1 text-text-2" data-tape-has="">
              <span className="font-bold">The tape has, at this place:</span>
              <Stage view={view} id={row.tape} />
            </span>
          )}
        </span>
      ),
      track: row.track === null ? <span className="text-text-2">no span</span> : <code className="es-type-mono [overflow-wrap:anywhere]">{row.track}</code>,
      start: ns(row.startNs),
      dur: ns(row.durNs),
    },
  }
}

export function TapeCheck({ view }: { view: FloorView }) {
  const check = view.check
  const headingId = useId()
  const trace = useMemo(() => (check === null ? null : traceOf(view.scenario, check.seed)), [view.scenario, check])
  if (check === null || trace === null) return null
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4" data-floor-tape="" data-whole={check.whole}>
      <h3 id={headingId}>The ticket against the tape</h3>
      <p className="max-w-prose" data-floor-tape-verdict="">
        <Verdict check={check} />
      </p>
      <p className="flex flex-wrap items-baseline gap-x-3 text-text-2" data-floor-tape-counts="">
        <span>
          Stages matched, in order: <span className="font-numeric">{check.matched}</span> of {count(check.rows.length)}
        </span>
        <span>Stage spans on the tape: {count(check.spans)}</span>
      </p>
      <div data-floor-tape-table="">
        <MirrorTable
          head="The tape check"
          caption="Each stage you laid, against the span the tape has at that place"
          columns={COLUMNS}
          rows={check.rows.map((row) => rowOf(view, row, stateOf(row, check)))}
        />
      </div>
      <TapeBoundary>
        <Suspense fallback={<p role="status" className="text-text-2">Loading the tape.</p>}>
          <TraceView
            trace={trace}
            traceId={`lifecycle-${check.seed}`}
            title="The tape of this request"
            about="A synthetic tape: the lifecycle model’s path for this request, one span for each stage, with made-up durations. It is not a measurement of any engine."
            headingLevel={3}
            readOnly
            marks={false}
          />
        </Suspense>
      </TapeBoundary>
    </section>
  )
}
