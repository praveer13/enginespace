import { Suspense, useCallback, useMemo, useState, type ComponentProps } from 'react'
// By path, not through the package's index, which brings the registry and every family's code with it (D-059).
import { CATALOG } from '@es/play/items/catalog'
import type { Gen } from '@es/play/items/types'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { useMap } from '@/content/load-map'
import { useEvidence } from '@/evidence/useEvidence'
import { moduleCode } from '@/progress/words'
import { useWayOn } from '@/progress/useWayOn'
import { usePointer } from '@/settings/usePlace'
import { freshEntropy } from '../answer'
import { useFamily } from '../families'
import { deriveCards } from './cards'
import { MORE_PREP, PRINT_LABEL, START_AHEAD, START_PREP } from './copy'
import { seenKeys } from './draw'
import { appKcsOfRef, kcsOfRefWith } from './kcs'
import { lineViews, nextServableDay, planFor, servable, tally } from './plan'
import type { LineView, Plan, Result } from './plan'
import { PrepList, PrepStrip } from './PrepList'
import type { IdeaRow } from './PrepList'
import { nominalSeconds } from './session'
import type { Session } from './session'
import { Aside, DoneTicket, EmptyTicket, LoadingTicket, RestTicket } from './Tickets'
import { useLocalDay } from './useLocalDay'
import Work from './Work'
import './today.css'

/*
 * /today, the part under the page's title (REDESIGN 3.10; ARCHITECTURE §3.1: "Keep: spaced review of the KCs earned so far"; D-037; ASSESSMENT §8).
 *
 * The page reads the ledger and derives the deck (cards.ts); nothing it shows is stored. What is due comes from the deck and the day. A
 * review is started with the amber Start review, which freezes the list it was started with: the deck changes as each answer is written,
 * and the list under the learner's hands must not. Each question is drawn when it comes up, from entropy read then (ARCHITECTURE §8.2), and
 * writing it is the question's own business (Work.tsx). When the set is done, the page offers the way on (Continue, from `nextStep`) and
 * another set if more is due, or a review ahead, and otherwise says when the next review is.
 *
 *   list   something is due: the set, with its idea sentences, and a quiet column beside it
 *   work   a review is started: the question stands beside the set's states on a wide screen, and the set folds to a strip on a phone
 *   done   the set is finished: the tally, the next review, Continue, and what became of each idea
 *   rest   nothing is due that can be served; empty: nothing is earned to keep
 *
 * The set is composed from the families' faces (packages/play/items/catalog.ts), and the code of the family that serves a question loads
 * when the question comes up, under the loading sheet (src/items/families.ts, D-059): the page carries no family's code of its own.
 */

type Run =
  | { readonly phase: 'work'; readonly session: Session; readonly index: number; readonly entropy: number; readonly results: readonly Result[] }
  | { readonly phase: 'done'; readonly session: Session; readonly results: readonly Result[] }

export interface TodayViewProps {
  /** The item families, whole. The catalog's faces, with each family's code loaded when its ticket comes up, unless a test gives its own. */
  families?: readonly Gen[]
}

type WorkOfProps = Omit<ComponentProps<typeof Work>, 'gen'> & { families?: readonly Gen[] }

/** The ticket being prepped, once the code of the family that serves it has loaded. Until then the Suspense boundary shows the loading ticket. */
function WorkOf({ families, ...rest }: WorkOfProps) {
  const gen = useFamily(rest.line.family, families)
  return <Work {...rest} gen={gen} />
}

