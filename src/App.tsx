import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Outlet, isRouteErrorResponse, useLocation, useMatches, useNavigationType, useRouteError } from 'react-router'
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
// design system's components and token roles. `announcement` sits after the footer, outside the main landmark, so a reader
// who goes through the page does not meet it.
function Shell({ children, announcement }: { children: ReactNode; announcement?: ReactNode }) {
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
      {announcement}
    </>
  )
}

/** Where the learner left each page, by history entry, so that Back and Forward can put them there again. */
const left = new Map<string, number>()

/**
 * The root route: the shell around whichever page matched, and the document title that page's route names.
 *
 * A page load gives a screen reader, a keyboard and the scroll what a client-side navigation does not, so when the path changes (a
 * search or a fragment alone does not change it, and the first render is the load itself):
 *   - the scroll goes to the top, or to the fragment's element, or back to where the learner left the page when Back or Forward
 *     returns to it. React Router's ScrollRestoration does this, and costs 959 B gz in the entry [measured 2026-11-04 at c80dfad], which
 *     has 1,253 B of room (D-023): so the offset of each history entry is kept here as the page scrolls, and applied before the new page
 *     is painted. The browser may have put it back already (Chromium does, once the page is tall enough), and then this changes nothing.
 *   - focus goes to the main landmark, the skip link's own target, unless the new page has already put it somewhere inside the
 *     landmark. A keyboard that used a link on the board goes on from the top of the new page and not from the board, and the focus of
 *     a link that left with the old page does not fall to the document.
 *   - the page's title is said in a polite live region outside the landmark. Each is a paragraph of its own, written when the path
 *     changes, so that two pages with one title (every module is "Module") are still two announcements, and the history's own keys,
 *     which a fragment link leaves out, are not needed to tell a navigation from a load.
 * e2e/route-change.spec.ts walks all of it.
 */
export default function App() {
  const title = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .filter((text): text is string => Boolean(text))
    .at(-1)
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  const { key, pathname, hash } = useLocation()
  const back = useNavigationType() === 'POP'
  const entry = useRef(key)
  const shown = useRef(pathname)
  const said = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const remember = () => left.set(entry.current, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [])
  useLayoutEffect(() => {
    entry.current = key
    if (shown.current === pathname) return
    const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null
    const offset = left.get(key)
    if (target) target.scrollIntoView()
    else if (!back) window.scrollTo(0, 0)
    else if (offset !== undefined) window.scrollTo(0, offset)
  }, [key, pathname, hash, back])
  useEffect(() => {
    if (shown.current === pathname) return
    shown.current = pathname
    const main = document.getElementById('main')
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true })
    if (title) {
      const line = document.createElement('p')
      line.textContent = title
      said.current?.replaceChildren(line)
    }
  }, [pathname, title])

  return (
    <Shell announcement={<div ref={said} role="status" className="sr-only" data-live="route" />}>
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
