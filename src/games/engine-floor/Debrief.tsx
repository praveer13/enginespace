import { useId, useMemo, type ReactNode } from 'react'
import { drawInBand } from '@es/play'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import { factsOf, type HouseFacts } from '@es/play/engine-floor/facts'
import { frameSvg, layoutMap, mapOfScenario } from '@es/play/engine-floor/layout'
import { rivalScenario } from '@es/play/engine-floor/levels'
import { floorSession } from '@es/play/engine-floor/session'
import { referenceOf } from '@es/play/engine-floor/stages'
import { FLOOR_NAMES } from '@es/play/engine-floor/words'
import { entryOf } from '@es/sim/lifecycle'
import type { Scenario } from '@es/sim/lifecycle'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { Cite } from './Cite'
import { Code } from './Code'
import { svgToReact } from './svg'
import { TapeCheck } from './TapeCheck'
import type { FloorOutcome, FloorRun } from './types'
import { useOrientation } from './useOrientation'

/*
 * Back of House's debrief (GAMES.md §5, "Core loop" step 6; §2.4 test 7: the first wrong stage): one sentence that says what the run did;
 * the first stage that did not hold, from its source; the prediction against the path's own count; and the engine's house laid beside
 * the other engine's, with what differs said in words and set in bold. Where does detokenizing run? How many ZMQ hops? How do the ranks
 * get the batch?
 *
 * The house run is the ghost: it is the engine's own path, which the page reads from the pinned lifecycle data. A learner whose
 * path held already has it, and one whose path did not sees the stage that failed beside the engine's. The counts are derived from
 * the stages (packages/play/engine-floor/facts.ts), so each is a Readout that says so.
 *
 * The graded `map` (W1-T19) adds two things to it. It says whether the scenario was passed, which is the whole path right on the one
 * run, and it reads the path against the scenario's tape (TapeCheck.tsx): the table of `spanCheck` and the lifecycle trace in the trace
 * viewer. A graded run's own way on is another fresh scenario, since the same one cannot be graded twice.
 */

export interface DebriefProps {
  run: FloorRun
  outcome: FloorOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  /** A graded run on a fresh scenario, for a level that can be graded. Null or left out where it cannot. */
  onGraded?: (() => void) | null
  /** Back to the level in practice, for a graded run. */
  onPractice?: (() => void) | null
}

/** The one true thing, in a sentence (GAMES.md §5, "Module and concept"). */
const ONE_TRUE_THING =
  'A request crosses a boundary only through the mechanism that crosses it: a queue between threads, IPC or shared memory between processes, a copy or a launch between the host and the GPU, and a sync before anyone reads what the GPU brought back. What differs from engine to engine is the architecture, which is why the stages differ and the rules do not.'

/** A house drawn flat: an engine's whole path, every stop inked and the ticket home. */
function House({ scenario, label }: { scenario: Scenario; label: string }) {
  const orientation = useOrientation()
  const id = useId().replaceAll(/\W/g, '')
  const drawing = useMemo(() => svgToReact(frameSvg(layoutMap(mapOfScenario(scenario, label), { orientation }), id)), [scenario, label, orientation, id])
  return (
    <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" data-floor-house="">
      {drawing}
    </div>
  )
}

const count = (value: number) => <Readout value={value} tag="derived" size="sm" />
const windows = (facts: HouseFacts): number => facts.byMechanism.ipc + facts.byMechanism.shm
const place = (text: string | null) => (text === null ? <span className="text-text-2">nowhere</span> : <code className="es-type-mono">{text}</code>)

interface FactRow {
  readonly id: string
  readonly term: string
  readonly mine: ReactNode
  readonly theirs: ReactNode
  readonly differs: boolean
}

