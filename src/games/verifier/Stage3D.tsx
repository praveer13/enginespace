import type { ComponentType, ReactNode } from 'react'
import { Stage } from '@/scene/Stage'
import type { Scene3DProps } from './Scene3D'
import type { Shot } from './scene-shots'
import type { VerifierRun } from './types'

/*
 * The rejection sampler's 3D view, the skylines in a Stage that paints the diagram first and keeps it as its fallback (A§6.7),
 * with the scene behind it. The diagram is the default view (REDESIGN §2.9), so this module, and the Stage and the scene's tokens with it,
 * load only when the learner switches to 3D: the route that opens on the diagram carries none of it.
 *
 * The box is about 16:10 in a lesson's column; on the game's page it is the frame's view (verifier.css), so the skylines, the control and
 * the readout share the first screen. A phone never mounts it: the frame withholds the 3D view there.
 */
const STAGE_BOX = 'es-vf-stage'

export interface VerifierStageProps {
  run: VerifierRun
  preset: string
  /** The camera's shots, which the page holds so that its buttons stand before this chunk loads. */
  shots: readonly Shot[]
  /** What the page's rules let the scene draw (rules.ts): the decomposition, and the output. */
  scaffold: boolean
  outcome: boolean
  /** The diagram, which the Stage paints first and keeps as its fallback. It comes from the page, so this chunk imports none of it. */
  diagram: ReactNode
  /** The scene, as the game's page wraps its lazy chunk. */
  scene: ComponentType<Scene3DProps>
}

export default function VerifierStage({ run, preset, shots, scaffold, outcome, diagram, scene }: VerifierStageProps) {
  return (
    <Stage
      id="verifier"
      className={`${STAGE_BOX} border border-edge shadow-shelf`}
      view2d={diagram}
      scene={scene}
      sceneProps={{ view: run.view, shots, preset, scaffold, outcome }}
      announce={run.announce}
    />
  )
}
