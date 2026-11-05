import type { VerifierView } from '@es/play/verifier/types'
import type { VerifierRun } from './types'

/*
 * What a graded run keeps from the learner (ASSESSMENT §4.3, GAMES.md §10): "Graded levels hide the live meter and take one submission".
 * The session computes every figure and the view carries it; these say which of them a page may draw while the run is on. A graded run is
 * the Prove step, so the decomposition (the plates both stacks share, and the excess on each side) and the exact distance of a recipe,
 * which together give the answer to `exact` away, are left out of it. A practice run shows them: they are how the rule is learned.
 *
 * The one place the rule lives, so that the drawing, the mirror, the tape and the keys cannot disagree.
 */

const SCULPTED = (level: VerifierView['level']): boolean => level === 'exact' || level === 'greedy-ngram'

/** The run is graded and still on. */
export const gradedAndOn = (run: Pick<VerifierRun, 'mode' | 'done'>): boolean => run.mode === 'graded' && !run.done

/** The plates both stacks share, and each side's extra, are drawn and listed. In `greedy-ngram`'s temperature-0 question they are not: they are another question's. */
export function showScaffold(run: Pick<VerifierRun, 'mode' | 'done' | 'view'>): boolean {
  if (run.mode === 'graded' && !run.done) return false
  return !(run.view.level === 'greedy-ngram' && run.view.ask?.kind === 'judge')
}

/** What went out, drawn and listed, and the exact distance of the learner's recipe: the live meter. */
export const showMeter = (run: Pick<VerifierRun, 'mode' | 'done' | 'view'>): boolean => !(gradedAndOn(run) && SCULPTED(run.view.level))

/** Rounds may be drawn from the page. A graded recipe is judged in rationals, and a sample of it would tell the learner what the meter hides. */
export const showDraws = (run: Pick<VerifierRun, 'mode' | 'done' | 'view'>): boolean => run.view.canDraw && showMeter(run)
