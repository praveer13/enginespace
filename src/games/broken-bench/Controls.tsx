import { useEffect, useId, useRef, useState } from 'react'
import { RANGE_RULE } from '@es/play/broken-bench/copy'
import { FLAW_FACTS } from '@es/play/broken-bench/flaws'
import { predictionProblem } from '@es/play/broken-bench/session'
import type { Flaw } from '@es/play/broken-bench/types'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import { parseMs } from './parse'
import type { BenchRun } from './types'

/*
 * Broken benchmark's dock (REDESIGN §2.6, §3.5): the report form, and nothing else of the work. HTML for every action, so a pointer, a keyboard
 * and a screen reader all reach the same things. The Latency from switch and the cut stand over the chart they change (View2D.tsx), not here.
 * In the order of the work:
 *   - the flaw, a radio group of the eleven: arrows move in it and choose, and the choice is the `flaw` action. The option under the pointer
 *     or the keyboard says what it means, since a list of names is not a list of meanings;
 *   - the range rule, printed above the fields before anything is filed (REDESIGN §2.6): what makes a p99 stand and what makes a range stand;
 *   - the p99 and the range the learner stands behind, in milliseconds, and the control that files the report.
 *
 * Filing sends `predict` and then `submit`, and the reference judges at once. Nothing of the judgement shows until the run is over
 * (session.ts). A graded attempt has no undo (GAMES.md §2.3), and the frame offers none. The first run holds the form back until the parts
 * and the switch have been met (P4, name then ask): `run.intro.askShown`.
 */

/** A milliseconds figure as the field shows it again: no grouping, so that what is shown can be typed back. */
const msText = (us: number): string => String(Math.round(us) / 1000)

function Flaws({ run }: { run: BenchRun }) {
  const group = useId()
  const meansId = useId()
  const { view } = run
  const [looking, setLooking] = useState<Flaw | null>(null)
  const shown = looking ?? view.pick
  return (
    <fieldset className="es-bench-flaws" data-bench-flaws="" aria-describedby={meansId}>
      <legend>The flaw</legend>
      <div className="es-bench-flaws__list">
        {BENCH_FLAWS.map((flaw: Flaw) => {
          const facts = FLAW_FACTS[flaw]
          const checked = view.pick === flaw
          return (
            <label key={flaw} className="es-bench-flaws__option" data-checked={checked || undefined} data-flaw={flaw} onPointerEnter={() => setLooking(flaw)} onPointerLeave={() => setLooking(null)}>
              <input
                className="sr-only"
                type="radio"
                name={`flaw-${group}`}
                value={flaw}
                checked={checked}
                onFocus={() => setLooking(flaw)}
                onBlur={() => setLooking(null)}
                onChange={() => {
                  run.dispatch({ t: 'flaw', flaw })
                  run.announce(`Named: ${facts.term}.`)
                }}
              />
              <span className="es-bench-flaws__box" aria-hidden="true">
                {checked ? <Icon name="check" /> : null}
              </span>
              <span className="es-bench-flaws__term">{facts.term}</span>
            </label>
          )
        })}
      </div>
      <p id={meansId} className="es-bench-flaws__means">
        {shown === null ? 'Name the one flaw the log shows, or find none. Point at a name to read what it means.' : <>{FLAW_FACTS[shown].term} means {FLAW_FACTS[shown].means}.</>}
      </p>
    </fieldset>
  )
}

/** The range rule, before filing: the judge's own two bars, in words. */
function RangeRule() {
  return (
    <p className="es-bench-rule" data-bench-rule="">
      <strong>The range rule.</strong> {RANGE_RULE.p99} <span className="font-numeric">{RANGE_RULE.percent}%</span> {RANGE_RULE.p99After} {RANGE_RULE.range}{' '}
      <span className="font-numeric">{RANGE_RULE.width}</span> times {RANGE_RULE.rangeAfter}
    </p>
  )
}

