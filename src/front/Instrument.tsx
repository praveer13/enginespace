import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { keymapOf, levelOf } from '@es/play'
import type { KeyBinding } from '@es/play'
import { LOOP_COPY, requestName } from '@es/play/loop/copy'
import { FIRST_SERVICE, FULL_SERVICE_KEYS, LOOP } from '@es/play/loop/entry'
import { DESK, PHONE } from '@es/play/loop/lanes'
import { busyGuess, LOOP_MET, LOOP_MOMENTS, loopPartsOf } from '@es/play/loop/parts'
import { loopGhost, loopLevel, loopSession, loopView } from '@es/play/loop/session'
import type { LoopAction, LoopLevelId, LoopView } from '@es/play/loop/types'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { GoalLine } from '@/design/components/GoalLine'
import { PartsList } from '@/design/components/PartsList'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { keepShown, readShown } from '@/games/kit/first-move'
import { focusIsLost } from '@/games/kit/focus'
import { LiveRegion } from '@/games/kit/LiveRegion'
import { useDeltas } from '@/games/kit/moments'
import { useGameInput } from '@/games/kit/useGameInput'
import { useRun } from '@/games/kit/useRun'
import { usePhone } from '@/games/kit/usePhone'
import { ViewSwitch, type GameView } from '@/games/kit/ViewSwitch'
import { changeLine } from '@/games/loop/announce'
import type { LoopStage3DProps } from '@/games/loop/Stage3D'
import { readoutItems } from '@/games/loop/strip'
import { LoopReadout } from '@/games/loop/Tape'
import type { Scene3DProps } from '@/games/loop/Scene3D'
import type { LoopRunCore } from '@/games/loop/types'
import { useLoopControls, type AutoToggleRef } from '@/games/loop/useLoopControls'
import { Lanes, type CalloutPart } from '@/games/loop/View2D'
import { COACH_PARTS, DOCK, FRAME } from './copy'
import { useFrontDevice } from './device'
import { useNight } from './night'
import { FIRST_PARTS, introOpens, type IntroStage } from './way'
import { isHandheld, readConnection, upgradeOf, useSettled } from './upgrade'

/*
 * The front page's instrument (REDESIGN §2.6, §3.1): the step loop's four demo levels in the instrument frame, on the right of the page at a
 * desk and under the heading on a phone. Top to bottom: the title strip ("Step loop", its role line, the demo's place, Diagram | 3D and
 * Parts), the goal line, the timing diagram (the waiting queue, the CPU row and a row per batch slot on the graticule, with the now line),
 * the readout strip, the dock (Step, Undo and Auto-step beside the coach strip), and the title block, with the state as a table under it.
 *
 * It is live from the first paint: the build renders it into the static HTML, both geometries of the diagram side by side for the
 * stylesheet to choose from (the server cannot know the screen), and the app renders the same instrument over it.
 *
 * The first visit's intro is laid on the live diagram, not in a modal: five ink callouts on the queue, the slot holders, the CPU row, a GPU
 * row and Step, which the coach strip lists by the same numerals, and the amber ring on R1, the first move. At a desk the strip lists all
 * five; on a phone it steps through them one at a time. The first move, Skip intro or Escape ends it, and the intro flag (`es:intro`)
 * keeps the parts it named, so it does not open again. A returning learner (the pointer says Continue) gets no intro. The page reads the
 * flag and the pointer only: it never opens the ledger, and a run here records nothing (D-038).
 *
 * On a desk of tier 1 or above the diagram's box becomes the 3D time track at its Lifted camera, after the largest paint: at once on a visit
 * that opens with no intro, and on a first visit at the second demo level, since the intro's callouts sit on the diagram's labels, which
 * the scene does not draw, and a box that turned 3D under the learner's first moves would take the chip they were reaching for. The
 * strips, the dock and the coach do not move: the box keeps its height. A phone in the hand stays in 2D, with 3D one tap away.
 */

