import clsx from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import { Icon } from './Glyph'
import { Marker } from './Marker'
import '../parts.css'

/*
 * The section rail: where you are in a lesson (REDESIGN 2.5). A nav holding an ordered list of the lesson's sections (Run, Read,
 * Test, Keep), each with its state in words and the learner's own answers, Read's parts by title under it, and the minutes left.
 * The current entry carries `aria-current="step"` and the marker with its word "now". A part seen on this visit has a check and
 * the word "seen" for a screen reader. Nothing is locked: every entry is a link to its place on the page.
 *
 * `strip` is the same rail below 64rem: one 44 px button that says where you are ("Lesson 1 · Read 2 of 6") over a bar with a
 * segment per section, which opens the same list. Escape closes it and hands focus back to the button.
 *
 * States: hover (the entry takes the well), focus (the ink ring), active (pressed into the well), current (the marker).
 */

export interface RailPart {
  id: string
  title: ReactNode
  href: string
  /** An inline run: it reads "Run: <level title>". */
  run?: boolean
  seen?: boolean
}

export interface RailSection {
  id: string
  title: ReactNode
  href: string
  /** The section's state in words: "passed", "tried", "3 of 3: passed". Reading has none. */
  state?: ReactNode
  /** The learner's own answers: "you said 300 pages". */
  answers?: readonly ReactNode[]
  parts?: readonly RailPart[]
}

export interface SectionRailProps {
  /** The nav's name: "This lesson". Two rails on one page need two names. */
  label: string
  sections: readonly RailSection[]
  /** The id of the current section or part. */
  current: string
  /** The minutes the rest of the lesson takes. */
  minutesLeft?: number
  variant?: 'rail' | 'strip'
  /** `strip`: where you are, in words: "Lesson 1 · Read 2 of 6". */
  summary?: ReactNode
  defaultOpen?: boolean
  className?: string
  'data-force'?: { id: string; state: 'hover' | 'focus' | 'active' }
}

export function SectionRail({ label, sections, current, minutesLeft, variant = 'rail', summary, defaultOpen = false, className, 'data-force': force }: SectionRailProps) {
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()
  const currentSection = sections.findIndex((section) => section.id === current || section.parts?.some((part) => part.id === current))
  const entry = (id: string, href: string, children: ReactNode, kind: 'section' | 'part') => {
    const isCurrent = id === current
    return (
      <a
        href={href}
        className="es-srail__link"
        data-kind={kind}
        aria-current={isCurrent ? 'step' : undefined}
        data-force={force?.id === id ? force.state : undefined}
        onClick={variant === 'strip' ? () => setOpen(false) : undefined}
      >
        {children}
        {isCurrent ? <Marker className="es-srail__now" /> : null}
      </a>
    )
  }
  const list = (
    <ol className="es-srail__list" id={listId} hidden={variant === 'strip' && !open}>
      {sections.map((section) => (
        <li key={section.id} className="es-srail__section">
          {entry(
            section.id,
            section.href,
            <span className="es-srail__text">
              <span className="es-srail__title">{section.title}</span>
              {section.state ? <span className="es-srail__state">{section.state}</span> : null}
            </span>,
            'section',
          )}
          {section.answers?.length ? (
            <ul className="es-srail__answers">
              {section.answers.map((answer, index) => (
                <li key={index}>{answer}</li>
              ))}
            </ul>
          ) : null}
          {section.parts?.length ? (
            <ol className="es-srail__parts">
              {section.parts.map((part) => (
                <li key={part.id}>
                  {entry(
                    part.id,
                    part.href,
                    <span className="es-srail__text">
                      <span className="es-srail__title">
                        {part.run ? 'Run: ' : null}
                        {part.title}
                      </span>
                      {part.seen ? (
                        <span className="es-srail__seen">
                          <Icon name="check" />
                          <span className="sr-only">seen</span>
                        </span>
                      ) : null}
                    </span>,
                    'part',
                  )}
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  )
  const left = minutesLeft !== undefined ? <p className="es-srail__left">About {minutesLeft} min left</p> : null
  if (variant === 'rail')
    return (
      <nav className={clsx('es-srail', className)} aria-label={label}>
        {list}
        {left}
      </nav>
    )
  return (
    <nav
      className={clsx('es-srail', className)}
      data-variant="strip"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        setOpen(false)
        event.currentTarget.querySelector<HTMLButtonElement>('.es-srail__toggle')?.focus()
      }}
    >
      <button type="button" className="es-srail__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <span className="es-srail__summary">{summary}</span>
        <span className="es-srail__bar" aria-hidden="true">
          {sections.map((section, index) => (
            <span key={section.id} className="es-srail__segment" data-at={index < currentSection ? 'before' : index === currentSection ? 'now' : undefined} />
          ))}
        </span>
      </button>
      {list}
      {open ? left : null}
    </nav>
  )
}
