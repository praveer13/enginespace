/**
 * Grading (ARCHITECTURE §8.2, ASSESSMENT §4.2): the two shapes an answer takes here, and the helpers a family's `grade` is one
 * line of. A numeric answer is right within a tolerance of its key, and a wrong one can be recognised by a rule that says what
 * the learner did ("you priced the overlap that is off"). A choice is right when its id is the key, and a wrong pick is explained by
 * the option's own `why`.
 *
 * The key is `item.answer`, which `make` computed from the seed: nothing is looked up, so grading runs again from a stored seed and
 * a stored answer (`regrade.ts`) and a score that someone edited changes nothing.
 */
import { num, plain, rich } from './rich'
import type { Diagnosis, Grade, Item, Response, Tolerance } from './types'

/** Whether `value` is within `tolerance` of `truth`: exact when the tolerance is empty, otherwise within either bound. NaN and infinities are never right. */
export function withinTolerance(truth: number, value: number, tolerance: Tolerance): boolean {
  if (!Number.isFinite(value)) return false
  const difference = Math.abs(value - truth)
  if (tolerance.rel === undefined && tolerance.abs === undefined) return difference === 0
  return (tolerance.abs !== undefined && difference <= tolerance.abs) || (tolerance.rel !== undefined && difference <= tolerance.rel * Math.abs(truth))
}

/** A wrong numeric answer that a family can name. The first rule that returns a diagnosis wins. */
export type DiagnosisRule = (item: Item, value: number) => Diagnosis | null

/** Whether `value` is the same number as `target` to within 2 % (ASSESSMENT §4.2's tolerance for arithmetic on given numbers) [estimated]. */
export function isAbout(value: number, target: number, rel = 0.02): boolean {
  return withinTolerance(target, value, { rel })
}

const WRONG_KIND: Grade = { ok: false, score: 0, feedback: rich('This ticket asks for a different kind of answer.') }

/** Grades a numeric answer against the item's key, with the family's rules for naming what went wrong. */
export function gradeNumeric(item: Item, response: Response, rules: readonly DiagnosisRule[] = []): Grade {
  const answer = item.answer
  if (answer.kind !== 'numeric') throw new TypeError(`${item.family}/${item.variant} is not a numeric item`)
  if (response.kind !== 'numeric') return WRONG_KIND
  const ok = withinTolerance(answer.truth, response.value, answer.tolerance)
  const key = num(answer.truth, { unit: answer.unit, tag: 'derived', digits: answer.digits })
  if (ok) return { ok, score: 1, feedback: rich('Right: ', key, '.') }
  let diagnosis: Diagnosis | null = null
  for (const rule of rules) {
    diagnosis = rule(item, response.value)
    if (diagnosis !== null) break
  }
  return { ok, score: 0, feedback: rich('The key is ', key, '.'), ...(diagnosis === null ? {} : { diagnosis }) }
}

/** Grades a choice by option id. A wrong pick is diagnosed by the misconception its option encodes, and its `why` is the sentence. */
export function gradeChoice(item: Item, response: Response): Grade {
  const answer = item.answer
  if (answer.kind !== 'choice') throw new TypeError(`${item.family}/${item.variant} is not a choice item`)
  if (response.kind !== 'choice') return WRONG_KIND
  const picked = answer.options.find((option) => option.id === response.pick)
  if (picked === undefined) return { ok: false, score: 0, feedback: rich('That option is not on this ticket.') }
  if (picked.id === answer.correct) return { ok: true, score: 1, feedback: rich('Right.') }
  const key = answer.options.find((option) => option.id === answer.correct)
  const feedback = rich('The ticket says: ', ...(key === undefined ? [] : key.text), '.')
  return { ok: false, score: 0, feedback, ...(picked.miss === undefined ? {} : { diagnosis: { id: picked.miss, message: picked.why } }) }
}

/** The key as a sentence, for a screen reader's label and for the leak scan: `380 µs`, or the text of the right option. */
export function keyText(item: Item): string {
  const answer = item.answer
  if (answer.kind === 'numeric') return plain([num(answer.truth, { unit: answer.unit, tag: 'derived', digits: answer.digits })])
  return plain(answer.options.find((option) => option.id === answer.correct)?.text ?? [])
}
