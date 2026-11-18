import type { Claim } from '@es/schema'
import { TextLink } from '@/design/components/TextLink'
import { useClaims } from '@/content/load'

/*
 * The source half of a part's popover (PartPopover.tsx): the part's claim, read from the course's claims file, as its value, its tag word,
 * and a link out to the file and symbol at the pinned commit. A lazy chunk: it loads the first time a part's popover opens, with the claims.
 */

/** A claim's value as words: "16 tokens". */
function valueWords(claim: Claim): string {
  const value = typeof claim.value === 'number' ? claim.value.toLocaleString('en-US') : claim.value
  return claim.unit === undefined ? value : `${value} ${claim.unit}`
}

/** The tag word a claim is read with: a synthetic number says so. */
const tagWord = (claim: Claim): string => (claim.synthetic === true ? 'synthetic' : claim.tag)

/** The lines of a claim in a part's popover. */
export function SourceLines({ claim, inline = true }: { claim: Claim; inline?: boolean }) {
  const Part = inline ? 'span' : 'div'
  return (
    <>
      <Part className="es-partpop__value">
        <span className="font-numeric">{valueWords(claim)}</span>{' '}
        <span className="es-partpop__tag" data-tag={tagWord(claim)}>
          {tagWord(claim)}
        </span>
      </Part>
      <Part className="es-partpop__source">
        {claim.source !== undefined ? (
          <TextLink href={claim.source.url}>{claim.source.title}</TextLink>
        ) : claim.derived !== undefined ? (
          <>
            Worked out: <code>{claim.derived.formula}</code>
          </>
        ) : (
          'Made by the course’s seeded model.'
        )}
      </Part>
      <Part className="es-partpop__checked">
        Checked <time dateTime={claim.verifiedAt}>{claim.verifiedAt}</time>
      </Part>
    </>
  )
}

export default function PartSource({ claim: id, inline = true }: { claim: string; inline?: boolean }) {
  const claims = useClaims(true)
  const Part = inline ? 'span' : 'div'
  if (claims.status === 'loading') return <Part className="es-partpop__loading">Reading the source…</Part>
  if (claims.status === 'error') return <Part className="es-partpop__loading">The source did not load. Reload the page to see it.</Part>
  const claim = claims.value.get(id)
  if (claim === undefined) return <Part className="es-partpop__loading">This source is missing.</Part>
  return <SourceLines claim={claim} inline={inline} />
}
