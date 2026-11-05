/*
 * The two ticks of the log, drawn on one 24-unit grid with one stroke weight (DESIGN.md, "Shapes"): a hollow notch where an order was due
 * and a solid stub where it was sent. They differ by shape and not by colour (GAMES.md §2.6, "Materials": "Due and sent ticks differ by
 * glyph"), and they are the same two marks the timeline sheet draws.
 */
export function DueMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-mark="due">
      <rect x="8" y="3" width="8" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}

export function SentMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-mark="sent">
      <rect x="8" y="3" width="8" height="18" fill="currentColor" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}
