import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import { Link, useLoaderData } from 'react-router'
import type { ContentIndex } from '@es/schema'
import { ContinueLink } from '@/design/components/Board'
import { Readout } from '@/design/components/Readout'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { TextLink } from '@/design/components/TextLink'
import { formatReadout } from '@/design/format'
import { hearPointer, pointerSnapshot } from '@/settings/store'
import { CREDIT, HERO, OUTCOMES, PATH, RETURNING } from './copy'
import { Instrument } from './Instrument'
import { decimalsOf, firstLesson, lanesOf, menuId, type FrontData } from './menu'
import { courseHours, returningOf, startLabel, type Returning } from './way'

/*
 * The front page (`/`; REDESIGN §3.1): "Run one step of an LLM inference engine."
 *
 * The first viewport is two columns at a desk. On the left, what this is and nothing to follow: the heading, one paragraph, a line that
 * says the panel beside it is live, the course's range and hours from the course index, and a link past the demo to Course. The only
 * instructions on the page are the instrument's own goal line and coach strip. On the right, the instrument (Instrument.tsx): the step
 * loop's demo levels, live from the first paint. On a phone the heading and two lines stand over the instrument, and the course link is
 * under it.
 *
 * A returning learner, whose pointer (`es:next`, D-066) says Continue, reads where they left off and an amber Continue in the left column,
 * and the instrument opens with no intro. The Continue steps back to an outline once the demo is touched, so the move in hand is the one
 * amber fill (REDESIGN §2.4). The page reads the pointer and the intro flag, and never the ledger (D-038).
 *
 * Below the fold, plain HTML: what you will be able to do, how credit works, the path, and the same way in.
 *
 * The static HTML is this page, rendered once by the build at `/` (shell.ts, scripts/pages/front-shell.ts), as a first visit: the app
 * renders the same page into the root once its chunks are in (src/main.tsx waits for the route), so the swap moves nothing.
 */

/** The pointer as `es:next` holds it, or null where it holds none (the header falls back to the first lesson; this page tells the two apart). */
function usePointerHeld() {
  return useSyncExternalStore(hearPointer, pointerSnapshot, () => null)
}

export function FrontPage() {
  const data = useLoaderData() as FrontData | undefined
  const index = data?.index ?? null
  const returning = returningOf(usePointerHeld())
  const [touched, setTouched] = useState(false)
  const onTouched = useCallback(() => setTouched(true), [])
  const short = startLabel(index)
  const full = startLabel(index, true)
  const course =
    returning !== null ? { label: returning.label, short: returning.label, href: returning.href } : short !== null && full !== null ? { label: full.label, short: short.label, href: short.route } : null
  return (
    <div className="es-front" data-returning={returning === null ? undefined : ''}>
      <div className="es-front-first">
        <div className="es-front-intro">
          <h1 className="es-front-title">{HERO.headline}</h1>
          {returning === null ? <FirstVisit index={index} /> : <Back returning={returning} primary={!touched} />}
        </div>
        <Instrument returning={returning !== null} course={course} onTouched={onTouched} />
        {returning === null && short !== null ? (
          <p className="es-front-phone-start">
            <TextLink to={short.route}>{short.label}</TextLink>
          </p>
        ) : null}
      </div>
      <Below index={index} course={course} />
    </div>
  )
}

/** The left column on a first visit: what this is, that the panel is live, the course's size, and the way past the demo. */
function FirstVisit({ index }: { index: ContentIndex | null }) {
  const hours = courseHours(index)
  return (
    <>
      <p className="es-front-lede es-front-desk">{HERO.lede}</p>
      <p className="es-front-live es-front-desk">{HERO.live}</p>
      <p className="es-front-lede es-front-phone">{HERO.short}</p>
      {hours === null ? null : (
        <p className="es-front-range es-front-desk" data-course-hours="">
          {`${HERO.range} · ${formatReadout(hours.total, decimalsOf(hours.total))} ${HERO.hours}, ${HERO.estimated}: ${hours.lanes.map((lane) => `${formatReadout(lane.hours, decimalsOf(lane.hours))} ${lane.words}`).join(', ')}`}
        </p>
      )}
      <p className="es-front-skip es-front-desk">
        <TextLink to="/map">{HERO.skip}</TextLink>
      </p>
    </>
  )
}

