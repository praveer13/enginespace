import type { PoolView, TicketView } from '@es/play/pool/types'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const no = (tickets: readonly TicketView[], ids: readonly number[]): string => ids.map((id) => `No. ${tickets[id].no}`).join(', ')

/**
 * The line the live region says for a change of the view (A§6.9: one sentence per turn). It is a summary for the ear: the mirror carries
 * every number the drawing shows. Empty when nothing a listener needs to know changed.
 */
export function changeLine(before: PoolView, after: PoolView): string {
  if (before.level !== after.level) return ''
  const said: string[] = []
  if (before.predict.committed === null && after.predict.committed !== null) said.push('Prediction committed.')
  const hung = after.running.filter((id) => !before.running.includes(id) && after.tickets[id].status === 'running')
  if (hung.length > 0) {
    const served = hung.map((id) => after.tickets[id])
    said.push(`Hung ${no(after.tickets, hung)}${served.length === 1 ? `: ${plural(served[0].hit, 'token', 'tokens')} shared, ${plural(served[0].tokens - served[0].hit, 'token', 'tokens')} prepped again` : ''}.`)
  }
  const dumped = after.counts.evictions - before.counts.evictions
  if (before.ask?.kind === 'evict' && after.ask?.kind !== 'evict' && dumped > 0) said.push(`${plural(dumped, 'pan', 'pans')} left the cache.`)
  const finished = after.tickets.filter((ticket, id) => ticket.status === 'done' && before.tickets[id].status !== 'done')
  if (finished.length > 0) said.push(`Served ${no(after.tickets, finished.map((ticket) => ticket.id))}.`)
  if (after.counts.preemptions > before.counts.preemptions) said.push('A ticket was pulled from the line.')
  if (after.step > before.step) said.push(`Step ${after.step}.`)
  const open = after.ask
  if (open !== null && (before.ask === null || before.ask.kind !== open.kind || before.step !== after.step || before.tickets.length !== after.tickets.length)) {
    switch (open.kind) {
      case 'admit':
        said.push(`${plural(open.candidates.length, 'ticket', 'tickets')} can hang.`)
        break
      case 'evict':
        said.push(`Dump ${plural(open.need, 'pan', 'pans')}.`)
        break
      case 'preempt':
        said.push('The line cannot grow: pull a ticket.')
        break
      case 'prefetch':
        said.push(`${plural(open.candidates.length, 'kit', 'kits')} could come in.`)
        break
    }
  }
  if (after.done && !before.done) said.push(after.incomplete ? 'The night is over with tickets unserved.' : 'The night is over.')
  return said.join(' ')
}
