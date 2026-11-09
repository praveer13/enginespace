import { drawInBand } from '@es/play'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { fullSession, leverWords, predictionClose } from '@es/play/loop/full/session'
import type { LeverName, Levers } from '@es/play/loop/full/types'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { VerdictLines } from './NightVerdict'
import { tagOf } from './tags'
import type { FullOutcome, FullRun } from './types'

/*
 * The full service's debrief (GAMES.md §2.1; §3, "Core loop", step 3): one sentence on what the run did and the lever worth the most, then
 * each stage: the best night served against the house's, and the call against the model's answer. The house is the ghost, read only here.
 * Every µs is a Readout with its card's tag (D-048).
 */

export interface FullDebriefProps {
  run: FullRun
  outcome: FullOutcome
  next: { id: string; title: string } | null
  onNext: () => void
  /** Starts a graded run of the level, for a level that can be graded; null otherwise. */
  onGraded?: (() => void) | null
  /** Goes back to practice from a graded run; null in practice. */
  onPractice?: (() => void) | null
}

/** The levers of a configuration in words, for the table of what the learner served against what the house did. */
function configRows(levers: Levers): { name: string; value: string }[] {
  return [
    { name: 'Async scheduling', value: levers.async ? 'on' : 'off' },
    { name: 'The next call\'s input ids', value: levers.inputIds === 'device' ? 'filled by the line' : 'written by the expo' },
    { name: 'The runner', value: levers.runner === 'mrv2' ? 'MRV2' : 'V1, the legacy runner' },
    { name: 'The graph mode', value: levers.graphMode },
    { name: 'The molds on the rack', value: levers.graphMode === 'NONE' || levers.captureSizes.length === 0 ? 'none drilled' : levers.captureSizes.join(', ') },
  ]
}

export function FullDebrief({ run, outcome, next, onNext, onGraded = null, onPractice = null }: FullDebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  const level = buildFullLevel(view.level, run.seed)
  const lever = debrief.names !== null && 'lever' in debrief.names ? leverWords(debrief.names.lever as LeverName) : null
  const newNumbers = () => run.restart(drawInBand(fullSession, view.level, crypto.getRandomValues(new Uint32Array(1))[0]))
  // A closed-book stage (`close`) is the only stage of its level: its verdict is the current stage's, and its policy is what it was served with.
  const sealed = level.stages.find((world) => world.sealed)
  const sealedIndex = sealed === undefined ? -1 : level.stages.indexOf(sealed)
  const verdict = sealed !== undefined && view.stage.id === sealed.id ? view.stage.verdict : null
  const mine = sealedIndex < 0 ? null : view.stages[sealedIndex].levers
  return (
    <div className="flex max-w-3xl flex-col gap-6" data-full-debrief="">
      <Ticket
        as="section"
        width="full"
        hole={false}
        head="Debrief"
        meta={view.title}
        titleAs="h3"
        title={grade.ok ? 'Well served.' : 'Serve it again.'}
        stub={next === null ? <Stub to="/m/tr2">Back to TR2</Stub> : <Stub onClick={onNext}>{`Next: ${next.title}`}</Stub>}
      >
        <p className="es-type-body">{debrief.sentence}</p>
        {lever ? (
          <p>
            <strong>The lever worth the most:</strong> {lever}.
          </p>
        ) : null}
        {verdict !== null ? (
          <div className="flex flex-col gap-2" data-full-verdict-debrief="">
            <VerdictLines verdict={verdict} view={view} />
          </div>
        ) : null}
        {sealed !== undefined && mine !== null ? (
          <div role="region" aria-label="Your configuration against the house's" tabIndex={0} className="overflow-x-auto" data-full-config-table="">
            <table className="w-full border-collapse text-left">
              <caption className="pb-2 text-left font-bold">Your configuration, lever by lever, against the house's</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                    Lever
                  </th>
                  <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                    Yours
                  </th>
                  <th scope="col" className="border-b border-edge py-2 font-bold">
                    The house's
                  </th>
                </tr>
              </thead>
              <tbody>
                {configRows(mine).map((row, i) => {
                  const house = configRows(sealed.house)[i]
                  const same = row.value === house.value
                  return (
                    <tr key={row.name} className="border-b border-paper-rule" data-differs={same ? undefined : ''}>
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {row.name}
                      </th>
                      <td className="py-2 pr-4">
                        {row.value}
                        <span className="sr-only">{same ? ', the same as the house' : ', not what the house did'}</span>
                      </td>
                      <td className="py-2">{house.value}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div role="region" aria-label="Each stage against the house" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="pb-2 text-left font-bold">Each stage: your best night against the house's, and your call against the model's</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                  Stage
                </th>
                <th scope="col" className="border-b border-edge py-2 pr-4 text-right font-bold">
                  Yours
                  <span className="block text-sm font-normal text-text-2">µs, best night</span>
                </th>
                <th scope="col" className="border-b border-edge py-2 pr-4 text-right font-bold">
                  The house
                  <span className="block text-sm font-normal text-text-2">µs</span>
                </th>
                <th scope="col" className="border-b border-edge py-2 text-right font-bold">
                  Your call
                  <span className="block text-sm font-normal text-text-2">and the model's</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {level.stages.map((world, i) => {
                const stage = view.stages[i]
                const best = stage.served.length === 0 ? null : Math.min(...stage.served.map((night) => night.metric))
                const p = world.prediction
                const said = (value: number) => (p.kind === 'choice' ? p.options[value] : `${formatReadout(value)} ${p.unit}`)
                const tag = tagOf({ synthetic: world.card === 'small' }, 'expo')
                return (
                  <tr key={world.id} className="border-b border-paper-rule" data-stage-row={world.id} data-passed={stage.passed || undefined}>
                    <th scope="row" className="py-2 pr-4 text-left font-normal">
                      {world.title}
                      <span className="block text-sm text-text-2">{stage.passed ? 'at the bar' : 'missed the bar'}</span>
                    </th>
                    <td className="py-2 pr-4 text-right">{best === null ? 'none served' : <Readout value={best} unit="µs" tag={tag} size="sm" tone={stage.passed ? 'ink' : 'ink-2'} />}</td>
                    <td className="py-2 pr-4 text-right">
                      <Readout value={world.houseMetric} unit="µs" tag={tag} size="sm" />
                    </td>
                    <td className="py-2 text-right">
                      {stage.predicted === null ? 'not called' : `${said(stage.predicted)}; the model: ${said(world.answer)}${predictionClose(world, stage.predicted) ? ', on the money' : ''}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Ticket>
      <div className="flex flex-wrap items-center gap-4">
        {run.mode === 'graded' ? (
          <>
            {onPractice === null ? null : (
              <Button variant="plate" onClick={onPractice}>
                Practice this level
              </Button>
            )}
            {onGraded === null ? null : (
              <Button variant="ink" onClick={onGraded}>
                Another graded run
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="plate" onClick={() => run.restart()}>
              Play this level again
            </Button>
            <Button variant="ink" onClick={newNumbers}>
              New numbers
            </Button>
            {onGraded === null ? null : (
              <Button variant="plate" onClick={onGraded}>
                Start a graded run
              </Button>
            )}
          </>
        )}
        <TextLink to="/m/tr2">TR2: the step loop</TextLink>
      </div>
    </div>
  )
}
