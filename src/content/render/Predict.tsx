import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, Ref } from 'react'
import type { CompiledBlock } from '@es/schema'
import { CONFIDENCE_NAMES, CONFIDENCES } from '@es/play/items/types'
import type { Confidence } from '@es/play/items/types'
import { isAnswered, NO_BLOCK, planOf } from '@es/play/predictions/plan'
import type { Answered, Waiting } from '@es/play/predictions/plan'
import { rosterEntry } from '@es/play/roster'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TicketLine } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { seedLabel } from '@/items/answer'
import { Frame, Tapes, type Of } from './BlockFrame'
import { answeringBlock, decimals } from './model'
import { commitPrediction, phaseOf, revealPrediction, usePrediction } from './predicted'
import type { Commitment, Revealed } from './predicted'
import { latestSeq, useBlockRun } from './runs'
import { optionText, readoutName, readSlip, unitName } from './slip'
import type { Slip } from './slip'

/*
 * A lesson's `predict` block (ARCHITECTURE §4.3; W1b-T02): a ticket that takes one answer before a game is played and scores it after.
 *
 *   - It takes the prediction the block asks for: a number within its tolerance, one option of a few, or a range. The slip is checked,
 *     the learner says how sure they are if they like (the tap never gates), and the stub commits it. A committed prediction cannot
 *     change (predicted.ts), and nothing of the answer is on the page before the reveal: the model's reading is not even loaded.
 *   - The reveal waits for the game. The game block that answers the prediction (packages/play/predictions/plan.ts) is the first of its
 *     game and level after the ticket, and the reveal opens when a run of it ends after the commit (runs.ts). The learner then pulls the
 *     stub, the pure model reads the answer from that run (reveal.ts, loaded then), and the ticket prints it beside what was written.
 *   - A prediction that no run of its lesson's game can answer says so, and names the task that gives it one. It takes no answer: there
 *     would be nothing to score it against, and a score against a number that is not the question's would mark a right answer wrong.
 *
 * A prediction moves no completion and no credit (ASSESSMENT §4.7): the event the reveal writes is read by the module page's loop and the
 * course map, and earns nothing (reveal.ts says who else reads it, and which readers W2-T44 builds).
 */

type PredictBlock = Of<'predict'>

export interface PredictTicketProps {
  block: PredictBlock
  /** The lesson's id: the foot line's, the event's ref, and what the page's runs are found by. */
  scope: string
  /** The block's place among the page's blocks, and the page's blocks, to find the game block that answers it. */
  at: number
  blocks: readonly CompiledBlock[]
  /** The lesson's content revision, which the event carries (A§4.2). */
  rev?: string
}

