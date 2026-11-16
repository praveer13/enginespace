import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { rosterEntry } from '@es/play/roster'
import type { Claim, CompiledBlock, CompiledLesson, CourseMap, IndexModule, ProseFlow, ProseInline } from '@es/schema'
import { NextStep } from '@/design/components/NextStep'
import { Note } from '@/design/components/Note'
import { SectionRail, type RailPart, type RailSection } from '@/design/components/SectionRail'
import { TextLink } from '@/design/components/TextLink'
import { TitleBlock } from '@/design/components/TitleBlock'
import { publicUrl, useClaims, useDocumentTitle, useIndex } from '@/content/load'
import { useCard, useLesson } from '@/content/load-lessons'
import { useMap } from '@/content/load-map'
import type { Of } from '@/content/render/BlockFrame'
import { ClaimInline, ClaimMark, Sources } from '@/content/render/Claims'
import { Instrument } from '@/content/render/Instrument'
import { useLevelNames } from '@/content/render/levelNames'
import type { LedgerReading } from '@/content/render/LessonLedger'
import { citedClaimIds, claimNumbers, kernelspaceLabel, kernelspaceUrl, labName, pendingLab, plainText, renderEnv, titled, todayIso, type RenderEnv } from '@/content/render/model'
import { Prose } from '@/content/render/Prose'
import { useBlockRun } from '@/content/render/runs'
import type { LessonOnward } from '@/games/kit/lessonRun'
import { useLatestRun } from '@/games/kit/RunContext'
import { groupSections, proseWords, runAnchor, testLabel, type LessonSections, type Piece } from '@/content/render/sections'
import '@/content/render/lesson.css'
import { moduleCode } from '@/progress/words'
import { useBookmark } from '@/settings/bookmark'

/*
 * /m/:module/:lesson (REDESIGN §2.5 and §3.4): one lesson on one scrolling page, in up to four sections, Run, Read, Test and Keep, with
 * nothing collapsed and nothing locked, so find-in-page, anchors and the Markdown export keep working. `groupSections` derives the sections
 * and the opener from the file's shape (sections.ts).
 *
 *   - The head: the breadcrumb in titles, the title, one promise line made of the lesson's first KC sentence with its minutes and lanes, the
 *     lessons it builds on, and, in a lesson that opens on reading, the title block's one line that opens what the lesson's model leaves
 *     out. In a lesson that opens on a run, the instrument's own title block opens it. The card is never inlined.
 *   - The rail, from 64rem: the sections this lesson has, each with its state and the learner's own answers, Read's parts by title with the
 *     inline runs among them, and the minutes left, the current entry under the amber mark. Below 64rem it is a 44 px strip at the top, and a
 *     56 px bar at the foot carries the way to the next section. Under 600 px of height neither is sticky (lesson.css).
 *   - Keep ends in what to carry (the KC sentences), the Build row, the lesson record and the way on: with the Test passed, the amber control
 *     is `nextStep`'s; without it, the amber control goes to the questions and the next lesson is an outline beside it.
 *   - Sources: every claim the prose cites, numbered as its marks are.
 *
 * The ledger loads after the first paint, in a chunk of its own (LessonLedger.tsx): it keeps the pointer, and hands the rail, the Test and
 * Keep their words. The bookmark (`es:here`) is kept as the learner reads and acts.
 *
 * The dock (Dock.tsx), from 80rem wide and 44rem tall: the learner's most recent run in this lesson, live, sticky beside Read. Below that
 * there is no dock and no sheet, and each part of Read has a "Back to my run" link instead, once there is a run to go back to.
 */

const LessonLedger = lazy(() => import('@/content/render/LessonLedger'))
/** The dock beside Read (Dock.tsx): its own chunk, loaded only where it is drawn, from 80rem wide and 44rem tall. */
const Dock = lazy(() => import('@/content/render/Dock'))
const PredictTicket = lazy(() => import('@/content/render/Predict').then((module) => ({ default: module.PredictTicket })))
const ItemBlock = lazy(() => import('@/items/ItemBlock').then((module) => ({ default: module.ItemBlock })))

