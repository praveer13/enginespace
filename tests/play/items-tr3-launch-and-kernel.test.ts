/*
 * W2b-T105: `tr3.launch-and-kernel`. Each key is read again from the lines the ticket prints: the launch call that starts at the time asked
 * about, its correlation id, the kernel line with that id, and the µs from the call's return to the kernel's start. The reader shares no
 * code with the family or with `@es/sim/trace`.
 */
import { describe, expect, test } from 'bun:test'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { launchAndKernel } from '@es/play/items/families/tr3/launch-and-kernel'
import { keyOf } from './items-support.ts'
import { chunks, numsOf } from './items-tr3-support.ts'

interface Line {
  readonly name: string
  readonly id: number
  readonly from: number
  readonly to: number
  readonly label: string
}

function lines(item: Item): { calls: Line[]; kernels: Line[] } {
  const calls: Line[] = []
  const kernels: Line[] = []
  for (const given of item.givens) {
    if (given.value.t !== 'code') continue
    const m = given.value.code.match(/^(?:(\w+), )?id (\d+), from (\d+) to (\d+)$/)
    if (m === null) throw new Error(`not a line: ${given.value.code}`)
    const line = { name: m[1] ?? '', id: Number(m[2]), from: Number(m[3]), to: Number(m[4]), label: given.label }
    ;(given.label.startsWith('launch call') ? calls : kernels).push(line)
  }
  return { calls, kernels }
}

/** The call asked about, its kernel, and the lag, from the printed lines. */
function read(item: Item): { kernel: Line; lag: number; call: Line } {
  const { calls, kernels } = lines(item)
  const at = numsOf(item.stem)[0]
  const call = calls.find((c) => c.from === at)
  if (call === undefined) throw new Error(`no call starts at ${at}`)
  const kernel = kernels.find((k) => k.id === call.id)
  if (kernel === undefined) throw new Error(`no kernel has id ${call.id}`)
  return { kernel, lag: kernel.from - call.to, call }
}

describe('the family', () => {
  test('is registered, names the trace-anatomy KC, and has a choice and a numeric variant at every level', () => {
    expect(familyById('tr3.launch-and-kernel')).toBe(launchAndKernel)
    expect(FAMILIES).toContain(launchAndKernel)
    expect(launchAndKernel.kcs).toEqual(['tr3.trace-anatomy'])
    for (const level of LEVELS) expect(offeredAt(launchAndKernel, level).map((variant) => launchAndKernel.make(1, level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric'])
  })
})

describe('the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the kernel is the one with the call's id, and the lag is from the call's return`, () => {
        for (const seed of seeds) {
          const which = launchAndKernel.make(seed, level, 'which-kernel')
          const { calls, kernels } = lines(which)
          expect(calls.length).toBe(level <= 1 ? 3 : level === 2 ? 4 : 5)
          expect(new Set(kernels.map((k) => k.id)).size).toBe(kernels.length)
          if (which.answer.kind !== 'choice') throw new Error('a choice')
          const { correct, options } = which.answer
          expect(plain(options.find((option) => option.id === correct)?.text ?? []), `seed ${seed}`).toBe(read(which).kernel.name)
          expect(options.map((option) => plain(option.text)).sort()).toEqual(kernels.map((k) => k.name).sort())

          const lag = launchAndKernel.make(seed, level, 'lag')
          expect(lag.answer.kind === 'numeric' && lag.answer.truth, `seed ${seed}`).toBe(read(lag).lag)
          expect(read(lag).lag).toBeGreaterThanOrEqual(2)
        }
      })
    }
  }

  test('a call asked about is each of the calls one time in n, and from level 2 the kernels run on two streams and not always in the order of the calls', () => {
    const asked = new Map<number, number>()
    let reordered = 0
    for (const seed of chunks[0]) {
      const item = launchAndKernel.make(seed, 2, 'which-kernel')
      const { calls, kernels } = lines(item)
      const place = calls.findIndex((c) => c.from === numsOf(item.stem)[0])
      asked.set(place, (asked.get(place) ?? 0) + 1)
      expect(new Set(kernels.map((k) => k.label.split(',')[0])).size).toBeGreaterThanOrEqual(1)
      const byStart = [...kernels].sort((a, b) => a.from - b.from).map((k) => k.id)
      if (byStart.join() !== kernels.map((k) => k.id).sort((a, b) => a - b).join()) reordered += 1
      expect(launchAndKernel.make(seed, 1, 'which-kernel').givens.every((g) => !g.label.startsWith('GPU stream 2'))).toBe(true)
    }
    expect([...asked.keys()].sort()).toEqual([0, 1, 2, 3])
    for (const count of asked.values()) expect(count).toBeGreaterThan(chunks[0].length / 4 / 2)
    expect(reordered).toBeGreaterThan(chunks[0].length / 5)
  })

  test('the call asked about is not always the first, and the next kernel to start is a lure in some tickets', () => {
    const lures = new Set<string>()
    for (const seed of chunks[0]) {
      const item = launchAndKernel.make(seed, 2, 'which-kernel')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) if (option.miss !== undefined) lures.add(option.miss)
    }
    expect([...lures].sort()).toEqual(['tr3.launch-and-kernel.next-to-start', 'tr3.launch-and-kernel.other-call'])
  })
})

describe('the diagnoses', () => {
  test('a lag counted from the call\'s start, and the lag of another call, are named', () => {
    const seen = new Set<string>()
    for (const seed of chunks[0]) {
      const item = launchAndKernel.make(seed, 2, 'lag')
      for (let value = 0; value <= 140; value += 1) {
        const grade = launchAndKernel.grade(item, { kind: 'numeric', value })
        if (!grade.ok && grade.diagnosis !== undefined) seen.add(grade.diagnosis.id)
      }
      expect(launchAndKernel.grade(item, keyOf(item)).diagnosis).toBeUndefined()
    }
    expect(seen).toEqual(new Set(['tr3.launch-and-kernel.from-call-start', 'tr3.launch-and-kernel.other-call']))
  })
})
