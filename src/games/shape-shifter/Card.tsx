import { Readout } from '@/design/components/Readout'

/*
 * Tensor views' model card, as the title block's "What this model leaves out" opens it and /about prints it (A§5.9, D-012): what the model
 * keeps, what it leaves out and what it was checked against. The full card is content/cards/tensor.md, which names packages/sim/tensor.
 * The program cap is the level's design and not Triton's, so it says estimated.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-shift-card="">
      <p>
        <strong>Keeps.</strong> A tensor as a buffer read through an offset, a shape and one stride for each dimension, every stride and address counted in elements. A view
        (<code>transpose</code>, <code>permute</code>, <code>expand</code>, a slice, or a <code>view</code> the strides can express) changes only that reading and never the buffer.
        A <code>view</code> the strides cannot express is refused, as PyTorch refuses it. <code>reshape</code> is a view where <code>view</code> would work and a copy where it would
        not, and <code>contiguous()</code> copies every element unless the tensor is contiguous already. On the grid level, one program covers one BLOCK-sized tile, and a lane past
        the edge is masked.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>Programs a launch may have, on the grid level</dt>
        <dd>
          <Readout value={6} tag="estimated" size="sm" />
        </dd>
      </dl>
      <p>The cap is arbitrary: it stands for the cost of launching many small programs, which the model does not count. Without it a BLOCK of 1 would mask nothing.</p>
      <p>
        <strong>Leaves out.</strong> Bytes and dtypes, devices, negative strides, advanced indexing, writes through a view, and what a kernel costs: warps, memory coalescing and the
        time a program takes. No kernel runs; the grid is the arithmetic of each program&apos;s tile.
      </p>
      <p>
        <strong>Checked against.</strong> PyTorch&apos;s own answers for the view rules, from the pinned version run on a CPU, which the model replays case by case. Nothing for the grid
        yet: its counts are arithmetic, held to their formulas.
      </p>
    </div>
  )
}