/** The 3D view: the step loop's Stage and its time track, each a chunk of its own, loaded only when the box turns 3D. */
const LoopStage3D = lazy(() =>
  import('@/games/loop/Stage3D').then((module) => ({
    default: module.default as ComponentType<LoopStage3DProps>,
  })),
)
const TrackScene = lazy(() => import('@/games/loop/Scene3D'))
/** Demo level 3's guess field, with that level. */
const GuessForm = lazy(() => import('@/games/loop/GuessForm'))
/** The async scheduling switch: only the later levels have it. */
const LoopOverlap = lazy(() => import('@/games/loop/LoopOverlap'))
/**
 * A level's result: drawn only after the learner acts, so asked for on the first move, and kept once it has come, so a level's end draws
 * it in the same render as the outcome and focus can go to it at once.
 */
type Later = typeof import('@/games/loop/DemoResult')
let loaded: Later | null = null
const later = () => import('@/games/loop/DemoResult').then((module) => (loaded = module))

function FrontTrack(props: Scene3DProps) {
  return <TrackScene {...props} />
}

const STEP: LoopAction = { t: 'run', until: 'step' }
/** The view switch's words (REDESIGN §2.6). "3D" is the view's name, not a count, so it stays out of the copy that verify:numbers reads. */
const VIEW_WORDS = { flat: FRAME.diagram, depth: '3D' } as const
/** Said in the coach strip when a later demo level opens in 3D without the learner asking for it; out of the copy for the same reason. */
const WHY_3D = 'This level opens in 3D: the same diagram, tilted, with the reference run behind yours. Diagram turns it back.'
/** The front page's diagram: the brief's own geometry at a desk and on a phone (lanes.ts DESK and PHONE). */
const FRONT_GEOMETRY = { wide: DESK, narrow: PHONE } as const

/** `1` to `9` admit the waiting request at that place in the queue. */
const ADMIT_KEYS: readonly KeyBinding[] = Array.from({ length: 9 }, (_, i) => [
  {
    id: `admit-${i + 1}`,
    code: `Digit${i + 1}`,
    label: String(i + 1),
    description: 'Admit that waiting request',
  },
  {
    id: `admit-${i + 1}`,
    code: `Numpad${i + 1}`,
    label: String(i + 1),
    description: 'Admit that waiting request',
  },
]).flat()
/** The step loop's keys that the demo levels use: no camera, no stages, none of the full levels'. */
const KEYS: readonly KeyBinding[] = [...keymapOf(LOOP).filter((key) => key.id !== 'camera' && !key.id.startsWith('stage-') && !FULL_SERVICE_KEYS.includes(key.id)), ...ADMIT_KEYS]

/** The parts' callouts on the diagram, by part, while the intro shows: ink discs numbered as the coach strip lists them. */
function calloutsOf(at: number | null): Partial<Record<CalloutPart, ReactNode>> {
  const out: Partial<Record<CalloutPart, ReactNode>> = {}
  COACH_PARTS.forEach((part, index) => {
    if (part.id === 'step') return
    out[part.id] = <Disc n={index + 1} name={part.line} current={at === index} />
  })
  return out
}

