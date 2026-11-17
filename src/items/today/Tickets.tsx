import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LocalDay } from '@es/ledger'
import { Button } from '@/design/components/Button'
import { ContinueLink } from '@/design/components/Board'
import { Readout } from '@/design/components/Readout'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { TextLink } from '@/design/components/TextLink'
import { Sheet } from '@/design/components/Sheet'
import type { Pointer } from '@/settings/store'
import {
  AHEAD_NOTE,
  EMPTY_BODY,
  EMPTY_TITLE,
  EMPTY_UNSERVED_BODY,
  EMPTY_UNSERVED_TITLE,
  KEPT_LABEL,
  KEPT_LEGEND,
  LINK_EVIDENCE,
  LINK_MAP,
  LOAD_LABEL,
  nextAfter,
  nextReview,
  nextPrep,
  REST_AHEAD,
  REST_TITLE,
  START_AHEAD,
  tallyLine,
} from './copy'
import { PrepLines } from './PrepList'
import type { IdeaRow } from './PrepList'

/*
 * The sheets of the page that are not the set being asked and not the list that waits: the one that waits while the ledger is read, the
 * one that says nothing is passed yet, the one that says nothing is due, and the one that closes a review. Each is a sheet of the same
 * paper (src/design/components/Sheet.tsx), none says how much is overdue, and each offers the way on: the amber Continue, from
 * `nextStep` (REDESIGN 2.4), the only amber control on its screen. A review that has more to do offers it as a quiet button beside.
 */

/** A sheet still reading: while the ledger is read, or, with `label`, while the code of the family that serves the next question loads. */
export function LoadingTicket({ label = LOAD_LABEL }: { label?: string }) {
  return <Sheet as="section" className="es-prep__ticket" width="full" state="loading" loadingLabel={label} />
}

/** The way on: Continue, or Start, from the pointer. Absent when the way on is this page (every lesson is done and something is due). */
function Way({ way }: { way: Pointer | null }) {
  if (way === null) return null
  return (
    <div className="es-way">
      <ContinueLink target={way} emphasis="primary" {...(way.minutes === undefined ? {} : { minutes: way.minutes })} />
    </div>
  )
}

function Links({ children }: { children: ReactNode }) {
  return <p className="es-prep__links">{children}</p>
}

/** Nothing is passed yet, or what is passed has no review questions yet. The way on is Continue (REDESIGN 2.4). */
export function EmptyTicket({ unserved, way }: { unserved: boolean; way: Pointer | null }) {
  return (
    <Sheet as="section" className="es-prep__ticket" data-state="empty" width="full" title={unserved ? EMPTY_UNSERVED_TITLE : EMPTY_TITLE} titleAs="h2">
      <p>{unserved ? EMPTY_UNSERVED_BODY : EMPTY_BODY}</p>
      <Way way={way} />
      <Links>
        <TextLink to="/map">{LINK_MAP}</TextLink>
      </Links>
    </Sheet>
  )
}

/** Nothing is due that can be served: when the next review is, the way on, and a review ahead where there is something to look at. */
export function RestTicket({ next, ahead, onAhead, way }: { next: LocalDay | null; ahead: boolean; onAhead: () => void; way: Pointer | null }) {
  return (
    <Sheet as="section" className="es-prep__ticket" data-state="rest" width="full" title={REST_TITLE} titleAs="h2">
      {next === null ? null : <p className="es-prep__next">{nextPrep(next)}</p>}
      <Way way={way} />
      {ahead ? (
        <div className="es-prep__more">
          <p>{REST_AHEAD}</p>
          {way === null ? <PrimaryButton onClick={onAhead}>{START_AHEAD}</PrimaryButton> : <Button onClick={onAhead}>{START_AHEAD}</Button>}
        </div>
      ) : null}
      <Links>
        <TextLink to="/map">{LINK_MAP}</TextLink> <TextLink to="/evidence">{LINK_EVIDENCE}</TextLink>
      </Links>
    </Sheet>
  )
}

export interface DoneTicketProps {
  rows: readonly IdeaRow[]
  right: number
  total: number
  /** The first day after today on which an idea that can be served falls due. */
  next: LocalDay | null
  /** What a quiet button offers: another list of what is due, a review ahead, or nothing. */
  more: { label: string; run: () => void } | null
  ahead: boolean
  way: Pointer | null
}

/**
 * The close of a review: the tally, the next review, the amber Continue and what became of each idea. The tally and the way on come
 * first, so that the way on is inside the first screen on a phone. The counts are what happened on this device, so they are [measured].
 */
export function DoneTicket({ rows, right, total, next, more, ahead, way }: DoneTicketProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <Sheet as="section" className="es-prep__ticket" data-state="done" width="full">
      <h2 className="es-item__verdict es-prep__verdict" tabIndex={-1} ref={heading}>
        <span>{tallyLine(right, total)}</span>
      </h2>
      {next === null ? null : <p className="es-prep__next">{nextReview(next)}</p>}
      {ahead ? <p>{AHEAD_NOTE}</p> : null}
      {way === null && more !== null ? <PrimaryButton onClick={more.run}>{more.label}</PrimaryButton> : <Way way={way} />}
      {way !== null && more !== null ? (
        <div className="es-prep__more">
          <Button onClick={more.run}>{more.label}</Button>
        </div>
      ) : null}
      <PrepLines rows={rows} label="What became of each idea" />
      <Links>
        <TextLink to="/map">{LINK_MAP}</TextLink> <TextLink to="/evidence">{LINK_EVIDENCE}</TextLink>
      </Links>
    </Sheet>
  )
}

/** The quiet column: when the next review after this one is, and how many ideas are kept, with what "kept" means. */
export function Aside({ kept, next }: { kept: number; next: LocalDay | null }) {
  return (
    <aside className="es-prep__aside" aria-label="About your review">
      {next === null ? null : <p className="es-prep__after">{nextAfter(next)}</p>}
      <p className="es-prep__kept">
        <span>{KEPT_LABEL}</span> <Readout value={kept} tag="measured" source="this device" size="lg" className="es-item__num" />
      </p>
      <p className="es-prep__legend">{KEPT_LEGEND}</p>
    </aside>
  )
}
