/*
 * The renderer's decisions (src/content/render/model.ts, W0-T09), as pure functions: where a prose block breaks into tickets,
 * which id a heading gets, which claims a page cites, where a kernelspace ref goes, which unit a readout prints, and the
 * days a claim counts in. The components only draw these answers, and tests/content/render.test.ts draws them.
 */
import { describe, expect, test } from 'bun:test'
import type { CompiledBlock, IndexLesson, IndexModule, ProseFlow, ProseInline } from '@es/schema'
import {
  citedClaimIds,
  decimals,
  headingIds,
  kernelspaceLabel,
  kernelspaceUrl,
  KERNELSPACE_ORIGIN,
  laneName,
  neighbours,
  plainText,
  readoutUnit,
  sections,
  staleSince,
  todayIso,
} from '@/content/render/model'

const text = (value: string): ProseInline => ({ type: 'text', text: value })
const code = (value: string): ProseInline => ({ type: 'code', text: value })
const claim = (id: string): ProseInline => ({ type: 'claim', id })
const heading = (depth: 2 | 3 | 4, ...children: ProseInline[]): ProseFlow => ({ type: 'heading', depth, children })
const paragraph = (...children: ProseInline[]): ProseFlow => ({ type: 'paragraph', children })
const prose = (...body: ProseFlow[]): CompiledBlock => ({ type: 'prose', body })

describe('sections: where a prose block breaks into tickets', () => {
  test('before each level-2 heading, which becomes the title of its ticket', () => {
    const intro = paragraph(text('Intro.'))
    const first = heading(2, text('One'))
    const body = paragraph(text('Body.'))
    const sub = heading(3, text('Sub'))
    const second = heading(2, text('Two'))
    const found = sections([intro, first, body, sub, paragraph(text('More.')), second, paragraph(text('End.'))])
    expect(found.map((section) => section.heading)).toEqual([null, first, second])
    expect(found[0].flows).toEqual([intro])
    // A deeper heading stays inside its ticket, so the page's outline goes h1, h2, h3 and never skips.
    expect(found[1].flows).toContain(sub)
    expect(found[2].flows.length).toBe(1)
  })

  test('prose that opens with a heading has no untitled first ticket, and a heading with nothing under it still gets one', () => {
    const a = heading(2, text('A'))
    const b = heading(2, text('B'))
    const found = sections([a, b, paragraph(text('x'))])
    expect(found.map((section) => section.heading)).toEqual([a, b])
    expect(found[0].flows).toEqual([])
  })

  test('no prose is no ticket', () => {
    expect(sections([])).toEqual([])
  })
})

describe('headings: words and ids', () => {
  test('plainText is the words of a line, without its marks', () => {
    const line: ProseInline[] = [
      text('Why '),
      code('step()'),
      text(' is '),
      { type: 'em', children: [text('slow')] },
      text(' '),
      { type: 'tag', tag: 'estimated' },
      { type: 'link', href: '/map', children: [text('here')] },
      claim('a.b'),
      { type: 'ks', ref: 'ks:T5.L7' },
    ]
    expect(plainText(line)).toBe('Why step() is slow herea.bks:T5.L7')
  })

  test('an id is the heading\'s words, lower case and joined by hyphens', () => {
    const one = heading(2, text('Why it matters'))
    const two = heading(3, text('What '), code('async'), text(' changes?'))
    const ids = headingIds([prose(one, paragraph(text('x')), two)])
    expect(ids.get(one)).toBe('why-it-matters')
    expect(ids.get(two)).toBe('what-async-changes')
  })

  test('the same words twice, in one block or across two, get -2 and -3, so ids stay unique on a page', () => {
    const a = heading(2, text('Why'))
    const b = heading(3, text('Why'))
    const c = heading(2, text('Why'))
    const ids = headingIds([prose(a, b), { type: 'card', kind: 'warning', body: 'x' }, prose(c)])
    expect([ids.get(a), ids.get(b), ids.get(c)]).toEqual(['why', 'why-2', 'why-3'])
    expect(new Set(ids.values()).size).toBe(3)
  })

  test('a heading with no words that an id can be made of still gets one', () => {
    const odd = heading(2, text('???'))
    expect(headingIds([prose(odd)]).get(odd)).toBe('section')
  })
})

describe('citedClaimIds', () => {
  test('finds a claim wherever a line of prose can hold one', () => {
    const blocks: CompiledBlock[] = [
      prose(
        paragraph(text('a '), claim('x.one')),
        heading(3, claim('x.two')),
        paragraph({ type: 'em', children: [{ type: 'strong', children: [claim('x.three')] }] }),
        paragraph({ type: 'link', href: '/map', children: [claim('x.four')] }),
        { type: 'list', ordered: false, items: [[paragraph(claim('x.five'))], [{ type: 'list', ordered: true, items: [[paragraph(claim('x.six'))]] }]] },
        { type: 'table', align: [null], head: [[claim('x.seven')]], rows: [[[claim('x.eight')]]] },
        { type: 'code', text: '{{claim:x.never}}' },
      ),
      { type: 'card', kind: 'warning', body: 'No claims in a card.' },
    ]
    expect([...citedClaimIds(blocks)].sort()).toEqual(['x.eight', 'x.five', 'x.four', 'x.one', 'x.seven', 'x.six', 'x.three', 'x.two'])
  })

  test('a page that cites none cites none', () => {
    expect(citedClaimIds([prose(paragraph(text('Plain.')))]).size).toBe(0)
    expect(citedClaimIds([]).size).toBe(0)
  })
})

