/*
 * The categorical code's names and marks: the HACCP cutting-board slots, the glyph and pattern each carries (WCAG
 * 1.4.1), and the states the lane, memory and probability roles name. A small module of its own, so a component that
 * only needs a slot's glyph does not load every token role (tokens.ts re-exports it all).
 */

/** The HACCP cutting-board colours: the categorical code, and the only one (GAMES.md §2.6, rule 6). */
export const SLOTS = ['red', 'blue', 'yellow', 'green', 'white', 'brown'] as const
export type Slot = (typeof SLOTS)[number]

/** Every category carries a glyph and a fill pattern as well as its colour (WCAG 1.4.1). */
export const SLOT_MARKS: Record<Slot, { glyph: GlyphShape; pattern: FillPattern; mark: 'fill' | 'edge' }> = {
  red: { glyph: 'triangle', pattern: 'solid', mark: 'fill' },
  blue: { glyph: 'circle', pattern: 'solid', mark: 'fill' },
  yellow: { glyph: 'diamond', pattern: 'hatch', mark: 'edge' },
  green: { glyph: 'square', pattern: 'solid', mark: 'fill' },
  white: { glyph: 'ring', pattern: 'hollow', mark: 'edge' },
  brown: { glyph: 'hexagon', pattern: 'dots', mark: 'fill' },
}
export type GlyphShape = 'triangle' | 'circle' | 'diamond' | 'square' | 'ring' | 'hexagon'

/** The states each family of roles names: `lane-<x>`, `memory-<x>`, `probability-<x>`. */
export const LANES = ['cpu', 'gpu', 'sync', 'copy', 'idle'] as const
export const MEMORY_STATES = ['free', 'used', 'cached', 'shared', 'adapter', 'evicted'] as const
export const PROBABILITIES = ['target', 'draft', 'overlap', 'residual', 'observed'] as const
export type Lane = (typeof LANES)[number]
export type MemoryState = (typeof MEMORY_STATES)[number]
export type Probability = (typeof PROBABILITIES)[number]
export type FillPattern = 'solid' | 'hatch' | 'hollow' | 'dots'
