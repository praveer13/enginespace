import type { ReactNode } from 'react'
import { CARD_COPY } from '@es/play/verifier/cards'
import { fracText } from '@es/play/verifier/ratio'
import { PLATES } from '@es/play/verifier/types'
import type { RowView, VerifierView } from '@es/play/verifier/types'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { Fraction } from './Fraction'
import { showMeter, showScaffold } from './rules'
import type { VerifierRun } from './types'

/*
 * The Tasting's mirror (GAMES.md §2.3, §10; A§6.9): DOM tables of everything the drawing shows, so a screen reader, a zoomed page and a
 * phone read what the picture draws and nothing is only in the picture. GAMES.md §10 gives the columns: for each dish p, q, the overlap,
 * the excess, the output and its error. Column heads are the engine's terms and the cells say the numbers; every column is in plates
 * out of sixty-four of a made-up world, and the heads say so (D-048). A graded run lists p and q and the recipe the learner has set, and
 * leaves out the decomposition and the exact output, as the drawing does (rules.ts).
 *
 * Above the tables, the printer's tape: the run's live readout.
 */

const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>
const dec = (value: number, digits = 1) => <span className="font-numeric">{formatReadout(value, digits)}</span>
const signed = (value: number, digits = 1) => <span className="font-numeric">{value > 0 ? '+' : ''}{formatReadout(value, digits)}</span>

/** A column head: the engine's term, and under it the unit, which says synthetic (D-048). */
const head = (term: ReactNode, unit: string) => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

const PLATE_UNIT = 'plates of 64, synthetic'

interface Show {
  readonly scaffold: boolean
  readonly meter: boolean
}

function columnsOf(row: RowView, view: VerifierView, show: Show): MirrorColumn[] {
  const columns: MirrorColumn[] = [
    { key: 'dish', head: 'Dish' },
    { key: 'p', head: head('p', PLATE_UNIT), label: 'p', numeric: true },
  ]
  if (row.q !== null) columns.push({ key: 'q', head: head('q', PLATE_UNIT), label: 'q', numeric: true })
  if (show.scaffold && row.agreed !== null) columns.push({ key: 'min', head: head('min(p, q)', PLATE_UNIT), label: 'min(p, q)', numeric: true })
  if (show.scaffold && row.under !== null) columns.push({ key: 'under', head: head('(p − q)⁺', PLATE_UNIT), label: '(p − q)⁺', numeric: true })
  if (show.scaffold && row.over !== null) columns.push({ key: 'over', head: head('(q − p)⁺', PLATE_UNIT), label: '(q − p)⁺', numeric: true })
  if (row.index === 0 && (view.level === 'exact' || (view.level === 'greedy-ngram' && view.ask?.kind === 'recipe'))) {
    columns.push({ key: 'recipe', head: head('Recipe', 'your weights, synthetic'), label: 'recipe', numeric: true })
  }
  if (show.meter && row.out !== null) {
    const kind = row.outKind === 'exact' ? 'exact' : 'drawn'
    columns.push({ key: 'out', head: head('Output', `${kind}, ${PLATE_UNIT}`), label: 'output', numeric: true })
    columns.push({ key: 'error', head: head('Error', 'output − p, plates'), label: 'error', numeric: true })
  }
  return columns
}

function rowsOf(row: RowView, view: VerifierView, show: Show): MirrorRow[] {
  return view.dishes.map((name, dish): MirrorRow => {
    const cells: Record<string, ReactNode> = {
      dish: (
        <>
          {name} <span className="text-text-2">· token {dish}</span>
        </>
      ),
      p: num(row.p[dish]),
    }
    if (row.q !== null) cells.q = num(row.q[dish])
    if (show.scaffold && row.agreed !== null) cells.min = num(row.agreed[dish])
    if (show.scaffold && row.under !== null) cells.under = num(row.under[dish])
    if (show.scaffold && row.over !== null) cells.over = num(row.over[dish])
    cells.recipe = num(view.weights[dish])
    if (show.meter && row.out !== null) {
      cells.out = dec(row.out[dish], 2)
      cells.error = signed(row.out[dish] - row.p[dish], 2)
    }
    return { id: `row-${row.index}-dish-${dish}`, cells }
  })
}

