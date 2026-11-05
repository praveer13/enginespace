/*
 * What a client-side navigation owes the reader that a page load gives for free (WCAG 2.4.3 Focus Order and 4.1.3 Status Messages; the
 * W0 exit review's follow-up). src/App.tsx calls `arrive` after every render of the root route, and this module decides whether a page
 * was just opened. It does when the path changed (a search or a fragment alone does not change it, and the first call is the load
 * itself), and then:
 *
 *   - the scroll goes to the fragment's element, or to the top, or back to where the learner left the page when Back or Forward returns
 *     to it. React Router's ScrollRestoration does this, and costs 959 B gz in the entry [measured 2026-11-04 at c80dfad]. So the
 *     offset of each history entry is kept here as the page scrolls. The browser may have put it back already (Chromium does, once the
 *     page is tall enough), and then this changes nothing.
 *   - focus goes to the main landmark, the skip link's own target, unless it is inside the landmark already. A keyboard that used a link
 *     on the board goes on from the top of the new page and not from the board, and the focus of a link that left with the old page does
 *     not fall to the document.
 *   - the page's title is said in a polite live region outside the landmark. Each is a paragraph of its own, written when the path
 *     changes, so that two pages with one title (every module is "Module") are still two announcements, and the history's own keys,
 *     which a fragment link leaves out, are not needed to tell a navigation from a load.
 *
 * It is a chunk of its own on purpose. The front page's first-paint closure has less than a kilobyte of room (D-023), and this is
 * the part of the root route that is not needed to paint: the route has only the call, and the chunk loads while the first page draws.
 * It runs after the layout effects of the commit that drew the page and before the browser paints, so the scroll does not show, and
 * before the page's own passive effects, so a page that places focus itself wins. e2e/route-change.spec.ts walks all of it in a browser,
 * and tests/app/route-change.test.ts holds the rules against a stand-in for the browser.
 */

export interface Arrival {
  pathname: string
  hash: string
  /** The navigation was Back or Forward (or the first load). */
  back: boolean
  /** The route's title, or undefined for a route that names none. */
  title: string | undefined
}

/** What the rules touch outside themselves: the browser's own below, and a test's stand-in. */
export interface Place {
  /** The key of the history entry the learner is on: `default` for the first, and for any that a fragment link made. */
  entry(): string
  scrollY(): number
  scrollTo(y: number): void
  /** Calls the listener whenever the page scrolls. */
  watchScroll(listener: () => void): void
  /** Brings the element with this id into view, and says whether there is one. */
  reveal(id: string): boolean
  /** Moves focus to the main landmark unless it is already inside it. */
  focusMain(): void
  say(title: string): void
}

export function createRouteChange(place: Place): (arrival: Arrival) => void {
  /** Where the learner left each page, by history entry. */
  const left = new Map<string, number>()
  let shown: string | undefined
  // The entry is asked for when the page scrolls, and not kept from the last call: the router changes the history before it draws the
  // page, so a scroll that the new page causes by being shorter (the browser puts the offset back inside it) is the new entry's, and
  // the entry that was left keeps the offset the learner gave it. This runs after the commit, and a frame can come between the two.
  place.watchScroll(() => left.set(place.entry(), place.scrollY()))

  return ({ pathname, hash, back, title }) => {
    const changed = shown !== undefined && shown !== pathname
    shown = pathname
    if (!changed) return
    const offset = left.get(place.entry())
    if (!(hash.length > 1 && place.reveal(hash.slice(1)))) {
      if (!back) place.scrollTo(0)
      else if (offset !== undefined) place.scrollTo(offset)
    }
    place.focusMain()
    if (title) place.say(title)
  }
}

/**
 * The browser's: the window's scroll, the document's main landmark, and a status region. The region is made when this is called for
 * the first time, which is the load, so it is in the document and empty long before the first page is opened into it: a reader may
 * not announce a region that appears with its text already in it.
 */
function browserPlace(): Place {
  const region = document.createElement('div')
  region.setAttribute('role', 'status')
  region.setAttribute('data-live', 'route')
  region.className = 'sr-only'
  document.body.append(region)
  return {
    // What the router writes into the history for every entry it makes: its location's key (the history package's `createBrowserLocation`).
    entry: () => (window.history.state as { key?: string } | null)?.key || 'default',
    scrollY: () => window.scrollY,
    scrollTo: (y) => window.scrollTo(0, y),
    watchScroll: (listener) => window.addEventListener('scroll', listener, { passive: true }),
    reveal(id) {
      const element = document.getElementById(id)
      element?.scrollIntoView()
      return element !== null
    },
    focusMain() {
      const main = document.getElementById('main')
      if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true })
    },
    say(title) {
      const line = document.createElement('p')
      line.textContent = title
      region.replaceChildren(line)
    },
  }
}

let browser: ((arrival: Arrival) => void) | undefined

/** What src/App.tsx calls after a render of the root route. */
export function arrive(arrival: Arrival): void {
  browser ??= createRouteChange(browserPlace())
  browser(arrival)
}
