import type { Claim } from '@es/schema'
import { Icon } from '@/design/components/Glyph'
import { Popover } from '@/design/components/Popover'
import { TextLink } from '@/design/components/TextLink'
import { decimals, sourceAnchor, staleSince, type RenderEnv } from './model'

/*
 * A lesson's claims (REDESIGN §2.5, P6): provenance present and quiet. A claim in a sentence is a small numbered mark after its phrase,
 * never a chip inside the line. The mark is a link to its entry under "Sources" at the lesson's end, and on activation (a click, Enter or
 * Space, never focus alone) it opens a sheet with the fact, its value and tag word, the source and its own words, and the date it was
 * checked. "Sources" lists every claim the lesson cites, numbered in the order the prose first cites them.
 */

/** A claim's value as words: "16 tokens", "v0.11.0". */
function valueText(claim: Claim): string {
  const value = typeof claim.value === 'number' ? claim.value.toLocaleString('en-US', { maximumFractionDigits: decimals(claim.value) }) : claim.value
  return claim.unit === undefined ? value : `${value} ${claim.unit}`
}

/** The tag word a claim is read with: a synthetic number says so. */
const tagWord = (claim: Claim): string => (claim.synthetic === true ? 'synthetic' : claim.tag)

/** Where a claim comes from, as phrasing content. */
function Origin({ claim }: { claim: Claim }) {
  if (claim.source !== undefined) {
    return (
      <>
        <TextLink href={claim.source.url}>{claim.source.title}</TextLink>
        <span className="es-claimref__quote">“{claim.source.quote}”</span>
      </>
    )
  }
  if (claim.derived !== undefined) {
    return (
      <span>
        Worked out: <code>{claim.derived.formula}</code>
      </span>
    )
  }
  return <span>Made by the course’s seeded model.</span>
}

/** The lines of a claim, as phrasing content, for its sheet and for its entry in Sources. */
function ClaimLines({ claim, today }: { claim: Claim; today: string }) {
  const stale = staleSince(claim, today)
  return (
    <>
      <span className="es-claimref__fact">{claim.text}</span>
      <span className="es-claimref__value">
        <span className="font-numeric">{valueText(claim)}</span>
        <span className="es-claimref__tag" data-tag={tagWord(claim)}>
          {tagWord(claim)}
        </span>
      </span>
      <span className="es-claimref__origin">
        <Origin claim={claim} />
      </span>
      <span className="es-claimref__checked">
        Checked <time dateTime={claim.verifiedAt}>{claim.verifiedAt}</time>
        {stale === null ? null : (
          <span className="es-claimref__stale">
            <Icon name="alert" />
            stale since <time dateTime={stale}>{stale}</time>
          </span>
        )}
      </span>
    </>
  )
}

/** The numbered mark after a claim's phrase. */
export function ClaimMark({ id, env, inSentence = false }: { id: string; env: RenderEnv; inSentence?: boolean }) {
  const n = env.marks?.get(id) ?? 0
  const claim = env.claims?.get(id)
  const mark = (
    <Popover
      variant="mark"
      inline
      href={`#${sourceAnchor(n)}`}
      className="es-claimmark"
      trigger={<span className="es-claimmark__n">{n}</span>}
      triggerLabel={`Source ${n}`}
      title={`Source ${n}`}
      triggerData={{ 'data-claim': id }}
    >
      {claim === undefined ? (
        <span className="es-claimref__fact">{env.claims === null ? 'The sources did not load. Reload the page to see this one.' : 'This source is missing.'}</span>
      ) : (
        <ClaimLines claim={claim} today={env.today} />
      )}
      <a className="es-claimref__all" href={`#${sourceAnchor(n)}`}>
        In the list of sources
      </a>
    </Popover>
  )
  if (!inSentence) return mark
  // A value in the sentence: the claim's value, kept on one line with its mark.
  return (
    <span className="es-claimed">
      <span className="es-claimvalue">{claim === undefined ? '…' : valueText(claim)}</span>
      {mark}
    </span>
  )
}

/** A claim inside a panel that has no Sources of its own (the model's card): its value and its tag word, in the sentence. */
export function ClaimInline({ id, env }: { id: string; env: RenderEnv }) {
  const claim = env.claims?.get(id)
  if (claim === undefined) return <code>{id}</code>
  return (
    <span className="es-claiminline" data-claim={id}>
      <span className="font-numeric">{valueText(claim)}</span> <span className="es-claimref__tag">{tagWord(claim)}</span>
    </span>
  )
}

/** Every claim the lesson cites, in its numbers' order, at the lesson's end. */
export function Sources({ env }: { env: RenderEnv }) {
  const marks = [...(env.marks ?? new Map<string, number>())]
  if (marks.length === 0) return null
  return (
    <section className="es-lesson__sources" id="sources" aria-labelledby="sources-title">
      <h2 id="sources-title" className="es-lesson__section-title">
        Sources
      </h2>
      <ol className="es-sources">
        {marks.map(([id, n]) => {
          const claim = env.claims?.get(id)
          return (
            <li key={id} id={sourceAnchor(n)} className="es-sources__entry" data-claim={id} value={n}>
              {claim === undefined ? <span className="es-claimref__fact">{env.claims === null ? 'The sources did not load.' : 'This source is missing.'}</span> : <ClaimLines claim={claim} today={env.today} />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
