import { binsOf } from '@es/play/broken-bench/desk'
import { orderNo } from '@es/play/broken-bench/layout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { Clipboard } from './Clipboard'
import type { DeskApi } from './desk'
import type { BenchRun } from './types'

/*
 * The Inspection's mirror (GAMES.md §2.3, §11; A§6.9): the tail, as a DOM table. The tail is the slowest orders under the desk's
 * stopwatch and cut, ranked from the slowest, and it is what a p99 is read from: the p99 is the order at nearest rank (A§5.6, B6), which
 * is `n − ⌈0.99 n⌉ + 1` from the slowest with `n − ⌈0.99 n⌉` orders beyond it. The learner counts down it. Under it, the counts of the
 * histogram's stacks, so the picture carries nothing that is only in the picture. The log itself is the rows sheet: every order to a line.
 *
 * On a wide screen the inspector's clipboard stands above the tail, in this column, beside the pass. On a narrow one the 2D view holds it
 * (View2D.tsx draws the same form), and bench.css shows the one that fits.
 *
 * Column heads are the engine's terms, and the figures are synthetic (D-048): the summary says so once. The kit prints a narrow table as
 * a block for each row, with each cell under its column's name, so the tail has three short cells and a row is one line. The lamp falls
 * on the selected order, which is the present. In a graded attempt nothing says where the p99 sits: the summary says how many orders were
 * measured, and the rule is the learner's to apply.
 */

const head = (term: string, unit: string) => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'rank', head: head('Rank', 'from the slowest'), label: 'Rank', numeric: true },
  { key: 'order', head: 'Order', label: 'Order' },
  { key: 'time', head: head('To first token', 'ms'), label: 'To first token', numeric: true },
]

const ms = (us: number) => <span className="font-numeric">{formatReadout(us / 1000, 1)}</span>
const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th')

export function Mirror({ run, desk }: { run: BenchRun; desk: DeskApi | null }) {
  const { view } = run
  if (view.scene === null || desk === null) {
    return (
      <div className="es-bench-mirror" data-bench-mirror="" data-done="">
        <p>
          The court has risen. {num(view.cases)} {view.cases === 1 ? 'ruling is' : 'rulings are'} filed; the debrief reads {view.cases === 1 ? 'it' : 'them'}.
        </p>
      </div>
    )
  }
  const practice = run.mode === 'practice'
  const { reading } = desk
  const rows: MirrorRow[] = desk.tail.map((line) => ({
    id: `order-${line.id}`,
    lamp: desk.selected === line.id,
    cells: {
      rank: (
        <>
          <span className="font-numeric">{line.rank}</span>
          {practice && line.p99 ? (
            <>
              {' '}
              <TapeLabel size="sm" tilt="right" glyph="diamond">
                p99
              </TapeLabel>
            </>
          ) : null}
        </>
      ),
      order: <span className="font-numeric">{orderNo(line.id)}</span>,
      time: <>{ms(line.latencyUs)} ms</>,
    },
  }))
  const bins = binsOf(reading.latencies)
  return (
    <div className="es-bench-mirror" data-bench-mirror="">
      <Clipboard className="es-bench-clip--aside" scene={view.scene} caseNo={view.caseNo} cases={view.cases} />
      <MirrorTable
        id={run.mirrorId}
        head="Mirror · the tail"
        caption="The slowest orders under the desk's stopwatch and cut, ranked from the slowest"
        summary={
          <>
            Desk: {num(reading.n)} orders measured, timed from {desk.clock === 'due' ? 'the due time' : 'the send'}, the first {num(reading.cut)} left out. Mean {ms(reading.meanUs)} ms.
            {practice ? (
              <>
                {' '}
                The p99 is the {num(reading.fromTop)}
                {ordinal(reading.fromTop)} slowest, with {num(reading.beyond)} beyond it, at {ms(reading.p99Us)} ms.
              </>
            ) : (
              <> Count down from the slowest to the order at the p99&apos;s rank.</>
            )}{' '}
            Every figure is synthetic.
          </>
        }
        columns={COLUMNS}
        rows={rows}
        selectedId={desk.selected === null ? null : `order-${desk.selected}`}
        onSelect={(id) => desk.select(Number(id.replace('order-', '')))}
        empty="The log has no orders under this cut."
      />
      <details className="es-bench-bins">
        <summary>Counts behind the histogram</summary>
        <div role="region" aria-label="Counts behind the histogram" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="pb-2 text-left font-bold">Orders measured, counted into the histogram&apos;s bins on its logarithmic ruler</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                  From (ms)
                </th>
                <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                  Under (ms)
                </th>
                <th scope="col" className="border-b border-edge py-2 text-right font-bold">
                  Orders
                </th>
              </tr>
            </thead>
            <tbody>
              {bins.map((bin) => (
                <tr key={bin.loUs} className="border-b border-paper-rule">
                  <td className="py-1 pr-4">{ms(bin.loUs)}</td>
                  <td className="py-1 pr-4">{ms(bin.hiUs)}</td>
                  <td className="py-1 text-right">{num(bin.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
