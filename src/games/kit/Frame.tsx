import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router'
import { drawInBand, keymapOf } from '@es/play'
import type { GameAction, GameFace, GameMode, KeyBinding, RunResult, Session } from '@es/play'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { GoalLine } from '@/design/components/GoalLine'
import { PartsList } from '@/design/components/PartsList'
import { Popover } from '@/design/components/Popover'
import { TitleBlock, type TitleBlockProps } from '@/design/components/TitleBlock'
import { shellLimits } from '@/settings/rules'
import { useSettings } from '@/settings/useSettings'
import { askShown, introAct, introPlan, MAX_CALLOUTS, introAfter, introOpens, introParts, introRing, keepShown, partsInOrder, readShown } from './first-move'
import type { GameKit, IntroState, IntroStep, KitPart } from './first-move'
import { focusIsLost } from './focus'
import type { IntroCoachProps } from './Intro'
import type { KeysDialogProps } from './KeysDialog'
import { LiveRegion } from './LiveRegion'
import { momentAt, type Named } from './moments'
import { nextTouch, publishRun, retireRun, useRunPlace, type LiveRun } from './RunContext'
import { useGameInput } from './useGameInput'
import { useRun, type RunCore, type RunOutcome } from './useRun'
import { usePhone } from './usePhone'
import { ViewSwitch, type GameView } from './ViewSwitch'
import './frame.css'

/*
 * The instrument frame (REDESIGN §2.6): every game sits in the same frame, top to bottom.
 *
 *   1. The title strip: the game's title and its role line ("You are the KV allocator."), the level menu as one control, the view switch
 *      (Diagram, 3D), Parts, How to play and Keyboard.
 *   2. The goal line, always in view: the aim, what the learner controls, the number to beat or the pass rule, and when the level ends.
 *   3. The diagram, with its legend directly under it.
 *   4. The dock: beside the diagram on a wide screen, pinned to the foot of a phone that is at least 700 px tall. It holds the guess slot
 *      and the current decision, the readout strip, and at the end of a run the result.
 *   5. The foot strip (Undo, Restart level, New numbers, the mode in words) and the title block: what the drawing is a model of, its
 *      clock, and "What this model leaves out".
 *   6. State as a table: a disclosure under the diagram that holds the DOM mirror, in the DOM whether it is open or not (D-018).
 *
 * The frame owns the run, through `useRun`, as the shell it replaced did: it
 * starts the session on a level and a seed, applies every action through the pure reducer and keeps the action log, so a replay of the
 * log is the grade. The game gives it its parts as slots that receive the run and draw `view(state)`.
 *
 * Keys: `V` swaps the views, `?` opens the Keyboard list, `,` undoes in practice, and the rest go to the game's `onCommand`.
 */

/** The keyboard list's code (Radix's dialog) loads the first time the learner reaches for it, as in the old shell (D-059). */
const KeysDialog = lazy(() => import('./KeysDialog').then((module) => ({ default: module.KeysDialog as ComponentType<KeysDialogProps> })))

/** The first run is a chunk of its own, loaded when it shows (REDESIGN §2.6): the game's route carries none of it. */
const IntroCoach = lazy(() =>
  import('./Intro').then((module) => ({
    default: module.IntroCoach as ComponentType<IntroCoachProps>,
  })),
)
const IntroCallouts = lazy(() => import('./Intro').then((module) => ({ default: module.IntroCallouts })))
const IntroLedger = lazy(() => import('./Intro').then((module) => ({ default: module.IntroLedger })))

/** What every slot receives: the run, and the id of the mirror's table, which the diagram's description points at. */
export type FrameRun<Action extends GameAction, View, Score, Ask> = RunCore<Action, View, Score, Ask> & {
  readonly mirrorId: string
  /** A fresh run of the same level: on `seed` when one is given ("New numbers"), else on the same seed. */
  restart(seed?: Seed): void
  /** Whether the page has a ledger: a game's page and a lesson do, the front page does not (D-038). */
  readonly ledger: boolean
  /** The first run, as the game's own controls follow it: whether the first ask may show yet, and the control the amber ring is on. */
  readonly intro: { readonly askShown: boolean; readonly ring: Action | null }
  /** The learner skipped the session's optional first ask, which dispatches nothing (the frame keeps it, so the intro hears it). */
  readonly guessSkipped: boolean
  skipGuess(): void
}

