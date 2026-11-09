/*
 * W1-T05: the page as markup (the server renderer; the browser walk is e2e/today.spec.ts): the prep list and the strip it folds to, the
 * tickets that stand when nothing is earned or nothing is due or a prep is done, the ticket being prepped (which holds a seed and no key),
 * and the page before the ledger is open. Each is held to the rules of the brief: amber on the ticket the next decision acts on, a number
 * only through the readout with its tag, and no count of what is overdue.
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
import type { Line } from '../../src/items/today/session'
import { BlankTicket, DoneTicket, EmptyTicket, LoadingTicket, RestTicket } from '../../src/items/today/Tickets'
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
const result = (line: Line, ok: boolean, back: string): Result => ({ line, ok, grade: ok ? 3 : 1, back, key: `k-${line.kc}` })

describe('the page before the ledger is open', () => {
  test('is the page\'s title and one ticket that is still printing, with nothing to start', () => {
    const html = render(h(TodayPage))
    expect(html).toContain('data-page="today"')
    expect(html).toContain('<h1 class="es-page__title">Today</h1>')
    expect(html).toContain(PAGE_LEAD)
    expect(html).toContain('data-phase="loading"')
    expect(html).toContain('Reading your ledger')
    expect(html).not.toContain('Start the prep')
    expect(html).not.toContain('es-prep__line')
  })

  test('the view alone is the loading ticket too', () => {
    expect(render(h(TodayView))).toContain('aria-busy="true"')
  })
})

describe('the prep list', () => {
  const views: LineView[] = lineViews(lines, [], null)
  const html = render(h(PrepList, { day: DAY, mode: 'due', lines: views, seconds: 100, phase: 'list', lamp: true, stub: h('button', { type: 'button' }, 'Start the prep') }))

  test('is a ticket with a stamped title, its day on the head line, and a line for each idea with its id on tape', () => {
    expect(html).toContain('<h2 class="es-ticket__title">Prep list</h2>')
    expect(html).toContain('Wed 4 Nov')
    expect((html.match(/class="es-prep__line"/g) ?? []).length).toBe(2)
    for (const kc of [BUBBLE, OVERLAP]) expect(html).toContain(kc)
    expect(html).toContain('Bubble width')
    expect(html).toContain('aria-label="Prep list, 2 ideas"')
  })

  test('says about how long it takes through the readout, tagged estimated, and that nothing is timed', () => {
    expect(html).toContain('class="es-ticket__foot"')
    expect(html).toMatch(/about\s*<span class="es-readout"[^>]*>.*?<data class="es-readout__value" value="2">2<\/data>.*?data-tag="estimated">estimated/)
    expect(html).toContain('min')
    expect(html).toContain('nothing is timed')
  })

  test('is under the heat lamp until the prep starts, and the lamp is the ticket\'s own', () => {
    expect(html).toContain('data-lamp="true"')
    const folded = render(h(PrepList, { day: DAY, mode: 'due', lines: views, seconds: 100, phase: 'work' }))
    expect(folded).not.toContain('data-lamp')
    expect(folded).not.toContain('Start the prep')
  })

  test('draws a waiting line as an empty box, and says in words that it is next; the box is a drawing and is hidden from assistive tech', () => {
    expect(html).toContain('data-line="waiting"')
    expect(html).toContain('<span class="es-prep__box" aria-hidden="true"></span>')
    expect(html).toContain('<span class="sr-only">next</span>')
  })

  test('marks the line being prepped as the current step, with an arrow and no colour of the code', () => {
    const going = render(h(PrepList, { day: DAY, mode: 'due', lines: lineViews(lines, [], 0), seconds: 100, phase: 'work' }))
    expect(going).toContain('aria-current="step"')
    expect(going).toContain('data-line="now"')
    expect(going).toContain('data-icon="arrow"')
    expect(going).toContain('<span class="sr-only">now</span>')
  })

  test('prints a done line with a drawn tick and the day it comes back, and a miss with a strike in the second ink', () => {
    const done = render(h(PrepList, { day: DAY, mode: 'due', lines: lineViews(lines, [result(lines[0], true, '2026-11-09'), result(lines[1], false, '2026-11-05')], null), seconds: 100, phase: 'work' }))
    expect(done).toContain('data-icon="check"')
    expect(done).toContain('data-icon="strike"')
    expect(done).toContain('back Mon 9 Nov')
    expect(done).toContain('back Thu 5 Nov')
    expect(done).toContain('data-ok="true"')
    expect(done).toContain('data-ok="false"')
    expect(done).toContain('data-tone="ink-2"')
    expect(done).toContain('done, right')
    expect(done).toContain('done, missed')
  })

  test('a welcome-back carries its note, a review ahead its own title and note, and a plain list neither', () => {
    const welcome = render(h(PrepList, { day: DAY, mode: 'welcome-back', lines: views, seconds: 100, phase: 'list' }))
    expect(welcome).toContain('Welcome back.')
    expect(welcome).toContain('data-mode="welcome-back"')
    const ahead = render(h(PrepList, { day: DAY, mode: 'ahead', lines: views, seconds: 100, phase: 'list' }))
    expect(ahead).toContain('<h2 class="es-ticket__title">Review ahead</h2>')
    expect(ahead).toContain('None of these is due yet.')
    expect(html).not.toContain('es-prep__note')
  })

  test('never says what is overdue', () => {
    for (const mode of ['due', 'welcome-back', 'ahead'] as const) {
      const text = render(h(PrepList, { day: DAY, mode, lines: views, seconds: 100, phase: 'list' }))
      expect(text).not.toMatch(BACKLOG)
    }
  })
})

describe('the strip', () => {
  const html = render(h(PrepStrip, { marks: [{ state: 'done', ok: true }, { state: 'done', ok: false }, { state: 'now' }, { state: 'waiting' }], secondsLeft: 100 }))

  test('is a row of boxes that a reader of the page does not need, and the minutes left in the dots with their tag', () => {
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

describe('the tickets that stand when there is nothing to start', () => {
  test('nothing earned: says what earns something and links the way in; nothing to start', () => {
    const html = render(h(EmptyTicket, { day: DAY, unserved: false }))
    expect(html).toContain('Nothing to prep yet')
    expect(html).toContain('href="/m/tr2"')
    expect(html).toContain('href="/map"')
    expect(html).not.toContain('es-stub')
    expect(html).not.toMatch(BACKLOG)
  })

  test('earned, and no ticket built for it yet: says so, and that they arrive with the modules', () => {
    const html = render(h(EmptyTicket, { day: DAY, unserved: true }))
    expect(html).toContain('No tickets yet for what you have earned')
    expect(html).toContain('arrive with their modules')
  })

  test('nothing due: names the next prep, offers a review ahead when there is one, and holds the lamp back', () => {
    const html = render(h(RestTicket, { day: DAY, next: '2026-11-06', ahead: true, onAhead: () => undefined }))
    expect(html).toContain('Nothing is due today')
    expect(html).toContain('Your next prep is Fri 6 Nov.')
    expect(html).toContain('Review ahead')
    expect(html).not.toContain('data-lamp')
    expect(html).not.toMatch(BACKLOG)
    const bare = render(h(RestTicket, { day: DAY, next: null, ahead: false, onAhead: () => undefined }))
    expect(bare).not.toContain('Review ahead')
    expect(bare).not.toContain('Your next prep')
  })

  test('the blank ticket beside the list is for the eye only: hidden from assistive tech and holding the line that says what will print', () => {
    const html = render(h(BlankTicket))
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('The first ticket prints when you start the prep.')
  })

  test('the loading ticket says what it is waiting for', () => {
    const html = render(h(LoadingTicket))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Reading your ledger')
  })
})

describe('the ticket that closes a prep', () => {
  const done = lineViews(lines, [result(lines[0], true, '2026-11-09'), result(lines[1], false, '2026-11-05')], null)
  const html = render(h(DoneTicket, { day: DAY, lines: done, right: 1, total: 2, next: '2026-11-05', more: { label: 'Review ahead', run: () => undefined }, ahead: false }))

  test('opens on the tally, in the heading that takes focus, and lists what became of each idea with the day it comes back', () => {
    expect(html).toContain('Prep done')
    expect(html).toContain('1 of 2 right')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('back Mon 9 Nov')
    expect(html).toContain('back Thu 5 Nov')
    expect(html).toContain('Your next prep is Thu 5 Nov.')
  })

  test('prints the counts on the printer, each through the readout and tagged measured, with where they were measured', () => {
    expect(html).toContain('aria-label="The prep, printed"')
    expect(html).toMatch(/data-tag="measured"/)
    expect(html).toContain('this prep')
    expect(html).toContain('next prep')
    expect(html).toContain('Thu 5 Nov')
  })

  test('offers the way on as a stub, or none when there is nothing more to do, and is not under the lamp: it is history', () => {
    expect(html).toContain('Review ahead')
    expect(html).not.toContain('data-lamp')
    const last = render(h(DoneTicket, { day: DAY, lines: done, right: 2, total: 2, next: null, more: null, ahead: false }))
    expect(last).not.toContain('es-stub')
    expect(last).not.toContain('Your next prep')
    expect(last).not.toContain('next prep</dt>')
  })

  test('says it was a review ahead when it was, and never what is overdue', () => {
    const ahead = render(h(DoneTicket, { day: DAY, lines: done, right: 2, total: 2, next: null, more: null, ahead: true }))
    expect(ahead).toContain('None of these is due yet.')
    expect(html).not.toMatch(BACKLOG)
  })
})

describe('the ticket being prepped', () => {
  const card: Card = { kc: BUBBLE, earnedDay: '2026-10-30', memory: firstMemory(3), lastDay: '2026-10-30', dueDay: '2026-11-01', reps: 1, lapses: 0 }
  // The page loads the family's code when the ticket comes up (src/items/families.ts, D-059) and gives it to the ticket.
  const props = { line: lines[0], index: 0, total: 2, entropy: 4242, met: new Set<string>(), card, today: DAY, last: false, onChecked: () => undefined, onNext: () => undefined, gen: bubbleWidth }
  const html = render(h(Work, props))
  const drawn = drawForKc(bubbleWidth, BUBBLE, 2, 4242)

  test('holds the seed it was drawn from, in the foot line and as data, and the question with its numbers, under the lamp', () => {
    expect(html).toContain('data-block="item"')
    expect(html).toContain('data-phase="asking"')
    expect(html).toContain(`data-seed="${drawn.item.seed}"`)
    expect(html).toContain(`data-kc="${BUBBLE}"`)
    expect(html).toContain(`seed ${seedLabel(drawn.item.seed)}`)
    expect(html).toContain('unseen')
    expect(html).toContain('data-lamp="true"')
    expect(html).toContain('Item 1 of 2')
    expect(html).toContain(plain(drawn.item.stem).replace(/'/g, '&#x27;'))
    for (const given of drawn.item.givens) expect(html).toContain(given.label)
  })

  test('is titled by its family and the idea is on its head line, as an item served outside a lesson is', () => {
    expect(html).toContain('<h2 class="es-ticket__title">Bubble width</h2>')
    expect(html).toContain(BUBBLE)
    expect(html).toContain('Prep list')
  })

  test('takes the answer on a slip or on lines with a tick box, three plates for how sure, and a stub to check it', () => {
    if (drawn.item.answer.kind === 'numeric') expect(html).toContain('class="es-field__input"')
    else expect(html).toContain('type="radio"')
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3)
    expect(html).toContain('Check the ticket')
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

  test('says it is the last ticket by what its stub will do once it is checked, and prints nothing of the list around it', () => {
    expect(html).not.toContain('es-prep__line')
    expect(html).not.toContain('Finish the prep')
  })
})
