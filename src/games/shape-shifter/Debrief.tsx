import { useContext, useEffect, useId } from 'react'
import { drawInBand } from '@es/play'
import { copyOf } from '@es/play/shape-shifter/copy'
import { opText, tupleText } from '@es/play/shape-shifter/labels'
import { shiftLevel, shiftSession } from '@es/play/shape-shifter/session'
import type { ShiftLevelId } from '@es/play/shape-shifter/types'
import { Button } from '@/design/components/Button'
import { NumberLine } from '@/design/components/NumberLine'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { TextLink } from '@/design/components/TextLink'
import { useBest } from '@/games/kit/best'
import { Debrief as Result } from '@/games/kit/Debrief'
import { LessonRunContext } from '@/games/kit/lessonRun'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { PartPopover } from '@/games/kit/PartPopover'
import { verdictOf } from '@/games/kit/verdict'
import { Versus } from '@/games/kit/Versus'
import type { ShiftOutcome, ShiftRun } from './types'

/*
 * Tensor views' result (GAMES.md §4.7; REDESIGN §2.6): the kit's debrief, filled. The verdict word from the grade, one sentence that says
 * what the run did and the decision that mattered, the ways on (the next level first; in a lesson, the lesson's way on), then the guess
 * beside the model's answer on one number line, your copies against the reference's drawn on one axis, the reference's plan for each
 * target, and what PyTorch or Triton says at its pin, with the source.
 *
 * The reference is read only here, from the level the run was played on. Every count is a count of the course's model.
 */

export interface DebriefProps {
  run: ShiftRun
  outcome: ShiftOutcome
  next: { id: string; title: string } | null
  onNext: () => void
  embedded?: boolean
}

const figure = (value: number) => <span className="font-numeric">{value}</span>

/*
 * The result is a chunk of its own, loaded when a run ends, and it imports nothing that only the game's own chunk holds (the build would
 * fold the game's page into a chunk the result shares): so it sets copy.ts's code spans itself.
 */
function Words({ line }: { line: string }) {
  return (
    <>
      {line.split('`').map((text, i) => (i % 2 === 1 ? <code key={i}>{text}</code> : <span key={i}>{text}</span>))}
    </>
  )
}

const copiesWord = (n: number): string => `${n} ${n === 1 ? 'copy' : 'copies'}`

const PLAN_COLUMNS: readonly MirrorColumn[] = [
  { key: 'target', head: 'Target' },
  { key: 'yours', head: 'Your copies', numeric: true },
  { key: 'reference', head: "The reference's", numeric: true },
  { key: 'plan', head: "The reference's plan" },
]

/** The learner's best on this level, from the ledger's runs of it. Rendered only on a page that has a ledger. */
function Best({ level }: { level: ShiftLevelId }) {
  const best = useBest('shape-shifter', level)
  if (best === null) return null
  return (
    <>
      {' '}
      Your best score on this level: <span className="font-numeric">{best.score.toFixed(2)}</span>, the share of its targets passed ({figure(best.runs)}{' '}
      {best.runs === 1 ? 'run' : 'runs'} kept).
    </>
  )
}

