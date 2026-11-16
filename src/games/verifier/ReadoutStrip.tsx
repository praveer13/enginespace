import type { CSSProperties, ReactNode } from 'react'
import { fracText } from '@es/play/verifier/ratio'
import type { VerifierView } from '@es/play/verifier/types'
import { DeltaChip } from '@/design/components/DeltaChip'
import { Stamp } from '@/design/components/Stamp'
import { formatReadout } from '@/design/format'
import { useDeltas } from '@/games/kit/moments'

/*
 * The rejection sampler's readout strip (REDESIGN §2.6, §3.5): up to five numbers in the numeric face, with one stamp for the strip. The
 * rounds drawn, how many draft tokens were accepted and rejected, the accepted share (which settles on the overlap, the acceptance rate), and
 * the level's own fifth: the tokens a round yields, the output's distance from p, the cards named, or the draft length's speedup. Each
 * count changes at once when rounds are drawn, and the change sits beside it for one second (the kit's delta): only a count that changed
 * gets one. A graded run prints no distance while it is on (rules.ts).
 */

interface Item {
  id: string
  label: string
  value: ReactNode
  count?: number
}

const dash = (
  <>
    <span aria-hidden="true">–</span>
    <span className="sr-only">none yet</span>
  </>
)

function itemsOf(view: VerifierView, meter: boolean): Item[] {
  const c = view.counters
  const share = c.kept + c.sentBack === 0 ? null : c.kept / (c.kept + c.sentBack)
  if (view.level === 'gamma' && view.gamma !== null) {
    const round = view.gamma.round
    return [
      { id: 'gamma', label: 'draft length γ', value: view.gamma.pick >= 1 ? view.gamma.pick : dash, count: Math.max(0, view.gamma.pick) },
      { id: 'tokens', label: 'tokens a round', value: round === null ? dash : formatReadout(round.tokens, 3) },
      { id: 'cost', label: 'a round costs', value: round === null ? dash : formatReadout(round.cost, 3) },
      { id: 'speedup', label: 'speedup', value: round === null ? dash : `${formatReadout(round.speedup, 3)}x` },
    ]
  }
  const items: Item[] = [
    { id: 'rounds', label: 'rounds drawn', value: formatReadout(c.rounds), count: c.rounds },
    { id: 'accepted', label: 'accepted', value: formatReadout(c.kept), count: c.kept },
    { id: 'rejected', label: 'rejected', value: formatReadout(c.sentBack), count: c.sentBack },
    { id: 'share', label: 'accepted share', value: share === null ? dash : formatReadout(share, 3) },
  ]
  if (view.cards !== null) items.push({ id: 'named', label: 'cards named', value: `${view.cards.filter((card) => card.label !== null).length} of ${view.cards.length}` })
  else if (meter && view.meter !== null) items.push({ id: 'distance', label: 'distance from p', value: view.meter.exact ? '0 (exact)' : fracText(view.meter.tv) })
  else items.push({ id: 'tokens', label: 'tokens a round', value: c.rounds === 0 ? dash : formatReadout(c.tokens / c.rounds, 3) })
  return items
}

export function ReadoutStrip({ view, meter }: { view: VerifierView; meter: boolean }) {
  const items = itemsOf(view, meter)
  const deltas = useDeltas(Object.fromEntries(items.filter((item) => item.count !== undefined).map((item) => [item.id, item.count ?? 0])))
  return (
    <div className="es-vf-strip" data-vf-readout="">
      <div className="es-vf-strip__head">
        <span>Readout</span>
        <Stamp word="synthetic" className="es-vf-strip__stamp" />
      </div>
      <dl className="es-vf-strip__list" style={{ '--es-items': items.length } as CSSProperties}>
        {items.map((item) => (
          <div key={item.id} className="es-vf-strip__item" data-readout-id={item.id}>
            <dt className="es-vf-strip__label">{item.label}</dt>
            <dd className="es-vf-strip__value font-numeric">
              {item.value}
              {deltas[item.id] === undefined ? null : <DeltaChip key={deltas[item.id].key} value={deltas[item.id].value} className="es-vf-strip__delta" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
