import type { CSSProperties, ReactNode } from 'react'
import { partOf } from '@es/play/verifier/copy'
import { fracText } from '@es/play/verifier/ratio'
import type { RowView, VerifierView } from '@es/play/verifier/types'
import { Legend } from '@/design/components/Legend'
import type { Slot } from '@/design/code'
import { PartPopover } from '@/games/kit/PartPopover'
import { axisOf } from './axis'
import { showMeter, showScaffold } from './rules'
import type { VerifierRun } from './types'

/*
 * The rejection sampler's diagram (REDESIGN §2.6, §2.9, §3.5): the engine's own picture of the accept rule, drawn flat. For each draft
 * position, six tokens (numbered 0 to 5), and for each token two bars out of 64: the draft model's q, then the target model's p. Where a
 * level lets the decomposition print, the bars are cut into what the rule makes of them: the accepted part, min(p, q), which both bars
 * share; the draft's excess, which the target rejects; and the residual (p - q)+, which the target gives beyond the draft and which a
 * rejected token is resampled from. A bar's outline is its model's colour, so a bar is q or p whatever it is cut into.
 *
 * Each round draws a draft token as a dot at a random height inside its q bar: below the accepted part it is accepted, above it rejected.
 * The output that the rounds drawn emitted is a ring on the target bar, and it settles onto p when the rule is exact. A state is a shape
 * and a pattern before it is a colour (WCAG 1.4.1): the draft is hatched, a dot is solid or hollow, the output is a ring, and the legend
 * pairs each colour with its glyph.
 *
 * The drawing holds no fact the table does not: it is hidden from assistive technology, and State as a table lists every figure. Touch a
 * part, get its source: the names in the legend are popovers of the parts table (packages/play/verifier/copy.ts).
 */

/** A name that is a part of the diagram: its popover reads the same row as the parts list. */
export function PartName({ id, children }: { id: string; children?: ReactNode }) {
  const part = partOf(id)
  if (part === undefined) return <>{children}</>
  return <PartPopover part={part} trigger={children} />
}

/** The slot each label of the diagram takes (tokens.ts: `probability-<x>`). */
const SLOT_OF = { draft: 'yellow', target: 'blue', accepted: 'green', residual: 'red', output: 'white' } as const satisfies Record<string, Slot>

interface BarProps {
  /** The model's bar: q or p. */
  kind: 'draft' | 'target'
  value: number
  /** The accepted part, when the level prints it; the rest of the bar is then the draft's excess or the residual. */
  agreed: number | null
  axis: number
  token: number
  marks?: ReactNode
  /** What went out, as a height in sixty-fourths: a ring on the bar. */
  out?: number | null
}

const pct = (part: number, whole: number): string => `${whole === 0 ? 0 : (100 * part) / whole}%`

function Bar({ kind, value, agreed, axis, token, marks, out }: BarProps) {
  const rest = agreed === null ? 0 : value - agreed
  return (
    <span className="es-vf__bar" data-kind={kind} style={{ '--es-h': pct(value, axis) } as CSSProperties}>
      <span className="es-vf__value font-numeric">{value}</span>
      <span className="es-vf__fill">
        {agreed === null ? <span className="es-vf__seg" data-part={kind === 'draft' ? 'draft' : 'target'} style={{ height: '100%' }} /> : null}
        {agreed !== null && agreed > 0 ? <span className="es-vf__seg" data-part="accepted" style={{ height: pct(agreed, value) }} /> : null}
        {agreed !== null && rest > 0 ? <span className="es-vf__seg" data-part={kind === 'draft' ? 'draft' : 'residual'} style={{ height: pct(rest, value) }} /> : null}
      </span>
      {marks}
      {out === null || out === undefined ? null : <span className="es-vf__out" data-vf-out={token === 0 ? '' : undefined} style={{ bottom: pct(out, axis) }} />}
    </span>
  )
}

/** The draft tokens a round set down: solid where it landed in the accepted part, hollow where above it. */
function Dots({ row, token, axis }: { row: RowView; token: number; axis: number }) {
  const mine = row.markers.filter((marker) => marker.token === token)
  return (
    <>
      {mine.map((marker) => (
        <span key={marker.round} className="es-vf__dot" data-kept={marker.kept ? '' : undefined} style={{ bottom: pct(marker.height, axis) }} />
      ))}
    </>
  )
}

