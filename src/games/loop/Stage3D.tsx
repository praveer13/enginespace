import { useCallback, useEffect, type ComponentType, type MutableRefObject, type ReactNode } from 'react'
import { nextPreset, presetById } from '@/scene/camera-rig'
import { CameraButtons } from '@/scene/CameraButtons'
import { Stage } from '@/scene/Stage'
import type { Scene3DProps } from './Scene3D'
import { DEFAULT_PRESET, LOOP_PRESETS } from './scene-presets'
import type { LoopRunCore } from './types'

/*
 * The step loop's 3D view and its cameras, a chunk of their own: the diagram is the default view (REDESIGN §2.9), so the Stage, the scene's
 * camera presets and the kitchen's shots they are framed on load only when the learner switches to 3D. The scene itself is a chunk over
 * three's, which the Stage loads on a device whose tier draws 3D; the diagram is its first paint and its fallback (A§6.7).
 */

/**
 * The camera buttons' words (the scene's presets keep their own labels): the shots in the terms of what they show. Over the shoulder looks
 * along the time axis of the lanes, the side shot is the side, and from under the lamps the scene is seen from above.
 */
const CAMERA_WORDS: Readonly<Record<string, string>> = { shoulder: 'Along time', side: 'Side', lamps: 'Top' }
const CAMERA_PRESETS = LOOP_PRESETS.map((preset) => ({ ...preset, label: CAMERA_WORDS[preset.id] ?? preset.label }))

/** The preset a page holds, or the default where it holds none yet. */
const shown = (preset: string | null): string => preset ?? DEFAULT_PRESET

/** The scene's box: about 16:10 in the first screen, and on a phone 55% of the screen's height, at least 300 px [estimated]. */
const STAGE_BOX = 'h-[clamp(20rem,min(62svh,46vw),46rem)] max-[479px]:h-[max(18.75rem,55svh)]'

export interface LoopStage3DProps {
  run: LoopRunCore
  preset: string | null
  scene: ComponentType<Scene3DProps>
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
      const next = nextPreset(LOOP_PRESETS, at)
      onPreset(next)
      return CAMERA_WORDS[next] ?? presetById(LOOP_PRESETS, next).label
    }
    return () => {
      cycleRef.current = null
    }
  }, [cycleRef, at, onPreset])
  return <CameraButtons presets={CAMERA_PRESETS} value={at} onChange={onPreset} label="Camera" />
}
