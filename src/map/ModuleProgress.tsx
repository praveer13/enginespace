import type { ReactNode } from 'react'
import { GAMES } from '@es/play'
import { rosterEntry } from '@es/play/roster'
import type { MapKc } from '@es/schema'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { Scope } from '@/content/render/Page'
import type { LoopProgress, ModuleProgress, Tally } from '@/progress/derive'
import { KCS, LOOP } from './copy'
import { Pip } from './Pips'
import './map.css'

/*
 * What a module page shows of the learner (W1-T06): the module's loop, which is the same five steps in every module (ARCHITECTURE §3.1:
 * Predict, Play, Build, Prove, Keep) with what the learner has done in each, and the module's knowledge components with the state of
 * each. Both are drawn from what `src/progress` derives from the learner's events when the page draws, and neither stores anything.
 *
 * The page hands these components the module's games and labs as its own file lists them, and the progress; they read no store.
 */

/* ------------------------------------------------------------------------------------------------------------------ */
/* The loop                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface LoopProps {
  /** The module's id, for the ticket's head line. */
  module: string
  games: readonly string[]
  labs: readonly string[]
  /** Undefined until progress has been derived. */
  progress?: ModuleProgress
  /** True once the ledger has been read. */
  ready: boolean
}

/** A count in the printer's dots. */
const Num = ({ children }: { children: ReactNode }) => <span className="es-steps__num">{children}</span>

/** A part of a line of progress that is not broken across lines. */
const Seg = ({ children }: { children: ReactNode }) => <span className="es-steps__seg">{children}</span>

/** Attempts and what they earned: "2 credited of 4 tried", and the ones at part credit after them. Each part is whole on its line. */
function Tried({ tally }: { tally: Tally }) {
  if (tally.tried === 0) return <>{LOOP.nothing}</>
  return (
    <>
      <Seg>
        <Num>{tally.credited}</Num> {LOOP.credited} {LOOP.of} <Num>{tally.tried}</Num> {LOOP.tried}
      </Seg>
      {tally.partial > 0 ? (
        <Seg>
          <Num>{tally.partial}</Num> {LOOP.partial}
        </Seg>
      ) : null}
    </>
  )
}

/** What a step offers, on a line of its own under what it asks: the word for it, then its links. */
function Offer({ word, children }: { word: string; children: ReactNode }) {
  return (
    <span className="es-steps__offer">
      <span className="es-steps__offer-word">{word}</span>
      {children}
    </span>
  )
}

/** The games of a module: a link to each that is built, and the wave that brings each that is not (never a link to a page that is not there). */
function Games({ games }: { games: readonly string[] }) {
  if (games.length === 0) return <span className="es-steps__offer">{LOOP.noGame}</span>
  return (
    <Offer word={LOOP.games}>
      {games.map((id) => {
        const entry = rosterEntry(id)
        const title = entry?.title ?? id
        return GAMES.has(id) ? (
          <TextLink key={id} to={`/play/${id}`}>
            {title}
          </TextLink>
        ) : (
          <span key={id}>{entry === undefined ? title : `${title}, ${LOOP.arrives} W${entry.wave}`}</span>
        )
      })}
    </Offer>
  )
}

function Labs({ labs }: { labs: readonly string[] }) {
  if (labs.length === 0) return <span className="es-steps__offer">{LOOP.noLab}</span>
  return (
    <Offer word={LOOP.labs}>
      {labs.map((id) => (
        <TextLink key={id} to={`/labs/${id}`}>
          {id}
        </TextLink>
      ))}
    </Offer>
  )
}

function Step({ name, what, offer, done }: { name: string; what: ReactNode; offer?: ReactNode; done: ReactNode }) {
  return (
    <li className="es-steps__item">
      <span className="es-steps__name">{name}</span>
      <span className="es-steps__what">
        {what}
        {offer}
      </span>
      <span className="es-steps__done">{done}</span>
    </li>
  )
}

export function Loop({ module, games, labs, progress, ready }: LoopProps) {
  const loop: LoopProgress | undefined = progress?.loop
  const reading = !ready || loop === undefined
  const held = (done: () => ReactNode): ReactNode => (reading ? LOOP.reading : done())
  const counts = progress?.counts
  return (
    <Ticket as="section" width="wide" head={<Scope id={module} />} meta={LOOP.term} title={LOOP.title} titleAs="h2" className="es-c-block" data-block="loop">
      <p>{LOOP.lede}</p>
      <ol className="es-steps">
        <Step
          name={LOOP.steps.predict.name}
          what={LOOP.steps.predict.what}
          done={held(() => (
            <>
              <Num>{loop?.predicted ?? 0}</Num> {LOOP.made}
            </>
          ))}
        />
        <Step name={LOOP.steps.play.name} what={LOOP.steps.play.what} offer={<Games games={games} />} done={held(() => (loop === undefined ? null : <Tried tally={loop.play} />))} />
        <Step name={LOOP.steps.build.name} what={LOOP.steps.build.what} offer={<Labs labs={labs} />} done={held(() => (loop === undefined ? null : <Tried tally={loop.build} />))} />
        <Step name={LOOP.steps.prove.name} what={LOOP.steps.prove.what} done={held(() => (loop?.proved === true ? LOOP.proved : LOOP.notYet))} />
        <Step
          name={LOOP.steps.keep.name}
          what={
            <>
              <TextLink to="/today">{LOOP.today}</TextLink> {LOOP.steps.keep.what}
            </>
          }
          done={held(() =>
            loop === undefined || counts === undefined ? null : (
              <>
                <Tried tally={loop.keep} />
                {counts.total > 0 ? (
                  <Seg>
                    <Num>{counts.kept}</Num> {LOOP.of} <Num>{counts.total}</Num> {LOOP.kept}
                  </Seg>
                ) : null}
              </>
            ),
          )}
        />
      </ol>
    </Ticket>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The knowledge components                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface KcsProps {
  module: string
  /** The module's KCs from the compiled map, in the graph's order. */
  kcs: readonly MapKc[]
  progress?: ModuleProgress
  ready: boolean
}

export function Kcs({ module, kcs, progress, ready }: KcsProps) {
  const states = new Map(progress?.kcs.map((kc) => [kc.id, kc.state]))
  const counts = progress?.counts
  const waiting = kcs.some((kc) => kc.planned !== undefined)
  return (
    <Ticket as="section" width="wide" head={<Scope id={module} />} meta={KCS.term} title={KCS.title} titleAs="h2" className="es-c-block" data-block="kcs">
      <p>{KCS.lede}</p>
      {waiting ? <p className="es-kcs__note">{KCS.planned}</p> : null}
      <ul className="es-kcs">
        {kcs.map((kc) => {
          const state = ready ? (states.get(kc.id) ?? 'none') : 'none'
          return (
            <li key={kc.id} className="es-kcs__row" data-kc={kc.id} data-state={ready ? state : 'reading'}>
              <Pip state={state} />
              <span className="es-kcs__can">{kc.description}</span>
              <span className="es-kcs__state">{ready ? KCS.states[state] : KCS.reading}</span>
            </li>
          )
        })}
      </ul>
      {ready && counts !== undefined && counts.total > 0 ? (
        <p className="es-kcs__total">
          <Seg>
            <Num>{counts.earned}</Num> {KCS.count.of} <Num>{counts.total}</Num> {KCS.count.earned}
          </Seg>
          <Seg>
            <Num>{counts.kept}</Num> {KCS.count.kept}
          </Seg>
        </p>
      ) : null}
    </Ticket>
  )
}
