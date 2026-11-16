import { useCallback, useEffect, type ComponentType, type MutableRefObject, type ReactNode } from 'react'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import type { TrackSceneProps } from './TrackScene3D'
import { cameraLabel, DEFAULT_CAMERA, nextCamera, TRACK_CAMERAS } from './track-presets'
import type { LoopRunCore } from './types'
import './track3d.css'

/*
 * The step loop's 3D view and its cameras, a chunk of their own: the diagram is the default view (REDESIGN §2.9), so the Stage and the
 * cameras' buttons load only when the learner switches to 3D. The scene itself is the time track (TrackScene3D.tsx), a chunk over three's,
 * which the Stage loads on a device whose tier draws 3D; the diagram is its first paint and its fallback (A§6.7).
 */

/** The preset a page holds, or the default where it holds none yet. */
const shown = (preset: string | null): string => preset ?? DEFAULT_CAMERA

/** The scene's box: the frame's diagram view, whatever its room (track3d.css). */
const STAGE_BOX = 'es-track-stage'

export interface LoopStage3DProps {
  run: LoopRunCore
  preset: string | null
  scene: ComponentType<TrackSceneProps>
  /** The diagram, which the Stage paints first and keeps as its fallback. */
  diagram: ReactNode
}

/** The 3D view's box. A waiting request picked in the scene is admitted, as a tap on it in the dock admits it. */
export default function LoopStage3D({ run, preset, scene, diagram }: LoopStage3DProps) {
  const { dispatch, view } = run
  const onHang = useCallback(
    (req: number) => {
      if (view.canHang && view.waiting.includes(req)) dispatch({ t: 'admit', req })
    },
    [dispatch, view.canHang, view.waiting],
  )
  return <Stage id="loop" className={`${STAGE_BOX} border border-edge`} view2d={diagram} scene={scene} sceneProps={{ view, preset: shown(preset), onHang }} announce={run.announce} />
}

/** The camera's presets, a button each; and `C`, through `cycle`, steps to the next and says which. */
export function LoopCameras({ preset, onPreset, cycle: cycleRef }: { preset: string | null; onPreset: (preset: string) => void; cycle: MutableRefObject<(() => string) | null> }) {
  const at = shown(preset)
  useEffect(() => {
    cycleRef.current = () => {
      const next = nextCamera(at)
      onPreset(next)
      return cameraLabel(next)
    }
    return () => {
      cycleRef.current = null
    }
  }, [cycleRef, at, onPreset])
  return <CameraButtons presets={TRACK_CAMERAS} value={at} onChange={onPreset} label="Camera" />
}
