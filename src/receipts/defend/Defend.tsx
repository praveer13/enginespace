import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { VerificationReport } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { parseTuple, type DefendQuestion } from '@es/sim/defend/tr0'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Icon } from '@/design/components/Glyph'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { useEvidence } from '@/evidence/useEvidence'
import { afterAttempt, opensWords, stakeOf, type ProveStake } from '@/prove/window'
import { artifactOf } from './bundle'
import { DEFEND_COPY } from './copy'
import { heldBundle } from './handoff'
import { DEFEND_STAGES, defendRef } from './registry'
import { setOf, type DefendSet } from './sets'
import { afterLine, stakeLine, type Done } from './lines'
import { settle, standingOf, type Standing } from './standing'
import '@/prove/prove.css'
import './defend.css'

/*
 * "Defend your receipt" (ASSESSMENT §7.2, the third kind of Prove-it), on the page of a receipt that can be defended (registry.ts). This chunk loads only
 * there, on the page's own thread: the receipt worker is not asked again.
 *
 *   1. Before: what the questions are about (the set's lead), why the course asks, what an attempt now is worth (the receipt's standing and the 24-hour
 *      window, standing.ts), the receipt's file, and the attestation that the agent is closed, which is Prove mode's own. The file is the one the receipt
 *      came back in, held for this tab by the importer (handoff.ts), or chosen again; it is read for the one artifact the set needs (bundle.ts).
 *   2. Start draws the seed, and the set draws the questions on it. The learner types each answer. Nothing the run recorded is on the page yet: the keys
 *      stay in memory until the answers are in, and a question's words name its point and call, never its numbers.
 *   3. Check marks the answers, then shows, question by question, the answer, what the run recorded and the computation from the record. On a verified
 *      receipt the attempt is written as a `prove` event, `proved` when it counts and `practice` inside the window; on any other receipt nothing is written.
 *      The attestation holds for the attempts of this visit, as Prove mode's does: "Try new questions" draws a new seed at once.
 */

export interface DefendProps {
  readonly receipt: Receipt
  readonly sha256: string
  readonly reports: readonly VerificationReport[]
}

/** The browser's clock and its entropy, read in a handler, never while the page draws. */
const clock = (): number => Date.now()
const freshSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]

const OPEN: ProveStake = { counts: true, last: null, opensAt: null }

type FileState =
  | { readonly kind: 'none' }
  | { readonly kind: 'reading'; readonly name: string }
  | { readonly kind: 'ready'; readonly name: string; readonly held: boolean; readonly value: unknown }
  | { readonly kind: 'error'; readonly name: string; readonly problem: string }

interface Asked {
  readonly seed: number
  readonly questions: readonly DefendQuestion[]
}

/** A sentence in which a run in backticks is set as code. */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, at) => (at % 2 === 1 ? <code key={at}>{part}</code> : <Fragment key={at}>{part}</Fragment>))}
    </>
  )
}

const tupleText = (values: readonly number[] | null): string => (values === null ? '(none)' : `(${values.join(', ')})`)

export default function Defend({ receipt, sha256, reports }: DefendProps) {
  const set = setOf(receipt.stage)
  return set === undefined ? null : <DefendStep set={set} receipt={receipt} sha256={sha256} reports={reports} />
}

