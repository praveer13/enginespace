/**
 * TR0's predictions that are revealed at commit (D-067): each question carries a tensor of its own that no level of Tensor views plays, and
 * the answer is the tensor model's own rule on it (`packages/sim/tensor`), which takes no run. tests/play/predictions.test.ts holds each
 * to the figure that tests/content/tr0-demos.ts computes.
 */
import { applyOp, contiguousView } from '@es/sim/tensor'
import { figure } from './figure'
import type { Commit } from './types'

/** The strides of `x[:, ::2]` on a contiguous tensor of shape `(3, 5)`. */
function sliceStrides(): readonly number[] {
  const out = applyOp(contiguousView([3, 5]), { op: 'slice', dim: 1, start: 0, stop: 5, step: 2 })
  if ('error' in out) throw new RangeError('the slice of the question is not a legal one')
  return out.view.strides
}

export const COMMITS: Readonly<Record<string, Commit>> = {
  'tr0.l1.p2': {
    says: ['`(3, 5)`', '`y = x[:, ::2]`', '`y.stride(1)`'],
    working: [
      `A contiguous tensor of shape (3, 5) is read row by row, so its strides are (${figure(5)}, ${figure(1)}): one step down a row skips the row's ${figure(5)} elements, and one step along it moves one.`,
      'A slice with a step keeps the buffer and the offset, and multiplies the stride of its dimension by the step.',
      `The columns' stride becomes ${figure(1)} × ${figure(2)}, so y.stride(1) returns ${figure(sliceStrides()[1])}.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => sliceStrides()[1],
  },
}