export function Component() {
  const { module = '', lesson: slug = '' } = useParams()
  const index = useIndex()
  const lesson = useLesson(module, slug)
  const map = useMap()
  const loaded = lesson.status === 'ready' ? lesson.value : null
  const cites = loaded !== null && citedClaimIds(loaded.blocks).size > 0
  const claims = useClaims(cites)
  const [today] = useState(todayIso)
  useDocumentTitle(loaded === null ? null : titled(loaded.title))

  if (lesson.status === 'error') return <Notice title="The lesson did not load" message="The lesson would not load. Check your connection and reload the page." />
  if (lesson.status === 'loading' || index.status === 'loading' || (cites && claims.status === 'loading')) return <Notice title="Lesson" message="Loading the lesson…" loading />
  if (loaded === null) return <Notice title="Lesson not found" message={`No lesson called ${slug} in module ${module}.`} back={{ to: `/m/${module}`, label: 'Open module' }} />
  const entry = index.status === 'ready' ? index.value.modules.find((candidate) => candidate.id === module) : undefined
  return <LessonView lesson={loaded} module={entry} claims={claims.status === 'ready' ? claims.value : null} today={today} map={map.status === 'ready' ? map.value : null} />
}

/** The page while the lesson loads, when there is none at the address, and when it did not load: its name as the `h1`, and a sentence. */
function Notice({ title, message, loading = false, back }: { title: string; message: string; loading?: boolean; back?: { to: string; label: string } }) {
  useDocumentTitle(loading ? null : titled(title))
  return (
    <div className="es-lesson" data-notice={loading ? 'loading' : 'missing'}>
      <h1 className="es-lesson__title">{title}</h1>
      <p className="es-lesson__promise" role={loading ? 'status' : undefined}>
        {message}{' '}
        {back === undefined ? null : <TextLink to={back.to}>{back.label}</TextLink>}
      </p>
    </div>
  )
}

export interface LessonViewProps {
  lesson: CompiledLesson
  /** The module's entry in the course index, for its title, its route and the lessons beside this one. */
  module?: IndexModule
  /** The claims by id, or null when they did not load. */
  claims: ReadonlyMap<string, Claim> | null
  today: string
  /** The course map: the lessons table (the way on) and the KC sentences. Null while it loads. */
  map?: CourseMap | null
  /** The ledger's reading, for a test; on the page it comes from LessonLedger. */
  reading?: LedgerReading | null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Where the reader is                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const WIDE = '(min-width: 64rem)'

/** True from 64rem wide: the rail stands beside the text, and there is no strip or foot bar. */
function useWide(): boolean {
  const [wide, setWide] = useState(() => (typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? true : window.matchMedia(WIDE).matches))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(WIDE)
    const change = () => setWide(list.matches)
    change()
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return wide
}

const DOCKED = '(min-width: 80rem) and (min-height: 44rem)'

/** True from 80rem wide and 44rem tall: the dock stands beside Read. False on the server, which draws no dock. */
function useDocked(): boolean {
  const [docked, setDocked] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(DOCKED)
    const change = () => setDocked(list.matches)
    change()
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return docked
}

/** "Back to my run", under a part's title where there is no dock: to the instrument of the run touched last in this lesson. */
function BackToRun({ scope }: { scope: string }) {
  const run = useLatestRun(scope)
  if (run === null) return null
  return (
    <p className="es-lesson__back">
      <a href={`#${run.place.anchor}`}>Back to my run</a>
    </p>
  )
}

/** The id of the last place whose top has passed the upper third of the viewport, and every place passed on this visit. */
function useCurrent(root: HTMLElement | null, ids: readonly string[]): { current: string; seen: ReadonlySet<string> } {
  const [state, setState] = useState<{ current: string; seen: ReadonlySet<string> }>({ current: ids[0] ?? '', seen: new Set() })
  useEffect(() => {
    if (root === null) return
    let frame = 0
    const measure = () => {
      frame = 0
      let found = ids[0] ?? ''
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element !== null && element.getBoundingClientRect().top <= window.innerHeight / 3) found = id
      }
      setState((previous) => {
        if (previous.current === found) return previous
        const seen = new Set(previous.seen)
        seen.add(previous.current)
        return { current: found, seen }
      })
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [root, ids])
  return state
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The page                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** "about 4 min" of reading, at 200 words a minute [estimated]. */
const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 200))

