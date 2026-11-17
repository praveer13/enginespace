import { useContext, useEffect, useId, useMemo } from 'react'
import { drawInBand } from '@es/play'
import { engineBaseline } from '@es/play/pool/debrief'
import { POOL_COPY } from '@es/play/pool/copy'
import { slotBaseline, poolSession } from '@es/play/pool/session'
import type { PoolCounts, PoolLevelId } from '@es/play/pool/types'
import { Button } from '@/design/components/Button'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { NumberLine } from '@/design/components/NumberLine'
import { TextLink } from '@/design/components/TextLink'
import { useBest } from '@/games/kit/best'
import { Debrief as Result } from '@/games/kit/Debrief'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { Versus } from '@/games/kit/Versus'
import { verdictOf } from '@/games/kit/verdict'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import type { PoolOutcome, PoolRun } from './types'

/*
 * KV page pool's result (GAMES.md §8; REDESIGN §2.6): the kit's debrief, filled. The verdict word from the grade, one sentence that says
 * what the run did and the decision that mattered, the ways on (the next level first; in a lesson, the lesson's way on), then the guess
 * beside the model's answer on one number line (in a lesson whose guess this level's slot asked, the lesson's reveal), your cost against the
 * reference's, "In vLLM today" with its source, and the counts against the reference's and the engine's
 * own pool's. Where LoRA adapters are in play, the same run with the adapters in fixed slots, as the engines keep them at the pins (D-042).
 * The reference is read only here. Every count is a count of the synthetic model, and the table's stamp says so.
 *
 * A reason to run again (REDESIGN §2.6): the reference's counts are drawn as hollow outlines under yours on one axis, and the line that
 * Run again points at says how far your cost is from the reference's and, on a page with a ledger, your best on this level.
 */

export interface DebriefProps {
  run: PoolRun
  outcome: PoolOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  /** Inside a lesson: the ways on are the lesson's, and none of them leaves it. */
  embedded?: boolean
}

const figure = (value: number) => <span className="font-numeric">{value}</span>

const tokens = (n: number) => (n === 1 ? 'token' : 'tokens')

type Counted = PoolCounts & { cost: number }

interface Row {
  name: string
  pick: (c: Counted) => number
}

const ROWS: readonly Row[] = [
  { name: 'Cost, in tokens', pick: (c) => c.cost },
  { name: 'Recomputed tokens', pick: (c) => c.recomputedTokens },
  { name: 'Prefix-hit tokens', pick: (c) => c.hitTokens },
  { name: 'Finished requests', pick: (c) => c.completed },
  { name: 'Preemptions', pick: (c) => c.preemptions },
  { name: 'Evictions', pick: (c) => c.evictions },
]

const STALL_ROW: Row = { name: 'Steps waiting for an adapter', pick: (c) => c.adapterStallSteps }

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'count', head: 'Count' },
  { key: 'yours', head: 'Yours', numeric: true },
  { key: 'reference', head: 'Reference', numeric: true },
  { key: 'engine', head: "The engine's own pool", numeric: true },
]

function Counts({ yours, reference, engine, stalls }: { yours: Counted; reference: Counted; engine: Counted; stalls: boolean }) {
  const rows: MirrorRow[] = (stalls ? [...ROWS, STALL_ROW] : ROWS).map((row) => ({
    id: row.name,
    cells: { count: row.name, yours: figure(row.pick(yours)), reference: figure(row.pick(reference)), engine: figure(row.pick(engine)) },
  }))
  return <MirrorTable head="Counts" caption="Your run against the reference, and against the engine's own pool (synthetic)" columns={COLUMNS} rows={rows} />
}

/** Your cost against the reference's, in words: "4 tokens over the reference", "the reference's cost", "2 tokens under it". */
function versus(mine: number, theirs: number) {
  if (mine === theirs) return <>the same as the reference&apos;s.</>
  const gap = Math.abs(mine - theirs)
  return (
    <>
      {figure(gap)} {tokens(gap)} {mine > theirs ? 'over' : 'under'} the reference&apos;s {figure(theirs)}.
    </>
  )
}

/** The learner's best on this level, from the ledger's runs of it. Rendered only on a page that has a ledger. */
function Best({ level }: { level: PoolLevelId }) {
  const best = useBest('pool', level)
  if (best === null) return null
  return (
    <>
      {' '}
      Your best on this level: <span className="font-numeric">{best.score.toFixed(2)}</span>, the reference&apos;s cost over yours, where{' '}
      <span className="font-numeric">1.00</span> is the reference&apos;s cost or lower ({figure(best.runs)} {best.runs === 1 ? 'run' : 'runs'} kept).
    </>
  )
}

