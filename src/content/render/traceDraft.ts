import type { Draft } from '@es/ledger'
import type { MarkGrade } from '@/trace/grade'
import { traceMarkData, traceMarkRef } from '@/trace/marks'
import type { Annotations } from '@/trace/marks'
import type { Of } from './BlockFrame'

/** The event for marks, graded: the first task of the block names it (the one check a tape has is the attribution of its marks). */
export function traceMarkDraft(block: Of<'trace'>, rev: string | undefined, notes: Annotations, grade: MarkGrade): Draft<'trace-mark'> {
  return {
    kind: 'trace-mark',
    ref: traceMarkRef(block.id, block.tasks[0]),
    score: grade.score,
    ok: grade.ok,
    provenance: 'practice',
    ...(block.seed === undefined ? {} : { seed: block.seed }),
    ...(rev === undefined ? {} : { rev }),
    data: traceMarkData(notes, grade.errorNs),
  }
}
