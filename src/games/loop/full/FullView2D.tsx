import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Legend } from '@/design/components/Legend'
import { Stamp } from '@/design/components/Stamp'
import { formatReadout } from '@/design/format'
import { CloseCards } from './CloseCards'
import { FullLanes, PartLabel } from './FullLanes'
import { cardName, tagOf, type FigureKind } from './tags'
import type { FullRun } from './types'
import { pricesOf, referenceOf } from './world'

/*
 * The full levels' 2D view (REDESIGN §3.7): a strip at the top with the cost card as one row, by its own name, with its forward and host
 * times and one stamp; under it the timing diagram (FullLanes.tsx) over the last steps of the night at a fixed scale, with "Fit run" to
 * lay the whole night out. Once a run is served, the reference run's forwards stand under the learner's lanes as hollow outlines, on the
 * same axis. A closed-book stage keeps the reference to itself until its run is served, and its four cards stand under the lanes.
 *
 * Every µs is a figure with its tag for a screen reader; the strip carries one stamp for the eye (P6).
 */

/** A figure in µs with its tag for a screen reader, and no tag in the way of the eye: the strip's stamp says where the numbers come from. */
export function Us({ value, tag }: { value: number; tag: ReturnType<typeof tagOf> }) {
  return (
    <span className="es-fl__us">
      <data value={String(value)}>{formatReadout(value)}</data>
      <span className="es-fl__unit"> µs</span>
      <span className="sr-only">, {tag}</span>
    </span>
  )
}

/** A price of the strip; on a phone, which has one line for the strip, the second price of each side stands in the cost card's popover and the state table. */
function Item({ label, children, more = false }: { label: ReactNode; children: ReactNode; more?: boolean }) {
  return (
    <div className="es-fl__item" data-more={more || undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function CardStrip({ run, fit, onFit, locked }: { run: FullRun; fit: boolean; onFit: () => void; locked: boolean }) {
  const { view } = run
  const prices = pricesOf(view.level, run.seed, view.at)
  const line: FigureKind = 'line'
  const hostKind: FigureKind = 'host'
  const rows = prices.decodeUs
  const small = rows[0]
  const big = rows[rows.length - 1]
  const host = view.levers.runner === 'mrv2' ? prices.mrv2 : prices.v1
  return (
    <div className="es-fl__card" data-full-card="">
      <p className="es-fl__card-name">
        <PartLabel id="cost-card" interactive>
          Cost card
        </PartLabel>
        <strong data-card-name="">{cardName(view.synthetic)}</strong>
      </p>
      <dl className="es-fl__prices" aria-label={`Prices on the ${cardName(view.synthetic)} card`}>
        <Item label={`GPU forward, ${small.rows} ${small.rows === 1 ? 'row' : 'rows'}`}>
          <Us value={small.us} tag={tagOf(view, line)} />
        </Item>
        {big.rows === small.rows ? null : (
          <Item label={`GPU forward, ${big.rows} rows`} more>
            <Us value={big.us} tag={tagOf(view, line)} />
          </Item>
        )}
        <Item label="CPU, schedule">
          <Us value={host.scheduleBaseUs} tag={tagOf(view, hostKind)} />
        </Item>
        <Item label="CPU, sync" more>
          <Us value={host.syncUs} tag={tagOf(view, hostKind)} />
        </Item>
      </dl>
      <div className="es-fl__card-tools">
        <Stamp word={view.synthetic ? 'synthetic' : 'estimated'} />
        <Button size="sm" variant="plate" aria-pressed={fit || locked} disabled={locked} onClick={onFit} data-fit-run="">
          Fit run
        </Button>
      </div>
    </div>
  )
}

/** The legend under the diagram: the code's colours as they are used here, and the shapes of the marks that colour does not tell apart. */
export function FullLegend({ level }: { level: string }) {
  const graphs = level === 'graphs' || level === 'close'
  return (
    <div className="es-fl__legend">
      <Legend
        className="es-lanes__legend"
        label="Legend: step loop, full levels"
        entries={[
          { slot: 'blue', word: 'CPU call' },
          { slot: 'yellow', word: 'sync: tokens read back' },
          { slot: 'green', word: 'GPU forward, with its batch' },
          { slot: 'white', word: 'idle: a bubble' },
        ]}
        now="the CPU’s clock"
      />
      {graphs || level === 'mask' ? (
        <ul className="es-fl__shapes" aria-label="Marks told apart by shape">
          {graphs ? (
            <>
              <li>
                <span className="es-fl__swatch" data-shape="eager" aria-hidden="true" />
                eager launches
              </li>
              <li>
                <span className="es-fl__swatch" data-shape="replay" aria-hidden="true" />
                graph replay
              </li>
              <li>
                <span className="es-fl__swatch" data-shape="padding" aria-hidden="true" />
                padding
              </li>
            </>
          ) : null}
          {level === 'mask' ? (
            <li>
              <span className="es-fl__swatch" data-shape="mask" aria-hidden="true" />
              grammar mask
            </li>
          ) : null}
          <li>
            <span className="es-fl__swatch" data-shape="reference" aria-hidden="true" />
            reference run
          </li>
        </ul>
      ) : null}
    </div>
  )
}

/** The 2D view as the page draws it. */
export function FullView2D({ run }: { run: FullRun }) {
  const { view } = run
  const [fit, setFit] = useState(false)
  // The reference stands once the run is served, and not in a closed-book stage before its result.
  const revealed = view.nightOver && (!view.stage.sealed || view.stage.closed)
  const reference = useMemo(() => (revealed ? referenceOf(view.level, run.seed, view.at) : null), [revealed, view.level, run.seed, view.at])
  return (
    <div className="es-fl__view" data-full-view="" data-reference={reference === null ? undefined : ''}>
      <CardStrip run={run} fit={fit} onFit={() => setFit(!fit)} locked={reference !== null} />
      <FullLanes view={view} fit={fit} reference={reference} />
      <p className="es-fl__prompt" data-full-prompt="">
        {view.stage.prompt}
      </p>
      {view.stage.cards === null ? null : (
        // The closed-book stage's four cards stand under the lanes, where the configuration is worked out from them before the run.
        <details className="es-fl__cards" open>
          <summary>The four cards for this run</summary>
          <CloseCards view={view} />
        </details>
      )}
    </div>
  )
}
