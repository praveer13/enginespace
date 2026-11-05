import { useMemo, type ReactNode } from 'react'
import { drawInBand } from '@es/play'
import { engineBaseline } from '@es/play/pool/debrief'
import { slotBaseline, poolSession } from '@es/play/pool/session'
import type { PoolCounts, PoolLevelId } from '@es/play/pool/types'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import type { PoolOutcome, PoolRun } from './types'

/*
 * The Reach-In's debrief (GAMES.md §8): one sentence that says what the run did and the decision that mattered; the counters against the
 * house's (the hidden reference, read only here) and against the engine's pool, which is what the pinned vLLM does; the prediction's
 * answer; and, where recipe kits are in play, the same night with the kits on a shelf of fixed slots, as the engines keep them at the pins
 * (D-042). The house is the ghost: its run plays the same night. Every count is a count of the synthetic world and every row says so.
 */

export interface DebriefProps {
  run: PoolRun
  outcome: PoolOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
}

/** The one true thing, in a sentence (GAMES.md §8, "Module and concept"). */
const ONE_TRUE_THING =
  "A ticket's hit counts only as far as every station still holds its pans, so what a cache keeps matters less than where it keeps it: the head of an order, which every later hit starts from, outlives its tail, and a recipe kit's pans come out of the very same pool."

const figure = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

/** A counted word in its number: one step, two steps. The debrief keeps its own, so that its chunk imports nothing from the pool page's own modules. */
const count = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/** The counts of a night with its price: yours, the house's and the engine's pool's are each one. */
type Counted = PoolCounts & { cost: number }

interface Row {
  name: string
  pick: (c: Counted) => number
}

/** The engine's term leads and the kitchen's word follows it, as the debrief of every game prints them (GAMES.md §2.6, rule 2). */
const ROWS: readonly Row[] = [
  { name: 'Price (tokens, synthetic)', pick: (c) => c.cost },
  { name: 'Recomputed tokens (prepped again, synthetic)', pick: (c) => c.recomputedTokens },
  { name: 'Hit tokens (shared mise, synthetic)', pick: (c) => c.hitTokens },
  { name: 'Completed requests (tickets served, synthetic)', pick: (c) => c.completed },
  { name: 'Preemptions (tickets pulled, synthetic)', pick: (c) => c.preemptions },
  { name: 'Evictions (pans dumped, synthetic)', pick: (c) => c.evictions },
]

const STALL_ROW: Row = { name: 'Adapter stall steps (kit stall steps, synthetic)', pick: (c) => c.adapterStallSteps }

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'counter', head: 'Counter' },
  { key: 'yours', head: 'Yours', numeric: true },
  { key: 'house', head: 'The house', numeric: true },
  { key: 'engine', head: "The engine's pool", numeric: true },
]

/**
 * The night's counters: yours, the house's and the engine's pool's, in the mirror kit's table on a ticket of its own. Wide, it is a table
 * of four columns. On a phone each counter prints as a block with its three figures under their names, so nothing is cut off at the paper's
 * edge and nothing scrolls sideways.
 */
function Counters({ yours, house, engine, showStalls }: { yours: Counted; house: Counted; engine: Counted; showStalls: boolean }) {
  const rows: MirrorRow[] = (showStalls ? [...ROWS, STALL_ROW] : ROWS).map((row) => ({
    id: row.name,
    cells: { counter: row.name, yours: figure(row.pick(yours)), house: figure(row.pick(house)), engine: figure(row.pick(engine)) },
  }))
  return <MirrorTable head="Counters" caption="Your night against the house's, and against the engine's pool" columns={COLUMNS} rows={rows} />
}

