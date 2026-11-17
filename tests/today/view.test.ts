/*
 * W1-T05, R-T24: the page as markup (the server renderer; the browser walk is e2e/today.spec.ts): the set that waits and the strip it folds
 * to, the sheets that stand when nothing is passed or nothing is due or a review is done, the question being asked (which holds a seed and
 * no key), and the page before the ledger is open. Each is held to the rules of the brief (REDESIGN 3.10): one amber control that is the way
 * on, a number only through the readout with its tag, and no count of what is overdue.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { plain } from '@es/play/items'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { seedLabel } from '@/items/answer'
import { Component as TodayPage } from '@/pages/Today'
import type { Card } from '../../src/items/today/cards'
import { PAGE_LEAD } from '../../src/items/today/copy'
import { drawForKc } from '../../src/items/today/draw'
import { firstMemory } from '../../src/items/today/fsrs'
import { lineViews } from '../../src/items/today/plan'
import type { LineView, Result } from '../../src/items/today/plan'
import { PrepList, PrepStrip } from '../../src/items/today/PrepList'
import type { IdeaRow } from '../../src/items/today/PrepList'
import type { Line } from '../../src/items/today/session'
import { Aside, DoneTicket, EmptyTicket, LoadingTicket, RestTicket } from '../../src/items/today/Tickets'
import { TodayView } from '../../src/items/today/TodayView'
import Work from '../../src/items/today/Work'

const render = (element: ReactElement) => renderToString(h(StaticRouter, { location: '/today' }, element)).replaceAll('<!-- -->', '')
const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'
const DAY = '2026-11-04'
const BACKLOG = /overdue|behind|backlog|catch[- ]up|debt|streak|you have \d+/i

const lines: Line[] = [
  { kc: BUBBLE, family: 'tr2.bubble-width', title: 'Bubble width', level: 2 },
  { kc: OVERLAP, family: 'tr2.bubble-width', title: 'Bubble width', level: 2 },
]
const WAY = { href: '/m/tr1/l1-five-mechanisms', label: 'Start: TR1 lesson 1', word: 'Start' as const, minutes: 35 }
const rows = (views: readonly LineView[]): IdeaRow[] =>
  views.map((view, at) => ({ ...view, sentence: `You can say what idea ${at + 1} means.`, code: 'TR2', ...(view.state === 'done' ? {} : { seen: '2026-11-01' }) }))
const result = (line: Line, ok: boolean, back: string): Result => ({ line, ok, grade: ok ? 3 : 1, back, key: `k-${line.kc}` })

describe('the page before the ledger is open', () => {
  test('is the page\'s title and one ticket that is still printing, with nothing to start', () => {
    const html = render(h(TodayPage))
    expect(html).toContain('data-page="today"')
    expect(html).toContain('<h1 class="es-page__title">Review</h1>')
    expect(html).toContain(PAGE_LEAD)
    expect(html).toContain('data-phase="loading"')
    expect(html).toContain('Reading your ledger')
    expect(html).not.toContain('Start review')
    expect(html).not.toContain('es-prep__line')
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/ticket|printer|kitchen/i)
  })

  test('the view alone is the loading ticket too', () => {
    expect(render(h(TodayView))).toContain('aria-busy="true"')
  })
})

describe('the set that waits', () => {
  const views: LineView[] = lineViews(lines, [], null)
  const html = render(h(PrepList, { mode: 'due', rows: rows(views), seconds: 100, phase: 'list', start: h('button', { type: 'button' }, 'Start review') }))

  test('is headed by how many questions and about how long, through the readout, with the amber button in the head', () => {
    expect(html).toContain('aria-label="Review set: 2 questions"')
    expect(html).toMatch(/<data class="es-readout__value" value="2">2<\/data>.*?data-tag="derived">derived/)
    expect(html).toMatch(/about\s*<span class="es-readout[^"]*"[^>]*>.*?<data class="es-readout__value" value="2">2<\/data>.*?data-tag="estimated">estimated/)
    expect(html).toContain('questions today')
    expect(html.indexOf('Start review')).toBeLessThan(html.indexOf('es-prep__lines'))
  })

  test('has a row for each idea: its sentence, its module and when it was last seen, and no id of the idea', () => {
    expect((html.match(/class="es-prep__line"/g) ?? []).length).toBe(2)
    expect(html).toContain('You can say what idea 1 means.')
    expect(html).toContain('TR2')
    expect(html).toContain('last seen Sun 1 Nov')
    expect(html).toContain('aria-label="Review set, 2 ideas"')
    for (const kc of [BUBBLE, OVERLAP]) expect(html).not.toContain(kc)
    expect(html).not.toContain('es-prep__state')
  })

  test('is the sheet the next decision acts on while it waits, and the lamp is the sheet\'s own', () => {
    expect(html).toContain('data-lamp="true"')
    const folded = render(h(PrepList, { mode: 'due', rows: rows(views), seconds: 100, phase: 'work' }))
    expect(folded).not.toContain('data-lamp')
    expect(folded).not.toContain('Start review')
  })

  test('says the state of a row in a word while the review goes on, and a box that is a drawing is hidden from assistive tech', () => {
    expect(html).toContain('<span class="es-prep__box" aria-hidden="true"></span>')
    const going = render(h(PrepList, { mode: 'due', rows: rows(lineViews(lines, [], 0)), seconds: 100, phase: 'work' }))
    expect(going).toContain('aria-current="step"')
    expect(going).toContain('data-line="now"')
    expect(going).toContain('data-icon="arrow"')
    expect(going).toContain('>now<')
    expect(going).toContain('>next<')
    expect(going).toContain('<span class="sr-only">now</span>')
    expect(going).toContain('The questions in this review')
  })

  test('prints a done row with a drawn tick and the day it comes back, and a miss with a strike in the second ink', () => {
    const done = render(h(PrepList, { mode: 'due', rows: rows(lineViews(lines, [result(lines[0], true, '2026-11-09'), result(lines[1], false, '2026-11-05')], null)), seconds: 100, phase: 'work' }))
    expect(done).toContain('data-icon="check"')
    expect(done).toContain('data-icon="strike"')
    expect(done).toContain('back Mon 9 Nov')
    expect(done).toContain('back Thu 5 Nov')
    expect(done).toContain('>right<')
    expect(done).toContain('>missed<')
    expect(done).toContain('data-tone="ink-2"')
    expect(done).toContain('done, right')
    expect(done).toContain('done, missed')
  })

  test('a welcome-back carries its note, a review ahead its own title and note, and a plain list neither', () => {
    const welcome = render(h(PrepList, { mode: 'welcome-back', rows: rows(views), seconds: 100, phase: 'list' }))
    expect(welcome).toContain('Welcome back.')
    expect(welcome).toContain('data-mode="welcome-back"')
    const ahead = render(h(PrepList, { mode: 'ahead', rows: rows(views), seconds: 100, phase: 'list' }))
    expect(ahead).toContain('aria-label="Review ahead: 2 questions"')
    expect(ahead).toContain('None of these is due yet.')
    expect(html).not.toContain('es-prep__note')
  })

  test('never says what is overdue', () => {
    for (const mode of ['due', 'welcome-back', 'ahead'] as const) {
      const text = render(h(PrepList, { mode, rows: rows(views), seconds: 100, phase: 'list' }))
      expect(text).not.toMatch(BACKLOG)
    }
  })
})

describe('the strip', () => {
  const html = render(h(PrepStrip, { marks: [{ state: 'done', ok: true }, { state: 'done', ok: false }, { state: 'now' }, { state: 'waiting' }], secondsLeft: 100 }))

  test('is a row of boxes that a reader of the page does not need, and the minutes left in the readout with their tag', () => {
    expect(html).toContain('<ol class="es-prep__boxes" aria-hidden="true">')
    expect((html.match(/<li /g) ?? []).length).toBe(4)
    expect(html).toContain('min left')
    expect(html).toContain('data-tag="estimated"')
  })

  test('takes a tick for a right answer and a strike for a miss, and not a colour of the code', () => {
    expect(html).toContain('data-icon="check"')
    expect(html).toContain('data-icon="strike"')
    expect(html).toContain('data-line="now"')
    expect(html).not.toMatch(/--es-(?:cat|lane|memory|probability)/)
  })
})

describe('the sheets that stand when there is nothing to start', () => {
  test('nothing passed: says what passes something and offers the way on, Continue, from nextStep; nothing to start', () => {
    const html = render(h(EmptyTicket, { unserved: false, way: WAY }))
    expect(html).toContain('Nothing to review yet')
    expect(html).toContain("Review brings back what you have passed: answer a lesson&#x27;s questions or pass a graded level.")
    expect(html).toContain(`href="${WAY.href}"`)
    expect(html).toContain(WAY.label)
    expect(html).toContain('data-emphasis="primary"')
    expect(html).toContain('href="/map"')
    expect(html).not.toContain('es-primary-button')
    expect(html).not.toMatch(BACKLOG)
  })

  test('passed, and no question built for it yet: says so, and that the page picks them up once their modules publish them', () => {
    const html = render(h(EmptyTicket, { unserved: true, way: WAY }))
    expect(html).toContain('No review questions yet for what you have passed')
    expect(html).toContain('once their modules publish them')
  })

  test('nothing due: names the next review, the amber Continue, and a quiet Review ahead when there is one', () => {
    const html = render(h(RestTicket, { next: '2026-11-06', ahead: true, onAhead: () => undefined, way: WAY }))
    expect(html).toContain('Nothing is due today.')
    expect(html).toContain('Your next review is Fri 6 Nov.')
    expect(html).toContain(WAY.label)
    expect(html).toContain('Review ahead')
    expect((html.match(/data-emphasis="primary"/g) ?? []).length).toBe(1)
    expect(html).not.toContain('es-primary-button')
    expect(html).not.toContain('data-lamp')
    expect(html).not.toMatch(BACKLOG)
    const bare = render(h(RestTicket, { next: null, ahead: false, onAhead: () => undefined, way: WAY }))
    expect(bare).not.toContain('Review ahead')
    expect(bare).not.toContain('Your next review')
  })

  test('with no way on of its own (every lesson done and Review the way), a review ahead is the one amber button', () => {
    const html = render(h(RestTicket, { next: null, ahead: true, onAhead: () => undefined, way: null }))
    expect(html).toContain('es-primary-button')
    expect(html).not.toContain('es-board__next')
  })

  test('the loading sheet says what it is waiting for', () => {
    const html = render(h(LoadingTicket))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Reading your ledger')
  })
})

describe('the sheet that closes a review', () => {
  const done = rows(lineViews(lines, [result(lines[0], true, '2026-11-09'), result(lines[1], false, '2026-11-05')], null))
  const html = render(h(DoneTicket, { rows: done, right: 1, total: 2, next: '2026-11-05', more: { label: 'Review ahead', run: () => undefined }, ahead: false, way: WAY }))

  test('opens on the tally, in the heading that takes focus, then the next review, then the way on, and lists what became of each idea', () => {
    expect(html).toContain('1 of 2 right')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('Next review: Thu 5 Nov.')
    expect(html).toContain('back Mon 9 Nov')
    expect(html).toContain('back Thu 5 Nov')
    expect(html.indexOf('1 of 2 right')).toBeLessThan(html.indexOf('Next review'))
    expect(html.indexOf('Next review')).toBeLessThan(html.indexOf(WAY.label))
    expect(html.indexOf(WAY.label)).toBeLessThan(html.indexOf('es-prep__lines'))
  })

  test('offers Continue as the one amber control and Review ahead as a quiet button, and is not under the lamp: it is history', () => {
    expect((html.match(/data-emphasis="primary"/g) ?? []).length).toBe(1)
    expect(html).toContain('Review ahead')
    expect(html).not.toContain('es-primary-button')
    expect(html).not.toContain('data-lamp')
    const last = render(h(DoneTicket, { rows: done, right: 2, total: 2, next: null, more: null, ahead: false, way: WAY }))
    expect(last).not.toContain('Review ahead')
    expect(last).not.toContain('Next review')
  })

  test('with more due and Review the way on, the amber control is Review another set', () => {
    const more = render(h(DoneTicket, { rows: done, right: 1, total: 2, next: null, more: { label: 'Review another set', run: () => undefined }, ahead: false, way: null }))
    expect(more).toContain('es-primary-button')
    expect(more).toContain('Review another set')
    expect(more).not.toContain('es-board__next')
  })

  test('says it was a review ahead when it was, and never what is overdue', () => {
    const ahead = render(h(DoneTicket, { rows: done, right: 2, total: 2, next: null, more: null, ahead: true, way: WAY }))
    expect(ahead).toContain('None of these is due yet.')
    expect(html).not.toMatch(BACKLOG)
  })
})

describe('the quiet column', () => {
  test('says the next review after this one, and how many ideas are kept through the readout with what kept means', () => {
    const html = render(h(Aside, { kept: 4, next: '2026-11-20' }))
    expect(html).toContain('Next after this: Fri 20 Nov')
    expect(html).toContain('Kept')
    expect(html).toMatch(/<data class="es-readout__value" value="4">4<\/data>.*?data-tag="measured">measured/)
    expect(html).toContain('Ideas you have passed')
    expect(render(h(Aside, { kept: 4, next: null }))).not.toContain('Next after this')
    expect(html).not.toMatch(BACKLOG)
  })
})

describe('the question being asked', () => {
  const card: Card = { kc: BUBBLE, earnedDay: '2026-10-30', memory: firstMemory(3), lastDay: '2026-10-30', dueDay: '2026-11-01', reps: 1, lapses: 0 }
  // The page loads the family's code when the ticket comes up (src/items/families.ts, D-059) and gives it to the ticket.
  const props = { line: lines[0], index: 0, total: 2, entropy: 4242, met: new Set<string>(), card, today: DAY, last: false, onChecked: () => undefined, onNext: () => undefined, gen: bubbleWidth }
  const html = render(h(Work, props))
  const drawn = drawForKc(bubbleWidth, BUBBLE, 2, 4242)

  test('holds the seed it was drawn from, in the foot line and as data, and the question with its numbers, on the sheet the next decision acts on', () => {
    expect(html).toContain('data-block="item"')
    expect(html).toContain('data-phase="asking"')
    expect(html).toContain(`data-seed="${drawn.item.seed}"`)
    expect(html).toContain(`data-kc="${BUBBLE}"`)
    expect(html).toContain(`Seed ${seedLabel(drawn.item.seed)}`)
    expect(html).toContain('new numbers')
    expect(html).toContain('data-lamp="true"')
    expect(html).toContain('Question 1 of 2')
    expect(html).toContain(plain(drawn.item.stem).replace(/'/g, '&#x27;'))
    for (const given of drawn.item.givens) expect(html).toContain(given.label)
  })

  test('is headed by its place in the set, and prints no id of the idea', () => {
    expect(html).toContain('<h2 class="es-item__count"')
    expect(html).toContain('Question 1 of 2')
    expect(html).not.toContain('Review set')
    expect(html.replace(/data-kc="[^"]*"/, '')).not.toContain(BUBBLE)
  })

  test('takes the answer in a field or as radios, three buttons for how sure, and Check answer', () => {
    if (drawn.item.answer.kind === 'numeric') expect(html).toContain('class="es-field__input"')
    else expect(html).toContain('type="radio"')
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3)
    expect(html).toContain('Check answer')
    expect(html).toContain('How sure are you?')
  })

  test('holds no key, no solution, no reveal and no return day before the ticket is checked', () => {
    for (const entropy of [1, 77, 4242, 31337, 99999]) {
      const page = render(h(Work, { ...props, entropy }))
      const item = drawForKc(bubbleWidth, BUBBLE, 2, entropy).item
      for (const step of bubbleWidth.solution(item)) {
        const sentence = plain(step.text.filter((part) => part.t === 'text'))
        for (const piece of sentence.split(/(?<=\.)\s/).filter((text) => text.length > 30)) expect(page).not.toContain(piece.replace(/'/g, '&#x27;'))
      }
      if (item.answer.kind === 'choice') for (const option of item.answer.options) expect(page).not.toContain(plain(option.why).replace(/'/g, '&#x27;'))
      expect(page).not.toContain('data-ok')
      expect(page).not.toContain('es-item__reveal')
      expect(page).not.toContain('es-prep__back')
      expect(page).not.toContain('"truth"')
    }
  })

  test('says it is the last question by what its button will do once it is checked, and prints nothing of the list around it', () => {
    expect(html).not.toContain('es-prep__line')
    expect(html).not.toContain('Finish the review')
  })
})
