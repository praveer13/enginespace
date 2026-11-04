/*
 * W1-T06: a module page shows its loop and the learner's progress (ARCHITECTURE §3.1: "its loop (Predict → Play → Build → Prove →
 * Keep), lessons, games, labs and evidence"). The loop is the same five steps in every module, with the games and labs that this
 * module lists and what the learner's events say they have done in each; the knowledge components are listed with their states.
 * Both are derived from the events and the compiled map each time the page draws, and the page stores nothing.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import type { LedgerEvent } from '@es/ledger'
import { Kcs, Loop } from '@/map/ModuleProgress'
import { KCS, LOOP } from '@/map/copy'
import { ModuleView } from '@/pages/Module'
import { made } from '../progress/support'
import { attribute, CLAIMS, INDEX, MAP, opening, progressOf, render, textOf, TODAY, TR2 } from './support'

const kcsOf = (id: string) => MAP.kcs.filter((kc) => kc.module === id)
const entry = (id: string) => INDEX.modules.find((module) => module.id === id)

/** TR2's page as the app draws it, over some events. `events` null is a ledger that has not been read yet. */
function page(events: readonly LedgerEvent[] | null) {
  const progress = events === null ? undefined : progressOf(events).modules.get('tr2')
  return render(h(ModuleView, { id: 'tr2', module: TR2, entry: entry('tr2'), claims: CLAIMS, today: TODAY, kcs: kcsOf('tr2'), progress, ready: events !== null }), '/m/tr2')
}

const empty = page([])