const piecesWords = (pieces: readonly Piece[]): number => pieces.reduce((sum, piece) => sum + (piece.kind === 'prose' ? proseWords(piece.flows) : 0), 0)

/** A heading's words, as plain text. */
const headingText = (heading: ProseFlow): string => (heading.type === 'heading' ? plainText(heading.children as readonly ProseInline[]) : '')

/** "After this you can say ...": the promise line, from the lesson's first KC sentence. */
function promise(sentence: string | undefined): string | null {
  if (sentence === undefined) return null
  return /^You can /.test(sentence) ? `After this you ${sentence.slice(4)}` : sentence
}

const LANE_WORDS: Readonly<Record<string, string>> = { B: 'in the browser', L: 'on a laptop', F: 'on a GPU' }

export function LessonView({ lesson, module, claims, today, map = null, reading: given = null }: LessonViewProps) {
  const sections = useMemo(() => groupSections(lesson.blocks), [lesson.blocks])
  const marks = useMemo(() => claimNumbers(lesson.blocks), [lesson.blocks])
  const env: RenderEnv = useMemo(() => {
    const base: RenderEnv = { ...renderEnv(lesson.blocks, claims, today), marks }
    base.claim = (id, inSentence) => <ClaimMark id={id} env={base} inSentence={inSentence} />
    return base
  }, [lesson.blocks, claims, today, marks])
  const route = `/m/${lesson.module}/${lesson.slug}`
  const moduleRoute = module?.route ?? `/m/${lesson.module}`
  const lessons = module?.lessons ?? []
  const position = lessons.findIndex((candidate) => candidate.slug === lesson.slug)
  const name = position < 0 ? lesson.title : `Lesson ${position + 1}`
  const row = map?.lessons.find((candidate) => candidate.route === route)
  const kcs = lesson.kcs.map((id) => map?.kcs.find((kc) => kc.id === id)?.description).filter((text): text is string => text !== undefined)
  const [article, setArticle] = useState<HTMLElement | null>(null)
  const place = useBookmark(route, article, row?.anchors.test)
  const [read, setRead] = useState<LedgerReading | null>(null)
  const reading = given ?? read
  const onRead = useCallback((next: LedgerReading) => setRead(next), [])
  const names = useLevelNames()
  const levelTitle = (game: string, level: string) => names(game, level) ?? rosterEntry(game)?.title ?? 'A level'
  const wide = useWide()
  const docked = useDocked()

  const partId = (at: number) => env.headings.get(sections.read[at].heading) ?? `part-${at + 1}`
  const testId = sections.test.heading === null ? 'test-title' : (env.headings.get(sections.test.heading) ?? 'test-title')
  const questions = sections.test.questions.reduce((sum, at) => sum + (lesson.blocks[at] as Of<'item'>).count, 0)
  const testName = testLabel(questions, sections.test.graded.length)
  const toTest = questions > 0 ? `Go to the ${questions === 1 ? 'question' : `${questions} questions`}` : sections.test.graded.length > 0 ? 'Go to the graded level' : 'Go to the Test'

  // Where each game block sits, in words, for a guess that waits for it further down.
  const whereOf = (game: number): string => {
    if (sections.test.graded.includes(game)) return 'the graded level in the Test'
    const part = sections.read.findIndex((candidate) => candidate.pieces.some((piece) => piece.kind === 'block' && piece.at === game))
    return part < 0 ? 'the run further down' : `the run in part ${part + 1}`
  }

  // The places the rail follows, in page order.
  const places = useMemo(() => {
    const list: string[] = []
    if (sections.run !== null) list.push('run')
    list.push('read')
    sections.read.forEach((part, at) => list.push(env.headings.get(part.heading) ?? `part-${at + 1}`))
    list.push('test', 'keep')
    return list
  }, [sections, env.headings])
  const { current: here, seen } = useCurrent(article, places)
  const partAt = sections.read.findIndex((_, index) => partId(index) === here)
  const current = here === 'read' && sections.read.length > 0 ? partId(0) : here
  const currentPart = here === 'read' && sections.read.length > 0 ? 0 : partAt

  // Minutes left: the lesson's minutes, in proportion to the words still ahead [estimated].
  const partWords = sections.read.map((part) => piecesWords(part.pieces))
  const testWords = piecesWords(sections.test.pieces)
  const total = piecesWords(sections.run?.pieces ?? []) + piecesWords(sections.intro) + partWords.reduce((a, b) => a + b, 0) + testWords
  const ahead = currentPart >= 0 ? partWords.slice(currentPart).reduce((a, b) => a + b, 0) + testWords : here === 'test' || here === 'keep' ? testWords : total
  const minutesLeft = total === 0 ? lesson.minutes : Math.max(1, Math.round((lesson.minutes * ahead) / total))

  const rail: RailSection[] = []
  const numbered = (n: number, title: string) => (
    <>
      <span className="es-lesson__n">{n}</span> {title}
    </>
  )
  if (sections.run !== null) {
    rail.push({
      id: 'run',
      href: '#run',
      title: numbered(rail.length + 1, 'Run'),
      state: reading?.runDone === true ? 'done' : undefined,
      answers: reading?.runAnswers,
      parts: sections.run.games.map((at) => {
        const block = lesson.blocks[at] as Of<'game'>
        return { id: runAnchor(at), href: `#${runAnchor(at)}`, title: levelTitle(block.id, block.level) }
      }),
    })
  }
  const readParts: RailPart[] = []
  sections.read.forEach((part, at) => {
    readParts.push({ id: partId(at), href: `#${partId(at)}`, title: headingText(part.heading), seen: seen.has(partId(at)) && partId(at) !== current })
    for (const piece of part.pieces) {
      const block = piece.kind === 'block' ? lesson.blocks[piece.at] : undefined
      if (block?.type === 'game') readParts.push({ id: runAnchor(piece.at), href: `#${runAnchor(piece.at)}`, title: levelTitle(block.id, block.level), run: true })
    }
  })
  rail.push({ id: 'read', href: '#read', title: numbered(rail.length + 1, 'Read'), answers: reading?.readAnswers, parts: readParts })
  rail.push({ id: 'test', href: `#${testId}`, title: numbered(rail.length + 1, testName), state: reading?.testWords ?? undefined })
  rail.push({ id: 'keep', href: '#keep', title: numbered(rail.length + 1, 'Keep') })

  const summary = currentPart >= 0 ? `${name} · Read ${currentPart + 1} of ${sections.read.length}` : `${name} · ${here === 'run' ? 'Run' : here === 'test' ? 'Test' : here === 'keep' ? 'Keep' : 'Read'}`

  // The way to the next section from where the reader is: the foot bar's amber control below 64rem, while the reader is in Read. In Run the
  // instrument's dock holds the move in hand at the foot, and in Test the questions do, so the bar steps aside there and never covers them.
  const firstRead = sections.read.length > 0 ? `#${partId(0)}` : '#read'
  const footWay: { href: string; label: string } | null =
    currentPart >= 0 && currentPart < sections.read.length - 1
      ? { href: `#${partId(currentPart + 1)}`, label: `Next part: ${headingText(sections.read[currentPart + 1].heading)}` }
      : currentPart === sections.read.length - 1 && currentPart >= 0
        ? { href: `#${testId}`, label: toTest }
        : null

  const card = sections.cards.length > 0 ? (lesson.blocks[sections.cards[0]] as Of<'card'>) : undefined
  const lastGame = sections.run === null ? -1 : (sections.run.games.at(-1) ?? -1)
  const pieceProps = { lesson, env, whereOf, sections }

  return (
    <div className="es-lesson" data-opener={sections.opener} data-rev={lesson.rev}>
      {row !== undefined && map !== null && given === null ? (
        <Suspense fallback={null}>
          <LessonLedger row={row} lessons={map.lessons} place={place} names={names} onRead={onRead} />
        </Suspense>
      ) : null}
      <header className="es-lesson__head">
        <nav aria-label="Breadcrumb" className="es-lesson__crumbs">
          <ol>
            <li>
              <TextLink to="/map">Course</TextLink>
            </li>
            <li>
              <TextLink to={moduleRoute}>{module === undefined ? moduleCode(lesson.module) : `${moduleCode(lesson.module)} ${module.title}`}</TextLink>
            </li>
            <li aria-current="page">{position < 0 ? lesson.title : `Lesson ${position + 1} of ${lessons.length}`}</li>
          </ol>
        </nav>
        <h1 className="es-lesson__title" id="lesson-title">
          {lesson.title}
        </h1>
        <p className="es-lesson__promise">
          {promise(kcs[0]) ?? 'What this lesson teaches is listed under Keep.'}{' '}
          <span className="es-lesson__size">
            About {lesson.minutes} min, {(lesson.lanes ?? ['B']).map((lane) => LANE_WORDS[lane] ?? lane).join(' and ')}.
          </span>
        </p>
        <BuildsOn refs={lesson.builds_on} />
        {/* The model's card opens from a title block: the opening instrument's own, or, in a lesson that opens on reading, this line. */}
        {card === undefined || card.kind !== 'notional-machine' || sections.run !== null ? null : <ModelLine id={card.id} env={env} />}
      </header>

      <div className="es-lesson__body">
        {wide ? (
          <aside className="es-lesson__rail" aria-label="Where you are in this lesson">
            <SectionRail label="This lesson" sections={rail} current={current} minutesLeft={minutesLeft} />
          </aside>
        ) : (
          <div className="es-lesson__strip">
            <SectionRail label="This lesson" variant="strip" sections={rail} current={current} minutesLeft={minutesLeft} summary={summary} />
          </div>
        )}

        <article ref={setArticle} className="es-lesson__main">
          {sections.run === null ? null : (
            <section id="run" className="es-lesson__section" aria-labelledby="run-title" data-section="run">
              <h2 id="run-title" className="es-lesson__section-title" data-bookmark="skip">
                Run
              </h2>
              <RunSection {...pieceProps} readHref={firstRead} />
              <WayOn href={firstRead} label="Read why" emphasis={wide ? 'after-run' : 'outline'} scope={lesson.id} game={lastGame} />
            </section>
          )}

          <section id="read" className="es-lesson__section" aria-label="Read" data-section="read" data-docked={docked ? '' : undefined}>
            <div className="es-lesson__read-flow">
              {sections.intro.length > 0 ? (
                <div className="es-lesson__prose es-lesson__intro">
                  <Pieces pieces={sections.intro} {...pieceProps} />
                </div>
              ) : null}
              {sections.read.map((part, at) => {
                const id = partId(at)
                const next = sections.read[at + 1]
                return (
                  <section key={id} className="es-lesson__part" aria-labelledby={id} data-part={at + 1}>
                    <h2 id={id} className="es-lesson__part-title">
                      {headingText(part.heading)}
                    </h2>
                    <p className="es-lesson__meta">
                      Part {at + 1} of {sections.read.length}, about {readingMinutes(partWords[at])} min
                    </p>
                    {docked ? null : <BackToRun scope={lesson.id} />}
                    <div className="es-lesson__prose">
                      <Pieces pieces={part.pieces} {...pieceProps} />
                    </div>
                    {/* One amber control per screen (the One Marker Rule): the part being read has it, a part passed or still ahead has
                        an outline; on a phone the current part's way on is the foot bar's, so it is not drawn twice. */}
                    {!wide && at === currentPart ? null : (
                      <WayOn
                        href={next === undefined ? `#${testId}` : `#${partId(at + 1)}`}
                        label={next === undefined ? toTest : `Next part: ${headingText(next.heading)}`}
                        emphasis={wide && at === currentPart ? 'primary' : 'outline'}
                      />
                    )}
                  </section>
                )
              })}
            </div>
            {docked ? (
              <Suspense fallback={null}>
                <Dock scope={lesson.id} />
              </Suspense>
            ) : null}
          </section>

          <section id="test" className="es-lesson__section" aria-labelledby={testId} data-section="test">
            <h2 id={testId} className="es-lesson__part-title">
              {sections.test.heading === null ? 'Test' : headingText(sections.test.heading)}
            </h2>
            <p className="es-lesson__meta">
              {testName}
              {questions > 0 ? ', on new numbers' : ''}
              {reading?.testWords ? `. ${reading.testWords}` : ''}
            </p>
            <div className="es-lesson__prose">
              <Pieces pieces={sections.test.pieces} {...pieceProps} />
            </div>
            {sections.test.graded.map((at) => (
              <Instrument key={at} block={lesson.blocks[at] as Of<'game'>} at={at} blocks={lesson.blocks} scope={lesson.id} rev={lesson.rev} kind="graded" />
            ))}
            {sections.test.questions.map((at) => (
              <Suspense key={at} fallback={<p className="es-lesson__meta">Setting up the questions…</p>}>
                <ItemBlock block={lesson.blocks[at] as Of<'item'>} scope={lesson.id} />
              </Suspense>
            ))}
          </section>

          <Keep lesson={lesson} sections={sections} kcs={kcs} reading={reading} module={module} position={position} testHref={`#${testId}`} toTest={toTest} />
          <Sources env={env} />
        </article>
      </div>

      {wide || footWay === null ? null : (
        <div className="es-lesson__foot">
          <a className="es-lesson__foot-action" href={footWay.href}>
            {footWay.label}
          </a>
        </div>
      )}
    </div>
  )
}

