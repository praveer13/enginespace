import type { ReactNode } from 'react'
import type { Dist } from '@es/sim/workload'
import type { SceneView } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'

/*
 * The report's setup and the inspector's notes, as the lines of the form (GAMES.md §11 "Cases", §2.6 "The Inspection"). The setup is what the
 * harness was told to do, in the words of its flags, and the notes are what anyone can count off the log. Neither names the flaw, and
 * none of them is the corrected number: a line is here because it is evidence. A flag the harness did not use has no line, as it has none
 * on a real command line. Every figure is set in the printer's dots, and the form carries one stamp that says all of them are synthetic
 * (PRODUCT.md, "Evidence on Hand"; DESIGN.md, "The Dots For Numbers Rule"), as the printer's tape does for its ticks.
 */

export interface FormLine {
  readonly id: string
  /** The line's name: the engine's term. */
  readonly term: string
  readonly says: ReactNode
}

const fig = (value: number, digits = 0): ReactNode => <span className="font-numeric">{formatReadout(value, digits)}</span>
const count = (value: number, unit?: 'tokens' | 'requests'): ReactNode => (unit === undefined ? fig(value) : <>{fig(value)} {unit === 'tokens' ? 'tokens' : 'orders'}</>)
const perSecond = (milli: number): ReactNode => fig(milli / 1000, 1)
const ms = (us: number, digits = 1): ReactNode => <>{fig(us / 1000, digits)} ms</>

/** A length distribution in words. */
function lengths(name: string, dist: Dist): ReactNode {
  switch (dist.kind) {
    case 'const':
      return (
        <>
          {name} of {count(dist.value, 'tokens')}
        </>
      )
    case 'uniform':
      return (
        <>
          {name} from {count(dist.lo)} to {count(dist.hi, 'tokens')}
        </>
      )
    case 'menu': {
      const top = Math.max(...dist.values)
      return (
        <>
          {name} mostly short, a few as long as {count(top, 'tokens')}
        </>
      )
    }
  }
}

/** The setup of the report: how guests arrived, what the timer did, what was offered, and what was left out. */
export function setupLines(scene: SceneView): FormLine[] {
  const { setup, claim, harnessCut } = scene
  const lines: FormLine[] = []
  const a = setup.arrivals
  const rate = a.kind === 'closed' ? a.schedule : a
  const schedule = rate !== undefined && rate.kind === 'poisson' ? perSecond(rate.ratePerSMilli) : null
  switch (a.kind) {
    case 'poisson':
      lines.push({ id: 'arrivals', term: 'Guests arrive', says: <>walk-ins at {schedule} orders a second, whenever they come (an open loop)</> })
      break
    case 'burst':
      lines.push({ id: 'arrivals', term: 'Guests arrive', says: <>every order due at once, at the start (a burst)</> })
      break
    case 'replay':
      lines.push({ id: 'arrivals', term: 'Guests arrive', says: <>as a recorded trace did, at its own timestamps</> })
      break
    case 'closed':
      lines.push({
        id: 'arrivals',
        term: 'Guests arrive',
        says:
          schedule === null ? (
            <>
              a fixed set of {count(a.clients)} tables, each ordering again when its last reply lands{a.thinkUs === 0 ? ', with no think time' : ''} (a closed loop)
            </>
          ) : (
            <>
              walk-ins due at {schedule} orders a second, with at most {count(a.clients)} orders out at once: a table sends only when a reply frees it
            </>
          ),
      })
      break
  }
  lines.push({ id: 'timer', term: 'Timer starts', says: claim.timerStartsAt === 'send' ? <>when the order is sent</> : <>when the guest was due</> })
  lines.push({ id: 'offered', term: 'Orders offered', says: count(setup.requests, 'requests') })
  lines.push({
    id: 'warmup',
    term: 'Warm-up',
    says: harnessCut === 0 ? <>none declared: every order is timed</> : <>the first {fig(harnessCut)} orders, due in the first {ms(setup.warmupUs, 0)}, left out</>,
  })
  if (setup.lengths !== undefined) {
    const l = setup.lengths
    lines.push({
      id: 'lengths',
      term: 'Prompts and replies',
      says:
        l.kind === 'rows' ? (
          <>
            from a recorded trace, {l.slice.name} ({count(l.slice.requests.length)} rows)
          </>
        ) : (
          <>
            {lengths('prompts', l.prompt)}; {lengths('replies', l.output)}
          </>
        ),
    })
  }
  if (setup.outputCap !== undefined) lines.push({ id: 'cap', term: 'Reply cap', says: <>every reply cut at {count(setup.outputCap, 'tokens')} (max_tokens)</> })
  if (setup.prefixWarm === true) lines.push({ id: 'cache', term: 'Server at the start', says: <>the previous run's prompts are still in its prefix cache</> })
  if (setup.clientCostUs !== undefined) lines.push({ id: 'client', term: 'Client', says: <>one thread, {ms(setup.clientCostUs, 1)} to send each order</> })
  lines.push({
    id: 'server',
    term: 'Server',
    says: (
      <>
        {scene.server.label.split(' · host term')[0]}, {count(scene.server.maxNumSeqs)} orders running at once, {count(scene.server.maxBatchedTokens, 'tokens')} a step
      </>
    ),
  })
  return lines
}

/** What anyone can count off the log. None of it is the corrected number. */
export function noteLines(scene: SceneView): FormLine[] {
  const f = scene.facts
  const lines: FormLine[] = [
    { id: 'late', term: 'Sent late', says: <>{fig(f.lateSends)} of {count(f.orders, 'requests')} more than {ms(2000, 0)} after they were due; the worst by {ms(f.maxLateUs, 1)}</> },
    {
      id: 'flight',
      term: 'Out at once',
      says: (
        <>
          at most {count(f.inFlightPeak)} orders sent and not yet replied to{f.clients === null ? '' : <>, with {count(f.clients)} tables</>}
        </>
      ),
    },
    {
      id: 'finished',
      term: 'Finished a second',
      says: (
        <>
          {perSecond(f.finishedPerSMilli)} orders; the report is about traffic of {perSecond(scene.claim.ratePerSMilli)}; the engine card says this server finishes about {perSecond(scene.capacityPerSMilli)} at most
        </>
      ),
    },
    {
      id: 'replies',
      term: 'Replies',
      says: (
        <>
          {count(f.meanOutputTokens, 'tokens')} on average, the longest {count(f.longestOutputTokens, 'tokens')}; prompts {count(f.meanPromptTokens, 'tokens')} on average
        </>
      ),
    },
  ]
  return lines
}
