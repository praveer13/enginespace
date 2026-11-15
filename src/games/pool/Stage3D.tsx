import type { ComponentType, ReactNode } from 'react'
import { Stage } from '@/scene/Stage'
import type { Dump } from './dump'
import type { Scene3DProps } from './Scene3D'
import type { PoolRun } from './types'

/*
 * KV page pool's 3D view, as it was before the frame: a Stage that paints the diagram first and keeps it as its fallback (A§6.7), with the
 * scene behind it. The diagram is the default view (REDESIGN §2.9), so this module, and the Stage and the scene's tokens with it, load
 * only when the learner switches to 3D: the route that opens on the diagram carries none of it.
 *
 * The box is about 16:10 in the first screen, and on a phone 55% of the screen's height, at least 300 px [estimated]. The diagram inside it
 * scrolls in the box: a region that the keyboard can reach and scroll.
 */
const STAGE_BOX = 'h-[clamp(20rem,min(62svh,46vw),46rem)] max-[479px]:h-[max(18.75rem,55svh)]'

export interface PoolStageProps {
  run: PoolRun
  dump: Dump
  preset: string
  station: number
  /** The diagram, which the Stage paints first and keeps as its fallback. It comes from the page, so this chunk imports none of it. */
  diagram: ReactNode
  /** The scene, as the game's page wraps its lazy chunk. */
  scene: ComponentType<Scene3DProps>
}

export default function PoolStage({ run, dump, preset, station, diagram, scene }: PoolStageProps) {
  return (
    <Stage
      id="pool"
      className={`${STAGE_BOX} border border-edge shadow-shelf`}
      view2d={
        <div role="region" aria-label="The page pool, drawn flat" tabIndex={0} className="h-full overflow-y-auto p-3">
          {diagram}
        </div>
      }
      scene={scene}
      sceneProps={{ view: run.view, preset, station, chosen: dump.pages }}
      announce={run.announce}
    />
  )
}
