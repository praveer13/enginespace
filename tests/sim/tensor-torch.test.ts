/*
 * W2-T13's first acceptance check: the tensor rules agree with PyTorch on a committed fixture set.
 *
 * tests/fixtures/tensor/torch-vectors.json was generated once by scripts/tensor-torch-vectors.py with CPU torch, and records the torch
 * version in its header. Each case is a start (a base `arange` and a prelude of operations), an operation, and torch's answer: the shape,
 * strides and offset, whether the storage is shared (a copy does not share), is_contiguous, internal overlap, and the elements in logical
 * order. The model must answer the same, error for error, and move as many elements as torch moved.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { addresses, applyOp, applyOps, contiguousView, hasInternalOverlap, isContiguous, numel } from '../../packages/sim/tensor'
import type { ShiftOp, TView } from '../../packages/sim/tensor'

type TorchAnswer = { error: 'not-viewable' | 'bad-shape' } | { shape: number[]; strides: number[]; offset: number; shared: boolean; contiguous: boolean; overlap: boolean; values?: number[] }
interface Case {
  base: number[]
  prelude: ShiftOp[]
  start: { shape: number[]; strides: number[]; offset: number; contiguous: boolean }
  op: ShiftOp
  torch: TorchAnswer
}
const file = path.resolve(import.meta.dirname, '../fixtures/tensor/torch-vectors.json')
const fixture = JSON.parse(readFileSync(file, 'utf8')) as { header: string; torch: { version: string; device: string; cuda_in_use: boolean; python: string }; cases: Case[] }

describe('tensor against torch', () => {
  test('the fixture records the torch it came from, run on the CPU', () => {
    expect(fixture.torch.version).toMatch(/^2\.14\.0/)
    expect(fixture.torch.device).toBe('cpu')
    expect(fixture.torch.cuda_in_use).toBe(false)
    expect(fixture.cases.length).toBeGreaterThan(5000)
  })

  test('the starts that the preludes make are the starts torch had', () => {
    const bad: string[] = []
    const seen = new Set<string>()
    for (const c of fixture.cases) {
      const k = JSON.stringify([c.base, c.prelude])
      if (seen.has(k)) continue
      seen.add(k)
      const r = applyOps(contiguousView(c.base), c.prelude)
      if ('error' in r) {
        bad.push(`${k}: ${r.error}`)
        continue
      }
      const start = { shape: [...r.view.shape], strides: [...r.view.strides], offset: r.view.offset, contiguous: isContiguous(r.view) }
      if (JSON.stringify(start) !== JSON.stringify(c.start)) bad.push(`${k}: ${JSON.stringify(start)} against ${JSON.stringify(c.start)}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  test('every operation gives torch\'s result, or torch\'s error, and moves what torch moved', () => {
    const bad: string[] = []
    const kinds = new Map<string, number>()
    const outcomes = { notViewable: 0, badShape: 0, copied: 0, overlap: 0 }
    for (const c of fixture.cases) {
      const start: TView = { shape: c.start.shape, strides: c.start.strides, offset: c.start.offset }
      const r = applyOp(start, c.op)
      const label = `${JSON.stringify(c.base)} ${JSON.stringify(c.start)} ${JSON.stringify(c.op)}`
      kinds.set(c.op.op, (kinds.get(c.op.op) ?? 0) + 1)
      if ('error' in c.torch) {
        if (c.torch.error === 'not-viewable') outcomes.notViewable++
        else outcomes.badShape++
        if (!('error' in r) || r.error !== c.torch.error) bad.push(`${label}: torch ${c.torch.error}, model ${JSON.stringify(r)}`)
        continue
      }
      if ('error' in r) {
        bad.push(`${label}: torch answered, model ${r.error}`)
        continue
      }
      if (!c.torch.shared) outcomes.copied++
      if (c.torch.overlap) outcomes.overlap++
      const mine = { shape: [...r.view.shape], strides: [...r.view.strides], offset: r.view.offset }
      // A size-1 dim's stride is free in a view, and torch's choice there is the model's own to match: compare the whole thing.
      const want = { shape: c.torch.shape, strides: c.torch.strides, offset: c.torch.offset }
      if (JSON.stringify(mine) !== JSON.stringify(want)) bad.push(`${label}: torch ${JSON.stringify(want)}, model ${JSON.stringify(mine)}`)
      if (isContiguous(r.view) !== c.torch.contiguous) bad.push(`${label}: contiguous`)
      if (hasInternalOverlap(r.view) !== c.torch.overlap) bad.push(`${label}: overlap`)
      // torch shares the storage exactly when nothing was copied, and a copy moves every element of the result.
      if ((r.copied === 0) !== c.torch.shared) bad.push(`${label}: shared ${String(c.torch.shared)}, copied ${r.copied}`)
      if (r.copied !== 0 && r.copied !== numel(c.torch.shape)) bad.push(`${label}: copied ${r.copied} of ${numel(c.torch.shape)}`)
    }
    expect(bad.slice(0, 8)).toEqual([])
    for (const n of Object.values(outcomes)) expect(n).toBeGreaterThan(50)
    for (const op of ['view', 'reshape', 'permute', 'transpose', 'expand', 'slice', 'contiguous']) expect(kinds.get(op) ?? 0).toBeGreaterThan(50)
  })

  test('the elements in logical order are torch\'s, through the buffer of the base', () => {
    const bad: string[] = []
    let checked = 0
    for (const c of fixture.cases) {
      if ('error' in c.torch || !c.torch.values) continue
      const start: TView = { shape: c.start.shape, strides: c.start.strides, offset: c.start.offset }
      const r = applyOp(start, c.op)
      if ('error' in r) continue
      // The base holds its own addresses, so a view shows its addresses. A copy (`reshape` or `contiguous`) lays the elements it read, in the order it read them.
      const values = r.copied === 0 ? addresses(r.view) : addresses(start)
      checked++
      if (JSON.stringify(values) !== JSON.stringify(c.torch.values)) bad.push(`${JSON.stringify(c.base)} ${JSON.stringify(c.start)} ${JSON.stringify(c.op)}`)
    }
    expect(checked).toBeGreaterThan(3000)
    expect(bad.slice(0, 5)).toEqual([])
  })
})

