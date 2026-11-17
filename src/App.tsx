import { useEffect, useLayoutEffect, type ReactNode } from 'react'
import { Outlet, isRouteErrorResponse, useLocation, useMatches, useNavigationType, useRouteError } from 'react-router'
import { Board, ContinueLink } from '@/design/components/Board'
import { Button } from '@/design/components/Button'
import { Label } from '@/design/components/Label'
import { EvidenceNotice } from '@/evidence/EvidenceNotice'
import { usePointer } from '@/settings/usePlace'

/** What a route's `handle` carries: the text of the page's `<title>`. */
export interface RouteHandle {
  title: string
}

// REDESIGN §2.3: the header is the wordmark, then Course, Games, Review and Progress, then Continue at the right. The footer links
// About, How numbers are tagged (a place on About), Sources and changes, and Settings. The design system's page (/design) and the GPU lab results (/receipts) are reached from
// where they are used, never from the chrome.
const PRIMARY_LINKS = [
  { to: '/map', label: 'Course' },
  { to: '/play', label: 'Games' },
  { to: '/today', label: 'Review' },
  { to: '/evidence', label: 'Progress' },
]
const FOOTER_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/about#numbers', label: 'How numbers are tagged', within: true },
  { to: '/changes', label: 'Sources and changes' },
  { to: '/settings', label: 'Settings' },
]

const BRAND = { to: '/', label: 'enginespace' }

// The shell is the board above the page and its kick-plate below (W0-T05, D-047): every style comes from the design system's
// components and token roles.
// The header's Continue reads the pointer (`es:next`): `nextStep`'s last answer, which a page that opens the ledger keeps (D-066).
// Until one has, and on the server, it is the empty ledger's answer, the first lesson. The header never opens the ledger (D-038).
function Shell({ children }: { children: ReactNode }) {
  const pointer = usePointer()
  return (
    <>
      <a href="#main" className="es-skip">
        <Label tilt="none">Skip to main content</Label>
      </a>
      <header>
        <Board label="Primary" brand={BRAND} links={PRIMARY_LINKS} fold action={<ContinueLink target={pointer} />} />
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

/**
 * The root route: the shell around whichever page matched, and the document title that page's route names.
 *
 * It also tells src/route-change.ts after every render where the router is, so that a client-side navigation gives focus, the
 * scroll and a screen reader what a page load does (focus on the main landmark, the page's title in a live region, the scroll at the
 * top or where Back left it). That is a chunk of its own, because the front page's first-paint closure has no room for it (D-023).
 */
export default function App() {
  const title = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .filter((text): text is string => Boolean(text))
    .at(-1)
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  const { pathname, hash } = useLocation()
  const back = useNavigationType() === 'POP'
  useLayoutEffect(() => {
    void import('./route-change').then((change) => change.arrive({ pathname, hash, back, title }))
  }, [pathname, hash, back, title])

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