export function TodayView({ families: given }: TodayViewProps) {
  const families = given ?? CATALOG
  const evidence = useEvidence()
  const today = useLocalDay()
  const [run, setRun] = useState<Run | null>(null)
  // A prediction names its ideas through the compiled map's refs (kcs.ts), so the deck waits for the map to settle: a map that failed leaves predictions out.
  const map = useMap()
  const refs = map.status === 'ready' ? map.value.refs : undefined
  const resolve = useMemo(() => (refs === undefined ? appKcsOfRef : kcsOfRefWith(refs)), [refs])
  const set = useMemo(() => deriveCards(evidence.events, resolve, today, { servable: (card) => servable(card, families) }), [evidence.events, resolve, today, families])
  const plan: Plan = useMemo(() => planFor(set, today, { families }), [set, today, families])
  const results = run === null ? null : run.results
  // What the learner has met: the ledger's seeds, and the questions of this review, which may not be in the ledger yet.
  const met = useMemo(() => new Set([...seenKeys(evidence.events, families), ...(results ?? []).map((result) => result.key)]), [evidence.events, families, results])

  // The way on is `nextStep`'s, which is told how many reviews are due: with every lesson done, Continue is Review, and a page that is
  // Review itself has no Continue to offer (the set's own button is the way on).
  const lessons = map.status === 'ready' ? map.value.lessons : null
  const due = plan.kind === 'list' ? plan.session.lines.length : 0
  const step = useWayOn(lessons, undefined, due)
  const pointer = usePointer()
  const onward = step ?? pointer
  const way = onward.href === '/today' ? null : onward

  // An idea in the words of the course: its own sentence from the map, its module's code, and the day it was last seen.
  const ideas = useMemo(() => {
    const sentences = new Map((map.status === 'ready' ? map.value.kcs : []).map((kc) => [kc.id, kc.description]))
    return (views: readonly LineView[]): IdeaRow[] =>
      views.map((view) => {
        const seen = set.cards.get(view.kc)?.lastDay
        return { ...view, sentence: sentences.get(view.kc) ?? view.title, code: moduleCode(view.kc.split('.')[0]), ...(seen === undefined ? {} : { seen }) }
      })
  }, [map, set])

  const start = useCallback((session: Session) => setRun({ phase: 'work', session, index: 0, entropy: freshEntropy(1)[0], results: [] }), [])
  const next = nextServableDay(set, today, families)

  if (!evidence.ready || map.status === 'loading') {
    return (
      <div className="es-prep" data-phase="loading">
        <LoadingTicket />
      </div>
    )
  }

  if (run?.phase === 'work') {
    const { session, index } = run
    const line = session.lines[index]
    const views = lineViews(session.lines, run.results, index)
    return (
      <div className="es-prep" data-phase="work" data-layout="split">
        <PrepStrip marks={views.map(({ state, ok }) => ({ state, ...(ok === undefined ? {} : { ok }) }))} secondsLeft={nominalSeconds(session.lines.length - run.results.length)} />
        <div className="es-prep__main">
          <Suspense key={index} fallback={<LoadingTicket label={PRINT_LABEL} />}>
            <WorkOf
              line={line}
              index={index}
              total={session.lines.length}
              entropy={run.entropy}
              met={met}
              card={set.cards.get(line.kc)}
              today={today}
              last={index === session.lines.length - 1}
              {...(given === undefined ? {} : { families: given })}
              onChecked={(result) => setRun((current) => (current?.phase === 'work' ? { ...current, results: [...current.results, result] } : current))}
              onNext={() => {
                // The entropy is read here and not inside the updater: React may call an updater twice, and a read of the browser's entropy is not a pure step.
                const entropy = index === session.lines.length - 1 ? 0 : freshEntropy(1)[0]
                setRun((current) => {
                  if (current?.phase !== 'work') return current
                  return index === current.session.lines.length - 1 ? { phase: 'done', session: current.session, results: current.results } : { ...current, index: index + 1, entropy }
                })
              }}
            />
          </Suspense>
        </div>
        <div className="es-prep__side">
          <PrepList mode={session.mode} rows={ideas(views)} seconds={session.seconds} phase="work" />
        </div>
      </div>
    )
  }

  if (run?.phase === 'done') {
    const { session } = run
    const counts = tally(run.results)
    const more =
      plan.kind === 'list'
        ? { label: MORE_PREP, run: () => start(plan.session) }
        : plan.kind === 'rest' && plan.ahead.lines.length > 0
          ? { label: START_AHEAD, run: () => start(plan.ahead) }
          : null
    return (
      <div className="es-prep" data-phase="done" data-layout="split">
        <div className="es-prep__main">
          <DoneTicket rows={ideas(lineViews(session.lines, run.results, null))} right={counts.right} total={counts.total} next={next} more={more} ahead={session.mode === 'ahead'} way={way} />
        </div>
        <div className="es-prep__side">
          <Aside kept={set.cards.size} next={null} />
        </div>
      </div>
    )
  }

  switch (plan.kind) {
    case 'empty':
    case 'unserved':
      return (
        <div className="es-prep" data-phase="empty">
          <div className="es-prep__main">
            <EmptyTicket unserved={plan.kind === 'unserved'} way={way} />
          </div>
        </div>
      )
    case 'rest':
      return (
        <div className="es-prep" data-phase="rest" data-layout="split">
          <div className="es-prep__main">
            <RestTicket next={plan.next} ahead={plan.ahead.lines.length > 0} onAhead={() => start(plan.ahead)} way={way} />
          </div>
          <div className="es-prep__side">
            <Aside kept={set.cards.size} next={null} />
          </div>
        </div>
      )
    case 'list':
      return (
        <div className="es-prep" data-phase="list" data-layout="split">
          <div className="es-prep__main">
            <PrepList
              mode={plan.session.mode}
              rows={ideas(lineViews(plan.session.lines, [], null))}
              seconds={plan.session.seconds}
              phase="list"
              start={<PrimaryButton onClick={() => start(plan.session)}>{START_PREP}</PrimaryButton>}
            />
          </div>
          <div className="es-prep__side">
            <Aside kept={set.cards.size} next={next} />
          </div>
        </div>
      )
  }
}
