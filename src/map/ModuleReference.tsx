import { Fragment, type ReactNode } from 'react'
import type { Claim, CompiledCard } from '@es/schema'
import { TextLink } from '@/design/components/TextLink'
import { useClaims } from '@/content/load'
import { useCard } from '@/content/load-lessons'
import { cardClaimIds, decimals, kernelspaceLabel, kernelspaceTitle, kernelspaceUrl, staleSince, type RenderEnv } from '@/content/render/model'
import { moduleCode } from '@/progress/words'
import { Prose } from '@/content/render/Prose'
import { leavesOut, type Part } from './moduleWords'

/*
 * The Reference at the foot of a module page (REDESIGN section 3.3): closed disclosures that hold what the module says about the engines,
 * the hours, the model's card and the sources. Every one is in the document when it is closed, so find-in-page, a link to its anchor and the
 * Markdown export all find it. A claim in the words is its value and its tag word, in the sentence; the sources are listed at the end.
 */

/** A claim's value as words: "16 tokens", "v0.11.0". */
function valueText(claim: Claim): string {
  const value = typeof claim.value === 'number' ? claim.value.toLocaleString('en-US', { maximumFractionDigits: decimals(claim.value) }) : claim.value
  return claim.unit === undefined ? value : `${value} ${claim.unit}`
}

/** A claim's value in the line: a commit that names an engine's pin is set as code, like a path the reader opens in that tree. */
const valueNode = (claim: Claim): ReactNode => (/^[0-9a-f]{7,40}$/.test(String(claim.value)) ? <code>{valueText(claim)}</code> : valueText(claim))

const tagWord = (claim: Claim): string => (claim.synthetic === true ? 'synthetic' : claim.tag)

/** The environment the Reference's prose is drawn with: a claim is its value and its tag word. */
function referenceEnv(env: RenderEnv): RenderEnv {
  const plain: RenderEnv = { ...env, ksTitles: true }
  plain.claim = (id) => {
    const claim = plain.claims?.get(id)
    if (claim === undefined) return <code data-claim={id}>{id}</code>
    return (
      <span className="es-module__claim" data-claim={id}>
        {valueNode(claim)} <span className="es-module__tag">{tagWord(claim)}</span>
      </span>
    )
  }
  return plain
}

/** One closed disclosure. */
export function Disclosure({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <details className="es-module__part" id={id}>
      <summary className="es-module__summary">
        <h3 className="es-module__part-title">{title}</h3>
      </summary>
      <div className="es-module__prose">{children}</div>
    </details>
  )
}

/** The model's card: what it models, what it leaves out and what it is checked against. */
function ModelPart({ id, env }: { id: string; env: RenderEnv }) {
  const card = useCard(id)
  const loaded: CompiledCard | null = card.status === 'ready' ? card.value : null
  const needsClaims = loaded !== null && env.claims === null && cardClaimIds(loaded).size > 0
  const claims = useClaims(needsClaims)
  const own = referenceEnv(claims.status === 'ready' ? { ...env, claims: claims.value } : env)
  return (
    <Disclosure id={`model-${id}`} title={leavesOut(loaded?.title)}>
      {card.status === 'error' ? (
        <p>The card would not load. Reload the page.</p>
      ) : loaded === null ? (
        <p role="status">Loading the card</p>
      ) : (
        <>
          <Prose body={loaded.intro} env={own} />
          {(
            [
              ['What it models', loaded.models],
              ['What it leaves out', loaded.ignores],
              ['What it is checked against', loaded.calibrated],
            ] as const
          ).map(([title, body]) => (
            <Fragment key={title}>
              <h4 className="es-module__card-title">{title}</h4>
              <Prose body={body} env={own} />
            </Fragment>
          ))}
        </>
      )}
    </Disclosure>
  )
}

export interface ReferenceProps {
  parts: readonly Part[]
  env: RenderEnv
  /** Hours and the lanes' hours, already in words ("10 h in the browser"): the page's own, printed as estimates. */
  hours: ReactNode | null
  /** What the module builds on and pins, as a line, or null. */
  builds: { prereqs: readonly string[]; pins: readonly string[] } | null
  /** The claims the module's words cite, in the order they are first cited. */
  cited: readonly string[]
}

