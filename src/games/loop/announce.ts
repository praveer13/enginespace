import { ticketNo } from '@es/play/loop/layout'
import type { LoopView } from '@es/play/loop/types'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/**
 * The line the live region says for a change of the view (A§6.9: one sentence per turn, at most one a second in auto-play). It is a
 * summary for the ear: the mirror carries every number the drawing shows. Empty when nothing a listener needs to know changed.
 */
export function changeLine(before: LoopView, after: LoopView): string {
  if (before.level !== after.level) return ''
  const said: string[] = []
  if (after.step > before.step) {
    const fire = after.fires[after.step - 1]
    const plates = fire.places.filter((place) => place.state !== 'empty').length
    const empty = fire.places.filter((place) => place.state === 'empty').length
    said.push(`Fire ${after.step} rung: ${plural(plates, 'plate', 'plates')}${empty > 0 ? `, ${plural(empty, 'empty place', 'empty places')}` : ''}.`)
  } else {
    const hung = before.waiting.filter((id) => !after.waiting.includes(id))
    for (const id of hung) {
      const clip = after.rail.findIndex((candidate) => candidate.req === id)
      said.push(`Ticket ${ticketNo(id)} hung${clip >= 0 ? ` on clip ${clip + 1}` : ''}.`)
    }
  }
  if (after.counters.ghostTokens > before.counters.ghostTokens) {
    const binned = after.counters.ghostTokens - before.counters.ghostTokens
    said.push(`${plural(binned, 'plate was', 'plates were')} binned: a course fired for a ticket that had already ended.`)
  }
  if (!before.deciding && after.deciding && !after.done) said.push('A clip is open and a ticket waits.')
  if (before.overlap !== after.overlap) said.push(after.overlap ? 'Overlap on: the next call is written during the fire.' : 'Overlap off.')
  return said.join(' ')
}