/** The facts set side by side. A row whose two values differ is the difference, and is set in bold with a word that says so for a screen reader. */
function factRows(a: HouseFacts, b: HouseFacts): FactRow[] {
  const ranks = (facts: HouseFacts) =>
    facts.ranksVia === null ? <span className="text-text-2">one rank: nothing to send</span> : <Code>{`${facts.ranksVia.mechanism} · ${facts.ranksVia.label}`}</Code>
  return [
    { id: 'boundaries', term: "Process boundaries a sampled token crosses on its way to the client", mine: count(a.boundariesOut), theirs: count(b.boundariesOut), differs: a.boundariesOut !== b.boundariesOut },
    { id: 'zmq', term: 'Hops over ZMQ', mine: count(a.zmqHops), theirs: count(b.zmqHops), differs: a.zmqHops !== b.zmqHops },
    { id: 'detok', term: 'Where detokenizing runs', mine: place(a.detokenizesAt), theirs: place(b.detokenizesAt), differs: a.detokenizesAt !== b.detokenizesAt },
    ...(a.ranksVia === null && b.ranksVia === null
      ? []
      : [{ id: 'ranks', term: 'How the ranks get the batch', mine: ranks(a), theirs: ranks(b), differs: a.ranksVia?.label !== b.ranksVia?.label }]),
    { id: 'processes', term: 'Processes the path visits', mine: count(a.processes), theirs: count(b.processes), differs: a.processes !== b.processes },
    { id: 'windows', term: 'Windows between processes (IPC and shared memory)', mine: count(windows(a)), theirs: count(windows(b)), differs: windows(a) !== windows(b) },
    { id: 'spikes', term: 'Spikes (queues) on the path', mine: count(a.byMechanism.queue), theirs: count(b.byMechanism.queue), differs: a.byMechanism.queue !== b.byMechanism.queue },
    { id: 'stages', term: 'Stages in the path', mine: count(a.stages), theirs: count(b.stages), differs: a.stages !== b.stages },
  ]
}

/** The floors that only one house has: the architecture's difference, in the kitchen's words. */
const onlyIn = (facts: HouseFacts, other: HouseFacts): string[] => facts.floors.filter((kind) => !other.floors.includes(kind)).map((kind) => FLOOR_NAMES[kind].toLowerCase())

