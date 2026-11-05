/*
 * W1-T06: the Play index, `/play` (ARCHITECTURE §3.1), set out as the specials board. Each game shows its display name over its subtitle,
 * its module, whether it is 2D or 3D, and its poster, and links to /play/:game. A game that is not built yet appears as arriving with its
 * wave and is never a link. The page is drawn on the server renderer here, from the real roster and registry; the layout (a board of
 * lines and not a grid of cards, no sideways scroll) is checked in a browser by e2e/map.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { GAMES } from '@es/play'
import type { GameEntry } from '@es/play'
import { ROSTER } from '@es/play/roster'
import { GAME_COMPONENTS, resolveGame } from '@/games/registry'
import { boardOf } from '@/games/specials/lines'
import type { Board } from '@/games/specials/lines'
import { SpecialsView } from '@/games/specials/Specials'
import { SPECIALS } from '@/games/specials/copy'
import { Component as PlayIndex } from '@/pages/PlayIndex'
import { attribute, elementFrom, lineOf, opening, render, textOf } from './support'

const board = (): Board =>
  boardOf(
    ROSTER,
    (id) => GAMES.get(id),
    (id) => resolveGame(id).kind === 'game',
  )

describe('boardOf sorts the roster into what can be played and what is coming', () => {
  test('the games that are built are open, and every other game of the roster is arriving, each once, in the order of the course', () => {
    const { open, arriving } = board()
    expect(open.map((line) => line.id)).toEqual(ROSTER.filter((entry) => resolveGame(entry.id).kind === 'game').map((entry) => entry.id))
    expect(arriving.map((line) => line.id)).toEqual(ROSTER.filter((entry) => resolveGame(entry.id).kind !== 'game').map((entry) => entry.id))
    expect(open.length + arriving.length).toBe(ROSTER.length)
    expect(open.map((line) => line.id)).toContain('loop')
  })

  test('the games of W2 are arriving with W2, and none of them is open', () => {
    const { open, arriving } = board()
    for (const id of ['shape-shifter', 'gap-hunt', 'dispatch', 'switchyard']) {
      expect(open.map((line) => line.id)).not.toContain(id)
      expect(arriving.find((line) => line.id === id)?.wave).toBe(2)
    }
  })

  test('an open line says what the registry says, and an arriving one what the roster says', () => {
    const { open, arriving } = board()
    for (const line of open) {
      const entry = GAMES.get(line.id) as GameEntry
      expect({ title: line.title, subtitle: line.subtitle, modules: line.modules, has3d: line.has3d }).toEqual({ title: entry.title, subtitle: entry.subtitle, modules: entry.modules, has3d: entry.has3d })
    }
    for (const line of arriving) {
      const entry = ROSTER.find((candidate) => candidate.id === line.id)
      expect(line.title).toBe(entry?.title)
      expect(line.subtitle).toBe(entry?.subtitle)
    }
  })

  test('a game whose record is registered and whose component is not is arriving: a link to it would be a page that is not there', () => {
    const made = boardOf(
      ROSTER,
      (id) => GAMES.get(id),
      () => false,
    )
    expect(made.open).toEqual([])
    expect(made.arriving).toHaveLength(ROSTER.length)
    const unregistered = boardOf(
      ROSTER,
      () => undefined,
      () => true,
    )
    expect(unregistered.open).toEqual([])
  })

  test('a game that is built later joins the open lines, in its place in the course', () => {
    const entry = ROSTER.find((candidate) => candidate.id === 'engine-floor')
    const fake = { ...(GAMES.get('loop') as GameEntry), id: 'engine-floor', title: entry?.title ?? '', subtitle: entry?.subtitle ?? '', modules: entry?.modules ?? [] }
    const later = boardOf(
      ROSTER,
      (id) => (id === 'engine-floor' ? fake : GAMES.get(id)),
      (id) => id === 'engine-floor' || resolveGame(id).kind === 'game',
    )
    // The new game stands among the games that are built where its module puts it in the course: TR1 comes before Service's TR2.
    const ids = later.open.map((line) => line.id)
    expect(ids).toEqual(ROSTER.filter((candidate) => candidate.id === 'engine-floor' || resolveGame(candidate.id).kind === 'game').map((candidate) => candidate.id))
    expect(ids.indexOf('engine-floor')).toBeLessThan(ids.indexOf('loop'))
    expect(later.arriving.map((line) => line.id)).not.toContain('engine-floor')
  })
})

describe('the Play index', () => {
  const html = render(h(PlayIndex), '/play')

  test('has a heading, a section for the games on the board and one for the games arriving, and a name for each game', () => {
    expect(opening(html, 'h1')).toHaveLength(1)
    expect(opening(html, 'h2')).toHaveLength(2)
    expect(opening(html, 'h3')).toHaveLength(ROSTER.length)
    expect([...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))).toEqual([1, 2, ...board().open.map(() => 3), 2, ...board().arriving.map(() => 3)])
  })

  test('every game of the roster has a line, and the lines are a list on a sheet and not a grid of cards', () => {
    for (const entry of ROSTER) expect(html).toContain(`<li class="es-line" data-game="${entry.id}"`)
    expect(html).toContain('class="es-specials__board"')
    expect(opening(html, 'ul').filter((tag) => attribute(tag, 'class') === 'es-lines')).toHaveLength(2)
    // None of it is a card: no ticket, no article, no card class.
    expect(html).not.toMatch(/class="[^"]*\bcard\b/)
    expect(opening(html, 'article')).toHaveLength(0)
  })

  test('shows the display name over the subtitle, then the module and the view', () => {
    for (const entry of ROSTER) {
      const line = lineOf(html, entry.id)
      const text = textOf(line)
      expect(text.indexOf(entry.title)).toBeGreaterThanOrEqual(0)
      expect(text.indexOf(entry.subtitle)).toBeGreaterThan(text.indexOf(entry.title))
      expect(line).toContain(`<h3 class="es-line__title">${entry.title}</h3>`)
      for (const module of entry.modules) expect(line).toContain(`href="/m/${module}"`)
      // A game on the board says what its record says, and one that is arriving says what the roster says: The Tasting is built in 2D
      // first, and its record has no 3D until its scene lands (W1-T29).
      const has3d = (board().open.find((open) => open.id === entry.id) ?? entry).has3d
      expect(text).toContain(has3d ? SPECIALS.view.d3 : SPECIALS.view.d2)
      expect(text.includes(SPECIALS.view.twoToo)).toBe(has3d)
    }
  })

  test('Service is on the board with its poster, its module TR2, TR6 as the other module, and a stub to play it', () => {
    const line = lineOf(html, 'loop')
    expect(attribute(opening(line, 'li')[0], 'data-status')).toBe('open')
    expect(line).toContain('data-picture="poster"')
    // The poster is a file that the page fetches (tests/map/posters.test.ts), so the server draws its well in the shape of the drawing and waits.
    const well = elementFrom(line, '<div class="es-line__well"', 'div')
    expect(well).toBe('<div class="es-line__well" data-picture="poster"><div class="es-poster" data-state="reading" style="aspect-ratio:720 / 348"></div></div>')
    expect(line).toContain('href="/m/tr2"')
    expect(line).toContain('href="/m/tr6"')
    expect(textOf(line)).toContain('also TR6')
    const stubs = opening(line, 'a').filter((tag) => attribute(tag, 'class')?.includes('es-stub__pull'))
    expect(stubs.map((tag) => attribute(tag, 'href'))).toEqual(['/play/loop'])
    expect(textOf(line)).toContain('Play Service')
  })

  test('every game that can be played links to /play/<id> by one stub, and no other game is linked to', () => {
    const links = opening(html, 'a')
      .map((tag) => attribute(tag, 'href'))
      .filter((href): href is string => href?.startsWith('/play/') === true)
    expect(links).toEqual(board().open.map((line) => `/play/${line.id}`))
  })

  test('a game that is arriving has a bare pan, the wave that brings it, and no stub', () => {
    for (const line of board().arriving) {
      const markup = lineOf(html, line.id)
      expect(attribute(opening(markup, 'li')[0], 'data-status')).toBe('arriving')
      expect(markup).toContain('data-picture="pan"')
      expect(markup).toContain('data-state="free"')
      expect(textOf(markup)).toContain(`${SPECIALS.arrivesWith} W${line.wave}`)
      expect(markup).not.toContain('es-stub')
      expect(markup).not.toContain('href="/play/')
    }
  })

  test('the games of W2 are all there, arriving with W2', () => {
    for (const title of ['Sheet Pan', 'The Tape', 'Line Check', 'The Dumbwaiter']) {
      const markup = lineOf(html, ROSTER.find((entry) => entry.title === title)?.id as string)
      expect(textOf(markup)).toContain(`${SPECIALS.arrivesWith} W2`)
    }
  })

  test('says in words that the pans are bare, and that every game can be played flat', () => {
    expect(textOf(html)).toContain('bare pans')
    expect(textOf(html)).toContain('Every game can be played flat')
  })

  test('the pictures are hidden from assistive technology where they are only a pan', () => {
    for (const line of board().arriving) expect(lineOf(html, line.id)).toContain('class="es-line__empty" aria-hidden="true"')
  })
})

describe('the board draws what it is given', () => {
  test('a board with nothing arriving has no arriving section, and one with nothing open has no open section', () => {
    const full = board()
    const none = render(h(SpecialsView, { board: { open: full.open, arriving: [] } }))
    expect(opening(none, 'h2')).toHaveLength(1)
    expect(none).not.toContain('data-group="arriving"')
    const soon = render(h(SpecialsView, { board: { open: [], arriving: full.arriving } }))
    expect(soon).not.toContain('data-group="open"')
    expect(soon).toContain('data-group="arriving"')
  })

  test('the component registry has the games that the page can open', () => {
    for (const line of board().open) expect(Object.keys(GAME_COMPONENTS)).toContain(line.id)
  })
})
