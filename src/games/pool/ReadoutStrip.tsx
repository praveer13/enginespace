import { Stamp } from '@/design/components/Stamp'
import type { PoolView } from '@es/play/pool/types'

/*
 * KV page pool's readout strip (REDESIGN §2.6, §3.5): five numbers in the numeric face, with one stamp for the strip. Requests served,
 * prefix-hit tokens, the cost (recomputed tokens, plus the weighted steps spent waiting for an adapter where adapters are in play),
 * evictions and preemptions. Each changes at once when a decision lands.
 */

export function ReadoutStrip({ view }: { view: PoolView }) {
  const c = view.counts
  const served = view.tickets.filter((ticket) => ticket.status === 'done').length
  const items = [
    { id: 'served', label: 'served', value: <>{served} of {view.tickets.length}</> },
    { id: 'hit', label: 'prefix hits', value: c.hitTokens },
    view.kits.length > 0 ? { id: 'cost', label: 'cost', value: c.cost } : { id: 'recomputed', label: 'recomputed', value: c.recomputedTokens },
    { id: 'evictions', label: 'evictions', value: c.evictions },
    { id: 'preemptions', label: 'preemptions', value: c.preemptions },
  ]
  return (
    <div className="es-strip" data-pool-readout="">
      <div className="es-strip__head">
        <span>Readout</span>
        <Stamp word="synthetic" className="es-strip__stamp" />
      </div>
      <dl className="es-strip__list">
        {items.map((item) => (
          <div key={item.id} className="es-strip__item" data-readout-id={item.id}>
            <dt className="es-strip__label">{item.label}</dt>
            <dd className="es-strip__value font-numeric">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
