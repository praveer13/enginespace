import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CARD_COPY } from '@es/play/verifier/cards'
import { ASK_WORDS } from '@es/play/verifier/copy'
import { MUTANT_IDS, PLATES } from '@es/play/verifier/types'
import type { CardView, MutantId, VerifierAction, VerifierView } from '@es/play/verifier/types'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Marker } from '@/design/components/Marker'
import { StationLight } from '@/design/components/StationLight'
import { formatReadout } from '@/design/format'
import { sameAction } from '@/games/kit/first-move'
import { changeLine } from './announce'
import { showDraws, showMeter } from './rules'
import { Stepper } from './Stepper'
import type { VerifierRun } from './types'

/*
 * The rejection sampler's dock (REDESIGN §2.6, GAMES.md §10 "Controls"): the level's own ask, then the controls it needs. HTML for every
 * action, so a pointer, a keyboard and a screen reader all reach the same things. What is in the dock is the level's pending decision
 * (`view.ask`):
 *
 *   predict-plates / predict-tokens   a number field, and Commit. Enter in the field commits. There is no skip: the session needs the
 *                                     prediction before a round is drawn, and the dock says so.
 *   finish                            the prediction is in: draw rounds to watch it, then Finish.
 *   judge                             at temperature 0, is the n-gram's token accepted?
 *   recipe                            a weight for each token, the weights a rejected token is resampled from, and Submit.
 *   audit                             five cards: sample a rule, check every draw of its accept step, name its bug.
 *   choose-gamma                      the draft length, and Submit.
 *
 * When the pending decision changes, focus moves to the control that begins the next one (`data-vf-autofocus`), so a keyboard never loses
 * its place; a level that has just opened does not take focus, because the game does (the frame). A submission is the learner's, with the
 * button or with Enter, and a graded one is final: there is no undo, and the frame offers none.
 *
 * The first run (REDESIGN §2.6) holds the level's own ask back until the parts have been named and one token's bars looked at, and then puts
 * the amber ring on the level's first move.
 */

/** The batches of rounds a learner can draw [estimated]. */
export const BATCHES = [10, 100, 1000] as const