function ReportForm({ run }: { run: BenchRun }) {
  const { view } = run
  const given = view.prediction
  const [p99, setP99] = useState(given === null ? '' : msText(given.p99Us))
  const [lo, setLo] = useState(given === null ? '' : msText(given.loUs))
  const [hi, setHi] = useState(given === null ? '' : msText(given.hiUs))
  const typed = { p99: parseMs(p99), lo: parseMs(lo), hi: parseMs(hi) }
  const asked = [p99, lo, hi].every((text) => text.trim() !== '')
  const answer = typed.p99 !== null && typed.lo !== null && typed.hi !== null ? { p99Us: Math.round(typed.p99 * 1000), loUs: Math.round(typed.lo * 1000), hiUs: Math.round(typed.hi * 1000) } : null
  const problem = answer === null ? (asked ? 'Write each figure in milliseconds, as digits.' : null) : predictionProblem(answer)
  const missing = [view.pick === null ? 'name a flaw' : null, answer === null || problem !== null ? 'write a p99 and a range that holds it' : null].filter((item) => item !== null)
  const ready = view.pick !== null && answer !== null && problem === null
  const heading = useId()

  function file() {
    if (!ready || answer === null) return
    run.dispatch({ t: 'predict', ...answer })
    run.dispatch({ t: 'submit' })
    run.announce(view.caseNo < view.cases ? `Report ${view.caseNo} of ${view.cases} filed.` : 'The last report is filed.')
  }

  return (
    <form
      className="es-bench-form"
      data-bench-form=""
      data-case={view.caseNo}
      aria-labelledby={heading}
      onSubmit={(event) => {
        event.preventDefault()
        file()
      }}
      // Three fields and a button that is not a submit, so a browser does not submit on Enter by itself: Enter in a field files the report when it can be filed.
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || event.target.type === 'radio') return
        event.preventDefault()
        file()
      }}
    >
      <h3 id={heading} tabIndex={-1} className="es-bench-dock__title">
        {view.cases === 1 ? 'Report form' : `Report form: report ${view.caseNo} of ${view.cases}`}
      </h3>
      {view.cases > 1 ? (
        <p className="es-bench-dock__progress" role="status">
          {view.filed === 0 ? 'None filed yet.' : `${view.filed} filed.`}
        </p>
      ) : null}
      <Flaws run={run} />
      <RangeRule />
      <div className="es-bench-form__fields">
        <Field numeric label="Your p99 (ms)" inputMode="decimal" autoComplete="off" value={p99} onChange={(event) => setP99(event.target.value)} />
        <Field numeric label="Range from (ms)" inputMode="decimal" autoComplete="off" value={lo} onChange={(event) => setLo(event.target.value)} />
        <Field numeric label="to (ms)" inputMode="decimal" autoComplete="off" value={hi} onChange={(event) => setHi(event.target.value)} />
      </div>
      {asked && problem !== null ? (
        <p className="es-bench-form__problem" role="alert">
          <Icon name="alert" /> {problem}
        </p>
      ) : null}
      <div className="es-bench-form__file">
        <Button variant="ink" disabled={!ready} onClick={file}>
          File the report
        </Button>
        {ready ? null : <p className="es-bench-form__missing">To file it: {missing.join(', and ')}.</p>}
      </div>
    </form>
  )
}

export function Controls({ run }: { run: BenchRun }) {
  const { view } = run
  // A new report is a new form: focus goes to its heading, so a keyboard lands where the work starts. The first render does not.
  const shown = useRef(view.caseNo)
  useEffect(() => {
    if (shown.current === view.caseNo) return
    shown.current = view.caseNo
    document.querySelector<HTMLElement>('[data-bench-form] h3')?.focus({ preventScroll: true })
  }, [view.caseNo])
  if (view.done) {
    return (
      <div className="es-bench-dock" data-bench-controls="" data-done="">
        <p>Every report is filed. The result is in the dock.</p>
      </div>
    )
  }
  if (!run.intro.askShown) {
    return (
      <div className="es-bench-dock" data-bench-controls="" data-held="">
        <p className="es-bench-dock__held">The report form opens after the parts and the switch.</p>
      </div>
    )
  }
  return (
    <div className="es-bench-dock" data-bench-controls="" data-case={view.caseNo}>
      <ReportForm key={`report-${view.caseNo}-${view.filed}`} run={run} />
    </div>
  )
}
