import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { Claim, CompiledModule, IndexLesson, IndexModule, MapKc, MapLesson } from '@es/schema'
import { ContinueLink } from '@/design/components/Header'
import { Readout } from '@/design/components/Readout'
import { TextLink } from '@/design/components/TextLink'
import { useClaims, useDocumentTitle, useIndex } from '@/content/load'
import { useLessonRows, useModule } from '@/content/load-lessons'
import { useMap } from '@/content/load-map'
import { citedClaimIds, decimals, pendingLab, renderEnv, titled, todayIso } from '@/content/render/model'
import { MODULE } from '@/map/copy'
import { Outcomes, Rows, type LabRef } from '@/map/ModuleProgress'
import { needsLine, referenceParts, saysHours, twoSentences } from '@/map/moduleWords'
import { outcomesPassed } from '@/map/outcomes'
import { Reference } from '@/map/ModuleReference'
import type { KcState, ModuleProgress } from '@/progress/derive'
import { needsWords, type LessonState, type Step } from '@/progress/next'
import { useProgress } from '@/progress/useProgress'
import { LEGENDS, LESSON_WORDS, moduleCode } from '@/progress/words'
import './module.css'

/*
 * /m/:module (REDESIGN section 3.3): a module's page, in the order a learner needs it. The title with its size beside it, two sentences of
 * what the module is and why, the amber button, and the lessons, all in the first screen. Beside the lessons, what you will be able to do,
 * each outcome with a tick once its knowledge components are passed. Under them the Game, Build, Prove and Keep rows, and last the Reference:
 * closed disclosures that hold the module's own essays, the hours, the model's card and the sources. Nothing about the module's metadata
 * stands above the lessons.
 *
 * The way on, the lessons' states, the ticks and the rows are derived from the learner's events and the compiled map each time the page draws,
 * and are never stored (src/progress). `ModuleView` is the page once it has its content, and takes everything it shows as props. A module that
 * `course.yaml` names and nobody has written yet ("planned") shows what the index knows of it.
 */

export function Component() {
  const { module: id = '' } = useParams()
  const index = useIndex()
  const module = useModule(id)
  const rows = useLessonRows(id)
  const loaded = module.status === 'ready' ? module.value : null
  const cites = loaded !== null && citedClaimIds(loaded.blocks).size > 0
  const claims = useClaims(cites)
  const map = useMap()
  const { ready, progress, next, last, lessons } = useProgress(map.status === 'ready' ? map.value : null)
  const [today] = useState(todayIso)
  const entry = index.status === 'ready' ? index.value.modules.find((candidate) => candidate.id === id) : undefined
  const title = loaded?.title ?? entry?.title ?? null
  useDocumentTitle(title === null ? null : titled(title))

  if (module.status === 'error' || (index.status === 'error' && loaded === null)) {
    return <Notice title="The module did not load" message="The module would not load. Check your connection and reload the page." />
  }
  if (module.status === 'loading' || index.status === 'loading' || rows.status === 'loading' || map.status === 'loading' || (cites && claims.status === 'loading')) {
    return <Notice title="Module" message="Loading the module" loading />
  }
  if (loaded === null && entry === undefined) {
    return <Notice title="Module not found" message={`No module called ${id}.`} back />
  }
  // A map that did not load leaves the ticks, the way on and the rows out; the rest of the page does not need it.
  const kcs = map.status === 'ready' ? map.value.kcs.filter((kc) => kc.module === id) : undefined
  return (
    <ModuleView
      id={id}
      module={loaded}
      entry={entry}
      lessons={rows.status === 'ready' ? rows.value : undefined}
      claims={claims.status === 'ready' ? claims.value : null}
      today={today}
      kcs={kcs}
      progress={progress?.modules.get(id)}
      ready={ready}
      way={map.status === 'ready' ? { step: next, last, states: lessons, lessons: map.value.lessons.filter((lesson) => lesson.module === id) } : undefined}
    />
  )
}

/** The page while the module loads, when there is none at the address, and when it did not load: its name as the `h1`, and a sentence. */
function Notice({ title, message, loading = false, back = false }: { title: string; message: string; loading?: boolean; back?: boolean }) {
  useDocumentTitle(loading ? null : titled(title))
  return (
    <div className="es-module" data-notice={loading ? 'loading' : 'missing'}>
      <h1 className="es-module__title">{title}</h1>
      <p className="es-module__sentences" role={loading ? 'status' : undefined}>
        {message}
      </p>
      {back ? <TextLink to="/map">Open the course</TextLink> : null}
    </div>
  )
}

