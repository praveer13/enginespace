import { Fragment, type ReactNode } from 'react'
import type { CompiledBuildThis, CompiledInProduction } from '@es/schema'
import { Note } from '@/design/components/Note'
import { TextLink } from '@/design/components/TextLink'
import { inProductionTitle, stagesSentence, useKept } from './kept'
import { labName, pendingLab, type RenderEnv } from './model'
import { Prose } from './Prose'

/*
 * The two cards that a lesson names and that live in a file of their own (W2-T42, REDESIGN §2.5):
 *
 *   - an In-production card is "In vLLM today": what the pinned engines do about the lever the lesson plays, a list of flags and source lines for
 *     each, every item a claim. It is a note in the lesson's reading, set right after the run it explains, so it ends that run's debrief;
 *   - a Build-this card is the Build row in Keep: the lab the lesson leads to, the stages it prepares, what the learner builds, and the way in.
 *
 * Each cites its claims as the lesson's prose does: numbered marks that open their source, listed under Sources. The lesson's compiled block carries
 * the card's claim ids, so those numbers are known before the card's file has loaded (`cites`, scripts/content/build.ts).
 */

/** The words of an In-production card: what the lever is, then the flags and source lines of each engine. */
export function InProductionBody({ card, env }: { card: CompiledInProduction; env: RenderEnv }) {
  const many = card.engines.length > 1
  return (
    <>
      <Prose body={card.intro} env={env} />
      {card.engines.map(({ engine, words }) => (
        <Fragment key={engine}>
          {many ? (
            <p className="es-inprod__engine" data-engine={engine}>
              {engine}
            </p>
          ) : null}
          <Prose body={words} env={env} />
        </Fragment>
      ))}
    </>
  )
}

/** "In vLLM today" in a lesson: a note that waits for its card, and says so if it never arrives. */
export function InEngineNote({ id, env }: { id: string; env: RenderEnv }) {
  const kept = useKept(id, 'in-production', env)
  if (kept.status !== 'ready') {
    return (
      <Note kind="in-engine" className="es-inprod">
        <p className="es-inprod__wait" role={kept.status === 'loading' ? 'status' : undefined}>
          {kept.status === 'loading' ? 'Reading the engine’s source…' : kept.status === 'error' ? 'This note would not load. Check your connection and reload the page.' : 'This note is not on the site.'}
        </p>
      </Note>
    )
  }
  return (
    <Note kind="in-engine" className="es-inprod" title={inProductionTitle(kept.card)}>
      <InProductionBody card={kept.card} env={kept.env} />
    </Note>
  )
}

/** The Build row from a Build-this card: the lab's name, what the learner builds, the stages, and the way in. */
export function BuildThisBody({ card, env, heading }: { card: CompiledBuildThis; env: RenderEnv; heading: (name: ReactNode) => ReactNode }) {
  const pending = pendingLab(card.lab)
  return (
    <>
      {heading(pending === null ? <TextLink to={`/labs/${card.lab}`}>{card.title}</TextLink> : `Build: ${card.title}`)}
      <div className="es-lesson__build es-build">
        <Prose body={card.intro} env={env} />
        <p>
          {labName(card.lab)}. {stagesSentence(card)}{' '}
          {pending === null ? <TextLink to={`/labs/${card.lab}`}>Open the lab</TextLink> : <span>Not published yet.</span>}
        </p>
      </div>
    </>
  )
}

/** The Build row of Keep for a Build-this card. */
export function BuildRowFromCard({ id, env }: { id: string; env: RenderEnv }) {
  const kept = useKept(id, 'build-this', env)
  if (kept.status !== 'ready') {
    return (
      <>
        <h3 id={`keep-build-${id}`} className="es-lesson__keep-title">
          Build
        </h3>
        <p className="es-lesson__build" role={kept.status === 'loading' ? 'status' : undefined}>
          {kept.status === 'loading' ? 'Reading the lab’s card…' : kept.status === 'error' ? 'The lab’s card would not load. Check your connection and reload the page.' : 'This lab’s card is not on the site.'}
        </p>
      </>
    )
  }
  return (
    <BuildThisBody
      card={kept.card}
      env={kept.env}
      heading={(name) => (
        <h3 id={`keep-build-${kept.card.lab}`} className="es-lesson__keep-title">
          {name}
        </h3>
      )}
    />
  )
}
