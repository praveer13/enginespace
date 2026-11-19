/*
 * Calibration on Progress (W2-T44; ASSESSMENT §4.2, §4.7; D-067): how often each confidence tap of a question or a prediction was right, read
 * from the events, in words before counts, covering both reveals of a prediction, moving and storing nothing.
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { calibrationRows, countWords, MIN_TAPS, rateWords } from '@/evidence/calibration'
import { CalibrationTable } from '@/evidence/EvidenceView'
import { deriveCards } from '@/items/today/cards'
import { kcsOfRefWith } from '@/items/today/kcs'
import { TestLedger } from '../today/support'

const html = (rows: ReturnType<typeof calibrationRows>) => renderToString(createElement(CalibrationTable, { rows })).replaceAll('<!-- -->', '')
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** A prediction as the box writes it: after a run it has the run's seed, at commit it has none (reveal.ts). */
function predict(ledger: TestLedger, day: string, id: string, ok: boolean, conf: 'guess' | 'think' | 'sure' | undefined, seed?: number) {
  return ledger.write(day, {
    kind: 'predict',
    ref: `predict:tr2.l3#${id}`,
    score: ok ? 1 : 0,
    ok,
    provenance: 'practice',
    ...(seed === undefined ? {} : { seed }),
    ...(conf === undefined ? {} : { conf }),
    data: { value: 300, truth: 312 },
  })
}

describe('calibrationRows', () => {
  test('counts right and total for each tap, apart for questions, guesses after a run and guesses at commit', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off', { conf: 'sure' })
    ledger.item('2026-11-01', 'async-off', { conf: 'sure', ok: false })
    ledger.item('2026-11-01', 'async-on', { conf: 'guess', ok: false })
    predict(ledger, '2026-11-02', 'tr2.l3.p1', true, 'sure', 7)
    predict(ledger, '2026-11-02', 'tr2.l3.p2', false, 'think') // at commit: no seed
    predict(ledger, '2026-11-02', 'tr2.l3.p3', true, 'think')
    expect(calibrationRows(ledger.events)).toEqual([
      { source: 'question', conf: 'guess', right: 0, total: 1 },
      { source: 'question', conf: 'sure', right: 1, total: 2 },
      { source: 'after-run', conf: 'sure', right: 1, total: 1 },
      { source: 'at-commit', conf: 'think', right: 1, total: 2 },
    ])
  })

  test('leaves out an event with no tap, and a kind that is neither a question nor a prediction', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off')
    predict(ledger, '2026-11-01', 'tr2.l3.p1', true, undefined)
    ledger.review('2026-11-01', 'tr2.bubble', 3, { conf: 'sure' })
    ledger.play('2026-11-01', 'loop', 'close', { conf: 'sure' })
    expect(calibrationRows(ledger.events)).toEqual([])
  })

  test('counts an event that arrives twice once, and does not depend on order', () => {
    const ledger = new TestLedger()
    const a = ledger.item('2026-11-01', 'async-off', { conf: 'sure' })
    const b = ledger.item('2026-11-02', 'async-off', { conf: 'sure', ok: false })
    expect(calibrationRows([a, b, a])).toEqual(calibrationRows([b, a]))
    expect(calibrationRows([a, b, a])[0]).toMatchObject({ right: 1, total: 2 })
  })

  test('is derived: it leaves the events as they were and writes nothing', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off', { conf: 'sure' })
    predict(ledger, '2026-11-02', 'tr2.l3.p1', true, 'think')
    const before = JSON.stringify(ledger.events)
    calibrationRows(ledger.events)
    expect(JSON.stringify(ledger.events)).toBe(before)
  })

  test('moves no card: a ledger of only taps earns nothing, with or without them', () => {
    const ledger = new TestLedger()
    predict(ledger, '2026-11-02', 'tr2.l3.p1', true, 'sure', 3)
    predict(ledger, '2026-11-02', 'tr2.l3.p2', true, 'sure')
    const resolve = kcsOfRefWith({ 'predict:tr2.l3#tr2.l3.p1': ['tr2.bubble'], 'predict:tr2.l3#tr2.l3.p2': ['tr2.bubble'] })
    expect(deriveCards(ledger.events, resolve, '2026-11-03').cards.size).toBe(0)
  })
})

describe('the words for a rate', () => {
  test('says too few to say under the minimum, whatever the share', () => {
    expect(rateWords({ right: MIN_TAPS - 1, total: MIN_TAPS - 1 })).toBe('Too few to say yet')
  })

  test('steps from rarely right to right almost every time', () => {
    expect(rateWords({ right: 0, total: 5 })).toBe('Rarely right')
    expect(rateWords({ right: 1, total: 5 })).toBe('Right less than half the time')
    expect(rateWords({ right: 2, total: 4 })).toBe('Right about half the time')
    expect(rateWords({ right: 4, total: 5 })).toBe('Right most of the time')
    expect(rateWords({ right: 9, total: 9 })).toBe('Right almost every time')
  })

  test('says the count it rests on', () => {
    expect(countWords({ right: 7, total: 9 })).toBe('7 of 9 right')
  })
})

describe('the calibration table', () => {
  test('reads the words before the count in every row, and names each group', () => {
    const ledger = new TestLedger()
    for (let i = 0; i < 4; i += 1) ledger.item('2026-11-01', 'async-off', { conf: 'sure' })
    predict(ledger, '2026-11-02', 'tr2.l3.p1', true, 'guess', 4)
    predict(ledger, '2026-11-02', 'tr2.l3.p2', false, 'sure')
    const said = text(html(calibrationRows(ledger.events)))
    expect(said).toContain('Questions you answered')
    expect(said).toContain('Guesses checked against your run')
    expect(said).toContain('Guesses checked against the working')
    expect(said).toContain('You said sure Right almost every time 4 of 4 right')
    expect(said).toContain('You said guess Too few to say yet 1 of 1 right')
    expect(said.indexOf('Too few to say yet')).toBeLessThan(said.indexOf('1 of 1 right'))
  })
})