export type { RunOutcome }

/** A game's compact view, as the dock draws it for any game. */
type LiveRunView = NonNullable<LiveRun['DockView']>

/** The goal line's four parts (REDESIGN §2.6, P4), and the words for the end once it is met. */
export interface FrameGoal {
  readonly aim: ReactNode
  readonly control: ReactNode
  readonly target: ReactNode
  readonly ends: ReactNode
  readonly met?: ReactNode
}

export interface FrameProps<Level, State, Action extends GameAction, View, Score, Ask> {
  game: GameFace
  /** Who the learner is in the game: "You are the KV allocator." (the roster's role line). */
  role: string
  /** The game's rules. Keep it one object (a module's export): the run memoizes the view and the result on it. */
  session: Session<Level, State, Action, View, Score, Ask>
  level: string
  levelTitle: string
  seed: Seed
  mode: GameMode
  /** The content revision, which the run record carries (A§4.2). */
  rev?: string
  /** Inside a lesson: no breadcrumb and no level menu, the title one heading level down, and the level named in words instead. */
  embedded?: boolean
  shortcuts?: boolean
  /** Whether the tier and the browser allow 3D. The learner's setting ("3D off") is read here too. */
  allow3d?: boolean
  unavailable3d?: string
  /** Whether the 3D view is offered on a phone. Where its scene has no legible layout at a phone's width, the switch is withheld there. */
  phone3d?: boolean
  view?: GameView
  onViewChange?: (view: GameView) => void
  onFinish?: (result: RunResult, mode: GameMode) => void
  /** A key the frame does not take itself. Return true when the command was handled. */
  onCommand?: (command: string, run: FrameRun<Action, View, Score, Ask>) => boolean | void
  /** The level menu: one control (LevelMenu). Left out inside a lesson, where the block names the level. A function reads the run (a stage in the face). */
  menu?: ReactNode | ((run: FrameRun<Action, View, Score, Ask>) => ReactNode)
  /** The way to switch between practice and a graded run, for a level that can be graded; it stands in the foot strip. */
  modeSwitch?: ReactNode
  goal: (run: FrameRun<Action, View, Score, Ask>) => FrameGoal
  diagram: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
  /** Whether this level offers the 3D view at all: false where depth carries nothing, and the switch is then withheld. */
  level3d?: boolean
  /** The 3D view: a Stage, which paints the diagram first and keeps it as its fallback. */
  scene3d?: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
  legend: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
  /** The guess slot and the current decision. */
  dock: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
  /** The readout strip: three to five numbers, with one stamp. */
  readout: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
  /** The result, in the dock, once the run is over: the debrief. */
  result: (run: FrameRun<Action, View, Score, Ask>, outcome: RunOutcome<View>) => ReactNode
  /** State as a table: the DOM mirror. */
  mirror: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
  /** The parts the diagram draws on this level, with where each is drawn. */
  parts: readonly KitPart[]
  /** What the game gives the frame for its first run and its feedback (REDESIGN §2.6). Without it the frame has no intro and no moments. */
  kit?: (seed: Seed) => GameKit<Action, View, never>
  /** Whether the page has a ledger to read: false on the front page, which reads only the intro flag (D-038). */
  ledger?: boolean
  /** How to play the level, in a few lines. */
  howTo: ReactNode
  titleBlock: TitleBlockProps
}

/** What the frame says in the outcome's status region when a run ends. */
export const RESULT_LINE = 'The run is over. The result is in the dock.'