export function Debrief({ run, outcome, next, onNext, embedded = false }: DebriefProps) {
  const againId = useId()
  const { view } = run
  const { debrief, grade } = outcome
  const level = shiftLevel(view.level, run.seed)
  const words = copyOf(level)
  const hasPassRule = words.passRule !== undefined
  const verdict = verdictOf(grade, hasPassRule)
  const reference = outcome.ghostView
  const turn = debrief.names !== null && 'turn' in debrief.names ? debrief.names.turn : null
  const number = turn === null ? null : outcome.record.actions.slice(0, turn + 1).filter((action) => action.t !== 'commit').length
  const mine = run.score
  const newNumbers = () => run.restart(drawInBand(shiftSession, view.level, crypto.getRandomValues(new Uint32Array(1))[0]))

  const lesson = useContext(LessonRunContext)
  const onward = lesson?.onward ?? null
  const lessonReveal = lesson !== null && lesson.reveal !== null && lesson.reveal !== undefined
  const showsReveal = lesson?.showsReveal
  useEffect(() => {
    if (!lessonReveal || showsReveal === undefined) return
    showsReveal(true)
    return () => showsReveal(false)
  }, [lessonReveal, showsReveal])

  const primary =
    onward !== null ? (
      <PrimaryButton onClick={() => onward.select()}>{onward.label}</PrimaryButton>
    ) : next !== null ? (
      <PrimaryButton onClick={onNext}>{`Next level: ${next.title}`}</PrimaryButton>
    ) : embedded ? null : (
      <TextLink to="/map">Open the course</TextLink>
    )

  // The guesses, one a target: the last target's is the one the view still holds, and the record has every commit.
  const guesses = outcome.record.actions.filter((action) => action.t === 'commit').length
  const guess = view.predict.guess
  const answer = view.predict.answer
  const unit = view.predict.unit
  const guessLine = lessonReveal ? (
    <div data-shift-lesson-guess="">{lesson?.reveal}</div>
  ) : guess === null && guesses === 0 ? (
    <p data-shift-guess="">
      You skipped the guess. The answer: {figure(answer)} {unit}.
    </p>
  ) : guess === null ? null : (
    <NumberLine
      caption={<>{view.task.of > 1 ? `The last target: your guess and the model's answer, in ${unit}` : `Your guess and the model's answer, in ${unit}`}</>}
      min={Math.min(0, guess, answer)}
      max={Math.max(guess, answer, 1) * 1.25}
      pins={[
        { id: 'guess', kind: 'guess', value: guess, label: 'your guess' },
        { id: 'answer', kind: 'result', value: answer, label: 'the answer' },
      ]}
    />
  )

  const layoutLevel = level.kind === 'layout' ? level : null
  const copiesBy = layoutLevel === null ? [] : perTarget(outcome)
  const rows: MirrorRow[] =
    layoutLevel === null
      ? []
      : layoutLevel.tasks.map((task, i) => ({
          id: `target-${i}`,
          cells: {
            target: <span className="font-numeric">{`${i + 1} · ${tupleText(task.goal.shape)}`}</span>,
            yours: figure(copiesBy[i] ?? 0),
            reference: figure(task.copies),
            plan: <code>{task.ghost.map((op) => opText(op)).join(', ')}</code>,
          },
        }))
  const refCopies = layoutLevel?.tasks.reduce((sum, task) => sum + task.copies, 0) ?? 0

  const versus =
    view.grid !== null
      ? [
          { id: 'masked', label: 'Masked lanes', mine: mine.masked, reference: reference.grid?.readouts.masked ?? 0 },
          { id: 'programs', label: 'Programs', mine: mine.programs, reference: reference.grid?.readouts.programs ?? 0 },
        ]
      : [
          { id: 'copies', label: 'Copies', mine: mine.copies, reference: refCopies },
          { id: 'moved', label: 'Elements moved', mine: mine.moved, reference: layoutLevel?.tasks.reduce((sum, task) => sum + task.moved, 0) ?? 0 },
          { id: 'operations', label: 'Operations', mine: mine.operations, reference: layoutLevel?.tasks.reduce((sum, task) => sum + task.ghost.length, 0) ?? 0 },
        ]

  return (
    <Result
      className="es-shift-debrief"
      verdict={verdict}
      sentence={<Words line={debrief.sentence} />}
      actions={
        <>
          {primary}
          <Button variant="quiet" aria-describedby={againId} onClick={() => (run.mode === 'graded' ? newNumbers() : run.restart())}>
            Run again
          </Button>
          <Button variant="quiet" onClick={newNumbers}>
            New numbers
          </Button>
        </>
      }
    >
      <div className="es-shift-debrief__body" data-shift-debrief="">
        {guessLine}
        <p id={againId} data-run-again="">
          <strong>Run again:</strong>{' '}
          {view.grid !== null ? (
            <>
              your masked lanes {figure(mine.masked)} against the reference&apos;s {figure(reference.grid?.readouts.masked ?? 0)}.
            </>
          ) : (
            <>
              your {copiesWord(mine.copies)} against the reference&apos;s {figure(refCopies)}, on {figure(mine.passed)} of {figure(mine.of)} {mine.of === 1 ? 'target' : 'targets'} passed.
            </>
          )}
          {run.ledger ? <Best level={view.level} /> : null}
        </p>
        {number === null ? null : (
          <p>
            <strong>The decision that mattered:</strong> your move {figure(number)}. Until then the reference, taking over, still reached the target with its copies; after it, it
            could not.
          </p>
        )}
        {hasPassRule ? (
          <p>
            <strong>The pass rule:</strong> <Words line={words.passRule ?? ''} />
          </p>
        ) : null}
        <Versus caption="Yours and the reference's, on one axis" rows={versus} />
        {rows.length > 0 ? <MirrorTable head="Targets" caption="Each target: your copies, the reference's, and the reference's plan" columns={PLAN_COLUMNS} rows={rows} /> : null}
        {view.grid !== null ? (
          <section aria-label="In Triton" className="es-shift-debrief__engine">
            <h4>In Triton</h4>
            <p>
              A kernel launches <code>cdiv(n, BLOCK)</code> programs along a dimension of size n, and each program masks the lanes whose offsets are past the edge, so its loads and
              stores there do nothing.
            </p>
            <p>
              <PartPopover
                part={{ id: 'mask', name: 'tl.load', code: true, sentence: 'A masked lane neither loads nor stores.', engine: 'tl.load', claim: 'triton.load-mask' }}
                trigger="The source, at Triton's pin"
                engineLine={
                  <>
                    In Triton: <code>tl.load</code>.
                  </>
                }
              />
            </p>
          </section>
        ) : (
          <section aria-label="In PyTorch" className="es-shift-debrief__engine">
            <h4>In PyTorch</h4>
            <p>
              <code>Tensor.view</code> works only when each new dimension lies inside one old dimension or spans dimensions whose strides chain; otherwise the tensor has to be copied
              first, for example with <code>contiguous()</code>.
            </p>
            <p>
              <PartPopover
                part={{
                  id: 'view',
                  name: 'Tensor.view',
                  code: true,
                  sentence: 'A view of a new shape needs strides that can walk it; otherwise the tensor has to be copied first.',
                  engine: 'Tensor.view',
                  claim: 'torch.view.needs-compatible-strides',
                }}
                trigger="The source, at PyTorch's pin"
                engineLine={
                  <>
                    In PyTorch: <code>Tensor.view</code>.
                  </>
                }
              />
            </p>
          </section>
        )}
      </div>
    </Result>
  )
}

/** The learner's copies on each target, from the record: each copying operation adds one to the target it was made on. */
function perTarget(outcome: ShiftOutcome): number[] {
  const out: number[] = []
  let state = shiftSession.init(shiftSession.level(outcome.record.level, outcome.record.seed))
  for (const action of outcome.record.actions) state = shiftSession.reduce(state, action as Parameters<typeof shiftSession.reduce>[1])
  for (const r of state.runs) out.push(r.kind === 'layout' ? r.copies : 0)
  return out
}
