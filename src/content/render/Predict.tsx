import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, Ref } from 'react'
import type { CompiledBlock } from '@es/schema'
import { CONFIDENCE_NAMES } from '@es/play/items/types'
import type { Confidence } from '@es/play/items/types'
import { isAnswered, isAtCommit, NO_BLOCK, planOf } from '@es/play/predictions/plan'
import type { Answered, Held } from '@es/play/predictions/plan'
import { rosterEntry } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import type { Of } from './BlockFrame'
import { answeringBlock, decimals } from './model'
import { useEvidence } from '@/evidence/useEvidence'
import { commitPrediction, phaseOf, restorePrediction, revealPrediction, usePrediction } from './predicted'
import type { Commitment, Phase, Revealed } from './predicted'
import { latestSeq, useBlockRun } from './runs'
import { optionText, readSlip, unitName } from './slip'
import { SurePlates } from './Sure'
import type { Slip } from './slip'
import { Tagged } from './Tagged'

/*
 * A lesson's `predict` block, a guess (REDESIGN §2.5; W1b-T02, R-T09, R-T10): one answer before the run, and a reveal.
 *
 *   - It takes the answer the block asks for: a number within its tolerance, one option of a few, or a range. How sure the learner is
 *     is optional, and never gates. A committed guess cannot change (predicted.ts): "Locked in: 300 pages, think so."
 *   - A guess a run answers is revealed when a run of that level ends after the commit: the pure model reads the answer from the run
 *     (reveal.ts, loaded then) and the guess shows it beside what was written. Where it sits is the page's choice (sections.ts):
 *       `above`   in the run's guess slot, just above the instrument;
 *       `paired`  the level's opening guess asks the same quantity (same.ts), so the instrument's slot asks it in the lesson's words, and
 *                 this block shows only what follows the commit, under the instrument;
 *       `written` where the author wrote it, when its run is further down: after commit it says which run answers it.
 *   - A guess revealed at commit (D-067) shows its answer and the working the moment it is committed.
 *   - A question with no answer to show is held: its stem, and no input and no lock.
 *
 * A prediction moves no completion and no credit (ASSESSMENT §4.7). Nothing here is a heading: a guess is part of the run or the part it
 * sits in, and the page's headings are its sections and parts.
 */

type PredictBlock = Of<'predict'>
export type GuessSlot = 'written' | 'above' | 'paired'

export interface PredictTicketProps {
  block: PredictBlock
  /** The lesson's id: the event's ref, and what the page's runs are found by. */
  scope: string
  /** The block's place among the page's blocks, and the page's blocks, to find the game block that answers it. */
  at: number
  blocks: readonly CompiledBlock[]
  /** The lesson's content revision, which the event carries (A§4.2). */
  rev?: string
  slot?: GuessSlot
  /** For a guess left where it was written: the run that answers it, in words ("the run in part 4"). */
  where?: string
  /** The box's title where the run asks more than one guess: "Guess 1 of 2, before this run". */
  label?: string
}

/**
 * A guess revealed on an earlier visit is read back from its `predict` event once the ledger is open: the box shows what was written and the
 * answer, as the lesson record lists them, and does not ask again. The event holds no working and no run, so the reveal says where it came from.
 */
function useRestored(block: PredictBlock, scope: string) {
  const { ready, events } = useEvidence()
  useEffect(() => {
    if (!ready) return
    const ref = `predict:${scope}#${block.id}`
    let last: (typeof events)[number] | undefined
    for (const event of events) if (event.kind === 'predict' && event.ref === ref && (last === undefined || event.at >= last.at)) last = event
    if (last === undefined || last.kind !== 'predict') return
    const { value, truth } = last.data
    // The ledger keeps an interval's truth as the degenerate interval at the true value (reveal.ts), and the reveal prints the value.
    const shown = typeof truth === 'object' ? truth.lo : truth
    restorePrediction(
      scope,
      block.id,
      { value, conf: last.conf ?? null, after: Number.POSITIVE_INFINITY },
      { truth: shown, ok: last.ok, score: last.score, reads: '', run: null, working: [], sources: [], tag: null, unsaved: null, restored: true },
    )
  }, [ready, events, block, scope])
}

export function PredictTicket(props: PredictTicketProps) {
  useRestored(props.block, props.scope)
  return <Ticket {...props} />
}

