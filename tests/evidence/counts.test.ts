/*
 * Counting the ledger (W0-T22, `/evidence`): how an event's ref names its module, and the counts by kind and by module. A count
 * is derived from the events and never stored, and it is a count of events written, which is not credit.
 */
import { describe, expect, test } from 'bun:test'
import { GRADED_KINDS, KINDS } from '@es/ledger'
import type { Kind, LedgerEvent } from '@es/ledger'
import { GAMES } from '@es/play'
import { countEvents, emptyTally, isGradedKind, KIND_FACTS, moduleOfRef } from '@/evidence/counts'
import { copy, EXAMPLES } from '../ledger/support'

const homeOf = (game: string) => GAMES.get(game)?.modules[0]
const none = () => undefined

describe('the module a ref names', () => {
  test.each([
    ['predict:tr2.l3#tr2.l3.p1', 'tr2'],
    ['predict:tr5a.l1#tr5a.l1.p2', 'tr5a'],
    ['item:gen/tr2.bubble-width/async-on', 'tr2'],
    ['item:gen/capstone.price/a', 'capstone'],
    ['lab:tr8.replay', 'tr8'],
    ['prove:tr8.replay', 'tr8'],
    ['challenge:tr8.replay.s2', 'tr8'],
    ['receipt:tr3.profile.s1', 'tr3'],
    ['review:tr2.async-overlap', 'tr2'],
    ['review:tr5b.kv-events', 'tr5b'],
    ['review:cap.attribute', 'capstone'],
  ])('%s is %s', (ref, module) => {
    expect(moduleOfRef(ref, none)).toBe(module)
  })

  test.each([
    ['a forge lab, which is a bare slug', 'lab:hybrid-kv'],
    ['a forge lab proved', 'prove:hybrid-kv'],
    ['a trace, which every module that reads it shares', 'trace:base-step/gap'],
    ['a screen seen', 'screen:welcome'],
    ['a change card seen', 'change:vllm-pin'],
    ['a ref that is not one', 'nonsense'],
    ['a ref of a form that does not exist', 'badge:tr2.l3'],
    ['an empty ref', ''],
  ])('%s names no module', (_, ref) => {
    expect(moduleOfRef(ref, none)).toBeNull()
  })

  test('a game run counts under the game`s home module, the first its registry entry lists', () => {
    expect(GAMES.get('loop')?.modules).toEqual(['tr2', 'tr6'])
    expect(moduleOfRef('play:loop/close', homeOf)).toBe('tr2')
    expect(moduleOfRef('play:loop/first-1-fill', homeOf)).toBe('tr2')
  })

  test('a game this build does not know names no module, and loses nothing', () => {
    expect(moduleOfRef('play:pool/evict', homeOf)).toBeNull()
    expect(moduleOfRef('play:pool/evict', (game) => (game === 'pool' ? 'tr5a' : undefined))).toBe('tr5a')
  })

  test('only a module id begins a family, a lesson or a KC: tr9 and a word are not modules', () => {
    expect(moduleOfRef('item:gen/tr9.x/a', none)).toBeNull()
    expect(moduleOfRef('lab:bubble.replay', none)).toBeNull()
  })
})

describe('the kinds', () => {
  test('every kind has a name and a line, and the names are different', () => {
    expect(Object.keys(KIND_FACTS).sort()).toEqual([...KINDS].sort())
    const names = KINDS.map((kind) => KIND_FACTS[kind].name)
    expect(new Set(names).size).toBe(KINDS.length)
    for (const kind of KINDS) {
      expect(KIND_FACTS[kind].name.trim()).not.toBe('')
      expect(KIND_FACTS[kind].what.trim()).not.toBe('')
    }
  })

  test('a challenge is issued and an acknowledgement only seen: neither is graded, and every other kind is (A§7.2)', () => {
    expect(KINDS.filter((kind) => !isGradedKind(kind))).toEqual(['challenge', 'ack'])
    expect(KINDS.filter(isGradedKind)).toEqual([...GRADED_KINDS])
  })

  test('the text says nothing about credit or a score, which this page does not derive', () => {
    for (const kind of KINDS) expect(KIND_FACTS[kind].what).not.toMatch(/credit|points|xp|weight/i)
  })
})

