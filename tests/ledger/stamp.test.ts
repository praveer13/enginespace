/*
 * Ids, the clock, and stamping an event (ARCHITECTURE §7.2): the day is computed once, from `at` and `tz`, when the event is
 * written, and a draft that breaks a rule throws where it was made.
 */
import { describe, expect, test } from 'bun:test'
import { dayOf, decodeEvent, isIsoInstant, isLocalDay, seededIds, stampEvent, systemClock, uuidFactory } from '@es/ledger'
import type { Clock, WriterContext } from '@es/ledger'
import { copy, EXAMPLES, HEX_A, omit } from './support'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A clock that gives `at` and a zone that may depend on the instant. */
const clock = (at: string, tz: number | ((at: string) => number)): Clock => ({
  nowIso: () => at,
  tzOffsetMinutes: (instant) => (typeof tz === 'number' ? tz : tz(instant)),
})

const writer = (at: string, tz: number | ((at: string) => number) = 0, id = 'ev-1'): WriterContext => ({ clock: clock(at, tz), newId: () => id, dev: 'dev-a1' })

const itemDraft = { kind: 'item', ref: 'item:gen/tr2.bubble-width/async-on', score: 1, ok: true, provenance: 'unseen', data: { answer: 3 } } as const

describe('ids', () => {
  test('a random id is a version 4 UUID, and a thousand of them differ', () => {
    const seen = new Set<string>()
    for (let n = 0; n < 1000; n += 1) {
      const id = uuidFactory()
      expect(id).toMatch(UUID)
      seen.add(id)
    }
    expect(seen.size).toBe(1000)
  })

  test('a seeded factory gives the same ids for the same seed, UUIDs all, and other ids for another seed', () => {
    const a = seededIds(42)
    const b = seededIds(42)
    const c = seededIds(43)
    const fromA = Array.from({ length: 50 }, a)
    expect(Array.from({ length: 50 }, b)).toEqual(fromA)
    expect(Array.from({ length: 50 }, c)).not.toEqual(fromA)
    for (const id of fromA) expect(id).toMatch(UUID)
    expect(new Set(fromA).size).toBe(50)
  })

  test('a seeded id is one the codec takes as an id', () => {
    const next = seededIds(7)
    for (let n = 0; n < 100; n += 1) expect(decodeEvent({ ...EXAMPLES.ack, id: next(), dev: next() }).ok).toBe(true)
  })
})

describe('the clock', () => {
  test('the system clock gives a canonical instant, and a zone in whole minutes that matches the runtime', () => {
    const at = systemClock.nowIso()
    expect(isIsoInstant(at)).toBe(true)
    const tz = systemClock.tzOffsetMinutes(at)
    expect(Number.isInteger(tz)).toBe(true)
    expect(tz).toBe(-new Date(at).getTimezoneOffset())
    expect(Math.abs(Date.now() - Date.parse(at))).toBeLessThan(5000)
  })

  test('isIsoInstant takes the form toISOString writes and nothing else', () => {
    expect(isIsoInstant('2026-11-04T09:30:00.123Z')).toBe(true)
    expect(isIsoInstant(new Date(0).toISOString())).toBe(true)
    for (const bad of ['2026-11-04T09:30:00Z', '2026-02-30T00:00:00.000Z', '2026-11-04T09:30:00.123+00:00', '', 5, null, undefined, new Date(0)]) {
      expect(isIsoInstant(bad)).toBe(false)
    }
  })

  test('isLocalDay takes a real calendar day', () => {
    for (const good of ['2026-11-04', '2028-02-29', '2026-12-31']) expect(isLocalDay(good)).toBe(true)
    for (const bad of ['2026-02-29', '2026-13-01', '2026-11-31', '2026-1-4', '20261104', '', 5, null]) expect(isLocalDay(bad)).toBe(false)
  })

  test('dayOf shifts the instant by the zone before it takes the day', () => {
    expect(dayOf('2026-11-04T09:30:00.000Z', 0)).toBe('2026-11-04')
    expect(dayOf('2026-11-04T01:30:00.000Z', -480)).toBe('2026-11-03')
    expect(dayOf('2026-11-04T23:30:00.000Z', 60)).toBe('2026-11-05')
    expect(dayOf('2026-11-04T18:29:59.999Z', 330)).toBe('2026-11-04')
    expect(dayOf('2026-11-04T18:30:00.000Z', 330)).toBe('2026-11-05')
    expect(dayOf('2026-12-31T23:59:59.999Z', 1)).toBe('2027-01-01')
    expect(dayOf('2028-02-28T23:30:00.000Z', 60)).toBe('2028-02-29')
  })
})

