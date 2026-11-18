import { lazy, useCallback, useRef, useState } from 'react'
import { drawInBand, levelOf } from '@es/play'
import type { GameMode } from '@es/play'
import { FULL_SERVICE, LOOP } from '@es/play/loop/entry'
import { FULL_COPY } from '@es/play/loop/full/copy'
import { MODES } from '@es/play/loop/full/levels'
import { FULL_MET } from '@es/play/loop/full/parts'
import { fullSession } from '@es/play/loop/full/session'
import type { FullLevelId } from '@es/play/loop/full/types'
import { ROSTER } from '@es/play/roster'
import type { Seed } from '@es/sim/core'
import { Button } from '@/design/components/Button'
import { LevelMenu } from '@/design/components/LevelMenu'
import { Frame } from '@/games/kit/Frame'
import type { GameView } from '@/games/kit/ViewSwitch'
import type { GameProps } from '@/games/registry'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import type { Scene3DProps } from './Scene3D'
import { cameraLabel, DEFAULT_CAMERA, nextCamera, TRACK_CAMERAS } from './track-presets'
import { FullCard } from './full/FullCard'
import { FullControls, type AutoToggleRef } from './full/FullControls'
import { FullDebrief } from './full/FullDebrief'
import { FullMirror } from './full/FullMirror'
import { FullReadout } from './full/FullTape'
import { FullLegend, FullView2D } from './full/FullView2D'
import { fullKit, fullPartRows } from './full/kit'
import type { FullRun } from './full/types'
import './full/full.css'
import './track3d.css'

// The 3D scene is the step loop's time track (REDESIGN §2.9), the demo levels' lazy chunk (A§6.10): it draws the full levels from their own
// lanes, in µs, and loads only when the learner switches to 3D.
const Scene3D = lazy(() => import('./Scene3D'))

function FullScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * The full levels (REDESIGN §3.7): TR2's levels and TR6's mask lane, in the instrument frame (src/games/kit/Frame.tsx) around the timing
 * diagram of packages/play/loop/full/lanes.ts, the dock beside it and the readout strip under the dock (D-018: one session, drawn by every
 * view). The frame owns the run; this file wires the full levels' parts into it, and their keys: `.` steps, Space toggles Auto, `O` flips the
 * stage's async scheduling switch (or the grammar mask's), `G` cycles the graph mode, `M` switches the runner, and `[` and `]` move between
 * the level's stages.
 *
 * It is a lazy chunk of the game (Game.tsx loads it when a full level opens), so `/play/loop`'s demo levels and the front page carry none of
 * the step loop v1 or the cost cards.
 */

const ROLE = ROSTER.find((entry) => entry.id === LOOP.id)?.role ?? ''

const step = (run: FullRun): boolean => {
  if (!run.view.canFire) return false
  run.dispatch({ t: 'run', until: 'step' })
  return true
}

function stageStep(run: FullRun, by: 1 | -1): boolean {
  const { view } = run
  const to = view.stages[view.at + by]
  if (to === undefined) return false
  run.dispatch({ t: 'stage', to: to.id })
  return true
}

function overlapKey(run: FullRun): boolean {
  const { view } = run
  if (view.stage.closed) return false
  if (view.stage.levers.includes('async')) run.dispatch({ t: 'lever', name: 'async', value: !view.levers.async })
  else if (view.stage.levers.includes('maskOverlap'))
    run.dispatch({
      t: 'lever',
      name: 'maskOverlap',
      value: !view.levers.maskOverlap,
    })
  else return false
  return true
}

function modeKey(run: FullRun): boolean {
  const { view } = run
  if (view.stage.closed || !view.stage.levers.includes('graphMode')) return false
  const at = MODES.indexOf(view.levers.graphMode)
  const next = MODES[(at + 1) % MODES.length]
  run.dispatch({ t: 'lever', name: 'graphMode', value: next })
  run.announce(`Graph mode: ${next}.`)
  return true
}

function runnerKey(run: FullRun): boolean {
  const { view } = run
  if (view.stage.closed || !view.stage.levers.includes('runner')) return false
  const next = view.levers.runner === 'mrv2' ? 'v1' : 'mrv2'
  run.dispatch({ t: 'lever', name: 'runner', value: next })
  run.announce(next === 'mrv2' ? 'The V2 runner.' : 'The legacy V1 runner.')
  return true
}

/**
 * A run of the full levels: a level, whether it is practice or graded, and the seed. Practice plays the level's pinned seed with undo. A
 * graded run is a seed drawn when it starts (`crypto.getRandomValues`), through the level's band, with no undo (ASSESSMENT §4.3).
 */