export function Reference({ parts, env, hours, builds, cited }: ReferenceProps) {
  const own = referenceEnv(env)
  return (
    <section aria-labelledby="reference" className="es-module__reference">
      <h2 id="reference" className="es-module__h">
        Reference
      </h2>
      <div className="es-module__parts">
        {parts.map((part, at) =>
          part.kind === 'card' ? (
            <ModelPart key={`c${at}`} id={part.id} env={env} />
          ) : (
            <Disclosure key={`p${at}`} id={`ref-${at}`} title={part.title}>
              <Prose body={part.flows} env={own} />
              {part.subsections?.map((sub) => (
                <Fragment key={sub.title}>
                  <h4 className="es-module__card-title">{sub.title}</h4>
                  <Prose body={sub.flows} env={own} />
                </Fragment>
              ))}
              {at === 0 && builds !== null ? <BuildsOn {...builds} /> : null}
            </Disclosure>
          ),
        )}
        {hours === null ? null : (
          <Disclosure id="ref-hours" title="Hours">
            {hours}
          </Disclosure>
        )}
        {cited.length === 0 ? null : (
          <Disclosure id="sources" title="Sources">
            <ol className="es-module__sources">
              {cited.map((id) => (
                <li key={id} data-claim={id}>
                  <SourceLine claim={env.claims?.get(id)} loaded={env.claims !== null} today={env.today} />
                </li>
              ))}
            </ol>
          </Disclosure>
        )}
      </div>
    </section>
  )
}

/** The engines a module is read at, by name. A pin the table does not hold reads as its id. */
const PIN_NAMES: Readonly<Record<string, string>> = { vllm: 'vLLM', sglang: 'SGLang', 'nano-vllm': 'nano-vllm', 'mini-sglang': 'Mini-SGLang', 'inside-vllm': 'the post “Inside vLLM”' }

const joined = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** One prerequisite: a kernelspace lesson by its title, linked; another module of this course by its code, linked. */
function Prereq({ reference }: { reference: string }) {
  if (!reference.startsWith('ks:')) return <TextLink to={`/m/${reference}`}>{moduleCode(reference)}</TextLink>
  const url = kernelspaceUrl(reference)
  const title = kernelspaceTitle(reference)
  const label = title === null ? kernelspaceLabel(reference) : `“${title}”`
  return url === null ? <>{label}</> : <TextLink href={url}>{label}</TextLink>
}

function BuildsOn({ prereqs, pins }: { prereqs: readonly string[]; pins: readonly string[] }) {
  const named = pins.map((pin) => (Object.hasOwn(PIN_NAMES, pin) ? PIN_NAMES[pin] : pin))
  return (
    <p>
      {prereqs.length === 0 ? null : (
        <>
          Advised first:{' '}
          {prereqs.map((ref, at) => (
            <Fragment key={ref}>
              {at === 0 ? '' : at === prereqs.length - 1 ? ' and ' : ', '}
              <Prereq reference={ref} />
            </Fragment>
          ))}
          .
        </>
      )}
      {pins.length === 0 ? null : <> Read at fixed versions of {joined(named)}.</>}
    </p>
  )
}

function SourceLine({ claim, loaded, today }: { claim: Claim | undefined; loaded: boolean; today: string }) {
  if (claim === undefined) return <span>{loaded ? 'This source is missing.' : 'The sources did not load. Reload the page to see them.'}</span>
  const stale = staleSince(claim, today)
  return (
    <>
      <span className="es-module__fact">{claim.text}</span>{' '}
      <span className="es-module__claim">
        {valueNode(claim)} <span className="es-module__tag">{tagWord(claim)}</span>
      </span>
      <span className="es-module__origin">
        {claim.source !== undefined ? (
          <>
            <TextLink href={claim.source.url}>{claim.source.title}</TextLink>, “{claim.source.quote}”
          </>
        ) : claim.derived !== undefined ? (
          <>
            Worked out: <code>{claim.derived.formula}</code>
          </>
        ) : (
          'Made by the course’s seeded model.'
        )}{' '}
        Checked <time dateTime={claim.verifiedAt}>{claim.verifiedAt}</time>
        {stale === null ? null : (
          <>
            , stale since <time dateTime={stale}>{stale}</time>
          </>
        )}
      </span>
    </>
  )
}
