import { useEffect, useRef, useState, type ReactNode } from 'react'
import { readStoredReport, verdictOf } from '@es/verify'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import type { HeldChallenge } from './challenge'
import { selectContents, useCopy } from './clipboard'
import { CHALLENGES, RECEIPTS, VERDICT_WORDS } from './copy'
import { stageOf } from './labs'
import { detailAddress, gpuLine, latestReport, shortHash, summarizeChecks } from './records'
import type { HeldReceipt } from './records'
import { TokenText } from './TokenText'
import { formatWhen } from './when'

/*
 * The two lists of /receipts (W2-T06): the challenges this browser has issued, each open, used or expired, and the receipts it holds.
 * Each is a list of ruled lines on a ticket, like the ledger's counts, because a line has a handful of things to say and the page must
 * hold at a phone's width. A state is a word on masking tape: open, used or expired, never a colour (the board colours are the course's
 * code and are spent on lanes and memory, DESIGN.md's Only Code Rule).
 */

/** How many lines a list shows before it offers the rest [estimated]. A learner issues a handful, and a list of fifty is not a list to read. */
const SHOWN = 8

/** The rest of a long list, one button away. */
function More<T>({ items, label, children }: { items: readonly T[]; label: string; children: (shown: readonly T[]) => ReactNode }) {
  const [all, setAll] = useState(false)
  const shown = all || items.length <= SHOWN ? items : items.slice(0, SHOWN)
  return (
    <>
      {children(shown)}
      {items.length > SHOWN ? (
        <Button variant="plate" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? `Show the newest ${SHOWN}` : `Show all ${items.length} ${label}`}
        </Button>
      ) : null}
    </>
  )
}

/**
 * One open challenge's copy button, with its own word beside it. A browser that refuses the copy gets the token itself, printed under the
 * button and selected, so that the learner's own Ctrl+C finishes it (the ticket of a new challenge does the same, IssuePanel.tsx).
 */
function CopyRow({ token, stage }: { token: string; stage: string }) {
  const { status, copy } = useCopy()
  const shown = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (status === 'failed') selectContents(shown.current)
  }, [status])
  return (
    <span className="es-held__copy">
      <Button variant="plate" size="sm" aria-label={`Copy token for ${stage}`} onClick={() => void copy(token, 'Copied')}>
        Copy token
      </Button>
      <span role="status" className="es-held__copied">
        {status === 'copied' ? 'Copied' : status === 'failed' ? CHALLENGES.refused : ''}
      </span>
      {status === 'failed' ? <TokenText token={token} innerRef={shown} className="es-held__token" /> : null}
    </span>
  )
}

function ChallengeLine({ challenge }: { challenge: HeldChallenge }) {
  const { event, stage, state, expiresAt, usedBy, token } = challenge
  const named = stageOf(stage)
  const seed = event.data.seed.toString(16).padStart(8, '0')
  return (
    <li className="es-held__item" data-state={state} data-stage={stage}>
      <div className="es-held__what">
        <span className="es-held__id">{stage}</span>
        <span className="es-held__name">
          {named === undefined ? 'a stage this build does not list' : named.name}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          seed <code>{seed}</code>
        </span>
      </div>
      <TapeLabel size="sm" tilt="none" className="es-held__state">
        {CHALLENGES[state]}
      </TapeLabel>
      <p className="es-held__when">
        issued <time dateTime={event.at}>{formatWhen(event.at)}</time>
        {state === 'open' ? (
          <>
            , good until <time dateTime={expiresAt}>{formatWhen(expiresAt)}</time>
          </>
        ) : state === 'expired' ? (
          <>
            , <span className="es-held__lapsed">expired <time dateTime={expiresAt}>{formatWhen(expiresAt)}</time></span>
          </>
        ) : usedBy !== undefined ? (
          <>
            , used by <TextLink to={detailAddress(usedBy)}>receipt {shortHash(usedBy)}</TextLink>
          </>
        ) : null}
      </p>
      {state === 'open' ? (
        <div className="es-held__act">
          <CopyRow token={token} stage={stage} />
        </div>
      ) : null}
    </li>
  )
}

/** The challenges, newest first. Exported for the tests. */
export function ChallengeList({ held }: { held: readonly HeldChallenge[] }) {
  return (
    <More items={held} label="challenges">
      {(shown) => (
        <ul className="es-held" aria-label="Challenges issued by this browser">
          {shown.map((challenge) => (
            <ChallengeLine key={challenge.event.id} challenge={challenge} />
          ))}
        </ul>
      )}
    </More>
  )
}

function ReceiptLine({ held }: { held: HeldReceipt }) {
  if (!held.ok) {
    return (
      <li className="es-held__item" data-state="unreadable">
        <div className="es-held__what">
          <span className="es-held__id">
            <TextLink to={detailAddress(held.sha256)}>{RECEIPTS.unreadable}</TextLink>
          </span>
          <span className="es-held__name">
            hash <code>{shortHash(held.sha256)}</code>
          </span>
        </div>
        <p className="es-held__when">{held.problem}</p>
      </li>
    )
  }
  const { receipt, sha256, reports } = held
  const checks = summarizeChecks(receipt)
  const report = latestReport(reports)
  const named = stageOf(receipt.stage)
  // What the latest check made of it, in a word: a receipt that was never checked here is `unchecked`, and one whose report this build cannot read has no word.
  const read = report === undefined ? null : readStoredReport(report.report)
  const worth = report === undefined ? VERDICT_WORDS.unchecked : read === null ? undefined : VERDICT_WORDS[verdictOf(read.rules, read.ran).provenance]
  return (
    <li className="es-held__item" data-state="receipt" data-stage={receipt.stage}>
      <div className="es-held__what">
        <span className="es-held__id">
          <TextLink to={detailAddress(sha256)}>{receipt.stage}</TextLink>
        </span>
        <span className="es-held__name">
          {named === undefined ? 'a stage this build does not list' : named.name}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          hash <code>{shortHash(sha256)}</code>
        </span>
      </div>
      {worth === undefined ? null : (
        <TapeLabel size="sm" tilt="none" className="es-held__worth">
          {worth}
        </TapeLabel>
      )}
      <p className="es-held__when">
        made <time dateTime={receipt.createdAt}>{formatWhen(receipt.createdAt)}</time> by grader {receipt.grader.version} on {gpuLine(receipt)}
      </p>
      <p className="es-held__when">
        {checks.failed === 0 ? (
          'The grader reports that every check passed.'
        ) : (
          <>
            The grader reports that <Readout value={checks.failed} tag="unverified" size="sm" /> of <Readout value={checks.total} tag="unverified" size="sm" /> checks failed.
          </>
        )}{' '}
        {report === undefined ? RECEIPTS.unchecked : `Last checked in this browser ${formatWhen(report.at)}.`}
      </p>
    </li>
  )
}

/** The receipts, newest first. Exported for the tests. */
export function ReceiptList({ held }: { held: readonly HeldReceipt[] }) {
  return (
    <More items={held} label="receipts">
      {(shown) => (
        <ul className="es-held" aria-label="Receipts held by this browser">
          {shown.map((entry) => (
            <ReceiptLine key={entry.sha256} held={entry} />
          ))}
        </ul>
      )}
    </More>
  )
}
