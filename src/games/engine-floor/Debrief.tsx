import { useContext, useMemo, type ReactNode } from 'react'
import { drawInBand } from '@es/play'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import { factsOf, MAX_PREDICTION, type PathFacts } from '@es/play/engine-floor/facts'
import { rivalScenario } from '@es/play/engine-floor/levels'
import { floorSession } from '@es/play/engine-floor/session'
import { referenceOf } from '@es/play/engine-floor/stages'
import { FLOOR_NAMES, floorKindOf, handoffWords, permalink, placeKey, placeName, splitCode } from '@es/play/engine-floor/words'
import type { StageNote } from '@es/play/engine-floor/types'
import { entryOf } from '@es/sim/lifecycle'
import type { Place, Scenario } from '@es/sim/lifecycle'
import { Button } from '@/design/components/Button'
import { NumberLine } from '@/design/components/NumberLine'
import { Stamp } from '@/design/components/Stamp'
import { TextLink } from '@/design/components/TextLink'
import { Debrief as Result } from '@/games/kit/Debrief'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { verdictOf } from '@/games/kit/verdict'
import { TapeCheck } from './TapeCheck'
import type { FloorOutcome, FloorRun } from './types'

/*
 * Request path's result (GAMES.md §5, "Core loop" step 6; REDESIGN §2.6): the kit's debrief, filled. The verdict word from the grade, one
 * sentence that says what the run did, the ways on (the next level first; in a lesson, the lesson's), then the first stage that did not
 * hold with the mechanism that was wrong and both stages' sources, the prediction beside the path's own count on one number line, and this
 * engine's path set beside another engine's as two small swimlanes, with what differs marked in words and in bold.
 *
 * The graded map adds two things: whether the scenario passed (the whole path right on its one run), and the path read against the
 * scenario's synthetic trace (TapeCheck.tsx). Its own way on is another fresh scenario, since the same one cannot be graded twice.
 *
 * It is a chunk of its own, loaded when a run ends, and it imports nothing that only the game's chunk holds (the swimlane, the dock's
 * pieces): a lazy chunk that did would fold the game's own chunk into a shared one, and `verify:bundle` finds a game by that chunk.
 */

