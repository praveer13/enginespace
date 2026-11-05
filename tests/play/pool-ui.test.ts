/*
 * The Reach-In's page as markup (GAMES.md §2.6, §10; A§6.9, D-048, D-049): what the 2D view, the controls, the mirror and the debrief put on
 * the page, rendered on the server so that the structure a screen reader and a stylesheet get can be read. What needs a DOM, a focus or a
 * timer (the arrow keys along a list, focus following the ask, the live region as it speaks) is walked in a browser by e2e/pool.spec.ts.
 *
 *   - The 2D view draws the world's own objects: a hotel pan in every slot of the reach-in, a ticket on the pass with a ruler of the blocks it
 *     holds, and no axis, no legend and no lane of grey bars. It paints with the design system's marks, and its only inline styles are the
 *     counts of its columns.
 *   - The controls offer every legal action as HTML: one tab stop to a list, the lamp on the open ask and nowhere else, a graded run printing
 *     no price for a dump.
 *   - The mirror lists everything the drawing shows, and every number in it is tagged.
 *   - The debrief says the decision that mattered in the kitchen's words, and puts the house's counts and the engine's beside the learner's.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { changeLine } from '@/games/pool/announce'
import { Controls } from '@/games/pool/Controls'
import { Debrief } from '@/games/pool/Debrief'
import { dumpOf } from '@/games/pool/dump'
import Game from '@/games/pool/Game'
import { Mirror } from '@/games/pool/Mirror'
import { View2D } from '@/games/pool/View2D'
import { engine, house } from '@es/play/pool/policy'
import { poolSession } from '@es/play/pool/session'
import { buildLevel } from '@es/play/pool/levels'
import type { PoolAsk, PoolLevel, PoolLevelId, PoolState } from '@es/play/pool/types'
import { kvPreset } from '@es/sim/kv'
import { PRACTICE, fakeRun, outcomeOf, playThrough, practiceOf } from './pool-support'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/pool' }, element))
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0
const textOf = (markup: string) => markup.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const S = poolSession
const noop = () => undefined

/** The first state of the house's run at which the ask is of this kind. */
const asking = (level: PoolLevel, kind: PoolAsk['kind']): PoolState => {
  const found = playThrough(level, house).states.find((state) => state.ask?.kind === kind)
  if (found === undefined) throw new Error(`the house is never asked to ${kind} on ${level.id}`)
  return found
}

const controls = (state: PoolState, mode: 'practice' | 'graded' = 'practice') => {
  const run = fakeRun(state, { mode })
  return render(h(Controls, { run, dump: dumpOf(run.view, null, noop), mode, onPoint: noop }))
}

