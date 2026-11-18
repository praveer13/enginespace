import type { FloorView } from '@es/play/engine-floor/types'
import type { DockViewProps } from '@/games/kit/RunContext'
import { ReadoutStrip } from './Controls'
import { Swimlane } from './View2D'

/*
 * Request path's compact view, for a lesson's dock (REDESIGN §2.5, §3.4): the same run as the instrument's (RunContext.tsx), drawn as the
 * same swimlane, small and with no names beside the nodes, then the readout strip. Laying stays in the instrument: the dock's Step runs the
 * path as laid (`floorStep`, kit.tsx), and Undo and Reset are the run's own.
 */
export function DockView({ run }: DockViewProps<FloorView>) {
  return (
    <div className="es-floordock" data-floor-dock="">
      <Swimlane view={run.view} size="dock" />
      <ReadoutStrip view={run.view} mode={run.mode} />
    </div>
  )
}
