import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Glyph'
import '../parts.css'

/*
 * An inline note in a lesson's reading (REDESIGN 2.5): paper inside the column, edged all round in a hairline, headed by a drawn
 * mark and its words, in ink. No coloured side stripe, and no colour that carries the kind: the heading says it.
 *
 *   - `watch`: "Watch out", a warning card;
 *   - `same-idea`: "The same idea in the OS", the one sanctioned home of an analogy, with where it breaks;
 *   - `in-engine`: "In vLLM today", what the pinned engine does, at the end of a debrief.
 */

export type NoteKind = 'watch' | 'same-idea' | 'in-engine'

const HEADS: Record<NoteKind, { title: string; icon: IconName }> = {
  watch: { title: 'Watch out', icon: 'alert' },
  'same-idea': { title: 'The same idea in the OS', icon: 'arrow' },
  'in-engine': { title: 'In vLLM today', icon: 'pin' },
}

export interface NoteProps {
  kind: NoteKind
  /** A heading of its own, in place of the kind's ("In SGLang today"). */
  title?: ReactNode
  children: ReactNode
  /** `same-idea`: where the analogy stops holding. */
  breaks?: ReactNode
  className?: string
}

export function Note({ kind, title, children, breaks, className }: NoteProps) {
  const head = HEADS[kind]
  return (
    <div className={clsx('es-note', className)} data-kind={kind} role="note">
      <p className="es-note__title">
        <Icon name={head.icon} className="es-note__mark" />
        {title ?? head.title}
      </p>
      <div className="es-note__body">{children}</div>
      {breaks ? (
        <p className="es-note__breaks">
          <strong>Where it breaks:</strong> {breaks}
        </p>
      ) : null}
    </div>
  )
}