/** The frame. A restart remounts the run inside it, so nothing of the old run is left to carry over. */
export function Frame<L, S, A extends GameAction, V, C, K>(props: FrameProps<L, S, A, V, C, K>) {
  const base = `${props.level}|${props.seed}`
  const [restarts, setRestarts] = useState<{
    base: string
    count: number
    seed: Seed | null
  }>({ base, count: 0, seed: null })
  const current = restarts.base === base ? restarts : { base, count: 0, seed: null }
  const seed = current.seed ?? props.seed
  const restart = (next?: Seed) => setRestarts({ base, count: current.count + 1, seed: next ?? seed })
  // A named moment is said once per level: the ids said stay with the level across its restarts and new numbers.
  const [said] = useState(() => new Map<string, Set<string>>())
  const seen = said.get(props.level) ?? new Set<string>()
  said.set(props.level, seen)
  return <FrameRunView key={`${base}|${current.count}|${seed}`} {...props} seed={seed} restarted={current.count > 0} onRestart={restart} said={seen} />
}

type RunViewProps<L, S, A extends GameAction, V, C, K> = FrameProps<L, S, A, V, C, K> & { restarted: boolean; onRestart: (seed?: Seed) => void; said: Set<string> }

function FrameRunView<L, S, A extends GameAction, V, C, K>(props: RunViewProps<L, S, A, V, C, K>) {
  const { game, session, level, levelTitle, seed, mode, rev, restarted, onRestart, embedded = false } = props
  const headingId = useId()
  const noteId = useId()
  const mirrorId = useId()
  const run = useRun({ session, game: game.id, level, seed, mode, rev, onFinish: props.onFinish })
  const { outcome } = run
  const [keysOpen, setKeysOpen] = useState(false)
  const [keysWanted, setKeysWanted] = useState(false)
  const wantKeys = () => setKeysWanted(true)
  const openKeys = () => {
    setKeysWanted(true)
    setKeysOpen(true)
  }
  const [chosenView, setChosenView] = useState<GameView>('2d')
  const kitFor = props.kit
  const kit = useMemo(() => kitFor?.(seed), [kitFor, seed])
  const ledger = props.ledger ?? false

  // The guess the session lets the learner skip: skipping dispatches nothing, so the frame keeps it, and the intro hears it here.
  const [skipped, setSkipped] = useState(false)
  // The parts the intro has shown for this game (`es:intro`), read once on the client; a server render has none and opens no intro.
  const [shown, setShown] = useState<readonly string[] | null>(() => (typeof window === 'undefined' ? null : readShown(game.id)))
  const look = kit?.look?.(run.view) ?? null
  const askOpen = (kit?.askOpen?.(run.view) ?? false) && !skipped
  const plan = (replay: boolean, met: readonly string[]): IntroState | null =>
    kit === undefined ? null : introPlan({ firstAsk: kit.firstAsk, canLook: look !== null, parts: props.parts, shown: met, replay, ledger, turns: run.turns })
  const [intro, setIntro] = useState<IntroState | null>(() => (shown !== null && kit !== undefined && introOpens(props.parts, shown) ? plan(false, shown) : null))
  const step: IntroStep | null = intro === null || intro.checking ? (intro === null ? null : 'parts') : intro.steps[intro.at]
  // The dock holds its controls back while the strip's chunk (which holds the ledger read too) comes, and not for ever: a chunk that does
  // not come, or a ledger that does not answer, must not leave a phone's dock empty, so after a moment the controls show as they would without the strip.
  const [stripLate, setStripLate] = useState(false)
  const stripAwaited = intro !== null
  useEffect(() => {
    if (!stripAwaited) return
    const timer = window.setTimeout(() => setStripLate(true), 1500)
    return () => window.clearTimeout(timer)
  }, [stripAwaited])
  const endIntro = () => {
    if (intro === null) return
    if (!intro.checking)
      keepShown(
        game.id,
        intro.parts.map((part) => part.id),
      )
    setShown(readShown(game.id))
    setIntro(null)
  }
  /**
   * A dispatched action tells the intro what the learner did: the ask's own answer moves it on, and any real move ends it, also one made
   * while the ledger is still read and the strip has not come up (it would come up over a run already under way, and on a phone take the
   * dock from under the learner's hand).
   */
  const tellIntro = (signal: { moved: boolean; askOpen: boolean }) => {
    if (intro?.checking && signal.moved) endIntro()
    if (intro === null || intro.checking) return
    const after = introAfter(intro.steps, intro.at, signal)
    if (after === null) endIntro()
    else if (after !== intro.at) setIntro({ ...intro, at: after })
  }
  const dispatch = (action: A) => {
    run.dispatch(action)
    const asked = kit?.isAsk?.(action) ?? false
    tellIntro({ moved: !asked, askOpen: !asked && askOpen })
  }
  const [howOpen, setHowOpen] = useState(false)

  // Named moments: after each action, the first rule of the game's table that occurred and has not been said in this level. The view is
  // compared when it changes, during the render (React's way to adjust state to a prop), and the ids said go up to the level's record.
  const [said, setSaid] = useState(() => ({ view: run.view, turns: run.turns, moment: null as Named | null, ids: new Set(props.said) as ReadonlySet<string> }))
  if (said.view !== run.view) {
    const named = kit !== undefined && run.turns > said.turns ? momentAt(kit.moments, said.ids, said.view, run.view, run.turns) : null
    setSaid({ view: run.view, turns: run.turns, moment: named, ids: named === null ? said.ids : new Set([...said.ids, ...named.ids]) })
  }
  const moment = said.moment
  const levelSaid = props.said
  useEffect(() => {
    for (const id of said.ids) levelSaid.add(id)
  }, [said.ids, levelSaid])

  // The learner's settings reach the game through the frame: 3D off turns the 3D view off, and the keys setting turns the keys off.
  const limits = shellLimits(useSettings(), props)
  const phone = usePhone()
  // The 3D view is withheld, switch and all, on a level where depth carries nothing (a scene of one row is the 2D chart in perspective) and
  // on a phone where its scene has no legible layout.
  const withheld = (props.phone3d === false && phone) || props.level3d === false
  const can3d = game.has3d && props.scene3d !== undefined && limits.allow3d && !withheld
  const view: GameView = can3d ? (props.view ?? chosenView) : '2d'

  const swapAsked = useRef(false)
  const switchView = (next: GameView) => {
    swapAsked.current = true
    props.onViewChange?.(next)
    setChosenView(next)
    run.announce(next === '3d' ? '3D view.' : 'Diagram.')
  }

  const api: FrameRun<A, V, C, K> = {
    game: run.game,
    level: run.level,
    mode: run.mode,
    seed: run.seed,
    view: run.view,
    score: run.score,
    ask: run.ask,
    done: run.done,
    turns: run.turns,
    canUndo: run.canUndo,
    dispatch,
    undo: run.undo,
    announce: run.announce,
    setAutoplay: run.setAutoplay,
    mirrorId,
    restart: onRestart,
    ledger,
    intro: {
      askShown: askShown(step),
      ring: kit === undefined ? null : introRing(step, kit),
    },
    guessSkipped: skipped,
    skipGuess: () => {
      setSkipped(true)
      run.announce('Guess skipped.')
      tellIntro({ moved: false, askOpen: false })
    },
  }

  // Inside a lesson, the run is published for the lesson's dock (RunContext.tsx): a second view of the same run, whose actions are the
  // frame's own. A run that starts or moves is touched, and the dock follows the run touched last.
  const place = useRunPlace()
  const touch = useRef({ turns: -1, at: 0 })
  useEffect(() => {
    if (place === null) return
    if (touch.current.turns !== run.turns) touch.current = { turns: run.turns, at: nextTouch() }
    publishRun({
      place,
      game: game.id,
      gameTitle: game.title,
      levelTitle,
      mode,
      view: run.view,
      done: run.done,
      turns: run.turns,
      canUndo: run.canUndo,
      askOpen,
      step: mode === 'practice' && !run.done ? (kit?.step?.(run.view) ?? null) : null,
      stepWords: kit?.stepWords ?? '',
      dispatch: (action) => dispatch(action as A),
      undo: run.undo,
      restart: () => onRestart(),
      DockView: (kit?.DockView as LiveRunView | undefined) ?? null,
      touched: touch.current.at,
    })
  })
  useEffect(() => () => (place === null ? undefined : retireRun(place.key)), [place])

  /** New numbers: a fresh seed that the level's band accepts, from the browser's entropy (unseen, not secret). */
  const newNumbers = () => onRestart(drawInBand(session, level, crypto.getRandomValues(new Uint32Array(1))[0]))

  // Every key the game answers to. The Keyboard list leaves out the view and camera keys where the 3D view is not offered (a level of
  // one draft position, a phone, a game with no scene), since neither does anything there.
  const keymap = useMemo(() => keymapOf(game), [game])
  const container = useGameInput({
    keys: keymap,
    enabled: limits.keys,
    onCommand: (binding: KeyBinding) => {
      if (binding.id === 'view') {
        if (!can3d) return false
        switchView(view === '2d' ? '3d' : '2d')
        return true
      }
      if (binding.id === 'help') {
        openKeys()
        return true
      }
      if (props.onCommand?.(binding.id, api) === true) return true
      if (binding.id === 'step-back' && run.canUndo) {
        run.undo()
        return true
      }
      return false
    },
  })

  // The intro closing takes its strip, and the control in it that had focus: focus goes on to the dock's first control.
  const hadIntro = useRef(intro !== null)
  useEffect(() => {
    const was = hadIntro.current
    hadIntro.current = intro !== null
    if (!was || intro !== null || !focusIsLost()) return
    const first = container.current?.querySelector<HTMLElement>('[data-dock-main] :is(button, input):not(:disabled)')
    ;(first ?? container.current)?.focus({ preventScroll: true })
  })
  // A swap of views can leave focus on a node that is gone, and a restart replaces the button that was pressed: focus goes back to the game.
  const shownView = useRef(view)
  useEffect(() => {
    const swapped = shownView.current !== view
    shownView.current = view
    if (swapped && swapAsked.current && focusIsLost()) container.current?.focus({ preventScroll: true })
    if (swapped) swapAsked.current = false
  }, [view, container])
  useEffect(() => {
    if (restarted) container.current?.focus({ preventScroll: true })
  }, [restarted, container])

  // The run's end puts the result in the dock, and focus on its heading, so a keyboard and a screen reader land on the verdict. An undo
  // that reopens the run takes the result away again.
  const resultRef = useRef<HTMLDivElement>(null)
  const ended = useRef(outcome !== null)
  useEffect(() => {
    const now = outcome !== null
    if (ended.current === now) return
    ended.current = now
    if (!now) return
    const target = resultRef.current?.querySelector<HTMLElement>('[data-result-heading]') ?? resultRef.current
    // The dock's own scroll from the run is not carried over: the verdict is the head of the result, and it is in view where focus lands.
    const main = resultRef.current?.closest<HTMLElement>('[data-dock-main]')
    if (main) main.scrollTop = 0
    target?.focus({ preventScroll: true })
    // On the game's page at a desk the drawing and the dock stand side by side: the row's top is brought back into view if the run left it
    // above the screen, so the drawing, the verdict and its ways on are read together (P5). Elsewhere the page moves only as far as the ways
    // on under the verdict, clear of the readout at the screen's foot (debrief.css), and the drawing over a phone's dock stays in view.
    const body = resultRef.current?.closest<HTMLElement>('[data-frame-body]')
    const top = body?.getBoundingClientRect().top ?? 0
    if (!embedded && body && window.matchMedia('(min-width: 64rem)').matches) {
      if (top < 0) window.scrollBy({ top: top - 8 })
      return
    }
    // A result whose chunk is still loading has no ways on yet: they are looked for again until they are drawn, for about two seconds. Its
    // verdict takes focus from the result when it loads, so focus anywhere in the result means the learner is still there.
    const bring = (tries: number) => {
      const result = resultRef.current
      // The learner has moved on (focus left the result): the page is not moved under them.
      if (!result?.contains(document.activeElement)) return
      const ways = result.querySelector<HTMLElement>('.es-debrief__actions, .es-loopdebrief__ways')
      ;(ways ?? result).scrollIntoView({ block: 'nearest' })
      if (!ways && tries > 0) return void setTimeout(() => bring(tries - 1), 100)
      // The verdict stays on the screen over its ways on: a long moment over it is not allowed to push it off the top.
      const head = result.querySelector('[data-result-heading]')?.getBoundingClientRect().top ?? 0
      if (head < 0) window.scrollBy({ top: head - 8 })
      // The drawing stands over the result here: where its top, the verdict and the ways on fit on the screen together, the page shows
      // them together, so the path or the run laid and its result are read at once (P5). It only ever moves the page back up.
      const drawing = body?.querySelector<HTMLElement>('[data-frame-diagram]')
      if (!ways || !drawing) return
      const above = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      const foot = body?.querySelector('.es-frame__readout')?.getBoundingClientRect().height ?? 0
      const from = drawing.getBoundingClientRect().top
      if (from < above && ways.getBoundingClientRect().bottom - from <= window.innerHeight - above - foot) window.scrollBy({ top: from - above })
    }
    bring(20)
  }, [outcome, embedded])

  // A new phase of the dock (an intro step, the intro's end, the guess opening or closing) starts at its own top: the dock's scroll from
  // the phase before is not carried over, and where the dock has grown off the top of the screen (a lesson's intro at a desk lets it grow
  // with the page), its head is brought back into view, so the new phase's first words are read first.
  const dockRef = useRef<HTMLDivElement>(null)
  const dockPhase = `${intro === null ? '-' : step}|${askOpen}|${outcome === null}`
  const lastPhase = useRef(dockPhase)
  useLayoutEffect(() => {
    if (lastPhase.current === dockPhase) return
    lastPhase.current = dockPhase
    const dock = dockRef.current
    if (dock === null || outcome !== null) return
    const main = dock.querySelector<HTMLElement>('[data-dock-main]')
    if (main !== null) main.scrollTop = 0
    if (dock.getBoundingClientRect().top < 0) dock.scrollIntoView({ block: 'start' })
  }, [dockPhase, outcome])

  const Heading = embedded ? 'h3' : 'h2'
  const modeWord = mode === 'practice' ? 'practice' : 'graded'
  const goal = props.goal(api)
  const [goalOpen, setGoalOpen] = useState(false)
  // The Keyboard list's button: in the title strip on a wide screen, and inside How to play on a phone (REDESIGN §3.5).
  const keyboardButton = (place: 'strip' | 'howto') => (
    <span className="es-pop es-frame__keyboard" data-variant="button" data-place={place}>
      <button type="button" className="es-pop__trigger" aria-haspopup="dialog" aria-expanded={keysOpen} aria-keyshortcuts="Shift+/" onClick={openKeys} onPointerEnter={wantKeys} onFocus={wantKeys}>
        Keyboard
      </button>
    </span>
  )

  const viewNode: ReactNode =
    view === '3d' && props.scene3d ? (
      // The Stage hides its own canvas from assistive technology (A§6.9); the diagram it paints first stays readable around it.
      <div data-surface="3d" role="group" aria-label="3D view" aria-describedby={noteId}>
        {props.scene3d(api)}
      </div>
    ) : (
      <div data-surface="2d" className="es-frame__surface">
        {props.diagram(api)}
      </div>
    )

  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-game={game.id}
      data-level={level}
      data-seed={seed}
      data-mode={mode}
      data-view={view}
      data-phase={outcome === null ? 'play' : 'result'}
      data-placement={embedded ? 'embed' : 'page'}
      data-intro={step ?? undefined}
      data-intro-wait={stripAwaited && !stripLate ? '' : undefined}
      className="es-frame"
      onKeyDown={(event) => {
        // Escape ends the intro at any step, unless it is closing a sheet that is open (a popover or the Keyboard list).
        if (event.key !== 'Escape' || intro === null) return
        if (document.activeElement?.closest('.es-pop[data-open], [role="dialog"]')) return
        endIntro()
      }}
    >
      <header className="es-frame__strip">
        <div className="es-frame__name">
          {embedded ? null : (
            <nav aria-label="Breadcrumb" className="es-frame__crumb">
              <Link to="/play">Games</Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{game.title}</span>
            </nav>
          )}
          <Heading id={headingId} className="es-frame__title">
            {game.title}
          </Heading>
          <p className="es-frame__role">{props.role}</p>
        </div>
        <div className="es-frame__menu">
          {(typeof props.menu === 'function' ? props.menu(api) : props.menu) ?? (
            <p className="es-frame__level" data-level-words="">
              {levelTitle} · {modeWord}
            </p>
          )}
        </div>
        <div className="es-frame__tools">
          {game.has3d && !withheld ? (
            <ViewSwitch view={view} onViewChange={switchView} available3d={can3d} unavailableReason={limits.unavailable3d} labels={{ flat: 'Diagram', depth: '3D' }} />
          ) : null}
          <Popover trigger="Parts" title={`Parts of the ${game.title}`} className="es-frame__tool">
            <PartsList parts={partsInOrder(props.parts, shown)} label={`Parts of the ${game.title}`} />
          </Popover>
          <Popover trigger="How to play" title="How to play" width="wide" className="es-frame__tool" open={howOpen} onOpenChange={setHowOpen}>
            {kit === undefined ? null : (
              <p className="es-frame__replay">
                <Button
                  size="sm"
                  variant="plate"
                  data-intro-replay=""
                  onClick={() => {
                    setHowOpen(false)
                    setIntro(plan(true, shown ?? []))
                  }}
                >
                  Show the first run again
                </Button>
              </p>
            )}
            {props.howTo}
            <p className="es-frame__howto-keys">Every action has a key. {keyboardButton('howto')}</p>
          </Popover>
          {keyboardButton('strip')}
          {keysWanted ? (
            <Suspense fallback={null}>
              <KeysDialog keys={can3d ? keymap : keymap.filter((key) => key.id !== 'view' && key.id !== 'camera')} open={keysOpen} onOpenChange={setKeysOpen} />
            </Suspense>
          ) : null}
        </div>
      </header>

      <div className="es-frame__goal-box" data-open={goalOpen || undefined}>
        <GoalLine className="es-frame__goal" aim={goal.aim} control={goal.control} target={goal.target} ends={goal.ends} met={goal.met} />
        {/* On a phone the goal line shows two lines, and "more" opens the rest; the whole sentence is in the page either way. */}
        <button type="button" className="es-frame__goal-more" aria-expanded={goalOpen} onClick={() => setGoalOpen(!goalOpen)}>
          {goalOpen ? 'less' : 'more'}
          <span className="sr-only"> of the goal</span>
        </button>
      </div>

      <div className="es-frame__body" data-frame-body="">
        <div className="es-frame__diagram" data-frame-diagram="">
          <p id={noteId} className="sr-only">
            This diagram is a drawing. State as a table, under it, lists everything it shows.
          </p>
          {/* The diagram scrolls inside its box where it is taller than the room, so the box is a region the keyboard can reach. */}
          <div className="es-frame__view" role="region" aria-label="Diagram" aria-describedby={noteId} tabIndex={0}>
            {viewNode}
          </div>
          <div className="es-frame__legend">{props.legend(api)}</div>
        </div>
        <div ref={dockRef} className="es-frame__dock" data-dock="" role="region" aria-label="Dock">
          <div className="es-frame__dock-main" data-dock-main="">
            {outcome === null ? (
              <>
                {intro !== null && kit !== undefined ? (
                  <Suspense fallback={null}>
                    {intro.checking ? (
                      <IntroLedger
                        game={game.id}
                        levelParts={kit.levelParts ?? (() => [])}
                        onRead={(met) => {
                          const all = [...new Set([...(shown ?? []), ...met])]
                          setShown(all)
                          const parts = introParts(props.parts, all, false)
                          setIntro(parts.length === 0 ? null : { ...intro, parts, checking: false })
                        }}
                      />
                    ) : (
                      <IntroCoach
                        title={game.title}
                        step={intro.steps[intro.at]}
                        parts={intro.parts}
                        replay={intro.replay}
                        look={look}
                        ask={kit.askWords?.(run.view) ?? null}
                        askLead={kit.askLead}
                        skip={kit.firstAsk === 'optional' ? 'allowed' : 'This guess has to be made before the run, so it cannot be skipped.'}
                        moveWords={kit.firstMoveWords}
                        moveKind={kit.firstMoveKind}
                        embedded={embedded}
                        partAt={intro.partAt}
                        onPartAt={(partAt) => setIntro({ ...intro, partAt })}
                        onNext={() => {
                          const after = introAfter(intro.steps, intro.at, 'next')
                          if (after === null) endIntro()
                          else setIntro({ ...intro, at: after })
                        }}
                        onEnd={endIntro}
                        onAct={() => introAct(intro.steps[intro.at], kit, dispatch)}
                      />
                    )}
                  </Suspense>
                ) : null}
                {/* A named moment, said once, in the dock beside the drawing it names, so the drawing stays in view (REDESIGN §2.6). */}
                {moment === null ? null : <MomentNote moment={moment} />}
                {props.dock(api)}
              </>
            ) : (
              <>
                {/* A run that is one action (Request path's) ends on the move that made its rule felt, so the moment stands over its result and is not lost. */}
                {moment === null ? null : <MomentNote moment={moment} />}
                <div ref={resultRef} tabIndex={-1} className="es-frame__result" data-result="">
                  {props.result(api, outcome)}
                </div>
              </>
            )}
          </div>
          <div className="es-frame__readout" data-readout="">
            {props.readout(api)}
          </div>
        </div>
      </div>

      <div className="es-frame__foot">
        <div className="es-frame__foot-actions">
          {mode === 'practice' ? (
            <Button size="sm" variant="quiet" disabled={!run.canUndo} aria-keyshortcuts="," onClick={run.undo}>
              Undo
            </Button>
          ) : null}
          {/* A graded run never replays its own seed: a restart draws a fresh one, as starting it did (ASSESSMENT §4.1). */}
          <Button size="sm" variant="quiet" onClick={() => (mode === 'graded' ? newNumbers() : onRestart())}>
            Restart level
          </Button>
          <Button size="sm" variant="quiet" onClick={newNumbers}>
            New numbers
          </Button>
        </div>
        <div className="es-frame__mode">{props.modeSwitch}</div>
      </div>

      <TitleBlock className="es-frame__titleblock" {...props.titleBlock} />

      <details className="es-frame__table" data-state-table="">
        <summary className="es-frame__table-summary">State as a table</summary>
        <div className="es-frame__table-body">{props.mirror(api)}</div>
      </details>

      {intro !== null && !intro.checking && (step === 'parts' || step === 'look') ? (
        <Suspense fallback={null}>
          <IntroCallouts host={container} parts={intro.parts.slice(0, MAX_CALLOUTS)} partAt={intro.partAt} embedded={embedded} />
        </Suspense>
      ) : null}
      <p className="sr-only" role="status" data-live="moment">
        {moment?.line ?? ''}
      </p>

      <LiveRegion announcement={run.announcement} outcome={outcome ? RESULT_LINE : ''} />
    </section>
  )
}

/**
 * A named moment (REDESIGN §2.6): the rule the last action made felt, named once, at the head of the dock beside the drawing: on the coach
 * strip at a desk, and on the coach line of a phone's pinned dock. It never lies over the diagram, so the gap or the slabs it names stay in
 * view. It takes no press and goes with the next action; its words are said in the moment's status line.
 */
function MomentNote({ moment }: { moment: Named }) {
  return (
    <p className="es-frame__moment" aria-hidden="true" data-moment={moment.id}>
      {moment.line}
    </p>
  )
}
