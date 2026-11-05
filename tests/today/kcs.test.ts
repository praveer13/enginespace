/*
 * W1-T05: which knowledge components an event is evidence for (src/items/today/kcs.ts; ARCHITECTURE §4.5: "KCs come from a ref→KC map at read
 * time and are never stored"). An event keeps its ref and nothing else about its KCs, so retagging a variant moves the evidence already written.
 */
import { describe, expect, test } from 'bun:test'
import { appKcsOfRef, kcsOfRef, sourcesOf } from '../../src/items/today/kcs'
import type { KcSources } from '../../src/items/today/kcs'
import { toySum } from '../play/items-support.ts'

const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'
// What Service's graded `close` earns besides those (W1-T14): the V2 runner, the graph modes, and the memory that graphs take.
const MRV2 = 'tr2.mrv2-delta'
const MODES = 'tr2.graph-modes'
const MEMORY = 'tr2.graph-memory'

describe('the ref-to-KC map of this build', () => {
  test('a review names its own KC', () => {
    expect(appKcsOfRef('review:tr2.graph-replay')).toEqual(['tr2.graph-replay'])
    expect(appKcsOfRef('review:cap.pair-delta')).toEqual(['cap.pair-delta'])
  })

  test('an item names the KCs of its variant, which the family\'s registry entry holds', () => {
    expect(appKcsOfRef('item:gen/tr2.bubble-width/async-off')).toEqual([BUBBLE])
    expect(appKcsOfRef('item:gen/tr2.bubble-width/async-on')).toEqual([OVERLAP])
    expect([...appKcsOfRef('item:gen/tr2.bubble-width/close-it')].sort()).toEqual([OVERLAP, BUBBLE])
  })

  test('an item of a family or a variant this build does not have names none: it earns nothing and is not an error', () => {
    expect(appKcsOfRef('item:gen/tr2.bubble-width/no-such-variant')).toEqual([])
    expect(appKcsOfRef('item:gen/tr8.unknown/anything')).toEqual([])
  })

  test('a game run names the KCs the game exercises', () => {
    expect([...appKcsOfRef('play:loop/close')].sort()).toEqual([OVERLAP, BUBBLE, MEMORY, MODES, MRV2])
    expect(appKcsOfRef('play:no-such-game/level')).toEqual([])
  })

  test('the other refs name none yet, and a string that is not a ref names none either', () => {
    for (const ref of [
      'predict:tr2.l3#tr2.l3.p1',
      'lab:hybrid-kv',
      'prove:hybrid-kv',
      'receipt:tr8.replay.s2',
      'challenge:tr8.replay.s2',
      'trace:steploop/gap',
      'screen:welcome',
      'change:pin-vllm',
      '',
      'review:',
      'review:not a kc',
      'item:gen/x',
      'something else',
    ]) {
      expect(appKcsOfRef(ref), ref).toEqual([])
    }
  })
})

describe('the map over the sources it is given', () => {
  const sources: KcSources = {
    variant: (family, variant) => (family === 'tr2.f' && variant === 'v' ? ['tr2.a', 'tr2.b', 'tr2.a'] : []),
    game: (game) => (game === 'g' ? ['tr2.c'] : []),
  }

  test('lists each KC once, in the order the source gave them', () => {
    expect(kcsOfRef('item:gen/tr2.f/v', sources)).toEqual(['tr2.a', 'tr2.b'])
    expect(kcsOfRef('play:g/level', sources)).toEqual(['tr2.c'])
  })

  test('sources of the registry\'s families can be swapped for a test\'s own', () => {
    const own = sourcesOf([toySum])
    expect(own.variant('tr2.toy-sum', 'sum')).toEqual([BUBBLE])
    expect(own.variant('tr2.toy-sum', 'larger')).toEqual([OVERLAP])
    expect(own.variant('tr2.bubble-width', 'async-off')).toEqual([])
  })
})
