import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LocalDay } from '@es/ledger'
import { PrinterTape } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { AHEAD_NOTE, DONE_TITLE, EMPTY_BODY, EMPTY_TITLE, EMPTY_UNSERVED_BODY, EMPTY_UNSERVED_TITLE, LINK_EVIDENCE, LINK_MAP, LINK_TR2, LOAD_LABEL, nextPrep, REST_AHEAD, REST_TITLE, START_AHEAD, tallyLine } from './copy'
import { formatDay } from './days'
import { PrepLines } from './PrepList'
import type { LineView } from './plan'

/*
 * The tickets of the page that are not the list and not the ticket being prepped: the one that waits while the ledger is read, the one
 * that says there is nothing to keep yet, the one that says nothing is due, and the one that closes a prep. Each is a ticket of the same
 * paper (src/design/components/Ticket.tsx) with a stamped title, and none of them says how much is overdue.
 */

const head = <span aria-hidden="true">Today</span>

export function LoadingTicket() {
  return <Ticket as="section" className="es-prep__ticket" width="wide" head={head} state="loading" loadingLabel={LOAD_LABEL} />
}

/** What stands beside the list on a wide screen before the prep starts: a blank ticket where the first one will print. */
export function BlankTicket() {
  return (
    <Ticket as="div" className="es-prep__blank" width="wide" state="empty" empty="The first ticket prints when you start the prep." aria-hidden="true" />
  )
}

function Links({ children }: { children: ReactNode }) {
  return <p className="es-prep__links">{children}</p>
}

/** Nothing is earned yet, or what is earned has no tickets yet. */
export function EmptyTicket({ day, unserved }: { day: LocalDay; unserved: boolean }) {
  return (
    <Ticket as="section" className="es-prep__ticket" data-state="empty" width="wide" head={head} meta={<span aria-hidden="true">{formatDay(day)}</span>} title={unserved ? EMPTY_UNSERVED_TITLE : EMPTY_TITLE} titleAs="h2">
      <p>{unserved ? EMPTY_UNSERVED_BODY : EMPTY_BODY}</p>
      <Links>
        <TextLink to="/m/tr2">{LINK_TR2}</TextLink> <TextLink to="/map">{LINK_MAP}</TextLink>
      </Links>
    </Ticket>
  )
}

/** Nothing is due that can be served: when the next prep is, and a review ahead where there is something to look at. */
export function RestTicket({ day, next, ahead, onAhead }: { day: LocalDay; next: LocalDay | null; ahead: boolean; onAhead: () => void }) {
  return (
    <Ticket
      as="section"
      className="es-prep__ticket"
      data-state="rest"
      width="wide"
      head={head}
      meta={<span aria-hidden="true">{formatDay(day)}</span>}
      title={REST_TITLE}
      titleAs="h2"
      stub={ahead ? <Stub onClick={onAhead}>{START_AHEAD}</Stub> : undefined}
    >
      {next === null ? null : <p className="es-prep__next">{nextPrep(next)}</p>}
      {ahead ? <p>{REST_AHEAD}</p> : null}
      <Links>
        <TextLink to="/map">{LINK_MAP}</TextLink> <TextLink to="/evidence">{LINK_EVIDENCE}</TextLink>
      </Links>
    </Ticket>
  )
}

export interface DoneTicketProps {
  day: LocalDay
  lines: readonly LineView[]
  right: number
  total: number
  /** The first day after today on which an idea that can be served falls due. */
  next: LocalDay | null
  /** What the stub offers: another list of what is due, a review ahead, or nothing. */
  more: { label: string; run: () => void } | null
  ahead: boolean
}

/**
 * The close of a prep: the ticket with its tally and the lines with what became of each idea, and beside it the printer, which prints
 * the prep's counts and the day of the next prep. The counts are what happened on this device, so they are [measured].
 */
export function DoneTicket({ day, lines, right, total, next, more, ahead }: DoneTicketProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <>
      <Ticket
        as="section"
        className="es-prep__ticket"
        data-state="done"
        width="wide"
        head={head}
        meta={<span aria-hidden="true">{formatDay(day)}</span>}
        title={DONE_TITLE}
        titleAs="h2"
        stub={more === null ? undefined : <Stub onClick={more.run}>{more.label}</Stub>}
      >
        <h3 className="es-item__verdict es-prep__verdict" tabIndex={-1} ref={heading}>
          <span>{tallyLine(right, total)}</span>
        </h3>
        {ahead ? <p>{AHEAD_NOTE}</p> : null}
        <PrepLines lines={lines} label="What became of each idea" />
        {next === null ? null : <p className="es-prep__next">{nextPrep(next)}</p>}
        <Links>
          <TextLink to="/map">{LINK_MAP}</TextLink> <TextLink to="/evidence">{LINK_EVIDENCE}</TextLink>
        </Links>
      </Ticket>
      <PrinterTape
        className="es-prep__tape"
        label="The prep, printed"
        lines={[
          { id: 'tickets', label: 'tickets', value: <Readout value={total} tag="measured" source="this prep" size="sm" /> },
          { id: 'right', label: 'right', value: <Readout value={right} tag="measured" source="this prep" size="sm" /> },
          ...(next === null ? [] : [{ id: 'next', label: 'next prep', value: formatDay(next) }]),
        ]}
      />
    </>
  )
}
