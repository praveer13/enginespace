import { TAIL_ROWS, binsOf } from '@es/play/broken-bench/desk'
import { orderNo } from '@es/play/broken-bench/layout'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import type { DeskApi } from './desk'
import type { BenchRun } from './types'

/*
 * Broken benchmark's mirror (GAMES.md §2.3, §11; A§6.9): the tail, as a DOM table. The tail is the slowest requests under the switch's clock
 * and the cut, ranked from the slowest, and it is what a p99 is read from: the p99 is the request at nearest rank (A§5.6, B6), which is
 * `n − ⌈0.99 n⌉ + 1` from the slowest with `n − ⌈0.99 n⌉` requests beyond it. The learner counts down it. Under it, the counts of the
 * histogram's stacks, so the picture carries nothing that is only in the picture. The log itself is the Log sheet: every request to a line.
 *
 * The tail is as long for every log: `TAIL_ROWS` of the slowest requests, or all of them when the log is shorter, and the caption says so.
 * Its length, and the place where it ends, therefore say nothing of where the p99 sits. The table is a box of its own that scrolls
 * (bench.css, "the tail"), so a tail of that length takes the room of one box and no more.
 *
 * Column heads are the engine's terms, and the figures are synthetic (D-048): the summary says so once. In a graded attempt nothing says
 * where the p99 sits: the summary says how many requests were measured, and the rule is the learner's to apply, to a table whose length
 * tells nothing of the answer.
 */

const head = (term: string, unit: string) => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'rank', head: head('Rank', 'from the slowest'), label: 'Rank', numeric: true },
  { key: 'order', head: 'Request', label: 'Request' },
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
          {num(view.cases)} {view.cases === 1 ? 'report is' : 'reports are'} filed; the result reads {view.cases === 1 ? 'it' : 'them'}.
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
              <span className="es-bench-p99mark">p99</span>
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
      <MirrorTable
        id={run.mirrorId}
        className="es-bench-tail"
        head="The tail"
        caption={
          <>
            The slowest requests under the switch&apos;s clock and the cut, ranked from the slowest, up to {num(TAIL_ROWS)} of them
          </>
        }
        summary={
          <>
            Measured: {num(reading.n)} requests, timed from {desk.clock === 'due' ? 'the due time' : 'the send time'}, the first {num(reading.cut)} left out. Mean {ms(reading.meanUs)} ms.
            {practice ? (
              <>
                {' '}
                The p99 is the {num(reading.fromTop)}
                {ordinal(reading.fromTop)} slowest, with {num(reading.beyond)} beyond it, at {ms(reading.p99Us)} ms.
              </>
            ) : (
              <> Count down from the slowest to the request at the p99&apos;s rank.</>
            )}{' '}
            Every figure is synthetic.
          </>
        }
        columns={COLUMNS}
        rows={rows}
        selectedId={desk.selected === null ? null : `order-${desk.selected}`}
        onSelect={(id) => desk.select(Number(id.replace('order-', '')))}
        empty="The log has no requests under this cut."
      />
      <details className="es-bench-bins">
        <summary>Counts behind the histogram</summary>
        <div role="region" aria-label="Counts behind the histogram" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="pb-2 text-left font-bold">Requests measured, counted into the histogram&apos;s bins on its logarithmic axis</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                  From (ms)
                </th>
                <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                  Under (ms)
                </th>
                <th scope="col" className="border-b border-edge py-2 text-right font-bold">
                  Requests
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
