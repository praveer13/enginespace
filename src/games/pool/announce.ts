import type { PoolView, TicketView } from '@es/play/pool/types'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const names = (tickets: readonly TicketView[], ids: readonly number[]): string => ids.map((id) => `R${tickets[id].id + 1}`).join(', ')

/**
 * The line the live region says for a change of the view (A§6.9: one sentence per turn), in the engine's words. It is a summary for the
 * ear: the table carries every number the diagram shows. Empty when nothing a listener needs to know changed. A new decision is said as
 * one: "New decision: the pool is full. Choose 2 cached pages to evict."
 */
export function changeLine(before: PoolView, after: PoolView): string {
  if (before.level !== after.level) return ''
  const said: string[] = []
  if (before.predict.committed === null && after.predict.committed !== null) said.push('Guess committed.')
  const admitted = after.running.filter((id) => !before.running.includes(id) && after.tickets[id].status === 'running')
  if (admitted.length > 0) {
    const one = admitted.length === 1 ? after.tickets[admitted[0]] : null
    said.push(`Admitted ${names(after.tickets, admitted)}${one === null ? '' : `: ${plural(one.hit, 'token', 'tokens')} from a prefix hit, ${plural(one.tokens - one.hit, 'token', 'tokens')} computed`}.`)
  }
  const evicted = after.counts.evictions - before.counts.evictions
  if (before.ask?.kind === 'evict' && after.ask?.kind !== 'evict' && evicted > 0) said.push(`Evicted ${plural(evicted, 'page', 'pages')}.`)
  const finished = after.tickets.filter((ticket, id) => ticket.status === 'done' && before.tickets[id].status !== 'done')
  if (finished.length > 0) said.push(`Finished ${names(after.tickets, finished.map((ticket) => ticket.id))}.`)
  if (after.counts.preemptions > before.counts.preemptions) said.push('A request was preempted.')
  if (after.step > before.step) said.push(`Step ${after.step}.`)
  const open = after.ask
  if (open !== null && (before.ask === null || before.ask.kind !== open.kind || before.step !== after.step || before.tickets.length !== after.tickets.length)) {
    switch (open.kind) {
      case 'admit':
        said.push(`${plural(open.candidates.length, 'request fits', 'requests fit')}: admit one.`)
        break
      case 'evict':
        said.push(`New decision: the pool is full. Choose ${plural(open.need, 'cached page', 'cached pages')} to evict.`)
        break
      case 'preempt':
        said.push('New decision: the batch cannot grow. Choose a request to preempt.')
        break
      case 'prefetch':
        said.push(`New decision: ${plural(open.candidates.length, 'adapter', 'adapters')} could be loaded.`)
        break
    }
  }
  if (after.done && !before.done) said.push(after.incomplete ? 'The run is over, with requests unserved.' : 'The run is over: every request is served.')
  return said.join(' ')
}
