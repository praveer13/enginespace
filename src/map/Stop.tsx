import type { IndexModule, MapModule } from '@es/schema'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { kernelspaceUrl, laneName } from '@/content/render/model'
import type { ModuleProgress } from '@/progress/derive'
import { MAP } from './copy'
import { Pips } from './Pips'
import { decimalsOf, holdingOf, lanesOf, printedId } from './summary'

/*
 * One module of the course, as the ticket hung for it on the rail (W1-T06): its id and its hours on the head line, its title stamped
 * under them, then where the work is done, what the module advises doing first, and what the learner holds of it. The ticket is a
 * whole object with its own clip on its own stretch of the rod, and the stub at its foot opens the module. The lamp falls on the next
 * ticket only: the first module that can be opened and whose knowledge components are not all earned.
 */

export interface StopProps {
  module: IndexModule
  /** The module's prerequisites, artifacts and KCs. Undefined if the map did not list it. */
  detail?: MapModule
  /** What the ledger holds of the module. Undefined until progress has been derived. */
  progress?: ModuleProgress
  /** True once the ledger has been read: until then the ticket says it is reading. */
  ready: boolean
  /** The lamp falls on this ticket. */
  next: boolean
}

/** An hour count in the printer's dots: the number, and its unit, which a screen reader reads out in full. */
export function Hours({ value }: { value: number }) {
  return (
    <span className="es-map__hours">
      <span>{formatReadout(value, decimalsOf(value))}</span>
      <span aria-hidden="true"> h</span>
      <span className="sr-only"> hours</span>
    </span>
  )
}

function Lessons({ lessons }: { lessons: readonly string[] }) {
  return (
    <span className="es-map__refs">
      <span className="es-map__refs-name">{MAP.kernelspace}</span>
      {lessons.map((lesson) => {
        const label = lesson.replace(/^ks:/, '')
        const url = kernelspaceUrl(lesson)
        return url === null ? (
          <span key={lesson}>{label}</span>
        ) : (
          <TextLink key={lesson} href={url}>
            {label}
          </TextLink>
        )
      })}
    </span>
  )
}

/** What the module advises doing first: kernelspace lessons, which link out, and modules of this course, which open. */
function Leans({ prereqs }: { prereqs: readonly string[] }) {
  const lessons = prereqs.filter((prereq) => prereq.startsWith('ks:'))
  const modules = prereqs.filter((prereq) => !prereq.startsWith('ks:'))
  if (prereqs.length === 0) return null
  return (
    <p className="es-map__leans">
      <span className="es-map__leans-word">{MAP.advised}</span>
      {lessons.length > 0 ? <Lessons lessons={lessons} /> : null}
      {modules.length > 0 ? (
        <span className="es-map__refs">
          {modules.map((module) => (
            <TextLink key={module} to={`/m/${module}`}>
              {printedId(module)}
            </TextLink>
          ))}
        </span>
      ) : null}
    </p>
  )
}

/** Where the work is done: a lane on masking tape with its hours in dots, and the artifacts that the module asks for in it. */
function Lanes({ module, detail }: Pick<StopProps, 'module' | 'detail'>) {
  const lanes = lanesOf(module)
  return (
    <ul className="es-map__lanes">
      {lanes.map(({ lane, hours }) => (
        <li key={lane} className="es-map__lane" data-lane={lane}>
          <span className="es-map__lane-head">
            <TapeLabel size="sm" tilt="none">
              {laneName(lane)}
            </TapeLabel>
            <Hours value={hours} />
          </span>
          <ul className="es-map__artifacts">
            {(detail?.artifacts ?? [])
              .filter((artifact) => artifact.lane === lane)
              .map((artifact) => (
                <li key={artifact.id}>{artifact.title}</li>
              ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/** What the learner holds of the module: its pips, and the count in words beside them. */
function Holding({ detail, progress, ready }: Pick<StopProps, 'detail' | 'progress' | 'ready'>) {
  const total = detail?.kcs.length ?? 0
  if (total === 0) {
    return (
      <div className="es-map__holding" data-state="empty">
        <p className="es-map__count">{MAP.holding.none}</p>
      </div>
    )
  }
  if (!ready || progress === undefined) {
    return (
      <div className="es-map__holding" data-state="reading">
        <Pips states={Array.from({ length: total }, () => 'none' as const)} />
        <p className="es-map__count">{MAP.holding.reading}</p>
      </div>
    )
  }
  const held = holdingOf(progress.counts)
  return (
    <div className="es-map__holding" data-state="read">
      <Pips states={progress.kcs.map((kc) => kc.state)} />
      <p className="es-map__count">
        <span className="es-map__seg">
          <span className="es-map__num">{held.earned}</span> {MAP.holding.of} <span className="es-map__num">{held.total}</span> {MAP.holding.earned}
        </span>
        {held.practising > 0 ? (
          <span className="es-map__seg">
            <span className="es-map__num">{held.practising}</span> {MAP.holding.practising}
          </span>
        ) : null}
        {held.kept > 0 ? (
          <span className="es-map__seg">
            <span className="es-map__num">{held.kept}</span> {MAP.holding.kept}
          </span>
        ) : null}
      </p>
    </div>
  )
}

export function Stop({ module, detail, progress, ready, next }: StopProps) {
  const id = printedId(module.id)
  return (
    <li className="es-map__stop" data-module={module.id} data-status={module.status} data-next={next || undefined}>
      <span className="es-map__rod" aria-hidden="true" />
      <span className="es-rail__grip" aria-hidden="true" />
      <Ticket
        as="div"
        width="full"
        lamp={next}
        className="es-map__ticket"
        head={id}
        meta={<Hours value={module.hours} />}
        title={module.title}
        titleAs="h3"
        foot={[MAP.hoursNote, module.status]}
        stub={
          <Stub to={module.route}>
            {MAP.open} {id}
          </Stub>
        }
      >
        {next ? (
          <TapeLabel size="sm" tilt="right" className="es-map__next">
            {MAP.next}
          </TapeLabel>
        ) : null}
        <Lanes module={module} detail={detail} />
        <Leans prereqs={detail?.prereqs ?? []} />
        <Holding detail={detail} progress={progress} ready={ready} />
      </Ticket>
    </li>
  )
}
