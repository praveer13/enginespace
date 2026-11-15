import { lazy, useCallback, useEffect, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { VERIFIER } from '@es/play/verifier/entry'
import { verifierSession } from '@es/play/verifier/session'
import type { Seed } from '@es/sim/core'
import { GameShell } from '@/games/kit/GameShell'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import { WorldCard } from './Card'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { LevelRail } from './LevelRail'
import { Mirror } from './Mirror'
import { showDraws, showMeter, showScaffold } from './rules'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_PRESET, TASTING_SHOTS } from './scene-shots'
import type { VerifierRun } from './types'
import { View2D } from './View2D'
import './verifier.css'

// The 3D scene is its own chunk over three's (A§6.10): the Stage loads it only on a device whose tier draws 3D.
const Scene3D = lazy(() => import('./Scene3D'))

/** The scene as the Stage mounts it, inside the Stage's canvas box. */
function TastingScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * The Tasting, speculative decoding's verifier (`verifier`, D-049). Its page is Play → Debrief, around the 2D view, the controls and the
 * mirror (D-018: one session, drawn by every view). The shell owns the run and its action log; this file wires The Tasting's parts into it,
 * and the keys that are its own: `D` draws a batch of rounds, `.` draws one, and Enter submits the answer.
 *
 * A level opens in practice on its pinned seed. A level that can be graded also opens a graded run on a seed drawn when it starts, in
 * band (GAMES.md §2.1), with no undo and no live meter. Whether a page records the run is its own business: the game's page and a lesson's
 * block each pass the recorder as `onFinish` (src/games/kit/record.ts, W1b-T01). Inside a lesson the block names the level, so the row of
 * levels and the next level are left out, and the way into a graded run and back stays.
 *
 * The 3D view (W1-T29) is the pass where the chef tastes, in a Stage that paints the 2D drawing first and keeps it as the fallback (A§6.7). It opens
 * on its own on a device whose tier draws 3D, and `V` or the switch swaps the two views; the session lives in the shell, above both, so a
 * swap keeps every weight and every round. The camera's preset lives here too: `C` and the preset buttons move it, in 3D only.
 *
 * The debrief is imported here and not behind React.lazy, as Service's is, because it prints fractions with the same `Fraction` as the 2D
 * view and the mirror. As a chunk of its own it would import that module from this game's chunk, which would then export a binding this
 * file does not, and Rollup gives such a chunk no entry module: the bundle manifest would have no `src/games/verifier/Game.tsx`, and
 * verify:bundle could not find the game. Whatever a lazy part of this game shares with its figure has the same cost.
 */

interface Attempt {
  readonly level: string
  readonly mode: GameMode
  readonly seed: Seed
}

const known = (id: string | undefined): string => VERIFIER.levels.find((entry) => entry.id === id)?.id ?? VERIFIER.levels[0].id
const fresh = (): Seed => crypto.getRandomValues(new Uint32Array(1))[0]
const practice = (id: string): Attempt => ({ level: id, mode: 'practice', seed: levelOf(VERIFIER, id)?.practiceSeed ?? 0 })
/** A practice run on a seed in band that the learner has not seen. */
const newNumbers = (id: string): Attempt => ({ level: id, mode: 'practice', seed: drawInBand(verifierSession, id, fresh()) })
/** A graded run: a seed drawn at the start, in band, and stamped unseen by whoever records it (ARCHITECTURE §8.2). */
const graded = (id: string): Attempt => ({ level: id, mode: 'graded', seed: drawInBand(verifierSession, id, fresh()) })

const startOf = (id: string, mode: GameMode | undefined): Attempt => (mode === 'graded' && levelOf(VERIFIER, id)?.graded ? graded(id) : practice(id))

/** What the shell's key commands do in this game. Returns whether the key was taken. */
function command(name: string, run: VerifierRun): boolean {
  const { view, dispatch } = run
  if (name === 'step' || name === 'draw') {
    if (!showDraws(run)) return false
    dispatch({ t: 'draw', n: Math.min(name === 'step' ? 1 : 20, view.drawsLeft) })
    return true
  }
  if (name === 'submit') {
    const kind = view.ask?.kind
    const ready =
      kind === 'finish' ||
      (kind === 'recipe' && view.weightTotal > 0) ||
      (kind === 'choose-gamma' && (view.gamma?.pick ?? 0) >= 1) ||
      (kind === 'audit' && (view.cards ?? []).every((card) => card.label !== null))
    if (!ready) return false
    dispatch({ t: 'submit' })
    return true
  }
  return false
}

/**
 * The scene's box: about a pass's 16:10 beside the mirror; on a phone a little taller than wide, the same shape from 320 to 479 px, so the
 * portrait shot keeps the whole course in it, at least 300 px and at most 60% of the screen's height [estimated].
 */
