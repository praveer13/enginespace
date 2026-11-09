import { useId, type ReactNode } from 'react'
import type { SceneView } from '@es/play/broken-bench/types'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { noteLines, setupLines, type FormLine } from './Setup'

/*
 * The inspector's clipboard (GAMES.md §11 "Cases", §2.6 "The Inspection"): the kitchen's report and its setup on a form of ticket paper,
 * held in the clip of a steel board. A case is "an inspection report": the claim, the setup, and the notes the inspector counted off the
 * stopwatch's log. The claim is printed large in the printer's dots, because it is the thing on trial; the setup is the report's own
 * flags; the notes are counts that anyone can make, and none of them is the number the court will find.
 *
 * It is DOM, and it is independent of the sheets: the sheets, the tail and the form all draw the same case. The form carries one stamp
 * that says every figure on it is synthetic, as the printer's tape does for its ticks (DESIGN.md, "Printer Tape").
 */

/** The turns of the spring's wire round the barrel, by where each crosses its top edge. */
const COILS = [58, 63, 68, 73, 78, 83, 88, 93, 98]

/**
 * The spring clip at the head of the board, drawn: a stamped plate riveted to the steel, the barrel it pivots on with the spring's wire wound
 * round it and a leg of wire pressing on the plate and on the jaw, and the jaw with its rolled lip, which holds the form and casts its
 * shadow on the paper (bench.css). It is a picture of an object, so it is hidden from assistive technology, and its paints are token roles
 * set by class in bench.css. Each board draws its own gradients under its own id: the form is drawn twice on the page, one of them hidden.
 */
function SpringClip() {
  const id = `es-bench-clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const plate = `url(#${id}-plate)`
  const wire = `${COILS.map((x) => `M${x} 22.5L${x + 5} 34.5`).join('')}M58 28.5C52 27 47 23 44 17M103 28.5C108 31 111 37 112.5 45`
  const shine = COILS.map((x) => `M${x + 0.7} 23.4L${x + 4.6} 33`).join('')
  return (
    <svg className="es-bench-clip__spring" viewBox="0 0 160 60" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="es-bench-spring__lit" />
          <stop offset="0.55" className="es-bench-spring__mid" />
          <stop offset="1" className="es-bench-spring__low" />
        </linearGradient>
        <linearGradient id={`${id}-barrel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="es-bench-spring__dark" />
          <stop offset="0.3" className="es-bench-spring__lit" />
          <stop offset="0.55" className="es-bench-spring__mid" />
          <stop offset="1" className="es-bench-spring__dark" />
        </linearGradient>
        <radialGradient id={`${id}-rivet`} cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" className="es-bench-spring__glint" />
          <stop offset="0.4" className="es-bench-spring__mid" />
          <stop offset="1" className="es-bench-spring__dark" />
        </radialGradient>
      </defs>
      <rect className="es-bench-spring__plate" x="18" y="8" width="124" height="20" rx="6" fill={plate} />
      <path className="es-bench-spring__ridge" d="M25 11.5H135" />
      <circle className="es-bench-spring__rivet" cx="32" cy="18" r="4.2" fill={`url(#${id}-rivet)`} />
      <circle className="es-bench-spring__rivet" cx="128" cy="18" r="4.2" fill={`url(#${id}-rivet)`} />
      <path className="es-bench-spring__plate" d="M26 30H134L128.5 51Q127.5 55 123.5 55H36.5Q32.5 55 31.5 51Z" fill={plate} />
      <path className="es-bench-spring__groove" d="M40 40H120" />
      <path className="es-bench-spring__ridge" d="M40 41.2H120M33 51.5H127" />
      <path className="es-bench-spring__under" d="M34.5 54H125.5" />
      <rect className="es-bench-spring__barrel" x="22" y="23" width="116" height="11" rx="5.5" fill={`url(#${id}-barrel)`} />
      <path className="es-bench-spring__wire" d={wire} />
      <path className="es-bench-spring__shine" d={shine} />
    </svg>
  )
}

function Lines({ lines, label }: { lines: readonly FormLine[]; label: string }) {
  return (
    <dl className="es-bench-lines" aria-label={label}>
      {lines.map((line) => (
        <div key={line.id} className="es-bench-lines__line" data-line={line.id}>
          <dt>{line.term}</dt>
          <dd>{line.says}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface ClipboardProps {
  scene: SceneView
  caseNo: number
  cases: number
  /** Extra classes of the board, which the page uses to place it. */
  className?: string
  /** What sits under the form: the learner's own words are not on the report, so this is for the page's notes. */
  children?: ReactNode
}

export function Clipboard({ scene, caseNo, cases, className, children }: ClipboardProps) {
  const { claim } = scene
  return (
    <section className={['es-bench-clip', className].filter(Boolean).join(' ')} aria-label="The report on trial, its setup and the inspector's notes" data-bench-clip="">
      <SpringClip />
      <Ticket
        as="div"
        width="full"
        hole={false}
        head="Inspection report"
        meta={cases === 1 ? 'one case' : `case ${caseNo} of ${cases}`}
        foot={['Every figure on this form is synthetic']}
        className="es-bench-form"
      >
        <div className="es-bench-report">
          <div className="es-bench-claim">
            <p className="es-bench-claim__what">
              <TapeLabel size="sm" tilt="left">
                reported
              </TapeLabel>{' '}
              p99 time to first token
            </p>
            <Readout value={claim.valueUs / 1000} digits={1} unit="ms" tag="synthetic" size="xl" className="es-bench-claim__value" />
            <p className="es-bench-claim__basis">
              from <span className="font-numeric">{formatReadout(claim.n)}</span> orders, timed from {claim.timerStartsAt === 'send' ? 'the send' : 'the due time'}
            </p>
          </div>
          <Lines lines={setupLines(scene)} label="The setup of the report" />
        </div>
        <Lines lines={noteLines(scene)} label="The inspector's notes, counted off the log" />
        {children}
      </Ticket>
    </section>
  )
}
