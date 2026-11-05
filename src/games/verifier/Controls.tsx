import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CARD_COPY } from '@es/play/verifier/cards'
import { MUTANT_IDS, PLATES } from '@es/play/verifier/types'
import type { CardView, MutantId, VerifierView } from '@es/play/verifier/types'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { changeLine } from './announce'
import { showDraws, showMeter } from './rules'
import { Stepper } from './Stepper'
import type { VerifierRun } from './types'

/*
 * The Tasting's controls (GAMES.md §10, "Controls"): HTML for every action, so a pointer, a keyboard and a screen reader all reach the same
 * things. What is on the page is the level's pending decision (`view.ask`):
 *
 *   predict-plates / predict-tokens   a number field, and Commit. Enter in the field commits.
 *   finish                            the prediction is in: draw rounds to watch it, then Finish.
 *   judge                             at temperature 0, is the copier's plate kept or sent back?
 *   recipe                            a weight for each dish, the recipe the chef re-plates from, and Submit.
 *   audit                             five cards: taste a rule, check every coin of its accept step, name its bug.
 *   choose-gamma                      the draft length, and Serve it.
 *
 * When the pending decision changes, focus moves to the control that begins the next one (`data-vf-autofocus`), so a keyboard never loses
 * its place; a level that has just opened does not take focus, because the game does (the shell). A submission is the learner's, with the
 * button or with Enter, and a graded one is final: there is no undo, and the shell offers none.
 */

/** The batches of rounds a learner can draw [estimated]. */
export const BATCHES = [10, 100, 1000] as const

function DrawBar({ run }: { run: VerifierRun }) {
  const { view, dispatch } = run
  return (
    <div role="group" aria-label="Draw rounds" className="es-vf-draws" data-vf-draws="">
      {BATCHES.map((n, i) => (
        <Button key={n} size="md" data-vf-autofocus={i === 0 || undefined} disabled={view.drawsLeft < n || !view.canDraw} aria-keyshortcuts={i === 0 ? 'D' : undefined} onClick={() => dispatch({ t: 'draw', n })}>
          Draw {formatReadout(n)}
        </Button>
      ))}
    </div>
  )
}

/** A prediction as a number: whole plates, or courses per round to the thousandth. */
function Predict({ run, plates }: { run: VerifierRun; plates: boolean }) {
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const id = useId()
  const typed = text.trim() === '' ? null : Number(text)
  const valid = typed !== null && Number.isFinite(typed) && (plates ? Number.isInteger(typed) && typed >= 0 && typed <= PLATES : typed >= 1 && typed < 100)
  const problem = tried && !valid ? (plates ? 'Whole plates, from none to sixty-four.' : 'A number of courses, at least one.') : undefined

  function commit() {
    setTried(true)
    if (valid && typed !== null) run.dispatch({ t: 'commit', prediction: plates ? typed : Math.round(typed * 1000) })
  }

  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <Field
        id={id}
        numeric
        label={plates ? 'Plates kept' : 'Courses per round'}
        hint={plates ? 'Of the sixty-four. Count the plates both stacks share.' : 'On average. A decimal is fine: within one part in a hundred passes.'}
        error={problem}
        type="number"
        min={plates ? 0 : 1}
        max={plates ? PLATES : 99}
        step={plates ? 1 : 0.001}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button type="submit" variant="ink" size="lg">
        Commit
      </Button>
    </form>
  )
}

function Finish({ run }: { run: VerifierRun }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-text-2">Your prediction is committed. Draw some rounds to watch it, or finish.</p>
      <div className="flex flex-wrap items-center gap-3">
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
    <div role="group" aria-label="At temperature zero, is the copier's plate kept?" className="flex flex-wrap items-center gap-3">
      <Button size="lg" data-vf-autofocus="" onClick={() => run.dispatch({ t: 'judge', kept: true })}>
        Kept
      </Button>
      <Button size="lg" onClick={() => run.dispatch({ t: 'judge', kept: false })}>
        Sent back
      </Button>
    </div>
  )
}

