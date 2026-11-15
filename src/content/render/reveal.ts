import type { Draft } from '@es/ledger'
import type { CompiledBlock } from '@es/schema'
import { gradePrediction } from '@es/play/predictions/grade'
import type { Verdict } from '@es/play/predictions/grade'
import { referenceFor } from '@es/play/predictions/truth'
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
 * for the lesson's prediction), and the Evidence page's count of events by kind. Two readers do not exist yet, and W2-T44 builds them: Today,
 * which may reschedule an idea that is earned by a prediction and never earn one (src/items/today/kcs.ts maps no `predict:` ref to a KC),
 * and the Mirror's calibration, which sets each confidence tap against its outcome.
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

/**
 * The event that records a revealed prediction (A§7.2: `predict:<lesson>#<id>`, the value and the truth). The truth of an interval is the
 * degenerate interval at the true value, because the ledger holds a value and its truth in the same shape. The seed is the run's, the one
 * the model read its world on.
 */
export function predictDraft(input: RevealInput, truth: Truth, verdict: Verdict): Draft<'predict'> {
  const { block, scope, rev, committed, run } = input
  const answer = block.answer
  return {
    kind: 'predict',
    ref: `predict:${scope}#${block.id}`,
    score: verdict.score,
    ok: verdict.ok,
    provenance: 'practice',
    seed: run.result.record.seed,
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
  // The event is written once the verdict is known. A ledger that would not take it is said to the learner, and the reveal stands.
  let unsaved: string | null = null
  try {
    const written = await appendEvidence(predictDraft(input, truth, verdict))
    if (!written.ok) unsaved = written.detail
  } catch (error) {
    unsaved = error instanceof Error ? error.message : String(error)
  }
  return { truth, ok: verdict.ok, score: verdict.score, reads: reference.reads, run: { game: record.game, level: record.level, seed: record.seed }, unsaved }
}
