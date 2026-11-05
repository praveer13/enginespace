import type { ReactNode } from 'react'
import { CARD_COPY } from '@es/play/verifier/cards'
import { fracText } from '@es/play/verifier/ratio'
import type { SweepRowView, VerifierView } from '@es/play/verifier/types'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { Fraction } from './Fraction'
import type { VerifierOutcome, VerifierRun } from './types'

/*
 * The Tasting's debrief (GAMES.md §10, "Core loop" 5; §2.1): one sentence that says what the run did and what it names, the learner's
 * answer against the house's (the hidden reference, read only here), what the exact arithmetic says about the level, the one true thing,
 * and where the real engines stand. Every figure is a count of plates of a made-up world or a figure of its model, and carries its tag.
 *
 * The house is the ghost: its run plays the same seed by the book through the same reducer. The rules that look right and are not are the
 * wrong samplers of the bestiary (sim/spec), each one's exact distance from the chef's tasting on this very pair.
 */

export interface DebriefProps {
  run: VerifierRun
  outcome: VerifierOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  onPracticeAgain: () => void
  /** A fresh in-band seed on the same level, still practice. */
  onNewNumbers: () => void
  /** A graded run on a fresh seed, for a level that can be graded. Null where it cannot. */
  onGraded: (() => void) | null
}

/** The wrong rules, with the kitchen's word and the engine's term (GAMES.md §2.6, rule 2). */
const RULE_NAME: Readonly<Record<string, ReactNode>> = {
  'resample-from-p': 'Re-plate from p, the whole tasting',
  'resample-from-q': 'Re-plate from q, the commis\'s plates',
  'p-without-draft': 'Re-plate from p with the rejected dish taken out',
  'residual-off-by-one': 'Re-plate from the residual, one dish along',
  'accept-if-p-over-q': 'Keep a plate when p > q, with no coin',
  'accept-everything': 'Keep every plate, with no verifier',
}

/** The one true thing of each level, in a sentence (GAMES.md §10, "Module and concept"). */
const TAKEAWAY: Readonly<Record<VerifierView['level'], string>> = {
  overlap: 'The chef keeps the plates she and the commis agree on: the overlap of the two stacks, min(p, q), is the share of the commis\'s work she keeps, and it is α.',
  exact:
    'Keep each draft with probability min(1, p ÷ q) and re-plate a rejection from the residual (p − q)⁺, and what goes out is the target\'s distribution exactly. Any other recipe, even a fair-looking one, leaves a bias, and the bias is a fact you can add up.',
  chain:
    'A round serves the chef\'s own course plus every draft the walk reaches and keeps, so each position adds the product of the acceptances up to it. A longer run is worth only what the walk reaches.',
  'greedy-ngram':
    'At temperature zero speculation is a comparison: a draft is kept exactly when it is the target\'s arg max. A draft with no probabilities is a q with a single dish, and the same exact rule keeps it as often as p likes that dish and re-plates from p with it taken out.',
  mutants:
    'A rule is exact when its accept step keeps exactly min(p, q) of the q coins and its recovery is the residual. A sample cannot see a bias of one coin; counting the coins can, which is why the lab checks both.',
  gamma:
    'A longer draft pays only while the chance the walk reaches its last plate, times the courses it adds, outweighs the cost every round pays for it. So the best draft length is not the longest.',
}

/** Where the real engines stand on the level's idea: facts of the claims, each with its source and the day it was read. */
function Engines({ level }: { level: VerifierView['level'] }) {
  const sampler = (
    <>
      vLLM&apos;s rejection sampler &quot;strictly follows&quot; the algorithm of{' '}
      <TextLink href="https://arxiv.org/abs/2211.17192">Leviathan, Kalman and Matias, arXiv 2211.17192</TextLink> (vLLM v0.33.0, claim vllm.spec.rejection-sampler.exact, read 2026-11-04).
    </>
  )
  const body: ReactNode =
    level === 'mutants' ? (
      <>
        A real exactness bug of this kind: SGLang pull request 35798, opened 2026-08-21, found a sampler that drew its coins from zero up to one but chose the bucket with{' '}
        <code>coin &lt;= cumulative_probability</code>, which at a coin of exactly zero keeps a draft that the target rules out (claim sglang.spec.pr-35798, read 2026-11-04). {sampler}
      </>
    ) : level === 'chain' || level === 'gamma' ? (
      <>
        The paper&apos;s count of tokens per round is a capped geometric variable, (1 − α^(γ+1)) ÷ (1 − α) for one acceptance throughout (claim spec.paper.expected-tokens, read 2026-11-04). {sampler}
      </>
    ) : (
      <>
        {sampler} When every draft is kept, a bonus token is added, sampled from the target alone (claim vllm.spec.bonus-token, read 2026-11-04).
      </>
    )
  return (
    <Ticket as="section" width="full" hole={false} head="The real engines" meta="not this world" titleAs="h3" title="Where the engines stand">
      <p>{body}</p>
      <p className="text-text-2">
        Next, build it: <TextLink to="/labs/rejection-sampler">the rejection-sampler lab</TextLink> drives your own sampler with seeded p, q and drafts and tests its output with the chi-square on twenty thousand rounds.
      </p>
    </Ticket>
  )
}

