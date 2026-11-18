import { Link } from 'react-router'
import type { IndexModule, MapLesson, MapModule } from '@es/schema'
import { Icon } from '@/design/components/Glyph'
import { TextLink } from '@/design/components/TextLink'
import { kernelspaceUrl } from '@/content/render/model'
import type { ModuleProgress } from '@/progress/derive'
import { needsWords as lanesWords } from '@/progress/next'
import type { LessonState, Step } from '@/progress/next'
import { LESSON_WORDS } from '@/progress/words'
import { MAP } from './copy'
import { lessonCounts, needsWords, outcomeClause, printedId } from './summary'

/*
 * One module of the course as a row on the track (REDESIGN 3.2). The row says, in words, what the module needs (its hours and where they
 * are worked) and where the learner stands in it (lessons done, skills passed). The module the way on points into is open and lists its
 * lessons, the next one under the marker. A module that is not published yet says so and is not a link. Nothing is locked: every
 * published row opens its module, and what a module builds on is advice.
 */

export interface StopProps {
  module: IndexModule
  /** The module's prerequisites, outcome and KCs. Undefined if the map did not list it. */
  detail?: MapModule
  /** The module's built lessons, in course order. */
  lessons: readonly MapLesson[]
  /** Each lesson's state by id: empty until the ledger has been read. */
  states: ReadonlyMap<string, LessonState>
  /** What the ledger holds of the module. Undefined until progress has been derived. */
  progress?: ModuleProgress
  /** True once the ledger has been read. */
  ready: boolean
  /** The module the way on points into: its row is open and carries the marker. */
  here: boolean
  /** The way on's answer, for the lesson that carries the marker. */
  step: Step | null
}

/** What a module builds on: kernelspace lessons, which link out, and modules of this course, which open. */
function BuildsOn({ prereqs }: { prereqs: readonly string[] }) {
  if (prereqs.length === 0) return null
  const lessons = prereqs.filter((prereq) => prereq.startsWith('ks:'))
  const modules = prereqs.filter((prereq) => !prereq.startsWith('ks:'))
  const parts = [
    ...(lessons.length === 0
      ? []
      : [
          <span key="ks" className="es-course__group">
            {MAP.kernelspace}{' '}
            {lessons.map((lesson, at) => {
              const label = lesson.replace(/^ks:/, '')
              const url = kernelspaceUrl(lesson)
              return (
                <span key={lesson}>
                  {at > 0 ? ', ' : ''}
                  {url === null ? label : <TextLink href={url}>{label}</TextLink>}
                </span>
              )
            })}
          </span>,
        ]),
    ...modules.map((module) => (
      <TextLink key={module} to={`/m/${module}`}>
        {printedId(module)}
      </TextLink>
    )),
  ]
  return (
    <p className="es-course__builds">
      {MAP.buildsOn}{' '}
      {parts.map((part, at) => (
        <span key={at}>
          {at > 0 ? (at === parts.length - 1 ? ' and ' : ', ') : ''}
          {part}
        </span>
      ))}
    </p>
  )
}

/** The module's lessons: number, title, minutes, what each needs and its state; the next one carries the marker. */
function Lessons({ module, lessons, states, step, ready }: Pick<StopProps, 'lessons' | 'states' | 'step' | 'ready'> & { module: string }) {
  return (
    <ol className="es-course__lessons" aria-label={MAP.lessonsOf(printedId(module))}>
      {lessons.map((lesson, at) => {
        const state = states.get(lesson.id) ?? 'not-started'
        const now = ready && step?.lesson === lesson.id
        return (
          <li key={lesson.id} className="es-course__lesson" data-state={ready ? state : undefined} data-at={now ? 'now' : undefined}>
            <span className="es-course__lesson-no">{at + 1}</span>
            <span className="es-course__lesson-main">
              <Link to={lesson.route} className="es-course__lesson-link">
                {lesson.title}
              </Link>
              {now ? (
                <span className="es-course__next">
                  <span className="es-course__mark" aria-hidden="true" />
                  {MAP.next}
                </span>
              ) : null}
            </span>
            <span className="es-course__lesson-meta">
              {lesson.minutes} min · {lanesWords(lesson.needs)}
            </span>
            {ready ? (
              <span className="es-course__lesson-state">
                {state === 'done' ? <Icon name="check" className="es-course__tick" /> : null}
                {LESSON_WORDS[state]}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export function Stop({ module, detail, lessons, states, progress, ready, here, step }: StopProps) {
  const id = printedId(module.id)
  const published = module.status !== 'planned'
  const counts = lessonCounts(lessons, states)
  const skills = detail?.kcs.length ?? 0
  const passed = progress?.counts.earned ?? 0
  const standing = !published
    ? MAP.state.unpublished
    : [
        ...(lessons.length === 0 ? [] : [ready ? MAP.state.lessons(counts.done, counts.total) : MAP.state.lessonsTotal(counts.total)]),
        ...(skills === 0 ? [] : [ready && progress !== undefined ? MAP.state.skills(passed, skills) : MAP.state.skillsTotal(skills)]),
      ].join(' · ')
  const allDone = ready && published && lessons.length > 0 && counts.done === counts.total
  const heading = (
    <>
      <span className="es-course__id">{id}</span> <span className="es-course__name">{module.title}</span>
    </>
  )
  return (
    <li className="es-course__row" data-module={module.id} data-status={module.status} data-open={here ? 'true' : undefined} data-done={allDone ? 'true' : undefined}>
      <span className="es-course__node" data-at={here ? 'now' : undefined} aria-hidden="true">
        {here ? <span className="es-course__mark" /> : null}
      </span>
      <div className="es-course__head">
        <h3 className="es-course__title">
          {published ? (
            <Link to={module.route} className="es-course__link">
              {heading}
            </Link>
          ) : (
            heading
          )}
        </h3>
        <p className="es-course__needs">{needsWords(module, MAP.needs)}</p>
        {detail?.outcome === undefined ? null : (
          <p className="es-course__outcome">
            {MAP.outcome} {outcomeClause(detail.outcome)}.
          </p>
        )}
        {here ? null : <BuildsOn prereqs={detail?.prereqs ?? []} />}
      </div>
      <p className="es-course__standing" data-published={published}>
        {standing}
      </p>
      {here ? <Lessons module={module.id} lessons={lessons} states={states} step={step} ready={ready} /> : null}
      {here ? <BuildsOn prereqs={detail?.prereqs ?? []} /> : null}
    </li>
  )
}