/** "Builds on kernelspace T5.L5, T5.L4": the lessons this one builds on, linked out. A kernelspace KC has no page, so it is left out. */
function BuildsOn({ refs }: { refs: readonly string[] }) {
  const lessons = refs.filter((ref) => !ref.startsWith('ks:') || kernelspaceUrl(ref) !== null)
  if (lessons.length === 0) return null
  return (
    <p className="es-lesson__builds">
      Builds on{' '}
      {lessons.map((ref, at) => {
        const url = kernelspaceUrl(ref)
        return (
          <span key={ref}>
            {at > 0 ? ', ' : null}
            {url === null ? <TextLink to={`/m/${ref}`}>{moduleCode(ref)}</TextLink> : <TextLink href={url}>{kernelspaceLabel(ref)}</TextLink>}
          </span>
        )
      })}
    </p>
  )
}

/** The title block's one line: what the lesson's model is, and what it leaves out, in a panel that hands focus back when it closes. */
function ModelLine({ id, env }: { id: string; env: RenderEnv }) {
  const card = useCard(id)
  const loaded = card.status === 'ready' ? card.value : null
  if (loaded === null) return <p className="es-lesson__model es-titleblock">{card.status === 'error' ? 'The model’s card did not load.' : ' '}</p>
  const plain: RenderEnv = { claims: env.claims, today: env.today, headings: env.headings }
  plain.claim = (claim) => <ClaimInline id={claim} env={plain} />
  return (
    <TitleBlock
      className="es-lesson__model"
      model={`Model of ${loaded.title.replace(/^The /, 'the ')}`}
      leavesOut={
        <div className="es-lesson__card" data-card={loaded.id}>
          <Prose body={loaded.intro} env={plain} />
          {(
            [
              ['What it models', loaded.models],
              ['What it leaves out', loaded.ignores],
              ['What it is checked against', loaded.calibrated],
            ] as const
          ).map(([title, body]) => (
            <div key={title} className="es-lesson__card-part">
              <p className="es-lesson__card-title">{title}</p>
              <Prose body={body} env={plain} />
            </div>
          ))}
        </div>
      }
    />
  )
}