const STAGE_BOX = 'h-[clamp(18rem,min(56svh,34vw),32rem)] max-[479px]:h-[clamp(18.75rem,112vw,60svh)]'

/**
 * The 3D view's box: the Stage, with the 2D drawing as its first paint and its fallback, and the scene behind it; the key and the figures
 * stand under it, as they stand under the drawing. A dish picked in the scene while there is a recipe hands focus to its weight.
 */
function TastingStage({ run, preset }: { run: VerifierRun; preset: string }) {
  const onPick = useCallback((dish: number) => document.querySelector<HTMLInputElement>(`[data-vf-dish="${dish}"]`)?.focus(), [])
  return (
    <div className="flex flex-col gap-3">
      <Stage
        id="verifier"
        className={`${STAGE_BOX} border border-edge shadow-shelf`}
        view2d={<View2D run={run} part="drawing" />}
        scene={TastingScene}
        sceneProps={{ view: run.view, shots: TASTING_SHOTS, preset, scaffold: showScaffold(run), outcome: showMeter(run), onPick }}
        announce={run.announce}
      />
      <View2D run={run} part="notes" />
    </div>
  )
}

export default function Game({ level, mode, placement = 'page', rev, onFinish }: GameProps) {
  const [asked, setAsked] = useState({ level, mode })
  const [attempt, setAttempt] = useState<Attempt>(() => startOf(known(level), mode))
  // A page that opens another level of the game gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked.level || mode !== asked.mode) {
    setAsked({ level, mode })
    setAttempt(startOf(known(level), mode))
  }
  // Moving to another level replaces the page's content, and the button that was pressed goes with it: focus goes back to the game. This
  // game's own, found from its box, since a lesson can hold two of it.
  const host = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    host.current?.querySelector<HTMLElement>('[data-game]')?.focus({ preventScroll: true })
  }, [attempt])
  const go = (next: Attempt) => {
    moved.current = true
    setAttempt(next)
  }

  // 3D opens by itself where the device draws it, and a learner's own choice of view wins from then on. Under `saveData` the Stage
  // waits to be asked, so the page opens on the 2D view there.
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [chosenView, setChosenView] = useState<GameView | null>(null)
  const view: GameView = chosenView ?? (draws3d && device.hints?.saveData !== true ? '3d' : '2d')
  const unavailable3d = device.known && !draws3d ? unavailableReason(device.reason) : undefined
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET)

  const embedded = placement === 'embed'
  const entry = levelOf(VERIFIER, attempt.level) ?? VERIFIER.levels[0]
  const at = VERIFIER.levels.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (VERIFIER.levels[at + 1] ?? null)

  return (
    <div ref={host} className="contents">
      <GameShell
        game={VERIFIER}
        session={verifierSession}
        level={entry.id}
        levelTitle={entry.title}
        seed={attempt.seed}
        mode={attempt.mode}
        rev={rev}
        headingLevel={embedded ? 3 : 2}
        embedded={embedded}
        onFinish={onFinish}
        onCommand={(name, run) => {
          if (name !== 'camera') return command(name, run)
          if (view !== '3d') return false
          const next = TASTING_SHOTS[(TASTING_SHOTS.findIndex((shot) => shot.id === preset) + 1) % TASTING_SHOTS.length]
          setPreset(next.id)
          run.announce(`Camera: ${next.label}.`)
          return true
        }}
        allow3d={draws3d}
        unavailable3d={unavailable3d}
        view={view}
        onViewChange={setChosenView}
        view2d={(run) => <View2D run={run} />}
        scene3d={(run) => <TastingStage run={run} preset={preset} />}
        controls={(run) => (
          <>
            {view === '3d' ? <CameraButtons presets={TASTING_SHOTS} value={preset} onChange={setPreset} label="Camera on the pass" /> : null}
            <Controls
              run={run}
              rail={
                <LevelRail
                  levels={VERIFIER.levels}
                  current={entry.id}
                  mode={attempt.mode}
                  done={run.done}
                  onLevel={(id) => go(practice(id))}
                  onGraded={() => go(graded(entry.id))}
                  onPractice={() => go(practice(entry.id))}
                  showLevels={!embedded}
                />
              }
            />
          </>
        )}
        mirror={(run) => <Mirror run={run} />}
        debrief={(run, outcome) => (
          <Debrief
            run={run}
            outcome={outcome}
            next={after === null ? null : { id: after.id, title: after.title }}
            onNext={() => after !== null && go(practice(after.id))}
            onPracticeAgain={() => (attempt.mode === 'practice' ? run.restart() : go(practice(entry.id)))}
            onNewNumbers={() => go(newNumbers(entry.id))}
            onGraded={entry.graded ? () => go(graded(entry.id)) : null}
          />
        )}
        card={<WorldCard />}
      />
    </div>
  )
}
