import { useContext, useId, type ReactNode } from 'react'
import { drawInBand } from '@es/play'
import { CARD_COPY } from '@es/play/verifier/cards'
import { VERIFIER_COPY } from '@es/play/verifier/copy'
import { fracText } from '@es/play/verifier/ratio'
import { verifierSession } from '@es/play/verifier/session'
import type { SweepRowView, VerifierView } from '@es/play/verifier/types'
import { Button } from '@/design/components/Button'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { Readout } from '@/design/components/Readout'
import { TextLink } from '@/design/components/TextLink'
import { formatReadout } from '@/design/format'
import { ranToEnd } from '@/evidence/ran'
import { useEvidence } from '@/evidence/useEvidence'
import { bestOf } from '@/games/kit/best'
import { Debrief as Result } from '@/games/kit/Debrief'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { verdictOf } from '@/games/kit/verdict'
import type { VerifierOutcome, VerifierRun } from './types'

/*
 * The rejection sampler's result (GAMES.md §10, "Core loop" 5; §2.1; REDESIGN §2.6): the kit's debrief, filled. The verdict word from the
 * grade, one sentence that says what the run did and what it names, the ways on (the next level first; in a lesson, the lesson's way on),
 * your answer against the reference's (the hidden reference, read only here), what the exact arithmetic says about the level, the one true
 * thing, and where the real engines stand. Every figure is a count out of 64 of a made-up world or a figure of its model, and carries its tag.
 *
 * The reference is the ghost: its run plays the same seed by the book through the same reducer. The rules that look right and are not are
 * the wrong samplers of the bestiary (sim/spec), each one's exact distance from p on this very pair. This file prints fractions as text and
 * imports nothing of the game's other files but types, so its chunk is loaded with the result and the route carries none of it.
 */

export interface DebriefProps {
  run: VerifierRun
  outcome: VerifierOutcome
  /** The level after this one, or null on the last. */
  next: { id: string; title: string } | null
  onNext: () => void
  /** Inside a lesson: the ways on are the lesson's, and none of them leaves it. */
  embedded?: boolean
  /** A graded run on a fresh seed, for a level that can be graded in practice. Null where it cannot, or when this run is graded. */
  onGraded: (() => void) | null
}

/** The wrong rules, in the engine's terms (GAMES.md §2.6, rule 2). */
const RULE_NAME: Readonly<Record<string, ReactNode>> = {
  'resample-from-p': 'Resample from p, the whole target',
  'resample-from-q': 'Resample from q, the draft',
  'p-without-draft': 'Resample from p with the rejected token taken out',
  'residual-off-by-one': 'Resample from the residual, one token along',
  'accept-if-p-over-q': 'Accept when p > q, with no random draw',
  'accept-everything': 'Accept every draft token, with no verifier',
}

/** The one true thing of each level, in a sentence (GAMES.md §10, "Module and concept"). */
const TAKEAWAY: Readonly<Record<VerifierView['level'], string>> = {
  overlap: 'The target accepts what it and the draft agree on: the overlap of the two distributions, min(p, q), is the share of the draft it accepts, and it is the acceptance rate α.',
  exact:
    'Accept each draft token with probability min(1, p ÷ q) and resample a rejection from the residual (p − q)⁺, and the output is the target\'s distribution exactly. Any other weights, even fair-looking ones, leave a bias, and the bias is a fact you can add up.',
  chain:
    'A round yields the target\'s own token plus every draft token the walk reaches and accepts, so each position adds the product of the acceptances up to it. A longer draft is worth only what the walk reaches.',
  'greedy-ngram':
    'At temperature zero speculation is a comparison: a draft token is accepted exactly when it is the target\'s arg max. A draft with no probabilities is a q with a single token, and the same exact rule accepts it as often as p likes that token and resamples from p with it taken out.',
  mutants:
    'A rule is exact when its accept step accepts exactly min(p, q) of the q draws and its resample is the residual. A sample cannot see a bias of one draw; checking every draw can, which is why the lab checks both.',
  gamma:
    'A longer draft pays only while the chance the walk reaches its last token, times the tokens it adds, outweighs the cost every round pays for it. So the best draft length is not the longest.',
}

