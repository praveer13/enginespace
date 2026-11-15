import { useMemo } from 'react'
import { drawInBand } from '@es/play'
import { engineBaseline } from '@es/play/pool/debrief'
import { POOL_COPY } from '@es/play/pool/copy'
import { slotBaseline, poolSession } from '@es/play/pool/session'
import type { PoolCounts, PoolLevelId } from '@es/play/pool/types'
import { Button } from '@/design/components/Button'
import { NumberLine } from '@/design/components/NumberLine'
import { Stamp } from '@/design/components/Stamp'
import { TextLink } from '@/design/components/TextLink'
import { Debrief as Result } from '@/games/kit/Debrief'
import { verdictOf } from '@/games/kit/verdict'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import type { PoolOutcome, PoolRun } from './types'

/*
 * KV page pool's result (GAMES.md §8; REDESIGN §2.6): the kit's debrief, filled. The verdict word from the grade, one sentence that says
 * what the run did and the decision that mattered, the ways on (the next level first), then the guess beside the model's answer on one
 * number line, your cost against the reference's, "In vLLM today" with its source, and the counts against the reference's and the engine's
 * own pool's. Where LoRA adapters are in play, the same run with the adapters in fixed slots, as the engines keep them at the pins (D-042).
 * The reference is read only here. Every count is a count of the synthetic model, and the table's stamp says so.
 */

export interface DebriefProps {
  run: PoolRun
  outcome: PoolOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
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

export function Debrief({ run, outcome, next, onNext }: DebriefProps) {
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

  return (
    <Result
      className="es-pool-debrief"
      verdict={verdict}
      sentence={debrief.sentence}
      actions={
        <>
          {next === null ? (
            <TextLink to="/map">Open the course</TextLink>
          ) : (
            <Button variant="ink" onClick={onNext}>
              {`Next level: ${next.title}`}
            </Button>
          )}
          <Button variant="quiet" onClick={() => (run.mode === 'graded' ? newNumbers() : run.restart())}>
            Run again
          </Button>
          <Button variant="quiet" onClick={newNumbers}>
            New numbers
          </Button>
        </>
      }
    >
      <div className="es-pool-debrief__body" data-pool-debrief="">
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
        {guess === null ? (
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
            stamp={<Stamp word="synthetic" />}
          />
        )}
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

/** A fresh seed the level's band accepts, from the browser's entropy: unseen, not secret. */
function drawFresh(level: PoolLevelId): number {
  return drawInBand(poolSession, level, crypto.getRandomValues(new Uint32Array(1))[0])
}
