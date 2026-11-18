import type { LoopView } from '@es/play/loop/types'

/*
 * The readout strip's numbers on the demo levels (REDESIGN §3.1: step · tokens out · GPU busy · GPU idle), by id: what the strip prints and
 * what the frame's delta compares from one view to the next. A module of its own, apart from readout.ts, which the front page reads.
 */

/** The strip's numbers, by id: what the frame's delta compares from one view to the next. */
export function readoutItems(view: LoopView): { id: string; label: string; value: number; unit: string | null }[] {
  const c = view.counters
  const items = [
    { id: 'step', label: 'step', value: view.step, unit: null },
    { id: 'tokens', label: 'tokens out', value: c.usefulTokens, unit: null },
    { id: 'busy', label: 'GPU busy', value: c.gpuBusyUs, unit: 'ticks' },
    { id: 'idle', label: 'GPU idle', value: c.bubbleUs, unit: 'ticks' },
  ]
  if (view.overlapAvailable) items.push({ id: 'ghost', label: 'ghost tokens', value: c.ghostTokens, unit: null })
  if (view.par !== null) items.push({ id: 'clock', label: 'clock · reference', value: c.clockUs, unit: null })
  return items
}