interface Attempt {
  readonly level: string
  readonly mode: GameMode
  readonly seed: Seed
}

const fresh = (): Seed => crypto.getRandomValues(new Uint32Array(1))[0]
const practiceOf = (id: string): Attempt => ({
  level: id,
  mode: 'practice',
  seed: levelOf(LOOP, id)?.practiceSeed ?? 0,
})
const gradedOf = (id: string): Attempt => ({
  level: id,
  mode: 'graded',
  seed: drawInBand(fullSession, id, fresh()),
})
const startOf = (id: string, mode: GameMode | undefined): Attempt => (mode === 'graded' && levelOf(LOOP, id)?.graded === true ? gradedOf(id) : practiceOf(id))

/** The way into a graded run of a level that can be graded, and back to practice. Nothing locks (ARCHITECTURE I9): every level is open. */
function GradedBar({
  graded,
  mode,
  done,
  onGraded,
  onPractice,
}: {
  graded: boolean
  mode: GameMode
  done: boolean
  onGraded: () => void
  onPractice: () => void
}) {
  if (!graded) return <span className="text-text-2">Practice: fixed numbers, undo allowed. µs are the model’s clock.</span>
  return (
    <div className="es-full-mode" data-full-mode={mode}>
      {mode === 'graded' && !done ? (
        <>
          <p className="text-text-2">A graded run: fresh numbers drawn now, no undo, one run, and the live readout waits for it.</p>
          <Button size="sm" variant="quiet" onClick={onPractice}>
            Back to practice
          </Button>
        </>
      ) : (
        <>
          <p className="text-text-2">Practice: fixed numbers, undo allowed. This level can be graded, on fresh numbers.</p>
          <Button size="sm" onClick={onGraded}>
            Start a graded run
          </Button>
        </>
      )}
    </div>
  )
}

export interface FullServiceProps extends Pick<GameProps, 'placement' | 'rev' | 'onFinish' | 'mode'> {
  level: string
  onLevel: (id: string) => void
}

/** How to play a full level: the stage's rhythm, in the engine's words. */
function HowTo({ level }: { level: FullLevelId }) {
  return (
    <div className="flex flex-col gap-3" data-loop-howto="">
      <p>{FULL_COPY[level].prompt}</p>
      <ol className="list-decimal pl-5">
        <li>Read the goal line: it says what to beat and when the stage ends.</li>
        <li>Commit the stage’s prediction. The session asks it before the first run, and it is committed once.</li>
        <li>Set the levers, then press Step. Each step draws the CPU’s calls on the top lane and the GPU’s forward under it.</li>
        <li>A dashed box is a bubble: the GPU idle, waiting for the CPU. Its line carries its width in µs.</li>
        <li>When the run is served, the reference run’s forwards stand under yours as outlines, on the same axis.</li>
      </ol>
    </div>
  )
}

