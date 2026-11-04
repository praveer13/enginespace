import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { Claim, CompiledLesson, IndexModule } from '@es/schema'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { useClaims, useDocumentTitle, useIndex, useLesson } from '@/content/load'
import { Blocks } from '@/content/render/Blocks'
import { citedClaimIds, laneName, neighbours, renderEnv, titled, todayIso } from '@/content/render/model'
import { Columns, LinkRow, PageHeader, PageNotice, RefLink, Scope } from '@/content/render/Page'
import '@/content/render/content.css'

/*
 * /m/:module/:lesson (ARCHITECTURE §3.1): one lesson, as a run of tickets under its title, with the printer's tape of facts
 * beside them. The lesson is its own lazy chunk, and the claims file is fetched only when the prose cites a claim.
 * `LessonView` is the page once it has its content, and takes everything it shows as props.
 */

export function Component() {
  const { module = '', lesson: slug = '' } = useParams()
  const index = useIndex()
  const lesson = useLesson(module, slug)
  const loaded = lesson.status === 'ready' ? lesson.value : null
  const cites = loaded !== null && citedClaimIds(loaded.blocks).size > 0
  const claims = useClaims(cites)
  const [today] = useState(todayIso)
  useDocumentTitle(loaded === null ? null : titled(loaded.title))

  const where = `${module} / ${slug}`
  if (lesson.status === 'error') {
    return <PageNotice kind="failed" title="The lesson did not load" ticket={where} message="The lesson would not print. Check your connection and reload the page." />
  }
  if (lesson.status === 'loading' || index.status === 'loading' || (cites && claims.status === 'loading')) {
    return <PageNotice kind="loading" title="Lesson" ticket={where} what="lesson" />
  }
  if (loaded === null) {
    return (
      <PageNotice
        kind="missing"
        title="Lesson not found"
        ticket={where}
        message={`No lesson called ${slug} in module ${module}.`}
        back={{ to: `/m/${module}`, label: 'Open module' }}
      />
    )
  }
  const entry = index.status === 'ready' ? index.value.modules.find((candidate) => candidate.id === module) : undefined
  return <LessonView lesson={loaded} module={entry} claims={claims.status === 'ready' ? claims.value : null} today={today} />
}

export interface LessonViewProps {
  lesson: CompiledLesson
  /** The module's entry in the course index, for its title, its route and the lessons beside this one. */
  module?: IndexModule
  /** The claims by id, or null when they did not load: each chip then says so. */
  claims: ReadonlyMap<string, Claim> | null
  today: string
}

export function LessonView({ lesson, module, claims, today }: LessonViewProps) {
  const env = useMemo(() => renderEnv(lesson.blocks, claims, today), [lesson.blocks, claims, today])
  const moduleRoute = module?.route ?? `/m/${lesson.module}`
  const { previous, next } = neighbours(module, lesson.slug)

  const lines: PrinterTapeLine[] = [
    { id: 'module', label: 'module', value: <TextLink to={moduleRoute}>{lesson.module}</TextLink> },
    { id: 'minutes', label: 'minutes', value: <Readout value={lesson.minutes} tag="estimated" size="sm" /> },
    { id: 'status', label: 'status', value: lesson.status, tone: lesson.status === 'draft' ? 'ink-2' : 'ink' },
  ]
  if (lesson.lanes !== undefined && lesson.lanes.length > 0) lines.push({ id: 'lanes', label: 'lanes', value: lesson.lanes.map(laneName).join(', ') })
  if (lesson.builds_on.length > 0) {
    lines.push({
      id: 'builds-on',
      label: 'builds on',
      value: <LinkRow>{lesson.builds_on.map((ref) => <RefLink key={ref} to={ref} />)}</LinkRow>,
    })
  }

  return (
    <article className="es-doc" data-rev={lesson.rev}>
      <PageHeader
        crumbs={[
          { to: '/map', label: 'Course map' },
          { to: moduleRoute, label: module === undefined ? lesson.module : `${lesson.module}: ${module.title}` },
        ]}
        current={lesson.id}
        title={lesson.title}
        tapes={[lesson.status]}
      />
      <Columns side={<PrinterTape label="About this lesson" lines={lines} />}>
        <Blocks blocks={lesson.blocks} env={env} scope={lesson.id} />
        <Ticket
          as="section"
          width="wide"
          head={<Scope id={lesson.id} />}
          meta="end"
          title="Next"
          titleAs="h2"
          className="es-c-block"
          data-block="next"
          stub={next === null ? <Stub to={moduleRoute}>To the module</Stub> : <Stub to={next.route}>Next lesson</Stub>}
        >
          {lesson.kcs.length > 0 ? (
            <>
              <p>This lesson teaches</p>
              <ul className="es-c-tapes" aria-label="What this lesson teaches">
                {lesson.kcs.map((kc) => (
                  <TapeLabel key={kc} as="li" size="sm" tilt="none">
                    {kc}
                  </TapeLabel>
                ))}
              </ul>
            </>
          ) : null}
          {next === null ? null : (
            <p>
              Next: <TextLink to={next.route}>{next.title}</TextLink>
            </p>
          )}
          {previous === null ? null : (
            <p>
              Before this: <TextLink to={previous.route}>{previous.title}</TextLink>
            </p>
          )}
        </Ticket>
      </Columns>
    </article>
  )
}
