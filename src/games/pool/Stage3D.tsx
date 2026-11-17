import type { ComponentType, ReactNode } from 'react'
import { Stage } from '@/scene/Stage'
import type { Dump } from './dump'
import type { Scene3DProps } from './Scene3D'
import type { PoolPick, PoolRun } from './types'
import './pool3d.css'

/*
 * KV page pool's 3D view: a Stage that paints the diagram first and keeps it as its fallback (A§6.7), with the scene behind it. The diagram
 * is the default view (REDESIGN §2.9), so this module, and the Stage and the scene's tokens with it, load only when the learner switches
 * to 3D: the route that opens on the diagram carries none of it.
 *
 * A pick in the scene selects a page or a request (Select3D.tsx says what it shows and offers the same by hand).
 *
The diagram inside the box scrolls in it: a region that the keyboard can reach and scroll.
 */
// The box's height is pool3d.css's: it fills the frame's view at a desk and takes the phone's height there, so the diagram, the control and the readout share the screen (P5).

export interface PoolStageProps {
  run: PoolRun
  dump: Dump
  preset: string
  station: number
  pointed: readonly number[]
  pick: PoolPick | null
  onPick: (pick: PoolPick | null) => void
  /** The diagram, which the Stage paints first and keeps as its fallback. It comes from the page, so this chunk imports none of it. */
  diagram: ReactNode
  /** The scene, as the game's page wraps its lazy chunk. */
  scene: ComponentType<Scene3DProps>
}

/** A pick that picks the same again clears itself. */
const same = (a: PoolPick | null, b: PoolPick): boolean => a !== null && a.kind === b.kind && a.id === b.id

export default function PoolStage({ run, dump, preset, station, pointed, pick, onPick, diagram, scene }: PoolStageProps) {
  return (
    <Stage
        id="pool"
        className="es-pool-stage border border-edge shadow-shelf"
        view2d={
          <div role="region" aria-label="The page pool, drawn flat" tabIndex={0} className="h-full overflow-y-auto p-3">
            {diagram}
          </div>
        }
        scene={scene}
        sceneProps={{ view: run.view, preset, station, chosen: dump.pages, pointed, pick, onPick: (next: PoolPick) => onPick(same(pick, next) ? null : next) }}
        announce={run.announce}
      />
  )
}
