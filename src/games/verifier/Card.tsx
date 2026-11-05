import { Readout } from '@/design/components/Readout'

/*
 * The Tasting's notional-machine card, on the page (A§5.9, D-012): what the world models, what it ignores and what it was calibrated
 * against. The full card is content/cards/spec.md, which names the sampler's model (packages/sim/spec) and cites its claims. The
 * distributions are a world's invention, so each figure here says synthetic.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-verifier-card="">
      <p>
        <strong>Models.</strong> One speculative round. The commis (the draft model) plates courses ahead with probabilities q, and the chef (the target) tastes them in order with
        probabilities p. She keeps a plate with probability min(1, p ÷ q), stops at the first plate she sends back, re-plates it from the residual (p − q)⁺, and plates one extra course
        herself when she kept them all (the bonus token). What goes out is p exactly. Every probability is a count of plates out of sixty-four, and every grade is worked out in fractions, not
        sampled.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>Dishes in the vocabulary</dt>
        <dd>
          <Readout value={6} unit="tokens" tag="synthetic" size="sm" />
        </dd>
        <dt>Plates in a full tasting</dt>
        <dd>
          <Readout value={64} tag="synthetic" size="sm" />
        </dd>
        <dt>Rounds a run can draw</dt>
        <dd>
          <Readout value={20000} tag="estimated" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>Ignores.</strong> A real engine and real logits. Draft trees, temperature beyond zero and one, top-k and top-p, and the numerics of real probabilities: a distribution here is six whole
        numbers. The cost of drafting appears only in the level about how far ahead to plate, where it is a made-up fraction of a tasting.
      </p>
      <p>
        <strong>Calibrated against.</strong> Nothing yet. The chi-square lab and the real engine are the judge: the course checks the same ideas on vLLM and SGLang. The accept rule and the
        residual are the paper&apos;s (claim spec.paper.accept-or-resample), and vLLM&apos;s sampler follows it (claim vllm.spec.rejection-sampler.exact).
      </p>
    </div>
  )
}
