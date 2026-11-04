import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { PHASES, PHASE_NAMES, keymapOf } from '@es/play'
import type { GameAction, GameFace, GameMode, KeyBinding, Phase, RunResult, Session } from '@es/play'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { TapeLabel } from '@/design/components/TapeLabel'
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
 *   - the game's display name over its engine concept (D-049), its mode, the view switch and the Keys button;
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
  /** Settings can turn the keys off (WCAG 2.1.4). */
  shortcuts?: boolean
  /** Whether the tier, the setting and the browser allow 3D. A game without a scene never has it. */
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

  const can3d = game.has3d && props.scene3d !== undefined && (props.allow3d ?? true)
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

  const switchView = (next: GameView) => {
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
    enabled: props.shortcuts ?? true,
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
    const lost = document.activeElement === null || document.activeElement === document.body
    if (swapped && lost) container.current?.focus({ preventScroll: true })
  }, [view, container])
  useEffect(() => {
    if (restarted) container.current?.focus({ preventScroll: true })
  }, [restarted, container])

  const Heading = props.headingLevel === 3 ? 'h3' : 'h2'

  function stagePanel(): ReactNode {
    if (phase === 'play') {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
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
          </div>
          <div className="min-w-0">{props.mirror(api)}</div>
        </div>
      )
    }
    if (outcome === null) return null
    const slot = phase === 'debrief' ? props.debrief : extra[phase]
    return slot?.(api, outcome) ?? null
  }

  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-game={game.id}
      data-phase={phase}
      data-mode={mode}
      data-view={view}
      className="flex flex-col gap-6 outline-none"
    >
      <header className="flex flex-col gap-3">
        <div>
          <Heading id={headingId} className="es-type-heading">
            {game.title}
          </Heading>
          <p className="es-type-body text-text-2">{game.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TapeLabel size="sm">
            {levelTitle ? `${levelTitle} · ` : ''}
            {mode === 'practice' ? 'practice' : 'graded'}
          </TapeLabel>
          {game.has3d ? <ViewSwitch view={view} onViewChange={switchView} available3d={can3d} unavailableReason={props.unavailable3d} /> : null}
          <KeysDialog keys={keymap} open={keysOpen} onOpenChange={setKeysOpen}>
            <Button size="sm" variant="quiet">
              Keys
            </Button>
          </KeysDialog>
        </div>
      </header>

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

      <div ref={panel} tabIndex={-1} role="group" aria-label={PHASE_NAMES[phase]} data-stage={phase} className="outline-none">
        {stagePanel()}
      </div>

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
