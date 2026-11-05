import { useId } from 'react'
import { Pan } from '@/design/components/Pan'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { printedId } from '@/map/summary'
import { SPECIALS } from './copy'
import type { ArrivingLine, Board, Line, OpenLine } from './lines'
import { Poster } from './Poster'
import { hasPoster } from './posters'
import './specials.css'

/*
 * The Play index (`/play`; ARCHITECTURE §3.1, TRACKER W1-T06): the specials board. The games are lines on a sheet of the house's steel,
 * each with its picture in a recessed well, its display name stamped over its subtitle on tape, the module it belongs to and whether it
 * has a 3D view on tape beside them, and one stub to play it. A game that is not built yet hangs as a bare pan in its well, labelled
 * with the wave that brings it, and has no stub: the board never links to a page that is not there.
 *
 * The page takes everything it shows as props (lines.ts works them out of the roster and the registry), and reads no store.
 */

export interface SpecialsViewProps {
  board: Board
}

/** The module a game belongs to, and the others that use it, then its view: 3D with a 2D view as well, or 2D alone. */
function Facts({ line }: { line: Line }) {
  const [home, ...others] = line.modules
  return (
    <ul className="es-line__facts" aria-label={SPECIALS.modules}>
      <li>
        <TapeLabel size="sm" tilt="none">
          <TextLink to={`/m/${home}`}>{printedId(home)}</TextLink>
        </TapeLabel>
      </li>
      {others.length > 0 ? (
        <li>
          <TapeLabel size="sm" tilt="none">
            {SPECIALS.also}{' '}
            {others.map((module, at) => (
              <span key={module}>
                {at > 0 ? ', ' : null}
                <TextLink to={`/m/${module}`}>{printedId(module)}</TextLink>
              </span>
            ))}
          </TapeLabel>
        </li>
      ) : null}
      <li>
        <TapeLabel size="sm" tilt="none">
          {line.has3d ? SPECIALS.view.d3 : SPECIALS.view.d2}
        </TapeLabel>
      </li>
      {line.has3d ? (
        <li>
          <TapeLabel size="sm" tilt="none">
            {SPECIALS.view.twoToo}
          </TapeLabel>
        </li>
      ) : null}
    </ul>
  )
}

/** The name stamped, and the engine's concept on tape under it. */
function Name({ line }: { line: Line }) {
  return (
    <div className="es-line__name">
      <h3 className="es-line__title">{line.title}</h3>
      <TapeLabel tilt="left" className="es-line__subtitle">
        {line.subtitle}
      </TapeLabel>
    </div>
  )
}

function OpenRow({ line }: { line: OpenLine }) {
  return (
    <li className="es-line" data-game={line.id} data-status="open">
      <div className="es-line__well" data-picture={hasPoster(line.id) ? 'poster' : 'none'}>
        {hasPoster(line.id) ? (
          <Poster id={line.id} />
        ) : (
          <span className="es-line__empty">
            <span aria-hidden="true">
              <Pan state="free" name={line.title} size="md" />
            </span>
            <span>{SPECIALS.poster.none}</span>
          </span>
        )}
      </div>
      <div className="es-line__body">
        <Name line={line} />
        <Facts line={line} />
      </div>
      <div className="es-line__act">
        <Stub to={`/play/${line.id}`} standalone>
          {SPECIALS.play}
          <span className="sr-only"> {line.title}</span>
        </Stub>
      </div>
    </li>
  )
}

function ArrivingRow({ line }: { line: ArrivingLine }) {
  return (
    <li className="es-line" data-game={line.id} data-status="arriving">
      <div className="es-line__well" data-picture="pan">
        <span className="es-line__empty" aria-hidden="true">
          <Pan state="free" name={line.title} size="md" />
        </span>
      </div>
      <div className="es-line__body">
        <Name line={line} />
        <Facts line={line} />
      </div>
      <div className="es-line__act">
        <TapeLabel tilt="right" className="es-line__soon">
          {line.wave > 0 ? `${SPECIALS.arrivesWith} W${line.wave}` : SPECIALS.notBuilt}
        </TapeLabel>
      </div>
    </li>
  )
}

export function SpecialsView({ board }: SpecialsViewProps) {
  const openId = useId()
  const arrivingId = useId()
  return (
    <div className="es-specials" data-page="play">
      <header className="es-specials__header">
        <div className="es-specials__heading">
          <h1 className="es-specials__title">{SPECIALS.title}</h1>
          <TapeLabel tilt="left" className="es-specials__term">
            {SPECIALS.term}
          </TapeLabel>
        </div>
        {SPECIALS.lede.map((line) => (
          <p key={line} className="es-specials__lede">
            {line}
          </p>
        ))}
      </header>
      <div className="es-specials__board">
        {board.open.length > 0 ? (
          <section aria-labelledby={openId} className="es-specials__group" data-group="open">
            <h2 id={openId} className="es-specials__plate">
              {SPECIALS.open}
            </h2>
            <ul className="es-lines">
              {board.open.map((line) => (
                <OpenRow key={line.id} line={line} />
              ))}
            </ul>
          </section>
        ) : null}
        {board.arriving.length > 0 ? (
          <section aria-labelledby={arrivingId} className="es-specials__group" data-group="arriving">
            <h2 id={arrivingId} className="es-specials__plate">
              {SPECIALS.arriving}
            </h2>
            <ul className="es-lines">
              {board.arriving.map((line) => (
                <ArrivingRow key={line.id} line={line} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