describe('stampEvent', () => {
  test('adds the id, the version, the instant, the zone, the day and the device', () => {
    const event = stampEvent(writer('2026-11-04T09:30:00.000Z', -480, 'ev-9'), itemDraft)
    expect(event).toEqual({ ...itemDraft, id: 'ev-9', v: 1, at: '2026-11-04T09:30:00.000Z', tz: -480, day: '2026-11-04', dev: 'dev-a1' })
  })

  test('freezes the day in force at the moment of writing', () => {
    // 01:30 UTC is still the evening before in a zone eight hours west, and already the next morning in a zone nine hours east.
    expect(stampEvent(writer('2026-11-04T01:30:00.000Z', -480), itemDraft).day).toBe('2026-11-03')
    expect(stampEvent(writer('2026-11-04T01:30:00.000Z', 540), itemDraft).day).toBe('2026-11-04')
    expect(stampEvent(writer('2026-11-04T23:30:00.000Z', 540), itemDraft).day).toBe('2026-11-05')
  })

  test('takes the zone at the instant, so a daylight-saving change is honoured', () => {
    // A zone that moves its clocks an hour at 2026-11-01T09:00Z, as the Pacific zone did.
    const pacific = (at: string) => (at < '2026-11-01T09:00:00.000Z' ? -420 : -480)
    expect(stampEvent(writer('2026-11-01T08:30:00.000Z', pacific), itemDraft).tz).toBe(-420)
    expect(stampEvent(writer('2026-11-01T09:30:00.000Z', pacific), itemDraft).tz).toBe(-480)
    expect(stampEvent(writer('2026-11-01T07:30:00.000Z', pacific), itemDraft).day).toBe('2026-11-01')
  })

  test('a later change of zone moves no event that was written', () => {
    const written = stampEvent(writer('2026-11-04T01:30:00.000Z', -480), itemDraft)
    expect(written.day).toBe('2026-11-03')
    // The event keeps its own zone and its own day; decoding it again agrees.
    const decoded = decodeEvent(JSON.parse(JSON.stringify(written)))
    expect(decoded.ok).toBe(true)
  })

  test('the event it returns has passed the codec', () => {
    for (const kind of Object.keys(EXAMPLES) as (keyof typeof EXAMPLES)[]) {
      const draft = omit(copy(EXAMPLES[kind]), 'id', 'v', 'at', 'tz', 'day', 'dev')
      const event = stampEvent(writer('2026-11-04T09:30:00.000Z', -480, 'ev-1'), draft as never)
      expect(decodeEvent(event).ok).toBe(true)
      expect(event.kind).toBe(kind)
    }
  })

  test('members that are undefined are left out', () => {
    const event = stampEvent(writer('2026-11-04T09:30:00.000Z'), { ...itemDraft, rev: undefined, seed: undefined })
    expect(Object.keys(event)).not.toContain('rev')
    expect(Object.keys(event)).not.toContain('seed')
  })

  test('a draft is not changed', () => {
    const draft = copy({ ...itemDraft })
    stampEvent(writer('2026-11-04T09:30:00.000Z'), draft)
    expect(draft).toEqual(itemDraft)
  })

  test('a draft that breaks a rule throws, and the message says which', () => {
    expect(() => stampEvent(writer('2026-11-04T09:30:00.000Z'), { ...itemDraft, score: 1.5 })).toThrow(/score/)
    expect(() => stampEvent(writer('2026-11-04T09:30:00.000Z'), { ...itemDraft, ref: 'play:loop/close' })).toThrow(/does not fit/)
    expect(() => stampEvent(writer('2026-11-04T09:30:00.000Z'), { ...itemDraft, weight: 1 } as never)).toThrow(/weight/)
    expect(() => stampEvent(writer('2026-11-04T09:30:00.000Z', 0, 'bad id'), itemDraft)).toThrow(/id/)
    expect(() => stampEvent(writer('2026-11-04T09:30:00.000Z', 99_999), itemDraft)).toThrow(/tz/)
  })

  test('a clock that gives something other than an instant throws', () => {
    expect(() => stampEvent(writer('yesterday'), itemDraft)).toThrow(/not an ISO instant/)
    expect(() => stampEvent(writer('2026-11-04T09:30:00Z'), itemDraft)).toThrow(/not an ISO instant/)
  })

  test('a draft cannot choose the fields that stamping owns', () => {
    const forged = stampEvent(writer('2026-11-04T09:30:00.000Z', 0, 'real-id'), {
      ...itemDraft,
      id: 'forged',
      at: '2000-01-01T00:00:00.000Z',
      dev: 'forged',
      day: '2000-01-01',
      tz: 0,
    } as never)
    expect(forged.id).toBe('real-id')
    expect(forged.at).toBe('2026-11-04T09:30:00.000Z')
    expect(forged.dev).toBe('dev-a1')
    expect(forged.day).toBe('2026-11-04')
  })

  test('the hash and the log of a game run travel in the event', () => {
    const event = stampEvent(writer('2026-11-04T09:30:00.000Z'), {
      kind: 'play',
      ref: 'play:loop/close',
      score: 1,
      ok: true,
      provenance: 'unseen',
      seed: 4021,
      rev: 'a1b2c3d4',
      data: { actions: 'H4sI', actionsSha256: HEX_A },
    })
    expect(event.data.actionsSha256).toBe(HEX_A)
    expect(event.seed).toBe(4021)
  })
})