describe('the page names the game as D-049 says, and opens on the first level', () => {
  test('the display name over its engine concept, the level and its mode on a tape label, and no working name', () => {
    const markup = render(h(Game, null))
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">The Reach-In<\/h2><p class="es-type-body[^"]*">hybrid KV pages and adapters<\/p>/)
    expect(markup).toContain('One station · practice')
    expect(markup).toContain('data-game="pool"')
    expect(markup).not.toContain('The Pool')
    expect(render(h(Game, { placement: 'embed' }))).toMatch(/<h3 id="[^"]+" class="es-type-heading">The Reach-In<\/h3>/)
  })

  test('opens the level it is given, and the first when the id is not one of its own', () => {
    expect(render(h(Game, { level: 'evict' }))).toContain('Dump the right pans · practice')
    expect(render(h(Game, { level: 'manager' }))).toContain('The whole manager · practice')
    expect(render(h(Game, { level: 'first-1-fill' }))).toContain('One station · practice')
    expect(render(h(Game, { level: 'constructor' }))).toContain('One station · practice')
  })

  test('has Play and Debrief, the keys button, the view switch with the 2D view first (W1-T24: 3D opens once the device is known to draw it), and the seven levels in a rail', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('>Play</button>')
    expect(markup).toContain('>Debrief</button>')
    expect(markup).toContain('>Keys</button>')
    expect(markup).toContain('aria-label="View"')
    expect(markup).not.toContain('data-surface="3d"')
    expect(markup).toContain('data-surface="2d"')
    const rail = markup.slice(markup.indexOf('aria-label="Levels of The Reach-In"'))
    for (const title of ['One station', 'Two kinds of station', 'Dump the right pans', 'One pan size', 'A station of state', 'Recipe kits', 'The whole manager']) expect(rail).toContain(title)
    expect(rail).toContain('aria-current="step"')
    expect(count(rail, /\(graded level\)/g)).toBe(3)
  })

  test('says what the level is about before anything else on the stage: the level\'s own line, in the kitchen\'s words', () => {
    for (const [id] of PRACTICE) {
      const level = practiceOf(id)
      const markup = render(h(Game, { level: id }))
      expect(markup).toContain('data-pool-prompt=""')
      const shown = textOf(markup.slice(markup.indexOf('data-pool-prompt')))
      expect([id, shown.includes(level.prompt.replace(/\s+/g, ' '))]).toEqual([id, true])
      // It comes before the cabinet it describes.
      expect(markup.indexOf('data-pool-prompt')).toBeLessThan(markup.indexOf('data-reachin-rack'))
    }
  })

  test('keeps the notional-machine card to hand, in its three parts', () => {
    const markup = render(h(Game, null))
    expect(markup).toContain('What this world models')
    for (const part of ['Models.', 'Ignores.', 'Calibrated against.']) expect(markup).toContain(part)
  })

  test('a graded level can be played as a graded run, which says it prints no price; a level that cannot be graded opens in practice whatever it is asked', () => {
    const graded = render(h(Game, { level: 'evict', mode: 'graded' }))
    expect(graded).toContain('Dump the right pans · graded')
    expect(graded).toContain('A fresh seed, no undo, and no price printed for a dump.')
    expect(graded).not.toContain('>Undo<')
    expect(render(h(Game, { level: 'one-group', mode: 'graded' }))).toContain('One station · practice')
    expect(render(h(Game, { level: 'evict' }))).toContain('>Undo<')
    expect(render(h(Game, { level: 'evict' }))).toContain('The pinned seed, with undo and the price of each dump.')
  })

  test('every number on the page is a tagged Readout or a plain count beside a unit; the prompts of the levels carry none', () => {
    for (const [id] of PRACTICE) {
      const markup = render(h(Game, { level: id }))
      const prompt = textOf(markup.slice(markup.indexOf('<main') >= 0 ? markup.indexOf('<main') : 0))
      expect(prompt.length).toBeGreaterThan(100)
      expect(count(markup, /class="es-readout"/g)).toBeGreaterThan(0)
      expect(count(markup, /class="es-readout"/g)).toBe(count(markup, /class="es-readout__tag"/g))
    }
  })
})

