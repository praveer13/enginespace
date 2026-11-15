import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router'
import { drawInBand, keymapOf } from '@es/play'
import type { GameAction, GameFace, GameMode, KeyBinding, RunResult, Session } from '@es/play'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { GoalLine } from '@/design/components/GoalLine'
import { PartsList, type PartRow } from '@/design/components/PartsList'
import { Popover } from '@/design/components/Popover'
import { TitleBlock, type TitleBlockProps } from '@/design/components/TitleBlock'
import { shellLimits } from '@/settings/rules'
import { useSettings } from '@/settings/useSettings'
import { focusIsLost } from './focus'
import type { KeysDialogProps } from './KeysDialog'
import { LiveRegion } from './LiveRegion'
import { useGameInput } from './useGameInput'
import { useRun, type RunCore, type RunOutcome } from './useRun'
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
 * The frame owns the run, through `useRun`, as the old shell does (GameShell.tsx, which stays for the games not yet in this frame): it
 * starts the session on a level and a seed, applies every action through the pure reducer and keeps the action log, so a replay of the
 * log is the grade. The game gives it its parts as slots that receive the run and draw `view(state)`.
 *
 * Keys: `V` swaps the views, `?` opens the Keyboard list, `,` undoes in practice, and the rest go to the game's `onCommand`.
 */

/** The keyboard list's code (Radix's dialog) loads the first time the learner reaches for it, as in the old shell (D-059). */
const KeysDialog = lazy(() => import('./KeysDialog').then((module) => ({ default: module.KeysDialog as ComponentType<KeysDialogProps> })))

/** What every slot receives: the run, and the id of the mirror's table, which the diagram's description points at. */
export type FrameRun<Action extends GameAction, View, Score, Ask> = RunCore<Action, View, Score, Ask> & {
  readonly mirrorId: string
  /** A fresh run of the same level: on `seed` when one is given ("New numbers"), else on the same seed. */
  restart(seed?: Seed): void
}

export type { RunOutcome }

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
  view?: GameView
  onViewChange?: (view: GameView) => void
  onFinish?: (result: RunResult, mode: GameMode) => void
  /** A key the frame does not take itself. Return true when the command was handled. */
  onCommand?: (command: string, run: FrameRun<Action, View, Score, Ask>) => boolean | void
  /** The level menu: one control (LevelMenu). Left out inside a lesson, where the block names the level. */
  menu?: ReactNode
  /** The way to switch between practice and a graded run, for a level that can be graded; it stands in the foot strip. */
  modeSwitch?: ReactNode
  goal: (run: FrameRun<Action, View, Score, Ask>) => FrameGoal
  diagram: (run: FrameRun<Action, View, Score, Ask>) => ReactNode
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
  /** The parts the diagram draws on this level. */
  parts: readonly PartRow[]
  /** How to play the level, in a few lines. */
  howTo: ReactNode
  titleBlock: TitleBlockProps
}

/** What the frame says in the outcome's status region when a run ends. */
export const RESULT_LINE = 'The run is over. The result is in the dock.'

/** The frame. A restart remounts the run inside it, so nothing of the old run is left to carry over. */
export function Frame<L, S, A extends GameAction, V, C, K>(props: FrameProps<L, S, A, V, C, K>) {
  const base = `${props.level}|${props.seed}`
  const [restarts, setRestarts] = useState<{ base: string; count: number; seed: Seed | null }>({ base, count: 0, seed: null })
  const current = restarts.base === base ? restarts : { base, count: 0, seed: null }
  const seed = current.seed ?? props.seed
  const restart = (next?: Seed) => setRestarts({ base, count: current.count + 1, seed: next ?? seed })
  return <FrameRunView key={`${base}|${current.count}|${seed}`} {...props} seed={seed} restarted={current.count > 0} onRestart={restart} />
}

type RunViewProps<L, S, A extends GameAction, V, C, K> = FrameProps<L, S, A, V, C, K> & { restarted: boolean; onRestart: (seed?: Seed) => void }

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

  // The learner's settings reach the game through the frame: 3D off turns the 3D view off, and the keys setting turns the keys off.
  const limits = shellLimits(useSettings(), props)
  const can3d = game.has3d && props.scene3d !== undefined && limits.allow3d
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
    dispatch: run.dispatch,
    undo: run.undo,
    announce: run.announce,
    setAutoplay: run.setAutoplay,
    mirrorId,
    restart: onRestart,
  }

  /** New numbers: a fresh seed that the level's band accepts, from the browser's entropy (unseen, not secret). */
  const newNumbers = () => onRestart(drawInBand(session, level, crypto.getRandomValues(new Uint32Array(1))[0]))

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
    target?.focus({ preventScroll: true })
    resultRef.current?.scrollIntoView({ block: 'nearest' })
  }, [outcome])

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
      className="es-frame"
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
          {props.menu ?? (
            <p className="es-frame__level" data-level-words="">
              {levelTitle} · {modeWord}
            </p>
          )}
        </div>
        <div className="es-frame__tools">
          {game.has3d ? (
            <ViewSwitch view={view} onViewChange={switchView} available3d={can3d} unavailableReason={limits.unavailable3d} labels={{ flat: 'Diagram', depth: '3D' }} />
          ) : null}
          <Popover trigger="Parts" title={`Parts of the ${game.title}`} className="es-frame__tool">
            <PartsList parts={props.parts} label={`Parts of the ${game.title}`} />
          </Popover>
          <Popover trigger="How to play" title="How to play" width="wide" className="es-frame__tool">
            {props.howTo}
            <p className="es-frame__howto-keys">Every action has a key. {keyboardButton('howto')}</p>
          </Popover>
          {keyboardButton('strip')}
          {keysWanted ? (
            <Suspense fallback={null}>
              <KeysDialog keys={keymap} open={keysOpen} onOpenChange={setKeysOpen} />
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

      <div className="es-frame__body">
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
        <div className="es-frame__dock" data-dock="" role="region" aria-label="Dock">
          <div className="es-frame__dock-main" data-dock-main="">
            {outcome === null ? (
              props.dock(api)
            ) : (
              <div ref={resultRef} tabIndex={-1} className="es-frame__result" data-result="">
                {props.result(api, outcome)}
              </div>
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

      <LiveRegion announcement={run.announcement} outcome={outcome ? RESULT_LINE : ''} />
    </section>
  )
}
