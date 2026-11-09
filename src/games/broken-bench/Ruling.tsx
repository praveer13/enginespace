import { useMemo } from 'react'
import { divCeil } from '@es/sim/core'
import { FLAW_CLAIMS } from '@es/sim/bench/broken'
import { CORRECTION_WORDS, FLAW_FACTS } from '@es/play/broken-bench/flaws'
import { NUMBER_TOLERANCE_PERMILLE, INTERVAL_WIDTH_FACTOR } from '@es/play/broken-bench/judge'
import { layoutHistogram, layoutTimeline, longestWait, orderNo } from '@es/play/broken-bench/layout'
import type { RulingView } from '@es/play/broken-bench/types'
import { useClaims } from '@/content/load'
import { ClaimChip } from '@/content/render/ClaimChip'
import { renderEnv, todayIso } from '@/content/render/model'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { Plot } from './Plot'
import { useOrientation } from './useOrientation'

/*
 * One ruling, read out (GAMES.md §11 "Core loop", step 5: "The reveal: the court recomputes from the rows ... and shows the arithmetic"),
 * in two parts that the debrief sets side by side on a wide screen and one after the other on a narrow one (Debrief.tsx):
 *   - the ruling: what the log showed and what the learner named, the number the court found and how, the learner's range against the
 *     court's own bootstrap interval and the interval's log score, then the rule and the arithmetic;
 *   - the exhibits: the corrected benchmark run again on a sheet of graph paper, with the report's number, the court's and the learner's
 *     on flags; the learner's own log around its longest wait, where each order's wait between its due tick and its sent tick is the
 *     ribbon's red; and the flaw's real-world instance as claims, in one ledger, each with its source and the day it was read (A§4.4).
 *
 * A mark is a drawn shape and a word, never a colour alone: a drawn check and "right", or a drawn alert and "wrong" in the ribbon's red.
 */

const fig = (value: number, digits = 0) => <span className="font-numeric">{formatReadout(value, digits)}</span>
/** A time, in the printer's dots, with its unit. The ticket's foot says that every figure on it is synthetic, as the form's does. */
const ms = (us: number, digits = 1) => (
  <>
    {fig(us / 1000, digits)} ms
  </>
)

function Verdict({ ok, words }: { ok: boolean; words: readonly [string, string] }) {
  return (
    <span className="es-bench-verdict" data-ok={ok}>
      <Icon name={ok ? 'check' : 'alert'} className="es-bench-verdict__mark" />
      <span>{ok ? words[0] : words[1]}</span>
    </span>
  )
}

/** The flaw's real-world instances as one ledger: a line for each claim, its figure in one column and its source in the next. */
function Ledger({ ids }: { ids: readonly string[] }) {
  const claims = useClaims(ids.length > 0)
  const env = useMemo(() => renderEnv([], claims.status === 'ready' ? claims.value : null, todayIso()), [claims])
  if (ids.length === 0) return <p className="es-bench-instance">A fair inspection has no real-world instance to cite: the claim is the log&apos;s own number.</p>
  if (claims.status === 'loading') return <p role="status">Reading the sources…</p>
  return (
    <ul className="es-bench-instances es-bench-ledger">
      {ids.map((id) => (
        <li key={id}>
          <ClaimChip id={id} env={env} />
        </li>
      ))}
    </ul>
  )
}

