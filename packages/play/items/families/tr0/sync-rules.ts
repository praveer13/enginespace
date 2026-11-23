/**
 * The rule table of `tr0.find-the-sync` (W2b-T29): which calls on a GPU tensor wait for the GPU and which only queue work, each row a
 * claim read in the PyTorch 2.14 documents and listed in content/claims/tr0.yaml. A call that no claim states is not in the table, so
 * no question rests on it: printing a GPU tensor is left out because no page read says it waits (claim torch.cuda.print-waits is
 * [unverified]), and so is `float(x)` or a comparison in an `if`.
 *
 * tests/play/items-find-the-sync.test.ts holds every row to the claims file: each `claims` entry exists, is tagged measured and is
 * pinned to torch, and the words of a waiting row are what its claims say.
 *
 * Pure (D-017): data and string building, no DOM, no clock, no entropy.
 */

export interface SyncRule {
  readonly id: string
  /** Whether a call of this kind waits for the GPU. */
  readonly waits: boolean
  /** The line, from the name of the GPU tensor it reads and the name it assigns to. */
  readonly line: (src: string, dest: string) => string
  /** The claims of content/claims/tr0.yaml that state the row. */
  readonly claims: readonly string[]
  /** What a learner reads on the reveal: why the call waits, or why it does not. No digit: a number is a tagged part. */
  readonly why: string
}

export const SYNC_RULES: readonly SyncRule[] = [
  {
    id: 'item',
    waits: true,
    line: (src, dest) => `${dest} = ${src}.sum().item()`,
    claims: ['torch.cuda.item-synchronizes'],
    why: 'item() brings one value to Python (a tensor of many values has no single value, so it is called on a sum, a tensor of one value), and PyTorch names it as a call that synchronizes the CPU with the GPU, so the line waits until the GPU has finished the work queued before it.',
  },
  {
    id: 'tolist',
    waits: true,
    line: (src, dest) => `${dest} = ${src}.tolist()`,
    claims: ['torch.tolist.moves-to-cpu', 'torch.cpu.copies'],
    why: 'tolist() moves the tensor to the CPU first, and a copy from the GPU to the CPU is a call that waits, so the line waits until the GPU has finished the work queued before it.',
  },
  {
    id: 'cpu',
    waits: true,
    line: (src, dest) => `${dest} = ${src}.cpu()`,
    claims: ['torch.cpu.copies'],
    why: 'cpu() returns a copy in CPU memory, and the copy off a GPU is a transfer that waits, so the line waits until the GPU has finished the work queued before it.',
  },
  {
    id: 'to-cpu',
    waits: true,
    line: (src, dest) => `${dest} = ${src}.to('cpu')`,
    claims: ['torch.to.copies', 'torch.cuda.non-blocking'],
    why: 'to() across devices is a copy, and unless the call asks for non_blocking it synchronizes, so the line waits until the GPU has finished the work queued before it.',
  },
  {
    id: 'synchronize',
    waits: true,
    line: () => 'torch.cuda.synchronize()',
    claims: ['torch.cuda.synchronize-waits'],
    why: 'torch.cuda.synchronize() waits for all kernels in all streams on the device to complete: waiting is all that it does.',
  },
  {
    id: 'sum',
    waits: false,
    line: (src, dest) => `${dest} = ${src}.sum()`,
    claims: ['torch.cuda.enqueued'],
    why: 'sum() enqueues its work on the GPU and returns before the sum is done, so the line does not wait.',
  },
  {
    id: 'matmul',
    waits: false,
    line: (src, dest) => `${dest} = ${src} @ w`,
    claims: ['torch.cuda.async-by-default', 'torch.cuda.enqueued'],
    why: 'A matrix product is a GPU operation, and GPU operations are asynchronous by default: it is enqueued and the line returns at once.',
  },
  {
    id: 'softmax',
    waits: false,
    line: (src, dest) => `${dest} = torch.softmax(${src}, dim=-1)`,
    claims: ['torch.cuda.async-by-default', 'torch.cuda.enqueued'],
    why: 'softmax is a GPU operation, and GPU operations are asynchronous by default: it is enqueued and the line returns at once.',
  },
  {
    id: 'scale',
    waits: false,
    line: (src, dest) => `${dest} = ${src} * 0.5`,
    claims: ['torch.cuda.async-by-default', 'torch.cuda.enqueued'],
    why: 'An elementwise product is a GPU operation, and GPU operations are asynchronous by default: it is enqueued and the line returns at once.',
  },
  {
    id: 'view',
    waits: false,
    line: (src, dest) => `${dest} = ${src}.view(-1)`,
    claims: ['torch.views.no-data-moves'],
    why: 'view() moves no data: it changes how the same data is read, so there is no GPU work to wait for.',
  },
  {
    id: 'transpose',
    waits: false,
    line: (src, dest) => `${dest} = ${src}.transpose(0, 1)`,
    claims: ['torch.views.no-data-moves', 'torch.views.view-ops'],
    why: 'transpose() makes a view and moves no data, so there is no GPU work to wait for.',
  },
]

export const WAITING = SYNC_RULES.filter((rule) => rule.waits)
export const QUEUING = SYNC_RULES.filter((rule) => !rule.waits)

export const ruleById = (id: string): SyncRule => {
  const rule = SYNC_RULES.find((candidate) => candidate.id === id)
  if (rule === undefined) throw new RangeError(`tr0.find-the-sync: no rule "${id}"`)
  return rule
}
