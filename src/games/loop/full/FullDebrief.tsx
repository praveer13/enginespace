import { lazy, Suspense, useContext, useId } from 'react'
import { drawInBand } from '@es/play'
import { FULL_COPY } from '@es/play/loop/full/copy'
import { fullSession, leverWords, predictionClose, wordsOf } from '@es/play/loop/full/session'
import type { LeverName, Levers } from '@es/play/loop/full/types'
import { Button } from '@/design/components/Button'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { Stamp } from '@/design/components/Stamp'
import { TextLink } from '@/design/components/TextLink'
import { formatReadout } from '@/design/format'
import { Debrief as Result } from '@/games/kit/Debrief'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { Versus } from '@/games/kit/Versus'
import { verdictOf } from '@/games/kit/verdict'
import { Us } from './FullView2D'
import { VerdictLines } from './NightVerdict'
import { stampWord, tagOf } from './tags'
import type { FullOutcome, FullRun } from './types'
import { levelOn } from './world'

// What comes after the debrief (the policy as the engines read it, their settings, what to run on a real engine) is its own chunk, loaded
// when the learner opens it.
const After = lazy(() => import('../FullAfter'))

/*
 * The full levels' result (REDESIGN §2.6, "The debrief"), in the dock once every stage has closed: the verdict word, one plain sentence that
 * names the engine term, the one primary control, yours against the reference run on one axis, each stage's call against the model's, and,
 * for the graded level, the configuration against the reference's. The reference is read only here. Every µs keeps its tag.
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
  embedded?: boolean
}

/** The levers of a configuration in words, for the table of what the learner ran against what the reference did. */
function configRows(levers: Levers): { name: string; value: string }[] {
  return [
    { name: 'Async scheduling', value: levers.async ? 'on' : 'off' },
    { name: 'Input ids', value: levers.inputIds === 'device' ? 'filled on the GPU' : 'written by the CPU' },
    { name: 'Model runner', value: levers.runner === 'mrv2' ? 'MRV2' : 'V1, the legacy runner' },
    { name: 'CUDA graph mode', value: levers.graphMode },
    { name: 'Capture sizes', value: levers.graphMode === 'NONE' || levers.captureSizes.length === 0 ? 'none captured' : levers.captureSizes.join(', ') },
  ]
}