describe('the 2D view draws the reach-in, never a chart (GAMES.md §10 "2D path", §2.6 "The Reach-In")', () => {
  const level = practiceOf('evict')
  const state = asking(level, 'evict')
  const run = fakeRun(state)
  const markup = render(h(View2D, { run, dump: dumpOf(run.view, null, noop), pointed: [], pick: false }))
  /** The rack alone: the key and the strip of the rotation beside it draw pans too. */
  const rackOf = (m: string) => m.slice(m.indexOf('<ol class="es-reachin__rack"'), m.indexOf('</ol>', m.indexOf('<ol class="es-reachin__rack"')))
  const rack = rackOf(markup)

  test('is a hotel pan in every slot, in rows of sixteen, each pan in its place for its whole life', () => {
    expect(count(rack, /class="es-reachin__cell"/g)).toBe(level.spec.poolPages)
    expect(markup).toContain('style="--es-rack-cols:16"')
    const cells = [...rack.matchAll(/<li class="es-reachin__cell" data-state="([a-z]+)" data-id="(\d+)">/g)]
    expect(cells.map((cell) => Number(cell[2]))).toEqual(Array.from({ length: level.spec.poolPages }, (_, i) => i))
    for (const cell of cells) expect(['free', 'used', 'cached', 'shared', 'adapter', 'evicted']).toContain(cell[1])
  })

  test('shows a pan\'s form as the pan\'s own mark, and its station by a glyph that is also the key: a circle, a square, a hexagon', () => {
    expect(count(rack, /class="es-pan"/g)).toBe(level.spec.poolPages)
    const glyphs = new Set([...rack.matchAll(/class="es-reachin__kind" data-glyph="([a-z]+)"/g)].map((match) => match[1]))
    expect([...glyphs].sort()).toEqual(['circle', 'square'])
    const key = markup.slice(markup.indexOf('es-reachin__key'))
    expect(key).toContain('data-glyph="circle"')
    const hexagons = render(h(View2D, { run: fakeRun(asking(practiceOf('state'), 'admit')), dump: dumpOf(fakeRun(asking(practiceOf('state'), 'admit')).view, null, noop), pointed: [], pick: false }))
    expect(hexagons).toContain('data-glyph="hexagon"')
  })

  test('puts the tickets on the pass: those on the line on a rail with its clips, those waiting beside it, each with a ruler of the blocks it holds', () => {
    expect(markup).toContain('data-reachin-pass=""')
    expect(markup).toContain('On the line')
    expect(markup).toContain('aria-label="The line: 4 clips"')
    const shown = run.view.tickets.filter((ticket) => ticket.status === 'running' || ticket.status === 'waiting')
    expect(count(markup, /data-ticket="\d+"/g)).toBe(shown.length)
    // One row of the ruler for each station of the model.
    expect(count(markup, /class="es-ruler__row"/g)).toBe(shown.length * level.spec.groups.length)
    const segments = new Set([...markup.matchAll(/data-seg="([a-z-]+)"/g)].map((match) => match[1]))
    for (const seg of segments) expect(['held', 'let-go', 'hit', 'fresh']).toContain(seg)
    expect(segments.has('hit') || segments.has('fresh')).toBe(true)
  })

  test('has no axis, no legend of swatches and no lane of grey bars: no chart elements, and no inline style but the counts of its columns', () => {
    expect(markup).not.toMatch(/axis|swatch|legend|class="[^"]*bar-chart/i)
    expect(markup).not.toContain('<canvas')
    const styles = [...markup.matchAll(/style="([^"]*)"/g)].map((match) => match[1])
    expect(styles.length).toBeGreaterThan(0)
    for (const style of styles) expect(style).toMatch(/^(--es-[a-z-]+:[0-9]+;?)+$/)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(/)
  })

  test('is the drawing of a table that lists everything it shows: the rack is hidden from a reader, and every pan carries a name', () => {
    expect(markup).toContain('aria-hidden="true" style="--es-rack-cols:16"')
    expect(count(rack, /<span class="sr-only">pan \d+, /g)).toBe(level.spec.poolPages)
  })

  test('a pointer may pick the pans of an open eviction in the rack, and a phone picks from the list', () => {
    const picking = render(h(View2D, { run, dump: dumpOf(run.view, null, noop), pointed: [], pick: true }))
    const ask = state.ask as Extract<PoolAsk, { kind: 'evict' }>
    expect(count(picking, /<button[^>]*class="es-pan"/g)).toBeGreaterThanOrEqual(ask.candidates.length)
    expect(count(markup, /<button[^>]*class="es-pan"/g)).toBe(0)
  })

  test('a kit is drawn as pans of its own, with its pin, in the same rack as the pans of the night', () => {
    const kit = practiceOf('adapters')
    const loading = playThrough(kit, house).states.find((s) => s.kits.length > 0) as PoolState
    const kitRun = fakeRun(loading)
    const kitMarkup = render(h(View2D, { run: kitRun, dump: dumpOf(kitRun.view, null, noop), pointed: [], pick: false }))
    expect(count(kitMarkup, /class="es-reachin__cell" data-state="adapter"/g)).toBe(kitRun.view.tally.adapter)
    expect(kitRun.view.tally.adapter).toBeGreaterThan(0)
  })

  test('draws every state of the house\'s nights without leaving the grid: the same number of pans in every state of every level', () => {
    for (const [id, seed] of PRACTICE) {
      const lvl = buildLevel(id, seed)
      const { states } = playThrough(lvl, house)
      for (const s of [states[0], states[Math.floor(states.length / 2)], states[states.length - 1]]) {
        const r = fakeRun(s)
        const m = render(h(View2D, { run: r, dump: dumpOf(r.view, null, noop), pointed: [], pick: false }))
        expect([id, count(rackOf(m), /class="es-reachin__cell"/g)]).toEqual([id, lvl.spec.poolPages])
      }
    }
  })
})

