import { Fragment, type ReactNode } from 'react'
import { splitCode } from './text'

/*
 * Text with the engine's own names in it. The lifecycle model writes a symbol, a path or a place in backticks, as the course's content
 * does, and this sets each in the code face. It is how a label, an explanation and a quote reach the screen: React text, never markup.
 */

/** A line with its code spans set in the mono face. */
export function Code({ children }: { children: string }): ReactNode {
  return (
    <>
      {splitCode(children).map((piece, index) =>
        piece.code ? (
          <code key={index} className="es-type-mono [overflow-wrap:anywhere]">
            {piece.text}
          </code>
        ) : (
          <Fragment key={index}>{piece.text}</Fragment>
        ),
      )}
    </>
  )
}
