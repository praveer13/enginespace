import { Button } from '@/design/components/Button'
import type { PoolView } from '@es/play/pool/types'
import { tableFor } from './focus'
import { KIND_WORDS, pagesWord, reqName, STATE_WORDS } from './select-words'
import type { PoolPick } from './types'
import './pool3d.css'

/*
 * What the 3D view shows of the pool, in words, and the way to choose it by hand (A§6.8: a pick in the scene is never the only way): a
 * button for each running request (its block table shows as threads to its pages, and its first page fans into its layers), and a page's
 * number (it fans into its layers). The legend under it is the 2D view's own (Game.tsx): the scene draws each page's glyph as the diagram
 * does. A lazy chunk of its own, which the page loads with the 3D view, under the camera buttons.
 */

export interface Select3DProps {
  view: PoolView
  pick: PoolPick | null
  /** The KV group that One KV group shows, or null for every group's. */
  station: number | null
  onPick: (pick: PoolPick | null) => void
}

export default function Select3D({ view, pick, station, onPick }: Select3DProps) {
  const toggle = (next: PoolPick) => onPick(pick !== null && pick.kind === next.kind && pick.id === next.id ? null : next)
  const shown = pick !== null && (pick.kind === 'page' ? view.pans[pick.id] !== undefined : view.running.includes(pick.id)) ? pick : null
  return (
    <>
      <div role="group" aria-label="Select to see its pages" className="es-pool3d-panel__row" data-pool-select="">
        <span className="es-pool3d-panel__label">Select a request:</span>
        {view.running.length === 0 ? <span className="es-pool3d-panel__label">none is running</span> : null}
        {view.running.map((id) => (
          <Button key={id} size="sm" variant={shown?.kind === 'request' && shown.id === id ? 'ink' : 'plate'} aria-pressed={shown?.kind === 'request' && shown.id === id} onClick={() => toggle({ kind: 'request', id })}>
            {reqName(id)}
          </Button>
        ))}
        <label className="es-pool3d-panel__label" htmlFor="es-pool3d-page">
          or a page:
        </label>
        <input
          key={shown?.kind === 'page' ? shown.id : 'none'}
          id="es-pool3d-page"
          className="es-pool3d-panel__page"
          type="number"
          inputMode="numeric"
          min={1}
          max={view.pans.length}
          defaultValue={shown?.kind === 'page' ? shown.id + 1 : undefined}
          placeholder={`1 to ${view.pans.length}`}
          onChange={(event) => {
            const n = Number(event.currentTarget.value)
            if (Number.isInteger(n) && n >= 1 && n <= view.pans.length) onPick({ kind: 'page', id: n - 1 })
          }}
        />
        {shown !== null ? (
          <Button size="sm" variant="plate" onClick={() => onPick(null)}>
            Clear
          </Button>
        ) : null}
      </div>
      <Note view={view} pick={shown} station={station} />
    </>
  )
}

/** What the scene shows, in words: the page's fan, or the request's threads. Every number the scene draws is said here. */
function Note({ view, pick, station }: { view: PoolView; pick: PoolPick | null; station: number | null }) {
  if (pick?.kind === 'page') {
    const page = view.pans[pick.id]
    const group = page.station === null ? null : view.stations[page.station]
    const held = page.holders.length === 0 ? 'Nobody holds it.' : `Held by ${page.holders.map(reqName).join(', ')}.`
    return (
      <p className="es-pool3d-note" data-pool-fan="">
        Page <span className="font-numeric">{page.id + 1}</span>: {STATE_WORDS[page.state]}. {page.kit !== null ? `Adapter ${page.kit + 1} holds it.` : held}{' '}
        {group === null ? (
          page.kit !== null ? (
            "An adapter's page holds the adapter's weights, so it has no layers to fan into."
          ) : (
            'It holds no block, so it has no layers yet.'
          )
        ) : (
          <>
            It holds one block of KV group <code>{group.id}</code> ({KIND_WORDS[group.kind]}) for all <span className="font-numeric">{group.layers}</span> of the group&apos;s layers
            {group.padLayers > 0 ? (
              <>
                , and <span className="font-numeric">{group.padLayers}</span> padding layers drawn hollow
              </>
            ) : null}
            : one page per block, for the whole group.
            {page.holders.length > 1 ? ` A thread from each of ${page.holders.map(reqName).join(' and ')} ends on it.` : ''}
          </>
        )}
      </p>
    )
  }
  const request = pick?.kind === 'request' ? pick.id : pick === null ? view.running[view.running.length - 1] : undefined
  if (request === undefined) {
    return (
      <p className="es-pool3d-note" data-pool-fan="">
        {view.running.length === 0 ? 'No request is running yet. Admit one in the dock: its block table shows as threads from its tile to its pages, and one of its pages stands open into the layers it serves.' : 'Select a request to see its pages, or a page to fan it into its layers.'}
      </p>
    )
  }
  const table = tableFor(view, request, station)
  const total = table.reduce((sum, list) => sum + list.length, 0)
  // Its page nearest the front of the rack stands open in the scene (scene-layout.ts's headPage).
  const head = table.flat().reduce<(typeof table)[number][number] | undefined>((best, page) => (best === undefined || Math.floor(page.id / view.cols) > Math.floor(best.id / view.cols) ? page : best), undefined)
  const group = head?.station == null ? null : view.stations[head.station]
  return (
    <p className="es-pool3d-note" data-pool-fan="">
      {pick === null ? 'Showing ' : ''}
      {reqName(request)}
      {pick === null ? ', admitted last' : ''}: its block table holds <span className="font-numeric">{total}</span> {pagesWord(total)}
      {station === null ? '' : ` in the KV group shown`}
      {total > 0 ? (
        <>
          {' '}
          (
          {table
            .map((list, g) => (list.length === 0 ? null : `${list.length} in ${view.stations[g].id}`))
            .filter((words) => words !== null)
            .join(', ')}
          ). A thread runs from its tile to each page, in the order of its blocks.
          {head !== undefined && group !== null ? (
            <>
              {' '}
              Its page <span className="font-numeric">{head.id + 1}</span> stands open into the <span className="font-numeric">{group.layers}</span> layers it serves
              {group.padLayers > 0 ? (
                <>
                  {' '}
                  and <span className="font-numeric">{group.padLayers}</span> padding layers
                </>
              ) : null}
              .
            </>
          ) : null}
        </>
      ) : (
        '. It has no page yet.'
      )}
    </p>
  )
}
