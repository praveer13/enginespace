import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import type { Scene3DProps } from './Scene3D'
import { sceneModelOf } from './scene-presets'
import { DEFAULT_STOP, floorsOf, nextStop, stopsOf, type CameraStop } from './scene-stops'
import type { FloorRun } from './types'

/*
 * Request path's 3D view, as it was before the frame (W1-T18), left as it is until R-T43 removes it: a Stage that paints the swimlane first
 * and keeps it as its fallback (A§6.7), the scene behind it, and the camera's stops over it. The swimlane is the default and only planned
 * view (REDESIGN §2.9), so this module, and the scene's layout and presets with it, load only when the learner switches to 3D: the route
 * that opens on the swimlane carries none of it.
 *
 * `C` asks for the next stop: the page counts the presses (`cycle`) and this module, which knows the stops, takes each one.
 */
// On the game's page at desk width the frame sets the diagram's height, and the Stage fills it (floor.css); elsewhere it keeps its own [estimated].
const STAGE_BOX = 'es-floor-stage h-[clamp(20rem,min(70svh,52vw),48rem)] max-[479px]:h-[max(20rem,58svh)]'

export interface FloorStageProps {
  run: FloorRun
  /** How many times `C` has been pressed: each press moves the camera to its next stop. */
  cycle: number
  /** The swimlane, which the Stage paints first and keeps as its fallback. It comes from the page, so this chunk imports none of it. */
  diagram: ReactNode
  /** The scene, as the game's page wraps its lazy chunk. */
  scene: ComponentType<Scene3DProps>
}

export default function FloorStage({ run, cycle, diagram, scene }: FloorStageProps) {
  const [stop, setStop] = useState<CameraStop>(DEFAULT_STOP)
  const stops = useMemo(() => stopsOf(floorsOf(run.view)), [run.view])
  // The scene's model is laid out here, from the view, and kept while the plan stays the same (scene-presets.ts).
  const [model, setModel] = useState(() => sceneModelOf(run.view))
  const [seen, setSeen] = useState(run.view)
  if (seen !== run.view) {
    setSeen(run.view)
    setModel(sceneModelOf(run.view, model))
  }
  // `C` moves to the next stop, and a run sent from the cutaway takes the follow, close on the request, so its way and where it stops are
  // seen. (Adjusting state to a prop that changed, during the render.)
  const runs = run.view.runs
  const [seenAt, setSeenAt] = useState({ cycle, runs })
  if (seenAt.cycle !== cycle || seenAt.runs !== runs) {
    setSeenAt({ cycle, runs })
    if (seenAt.cycle !== cycle) setStop(nextStop(stops, stop))
    else if (runs > seenAt.runs && stop === 'cutaway') setStop('follow')
  }
  // The stop `C` moved to is said aloud.
  const label = stops.find((candidate) => candidate.id === stop)?.label ?? 'Cutaway'
  const said = useRef(cycle)
  const { announce } = run
  useEffect(() => {
    if (said.current === cycle) return
    said.current = cycle
    announce(`Camera: ${label}.`)
  }, [cycle, label, announce])
  return (
    <div className="flex h-full flex-col gap-2">
      <CameraButtons presets={stops} value={stops.some((candidate) => candidate.id === stop) ? stop : 'cutaway'} onChange={(id) => setStop(id as CameraStop)} label="Camera" />
      <Stage
        id="engine-floor"
        className={`${STAGE_BOX} border border-edge`}
        view2d={<div className="h-full">{diagram}</div>}
        scene={scene}
        sceneProps={{ view: run.view, model, stop }}
        announce={run.announce}
      />
    </div>
  )
}