describe('the door of the reach-in counts pans by what is in them (GAMES.md §8, "Invariants": conservation)', () => {
  test('bare, held, cached and kits are the sim\'s own counts and add up to the pool, on every state of the house\'s night on every level', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      for (const state of playThrough(level, house).states) {
        const view = S.view(state)
        const pages = state.kv.pages
        expect([id, view.stock]).toEqual([
          id,
          {
            bare: pages.filter((page) => page.st === 'free').length,
            held: pages.filter((page) => page.st === 'used').length,
            cached: pages.filter((page) => page.st === 'cached').length,
            kits: pages.filter((page) => page.st === 'adapter').length,
          },
        ])
        expect([id, view.stock.bare + view.stock.held + view.stock.cached + view.stock.kits]).toEqual([id, level.spec.poolPages])
      }
    }
  })

  test('a cached pan that a waiting ticket starts from is drawn as shared mise, and is counted as cached: no ticket holds it', () => {
    const level = practiceOf('evict')
    const state = playThrough(level, house).states.find((candidate) => S.view(candidate).pans.some((pan) => pan.state === 'shared' && pan.refs === 0))
    expect(state).toBeDefined()
    const view = S.view(state as PoolState)
    const spoken = view.pans.filter((pan) => pan.state === 'shared' && pan.refs === 0)
    expect(spoken.length).toBeGreaterThan(0)
    // The count is of pans a ticket holds, whatever is drawn green: the pans that are only spoken for are cached.
    expect(view.stock.held).toBe(view.pans.filter((pan) => pan.refs > 0).length)
    expect(view.stock.cached).toBe(view.pans.filter((pan) => pan.state === 'cached' || (pan.state === 'shared' && pan.refs === 0)).length)
    // Counting the drawn forms, as the door once did, would call those pans held.
    expect(view.tally.used + view.tally.shared).toBeGreaterThan(view.stock.held)
    const markup = render(h(View2D, { run: fakeRun(state as PoolState), dump: dumpOf(view, null, noop), pointed: [], pick: false }))
    expect(markup).toContain(`held <span class="font-numeric">${view.stock.held}</span>`)
    expect(markup).toContain(`cached <span class="font-numeric">${view.stock.cached}</span>`)
  })

  test('the mirror\'s summary says the same counts, and kits only on a level that has them', () => {
    const plain = textOf(render(h(Mirror, { run: fakeRun(asking(practiceOf('evict'), 'evict')) })))
    expect(plain).toMatch(/Pans: bare \d+ , held \d+ , cached \d+ \./)
    expect(plain).not.toContain(', kits ')
    const kits = playThrough(practiceOf('adapters'), house).states.find((state) => S.view(state).stock.kits > 0) as PoolState
    expect(textOf(render(h(Mirror, { run: fakeRun(kits) })))).toMatch(/Pans: bare \d+ , held \d+ , cached \d+ , kits \d+ \./)
  })
})

