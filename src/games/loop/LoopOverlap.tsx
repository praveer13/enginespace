import { Toggle } from '@/design/components/Toggle'
import type { LoopControls } from './useLoopControls'

/** From the third level on: write the next call during this fire (overlap, async scheduling). Null where the level has no switch. */
export function LoopOverlap({ controls }: { controls: LoopControls }) {
  const { view, run } = controls
  if (!view.overlapAvailable) return null
  return (
    <Toggle
      label="Write the next call during this fire"
      hint="overlap (async scheduling)"
      checked={view.overlap}
      disabled={view.done}
      onCheckedChange={(on) => run.dispatch({ t: 'lever', name: 'async', value: on })}
    />
  )
}

export default LoopOverlap