/** A way to the next place on the page. `after-run` is amber once the opening run has ended, and an outline before. */
function WayOn({ href, label, emphasis, scope = '', game = -1 }: { href: string; label: string; emphasis: 'primary' | 'outline' | 'after-run'; scope?: string; game?: number }) {
  const run = useBlockRun(scope, game)
  const fill = emphasis === 'after-run' ? (run !== null ? 'primary' : 'outline') : emphasis
  return (
    <div className="es-next es-lesson__way">
      <a className="es-next__action" data-emphasis={fill} href={href}>
        <span className="es-next__text">
          <span className="es-next__label">{label}</span>
        </span>
      </a>
    </div>
  )
}

interface PieceProps {
  lesson: CompiledLesson
  env: RenderEnv
  whereOf: (game: number) => string
  sections: LessonSections
}

/** The Run: the setup (or the primer, under "Before you run"), then the levels in order, each with the guesses it answers. */
function RunSection({ lesson, env, whereOf, sections, readHref }: PieceProps & { readHref: string }) {
  // The opening levels play one after the other: starting the next folds the one before, so the Run holds one live instrument.
  const [active, setActive] = useState(0)
  // The level the learner chose from the result of the one before it ("Next level: ..." in that run's debrief), which starts at once.
  const [requested, setRequested] = useState(-1)
  const names = useLevelNames()
  const run = sections.run
  if (run === null) return null
  // The way on from each opening run's result (REDESIGN §2.4): the next opening level, and after the last one, "Read why". A run in the
  // lesson never offers to leave it.
  const onwardOf = (order: number): LessonOnward => {
    const next = run.games[order + 1]
    if (next === undefined) return { label: 'Read why', select: () => window.location.assign(readHref) }
    const block = lesson.blocks[next] as Of<'game'>
    return {
      label: `Next level: ${names(block.id, block.level) ?? rosterEntry(block.id)?.title ?? 'the next level'}`,
      select: () => {
        setActive(order + 1)
        setRequested(order + 1)
      },
    }
  }
  const firstGame = run.pieces.findIndex((piece) => piece.kind === 'block' && lesson.blocks[piece.at].type === 'game')
  const lead = run.pieces.slice(0, firstGame)
  const rest = run.pieces.slice(firstGame)
  const pieceProps = { lesson, env, whereOf, sections }
  return (
    <>
      {lead.length > 0 ? (
        <div className={sections.opener === 'B' ? 'es-lesson__prose es-lesson__primer' : 'es-lesson__prose es-lesson__setup'}>
          {sections.opener === 'B' ? <p className="es-lesson__primer-title">Before you run</p> : null}
          <Pieces pieces={lead} {...pieceProps} />
        </div>
      ) : null}
      {rest.map((piece) => {
        const block = piece.kind === 'block' ? lesson.blocks[piece.at] : undefined
        if (block?.type !== 'game') return <Pieces key={`${piece.kind}${piece.at}`} pieces={[piece]} {...pieceProps} />
        const order = run.games.indexOf(piece.at)
        return (
          <Instrument
            key={piece.at}
            block={block}
            at={piece.at}
            blocks={lesson.blocks}
            scope={lesson.id}
            rev={lesson.rev}
            kind="opening"
            guesses={sections.slots.get(piece.at)}
            autoStart={order === 0}
            after={order > 0 ? run.games[order - 1] : undefined}
            onStart={() => setActive(order)}
            folded={order < active}
            onward={onwardOf(order)}
            requested={order === requested}
          />
        )
      })}
    </>
  )
}

