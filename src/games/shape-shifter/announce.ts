import { tupleText } from '@es/play/shape-shifter/labels'
import type { ShiftView } from '@es/play/shape-shifter/view'
import { copiesWord, elementsWord, plural } from './words'

/*
 * The line the live region says for a change of the view (A§6.9: one sentence per turn), in the engine's words. It is a summary for the
 * ear: State as a table carries every figure the drawing shows. Empty when nothing a listener needs to know changed. A named moment is
 * said by the frame's own status line, so this line says the counts and the next ask.
 */
export function changeLine(before: ShiftView, after: ShiftView): string {
  if (before.level !== after.level) return ''
  const said: string[] = []
  if (before.predict.guess === null && after.predict.guess !== null && before.task.at === after.task.at) said.push('Guess committed.')
  const was = before.layout
  const now = after.layout
  if (was !== null && now !== null && before.task.at === after.task.at) {
    const moved = now.readouts.moved - was.readouts.moved
    if (now.readouts.operations > was.readouts.operations) {
      said.push(
        moved > 0
          ? `A copy: ${elementsWord(moved)} moved into a new buffer. Strides ${tupleText(now.table.map((row) => row.stride))}.`
          : `A view: the buffer did not move. Shape ${tupleText(now.table.map((row) => row.size))}, strides ${tupleText(now.table.map((row) => row.stride))}.`,
      )
    } else if (now.jump !== null || now.status !== was.status) said.push('That view was refused: the strides cannot walk the new shape.')
    if (now.status === 'reached' && was.status !== 'reached') said.push(`Target reached with ${copiesWord(now.readouts.copies)}.`)
    if (now.status === 'failed' && was.status !== 'failed') said.push('This target has failed.')
  }
  if (before.task.at !== after.task.at && !after.done) said.push(`Target ${after.task.at + 1} of ${after.task.of}.`)
  const g0 = before.grid
  const g1 = after.grid
  if (g0 !== null && g1 !== null && before.task.at === after.task.at) {
    const changed = g0.block.some((b, d) => b !== g1.block[d]) || g0.grid.some((g, d) => g !== g1.grid[d])
    if (changed) said.push(`BLOCK ${tupleText(g1.block)}, grid ${tupleText(g1.grid)}: ${plural(g1.programCount, 'program', 'programs')}.`)
    if (g1.refusal !== null && g0.refusal === null) said.push('Nothing launched.')
  }
  if (g0 !== null && g1 !== null && (before.task.at !== after.task.at || after.done) && g0.launch === null) said.push('Launched.')
  if (after.done && !before.done) said.push('The run is over.')
  return said.join(' ')
}