export function Debrief({ run, outcome, next, onNext }: DebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  const level: PoolLevelId = view.level
  const house = outcome.ghostView.counts
  const engine = useMemo(() => {
    const state = poolSession.level(level, run.seed)
    return engineBaseline(state)
  }, [level, run.seed])
  const shelf = useMemo(() => (view.kits.length === 0 ? null : slotBaseline(poolSession.level(level, run.seed))), [level, run.seed, view.kits.length])
  const last = next === null
  const decisions = outcome.record.actions
  const turn = debrief.names !== null && 'turn' in debrief.names ? debrief.names.turn : null
  // The decision's number among the learner's decisions: the prediction, if there was one, is not a decision.
  const number = turn === null ? null : decisions.slice(0, turn + 1).filter((action) => action.t !== 'commit').length

  function newNumbers() {
    const entropy = crypto.getRandomValues(new Uint32Array(1))[0]
    run.restart(drawInBand(poolSession, level, entropy))
  }

  const predicted = view.predict.committed
  const extra: ReactNode =
    predicted === null ? null : (
      <p>
        <strong>Your prediction:</strong> {figure(predicted)} {view.predict.unit === 'pages' ? 'pans' : view.predict.unit}. The answer is {figure(view.predict.answer)}.{' '}
        {predicted === view.predict.answer ? 'You had it.' : 'The sim\'s own arithmetic says otherwise: check it against the stations and the block size.'}
      </p>
    )

  return (
    <div className="es-pool-debrief flex max-w-3xl flex-col gap-6" data-pool-debrief="">
      <Ticket
        as="section"
        width="full"
        hole={false}
        head="Debrief"
        meta={view.title}
        titleAs="h3"
        title={grade.ok ? 'Well stocked.' : 'Stock it again.'}
        stub={last ? <Stub to="/map">Open the course map</Stub> : <Stub onClick={onNext}>Next level</Stub>}
      >
        <p className="es-type-body">{debrief.sentence}</p>
        {number === null ? null : (
          <p>
            <strong>The decision that mattered:</strong> No. <span className="font-numeric">{number}</span> of yours. Until then the house, taking over, still reached the bar; after it, it could not.
          </p>
        )}
        {extra}
        <p>
          <strong>Score:</strong> <Readout value={Math.round(grade.score * 100)} unit="%" tag="derived" size="sm" />, the house&apos;s price over yours. The bar is{' '}
          <Readout value={Math.round(view.bar * 100)} unit="%" tag="estimated" size="sm" />.
        </p>
        {last ? null : (
          <p className="text-text-2" data-pool-next="">
            Next level: <strong className="text-text-1">{next.title}</strong>
          </p>
        )}
      </Ticket>

      <Counters yours={view.counts} house={house} engine={engine} showStalls={view.kits.length > 0} />

      {shelf === null ? null : (
        <section aria-label="Kits on a shelf" className="flex flex-col gap-2">
          <h3>The same night, with the kits on a shelf</h3>
          <p className="max-w-prose">
            At the pins neither engine pages a kit into its KV pool. vLLM keeps kits in a few GPU slots, and SGLang in a fixed-slot pool, outside the pages (D-042). The house, run on
            this night with one slot and no pans spent on kits, prepped again {figure(shelf.recomputedTokens)} tokens and waited {figure(shelf.adapterStallSteps)} {count(shelf.adapterStallSteps, 'step', 'steps')} for a kit,
            against your {figure(view.counts.recomputedTokens)} tokens and {figure(view.counts.adapterStallSteps)} {count(view.counts.adapterStallSteps, 'step', 'steps')}
            {shelf.unserved > 0 ? `, and it left ${shelf.unserved} tickets unserved` : ''}. A shelf spends no pans on a kit and holds few kits; a pool spends pans and holds as many as it can pay for.
          </p>
        </section>
      )}

      <section aria-label="What to take away" className="flex flex-col gap-2">
        <p className="es-type-body max-w-prose">{ONE_TRUE_THING}</p>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="plate" onClick={() => run.restart()}>
          Play this level again
        </Button>
        <Button variant="ink" onClick={newNumbers}>
          New numbers
        </Button>
        {last ? <TextLink to="/map">The course map</TextLink> : null}
      </div>
    </div>
  )
}
