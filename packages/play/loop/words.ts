/**
 * The words of a demo level's drawing, in the engine's terms: its frame with its accessible name, its masking tapes and the numbers on its
 * tickets reworded (`copy.ts`). The layout draws the same marks in the same places and keeps its own strings; the page, the poster and the
 * 2D view print these.
 */
import { tagWords, tapeWords } from './copy'
import { stationsOf, type Frame } from './layout'
import type { LoopView } from './types'

export function engineFrame(frame: Frame, view: LoopView): Frame {
  const filled = view.rail.filter((slot) => slot.req !== null).length
  const live = stationsOf(view).filter(Boolean).length
  const label = `${view.title}. Slots filled: ${filled} of ${view.slots}. Waiting: ${view.waiting.length}. Steps: ${view.step}, slots live: ${live}. Clock: ${view.clockUs} ticks, synthetic.`
  return {
    ...frame,
    label,
    tapes: frame.tapes.map((tape) => ({ ...tape, text: tapeWords(tape.text) })),
    tags: frame.tags.map((tag) => ({ ...tag, text: tagWords(tag.kind, tag.text) })),
  }
}
