import { Readout } from '@/design/components/Readout'

/*
 * KV page pool's model card, as the title block's "What this model leaves out" opens it (A§5.9, D-012): what the model keeps, what it
 * leaves out and what it was calibrated against. The full card is content/cards/kv.md, which names the hybrid KV manager of packages/sim/kv.
 * The sizes of the pool and of the run are the model's own, so each says synthetic or estimated.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-pool-card="">
      <p>
        <strong>Keeps.</strong> One pool of pages, every page the same size, for every KV group and every LoRA adapter. A full-attention group keeps every page of a request, a
        sliding-window group only the pages inside its window, and a state group a few pages for each request. A request&apos;s prefix hit is the longest prefix that every group
        still holds, so a sliding window can cut a hit short. A page nobody holds keeps its hash and joins the free queue, the tail of a prefix before its head, and a page taken
        from the free queue loses its hash. A request is admitted with all its pages or not at all, and an adapter takes ⌈its bytes ÷ a page&apos;s bytes⌉ pages of the same pool,
        as S-LoRA does. At the pins vLLM and SGLang do not: they keep adapters in a few fixed slots outside the pages.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>Tokens in a block</dt>
        <dd>
          <Readout value={16} unit="tokens" tag="estimated" size="sm" />
        </dd>
        <dt>Tokens a running request decodes in a step</dt>
        <dd>
          <Readout value={16} unit="tokens" tag="synthetic" size="sm" />
        </dd>
        <dt>A step spent waiting for an adapter costs</dt>
        <dd>
          <Readout value={24} unit="tokens" tag="estimated" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>The reference run.</strong> The engine&apos;s pool with two refinements, both from one rule: it admits the request whose prefix the pool already holds the most of,
        and it evicts the cheapest pages, the ones that cost the waiting requests the fewest tokens. The engine&apos;s own pool admits first come, first served, and evicts the free
        queue&apos;s next.
      </p>
      <p>
        <strong>Leaves out.</strong> The bytes inside a page, how fast attention runs at a page size, copy-on-write, chunked prefill, and every tier beyond the GPU. A running
        request decodes a fixed number of tokens a step, and an adapter loads in a few steps. The sizes are made up.
      </p>
      <p>
        <strong>Calibrated against.</strong> Nothing numeric yet. The rules are the pinned engines&apos;, and the real engine is the judge: the course checks the same ideas on vLLM
        and SGLang.
      </p>
    </div>
  )
}