/** A line with its code spans set in the code face. */
function Spans({ text }: { text: string }) {
  return (
    <>
      {splitCode(text).map((piece, index) =>
        piece.code ? (
          <code key={index} className="es-type-mono [overflow-wrap:anywhere]">
            {piece.text}
          </code>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  )
}

/** A stage with where it is read: its mechanism and label, its places, and its file, symbol and line at the pin as a link. */
function Source({ title, note }: { title: string; note: StageNote }) {
  return (
    <div className="es-floor-source" data-cite="">
      <p className="es-floor-source__title">{title}</p>
      <p>
        <strong>{handoffWords(note.mechanism)}</strong>: <Spans text={note.label} />. {ENGINE_NAMES[note.engine]}, from <code>{placeName(note.from)}</code> to{' '}
        <code>{placeName(note.to)}</code>.
      </p>
      <p className="es-floor-source__link">
        <TextLink href={permalink(note.source)}>
          <code>{note.source.path}</code>
        </TextLink>{' '}
        · <code>{note.source.symbol}</code> · line <span className="font-numeric">{note.source.line}</span>
      </p>
    </div>
  )
}

export interface DebriefProps {
  run: FloorRun
  outcome: FloorOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  /** A graded run on a fresh scenario, for the level that can be graded. Null where it cannot. */
  onGraded?: (() => void) | null
  /** Inside a lesson: the ways on are the lesson's, and none of them leaves it. */
  embedded?: boolean
}

/** The one true thing, in a sentence (GAMES.md §5, "Module and concept"). */
const ONE_TRUE_THING =
  'A request crosses a boundary only through the mechanism that crosses it: a queue between threads, IPC or shared memory between processes, a copy or a launch between the host and the GPU, and a sync before anyone reads what the GPU brought back. What differs from engine to engine is the architecture, which is why the stages differ and the rules do not.'

const count = (value: number) => <span className="font-numeric">{value}</span>
const windows = (facts: PathFacts): number => facts.byMechanism.ipc + facts.byMechanism.shm
const place = (text: string | null) => (text === null ? <span className="text-text-2">nowhere</span> : <code>{text}</code>)

/** A path drawn small: a column per process (the GPU last), a row per stage, and the arrows; the hops between processes drawn heavier. */
interface Mini {
  readonly width: number
  readonly height: number
  readonly columns: readonly { readonly key: string; readonly name: string; readonly kind: ReturnType<typeof floorKindOf>; readonly x: number }[]
  readonly nodes: readonly { readonly x: number; readonly y: number; readonly crosses: boolean }[]
}

const MINI = { width: 184, row: 11, top: 6, pad: 6 }

function miniOf(sc: Scenario): Mini {
  const path = referenceOf(sc)
  const entry = entryOf(sc.engine)
  const keyOf = (place: Place) => (place.device === 'gpu' ? 'gpu' : place.process)
  const order: string[] = []
  const places = new Map<string, Place>()
  for (const place of [entry, ...path.flatMap((stage) => [stage.from, stage.to])]) {
    const key = keyOf(place)
    if (!order.includes(key)) order.push(key)
    if (!places.has(key)) places.set(key, place)
  }
  const keys = [...order.filter((key) => key !== 'gpu'), ...order.filter((key) => key === 'gpu')]
  const step = (MINI.width - 2 * MINI.pad) / Math.max(keys.length, 1)
  const xOf = (place: Place) => Math.round(MINI.pad + step * (keys.indexOf(keyOf(place)) + 0.5))
  const columns = keys.map((key) => {
    const place = places.get(key) as Place
    const kind = floorKindOf(place)
    return { key, name: FLOOR_NAMES[kind], kind, x: xOf(place) }
  })
  const nodes = [{ x: xOf(entry), y: MINI.top, crosses: false }, ...path.map((stage, at) => ({ x: xOf(stage.to), y: MINI.top + (at + 1) * MINI.row, crosses: placeKey(stage.from).split('|')[0] !== placeKey(stage.to).split('|')[0] }))]
  return { width: MINI.width, height: MINI.top + (path.length + 1) * MINI.row, columns, nodes }
}

function MiniLanes({ mini, label }: { mini: Mini; label: string }) {
  return (
    <svg className="es-floor-mini" width={mini.width} height={mini.height} viewBox={`0 0 ${mini.width} ${mini.height}`} role="img" aria-label={label}>
      {mini.columns.map((column) => (
        <line key={column.key} x1={column.x} y1={0} x2={column.x} y2={mini.height} className="es-lanes__life" />
      ))}
      {mini.nodes.slice(1).map((node, at) => {
        const prev = mini.nodes[at]
        const mid = Math.round((prev.y + node.y) / 2)
        return (
          <polyline
            key={at}
            points={`${prev.x},${prev.y} ${prev.x},${mid} ${node.x},${mid} ${node.x},${node.y}`}
            fill="none"
            stroke="var(--es-paper-ink)"
            strokeWidth={node.crosses ? 2.25 : 1}
          />
        )
      })}
      {mini.nodes.map((node, at) => (
        <circle key={at} cx={node.x} cy={node.y} r={at === 0 ? 3 : node.crosses ? 3 : 2} className={at === 0 ? 'es-lanes__start' : 'es-lanes__node'} />
      ))}
    </svg>
  )
}

/** A process's name in a sentence: "an API server", "a tokenizer process", "one process". An initialism keeps its capitals. */
const inSentence = (name: string): string => {
  const word = /^[A-Z][A-Z]/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1)
  return word.startsWith('one ') ? word : `${/^[aeiouAEIOU]/.test(word) ? 'an' : 'a'} ${word}`
}

interface FactRow {
  readonly id: string
  readonly term: string
  readonly mine: ReactNode
  readonly theirs: ReactNode
  readonly differs: boolean
}

/** The facts set side by side. A row whose two values differ is a difference, set in bold with the word "differs". */
function factRows(a: PathFacts, b: PathFacts): FactRow[] {
  const ranks = (facts: PathFacts) =>
    facts.ranksVia === null ? <span className="text-text-2">one rank</span> : <Spans text={`${facts.ranksVia.mechanism} · ${facts.ranksVia.label}`} />
  return [
    { id: 'boundaries', term: "Process boundaries on a sampled token's way out", mine: count(a.boundariesOut), theirs: count(b.boundariesOut), differs: a.boundariesOut !== b.boundariesOut },
    { id: 'processes', term: 'Processes the path visits', mine: count(a.processes), theirs: count(b.processes), differs: a.processes !== b.processes },
    { id: 'zmq', term: 'Hops over ZMQ', mine: count(a.zmqHops), theirs: count(b.zmqHops), differs: a.zmqHops !== b.zmqHops },
    { id: 'detok', term: 'Where detokenizing runs', mine: place(a.detokenizesAt), theirs: place(b.detokenizesAt), differs: a.detokenizesAt !== b.detokenizesAt },
    ...(a.ranksVia === null && b.ranksVia === null
      ? []
      : [{ id: 'ranks', term: 'How the ranks get the batch', mine: ranks(a), theirs: ranks(b), differs: a.ranksVia?.label !== b.ranksVia?.label }]),
    { id: 'ipc', term: 'IPC and shared-memory hops', mine: count(windows(a)), theirs: count(windows(b)), differs: windows(a) !== windows(b) },
    { id: 'queues', term: 'Queues on the path', mine: count(a.byMechanism.queue), theirs: count(b.byMechanism.queue), differs: a.byMechanism.queue !== b.byMechanism.queue },
    { id: 'stages', term: 'Stages in the path', mine: count(a.stages), theirs: count(b.stages), differs: a.stages !== b.stages },
  ]
}

/** One engine's path, small, with its processes named under it and those the other engine lacks marked. */
function OnePath({ scenario, facts, other, name }: { scenario: Scenario; facts: PathFacts; other: PathFacts; name: string }) {
  const mini = useMemo(() => miniOf(scenario), [scenario])
  return (
    <figure className="es-floor-pair__one" data-floor-path-of={scenario.engine}>
      <figcaption className="es-floor-pair__name">{name}</figcaption>
      <MiniLanes mini={mini} label={`${name}: its whole path, ${facts.stages} stages, time running down.`} />
      <ul className="es-floor-pair__procs" aria-label={`The processes of ${name}, left to right`}>
        {mini.columns.map((column) => {
          const only = !other.kinds.includes(column.kind)
          return (
            <li key={column.key} data-only={only || undefined}>
              {column.name}
              {only ? <span className="es-floor-pair__only"> · only here</span> : null}
            </li>
          )
        })}
      </ul>
    </figure>
  )
}

const FACT_COLUMNS = (a: string, b: string): readonly MirrorColumn[] => [
  { key: 'term', head: 'Fact' },
  { key: 'mine', head: a },
  { key: 'theirs', head: b },
]

/** Two engines' paths side by side, with their differences marked. */
function PathPair({ scenario }: { scenario: Scenario }) {
  const rival = rivalScenario(scenario)
  const mine = factsOf(referenceOf(scenario), entryOf(scenario.engine))
  const theirs = factsOf(referenceOf(rival), entryOf(rival.engine))
  const names = [ENGINE_NAMES[scenario.engine], ENGINE_NAMES[rival.engine]]
  const mineOnly = mine.kinds.filter((kind) => !theirs.kinds.includes(kind)).map((kind) => inSentence(FLOOR_NAMES[kind]))
  const theirsOnly = theirs.kinds.filter((kind) => !mine.kinds.includes(kind)).map((kind) => inSentence(FLOOR_NAMES[kind]))
  const rows: MirrorRow[] = factRows(mine, theirs).map((row) => ({
    id: row.id,
    cells: {
      term: (
        <span className={row.differs ? 'es-floor-pair__differs' : undefined} data-differs={row.differs || undefined}>
          {row.term}
          {row.differs ? <span className="es-floor-pair__word"> · differs</span> : null}
        </span>
      ),
      mine: row.differs ? <strong>{row.mine}</strong> : row.mine,
      theirs: row.differs ? <strong>{row.theirs}</strong> : row.theirs,
    },
  }))
  return (
    <section aria-label="Two engines' paths, side by side" className="es-floor-pair" data-floor-houses="">
      <h4 className="es-floor-pair__head">
        Two engines&apos; paths, side by side <Stamp word="derived" />
      </h4>
      <div className="es-floor-pair__row">
        <OnePath scenario={scenario} facts={mine} other={theirs} name={names[0]} />
        <OnePath scenario={rival} facts={theirs} other={mine} name={names[1]} />
      </div>
      {mineOnly.length > 0 || theirsOnly.length > 0 ? (
        <p data-floor-floors="">
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
      <div data-floor-facts="">
        <MirrorTable head="How the two paths differ" caption="Counted from the two pinned paths, so each is only as good as the stages are" columns={FACT_COLUMNS(names[0], names[1])} rows={rows} />
      </div>
    </section>
  )
}

export function Debrief({ run, outcome, next, onNext, onGraded = null, embedded = false }: DebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  const scenario = view.scenario
  const truth = factsOf(referenceOf(scenario), entryOf(scenario.engine)).boundariesOut
  const predicted = view.prediction
  const graded = run.mode === 'graded'
  const map = view.level === 'map'
  const verdict = verdictOf(grade, map)

  const newScenario = () => run.restart(drawInBand(floorSession, view.level, crypto.getRandomValues(new Uint32Array(1))[0]))

  // In a lesson: its way on leads the result. A guess the lesson asked in this level's slot is revealed by the lesson's own ticket beside the
  // run, which reads the answer once; the result does not draw a second one.
  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null
  const lessonReveal = lesson !== null && lesson.reveal !== null && lesson.reveal !== undefined

  const primary =
    onward !== null ? (
      <Button variant="ink" onClick={() => onward.select()}>
        {onward.label}
      </Button>
    ) : graded && onGraded !== null ? (
      <Button variant="ink" onClick={onGraded}>
        Another fresh scenario
      </Button>
    ) : next !== null ? (
      <Button variant="ink" onClick={onNext}>
        {`Next level: ${next.title}`}
      </Button>
    ) : embedded ? null : (
      <TextLink to="/map">Open the course</TextLink>
    )

  const mistake = view.mistake
  return (
    <Result
      className="es-floor-debrief"
      verdict={verdict}
      sentence={<Spans text={debrief.sentence} />}
      actions={
        <>
          {primary}
          <Button variant="quiet" onClick={() => (graded ? newScenario() : run.restart())}>
            Run again
          </Button>
          <Button variant="quiet" onClick={newScenario}>
            {map ? 'Another scenario' : 'New numbers'}
          </Button>
          {map && !graded && onGraded !== null ? (
            <Button variant="quiet" onClick={onGraded}>
              Start a graded run
            </Button>
          ) : null}
        </>
      }
    >
      <div className="es-floor-debrief__body" data-floor-debrief="">
        {map ? (
          <p data-floor-graded={graded ? (grade.ok ? 'passed' : 'missed') : 'practice'}>
            {graded ? (
              <>
                {grade.ok ? 'The whole path was right on its one run, and every stage matches a span of the trace, in order. ' : 'The level asks for the whole path, right on its one run. '}
                {FLOOR_COPY.map.passRule} It asks that of <span className="font-numeric">3</span> fresh scenarios, a bar that is an estimate, and each gets its own run.
              </>
            ) : (
              <>
                <strong>Practice.</strong> A pinned scenario with undo: it earns nothing. A graded run draws a fresh scenario and gives the path one run.
              </>
            )}
          </p>
        ) : null}
        {mistake === null ? null : (
          <section className="es-floor-debrief__wrong" aria-label="The first stage that did not hold" data-floor-first-wrong="">
            <p>
              <strong>The first stage that did not hold</strong> was stage <span className="font-numeric">{mistake.at + 1}</span>, laid as{' '}
              <strong>{handoffWords(mistake.laid.mechanism)}</strong>
              {mistake.expected === null ? '.' : <>, where {ENGINE_NAMES[view.pin.engine]} has {handoffWords(mistake.expected.mechanism)}.</>}
            </p>
            {mistake.expected === null ? null : <Source title={`What ${ENGINE_NAMES[view.pin.engine]} does there`} note={mistake.expected} />}
            <Source title="What was laid" note={mistake.laid} />
          </section>
        )}
        {lessonReveal ? (
          <p data-floor-lesson-guess="">The lesson&apos;s guess for this run is revealed beside it, in the lesson.</p>
        ) : (
          <div data-floor-prediction-result="">
            <NumberLine
              caption="Process boundaries on a sampled token's way to the client: your prediction and the path's count"
              min={0}
              max={MAX_PREDICTION}
              pins={[
                ...(predicted === null ? [] : [{ id: 'guess', kind: 'guess' as const, value: predicted, label: 'your prediction' }]),
                { id: 'answer', kind: 'result', value: truth, label: 'the path' },
              ]}
              stamp={<Stamp word="derived" />}
            />
            <p>{predicted === truth ? 'Your prediction was right.' : `The path has ${truth} process ${truth === 1 ? 'boundary' : 'boundaries'} there.`}</p>
          </div>
        )}
        <p className="es-floor-debrief__counts" data-floor-counts="">
          Stages that held before the first that did not: <span className="font-numeric">{run.score.survived}</span> of {count(view.stages)}. Runs:{' '}
          <span className="font-numeric">{view.runs}</span>.
        </p>
        <TapeCheck view={view} />
        <PathPair scenario={scenario} />
        <p className="es-floor-debrief__truth">{ONE_TRUE_THING}</p>
      </div>
    </Result>
  )
}