/** What the table above its rows says in a sentence, from the run so far. */
function summaryOf(view: VerifierView, show: Show): ReactNode {
  const c = view.counters
  const parts: ReactNode[] = []
  if (view.rows.length > 0) {
    parts.push(
      <>
        Six dishes, {view.rows.length === 1 ? 'one tasting' : <>{num(view.rows.filter((row) => row.kind === 'draft').length)} plates down the run and the chef&apos;s extra course</>}.
      </>,
    )
  }
  const first = view.rows[0]
  if (show.scaffold && view.reveal && first?.agreed != null && first.alpha !== null) {
    parts.push(
      <>
        The chef keeps {num(first.agreed.reduce((a, b) => a + b, 0))} of the {num(PLATES)} plates at the first (α = {fracText(first.alpha)}).
      </>,
    )
  }
  if (c.rounds > 0) {
    parts.push(
      <>
        Drew {num(c.rounds)} rounds: {num(c.kept)} plates kept, {num(c.sentBack)} sent back, {num(c.tokens)} courses served.
      </>,
    )
  }
  if (show.meter && view.meter !== null) parts.push(<>Distance from the chef&apos;s tasting {fracText(view.meter.tv)} (exact).</>)
  parts.push(<>Every figure is a count of plates of a made-up world, or a figure of its model.</>)
  return parts.map((part, i) => (
    <span key={i}>
      {part}{' '}
    </span>
  ))
}

/** The printer's tape: the run so far, a line for what the level is about. */
function linesOf(view: VerifierView, show: Show): PrinterTapeLine[] {
  const c = view.counters
  const lines: PrinterTapeLine[] = []
  const plates = (value: number) => <Readout value={value} tag="synthetic" size="sm" />
  if (view.committed && view.prediction !== null) {
    lines.push({
      id: 'prediction',
      label: 'your prediction',
      value: view.level === 'overlap' ? plates(view.prediction) : <Readout value={view.prediction / 1000} digits={3} tag="synthetic" size="sm" />,
    })
  }
  if (view.judged !== null) lines.push({ id: 'judged', label: 'at temperature 0 you said', value: view.judged ? 'kept' : 'sent back' })
  if (view.level === 'gamma' && view.gamma !== null) {
    lines.push({ id: 'gamma', label: 'plates ahead · draft length', value: view.gamma.pick >= 1 ? plates(view.gamma.pick) : 'none yet' })
    if (show.meter && view.gamma.round !== null) {
      lines.push({ id: 'courses', label: 'courses per round', value: <Readout value={view.gamma.round.tokens} digits={3} tag="synthetic" size="sm" /> })
      lines.push({ id: 'cost', label: 'a round costs', value: <Readout value={view.gamma.round.cost} digits={3} tag="synthetic" size="sm" /> })
      lines.push({ id: 'speedup', label: 'speedup', value: <Readout value={view.gamma.round.speedup} digits={3} unit="x" tag="synthetic" size="sm" /> })
    }
  }
  if (show.meter && view.meter !== null) lines.push({ id: 'distance', label: 'distance from her tasting', value: <Fraction value={view.meter.tv} size="sm" />, tone: view.meter.exact ? 'ink' : 'ink-2' })
  if (view.cards !== null) {
    const named = view.cards.filter((card) => card.label !== null).length
    lines.push({ id: 'named', label: 'cards named', value: <Readout value={named} tag="synthetic" size="sm" /> })
  }
  if (c.rounds > 0) {
    lines.push({ id: 'rounds', label: 'rounds drawn', value: plates(c.rounds) })
    lines.push({ id: 'kept', label: 'plates kept', value: plates(c.kept) })
    lines.push({ id: 'sent', label: 'plates sent back', value: plates(c.sentBack), tone: c.sentBack > 0 ? 'ink-2' : 'ink' })
    lines.push({ id: 'served', label: 'courses per round', value: <Readout value={c.tokens / c.rounds} digits={3} tag="synthetic" size="sm" /> })
  }
  return lines
}

