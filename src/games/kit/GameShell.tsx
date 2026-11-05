import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { PHASES, PHASE_NAMES, keymapOf } from '@es/play'
import type { GameAction, GameFace, GameMode, KeyBinding, Phase, RunResult, Session } from '@es/play'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { TapeLabel } from '@/design/components/TapeLabel'
import { shellLimits } from '@/settings/rules'
import { useSettings } from '@/settings/useSettings'
import { focusIsLost } from './focus'
import { KeysDialog } from './KeysDialog'
import { LiveRegion } from './LiveRegion'
import { useGameInput } from './useGameInput'
import { useRun, type RunCore, type RunOutcome } from './useRun'
import { ViewSwitch, type GameView } from './ViewSwitch'

/*
 * The game shell (ARCHITECTURE §6.3): Play → Debrief → Compose → In production → Build this, around any game's views.
 *
 * The shell owns the run, through `useRun`: it starts the session on a level and a seed, applies every action through the pure
 * reducer and keeps the action log, so each game records its run the same way and a replay of the log is the grade (D-018). The
 * 2D view, the 3D scene, the controls and the mirror are slots that receive the run and draw `view(state)`; none keeps state of
 * its own that the session does not, which is why a swap between 2D and 3D, or a lost WebGL context, cannot lose a lever.
 * A page that wants another frame around the views builds on `useRun` and the kit's other parts instead.
 *
 * What it adds around the slots:
 *   - the game's display name over its engine concept (D-049), its mode (or the game's own docket, which shows it), the view switch and
 *     the Keys button;
 *   - the stages. Debrief opens when the run is over, and the stages after it open once the debrief has been seen, because the
 *     debrief is where the hidden reference is read; Compose, In production and Build this appear only for a game that has them;
 *   - the keys: common to every game, bound on this container, with `V` and `?` handled here and the rest passed to `onCommand`;
 *   - one polite live region, and a status region for the outcome (A§6.9);
 *   - the notional-machine card, kept to hand beside the world (A§5.9).
 *
 * A slot only mounts while it is showing, so a lazy Compose or 3D scene loads when the learner reaches it.
 */

/** What every slot receives: the run, as the views and controls need it, and where the shell has the learner. */
export type RunApi<Action extends GameAction, View, Score, Ask> = RunCore<Action, View, Score, Ask> & {
  /** The id for the mirror's `<table>`, which the views' `aria-describedby` points at. */
  readonly mirrorId: string
  readonly phase: Phase
  /** A fresh run of the same level: on `seed` when one is given ("New numbers"), else on the same seed. */
  restart(seed?: Seed): void
  goTo(phase: Phase): void
}

export type { RunOutcome }

