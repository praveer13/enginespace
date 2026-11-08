import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { Claim, CompiledModule, IndexLesson, IndexModule, MapKc } from '@es/schema'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { useClaims, useDocumentTitle, useIndex } from '@/content/load'
import { useModule } from '@/content/load-lessons'
import { useMap } from '@/content/load-map'
import { Blocks } from '@/content/render/Blocks'
import { citedClaimIds, decimals, laneName, renderEnv, titled, todayIso } from '@/content/render/model'
import { Columns, LinkRow, PageHeader, PageNotice, RefLink, Scope } from '@/content/render/Page'
import '@/content/render/content.css'
import { Kcs, Loop } from '@/map/ModuleProgress'
import type { ModuleProgress } from '@/progress/derive'
import { useProgress } from '@/progress/useProgress'

/*
 * /m/:module (ARCHITECTURE §3.1): a module's page. Its title, the printer's tape of facts, the module's own words, what you
 * will be able to do, the loop it runs and what you hold of it, and its lessons as tickets, each with a stub that opens it. A module
 * that `course.yaml` names and nobody has written yet ("planned") shows what the index knows of it.
 * The loop and the evidence (W1-T06) are derived from the learner's events and the compiled map each time the page draws, and are
 * never stored (src/progress). `ModuleView` is the page once it has its content, and takes everything it shows as props.
 */

export function Component() {
  const { module: id = '' } = useParams()
  const index = useIndex()
  const module = useModule(id)
  const loaded = module.status === 'ready' ? module.value : null
  const cites = loaded !== null && citedClaimIds(loaded.blocks).size > 0
  const claims = useClaims(cites)
  const map = useMap()
  const { ready, progress } = useProgress(map.status === 'ready' ? map.value : null)
  const [today] = useState(todayIso)
  const entry = index.status === 'ready' ? index.value.modules.find((candidate) => candidate.id === id) : undefined
  const title = loaded?.title ?? entry?.title ?? null
  useDocumentTitle(title === null ? null : titled(title))

  if (module.status === 'error' || (index.status === 'error' && loaded === null)) {
    return <PageNotice kind="failed" title="The module did not load" ticket={id} message="The module would not print. Check your connection and reload the page." />
  }
  if (module.status === 'loading' || index.status === 'loading' || map.status === 'loading' || (cites && claims.status === 'loading')) {
    return <PageNotice kind="loading" title="Module" ticket={id} what="module" />
  }
  if (loaded === null && entry === undefined) {
    return <PageNotice kind="missing" title="Module not found" ticket={id} message={`No module called ${id}.`} back={{ to: '/map', label: 'Course map' }} />
  }
  // A map that did not load leaves the loop and the evidence out; the rest of the page does not need it.
  const kcs = map.status === 'ready' ? map.value.kcs.filter((kc) => kc.module === id) : undefined
  return (
    <ModuleView
      id={id}
      module={loaded}
      entry={entry}
      claims={claims.status === 'ready' ? claims.value : null}
      today={today}
      kcs={kcs}
      progress={progress?.modules.get(id)}
      ready={ready}
    />
  )
}

export interface ModuleViewProps {
  id: string
  /** The module's compiled page, or null for a planned module that has no `module.md`. */
  module: CompiledModule | null
  /** The module's entry in the course index: its lessons, and everything a planned module has. Undefined if the index did not load. */
  entry?: IndexModule
  /** The claims by id, or null when they did not load: each chip then says so. */
  claims: ReadonlyMap<string, Claim> | null
  today: string
  /** The module's KCs from the compiled map. Undefined when the map did not load, and the page then shows neither the loop nor the evidence. */
  kcs?: readonly MapKc[]
  /** What the learner's ledger holds of the module, derived. Undefined until it has been. */
  progress?: ModuleProgress
  /** True once the ledger has been read. Until then the page says so, and does not say the learner has done nothing. */
  ready?: boolean
}

/** Hours, printed through the readout. They are [estimated] (docs/PLAN.md §4). */
function hoursReadout(hours: number) {
  return <Readout value={hours} digits={decimals(hours)} tag="estimated" size="sm" />
}

