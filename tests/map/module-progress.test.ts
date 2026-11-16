/*
 * W1-T06, redrawn by R-T22: a module page shows what the learner holds of it (REDESIGN section 3.3). The outcome sentences gain a tick when
 * their KCs are passed, and the Game, Build, Prove and Keep rows say what the learner has done in each. Both are derived from the events and
 * the compiled map each time the page draws, and the page stores nothing.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { GAMES } from '@es/play'
import { MODULE } from '@/map/copy'
import { Outcomes, Rows, type LabRef } from '@/map/ModuleProgress'
import { made } from '../progress/support'
import { opening, progressOf, render, textOf } from './support'

const OUTCOMES = ['Name the work on the critical path', 'Say what async scheduling hides', 'Explain a dispatch']

describe('the outcomes on a module page', () => {
  test('with nothing passed, one list under "You will be able to", each with a ring and none ticked', () => {
    const html = render(h(Outcomes, { outcomes: OUTCOMES, passed: [false, false, false] }))
    expect(textOf(html)).toContain(MODULE.will)
    expect(textOf(html)).not.toContain(MODULE.can)
    expect(opening(html, 'li')).toHaveLength(3)
    expect(html).not.toContain('data-done')
    expect(opening(html, 'h2')).toHaveLength(1)
  })

  test('an outcome whose KCs are passed moves under "You can" with a drawn tick, and the rest stay under the other heading', () => {
    const html = render(h(Outcomes, { outcomes: OUTCOMES, passed: [false, true, false] }))
    const can = html.indexOf(`>${MODULE.can}<`)
    const will = html.indexOf(`>${MODULE.will}<`)
    expect(can).toBeGreaterThan(-1)
    expect(will).toBeGreaterThan(can)
    expect(html.indexOf(OUTCOMES[1])).toBeGreaterThan(can)
    expect(html.indexOf(OUTCOMES[1])).toBeLessThan(will)
    expect(html.indexOf(OUTCOMES[0])).toBeGreaterThan(will)
    expect(html.match(/data-done="true"/g)).toHaveLength(2)
    expect(html).toContain('<svg')
  })

  test('every outcome passed leaves the one heading, "You can"', () => {
    const text = textOf(render(h(Outcomes, { outcomes: OUTCOMES, passed: [true, true, true] })))
    expect(text).toContain(MODULE.can)
    expect(text).not.toContain(MODULE.will)
  })

  test('the ticks are drawn and hidden from assistive technology: the heading carries the meaning', () => {
    const html = render(h(Outcomes, { outcomes: OUTCOMES, passed: [true, false, false] }))
    expect(html.match(/class="es-module__tick"[^>]*aria-hidden="true"/g)?.length).toBe(3)
  })
})

describe('the four rows under the lessons', () => {
  const none: LabRef[] = []
  const props = { games: ['loop'], labs: none, ready: true }

  test('Game links the built game and counts its levels', () => {
    const html = render(h(Rows, props))
    const row = /<div class="es-module__row" data-row="game">[\s\S]*?<\/div>/.exec(html)?.[0] ?? ''
    expect(row).toContain('href="/play/loop"')
    expect(textOf(row)).toMatch(new RegExp(`Step loop\\s*: ${GAMES.get('loop')?.levels.length} levels`))
  })

  test('Game says what the learner has done, from the events, and says nothing before any', () => {
    const progress = progressOf([made('play', 'play:loop/close'), made('play', 'play:loop/close', { ok: false })]).modules.get('tr2')
    expect(textOf(render(h(Rows, { ...props, progress })))).toContain('1 passed of 2 tried')
    expect(textOf(render(h(Rows, { ...props, progress: progressOf([]).modules.get('tr2') })))).not.toContain('tried')
  })

  test('a game that is not published is its name and "not published yet", and never a link', () => {
    const html = render(h(Rows, { ...props, games: ['gap-hunt'] }))
    expect(html).not.toContain('href="/play/gap-hunt"')
    expect(textOf(html)).toContain(`Trace attribution: ${MODULE.waiting}`)
  })

  test('a module with no game has no Game row', () => {
    expect(render(h(Rows, { ...props, games: [] }))).not.toContain('data-row="game"')
  })

  test('a lab in the browser or on a laptop is a Build link; one on a GPU is Prove, and says not yet until it is proved', () => {
    const labs: LabRef[] = [
      { id: 'hybrid-kv', lane: 'B', waiting: false },
      { id: 'tr1.fork', lane: 'F', waiting: true },
    ]
    const html = render(h(Rows, { ...props, games: [], labs, progress: progressOf([]).modules.get('tr5a') }))
    expect(/data-row="build"[\s\S]*?<\/div>/.exec(html)?.[0]).toContain('href="/labs/hybrid-kv"')
    const prove = /data-row="prove"[\s\S]*?<\/div>/.exec(html)?.[0] ?? ''
    expect(prove).not.toContain('href')
    expect(textOf(prove)).toContain(`tr1.fork: ${MODULE.waiting}`)
    expect(textOf(prove)).toContain(MODULE.notYet)
  })

  test('Prove says proved once a result passed with the agent closed', () => {
    const labs: LabRef[] = [{ id: 'rejection-sampler', lane: 'F', waiting: false }]
    const progress = progressOf([made('play', 'play:loop/close', { provenance: 'proved' })]).modules.get('tr2')
    expect(textOf(render(h(Rows, { ...props, games: [], labs, progress })))).toContain(MODULE.proved)
  })

  test('no row without a lab says Build or Prove, and Keep is always there, linking to Review', () => {
    const html = render(h(Rows, props))
    expect(html).not.toContain('data-row="build"')
    expect(html).not.toContain('data-row="prove"')
    expect(/data-row="keep"[\s\S]*?<\/div>/.exec(html)?.[0]).toContain('href="/today"')
  })

  test('Keep counts the skills kept once the ledger is read', () => {
    const progress = progressOf([made('review', 'review:tr2.bubble')]).modules.get('tr2')
    expect(textOf(render(h(Rows, { ...props, progress })))).toMatch(/0 of \d+ skills kept/)
  })

  test('the rows say nothing of the learner until the ledger is read', () => {
    const progress = progressOf([made('play', 'play:loop/close')]).modules.get('tr2')
    const text = textOf(render(h(Rows, { ...props, ready: false, progress })))
    expect(text).not.toContain('tried')
    expect(text).not.toContain('kept')
  })
})
