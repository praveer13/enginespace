import { useEffect, useMemo, useRef } from 'react'
import type { ReceiptRecord, Sha256 } from '@es/ledger'
import { Icon } from '@/design/components/Glyph'
import { PrinterTape } from '@/design/components/PrinterTape'
import type { PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { CHALLENGE_TTL_DAYS, countChallenges } from './challenge'
import type { HeldChallenge } from './challenge'
import { CHALLENGES, COMING, LEAD, RECEIPTS, TAPE, waveOf } from './copy'
import { ChallengeList, ReceiptList } from './Held'
import { IssuePanel } from './IssuePanel'
import type { IssuePanelProps } from './IssuePanel'
import { BackLink, ReceiptDetail, UnreadableReceipt } from './ReceiptDetail'
import { heldReceipts } from './records'
import './receipts.css'

/*
 * /receipts (ARCHITECTURE §3.1, §8.4; W2-T06), drawn from what the ledger holds. The page has two views of one route: the lists, and one
 * receipt opened at the address's fragment, `#<sha256>`. A fragment is never sent to a server, and the lists and the receipt it names
 * are read from the learner's own ledger.
 *
 * `ReceiptsView` takes all of it as props, as the evidence page's view does, so the server renderer draws any state of it. The hook that
 * opens the ledger and the address are src/pages/Receipts.tsx's.
 */

export interface ReceiptsViewProps {
  /** The ledger has opened. */
  ready: boolean
  backend: 'idb' | 'memory' | null
  readOnly: boolean
  /** The ledger's challenges, newest first, each in its state (`heldChallenges`). */
  held: readonly HeldChallenge[]
  receipts: readonly ReceiptRecord[]
  /** The receipt that the address names (`#<sha256>`), or null for the lists. */
  open: Sha256 | null
  /** The stage that the address asks to start on (`?stage=`). */
  preset?: string
  issue: IssuePanelProps['issue']
}

/** The page's tape: how many challenges are in each state and how many receipts the browser holds. */
function Tape({ ready, counts, receipts }: { ready: boolean; counts: ReturnType<typeof countChallenges>; receipts: number }) {
  const lines: PrinterTapeLine[] = (['open', 'used', 'expired'] as const).map((state) => ({
    id: state,
    label: CHALLENGES[state],
    value: <Readout value={counts[state]} tag="measured" size="sm" />,
  }))
  lines.push({ id: 'receipts', label: 'receipts', value: <Readout value={receipts} tag="measured" size="sm" /> })
  const empty = counts.open + counts.used + counts.expired + receipts === 0
  return (
    <PrinterTape
      label={TAPE.label}
      stamp={TAPE.stamp}
      state={!ready ? 'loading' : empty ? 'empty' : 'default'}
      empty={TAPE.empty}
      lines={ready && !empty ? lines : []}
    />
  )
}

/** The part of the page that is not built yet, as the unbuilt pages say it: the red line, and the task and the wave that build it. */
function Coming() {
  return (
    <section aria-labelledby="rc-coming" className="es-panel">
      <h2 id="rc-coming" className="es-panel__title">
        {COMING.title}
      </h2>
      <p className="es-panel__lead">{COMING.lead}</p>
      <Ticket as="div" width="full" hole={false} foot={[`Arriving with ${waveOf(COMING.tasks[0])}`, COMING.tasks.join(' · ')]}>
        <p className="es-unbuilt__pending">
          <TicketLine tone="ink-2" qty={<Icon name="lock" className="es-unbuilt__mark" />}>
            Not built yet
          </TicketLine>
        </p>
      </Ticket>
    </section>
  )
}

function Lists({ props, held, records }: { props: ReceiptsViewProps; held: readonly HeldChallenge[]; records: ReturnType<typeof heldReceipts> }) {
  const { ready } = props
  return (
    <>
      <IssuePanel ready={ready} readOnly={props.readOnly} memoryOnly={props.backend === 'memory'} preset={props.preset} issue={props.issue} />
      <section aria-labelledby="rc-challenges" className="es-panel">
        <h2 id="rc-challenges" className="es-panel__title">
          {CHALLENGES.title}
        </h2>
        <p className="es-panel__lead">
          Every challenge this browser has issued. A token is open until a receipt uses it, and expires <Readout value={CHALLENGE_TTL_DAYS} tag="estimated" size="sm" /> days after it is issued.
        </p>
        {!ready ? (
          <Ticket as="div" width="full" hole={false} state="loading" loadingLabel={CHALLENGES.loading} />
        ) : held.length === 0 ? (
          <Ticket as="div" width="full" hole={false} state="empty" empty={CHALLENGES.empty} />
        ) : (
          <Ticket as="div" width="full" hole={false} className="es-held-ticket">
            <ChallengeList held={held} />
          </Ticket>
        )}
      </section>
      <section aria-labelledby="rc-receipts" className="es-panel">
        <h2 id="rc-receipts" className="es-panel__title" tabIndex={-1}>
          {RECEIPTS.title}
        </h2>
        <p className="es-panel__lead">{RECEIPTS.lead}</p>
        {!ready ? (
          <Ticket as="div" width="full" hole={false} state="loading" loadingLabel={RECEIPTS.loading} />
        ) : records.length === 0 ? (
          <Ticket as="div" width="full" hole={false} state="empty" empty={RECEIPTS.empty} />
        ) : (
          <Ticket as="div" width="full" hole={false} className="es-held-ticket">
            <ReceiptList held={records} />
          </Ticket>
        )}
      </section>
      <Coming />
    </>
  )
}

/** One receipt opened, or why it is not: still printing, not held here, or not a receipt this build reads. */
function Opened({ hash, ready, held, records }: { hash: Sha256; ready: boolean; held: readonly HeldChallenge[]; records: ReturnType<typeof heldReceipts> }) {
  const found = records.find((entry) => entry.sha256 === hash)
  return (
    <div className="es-page__main es-receipts__opened">
      <BackLink />
      {!ready ? (
        <Ticket as="section" width="wide" state="loading" loadingLabel={RECEIPTS.loadingDetail} tabIndex={-1} data-opened="" />
      ) : found === undefined ? (
        <Ticket as="section" width="wide" title={RECEIPTS.notFound} titleAs="h2" foot={[`Hash ${hash.slice(0, 8)}`]} tabIndex={-1} data-opened="">
          <p>{RECEIPTS.notFoundNote}</p>
        </Ticket>
      ) : found.ok ? (
        <ReceiptDetail held={found} challenges={held} />
      ) : (
        <UnreadableReceipt held={found} />
      )}
    </div>
  )
}

export function ReceiptsView(props: ReceiptsViewProps) {
  const { ready, held, receipts, open } = props
  const records = useMemo(() => heldReceipts(receipts), [receipts])
  const counts = useMemo(() => countChallenges(held), [held])

  // A fragment that changes after the page is open is a move within it: the receipt that opens, or the lists that come back, take focus,
  // so a keyboard or a screen reader is where the page now is. What the page opened on is a load, and the document's own place is right.
  // The fragment it last drew is kept, and not whether it has drawn yet, so that an effect that runs twice on mount (React's strict mode
  // does in development) moves nothing.
  const frame = useRef<HTMLDivElement>(null)
  const drawn = useRef(open)
  useEffect(() => {
    if (drawn.current === open) return
    drawn.current = open
    const target = open !== null ? frame.current?.querySelector<HTMLElement>('[data-opened]') : document.getElementById('rc-receipts')
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }, [open])

  return (
    <div className="es-page es-receipts" data-page="receipts" data-view={open === null ? 'lists' : 'receipt'}>
      <header className="es-page__header">
        <h1 className="es-page__title">Receipts</h1>
        <p className="es-page__lead">{LEAD}</p>
      </header>
      {open !== null ? (
        <div ref={frame}>
          <Opened hash={open} ready={ready} held={held} records={records} />
        </div>
      ) : (
        <div className="es-page__columns">
          <div className="es-page__main">
            <Lists props={props} held={held} records={records} />
          </div>
          <aside className="es-page__side" aria-label="Your challenges and receipts, counted">
            <Tape ready={ready} counts={counts} receipts={records.length} />
          </aside>
        </div>
      )}
    </div>
  )
}