export function ModuleView({ id, module, entry, claims, today, kcs, progress, ready = false }: ModuleViewProps) {
  const env = useMemo(() => renderEnv(module?.blocks ?? [], claims, today), [module, claims, today])
  const title = module?.title ?? entry?.title ?? id
  const status = module?.status ?? entry?.status ?? 'planned'
  const hours = module?.hours ?? entry?.hours
  const byLane = module?.hours_by_lane ?? entry?.hours_by_lane
  const prereqs = module?.prereqs ?? entry?.prereqs ?? []
  const games = module?.games ?? entry?.games ?? []
  const labs = module?.labs ?? []

  const lines: PrinterTapeLine[] = []
  if (hours !== undefined) lines.push({ id: 'hours', label: 'hours', value: hoursReadout(hours) })
  for (const lane of ['B', 'L', 'F'] as const) {
    const laneHours = byLane?.[lane]
    if (laneHours !== undefined) lines.push({ id: `lane-${lane}`, label: `${laneName(lane)} (${lane})`, value: hoursReadout(laneHours) })
  }
  lines.push({ id: 'status', label: 'status', value: status, tone: status === 'live' ? 'ink' : 'ink-2' })
  if (kcs !== undefined && kcs.length > 0) {
    const counts = progress?.counts
    const held = ready && counts !== undefined
    lines.push({
      id: 'earned',
      label: 'earned',
      value: held ? (
        <>
          <Readout value={counts.earned} tag="measured" size="sm" /> of {counts.total}
        </>
      ) : (
        'reading your ledger'
      ),
    })
    lines.push({ id: 'kept', label: 'kept', value: held ? <Readout value={counts.kept} tag="measured" size="sm" /> : 'reading your ledger' })
  }
  if (prereqs.length > 0) {
    lines.push({
      id: 'prereqs',
      label: 'advised first',
      value: <LinkRow>{prereqs.map((ref) => <RefLink key={ref} to={ref} />)}</LinkRow>,
    })
  }
  if (module !== null && module.pins.length > 0) lines.push({ id: 'pins', label: 'pins', value: module.pins.join(', ') })
  if (games.length > 0) {
    lines.push({
      id: 'games',
      label: 'games',
      value: (
        <LinkRow>
          {games.map((game) => (
            <TextLink key={game} to={`/play/${game}`}>
              {game}
            </TextLink>
          ))}
        </LinkRow>
      ),
    })
  }
  if (labs.length > 0) {
    lines.push({
      id: 'labs',
      label: 'labs',
      value: (
        <LinkRow>
          {labs.map((lab) => (
            <TextLink key={lab} to={`/labs/${lab}`}>
              {lab}
            </TextLink>
          ))}
        </LinkRow>
      ),
    })
  }

  return (
    <article className="es-doc" data-rev={module?.rev}>
      <PageHeader crumbs={[{ to: '/map', label: 'Course map' }]} current={id} title={title} tapes={[status]} />
      <Columns side={<PrinterTape label="About this module" lines={lines} />}>
        {module === null ? (
          <Ticket as="section" width="wide" head={id} state="empty" empty="Planned: not written yet." />
        ) : (
          <>
            <Blocks blocks={module.blocks} env={env} scope={module.id} />
            <Ticket as="section" width="wide" head={<Scope id={module.id} />} meta="outcomes" title="You will be able to" titleAs="h2" className="es-c-block" data-block="outcomes">
              <ol className="es-c-outcomes">
                {module.outcomes.map((outcome) => (
                  <li key={outcome}>{outcome}</li>
                ))}
              </ol>
            </Ticket>
            {kcs === undefined ? null : <Loop module={module.id} games={games} labs={labs} progress={progress} ready={ready} />}
          </>
        )}
        {kcs === undefined || kcs.length === 0 ? null : <Kcs module={id} kcs={kcs} progress={progress} ready={ready} />}
        <Lessons lessons={entry?.lessons ?? null} scope={id} />
        {module === null ? null : <Artifacts artifacts={module.artifacts} scope={module.id} />}
      </Columns>
    </article>
  )
}

/** A module's lessons, each a ticket with a stub that opens it. */
function Lessons({ lessons, scope }: { lessons: readonly IndexLesson[] | null; scope: string }) {
  return (
    <section aria-labelledby="lessons" className="es-doc__lessons">
      <h2 id="lessons" className="es-doc__heading">
        Lessons
      </h2>
      {lessons === null ? (
        <Ticket width="wide" head={scope} state="error" error="The list of lessons did not load. Reload the page." />
      ) : lessons.length === 0 ? (
        <Ticket width="wide" head={scope} state="empty" empty="No lessons yet." />
      ) : (
        <ol className="es-doc__lesson-list">
          {lessons.map((lesson) => (
            <Ticket
              key={lesson.id}
              as="li"
              width="wide"
              head={<Scope id={lesson.id} />}
              meta={lesson.status}
              title={lesson.title}
              titleAs="h3"
              className="es-c-block"
              data-block="lesson"
              stub={<Stub to={lesson.route}>Open lesson</Stub>}
            >
              <p className="es-c-line">
                <TicketLine qty={<Readout value={lesson.minutes} tag="estimated" size="sm" />}>minutes</TicketLine>
              </p>
            </Ticket>
          ))}
        </ol>
      )}
    </section>
  )
}

/** What the module asks you to build and prove, with the lane each is worked in. */
function Artifacts({ artifacts, scope }: { artifacts: CompiledModule['artifacts']; scope: string }) {
  return (
    <Ticket as="section" width="wide" head={<Scope id={scope} />} meta="artifacts" title="Artifacts" titleAs="h2" className="es-c-block" data-block="artifacts">
      <ul className="es-c-artifacts">
        {artifacts.map((artifact) => (
          <li key={artifact.id}>
            <TapeLabel size="sm" tilt="none">
              {artifact.lane} · {laneName(artifact.lane)}
            </TapeLabel>
            <span>{artifact.title}</span>
            <code>{artifact.id}</code>
          </li>
        ))}
      </ul>
    </Ticket>
  )
}