function Houses({ scenario }: { scenario: Scenario }) {
  const rival = rivalScenario(scenario)
  const mine = factsOf(referenceOf(scenario), entryOf(scenario.engine))
  const theirs = factsOf(referenceOf(rival), entryOf(rival.engine))
  const names = [ENGINE_NAMES[scenario.engine], ENGINE_NAMES[rival.engine]]
  const mineOnly = onlyIn(mine, theirs)
  const theirsOnly = onlyIn(theirs, mine)
  const rows = factRows(mine, theirs)
  return (
    <section aria-label="Two houses, side by side" className="flex flex-col gap-4" data-floor-houses="">
      <h3>Two houses, side by side</h3>
      <figure className="flex flex-col gap-1">
        <figcaption className="font-bold">{names[0]}</figcaption>
        <House scenario={scenario} label={`The house of ${names[0]}: its whole path, every stage held.`} />
      </figure>
      <figure className="flex flex-col gap-1">
        <figcaption className="font-bold">{names[1]}</figcaption>
        <House scenario={rival} label={`The house of ${names[1]}: its whole path, every stage held.`} />
      </figure>
      {mineOnly.length > 0 || theirsOnly.length > 0 ? (
        <p className="max-w-prose" data-floor-floors="">
          {mineOnly.length > 0 ? (
            <>
              <strong>{names[0]}</strong> has {mineOnly.join(' and ')}, which {names[1]} does not.{' '}
            </>
          ) : null}
          {theirsOnly.length > 0 ? (
            <>
              <strong>{names[1]}</strong> has {theirsOnly.join(' and ')}, which {names[0]} does not.
            </>
          ) : null}
        </p>
      ) : null}
      <div role="region" aria-label="How the two houses differ" tabIndex={0} className="overflow-x-auto">
        <table className="w-full border-collapse text-left" data-floor-facts="">
          <caption className="pb-2 text-left font-bold">How the two houses differ</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                Fact
              </th>
              <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                {names[0]}
              </th>
              <th scope="col" className="border-b border-edge py-2 font-bold">
                {names[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-paper-rule" data-differs={row.differs || undefined}>
                <th scope="row" className={row.differs ? 'py-2 pr-4 text-left font-bold underline decoration-2 underline-offset-4' : 'py-2 pr-4 text-left font-normal'}>
                  {row.term}
                  {row.differs ? <span className="sr-only"> (the houses differ)</span> : null}
                </th>
                <td className={row.differs ? 'py-2 pr-4 font-bold' : 'py-2 pr-4'}>{row.mine}</td>
                <td className={row.differs ? 'py-2 font-bold' : 'py-2'}>{row.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-text-2">Every count is derived from the stages of the two pinned paths, and so is only as good as the stages are.</p>
    </section>
  )
}

/** The ticket's title: how the run ended, in the words of the level that allows one run as well as of the ones that allow many. */
function titleOf(run: FloorRun, ok: boolean): string {
  if (ok) return 'Every hand-off held.'
  return run.view.mistake === null && run.view.stop === null ? 'The path stopped short.' : 'A hand-off broke.'
}

export function Debrief({ run, outcome, next, onNext, onGraded = null, onPractice = null }: DebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  const scenario = view.scenario
  const truth = factsOf(referenceOf(scenario), entryOf(scenario.engine)).boundariesOut
  const predicted = view.prediction
  const last = next === null
  const graded = run.mode === 'graded'
  const map = view.level === 'map'

  function newTray() {
    const entropy = crypto.getRandomValues(new Uint32Array(1))[0]
    run.restart(drawInBand(floorSession, view.level, entropy))
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-floor-debrief="">
      <Ticket
        as="section"
        width="full"
        hole={false}
        head="Debrief"
        meta={view.title}
        titleAs="h3"
        title={titleOf(run, grade.ok)}
        stub={
          graded && onGraded !== null ? (
            <Stub onClick={onGraded}>Another fresh scenario</Stub>
          ) : last ? (
            <Stub to="/map">Open the course map</Stub>
          ) : (
            <Stub onClick={onNext}>Next level</Stub>
          )
        }
      >
        <p className="es-type-body">
          <Code>{debrief.sentence}</Code>
        </p>
        {map ? (
          <p className="max-w-prose" data-floor-graded={graded ? (grade.ok ? 'passed' : 'missed') : 'practice'}>
            {graded ? (
              <>
                <strong>{grade.ok ? 'Passed.' : 'Not passed.'}</strong>{' '}
                {grade.ok ? 'The whole path was right on its first run, and every stage matches a span of the tape, in order. ' : 'The level asks for the whole path, right on its first run. '}
                It asks that of <Readout value={3} tag="estimated" size="sm" /> fresh scenarios, and each gets its own run.
              </>
            ) : (
              <>
                <strong>Practice.</strong> A pinned scenario with undo: it earns nothing. A graded run draws a fresh scenario and gives the path one run.
              </>
            )}
          </p>
        ) : null}
        {view.mistake !== null ? (
          <div className="flex flex-col gap-3" data-floor-first-wrong="">
            {view.mistake.expected === null ? null : <Cite title={`What ${ENGINE_NAMES[view.pin.engine]} does there`} note={view.mistake.expected} />}
            <Cite title="What was laid" note={view.mistake.laid} />
          </div>
        ) : null}
        <p className="flex flex-wrap items-baseline gap-x-2" data-floor-prediction-result="">
          <strong>Your prediction:</strong>
          {predicted === null ? <span>none</span> : <span className="font-numeric text-size-plate">{predicted}</span>}
          <span>
            {predicted === truth ? 'It was right: the path has' : 'The path has'} {count(truth)} process {truth === 1 ? 'boundary' : 'boundaries'} on a sampled token&apos;s way to the client.
          </span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3 text-text-2" data-floor-counts="">
          <span>
            Stages that held before the first that did not: <span className="font-numeric">{run.score.survived}</span> of {count(view.stages)}
          </span>
          <span>
            Runs: <span className="font-numeric">{view.runs}</span>
          </span>
        </p>
        {last || graded ? null : (
          <p className="text-text-2" data-floor-next="">
            Next level: <strong className="text-text-1">{next.title}</strong>
          </p>
        )}
      </Ticket>

      <TapeCheck view={view} />

      <Houses scenario={scenario} />

      <section aria-label="What to take away" className="flex flex-col gap-2">
        <p className="es-type-body max-w-prose">{ONE_TRUE_THING}</p>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        {graded ? (
          <>
            {onGraded === null ? null : (
              <Button variant="ink" onClick={onGraded}>
                Another fresh scenario
              </Button>
            )}
            {onPractice === null ? null : (
              <Button variant="plate" onClick={onPractice}>
                Practice this level
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="plate" onClick={() => run.restart()}>
              Play this level again
            </Button>
            <Button variant="ink" onClick={newTray}>
              {map ? 'Try another scenario' : 'Shuffle the tray'}
            </Button>
            {onGraded === null ? null : <Button onClick={onGraded}>Start a graded run</Button>}
          </>
        )}
        {last ? <TextLink to="/m/tr1">Open TR1</TextLink> : null}
      </div>
    </div>
  )
}
