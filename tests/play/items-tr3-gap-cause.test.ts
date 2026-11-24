/*
 * W2b-T106: `tr3.gap-cause`. Each key is worked out again from the lines the ticket prints, with no code of the family or of
 * `@es/sim/trace`: the span that covers most of the lead-in (the shorter of two that cover the same stretch), and the three parts of a gap
 * clipped to the gap. Zero parts are kept: seeds in which the call began before the first kernel ended, or in which the kernel starts the
 * moment the call returns, are drawn and the answer is zero.
 */
import { describe, expect, test } from 'bun:test'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { gapCause } from '@es/play/items/families/tr3/gap-cause'
import { keyOf, wrongOf } from './items-support.ts'
import { chunks, codesOf, givenCode } from './items-tr3-support.ts'

interface Line {
  readonly name: string
  readonly from: number
  readonly to: number
}

/** The first kernel's end, the main thread's spans, the launch call, and the next kernel's start, from the ticket. */
function readCause(item: Item): { kEnd: number; spans: Line[]; callFrom: number; kStart: number } {
  const kEnd = Number(givenCode(item, 'first kernel').match(/ends at (\d+)/)?.[1])
  const spans: Line[] = []
  for (const given of item.givens) {
    if (!/^(CPU main thread|CUDA API), span \d+$/.test(given.label) || given.value.t !== 'code') continue
    const m = given.value.code.match(/^(\w+), from (\d+) to (\d+)$/)
    if (m === null) throw new Error(given.value.code)
    spans.push({ name: m[1], from: Number(m[2]), to: Number(m[3]) })
  }
  const call = givenCode(item, 'launch call of the next kernel').match(/cudaLaunchKernel, from (\d+) to (\d+)/)
  const kStart = Number(givenCode(item, 'next kernel').match(/starts at (\d+)/)?.[1])
  return { kEnd, spans, callFrom: Number(call?.[1]), kStart }
}

/** The span that covers most of the lead-in; of equal cover, the shorter. */
function causeOf(item: Item): { name: string; ties: number } {
  const { kEnd, spans, callFrom } = readCause(item)
  const cover = (span: Line): number => Math.max(0, Math.min(span.to, callFrom) - Math.max(span.from, kEnd))
  const most = Math.max(...spans.map(cover))
  const top = spans.filter((span) => cover(span) === most)
  const shortest = Math.min(...top.map((span) => span.to - span.from))
  return { name: top.find((span) => span.to - span.from === shortest)?.name ?? '', ties: top.length }
}

function readParts(item: Item): { host: number; call: number; wait: number; gap: number } {
  const kEnd = Number(givenCode(item, 'first kernel').match(/ends at (\d+)/)?.[1])
  const line = givenCode(item, 'launch call')
  const range = line.match(/^from (\d+) to (\d+)$/)
  const lasts = line.match(/^starts at (\d+), lasts (\d+)$/)
  const from = Number(range?.[1] ?? lasts?.[1])
  const to = range === null ? from + Number(lasts?.[2]) : Number(range[2])
  const kStart = Number(givenCode(item, 'next kernel').match(/starts at (\d+)/)?.[1])
  return {
    gap: kStart - kEnd,
    host: Math.max(0, from - kEnd),
    call: Math.max(0, to - Math.max(from, kEnd)),
    wait: kStart - Math.max(to, kEnd),
  }
}

const ASKED: Readonly<Record<string, 'host' | 'call' | 'wait'>> = {
  'the time before the launch call begins': 'host',
  'the part of the launch call that falls inside the gap': 'call',
  "the wait from the launch call's return to the next kernel's start": 'wait',
}

const askedOf = (item: Item): 'host' | 'call' | 'wait' => {
  const text = plain(item.stem)
  const tail = text.slice(text.lastIndexOf('How many µs of the gap are ') + 'How many µs of the gap are '.length).replace(/\?$/, '')
  const part = ASKED[tail]
  if (part === undefined) throw new Error(`no part in "${tail}"`)
  return part
}