/** The pieces of a section, each as what it is on a lesson page. */
function Pieces({ pieces, ...props }: PieceProps & { pieces: readonly Piece[] }) {
  return pieces.map((piece, at) => (piece.kind === 'prose' ? <Prose key={`p${at}`} body={piece.flows} env={props.env} /> : <BlockPiece key={`b${piece.at}`} at={piece.at} {...props} />))
}

const lower = (title: string): string => title.charAt(0).toLowerCase() + title.slice(1)

function BlockPiece({ at, lesson, env, whereOf, sections }: PieceProps & { at: number }): ReactNode {
  const block: CompiledBlock = lesson.blocks[at]
  void env
  switch (block.type) {
    case 'predict': {
      const below = sections.answeredBelow.get(at)
      return (
        <Suspense fallback={<p className="es-lesson__meta">{block.prompt}</p>}>
          <PredictTicket block={block} scope={lesson.id} at={at} blocks={lesson.blocks} rev={lesson.rev} where={below === undefined ? undefined : whereOf(below)} />
        </Suspense>
      )
    }
    case 'game':
      return <Instrument block={block} at={at} blocks={lesson.blocks} scope={lesson.id} rev={lesson.rev} kind="inline" guesses={sections.slots.get(at)} />
    case 'item':
      return (
        <Suspense fallback={<p className="es-lesson__meta">Setting up the question…</p>}>
          <ItemBlock block={block} scope={lesson.id} />
        </Suspense>
      )
    case 'figure':
      return (
        <figure className="es-lesson__figure">
          <img src={publicUrl(block.src)} alt={block.alt} loading="lazy" decoding="async" />
          <figcaption>{block.description}</figcaption>
        </figure>
      )
    case 'card':
      if (block.kind === 'warning')
        return (
          <Note kind="watch" title={block.title === undefined ? undefined : `Watch out: ${lower(block.title)}`}>
            <p>{block.body}</p>
          </Note>
        )
      if (block.kind === 'isomorphism')
        return (
          <Note kind="same-idea" title={block.title === undefined ? undefined : `The same idea elsewhere: ${lower(block.title)}`} breaks={block.breaks}>
            <p>{block.body}</p>
          </Note>
        )
      return null
    case 'trace':
      return <p className="es-lesson__meta">A trace sits here. It is not published yet.</p>
    case 'lab':
    case 'prose':
      return null
  }
}

