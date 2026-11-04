/*
 * W1-T06: the course map, `/map` (ARCHITECTURE §3.1). TR0 to the capstone, with the lanes, hours, kernelspace lessons and artifacts of
 * each module, and what the learner holds of it, derived at read time. The page is drawn on the server renderer here, from the
 * repository's compiled content; the layout (no sideways scroll at 320 px, the rail, the look) is checked in a browser by
 * e2e/map.spec.ts.
 *
 * Accept 3: every node links to its module. The tickets are an ordered list, so a reader who cannot see the rail gets the course in
 * its order, each ticket with its facts and one link to its module.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import type { LedgerEvent } from '@es/ledger'
import { CourseMapView } from '@/map/CourseMap'
import type { CourseMapViewProps } from '@/map/CourseMap'
import { MAP as COPY } from '@/map/copy'
import { nextModule } from '@/progress/derive'
import { made } from '../progress/support'
import { INDEX, MAP, opening, attribute, progressOf, render, stopOf, textOf } from './support'

const view = (events: readonly LedgerEvent[] | null, overrides: Partial<CourseMapViewProps> = {}) =>
  render(
    h(CourseMapView, {
      modules: INDEX.modules,
      totalHours: INDEX.totalHours,
      map: MAP,
      progress: events === null ? null : progressOf(events),
      ready: events !== null,
      ...overrides,
    }),
    '/map',
  )

const empty = view([])

describe('the course map lists the whole course', () => {
  test('one stop for every module of the index, in the index\'s order, in an ordered list', () => {
    const stops = [...empty.matchAll(/<li class="es-map__stop" data-module="([a-z0-9]+)"/g)].map((match) => match[1])
    expect(stops).toEqual(INDEX.modules.map((module) => module.id))
    expect(stops).toEqual(['tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone'])
    expect(empty).toContain('<ol class="es-map__rails">')
  })

  test('accept 3: every node links to its module, once, by its stub', () => {
    for (const module of INDEX.modules) {
      const stop = stopOf(empty, module.id)
      const links = opening(stop, 'a').filter((tag) => attribute(tag, 'class')?.includes('es-stub__pull'))
      expect(links.map((tag) => attribute(tag, 'href'))).toEqual([module.route])
      expect(module.route).toBe(`/m/${module.id}`)
    }
  })

  test('the stub says which module it opens, in words that a list of links can be told apart by', () => {
    for (const module of INDEX.modules) {
      const printed = module.id === 'capstone' ? 'capstone' : `TR${module.id.slice(2)}`
      expect(textOf(stopOf(empty, module.id))).toContain(`${COPY.open} ${printed}`)
    }
  })

  test('a planned module has its ticket, marked planned, with the same stub as a module that is written', () => {
    for (const module of INDEX.modules.filter((candidate) => candidate.status === 'planned')) {
      const stop = stopOf(empty, module.id)
      expect(attribute(opening(stop, 'li')[0], 'data-status')).toBe('planned')
      expect(stop).toContain('es-stub__pull')
    }
    expect(INDEX.modules.some((module) => module.status === 'planned')).toBe(true)
  })

  test('each ticket prints its title as a heading, and the page has one h1 and a hidden h2 for the list', () => {
    expect(opening(empty, 'h1')).toHaveLength(1)
    expect(opening(empty, 'h2')).toHaveLength(1)
    expect(opening(empty, 'h3')).toHaveLength(INDEX.modules.length)
    for (const module of INDEX.modules) expect(stopOf(empty, module.id)).toContain(`<h3 class="es-ticket__title">${module.title.replaceAll("'", '&#x27;')}</h3>`)
    expect([...empty.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))).toEqual([1, 2, ...INDEX.modules.map(() => 3)])
  })
})

describe('a ticket tells where the work is done, and what the module asks for there', () => {
  test('its lanes are the ones with hours, in the architecture\'s order, each with its hours', () => {
    for (const module of INDEX.modules) {
      const stop = stopOf(empty, module.id)
      const lanes = [...stop.matchAll(/class="es-map__lane" data-lane="([BLF])"/g)].map((match) => match[1])
      expect(lanes).toEqual((['B', 'L', 'F'] as const).filter((lane) => (module.hours_by_lane[lane] ?? 0) > 0))
    }
    // TR1 works in the browser and on a GPU: 7.5 hours and 2.5 [estimated].
    const tr1 = textOf(stopOf(empty, 'tr1'))
    expect(tr1).toContain('browser 7.5 h hours')
    expect(tr1).toContain('GPU 2.5 h hours')
    expect(tr1).not.toContain('laptop')
  })

  test('an artifact is printed under its lane', () => {
    for (const detail of MAP.modules) {
      const stop = stopOf(empty, detail.id)
      for (const artifact of detail.artifacts) {
        expect(stop).toContain(`<li>${artifact.title.replaceAll("'", '&#x27;')}</li>`)
        const lane = new RegExp(`data-lane="${artifact.lane}"[\\s\\S]*?<li>${artifact.title.replaceAll("'", '&#x27;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</li>`)
        expect(stop).toMatch(lane)
      }
    }
  })

  test('the hours of a ticket are printed in dots with their unit read out, and said to be estimated', () => {
    const tr3 = stopOf(empty, 'tr3')
    expect(tr3).toContain('<span>12</span><span aria-hidden="true"> h</span><span class="sr-only"> hours</span>')
    expect(tr3).toContain(COPY.hoursNote)
  })

  test('the kernelspace lessons a module advises first are links out, and the modules are links in', () => {
    const tr3 = stopOf(empty, 'tr3')
    expect(textOf(tr3)).toContain('Advised first kernelspace T0.L6')
    expect(tr3).toContain('href="https://kernelspace.naigap.com/lesson/t0.l6"')
    expect(tr3).toContain('href="https://kernelspace.naigap.com/lesson/t4.l3"')
    expect(tr3).toContain('rel="noreferrer noopener"')
    expect(tr3).toContain('href="/m/tr2"')
    // A link out says so in words, and a module needs no such word.
    expect(tr3.match(/\(opens in a new tab\)/g)).toHaveLength(2)
  })

  test('the map shows each module\'s prerequisites exactly as the compiled map has them', () => {
    for (const detail of MAP.modules) {
      const stop = stopOf(empty, detail.id)
      const lessons = detail.prereqs.filter((prereq) => prereq.startsWith('ks:')).map((prereq) => prereq.slice(3))
      const found = [...stop.matchAll(/href="https:\/\/kernelspace\.naigap\.com\/lesson\/([a-z0-9.]+)"/g)].map((match) => match[1].toUpperCase())
      expect(found).toEqual(lessons)
      const modules = detail.prereqs.filter((prereq) => !prereq.startsWith('ks:'))
      const linked = opening(stop, 'a')
        .map((tag) => attribute(tag, 'href'))
        .filter((href): href is string => href?.startsWith('/m/') === true && href !== `/m/${detail.id}`)
      expect(linked).toEqual(modules.map((module) => `/m/${module}`))
    }
  })
})

describe('the printer\'s tape of the course', () => {
  test('adds up the hours of the course by lane: browser, laptop and GPU, each derived', () => {
    const tape = textOf(/<figure[\s\S]*?<\/figure>/.exec(empty)?.[0] ?? '')
    expect(tape).toContain('hours, all 91 derived')
    expect(tape).toContain('browser 53.5 derived')
    expect(tape).toContain('laptop 3 derived')
    expect(tape).toContain('GPU 34.5 derived')
  })

  test('the three lanes add up to the whole', () => {
    expect(53.5 + 3 + 34.5).toBe(INDEX.totalHours)
  })
})

describe('what the learner holds, drawn from the events', () => {
  test('before the ledger is read, every ticket with KCs says so, the lamp is out, and no pip is earned', () => {
    const waiting = view(null)
    expect(waiting).toContain(COPY.holding.reading)
    expect(waiting).not.toContain('data-next')
    expect(waiting).not.toContain('data-state="earned"')
    expect(textOf(waiting)).toContain(`earned ${COPY.tape.reading}`)
  })

  test('with an empty ledger, a module with KCs counts none earned, with a ring for each; a module with none says so', () => {
    for (const detail of MAP.modules) {
      const stop = stopOf(empty, detail.id)
      if (detail.kcs.length === 0) {
        expect(stop).toContain(COPY.holding.none)
        expect(stop).not.toContain('class="es-pip"')
        continue
      }
      expect(stop.match(/class="es-pip" data-state="none"/g)).toHaveLength(detail.kcs.length)
      expect(textOf(stop)).toContain(`0 ${COPY.holding.of} ${detail.kcs.length} ${COPY.holding.earned}`)
    }
  })

  test('a review that passed earns its KC: its pip is solid, and the count and the tape say so', () => {
    const html = view([made('review', 'review:tr2.async-overlap')])
    const stop = stopOf(html, 'tr2')
    expect(stop.match(/data-state="earned"/g)).toHaveLength(1)
    expect(textOf(stop)).toContain(`1 ${COPY.holding.of} 11 ${COPY.holding.earned}`)
    expect(textOf(/<figure[\s\S]*?<\/figure>/.exec(html)?.[0] ?? '')).toContain('earned 1 measured of 45')
    // The KCs are in the graph's order, so it is the fifth pip of TR2.
    const order = [...stop.matchAll(/class="es-pip" data-state="(\w+)"/g)].map((match) => match[1])
    expect(order).toEqual(['none', 'none', 'none', 'none', 'earned', 'none', 'none', 'none', 'none', 'none', 'none'].slice(0, 11))
  })

  test('practised, earned and kept are told apart by shape: a ring, a ringed dot, a dot, a ticked dot', () => {
    const events = [
      made('review', 'review:tr2.step-calls', { ok: false }),
      made('review', 'review:tr2.one-budget'),
      made('review', 'review:tr2.gpu-dependent-defaults', { day: 0 }),
      made('review', 'review:tr2.gpu-dependent-defaults', { day: 31 }),
    ]
    const stop = stopOf(view(events), 'tr2')
    const states = [...stop.matchAll(/class="es-pip" data-state="(\w+)"/g)].map((match) => match[1])
    expect(states.slice(0, 3)).toEqual(['practised', 'earned', 'kept'])
    expect(stop).toContain('data-icon="check"')
    expect(textOf(stop)).toContain(`2 ${COPY.holding.of} 11 ${COPY.holding.earned}`)
    expect(textOf(stop)).toContain(`1 ${COPY.holding.practising}`)
    expect(textOf(stop)).toContain(`1 ${COPY.holding.kept}`)
  })

  test('the pips are a drawing of the count, so assistive technology is spared them', () => {
    for (const tag of opening(empty, 'span').filter((candidate) => attribute(candidate, 'class')?.includes('es-pips'))) expect(attribute(tag, 'aria-hidden')).toBe('true')
  })

  test('the lamp falls on the ticket that nextModule names, and on no other, with the words "next ticket" printed on it', () => {
    const events: LedgerEvent[] = []
    const expected = nextModule(INDEX.modules, progressOf(events))
    expect(expected).not.toBeNull()
    const html = view(events)
    const lit = [...html.matchAll(/<li class="es-map__stop" data-module="([a-z0-9]+)"[^>]*data-next="true"/g)].map((match) => match[1])
    expect(lit).toEqual([expected as string])
    expect(stopOf(html, expected as string)).toContain(`data-lamp="true"`)
    expect(stopOf(html, expected as string)).toContain(COPY.next)
    expect(html.match(/data-lamp="true"/g)).toHaveLength(1)
    // And the tape names it.
    expect(textOf(/<figure[\s\S]*?<\/figure>/.exec(html)?.[0] ?? '')).toContain(`next ticket ${expected === 'capstone' ? 'capstone' : `TR${(expected as string).slice(2)}`}`)
  })

  test('the lamp moves on when a module\'s KCs are all earned', () => {
    const first = nextModule(INDEX.modules, progressOf([])) as string
    const all = MAP.modules.find((module) => module.id === first)?.kcs ?? []
    expect(all.length).toBeGreaterThan(0)
    const events = all.map((kc) => made('review', `review:${kc}`))
    const after = nextModule(INDEX.modules, progressOf(events))
    expect(after).not.toBe(first)
    expect(view(events)).not.toContain(`data-module="${first}" data-status="${INDEX.modules.find((module) => module.id === first)?.status}" data-next`)
  })

  test('nothing is locked: the lamp advises, and a ticket that is not lit is a link all the same', () => {
    const html = view([])
    for (const module of INDEX.modules) expect(stopOf(html, module.id)).toContain(`href="${module.route}"`)
  })
})
