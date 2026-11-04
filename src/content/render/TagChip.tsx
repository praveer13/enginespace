import type { ClaimTag } from '@es/schema'
import { TapeLabel } from '@/design/components/TapeLabel'
import './content.css'

/*
 * One of the four tags (ARCHITECTURE §0) that an author wrote after a number: a strip of masking tape with the word in
 * marker, stuck on the sentence. A number that has a source is printed by a ClaimChip instead, so the two read apart:
 * tape is the author's word for a typed number, and a printed slip is a number with a source. A screen reader hears it as
 * "tagged estimated", so that the word reads as the tag of the number before it.
 */
export function TagChip({ tag }: { tag: ClaimTag }) {
  return (
    <span className="es-tag" data-tag={tag}>
      <TapeLabel size="sm" tilt="none">
        <span className="sr-only">tagged </span>
        {tag}
      </TapeLabel>
    </span>
  )
}