export interface ModuleViewProps {
  id: string
  /** The module's compiled page, or null for a planned module that has no `module.md`. */
  module: CompiledModule | null
  /** The module's entry in the course index, and everything a planned module has. Undefined if the index did not load. */
  entry?: IndexModule
  /** The module's lesson rows from the lesson index, in order. Undefined if they did not load. */
  lessons?: readonly IndexLesson[]
  /** The claims by id, or null when they did not load: the Reference then says so. */
  claims: ReadonlyMap<string, Claim> | null
  today: string
  /** The module's KCs from the compiled map. Undefined when the map did not load, and the page then shows no ticks. */
  kcs?: readonly MapKc[]
  /** What the learner's ledger holds of the module, derived. Undefined until it has been. */
  progress?: ModuleProgress
  /** True once the ledger has been read. Until then the page says so, and does not say the learner has done nothing. */
  ready?: boolean
  /** The way on and each lesson's state, from the ledger and the map's lessons table. Undefined when the map did not load. */
  way?: ModuleWay
}

export interface ModuleWay {
  /** `nextStep`'s answer, or null until the ledger has been read. */
  step: Step | null
  last: string | null
  states: ReadonlyMap<string, LessonState>
  /** This module's rows of the lessons table, in order. */
  lessons: readonly MapLesson[]
}

/** The lesson the amber mark is on: the one `nextStep` points at when it points into this module, else the first not done. */
function nextLesson(id: string, way: ModuleWay | undefined, list: readonly IndexLesson[]): IndexLesson | undefined {
  if (way === undefined || way.step === null) return list[0]
  const { step, states } = way
  if (step.module === id && step.lesson !== null) return list.find((lesson) => lesson.id === step.lesson)
  return list.find((lesson) => states.get(lesson.id) !== 'done')
}

/**
 * The module's way on (REDESIGN sections 2.4 and 3.3): Continue when `nextStep` points into this module, with its words and its link;
 * otherwise a local way on that names its target, the first lesson not done, and never says Continue. It waits for the ledger, and says so.
 * With no map there is no pointer to read, and the first lesson is the way on.
 */
function WayOn({ id, way, ready, lessons }: { id: string; way: ModuleWay | undefined; ready: boolean; lessons: readonly IndexLesson[] }) {
  if (way !== undefined && (!ready || way.step === null)) {
    return (
      <p className="es-module__way-wait" role="status">
        {MODULE.reading}
      </p>
    )
  }
  const at = way === undefined ? 0 : lessons.findIndex((lesson) => way.states.get(lesson.id) !== 'done')
  const target = lessons[at]
  const step = way?.step ?? null
  if (step !== null && (step.module === id || target === undefined)) {
    const sentence = step.module === id ? (way?.last === null || way?.last === undefined ? undefined : `${way.last} Next: ${step.reason}.`) : `Every lesson of ${moduleCode(id)} is done. Next: ${step.reason}.`
    return (
      <>
        {sentence === undefined ? null : <p className="es-module__last">{sentence}</p>}
        <ContinueLink target={step} emphasis="primary" minutes={step.minutes} />
      </>
    )
  }
  if (target === undefined) return null
  // A local way on names its target and never says Continue (REDESIGN section 2.4).
  return <ContinueLink target={{ href: target.route, label: `Open lesson ${at + 1}: ${target.title}`, word: 'Open' }} emphasis="primary" minutes={target.minutes} />
}

/** Hours, printed through the readout. They are [estimated] (docs/PLAN.md section 4). */
const hoursText = (hours: number): string => hours.toLocaleString('en-US', { maximumFractionDigits: decimals(hours) })

function HoursPart({ hours, byLane }: { hours: number | undefined; byLane: { B?: number; L?: number; F?: number } | undefined }) {
  if (hours === undefined) return <p>The hours are not set yet.</p>
  const lanes = (['B', 'L', 'F'] as const).filter((lane) => byLane?.[lane] !== undefined)
  return (
    <p>
      <Readout value={hours} digits={decimals(hours)} tag="estimated" size="sm" /> hours in all
      {lanes.length === 0
        ? '.'
        : ': '}
      {lanes.map((lane, at) => (
        <span key={lane}>
          {at === 0 ? '' : ', '}
          <Readout value={byLane?.[lane] ?? 0} digits={decimals(byLane?.[lane] ?? 0)} tag="estimated" size="sm" /> {lane === 'B' ? 'in the browser' : lane === 'L' ? 'on a laptop' : 'on a GPU'}
          {at === lanes.length - 1 ? '.' : ''}
        </span>
      ))}
    </p>
  )
}

