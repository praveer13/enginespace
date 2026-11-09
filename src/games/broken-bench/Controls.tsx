import { useEffect, useId, useState } from 'react'
import { FLAW_FACTS } from '@es/play/broken-bench/flaws'
import { predictionProblem } from '@es/play/broken-bench/session'
import type { Flaw } from '@es/play/broken-bench/types'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Toggle } from '@/design/components/Toggle'
import { formatReadout } from '@/design/format'
import type { DeskApi } from './desk'
import { parseMs } from './parse'
import type { BenchRun } from './types'

/*
 * The Inspection's controls (GAMES.md §11 "Controls"): HTML for every action, so a pointer, a keyboard and a screen reader all reach the
 * same things. Three parts, in the order of the work:
 *   - the desk's two instruments, the stopwatch and the cut, which time and count whatever they are set to and know nothing of the flaw;
 *   - the checklist, a radio group of the eleven rulings, laid out as the violations on the inspector's form: arrows move in it and
 *     choose, and the choice is the `flaw` action;
 *   - the answer slip: the corrected p99 and the range the learner stands behind, in milliseconds, and the stub that files the ruling.
 *
 * Filing sends `predict` and then `submit`, and the court judges at once. Nothing of the judgement shows until the court has risen
 * (session.ts): the next case comes up, or the debrief opens. A graded attempt has no undo (GAMES.md §2.3), and the shell offers none.
 */

/** A milliseconds figure as the field shows it again: no grouping, so that what is shown can be typed back. */
const msText = (us: number): string => String(Math.round(us) / 1000)

function Instruments({ run, desk }: { run: BenchRun; desk: DeskApi }) {
  const cutHint = (
    <>
      orders by due time, as a warm-up cut. The report left out <span className="font-numeric">{formatReadout(desk.harness.cut)}</span>. The course fixes the cut before the run: the first
      max(<span className="font-numeric">100</span>, 2 × the server&apos;s sequences) orders.
    </>
  )
  return (
    <fieldset className="es-bench-desk" data-bench-desk="">
      <legend>
        <TapeLabel size="sm" tilt="left">
          the desk
        </TapeLabel>
      </legend>
      <Toggle
        label="Time each order from when it was due"
        hint="Off, the stopwatch starts at the send, as a timer inside the request function does."
        checked={desk.clock === 'due'}
        onCheckedChange={(on) => {
          desk.setClock(on ? 'due' : 'sent')
          run.announce(on ? 'Stopwatch starts at the due time.' : 'Stopwatch starts at the send.')
        }}
      />
      <Field
        numeric
        label="Leave out the first"
        hint={cutHint}
        inputMode="numeric"
        autoComplete="off"
        defaultValue={String(desk.cut)}
        onChange={(event) => {
          const value = Number(event.target.value.replace(/[,\s]/g, ''))
          if (Number.isInteger(value) && value >= 0) desk.setCut(value)
        }}
      />
    </fieldset>
  )
}

function Citations({ run }: { run: BenchRun }) {
  const group = useId()
  const { view } = run
  return (
    <fieldset className="es-bench-cite" data-bench-cite="">
      <legend>Principal violation</legend>
      <p className="es-bench-cite__hint">Name the one flaw the log shows, or find none. The engine&apos;s term leads and the kitchen&apos;s reading follows it.</p>
      <div className="es-bench-cite__list">
        {BENCH_FLAWS.map((flaw: Flaw) => {
          const facts = FLAW_FACTS[flaw]
          const checked = view.pick === flaw
          return (
            <label key={flaw} className="es-bench-cite__option" data-checked={checked || undefined} data-flaw={flaw}>
              <input
                className="sr-only"
                type="radio"
                name={`cite-${group}`}
                value={flaw}
                checked={checked}
                onChange={() => {
                  run.dispatch({ t: 'flaw', flaw })
                  run.announce(`Named: ${facts.term}.`)
                }}
              />
              <span className="es-bench-cite__box" aria-hidden="true">
                {checked ? <Icon name="check" /> : null}
              </span>
              <span className="es-bench-cite__words">
                <span className="es-bench-cite__term">{facts.term}</span>
                <span className="es-bench-cite__kitchen">{facts.kitchen}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function AnswerSlip({ run }: { run: BenchRun }) {
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

  function file() {
    if (!ready || answer === null) return
    run.dispatch({ t: 'predict', ...answer })
    run.dispatch({ t: 'submit' })
    run.announce(view.caseNo < view.cases ? `Case ${view.caseNo} of ${view.cases} filed.` : 'The last ruling is filed.')
  }

  return (
    <form
      className="es-bench-answer"
      data-bench-answer=""
      aria-label="Your corrected p99 and its range"
      onSubmit={(event) => {
        event.preventDefault()
        file()
      }}
      // Three fields and no submit button, so a browser does not submit on Enter by itself: Enter in a field files the ruling when it can be filed.
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
        event.preventDefault()
        file()
      }}
    >
      <p className="es-bench-answer__lede">What should the report have said? Write down the p99 time to first token, in milliseconds, and the range you would stand behind.</p>
      <div className="es-bench-answer__fields">
        <Field numeric label="Your p99 (ms)" inputMode="decimal" autoComplete="off" value={p99} onChange={(event) => setP99(event.target.value)} />
        <Field numeric label="Range from (ms)" inputMode="decimal" autoComplete="off" value={lo} onChange={(event) => setLo(event.target.value)} />
        <Field numeric label="to (ms)" inputMode="decimal" autoComplete="off" value={hi} onChange={(event) => setHi(event.target.value)} error={asked && problem !== null ? problem : undefined} />
      </div>
      <div className="es-bench-answer__file">
        <Stub standalone disabled={!ready} onClick={file}>
          File the ruling
        </Stub>
        {ready ? null : <p className="es-bench-answer__missing">To file it: {missing.join(', and ')}.</p>}
      </div>
    </form>
  )
}

export function Controls({ run, desk }: { run: BenchRun; desk: DeskApi | null }) {
  const { view } = run

  // The last ruling filed, the stub is gone: focus goes to the way on, so a keyboard is not left on nothing.
  useEffect(() => {
    if (!view.done) return
    const way = document.querySelector<HTMLElement>('[data-end] button')
    way?.focus({ preventScroll: true })
    // It stands under the controls, which can be below the first screen: bring it into view, and move the page no more than that.
    way?.scrollIntoView({ block: 'nearest' })
  }, [view.done])

  if (view.done || desk === null) {
    return (
      <div className="es-bench-controls" data-bench-controls="" data-done="">
        <p className="es-bench-prompt">The court has risen.</p>
      </div>
    )
  }

  return (
    <div className="es-bench-controls" data-bench-controls="" data-case={view.caseNo}>
      <Instruments key={`desk-${view.caseNo}`} run={run} desk={desk} />
      <Citations run={run} />
      <AnswerSlip key={`answer-${view.caseNo}-${view.filed}`} run={run} />
    </div>
  )
}
