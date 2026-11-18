import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from './Glyph'
import '../parts.css'

/*
 * The goal line: always visible under a game's title strip, one sentence in its parts (REDESIGN 2.6, P4). The aim, what you
 * control, the number to beat or the pass rule, then when the level ends. "Goal: serve all 15 requests and recompute as few tokens
 * as you can. You choose which request to admit and which page to evict. The reference's cost is the number to beat. Ends when all
 * 15 are served." When the end is reached the line says so, with a check and its words.
 */

export interface GoalLineProps {
  aim: ReactNode
  control: ReactNode
  /** The number to beat, or the pass rule with its tolerance. */
  target: ReactNode
  ends: ReactNode
  /** The end condition is met: what happened, in words ("All 15 served."). */
  met?: ReactNode
  className?: string
}

export function GoalLine({ aim, control, target, ends, met, className }: GoalLineProps) {
  return (
    <p className={clsx('es-goal', className)} data-met={met ? '' : undefined}>
      <strong className="es-goal__lead">Goal:</strong> <span data-part="aim">{aim}</span> <span data-part="control">{control}</span>{' '}
      <span data-part="target">{target}</span> <span data-part="ends">{ends}</span>
      {met ? (
        <span className="es-goal__met">
          <Icon name="check" />
          {met}
        </span>
      ) : null}
    </p>
  )
}
