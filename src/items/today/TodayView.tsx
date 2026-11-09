import { Suspense, useCallback, useMemo, useState, type ComponentProps } from 'react'
// By path, not through the package's index, which brings the registry and every family's code with it (D-059).
import { CATALOG } from '@es/play/items/catalog'
import type { Gen } from '@es/play/items/types'
import { Stub } from '@/design/components/Stub'
import { useEvidence } from '@/evidence/useEvidence'
import { freshEntropy } from '../answer'
import { useFamily } from '../families'
import { deriveCards } from './cards'
import { MORE_PREP, PRINT_LABEL, START_AHEAD, START_PREP } from './copy'
import { seenKeys } from './draw'
import { appKcsOfRef } from './kcs'
import { lineViews, nextServableDay, planFor, servable, tally } from './plan'
import type { Plan, Result } from './plan'
import { PrepList, PrepStrip } from './PrepList'
import { nominalSeconds } from './session'
import type { Session } from './session'
import { BlankTicket, DoneTicket, EmptyTicket, LoadingTicket, RestTicket } from './Tickets'
import { useLocalDay } from './useLocalDay'
import Work from './Work'
import './today.css'

/*
 * /today, the part under the page's title (ARCHITECTURE §3.1: "Keep: spaced review of the KCs earned so far"; D-037; ASSESSMENT §8).
 *
 * The page reads the ledger and derives the deck (cards.ts); nothing it shows is stored. What is due comes from the deck and the day. A
 * prep is started with a pull of the stub, which freezes the list it was started with: the deck changes as each answer is written, and
 * the list under the learner's hands must not. Each ticket is drawn when it comes up, from entropy read then (ARCHITECTURE §8.2), and
 * writing it is the ticket's own business (Work.tsx). When the list is done, the page offers another list if more is due, or a review
 * ahead, and otherwise says when the next prep is.
 *
 *   list   something is due: the prep list, and a blank ticket beside it on a wide screen where the first will print
 *   work   a prep is started: the list folds to a strip on a phone and stands beside the ticket on a wide screen
 *   done   the list is finished: the tally, and what became of each idea
 *   rest   nothing is due that can be served; empty: nothing is earned to keep
 *
 * The list is composed from the families' faces (packages/play/items/catalog.ts), and the code of the family that serves a ticket loads
 * when the ticket comes up, under the loading ticket (src/items/families.ts, D-059): the page carries no family's code of its own.
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
  const set = useMemo(() => deriveCards(evidence.events, appKcsOfRef, today, { servable: (card) => servable(card, families) }), [evidence.events, today, families])
  const plan: Plan = useMemo(() => planFor(set, today, { families }), [set, today, families])
  const results = run === null ? null : run.results
  // What the learner has met: the ledger's seeds, and the tickets of this prep, which may not be in the ledger yet.
  const met = useMemo(() => new Set([...seenKeys(evidence.events, families), ...(results ?? []).map((result) => result.key)]), [evidence.events, families, results])

  const start = useCallback((session: Session) => setRun({ phase: 'work', session, index: 0, entropy: freshEntropy(1)[0], results: [] }), [])

  if (!evidence.ready) {
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
        <PrepList day={session.day} mode={session.mode} lines={views} seconds={session.seconds} phase="work" />
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
      <div className="es-prep" data-phase="done">
        <DoneTicket
          day={session.day}
          lines={lineViews(session.lines, run.results, null)}
          right={counts.right}
          total={counts.total}
          next={nextServableDay(set, today, families)}
          more={more}
          ahead={session.mode === 'ahead'}
        />
      </div>
    )
  }

  switch (plan.kind) {
    case 'empty':
    case 'unserved':
      return (
        <div className="es-prep" data-phase="empty">
          <EmptyTicket day={today} unserved={plan.kind === 'unserved'} />
        </div>
      )
    case 'rest':
      return (
        <div className="es-prep" data-phase="rest">
          <RestTicket day={today} next={plan.next} ahead={plan.ahead.lines.length > 0} onAhead={() => start(plan.ahead)} />
        </div>
      )
    case 'list':
      return (
        <div className="es-prep" data-phase="list" data-layout="split">
          <PrepList
            day={plan.session.day}
            mode={plan.session.mode}
            lines={lineViews(plan.session.lines, [], null)}
            seconds={plan.session.seconds}
            phase="list"
            lamp
            stub={<Stub onClick={() => start(plan.session)}>{START_PREP}</Stub>}
          />
          <BlankTicket />
        </div>
      )
  }
}
