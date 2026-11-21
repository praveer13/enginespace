/*
 * R-T21: Course, `/map` (REDESIGN 3.2). One column of modules in course order on a track line, opened by the way on. Each row says in
 * words what the module needs and where the learner stands; the module the way on points into is open and lists its lessons, the
 * next one under the marker; an unpublished module says so and is not a link. The page is drawn on the server renderer here, from the
 * repository's compiled content; the layout (the first lesson within 700 px, no sideways scroll at 390 and 320) is checked in a
 * browser by e2e/map.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import type { LedgerEvent } from '@es/ledger'
import { CourseMapView } from '@/map/CourseMap'
import type { CourseMapViewProps } from '@/map/CourseMap'
import { MAP as COPY } from '@/map/copy'
import { formatHours, hoursSplit, LANE_ORDER } from '@/map/summary'
import { findBanned } from '@/copy/banned'
import { nextStep, standings, indexLessons } from '@/progress/next'
import { made } from '../progress/support'
import { INDEX, MAP, opening, attribute, progressOf, render, textOf } from './support'

const states = (events: readonly LedgerEvent[]) => new Map([...standings(events, indexLessons(MAP.lessons))].map(([id, standing]) => [id, standing.state]))

const view = (events: readonly LedgerEvent[] | null, overrides: Partial<CourseMapViewProps> = {}) =>
  render(
    h(CourseMapView, {
      modules: INDEX.modules,
      map: MAP,
      progress: events === null ? null : progressOf(events),
      ready: events !== null,
      step: events === null ? null : nextStep(events, MAP.lessons, null),
      states: events === null ? new Map() : states(events),
      ...overrides,
    }),
    '/map',
  )

const rowOf = (html: string, module: string): string => {
  const start = html.indexOf(`<li class="es-course__row" data-module="${module}"`)
  if (start < 0) throw new Error(`no row for ${module}`)
  const next = html.indexOf('<li class="es-course__row"', start + 10)
  return html.slice(start, next < 0 ? html.length : next)
}

const empty = view([])

describe('Course is one column of modules in course order', () => {
  test('one row for every module of the index, in the index\'s order, in an ordered list, and no grid of cards', () => {
    const rows = [...empty.matchAll(/<li class="es-course__row" data-module="([a-z0-9]+)"/g)].map((match) => match[1])
    expect(rows).toEqual(INDEX.modules.map((module) => module.id))
    expect(rows).toEqual(['tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone'])
    expect(empty).toContain('<ol class="es-course__rows">')
    expect(empty).not.toContain('es-sheet')
  })

  test('the page has one h1, a hidden h2 for the list and an h3 for each module', () => {
    expect([...empty.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))).toEqual([1, 2, ...INDEX.modules.map(() => 3)])
  })

  test('the css lays the rows in one column, with no grid of cards', async () => {
    const css = await Bun.file(`${import.meta.dir}/../../src/map/map.css`).text()
    expect(css).toContain('.es-course__rows')
    expect(css).not.toMatch(/repeat\(\s*(auto-fill|auto-fit|[2-9])/)
  })
})

describe('a row says what the module needs, in words', () => {
  test('a module worked in one lane says "browser only"; one worked in two says the hours of each, in order', () => {
    expect(textOf(rowOf(empty, 'tr2'))).toContain('10 h, browser only')
    expect(textOf(rowOf(empty, 'tr1'))).toContain('10 h: 7.5 h in the browser, then 2.5 h on a GPU')
    expect(textOf(rowOf(empty, 'tr0'))).toContain('7 h: 4 h in the browser, then 3 h on a laptop')
  })

  test('says what the module builds on: kernelspace lessons link out, modules of the course open', () => {
    const tr3 = rowOf(empty, 'tr3')
    expect(textOf(tr3)).toContain('Builds on kernelspace T0.L6')
    expect(tr3).toContain('href="https://kernelspace.naigap.com/lesson/t0.l6"')
    expect(tr3).toContain('rel="noreferrer noopener"')
    expect(tr3).toContain('href="/m/tr2"')
  })

  test('says what you will be able to do, from the module\'s first outcome, where the module is written', () => {
    const tr2 = MAP.modules.find((module) => module.id === 'tr2')
    expect(tr2?.outcome).toBeDefined()
    expect(textOf(rowOf(empty, 'tr2'))).toContain(`${COPY.outcome} `)
  })
})

describe('a row says where the learner stands, in words', () => {
  test('with an empty ledger: nothing done, nothing passed', () => {
    const tr2 = textOf(rowOf(empty, 'tr2'))
    expect(tr2).toContain(`0 of ${MAP.lessons.filter((lesson) => lesson.module === 'tr2').length} lesson done`)
    expect(tr2).toContain(`0 of ${MAP.modules.find((module) => module.id === 'tr2')?.kcs.length} skills passed`)
  })

  test('a review that passed counts as a skill passed', () => {
    const html = view([made('review', 'review:tr2.async-overlap')])
    expect(textOf(rowOf(html, 'tr2'))).toContain('1 of 11 skills passed')
  })

  test('before the ledger is read the row gives the totals and does not say the learner has done nothing', () => {
    const waiting = view(null)
    expect(textOf(rowOf(waiting, 'tr2'))).toContain('11 skills')
    expect(waiting).not.toContain('0 of 11')
    expect(waiting).not.toContain('data-open')
    expect(waiting).not.toContain('data-at="now"')
    expect(textOf(waiting)).toContain(COPY.way.reading)
    expect(waiting).not.toContain('data-way="continue"')
  })
})

describe('the module the way on points into is open', () => {
  test('lists its lessons, with the next one under the marker, and no other row is open', () => {
    const open = [...empty.matchAll(/<li class="es-course__row" data-module="([a-z0-9]+)"[^>]*data-open="true"/g)].map((match) => match[1])
    expect(open).toEqual(['tr2'])
    const tr2 = rowOf(empty, 'tr2')
    const lessons = MAP.lessons.filter((lesson) => lesson.module === 'tr2')
    expect(tr2.match(/<li class="es-course__lesson"/g)).toHaveLength(lessons.length)
    for (const lesson of lessons) expect(tr2).toContain(`href="${lesson.route}"`)
    expect(tr2.match(/data-at="now"/g)).toHaveLength(lessons.length > 0 ? 2 : 1)
    expect(textOf(tr2)).toContain(`${COPY.next}`)
    expect(empty.match(/data-at="now"/g)).toHaveLength(2)
  })

  test('the marker moves with the way on: an answer that points into TR5a opens TR5a', () => {
    const step = { ...nextStep([], MAP.lessons, null), module: 'tr5a', lesson: 'tr5a.l1' }
    const html = view([], { step })
    expect([...html.matchAll(/<li class="es-course__row" data-module="([a-z0-9]+)"[^>]*data-open="true"/g)].map((match) => match[1])).toEqual(['tr5a'])
  })

  test('a lesson says its minutes, what it needs and its state in words', () => {
    const lesson = MAP.lessons.find((candidate) => candidate.module === 'tr2')
    expect(lesson).toBeDefined()
    const tr2 = textOf(rowOf(empty, 'tr2'))
    expect(tr2).toContain(`${lesson?.minutes} min`)
    expect(tr2).toContain('not started')
  })
})

describe('an unpublished module', () => {
  test('says "Not published yet" and is not a link', () => {
    const planned = INDEX.modules.filter((module) => module.status === 'planned')
    expect(planned.length).toBeGreaterThan(0)
    for (const module of planned) {
      const row = rowOf(empty, module.id)
      expect(textOf(row)).toContain('Not published yet')
      expect(row).not.toContain(`href="${module.route}"`)
      expect(attribute(opening(row, 'li')[0], 'data-status')).toBe('planned')
    }
  })

  test('a published module is a link to its module, with no lock on any other', () => {
    for (const module of INDEX.modules.filter((candidate) => candidate.status !== 'planned')) expect(rowOf(empty, module.id)).toContain(`href="${module.route}"`)
  })
})

describe('the way on opens the page', () => {
  test('Continue is nextStep\'s link and words, in the one amber control, with the sentence beside it', () => {
    const events = [made('predict', 'predict:tr2.l0#tr2.l0.p1')]
    const step = nextStep(events, MAP.lessons, null)
    expect(step.word).toBe('Continue')
    const html = view(events)
    const way = /<div class="es-course__way">[\s\S]*?<\/a><\/div>/.exec(html)?.[0] ?? ''
    expect(way).toContain(`href="${step.href}"`)
    expect(way).toContain('data-emphasis="primary"')
    expect(textOf(way)).toContain(step.label)
    expect(textOf(way)).toContain(`Next: ${step.reason}`)
    expect(html.indexOf('es-course__way')).toBeLessThan(html.indexOf('es-course__rows'))
  })

  test('a first visit says so and names the lesson with its minutes and what it needs', () => {
    expect(textOf(empty)).toContain('You have not started. Next: TR2 lesson 1, A sample lesson that uses every block (45 min, browser and GPU).')
  })

  test('says how many lessons were skipped, and how many reviews are due, in quiet lines', () => {
    const step = { ...nextStep([], MAP.lessons, null), skipped: 2 }
    const html = view([], { step, due: { count: 3, minutes: 4 } })
    expect(textOf(html)).toContain('3 reviews due, about 4 min')
    expect(textOf(html)).toContain('2 earlier lessons not finished')
    expect(html).toContain('href="/today"')
    expect(textOf(view([]))).not.toContain('reviews due')
    expect(textOf(view([]))).not.toContain('earlier lessons')
  })
})

describe('the notes under the way on', () => {
  test('the hours of the published modules by lane, the hours the course plans, the two legends and the sentence that nothing is locked', () => {
    const text = textOf(empty).replace(/ ([,.;])/g, '$1')
    // Derived from the rows the page lists: a module that publishes moves the figures and not this test.
    const split = hoursSplit(INDEX.modules)
    const lanes = LANE_ORDER.filter((lane) => split.lanes[lane] > 0).map((lane) => `${formatHours(split.lanes[lane])} ${{ B: 'in the browser', L: 'on a laptop', F: 'on a GPU' }[lane]}`)
    expect(text).toContain(`${formatHours(split.published)} hours published: ${lanes.join(', ')}.`)
    expect(split.published).toBe(INDEX.modules.filter((module) => module.published).reduce((sum, module) => sum + module.hours, 0))
    expect(split.planned).toBe(INDEX.totalHours)
    if (split.planned > split.published) expect(text).toContain(`${formatHours(split.planned)} hours planned in all.`)
    else expect(text).not.toContain('planned in all')
    expect(text).not.toContain('hours in all')
    expect(text).toContain('A lesson is not started, started or done, and done is its Test passed.')
    expect(text).toContain('Skills: tried is answered or played')
    expect(text).toContain('Nothing is locked. Prerequisites advise.')
    expect(text).toContain('Module hours are estimated and these totals are derived.')
  })

  test('no banned word or phrase appears on the page', () => {
    expect(findBanned(textOf(empty))).toEqual([])
    expect(findBanned(textOf(view([made('review', 'review:tr2.async-overlap')])))).toEqual([])
  })
})
