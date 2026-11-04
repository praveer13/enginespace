import type { Claim } from '@es/schema'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { TextLink } from '@/design/components/TextLink'
import './content.css'
import { decimals, readoutUnit, staleSince, type RenderEnv } from './model'
import { TagChip } from './TagChip'

/*
 * A claim in a sentence (`{{claim:id}}`, ARCHITECTURE §4.4): the number printed on a slip, and under it where it comes from.
 * The number goes through the readout, in the printer's dots with its tag. Beneath it, the source's title (a link to the
 * page it was read from), the day it was verified and, past its TTL, "stale since" in the ribbon's red with a mark, so the
 * warning is a word and a shape and never only a colour. A fact needs no hover and no script to show where it comes from.
 *
 * A claim with no source says why: a synthetic number says it comes from the course's synthetic world, and a derived one
 * shows its formula. If the claims file could not be had, or has no such claim, the slip names the claim and says so.
 */

export function ClaimChip({ id, env }: { id: string; env: RenderEnv }) {
  const claim = env.claims?.get(id)
  if (claim === undefined) {
    const unavailable = env.claims === null
    return (
      <span className="es-claim" data-claim={id} data-state={unavailable ? 'unavailable' : 'unknown'}>
        <span className="es-claim__value">
          <code>{id}</code>
        </span>
        <span className="es-claim__trace">{unavailable ? 'the claims did not load' : 'no such claim'}</span>
      </span>
    )
  }

  const stale = staleSince(claim, env.today)
  return (
    <span
      className="es-claim"
      data-claim={claim.id}
      data-tag={claim.tag}
      data-state={stale === null ? 'fresh' : 'stale'}
      data-synthetic={claim.synthetic === true ? 'true' : undefined}
      title={claim.text}
    >
      <span className="es-claim__value">
        <ClaimValue claim={claim} />
      </span>
      <span className="es-claim__trace">
        <Provenance claim={claim} />
        <span className="es-claim__sep" aria-hidden="true">
          {' · '}
        </span>
        <span className="es-claim__verified">
          verified <time dateTime={claim.verifiedAt}>{claim.verifiedAt}</time>
        </span>
        {stale === null ? null : (
          <span className="es-claim__stale">
            <Icon name="alert" className="es-claim__stale-mark" />
            stale since <time dateTime={stale}>{stale}</time>
          </span>
        )}
      </span>
    </span>
  )
}

/** The number through the readout, or a word or range in code with its tag on tape. */
function ClaimValue({ claim }: { claim: Claim }) {
  if (typeof claim.value !== 'number') {
    return (
      <>
        <code className="es-claim__text">{claim.value}</code>
        {claim.unit === undefined ? null : <span className="es-claim__unit">{claim.unit}</span>}
        <TagChip tag={claim.tag} />
      </>
    )
  }
  const unit = readoutUnit(claim.unit)
  return (
    <>
      <Readout value={claim.value} digits={decimals(claim.value)} unit={unit} tag={claim.synthetic === true ? 'synthetic' : claim.tag} />
      {claim.unit !== undefined && unit === undefined ? <span className="es-claim__unit">{claim.unit}</span> : null}
    </>
  )
}

/** Where the number comes from: its source, the world it was made in, or the arithmetic that gave it. */
function Provenance({ claim }: { claim: Claim }) {
  if (claim.source !== undefined) {
    return (
      <cite className="es-claim__source">
        <TextLink href={claim.source.url}>{claim.source.title}</TextLink>
      </cite>
    )
  }
  if (claim.synthetic === true) {
    return (
      <span className="es-claim__source">
        synthetic world, {claim.tag}
      </span>
    )
  }
  if (claim.derived !== undefined) {
    return (
      <span className="es-claim__source">
        derived: <code>{claim.derived.formula}</code>
      </span>
    )
  }
  return <span className="es-claim__source">no source</span>
}
