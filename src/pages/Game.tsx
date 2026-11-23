import { lazy, Suspense } from 'react'
import { Link, useLoaderData, useSearchParams } from 'react-router'
import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router'
import { useDocumentTitle } from '@/content/load'
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

/**
 * The tab's title: the game's name, then the site's, as `titled` in src/content/render/model.ts writes every content page's and
 * scripts/pages/plan.ts this page's served document (e2e/titles.spec.ts holds the two the same). The page writes it itself, as
 * src/routes.tsx does, and does not import model.ts: the lesson, module and map pages share that module's chunk, and every game's
 * route would carry all of it for this one line (tests/build.test.ts).
 */
const titled = (game: string): string => `${game} · enginespace`

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
      {/* The one h1 of the page is the game's title, from the first paint: the loading line, the game's own heading and the tab say the same name. */}
      <h1 className="sr-only">{game.entry.title}</h1>
      {/* A screen high, so the footer waits below the fold and is not pushed out of the window when the game arrives. */}
      <Suspense
        fallback={
          <p role="status" style={{ minHeight: '100vh' }}>
            Loading {game.entry.title}…
          </p>
        }
      >
        {proving ? <ProveSession key={prove} entry={game.entry} level={prove} Game={Loaded} record={recorder.record} /> : <Loaded level={level} onFinish={recorder.record} />}
      </Suspense>
      {recorder.problem === null ? null : <NotRecorded detail={recorder.problem} />}
    </>
  )
}
