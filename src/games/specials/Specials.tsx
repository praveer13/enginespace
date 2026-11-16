import { Link } from 'react-router'
import { Icon } from '@/design/components/Glyph'
import { TextLink } from '@/design/components/TextLink'
import { printedId } from '@/map/summary'
import type { AttemptWord } from '@/progress/next'
import { LEGENDS } from '@/progress/words'
import { SPECIALS } from './copy'
import type { GameLine, LevelLine, PublishedLine } from './lines'
import './specials.css'

/*
 * The Games index (`/play`; REDESIGN §3.8): a plain list of the nine games, each a row with its name, the role the learner takes, the
 * rule in one line, where it sits in the course, and its levels. A level says whether it is practice or graded and the learner's best
 * attempt in words. A game that is not published says so and has no link. There are no picture boxes, and the page takes everything it
 * shows as props (lines.ts works them out of the roster, the registry and the ledger), so it reads no store itself.
 *
 * `attempts` maps `<game>/<level>` to the best attempt. It is null until the ledger has opened: the rows then leave the attempt
 * out and keep their height, so a learner who has passed a level is never told "not yet" for a moment first.
 */

export interface SpecialsViewProps {
  lines: readonly GameLine[]
  attempts: ReadonlyMap<string, AttemptWord> | null
}

/** The module a game belongs to, and the others that use it, then its view: 3D with a 2D view as well, or 2D alone. */
function Facts({ line }: { line: GameLine }) {
  const [home, ...others] = line.modules
  return (
    <p className="es-line__facts">
      <span>
        {SPECIALS.modules} <TextLink to={`/m/${home}`}>{printedId(home)}</TextLink>
        {others.length > 0 ? (
          <>
            {', '}
            {SPECIALS.also}{' '}
            {others.map((module, at) => (
              <span key={module}>
                {at > 0 ? ', ' : null}
                <TextLink to={`/m/${module}`}>{printedId(module)}</TextLink>
              </span>
            ))}
          </>
        ) : null}
      </span>
      <span>{line.has3d ? `${SPECIALS.view.d3}, ${SPECIALS.view.twoToo}` : SPECIALS.view.d2}</span>
    </p>
  )
}

function Level({ level, attempt }: { level: LevelLine; attempt: AttemptWord | undefined }) {
  return (
    <li className="es-gl" data-level={level.id} data-kind={level.kind} data-attempt={attempt === undefined ? 'unread' : attempt.replaceAll(' ', '-')}>
      <Link to={level.href} className="es-gl__name">
        {level.title}
      </Link>
      <span className="es-gl__kind">{SPECIALS.kinds[level.kind]}</span>
      <span className="es-gl__attempt">
        {attempt === undefined ? null : (
          <>
            <span className="es-gl__mark" aria-hidden="true" />
            {attempt}
          </>
        )}
      </span>
    </li>
  )
}

function Levels({ line, attempts }: { line: PublishedLine; attempts: SpecialsViewProps['attempts'] }) {
  return (
    <div className="es-line__levels">
      <h3 className="es-line__levels-title">{SPECIALS.levels}</h3>
      <ul className="es-gl-list" aria-label={`${line.title}: ${SPECIALS.levels}`}>
        {line.levels.map((level) => (
          <Level key={level.id} level={level} attempt={attempts?.get(`${line.id}/${level.id}`)} />
        ))}
      </ul>
    </div>
  )
}

function Row({ line, attempts }: { line: GameLine; attempts: SpecialsViewProps['attempts'] }) {
  return (
    <li className="es-line" data-game={line.id} data-status={line.published ? 'published' : 'unpublished'}>
      <div className="es-line__body">
        <h2 className="es-line__title">{line.title}</h2>
        <p className="es-line__role">{line.role}</p>
        <p className="es-line__rule">{line.subtitle}</p>
        <Facts line={line} />
        {line.published ? (
          <Link to={`/play/${line.id}`} className="es-line__play">
            {SPECIALS.play}
            <span className="sr-only"> {line.title}</span>
            <Icon name="arrow" className="es-line__arrow" />
          </Link>
        ) : null}
      </div>
      {line.published ? (
        <Levels line={line} attempts={attempts} />
      ) : (
        <div className="es-line__levels">
          <p className="es-line__pending">{SPECIALS.notPublished}</p>
        </div>
      )}
    </li>
  )
}

export function SpecialsView({ lines, attempts }: SpecialsViewProps) {
  return (
    <div className="es-specials" data-page="play">
      <header className="es-specials__header">
        <h1 className="es-specials__title">{SPECIALS.title}</h1>
        {SPECIALS.lede.map((text) => (
          <p key={text} className="es-specials__lede">
            {text}
          </p>
        ))}
        <p className="es-specials__legend">{LEGENDS.attempt}</p>
      </header>
      <section aria-label={SPECIALS.title}>
        <ol className="es-lines">
          {lines.map((line) => (
            <Row key={line.id} line={line} attempts={attempts} />
          ))}
        </ol>
      </section>
      <footer className="es-specials__foot">
        <p>
          <TextLink to="/trace-room">{SPECIALS.traces.link}</TextLink>
          <span>{SPECIALS.traces.lead}</span>
        </p>
      </footer>
    </div>
  )
}
