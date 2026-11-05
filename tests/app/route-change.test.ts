/*
 * The rules of src/route-change.ts, against a stand-in for the browser: when a page was just opened, and what is then done for the
 * reader. e2e/route-change.spec.ts walks the same in Chromium, in the nightly sweep; this runs on every pull request, and sees the
 * order in which things are done, which a browser only shows as the result.
 *
 *   - The first call is the load, and a search or a fragment alone is not a page: nothing is done for either.
 *   - A new path takes the scroll to the top (or to the element a fragment names), focus to the main landmark, and the title to the
 *     live region, in that order, and a route that names no title says nothing.
 *   - Back and Forward put a page back where the learner left it, by history entry. An entry that was never scrolled is left to the
 *     browser, which may have restored it already. A scroll belongs to the entry the history is on when it happens, so the offset of a
 *     page the browser moved by shortening the document is not taken for the learner's.
 */
import { describe, expect, test } from 'bun:test'
import { createRouteChange } from '../../src/route-change'
import type { Arrival, Place } from '../../src/route-change'

/** A browser that writes down what it is asked to do, scrolls when told to, and has the elements `ids` names. */
function stand(ids: string[] = []) {
  const done: string[] = []
  let offset = 0
  let current = 'default'
  let onScroll = () => {}
  const place: Place = {
    entry: () => current,
    scrollY: () => offset,
    scrollTo(y) {
      const moved = offset !== y
      offset = y
      done.push(`scrolled to ${y}`)
      // A page that is scrolled by a script tells its listeners, as a browser does, when it has moved.
      if (moved) onScroll()
    },
    watchScroll(listener) {
      onScroll = listener
    },
    reveal(id) {
      if (!ids.includes(id)) return false
      done.push(`revealed #${id}`)
      return true
    },
    focusMain: () => void done.push('focused main'),
    say: (title) => void done.push(`said "${title}"`),
  }
  const arrive = createRouteChange(place)
  const scroll = (y: number) => {
    offset = y
    onScroll()
  }
  return {
    done,
    scroll,
    /** The router changes the history, and a moment later the page is drawn and `arrive` is called. */
    enter(key: string) {
      current = key
    },
    arrive: (pathname: string, over: Partial<Arrival> = {}) => arrive({ pathname, hash: '', back: false, title: `${pathname.slice(1) || 'Home'} · enginespace`, ...over }),
    /** Both at once, as they are when no frame comes between. */
    go(pathname: string, key: string, over: Partial<Arrival> = {}) {
      current = key
      arrive({ pathname, hash: '', back: false, title: `${pathname.slice(1) || 'Home'} · enginespace`, ...over })
    },
  }
}

describe('a page load and a change that is not a page', () => {
  test('do nothing for the first call, which is the load: the browser has done it', () => {
    const { go, done } = stand()
    go('/map', 'default', { back: true })
    expect(done).toEqual([])
  })

  test('do nothing for a search, a fragment or a new entry of the same path', () => {
    const { go, done } = stand(['set-motion'])
    go('/settings', 'default')
    go('/settings', 'k1', { hash: '#set-motion' })
    go('/settings', 'k2', { back: true })
    go('/settings', 'k3')
    expect(done).toEqual([])
  })
})

describe('a new path', () => {
  test('takes the scroll to the top, focus to the main landmark and the title to the live region, in that order', () => {
    const { go, done } = stand()
    go('/map', 'default')
    go('/today', 'k1')
    expect(done).toEqual(['scrolled to 0', 'focused main', 'said "today · enginespace"'])
  })

  test('says each page it opens, even two with one title', () => {
    const { go, done } = stand()
    go('/m/tr2', 'default', { title: 'Module · enginespace' })
    go('/m/tr3', 'k1', { title: 'Module · enginespace' })
    go('/m/tr2', 'k2', { title: 'Module · enginespace' })
    expect(done.filter((line) => line.startsWith('said'))).toEqual(['said "Module · enginespace"', 'said "Module · enginespace"'])
  })

  test('moves focus but says nothing for a route that names no title', () => {
    const { go, done } = stand()
    go('/map', 'default')
    go('/odd', 'k1', { title: undefined })
    expect(done).toEqual(['scrolled to 0', 'focused main'])
  })

  test('takes the scroll to the element that a fragment names, and to the top where there is none', () => {
    const { go, done } = stand(['set-data'])
    go('/map', 'default')
    go('/settings', 'k1', { hash: '#set-data' })
    go('/about', 'k2', { hash: '#nowhere' })
    go('/changes', 'k3', { hash: '#' })
    expect(done.filter((line) => !line.startsWith('said') && line !== 'focused main')).toEqual(['revealed #set-data', 'scrolled to 0', 'scrolled to 0'])
  })
})

describe('Back and Forward', () => {
  test('put a page back where the learner left it, by history entry', () => {
    const { go, done, scroll } = stand()
    go('/settings', 'default')
    scroll(640)
    go('/design', 'k1')
    scroll(120)
    go('/about', 'k2')
    done.length = 0
    go('/design', 'k1', { back: true })
    go('/settings', 'default', { back: true })
    expect(done.filter((line) => line.startsWith('scrolled'))).toEqual(['scrolled to 120', 'scrolled to 640'])
  })

  test('keep the offset of the entry a page was left from and not of the one it was opened in: the same path twice is two entries', () => {
    const { go, done, scroll } = stand()
    go('/settings', 'default')
    scroll(100)
    go('/about', 'k1')
    go('/settings', 'k2')
    scroll(900)
    go('/about', 'k3')
    done.length = 0
    go('/settings', 'k2', { back: true })
    go('/about', 'k1', { back: true })
    go('/settings', 'default', { back: true })
    expect(done.filter((line) => line.startsWith('scrolled'))).toEqual(['scrolled to 900', 'scrolled to 0', 'scrolled to 100'])
  })

  test('leave an entry that was never scrolled to the browser, which may have put it back already', () => {
    const { go, done } = stand()
    go('/map', 'default')
    go('/today', 'k1')
    done.length = 0
    go('/map', 'default', { back: true })
    expect(done).toEqual(['focused main', 'said "map · enginespace"'])
  })

  test('focus the main landmark and say the page they return to, as a link does', () => {
    const { go, done } = stand()
    go('/map', 'default')
    go('/today', 'k1')
    done.length = 0
    go('/map', 'default', { back: true })
    go('/today', 'k1', { back: true })
    expect(done.filter((line) => !line.startsWith('scrolled'))).toEqual(['focused main', 'said "map · enginespace"', 'focused main', 'said "today · enginespace"'])
  })
})

describe('a scroll between the history changing and the page being drawn', () => {
  test('belongs to the entry the history is on: the offset that Forward leaves on a short page is not the long page\'s', () => {
    const { go, enter, arrive, done, scroll } = stand()
    go('/settings', 'default')
    scroll(640)
    // Forward to a short page: the router has changed the history, the page has been drawn, the browser has put the offset back inside it
    // and says so, and a frame came before the call that follows the commit.
    enter('k1')
    scroll(0)
    arrive('/about')
    done.length = 0
    go('/settings', 'default', { back: true })
    expect(done.filter((line) => line.startsWith('scrolled'))).toEqual(['scrolled to 640'])
  })
})
