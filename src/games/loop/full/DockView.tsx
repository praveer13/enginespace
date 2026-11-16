import type { FullView } from '@es/play/loop/full/types'
import type { DockViewProps } from '@/games/kit/RunContext'
import { FullLanes } from './FullLanes'
import { FullReadout } from './FullTape'

/*
 * The full levels' compact view, for a lesson's dock (REDESIGN §2.5, §2.6, §3.4): the same run as the instrument's (RunContext.tsx), drawn as
 * the same timing diagram at 464 px (`FULL_DOCK` in packages/play/loop/full/lanes.ts), then the readout strip. The decisions stay in the
 * instrument: the dock's Step takes the move `fullStep` names (kit.tsx), and Undo and Reset are the run's own.
 */
export function FullDockView({ run }: DockViewProps<FullView>) {
  return (
    <div className="es-loopdockview" data-loop-dock="" data-full-dock="">
      <FullLanes view={run.view} size="dock" />
      <FullReadout view={run.view} />
    </div>
  )
}