function DefendStep({ set, receipt, sha256, reports }: DefendProps & { set: DefendSet<unknown> }) {
  const evidence = useEvidence()
  const lab = DEFEND_STAGES[receipt.stage]
  const ref = defendRef(lab)
  const standing = useMemo(() => standingOf(receipt, reports), [receipt, reports])
  const [now, setNow] = useState(() => clock())
  const [file, setFile] = useState<FileState>({ kind: 'none' })
  const [attested, setAttested] = useState(false)
  const [asked, setAsked] = useState<Asked | null>(null)
  const [texts, setTexts] = useState<string[]>([])
  const [errors, setErrors] = useState<(string | null)[]>([])
  const [done, setDone] = useState<Done | null>(null)
  const [played, setPlayed] = useState<{ at: number; ok: boolean; counted: boolean } | null>(null)

  const ledgerStake = evidence.ready ? stakeOf(evidence.events, ref, now, 'prove') : null
  const stake = played === null ? ledgerStake : afterAttempt(ledgerStake ?? OPEN, played)
  const when = stake?.opensAt === null || stake?.opensAt === undefined ? null : opensWords(stake.opensAt, now)

  // The file: the one this tab brought the receipt back in, if it did. Read once for each file the learner gives.
  const take = (blob: File, held: boolean) => {
    setFile({ kind: 'reading', name: blob.name })
    void artifactOf(blob, sha256, set.format).then((read) => {
      if (!read.ok) return setFile({ kind: 'error', name: blob.name, problem: read.problem })
      const parsed = set.read(read.data, receipt.stage)
      setFile(parsed.ok ? { kind: 'ready', name: blob.name, held, value: parsed.value } : { kind: 'error', name: blob.name, problem: parsed.problem })
    })
  }
  useEffect(() => {
    const held = heldBundle(sha256)
    if (held !== undefined) take(held, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the file is looked for once, when the step opens on this receipt, and not again when `take` is made anew
  }, [sha256])

  const start = () => {
    if (file.kind !== 'ready') return
    const seed = freshSeed()
    const questions = set.questions(file.value, seed)
    setAsked({ seed, questions })
    setTexts(questions.map(() => ''))
    setErrors(questions.map(() => null))
    setDone(null)
    setNow(clock())
  }

  const check = (event: FormEvent) => {
    event.preventDefault()
    if (asked === null || done !== null) return
    const answers = texts.map((text) => parseTuple(text))
    const problems = texts.map((text, at) => (text.trim() === '' ? DEFEND_COPY.empty : answers[at] === null ? DEFEND_COPY.unreadable : null))
    setErrors(problems)
    if (problems.some((problem) => problem !== null)) return
    const at = clock()
    const { marked, counted, draft } = settle(standing, stake, at, { lab, receiptSha256: sha256, seed: asked.seed, questions: asked.questions, answers })
    const result: Done = { marked, answers, at, counted, problem: null }
    setDone(result)
    setNow(at)
    if (draft === null) return
    setPlayed({ at, ok: marked.ok, counted })
    void evidence.append(draft).then(
      (written) => {
        if (!written.ok) setDone({ ...result, problem: written.detail })
      },
      (error: unknown) => setDone({ ...result, problem: error instanceof Error ? error.message : String(error) }),
    )
  }

  return (
    <DefendView
      set={set}
      stage={receipt.stage}
      standing={standing}
      stake={stake}
      when={when}
      file={file}
      onFile={(blob) => take(blob, false)}
      attested={attested}
      onAttest={setAttested}
      asked={asked}
      value={file.kind === 'ready' ? file.value : null}
      texts={texts}
      errors={errors}
      onText={(at, text) => setTexts((old) => old.map((entry, index) => (index === at ? text : entry)))}
      onStart={start}
      onCheck={check}
      done={done}
    />
  )
}

export interface DefendViewProps {
  readonly set: DefendSet<unknown>
  readonly stage: string
  readonly standing: Standing
  /** Null while the ledger is read. */
  readonly stake: ProveStake | null
  readonly when: string | null
  readonly file: FileState
  onFile(file: File): void
  readonly attested: boolean
  onAttest(attested: boolean): void
  /** The questions of the attempt on now, or null before Start. */
  readonly asked: Asked | null
  /** What the set read from the file, which its words and its reveal take. */
  readonly value: unknown
  readonly texts: readonly string[]
  readonly errors: readonly (string | null)[]
  onText(at: number, text: string): void
  onStart(): void
  onCheck(event: FormEvent): void
  /** The result, once the answers are in. */
  readonly done: Done | null
}

/** The step as it stands: drawn from its props alone, so the server renderer draws any state of it (tests/receipts/defend.test.ts). */
export function DefendView(props: DefendViewProps) {
  const { set, standing, stake, when, asked, done } = props
  const resultRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Start puts the questions where the start control was: focus goes to the first answer. When the answers are in, the result takes focus,
  // so a keyboard and a screen reader are where the outcome is. A check that found an answer it cannot read sends focus to that answer.
  const seed = asked?.seed
  useEffect(() => {
    if (seed === undefined) return
    const first = formRef.current?.querySelector<HTMLInputElement>('input')
    first?.focus({ preventScroll: true })
    first?.scrollIntoView({ block: 'center' })
  }, [seed])
  useEffect(() => {
    if (done === null) return
    resultRef.current?.focus({ preventScroll: true })
    resultRef.current?.scrollIntoView({ block: 'start' })
  }, [done])
  const errorKey = props.errors.map((error) => (error === null ? '' : 'x')).join('')
  useEffect(() => {
    const at = props.errors.findIndex((error) => error !== null)
    if (at < 0) return
    formRef.current?.querySelectorAll<HTMLInputElement>('input')[at]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new set of problems moves focus, and `errorKey` is that set in short
  }, [errorKey])

  // There is no submit button in the form (the amber Check is the page's own button), so Enter in an answer sends the answers, as a form's
  // implicit submission would with one field.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || event.nativeEvent.isComposing) return
    event.preventDefault()
    formRef.current?.requestSubmit()
  }

  return (
    <div className="es-defend" data-defend={done !== null ? 'done' : asked !== null ? 'asking' : 'before'} data-standing={standing.kind}>
      {asked === null ? (
        <Before {...props} />
      ) : (
        <>
          {done === null ? null : (
            <div ref={resultRef} className="es-defend__result" tabIndex={-1} data-ok={done.marked.ok || undefined}>
              <p className="es-defend__score">
                {done.marked.ok ? <Icon name="check" className="es-defend__mark" /> : <Icon name="alert" className="es-defend__mark" />}
                <span>{DEFEND_COPY.resultTitle(done.marked.right.filter(Boolean).length, done.marked.right.length)}</span>
              </p>
              <p className="es-defend__after" role="status" data-defend-after={standing.kind === 'practice' ? 'nothing' : done.counted ? (done.marked.ok ? 'proved' : 'missed') : 'practice'}>
                {afterLine(standing, done, when)}
              </p>
              {done.problem === null ? null : (
                <p className="es-defend__problem" role="alert">
                  <Icon name="alert" className="es-defend__mark" />
                  <span>{DEFEND_COPY.notRecorded(done.problem)}</span>
                </p>
              )}
            </div>
          )}
          <div className="es-defend__context">
            <p>
              <Words text={set.context(props.value)} />
            </p>
            {done === null ? <p data-defend-stake="">{stakeLine(standing, stake, when)}</p> : null}
          </div>
          <form ref={formRef} className="es-defend__form" onSubmit={props.onCheck} onKeyDown={onKeyDown} noValidate aria-label={DEFEND_COPY.questionsLabel}>
            <ol className="es-defend__questions" role="list">
              {asked.questions.map((question, at) => (
                <Question
                  key={`${asked.seed}-${question.id}`}
                  n={at + 1}
                  id={question.id}
                  text={set.ask(question, props.value)}
                  answer={props.texts[at] ?? ''}
                  error={props.errors[at] ?? null}
                  onText={(text) => props.onText(at, text)}
                  reveal={done === null ? null : { question, right: done.marked.right[at] ?? false, answer: done.answers[at] ?? null }}
                  set={set}
                  value={props.value}
                />
              ))}
            </ol>
          </form>
          <div className="es-prove__actions es-defend__actions">
            {done === null ? (
              <PrimaryButton onClick={() => formRef.current?.requestSubmit()}>{DEFEND_COPY.check}</PrimaryButton>
            ) : (
              <Button onClick={props.onStart}>{DEFEND_COPY.again}</Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Before Start: what the questions are about, why, the stake, the file and the attestation. */
function Before({ set, standing, stake, when, file, onFile, attested, onAttest, onStart, value }: DefendViewProps) {
  const boxId = useId()
  const input = useRef<HTMLInputElement>(null)
  const nothing = file.kind === 'ready' && set.questions(value, 0).length === 0
  const ready = file.kind === 'ready' && !nothing
  return (
    <>
      <p className="es-defend__lead">
        <Words text={set.lead} />
      </p>
      <p className="es-defend__why">{DEFEND_COPY.why}</p>
      <p className="es-prove__stake es-defend__stake" role="status" data-defend-stake="" data-stake={standing.kind === 'practice' ? 'practice' : stake === null ? 'reading' : stake.counts ? 'counts' : 'window'}>
        {stakeLine(standing, stake, when)}
      </p>
      <div className="es-defend__file" data-file={file.kind}>
        <input
          ref={input}
          type="file"
          accept=".gz,application/gzip,application/x-gzip"
          hidden
          aria-label={DEFEND_COPY.fileInput}
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            if (chosen !== undefined) onFile(chosen)
            event.target.value = ''
          }}
        />
        <p className="es-defend__file-line" role="status">
          {file.kind === 'ready' ? (
            DEFEND_COPY.fileHeld(file.name)
          ) : file.kind === 'reading' ? (
            DEFEND_COPY.fileReading
          ) : file.kind === 'error' ? (
            <span className="es-defend__file-problem">
              <Icon name="alert" className="es-defend__mark" />
              <span>
                <Words text={file.problem} />
              </span>
            </span>
          ) : (
            DEFEND_COPY.fileNeeded
          )}
        </p>
        {nothing ? (
          <p className="es-defend__file-problem">
            <Icon name="alert" className="es-defend__mark" />
            <span>
              <Words text={set.none} />
            </span>
          </p>
        ) : null}
        {file.kind === 'ready' && file.held ? null : (
          <Button onClick={() => input.current?.click()} disabled={file.kind === 'reading'}>
            {file.kind === 'none' ? DEFEND_COPY.fileChoose : DEFEND_COPY.fileChooseAnother}
          </Button>
        )}
      </div>
      <div className="es-prove__attest">
        <input id={boxId} type="checkbox" className="es-prove__box" checked={attested} onChange={(event) => onAttest(event.target.checked)} />
        <label htmlFor={boxId}>{DEFEND_COPY.attest}</label>
      </div>
      <div className="es-prove__actions">
        <PrimaryButton disabled={!attested || !ready} onClick={onStart}>
          {DEFEND_COPY.start}
        </PrimaryButton>
      </div>
    </>
  )
}

interface QuestionProps {
  readonly n: number
  /** The question's id, `<point>/<asks>`: where it asks, never what. */
  readonly id: string
  readonly text: string
  readonly answer: string
  readonly error: string | null
  onText(text: string): void
  /** Once the answers are in: the question, whether its answer was right, and the answer as read. */
  readonly reveal: { readonly question: DefendQuestion; readonly right: boolean; readonly answer: readonly number[] | null } | null
  readonly set: DefendSet<unknown>
  readonly value: unknown
}

function Question({ n, id, text, answer, error, onText, reveal, set, value }: QuestionProps) {
  return (
    <li className="es-defend__question" data-question={id} data-right={reveal === null ? undefined : reveal.right ? 'yes' : 'no'}>
      <p className="es-defend__ask" aria-hidden={reveal === null ? true : undefined}>
        <span className="es-defend__n">{n}</span>
        <span>
          <Words text={text} />
        </span>
      </p>
      {reveal === null ? (
        <div className="es-defend__answer">
        <Field
          label={
            <>
              {DEFEND_COPY.answerLabel(n)}
              <span className="sr-only">: {text.replaceAll('`', '')}</span>
            </>
          }
          hint={DEFEND_COPY.hint}
          error={error ?? undefined}
          numeric
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={answer}
          onChange={(event) => onText(event.target.value)}
          className="es-defend__field"
        />
        </div>
      ) : (
        <Revealed reveal={reveal} set={set} value={value} />
      )}
    </li>
  )
}

function Revealed({ reveal, set, value }: { reveal: NonNullable<QuestionProps['reveal']>; set: DefendSet<unknown>; value: unknown }) {
  const shown = set.reveal(reveal.question, value)
  return (
    <div className="es-defend__reveal">
      <dl className="es-defend__pair">
        <div className="es-defend__row">
          <dt>{DEFEND_COPY.yours}</dt>
          <dd>
            <code>{tupleText(reveal.answer)}</code>
          </dd>
        </div>
        <div className="es-defend__row">
          <dt>{DEFEND_COPY.recorded}</dt>
          <dd>
            <code>{tupleText(reveal.question.key)}</code>
          </dd>
        </div>
      </dl>
      <p className="es-defend__verdict" data-right={reveal.right ? 'yes' : 'no'}>
        {reveal.right ? <Icon name="check" className="es-defend__mark" /> : <Icon name="alert" className="es-defend__mark" />}
        <span>{reveal.right ? DEFEND_COPY.right : DEFEND_COPY.wrong}</span>
      </p>
      <div className="es-defend__working">
        <p>
          <Words text={shown.recorded} />
        </p>
        {shown.lines.map((line) => (
          <p key={line}>
            <Words text={line} />
          </p>
        ))}
      </div>
    </div>
  )
}
