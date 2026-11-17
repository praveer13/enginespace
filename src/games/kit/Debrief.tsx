import { useEffect, useRef, type ReactNode } from 'react'
import type { Verdict } from './verdict'
import './debrief.css'

/*
 * The debrief (REDESIGN §2.6), a component of its own, so a lesson can place it under the instrument and the game's page inside the dock.
 * It keeps its parts: the verdict word, then the ways on straight under it (the one primary control first, so the move in hand is on the
 * screen with the verdict at any width, P5), then one plain sentence that names the engine term in bold, and under it what the game adds: your guess beside the model's answer, yours against the reference, "In vLLM today" with the
 * source file and symbol.
 *
 * The verdict word comes from the grade's own data (REDESIGN §2.4): "Passed" or "Not yet" where the level has a pass rule, and
 * "Finished (practice)" where it has only a number to beat. Nothing else is printed as a verdict.
 */

export interface DebriefProps {
  verdict: Verdict
  /** The one plain sentence: what the run did, and why. */
  sentence: ReactNode
  /** The ways on: the primary control first, then the local ones ("Run again", "New numbers"). */
  actions: ReactNode
  /** What the game adds under the ways on. */
  children?: ReactNode
  className?: string
}

export function Debrief({ verdict, sentence, actions, children, className }: DebriefProps) {
  // The frame moves focus to the result when the run ends; a result that loads after that (a lazy chunk) takes it on to its verdict, so a
  // keyboard and a screen reader land on the word, and a learner whose focus is elsewhere is not pulled away.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const here = document.activeElement
    const holder = heading.current?.closest('[data-result]') ?? null
    if (here === null || here === document.body || here === holder) heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section className={className === undefined ? 'es-debrief' : `es-debrief ${className}`} data-verdict={verdict} aria-label="Result">
      <h3 ref={heading} className="es-debrief__verdict" tabIndex={-1} data-result-heading="">
        {verdict}
      </h3>
      <div className="es-debrief__actions">{actions}</div>
      <p className="es-debrief__sentence">{sentence}</p>
      {children === undefined ? null : <div className="es-debrief__body">{children}</div>}
    </section>
  )
}
