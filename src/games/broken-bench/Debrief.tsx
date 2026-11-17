import { useContext, useId } from 'react'
import { drawInBand } from '@es/play'
import { benchSession } from '@es/play/broken-bench/session'
import { FLAW_FACTS } from '@es/play/broken-bench/flaws'
import type { RulingView } from '@es/play/broken-bench/types'
import { Button } from '@/design/components/Button'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { NumberLine } from '@/design/components/NumberLine'
import { TextLink } from '@/design/components/TextLink'
import { useBest } from '@/games/kit/best'
import { Debrief as Result } from '@/games/kit/Debrief'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { verdictOf } from '@/games/kit/verdict'
import { Production } from './Production'
import { Mark, RulingBody } from './Ruling'
import type { BenchOutcome, BenchRun } from './types'
import './result.css'

/*
 * Broken benchmark's result (GAMES.md §11 "Core loop", §2.1; REDESIGN §2.6): the kit's debrief, filled. The verdict word comes from the
 * grade's own data (`verdictOf`): Passed where enough reports stand, Not yet where they do not, and the sentence under it is the session's,
 * written from the same grade, so a heading never sits over a body that says the opposite. Then the ways on (the next level first; in a lesson,
 * the lesson's way on), the pass rule met or missed in figures, the learner's p99 and the reference's on one number line, and under it the
 * report read out with its arithmetic.
 *
 * The result is the dock's; the diagram shows the corrected run in place of the case (View2D.tsx), for the report chosen in the docket.
 * The reference is read only here: the view carries no ruling until the run is over, and its p99 is never on the board while a case is open.
 */

export interface DebriefProps {
  run: BenchRun
  outcome: BenchOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  /** The report drawn in the diagram, by its place among the rulings, and the way to choose another. */
  shown: number
  onShow: (index: number) => void
  /** Inside a lesson: the ways on are the lesson's, and none of them leaves it. */
  embedded?: boolean
}

const figure = (value: number) => <span className="font-numeric">{value}</span>

/** A fresh seed the level's band accepts, from the browser's entropy: unseen, not secret. */
const drawFresh = (level: string): number => drawInBand(benchSession, level, crypto.getRandomValues(new Uint32Array(1))[0])

/** The learner's best on this level, from the ledger's runs of it. Rendered only on a page that has a ledger. */
function Best({ level, cases }: { level: string; cases: number }) {
  const best = useBest('broken-bench', level)
  if (best === null) return null
  const stood = Math.round(best.score * cases)
  return (
    <>
      {' '}
      Your best on this level: {figure(stood)} of {figure(cases)} {cases === 1 ? 'report' : 'reports'} stood ({figure(best.runs)} {best.runs === 1 ? 'run' : 'runs'} kept).
    </>
  )
}

function Docket({ rulings, shown, onShow }: { rulings: readonly RulingView[]; shown: number; onShow: (index: number) => void }) {
  return (
    <div role="region" aria-label="The reports" tabIndex={0} className="es-bench-docket">
      <table>
        <caption>Each report, and what the reference found. Show one to draw its corrected run.</caption>
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">The flaw it had</th>
            <th scope="col">Flaw</th>
            <th scope="col">p99</th>
            <th scope="col">Range</th>
            <th scope="col">
              Interval score
              <span className="es-bench-docket__unit">decades, lower is better</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rulings.map((ruling, index) => (
            <tr key={ruling.caseNo} data-ruling={ruling.caseNo} data-right={ruling.right} data-shown={index === shown || undefined}>
              <th scope="row">
                <Button size="sm" variant={index === shown ? 'ink' : 'plate'} aria-pressed={index === shown} onClick={() => onShow(index)}>
                  Show {ruling.caseNo}
                </Button>
              </th>
              <td>{FLAW_FACTS[ruling.trueFlaw].term}</td>
              <td>
                <Mark ok={ruling.flawOk} />
              </td>
              <td>
                <Mark ok={ruling.numberOk} />
              </td>
              <td>
                <Mark ok={ruling.intervalOk} />
              </td>
              <td className="es-bench-docket__score">{figure(Number((ruling.scoreMilli / 1000).toFixed(2)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Debrief({ run, outcome, next, onNext, shown, onShow, embedded = false }: DebriefProps) {
  const againId = useId()
  const { debrief, grade } = outcome
  const { view } = run
  const rulings = view.rulings ?? []
  const single = view.cases === 1
  const stood = rulings.filter((ruling) => ruling.right).length
  const verdict = verdictOf(grade, true)
  const focus = rulings[Math.min(shown, rulings.length - 1)]

  const newNumbers = () => run.restart(drawFresh(run.level))
  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null
  const primary =
    onward !== null ? (
      <PrimaryButton onClick={() => onward.select()}>
        {onward.label}
      </PrimaryButton>
    ) : next !== null ? (
      <PrimaryButton onClick={onNext}>
        {`Next level: ${next.title}`}
      </PrimaryButton>
    ) : embedded ? null : (
      <TextLink to="/m/tr8">Open module TR8</TextLink>
    )

  return (
    <Result
      className="es-bench-debrief"
      verdict={verdict}
      sentence={debrief.sentence}
      actions={
        <>
          {primary}
          <Button variant="quiet" aria-describedby={againId} onClick={() => (run.mode === 'graded' ? newNumbers() : run.restart())}>
            Run again
          </Button>
          <Button variant="quiet" onClick={newNumbers}>
            New numbers
          </Button>
        </>
      }
    >
      <div className="es-bench-debrief__body" data-bench-debrief="" data-cases={single ? 'one' : 'many'}>
        <p data-score="" data-stood={stood} data-needed={view.needed}>
          {single ? (
            <>The pass rule: the flaw, the p99 and the range all right on this report. {stood === 1 ? 'They were.' : 'They were not.'}</>
          ) : (
            <>
              {figure(stood)} of {figure(view.cases)} reports stood, and the pass rule needs {figure(view.needed)}. A report stands when its flaw, its p99 and its range are all right.
            </>
          )}
        </p>
        <p id={againId} className="es-bench-debrief__again" data-run-again="">
          <strong>Run again:</strong> {stood === view.cases ? 'every report stood, so there is nothing left to beat but a tighter range.' : `${view.cases - stood} of ${view.cases} did not stand.`}
          {run.ledger ? <Best level={run.level} cases={view.cases} /> : null}
        </p>
        {single ? null : <Docket rulings={rulings} shown={shown} onShow={onShow} />}
        {focus === undefined ? null : (
          <>
            <NumberLine
              caption={single ? "Your p99 and the reference's, in milliseconds" : `Report ${focus.caseNo}: your p99 and the reference's, in milliseconds`}
              min={0}
              max={Math.max(focus.prediction.p99Us, focus.truth.p99Us, 1) / 1000 * 1.25}
              digits={1}
              unit="ms"
              pins={[
                { id: 'yours', kind: 'guess', value: focus.prediction.p99Us / 1000, label: 'your p99' },
                { id: 'reference', kind: 'result', value: focus.truth.p99Us / 1000, label: "the reference's p99" },
              ]}
            />
            <RulingBody ruling={focus} />
          </>
        )}
        <details className="es-bench-more" data-bench-production="">
          <summary>The flags that would have made it admissible</summary>
          <Production />
        </details>
      </div>
    </Result>
  )
}