function Disc({ n, name, current }: { n: number; name: string; current: boolean }) {
  return (
    <span className="es-front-disc" data-callout={n} data-current={current || undefined} aria-hidden="true" title={name.split(':')[0]}>
      <span className="es-callout__disc">{n}</span>
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The instrument                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface InstrumentProps {
  /** The pointer says Continue: no intro. */
  returning: boolean
  /** The way into the course at a level's result: the Start control's words and route, or the learner's Continue. */
  course: {
    readonly label: string
    readonly short: string
    readonly href: string
  } | null
  /** The learner moved in the demo: the page's own amber Continue steps back to an outline. */
  onTouched: () => void
}

interface At {
  readonly level: number
  readonly seed: Seed
  readonly count: number
  /** Focus goes to the instrument when this run mounts: the learner moved on from a result. */
  readonly refocus: boolean
}

export function Instrument({ returning, course, onTouched }: InstrumentProps) {
  const [at, setAt] = useState<At>({
    level: 0,
    seed: FIRST_SERVICE[0].practiceSeed,
    count: 0,
    refocus: false,
  })
  // The intro: on the server always (a first visit is what the static HTML shows), on the client from the pointer and the flag.
  const [intro, setIntro] = useState<IntroStage>(() => (typeof window === 'undefined' || introOpens(returning, readShown(LOOP.id)) ? 'parts' : 'off'))
  if (returning && intro !== 'off') setIntro('off')
  const endIntro = useCallback((next: IntroStage = 'off') => {
    setIntro(next)
    if (next === 'off') keepShown(LOOP.id, FIRST_PARTS)
  }, [])

  // The view: the diagram first, 3D on its own once the page has settled on a desk that draws it, and the learner's choice from then on.
  const { device, unavailable, reader } = useFrontDevice()
  const settled = useSettled()
  // A phone opens in 2D (REDESIGN §3.1), and the 3D view is withheld there until it has a layout a phone can read.
  const phone = usePhone()
  const can3d = device.known && device.tier >= 1 && !phone
  const [chosen, setChosen] = useState<GameView | null>(null)
  const [boxHeight, setBoxHeight] = useState<number | null>(null)
  const upgrade = can3d ? upgradeOf(device, readConnection(), isHandheld()) : 'never'
  // A first visit names the parts on the diagram's own labels, which the scene does not draw: its box turns 3D at the next level, a pause
  // the learner chose, and never under a move in hand. A visit that opens with no intro turns 3D once the page has settled.
  const [openedWithIntro] = useState(intro !== 'off')
  const auto3d = settled && intro === 'off' && (!openedWithIntro || at.level > 0) && (upgrade === 'load' || upgrade === 'offer')
  const view: GameView = can3d ? (chosen ?? (auto3d ? '3d' : '2d')) : '2d'

  const level = FIRST_SERVICE[at.level]
  const after = FIRST_SERVICE[at.level + 1] ?? null
  return (
    <>
      {reader}
      <DemoRun
        key={`${level.id}|${at.seed}|${at.count}`}
        levelAt={at.level}
        levelId={level.id as LoopLevelId}
        seed={at.seed}
        refocus={at.refocus}
        next={after === null ? null : { title: after.title }}
        onNext={() =>
          after === null
            ? undefined
            : setAt({
                level: at.level + 1,
                seed: after.practiceSeed,
                count: 0,
                refocus: true,
              })
        }
        onAgain={() => setAt({ ...at, count: at.count + 1, refocus: true })}
        intro={at.level === 0 ? intro : 'off'}
        onIntro={endIntro}
        view={view}
        onView={setChosen}
        auto={chosen === null}
        can3d={can3d}
        unavailable3d={unavailable}
        course={course}
        onTouched={onTouched}
        boxHeight={boxHeight}
        onBoxHeight={setBoxHeight}
      />
    </>
  )
}

interface DemoRunProps {
  levelAt: number
  levelId: LoopLevelId
  seed: Seed
  refocus: boolean
  next: { title: string } | null
  onNext: () => void
  onAgain: () => void
  intro: IntroStage
  onIntro: (next?: IntroStage) => void
  view: GameView
  onView: (view: GameView) => void
  /** The view is the page's choice, not the learner's: a level that opens in 3D says why. */
  auto: boolean
  can3d: boolean
  unavailable3d?: string
  course: InstrumentProps['course']
  onTouched: () => void
  /** The diagram's box's height as last drawn in 2D, kept above the runs so a level that opens in 3D keeps the box the last one had. */
  boxHeight: number | null
  onBoxHeight: (height: number) => void
}

/** True while React renders on the server: the static HTML. */
const onServer = () => typeof window === 'undefined'

function DemoRun({ levelAt, levelId, seed, refocus, next, onNext, onAgain, intro, onIntro, view: shown, onView, auto, can3d, unavailable3d, course, onTouched, boxHeight, onBoxHeight }: DemoRunProps) {
  const entry = levelOf(LOOP, levelId) ?? LOOP.levels[0]
  const copy = LOOP_COPY[levelId]
  const run = useRun({
    session: loopSession,
    game: LOOP.id,
    level: entry.id,
    seed,
    mode: 'practice',
  })
  const { view, outcome, dispatch, announce } = run
  // The reference run of this level and seed, played to its end once: the diagram draws it as outlines under the learner's own.
  const reference = useMemo(() => loopView(loopGhost(loopLevel(levelId, seed))), [levelId, seed])
  const titleId = useId()
  const coachId = useId()
  const mirrorId = useId()
  const [partsOpen, setPartsOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [partAt, setPartAt] = useState(0)
  const night = useNight()
  const [held, setHeld] = useState(loaded)
  const toggleAuto: AutoToggleRef = useRef(null)

  const core: LoopRunCore = {
    game: run.game,
    level: run.level,
    mode: run.mode,
    seed: run.seed,
    view,
    score: run.score,
    ask: run.ask,
    done: run.done,
    turns: run.turns,
    canUndo: run.canUndo,
    dispatch,
    undo: run.undo,
    announce,
    setAutoplay: run.setAutoplay,
    mirrorId,
    restart: () => onAgain(),
  }
  const controls = useLoopControls(core, toggleAuto)

  // What the coach strip says once the intro is over: the line for the latest change and, the first time a rule is felt in this level,
  // its name. Kept from one view to the next while rendering (React's way to adjust state to a prop).
  const [said, setSaid] = useState({
    view,
    line: '',
    moment: null as string | null,
    ids: [] as readonly string[],
  })
  if (said.view !== view) {
    const line = view.level === said.view.level ? changeLine(said.view, view) : ''
    const fresh = view.step > said.view.step ? LOOP_MOMENTS.find((moment) => !said.ids.includes(moment.id) && moment.line(said.view, view) !== null) : undefined
    setSaid({
      view,
      line,
      moment: fresh === undefined ? null : fresh.line(said.view, view),
      ids: fresh === undefined ? said.ids : [...said.ids, fresh.id],
    })
  }

  // The learner's first move ends the intro, and steps the page's own Continue back to an outline.
  const moved = run.turns > 0
  useEffect(() => {
    if (!moved) return
    void later().then(setHeld)
    onTouched()
    if (intro !== 'off') onIntro('off')
  }, [moved, intro, onIntro, onTouched])

  const mount3d = shown === '3d' && can3d && !onServer()
  const switchView = (next: GameView) => {
    onView(next)
    announce(next === '3d' ? '3D view.' : 'Diagram.')
  }

  const container = useGameInput({
    keys: KEYS,
    onCommand: (binding) => {
      switch (binding.id) {
        case 'view':
          if (!can3d) return false
          switchView(shown === '2d' ? '3d' : '2d')
          return true
        case 'step':
          if (!view.canFire) return false
          dispatch(STEP)
          return true
        case 'overlap':
          if (!view.overlapAvailable || view.done) return false
          dispatch({ t: 'lever', name: 'async', value: !view.overlap })
          return true
        case 'play-pause':
          toggleAuto.current?.()
          return toggleAuto.current !== null
        case 'step-back':
          if (!run.canUndo) return false
          run.undo()
          return true
        default: {
          const place = /^admit-(\d)$/.exec(binding.id)
          const req = place === null ? undefined : view.waiting[Number(place[1]) - 1]
          if (req === undefined || !view.canHang) return false
          dispatch({ t: 'admit', req })
          return true
        }
      }
    },
  })

  // A key's move can take its button with it: focus goes back to the instrument, so its keys still work.
  useEffect(() => {
    if (focusIsLost() && run.turns > 0) container.current?.focus({ preventScroll: true })
  }, [view, run.turns, container])
  // A new level or a fresh run, after the learner moved on: focus on the instrument, its top in view.
  useEffect(() => {
    if (!refocus) return
    container.current?.scrollIntoView({ block: 'nearest' })
    container.current?.focus({ preventScroll: true })
  }, [refocus, container])
  // The run's end puts the result in the dock and focus on it.
  const result = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (outcome === null || held === null) return
    result.current?.focus({ preventScroll: true })
    // On a short screen the result is under the diagram: bring its way on into view.
    result.current?.scrollIntoView({ block: 'nearest' })
  }, [outcome, held])

  // Escape ends the intro, unless it closes something of its own first.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || intro === 'off') return
    if (document.activeElement?.closest('details[open], [role="dialog"]')) return
    onIntro('off')
  }

  // The diagram's box keeps its height when it turns 3D, so nothing under it moves: the 2D figure's height, as last measured.
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (mount3d) return
    const element = box.current
    if (element === null) return
    const read = () => onBoxHeight(element.offsetHeight)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mount3d, onBoxHeight])

  // The intro as drawn: over in the same render as the learner's first move, so the ring and the discs leave with the move and the chips
  // keep their elements (focus follows to the next request, and stays there).
  const introShown = moved ? 'off' : intro
  const ring = introShown !== 'off' && view.waiting.length > 0 ? view.waiting[0] : null
  const callouts = introShown === 'off' ? undefined : calloutsOf(introShown === 'parts' ? partAt : null)
  const lanes = (fit?: 'wide' | 'narrow') => (
    <Lanes
      view={view}
      geometry={FRONT_GEOMETRY}
      fit={fit}
      ring={ring}
      callouts={callouts}
      // While a guess about the run ahead is open, nothing of the reference past now is drawn.
      reference={{ view: reference, ahead: busyGuess(view) === null }}
      onAdmit={(req) => (view.canHang && view.waiting.includes(req) ? dispatch({ t: 'admit', req }) : undefined)}
      focusAfter={() => container.current?.querySelector<HTMLButtonElement>('[data-front-step] button:not(:disabled)')?.focus()}
    />
  )
  const diagram = onServer() ? (
    <>
      <div className="es-front-fit" data-fit="wide">
        {lanes('wide')}
      </div>
      <div className="es-front-fit" data-fit="narrow">
        {lanes('narrow')}
      </div>
    </>
  ) : (
    lanes()
  )
  const flat = <Lanes view={view} geometry={FRONT_GEOMETRY} />

  const deltas = useDeltas(Object.fromEntries(readoutItems(view).map((item) => [item.id, item.value])))
  const firstName = view.waiting.length > 0 ? requestName(view.waiting[0]) : null

  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="es-front-service"
      data-game={LOOP.id}
      data-level={entry.id}
      data-view={mount3d ? '3d' : '2d'}
      data-intro={introShown === 'off' ? undefined : introShown}
      data-phase={outcome === null ? 'play' : 'result'}
      onKeyDown={onKeyDown}
    >
      <header className="es-front-strip">
        <h2 id={titleId} className="es-front-strip__title">
          {LOOP.title}
        </h2>
        <p className="es-front-strip__role">{FRAME.role}</p>
        <p className="es-front-strip__level" data-level-words="">
          {FRAME.demo} {levelAt + 1} {FRAME.of} {FIRST_SERVICE.length}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">: </span>
          {entry.title}
        </p>
        <div className="es-front-strip__tools">
          <ViewSwitch view={mount3d ? '3d' : '2d'} onViewChange={switchView} available3d={can3d} unavailableReason={unavailable3d} labels={VIEW_WORDS} />
          <Button size="sm" variant={partsOpen ? 'ink' : 'plate'} aria-expanded={partsOpen} aria-controls={coachId} onClick={() => setPartsOpen(!partsOpen)}>
            {FRAME.parts}
          </Button>
        </div>
      </header>

      <div className="es-front-goal" data-open={goalOpen || undefined}>
        <GoalLine className="es-front-goal__line" aim={copy.goal.aim} control={copy.goal.controls} target={copy.goal.beat} ends={copy.goal.ends} met={run.done ? LOOP_MET[levelId] : undefined} />
        <button type="button" className="es-front-goal__more" aria-expanded={goalOpen} onClick={() => setGoalOpen(!goalOpen)}>
          {goalOpen ? FRAME.less : FRAME.more}
          <span className="sr-only"> of the goal</span>
        </button>
      </div>

      <div ref={box} className="es-front-diagram" data-front-diagram="" style={mount3d && boxHeight !== null ? { height: `${boxHeight}px` } : undefined}>
        {mount3d ? (
          <Suspense fallback={flat}>
            <LoopStage3D run={core} preset="lifted" scene={FrontTrack} diagram={flat} />
          </Suspense>
        ) : (
          diagram
        )}
      </div>

      <div className="es-front-readout">
        <LoopReadout view={view} deltas={deltas} />
      </div>

      <div className="es-front-dock" data-dock="">
        <div className="es-front-dock__main" data-dock-main="">
          {outcome === null ? (
            <DockControls controls={controls} view={view} intro={introShown} waitingButtons={mount3d} />
          ) : (
            <div ref={result} tabIndex={-1} className="es-front-result" data-result="" aria-labelledby={`${coachId}-verdict`}>
              {held === null ? null : (
                <held.Result verdictId={`${coachId}-verdict`} ok={outcome.grade.ok} sentence={outcome.debrief.sentence} next={next} onNext={onNext} onAgain={onAgain} course={course} />
              )}
            </div>
          )}
        </div>
        <div id={coachId} className="es-front-coach" data-coach={partsOpen ? 'parts' : intro === 'off' ? 'play' : intro}>
          {partsOpen ? (
            <PartsList
              parts={loopPartsOf(levelId).map((part) => ({
                id: part.id,
                name: part.name,
                sentence:
                  part.engine === undefined ? (
                    part.sentence
                  ) : (
                    <>
                      {part.sentence} In vLLM: <code>{part.engine}</code>.
                    </>
                  ),
              }))}
              label={`Parts of the ${LOOP.title}`}
              className="es-front-coach__parts"
            />
          ) : introShown !== 'off' ? (
            <Coach intro={introShown} partAt={partAt} firstName={firstName} onNextPart={() => (partAt + 1 < COACH_PARTS.length ? setPartAt(partAt + 1) : onIntro('move'))} onSkip={() => onIntro('off')} />
          ) : (
            <Told prompt={run.turns === 0 ? (mount3d && auto && levelAt > 0 ? `${WHY_3D} ${copy.prompt}` : copy.prompt) : null} line={said.line} moment={said.moment} />
          )}
        </div>
      </div>

      <div className="es-front-foot">
        <div className="es-front-titleblock">
          <span>{FRAME.model}</span>
          <span aria-hidden="true">·</span>
          <span>{FRAME.clock}</span>
          <span aria-hidden="true">·</span>
          <details className="es-front-titleblock__card">
            <summary>{FRAME.leavesOut}</summary>
            <div className="es-front-titleblock__sheet">{night === null ? <p role="status">{FRAME.loadingCard}</p> : <night.WorldCard />}</div>
          </details>
        </div>
        <details className="es-front-table" data-state-table="">
          <summary>{FRAME.table}</summary>
          <div className="es-front-table__body">{night === null ? <p role="status">{FRAME.loadingTable}</p> : <night.Mirror run={core} />}</div>
        </details>
      </div>
      <noscript>
        <p className="es-front-noscript">{FRAME.noScript}</p>
      </noscript>
      <LiveRegion announcement={run.announcement} outcome={outcome ? 'The level is over. The result is in the dock.' : ''} />
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The dock                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

