import { useMemo } from 'react'
import { divCeil } from '@es/sim/core'
import { FLAW_CLAIMS } from '@es/sim/bench/broken'
import { CORRECTION_WORDS, FLAW_FACTS } from '@es/play/broken-bench/flaws'
import { NUMBER_TOLERANCE_PERMILLE, INTERVAL_WIDTH_FACTOR } from '@es/play/broken-bench/judge'
import type { RulingView } from '@es/play/broken-bench/types'
import { useClaims } from '@/content/load'
import { ClaimChip } from '@/content/render/ClaimChip'
import { renderEnv, todayIso } from '@/content/render/model'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'

/*
 * One report, read out (GAMES.md §11 "Core loop", step 5: "The reveal: the reference recomputes from the rows ... and shows the arithmetic"),
 * in the dock, where the frame places it (REDESIGN §2.6, "You against the reference, drawn"):
 *   - `Exhibits.tsx` draws the exhibits in the diagram, in place of the case;
 *   - `RulingBody` is read in the dock, under the verdict: what the log showed and what the learner named, the p99 the reference found and
 *     how, the learner's range against its bootstrap interval and the interval's log score, then the rule and the arithmetic, and the flaw's
 *     real-world instance as claims, each with its source and the day it was read (A§4.4).
 *
 * A mark is a drawn shape and a word, never a colour alone: a drawn check and "right", or a drawn alert and "wrong".
 */

const fig = (value: number, digits = 0) => <span className="font-numeric">{formatReadout(value, digits)}</span>
/** A time with its unit. The result's stamp says that every figure on it is synthetic. */
const ms = (us: number, digits = 1) => (
  <>
    {fig(us / 1000, digits)} ms
  </>
)

export function Mark({ ok, words = ['right', 'wrong'] }: { ok: boolean; words?: readonly [string, string] }) {
  return (
    <span className="es-bench-verdict" data-ok={ok}>
      <Icon name={ok ? 'check' : 'alert'} className="es-bench-verdict__mark" />
      <span>{ok ? words[0] : words[1]}</span>
    </span>
  )
}

/** The flaw's real-world instances as one ledger: a line for each claim, its figure in one column and its source in the next. */
export function Ledger({ ids }: { ids: readonly string[] }) {
  const claims = useClaims(ids.length > 0)
  const env = useMemo(() => renderEnv([], claims.status === 'ready' ? claims.value : null, todayIso()), [claims])
  if (ids.length === 0) return <p className="es-bench-instance">A fair benchmark has no real-world instance to cite: the claim is the log&apos;s own p99.</p>
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

/** The figures of the reference's arithmetic for one report. */
function figuresOf(ruling: RulingView) {
  const { truth, scene } = ruling
  const rank = divCeil(990 * truth.n, 1000)
  const ratio = Math.round((Math.max(scene.claim.valueUs, truth.p99Us) * 10) / Math.max(1, Math.min(scene.claim.valueUs, truth.p99Us))) / 10
  return {
    rank,
    beyond: truth.n - rank,
    ratio,
    high: scene.claim.valueUs > truth.p99Us,
    band: { lo: Math.ceil((truth.p99Us * (1000 - NUMBER_TOLERANCE_PERMILLE)) / 1000), hi: Math.floor((truth.p99Us * (1000 + NUMBER_TOLERANCE_PERMILLE)) / 1000) },
    width: truth.ciHiUs - truth.ciLoUs,
  }
}

/** What the flaw is, what the learner named, and the three parts of the verdict on it, with the arithmetic under them. */
export function RulingBody({ ruling }: { ruling: RulingView }) {
  const facts = FLAW_FACTS[ruling.trueFlaw]
  const named = FLAW_FACTS[ruling.named]
  const { truth, prediction, scene } = ruling
  const how = CORRECTION_WORDS[truth.how]
  const { rank, beyond, ratio, high, band, width } = figuresOf(ruling)
  return (
    <div className="es-bench-ruling" data-ruling-body={ruling.caseNo}>
      <p className="es-bench-ruling__means">{facts.term} means {facts.means}.</p>
      <dl className="es-bench-lines es-bench-lines--ruling">
        <div className="es-bench-lines__line" data-line="flaw">
          <dt>The flaw</dt>
          <dd>
            <Mark ok={ruling.flawOk} /> You named {named.phrase}. The log showed {facts.phrase}: {facts.shows}.
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="number">
          <dt>The p99</dt>
          <dd>
            <Mark ok={ruling.numberOk} /> You wrote {ms(prediction.p99Us)}. The reference found {ms(truth.p99Us)}, and a p99 stands within{' '}
            <Readout value={NUMBER_TOLERANCE_PERMILLE / 10} unit="%" tag="estimated" size="sm" /> of it, from {ms(band.lo)} to {ms(band.hi)}. The report said {ms(scene.claim.valueUs)},{' '}
            <Readout value={ratio} digits={1} unit="x" tag="derived" size="sm" /> too {high ? 'high' : 'low'}.
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="range">
          <dt>The range</dt>
          <dd>
            <Mark ok={ruling.intervalOk} /> You wrote {ms(prediction.loUs)} to {ms(prediction.hiUs)}, {ms(prediction.hiUs - prediction.loUs)} wide. The reference&apos;s bootstrap interval is{' '}
            {ms(truth.ciLoUs)} to {ms(truth.ciHiUs)}, {ms(width)} wide, and a range stands if it holds the reference&apos;s p99 and is at most{' '}
            <Readout value={INTERVAL_WIDTH_FACTOR} unit="x" tag="estimated" size="sm" /> as wide as that.
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="score">
          <dt>Interval score</dt>
          <dd>
            Yours {fig(ruling.scoreMilli / 1000, 2)}, the reference&apos;s own {fig(truth.courtScoreMilli / 1000, 2)} (decades on the log scale, lower is better; a miss costs twenty for each decade it
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
            {fig(truth.n)} requests{truth.how === 'cut' ? <>, after the {fig(scene.rows.length - truth.n)} warm-up requests the rule leaves out</> : null}
            {truth.how === 'rerun' ? <>, from the new log</> : null}
          </dd>
        </div>
        <div className="es-bench-lines__line" data-line="rank">
          <dt>Nearest rank</dt>
          <dd>
            <span className="font-numeric">99</span> hundredths of {fig(truth.n)}, rounded up, is {fig(rank)}: the {fig(rank)}th smallest time to first token is the p99, {ms(truth.p99Us)}, with{' '}
            {fig(beyond)} requests beyond it
            {beyond < 10 ? <>, fewer than the ten a p99 needs</> : null}.
          </dd>
        </div>
        {ruling.reveal.stalls.map((stall) => (
          <div key={stall.atUs} className="es-bench-lines__line" data-line="stall">
            <dt>What the log hid</dt>
            <dd>The server froze at {ms(stall.atUs, 0)} for {ms(stall.forUs, 0)}. Every request due in that time waited, and a timer started at the send counted none of it.</dd>
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
      <h4 className="es-bench-ruling__subhead">In the real tools</h4>
      <Ledger ids={FLAW_CLAIMS[ruling.trueFlaw]} />
    </div>
  )
}
