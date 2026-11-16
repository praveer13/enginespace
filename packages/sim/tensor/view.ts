// A tensor as a buffer plus metadata (ARCHITECTURE §5.8; GAMES.md §4): the view rules of PyTorch, for the strides alone.
//
// A `TView` is an offset, a shape and the strides, all in elements. The buffer is not part of it: a view never changes the buffer, and
// the only operation that makes a new one is a copy, which this model reports as a count of elements moved. The rules follow
// PyTorch's (`TensorImpl::is_contiguous`, `computeStride` in `TensorUtils.cpp`, `Tensor.expand`, basic slicing), and
// tests/fixtures/tensor/torch-vectors.json holds what torch 2.14.0 answered for thousands of cases, which tests/sim/tensor-torch.test.ts
// replays (W2-T13).
//
// What the model leaves out: dtypes (an element is a cell), negative strides (torch has none either), `-1` in a shape (a picker gives
// sizes), and the wrapping of a negative `slice` bound beyond what `slice` below says.

export interface TView {
  readonly offset: number
  readonly shape: readonly number[]
  readonly strides: readonly number[]
}

export type ShiftOp =
  | { readonly op: 'view' | 'reshape'; readonly shape: readonly number[] }
  | { readonly op: 'permute'; readonly order: readonly number[] }
  | { readonly op: 'transpose'; readonly a: number; readonly b: number }
  | { readonly op: 'expand'; readonly shape: readonly number[] }
  | { readonly op: 'slice'; readonly dim: number; readonly start: number; readonly stop: number; readonly step: number }
  | { readonly op: 'contiguous' }

export type OpError = 'not-viewable' | 'bad-shape'
export type OpResult = { readonly view: TView; readonly copied: number } | { readonly error: OpError }

export function numel(shape: readonly number[]): number {
  let n = 1
  for (const d of shape) n *= d
  return n
}

/** The strides of a contiguous tensor of this shape: a size-1 dim gets the stride a size of 1 would give, as torch does. */
export function contiguousStrides(shape: readonly number[]): number[] {
  const out = new Array<number>(shape.length)
  let s = 1
  for (let i = shape.length - 1; i >= 0; i--) {
    out[i] = s
    s *= Math.max(shape[i] ?? 1, 1)
  }
  return out
}

export function contiguousView(shape: readonly number[]): TView {
  return { offset: 0, shape: [...shape], strides: contiguousStrides(shape) }
}

/** True when the elements lie in memory in logical order with no gaps. An empty tensor is contiguous, and a size-1 dim's stride is ignored. */
export function isContiguous(v: TView): boolean {
  if (numel(v.shape) === 0) return true
  let expected = 1
  for (let i = v.shape.length - 1; i >= 0; i--) {
    const size = v.shape[i] ?? 1
    if (size === 1) continue
    if (v.strides[i] !== expected) return false
    expected *= size
  }
  return true
}

/** True when two logical elements share an address, which is what a stride of 0 over more than one element does. Writing to such a tensor is wrong. */
export function hasInternalOverlap(v: TView): boolean {
  if (numel(v.shape) === 0) return false
  for (let i = 0; i < v.shape.length; i++) if ((v.shape[i] ?? 1) > 1 && v.strides[i] === 0) return true
  return false
}

/** The address of every element in logical (row-major) order. */
export function addresses(v: TView): number[] {
  const n = numel(v.shape)
  const out = new Array<number>(n)
  const rank = v.shape.length
  const idx = new Array<number>(rank).fill(0)
  let addr = v.offset
  for (let k = 0; k < n; k++) {
    out[k] = addr
    for (let d = rank - 1; d >= 0; d--) {
      idx[d] = (idx[d] ?? 0) + 1
      addr += v.strides[d] ?? 0
      if (idx[d] === v.shape[d]) {
        addr -= (v.shape[d] ?? 0) * (v.strides[d] ?? 0)
        idx[d] = 0
      } else break
    }
  }
  return out
}

const validShape = (s: readonly number[]) => s.every((d) => Number.isInteger(d) && d >= 0)

/**
 * The strides that give `newShape` over the same elements as `v`, or null when no strides do: PyTorch's `computeStride`. Dims of `v` merge
 * into one chunk while each stride is the next one's stride times its size, and a new dim must fall inside a chunk.
 */
export function viewStrides(v: TView, newShape: readonly number[]): number[] | null {
  const oldShape = v.shape
  const n = numel(oldShape)
  // An empty tensor keeps its strides for its own shape, and gets contiguous ones for any other (ATen's computeStride).
  if (n === 0) return oldShape.length === newShape.length && oldShape.every((d, i) => d === newShape[i]) ? [...v.strides] : contiguousStrides(newShape)
  if (oldShape.length === 0) return newShape.map(() => 1)
  const out = new Array<number>(newShape.length).fill(0)
  let viewD = newShape.length - 1
  let chunkBase = v.strides[oldShape.length - 1] ?? 1
  let tensorNumel = 1
  let viewNumel = 1
  for (let d = oldShape.length - 1; d >= 0; d--) {
    tensorNumel *= oldShape[d] ?? 1
    const boundary = d === 0 || (oldShape[d - 1] !== 1 && v.strides[d - 1] !== tensorNumel * chunkBase)
    if (boundary) {
      while (viewD >= 0 && (viewNumel < tensorNumel || newShape[viewD] === 1)) {
        out[viewD] = viewNumel * chunkBase
        viewNumel *= newShape[viewD] ?? 1
        viewD--
      }
      if (viewNumel !== tensorNumel) return null
      if (d > 0) {
        chunkBase = v.strides[d - 1] ?? 1
        tensorNumel = 1
        viewNumel = 1
      }
    }
  }
  return viewD === -1 ? out : null
}

