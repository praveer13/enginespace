import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, Outlet, isRouteErrorResponse, useMatches, useRouteError } from 'react-router'

/** What a route's `handle` carries: the text of the page's `<title>`. */
export interface RouteHandle {
  title: string
}

// ARCHITECTURE §3.3: the primary navigation is Map · Play · Today · Receipts · Evidence,
// and the footer links About, Changes, Settings and Design.
const PRIMARY_LINKS = [
  { to: '/map', label: 'Map' },
  { to: '/play', label: 'Play' },
  { to: '/today', label: 'Today' },
  { to: '/receipts', label: 'Receipts' },
  { to: '/evidence', label: 'Evidence' },
]
const FOOTER_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/changes', label: 'Changes' },
  { to: '/settings', label: 'Settings' },
  { to: '/design', label: 'Design' },
]

// Structure only: the shell chooses no colours, fonts or visual style. The design system arrives with W0-T05 (D-047).
function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <header>
        <nav aria-label="Primary" className="flex flex-wrap gap-x-4 gap-y-2 p-4">
          <Link to="/">enginespace</Link>
          {PRIMARY_LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="p-4">
        {children}
      </main>
      <footer>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2 p-4">
          {FOOTER_LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </footer>
    </>
  )
}

/** The root route: the shell around whichever page matched, and the document title that page's route names. */
export default function App() {
  const title = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .filter((text): text is string => Boolean(text))
    .at(-1)
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}

/** Shown while the first lazy route module loads, before the router has its initial state. */
export function AppLoading() {
  return (
    <Shell>
      <p role="status">Loading…</p>
    </Shell>
  )
}

/** The root route's error boundary, for example a route chunk that fails to load. */
export function AppError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'
  return (
    <Shell>
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </Shell>
  )
}