function Table({ caption, columns, children }: { caption: string; columns: readonly { key: string; head: ReactNode; numeric?: boolean }[]; children: ReactNode }) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="pb-2 text-left font-bold">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`border-b border-edge py-2 pr-4 font-bold ${column.numeric ? 'text-right' : ''}`}>
                {column.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const cell = 'py-2 pr-4 border-b border-paper-rule'
const num = (value: number, digits = 0) => <span className="font-numeric">{formatReadout(value, digits)}</span>

/** The recipe against the house's, dish by dish. */
function RecipeTable({ mine, house, dishes }: { mine: readonly number[]; house: readonly number[]; dishes: readonly string[] }) {
  return (
    <Table
      caption="Your recipe against the house's"
      columns={[
        { key: 'dish', head: 'Dish' },
        { key: 'yours', head: 'Yours (weights, synthetic)', numeric: true },
        { key: 'house', head: 'The house (weights, synthetic)', numeric: true },
      ]}
    >
      {dishes.map((name, x) => (
        <tr key={name}>
          <th scope="row" className={`${cell} text-left font-normal`}>
            {name}
          </th>
          <td className={`${cell} text-right`}>{num(mine[x])}</td>
          <td className={`${cell} text-right`}>{num(house[x])}</td>
        </tr>
      ))}
    </Table>
  )
}

function SweepTable({ rows, pick }: { rows: readonly SweepRowView[]; pick: number }) {
  return (
    <Table
      caption="Every draft length, in courses per tasting"
      columns={[
        { key: 'gamma', head: 'Plates ahead · γ' },
        { key: 'courses', head: 'Courses a round (synthetic)', numeric: true },
        { key: 'cost', head: 'A round costs (tastings, synthetic)', numeric: true },
        { key: 'speedup', head: 'Speedup (synthetic)', numeric: true },
        { key: 'note', head: 'Note' },
      ]}
    >
      {rows.map((row) => (
        <tr key={row.gamma} data-best={row.best || undefined}>
          <th scope="row" className={`${cell} text-left font-normal`}>
            {num(row.gamma)}
          </th>
          <td className={`${cell} text-right`}>{num(row.tokens, 3)}</td>
          <td className={`${cell} text-right`}>{num(row.cost, 3)}</td>
          <td className={`${cell} text-right`}>{num(row.speedup, 3)}</td>
          <td className={cell}>{[row.best ? 'best' : '', row.gamma === pick ? 'yours' : ''].filter(Boolean).join(' · ')}</td>
        </tr>
      ))}
    </Table>
  )
}

function Facts({ run, outcome }: { run: VerifierRun; outcome: VerifierOutcome }) {
  const { view } = run
  const facts = view.final
  if (facts === null) return null
  const house = outcome.ghostView
  const first = view.rows[0]
  switch (view.level) {
    case 'overlap':
      return (
        <p>
          You predicted <Readout value={view.prediction ?? 0} tag="synthetic" size="sm" /> plates. The chef keeps <Readout value={facts.alphaPlates ?? 0} tag="synthetic" size="sm" /> of the sixty-four
          {first?.alpha ? <> (α = {fracText(first.alpha)})</> : null}.
        </p>
      )
    case 'exact':
    case 'greedy-ngram':
      return (
        <>
          {view.level === 'greedy-ngram' && facts.favourite !== null ? (
            <p>
              At temperature zero the chef sends the <strong>{view.dishes[facts.favourite]}</strong>, so the copier&apos;s plate is {facts.keptAtZero ? 'kept' : 'sent back'}. You said it was {view.judged ? 'kept' : 'sent back'}.
            </p>
          ) : null}
          <dl className="es-vf-facts">
            <div>
              <dt>Your recipe&apos;s distance from her tasting</dt>
              <dd>{view.meter !== null ? <Fraction value={view.meter.tv} size="sm" approx={3} /> : 'no recipe'}</dd>
            </div>
            <div>
              <dt>The house&apos;s recipe</dt>
              <dd>
                <Fraction value={{ num: 0, den: 1 }} size="sm" />
              </dd>
            </div>
          </dl>
          <RecipeTable mine={view.weights} house={house.weights} dishes={view.dishes} />
          {facts.rules !== null && facts.rules.length > 0 ? (
            <Table
              caption="Rules that look right and are not, on this very pair"
              columns={[
                { key: 'rule', head: 'The rule' },
                { key: 'tv', head: 'Distance from her tasting', numeric: true },
              ]}
            >
              {facts.rules.map((rule) => (
                <tr key={rule.id}>
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    {RULE_NAME[rule.id] ?? rule.id}
                  </th>
                  <td className={`${cell} text-right`}>
                    <Fraction value={rule.tv} size="sm" approx={3} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : null}
        </>
      )
    case 'chain':
      return (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>A round serves</span>
            {facts.tokens !== null ? <Readout value={facts.tokens.num / facts.tokens.den} digits={3} tag="derived" size="sm" /> : null}
            <span>courses on average, exactly {facts.tokens === null ? '' : fracText(facts.tokens)}. You predicted</span>
            <Readout value={(view.prediction ?? 0) / 1000} digits={3} tag="synthetic" size="sm" />
          </p>
          {facts.naive !== null ? (
            <p className="text-text-2">
              Reading every position as the first would have said <span className="font-numeric">{formatReadout(facts.naive.first, 3)}</span>, and as the mean of the acceptances{' '}
              <span className="font-numeric">{formatReadout(facts.naive.mean, 3)}</span>.
            </p>
          ) : null}
        </>
      )
    case 'gamma':
      return facts.sweep === null ? null : <SweepTable rows={facts.sweep} pick={view.gamma?.pick ?? 0} />
    case 'mutants':
      return facts.truth === null ? null : (
        <Table
          caption="The five cards"
          columns={[
            { key: 'card', head: 'Card' },
            { key: 'yours', head: 'You named it' },
            { key: 'truth', head: 'The bug' },
            { key: 'tv', head: 'Distance from her tasting', numeric: true },
          ]}
        >
          {facts.truth.map((row, i) => {
            const named = view.cards?.[i]?.label ?? null
            return (
              <tr key={i}>
                <th scope="row" className={`${cell} text-left font-normal`}>
                  Card {i + 1}
                </th>
                <td className={cell}>{named === null ? 'not named' : `${CARD_COPY[named].bug}${named === row.bug ? ' (right)' : ''}`}</td>
                <td className={cell}>{CARD_COPY[row.bug].bug}</td>
                <td className={`${cell} text-right`}>
                  <Fraction value={row.tv} size="sm" approx={4} />
                </td>
              </tr>
            )
          })}
        </Table>
      )
  }
}

export function Debrief({ run, outcome, next, onNext, onPracticeAgain, onNewNumbers, onGraded }: DebriefProps) {
  const { view } = run
  const { debrief, grade } = outcome
  return (
    <div className="flex max-w-3xl flex-col gap-6" data-verifier-debrief="">
      <Ticket
        as="section"
        width="full"
        hole={false}
        head="Debrief"
        meta={view.title}
        titleAs="h3"
        title={grade.ok ? 'Well tasted.' : 'Taste it again.'}
        stub={next === null ? <Stub to="/map">Open the course map</Stub> : <Stub onClick={onNext}>{`Next: ${next.title}`}</Stub>}
      >
        <p className="es-type-body">{debrief.sentence}</p>
        <Facts run={run} outcome={outcome} />
      </Ticket>

      <section aria-label="What to take away" className="flex flex-col gap-2">
        <p className="es-type-body max-w-prose">{TAKEAWAY[view.level]}</p>
      </section>

      <Engines level={view.level} />

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="plate" onClick={onPracticeAgain}>
          Play this level again
        </Button>
        <Button variant="plate" onClick={onNewNumbers}>
          New numbers
        </Button>
        {onGraded === null ? null : (
          <Button variant="ink" onClick={onGraded}>
            Start a graded run
          </Button>
        )}
      </div>
    </div>
  )
}
