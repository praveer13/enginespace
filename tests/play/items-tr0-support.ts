/**
 * What the four TR0 family tests share (W2b-T29): a reader of the lines of PyTorch that a ticket prints, and an oracle that does not use
 * `@es/sim/tensor`. The oracle holds a tensor as the buffer position of each of its elements in logical order, applies each call to
 * those positions the way PyTorch's documents describe it, and answers whether a result can still be read through strides (so `view`
 * works) from the positions alone. A key that the model gives and this oracle confirms is held to something other than the code that wrote it.
 */
import type { Item } from '@es/play/items'

/** The code lines of a ticket, in order: the `line N` givens. */
export const linesOf = (item: Item): string[] =>
  item.givens.flatMap((given) => (given.label.startsWith('line ') && given.value.t === 'code' ? [given.value.code] : []))

const ints = (text: string): number[] => text.split(',').map((x) => Number(x.trim()))

export type Call =
  | { op: 'view' | 'reshape' | 'expand'; shape: number[] }
  | { op: 'permute'; order: number[] }
  | { op: 'transpose'; a: number; b: number }
  | { op: 'slice'; dim: number; step: number }
  | { op: 'contiguous' }

/** A line `b = a.<call>` read back as a call, from its text alone. */
export function parseCall(line: string): Call {
  const rhs = line.split(' = ')[1]
  let m: RegExpMatchArray | null
  if ((m = rhs.match(/^\w+\.(view|reshape|expand)\(([\d, ]+)\)$/))) return { op: m[1] as 'view' | 'reshape' | 'expand', shape: ints(m[2]) }
  if ((m = rhs.match(/^\w+\.permute\(([\d, ]+)\)$/))) return { op: 'permute', order: ints(m[1]) }
  if ((m = rhs.match(/^\w+\.transpose\((\d+), (\d+)\)$/))) return { op: 'transpose', a: Number(m[1]), b: Number(m[2]) }
  if ((m = rhs.match(/^\w+\[((?::, )*)::(\d+)\]$/))) return { op: 'slice', dim: m[1].length / 3, step: Number(m[2]) }
  if (/^\w+\.contiguous\(\)$/.test(rhs)) return { op: 'contiguous' }
  throw new Error(`not a call: ${line}`)
}

/** The shape in `a = torch.empty(...)`. */
export function parseStart(line: string): number[] {
  const m = line.match(/^a = torch\.empty\(([\d, ]+)\)$/)
  if (m === null) throw new Error(`not a start: ${line}`)
  return ints(m[1])
}

/** A tensor as its shape and the buffer position of each element in row-major order. */
export interface Positions {
  shape: number[]
  at: number[]
}

export const fresh = (shape: number[]): Positions => ({ shape, at: Array.from({ length: shape.reduce((a, b) => a * b, 1) }, (_, i) => i) })

const strideTable = (shape: number[]): number[] => shape.map((_, d) => shape.slice(d + 1).reduce((a, b) => a * b, 1))
const indexOf = (shape: number[], flat: number): number[] => shape.map((_, d) => Math.floor(flat / strideTable(shape)[d]) % shape[d])
const flatOf = (shape: number[], index: number[]): number => index.reduce((a, x, d) => a + x * strideTable(shape)[d], 0)

/** Whether the positions are of the form offset + sum(index * stride): the tensor can be read through strides, so `view` can give it. */
export function linear(t: Positions): number[] | null {
  const n = t.at.length
  if (n === 0) return t.shape.map(() => 0)
  const strides = t.shape.map((size, d) => {
    if (size === 1) return 0
    const index = t.shape.map(() => 0)
    index[d] = 1
    return t.at[flatOf(t.shape, index)] - t.at[0]
  })
  for (let k = 0; k < n; k += 1) {
    const index = indexOf(t.shape, k)
    if (t.at[k] !== t.at[0] + index.reduce((a, x, d) => a + x * strides[d], 0)) return null
  }
  return strides
}

/** What a call did: the new tensor, and the elements it moved. `fail` is a view() that cannot be done. */
export function run(t: Positions, call: Call): { t: Positions; moved: number } | 'fail' {
  const n = t.at.length
  switch (call.op) {
    case 'view':
    case 'reshape': {
      const next = { shape: call.shape, at: t.at }
      if (linear(next) !== null) return { t: next, moved: 0 }
      if (call.op === 'view') return 'fail'
      return { t: fresh(call.shape), moved: n }
    }
    case 'contiguous': {
      const consecutive = t.at.every((x, k) => x === t.at[0] + k)
      return consecutive ? { t, moved: 0 } : { t: fresh(t.shape), moved: n }
    }
    case 'transpose':
    case 'permute': {
      const order = call.op === 'permute' ? call.order : t.shape.map((_, d) => (d === call.a ? call.b : d === call.b ? call.a : d))
      const shape = order.map((d) => t.shape[d])
      const at = Array.from({ length: n }, (_, k) => {
        const index = indexOf(shape, k)
        const old = t.shape.map(() => 0)
        order.forEach((d, i) => (old[d] = index[i]))
        return t.at[flatOf(t.shape, old)]
      })
      return { t: { shape, at }, moved: 0 }
    }
    case 'expand': {
      const lead = call.shape.length - t.shape.length
      const at = Array.from({ length: call.shape.reduce((a, b) => a * b, 1) }, (_, k) => {
        const index = indexOf(call.shape, k).slice(lead)
        return t.at[flatOf(t.shape, index.map((x, d) => (t.shape[d] === 1 ? 0 : x)))]
      })
      return { t: { shape: call.shape, at }, moved: 0 }
    }
    case 'slice': {
      const shape = t.shape.map((size, d) => (d === call.dim ? Math.ceil(size / call.step) : size))
      const at = Array.from({ length: shape.reduce((a, b) => a * b, 1) }, (_, k) => {
        const index = indexOf(shape, k)
        index[call.dim] *= call.step
        return t.at[flatOf(t.shape, index)]
      })
      return { t: { shape, at }, moved: 0 }
    }
  }
}

/** The stride of dimension `d` read off the positions: the distance in the buffer of one step along it. */
export function strideOf(t: Positions, d: number): number {
  const index = t.shape.map(() => 0)
  index[d] = 1
  return t.at[flatOf(t.shape, index)] - t.at[0]
}