describe('the family', () => {
  test('is registered, names the gap-cause KC, and has a choice and a numeric variant at every level', () => {
    expect(familyById('tr3.gap-cause')).toBe(gapCause)
    expect(FAMILIES).toContain(gapCause)
    expect(gapCause.kcs).toEqual(['tr3.gap-cause'])
    for (const level of LEVELS) expect(offeredAt(gapCause, level).map((variant) => gapCause.make(1, level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric'])
  })
})

describe('which-call: the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the right option is the span that covers most of the lead-in, the nested one of two that cover the same`, () => {
        for (const seed of seeds) {
          const item = gapCause.make(seed, level, 'which-call')
          if (item.answer.kind !== 'choice') throw new Error('choice')
          const { correct, options } = item.answer
          expect(codesOf(options.find((option) => option.id === correct)?.text ?? []), `seed ${seed}`).toEqual([causeOf(item).name])
          // Each option is a span the ticket prints, once; the launch call is not one of them.
          const names = readCause(item).spans.map((span) => span.name)
          expect(options.flatMap((option) => codesOf(option.text)).sort()).toEqual([...names].sort())
          expect(new Set(names).size).toBe(names.length)
        }
      })
    }
  }

  test('level 3 is the tie: a frame that began in the first kernel and a call inside it cover the same stretch, and the call is the key', () => {
    for (const seed of chunks[0]) {
      const item = gapCause.make(seed, 3, 'which-call')
      const { kEnd, spans, callFrom } = readCause(item)
      const covering = spans.filter((span) => span.from <= kEnd && span.to === callFrom)
      expect(covering, `seed ${seed}`).toHaveLength(2)
      expect(causeOf(item).ties).toBe(2)
      const [inner, outer] = [...covering].sort((a, b) => a.to - a.from - (b.to - b.from))
      expect(causeOf(item).name).toBe(inner.name)
      expect(outer.from).toBeLessThan(inner.from)
      // A third span ended before the first kernel did, and covers none of the lead-in.
      expect(spans.filter((span) => span.to <= kEnd)).toHaveLength(1)
    }
  })

  test('at levels 0 to 2 the cause covers more than half of the lead-in, and no other span covers as much', () => {
    for (const level of [0, 1, 2] as const) {
      for (const seed of chunks[0]) {
        const item = gapCause.make(seed, level, 'which-call')
        const { kEnd, spans, callFrom } = readCause(item)
        const lead = callFrom - kEnd
        const covers = spans.map((span) => Math.min(span.to, callFrom) - Math.max(span.from, kEnd)).sort((a, b) => b - a)
        expect(covers[0] * 2, `${level} ${seed}`).toBeGreaterThan(lead)
        expect(covers[0]).toBeGreaterThan(covers[1])
        expect(spans.length).toBe(level === 2 ? 4 : 3)
      }
    }
  })

  test('the stem says the stretch is a CPU gap, in the course word, and the lures name what they are', () => {
    const item = gapCause.make(3, 0, 'which-call')
    expect(plain(item.stem)).toContain('CPU gap')
    const misses = new Set<string>()
    for (const level of LEVELS) {
      for (const seed of chunks[0]) {
        const made = gapCause.make(seed, level, 'which-call')
        if (made.answer.kind === 'choice') for (const option of made.answer.options) if (option.miss !== undefined) misses.add(option.miss)
      }
    }
    expect([...misses].sort()).toEqual(['tr3.gap-cause.before-the-gap', 'tr3.gap-cause.covers-less', 'tr3.gap-cause.outer-frame'])
  })
})

describe('three-parts: the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the part asked, clipped to the gap, and the three parts add up to the gap`, () => {
        for (const seed of seeds) {
          const item = gapCause.make(seed, level, 'three-parts')
          if (item.answer.kind !== 'numeric') throw new Error('numeric')
          const parts = readParts(item)
          expect(parts.host + parts.call + parts.wait, `seed ${seed}`).toBe(parts.gap)
          expect(item.answer.truth, `seed ${seed}`).toBe(parts[askedOf(item)])
          expect(item.answer.tolerance).toEqual({})
          expect(item.givens.some((given) => given.label === 'launch call' && given.value.t === 'code' && given.value.code.startsWith('starts at'))).toBe(level === 3)
        }
      })
    }
  }

  test('each part is asked about one seed in three, and a part of zero is kept: both the host time and the wait are zero on some seeds', () => {
    const asked = { host: 0, call: 0, wait: 0 }
    const zero = { host: 0, call: 0, wait: 0 }
    let total = 0
    for (const level of LEVELS) {
      for (const seed of chunks[0].concat(chunks[1] ?? [])) {
        const item = gapCause.make(seed, level, 'three-parts')
        const part = askedOf(item)
        asked[part] += 1
        total += 1
        const parts = readParts(item)
        for (const name of ['host', 'call', 'wait'] as const) if (parts[name] === 0) zero[name] += 1
      }
    }
    for (const part of ['host', 'call', 'wait'] as const) expect(asked[part] / total).toBeGreaterThan(0.25)
    expect(zero.host).toBeGreaterThan(20)
    expect(zero.wait).toBeGreaterThan(10)
    expect(zero.call).toBe(0)
  })

  test('a wrong answer is named: the whole gap, another part, and the call unclipped', () => {
    const ids = new Set<string>()
    for (const level of [0, 2] as const) {
      for (const seed of chunks[0]) {
        const item = gapCause.make(seed, level, 'three-parts')
        if (item.answer.kind !== 'numeric') continue
        const parts = readParts(item)
        const asked = askedOf(item)
        for (const value of [parts.gap, ...(['host', 'call', 'wait'] as const).filter((name) => name !== asked).map((name) => parts[name])]) {
          const grade = gapCause.grade(item, { kind: 'numeric', value })
          if (value !== parts[asked]) ids.add(grade.diagnosis?.id ?? 'none')
        }
        expect(gapCause.grade(item, keyOf(item)).ok).toBe(true)
        expect(gapCause.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
    expect(ids.has('tr3.gap-cause.whole-gap')).toBe(true)
    expect(ids.has('tr3.gap-cause.other-part')).toBe(true)
  })
})