describe('the loop on a module page', () => {
  const loop = /<section[^>]*data-block="loop"[\s\S]*?<\/section>/.exec(empty)?.[0] ?? ''

  test('is a ticket of five steps, in the order of the loop: Predict, Play, Build, Prove, Keep', () => {
    expect(loop).not.toBe('')
    const names = [...loop.matchAll(/class="es-steps__name">([^<]+)</g)].map((match) => match[1])
    expect(names).toEqual(['Predict', 'Play', 'Build', 'Prove', 'Keep'])
    expect(opening(loop, 'ol')).toHaveLength(1)
    expect(opening(loop, 'li')).toHaveLength(5)
  })

  test('is under an h2 of its own, in the module\'s outline', () => {
    expect(loop).toContain(`<h2 class="es-ticket__title">${LOOP.title}</h2>`)
    const levels = [...empty.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
    expect(levels[0]).toBe(1)
    for (let at = 1; at < levels.length; at += 1) expect(levels[at] - levels[at - 1]).toBeLessThanOrEqual(1)
  })

  test('Play names the module\'s game and links the ones that are built, and Build says when there is no lab', () => {
    expect(loop).toContain('href="/play/loop"')
    expect(textOf(loop)).toContain('Service')
    expect(textOf(loop)).toContain(LOOP.noLab)
  })

  test('Keep links to Today', () => {
    expect(loop).toContain('href="/today"')
  })

  test('with an empty ledger, each step says nothing yet, and Prove is not yet', () => {
    const text = textOf(loop)
    expect(text).toContain(`0 ${LOOP.made}`)
    expect(text).toContain(LOOP.nothing)
    expect(text).toContain(LOOP.notYet)
    expect(text).not.toContain(LOOP.proved)
  })

  test('before the ledger is read it says so in every step, and does not say there is nothing', () => {
    const waiting = /<section[^>]*data-block="loop"[\s\S]*?<\/section>/.exec(page(null))?.[0] ?? ''
    expect(waiting.match(new RegExp(LOOP.reading, 'g'))).toHaveLength(5)
    expect(textOf(waiting)).not.toContain(LOOP.nothing)
    expect(textOf(waiting)).not.toContain(LOOP.notYet)
  })

  test('counts what the events say: tried, credited and at part credit for Play, and the reviews for Keep', () => {
    const events = [
      made('play', 'play:loop/close'),
      made('play', 'play:loop/close', { ok: false }),
      made('play', 'play:loop/async', { provenance: 'practice' }),
      made('item', 'item:gen/tr2.bubble-width/v1'),
      made('predict', 'predict:tr2.l0#tr2.l0.p1'),
      made('review', 'review:tr2.bubble', { day: 1 }),
    ]
    const text = textOf(/<section[^>]*data-block="loop"[\s\S]*?<\/section>/.exec(page(events))?.[0] ?? '')
    expect(text).toContain(`1 ${LOOP.made}`)
    expect(text).toContain(`2 ${LOOP.credited} ${LOOP.of} 4 ${LOOP.tried} 1 ${LOOP.partial}`)
    // The review came a day after the pass: it is a second pass at full weight, and the KC is not kept until 30 days have gone by.
    expect(text).toContain(`1 ${LOOP.credited} ${LOOP.of} 1 ${LOOP.tried} 0 ${LOOP.of} 11 ${LOOP.kept}`)
  })

  test('Prove is proved once a result passed with the agent closed', () => {
    const text = textOf(/<section[^>]*data-block="loop"[\s\S]*?<\/section>/.exec(page([made('play', 'play:loop/close', { provenance: 'proved' })]))?.[0] ?? '')
    expect(text).toContain(`${LOOP.steps.prove.name} ${LOOP.steps.prove.what} ${LOOP.proved}`)
  })
})

describe('the games of a loop are links only where the game is built', () => {
  const props = { module: 'tr9', labs: [], ready: true }

  test('a game that is built is a link to /play/<id>', () => {
    const html = render(h(Loop, { ...props, games: ['loop'] }))
    expect(html).toContain('href="/play/loop"')
  })

  test('a game that is not built is its name and the wave that brings it, and never a link', () => {
    const html = render(h(Loop, { ...props, games: ['pool', 'shape-shifter'], progress: progressOf([]).modules.get('tr5a') }))
    expect(html).not.toContain('href="/play/pool"')
    expect(html).not.toContain('href="/play/shape-shifter"')
    expect(textOf(html)).toContain('The Reach-In, arriving with W1')
    expect(textOf(html)).toContain('Sheet Pan, arriving with W2')
  })

  test('a module with no game says so', () => {
    expect(textOf(render(h(Loop, { ...props, games: [] })))).toContain(LOOP.noGame)
  })

  test('the labs of a module are links to its lab pages', () => {
    const html = render(h(Loop, { ...props, games: [], labs: ['hybrid-kv'] }))
    expect(html).toContain('href="/labs/hybrid-kv"')
  })
})

describe('the knowledge components on a module page', () => {
  const kcs = /<section[^>]*data-block="kcs"[\s\S]*?<\/section>/.exec(empty)?.[0] ?? ''

  test('lists every KC of the module, in the graph\'s order, as the graph describes it', () => {
    const listed = [...kcs.matchAll(/data-kc="([a-z0-9.-]+)"/g)].map((match) => match[1])
    expect(listed).toEqual(kcsOf('tr2').map((kc) => kc.id))
    for (const kc of kcsOf('tr2')) expect(textOf(kcs)).toContain(kc.description)
  })

  test('with an empty ledger, every KC is not yet, with a ring', () => {
    expect(kcs.match(/class="es-pip" data-state="none"/g)).toHaveLength(11)
    expect(textOf(kcs)).toContain(`${KCS.states.none}`)
  })

  test('says once, for the whole list, that a KC with no graded item behind it yet cannot be earned yet', () => {
    expect(kcsOf('tr2').some((kc) => kc.planned !== undefined)).toBe(true)
    expect(textOf(kcs).split(KCS.planned).length - 1).toBe(1)
    // And not at all for a module whose KCs all have a graded item.
    const graded = render(h(Kcs, { module: 'tr2', kcs: kcsOf('tr2').map((kc) => ({ id: kc.id, module: kc.module, description: kc.description, requires: kc.requires })), ready: true }))
    expect(textOf(graded)).not.toContain(KCS.planned)
  })

  test('each KC shows its state in words, and the pips are not the only carrier', () => {
    const events = [made('review', 'review:tr2.bubble', { ok: false }), made('review', 'review:tr2.async-overlap'), made('review', 'review:tr2.graph-replay', { day: 0 }), made('review', 'review:tr2.graph-replay', { day: 40 })]
    const html = /<section[^>]*data-block="kcs"[\s\S]*?<\/section>/.exec(page(events))?.[0] ?? ''
    const row = (id: string) => textOf(new RegExp(`<li[^>]*data-kc="${id}"[\\s\\S]*?</li>`).exec(html)?.[0] ?? '')
    expect(row('tr2.bubble')).toContain(KCS.states.practised)
    expect(row('tr2.async-overlap')).toContain(KCS.states.earned)
    expect(row('tr2.graph-replay')).toContain(KCS.states.kept)
    expect(row('tr2.step-calls')).toContain(KCS.states.none)
    expect(textOf(html)).toContain(`2 ${KCS.count.of} 11 ${KCS.count.earned} 1 ${KCS.count.kept}`)
  })

  test('before the ledger is read, the page says it is reading it', () => {
    const waiting = /<section[^>]*data-block="kcs"[\s\S]*?<\/section>/.exec(page(null))?.[0] ?? ''
    expect(waiting.match(new RegExp(KCS.reading, 'g'))).toHaveLength(11)
    expect(waiting).not.toContain('data-state="earned"')
  })

  test('is a ticket of its own under an h2', () => {
    expect(kcs).toContain(`<h2 class="es-ticket__title">${KCS.title}</h2>`)
    expect(h(Kcs, { module: 'tr2', kcs: [], ready: true })).toBeTruthy()
  })
})

describe('the module\'s tape of facts carries the evidence', () => {
  const tape = (events: readonly LedgerEvent[] | null) => textOf(/<figure[\s\S]*?<\/figure>/.exec(page(events))?.[0] ?? '')

  test('earned and kept, counted from the events, once the ledger is read', () => {
    expect(tape([made('review', 'review:tr2.bubble')])).toContain('earned 1 measured of 11')
    expect(tape([made('review', 'review:tr2.bubble')])).toContain('kept 0 measured')
  })

  test('and reading, until it is', () => {
    expect(tape(null)).toContain('earned reading your ledger')
  })
})

describe('a page that is not given progress shows neither the loop nor the evidence', () => {
  test('so a map that did not load leaves the rest of the page as it was', () => {
    const html = render(h(ModuleView, { id: 'tr2', module: TR2, entry: entry('tr2'), claims: CLAIMS, today: TODAY }), '/m/tr2')
    expect(html).not.toContain('data-block="loop"')
    expect(html).not.toContain('data-block="kcs"')
    expect(attribute(opening(html, 'article')[0], 'class')).toBe('es-doc')
  })

  test('and a planned module with KCs lists them but has no loop to show', () => {
    const planned = INDEX.modules.find((module) => module.status === 'planned' && kcsOf(module.id).length > 0)
    expect(planned).toBeDefined()
    const id = (planned as { id: string }).id
    const html = render(h(ModuleView, { id, module: null, entry: entry(id), claims: null, today: TODAY, kcs: kcsOf(id), progress: progressOf([]).modules.get(id), ready: true }), `/m/${id}`)
    expect(html).toContain('data-block="kcs"')
    expect(html).not.toContain('data-block="loop"')
  })
})