describe('kernelspace refs', () => {
  test('a lesson goes to its page on kernelspace\'s site, with the id in the lower case that site uses', () => {
    expect(kernelspaceUrl('ks:T5.L7')).toBe(`${KERNELSPACE_ORIGIN}/lesson/t5.l7`)
    expect(kernelspaceUrl('ks:T0.L6')).toBe(`${KERNELSPACE_ORIGIN}/lesson/t0.l6`)
    expect(kernelspaceUrl('ks:R.L3')).toBe(`${KERNELSPACE_ORIGIN}/lesson/r.l3`)
    expect(KERNELSPACE_ORIGIN.startsWith('https://')).toBe(true)
  })

  test('a KC has no page of its own there, so it is named and never linked', () => {
    expect(kernelspaceUrl('ks:t5.kv-capacity')).toBeNull()
    expect(kernelspaceLabel('ks:T5.L7')).toBe('kernelspace T5.L7')
    expect(kernelspaceLabel('ks:t5.kv-capacity')).toBe('kernelspace t5.kv-capacity')
  })
})

describe('numbers', () => {
  test('a claim\'s ASCII unit prints as the readout prints it, and a unit the readout lacks is left to the claim', () => {
    expect(readoutUnit('us')).toBe('µs')
    expect(readoutUnit('ms')).toBe('ms')
    expect(readoutUnit('tokens/s')).toBe('tok/s')
    expect(readoutUnit('GB')).toBe('GB')
    expect(readoutUnit('GB/s')).toBeUndefined()
    expect(readoutUnit(undefined)).toBeUndefined()
  })

  test('ticks are never mapped: a readout prints ticks only when they are synthetic, and a claim\'s unit does not say so', () => {
    expect(readoutUnit('ticks')).toBeUndefined()
  })

  test('a unit that is a property of every object is not a unit', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(readoutUnit(name)).toBeUndefined()
  })

  test.each([
    [300, 0],
    [2.1, 1],
    [0.05, 2],
    [12345.678, 3],
    [1e-7, 6],
    [-4.25, 2],
  ])('%p is written with %p digits after the point', (value, digits) => {
    expect(decimals(value)).toBe(digits)
  })
})

describe('days', () => {
  test('a claim is stale from the day after its last good day, and "stale since" is that last good day', () => {
    const claim = { verifiedAt: '2026-08-01', ttlDays: 90 }
    // 2026-08-01 plus 90 days is 2026-10-30.
    expect(staleSince(claim, '2026-08-01')).toBeNull()
    expect(staleSince(claim, '2026-10-30')).toBeNull()
    expect(staleSince(claim, '2026-10-31')).toBe('2026-10-30')
    expect(staleSince(claim, '2027-06-01')).toBe('2026-10-30')
  })

  test('the days are calendar days: month ends, years and a leap day', () => {
    expect(staleSince({ verifiedAt: '2028-02-28', ttlDays: 1 }, '2028-03-01')).toBe('2028-02-29')
    expect(staleSince({ verifiedAt: '2026-12-31', ttlDays: 1 }, '2027-01-03')).toBe('2027-01-01')
    expect(staleSince({ verifiedAt: '2026-11-04', ttlDays: 365 }, '2027-11-04')).toBeNull()
    expect(staleSince({ verifiedAt: '2026-11-04', ttlDays: 365 }, '2027-11-05')).toBe('2027-11-04')
  })

  test('today is the UTC date, the grain a claim is counted in', () => {
    expect(todayIso(new Date('2026-11-04T23:59:59Z'))).toBe('2026-11-04')
    expect(todayIso(new Date('2026-11-05T00:00:00Z'))).toBe('2026-11-05')
  })
})

describe('lessons and lanes', () => {
  const lesson = (n: number): IndexLesson => ({ id: `tr2.l${n}`, slug: `l${n}-x`, title: `Lesson ${n}`, route: `/m/tr2/l${n}-x`, minutes: 10, status: 'draft' })
  const module: IndexModule = {
    id: 'tr2',
    title: 'The step loop',
    route: '/m/tr2',
    status: 'draft',
    hours: 10,
    hours_by_lane: { B: 10 },
    lessons: [lesson(0), lesson(1), lesson(2)],
  }

  test('the lessons before and after one, in the module\'s order, and none past either end', () => {
    expect(neighbours(module, 'l1-x')).toEqual({ previous: lesson(0), next: lesson(2) })
    expect(neighbours(module, 'l0-x')).toEqual({ previous: null, next: lesson(1) })
    expect(neighbours(module, 'l2-x')).toEqual({ previous: lesson(1), next: null })
  })

  test('a lesson the index does not list, or no index at all, has no neighbours', () => {
    expect(neighbours(module, 'l9-x')).toEqual({ previous: null, next: null })
    expect(neighbours(undefined, 'l1-x')).toEqual({ previous: null, next: null })
  })

  test('the three lanes are named in words', () => {
    expect([laneName('B'), laneName('L'), laneName('F')]).toEqual(['browser', 'laptop', 'GPU'])
    expect(laneName('Z')).toBe('Z')
    expect(laneName('constructor')).toBe('constructor')
  })
})
