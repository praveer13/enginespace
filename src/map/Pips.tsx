import clsx from 'clsx'
import { Icon } from '@/design/components/Glyph'
import type { KcState } from '@/progress/derive'

/*
 * A knowledge component's state, printed as the pip beside a count (W1-T06). Four forms told apart by shape, so that no state rests on
 * colour (WCAG 1.4.1): a ring is a KC the learner has not met, a ringed dot one they have practised, a solid dot one they have earned,
 * and a ticked dot one they have kept. The ink is the ribbon's black on paper, and the count in words always stands beside the pips, so
 * the pips are a drawing of it and are hidden from assistive technology.
 */

export function Pip({ state, className }: { state: KcState; className?: string }) {
  return (
    <span className={clsx('es-pip', className)} data-state={state} aria-hidden="true">
      {state === 'kept' ? <Icon name="check" className="es-pip__tick" /> : null}
    </span>
  )
}

export function Pips({ states, className }: { states: readonly KcState[]; className?: string }) {
  return (
    <span className={clsx('es-pips', className)} aria-hidden="true">
      {states.map((state, at) => (
        <Pip key={at} state={state} />
      ))}
    </span>
  )
}