export function PredictTicket({ block, scope, at, blocks, rev }: PredictTicketProps) {
  const plan = planOf(block.id)
  if (!isAnswered(plan)) return <WaitingTicket block={block} scope={scope} waiting={plan} />
  const place = answeringBlock(blocks, at, plan)
  // A row that names a block the lesson does not have cannot be revealed: it waits like the rest, for the table to be put right.
  if (place < 0) return <WaitingTicket block={block} scope={scope} waiting={NO_BLOCK} />
  const mode = (blocks[place] as Of<'game'>).mode
  return <AnsweredTicket block={block} scope={scope} rev={rev} plan={plan} place={place} mode={mode} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What every phase prints                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** 0.15 as 15, without the 15.000000000000002 that multiplying gives. */
const percent = (ratio: number): number => Number((ratio * 100).toPrecision(12))

/** The block's facts on tape, and its tolerance as a tagged number: what kind of answer it takes and how close it must be. */
function Facts({ block }: { block: PredictBlock }) {
  const { answer } = block
  return (
    <>
      <Tapes
        label="About this prediction"
        items={[`answer · ${answer.kind}`, ...(answer.kind === 'choice' ? [] : [`unit · ${unitName(answer.unit)}`]), `reveal · ${block.reveal}`, ...block.kcs]}
      />
      {answer.kind === 'numeric' ? (
        <p className="es-c-line">
          {answer.rel_tol === 0 ? (
            <TicketLine>tolerance: the exact value</TicketLine>
          ) : (
            <TicketLine qty={<Readout value={percent(answer.rel_tol)} digits={decimals(percent(answer.rel_tol))} unit="%" tag="estimated" size="sm" />}>
              tolerance
            </TicketLine>
          )}
        </p>
      ) : null}
    </>
  )
}

/** The model's number, whole when it is whole and to two places when it is not. */
const rounded = (value: number): number => Number(value.toFixed(2))

/** A figure the model gave, as a readout that tags itself; a unit that the readout has no name for is printed after it, as the lesson writes it. */
function Figure({ value, unit }: { value: number; unit: string }) {
  const known = readoutName(unit)
  return (
    <>
      <Readout value={rounded(value)} digits={decimals(rounded(value))} unit={known} tag="derived" size="sm" />
      {known === undefined ? <span className="es-item__unit">{unit}</span> : null}
    </>
  )
}

/** What the learner wrote, printed as the printer prints a number: in the dots, with no tag, since it is theirs. */
function Wrote({ block, value }: { block: PredictBlock; value: Commitment['value'] }) {
  const { answer } = block
  if (answer.kind === 'choice') return <>{optionText(block, String(value))}</>
  const unit = unitName(answer.unit)
  const figure = (n: number) => formatReadout(n, decimals(n))
  // A per cent sign is set tight against its number, as the readout sets it; every other unit follows a space.
  const gap = unit === '%' ? '' : ' '
  if (typeof value === 'object') {
    return (
      <data className="es-item__yours" value={`${value.lo} ${value.hi}`}>
        {figure(value.lo)} to {figure(value.hi)}
        {gap}
        {unit}
      </data>
    )
  }
  return (
    <data className="es-item__yours" value={String(value)}>
      {figure(Number(value))}
      {gap}
      {unit}
    </data>
  )
}

/** "you wrote", and what the caller adds, and "you said": lines of the printer's dots. */
function Written({ block, committed, extra }: { block: PredictBlock; committed: Commitment; extra?: ReactNode }) {
  return (
    <dl className="es-item__keys">
      <div>
        <dt>you wrote</dt>
        <dd>
          <Wrote block={block} value={committed.value} />
        </dd>
      </div>
      {extra}
      {committed.conf === null ? null : (
        <div>
          <dt>you said</dt>
          <dd className="es-item__said">{CONFIDENCE_NAMES[committed.conf]}</dd>
        </div>
      )}
    </dl>
  )
}

/** The note printed when the ledger would not take the event. The reveal stands; the learner is told, and knows what to do. */
function Unsaved({ detail }: { detail: string }) {
  return (
    <p className="es-item__problem" role="status">
      <Icon name="alert" />
      <span>This prediction was not saved. {detail} Reload the page to keep your predictions.</span>
    </p>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A prediction that waits                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The red line that says the reveal waits for a task. */
function WaitsLine({ task }: { task: string }) {
  return (
    <p className="es-c-pending">
      <TicketLine tone="ink-2" qty={<Icon name="lock" className="es-c-pending__mark" />} note={task}>
        Its reveal waits on
      </TicketLine>
    </p>
  )
}

/** A prediction with no run to read: its prompt and the shape of its answer, the task its reveal waits for, and why, and a stub that is held down. */
function WaitingTicket({ block, scope, waiting }: { block: PredictBlock; scope: string; waiting: Waiting }) {
  const { answer } = block
  return (
    <Frame block="predict" scope={scope} meta={block.id} title="Predict" pending={waiting.task} data={{ phase: 'unbuilt', predict: block.id }} stub={<Stub disabled>Commit answer</Stub>}>
      <p>{block.prompt}</p>
      {answer.kind === 'choice' ? (
        <ol className="es-c-options">
          {answer.options.map((option) => (
            <li key={option.id}>{option.text}</li>
          ))}
        </ol>
      ) : null}
      <Facts block={block} />
      <WaitsLine task={waiting.task} />
      <p className="es-c-predict__why">{waiting.why}</p>
    </Frame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Asking                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How sure the learner is, said before the answer is committed: three stamped plates, one pressed in. Optional, and never a gate. */
function SurePlates({ value, onChange }: { value: Confidence | null; onChange: (value: Confidence | null) => void }) {
  const label = useId()
  return (
    <div className="es-item__sure">
      <span className="es-item__sure-label" id={label}>
        How sure are you?
      </span>
      <div role="group" aria-labelledby={label} className="es-item__plates">
        {CONFIDENCES.map((tap) => (
          <Button key={tap} variant={value === tap ? 'ink' : 'plate'} aria-pressed={value === tap} onClick={() => onChange(value === tap ? null : tap)}>
            {CONFIDENCE_NAMES[tap]}
          </Button>
        ))}
      </div>
    </div>
  )
}

interface SlipFieldsProps {
  block: PredictBlock
  slip: Slip
  problem: string | null
  onSlip: (slip: Slip) => void
  onSubmit: () => void
}

/** The slip the learner writes on: a number in a tape-labelled field, one line ticked, or the two ends of a range. */
function SlipFields({ block, slip, problem, onSlip, onSubmit }: SlipFieldsProps) {
  const name = useId()
  const { answer } = block
  // Enter on a field commits, as it checks an item: a slip is a form, and the stub is its button.
  const enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }
  if (answer.kind === 'choice') {
    return (
      <fieldset className="es-item__choice" aria-describedby={problem === null ? undefined : `${name}-problem`}>
        <legend>
          <TapeLabel size="sm" tilt="left">
            Your pick
          </TapeLabel>
        </legend>
        {answer.options.map((option) => (
          <div key={option.id} className="es-item__option">
            <label>
              <input type="radio" name={name} value={option.id} checked={slip.pick === option.id} onChange={() => onSlip({ ...slip, pick: option.id })} />
              <span className="es-item__tick" aria-hidden="true">
                <Icon name="check" />
              </span>
              <span className="es-item__option-text">{option.text}</span>
            </label>
          </div>
        ))}
        {problem === null ? null : (
          <p className="es-item__problem" id={`${name}-problem`} role="alert">
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
      <div className="es-item__slip es-c-predict__range">
        <Field {...typing} label="Low end" hint={hint} value={slip.lo} onChange={(event) => onSlip({ ...slip, lo: event.target.value })} />
        <Field {...typing} label="High end" hint={hint} value={slip.hi} onChange={(event) => onSlip({ ...slip, hi: event.target.value })} error={problem ?? undefined} />
      </div>
    )
  }
  return (
    <div className="es-item__slip">
      <Field {...typing} label="Your number" hint={hint} value={slip.text} onChange={(event) => onSlip({ ...slip, text: event.target.value })} error={problem ?? undefined} />
    </div>
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

interface RevealViewProps {
  block: PredictBlock
  committed: Commitment
  revealed: Revealed
  headingRef: Ref<HTMLHeadingElement>
}

/** What the reveal prints: the verdict, what was written beside what the model says, how the model read that, and the run it read it from. */
function RevealView({ block, committed, revealed, headingRef }: RevealViewProps) {
  const { answer } = block
  const title = rosterEntry(revealed.run.game)?.title ?? revealed.run.game
  return (
    <div className="es-item__reveal" data-ok={revealed.ok}>
      <h3 className="es-item__verdict" tabIndex={-1} ref={headingRef}>
        <Icon name={revealed.ok ? 'check' : 'strike'} />
        <span>{verdictWords(block, revealed.ok)}</span>
      </h3>
      <Written
        block={block}
        committed={committed}
        extra={
          <div>
            <dt>the model</dt>
            <dd data-truth="">{answer.kind === 'choice' ? optionText(block, String(revealed.truth)) : <Figure value={Number(revealed.truth)} unit={answer.unit} />}</dd>
          </div>
        }
      />
      <p className="es-c-predict__reads">{revealed.reads}</p>
      <p className="es-c-predict__run">
        Read from your run of {title}, level {revealed.run.level}, on seed {seedLabel(revealed.run.seed)}.
      </p>
      {revealed.unsaved === null ? null : <Unsaved detail={revealed.unsaved} />}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A prediction a run answers                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface AnsweredTicketProps {
  block: PredictBlock
  scope: string
  rev?: string
  plan: Answered
  /** The place, among the page's blocks, of the game block whose run answers it, and that block's mode: a graded one is named, since the lesson may hold a practice block of the same level above it. */
  place: number
  mode?: 'practice' | 'graded'
}

/** A prediction that a run answers, once the page has found the game block of that run: the ticket in each of its phases. */
export function AnsweredTicket({ block, scope, rev, plan, place, mode = 'practice' }: AnsweredTicketProps) {
  const state = usePrediction(scope, block.id)
  const { committed, revealed } = state
  const run = useBlockRun(scope, place)
  const [slip, setSlip] = useState<Slip>({ text: '', pick: null, lo: '', hi: '' })
  const [conf, setConf] = useState<Confidence | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // The heading that takes focus when the learner's own action changes the ticket: the stub they pulled has gone, and a keyboard would be left behind.
  const heading = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef(false)

  // A run that ended after the commit is the game, played: the reveal opens. One that ended before it was played in sight of the answer.
  const phase = phaseOf(state, run)
  const ended = phase === 'ready'

  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    heading.current?.focus()
  }, [phase])

  const commit = () => {
    if (committed !== null) return
    const read = readSlip(block.answer, slip)
    if (!read.ok) {
      setProblem(read.problem)
      return
    }
    setProblem(null)
    focusNext.current = true
    commitPrediction(scope, block.id, { value: read.value, conf, after: latestSeq() })
  }

  const open = async () => {
    if (committed === null || run === null || !ended || busy || revealed !== null) return
    setBusy(true)
    setFailed(null)
    try {
      const { reveal } = await import('./reveal')
      const result = await reveal({ block, scope, rev, committed, run })
      focusNext.current = true
      revealPrediction(scope, block.id, result)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  let stub: ReactNode = null
  if (phase === 'asking') stub = <Stub onClick={commit}>Commit answer</Stub>
  else if (phase === 'committed') stub = <Stub disabled>Reveal the answer</Stub>
  else if (phase === 'ready')
    stub = (
      <Stub onClick={() => void open()} loading={busy} error={failed === null ? undefined : `The reveal did not come. ${failed}`}>
        Reveal the answer
      </Stub>
    )

  const title = rosterEntry(plan.game)?.title ?? plan.game
  return (
    <Frame
      block="predict"
      scope={scope}
      meta={block.id}
      title="Predict"
      lamp={phase === 'asking' || phase === 'ready'}
      data={{ phase, predict: block.id, ...(revealed === null ? {} : { ok: String(revealed.ok) }) }}
      stub={stub}
    >
      <p>{block.prompt}</p>
      <Facts block={block} />
      {committed === null ? (
        <>
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
        </>
      ) : revealed !== null ? (
        <RevealView block={block} committed={committed} revealed={revealed} headingRef={heading} />
      ) : (
        <>
          <h3 className="es-item__count" tabIndex={-1} ref={heading}>
            <span>Committed</span> <span className="es-item__level">it does not change now</span>
          </h3>
          <Written block={block} committed={committed} />
          <p className="es-c-predict__status" role="status">
            {ended ? 'The run ended. Pull the stub to reveal the answer.' : `Play ${title}, level ${plan.level}${mode === 'graded' ? ' (graded)' : ''}, below. The reveal opens when a run of it ends.`}
          </p>
        </>
      )}
    </Frame>
  )
}