/** The ledger of the examples, one event of every kind, with ids that differ. */
const examples = (): LedgerEvent[] => KINDS.map((kind) => ({ ...copy(EXAMPLES[kind]), id: `e-${kind}` }) as LedgerEvent)

describe('countEvents', () => {
  test('an empty ledger has nothing anywhere, and every kind is there at zero', () => {
    const counts = countEvents([], homeOf)
    expect(counts.all).toEqual(emptyTally())
    expect(counts.all.total).toBe(0)
    expect(counts.byModule.size).toBe(0)
    expect(counts.unplaced.total).toBe(0)
    for (const kind of KINDS) expect(counts.all.kinds[kind]).toBe(0)
  })

  test('counts one of each kind once, and puts each in exactly one row', () => {
    const counts = countEvents(examples(), homeOf)
    expect(counts.all.total).toBe(KINDS.length)
    for (const kind of KINDS) expect(counts.all.kinds[kind]).toBe(1)
    // tr2: the prediction, the item, the game run and the review. tr8: the challenge and the receipt.
    expect(counts.byModule.get('tr2')?.total).toBe(4)
    expect(counts.byModule.get('tr2')?.kinds).toMatchObject({ predict: 1, item: 1, play: 1, review: 1, ack: 0 })
    expect(counts.byModule.get('tr8')?.total).toBe(2)
    expect(counts.byModule.get('tr8')?.kinds).toMatchObject({ challenge: 1, receipt: 1 })
    // The forge lab, its prove, the trace and the acknowledgement name none.
    expect(counts.unplaced.total).toBe(4)
    expect(counts.unplaced.kinds).toMatchObject({ 'lab-check': 1, prove: 1, 'trace-mark': 1, ack: 1 })
    const placed = [...counts.byModule.values()].reduce((sum, row) => sum + row.total, 0)
    expect(placed + counts.unplaced.total).toBe(counts.all.total)
  })

  test('the rows and the margins agree, whatever the ledger holds', () => {
    const events = [...examples(), ...examples().map((event) => ({ ...event, id: `${event.id}-again` }) as LedgerEvent), { ...copy(EXAMPLES.item), id: 'more', ref: 'item:gen/tr6.mask/b' } as LedgerEvent]
    const counts = countEvents(events, homeOf)
    expect(counts.all.total).toBe(events.length)
    for (const kind of KINDS) {
      const across = [...counts.byModule.values()].reduce((sum, row) => sum + row.kinds[kind], counts.unplaced.kinds[kind])
      expect(across, kind).toBe(counts.all.kinds[kind])
    }
    for (const row of [counts.all, counts.unplaced, ...counts.byModule.values()]) expect(Object.values(row.kinds).reduce((a, b) => a + b, 0)).toBe(row.total)
    expect(counts.byModule.get('tr6')?.total).toBe(1)
  })

  test('with no game registry, game runs name no module and are still counted', () => {
    const counts = countEvents([{ ...copy(EXAMPLES.play) }], none)
    expect(counts.all.kinds.play).toBe(1)
    expect(counts.unplaced.kinds.play).toBe(1)
  })

  test('does not change the events it is given, and a second count gives the same answer', () => {
    const events = examples()
    const before = JSON.stringify(events)
    const first = countEvents(events, homeOf)
    expect(JSON.stringify(events)).toBe(before)
    expect(countEvents(events, homeOf)).toEqual(first)
  })

  test('every kind is a key of every tally, so a page can read any kind without a guard', () => {
    const tally = emptyTally()
    expect(Object.keys(tally.kinds).sort()).toEqual([...KINDS].sort())
    const kinds: Kind[] = Object.keys(tally.kinds) as Kind[]
    expect(kinds.length).toBe(10)
  })
})
