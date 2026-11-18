import type { FullView, Verdict } from '@es/play/loop/full/types'
import type { NumberTag } from '@/design/components/Readout'

/*
 * The tags of the full levels' figures (D-048: µs on the model's clock, with each cost card's tags). The small-model card is a world of the
 * model's own, so every figure on it is synthetic. On "70B on H100" the GPU's figures come from S5's fit and are derived, the CPU's come
 * from the host card's presets and are estimated, and a figure that adds the two, the clock or a bubble, is only as sure as the host card:
 * estimated.
 */
export type FigureKind = 'line' | 'host' | 'count'

export function tagOf(view: Pick<FullView, 'synthetic'>, kind: FigureKind): NumberTag {
  if (view.synthetic) return 'synthetic'
  return kind === 'host' ? 'estimated' : 'derived'
}

/** The cost card's name: the cards keep theirs, because they are claims. */
export const cardName = (synthetic: boolean): string => (synthetic ? 'Small model' : '70B on H100')

/** The strip's one stamp: the least sure of its figures' tags, for the eye. */
export const stampWord = (view: Pick<FullView, 'synthetic'>): NumberTag => (view.synthetic ? 'synthetic' : 'estimated')

/** The verdict in a sentence for the live region and the screen reader: it carries no digit, because the figures are beside it. */
export function verdictWords(verdict: Verdict): string {
  switch (verdict.kind) {
    case 'pass':
      return 'The run meets the bar.'
    case 'slow':
      return 'The run serves too few tokens for each ms to meet the bar.'
    case 'violation':
      return 'A step read a token before it was sampled: the run scores nothing.'
    case 'refused':
      return 'The engine would not start: the run scores nothing.'
  }
}