/** Where the real engines stand on the level's idea: facts of the claims, each with its source and the day it was read. */
function Engines({ level, embedded }: { level: VerifierView['level']; embedded: boolean }) {
  const sampler = (
    <>
      vLLM&apos;s rejection sampler &quot;strictly follows&quot; the algorithm of{' '}
      <TextLink href="https://arxiv.org/abs/2211.17192">Leviathan, Kalman and Matias, arXiv 2211.17192</TextLink> (vLLM v0.33.0, claim vllm.spec.rejection-sampler.exact, read 2026-11-04).
    </>
  )
  const body: ReactNode =
    level === 'mutants' ? (
      <>
        A real exactness bug of this kind: SGLang pull request 35798, opened 2026-08-21, found a sampler that drew its random numbers from zero up to one but chose the bucket with{' '}
        <code>coin &lt;= cumulative_probability</code>, which at a draw of exactly zero accepts a draft token that the target rules out (claim sglang.spec.pr-35798, read 2026-11-04). {sampler}
      </>
    ) : level === 'chain' || level === 'gamma' ? (
      <>
        The paper&apos;s count of tokens per round is a capped geometric variable, (1 − α^(γ+1)) ÷ (1 − α) for one acceptance throughout (claim spec.paper.expected-tokens, read 2026-11-04). {sampler}
      </>
    ) : (
      <>
        {sampler} When every draft token is accepted, a bonus token is added, sampled from the target alone (claim vllm.spec.bonus-token, read 2026-11-04).
      </>
    )
  return (
    <section aria-label="In vLLM today" className="es-vf-engine">
      <h4>In vLLM today</h4>
      <p>{body}</p>
      {embedded ? null : (
        <p className="text-text-2">
          Next, build it: <TextLink to="/labs/rejection-sampler">the rejection-sampler lab</TextLink> drives your own sampler with seeded p, q and drafts and tests its output with the chi-square on twenty thousand rounds.
        </p>
      )}
    </section>
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
const frac = (value: { num: number; den: number }, approx?: number) => (
  <span className="font-numeric">
    {fracText(value)}
    {approx === undefined || value.num === 0 ? null : ` ≈ ${formatReadout(value.num / value.den, approx)}`}
  </span>
)

/** The weights against the reference's, token by token. */
function WeightsTable({ mine, reference, tokens }: { mine: readonly number[]; reference: readonly number[]; tokens: readonly string[] }) {
  return (
    <Table
      caption="Your weights against the reference's"
      columns={[
        { key: 'token', head: 'Token' },
        { key: 'yours', head: 'Yours (weights, synthetic)', numeric: true },
        { key: 'reference', head: 'The reference (weights, synthetic)', numeric: true },
      ]}
    >
      {tokens.map((name, x) => (
        <tr key={name}>
          <th scope="row" className={`${cell} text-left font-normal`}>
            {name}
          </th>
          <td className={`${cell} text-right`}>{num(mine[x])}</td>
          <td className={`${cell} text-right`}>{num(reference[x])}</td>
        </tr>
      ))}
    </Table>
  )
}

function SweepTable({ rows, pick }: { rows: readonly SweepRowView[]; pick: number }) {
  return (
    <Table
      caption="Every draft length, in tokens per round"
      columns={[
        { key: 'gamma', head: 'Draft length γ' },
        { key: 'tokens', head: 'Tokens a round (synthetic)', numeric: true },
        { key: 'cost', head: 'A round costs (target forwards, synthetic)', numeric: true },
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
  const reference = outcome.ghostView
  const first = view.rows[0]
  switch (view.level) {
    case 'overlap':
      return (
        <p>
          You predicted <Readout value={view.prediction ?? 0} tag="synthetic" size="sm" /> of 64. The target accepts <Readout value={facts.alphaPlates ?? 0} tag="synthetic" size="sm" /> of the 64
          {first?.alpha ? <> (α = {fracText(first.alpha)})</> : null}.
        </p>
      )
    case 'exact':
    case 'greedy-ngram':
      return (
        <>
          {view.level === 'greedy-ngram' && facts.favourite !== null ? (
            <p>
              At temperature zero the target emits <strong>{view.dishes[facts.favourite]}</strong>, so the n-gram&apos;s token is {facts.keptAtZero ? 'accepted' : 'rejected'}. You said it was {view.judged ? 'accepted' : 'rejected'}.
            </p>
          ) : null}
          <dl className="es-vf-facts">
            {facts.worst !== null ? (
              <div data-vf-furthest="">
                <dt>The token furthest out</dt>
                <dd>
                  <strong>{view.dishes[facts.worst]}</strong>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Your weights&apos; distance from p</dt>
              <dd>{view.meter !== null ? frac(view.meter.tv, 3) : 'no weights'}</dd>
            </div>
            <div>
              <dt>The reference&apos;s weights</dt>
              <dd>{frac({ num: 0, den: 1 })}</dd>
            </div>
          </dl>
          <WeightsTable mine={view.weights} reference={reference.weights} tokens={view.dishes} />
          {facts.rules !== null && facts.rules.length > 0 ? (
            <Table
              caption="Rules that look right and are not, on this very pair"
              columns={[
                { key: 'rule', head: 'The rule' },
                { key: 'tv', head: 'Distance from p', numeric: true },
              ]}
            >
              {facts.rules.map((rule) => (
                <tr key={rule.id}>
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    {RULE_NAME[rule.id] ?? rule.id}
                  </th>
                  <td className={`${cell} text-right`}>{frac(rule.tv, 3)}</td>
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
            <span>A round yields</span>
            {facts.tokens !== null ? <Readout value={facts.tokens.num / facts.tokens.den} digits={3} tag="derived" size="sm" /> : null}
            <span>tokens on average, exactly {facts.tokens === null ? '' : fracText(facts.tokens)}. You predicted</span>
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
            { key: 'tv', head: 'Distance from p', numeric: true },
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
                <td className={`${cell} text-right`}>{frac(row.tv, 4)}</td>
              </tr>
            )
          })}
        </Table>
      )
  }
}

/**
 * The learner's best on this level, from the ledger's runs of it, with its unit and whether a run has passed: a score is out of 1, and a
 * miss can score 0.99 on a level that passes only at exactly 0, so the number alone would read as a near pass. Rendered only on a page that
 * has a ledger.
 */
function Best({ level }: { level: string }) {
  const { ready, events } = useEvidence()
  if (!ready) return null
  const best = bestOf(events, 'verifier', level)
  if (best === null) return null
  const passed = events.some((event) => event.kind === 'play' && event.ref === `play:verifier/${level}` && event.ok === true && ranToEnd(event))
  return (
    <>
      {' '}
      Your best score on this level: <span className="font-numeric">{best.score.toFixed(2)}</span> out of 1, from {num(best.runs)} {best.runs === 1 ? 'run' : 'runs'};{' '}
      {passed ? 'a run of it has passed.' : 'no run has passed yet.'}
    </>
  )
}

/** A fresh seed the level's band accepts, from the browser's entropy: unseen, not secret. */
const drawFresh = (level: string): number => drawInBand(verifierSession, level, crypto.getRandomValues(new Uint32Array(1))[0])

export function Debrief({ run, outcome, next, onNext, embedded = false, onGraded }: DebriefProps) {
  const againId = useId()
  const { view } = run
  const { debrief, grade } = outcome
  const verdict = verdictOf(grade, VERIFIER_COPY[view.level].passRule !== undefined)
  const newNumbers = () => run.restart(drawFresh(view.level))
  // In a lesson, the lesson's way on leads the result, and none of the ways on leaves the lesson.
  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null

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
    <Result
      className="es-vf-debrief"
      verdict={verdict}
      sentence={debrief.sentence}
      actions={
        <>
          {primary}
          <Button variant="quiet" aria-describedby={againId} onClick={() => (run.mode === 'graded' ? newNumbers() : run.restart())}>
            Run again
          </Button>
          {/* In a graded or Prove run Run again already draws fresh numbers, so a second button that does the same is left out. */}
          {run.mode === 'graded' ? null : (
            <Button variant="quiet" onClick={newNumbers}>
              New numbers
            </Button>
          )}
          {onGraded === null ? null : (
            <Button variant="quiet" onClick={onGraded}>
              Start a graded run
            </Button>
          )}
        </>
      }
    >
      <div className="es-vf-debrief__body" data-verifier-debrief="">
        <p id={againId} data-run-again="">
          <strong>Run again:</strong> the level asks the same question on {run.mode === 'graded' ? 'fresh numbers.' : 'the same numbers; New numbers draws a fresh pair of distributions.'}
          {run.ledger ? <Best level={view.level} /> : null}
        </p>
        <p className="es-vf-debrief__stamp">The figures below are of a made-up world.</p>
        <Facts run={run} outcome={outcome} />
        <p className="font-bold" data-vf-takeaway="">
          {TAKEAWAY[view.level]}
        </p>
        <Engines level={view.level} embedded={embedded} />
      </div>
    </Result>
  )
}