interface DrawProps {
  view: VerifierView
  axis: number
  scaffold: boolean
  meter: boolean
  taps: boolean
}

export function TokenColumn({ view, row, token, axis, scaffold, meter, taps }: DrawProps & { row: RowView; token: number }) {
  const split = scaffold && row.agreed !== null
  const agreed = split ? (row.agreed?.[token] ?? null) : null
  const out = meter && row.out !== null ? row.out[token] : null
  return (
    <li
      className="es-vf__token"
      data-vf-token={token}
      data-tap={taps || undefined}
      onClick={taps ? () => document.querySelector<HTMLInputElement>(`[data-vf-dish="${token}"]`)?.focus() : undefined}
    >
      <span className="es-vf__pair">
        {row.q === null ? null : <Bar kind="draft" value={row.q[token]} agreed={agreed} axis={axis} token={token} marks={<Dots row={row} token={token} axis={axis} />} />}
        <Bar kind="target" value={row.p[token]} agreed={agreed} axis={axis} token={token} out={out} />
      </span>
      <span className="es-vf__name">{view.dishes[token]}</span>
    </li>
  )
}

function Row({ row, ...draw }: DrawProps & { row: RowView }) {
  const { view } = draw
  const shown = draw.scaffold && row.agreed !== null && row.alpha !== null
  const total = shown && row.agreed !== null ? row.agreed.reduce((a, b) => a + b, 0) : null
  return (
    <section className="es-vf__row" role="group" aria-label={row.label} data-vf-row={row.index} data-kind={row.kind}>
      <h3 className="es-vf__label">
        <span className="es-vf__label-name">{row.label}</span>
        <span className="es-vf__count" data-vf-alpha={row.index === 0 ? '' : undefined}>
          {row.kind === 'bonus' ? (
            'the target alone, p'
          ) : shown && row.alpha !== null ? (
            <>
              α = <span className="font-numeric">{total}</span> of 64 = <span className="font-numeric">{fracText(row.alpha)}</span>
            </>
          ) : (
            'α, the accepted share: to find'
          )}
        </span>
      </h3>
      <ol className="es-vf__tokens" aria-hidden="true">
        {view.dishes.map((_, token) => (
          <TokenColumn key={token} row={row} token={token} {...draw} />
        ))}
      </ol>
    </section>
  )
}