export function ModuleView({ id, module, entry, lessons: rows, claims, today, kcs, progress, ready = false, way }: ModuleViewProps) {
  const env = useMemo(() => renderEnv(module?.blocks ?? [], claims, today), [module, claims, today])
  const title = module?.title ?? entry?.title ?? id
  const status = module?.status ?? entry?.status ?? 'planned'
  const hours = module?.hours ?? entry?.hours
  const byLane = module?.hours_by_lane ?? entry?.hours_by_lane
  const games = module?.games ?? entry?.games ?? []
  const lessons = rows ?? null
  const sentences = module === null ? '' : twoSentences(module.blocks)
  const size = [moduleCode(id), hours === undefined ? null : `${hoursText(hours)} h estimated`, needsLine(byLane, hoursText) || null].filter((part) => part !== null)
  const labs: LabRef[] = (module?.labs ?? []).map((lab) => ({
    id: lab,
    lane: module?.blocks.flatMap((block) => (block.type === 'lab' && block.id === lab ? [block.lane] : []))[0] ?? 'B',
    waiting: pendingLab(lab) !== null,
  }))
  const states = useMemo(() => new Map<string, KcState>((progress?.kcs ?? []).map((kc) => [kc.id, kc.state])), [progress])
  const passed = useMemo(() => outcomesPassed(id, module?.outcomes.length ?? 0, states, ready && kcs !== undefined), [id, module, states, ready, kcs])
  const mark = lessons === null ? undefined : nextLesson(id, way, lessons)
  const parts = useMemo(() => (module === null ? [] : referenceParts(module.blocks)), [module])
  const cited = useMemo(() => (module === null ? [] : [...citedClaimIds(module.blocks)]), [module])

  return (
    <article className="es-module" data-rev={module?.rev} data-status={status}>
      <header className="es-module__head">
        <nav aria-label="Breadcrumb" className="es-module__crumbs">
          <ol>
            <li>
              <TextLink to="/map">Course</TextLink>
            </li>
            <li aria-current="page">
              {moduleCode(id)}
              <span className="es-module__crumb-name"> {title}</span>
            </li>
          </ol>
        </nav>
        <div className="es-module__titleline">
          <h1 className="es-module__title">{title}</h1>
          <p className="es-module__size">{size.join(' · ')}</p>
        </div>
        {sentences === '' ? (
          status === 'planned' ? (
            <p className="es-module__sentences">Not published yet.</p>
          ) : null
        ) : (
          <p className="es-module__sentences">{sentences}</p>
        )}
        <div className="es-module__way">
          <WayOn id={id} way={way} ready={ready} lessons={lessons ?? []} />
        </div>
      </header>
      <div className="es-module__grid">
        <Lessons lessons={lessons} scope={id} states={ready ? way?.states : undefined} mark={mark?.id} />
        {module === null ? null : <Outcomes outcomes={module.outcomes} passed={passed} />}
      </div>
      {module === null ? null : <Rows games={games} labs={labs} progress={progress} ready={ready} />}
      {module === null ? null : (
        <Reference
          parts={parts}
          env={env}
          hours={saysHours(parts) ? null : <HoursPart hours={hours} byLane={byLane} />}
          builds={module.prereqs.length === 0 && module.pins.length === 0 ? null : { prereqs: module.prereqs, pins: module.pins }}
          cited={cited}
        />
      )}
    </article>
  )
}

/** A module's lessons: number, title, minutes, what it needs and its state in a word, once the ledger has been read. The next one carries the amber mark. */
function Lessons({ lessons, scope, states, mark }: { lessons: readonly IndexLesson[] | null; scope: string; states?: ReadonlyMap<string, LessonState>; mark?: string }) {
  return (
    <section aria-labelledby="lessons" className="es-module__lessons">
      <h2 id="lessons" className="es-module__h">
        {MODULE.lessons}
      </h2>
      {lessons === null ? (
        <p className="es-module__note" role="alert">
          The list of lessons did not load. Reload the page.
        </p>
      ) : lessons.length === 0 ? (
        <p className="es-module__note">No lessons yet.</p>
      ) : (
        <ol className="es-module__lesson-list" data-module={scope}>
          {lessons.map((lesson, at) => {
            const state = states === undefined ? undefined : (states.get(lesson.id) ?? 'not-started')
            return (
              <li key={lesson.id} className="es-module__lesson" data-lesson={lesson.id} data-next={lesson.id === mark ? 'true' : undefined}>
                <a href={lesson.route} className="es-module__lesson-link" aria-current={lesson.id === mark ? 'step' : undefined}>
                  <span className="es-module__n">{at + 1}</span>
                  <span className="es-module__lesson-title">{lesson.title}</span>
                  <span className="es-module__lesson-facts">
                    <span className="es-module__minutes">
                      <span className="es-num" data-tag="estimated">
                        {lesson.minutes}
                        <span className="sr-only"> (estimated)</span>
                      </span>{' '}
                      min
                    </span>
                    <span className="es-module__needs">{lesson.needs === undefined ? '' : needsWords(lesson.needs)}</span>
                    <span className="es-module__state" data-lesson-state={state}>
                      {state === undefined ? '' : LESSON_WORDS[state]}
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      )}
      {states === undefined ? null : <p className="es-module__legend">{LEGENDS.lesson}</p>}
    </section>
  )
}