export function RulingTicket({ ruling, cases }: { ruling: RulingView; cases: number }) {
  const facts = FLAW_FACTS[ruling.trueFlaw]
  const named = FLAW_FACTS[ruling.named]
  const { truth, prediction, scene } = ruling
  const how = CORRECTION_WORDS[truth.how]
  const rank = divCeil(990 * truth.n, 1000)
  const beyond = truth.n - rank
  const ratio = Math.round((Math.max(scene.claim.valueUs, truth.p99Us) * 10) / Math.max(1, Math.min(scene.claim.valueUs, truth.p99Us))) / 10
  const high = scene.claim.valueUs > truth.p99Us
  const band = { lo: Math.ceil((truth.p99Us * (1000 - NUMBER_TOLERANCE_PERMILLE)) / 1000), hi: Math.floor((truth.p99Us * (1000 + NUMBER_TOLERANCE_PERMILLE)) / 1000) }
  const courtWidth = truth.ciHiUs - truth.ciLoUs
  // The headline leads the paper, with the case in it at the court, and no line of print stands above it: the verdict ticket and the
  // docket say whether each ruling stood, and each line below says which of its three parts was right.
  return (
    <Ticket
      as="section"
      width="full"
      hole={false}
      titleAs="h3"
      title={cases === 1 ? facts.term : `Case ${ruling.caseNo}: ${facts.term}`}
      foot={['Every figure on this ruling is synthetic, unless it says otherwise']}
      className="es-bench-ruling"
    >
      <p className="es-bench-ruling__kitchen">{facts.kitchen}</p>
      <dl className="es-bench-lines es-bench-lines--ruling">
        <div className="es-bench-lines__line" data-line="flaw">
          <dt>The flaw</dt>
          <dd>
            <Verdict ok={ruling.flawOk} words={['right', 'wrong']} /> You named {named.phrase}. The log showed {facts.phrase}: {facts.shows}.
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="number">
          <dt>The number</dt>
          <dd>
            <Verdict ok={ruling.numberOk} words={['right', 'wrong']} /> You wrote {ms(prediction.p99Us)}. The court found {ms(truth.p99Us)}, and a number is right within{' '}
            <Readout value={NUMBER_TOLERANCE_PERMILLE / 10} unit="%" tag="estimated" size="sm" /> of it, from {ms(band.lo)} to {ms(band.hi)}. The report said {ms(scene.claim.valueUs)},{' '}
            <Readout value={ratio} digits={1} unit="x" tag="derived" size="sm" /> too {high ? 'high' : 'low'}.
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="range">
          <dt>The range</dt>
          <dd>
            <Verdict ok={ruling.intervalOk} words={['right', 'wrong']} /> You wrote {ms(prediction.loUs)} to {ms(prediction.hiUs)}, {ms(prediction.hiUs - prediction.loUs)} wide. The court&apos;s
            bootstrap interval is {ms(truth.ciLoUs)} to {ms(truth.ciHiUs)}, {ms(courtWidth)} wide, and a range is right if it holds the court&apos;s number and is at most{' '}
            <Readout value={INTERVAL_WIDTH_FACTOR} unit="x" tag="estimated" size="sm" /> as wide as that.
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="score">
          <dt>Interval score</dt>
          <dd>
            Yours {fig(ruling.scoreMilli / 1000, 2)}, the court&apos;s own {fig(truth.courtScoreMilli / 1000, 2)} (decades on the log scale, lower is better; a miss costs twenty for each decade it
            is out).
          </dd>
        </div>
      </dl>

      <h4 className="es-bench-ruling__subhead">The rule, and the arithmetic</h4>
      <p>{facts.rule}</p>
      <dl className="es-bench-lines es-bench-lines--ruling">
        <div className="es-bench-lines__line" data-line="how">
          <dt>{how.name}</dt>
          <dd>{how.does}</dd>
        </div>
        <div className="es-bench-lines__line" data-line="sample">
          <dt>The sample</dt>
          <dd>
            {fig(truth.n)} orders{truth.how === 'cut' ? <>, after the {fig(scene.rows.length - truth.n)} warm-up orders the rule leaves out</> : null}
            {truth.how === 'rerun' ? <>, from the new log</> : null}
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="rank">
          <dt>Nearest rank</dt>
          <dd>
            <span className="font-numeric">99</span> hundredths of {fig(truth.n)}, rounded up, is {fig(rank)}: the {fig(rank)}th smallest time to first token is the p99, {ms(truth.p99Us)}, with {fig(beyond)} orders beyond it
            {beyond < 10 ? <>, fewer than the ten a p99 needs</> : null}.
          </dd>
        </div>
        {ruling.reveal.stalls.map((stall) => (
          <div key={stall.atUs} className="es-bench-lines__line" data-line="stall">
            <dt>What the log hid</dt>
            <dd>
              The server froze at {ms(stall.atUs, 0)} for {ms(stall.forUs, 0)}. Every order due in that time waited, and a stopwatch started at the send timed none of it.
            </dd>
          </div>
        ))}
        {ruling.reveal.cold === null ? null : (
          <div className="es-bench-lines__line" data-line="cold">
            <dt>What the log hid</dt>
            <dd>
              The server started cold: until {ms(ruling.reveal.cold.untilUs, 0)} each step ran {fig(ruling.reveal.cold.slowdownPermille / 1000, 1)} times as slow.
            </dd>
          </div>
        )}
      </dl>
    </Ticket>
  )
}

