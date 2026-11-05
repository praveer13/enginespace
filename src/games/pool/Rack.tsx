import { Glyph, Icon } from '@/design/components/Glyph'
import { Pan } from '@/design/components/Pan'
import { Readout } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'
import { TapeLabel } from '@/design/components/TapeLabel'
import type { PanView, PoolView } from '@es/play/pool/types'
import type { Dump } from './dump'
import { panTitle, stationGlyph } from './glyphs'

/*
 * The reach-in, drawn flat (GAMES.md §2.6 "The Reach-In", §8 "2D path"): a hotel pan in every slot, in rows of sixteen, each in its slot
 * for its whole life, and the rotation along its base. A pan's state is its form: bare, solid, hatched with a hash mark, green, or a
 * kit's with its pin. The station that keeps it is a marker glyph at its corner (a circle for full attention, a square for a sliding
 * window, a hexagon for state), the same glyph as the station's name in the key. Nothing here is the only place a number shows: the
 * counts are the tape's and the mirror's, and the rack and the rotation are a drawing that the table below describes.
 *
 * The lamp falls on the pans an open eviction would dump (the choice as it stands), and on nothing else here. A pan the learner has
 * chosen to dump is drawn struck, in the dumped form, before the dump is confirmed. Pans never move: a pan changes where it sits.
 */

export interface CellProps {
  pan: PanView
  view: PoolView
  /** Chosen to be dumped: the pan is drawn struck. */
  struck?: boolean
  /** Under the lamp: the choice the learner is about to make acts on it. */
  lamp?: boolean
  /** Pointed at from a ticket or a row: the pan takes the hand's ring. */
  pointed?: boolean
  onPick?: () => void
}

/** One pan in its place. */
export function Cell({ pan, view, struck = false, lamp = false, pointed = false, onPick }: CellProps) {
  const station = pan.station === null ? null : view.stations[pan.station]
  const spokenCached = pan.state === 'shared' && pan.refs === 0
  return (
    <li className="es-reachin__cell" data-state={struck ? 'evicted' : pan.state} data-id={pan.id}>
      <Pan
        state={struck ? 'evicted' : pan.state}
        name={`pan ${pan.id + 1}`}
        size="sm"
        lamp={lamp}
        data-force={pointed ? 'hover' : undefined}
        title={panTitle(pan, view)}
        onSelect={onPick}
        tabIndex={onPick === undefined ? undefined : -1}
      />
      {spokenCached && !struck ? <Icon name="hash" className="es-reachin__spoken" /> : null}
      {station !== null && !struck ? <Glyph shape={stationGlyph(station)} className="es-reachin__kind" /> : null}
    </li>
  )
}

export interface RackProps {
  view: PoolView
  dump: Dump
  /** Pans a ticket or a row is pointing at. */
  pointed: readonly number[]
  /** Whether the pointer may pick a pan of the open eviction in the rack. Phones pick from the list. */
  pick: boolean
}

export function Rack({ view, dump, pointed, pick }: RackProps) {
  const open = dump.open && view.ask?.kind === 'evict' ? view.ask.candidates : []
  const total = view.pans.length
  const stock = view.stock
  return (
    <section className="es-reachin__cabinet" aria-label="The reach-in" data-reachin-rack="">
      <header className="es-reachin__plate">
        <span className="es-reachin__name">The reach-in</span>
        <TapeLabel size="sm" tilt="left">
          KV page pool
        </TapeLabel>
        <span className="es-reachin__count">
          <Readout value={total} unit="pages" tag="synthetic" size="sm" />
          <span className="es-reachin__tally">
            bare <span className="font-numeric">{stock.bare}</span> · held <span className="font-numeric">{stock.held}</span> · cached{' '}
            <span className="font-numeric">{stock.cached}</span>
            {stock.kits > 0 ? (
              <>
                {' '}
                · kits <span className="font-numeric">{stock.kits}</span>
              </>
            ) : null}
          </span>
        </span>
      </header>
      <ol className="es-reachin__rack" aria-hidden="true" style={{ ['--es-rack-cols' as string]: view.cols }}>
        {view.pans.map((pan) => {
          const candidate = open.includes(pan.id)
          return (
            <Cell
              key={pan.id}
              pan={pan}
              view={view}
              struck={dump.isPicked(pan.id) && candidate}
              lamp={dump.isPicked(pan.id) && candidate}
              pointed={pointed.includes(pan.id)}
              onPick={pick && candidate ? () => dump.toggle(pan.id) : undefined}
            />
          )
        })}
      </ol>
      <Key view={view} />
    </section>
  )
}

/** The key to the drawing: the forms a pan takes and the stations' glyphs, drawn as the objects they stand for. */
function Key({ view }: { view: PoolView }) {
  const sample = (state: PanView['state'], word: string, mark?: 'hash' | 'pin') => (
    <li className="es-reachin__key-item">
      <Pan state={state} name={word} size="sm" />
      {mark === 'hash' ? <Icon name="hash" className="es-reachin__key-mark" /> : null}
      <span>{word}</span>
    </li>
  )
  return (
    <div className="es-reachin__key" aria-hidden="true">
      <ul className="es-reachin__key-forms">
        {sample('free', 'bare')}
        {sample('used', 'held')}
        {sample('cached', 'cached')}
        {sample('shared', 'shared mise')}
        {view.kits.length > 0 ? sample('adapter', "a kit's") : null}
      </ul>
      <ul className="es-reachin__key-stations">
        {view.stations.map((station) => (
          <li key={station.id} className="es-reachin__key-item">
            <Glyph shape={stationGlyph(station)} className="es-reachin__key-glyph" />
            <span>{station.id}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface RotationProps {
  view: PoolView
  dump: Dump
  pointed: readonly number[]
}

/** The rotation along the base: the pans nobody holds, in the order they go, the next on the left. Bare pans lead it, shown as one run. */
export function Rotation({ view, dump, pointed }: RotationProps) {
  const order = view.rotation
  const bare = order.filter((id) => view.pans[id].state === 'free').length
  const cached = order.slice(bare)
  return (
    <section className="es-reachin__rotation" aria-label="The rotation: the free line" data-reachin-rotation="">
      <header className="es-reachin__rotation-head">
        <TapeLabel size="sm" tilt="right">
          The rotation
        </TapeLabel>
        <span className="es-reachin__rotation-note">next to go on the left</span>
      </header>
      <ol className="es-reachin__strip" aria-hidden="true">
        {bare > 0 ? (
          <li className="es-reachin__bare">
            <Pan state="free" name="bare" size="sm" />
            <span>
              <span className="font-numeric">{formatReadout(bare)}</span> bare first
            </span>
          </li>
        ) : null}
        {cached.map((id) => (
          <Cell key={id} pan={view.pans[id]} view={view} struck={dump.isPicked(id)} lamp={dump.isPicked(id)} pointed={pointed.includes(id)} />
        ))}
      </ol>
    </section>
  )
}
