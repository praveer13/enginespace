import { FLAW_FACTS } from '@es/play/broken-bench/flaws'
import type { RulingView } from '@es/play/broken-bench/types'
import { Button } from '@/design/components/Button'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { Exhibits, RulingTicket } from './Ruling'
import type { BenchOutcome, BenchRun } from './types'

/*
 * The Inspection's debrief (GAMES.md §11 "Core loop", §2.1): the court reads its rulings. One sentence says where the run went wrong, or
 * that it did not, and names the flaw worth the most; the docket sets the cases side by side; and each ruling is read out with the
 * arithmetic, beside its exhibits: the corrected benchmark run again on a sheet of graph paper, the learner's own log where the stopwatch
 * lost time, and the flaw's real-world instance as claims.
 *
 * The page takes both columns on a wide screen (bench.css, "the debrief"): a single case sets its exhibits beside the verdict and the
 * ruling, and the court sets its verdict and docket across the top and each ruling beside its own exhibits. On a narrow one it stacks in
 * the order of the reading: the verdict, the ruling, its exhibits.
 *
 * The reference (the court's own recomputation) is read here and nowhere before: the view carries no ruling until the run is over, and
 * the court's number is never on the board while a case is open. In a graded attempt the pass is ASSESSMENT §4.3's [estimated]: the flaw,
 * the number and the range all right, on one case, or on four of five at the court.
 */

export interface DebriefProps {
  run: BenchRun
  outcome: BenchOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  /** A graded attempt on a seed drawn now, or null where the page offers none. */
  onNew: (() => void) | null
}

/** The engine's term leads in the debrief (GAMES.md §2.6, rule 2). */
function leverName(lever: string): string {
  if (lever === 'interval') return 'The range: about as tight as the sample it rests on'
  return Object.hasOwn(FLAW_FACTS, lever) ? FLAW_FACTS[lever as keyof typeof FLAW_FACTS].term : lever
}

function Docket({ rulings }: { rulings: readonly RulingView[] }) {
  const mark = (ok: boolean) => (
    <span className="es-bench-verdict" data-ok={ok}>
      <Icon name={ok ? 'check' : 'alert'} className="es-bench-verdict__mark" />
      <span>{ok ? 'right' : 'wrong'}</span>
    </span>
  )
  return (
    <div role="region" aria-label="The docket" tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="pb-2 text-left font-bold">The docket: each case, and what the court found</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              Case
            </th>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              The flaw it had
            </th>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              Flaw
            </th>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              Number
            </th>
            <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
              Range
            </th>
            <th scope="col" className="border-b border-edge py-2 text-right font-bold">
              Interval score
              <span className="block text-sm font-normal text-text-2">decades, lower is better</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rulings.map((ruling) => (
            <tr key={ruling.caseNo} className="border-b border-paper-rule">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                <span className="font-numeric">{ruling.caseNo}</span>
              </th>
              <td className="py-2 pr-4">{FLAW_FACTS[ruling.trueFlaw].term}</td>
              <td className="py-2 pr-4">{mark(ruling.flawOk)}</td>
              <td className="py-2 pr-4">{mark(ruling.numberOk)}</td>
              <td className="py-2 pr-4">{mark(ruling.intervalOk)}</td>
              <td className="py-2 text-right">
                <span className="font-numeric">{(ruling.scoreMilli / 1000).toFixed(2)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Debrief({ run, outcome, next, onNext, onNew }: DebriefProps) {
  const { debrief, grade } = outcome
  const rulings = run.view.rulings ?? []
  const single = run.view.cases === 1
  const stood = rulings.filter((ruling) => ruling.right).length
  const lever = debrief.names !== null && 'lever' in debrief.names ? leverName(debrief.names.lever) : null
  const last = next === null

  return (
    <div className="es-bench-debrief" data-bench-debrief="" data-cases={single ? 'one' : 'many'}>
      <Ticket
        as="section"
        width="full"
        hole={false}
        titleAs="h3"
        title={grade.ok ? (single ? 'The ruling stands.' : 'The court is satisfied.') : single ? 'The ruling falls.' : 'The court is not satisfied.'}
        className="es-bench-court"
        stub={
          last ? (
            <Stub to="/m/tr8">Open TR8</Stub>
          ) : (
            <Stub onClick={onNext}>{`Next: ${next.title}`}</Stub>
          )
        }
      >
        <p className="es-type-body">{debrief.sentence}</p>
        {lever ? (
          <p>
            <strong>The ruling worth the most:</strong> {lever}.
          </p>
        ) : null}
        <p className="es-bench-score" data-score="">
          {single ? (
            <>The pass is the flaw, the number and the range all right on this case.</>
          ) : (
            <>
              <Readout value={stood} tag="derived" size="sm" /> of <Readout value={run.view.cases} tag="derived" size="sm" /> rulings stood, and the court needs{' '}
              <Readout value={run.view.needed} tag="estimated" size="sm" />. A ruling stands when its flaw, its number and its range are all right.
            </>
          )}
        </p>
        {single ? null : <Docket rulings={rulings} />}
      </Ticket>

      {rulings.map((ruling) => (
        <div key={ruling.caseNo} className="es-bench-spread" data-ruling={ruling.caseNo} data-right={ruling.right}>
          <RulingTicket ruling={ruling} cases={run.view.cases} />
          <Exhibits ruling={ruling} />
        </div>
      ))}

      <div className="es-bench-debrief__after flex flex-wrap items-center gap-4">
        <Button variant="plate" onClick={() => run.restart()}>
          Play this level again
        </Button>
        {onNew === null ? null : (
          <Button variant="ink" onClick={onNew}>
            New numbers
          </Button>
        )}
        {last ? null : <TextLink to="/m/tr8">The module this game belongs to (TR8)</TextLink>}
      </div>
    </div>
  )
}
