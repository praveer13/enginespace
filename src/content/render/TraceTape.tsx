import { useEffect, useMemo, useRef, useState } from 'react'
import { stepWindows } from '@es/sim/trace'
import { Button } from '@/design/components/Button'
import { appendEvidence } from '@/evidence/useEvidence'
import { gradeMarks } from '@/trace/grade'
import type { MarkGrade } from '@/trace/grade'
import { applyListActions } from '@/trace/list'
import type { ListAction } from '@/trace/list'
import { ListMode, TraceModes } from '@/trace/ListMode'
import type { TraceMode } from '@/trace/ListMode'
import { exportMarks, NO_ANNOTATIONS } from '@/trace/marks'
import type { Annotations } from '@/trace/marks'
import { specimenTrace } from '@/trace/specimen'
import { TraceView } from '@/trace/TraceView'
import { useNarrow } from '@/trace/useNarrow'
import type { Of } from './BlockFrame'
import { traceMarkDraft } from './traceDraft'

/*
 * The trace block's tape (W2-T42, REDESIGN §2.5): the trace viewer on the block's synthetic trace, with the learner's marks, and one control
 * that checks them. This file is a chunk of its own: TraceRun.tsx loads it when the learner opens the trace, because it brings the viewer and
 * the step-loop model that makes the tape.
 *
 * Below the narrow breakpoint the tape is a list (src/trace/ListMode.tsx): the same step as a table of stretches with category radios, and
 * a list of the step's frames and calls for the cause. Its picks are the same marks, kept here, so the check reads and writes the same
 * event whichever way they were made, and a switch shows the lanes on a phone, with the marks on them.
 *
 * Checking the marks writes one `trace-mark` event, `trace:<trace>/<task>`, with the lesson's `rev`, the marks and the attribution error in ns
 * against the partition of the same stretch (src/trace/grade.ts). The event is practice: a tape made from a seed by the course's own model is
 * no measurement of an engine. The learner is told what the check read, and never the partition itself.
 */

export interface TraceTapeProps {
  block: Of<'trace'>
  scope: string
  rev?: string
  /** The tape takes focus when it appears: the learner asked for it. */
  autoFocus?: boolean
}

/** The step the tape opens on, from 0: the sixth, a decode step of the steady state, as the Trace Room's specimen opens. */
const OPENING_STEP = 5

/** What the check read, in words before numbers. */
function said(grade: MarkGrade): string {
  const share = `${Math.round(grade.score * 100)}%`
  return grade.ok
    ? `Your marks name the right category for ${share} of the time you marked.`
    : `Your marks name the right category for ${share} of the time you marked. Look again at where a stretch ends, and at what the line is doing under it.`
}

export default function TraceTape({ block, scope, rev, autoFocus = false }: TraceTapeProps) {
  const trace = useMemo(() => specimenTrace(block.seed ?? 0), [block.seed])
  // It opens on the sixth step, a decode step of the steady state, as the Trace Room's specimen does.
  const opening = useMemo(() => {
    const step = stepWindows(trace)[OPENING_STEP]
    return step === undefined ? undefined : { fromNs: step.fromNs - Math.round((step.toNs - step.fromNs) * 0.04), toNs: step.toNs + Math.round((step.toNs - step.fromNs) * 0.04) }
  }, [trace])
  const [notes, setNotes] = useState<Annotations>(NO_ANNOTATIONS)
  const [checked, setChecked] = useState<{ grade: MarkGrade; saved: boolean; why: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const narrow = useNarrow()
  const [mode, setMode] = useState<TraceMode>('list')
  const list = narrow && mode === 'list'
  // The viewer takes the keys, so that is where focus goes: the learner asked for the tape and can mark it at once. The list is a page of
  // controls, so focus goes to its head, where Tab starts down the stretches, and the page does not jump to it.
  const opened = useRef(list)
  useEffect(() => {
    if (!autoFocus) return
    if (opened.current) root.current?.querySelector<HTMLElement>('[data-trace-list]')?.focus({ preventScroll: true })
    else root.current?.querySelector<HTMLElement>('[data-trace-view]')?.focus()
  }, [autoFocus])
  const categorised = notes.marks.filter((mark) => mark.category !== null).length
  const onNotes = (next: Annotations) => {
    setNotes(next)
    setChecked(null)
  }
  const onActions = (actions: readonly ListAction[]) => {
    const next = applyListActions(notes, actions)
    if (next !== null) onNotes(next)
  }

  const check = async () => {
    // A check that was saved stands until a mark changes: a second press, or Enter held or pressed twice, writes nothing more.
    if (checked?.saved === true) return
    setBusy(true)
    const grade = gradeMarks(trace, notes)
    let why: string | null = null
    let saved = false
    try {
      const written = await appendEvidence(traceMarkDraft(block, rev, notes, grade))
      saved = written.ok
      why = written.ok ? null : written.detail
    } catch (error) {
      why = error instanceof Error ? error.message : String(error)
    }
    setChecked({ grade, saved, why })
    setBusy(false)
    // In the list, focus goes from the button to the verdict it wrote, which is in view under it.
    if (list) resultRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="es-trace-run__tape" ref={root} data-trace-run={scope} data-marks={exportMarks(notes).length}>
      {narrow ? <TraceModes mode={mode} onMode={setMode} /> : null}
      {list ? (
        <ListMode trace={trace} traceId={block.id} headingLevel={3} title="The tape" notes={notes} onActions={onActions} initialStep={OPENING_STEP} />
      ) : (
        <TraceView trace={trace} traceId={block.id} headingLevel={3} title="The tape" initialWindow={opening} defaultNotes={notes} onNotesChange={onNotes} />
      )}
      <div className="es-trace-run__check">
        {/* Not disabled while it writes: a button that disables itself under the learner's finger drops focus to the page. A second press waits. */}
        <Button variant="ink" onClick={() => void (busy ? null : check())} disabled={categorised === 0} data-trace-check="">
          Check my marks
        </Button>
        <p className="es-trace-run__hint" id={`trace-check-${block.id}`}>
          {list
            ? // The list counts its picks above it, so this line holds still while the learner picks: nothing under it moves.
              'Pick a category for each stretch, then check them. The check is saved to your record.'
            : categorised === 0
              ? 'Mark a stretch and give it a category, then check it. The check is saved to your record.'
              : `${categorised} ${categorised === 1 ? 'mark' : 'marks'} with a category.`}
        </p>
        <p className="es-trace-run__result" role="status" tabIndex={-1} ref={resultRef} data-trace-result={checked === null ? 'none' : checked.grade.ok ? 'pass' : 'miss'}>
          {checked === null ? null : (
            <>
              {said(checked.grade)} {checked.saved ? 'Saved to your record.' : `Not saved: ${checked.why ?? 'the record would not take it'}.`}
            </>
          )}
        </p>
      </div>
    </div>
  )
}