describe('the controls offer every legal action as HTML', () => {
  test('the prediction comes first, as a field and a stub, and is gone once an action has been taken', () => {
    const level = practiceOf('one-group')
    const first = controls(S.init(level))
    expect(first).toContain('data-pool-predict=""')
    expect(first).toContain('Say it first.')
    expect(first).toContain('A whole number of pans.')
    expect(first).toMatch(/<button type="button" class="es-stub__pull" disabled=""/)
    const moved = controls(asking(level, 'admit') === S.init(level) ? S.init(level) : S.reduce(S.init(level), playThrough(level, house).actions[0]))
    expect(moved).not.toContain('data-pool-predict')
  })

  test('hanging: the waiting tickets are buttons, one tab stop for the list, and a plate hangs none, which W also does', () => {
    const level = practiceOf('evict')
    const state = asking(level, 'admit')
    const markup = controls(state)
    expect(markup).toContain('data-ask="admit"')
    expect(markup).toContain('Hang a ticket.')
    const ask = state.ask as Extract<PoolAsk, { kind: 'admit' }>
    const list = markup.slice(markup.indexOf('data-ask-list="admit"'), markup.indexOf('Hang none'))
    expect(count(list, /data-roving=""/g)).toBe(S.view(state).waiting.length)
    expect(count(list, /tabindex="0"/g)).toBe(1)
    for (const id of ask.candidates) expect(list).toContain(`aria-label="Hang ticket No. ${S.view(state).tickets[id].no}, table ${S.view(state).tickets[id].letter}`)
    expect(markup).toMatch(/aria-keyshortcuts="W"[^>]*>Hang none</)
    expect(markup).toContain('Counts are tokens and pans of the synthetic world.')
  })

  test('a waiting ticket that cannot hang is on the list, struck out with the reason, and is not a tab stop', () => {
    const level = practiceOf('adapters')
    const { states } = playThrough(level, house)
    const state = states.find((s) => s.ask?.kind === 'admit' && S.view(s).waiting.some((id) => !(s.ask as Extract<PoolAsk, { kind: 'admit' }>).candidates.includes(id)))
    expect(state).toBeDefined()
    const view = S.view(state as PoolState)
    const markup = controls(state as PoolState)
    const blocked = view.waiting.filter((id) => !((state as PoolState).ask as Extract<PoolAsk, { kind: 'admit' }>).candidates.includes(id))
    for (const id of blocked) {
      const label = view.tickets[id].kitReady === false ? 'its kit has not landed' : 'its pans do not fit yet'
      expect(markup).toContain(`aria-label="Hang ticket No. ${view.tickets[id].no}, table ${view.tickets[id].letter}, ${label}"`)
    }
    expect(count(markup, /disabled=""[^>]*aria-label="Hang ticket/g) + count(markup, /aria-label="Hang ticket[^"]*, its [^"]*"[^>]*disabled=""/g)).toBeGreaterThan(0)
  })

  test('dumping: the pans on offer in the rotation\'s order, the next ones chosen, and a stub that dumps exactly as many as the ticket needs', () => {
    const level = practiceOf('evict')
    const state = asking(level, 'evict')
    const ask = state.ask as Extract<PoolAsk, { kind: 'evict' }>
    const markup = controls(state)
    expect(markup).toContain('data-ask="evict"')
    expect(markup).toContain('Dump the pans.')
    expect(count(markup, /class="es-pick"/g)).toBe(ask.candidates.length)
    expect(count(markup, /aria-pressed="true"/g)).toBe(ask.need)
    expect(count(markup, /data-roving=""/g)).toBe(ask.candidates.length)
    expect(count(markup, /tabindex="0"/g)).toBe(1)
    expect(markup).toContain(`Dump the ${ask.need} ${ask.need === 1 ? 'pan' : 'pans'}`)
    expect(markup).toMatch(new RegExp(`Chosen <span class="font-numeric">${ask.need}</span> of <span class="font-numeric">${ask.need}</span>`))
    expect(markup).not.toMatch(/es-stub__pull" disabled/)
    expect(markup).toContain('The rotation&#x27;s next')
    // A draft that is short of the pans needed cannot be confirmed.
    const short = dumpOf(S.view(state), { key: '', pages: [] }, noop)
    expect(short.pages).toHaveLength(ask.need)
    const partial = dumpOf(S.view(state), { key: `${state.step}:${ask.for}:${ask.target}:${ask.need}:${ask.candidates.length}`, pages: ask.candidates.slice(0, ask.need - 1) }, noop)
    expect(partial.ready).toBe(false)
  })

  test('in practice a row says who waits on the pan and what the dump would cost; in a graded run no price is printed, and nothing else changes', () => {
    const state = asking(practiceOf('evict'), 'evict')
    const practice = controls(state, 'practice')
    const graded = controls(state, 'graded')
    expect(practice).toMatch(/waiting: No\. \d+, loses/)
    expect(practice).toContain('nobody waits on it')
    expect(graded).not.toMatch(/loses|would lose|nobody waits on it|waiting: No\./)
    expect(count(graded, /class="es-pick"/g)).toBe(count(practice, /class="es-pick"/g))
    const hang = asking(practiceOf('evict'), 'admit')
    expect(controls(hang, 'practice')).toContain('shared mise')
    expect(controls(hang, 'graded')).not.toContain('shared mise')
    expect(controls(hang, 'graded')).not.toContain('to take')
  })

  test('pulling: when the line cannot grow, the tickets on the line are buttons, and the one that cannot grow says so', () => {
    const base = buildLevel('one-group', 2)
    const level: PoolLevel = { ...base, spec: kvPreset(base.preset, 20, { prefixCaching: true }) }
    const state = asking(level, 'preempt')
    const ask = state.ask as Extract<PoolAsk, { kind: 'preempt' }>
    const markup = controls(state)
    expect(markup).toContain('data-ask="preempt"')
    expect(markup).toContain('Pull a ticket.')
    expect(count(markup, /aria-label="Pull ticket /g)).toBe(ask.candidates.length)
    expect(markup).toContain('the one that cannot grow')
    expect(count(markup, /tabindex="0"/g)).toBe(1)
  })

  test('bringing a kit in: the kits that waiting tickets need, what they take and how long they take to land, and a plate for none yet', () => {
    const level = practiceOf('adapters')
    const state = asking(level, 'prefetch')
    const markup = controls(state)
    const ask = state.ask as Extract<PoolAsk, { kind: 'prefetch' }>
    expect(markup).toContain('data-ask="prefetch"')
    expect(markup).toContain('Bring a kit in.')
    expect(count(markup, /aria-label="Bring kit /g)).toBe(ask.candidates.length)
    expect(markup).toMatch(/aria-keyshortcuts="W"[^>]*>Bring none yet</)
    expect(markup).toContain('to land')
    // A count of one is not plural: the small kit lands in one step, and the big one in several.
    expect(markup).toMatch(/<span class="font-numeric">1<\/span> step</)
    expect(markup).toMatch(/<span class="font-numeric">4<\/span> steps</)
    expect(markup).not.toMatch(/<span class="font-numeric">1<\/span> steps/)
  })

  test('the lamp falls on the open ask and on nothing else; when the night is over the controls say so', () => {
    for (const kind of ['admit', 'evict'] as const) expect(count(controls(asking(practiceOf('evict'), kind)), /data-lamp="true"/g)).toBe(1)
    const level = practiceOf('evict')
    const { states } = playThrough(level, house)
    const done = controls(states[states.length - 1])
    expect(done).toContain('Every ticket is served.')
    expect(done).not.toContain('data-lamp')
  })

  test('a night that ran out of steps says tickets were left unserved, and does not call that a good night', () => {
    const level = practiceOf('evict')
    const idle = playThrough(level, () => ({ t: 'admit', req: null })).states
    const end = idle[idle.length - 1]
    const markup = controls(end)
    expect(markup).toContain('Tickets left unserved.')
    expect(markup).toContain('The night ran out of steps with tickets waiting.')
  })
})

describe('the mirror lists everything the drawing shows (GAMES.md §2.3; A§6.9)', () => {
  const level = practiceOf('evict')
  const state = asking(level, 'evict')
  const markup = render(h(Mirror, { run: fakeRun(state) }))
  const view = S.view(state)

  test('prints the night\'s counters on the tape, each number a Readout with its tag, the kitchen\'s word beside the engine\'s', () => {
    expect(markup).toContain('data-mirror-summary')
    for (const line of ['step', 'tickets served', 'shared mise', 'prepped again', 'pans dumped', 'tickets pulled', 'price']) expect(textOf(markup)).toContain(line)
    expect(textOf(markup)).toContain('engine step')
    expect(textOf(markup)).toContain('hit tokens')
    expect(textOf(markup)).toContain('recomputed tokens')
    expect(textOf(markup)).toContain('evictions')
    expect(textOf(markup)).toContain('preemptions')
    expect(count(markup, /class="es-readout"/g)).toBe(count(markup, /class="es-readout__tag"/g))
    expect(count(markup, /data-tag="synthetic"/g)).toBeGreaterThanOrEqual(6)
    expect(count(markup, /data-tag="derived"/g)).toBe(1)
  })

  test('lists a row for every ticket that has arrived, with the shared mise it found and the pans it holds at each station, and a ticket still thinking is not a row', () => {
    const arrived = view.tickets.filter((ticket) => ticket.status !== 'future')
    expect(arrived.length).toBeLessThan(view.tickets.length)
    const table = markup.slice(markup.indexOf('Every ticket of the night'))
    for (const ticket of arrived) expect(table).toContain(`No. ${ticket.no}`)
    for (const ticket of view.tickets.filter((t) => t.status === 'future')) expect(table).not.toContain(`No. ${ticket.no} ·`)
    expect(table).toContain('data-label="Hit tokens, shared mise, synthetic"')
    expect(table).toContain('data-label="Recomputed tokens, prepped again, synthetic"')
  })

  test('lights the ticket the open ask is about, once', () => {
    expect(count(markup, /bg-lamp/g)).toBe(1)
  })

  test('keeps the page table behind a fold, closed, with a row for every pan that holds something', () => {
    expect(markup).toContain('<details class="es-mirror-fold">')
    expect(markup).not.toMatch(/<details class="es-mirror-fold" open/)
    const folded = markup.slice(markup.indexOf('es-mirror-fold'))
    const held = view.pans.filter((pan) => pan.state !== 'free')
    expect(count(folded, /<tr class="border-b border-paper-rule" role="row"><th scope="row"/g)).toBe(held.length)
    for (const pan of held.slice(0, 20)) expect(folded).toContain(`<span class="font-numeric">${String(pan.id + 1).padStart(3, '0')}</span>`)
    // On a phone each cell prints under its column's name, and the name is the words of the head.
    expect(folded).toContain('data-label="Hash, last six digits"')
    expect(folded).toContain('data-label="Refs, tickets that hold it"')
  })

  test('says in its heads that every figure is a count of the synthetic world', () => {
    expect(markup).toContain('Every figure is a count of the synthetic world.')
    expect(count(markup, /synthetic/g)).toBeGreaterThan(10)
  })
})

describe('the live region says one sentence for each change (A§6.9)', () => {
  test('a hanging, a dump, a served ticket, a new step, the next ask and the end of the night each have their words', () => {
    const level = practiceOf('evict')
    const { states } = playThrough(level, house)
    const lines = states.slice(1).map((state, at) => changeLine(S.view(states[at]), S.view(state)))
    expect(lines.every((line) => line === '' || /[.]$/.test(line))).toBe(true)
    expect(lines.some((line) => /^Hung No\. \d+: \d+ tokens? shared, \d+ tokens? prepped again\./.test(line))).toBe(true)
    expect(lines.some((line) => /\d+ pans? left the cache\./.test(line))).toBe(true)
    expect(lines.some((line) => /Served No\. \d+\./.test(line))).toBe(true)
    expect(lines.some((line) => /Step \d+\./.test(line))).toBe(true)
    expect(lines.some((line) => /\d+ tickets? can hang\./.test(line))).toBe(true)
    expect(lines.some((line) => /Dump \d+ pans?\./.test(line))).toBe(true)
    expect(lines[lines.length - 1]).toContain('The night is over.')
    expect(lines.some((line) => /[<>]/.test(line))).toBe(false)
  })

  test('a pulled ticket and a kit that could come in are announced, and a night that ran out of steps is not called over and well', () => {
    const base = buildLevel('one-group', 2)
    const tight: PoolLevel = { ...base, spec: kvPreset(base.preset, 20, { prefixCaching: true }) }
    const { states } = playThrough(tight, house)
    const lines = states.slice(1).map((state, at) => changeLine(S.view(states[at]), S.view(state)))
    expect(lines.some((line) => line.includes('A ticket was pulled from the line.'))).toBe(true)
    expect(lines.some((line) => line.includes('The line cannot grow: pull a ticket.'))).toBe(true)
    const kits = playThrough(practiceOf('adapters'), house).states
    const kitLines = kits.slice(1).map((state, at) => changeLine(S.view(kits[at]), S.view(state)))
    expect(kitLines.some((line) => /\d+ kits? could come in\./.test(line))).toBe(true)
    const idle = playThrough(practiceOf('evict'), () => ({ t: 'admit', req: null })).states
    expect(changeLine(S.view(idle[idle.length - 2]), S.view(idle[idle.length - 1]))).toContain('The night is over with tickets unserved.')
  })

  test('a committed prediction is announced, and a pulled-back one is not, since nothing changed', () => {
    const level = practiceOf('one-group')
    const first = S.init(level)
    const committed = S.reduce(first, { t: 'commit', prediction: 4 })
    expect(changeLine(S.view(first), S.view(committed))).toBe('Prediction committed.')
    expect(changeLine(S.view(committed), S.view(committed))).toBe('')
  })

  test('says nothing when the level changes under it', () => {
    expect(changeLine(S.view(S.init(practiceOf('evict'))), S.view(S.init(practiceOf('one-group'))))).toBe('')
  })
})

describe('the debrief says the decision that mattered, and puts the house and the engine beside you', () => {
  const next = { id: 'two-kinds', title: 'Two kinds of station' }

  function debrief(id: PoolLevelId, who: typeof engine | typeof house, over: { predicted?: number } = {}) {
    const level = practiceOf(id)
    const { states } = playThrough(level, who)
    let state = states[states.length - 1]
    if (over.predicted !== undefined) state = { ...state, predicted: over.predicted }
    const run = fakeRun(state, { done: true })
    return render(h(Debrief, { run, outcome: outcomeOf(state), next, onNext: noop }))
  }

  const kitsMarkup = () => debrief('adapters', engine)

  test('a night that paid more than the house names a decision of yours, in the kitchen\'s words and with no digit in the sentence', () => {
    const markup = debrief('evict', engine)
    expect(markup).toContain('The decision that mattered:')
    const sentence = textOf(markup.slice(markup.indexOf('Stock it again.'))).split('The decision that mattered')[0]
    expect(sentence).toContain('Stock it again.')
    expect(sentence).toMatch(/You (hung|dumped|pulled|brought)/)
    expect(sentence.replace('Stock it again.', '')).not.toMatch(/\d/)
    expect(markup).toMatch(/No\. <span class="font-numeric">[1-9]\d*<\/span> of yours/)
    expect(textOf(markup)).toMatch(/Score: \d+% derived/)
    expect(textOf(markup)).toContain('The bar is 95% estimated')
  })

  test('counts yours, the house\'s and the engine\'s pool side by side, each a synthetic count, the engine\'s term leading and the kitchen\'s word after it', () => {
    const markup = debrief('evict', engine)
    for (const head of ['Counter', 'Yours', 'The house', "The engine's pool"]) expect(textOf(markup)).toContain(head)
    for (const row of [
      'Price (tokens, synthetic)',
      'Recomputed tokens (prepped again, synthetic)',
      'Hit tokens (shared mise, synthetic)',
      'Completed requests (tickets served, synthetic)',
      'Preemptions (tickets pulled, synthetic)',
      'Evictions (pans dumped, synthetic)',
    ]) {
      expect(textOf(markup)).toContain(row)
    }
    expect(textOf(markup)).not.toContain('Adapter stall steps')
    expect(textOf(kitsMarkup())).toContain('Adapter stall steps (kit stall steps, synthetic)')
  })

  test('puts the counters in the mirror kit\'s table on a ticket of its own, which prints each counter as a block on a phone: a figure under each name, nothing wider than the paper', () => {
    const markup = debrief('evict', engine)
    const table = markup.slice(markup.indexOf('es-mirror__table'))
    expect(markup).toContain('data-mirror=""')
    expect(count(table, /<th[^>]*scope="col"/g)).toBe(4)
    expect(count(table, /<td[^>]*data-label="Yours"/g)).toBe(6)
    expect(count(table, /<td[^>]*data-label="The house"/g)).toBe(6)
    expect(count(table, /<td[^>]*data-label="The engine&#x27;s pool"/g)).toBe(6)
    // No table of its own that could be wider than the ticket: the kit's region is the only scroller, and the narrow layout needs none.
    expect(markup).not.toContain('es-compare')
  })

  test('a night that matches the house says so, names no decision, and offers the next level, the same level again and fresh numbers', () => {
    const markup = debrief('evict', house)
    expect(markup).not.toContain('The decision that mattered:')
    expect(textOf(markup)).toMatch(/kept pace with the house|paid less than the house/)
    // The stub says "Next level" and the ticket names the level, so that a long title never has to fit a phone's stub.
    expect(markup).toMatch(/es-stub__label">Next level</)
    expect(textOf(markup)).toContain('Next level: Two kinds of station')
    expect(textOf(markup)).not.toContain('Next: Two kinds of station')
    expect(textOf(markup)).toContain('Play this level again')
    expect(textOf(markup)).toContain('New numbers')
  })

  test('on a level with kits it sets the pool against a shelf of fixed slots, as the engines keep kits (D-042); on the others it does not', () => {
    const kits = textOf(debrief('adapters', engine))
    expect(kits).toContain('The same night, with the kits on a shelf')
    expect(kits).toContain('neither engine pages a kit into its KV pool')
    expect(textOf(debrief('evict', engine))).not.toContain('with the kits on a shelf')
  })

  test('reveals the prediction made first, and says whether the sim\'s own arithmetic agrees', () => {
    const level = practiceOf('one-group')
    const right = textOf(debrief('one-group', house, { predicted: level.predict.answer }))
    expect(right).toContain('Your prediction:')
    expect(right).toContain('You had it.')
    const wrong = textOf(debrief('one-group', house, { predicted: level.predict.answer + 3 }))
    expect(wrong).toContain('says otherwise')
    expect(textOf(debrief('one-group', house))).not.toContain('Your prediction:')
  })
})

describe('the source keeps the rules of the house', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const sources = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
  const files = [...sources('src/games/pool'), ...sources('packages/play/pool')]

  test('the direction contract is development-only: its blocks are in the surface brief and in no file the page ships', () => {
    expect(files.length).toBeGreaterThan(25)
    for (const file of files) {
      const text = readFileSync(path.join(root, file), 'utf8')
      for (const marker of ['THESIS:', 'OWN-WORLD:', 'FIRST VIEWPORT:', 'FINISH: unreviewed', 'seed: none (specified surface']) expect([file, marker, text.includes(marker)]).toEqual([file, marker, false])
    }
    const brief = readFileSync(path.join(root, '.impeccable/surfaces/src-games-pool-game-tsx.md'), 'utf8')
    for (const marker of ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance']) {
      expect([marker, brief.includes(marker)]).toEqual([marker, true])
    }
    expect(brief).toContain('seed: none (specified surface, no roll)')
  })

  test('no file of the page names a literal colour: the roles of src/design are the only palette (tests/design/literals.test.ts holds the whole of src/)', () => {
    for (const file of files.filter((f) => f.startsWith('src/'))) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /#[0-9a-fA-F]{6}\b/.test(text), /\b(?:rgb|hsl|oklch)a?\(/.test(text)]).toEqual([file, false, false])
    }
  })

  test('the page keeps its state in the session: no file of it reads a clock or a generator of its own', () => {
    for (const file of files) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect([file, /Math\.random|Date\.now|performance\.now/.test(text)]).toEqual([file, false])
    }
  })
})
