/*
 * R-T23: the Games index, `/play` (REDESIGN §3.8). A plain list of the nine games by the engine's name, each with its role line, its rule
 * in one line, its module and its levels. A level says practice or graded and the learner's best attempt in words (not yet, passed in
 * practice, passed). A game that is not published says "Not published yet" and is never a link. There are no picture boxes, and Traces
 * is linked at the foot. The page is drawn on the server renderer here, from the real roster and registry; the layout (a list of rows
 * and no grid of cards, no sideways scroll) is checked in a browser by e2e/map.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import { GAMES } from '@es/play'
import type { GameEntry } from '@es/play'
import { ROSTER } from '@es/play/roster'
import { GAME_COMPONENTS, resolveGame } from '@/games/registry'
import { bestAttempt, gameLines } from '@/games/specials/lines'
import type { GameLine, PublishedLine } from '@/games/specials/lines'
import { SpecialsView } from '@/games/specials/Specials'
import { SPECIALS, specialsCopy } from '@/games/specials/copy'
import { ATTEMPT_WORDS, LEGENDS } from '@/progress/words'
import { Component as PlayIndex } from '@/pages/PlayIndex'
import { findBanned } from '@/copy/banned'
import { renderPosters } from '../../scripts/posters'
import { root } from '../ci/support'
import { made } from '../progress/support'
import { attribute, lineOf, opening, render, textOf } from './support'

const lines = (): readonly GameLine[] =>
  gameLines(
    ROSTER,
    (id) => GAMES.get(id),
    (id) => resolveGame(id).kind === 'game',
  )
const published = (): PublishedLine[] => lines().filter((line): line is PublishedLine => line.published)

describe('gameLines sorts the roster into what is published and what is not', () => {
  test('there are nine games, each once and in the order of the course, and the built ones are published', () => {
    expect(lines().map((line) => line.id)).toEqual(ROSTER.map((entry) => entry.id))
    expect(lines()).toHaveLength(9)
    expect(published().map((line) => line.id)).toEqual(ROSTER.filter((entry) => resolveGame(entry.id).kind === 'game').map((entry) => entry.id))
    expect(published().map((line) => line.id)).toContain('loop')
  })

  test('a published line says what the registry says, with the role line of the roster, and an unpublished one what the roster says', () => {
    for (const line of lines()) {
      const entry = ROSTER.find((candidate) => candidate.id === line.id)
      expect(line.role).toBe(entry?.role)
      if (line.published) {
        const record = GAMES.get(line.id) as GameEntry
        expect({ title: line.title, subtitle: line.subtitle, modules: line.modules, has3d: line.has3d }).toEqual({ title: record.title, subtitle: record.subtitle, modules: record.modules, has3d: record.has3d })
      } else {
        expect({ title: line.title, subtitle: line.subtitle }).toEqual({ title: entry?.title, subtitle: entry?.subtitle })
      }
    }
  })

  test('each level of a published game is listed, practice or graded as the registry says, and opens at its own level', () => {
    for (const line of published()) {
      const record = GAMES.get(line.id) as GameEntry
      expect(line.levels.map((level) => [level.id, level.title, level.kind])).toEqual(record.levels.map((level) => [level.id, level.title, level.graded ? 'graded' : 'practice']))
      for (const level of line.levels) expect(level.href).toBe(`/play/${line.id}?level=${encodeURIComponent(level.id)}`)
    }
  })

  test('a game whose record is registered and whose component is not is not published: a link to it would be a page that is not there', () => {
    expect(gameLines(ROSTER, (id) => GAMES.get(id), () => false).every((line) => !line.published)).toBe(true)
    expect(gameLines(ROSTER, () => undefined, () => true).every((line) => !line.published)).toBe(true)
  })
})

describe('the best attempt at a level, in words', () => {
  const ref = 'play:loop/steady-state'
  test('no run is not yet, a pass in practice says so, a full pass is passed, and the best of several is kept', () => {
    expect(bestAttempt([], 'loop', 'steady-state')).toBe(ATTEMPT_WORDS.no)
    expect(bestAttempt([made('play', ref, { ok: false, provenance: 'unseen' })], 'loop', 'steady-state')).toBe(ATTEMPT_WORDS.no)
    expect(bestAttempt([made('play', ref, { ok: true, provenance: 'practice' })], 'loop', 'steady-state')).toBe(ATTEMPT_WORDS.practice)
    expect(bestAttempt([made('play', ref, { ok: true, provenance: 'unseen' })], 'loop', 'steady-state')).toBe(ATTEMPT_WORDS.yes)
    const mixed = [made('play', ref, { ok: true, provenance: 'unseen' }), made('play', ref, { ok: false, provenance: 'unseen' }), made('play', ref, { ok: true, provenance: 'practice' })]
    expect(bestAttempt(mixed, 'loop', 'steady-state')).toBe(ATTEMPT_WORDS.yes)
  })

  test("another level's run, another game's run and an event of another kind count for nothing", () => {
    const events = [made('play', 'play:loop/other', { ok: true, provenance: 'unseen' }), made('play', 'play:pool/steady-state', { ok: true, provenance: 'unseen' }), made('item', ref, { ok: true, provenance: 'unseen' })]
    expect(bestAttempt(events, 'loop', 'steady-state')).toBe(ATTEMPT_WORDS.no)
  })
})

describe('the Games index', () => {
  const html = render(h(PlayIndex), '/play')

  test('has one h1, Games, and one h2 for each of the nine games, named by the engine', () => {
    expect(opening(html, 'h1')).toHaveLength(1)
    expect(textOf(/<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? '').trim()).toBe(SPECIALS.title)
    const names = [...html.matchAll(/<h2 class="es-line__title">(.*?)<\/h2>/gs)].map((match) => match[1])
    expect(names).toEqual(ROSTER.map((entry) => entry.title))
  })

  test('each game shows its title, role line and rule, and its module', () => {
    for (const entry of ROSTER) {
      const line = lineOf(html, entry.id)
      expect(line).toContain(`<h2 class="es-line__title">${entry.title}</h2>`)
      expect(line).toContain(`<p class="es-line__role">${entry.role}</p>`)
      expect(textOf(line)).toContain(entry.subtitle)
      for (const module of entry.modules) expect(line).toContain(`href="/m/${module}"`)
    }
  })

  test('each published game lists every level, practice or graded, with the legend words once the ledger is read', () => {
    for (const line of published()) {
      const markup = lineOf(html, line.id)
      expect(opening(markup, 'li').filter((tag) => attribute(tag, 'class') === 'es-gl')).toHaveLength(line.levels.length)
      for (const level of line.levels) {
        expect(markup).toContain(`>${level.title}</a>`)
        expect(markup).toContain(`<span class="es-gl__kind">${level.kind}</span>`)
      }
    }
    expect(textOf(html)).toContain(LEGENDS.attempt)
  })

  test('shows the attempt words when it is given them, and leaves them out until the ledger has opened', () => {
    const [first] = published()
    const level = first.levels[0]
    const read = new Map([[`${first.id}/${level.id}`, ATTEMPT_WORDS.practice]])
    const open = render(h(SpecialsView, { lines: lines(), attempts: read }))
    expect(lineOf(open, first.id)).toContain('passed in practice')
    expect(open).toContain('data-attempt="passed-in-practice"')
    const waiting = render(h(SpecialsView, { lines: lines(), attempts: null }))
    for (const word of Object.values(ATTEMPT_WORDS)) expect(textOf(lineOf(waiting, first.id))).not.toContain(word)
    expect(waiting).toContain('data-attempt="unread"')
  })

  test('every published game links to /play/<id> by one Play link, and no other game is linked to', () => {
    const links = opening(html, 'a')
      .map((tag) => attribute(tag, 'href'))
      .filter((href): href is string => href !== undefined && /^\/play\/[^?]*$/.test(href))
    expect(links).toEqual(published().map((line) => `/play/${line.id}`))
    expect(textOf(lineOf(html, 'loop'))).toContain('Play Step loop')
  })

  test('a game that is not published says Not published yet, names no wave, and has no link into /play', () => {
    const unpublished = lines().filter((line) => !line.published)
    // Every game of the roster that the registry does not have yet: three, since Tensor views joined it (W2-T14).
    expect(unpublished.length).toBe(ROSTER.length - GAMES.games.length)
    for (const line of unpublished) {
      const markup = lineOf(html, line.id)
      expect(attribute(opening(markup, 'li')[0], 'data-status')).toBe('unpublished')
      expect(textOf(markup)).toContain(SPECIALS.notPublished)
      expect(textOf(markup)).not.toMatch(/\bW\d\b/)
      expect(markup).not.toContain('href="/play/')
    }
    for (const title of ['Trace attribution', 'Backend dispatch', 'KV offload']) {
      expect(textOf(lineOf(html, ROSTER.find((entry) => entry.title === title)?.id as string))).toContain('Not published yet')
    }
  })

  test('links Traces from the page', () => {
    const link = opening(html, 'a').find((tag) => attribute(tag, 'href') === '/trace-room')
    expect(link).toBeDefined()
    expect(html).toMatch(new RegExp(`href="/trace-room"[^>]*>${SPECIALS.traces.link}</a>`))
  })

  test('holds no picture box, no No picture yet, no card, and no poster files in the specials folder', () => {
    expect(html).not.toContain('es-poster')
    expect(html).not.toContain('es-line__well')
    expect(html).not.toContain('role="img"')
    expect(textOf(html)).not.toContain('No picture yet')
    expect(html).not.toMatch(/class="[^"]*\bcard\b/)
    expect(opening(html, 'article')).toHaveLength(0)
    const folder = path.join(root, 'src/games/specials')
    expect(existsSync(path.join(folder, 'posters.ts'))).toBe(false)
    expect(existsSync(path.join(folder, 'Poster.tsx'))).toBe(false)
    for (const file of readdirSync(folder)) expect(readFileSync(path.join(folder, file), 'utf8'), file).not.toMatch(/No picture yet|es-poster|data-picture/)
  })

  test('uses no banned word', () => {
    expect(findBanned(textOf(html))).toEqual([])
    expect(specialsCopy().flatMap((text) => findBanned(text))).toEqual([])
  })
})

describe('the page draws what it is given', () => {
  test('the component registry has the games that the page can open', () => {
    for (const line of published()) expect(Object.keys(GAME_COMPONENTS)).toContain(line.id)
  })

  test('a game that is built later is published, in its place in the course', () => {
    const entry = ROSTER.find((candidate) => candidate.id === 'engine-floor')
    const fake = { ...(GAMES.get('loop') as GameEntry), id: 'engine-floor', title: entry?.title ?? '', subtitle: entry?.subtitle ?? '', modules: entry?.modules ?? [] }
    const later = gameLines(
      ROSTER,
      (id) => (id === 'engine-floor' ? fake : GAMES.get(id)),
      (id) => id === 'engine-floor' || resolveGame(id).kind === 'game',
    )
    expect(later.find((line) => line.id === 'engine-floor')?.published).toBe(true)
    expect(later.map((line) => line.id)).toEqual(ROSTER.map((candidate) => candidate.id))
  })
})

describe('the poster files stay for the front page, and the Games index draws none of them', () => {
  const file = readFileSync(path.join(root, 'public/posters/loop-first-frame-landscape.svg'), 'utf8')

  test("the step loop's poster is its timing diagram: the queue's chips, the rows on the graticule, the axis and the now line, and no kitchen", () => {
    for (const part of ['data-part="queue"', 'data-part="graticule"', 'data-part="rows"', 'data-part="axis"', 'data-part="now"']) expect(file).toContain(part)
    expect(file).not.toMatch(/lamp-streak|ticket|pass|station/i)
  })

  test("the file is one that scripts/posters.ts writes, paints with the design system's properties and has no colour of its own", () => {
    expect(renderPosters().map((poster) => poster.file)).toContain('loop-first-frame-landscape.svg')
    expect(file).toContain('var(--es-')
    expect(file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/)
  })
})