/**
 * The exhibits of a ruling, pinned beside it: the corrected benchmark run again, the learner's own log where a stopwatch started at the
 * send loses time (a log with no order sent late has no such stretch), and the real tools' instance of the flaw.
 */
export function Exhibits({ ruling }: { ruling: RulingView }) {
  const orientation = useOrientation()
  const { truth, prediction, scene } = ruling
  const run = useMemo(
    () =>
      layoutHistogram({
        orientation,
        latencies: ruling.correction.ttftUs,
        cut: 0,
        selected: null,
        claimUs: scene.claim.valueUs,
        correctedUs: truth.p99Us,
        yoursUs: prediction.p99Us,
        caption: 'THE CORRECTED RUN',
      }),
    [orientation, ruling.correction.ttftUs, scene.claim.valueUs, truth.p99Us, prediction.p99Us],
  )
  const wait = useMemo(() => longestWait(scene.rows), [scene.rows])
  const stretch = useMemo(
    () => (wait === null ? null : layoutTimeline({ orientation, rows: scene.rows, selected: null, from: wait.from, caption: 'YOUR LOG, AROUND ITS LONGEST WAIT' })),
    [orientation, scene.rows, wait],
  )
  return (
    <div className="es-bench-exhibits" data-exhibits="">
      <div className="es-bench-exhibit" data-exhibit="run">
        <Plot sheet={run} />
        <p className="es-bench-sheetnote">
          The corrected benchmark, run again by the court&apos;s rule: every order of its sample, higher for a longer time to first token on the logarithmic ruler, with the
          report&apos;s number, the court&apos;s and yours on flags.
        </p>
        <p className="es-bench-flags" data-flags="">
          <span>
            Reported <Readout value={scene.claim.valueUs / 1000} digits={1} unit="ms" tag="synthetic" size="sm" />
          </span>
          <span>
            Corrected <Readout value={truth.p99Us / 1000} digits={1} unit="ms" tag="synthetic" size="sm" />
          </span>
          <span>
            Yours <Readout value={prediction.p99Us / 1000} digits={1} unit="ms" tag="synthetic" size="sm" />
          </span>
        </p>
      </div>
      {wait === null || stretch === null ? null : (
        <div className="es-bench-exhibit" data-exhibit="waits">
          <Plot sheet={stretch} />
          <p className="es-bench-sheetnote">
            Your own log, from a few orders before the one sent the longest after it was due. Each red dash is an order&apos;s wait between its due tick and its sent tick
            {scene.claim.timerStartsAt === 'send' ? <>, and the report&apos;s stopwatch, started at the send, timed none of it.</> : <>, which the report&apos;s stopwatch, started at the due time, timed.</>}
          </p>
          <p className="es-bench-flags" data-flags="">
            <span>
              Order <span className="font-numeric">{orderNo(wait.id)}</span> waited <Readout value={wait.waitUs / 1000} digits={1} unit="ms" tag="synthetic" size="sm" />
            </span>
            <span>
              Sent late <Readout value={scene.facts.lateSends} tag="synthetic" size="sm" /> of <Readout value={scene.facts.orders} tag="synthetic" size="sm" /> orders
            </span>
          </p>
        </div>
      )}
      <div className="es-bench-ledger-slip">
        <h4 className="es-bench-ruling__subhead">In the real tools</h4>
        <Ledger ids={FLAW_CLAIMS[ruling.trueFlaw]} />
      </div>
    </div>
  )
}