function Ticket({ block, scope, at, blocks, rev, slot = 'written', where, label }: PredictTicketProps) {
  const plan = planOf(block.id)
  if (isAtCommit(plan)) return <AtCommitTicket block={block} scope={scope} rev={rev} />
  if (!isAnswered(plan)) return <HeldTicket block={block} held={plan} />
  const place = answeringBlock(blocks, at, plan)
  // A row that names a block the lesson does not have cannot be revealed after a run: the question is held, until the table is put right.
  if (place < 0) return <HeldTicket block={block} held={NO_BLOCK} />
  const mode = (blocks[place] as Of<'game'>).mode
  return <AnsweredTicket block={block} scope={scope} rev={rev} plan={plan} place={place} mode={mode} slot={slot} where={where} title={label} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What every phase prints                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A number as the page prints it: thousands grouped, to the places it was written with. */
const formatReadout = (value: number, places: number): string => value.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })

/** 0.15 as 15, without the 15.000000000000002 that multiplying gives. */
const percent = (ratio: number): number => Number((ratio * 100).toPrecision(12))

/** What counts as right, in words. */
function Tolerance({ block }: { block: PredictBlock }) {
  const { answer } = block
  if (answer.kind !== 'numeric') return null
  return <p className="es-guess__rule">{answer.rel_tol === 0 ? 'Only the exact value counts as right.' : `Within ${percent(answer.rel_tol)}% of the answer counts as right.`}</p>
}

/** The model's number, whole when it is whole and to two places when it is not. */
const rounded = (value: number): number => Number(value.toFixed(2))

/** A figure in a unit: "260 pages". */
function figureText(value: number, unit: string): string {
  const shown = unitName(unit)
  return `${formatReadout(value, decimals(value))}${shown === '%' ? '' : ' '}${shown}`
}

/** What the learner wrote, as text. */
function wroteText(block: PredictBlock, value: Commitment['value']): string {
  const { answer } = block
  if (answer.kind === 'choice') return optionText(block, String(value))
  if (typeof value === 'object') {
    const unit = unitName(answer.unit)
    return `${formatReadout(value.lo, decimals(value.lo))} to ${formatReadout(value.hi, decimals(value.hi))}${unit === '%' ? '' : ' '}${unit}`
  }
  return figureText(Number(value), answer.unit)
}

/** "you wrote", what the caller adds, and "you said". */
function Written({ block, committed, extra }: { block: PredictBlock; committed: Commitment; extra?: ReactNode }) {
  const value = committed.value
  return (
    <dl className="es-guess__keys">
      <div>
        <dt>you wrote</dt>
        <dd>
          <data className="es-guess__yours" value={typeof value === 'object' ? `${value.lo} ${value.hi}` : String(value)}>
            {wroteText(block, value)}
          </data>
        </dd>
      </div>
      {extra}
      {committed.conf === null ? null : (
        <div>
          <dt>you said</dt>
          <dd>{CONFIDENCE_NAMES[committed.conf]}</dd>
        </div>
      )}
    </dl>
  )
}

/** "Locked in: 300 pages, think so. It does not change now." */
function LockedIn({ block, committed, then, headingRef }: { block: PredictBlock; committed: Commitment; then: ReactNode; headingRef?: Ref<HTMLParagraphElement> }) {
  const sure = committed.conf === null ? '' : `, ${CONFIDENCE_NAMES[committed.conf]}`
  return (
    <>
      <p className="es-guess__locked" tabIndex={-1} ref={headingRef}>
        <Icon name="lock" />
        <span>
          Locked in: {wroteText(block, committed.value)}
          {sure}. It does not change now.
        </span>
      </p>
      <p className="es-guess__status" role="status">
        {then}
      </p>
    </>
  )
}

/** The note printed when the ledger would not take the event. The reveal stands; the learner is told, and knows what to do. */
function Unsaved({ detail }: { detail: string }) {
  return (
    <p className="es-guess__problem" role="status">
      <Icon name="alert" />
      <span>This guess was not saved. {detail} Reload the page to keep your guesses.</span>
    </p>
  )
}

