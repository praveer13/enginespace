import type { LoopView } from '@es/play/loop/types'
import type { DockViewProps } from '@/games/kit/RunContext'
import { useDeltas } from '@/games/kit/moments'
import { readoutItems } from './strip'
import { LoopReadout } from './Tape'
import { Lanes } from './View2D'

/*
 * The step loop's compact view, for a lesson's dock (REDESIGN §2.5, §2.6, §3.4): the same run as the instrument's (RunContext.tsx), drawn as
 * the same timing diagram at 464 x 240 (`DOCK` in packages/play/loop/lanes.ts), then the readout strip. The decisions stay in the
 * instrument: the dock's Step takes the move `loopStep` names (kit.tsx), and Undo and Reset are the run's own.
 */
export function DockView({ run }: DockViewProps<LoopView>) {
  const { view } = run
  const deltas = useDeltas(Object.fromEntries(readoutItems(view).map((item) => [item.id, item.value])))
  return (
    <div className="es-loopdockview" data-loop-dock="">
      <Lanes view={view} size="dock" />
      <LoopReadout view={view} deltas={deltas} />
    </div>
  )
}
