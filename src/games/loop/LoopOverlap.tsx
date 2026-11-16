import { Toggle } from '@/design/components/Toggle'
import type { LoopControls } from './useLoopControls'

/** From the third level on: the async scheduling switch, which plans the next step while this one runs. Null where the level has no switch. */
export function LoopOverlap({ controls }: { controls: LoopControls }) {
  const { view, run } = controls
  if (!view.overlapAvailable) return null
  return (
    <Toggle
      label="Async scheduling"
      hint="plan the next step while this one runs"
      checked={view.overlap}
      disabled={view.done}
      onCheckedChange={(on) => run.dispatch({ t: 'lever', name: 'async', value: on })}
    />
  )
}

export default LoopOverlap
