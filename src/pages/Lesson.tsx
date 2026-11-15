import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { Claim, CompiledLesson, IndexModule } from '@es/schema'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { useClaims, useDocumentTitle, useIndex } from '@/content/load'
import { useLesson } from '@/content/load-lessons'
import { useMap } from '@/content/load-map'
import { Blocks } from '@/content/render/Blocks'
import { citedClaimIds, laneName, neighbours, renderEnv, titled, todayIso } from '@/content/render/model'
import { Columns, LinkRow, PageHeader, PageNotice, RefLink, Scope } from '@/content/render/Page'
import '@/content/render/content.css'
import { moduleCode } from '@/progress/words'
import { useBookmark } from '@/settings/bookmark'

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

/**
 * The lesson page's part of the way on (REDESIGN §2.4): it keeps the bookmark (`es:here`) as the learner reads and acts. It draws
 * nothing: the lesson's sections do. The pointer (`es:next`) is rewritten by the next page that opens the ledger with the way on in it
 * (Course, a module), so the lesson's first paint carries neither `nextStep` nor the ledger (REDESIGN §4, Budgets).
 */
function WayHere({ route, article }: { route: string; article: HTMLElement | null }) {
  const map = useMap()
  const row = map.status === 'ready' ? map.value.lessons.find((lesson) => lesson.route === route) : undefined
  useBookmark(route, article, row?.anchors.test)
  return null
}

export function LessonView({ lesson, module, claims, today }: LessonViewProps) {
  const env = useMemo(() => renderEnv(lesson.blocks, claims, today), [lesson.blocks, claims, today])
  const moduleRoute = module?.route ?? `/m/${lesson.module}`
  const { previous, next } = neighbours(module, lesson.slug)
  const [article, setArticle] = useState<HTMLElement | null>(null)
  const lessons = module?.lessons ?? []
  const position = lessons.findIndex((candidate) => candidate.slug === lesson.slug)

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
    <article ref={setArticle} className="es-doc" data-rev={lesson.rev}>
      <WayHere route={`/m/${lesson.module}/${lesson.slug}`} article={article} />
      <PageHeader
        crumbs={[
          { to: '/map', label: 'Course' },
          { to: moduleRoute, label: module === undefined ? moduleCode(lesson.module) : `${moduleCode(lesson.module)} ${module.title}` },
        ]}
        current={position < 0 ? lesson.title : `Lesson ${position + 1} of ${lessons.length}`}
        title={lesson.title}
        tapes={[lesson.status]}
      />
      <Columns side={<PrinterTape label="About this lesson" lines={lines} />}>
        <Blocks blocks={lesson.blocks} env={env} scope={lesson.id} rev={lesson.rev} />
        {/* The title leads the paper, as on every block's ticket: the lesson's id prints on the foot line (BlockFrame.tsx). */}
        <Ticket
          as="section"
          width="wide"
          foot={[<Scope id={lesson.id} />, 'end']}
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