export interface GameShellProps<Level, State, Action extends GameAction, View, Score, Ask> {
  game: GameFace
  /** The game's rules. Keep it one object (a module's export): the shell memoizes the run's view and result on it. */
  session: Session<Level, State, Action, View, Score, Ask>
  level: string
  /** The level's name on screen. */
  levelTitle?: string
  /** The practice seed, or a seed drawn at the start of a graded run. */
  seed: Seed
  mode: GameMode
  /** The content revision, which the run record carries (A§4.2). */
  rev?: string
  /** The game's heading: 2 on its own page, 3 inside a lesson. */
  headingLevel?: 2 | 3
  /** Whether the keys are bound. The learner's setting ("Game keys", WCAG 2.1.4) turns them off in every game; this can only turn them off as well. */
  shortcuts?: boolean
  /** Whether the tier and the browser allow 3D. The learner's setting ("3D off") is read here too. A game without a scene never has it. */
  allow3d?: boolean
  /** Said beside the disabled 3D button when `allow3d` is false. */
  unavailable3d?: string
  view?: GameView
  defaultView?: GameView
  onViewChange?: (view: GameView) => void
  /**
   * Called when a run ends, with the record, grade and hash, for the ledger: once for each run, so a practice run that is undone
   * and finished again reports again. A front-page run passes nothing, because it records nothing (D-038).
   */
  onFinish?: (result: RunResult) => void
  /** A key the shell does not take itself. Return true when the command was handled. A `step-back` left unhandled undoes. */
  onCommand?: (command: string, run: RunApi<Action, View, Score, Ask>) => boolean | void
  view2d: (run: RunApi<Action, View, Score, Ask>) => ReactNode
  /** The 3D view: a Stage (src/scene), which paints the 2D view first and hides its own canvas from assistive technology (A§6.9). */
  scene3d?: (run: RunApi<Action, View, Score, Ask>) => ReactNode
  controls: (run: RunApi<Action, View, Score, Ask>) => ReactNode
  mirror: (run: RunApi<Action, View, Score, Ask>) => ReactNode
  debrief: (run: RunApi<Action, View, Score, Ask>, outcome: RunOutcome<View>) => ReactNode
  compose?: (run: RunApi<Action, View, Score, Ask>, outcome: RunOutcome<View>) => ReactNode
  production?: (run: RunApi<Action, View, Score, Ask>, outcome: RunOutcome<View>) => ReactNode
  build?: (run: RunApi<Action, View, Score, Ask>, outcome: RunOutcome<View>) => ReactNode
  /** The world's notional-machine card: what it models and what it ignores (A§5.9). */
  card?: ReactNode
  /**
   * The view leads the page: under the game's name, the view with the controls beside it and its switches (the view, the keys, the
   * stages) under it, then the mirror across the width. Off, the view and the controls share a column beside the mirror.
   */
  stage?: boolean
  /**
   * The game's own row of choices under its name, such as its levels and its attempt. With `stage` off the stages and the Keys button
   * join that row, and the tape that names the level and the mode is left out, because the row shows both; with `stage` on the row
   * stands alone under the name, and the stages stay under the view.
   */
  docket?: ReactNode
  /**
   * The mirror before the controls (with `stage` off): on a narrow screen it stands between the view and the controls, and on a wide one
   * beside them both, with the controls under the view.
   */
  mirrorFirst?: boolean
  /**
   * What stands under the controls in the play stage, with `stage` on: a game's tape, which its mirror then leaves out. Given, the mirror
   * stands right under the view's switches on a wide screen, and the controls and this run down beside the view, the switches and the
   * mirror, so a long column of controls never leaves a hole under the view. On a narrow screen it follows the controls.
   */
  beside?: (run: RunApi<Action, View, Score, Ask>) => ReactNode
}

type ShellRunProps<L, S, A extends GameAction, V, C, K> = GameShellProps<L, S, A, V, C, K> & {
  restarted: boolean
  onRestart: (seed?: Seed) => void
}

const OUTCOME = 'The run is over. The debrief is ready.'

/** The shell. A restart remounts the run inside it, so nothing of the old run is left to carry over. */
export function GameShell<L, S, A extends GameAction, V, C, K>(props: GameShellProps<L, S, A, V, C, K>) {
  // The run is keyed by its level and seed: a new level or seed from the page starts a new run, and `restart` does the same.
  const base = `${props.level}|${props.seed}`
  const [restarts, setRestarts] = useState<{ base: string; count: number; seed: Seed | null }>({ base, count: 0, seed: null })
  const current = restarts.base === base ? restarts : { base, count: 0, seed: null }
  const seed = current.seed ?? props.seed
  const restart = (next?: Seed) => setRestarts({ base, count: current.count + 1, seed: next ?? seed })
  return <ShellRun key={`${base}|${current.count}|${seed}`} {...props} seed={seed} restarted={current.count > 0} onRestart={restart} />
}

