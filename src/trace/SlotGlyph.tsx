import { SLOT_MARKS, type Slot } from '@/design/code'
import { Glyph } from '@/design/components/Glyph'

/** A category's drawn shape in its board colour, with its edge: the code's glyph (DESIGN.md, "The Only Code Rule"). */
export function SlotGlyph({ slot, size = '1em' }: { slot: Slot; size?: string }) {
  return <Glyph shape={SLOT_MARKS[slot].glyph} size={size} edge={`var(--es-cat-${slot}-edge)`} style={{ color: `var(--es-cat-${slot})` }} />
}
