import type { FullView, Verdict } from '@es/play/loop/full/types'
import { Readout } from '@/design/components/Readout'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { tagOf, verdictWords } from './tags'

/*
 * What a graded night came to against ASSESSMENT §4.3's bar (`close`): the tokens it served for each ms of the line's clock against the
 * house's, as a share, and the dependency that the model checks. A night the engine would not start says why; a night that read a token
 * before it was sampled scores nothing, however fast. It is printed once the night is served, and not before: the stage is closed-book.
 */

export function VerdictLines({ verdict, view }: { verdict: Verdict; view: Pick<FullView, 'synthetic'> }) {
  const derived = tagOf(view, 'line') === 'synthetic' ? 'synthetic' : 'derived'
  return (
    <>
      <p data-verdict={verdict.kind}>{verdictWords(verdict)}</p>
      {verdict.throughputPermille === null ? null : (
        <>
          <TicketLine note={<Readout value={verdict.throughputPermille / 10} digits={1} unit="%" tag={derived} size="sm" tone={verdict.kind === 'pass' ? 'ink' : 'ink-2'} />} tone={verdict.kind === 'pass' ? 'ink' : 'ink-2'}>
            tokens for each ms, as a share of the house's
          </TicketLine>
          <TicketLine note={<Readout value={verdict.barPermille / 10} digits={1} unit="%" tag="estimated" size="sm" />}>the bar</TicketLine>
        </>
      )}
      {verdict.kind === 'violation' ? (
        <TicketLine note={<Readout value={verdict.violations} unit="steps" tag={derived} size="sm" tone="ink-2" />} tone="ink-2">
          fires that read a token before it was sampled
        </TicketLine>
      ) : null}
      {verdict.kind === 'refused' && verdict.reason !== null ? <p data-verdict-reason="">{verdict.reason}.</p> : null}
    </>
  )
}

export function NightVerdict({ view }: { view: FullView }) {
  const verdict = view.stage.verdict
  if (verdict === null) return null
  return (
    <Ticket as="section" width="full" hole={false} compact head="Verdict" meta="one night" data-full-verdict={verdict.kind}>
      <VerdictLines verdict={verdict} view={view} />
    </Ticket>
  )
}