export default function FullService({ level, mode, placement = 'page', rev, onFinish, onLevel }: FullServiceProps) {
  const entry = levelOf(LOOP, level) ?? FULL_SERVICE[0]
  const levelId = entry.id as FullLevelId
  const [asked, setAsked] = useState({ level, mode })
  const [attempt, setAttempt] = useState<Attempt>(() => startOf(entry.id, mode))
  // A page that opens another level of the game, or asks for a graded run, gets it. (Adjusting state when a prop changes: React re-renders at once.)
  if (level !== asked.level || mode !== asked.mode) {
    setAsked({ level, mode })
    setAttempt(startOf(levelOf(LOOP, level)?.id ?? FULL_SERVICE[0].id, mode))
  }
  const toggleAuto: AutoToggleRef = useRef(null)
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  // The diagram is the default view; the learner's own choice wins from then on. 3D is offered where the device draws it.
  const [chosenView, setChosenView] = useState<GameView | null>(null)
  const view: GameView = chosenView ?? '2d'
  const unavailable3d = device.known && !draws3d ? unavailableReason(device.reason) : undefined
  const [preset, setPreset] = useState<string>(DEFAULT_CAMERA)
  // Inside a lesson the block names the level, so no other level is offered (W1b-T01).
  const embedded = placement === 'embed'
  const at = FULL_SERVICE.findIndex((candidate) => candidate.id === entry.id)
  const after = embedded ? null : (FULL_SERVICE[at + 1] ?? null)
  const onNext = useCallback(() => {
    if (after !== null) onLevel(after.id)
  }, [after, onLevel])
  const kit = useCallback((seed: Seed) => fullKit(levelId, seed), [levelId])
  const seed = attempt.level === entry.id ? attempt.seed : entry.practiceSeed
  const runMode = attempt.level === entry.id ? attempt.mode : 'practice'
  const copy = FULL_COPY[levelId]

  return (
    <Frame
      game={LOOP}
      role={ROLE}
      session={fullSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={seed}
      mode={runMode}
      rev={rev}
      embedded={embedded}
      onFinish={onFinish}
      ledger={onFinish !== undefined}
      kit={kit}
      menu={
        embedded
          ? undefined
          : (run) => (
              <>
                <LevelMenu
                  label="Level"
                  value={entry.id}
                  levels={LOOP.levels.map((candidate) => ({
                    id: candidate.id,
                    // The level's stage stands in the face of the menu: "CUDA graphs · stage 2 of 3: Capture sizes and padding".
                    title:
                      candidate.id === entry.id && run.view.stages.length > 1
                        ? `${candidate.title} · stage ${run.view.at + 1} of ${run.view.stages.length}: ${run.view.stage.title}`
                        : candidate.title,
                    mode: candidate.graded ? 'graded' : 'practice',
                  }))}
                  onChange={onLevel}
                />
                {run.view.stages.length > 1 ? (
                  <p className="es-fl__stage" data-full-stage="">
                    Stage {run.view.at + 1} of {run.view.stages.length}: {run.view.stage.title}
                  </p>
                ) : null}
              </>
            )
      }
      modeSwitch={
        <GradedBar
          graded={entry.graded}
          mode={runMode}
          done={false}
          onGraded={() => setAttempt(gradedOf(entry.id))}
          onPractice={() => setAttempt(practiceOf(entry.id))}
        />
      }
      allow3d={draws3d}
      unavailable3d={unavailable3d}
      phone3d={false}
      view={view}
      onViewChange={setChosenView}
      onCommand={(command, run) => {
        switch (command) {
          case 'step':
            return step(run)
          case 'play-pause':
            toggleAuto.current?.()
            return toggleAuto.current !== null
          case 'overlap':
            return overlapKey(run)
          case 'graph-mode':
            return modeKey(run)
          case 'runner':
            return runnerKey(run)
          case 'stage-next':
            return stageStep(run, 1)
          case 'stage-prev':
            return stageStep(run, -1)
          case 'camera': {
            if (view !== '3d') return false
            const next = nextCamera(preset)
            setPreset(next)
            run.announce(`Camera: ${cameraLabel(next)}.`)
            return true
          }
          default:
            return false
        }
      }}
      goal={(run) => {
        const stage = copy.stages[run.view.stage.id]?.goal ?? copy.goal
        // A graded level shows its pass rule before the run, tolerance included (REDESIGN §2.6); the others, the number to beat.
        return {
          aim: stage.aim,
          control: stage.controls,
          target: copy.passRule ?? stage.beat,
          ends: stage.ends,
          met: run.done ? FULL_MET[levelId] : undefined,
        }
      }}
      diagram={(run) => <FullView2D run={run} />}
      scene3d={(run) => (
        <Stage
          id="loop"
          className="es-track-stage border border-edge"
          view2d={<FullView2D run={run} />}
          scene={FullScene}
          sceneProps={{ full: run.view, preset }}
          announce={run.announce}
        />
      )}
      legend={() =>
        view === '3d' ? <CameraButtons presets={TRACK_CAMERAS} value={preset} onChange={setPreset} label="Camera" /> : <FullLegend level={levelId} />
      }
      dock={(run) => <FullControls run={run} toggleAutoRef={toggleAuto} />}
      readout={(run) => <FullReadout view={run.view} />}
      result={(run, outcome) => (
        <FullDebrief
          run={run}
          outcome={outcome}
          next={after === null ? null : { id: after.id, title: after.title }}
          onNext={onNext}
          onGraded={entry.graded ? () => setAttempt(gradedOf(entry.id)) : null}
          onPractice={run.mode === 'graded' ? () => setAttempt(practiceOf(entry.id)) : null}
          embedded={embedded}
        />
      )}
      mirror={(run) => <FullMirror run={run} />}
      parts={fullPartRows(levelId)}
      howTo={<HowTo level={levelId} />}
      titleBlock={{
        model: 'Model of the step loop, after vLLM v0.33.0',
        clock: 'Clock: µs on the model’s clock, priced by a cost card',
        leavesOut: <FullCard />,
      }}
    />
  )
}
