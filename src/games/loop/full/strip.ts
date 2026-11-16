import type { FullView } from '@es/play/loop/full/types'
import type { FigureKind } from './tags'

/*
 * The readout strip's numbers on the full levels (REDESIGN §3.7): the stage's own metric first, then median TPOT, GPU busy and the bubble per
 * step, one more that the stage's levers are about: padding waste where it has graphs, ghost tokens where it has async scheduling, the
 * mask's µs where it has the grammar. A closed-book stage keeps all but the step to itself until its night is served.
 */

export interface FullStripItem {
  readonly id: string
  readonly label: string
  /** Null until it is known: median TPOT before the night is served. */
  readonly value: number | null
  readonly unit: 'µs' | 'tokens' | null
  readonly kind: FigureKind
}

/** Whether the live readout is held back: a closed-book stage until its night is served. */
export const hiddenReadout = (view: Pick<FullView, 'stage'>): boolean => view.stage.sealed && !view.stage.closed

export function fullStripItems(view: FullView): FullStripItem[] {
  const c = view.counters
  const stage = view.stage
  const step: FullStripItem = { id: 'step', label: 'step', value: view.step, unit: null, kind: 'count' }
  if (hiddenReadout(view)) return [step]
  const items: FullStripItem[] = [
    stage.metric === 'capture' ? { id: 'capture', label: 'capture cost', value: c.captureUs, unit: 'µs', kind: 'host' } : { id: 'clock', label: 'clock', value: c.clockUs, unit: 'µs', kind: 'host' },
  ]
  items.push({ id: 'tpot', label: 'median TPOT', value: c.tpotP50Us, unit: 'µs', kind: 'host' })
  items.push({ id: 'busy', label: 'GPU busy', value: c.gpuBusyUs, unit: 'µs', kind: 'line' })
  items.push({ id: 'bubble', label: 'bubble per step', value: view.step === 0 ? 0 : Math.round(c.bubbleUs / view.step), unit: 'µs', kind: 'host' })
  if (stage.levers.includes('capture') || stage.levers.includes('graphMode')) items.push({ id: 'padding', label: 'padding waste', value: c.paddedTokens, unit: 'tokens', kind: 'count' })
  else if (stage.levers.includes('maskOverlap')) items.push({ id: 'mask', label: 'mask', value: c.maskUs, unit: 'µs', kind: 'host' })
  else if (stage.levers.includes('async')) items.push({ id: 'ghost', label: 'ghost tokens', value: c.ghostTokens, unit: 'tokens', kind: 'count' })
  items.push(step)
  return items
}
