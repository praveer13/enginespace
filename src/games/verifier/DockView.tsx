import type { CSSProperties } from 'react'
import type { VerifierView } from '@es/play/verifier/types'
import type { DockViewProps } from '@/games/kit/RunContext'
import { ReadoutStrip } from './ReadoutStrip'
import { showMeter, showScaffold } from './rules'
import { axisOf } from './axis'
import { TokenColumn } from './View2D'

/*
 * The rejection sampler's compact view, for a lesson's dock (REDESIGN §2.5, §3.4): the run beside the prose, drawn flat and always in 2D. It
 * is the same run as the instrument's (RunContext.tsx), so it draws the same view: the bars of one draft position (the one the run is at),
 * and the readout strip. A graded run draws what the instrument draws, no more: the accepted part and the output stay hidden while it is on.
 * The decisions themselves stay in the instrument: the dock's Step takes the level's first harmless move (`verifierStep`, kit.tsx), and
 * Undo and Reset are the run's own.
 */

export function DockView({ run }: DockViewProps<VerifierView>) {
  const { view } = run
  const scaffold = showScaffold(run)
  const meter = showMeter(run)
  const row = view.rows[view.present?.from ?? 0] ?? view.rows[0]
  const gamma = view.gamma
  return (
    <div className="es-vf es-vf-mini" data-vf-dock="" style={{ '--es-mini': 1 } as CSSProperties}>
      {row === undefined ? (
        <p className="es-vf-mini__line">
          {gamma === null ? null : gamma.pick >= 1 ? `The draft proposes ${gamma.pick} tokens a round.` : 'No draft length chosen yet.'} The target accepts each draft token with probability α, if the walk gets that far.
        </p>
      ) : (
        <section className="es-vf__row" aria-label={row.label}>
          <h3 className="es-vf__label">
            <span className="es-vf__label-name">{row.label}</span>
            <span className="es-vf__count">draft q and target p, out of 64</span>
          </h3>
          <ol className="es-vf__tokens" aria-hidden="true">
            {view.dishes.map((_, token) => (
              <TokenColumn key={token} view={view} row={row} token={token} axis={axisOf(view)} scaffold={scaffold} meter={meter} taps={false} />
            ))}
          </ol>
        </section>
      )}
      <ReadoutStrip view={view} meter={meter} />
    </div>
  )
}