/** The control the intro points at, in the marker's ring; any other control as it is. */
function Ringed({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return children
  return (
    <Marker kind="ring" word="first move" className="es-vf-dock__ring">
      {children}
    </Marker>
  )
}

const ringOn = (run: VerifierRun, action: VerifierAction) => sameAction(run.intro.ring, action)

function DrawBar({ run }: { run: VerifierRun }) {
  const { view, dispatch } = run
  return (
    <div role="group" aria-label="Draw rounds" className="es-vf-draws" data-vf-draws="">
      {BATCHES.map((n, i) => (
        <Ringed key={n} on={ringOn(run, { t: 'draw', n })}>
          <Button size="md" data-vf-autofocus={i === 0 || undefined} disabled={view.drawsLeft < n || !view.canDraw} aria-keyshortcuts={i === 0 ? 'D' : undefined} onClick={() => dispatch({ t: 'draw', n })}>
            Draw {formatReadout(n)}
          </Button>
        </Ringed>
      ))}
    </div>
  )
}

/** A prediction as a number: whole sixty-fourths, or tokens per round to the thousandth. */
function Predict({ run, shares }: { run: VerifierRun; shares: boolean }) {
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const id = useId()
  const typed = text.trim() === '' ? null : Number(text)
  const valid = typed !== null && Number.isFinite(typed) && (shares ? Number.isInteger(typed) && typed >= 0 && typed <= PLATES : typed >= 1 && typed < 100)
  const problem = tried && !valid ? (shares ? 'A whole number of sixty-fourths, from 0 to 64.' : 'A number of tokens, at least one.') : undefined

  function commit() {
    setTried(true)
    if (valid && typed !== null) run.dispatch({ t: 'commit', prediction: shares ? typed : Math.round(typed * 1000) })
  }

  return (
    <form
      className="es-vf-dock__form"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <Field
        id={id}
        numeric
        label={shares ? 'Accepted, in sixty-fourths' : 'Tokens per round'}
        hint={shares ? 'Of the 64. Count what the draft and the target bars share, token by token.' : 'On average. A decimal is fine: within one part in a hundred passes.'}
        error={problem}
        type="number"
        min={shares ? 0 : 1}
        max={shares ? PLATES : 99}
        step={shares ? 1 : 0.001}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button type="submit" variant="ink" size="lg">
        Commit
      </Button>
      <p className="es-vf-dock__note" data-vf-noskip="">
        No skip here: the grade needs your prediction before any round is drawn, since a drawn round would show it.
      </p>
    </form>
  )
}

function Finish({ run }: { run: VerifierRun }) {
  return (
    <div className="es-vf-dock__stack">
      <p className="es-vf-dock__text">Your prediction is committed. Draw rounds to watch the accepted share settle, or finish.</p>
      {/* The draws and Finish, the control that ends the level, stand as one block of whole buttons, so a phone's dock never hides Finish
          under the draws (P5, verifier.css). */}
      <div className="es-vf-dock__row es-vf-dock__finish">
        {showDraws(run) ? <DrawBar run={run} /> : null}
        <Button variant="ink" size="lg" onClick={() => run.dispatch({ t: 'submit' })}>
          Finish
        </Button>
      </div>
    </div>
  )
}

function Judge({ run }: { run: VerifierRun }) {
  return (
    <div role="group" aria-label="At temperature zero, is the n-gram's token accepted?" className="es-vf-dock__row">
      <Button size="lg" data-vf-autofocus="" onClick={() => run.dispatch({ t: 'judge', kept: true })}>
        Accepted
      </Button>
      <Button size="lg" onClick={() => run.dispatch({ t: 'judge', kept: false })}>
        Rejected
      </Button>
    </div>
  )
}

/** The weights: one for each token, the arrow keys moving across them. */
function Weights({ run }: { run: VerifierRun }) {
  const { view, dispatch } = run
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const base = useId()
  const meter = showMeter(run)
  const submit = () => {
    if (view.weightTotal > 0) dispatch({ t: 'submit' })
  }
  return (
    <div className="es-vf-dock__stack">
      <ol className="es-vf-recipe" aria-label="Resample weights, one for each token" data-vf-recipe="">
        {view.dishes.map((name, token) => (
          <li key={name} className="es-vf-dish">
            <Ringed on={ringOn(run, { t: 'sculpt', token, delta: 1 })}>
              <Stepper
                id={`${base}-${token}`}
                label={name}
                name={`Resample weight for ${name}`}
                moreLabel={`Add one to ${name}`}
                lessLabel={`Take one from ${name}`}
                dish={token}
                value={view.weights[token]}
                min={0}
                max={PLATES}
                inputRef={(element) => {
                  inputs.current[token] = element
                }}
                autoFocusTarget={token === 0}
                onChange={(next) => dispatch({ t: 'sculpt', token, delta: next - view.weights[token] })}
                onArrow={(direction) => inputs.current[Math.max(0, Math.min(view.dishes.length - 1, token + direction))]?.focus()}
                onEnter={submit}
              />
            </Ringed>
          </li>
        ))}
      </ol>
      <div className="es-vf-dock__row">
        <Button variant="ink" size="lg" disabled={view.weightTotal === 0} aria-keyshortcuts="Enter" onClick={submit}>
          Submit the weights
        </Button>
        {meter && view.meter !== null ? <StationLight lit={view.meter.exact} label="The output is p" words={{ lit: 'exact', dark: 'not yet', fault: 'fault' }} size="sm" /> : null}
      </div>
      <p className="es-vf-dock__note">Arrows move across the tokens; plus and minus change a weight. Only the proportions count.</p>
      <div className="es-vf-dock__row">
        {meter ? (
          <div role="group" aria-label="Start the weights from" className="es-vf-dock__row">
            <Button size="sm" onClick={() => dispatch({ t: 'preset', from: 'p' })}>
              Start from p
            </Button>
            <Button size="sm" onClick={() => dispatch({ t: 'preset', from: 'q' })}>
              Start from q
            </Button>
          </div>
        ) : null}
        {showDraws(run) ? <DrawBar run={run} /> : null}
      </div>
    </div>
  )
}

function Card({ run, card }: { run: VerifierRun; card: CardView }) {
  const { dispatch } = run
  const id = useId()
  const taste = card.taste
  const coins = card.coins
  return (
    <div className="es-vf-card" data-vf-card={card.index}>
      <h4 className="es-vf-card__head">Card {card.index + 1}</h4>
      <p>
        <strong>Accept.</strong> {card.accept}
      </p>
      <p>
        <strong>Resample.</strong> {card.recover}
      </p>
      <div className="es-vf-card__tools">
        <Ringed on={ringOn(run, { t: 'taste', card: card.index })}>
          <Button size="sm" data-vf-autofocus={card.index === 0 || undefined} onClick={() => dispatch({ t: 'taste', card: card.index })}>
            Sample {formatReadout(20_000)}
          </Button>
        </Ringed>
        <Button size="sm" onClick={() => dispatch({ t: 'coins', card: card.index })}>
          Check every draw
        </Button>
      </div>
      {taste !== null ? (
        <p className="es-vf-card__result" data-result="taste">
          Sample: χ² <span className="font-numeric">{formatReadout(taste.stat, 1)}</span> against the lab&apos;s line at <span className="font-numeric">{formatReadout(taste.critical, 1)}</span>, so it is{' '}
          {taste.rejected ? 'rejected' : 'not rejected'}.
        </p>
      ) : null}
      {coins !== null ? (
        <p className="es-vf-card__result" data-result="coins">
          Draws:{' '}
          {coins.length === 0
            ? 'every token accepts exactly as many draws as it should.'
            : coins.map((c) => `${run.view.dishes[c.token]} accepts ${formatReadout(c.kept)} of ${formatReadout(c.of)}, and should accept ${formatReadout(c.should)}`).join('; ') + '.'}
        </p>
      ) : null}
      <label htmlFor={id} className="es-vf-card__name">
        <span>Name the bug</span>
        <select
          id={id}
          className="es-vf-select"
          aria-label={`Name the bug of card ${card.index + 1}`}
          value={card.label ?? ''}
          onChange={(event) => dispatch({ t: 'label', card: card.index, bug: event.target.value === '' ? null : (event.target.value as MutantId) })}
        >
          <option value="">Choose a bug</option>
          {MUTANT_IDS.map((bug) => (
            <option key={bug} value={bug}>
              {CARD_COPY[bug].bug}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function Audit({ run }: { run: VerifierRun }) {
  const cards = run.view.cards ?? []
  const named = cards.every((card) => card.label !== null)
  return (
    <div className="es-vf-dock__stack">
      <ul className="es-vf-cards">
        {cards.map((card) => (
          <li key={card.index} className="min-w-0">
            <Card run={run} card={card} />
          </li>
        ))}
      </ul>
      <div className="es-vf-dock__row">
        <Button variant="ink" size="lg" disabled={!named} aria-keyshortcuts="Enter" onClick={() => run.dispatch({ t: 'submit' })}>
          Submit the five names
        </Button>
        {named ? null : <span className="es-vf-dock__note">Name the bug in every card first.</span>}
      </div>
    </div>
  )
}

function Gamma({ run }: { run: VerifierRun }) {
  const { view, dispatch } = run
  const gamma = view.gamma
  const id = useId()
  if (gamma === null) return null
  const set = (k: number) => dispatch({ t: 'gamma', k })
  return (
    <div className="es-vf-dock__row">
      <Ringed on={ringOn(run, { t: 'gamma', k: 1 })}>
        <Stepper
          id={id}
          layout="row"
          label="draft length · γ"
          name="Draft length, tokens proposed"
          moreLabel="Propose one more token"
          lessLabel="Propose one token fewer"
          value={gamma.pick >= 1 ? gamma.pick : null}
          min={1}
          max={gamma.max}
          big={2}
          autoFocusTarget
          onChange={set}
          onEnter={() => gamma.pick >= 1 && dispatch({ t: 'submit' })}
        />
      </Ringed>
      <Button variant="ink" size="lg" disabled={gamma.pick < 1} aria-keyshortcuts="Enter" onClick={() => dispatch({ t: 'submit' })}>
        Submit γ
      </Button>
    </div>
  )
}

/** The announcement for every change of the view, once the first one has been seen. */
function useAnnouncements(run: VerifierRun): void {
  const seen = useRef<VerifierView | null>(null)
  const { view, announce } = run
  const meter = showMeter(run)
  useEffect(() => {
    const before = seen.current
    seen.current = view
    if (before === null) return
    const line = changeLine(before, view, meter)
    if (line !== '') announce(line)
  }, [view, announce, meter])
}

const HEADLINES = {
  'predict-plates': 'Your prediction',
  'predict-tokens': 'Your prediction',
  finish: 'Draw rounds, then finish',
  judge: 'At temperature zero',
  recipe: 'Weights to resample from',
  audit: 'Name the five bugs',
  'choose-gamma': 'Choose the draft length',
} as const

export function Controls({ run }: { run: VerifierRun }) {
  const { view } = run
  useAnnouncements(run)
  const kind = view.ask?.kind ?? null
  const container = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // A change of the pending decision moves focus to the control that begins the next one. The first render and a new level do not.
  const shown = useRef(kind)
  useEffect(() => {
    if (shown.current === kind) return
    const was = shown.current
    shown.current = kind
    if (kind === null || was === null) return
    const next = container.current?.querySelector<HTMLElement>('[data-vf-autofocus]:not(:disabled)')
    next?.focus({ preventScroll: true })
    // The page moves no more than it takes to show the control: on a tall level the next decision opens below the first screen.
    next?.scrollIntoView({ block: 'nearest' })
  }, [kind])

  if (run.done || kind === null) return null
  // The level's own ask waits for the parts and the look (P4: name, then ask).
  const waiting = !run.intro.askShown
  return (
    <div className="es-vf-dock" data-verifier-controls="" data-ask={kind} ref={container}>
      <section aria-labelledby={titleId} className="es-vf-dock__section">
        <h3 id={titleId} className="es-vf-dock__title">
          {HEADLINES[kind]}
        </h3>
        {waiting ? (
          <p className="es-vf-dock__text" data-vf-held="">
            The first decision opens once the parts are named and you have looked at one token.
          </p>
        ) : (
          <>
            {kind === 'finish' ? null : (
              <p className="es-vf-dock__text" data-verifier-prompt="">
                {ASK_WORDS[view.level]}
              </p>
            )}
            {kind === 'predict-plates' ? <Predict run={run} shares /> : null}
            {kind === 'predict-tokens' ? <Predict run={run} shares={false} /> : null}
            {kind === 'finish' ? <Finish run={run} /> : null}
            {kind === 'judge' ? <Judge run={run} /> : null}
            {kind === 'recipe' ? <Weights run={run} /> : null}
            {kind === 'audit' ? <Audit run={run} /> : null}
            {kind === 'choose-gamma' ? <Gamma run={run} /> : null}
          </>
        )}
      </section>
    </div>
  )
}
