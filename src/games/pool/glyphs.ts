import { SLOT_MARKS, type GlyphShape, type MemoryState, type Slot } from '@/design/code'
import type { PanView, PoolView, StationView } from '@es/play/pool/types'

/*
 * The one colour code (REDESIGN §2.8): a page's state is its colour and its glyph, the memory roles of the design system, so the legend under
 * the diagram, the grid and the free queue all draw a state one way. A KV group is named by its number and its id, never by a colour.
 */

/** The categorical slot each memory state points at (tokens.ts: `memory-<state>`). */
export const STATE_SLOT: Readonly<Record<MemoryState, Slot>> = { free: 'white', used: 'blue', cached: 'yellow', shared: 'green', adapter: 'brown', evicted: 'red' }

/** The glyph a page in this state carries. */
export const stateGlyph = (state: MemoryState): GlyphShape => SLOT_MARKS[STATE_SLOT[state]].glyph

/** A page's state in words, as the legend and the table say it. */
export const STATE_WORDS: Readonly<Record<MemoryState, string>> = {
  free: 'free',
  used: 'in use',
  cached: 'cached',
  shared: 'a prefix hit waits on it',
  adapter: "an adapter's",
  evicted: 'chosen to evict',
}

/** What a KV group is, in words: full attention, a sliding window, or a recurrent state. */
export const KIND_WORDS: Readonly<Record<StationView['kind'], string>> = { full: 'full attention', sliding: 'sliding window', state: 'state' }

/** A group's number on the diagram: the first group is 1. */
export const groupNo = (group: StationView): number => group.index + 1

/** What a page says about itself, for the pointer: its number, state, group and label. */
export function pageTitle(page: PanView, view: PoolView, chosen = false): string {
  const group = page.station === null ? '' : `, KV group ${view.stations[page.station].id}`
  const label = page.tape === null ? '' : `, ${page.tape}`
  return `page ${page.id + 1}: ${STATE_WORDS[chosen ? 'evicted' : page.state]}${group}${label}`
}

/** What a guess counts, in the engine's word. */
export const unitWord = (unit: 'pages' | 'KV groups'): string => unit
