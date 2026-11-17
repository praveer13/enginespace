import { useEffect, useMemo, useRef } from 'react'
import type { ReceiptRecord, Sha256 } from '@es/ledger'
import { PrinterTape } from '@/design/components/PrinterTape'
import type { PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Count } from '@/evidence/Count'
import { Sheet } from '@/design/components/Sheet'
import { CHALLENGE_TTL_DAYS, countChallenges } from './challenge'
import type { HeldChallenge } from './challenge'
import { CHALLENGES, LEAD, RECEIPTS, TAPE } from './copy'
import { ChallengeList, ReceiptList } from './Held'
import { ImportPanel } from './ImportPanel'
import { IssuePanel } from './IssuePanel'
import type { IssuePanelProps } from './IssuePanel'
import { BackLink, ReceiptDetail, UnreadableReceipt } from './ReceiptDetail'
import { heldReceipts } from './records'
import type { ImportState } from './useImport'
import './receipts.css'

/*
 * /receipts (ARCHITECTURE §3.1, §8.4; W2-T06, W2-T07), drawn from what the ledger holds. The page has two views of one route: the lists, with
 * the deck that issues a challenge and the slip that takes a receipt back, and one receipt opened at the address's fragment, `#<sha256>`. A
 * fragment is never sent to a server, and the lists and the receipt it names are read from the learner's own ledger.
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
  /** The importer's state (`useImport`): what has become of the last file that was dropped. */
  importer: ImportState
  /** A file was dropped or chosen on the slip. */
  onChoose(file: File): void
  /** The learner cleared the result of the last file. */
  onClear(): void
}

/** The page's tape: how many challenges are in each state and how many receipts the browser holds. */
function Tape({ ready, counts, receipts }: { ready: boolean; counts: ReturnType<typeof countChallenges>; receipts: number }) {
  const lines: PrinterTapeLine[] = (['open', 'used', 'expired'] as const).map((state) => ({
    id: state,
    label: CHALLENGES[state],
    value: <Count value={counts[state]} />,
  }))
  lines.push({ id: 'receipts', label: 'results', value: <Count value={receipts} /> })
  const empty = counts.open + counts.used + counts.expired + receipts === 0
  return (
    <PrinterTape
      label={TAPE.label}
      state={!ready ? 'loading' : empty ? 'empty' : 'default'}
      empty={TAPE.empty}
      lines={ready && !empty ? lines : []}
    />
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
          Every challenge this browser has issued. A token is open until a receipt file uses it, and expires <Readout value={CHALLENGE_TTL_DAYS} tag="estimated" size="sm" /> days after it is issued.
        </p>
        {!ready ? (
          <Sheet as="div" width="full" hole={false} state="loading" loadingLabel={CHALLENGES.loading} />
        ) : held.length === 0 ? (
          <Sheet as="div" width="full" hole={false} state="empty" empty={CHALLENGES.empty} />
        ) : (
          <Sheet as="div" width="full" hole={false} className="es-held-ticket">
            <ChallengeList held={held} />
          </Sheet>
        )}
      </section>
      <section aria-labelledby="rc-receipts" className="es-panel">
        <h2 id="rc-receipts" className="es-panel__title" tabIndex={-1}>
          {RECEIPTS.title}
        </h2>
        <p className="es-panel__lead">{RECEIPTS.lead}</p>
        {!ready ? (
          <Sheet as="div" width="full" hole={false} state="loading" loadingLabel={RECEIPTS.loading} />
        ) : records.length === 0 ? (
          <Sheet as="div" width="full" hole={false} state="empty" empty={RECEIPTS.empty} />
        ) : (
          <Sheet as="div" width="full" hole={false} className="es-held-ticket">
            <ReceiptList held={records} />
          </Sheet>
        )}
      </section>
      <ImportPanel ready={ready} readOnly={props.readOnly} memoryOnly={props.backend === 'memory'} state={props.importer} onChoose={props.onChoose} onClear={props.onClear} />
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
        <Sheet as="section" width="wide" state="loading" loadingLabel={RECEIPTS.loadingDetail} tabIndex={-1} data-opened="" />
      ) : found === undefined ? (
        <Sheet as="section" width="wide" title={RECEIPTS.notFound} titleAs="h2" foot={[`Hash ${hash.slice(0, 8)}`]} tabIndex={-1} data-opened="">
          <p>{RECEIPTS.notFoundNote}</p>
        </Sheet>
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
        <h1 className="es-page__title">GPU lab results</h1>
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
          <aside className="es-page__side" aria-label="Your challenges and results, counted">
            <Tape ready={ready} counts={counts} receipts={records.length} />
          </aside>
        </div>
      )}
    </div>
  )
}
