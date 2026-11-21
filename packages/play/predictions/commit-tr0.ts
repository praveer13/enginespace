/**
 * TR0's predictions that are revealed at commit (D-067): each question carries a tensor of its own that no level of Tensor views plays, and
 * the answer is the tensor model's own rule on it (`packages/sim/tensor`), which takes no run. tests/play/predictions.test.ts holds each
 * to the figure that tests/content/tr0-demos.ts computes.
 */
import { applyOp, contiguousView, gridCoverage } from '@es/sim/tensor'
import { ruleById } from '../items/families/tr0/sync-rules'
import { figure } from './figure'
import type { Commit } from './types'

/** The strides of `x[:, ::2]` on a contiguous tensor of shape `(3, 5)`. */
function sliceStrides(): readonly number[] {
  const out = applyOp(contiguousView([3, 5]), { op: 'slice', dim: 1, start: 0, stop: 5, step: 2 })
  if ('error' in out) throw new RangeError('the slice of the question is not a legal one')
  return out.view.strides
}

/** Of the four lines of lesson 2's guess, how many wait for the GPU: each line is the rule of its last call, in the table of `tr0.find-the-sync`. */
function syncingLines(): number {
  return ['sum', 'item', 'tolist', 'cpu'].filter((id) => ruleById(id).waits).length
}

/** The launch of `scale` with BLOCK 128 over 1000 elements on the default grid: its programs, lanes and masked lanes. */
function launch1000(): { programs: number; lanes: number; masked: number } {
  const out = gridCoverage([1000], [128])
  if ('error' in out) throw new RangeError('the launch of the question is not a legal one')
  return out
}

/** Mini-SGLang's attention projects the query, the key and the value through one merged linear layer: one `F.linear`, so one matrix multiply. */
const MERGED_MULTIPLIES = 1

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
  'tr0.l2.p2': {
    says: ['n = x.sum().item()', 'ids = x.tolist()', 'small = x.cpu()'],
    working: [
      'A call on a GPU tensor waits when it brings a value or a tensor back to the CPU. A call that only does GPU work is enqueued, and the line returns before the work is done.',
      '`y = x.sum()` enqueues the sum, so it does not wait. `n = x.sum().item()` enqueues the sum and then calls `.item()`, which synchronizes the CPU with the GPU, so it waits. `ids = x.tolist()` moves the tensor to the CPU first, and `small = x.cpu()` makes a copy off the GPU, and a copy off a GPU waits.',
      `So ${figure(syncingLines())} of the 4 lines wait.`,
    ],
    sources: [
      { claim: 'torch.cuda.enqueued', text: 'PyTorch 2.14 documentation, CUDA semantics, Asynchronous execution' },
      { claim: 'torch.cuda.item-synchronizes', text: 'PyTorch 2.14 documentation, CUDA semantics, CUDA Graphs' },
      { claim: 'torch.tolist.moves-to-cpu', text: 'PyTorch 2.14 documentation, torch.Tensor.tolist' },
      { claim: 'torch.cpu.copies', text: 'PyTorch 2.14 documentation, torch.Tensor.cpu' },
    ],
    tag: 'derived',
    truth: () => syncingLines(),
  },
  'tr0.l3.p1': {
    says: ['16 attention heads', 'head size of 128', 'q_proj'],
    working: [
      'The query projection has one output row for each query head and each place in a head. The configuration gives the attention 16 heads and a head size of 128, and the hidden size of 1,024 plays no part.',
      `${figure(16)} × ${figure(128)} = ${figure(16 * 128)}, so \`q_proj\` has ${figure(16 * 128)} output rows.`,
    ],
    sources: [
      { claim: 'qwen3.config.heads', text: 'Qwen/Qwen3-0.6B at c1899de2, config.json, num_attention_heads' },
      { claim: 'qwen3.config.head-dim', text: 'Qwen/Qwen3-0.6B at c1899de2, config.json, head_dim' },
    ],
    tag: 'derived',
    truth: () => 16 * 128,
  },
  'tr0.l4.p2': {
    says: ['`BLOCK = 128`', '`1000`', '`triton.cdiv`'],
    working: [
      `triton.cdiv(1000, 128) rounds ${figure(1000)} ÷ ${figure(128)} up, so the grid has ${figure(launch1000().programs)} programs.`,
      `Each program has BLOCK lanes, so the launch has ${figure(launch1000().programs)} × ${figure(128)} = ${figure(launch1000().lanes)} lanes.`,
      `${figure(1000)} of them fall inside the tensor, so ${figure(launch1000().lanes)} − ${figure(1000)} = ${figure(launch1000().masked)} are masked, all in the last program.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => launch1000().masked,
  },
  'tr0.l5.p1': {
    says: ['three matrix multiplies', 'q_proj', 'one matmul'],
    working: [
      'The attention of lesson 3 has three linear layers, so it makes the query, the key and the value with three matrix multiplies.',
      'Mini-SGLang builds one merged linear layer for the three, whose output width is (heads + 2 × key and value heads) × head size, the three outputs side by side. A linear layer there is one call of F.linear on its weight, so one call is one matmul.',
      `So Mini-SGLang's attention uses ${figure(MERGED_MULTIPLIES)} matmul for the query, the key and the value.`,
    ],
    sources: [
      { claim: 'minisgl.attn.merged-qkv', text: 'Mini-SGLang at 9a91cfaf, python/minisgl/models/utils.py, RopeAttn' },
      { claim: 'minisgl.attn.qkv-one-matmul', text: 'Mini-SGLang at 9a91cfaf, python/minisgl/layers/linear.py, _LinearTPImpl.forward' },
    ],
    tag: 'measured',
    truth: () => MERGED_MULTIPLIES,
  },
}