/** The left column for a returning learner: where they left off, and Continue, amber until the demo is touched. */
function Back({ returning, primary }: { returning: Returning; primary: boolean }) {
  return (
    <div className="es-front-back" data-front-back="">
      <p className="es-front-lede">
        {returning.place === null ? (
          <>
            {RETURNING.elsewhere} {returning.next}.
          </>
        ) : (
          <>
            {RETURNING.leftOff} {returning.place}. {RETURNING.next} {returning.next}.
          </>
        )}
      </p>
      <ContinueLink target={returning.pointer} emphasis={primary ? 'primary' : 'outline'} className="es-front-back__continue" />
      <p className="es-front-live es-front-desk">{RETURNING.demo}</p>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Below the fold                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function Below({ index, course }: { index: ContentIndex | null; course: { label: string; href: string } | null }) {
  const outcomesId = useId()
  const creditId = useId()
  const pathId = useId()
  return (
    <div className="es-front-below">
      <section aria-labelledby={outcomesId} className="es-front-outcomes">
        <h2 id={outcomesId} className="es-front-h2">
          {OUTCOMES.title}
        </h2>
        <ol className="es-front-outcomes__list">
          {OUTCOMES.list.map((row) => (
            <li key={row.outcome}>
              <span className="es-front-outcomes__text">{row.outcome}</span>
              <span className="es-front-outcomes__modules">
                <span className="sr-only">{OUTCOMES.modulesLabel}: </span>
                {row.modules.join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={creditId} className="es-front-credit">
        <h2 id={creditId} className="es-front-h2">
          {CREDIT.title}
        </h2>
        <ul className="es-front-credit__list">
          {CREDIT.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={pathId} className="es-front-path">
        <h2 id={pathId} className="es-front-h2">
          {PATH.title}
        </h2>
        <p className="es-front-path__lede">{PATH.lede}</p>
        <PathTable index={index} />
      </section>

      {course === null ? null : (
        <p className="es-front-below__start">
          <PrimaryButton standalone to={course.href}>
            {course.label}
          </PrimaryButton>
        </p>
      )}
    </div>
  )
}

/** The path: one row per module, in order, the first lesson's module marked "Start here", an unpublished one said so and not a link. */
function PathTable({ index }: { index: ContentIndex | null }) {
  if (index === null) return <p>{PATH.unavailable}</p>
  const first = firstLesson(index)?.module ?? null
  return (
    <table className="es-front-path__table">
      <caption className="sr-only">{PATH.title}</caption>
      <thead>
        <tr>
          <th scope="col">{PATH.columns.module}</th>
          <th scope="col">{PATH.columns.course}</th>
          <th scope="col" className="es-front-path__needs">
            {PATH.columns.lanes}
          </th>
          <th scope="col" className="es-front-path__hours">
            {PATH.columns.hours}
            <span className="es-front-path__tag">{PATH.estimated}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {index.modules.map((module) => {
          const published = module.lessons.length > 0
          return (
            <tr key={module.id} data-module={module.id} data-start={module.id === first || undefined}>
              <th scope="row">{menuId(module.id)}</th>
              <td>
                {published ? <Link to={module.route}>{module.title}</Link> : <span className="es-front-path__unpublished">{module.title}</span>}
                {module.id === first ? <span className="es-front-path__here">{PATH.startHere}</span> : null}
                {published ? null : <span className="es-front-path__soon">{PATH.unpublished}</span>}
              </td>
              <td className="es-front-path__needs">{lanesOf(module).join(' · ')}</td>
              <td className="es-front-path__hours">{formatReadout(module.hours, decimalsOf(module.hours))}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={3}>
            {PATH.total}
          </th>
          <td className="es-front-path__hours">
            <Readout value={index.totalHours} digits={decimalsOf(index.totalHours)} tag="derived" size="sm" />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
