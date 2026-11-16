import { DISHES } from '@es/play/verifier/types'
import type { VerifierView } from '@es/play/verifier/types'
import { fracText } from '@es/play/verifier/ratio'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/**
 * The line the live region says for a change of the view (A§6.9: one sentence per turn). It is a summary for the ear: the table carries
 * every number the drawing shows. Empty when nothing a listener needs to know changed. `meter` is false in a graded run, which says
 * nothing of the exact distance while the run is on.
 */
export function changeLine(before: VerifierView, after: VerifierView, meter: boolean): string {
  if (before.level !== after.level) return ''
  const said: string[] = []
  if (after.counters.rounds > before.counters.rounds) {
    const drawn = after.counters.rounds - before.counters.rounds
    said.push(`Drew ${plural(drawn, 'round', 'rounds')}: ${after.counters.kept - before.counters.kept} accepted, ${after.counters.sentBack - before.counters.sentBack} rejected.`)
  }
  if (!before.committed && after.committed) said.push(after.level === 'overlap' ? `Committed: ${after.prediction ?? 0} of 64 accepted.` : 'Prediction committed.')
  if (before.judged === null && after.judged !== null) said.push(after.judged ? 'You said it is accepted.' : 'You said it is rejected.')
  const changed = after.weights.findIndex((w, x) => w !== before.weights[x])
  if (changed >= 0) {
    said.push(`${DISHES[changed]}: weight ${after.weights[changed]}.`)
    if (meter && after.meter !== null) said.push(after.meter.exact ? 'The output is p exactly.' : `Distance from p ${fracText(after.meter.tv)}.`)
  }
  if (before.gamma?.pick !== after.gamma?.pick && after.gamma !== null && after.gamma.pick >= 1) said.push(`Drafting ${plural(after.gamma.pick, 'token', 'tokens')} a round.`)
  const labelled = after.cards?.findIndex((card, i) => card.label !== before.cards?.[i]?.label) ?? -1
  if (labelled >= 0) said.push(`Card ${labelled + 1} named.`)
  const tasted = after.cards?.findIndex((card, i) => card.taste !== before.cards?.[i]?.taste && card.taste !== null) ?? -1
  if (tasted >= 0 && after.cards !== null) {
    const taste = after.cards[tasted].taste
    if (taste !== null) said.push(`Card ${tasted + 1} sampled: ${taste.rejected ? 'the chi-square rejects it' : 'the chi-square does not reject it'}.`)
  }
  const coined = after.cards?.findIndex((card, i) => card.coins !== before.cards?.[i]?.coins && card.coins !== null) ?? -1
  if (coined >= 0 && after.cards !== null) {
    const coins = after.cards[coined].coins
    if (coins !== null) said.push(`Card ${coined + 1}: ${coins.length === 0 ? 'every draw of the accept step is as it should be' : plural(coins.length, 'token accepts', 'tokens accept') + ' the wrong number of draws'}.`)
  }
  return said.join(' ')
}
