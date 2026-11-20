/*
 * W2-T42: what a lesson's trace block reads from the learner's marks (src/trace/grade.ts): the attribution error, in ns, against the partition of
 * the same stretch of the tape.
 */
import { describe, expect, test } from 'bun:test'
import { attribute, stepWindows } from '@es/sim/trace'
import type { AttributionCategory } from '@es/sim/trace'
import { gradeMarks, PASS_SHARE } from '@/trace/grade'
import { addMark, NO_ANNOTATIONS } from '@/trace/marks'
import type { Annotations } from '@/trace/marks'
import { specimenTrace } from '@/trace/specimen'

const trace = specimenTrace(7)
const window = stepWindows(trace)[5]
const truth = attribute(trace, window)

const marked = (notes: Annotations, fromNs: number, toNs: number, category: AttributionCategory | null): Annotations => {
  const made = addMark(notes, fromNs, toNs, category)
  if (!made.ok) throw new Error(made.why)
  return made.notes
}

describe('gradeMarks', () => {
  test('reads nothing from a tape with no categorised mark, and a mark with no category claims nothing', () => {
    expect(gradeMarks(trace, NO_ANNOTATIONS)).toEqual({ marks: 0, markedNs: 0, errorNs: 0, score: 0, ok: false })
    expect(gradeMarks(trace, marked(NO_ANNOTATIONS, window.fromNs, window.toNs, null)).marks).toBe(0)
  })

  test('a mark for each stretch of the true partition, in its true category, has no error', () => {
    const notes = truth.segments.reduce((so, segment) => marked(so, segment.fromNs, segment.toNs, segment.category), NO_ANNOTATIONS)
    expect(gradeMarks(trace, notes)).toEqual({ marks: truth.segments.length, markedNs: window.toNs - window.fromNs, errorNs: 0, score: 1, ok: true })
  })

  test('the whole step marked as one wrong category is wrong for every ns that is not that category, and the error is those ns', () => {
    const grade = gradeMarks(trace, marked(NO_ANNOTATIONS, window.fromNs, window.toNs, 'kernel'))
    expect(grade.errorNs).toBe(truth.windowNs - truth.kernelNs)
    expect(grade.markedNs).toBe(truth.windowNs)
    expect(grade.score).toBeCloseTo(truth.kernelNs / truth.windowNs, 12)
    expect(grade.ok).toBe(truth.kernelNs / truth.windowNs >= PASS_SHARE)
  })

  test('every ns of a stretch is wrong when its category is not one that the stretch has', () => {
    const first = truth.segments[0]
    const other = (['kernel', 'copy', 'cpu-gap', 'both-idle'] as const).find((category) => category !== first.category) ?? 'kernel'
    const grade = gradeMarks(trace, marked(NO_ANNOTATIONS, first.fromNs, first.toNs, other))
    expect(grade).toMatchObject({ marks: 1, errorNs: first.toNs - first.fromNs, score: 0, ok: false })
  })

  test('two marks over the same ns each answer for them, and the error is never negative', () => {
    const first = truth.segments[0]
    let notes = marked(NO_ANNOTATIONS, first.fromNs, first.toNs, first.category)
    notes = marked(notes, first.fromNs, first.toNs, first.category)
    expect(gradeMarks(trace, notes)).toMatchObject({ marks: 2, errorNs: 0, score: 1 })
  })
})
