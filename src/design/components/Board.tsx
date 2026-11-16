import clsx from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Icon } from './Glyph'

/*
 * The board: the site's navigation along the top, and the kick-plate below the page (REDESIGN §2.3). The nameplate links home, the
 * places sit beside it (Course, Games, Review, Progress), and the way on stands at the right: the outline Continue, whose words and link
 * are `nextStep`'s (src/progress/next.ts), read from the pointer so that no page has to open the ledger to label it. The page you are on
 * is marked current. Below the page, the kick-plate carries About, Sources and changes, and Settings.
 *
 * On a phone (under 48rem) the places fold behind a button labelled Navigation, and Continue keeps its first word: the nameplate, Start
 * or Continue, and the button share one row. The button says whether the list is open (`aria-expanded`), Escape closes it and gives the
 * button back its focus, and choosing a place closes it.
 *
 * States: hover (the link darkens and underlines), focus (the ring), active (pressed), current (the page you are on).
 */

export interface BoardLink {
  to: string
  label: string
  /** A link to a place inside another link's page ("/about#numbers"): a plain link, never marked as the current page. */
  within?: boolean
}

export interface BoardProps {
  /** The landmark's name: "Primary", "Footer". */
  label: string
  links: readonly BoardLink[]
  /** The nameplate: the house's name, linking home. */
  brand?: BoardLink
  variant?: 'board' | 'kickplate'
  /** What stands at the right of the board: the header's Continue. */
  action?: ReactNode
  /** Fold the links behind a Navigation button on a phone. */
  fold?: boolean
  className?: string
}

export function Board({ label, links, brand, variant = 'board', action, fold = false, className }: BoardProps) {
  const listId = useId()
  const { pathname } = useLocation()
  // The list is open on the page it was opened on: a new page closes it, because the place was chosen.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null)
  return (
    <nav
      aria-label={label}
      className={clsx('es-board', className)}
      data-variant={variant}
      data-fold={fold ? (open ? 'open' : 'closed') : undefined}
      onKeyDown={
        fold && open
          ? (event) => {
              if (event.key !== 'Escape') return
              setOpen(false)
              event.currentTarget.querySelector<HTMLButtonElement>('.es-board__toggle')?.focus()
            }
          : undefined
      }
    >
      {brand ? (
        <NavLink to={brand.to} end className="es-board__plate">
          {brand.label}
        </NavLink>
      ) : null}
      {fold ? (
        <button type="button" className="es-board__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
          <Icon name="menu" className="es-board__toggle-icon" />
          Navigation
        </button>
      ) : null}
      <ul id={listId} className="es-board__links">
        {links.map(({ to, label: text, within }) => (
          <li key={to}>
            {within ? (
              <Link to={to} className="es-board__link">
                {text}
              </Link>
            ) : (
              <NavLink to={to} className="es-board__link">
                {text}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
      {action ? <div className="es-board__action">{action}</div> : null}
    </nav>
  )
}

/** What Continue says and where it goes: `nextStep`'s answer, as the pointer keeps it. */
export interface ContinueTarget {
  href: string
  /** "Continue: TR2 lesson 1, read why", or "Start: TR1 lesson 1". */
  label: string
  /** "Start" or "Continue": all that a phone's header has room for. The full label stays the link's name. */
  word: string
}

/**
 * Continue: in the header an outline control, because the amber fill belongs to the move in hand (REDESIGN §2.4); its name is the full
 * label at every width, and on a phone's header it shows the first word alone. A page with no move in hand (a module) shows it as the
 * viewport's one amber fill (`primary`), with its minutes. NextStep draws the same control where a page carries the lesson's parts.
 */
export function ContinueLink({ target, emphasis = 'outline', minutes, className }: { target: ContinueTarget; emphasis?: 'outline' | 'primary'; minutes?: number; className?: string }) {
  return (
    <Link to={target.href} className={clsx('es-board__next', className)} data-way={target.word === 'Start' || target.word === 'Continue' ? 'continue' : 'local'} data-emphasis={emphasis}>
      <span className="es-board__next-label">{target.label}</span>
      {minutes === undefined ? null : <span className="es-board__next-minutes">about {minutes} min</span>}
      <span className="es-board__next-word" aria-hidden="true">
        {target.word}
      </span>
      <Icon name="arrow" className="es-board__next-arrow" />
    </Link>
  )
}

/** The way to the Course page: "Open the course", with what it holds beside it. It is on the front page, and wherever a run ends. */
export function MenuLink({ to = '/map', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={clsx('es-menu-link', className)}>
      <span className="es-menu-link__words">Open the course</span>
      <span className="es-menu-link__term">every module</span>
      <Icon name="arrow" className="es-menu-link__arrow" />
    </Link>
  )
}