/** The guess's frame: the label, then the stem, then whatever the phase holds. Data attributes say the phase, for a test and a style. */
function GuessFrame({ block, label, data, children }: { block: PredictBlock; label: string; data: Record<string, string | undefined>; children: ReactNode }) {
  const attributes = Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]))
  return (
    <section className="es-guess" data-block="predict" data-predict={block.id} role="group" aria-label={label} {...attributes}>
      <p className="es-guess__label">{label}</p>
      <p className="es-guess__ask">
        <Tagged text={block.prompt} />
      </p>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A question to hold                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A question with no answer to show: the stem, the lines of a choice, and why. It takes no input, and nothing on it is locked. */
function HeldTicket({ block, held }: { block: PredictBlock; held: Held }) {
  const { answer } = block
  return (
    <GuessFrame block={block} label="A question to hold" data={{ phase: 'held' }}>
      {answer.kind === 'choice' ? (
        <ol className="es-guess__options">
          {answer.options.map((option) => (
            <li key={option.id}>{option.text}</li>
          ))}
        </ol>
      ) : null}
      <p className="es-guess__status">{held.why}</p>
    </GuessFrame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Asking                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

interface SlipFieldsProps {
  block: PredictBlock
  slip: Slip
  problem: string | null
  onSlip: (slip: Slip) => void
  onSubmit: () => void
}

/** The slip the learner writes on: a number, one line ticked, or the two ends of a range. */
function SlipFields({ block, slip, problem, onSlip, onSubmit }: SlipFieldsProps) {
  const name = useId()
  const { answer } = block
  // Enter on a field commits, as it checks an item.
  const enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }
  if (answer.kind === 'choice') {
    return (
      <fieldset className="es-guess__choice" aria-describedby={problem === null ? undefined : `${name}-problem`}>
        <legend className="es-guess__legend">Your pick</legend>
        {answer.options.map((option) => (
          <label key={option.id} className="es-guess__option">
            {/* The click sets the pick too: a re-render between a pointer's focus and its click would otherwise leave React's change tracker behind. */}
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={slip.pick === option.id}
              onChange={() => onSlip({ ...slip, pick: option.id })}
              onClick={() => slip.pick !== option.id && onSlip({ ...slip, pick: option.id })}
            />
            <span>{option.text}</span>
          </label>
        ))}
        {problem === null ? null : (
          <p className="es-guess__problem" id={`${name}-problem`} role="alert">
            <Icon name="alert" />
            <span>{problem}</span>
          </p>
        )}
      </fieldset>
    )
  }
  const hint = `in ${unitName(answer.unit)}`
  const typing = { numeric: true, placeholder: 'write it here', autoComplete: 'off', autoCapitalize: 'off', spellCheck: false, onKeyDown: enter } as const
  if (answer.kind === 'interval') {
    return (
      <div className="es-guess__slip es-guess__range">
        <Field {...typing} label="Low end" hint={hint} value={slip.lo} onChange={(event) => onSlip({ ...slip, lo: event.target.value })} />
        <Field {...typing} label="High end" hint={hint} value={slip.hi} onChange={(event) => onSlip({ ...slip, hi: event.target.value })} error={problem ?? undefined} />
      </div>
    )
  }
  return (
    <div className="es-guess__slip">
      <Field {...typing} label="Your number" hint={hint} value={slip.text} onChange={(event) => onSlip({ ...slip, text: event.target.value })} error={problem ?? undefined} />
    </div>
  )
}

/** The slip, how sure, and Commit: what a guess asks with, in every kind. */
function AskForm({ block, onCommit }: { block: PredictBlock; onCommit: (commitment: Omit<Commitment, 'after'>) => void }) {
  const [slip, setSlip] = useState<Slip>({ text: '', pick: null, lo: '', hi: '' })
  const [conf, setConf] = useState<Confidence | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const commit = () => {
    const read = readSlip(block.answer, slip)
    if (!read.ok) {
      setProblem(read.problem)
      return
    }
    setProblem(null)
    onCommit({ value: read.value, conf })
  }
  return (
    <>
      <Tolerance block={block} />
      <SlipFields
        block={block}
        slip={slip}
        problem={problem}
        onSlip={(next) => {
          setSlip(next)
          setProblem(null)
        }}
        onSubmit={commit}
      />
      <SurePlates value={conf} onChange={setConf} />
      <p className="es-guess__actions">
        <Button variant="ink" onClick={commit}>
          Commit answer
        </Button>
      </p>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Revealed                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The verdict's words, for the shape of the answer. */
function verdictWords(block: PredictBlock, ok: boolean): string {
  const { answer } = block
  switch (answer.kind) {
    case 'numeric':
      if (answer.rel_tol === 0) return ok ? 'Exactly right.' : 'Not the exact value.'
      return ok ? 'Within the tolerance.' : 'Outside the tolerance.'
    case 'choice':
      return ok ? 'Right.' : 'Not this one.'
    case 'interval':
      return ok ? 'The range holds it.' : 'The range misses it.'
  }
}

/** The working of an answer revealed at commit: its lines, the source when it has one, and one stamp for what kind of number the answer is. */
function Working({ revealed }: { revealed: Revealed }) {
  return (
    <div className="es-guess__working">
      <p className="es-guess__working-head">
        <span>The working</span>
        {revealed.tag === null ? null : <span className="es-guess__tag">{revealed.tag}</span>}
      </p>
      <ol>
        {revealed.working.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      {revealed.sources.map((source) => (
        <p key={source.text} className="es-guess__source" data-claim={source.claim}>
          Source: {source.text}
        </p>
      ))}
    </div>
  )
}

interface RevealViewProps {
  block: PredictBlock
  committed: Commitment
  revealed: Revealed
  headingRef: Ref<HTMLParagraphElement>
}

/** A stage's label, with its code in backticks set in the code face: "sampled ids to the host (`.tolist()`)". */
function RichName({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((piece, at) => (at % 2 === 1 ? <code key={at}>{piece}</code> : piece))}
    </>
  )
}

/** What the reveal shows: the verdict, what was written beside the answer, and the run or the working it came from. */
function RevealView({ block, committed, revealed, headingRef }: RevealViewProps) {
  const { answer } = block
  const { run } = revealed
  const truth = answer.kind === 'choice' ? optionText(block, String(revealed.truth)) : figureText(rounded(Number(revealed.truth)), answer.unit)
  return (
    <div className="es-guess__reveal" data-ok={revealed.ok}>
      <p className="es-guess__verdict" tabIndex={-1} ref={headingRef}>
        <Icon name={revealed.ok ? 'check' : 'strike'} />
        <span>{verdictWords(block, revealed.ok)}</span>
      </p>
      <Written
        block={block}
        committed={committed}
        extra={
          <div>
            <dt>{run === null ? 'the answer' : 'the model'}</dt>
            <dd data-truth="">
              {truth}
              {answer.kind === 'choice' ? null : <span className="sr-only">, {revealed.tag === 'measured' ? 'measured' : 'derived'}</span>}
            </dd>
          </div>
        }
      />
      {revealed.restored === true ? (
        <p className="es-guess__run">Your answer from an earlier visit, as your record keeps it.</p>
      ) : run === null ? (
        <Working revealed={revealed} />
      ) : (
        <>
          <p className="es-guess__reads">{revealed.reads}</p>
          {revealed.counted === undefined || (revealed.counted.length === 0 && typeof revealed.truth !== 'number') ? null : (
            <p className="es-guess__counted" data-counted="">
              {revealed.counted.length === 0 ? (
                'Counted: none on this path.'
              ) : (
                <>
                  Counted:{' '}
                  {revealed.counted.map((name, at) => (
                    <span key={name}>
                      {at > 0 ? '; ' : ''}
                      <RichName text={name} />
                    </span>
                  ))}
                  .
                </>
              )}
            </p>
          )}
          <p className="es-guess__run">
            Read from your run of {rosterEntry(run.game)?.title ?? run.game}, on seed {run.seed.toString(16).toUpperCase().padStart(8, '0')}.
          </p>
        </>
      )}
      {revealed.unsaved === null ? null : <Unsaved detail={revealed.unsaved} />}
    </div>
  )
}

/** Focus follows the learner's own action to the line that replaced the control they used: the commit's lock, then the verdict. */
function useFocusOnPhase(phase: Phase) {
  const heading = useRef<HTMLParagraphElement>(null)
  const focusNext = useRef(false)
  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    heading.current?.focus()
  }, [phase])
  return {
    heading,
    arm: () => {
      focusNext.current = true
    },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A guess a run answers                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

interface AnsweredTicketProps {
  block: PredictBlock
  scope: string
  rev?: string
  plan: Answered
  /** The place, among the page's blocks, of the game block whose run answers it, and that block's mode. */
  place: number
  mode?: 'practice' | 'graded'
  slot?: GuessSlot
  where?: string
  title?: string
}

/**
 * A guess that a run answers: asking, locked in while the run is played, and revealed when a run of its level ends after the commit. The
 * reveal opens by itself: the run's end is the learner's action, and the answer belongs beside it.
 */
export function AnsweredTicket({ block, scope, rev, plan, place, mode = 'practice', slot = 'written', where, title: named }: AnsweredTicketProps) {
  const state = usePrediction(scope, block.id)
  const { committed, revealed } = state
  const run = useBlockRun(scope, place)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const phase = phaseOf(state, run)
  const { heading, arm } = useFocusOnPhase(phase)

  const open = async () => {
    if (committed === null || run === null || phase !== 'ready' || busy || revealed !== null) return
    setBusy(true)
    setFailed(null)
    try {
      const { reveal } = await import('./reveal')
      const result = await reveal({ block, scope, rev, committed, run })
      revealPrediction(scope, block.id, result)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  // The run that answers it has ended: the reveal opens on its own, once.
  const tried = useRef(false)
  useEffect(() => {
    if (phase !== 'ready' || tried.current) return
    tried.current = true
    void open()
  })

  // Paired with the level's own guess: the instrument's slot asks it, and this shows what follows the commit.
  if (slot === 'paired' && committed === null) return null
  const title = rosterEntry(plan.game)?.title ?? plan.game
  const label = named ?? (slot === 'written' ? 'Your guess' : 'Your guess for this run')
  const data = { phase, slot, ...(revealed === null ? {} : { ok: String(revealed.ok) }) }
  const then =
    phase === 'ready'
      ? failed === null
        ? 'The run ended. Reading the answer from it.'
        : `The answer did not come. ${failed}`
      : slot === 'written'
        ? `${where === undefined ? `The run of ${title} further down` : where.charAt(0).toUpperCase() + where.slice(1)} answers it${mode === 'graded' ? ', in its graded run' : ''}.`
        : 'The run answers it when it ends.'
  return (
    <GuessFrame block={block} label={label} data={data}>
      {committed === null ? (
        <AskForm
          block={block}
          onCommit={({ value, conf }) => {
            arm()
            commitPrediction(scope, block.id, { value, conf, after: latestSeq() })
          }}
        />
      ) : revealed !== null ? (
        <RevealView block={block} committed={committed} revealed={revealed} headingRef={heading} />
      ) : (
        <>
          <LockedIn block={block} committed={committed} then={then} headingRef={heading} />
          {failed === null ? null : (
            <p className="es-guess__actions">
              <Button variant="ink" onClick={() => void open()} loading={busy}>
                Show the answer
              </Button>
            </p>
          )}
        </>
      )}
    </GuessFrame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A guess revealed at commit                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A guess with no run to wait for (D-067): the learner commits, and the answer is there at once, beside the learner's value, with the
 * working under it. A reveal that did not come (the model's part failed to load) leaves the commitment standing and offers it again.
 */
function AtCommitTicket({ block, scope, rev }: { block: PredictBlock; scope: string; rev?: string }) {
  const state = usePrediction(scope, block.id)
  const { committed, revealed } = state
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const phase = phaseOf(state, null)
  const { heading, arm } = useFocusOnPhase(phase)

  const show = async (commitment: Commitment) => {
    if (busy) return
    setBusy(true)
    setFailed(null)
    try {
      const { revealAtCommit } = await import('./reveal')
      const result = await revealAtCommit({ block, scope, rev, committed: commitment })
      arm()
      revealPrediction(scope, block.id, result)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GuessFrame block={block} label="Your guess" data={{ phase, reveal: 'at-commit', ...(revealed === null ? {} : { ok: String(revealed.ok) }) }}>
      {committed === null ? (
        <AskForm
          block={block}
          onCommit={({ value, conf }) => {
            arm()
            void show(commitPrediction(scope, block.id, { value, conf, after: latestSeq() }))
          }}
        />
      ) : revealed !== null ? (
        <RevealView block={block} committed={committed} revealed={revealed} headingRef={heading} />
      ) : (
        <>
          <LockedIn block={block} committed={committed} then={failed === null ? 'Working out the answer.' : `The answer did not come. ${failed}`} headingRef={heading} />
          {failed === null ? null : (
            <p className="es-guess__actions">
              <Button variant="ink" onClick={() => void show(committed)} loading={busy}>
                Show the answer
              </Button>
            </p>
          )}
        </>
      )}
    </GuessFrame>
  )
}
