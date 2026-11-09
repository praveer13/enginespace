import type { ReactNode } from 'react'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { useDocumentTitle } from '../load'
import './content.css'
import { kernelspaceLabel, kernelspaceUrl, titled } from './model'

/*
 * What the module page and the lesson page share (W0-T09): the head of a page, the two columns it lays out in, and the
 * tickets that stand in for it while it loads, when there is nothing at its address, and when it did not load. The head
 * is a breadcrumb, the page's name stamped as the `h1`, and its labels on tape. The columns are the printer's tape with the
 * page's facts, and the run of tickets that the printer has fed.
 */

/**
 * The page's id on a ticket's head line, for the eye. Every ticket of a page carries it, so assistive tech skips it: the
 * page's name and its breadcrumb give it once.
 */
export function Scope({ id }: { id: string }) {
  return <span aria-hidden="true">{id}</span>
}

export interface Crumb {
  to: string
  label: string
}

export interface PageHeaderProps {
  crumbs: readonly Crumb[]
  /** The place this page is, after the crumbs: it is not a link. */
  current: string
  title: string
  /** Short labels torn off the roll: the page's status, for one. */
  tapes?: readonly string[]
}

export function PageHeader({ crumbs, current, title, tapes = [] }: PageHeaderProps) {
  return (
    <header className="es-doc__header">
      <nav aria-label="Breadcrumb" className="es-doc__crumbs">
        <ol>
          {crumbs.map((crumb) => (
            <li key={crumb.to}>
              <TextLink to={crumb.to}>{crumb.label}</TextLink>
            </li>
          ))}
          <li aria-current="page">{current}</li>
        </ol>
      </nav>
      <h1 className="es-doc__title">{title}</h1>
      {tapes.length > 0 ? (
        <ul className="es-doc__tapes" aria-label="Status">
          {tapes.map((tape, at) => (
            <TapeLabel key={tape} as="li" tilt={at % 2 === 0 ? 'left' : 'right'}>
              {tape}
            </TapeLabel>
          ))}
        </ul>
      ) : null}
    </header>
  )
}

/** The page's facts on the printer's tape, then its tickets. On a wide screen the tape stands beside them. */
export function Columns({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="es-doc__columns">
      <div className="es-doc__side">{side}</div>
      <div className="es-doc__tickets">{children}</div>
    </div>
  )
}

/** Links side by side, as a line of the printer's tape holds them. */
export function LinkRow({ children }: { children: ReactNode }) {
  return <span className="es-doc__refs">{children}</span>
}

/** What a page leans on: another module of this course (`tr1`), or a kernelspace lesson (`ks:T5.L7`) that links out. */
export function RefLink({ to }: { to: string }) {
  if (!to.startsWith('ks:')) return <TextLink to={`/m/${to}`}>{to}</TextLink>
  const url = kernelspaceUrl(to)
  // The link and its mark stay on one line: a mark alone on the next line reads as a stray.
  return <span className="es-ks">{url === null ? kernelspaceLabel(to) : <TextLink href={url}>{kernelspaceLabel(to)}</TextLink>}</span>
}

export type NoticeProps =
  | { kind: 'loading'; title: string; ticket: string; what: string }
  | { kind: 'missing'; title: string; ticket: string; message: string; back: Crumb }
  | { kind: 'failed'; title: string; ticket: string; message: string }

/**
 * A page that has no content to show yet: still printing (the printer's dots and a status line), nothing at this address
 * (a blank ticket, and the way back), or failed (a red line, and a stub that reloads). The page's `h1` is there in each, so
 * a screen reader always has the page's name.
 */
export function PageNotice(props: NoticeProps) {
  const { title, ticket } = props
  // A page that is only printing keeps the route's own title; one that is missing or failed says so.
  useDocumentTitle(props.kind === 'loading' ? null : titled(title))
  return (
    <div className="es-doc">
      <h1 className="es-doc__title">{title}</h1>
      <div className="es-doc__tickets">
        {props.kind === 'loading' ? (
          <Ticket as="section" width="wide" head={ticket} state="loading" loadingLabel={`Printing the ${props.what}`} />
        ) : props.kind === 'missing' ? (
          <Ticket as="section" width="wide" head={ticket} state="empty" empty={props.message} stub={<Stub to={props.back.to}>{props.back.label}</Stub>} />
        ) : (
          <Ticket
            as="section"
            width="wide"
            head={ticket}
            state="error"
            error={props.message}
            stub={<Stub onClick={() => window.location.reload()}>Reload page</Stub>}
          />
        )}
      </div>
    </div>
  )
}
