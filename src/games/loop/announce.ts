import { requestName } from '@es/play/loop/copy'
import type { LoopView } from '@es/play/loop/types'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/**
 * The line the live region says for a change of the view (A§6.9: one sentence per turn, at most one a second in auto-play). It is a
 * summary for the ear: the mirror carries every number the drawing shows. Empty when nothing a listener needs to know changed. The words
 * are the engine's: a request is admitted into a batch slot, a step runs, and a token for a request that had stopped is a ghost token.
 */
export function changeLine(before: LoopView, after: LoopView): string {
  if (before.level !== after.level) return ''
  const said: string[] = []
  if (after.step > before.step) {
    const step = after.fires[after.step - 1]
    const live = step.places.filter((place) => place.state !== 'empty').length
    const empty = step.places.filter((place) => place.state === 'empty').length
    said.push(`Step ${after.step} ran: ${plural(live, 'output token', 'output tokens')}${empty > 0 ? `, ${plural(empty, 'empty slot', 'empty slots')}` : ''}.`)
  } else {
    const admitted = before.waiting.filter((id) => !after.waiting.includes(id))
    for (const id of admitted) {
      const slot = after.rail.findIndex((candidate) => candidate.req === id)
      said.push(`Request ${requestName(id)} admitted${slot >= 0 ? ` into slot ${slot + 1}` : ''}.`)
    }
  }
  if (after.counters.ghostTokens > before.counters.ghostTokens) {
    const ghosts = after.counters.ghostTokens - before.counters.ghostTokens
    said.push(`${plural(ghosts, 'ghost token was', 'ghost tokens were')} computed for a request that had already finished.`)
  }
  if (!before.deciding && after.deciding && !after.done) said.push('A slot is free and a request waits.')
  if (before.overlap !== after.overlap) said.push(after.overlap ? 'Async scheduling on: the next step is planned while this one runs.' : 'Async scheduling off.')
  return said.join(' ')
}
