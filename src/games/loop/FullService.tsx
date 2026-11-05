import { lazy, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { levelOf } from '@es/play'
import { FULL_SERVICE, LOOP } from '@es/play/loop/entry'
import { MODES } from '@es/play/loop/full/levels'
import { fullSession } from '@es/play/loop/full/session'
import type { GameView } from '@/games/kit/ViewSwitch'
import { GameShell } from '@/games/kit/GameShell'
import type { GameProps } from '@/games/registry'
import { nextPreset, presetById } from '@/scene/camera-rig'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import { unavailableReason, useDeviceTier } from '@/scene/tiers'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_PRESET, LOOP_PRESETS } from './scene-presets'
import { BuildThis } from './full/BuildThis'
import { Compose } from './full/Compose'
import { FullCard } from './full/FullCard'
import { FullControls, type AutoToggleRef } from './full/FullControls'
import { FullDebrief } from './full/FullDebrief'
import { FullMirror } from './full/FullMirror'
import { FullTape } from './full/FullTape'
import { FullView2D } from './full/FullView2D'
import { Production } from './full/Production'
import { sceneOfFull } from './full/scene'
import type { FullRun } from './full/types'
import './full/full.css'

// The 3D scene is Service's own lazy chunk (A§6.10), the one the front page and the first service load: the full service adds its objects.
const Scene3D = lazy(() => import('./Scene3D'))

function FullScene(props: Scene3DProps) {
  return <Scene3D {...props} />
}

/*
 * The full service: TR2's levels and TR6's mask lane on Service's page (GAMES.md §3.2, §2.6). Play → Debrief → Compose → In production →
 * Build this, around the same pass as the first service, drawn by the same 2D kitchen and the same 3D scene, with the mold rack, the comb
 * and the allergy card added (D-018: one session, drawn by every view). The shell owns the run; this file wires the full service's parts
 * into it, and its keys: `.` rings the bell, Space toggles Auto, `O` flips the stage's overlap switch (async scheduling, or the allergy
 * card's), `G` cycles the graph mode, `M` switches the runner, and `[` and `]` move between the level's stages.
 *
 * It is a lazy chunk of the game (Game.tsx loads it when a full-service level opens), so `/play/loop`'s first service and the front page
 * carry none of the step loop v1 or the cost cards.
 */

const ring = (run: FullRun): boolean => {
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
  else if (view.stage.levers.includes('maskOverlap')) run.dispatch({ t: 'lever', name: 'maskOverlap', value: !view.levers.maskOverlap })
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
 * The scene's box: taller than the first service's, because the full service's controls are a longer column beside it (the prediction, the
 * levers and the ladder), and the pass carries more; on a phone 55% of the screen's height, at least 300 px [estimated].
 */
const STAGE_BOX = 'h-[clamp(22rem,min(72svh,50vw),52rem)] max-[479px]:h-[max(18.75rem,55svh)]'

function FullStage({ run, preset }: { run: FullRun; preset: string }) {
  const { view } = run
  const full = useMemo(() => sceneOfFull(view), [view])
  return (
    <Stage
      id="loop"
      className={`${STAGE_BOX} border border-edge shadow-shelf`}
      view2d={<FullView2D run={run} />}
      scene={FullScene}
      sceneProps={{ view, preset, full }}
      announce={run.announce}
    />
  )
}

export interface FullServiceProps extends Pick<GameProps, 'placement' | 'rev' | 'onFinish'> {
  level: string
  /** The page's row of levels, above the shell's stage. */
  docket?: ReactNode
  onLevel: (id: string) => void
}

export default function FullService({ level, placement = 'page', rev, onFinish, docket, onLevel }: FullServiceProps) {
  const entry = levelOf(LOOP, level) ?? FULL_SERVICE[0]
  const toggleAuto: AutoToggleRef = useRef(null)
  const device = useDeviceTier()
  const draws3d = device.known && device.tier >= 1
  const [chosenView, setChosenView] = useState<GameView | null>(null)
  const view: GameView = chosenView ?? (draws3d && device.hints?.saveData !== true ? '3d' : '2d')
  const unavailable3d = device.known && !draws3d ? unavailableReason(device.reason) : undefined
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const at = FULL_SERVICE.findIndex((candidate) => candidate.id === entry.id)
  const after = FULL_SERVICE[at + 1] ?? null
  const onNext = useCallback(() => {
    if (after !== null) onLevel(after.id)
  }, [after, onLevel])

  return (
    <GameShell
      game={LOOP}
      session={fullSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={entry.practiceSeed}
      mode="practice"
      rev={rev}
      headingLevel={placement === 'embed' ? 3 : 2}
      onFinish={onFinish}
      docket={docket}
      onCommand={(command, run) => {
        switch (command) {
          case 'step':
            return ring(run)
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
            const next = nextPreset(LOOP_PRESETS, preset)
            setPreset(next)
            run.announce(`Camera: ${presetById(LOOP_PRESETS, next).label}.`)
            return true
          }
          default:
            return false
        }
      }}
      allow3d={draws3d}
      unavailable3d={unavailable3d}
      view={view}
      onViewChange={setChosenView}
      view2d={(run) => (
        <div className={`${STAGE_BOX} overflow-hidden rounded-plate border border-edge bg-surface-0`}>
          <FullView2D run={run} />
        </div>
      )}
      scene3d={(run) => <FullStage run={run} preset={preset} />}
      controls={(run) => (
        <>
          {view === '3d' ? <CameraButtons presets={LOOP_PRESETS} value={preset} onChange={setPreset} label="Camera on the pass" /> : null}
          <FullControls run={run} toggleAutoRef={toggleAuto} />
        </>
      )}
      mirror={(run) => <FullMirror run={run} />}
      beside={(run) => <FullTape view={run.view} />}
      stage
      debrief={(run, outcome) => (
        <FullDebrief run={run} outcome={outcome} next={after === null ? null : { id: after.id, title: after.title }} onNext={onNext} />
      )}
      compose={(run) => <Compose run={run} />}
      production={(run) => <Production level={run.view.level} />}
      build={(run) => <BuildThis level={run.view.level} />}
      card={<FullCard />}
    />
  )
}
