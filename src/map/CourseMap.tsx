import { useId } from 'react'
import type { CourseMap, IndexModule } from '@es/schema'
import { ContinueLink } from '@/design/components/Header'
import { TextLink } from '@/design/components/TextLink'
import type { Progress } from '@/progress/derive'
import type { LessonState, Step } from '@/progress/next'
import { LEGENDS } from '@/progress/words'
import type { Due } from './due'
import { MAP } from './copy'
import { Stop } from './Stop'
import { sentenceOf } from './sentence'
import { formatHours, hoursSplit, LANE_ORDER } from './summary'
import './map.css'

/*
 * Course (`/map`; REDESIGN 3.2): one column of modules in course order on a track line, opened by the way on. The way on is `nextStep`'s
 * answer told back as a sentence, with Continue beside it and, when they apply, a quiet line for the reviews due and one for the
 * earlier lessons not finished. Under it come the hours in all and by lane, the two legend lines and the sentence that nothing is
 * locked. The modules are an ordered list, so a reader who cannot see the track gets the course in its order.
 *
 * The page takes everything it shows as props: the course index, the compiled map, the progress derived from the ledger and the way
 * on. It reads no store; `Map.tsx` is the route.
 */

export interface CourseMapViewProps {
  modules: readonly IndexModule[]
  map: CourseMap
  /** What the ledger holds, derived. Null until the map is there to read it against. */
  progress: Progress | null
  /** True once the ledger has been read. Until then the page says so, and does not say the learner has done nothing. */
  ready: boolean
  /** The way on, `nextStep`'s answer: null until the ledger has been read. */
  step?: Step | null
  /** "Last time you ...", or null when no lesson has an event yet. */
  last?: string | null
  /** Each lesson's state by id. */
  states?: ReadonlyMap<string, LessonState>
  /** The reviews due, or null when none is, or the deck has not been read. */
  due?: Due | null
}

const NO_STATES: ReadonlyMap<string, LessonState> = new Map()

/** The way on, at the top of the page. It waits for the ledger, and says so, so it never offers a place it has not read. */
function WayOn({ step, last, ready, due }: { step: Step | null; last: string | null; ready: boolean; due: Due | null }) {
  if (!ready || step === null) {
    return (
      <div className="es-course__way" data-state="reading">
        <p className="es-course__sentence" role="status">
          {MAP.way.reading}
        </p>
      </div>
    )
  }
  return (
    <div className="es-course__way">
      <div className="es-course__say">
        <p className="es-course__sentence">
          <span className="es-course__mark" role="img" aria-label={MAP.way.mark} />
          <span>{sentenceOf(step, last)}</span>
        </p>
        {due !== null || step.skipped > 0 ? (
          <p className="es-course__asides">
            {due === null ? null : (
              <span>
                <TextLink to="/today">{MAP.way.reviews(due.count, due.minutes)}</TextLink>
              </span>
            )}
            {step.skipped > 0 ? <span>{MAP.way.skipped(step.skipped)}</span> : null}
          </p>
        ) : null}
      </div>
      <ContinueLink target={step} emphasis="primary" minutes={step.minutes} className="es-course__continue" />
    </div>
  )
}

const num = (value: number) => <span className="es-course__num">{formatHours(value)}</span>

/** The hours of the course in all and by lane, one line, and what the numbers are. */
function Hours({ modules }: Pick<CourseMapViewProps, 'modules'>) {
  const split = hoursSplit(modules)
  const names = { B: MAP.hours.browser, L: MAP.hours.laptop, F: MAP.hours.gpu }
  const lanes = LANE_ORDER.filter((lane) => split.lanes[lane] > 0)
  return (
    <p className="es-course__hours">
      {num(split.published)} {MAP.hours.published}:{' '}
      {lanes.map((lane, at) => (
        <span key={lane}>
          {at > 0 ? ', ' : ''}
          {num(split.lanes[lane])} {names[lane]}
        </span>
      ))}
      .{split.planned > split.published ? <> {num(split.planned)} {MAP.hours.planned}.</> : null} {MAP.hours.note.before} <span className="es-course__tag">{MAP.hours.estimated}</span> {MAP.hours.note.between} <span className="es-course__tag">{MAP.hours.derived}</span>.
    </p>
  )
}

export function CourseMapView({ modules, map, progress, ready, step = null, last = null, states = NO_STATES, due = null }: CourseMapViewProps) {
  const listId = useId()
  // The marker waits for the ledger, so it never sits on the wrong module for a moment.
  const here = ready ? (step?.module ?? null) : null
  const details = new Map(map.modules.map((module) => [module.id, module]))
  return (
    <div className="es-course" data-page="map">
      <h1 className="es-course__h1">{MAP.title}</h1>
      <WayOn step={step} last={last} ready={ready} due={due} />
      <div className="es-course__notes">
        <div className="es-course__facts">
          <Hours modules={modules} />
          <p className="es-course__nothing">{MAP.nothing}</p>
        </div>
        <div className="es-course__legends">
          <p>{LEGENDS.lesson}</p>
          <p>{LEGENDS.skill}</p>
        </div>
      </div>
      <section aria-labelledby={listId} className="es-course__modules">
        <h2 id={listId} className="sr-only">
          {MAP.modules}
        </h2>
        <ol className="es-course__rows">
          {modules.map((module) => (
            <Stop
              key={module.id}
              module={module}
              detail={details.get(module.id)}
              lessons={map.lessons.filter((lesson) => lesson.module === module.id)}
              states={states}
              progress={progress?.modules.get(module.id)}
              ready={ready}
              here={module.id === here}
              step={step}
            />
          ))}
        </ol>
      </section>
    </div>
  )
}

