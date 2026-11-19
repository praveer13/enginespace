import type { ReactNode } from 'react'

/*
 * A guess's question is a string, written with its numbers' tags in brackets ("4,096 tokens [estimated]"). On the page a tag is no bracket
 * and no chip (REDESIGN §2.8, the Quiet Provenance Rule): the number before it carries the dotted underline (`es-num`, lesson.css), and the
 * tag is hidden text for a screen reader, as a tagged number in the lesson's prose is (Prose.tsx).
 */

const TAG = /\s*\[(measured|derived|estimated|synthetic|unverified)\]/g
/** The last number in a run of text, with what comes before it and after it. */
const LAST_NUMBER = /^([\s\S]*?)(\d(?:[\d,.]*\d)?%?)(\D*)$/

export function Tagged({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = []
  let from = 0
  for (const match of text.matchAll(TAG)) {
    const before = text.slice(from, match.index)
    const number = LAST_NUMBER.exec(before)
    const tag = match[1]
    if (number === null) out.push(before, <span key={match.index} className="sr-only">{` (${tag})`}</span>)
    else
      out.push(
        number[1],
        <span key={match.index} className="es-num" data-tag={tag}>
          {number[2]}
          <span className="sr-only">{` (${tag})`}</span>
        </span>,
        number[3],
      )
    from = match.index + match[0].length
  }
  out.push(text.slice(from))
  return out
}
