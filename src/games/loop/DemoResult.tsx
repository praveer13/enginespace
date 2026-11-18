import { Link } from 'react-router'
import { Button } from '@/design/components/Button'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { RESULT } from '@/front/copy'
import type { InstrumentProps } from '@/front/Instrument'

/*
 * A demo level's result on the front page (src/front/Instrument.tsx), which it draws only after the learner has acted: a part of the step
 * loop that the page loads on demand, so its first paint does not carry it. The instrument asks for it on the learner's first move, so it
 * is in hand by the time the level ends.
 */

/**
 * A level's result: the verdict, the debrief's sentence, then the way on. After demo levels 1 to 3 the next demo level is the amber
 * control, with Run again beside it and the course an outline under them, so the three fit the dock's width in two rows; after the
 * fourth, one sentence bridges to the course and Start the course is the amber one.
 */
export function Result({
  verdictId,
  ok,
  sentence,
  next,
  onNext,
  onAgain,
  course,
}: {
  verdictId: string
  ok: boolean
  sentence: string
  next: { title: string } | null
  onNext: () => void
  onAgain: () => void
  course: InstrumentProps['course']
}) {
  return (
    <div className="es-front-result__body" data-loop-debrief="">
      <p className="es-front-result__verdict" id={verdictId} data-result-heading="" data-verdict={ok ? 'passed' : 'not-yet'}>
        {ok ? RESULT.passed : RESULT.notYet}
      </p>
      <p className="es-front-result__sentence">{next === null ? RESULT.bridge : sentence}</p>
      <div className="es-front-result__ways">
        {next !== null ? (
          <PrimaryButton standalone onClick={onNext}>
            {RESULT.nextDemo}: {next.title}
          </PrimaryButton>
        ) : course === null ? null : (
          <PrimaryButton standalone to={course.href}>
            {course.label}
          </PrimaryButton>
        )}
        <Button size="sm" variant="quiet" onClick={onAgain}>
          {RESULT.again}
        </Button>
        {next === null || course === null ? null : (
          <Link to={course.href} className="es-front-out" data-front-course="">
            {course.short}
          </Link>
        )}
      </div>
    </div>
  )
}
