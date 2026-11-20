import type { Draft } from '@es/ledger'
import type { CompiledBlock } from '@es/schema'
import { gradePrediction } from '@es/play/predictions/grade'
import type { Verdict } from '@es/play/predictions/grade'
import { commitFor, referenceFor } from '@es/play/predictions/truth'
import type { Truth } from '@es/play/predictions/types'
import { appendEvidence } from '@/evidence/useEvidence'
import type { Commitment, Revealed } from './predicted'
import type { BlockRun } from './runs'

/*
 * The reveal of a lesson's prediction (W1b-T02; ARCHITECTURE §4.3, §7.2; ASSESSMENT §4.7), which is the lazy half of the box: it loads
 * when the learner pulls the stub, after the game that follows the prediction has ended, because it brings the games' worlds with it
 * (packages/play/predictions) and the ledger.
 *
 * The truth is read from the run: the pure model is asked what the answer is for the record of the run the game block finished (seed,
 * level and actions), and nothing stored answers it. The learner's committed value is graded against it by the block's own shape of
 * answer, and the result is written to the ledger as a `predict` event. A prediction moves no completion and no credit
 * (ASSESSMENT §4.7): the event is stamped as practice, an authored question that every learner has seen, and it earns nothing.
 *
 * Who reads the event: the module page's Predict step and the course map's practised KCs (src/progress, through the ref the compiler writes
 * for the lesson's prediction), the Evidence page's count of events by kind, Review (src/items/today/kcs.ts maps the ref to the lesson's KCs,
 * so a prediction reschedules an idea that is earned and never earns one), and Progress's calibration (src/evidence/calibration.ts), which sets
 * each confidence tap against its outcome. A prediction read a run when its event has a seed; one revealed at commit has none.
 */

type PredictBlock = Extract<CompiledBlock, { type: 'predict' }>

export interface RevealInput {
  readonly block: PredictBlock
  /** The lesson's id, which the event's ref names. */
  readonly scope: string
  /** The lesson's content revision, which an event graded against an older one shows "re-check" for (A§4.2). */
  readonly rev?: string
  readonly committed: Commitment
  /** The finished run of the game block that answers the prediction. */
  readonly run: BlockRun
}

/** What an at-commit reveal needs: the same, with no run, because the answer reads none (D-067). */
export type CommitInput = Omit<RevealInput, 'run'>

/**
 * The event that records a revealed prediction (A§7.2: `predict:<lesson>#<id>`, the value and the truth). The truth of an interval is the
 * degenerate interval at the true value, because the ledger holds a value and its truth in the same shape. The seed is the run's, the one
 * the model read its world on.
 */
export function predictDraft(input: RevealInput | CommitInput, truth: Truth, verdict: Verdict): Draft<'predict'> {
  const { block, scope, rev, committed } = input
  const run = 'run' in input ? input.run : null
  const answer = block.answer
  return {
    kind: 'predict',
    ref: `predict:${scope}#${block.id}`,
    score: verdict.score,
    ok: verdict.ok,
    provenance: 'practice',
    // An answer revealed at commit read no run, and so has no seed.
    ...(run === null ? {} : { seed: run.result.record.seed }),
    ...(committed.conf === null ? {} : { conf: committed.conf }),
    ...(rev === undefined ? {} : { rev }),
    data: {
      value: committed.value,
      truth: answer.kind === 'interval' && typeof truth === 'number' ? { lo: truth, hi: truth } : truth,
      ...(answer.kind === 'choice' ? {} : { unit: answer.unit }),
    },
  }
}

/** Reads the truth from the run, grades the committed value against it and writes the event. Throws when the model has no reading for the prediction or cannot read this run. */
export async function reveal(input: RevealInput): Promise<Revealed> {
  const reference = await referenceFor(input.block.id)
  if (reference === undefined) throw new RangeError(`the model has no reading for the prediction ${input.block.id}`)
  const record = input.run.result.record
  const truth = reference.truth(record)
  const verdict = gradePrediction(input.block.answer, input.committed.value, truth)
  const unsaved = await writeEvent(predictDraft(input, truth, verdict))
  const counted = reference.counted?.(record) ?? []
  return { truth, ok: verdict.ok, score: verdict.score, reads: reference.reads, counted, run: { game: record.game, level: record.level, seed: record.seed }, working: [], sources: [], tag: null, unsaved }
}

/**
 * The event is written once the verdict is known. A ledger that would not take it is said to the learner, and the reveal stands. Returns why
 * it was not saved, or null.
 */
async function writeEvent(draft: Draft<'predict'>): Promise<string | null> {
  try {
    const written = await appendEvidence(draft)
    return written.ok ? null : written.detail
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** The sentence under an at-commit answer that says what it was read from, with no digit in it. */
const COMPUTED = "Worked from the question's own numbers, by the course's model."
const CLAIMED = 'Read from the claim that the question is about, which cites its source.'

/**
 * Computes the answer of a prediction that is revealed at commit, grades the committed value against it and writes the one `predict` event,
 * with the value and the truth both (D-067). It reads no run. Throws when the model has no answer for the prediction.
 */
export async function revealAtCommit(input: CommitInput): Promise<Revealed> {
  const answer = await commitFor(input.block.id)
  if (answer === undefined) throw new RangeError(`the model has no answer at commit for the prediction ${input.block.id}`)
  const truth = answer.truth()
  const verdict = gradePrediction(input.block.answer, input.committed.value, truth)
  const unsaved = await writeEvent(predictDraft(input, truth, verdict))
  return {
    truth,
    ok: verdict.ok,
    score: verdict.score,
    reads: answer.sources.some((source) => source.claim !== undefined) ? CLAIMED : COMPUTED,
    run: null,
    working: answer.working,
    sources: answer.sources,
    tag: answer.tag,
    unsaved,
  }
}
