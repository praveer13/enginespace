import type { FullView, Verdict } from '@es/play/loop/full/types'
import type { NumberTag } from '@/design/components/Readout'

/*
 * The tags of the full service's figures (D-048: µs on the model's clock, with each cost card's tags). The small-model card is a world
 * of the model's own, so every figure on it is synthetic. On "70B on H100" the line's figures come from S5's fit and are derived, the
 * expo's come from the host card's presets and are estimated, and a figure that adds the two, the clock or a dark stretch, is only as
 * sure as the host card: estimated.
 */
export type FigureKind = 'line' | 'expo' | 'count'

export function tagOf(view: Pick<FullView, 'synthetic'>, kind: FigureKind): NumberTag {
  if (view.synthetic) return 'synthetic'
  return kind === 'expo' ? 'estimated' : 'derived'
}

/** The tape's stamp: what the µs are, once, for the eye. */
export const stampOf = (view: Pick<FullView, 'synthetic'>): string => (view.synthetic ? "the model's clock · synthetic" : "the model's clock · line derived, expo estimated")

/** The verdict in a sentence for the live region and the screen reader: it carries no digit, because the figures are Readouts beside it. */
export function verdictWords(verdict: Verdict): string {
  switch (verdict.kind) {
    case 'pass':
      return 'The night meets the bar.'
    case 'slow':
      return 'The night serves too few tokens for each ms to meet the bar.'
    case 'violation':
      return 'A fire read a token before it was sampled: the night scores nothing.'
    case 'refused':
      return 'The engine would not start: the night scores nothing.'
  }
}