/** The recipe: a weight for each dish, the arrow keys moving across them. */
function Recipe({ run }: { run: VerifierRun }) {
  const { view, dispatch } = run
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const base = useId()
  const meter = showMeter(run)
  const submit = () => {
    if (view.weightTotal > 0) dispatch({ t: 'submit' })
  }
  return (
    <div className="flex flex-col gap-4">
      <ol className="es-vf-recipe" aria-label="Recipe weights, one for each dish" data-vf-recipe="">
        {view.dishes.map((name, token) => (
          <li key={name} className="es-vf-dish">
            <Stepper
              id={`${base}-${token}`}
              label={name}
              name={`Recipe weight for ${name}`}
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
          </li>
        ))}
      </ol>
      <p className="text-text-2">Arrows move across the dishes, and plus and minus (or up and down) change a weight. Only the proportions count.</p>
      <div className="flex flex-wrap items-center gap-3">
        {meter ? (
          <div role="group" aria-label="Start the recipe from" className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => dispatch({ t: 'preset', from: 'p' })}>
              Start from p
            </Button>
            <Button size="sm" onClick={() => dispatch({ t: 'preset', from: 'q' })}>
              Start from q
            </Button>
          </div>
        ) : null}
        {showDraws(run) ? <DrawBar run={run} /> : null}
        <Button variant="ink" size="lg" disabled={view.weightTotal === 0} aria-keyshortcuts="Enter" onClick={submit}>
          Submit the recipe
        </Button>
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
    <Ticket as="div" compact hole={false} width="full" head={`Card ${card.index + 1}`} className="es-vf-card" data-vf-card={card.index}>
      <p>
        <strong>Accept.</strong> {card.accept}
      </p>
      <p>
        <strong>Recover.</strong> {card.recover}
      </p>
      <div className="es-vf-card__tools">
        <Button size="sm" data-vf-autofocus={card.index === 0 || undefined} onClick={() => dispatch({ t: 'taste', card: card.index })}>
          Taste {formatReadout(20_000)}
        </Button>
        <Button size="sm" onClick={() => dispatch({ t: 'coins', card: card.index })}>
          Check every coin
        </Button>
      </div>
      {taste !== null ? (
        <p className="es-vf-card__result" data-result="taste">
          Taste: χ² <span className="font-numeric">{formatReadout(taste.stat, 1)}</span> against the lab&apos;s line at <span className="font-numeric">{formatReadout(taste.critical, 1)}</span>, so it is {taste.rejected ? 'rejected' : 'not rejected'}.
        </p>
      ) : null}
      {coins !== null ? (
        <p className="es-vf-card__result" data-result="coins">
          Coins:{' '}
          {coins.length === 0
            ? 'every dish keeps exactly as many as it should.'
            : coins.map((c) => `${run.view.dishes[c.token]} keeps ${formatReadout(c.kept)} of ${formatReadout(c.of)}, and should keep ${formatReadout(c.should)}`).join('; ') + '.'}
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
    </Ticket>
  )
}

function Audit({ run }: { run: VerifierRun }) {
  const cards = run.view.cards ?? []
  const named = cards.every((card) => card.label !== null)
  return (
    <div className="flex flex-col gap-4">
      <ul className="es-vf-cards">
        {cards.map((card) => (
          <li key={card.index} className="min-w-0">
            <Card run={run} card={card} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ink" size="lg" disabled={!named} aria-keyshortcuts="Enter" onClick={() => run.dispatch({ t: 'submit' })}>
          Submit the five names
        </Button>
        {named ? null : <span className="text-text-2">Name the bug in every card first.</span>}
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
    <div className="flex flex-wrap items-end gap-4">
      <Stepper
        id={id}
        layout="row"
        label="plates ahead · γ"
        name="Draft length, plates ahead"
        moreLabel="Plate one course further ahead"
        lessLabel="Plate one course fewer ahead"
        value={gamma.pick >= 1 ? gamma.pick : null}
        min={1}
        max={gamma.max}
        big={2}
        autoFocusTarget
        onChange={set}
        onEnter={() => gamma.pick >= 1 && dispatch({ t: 'submit' })}
      />
      <Button variant="ink" size="lg" disabled={gamma.pick < 1} aria-keyshortcuts="Enter" onClick={() => dispatch({ t: 'submit' })}>
        Serve it
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

export function Controls({ run, rail }: { run: VerifierRun; rail?: ReactNode }) {
  const { view } = run
  useAnnouncements(run)
  const kind = view.ask?.kind ?? null
  const container = useRef<HTMLDivElement>(null)

  // A change of the pending decision moves focus to the control that begins the next one. The first render and a new level do not.
  const shown = useRef(kind)
  useEffect(() => {
    if (shown.current === kind) return
    const was = shown.current
    shown.current = kind
    if (kind === null || was === null) return
    container.current?.querySelector<HTMLElement>('[data-vf-autofocus]:not(:disabled)')?.focus({ preventScroll: true })
  }, [kind])

  // The run is over: focus goes to the way on, which the shell prints under the controls.
  const ended = useRef(run.done)
  useEffect(() => {
    if (ended.current === run.done) return
    ended.current = run.done
    if (run.done) document.querySelector<HTMLElement>('[data-end] button')?.focus({ preventScroll: true })
  }, [run.done])

  return (
    <div className="flex flex-col gap-5" data-verifier-controls="" data-ask={kind ?? 'none'} ref={container}>
      <p className="es-type-body max-w-prose" data-verifier-prompt="">
        {view.prompt}
      </p>
      {kind === 'predict-plates' ? <Predict run={run} plates /> : null}
      {kind === 'predict-tokens' ? <Predict run={run} plates={false} /> : null}
      {kind === 'finish' ? <Finish run={run} /> : null}
      {kind === 'judge' ? <Judge run={run} /> : null}
      {kind === 'recipe' ? <Recipe run={run} /> : null}
      {kind === 'audit' ? <Audit run={run} /> : null}
      {kind === 'choose-gamma' ? <Gamma run={run} /> : null}
      {rail}
    </div>
  )
}