export function Debrief({ run, outcome, next, onNext, embedded = false }: DebriefProps) {
  const againId = useId()
  const { view } = run
  const { debrief, grade } = outcome
  const level: PoolLevelId = view.level
  const reference = outcome.ghostView.counts
  const engine = useMemo(() => engineBaseline(poolSession.level(level, run.seed)), [level, run.seed])
  const slots = useMemo(() => (view.kits.length === 0 ? null : slotBaseline(poolSession.level(level, run.seed))), [level, run.seed, view.kits.length])
  const hasPassRule = POOL_COPY[level].passRule !== undefined
  const verdict = verdictOf(grade, hasPassRule)
  const turn = debrief.names !== null && 'turn' in debrief.names ? debrief.names.turn : null
  // The decision's number among the learner's decisions: the guess, if there was one, is not a decision.
  const number = turn === null ? null : outcome.record.actions.slice(0, turn + 1).filter((action) => action.t !== 'commit').length
  const guess = view.predict.committed
  const answer = view.predict.answer
  const unit = view.predict.unit

  const newNumbers = () => run.restart(drawFresh(level))

  // In a lesson: its way on leads the result, and a guess the lesson asked in this level's slot is revealed here, in the lesson's numbers,
  // in place of the level's own number line (whose answer is for this level's first request, a different quantity).
  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null
  const lessonReveal = lesson !== null && lesson.reveal !== null && lesson.reveal !== undefined
  const showsReveal = lesson?.showsReveal
  useEffect(() => {
    if (!lessonReveal || showsReveal === undefined) return
    showsReveal(true)
    return () => showsReveal(false)
  }, [lessonReveal, showsReveal])

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

  const guessLine = lessonReveal ? (
    <div className="es-pool-debrief__lesson-guess" data-pool-lesson-guess="">
      {lesson?.reveal}
    </div>
  ) : guess === null ? (
    <p data-pool-guess="">
      You skipped the guess. The answer: {figure(answer)} {unit}.
    </p>
  ) : (
    <NumberLine
      caption={`Your guess and the model's answer, in ${unit}`}
      min={Math.min(0, guess, answer)}
      max={Math.max(guess, answer, 1) * 1.25}
      pins={[
        { id: 'guess', kind: 'guess', value: guess, label: 'your guess' },
        { id: 'answer', kind: 'result', value: answer, label: 'the answer' },
      ]}
    />
  )

  return (
    <Result
      className="es-pool-debrief"
      verdict={verdict}
      sentence={debrief.sentence}
      actions={
        <>
          {primary}
          <Button variant="quiet" aria-describedby={againId} onClick={() => (run.mode === 'graded' ? newNumbers() : run.restart())}>
            Run again
          </Button>
          <Button variant="quiet" onClick={newNumbers}>
            New numbers
          </Button>
        </>
      }
    >
      <div className="es-pool-debrief__body" data-pool-debrief="">
        {guessLine}
        <p id={againId} className="es-pool-debrief__again" data-run-again="">
          <strong>Run again:</strong> {againLine(view.counts.cost, reference.cost)}
          {run.ledger ? <Best level={level} /> : null}
        </p>
        {number === null ? null : (
          <p>
            <strong>The decision that mattered:</strong> your decision {figure(number)}. Until then the reference, taking over, still met the bar; after it, it could not.
          </p>
        )}
        <p data-pool-versus="">
          <strong>Your cost:</strong> {figure(view.counts.cost)} {tokens(view.counts.cost)}, {versus(view.counts.cost, reference.cost)}
          {hasPassRule ? (
            <>
              {' '}
              The pass rule asks the reference&apos;s cost over yours to be at least <span className="font-numeric">{view.bar}</span>; yours is{' '}
              <span className="font-numeric">{grade.score.toFixed(2)}</span>.
            </>
          ) : null}
        </p>
        <Versus
          caption="Yours and the reference's, on one axis, in tokens"
          rows={[
            { id: 'cost', label: 'Cost', mine: view.counts.cost, reference: reference.cost },
            { id: 'recomputed', label: 'Recomputed tokens', mine: view.counts.recomputedTokens, reference: reference.recomputedTokens },
            { id: 'hit', label: 'Prefix-hit tokens', mine: view.counts.hitTokens, reference: reference.hitTokens },
          ]}
        />
        <section aria-label="In vLLM today" className="es-pool-debrief__engine">
          <h4>In vLLM today</h4>
          <p>
            vLLM v0.33.0 serves every KV group from a single pool of pages of one size, and a new request&apos;s cached prefix is the intersection of each group&apos;s hit. It frees
            a request&apos;s pages tail first, so the head of a prefix is evicted last: <code>SingleTypeKVCacheManager.free</code> in{' '}
            <a href="https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/single_type_kv_cache_manager.py#L591-L599" rel="noreferrer" target="_blank">
              <code>vllm/v1/core/single_type_kv_cache_manager.py</code>
            </a>
            .
          </p>
        </section>
        <Counts yours={view.counts} reference={reference} engine={engine} stalls={view.kits.length > 0} />
        {slots === null ? null : (
          <section aria-label="Adapters in fixed slots">
            <h4>The same run, with the adapters in fixed slots</h4>
            <p>
              At the pins neither engine pages an adapter into its KV pool. vLLM keeps adapters in a few GPU slots, and SGLang in a fixed-slot pool, outside the pages. The
              reference, run on this seed with one slot and no pages spent on adapters, recomputed {figure(slots.recomputedTokens)} tokens and waited{' '}
              {figure(slots.adapterStallSteps)} {slots.adapterStallSteps === 1 ? 'step' : 'steps'} for an adapter, against your {figure(view.counts.recomputedTokens)} tokens and{' '}
              {figure(view.counts.adapterStallSteps)} {view.counts.adapterStallSteps === 1 ? 'step' : 'steps'}
              {slots.unserved > 0 ? `, and it left ${slots.unserved} requests unserved` : ''}. Slots spend no pages on an adapter and hold few adapters; a pool spends pages and
              holds as many as it can pay for.
            </p>
          </section>
        )}
      </div>
    </Result>
  )
}

/** The difference to the reference, as the reason to run again: "4 tokens over the reference", or the reference's cost met. */
function againLine(mine: number, theirs: number) {
  if (mine <= theirs) return mine === theirs ? <>you matched the reference&apos;s cost; a run that costs less would beat it.</> : <>you beat the reference&apos;s cost by {figure(theirs - mine)} {tokens(theirs - mine)}.</>
  return (
    <>
      {figure(mine - theirs)} {tokens(mine - theirs)} over the reference&apos;s cost.
    </>
  )
}

/** A fresh seed the level's band accepts, from the browser's entropy: unseen, not secret. */
function drawFresh(level: PoolLevelId): number {
  return drawInBand(poolSession, level, crypto.getRandomValues(new Uint32Array(1))[0])
}
