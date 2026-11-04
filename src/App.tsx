import { useEffect, type ReactNode } from 'react'
import { Outlet, isRouteErrorResponse, useMatches, useRouteError } from 'react-router'
import { Board } from '@/design/components/Board'
import { Button } from '@/design/components/Button'
import { TapeLabel } from '@/design/components/TapeLabel'
import { EvidenceNotice } from '@/evidence/EvidenceNotice'

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

const BRAND = { to: '/', label: 'enginespace' }

// The shell is The Pass's board above the page and its kick-plate below (W0-T05, D-047): every style comes from the
// design system's components and token roles.
function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="es-skip">
        <TapeLabel tilt="none">Skip to main content</TapeLabel>
      </a>
      <header>
        <Board label="Primary" brand={BRAND} links={PRIMARY_LINKS} />
      </header>
      <main id="main" tabIndex={-1} className="es-shell__main">
        <EvidenceNotice />
        {children}
      </main>
      <footer>
        <Board label="Footer" links={FOOTER_LINKS} variant="kickplate" />
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
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unknown error'
  return (
    <Shell>
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </Shell>
  )
}
