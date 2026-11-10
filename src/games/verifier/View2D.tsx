import { useMemo } from 'react'
import { frameSvg, layoutFrame, layoutGamma } from '@es/play/verifier/layout'
import type { Frame } from '@es/play/verifier/layout'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { TapeLabel } from '@/design/components/TapeLabel'
import { svgToReact } from '@/games/loop/svg'
import { useOrientation } from '@/games/loop/useOrientation'
import { Fraction } from './Fraction'
import { showMeter, showScaffold } from './rules'
import type { VerifierRun } from './types'

/*
 * The Tasting's 2D view (GAMES.md §10 "2D path", §2.6 "The Tasting"): the pass, drawn flat. It is an SVG of the same stacks that the 3D
 * scene will draw: for each dish the commis's stack of plates beside the chef's, the plates a round set down, and what went out. The
 * picture holds no figure but a dish's plates on its paper tag and a row's name on its tape; every count is DOM, in the tape, the
 * mirror and under the picture (D-021, GAMES.md §2.6 rule 7).
 *
 * The drawing is `layoutFrame` of the view, written as SVG by `frameSvg`: the pure function that W1-T29's scene reads too. Below 480 px
 * wide it takes the portrait layout (GAMES.md §2.3). A graded run draws the stacks plain and leaves out what went out (rules.ts).
 *
 * Under the picture, a key made of the same masking tape that names the dishes: each of the code's colours with the drawn shape that
 * carries it, so that the colour is never the only way to tell the plates apart (WCAG 1.4.1).
 */

/**
 * The key. Under the 3D scene (`scene`) it also names the objects the drawing does not have: the chef's dispenser, which holds her stack,
 * the commis's stack on her left, what went out stacked on her right, and the plates that wait upside down, unplated.
 */
function Key({ run, scaffold, meter, scene = false }: { run: VerifierRun; scaffold: boolean; meter: boolean; scene?: boolean }) {
  const { view } = run
  const rows = view.rows.length > 0
  const hasOut = meter && view.rows.some((row) => row.out !== null)
  const chef = scene ? 'the chef · p, in her dispenser' : null
  return (
    <ul className="es-vf-key" aria-label="What the plates are">
      {rows && scaffold ? (
        <>
          {scene ? (
            <li>
              <TapeLabel size="sm" tilt="none">
                the commis · q, on the left
              </TapeLabel>
            </li>
          ) : null}
          <li>
            <TapeLabel size="sm" slot="green" tilt="none">
              agreed · min(p, q)
            </TapeLabel>
          </li>
          <li>
            <TapeLabel size="sm" slot="yellow" tilt="none">
              over-plated · q − p
            </TapeLabel>
          </li>
          <li>
            <TapeLabel size="sm" slot="red" tilt="none">
              under-plated · (p − q)⁺
            </TapeLabel>
          </li>
        </>
      ) : rows ? (
        <>
          <li>
            <TapeLabel size="sm" slot="yellow" tilt="none">
              the commis · q
            </TapeLabel>
          </li>
          <li>
            <TapeLabel size="sm" slot="blue" tilt="none">
              {chef ?? 'the chef · p'}
            </TapeLabel>
          </li>
        </>
      ) : (
        <>
          <li>
            <TapeLabel size="sm" slot="green" tilt="none">
              kept if the walk gets there
            </TapeLabel>
          </li>
          <li>
            <TapeLabel size="sm" slot="yellow" tilt="none">
              sent back
            </TapeLabel>
          </li>
          {scene ? (
            <li>
              <TapeLabel size="sm" tilt="none">
                upside down · not plated
              </TapeLabel>
            </li>
          ) : null}
        </>
      )}
      {rows && scaffold ? (
        <li>
          <TapeLabel size="sm" slot="blue" tilt="none">
            {chef ?? "the chef's tasting · p"}
          </TapeLabel>
        </li>
      ) : null}
      {hasOut ? (
        <li>
          <TapeLabel size="sm" slot="white" tilt="none">
            {scene ? 'what went out · on the right' : 'what went out'}
          </TapeLabel>
        </li>
      ) : null}
    </ul>
  )
}

/**
 * The view, or one part of it: `drawing` alone fills a box (the 3D Stage's first paint and fallback), and `notes` are the key and the
 * figures under it, which stand under the 3D scene as they stand under the drawing.
 */
export function View2D({ run, part = 'whole' }: { run: VerifierRun; part?: 'whole' | 'drawing' | 'notes' }) {
  const { view } = run
  const orientation = useOrientation()
  const scaffold = showScaffold(run)
  const meter = showMeter(run)
  const frame: Frame = useMemo(
    () => (view.level === 'gamma' ? layoutGamma(view, { orientation }) : layoutFrame(view, { orientation, scaffold, outcome: meter })),
    [view, orientation, scaffold, meter],
  )
  const drawing = useMemo(() => svgToReact(frameSvg(frame)), [frame])
  const rounds = view.counters.rounds
  // A tap on a dish's column in the drawing focuses that dish's weight, while there is a recipe to sculpt: pointer and keyboard meet in
  // the field (GAMES.md §2.3, "Picks focus the DOM control"). The targets are for a pointer only, and the fields are the keyboard's way.
  const taps = view.ask?.kind === 'recipe' && part === 'whole' ? frame.columns : undefined
  const notes = (
    <>
      <Key run={run} scaffold={scaffold} meter={meter} scene={part === 'notes'} />
      <div className="es-vf-under">
        {view.meter !== null && meter ? (
          <StationLight lit={view.meter.exact} label="What goes out is her tasting" words={{ lit: 'exact', dark: 'not yet', fault: 'fault' }} size="sm" />
        ) : null}
        {rounds > 0 ? (
          <span className="es-vf-under__count">
            <Readout value={rounds} tag="synthetic" size="sm" /> <span>rounds drawn</span>
          </span>
        ) : null}
        {view.meter !== null && meter ? (
          <span className="es-vf-under__count">
            <span>Distance from her tasting</span> <Fraction value={view.meter.tv} size="sm" />
          </span>
        ) : null}
      </div>
    </>
  )
  if (part === 'notes') return <div className="es-vf-view">{notes}</div>
  return (
    <div className="es-vf-view" data-verifier-view="" data-orientation={orientation} data-part={part}>
      <div className="es-vf-drawing">
        {drawing}
        {taps === undefined ? null : (
          <div className="es-vf-taps" aria-hidden="true">
            {taps.map((column, dish) => (
              <span
                key={dish}
                className="es-vf-tap"
                data-tap={dish}
                style={{ left: `${(column.x / frame.width) * 100}%`, width: `${(column.w / frame.width) * 100}%` }}
                onClick={() => document.querySelector<HTMLInputElement>(`[data-vf-dish="${dish}"]`)?.focus()}
              />
            ))}
          </div>
        )}
      </div>
      {part === 'whole' ? notes : null}
    </div>
  )
}