/** The draft-length level: one column for each position, the share the target accepts, and how far the walk reaches. */
function GammaBars({ run }: { run: VerifierRun }) {
  const gamma = run.view.gamma
  if (gamma === null) return null
  const alphas = gamma.alphas.slice(0, gamma.max)
  // How far the walk reaches at each position: the product of the acceptances up to it.
  const reaches = alphas.map((_, at) => alphas.slice(0, at + 1).reduce((product, alpha) => (product * alpha) / 1000, 1))
  return (
    <section className="es-vf__row" role="group" aria-label="Draft positions" data-vf-gamma="" data-vf-row="0">
      <h3 className="es-vf__label">
        <span className="es-vf__label-name">Draft positions 1 to {gamma.max}</span>
        <span className="es-vf__count">{gamma.pick >= 1 ? `drafting ${gamma.pick}` : 'no draft length chosen'}</span>
      </h3>
      <ol className="es-vf__tokens" aria-hidden="true" style={{ '--es-cols': gamma.max } as CSSProperties}>
        {alphas.map((alpha, at) => {
          const drafted = gamma.pick >= 1 && at < gamma.pick
          return (
            <li key={at} className="es-vf__token" data-drafted={drafted || undefined} data-vf-token={at}>
              <span className="es-vf__pair">
                <span className="es-vf__bar" data-kind="draft" style={{ '--es-h': '100%' } as CSSProperties}>
                  <span className="es-vf__fill">
                    <span className="es-vf__seg" data-part="accepted" style={{ height: `${alpha / 10}%` }} />
                    <span className="es-vf__seg" data-part="draft" style={{ height: `${100 - alpha / 10}%` }} />
                  </span>
                  <span className="es-vf__out" style={{ bottom: `${100 * reaches[at]}%` }} />
                </span>
              </span>
              <span className="es-vf__name">{at + 1}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * The diagram, or one part of it: `drawing` alone fills a box (the 3D Stage's first paint and fallback), and `notes` are the legend that
 * stands under the 3D scene as it stands under the drawing.
 */
export function View2D({ run, part = 'whole' }: { run: VerifierRun; part?: 'whole' | 'drawing' | 'notes' }) {
  const { view } = run
  if (part === 'notes') return <VerifierLegend run={run} scene />
  // A tap on a token's column focuses that token's weight, while there is a weight to set: pointer and keyboard meet in the field.
  const draw: DrawProps = {
    view,
    axis: view.rows.length === 0 ? 8 : axisOf(view),
    scaffold: showScaffold(run),
    meter: showMeter(run),
    taps: view.ask?.kind === 'recipe' && part === 'whole',
  }
  return (
    <div className="es-vf" data-verifier-view="" data-part={part} data-rows={view.rows.length} style={{ '--es-rows': Math.max(1, view.rows.length) } as CSSProperties}>
      {view.level === 'gamma' ? <GammaBars run={run} /> : view.rows.map((row) => <Row key={row.index} row={row} {...draw} />)}
    </div>
  )
}

/**
 * The legend under the diagram: the four labels with their colour and glyph, the output where it is drawn, and what a dot is. Under the 3D
 * scene it also says what the scene stands in rows, since the scene prints none of it.
 */
export function VerifierLegend({ run, scene = false }: { run: VerifierRun; scene?: boolean }) {
  const { view } = run
  const decomposed = view.rows.length > 0 && showScaffold(run) && view.rows.some((row) => row.agreed !== null)
  const outs = showMeter(run) && view.rows.some((row) => row.out !== null)
  const dots = view.rows.some((row) => row.markers.length > 0)
  if (view.level === 'gamma') {
    return (
      <div className="es-vf__legend" data-vf-legend="">
        <Legend
          label="Legend: the draft length"
          entries={[
            { slot: SLOT_OF.draft, word: <PartName id="draft">draft token, rejected</PartName> },
            { slot: SLOT_OF.accepted, word: <PartName id="alpha">accepted by the target, α</PartName> },
            { slot: SLOT_OF.output, word: 'how far the walk reaches' },
          ]}
        />
        <p className="es-vf__note">At each position the draft model proposes a token, and the target model accepts it with probability α if the walk gets that far.</p>
      </div>
    )
  }
  const entries = [
    { slot: SLOT_OF.draft, word: <PartName id="draft">draft q</PartName> },
    { slot: SLOT_OF.target, word: <PartName id="target">target p</PartName> },
    ...(decomposed
      ? [
          { slot: SLOT_OF.accepted, word: <PartName id="accepted">accepted min(p, q)</PartName> },
          { slot: SLOT_OF.residual, word: <PartName id="residual">residual (p − q)⁺</PartName> },
        ]
      : []),
    ...(outs ? [{ slot: SLOT_OF.output, word: <PartName id="output">output of the sampler</PartName> }] : []),
  ]
  return (
    <div className="es-vf__legend" data-vf-legend="">
      <Legend entries={entries} label="Legend: what the bars are" />
      <p className="es-vf__note">
        <span data-vf-tokens="">Each token</span> has two bars out of 64: the draft&apos;s q, then the target&apos;s p{decomposed ? ', cut into what the rule makes of them' : ''}.
        {dots ? (
          <>
            {' '}
            A drawn round is a dot on a q bar: <span className="es-vf__dotkey" data-kept="" aria-hidden="true" /> accepted below the accepted part,{' '}
            <span className="es-vf__dotkey" aria-hidden="true" /> rejected above it.
          </>
        ) : null}
        {scene ? (view.rows.length > 1 ? ' The 3D view stands the same tokens in rows, one row for each draft position, the first in front.' : ' The 3D view stands the same bars up, at their heights.') : ''}
      </p>
    </div>
  )
}
