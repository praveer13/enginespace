/*
 * The front page's way on (src/front/way.ts; REDESIGN §2.4, §3.1): a returning learner is read from the pointer alone (`es:next`, D-066), the
 * intro opens on a first visit until its flag keeps the first level's parts, the course's hours come from the index, and the Start control
 * names the first lesson, its minutes and what it needs, and goes where `nextStep` sends an empty ledger.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ContentIndex } from '@es/schema'
import { ROSTER } from '@es/play/roster'
import { LOOP } from '@es/play/loop/entry'
import { FRAME } from '@/front/copy'
import { courseHours, FIRST_PARTS, introOpens, returningOf, startLabel } from '@/front/way'
import { START_POINTER } from '@/settings/store'

const root = path.resolve(import.meta.dirname, '../..')
const index = JSON.parse(readFileSync(path.join(root, 'src/content/generated/index.json'), 'utf8')) as ContentIndex

describe('a returning learner, from the pointer', () => {
  test('no pointer, or one that says Start, is a first visit', () => {
    expect(returningOf(null)).toBeNull()
    expect(returningOf(START_POINTER)).toBeNull()
  })

  test('a pointer that says Continue names the place and what comes next there, and keeps its own label and link', () => {
    const pointer = { href: '/m/tr2/l1-one-step-five-calls#read', label: 'Continue: TR2 lesson 1, read why', word: 'Continue' } as const
    expect(returningOf(pointer)).toEqual({
      pointer,
      href: '/m/tr2/l1-one-step-five-calls#read',
      label: 'Continue: TR2 lesson 1, read why',
      place: 'TR2 lesson 1',
      next: 'read why',
    })
    expect(returningOf({ href: '/m/tr5a/l2-x', label: 'Continue: TR5a lesson 2, Pages, groups and the pool', word: 'Continue' })?.place).toBe('TR5a lesson 2')
    expect(returningOf({ href: '/m/tr1/l3-x', label: 'Continue: TR1 lesson 3', word: 'Continue' })).toMatchObject({ place: 'TR1 lesson 3', next: 'the lesson' })
  })

  test('a pointer to Review or Course names no lesson', () => {
    expect(returningOf({ href: '/today', label: 'Continue: Review', word: 'Continue' })).toMatchObject({ href: '/today', label: 'Continue: Review', place: null, next: 'Review' })
  })
})

describe('the first-visit intro', () => {
  test('names the first demo level\'s parts, the brief\'s five and the now line', () => {
    expect(FIRST_PARTS).toEqual(['waiting', 'slot', 'cpu', 'gpu', 'step', 'now'])
  })

  test('opens on a first visit until the flag keeps every one of them, and never for a returning learner', () => {
    expect(introOpens(false, [])).toBe(true)
    expect(introOpens(false, ['waiting', 'slot'])).toBe(true)
    expect(introOpens(false, FIRST_PARTS)).toBe(false)
    expect(introOpens(false, [...FIRST_PARTS, 'bubble'])).toBe(false)
    expect(introOpens(true, [])).toBe(false)
  })

  test("the role line is the roster's", () => {
    expect(FRAME.role).toBe(ROSTER.find((entry) => entry.id === LOOP.id)?.role ?? '')
  })
})

describe('the course, from the index', () => {
  test('the hours by lane add up to the course\'s hours', () => {
    const hours = courseHours(index)
    expect(hours?.total).toBe(index.totalHours)
    expect(hours?.lanes.map((lane) => lane.words)).toEqual(['browser', 'laptop', 'GPU'])
    expect(hours?.lanes.reduce((sum, lane) => sum + lane.hours, 0)).toBeCloseTo(index.totalHours, 6)
    expect(courseHours(null)).toBeNull()
  })

  test("Start names the first lesson, its minutes and what it needs, and goes where nextStep sends an empty ledger", () => {
    const short = startLabel(index)
    const full = startLabel(index, true)
    expect(short).toEqual({ label: 'Start the course: TR1 lesson 1 (35 min, browser only)', route: START_POINTER.href })
    expect(full?.label).toBe('Start the course: TR1 lesson 1, Five mechanisms (35 min, browser only)')
    expect(startLabel(null)).toBeNull()
  })
})

describe('the page reads the pointer and the flag, and never the ledger (D-038)', () => {
  test("no module of src/front imports the ledger, the evidence store, the recorder or the way on's own reading of the ledger", () => {
    const folder = path.join(root, 'src/front')
    const files = ['FrontPage.tsx', 'Instrument.tsx', 'way.ts', 'menu.ts', 'copy.ts', 'device.ts', 'night.ts', 'upgrade.ts']
    for (const file of files) {
      const text = readFileSync(path.join(folder, file), 'utf8')
      const imports = [...text.matchAll(/from '([^']+)'|import\('([^']+)'\)/g)].map((match) => match[1] ?? match[2])
      expect(imports.filter((source) => /@es\/ledger|@\/evidence|useRecorder|games\/kit\/record|progress\/(useWayOn|useProgress)|indexedDB/i.test(source)), file).toEqual([])
      expect(text, file).not.toMatch(/indexedDB|onFinish=/)
    }
  })

  test('the front page no longer imports the landmark anchors or the kitchen drawing', () => {
    const files = ['FrontPage.tsx', 'Instrument.tsx', 'way.ts']
    for (const file of files) {
      const text = readFileSync(path.join(root, 'src/front', file), 'utf8')
      expect(text, file).not.toMatch(/from '\.\/anchors'|loop\/layout|loop\/kitchen|FrameLabels|scene-presets/)
    }
  })
})
