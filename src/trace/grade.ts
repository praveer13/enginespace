/*
 * What a lesson's trace block reads from the learner's marks (W2-T42): the attribution error, in ns, against the partition that
 * `attribute` (packages/sim/trace) makes of the same stretch of the tape. The viewer never holds this (it cannot give an answer away);
 * the host that writes the `trace-mark` event does.
 *
 * Only a mark with a category counts, since a mark without one claims nothing. For each, the stretch it covers is cut by the true
 * partition, and the ns whose true category is not the mark's own are wrong. Two marks over the same ns each answer for them, as they
 * do on the tape. The error is the wrong ns in all; the score is the share of marked ns that are right.
 */
import { attributeWindows } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import type { Annotations } from './marks'

/** The share of marked ns that must carry the right category for the check to pass [estimated]: a snap to an edge that is a span off should not fail it. */
export const PASS_SHARE = 0.9

export interface MarkGrade {
  /** Categorised marks that were read. */
  readonly marks: number
  /** ns under those marks, counted once for each mark. */
  readonly markedNs: number
  /** ns whose true category is not the mark's. This is the event's `error`. */
  readonly errorNs: number
  /** The share of marked ns that are right, in [0, 1]; 0 when nothing is marked. */
  readonly score: number
  readonly ok: boolean
}

export function gradeMarks(trace: EsTrace, notes: Annotations): MarkGrade {
  const marks = notes.marks.filter((mark) => mark.category !== null)
  if (marks.length === 0) return { marks: 0, markedNs: 0, errorNs: 0, score: 0, ok: false }
  const windows = attributeWindows(
    trace,
    marks.map((mark) => ({ fromNs: mark.fromNs, toNs: mark.toNs })),
  )
  let markedNs = 0
  let errorNs = 0
  marks.forEach((mark, at) => {
    markedNs += mark.toNs - mark.fromNs
    for (const segment of windows[at].segments) if (segment.category !== mark.category) errorNs += segment.toNs - segment.fromNs
  })
  const score = markedNs === 0 ? 0 : Math.max(0, 1 - errorNs / markedNs)
  return { marks: marks.length, markedNs, errorNs, score, ok: score >= PASS_SHARE }
}
