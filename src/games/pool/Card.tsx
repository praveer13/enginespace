import { Readout } from '@/design/components/Readout'

/*
 * The Reach-In's notional-machine card, on the page (A§5.9, D-012): what its world models, what it ignores and what it was calibrated
 * against. The full card is content/cards/kv.md, which names the hybrid KV manager of packages/sim/kv. The sizes of the pool and the
 * night are the game's own and a world's invention, so each says synthetic.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-pool-card="">
      <p>
        <strong>Models.</strong> One pool of pans, every pan the same size, for every station and every recipe kit. A station keeps every pan of an order, or only the pans of its
        hold window, or a few pans of state. A ticket&apos;s hit is the longest start that every station still holds, so a sliding window can cut a hit short. A pan nobody holds
        keeps its tape and goes to the rotation, the tail of an order before its head, and a pan taken from the rotation loses its tape. A ticket hangs all or nothing, and a kit
        takes ⌈its bytes ÷ a pan&apos;s bytes⌉ pans of the same pool, as S-LoRA does, which is not what vLLM or SGLang do at the pins: they keep kits on a shelf of fixed slots.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>Tokens in a block</dt>
        <dd>
          <Readout value={16} unit="tokens" tag="estimated" size="sm" />
        </dd>
        <dt>Tokens a ticket decodes in a step</dt>
        <dd>
          <Readout value={16} unit="tokens" tag="synthetic" size="sm" />
        </dd>
        <dt>A stalled step costs</dt>
        <dd>
          <Readout value={24} unit="tokens" tag="estimated" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>The house.</strong> It is the engine&apos;s pool with two refinements, both from one rule: it hangs the ticket the reach-in already holds the most of, and it dumps
        the cheapest pans, the ones that cost the waiting tickets the fewest tokens. The engine&apos;s own pool hangs first come first served and dumps the rotation&apos;s next.
      </p>
      <p>
        <strong>Ignores.</strong> The bytes inside a pan, how fast attention runs at a pan size, copy-on-write, chunked prefill, and every tier beyond the GPU. A ticket decodes a
        fixed number of tokens a step, and a kit&apos;s landing is a few steps. The sizes are made up.
      </p>
      <p>
        <strong>Calibrated against.</strong> Nothing numeric yet. The rules are the pinned engines&apos;, and the real engine is the judge: the course checks the same ideas on vLLM
        and SGLang.
      </p>
    </div>
  )
}
