import { lazy, Suspense } from 'react'
import { Link, useLoaderData, useSearchParams } from 'react-router'
import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router'
import { useDocumentTitle } from '@/content/load'
import { titled } from '@/content/render/model'
import { NotRecorded } from '@/games/kit/NotRecorded'
import { useRecorder } from '@/games/kit/useRecorder'
import { loadGame } from '@/games/registry'

/** Prove mode's panel and its run (src/prove) load only with `?mode=prove`, so the game's page carries none of them otherwise. */
const ProveSession = lazy(() => import('@/prove/ProveSession'))

// `/play/:game` (ARCHITECTURE §3.1): one game, at any level. The route's loader turns the id into the game's record and its lazy
// component (src/games/registry.ts), so the page carries none of a game's code until it opens, and no other game's record at all.
// `?level=` opens a level other than the game's first. Every run that ends is written to the ledger as a `play` event, the same one a
// lesson's game block writes for the same run (src/games/kit/record.ts, W1b-T01). `?mode=prove` opens the game's Prove level in Prove mode
// (ASSESSMENT §7.2, src/prove) where the game names one and the address names that level or none; elsewhere the game opens as usual.
// The tab is titled by the game's display name, as its served document is (scripts/pages/plan.ts), and not by the route's `Game`
// (WCAG 2.4.2): the loader has the record before the page mounts, so the title is set as the page mounts.
// eslint-disable-next-line react-refresh/only-export-components -- React Router takes a lazy route's loader from its module, beside the page
export function loader({ params }: LoaderFunctionArgs) {
  return loadGame(params.game ?? '')
}

/** Another level of the same game (`?level=`) is the same record: only another game loads one. */
// eslint-disable-next-line react-refresh/only-export-components -- and its shouldRevalidate, as it takes the loader
export function shouldRevalidate({ currentParams, nextParams, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs): boolean {
  return currentParams.game !== nextParams.game && defaultShouldRevalidate
}

export function Component() {
  const game = useLoaderData<typeof loader>()
  const gameId = game.id
  const [search] = useSearchParams()
  const recorder = useRecorder()
  useDocumentTitle(titled(game.kind === 'unknown' ? 'Game not found' : game.entry.title))
  if (game.kind === 'unknown') {
    return (
      <>
        <h1>Game not found</h1>
        <p>
          No game is called &quot;{gameId}&quot;. See <Link to="/play">the games</Link>.
        </p>
      </>
    )
  }
  const Loaded = game.Component
  const level = search.get('level') ?? undefined
  const prove = game.entry.prove
  const proving = search.get('mode') === 'prove' && prove !== undefined && (level === undefined || level === prove)
  return (
    <>
      <h1 className="sr-only">Play {game.entry.title}</h1>
      <Suspense fallback={<p role="status">Loading {game.entry.title}…</p>}>
        {proving ? <ProveSession key={prove} entry={game.entry} level={prove} Game={Loaded} record={recorder.record} /> : <Loaded level={level} onFinish={recorder.record} />}
      </Suspense>
      {recorder.problem === null ? null : <NotRecorded detail={recorder.problem} />}
    </>
  )
}
