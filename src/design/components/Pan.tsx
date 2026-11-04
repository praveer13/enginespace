import clsx from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { SLOT_MARKS, slotOf, type ColorRoleName, type MemoryState, type Slot } from '../tokens'
import { Glyph, Icon } from './Glyph'
import { TapeLabel } from './TapeLabel'

/*
 * A hotel pan in the reach-in: one KV page (GAMES.md §2.6, The Reach-In). It keeps its slot for life, so it never
 * moves: hover and press change its light, never its place. Its state is its form plus its tape, and its fill takes
 * the memory role in the categorical code with that slot's pattern (WCAG 1.4.1):
 *   free     a bare pan: no tape, no mise
 *   used     a full pan, held: its tape carries the station's glyph
 *   cached   the tape still on and the mise still there (hatched), held by nobody
 *   shared   shared mise: a prefix hit
 *   adapter  a recipe kit's pan, pinned
 *   evicted  dumped: struck through
 * At 390 px the reach-in is 16 pans to a row, about 20 px each (`size="sm"`): the pan, its fill and its glyph.
 */

export interface PanProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  state: MemoryState
  /** The pan's name for assistive tech: "pan 12". */
  name: string
  /** What is written on its tape: the block hash, the group. */
  tape?: ReactNode
  /** The station's code on the tape (its KV group), as a slot of the categorical code. */
  station?: Slot
  size?: 'sm' | 'md'
  /** Under the heat lamp: a candidate of the open ask. */
  lamp?: boolean
  disabled?: boolean
  /** Makes the pan a button. */
  onSelect?: () => void
  'data-force'?: 'hover' | 'focus' | 'active'
}

const STATE_WORDS: Record<MemoryState, string> = {
  free: 'free: a bare pan',
  used: 'used: held by a ticket',
  cached: 'cached: tape on, held by nobody',
  shared: 'shared mise',
  adapter: "a recipe kit's pan",
  evicted: 'evicted: dumped',
}

export function Pan({ state, name, tape, station, size = 'md', lamp = false, disabled = false, onSelect, className, ...rest }: PanProps) {
  const slot = slotOf(`memory-${state}` as ColorRoleName)
  const pattern = slot ? SLOT_MARKS[slot].pattern : 'solid'
  const stationSlot = station
  const mark =
    state === 'evicted' ? (
      <Icon name="strike" className="es-pan__mark" />
    ) : state === 'adapter' ? (
      <Icon name="pin" className="es-pan__mark" />
    ) : state === 'cached' ? (
      <Icon name="hash" className="es-pan__mark" />
    ) : null
  const body = (
    <>
      <span className="es-pan__rim" aria-hidden="true">
        <span className="es-pan__well" data-pattern={state === 'free' ? 'bare' : pattern} />
        {mark}
      </span>
      {size === 'md' && state !== 'free' && (tape || stationSlot) ? (
        <TapeLabel size="sm" slot={stationSlot} tilt="none" className="es-pan__tape">
          {tape ?? ''}
        </TapeLabel>
      ) : null}
      {size === 'sm' && stationSlot && state !== 'free' ? (
        <Glyph
          shape={SLOT_MARKS[stationSlot].glyph}
          className="es-pan__glyph"
          style={{ color: `var(--es-cat-${stationSlot})` }}
          edge={`var(--es-cat-${stationSlot}-edge)`}
        />
      ) : null}
      <span className="sr-only">
        {name}, {STATE_WORDS[state]}
      </span>
    </>
  )
  const shared = {
    className: clsx('es-pan', className),
    'data-state': state,
    'data-size': size,
    'data-lamp': lamp || undefined,
    title: `${name}: ${STATE_WORDS[state]}`,
    ...rest,
  }
  if (onSelect) {
    return (
      <button type="button" {...shared} disabled={disabled} onClick={onSelect}>
        {body}
      </button>
    )
  }
  return (
    <span {...shared} data-disabled={disabled || undefined}>
      {body}
    </span>
  )
}
