import { labName } from '@/content/render/model'
import type { ReactNode } from 'react'
import { GAMES } from '@es/play'
import { rosterEntry } from '@es/play/roster'
import { Icon } from '@/design/components/Glyph'
import { TextLink } from '@/design/components/TextLink'
import type { ModuleProgress } from '@/progress/derive'
import { MODULE } from './copy'

/*
 * What a module page shows of the learner (REDESIGN section 3.3): the outcome sentences, each with a tick once its knowledge components are
 * passed, and the four rows under the lessons, Game, Build, Prove and Keep, each with what the learner has done in it. Both are drawn from
 * what `src/progress` derives from the learner's events when the page draws; neither stores anything. The page hands these components the
 * module's games and labs as its own file lists them, and the progress; they read no store.
 */

export interface OutcomesProps {
  /** The module's outcome sentences, in the file's order. */
  outcomes: readonly string[]
  /** For each outcome, whether its knowledge components are all passed (outcomes.ts). */
  passed: readonly boolean[]
}

/** The outcomes the learner can do, then the ones still to come. A heading appears only over a group that has something in it. */
export function Outcomes({ outcomes, passed }: OutcomesProps) {
  const done = outcomes.filter((_, at) => passed[at])
  const todo = outcomes.filter((_, at) => !passed[at])
  return (
    <section aria-labelledby="outcomes" className="es-module__outcomes" data-block="outcomes">
      {done.length === 0 ? null : (
        <>
          <h2 id="outcomes" className="es-module__h">
            {MODULE.can}
          </h2>
          <ul className="es-module__list" data-done="true">
            {done.map((outcome) => (
              <li key={outcome}>
                <span className="es-module__tick" data-done="true" aria-hidden="true">
                  <Icon name="check" />
                </span>
                {outcome}
              </li>
            ))}
          </ul>
        </>
      )}
      {todo.length === 0 ? null : (
        <>
          <h2 id={done.length === 0 ? 'outcomes' : 'outcomes-to-come'} className="es-module__h">
            {MODULE.will}
          </h2>
          <ul className="es-module__list">
            {todo.map((outcome) => (
              <li key={outcome}>
                <span className="es-module__tick" aria-hidden="true" />
                {outcome}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export interface LabRef {
  id: string
  /** The lane it is worked in: B and L are Build, F is Prove. */
  lane: string
  /** True when the lab has no page yet. */
  waiting: boolean
}

export interface RowsProps {
  games: readonly string[]
  labs: readonly LabRef[]
  progress?: ModuleProgress
  ready: boolean
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="es-module__row" data-row={name.toLowerCase()}>
      <dt>{name}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** Game, Build, Prove and Keep, under the lessons: a row appears only where the module has something in it. */
export function Rows({ games, labs, progress, ready }: RowsProps) {
  const loop = ready ? progress?.loop : undefined
  const counts = ready ? progress?.counts : undefined
  const build = labs.filter((lab) => lab.lane !== 'F')
  const prove = labs.filter((lab) => lab.lane === 'F')
  const lab = (ref: LabRef): ReactNode => (ref.waiting ? <span key={ref.id}>{labName(ref.id)}: {MODULE.waiting}</span> : <TextLink key={ref.id} to={`/labs/${ref.id}`}>{labName(ref.id)}</TextLink>)
  return (
    <dl className="es-module__rows" aria-label="What else is in this module">
      {games.length === 0 ? null : (
        <Row name={MODULE.rows.game}>
          {games.map((id) => {
            const entry = rosterEntry(id)
            const title = entry?.title ?? id
            const built = GAMES.get(id)
            if (built === undefined) return <span key={id}>{title}: {MODULE.waiting}</span>
            return (
              <span key={id} className="es-module__game">
                <TextLink to={`/play/${id}`}>{title}</TextLink>: {plural(built.levels.length, 'level')}
                {loop !== undefined && games.length === 1 && loop.play.tried > 0 ? `, ${loop.play.credited} passed of ${loop.play.tried} tried` : ''}
              </span>
            )
          })}
        </Row>
      )}
      {build.length === 0 ? null : (
        <Row name={MODULE.rows.build}>
          {build.map(lab)}
          {loop !== undefined && loop.build.tried > 0 ? <span>{`${loop.build.credited} passed of ${loop.build.tried} tried`}</span> : null}
        </Row>
      )}
      {prove.length === 0 ? null : (
        <Row name={MODULE.rows.prove}>
          {prove.map(lab)}
          {loop === undefined ? null : <span>{loop.proved ? MODULE.proved : MODULE.notYet}</span>}
        </Row>
      )}
      <Row name={MODULE.rows.keep}>
        <TextLink to="/today">{MODULE.review}</TextLink>
        {loop !== undefined && loop.keep.tried > 0 ? <span>{`${loop.keep.credited} passed of ${loop.keep.tried} tried`}</span> : null}
        <span>
          {counts === undefined || counts.total === 0 ? MODULE.keepWhat : `${counts.kept} of ${plural(counts.total, 'skill')} kept. ${MODULE.keepWhat}`}
        </span>
      </Row>
    </dl>
  )
}
