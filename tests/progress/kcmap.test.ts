/*
 * W1-T06: the ref-to-KC map. An event stores its ref and never its KCs, so a KC comes from the ref when it is read (ARCHITECTURE §4.5;
 * kernelspace's `kcsOfEvent`, rule 3). The sources are a game registry, the item families, the labs and the exact refs content
 * assigns; a ref with no source names no KC.
 */
import { describe, expect, test } from 'bun:test'
import { kcsOfRef } from '@/progress/kcmap'
import type { KcSources } from '@/progress/kcmap'
import { SOURCES } from './support'

describe('kcsOfRef', () => {
  test.each([
    ['a review names its KC itself', 'review:tr2.async-overlap', ['tr2.async-overlap']],
    ["a game run names the game's KCs", 'play:loop/close', ['tr2.bubble', 'tr2.async-overlap']],
    ['an item names the family\'s KCs, whatever its variant', 'item:gen/tr2.bubble-width/async-on', ['tr2.bubble']],
    ["a forge lab's check names the lab's KCs", 'lab:hybrid-kv', ['tr5a.kv-groups', 'tr5a.adapter-pages']],
    ["a Prove-it on a lab names the lab's KCs", 'prove:hybrid-kv', ['tr5a.kv-groups', 'tr5a.adapter-pages']],
    ["a prediction names the KCs its lesson assigns", 'predict:tr2.l3#tr2.l3.p1', ['tr2.async-overlap']],
  ])('%s', (_, ref, kcs) => {
    expect(kcsOfRef(ref, SOURCES)).toEqual(kcs)
  })

  test("a receipt's stage is found in its lab, however the lab is named", () => {
    const sources: KcSources = { ...SOURCES, lab: (lab) => (lab === 'tr8.replay' ? ['tr8.open-loop'] : []) }
    expect(kcsOfRef('receipt:tr8.replay.s2', sources)).toEqual(['tr8.open-loop'])
    expect(kcsOfRef('lab:tr8.replay', sources)).toEqual(['tr8.open-loop'])
  })

  test.each([
    ['a prediction no lesson assigns', 'predict:tr9.l1#tr9.l1.p1'],
    ['a trace, which belongs to every module that reads it', 'trace:base-step/gap'],
    ['a challenge, which is issued and not graded', 'challenge:tr8.replay.s2'],
    ['a screen seen', 'screen:welcome'],
    ['a change card seen', 'change:vllm-pin'],
    ['a game this build does not have', 'play:shape-shifter/fewest'],
    ['a family this build does not have', 'item:gen/tr9.nothing/v1'],
    ['a ref that is not one', 'nonsense'],
    ['a ref of a form that does not exist', 'badge:tr2.l3'],
    ['an empty ref', ''],
  ])('%s names no KC', (_, ref) => {
    expect(kcsOfRef(ref, SOURCES)).toEqual([])
  })

  test('the exact ref wins over what the ref names, as in kernelspace', () => {
    const sources: KcSources = { ...SOURCES, refs: { 'play:loop/close': ['tr2.graph-replay'] } }
    expect(kcsOfRef('play:loop/close', sources)).toEqual(['tr2.graph-replay'])
    expect(kcsOfRef('play:loop/async', sources)).toEqual(['tr2.bubble', 'tr2.async-overlap'])
  })

  test('an exact ref with no KCs falls through to the thing it names', () => {
    const sources: KcSources = { ...SOURCES, refs: { 'play:loop/close': [] } }
    expect(kcsOfRef('play:loop/close', sources)).toEqual(['tr2.bubble', 'tr2.async-overlap'])
  })

  test('a KC is named once, however many sources say it', () => {
    const sources: KcSources = { ...SOURCES, game: () => ['tr2.bubble', 'tr2.bubble', 'tr2.async-overlap'] }
    expect(kcsOfRef('play:loop/close', sources)).toEqual(['tr2.bubble', 'tr2.async-overlap'])
  })

  test('a name such as `constructor` is not a ref in the table of exact refs', () => {
    expect(kcsOfRef('constructor', SOURCES)).toEqual([])
    expect(kcsOfRef('__proto__', SOURCES)).toEqual([])
  })
})
