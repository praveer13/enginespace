import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { answerItem, CONFIDENCE_NAMES, CONFIDENCES, LEVEL_NAMES, nextUnanswered, resultOf, startAttempt, tally } from '@es/play/items'
import type { Answered, Attempt, Confidence, Gen, Item, Level, Response, Served } from '@es/play/items'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TicketLine } from '@/design/components/Ticket'
import { decimals } from '@/content/render/model'
import { formatReadout } from '@/design/format'
import { useEvidence } from '@/evidence/useEvidence'
import { parseNumber, seedLabel } from './answer'
import { itemDraft } from './event'
import { Frame } from './Frame'
import { PartView, RichText } from './Rich'

/*
 * An attempt at an `item` block, played (ARCHITECTURE §8.2). The attempt is made once, from the entropy that the block read when
 * the learner started (`startAttempt`), and everything after that is the learner's: write an answer or tick a line, say how sure
 * they are if they like, pull the stub, read why. Each answer is graded against a key computed from the item, written to the
 * ledger as an `item` event, and final. Nothing is timed, the confidence tap never gates, and the tally at the end offers new
 * numbers rather than the next lesson.
 *
 * This is the lazy half of the block: it brings the ledger. A page that only shows the ticket that waits never loads it.
 */

interface AttemptViewProps {
  gen: Gen
  level: Level
  entropy: readonly number[]
  scope: string
  /** Starts another attempt, on entropy read afresh. */
  onRestart: () => void
}

type Phase = 'asking' | 'revealed' | 'done'

