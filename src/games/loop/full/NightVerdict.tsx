import type { FullView, Verdict } from '@es/play/loop/full/types'
import { Readout } from '@/design/components/Readout'
import { tagOf, verdictWords } from './tags'

/*
 * What a graded run came to against the bar (ASSESSMENT §4.3, `close`): the tokens it served for each ms of GPU time against the
 * reference run's, as a share, and the dependency the model checks. A run the engine would not start says why; a run that read a token
 * before it was sampled scores nothing, however fast. It is printed once the run is served, and not before: the stage is closed-book.
 */

export function VerdictLines({ verdict, view }: { verdict: Verdict; view: Pick<FullView, 'synthetic'> }) {
  const derived = tagOf(view, 'line') === 'synthetic' ? 'synthetic' : 'derived'
  const ok = verdict.kind === 'pass'
  return (
    <dl className="es-fd__verdict-list">
      <div className="es-fd__verdict-word">
        <dt className="sr-only">Verdict</dt>
        <dd data-verdict={verdict.kind}>{verdictWords(verdict)}</dd>
      </div>
      {verdict.throughputPermille === null ? null : (
        <>
          <div>
            <dt>tokens for each ms, as a share of the reference run’s</dt>
            <dd>
              <Readout value={verdict.throughputPermille / 10} digits={1} unit="%" tag={derived} size="sm" tone={ok ? 'ink' : 'ink-2'} />
            </dd>
          </div>
          <div>
            <dt>the bar</dt>
            <dd>
              <Readout value={verdict.barPermille / 10} digits={1} unit="%" tag="estimated" size="sm" />
            </dd>
          </div>
        </>
      )}
      {verdict.kind === 'violation' ? (
        <div>
          <dt>steps that read a token before it was sampled</dt>
          <dd>
            <Readout value={verdict.violations} unit="steps" tag={derived} size="sm" tone="ink-2" />
          </dd>
        </div>
      ) : null}
      {verdict.kind === 'refused' && verdict.reason !== null ? (
        <div>
          <dt className="sr-only">Why</dt>
          <dd data-verdict-reason="">{verdict.reason}.</dd>
        </div>
      ) : null}
    </dl>
  )
}

export function NightVerdict({ view }: { view: FullView }) {
  const verdict = view.stage.verdict
  if (verdict === null) return null
  return (
    <section className="es-fd__verdict" aria-label="Verdict on the run" data-full-verdict={verdict.kind}>
      <VerdictLines verdict={verdict} view={view} />
    </section>
  )
}