export function FullDebrief({ run, outcome, next, onNext, onGraded = null, onPractice = null, embedded = false }: FullDebriefProps) {
  const againId = useId()
  const { view } = run
  const { debrief, grade } = outcome
  const level = levelOn(view.level, run.seed)
  const lever = debrief.names !== null && 'lever' in debrief.names ? leverWords(debrief.names.lever as LeverName) : null
  const newNumbers = () => run.restart(drawInBand(fullSession, view.level, crypto.getRandomValues(new Uint32Array(1))[0]))
  // A closed-book stage (`close`) is the only stage of its level: its verdict is the current stage's, and its configuration is what it was run with.
  const sealed = level.stages.find((world) => world.sealed)
  const sealedIndex = sealed === undefined ? -1 : level.stages.indexOf(sealed)
  const verdict = sealed !== undefined && view.stage.id === sealed.id ? view.stage.verdict : null
  const mine = sealedIndex < 0 ? null : view.stages[sealedIndex].levers
  const word = verdictOf(grade, FULL_COPY[view.level].passRule !== undefined)
  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null
  const stamp = <Stamp word={stampWord(view)} />

  const best = level.stages.map((world, i) => {
    const stage = view.stages[i]
    const served = stage.served.filter((night) => night.metric > 0)
    return { world, stage, best: served.length === 0 ? null : Math.min(...served.map((night) => night.metric)) }
  })
  const behind = best.filter((row) => row.best !== null && row.best > row.world.houseMetric)

  const primary =
    onward !== null ? (
      <PrimaryButton onClick={() => onward.select()}>
        {onward.label}
      </PrimaryButton>
    ) : next !== null ? (
      <PrimaryButton onClick={onNext}>
        {`Next level: ${next.title}`}
      </PrimaryButton>
    ) : embedded ? null : (
      <TextLink to="/map">Open the course</TextLink>
    )

  return (
    <div className="es-fd-result" data-full-debrief="">
      <Result
        className="es-fd-debrief"
        verdict={word}
        sentence={debrief.sentence}
        actions={
          <>
            {primary}
            {run.mode === 'graded' ? (
              <>
                {onPractice === null ? null : (
                  <Button variant="quiet" onClick={onPractice}>
                    Practice this level
                  </Button>
                )}
                {onGraded === null ? null : (
                  <Button variant="quiet" aria-describedby={againId} onClick={onGraded}>
                    Another graded run
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="quiet" aria-describedby={againId} onClick={() => run.restart()}>
                  Run again
                </Button>
                <Button variant="quiet" onClick={newNumbers}>
                  New numbers
                </Button>
                {onGraded === null ? null : (
                  <Button variant="quiet" onClick={onGraded}>
                    Start a graded run
                  </Button>
                )}
              </>
            )}
          </>
        }
      >
        <p id={againId} className="es-fd-result__again" data-run-again="">
          <strong>Run again:</strong>{' '}
          {behind.length === 0 ? 'every stage met the reference run’s clock within its margin.' : `${behind.length === 1 ? 'one stage ran' : `${behind.length} stages ran`} over the reference run’s.`}
        </p>
        {lever ? (
          <p>
            <strong>The lever worth the most:</strong> {lever}.
          </p>
        ) : null}
        {verdict !== null ? (
          <section aria-label="Verdict on the run" data-full-verdict-debrief="">
            <VerdictLines verdict={verdict} view={view} />
          </section>
        ) : null}
        <Versus
          caption="Your best run of each stage and the reference run’s, on one axis, in µs"
          stamp={stamp}
          rows={best.flatMap((row) =>
            row.best === null ? [] : [{ id: row.world.id, label: row.stage.title, mine: row.best, reference: row.world.houseMetric }],
          )}
        />
        {sealed !== undefined && mine !== null ? (
          <div role="region" aria-label="Your configuration against the reference run’s" tabIndex={0} className="es-fd-result__scroll" data-full-config-table="">
            <table className="es-fd-result__table">
              <caption>Your configuration, lever by lever, against the reference run’s</caption>
              <thead>
                <tr>
                  <th scope="col">Lever</th>
                  <th scope="col">Yours</th>
                  <th scope="col">The reference run’s</th>
                </tr>
              </thead>
              <tbody>
                {configRows(mine).map((row, i) => {
                  const reference = configRows(sealed.house)[i]
                  const same = row.value === reference.value
                  return (
                    <tr key={row.name} data-differs={same ? undefined : ''}>
                      <th scope="row">{row.name}</th>
                      <td>
                        {row.value}
                        <span className="sr-only">{same ? ', the same as the reference run' : ', not what the reference run did'}</span>
                      </td>
                      <td>{reference.value}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div role="region" aria-label="Each stage against the reference run" tabIndex={0} className="es-fd-result__scroll">
          <table className="es-fd-result__table" data-full-stages-table="">
            <caption>Each stage: your best run against the reference run’s, and your prediction against the model’s</caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Yours</th>
                <th scope="col">Reference</th>
                <th scope="col">Your prediction, and the model’s</th>
              </tr>
            </thead>
            <tbody>
              {best.map(({ world, stage, best: bestRun }) => {
                const p = wordsOf(view.level, world).prediction
                const said = (value: number) => (p.kind === 'choice' ? p.options[value] : `${formatReadout(value)} ${p.unit}`)
                const tag = tagOf({ synthetic: world.card === 'small' }, 'host')
                return (
                  <tr key={world.id} data-stage-row={world.id} data-passed={stage.passed || undefined}>
                    <th scope="row">
                      {stage.title}
                      <span className="es-fd-result__sub">{stage.passed ? 'at the bar' : 'missed the bar'}</span>
                    </th>
                    <td data-label="Yours, best run">{bestRun === null ? 'none run' : <Us value={bestRun} tag={tag} />}</td>
                    <td data-label="Reference">
                      <Us value={world.houseMetric} tag={tag} />
                    </td>
                    <td data-label="Your prediction, and the model’s">
                      {stage.predicted === null ? 'not committed' : `${said(stage.predicted)}; the model: ${said(world.answer)}${predictionClose(view.level, world, stage.predicted) ? ', on target' : ''}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Suspense fallback={null}>
          <After run={run} />
        </Suspense>
      </Result>
    </div>
  )
}