export default function AttemptView({ gen, level, entropy, scope, onRestart }: AttemptViewProps) {
  const evidence = useEvidence()
  const [attempt, setAttempt] = useState<Attempt>(() => startAttempt(gen, level, entropy))
  const [shown, setShown] = useState(0)
  const [phase, setPhase] = useState<Phase>('asking')
  const [text, setText] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [conf, setConf] = useState<Confidence | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<string | null>(null)
  const focusTarget = useRef<HTMLHeadingElement>(null)

  // The ticket that has just come up takes focus: the stub that was pulled has gone, and a keyboard would be left behind.
  useEffect(() => {
    focusTarget.current?.focus()
  }, [shown, phase])

  const served: Served = attempt.served[shown]
  const item = served.item
  const answered = attempt.answered[shown]
  const last = shown === attempt.served.length - 1

  const check = () => {
    // An answer is final: a second press of the stub, or of Enter, after the ticket is checked does nothing.
    if (phase !== 'asking') return
    const spec = item.answer
    let response: Response
    if (spec.kind === 'numeric') {
      const value = parseNumber(text, spec.unit)
      if (value === null) {
        setProblem(`Write a number, in ${spec.unit}, and then check the ticket.`)
        return
      }
      response = { kind: 'numeric', value }
    } else {
      if (pick === null) {
        setProblem('Tick one line, and then check the ticket.')
        return
      }
      response = { kind: 'choice', pick }
    }
    setProblem(null)
    const next = answerItem(gen, attempt, shown, response, conf ?? undefined)
    setAttempt(next)
    setPhase('revealed')
    // The answer is final the moment it is checked, so it is written then. A ledger that cannot take it says so, and the ticket reads on.
    evidence.append(itemDraft(resultOf(next, shown))).then(
      (result) => {
        if (!result.ok) setUnsaved(result.detail)
      },
      (error: unknown) => setUnsaved(error instanceof Error ? error.message : String(error)),
    )
  }

  const advance = () => {
    const following = nextUnanswered(attempt)
    if (following === null) {
      setPhase('done')
      return
    }
    setShown(following)
    setPhase('asking')
    setText('')
    setPick(null)
    setConf(null)
    setProblem(null)
  }

  if (phase === 'done') {
    return (
      <Frame scope={scope} family={gen.id} phase="done" stub={<Stub onClick={onRestart}>New numbers</Stub>}>
        <Tally gen={gen} attempt={attempt} />
        {unsaved === null ? null : <Unsaved detail={unsaved} />}
      </Frame>
    )
  }

  const revealed = phase === 'revealed' && answered !== null
  return (
    <Frame
      scope={scope}
      family={gen.id}
      phase={phase}
      lamp={phase === 'asking'}
      foot={[`seed ${seedLabel(item.seed)}`, attempt.provenance]}
      stub={
        phase === 'asking' ? (
          <Stub onClick={check}>Check the ticket</Stub>
        ) : (
          <Stub onClick={advance}>{last ? 'Tally the tickets' : 'Next ticket'}</Stub>
        )
      }
      data={{ seed: String(item.seed), level: String(item.level), variant: item.variant, kind: item.answer.kind, rev: item.rev, ...(revealed ? { ok: String(answered.grade.ok) } : {}) }}
    >
      <h3 className="es-item__count" tabIndex={-1} ref={phase === 'asking' ? focusTarget : undefined}>
        <span>
          Item {shown + 1} of {attempt.served.length}
        </span>{' '}
        <span className="es-item__level">{LEVEL_NAMES[item.level]}</span>
      </h3>
      <p className="es-item__stem">
        <RichText parts={item.stem} />
      </p>
      <Givens item={item} />
      {item.worked.length > 0 ? <Worked item={item} /> : null}
      <Question
        item={item}
        text={text}
        pick={pick}
        locked={revealed}
        problem={revealed ? null : problem}
        onText={(value) => {
          setText(value)
          setProblem(null)
        }}
        onPick={(id) => {
          setPick(id)
          setProblem(null)
        }}
        onSubmit={check}
      />
      {revealed ? null : <SurePlates value={conf} onChange={setConf} />}
      {revealed ? <Reveal gen={gen} item={item} answered={answered} headingRef={focusTarget} /> : null}
      {unsaved === null ? null : <Unsaved detail={unsaved} />}
    </Frame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The question                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The scenario's numbers, printed as lines under the question. */
export function Givens({ item }: { item: Item }) {
  if (item.givens.length === 0) return null
  return (
    <dl className="es-item__givens">
      {item.givens.map((given) => (
        <div key={given.label} className="es-item__given">
          <dt>{given.label}</dt>
          <dd>
            <PartView part={given.value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Steps shown before the question (levels 0 and 1): a whole solution with other numbers, or the words of the first step. */
export function Worked({ item }: { item: Item }) {
  return (
    <div className="es-item__worked">
      <TapeLabel size="sm" tilt="left">
        {item.level === 0 ? 'worked example, other numbers' : 'the first step'}
      </TapeLabel>
      <ol>
        {item.worked.map((step, at) => (
          <li key={at}>
            <RichText parts={step.text} />
          </li>
        ))}
      </ol>
    </div>
  )
}

interface QuestionProps {
  item: Item
  text: string
  pick: string | null
  locked: boolean
  problem: string | null
  onText: (value: string) => void
  onPick: (id: string) => void
  onSubmit: () => void
}

/** The slip the learner writes on: a number in a tape-labelled field, or lines with a tick box each. */
export function Question({ item, text, pick, locked, problem, onText, onPick, onSubmit }: QuestionProps) {
  const name = useId()
  const spec = item.answer
  if (spec.kind === 'numeric') {
    // Once the ticket is checked the slip is read back below, as "you wrote", and goes from the ticket.
    if (locked) return null
    return (
      <div className="es-item__slip">
        <Field
          label={spec.label}
          hint={`in ${spec.unit}`}
          numeric
          value={text}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
          error={problem ?? undefined}
          placeholder="write it here"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    )
  }
  return (
    <fieldset className="es-item__choice" disabled={locked} aria-describedby={problem === null ? undefined : `${name}-problem`}>
      <legend>
        <TapeLabel size="sm" tilt="left">
          {spec.label}
        </TapeLabel>
      </legend>
      {spec.options.map((option) => {
        const isKey = option.id === spec.correct
        const isYours = locked && pick === option.id
        return (
          <div key={option.id} className="es-item__option" data-key={locked && isKey ? 'true' : undefined} data-yours={isYours ? 'true' : undefined}>
            <label>
              <input type="radio" name={name} value={option.id} checked={pick === option.id} onChange={() => onPick(option.id)} />
              <span className="es-item__tick" aria-hidden="true">
                <Icon name="check" />
              </span>
              <span className="es-item__option-text">
                <RichText parts={option.text} />
              </span>
            </label>
            {locked ? (
              <p className="es-item__why">
                {isKey ? (
                  <span className="es-item__mark">
                    <Icon name="check" />
                    {isYours ? 'Your pick, and right. ' : 'Right. '}
                  </span>
                ) : isYours ? (
                  <span className="es-item__mark" data-tone="bad">
                    <Icon name="strike" />
                    Your pick.
                  </span>
                ) : null}
                <RichText parts={option.why} />
              </p>
            ) : null}
          </div>
        )
      })}
      {problem === null ? null : (
        <p className="es-item__problem" id={`${name}-problem`} role="alert">
          <Icon name="alert" />
          <span>{problem}</span>
        </p>
      )}
    </fieldset>
  )
}

/** How sure the learner is, said before the answer is checked: three stamped plates, one pressed in. Optional, and never a gate. */
export function SurePlates({ value, onChange }: { value: Confidence | null; onChange: (value: Confidence | null) => void }) {
  const label = useId()
  return (
    <div className="es-item__sure">
      <span className="es-item__sure-label" id={label}>
        How sure are you?
      </span>
      <div role="group" aria-labelledby={label} className="es-item__plates">
        {CONFIDENCES.map((tap) => (
          <Button
            key={tap}
            variant={value === tap ? 'ink' : 'plate'}
            aria-pressed={value === tap}
            onClick={() => onChange(value === tap ? null : tap)}
          >
            {CONFIDENCE_NAMES[tap]}
          </Button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The reveal                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the ticket says once it is checked: the verdict, the key, what went wrong if a rule saw it, and the solution step by step. */
export function Reveal({
  gen,
  item,
  answered,
  headingRef,
  after,
}: {
  gen: Gen
  item: Item
  answered: Answered
  headingRef: Ref<HTMLHeadingElement>
  /** What the caller adds at the foot of the reveal, fed out with the rest: Today prints the day the idea comes back. */
  after?: ReactNode
}) {
  const ok = answered.grade.ok
  const steps = gen.solution(item)
  const spec = item.answer
  const yours = answered.response
  return (
    <div className="es-item__reveal" data-ok={ok}>
      <h3 className="es-item__verdict" tabIndex={-1} ref={headingRef}>
        <Icon name={ok ? 'check' : 'strike'} />
        <span>{ok ? 'Right.' : 'Not this one.'}</span>
      </h3>
      {spec.kind === 'numeric' || answered.conf !== undefined ? (
        <dl className="es-item__keys">
          {spec.kind === 'numeric' && yours.kind === 'numeric' ? (
            <div>
              <dt>you wrote</dt>
              <dd>
                <data className="es-item__yours" value={String(yours.value)}>
                  {formatReadout(yours.value, decimals(yours.value))} {spec.unit}
                </data>
              </dd>
            </div>
          ) : null}
          {spec.kind === 'numeric' ? (
            <div>
              <dt>the key</dt>
              <dd>
                <PartView part={{ t: 'num', value: spec.truth, unit: spec.unit, tag: 'derived', digits: spec.digits ?? 0 }} />
              </dd>
            </div>
          ) : null}
          {answered.conf === undefined ? null : (
            <div>
              <dt>you said</dt>
              <dd className="es-item__said">{CONFIDENCE_NAMES[answered.conf]}</dd>
            </div>
          )}
        </dl>
      ) : null}
      {spec.kind !== 'numeric' || answered.grade.diagnosis === undefined ? null : (
        <p className="es-item__diagnosis">
          <RichText parts={answered.grade.diagnosis.message} />
        </p>
      )}
      {steps.length > 0 ? (
        <div className="es-item__steps">
          <TapeLabel size="sm" tilt="left">
            why
          </TapeLabel>
          <ol>
            {steps.map((step, at) => (
              <li key={at}>
                <RichText parts={step.text} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {after}
    </div>
  )
}

/** The note printed when the ledger would not take an answer. The ticket reads on; the learner is told, and knows what to do. */
export function Unsaved({ detail }: { detail: string }) {
  return (
    <p className="es-item__problem" role="status">
      <Icon name="alert" />
      <span>This answer was not saved. {detail} Reload the page to keep your answers.</span>
    </p>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The tally                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function Tally({ gen, attempt }: { gen: Gen; attempt: Attempt }) {
  const { right, total } = tally(attempt)
  const titles = new Map(gen.variants.map((variant) => [variant.id, variant.title]))
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <div className="es-item__tally">
      <h3 className="es-item__verdict" tabIndex={-1} ref={heading}>
        <span>
          {right} of {total} right
        </span>
      </h3>
      <p>These were your numbers. Ask for new ones and the same questions come back on seeds nobody drew before.</p>
      <ol className="es-item__lines">
        {attempt.served.map((served, at) => {
          const ok = attempt.answered[at]?.grade.ok === true
          return (
            <li key={served.seed}>
              <TicketLine qty={`${at + 1}`} note={ok ? 'right' : 'missed'} tone={ok ? 'ink' : 'ink-2'}>
                {titles.get(served.item.variant) ?? served.item.variant}
              </TicketLine>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