interface KeepProps {
  lesson: CompiledLesson
  sections: LessonSections
  kcs: readonly string[]
  reading: LedgerReading | null
  module?: IndexModule
  position: number
  testHref: string
  toTest: string
}

/** Keep: what to carry, the Build row, the lesson record, and the way on. */
function Keep({ lesson, sections, kcs, reading, module, position, testHref, toTest }: KeepProps) {
  const next = module?.lessons[position + 1]
  const labs = sections.labs.map((at) => lesson.blocks[at] as Of<'lab'>)
  const fallback = [position < 0 ? lesson.title : `${moduleCode(lesson.module)} lesson ${position + 1}`, 'reading your record…']
  return (
    <section id="keep" className="es-lesson__section es-lesson__keep" aria-labelledby="keep-title" data-section="keep">
      <h2 id="keep-title" className="es-lesson__section-title" data-bookmark="skip">
        Keep
      </h2>
      {kcs.length > 0 ? (
        <>
          <h3 id="keep-carry" className="es-lesson__keep-title">
            What to carry
          </h3>
          <ul className="es-lesson__carry">
            {kcs.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </>
      ) : null}
      {labs.map((lab) => (
        <BuildRow key={lab.id} lab={lab} />
      ))}
      <h3 id="keep-record" className="es-lesson__keep-title">
        Your record of this lesson
      </h3>
      <div className="es-lesson__record" data-record="">
        {(reading?.record ?? fallback).map((line) => (
          <code key={line}>{line}</code>
        ))}
      </div>
      <div className="es-lesson__keep-way" data-passed={reading?.passed === true ? '' : undefined}>
        {reading?.passed === true ? (
          <NextStep to={reading.step.href} label={reading.step.label} minutes={reading.step.minutes} />
        ) : (
          <>
            <div className="es-next">
              <a className="es-next__action" data-emphasis="primary" href={testHref}>
                <span className="es-next__text">
                  <span className="es-next__label">{toTest}</span>
                </span>
              </a>
            </div>
            {next === undefined ? (
              module === undefined ? null : (
                <NextStep to={module.route} label={`Back to ${moduleCode(lesson.module)}`} emphasis="outline" />
              )
            ) : (
              <NextStep to={next.route} label={`Next: lesson ${position + 2}, ${next.title}`} emphasis="outline" />
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** The Build row: the lab's name, what it needs, the stages this lesson prepares, and the way to it. */
function BuildRow({ lab }: { lab: Of<'lab'> }) {
  const pending = pendingLab(lab.id)
  return (
    <>
      <h3 id={`keep-build-${lab.id}`} className="es-lesson__keep-title">
        Build: {labName(lab.id)}
      </h3>
      <p className="es-lesson__build">
        {LANE_WORDS[lab.lane] === undefined ? '' : `Worked ${LANE_WORDS[lab.lane]}. `}This lesson prepares {lab.stages.length === 1 ? 'its stage' : 'its stages'} {lab.stages.join(', ')}.{' '}
        {pending === null ? <TextLink to={`/labs/${lab.id}`}>Open lab</TextLink> : <span>Not published yet.</span>}
      </p>
    </>
  )
}