function DockControls({ controls, view, intro, waitingButtons }: { controls: ReturnType<typeof useLoopControls>; view: LoopView; intro: IntroStage; waitingButtons: boolean }) {
  const guess = busyGuess(view)
  return (
    <div className="es-front-controls" data-loop-controls="">
      {guess === null ? null : (
        <section className="es-front-guess" aria-label="A guess first" data-loop-guess="">
          <p className="es-front-guess__q">{guess.question}</p>
          <Suspense fallback={null}>
            <GuessForm window={guess.window} reveal={guess.reveal} />
          </Suspense>
          <p className="es-front-guess__note">{DOCK.guessNote}</p>
        </section>
      )}
      {waitingButtons && view.waiting.length > 0 ? (
        <ul className="es-front-controls__waiting" aria-label={DOCK.waiting}>
          {view.waiting.slice(0, 6).map((req) => (
            <li key={req}>
              <Button size="sm" variant="plate" disabled={!view.canHang} aria-label={`Admit request ${requestName(req)} into a batch slot`} onClick={() => controls.run.dispatch({ t: 'admit', req })}>
                {requestName(req)}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="es-front-controls__row">
        <span className="es-front-controls__step" data-front-step="" data-loop-step="">
          {intro !== 'off' ? (
            <span className="es-front-disc es-front-disc--step" data-callout={5} aria-hidden="true">
              <span className="es-callout__disc">5</span>
            </span>
          ) : null}
          {view.canFire ? (
            <PrimaryButton standalone onClick={controls.ring}>
              {DOCK.step}
            </PrimaryButton>
          ) : (
            <Button variant="plate" size="lg" disabled>
              {view.done ? DOCK.stepOver : DOCK.stepWaits}
            </Button>
          )}
        </span>
        <Button variant="quiet" disabled={!controls.run.canUndo} aria-keyshortcuts="," onClick={controls.run.undo}>
          {DOCK.undo}
        </Button>
        <Button variant="quiet" aria-pressed={controls.auto} aria-keyshortcuts="Space" disabled={!view.canFire && !controls.auto} onClick={controls.toggleAuto}>
          {DOCK.auto}
        </Button>
      </div>
      {view.overlapAvailable ? (
        <div className="es-front-controls__async" data-loop-async="">
          <Suspense fallback={null}>
            <LoopOverlap controls={controls} />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}

/** The coach strip during the intro: the parts by number (all five at a desk, one at a time on a phone), then the first move. */
function Coach({ intro, partAt, firstName, onNextPart, onSkip }: { intro: IntroStage; partAt: number; firstName: string | null; onNextPart: () => void; onSkip: () => void }) {
  const at = Math.min(partAt, COACH_PARTS.length - 1)
  return (
    <div className="es-front-coach__intro">
      <p className="es-front-coach__head">{DOCK.looking}</p>
      <ol className="es-front-coach__list" data-coach-list="">
        {COACH_PARTS.map((part, index) => (
          <li key={part.id} data-part={part.id}>
            <span className="es-callout__disc es-front-coach__n" aria-hidden="true">
              {index + 1}
            </span>
            {part.line}
          </li>
        ))}
      </ol>
      <div className="es-front-coach__foot">
        {firstName === null ? null : (
          <p className="es-front-coach__move" data-coach-move="">
            <strong>
              {DOCK.put} {firstName} {DOCK.inSlot}
            </strong>
          </p>
        )}
        <Button size="sm" variant="quiet" className="es-front-coach__skip" onClick={onSkip}>
          {DOCK.skip}
        </Button>
      </div>
      {/* On a phone: one part at a time, then the first move. */}
      <div className="es-front-coach__line" data-coach-line="">
        {intro === 'parts' ? (
          <>
            <p aria-live="polite">
              <span className="es-front-coach__count">
                {at + 1} {FRAME.of} {COACH_PARTS.length}
              </span>
              <span aria-hidden="true"> · </span>
              {COACH_PARTS[at].line}
            </p>
            <span className="es-front-coach__buttons">
              <Button size="sm" variant="plate" onClick={onNextPart}>
                {DOCK.next}
              </Button>
              <Button size="sm" variant="quiet" onClick={onSkip}>
                {DOCK.skip}
              </Button>
            </span>
          </>
        ) : firstName === null ? null : (
          <p>
            <strong>
              {DOCK.tap} {firstName} {DOCK.toSlot}
            </strong>
          </p>
        )}
      </div>
    </div>
  )
}

/** The coach strip in play: the level's opening line before the first move, then what the last move did and any rule it named. */
function Told({ prompt, line, moment }: { prompt: string | null; line: string; moment: string | null }) {
  return (
    <div className="es-front-coach__told" data-coach-told="">
      {prompt !== null ? <p className="es-front-coach__prompt">{prompt}</p> : null}
      {moment !== null ? (
        <p className="es-front-coach__moment" data-moment="">
          {moment}
        </p>
      ) : null}
      {line !== '' ? <p className="es-front-coach__said">{line}</p> : null}
    </div>
  )
}