function resolveDim(dim: number, rank: number): number | null {
  if (!Number.isInteger(dim)) return null
  const d = dim < 0 ? dim + rank : dim
  return d >= 0 && d < rank ? d : null
}

function copyOf(v: TView): { view: TView; copied: number } {
  return { view: contiguousView(v.shape), copied: numel(v.shape) }
}

/**
 * One operation on a view. `view` and `reshape` take the target shape; `view` fails with 'not-viewable' where the strides cannot express it,
 * and `reshape` copies there instead. `contiguous` copies unless the view is contiguous already. `copied` is the count of elements moved.
 * 'bad-shape' is every other mistake: a wrong element count, a bad dim or order, a size that cannot expand, a step below 1.
 */
export function applyOp(v: TView, o: ShiftOp): OpResult {
  switch (o.op) {
    case 'view':
    case 'reshape': {
      if (!validShape(o.shape) || numel(o.shape) !== numel(v.shape)) return { error: 'bad-shape' }
      const strides = viewStrides(v, o.shape)
      if (strides) return { view: { offset: v.offset, shape: [...o.shape], strides }, copied: 0 }
      if (o.op === 'view') return { error: 'not-viewable' }
      return copyOf({ ...v, shape: o.shape })
    }
    case 'permute': {
      const rank = v.shape.length
      if (o.order.length !== rank) return { error: 'bad-shape' }
      const seen = new Set<number>()
      const order: number[] = []
      for (const raw of o.order) {
        const d = resolveDim(raw, rank)
        if (d === null || seen.has(d)) return { error: 'bad-shape' }
        seen.add(d)
        order.push(d)
      }
      return { view: { offset: v.offset, shape: order.map((d) => v.shape[d] ?? 1), strides: order.map((d) => v.strides[d] ?? 0) }, copied: 0 }
    }
    case 'transpose': {
      const rank = v.shape.length
      const a = resolveDim(o.a, rank)
      const b = resolveDim(o.b, rank)
      if (a === null || b === null) return { error: 'bad-shape' }
      const order = Array.from({ length: rank }, (_, i) => (i === a ? b : i === b ? a : i))
      return applyOp(v, { op: 'permute', order })
    }
    case 'expand': {
      const rank = v.shape.length
      if (!validShape(o.shape) || o.shape.length < rank) return { error: 'bad-shape' }
      const lead = o.shape.length - rank
      const shape: number[] = []
      const strides: number[] = []
      for (let i = 0; i < o.shape.length; i++) {
        const want = o.shape[i] ?? 1
        if (i < lead) {
          shape.push(want)
          strides.push(0)
          continue
        }
        const size = v.shape[i - lead] ?? 1
        const stride = v.strides[i - lead] ?? 0
        if (size === want) {
          shape.push(size)
          strides.push(stride)
        } else if (size === 1) {
          shape.push(want)
          strides.push(0)
        } else return { error: 'bad-shape' }
      }
      return { view: { offset: v.offset, shape, strides }, copied: 0 }
    }
    case 'slice': {
      const d = resolveDim(o.dim, v.shape.length)
      if (d === null || !Number.isInteger(o.start) || !Number.isInteger(o.stop) || !Number.isInteger(o.step) || o.step < 1) return { error: 'bad-shape' }
      const size = v.shape[d] ?? 0
      const clamp = (x: number) => Math.min(Math.max(x < 0 ? x + size : x, 0), size)
      const start = clamp(o.start)
      const stop = Math.max(clamp(o.stop), start)
      const len = Math.ceil((stop - start) / o.step)
      const shape = [...v.shape]
      const strides = [...v.strides]
      shape[d] = len
      strides[d] = (v.strides[d] ?? 0) * o.step
      // A slice that is empty keeps the offset of its start, as torch does, so the start stays inside the buffer.
      return { view: { offset: v.offset + start * (v.strides[d] ?? 0), shape, strides }, copied: 0 }
    }
    case 'contiguous':
      return isContiguous(v) ? { view: v, copied: 0 } : copyOf(v)
  }
}

/** The ops of a chain, applied in order: the first error stops it. `copied` is the total. */
export function applyOps(v: TView, ops: readonly ShiftOp[]): OpResult {
  let cur = v
  let copied = 0
  for (const o of ops) {
    const r = applyOp(cur, o)
    if ('error' in r) return r
    cur = r.view
    copied += r.copied
  }
  return { view: cur, copied }
}