function ShellRun<L, S, A extends GameAction, V, C, K>(props: ShellRunProps<L, S, A, V, C, K>) {
  const { game, session, level, levelTitle, seed, mode, rev, restarted, onRestart } = props
  const headingId = useId()
  const noteId = useId()
  const mirrorId = useId()
  const run = useRun({ session, game: game.id, level, seed, mode, rev, onFinish: props.onFinish })
  const { outcome } = run
  const [phase, setPhase] = useState<Phase>('play')
  const [debriefOpened, setDebriefOpened] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [chosenView, setChosenView] = useState<GameView>(props.defaultView ?? '2d')

  // The learner's settings reach every game through the shell, so no game passes them on: 3D off turns the 3D view off, and the
  // keys setting turns the keys off, live. A game's own props can only ask for less.
  const limits = shellLimits(useSettings(), props)
  const can3d = game.has3d && props.scene3d !== undefined && limits.allow3d
  const view: GameView = can3d ? (props.view ?? chosenView) : '2d'

  // The stages this game has, and which of them the learner can open now.
  const extra = { compose: props.compose, production: props.production, build: props.build }
  const stages = PHASES.filter((stage) => stage === 'play' || stage === 'debrief' || extra[stage] !== undefined)
  const reachable = (stage: Phase) => stage === 'play' || (outcome !== null && (stage === 'debrief' || debriefOpened))
  const goTo = (stage: Phase) => {
    if (!reachable(stage)) return
    if (stage === 'debrief') setDebriefOpened(true)
    setPhase(stage)
  }
  // An undone move reopens the run, so the stages that follow its end shut with it.
  const undo = () => {
    run.undo()
    setPhase('play')
  }

  // A swap the learner asked for (the switch, `V`) may take the focused control with it; a swap the device made (3D once the tier is
  // known) moves no focus, so a page that opens on 3D never lights the whole game as focused.
  const swapAsked = useRef(false)
  const switchView = (next: GameView) => {
    swapAsked.current = true
    props.onViewChange?.(next)
    setChosenView(next)
    run.announce(next === '3d' ? '3D view.' : '2D view.')
  }

  const api: RunApi<A, V, C, K> = {
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
    undo,
    announce: run.announce,
    setAutoplay: run.setAutoplay,
    mirrorId,
    phase,
    restart: onRestart,
    goTo,
  }

  // The keys. `V` and `?` are the shell's; the rest go to the game, and a `,` it leaves alone undoes in practice.
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
        setKeysOpen(true)
        return true
      }
      if (props.onCommand?.(binding.id, api) === true) return true
      if (binding.id === 'step-back' && run.canUndo) {
        undo()
        return true
      }
      return false
    },
  })

  // Moving to another stage moves focus to it, so a keyboard and a screen reader land on the new content. The first render does not.
  const panel = useRef<HTMLDivElement>(null)
  const shownStage = useRef(phase)
  useEffect(() => {
    if (shownStage.current === phase) return
    shownStage.current = phase
    panel.current?.focus({ preventScroll: true })
  }, [phase])

  // A swap of views can leave focus on a node that is gone, and a restart replaces the button that was pressed. Put focus back
  // on the game, so its keys still work.
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

  const Heading = props.headingLevel === 3 ? 'h3' : 'h2'

  const viewNode: ReactNode = (
    <>
      <p id={noteId} className="sr-only">
        This view is a drawing. The table below lists everything it shows.
      </p>
      {view === '3d' && props.scene3d ? (
        // The scene's own box hides its canvas (the Stage marks it aria-hidden, A§6.9). Around it stay what a reader needs: the
        // 2D view the Stage paints first or falls back to, and its notes and their buttons, which must never sit in a hidden box.
        <div data-surface="3d" role="group" aria-label="3D view" aria-describedby={noteId}>
          {props.scene3d(api)}
        </div>
      ) : (
        <div data-surface="2d" role="group" aria-label="2D view" aria-describedby={noteId}>
          {props.view2d(api)}
        </div>
      )}
    </>
  )

  const playControls: ReactNode = (
    <>
      {props.controls(api)}
      {mode === 'practice' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={!run.canUndo} aria-keyshortcuts="," onClick={undo}>
            Undo
          </Button>
        </div>
      ) : null}
      {outcome ? (
        <div data-end="" className="flex flex-wrap items-center gap-3">
          <p>The run is over.</p>
          <Button variant="ink" size="lg" onClick={() => goTo('debrief')}>
            See the debrief
          </Button>
        </div>
      ) : null}
    </>
  )

  function stagePanel(): ReactNode {
    if (phase === 'play') {
      // With the view leading, the view and the controls stand above the stages, and the play panel holds the mirror.
      if (props.stage) return <div className="min-w-0">{props.mirror(api)}</div>
      if (props.mirrorFirst) {
        return (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr] lg:items-start">
            <div className="flex min-w-0 flex-col gap-4">{viewNode}</div>
            <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">{props.mirror(api)}</div>
            <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-2">{playControls}</div>
          </div>
        )
      }
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            {viewNode}
            {playControls}
          </div>
          <div className="min-w-0">{props.mirror(api)}</div>
        </div>
      )
    }
    if (outcome === null) return null
    const slot = phase === 'debrief' ? props.debrief : extra[phase]
    return slot?.(api, outcome) ?? null
  }

  const docket = props.stage ? undefined : props.docket
  const tools = (
    <div className="flex flex-wrap items-center gap-3">
      {docket === undefined ? (
        <TapeLabel size="sm">
          {levelTitle ? `${levelTitle} · ` : ''}
          {mode === 'practice' ? 'practice' : 'graded'}
        </TapeLabel>
      ) : null}
      {game.has3d ? <ViewSwitch view={view} onViewChange={switchView} available3d={can3d} unavailableReason={limits.unavailable3d} /> : null}
      <KeysDialog keys={keymap} open={keysOpen} onOpenChange={setKeysOpen}>
        <Button size="sm" variant="quiet">
          Keys
        </Button>
      </KeysDialog>
    </div>
  )
  const nav = (
    <nav aria-label="Stages of this game">
      <ol className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <li key={stage}>
            <Button
              size="sm"
              variant={stage === phase ? 'ink' : 'quiet'}
              aria-current={stage === phase ? 'step' : undefined}
              disabled={!reachable(stage)}
              onClick={() => goTo(stage)}
            >
              {PHASE_NAMES[stage]}
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  )
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {tools}
      {nav}
    </div>
  )
  // The play stage of a game that sets something beside its controls lays its two columns out to flow on their own (`beside`).
  const flow = props.stage === true && phase === 'play' && props.beside !== undefined
  const panelNode = (
    <div
      ref={panel}
      tabIndex={-1}
      role="group"
      aria-label={PHASE_NAMES[phase]}
      data-stage={phase}
      className={flow ? 'min-w-0 outline-none lg:col-start-1 lg:row-start-3' : 'outline-none'}
    >
      {stagePanel()}
    </div>
  )

  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-game={game.id}
      data-phase={phase}
      data-mode={mode}
      data-view={view}
      // The game is focused only so its keys work; the lamp marks the control the keyboard is on, never the whole game.
      className="flex flex-col gap-6 shadow-none outline-none"
    >
      <header className="flex flex-col gap-3">
        <div>
          <Heading id={headingId} className="es-type-heading">
            {game.title}
          </Heading>
          <p className="es-type-body text-text-2">{game.subtitle}</p>
        </div>
        {props.stage ? (props.docket ?? null) : docket === undefined ? (
          tools
        ) : (
          // One row: the game's own choices, then the stages and the keys.
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {docket}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {nav}
              {tools}
            </div>
          </div>
        )}
      </header>

      {flow && props.beside ? (
        // As below, with the mirror in the grid too: the controls and what stands beside them span the view's row, its switches' and
        // the mirror's, and only the mirror's row is flexible, so a column of controls longer than the view and its switches lengthens
        // that row alone and the mirror stands right under the switches. The order on the page is the order on a narrow screen and the
        // keyboard's: the view, the controls, what stands beside them, the view's switches, the mirror.
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:grid-rows-[auto_auto_1fr] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">{viewNode}</div>
          <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-1" data-shell-column="controls">
            <div className="flex min-w-0 flex-col gap-4">{playControls}</div>
            <div className="min-w-0">{props.beside(api)}</div>
          </div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">{toolbar}</div>
          {panelNode}
        </div>
      ) : props.stage && phase === 'play' ? (
        // The view leads, and the controls stand beside it, so a hand on them never loses sight of the scene. The view's switches
        // stand under it on a wide screen; on a narrow one they follow the controls, which come first after the view.
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:grid-rows-[auto_1fr] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">{viewNode}</div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">{playControls}</div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">{toolbar}</div>
        </div>
      ) : props.stage ? (
        toolbar
      ) : docket === undefined ? (
        nav
      ) : null}

      {flow ? null : panelNode}

      {props.card ? (
        <details className="max-w-prose">
          <summary className="cursor-pointer font-bold">What this world models</summary>
          <div className="mt-3">{props.card}</div>
        </details>
      ) : null}

      <LiveRegion announcement={run.announcement} outcome={outcome ? OUTCOME : ''} />
    </section>
  )
}