/** The cards' table: what the learner named, and what each instrument saw. */
function CardsTable({ view, id }: { view: VerifierView; id?: string }) {
  const cards = view.cards ?? []
  const columns: MirrorColumn[] = [
    { key: 'card', head: 'Card' },
    { key: 'named', head: 'Named as', label: 'named' },
    { key: 'taste', head: head('Taste', '20,000 rounds, synthetic'), label: 'taste' },
    { key: 'coins', head: head('Every coin', 'the accept step'), label: 'every coin' },
  ]
  const rows: MirrorRow[] = cards.map((card) => ({
    id: `card-${card.index}`,
    cells: {
      card: <>Card {card.index + 1}</>,
      named: card.label === null ? <span className="text-text-2">not yet</span> : CARD_COPY[card.label].bug,
      taste:
        card.taste === null ? (
          <span className="text-text-2">not tasted</span>
        ) : (
          <>
            χ² {dec(card.taste.stat)} against {dec(card.taste.critical)}: {card.taste.rejected ? 'rejected' : 'not rejected'}
          </>
        ),
      coins:
        card.coins === null ? (
          <span className="text-text-2">not checked</span>
        ) : card.coins.length === 0 ? (
          'every coin as it should be'
        ) : (
          card.coins.map((coin) => `${view.dishes[coin.token]}: ${coin.kept} of ${coin.of} coins kept, ${coin.should} right`).join('; ')
        ),
    },
  }))
  return <MirrorTable id={id} head="Mirror · the five cards" caption="Each card, what you named it, and what a taste and a look at every coin found" columns={columns} rows={rows} empty="No cards yet" />
}

export function Mirror({ run }: { run: VerifierRun }) {
  const { view } = run
  const show: Show = { scaffold: showScaffold(run), meter: showMeter(run) }
  const lines = linesOf(view, show)
  const gamma = view.gamma
  return (
    <div className="flex flex-col gap-6">
      <PrinterTape label="The printer: the tasting so far, in synthetic plates" lines={lines} feed={view.counters.rounds + lines.length} empty="Nothing printed yet" />
      {view.cards !== null ? <CardsTable view={view} id={run.mirrorId} /> : null}
      {gamma !== null ? (
        <MirrorTable
          id={run.mirrorId}
          head="Mirror · the run"
          caption="How often the chef keeps the plate at each position of the run, given that the walk got there"
          summary={
            <>
              The commis plates up to {num(gamma.max)} courses ahead, each costing <span className="font-numeric">{formatReadout(gamma.cost / 1000, 3)}</span> of a tasting, and the chef tastes the whole run in one go. Every figure is a figure of a made-up world.
            </>
          }
          columns={[
            { key: 'position', head: 'Position' },
            { key: 'alpha', head: head('α', 'kept, permille, synthetic'), label: 'α', numeric: true },
            ...(show.scaffold ? [{ key: 'reach', head: head('Reach', 'product of α up to here, synthetic'), label: 'reach', numeric: true }] : []),
          ]}
          rows={gamma.alphas.slice(0, gamma.max).map((alpha, j) => ({
            id: `position-${j}`,
            cells: {
              position: <>plate {j + 1}</>,
              alpha: num(alpha),
              reach: dec(gamma.alphas.slice(0, j + 1).reduce((product, a) => (product * a) / 1000, 1), 3),
            },
          }))}
        />
      ) : null}
      {view.rows.map((row, i) => (
        <MirrorTable
          key={row.index}
          id={i === 0 && view.cards === null ? run.mirrorId : undefined}
          head={`Mirror · ${row.label}`}
          caption={row.kind === 'bonus' ? 'The chef\'s extra course: the chef plates it alone when the commis\'s plates are all kept' : `Dish by dish: the chef's tasting p and the commis's plates q, in plates out of sixty-four (${row.label})`}
          summary={i === 0 ? summaryOf(view, show) : undefined}
          columns={columnsOf(row, view, show)}
          rows={rowsOf(row, view, show)}
        />
      ))}
    </div>
  )
}

