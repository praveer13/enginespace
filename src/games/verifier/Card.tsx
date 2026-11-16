import { Readout } from '@/design/components/Readout'

/*
 * The rejection sampler's model card, as the title block's "What this model leaves out" opens it (A§5.9, D-012): what the world models, what
 * it ignores and what it was calibrated against. The full card is content/cards/spec.md, which names the sampler's model (packages/sim/spec)
 * and cites its claims. The distributions are a world's invention, so each figure here says synthetic.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-verifier-card="">
      <p>
        <strong>Models.</strong> One speculative round. The draft model proposes tokens ahead with probabilities q, and the target model checks them in order with probabilities p.
        It accepts a draft token with probability min(1, p ÷ q), stops at the first rejection, resamples that token from the residual (p − q)⁺, and adds one extra token itself
        when it accepted them all (the bonus token). The output is p exactly. Every probability is a count out of 64, and every grade is worked out in fractions, not sampled.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>Tokens in the vocabulary</dt>
        <dd>
          <Readout value={6} unit="tokens" tag="synthetic" size="sm" />
        </dd>
        <dt>Sixty-fourths in a full distribution</dt>
        <dd>
          <Readout value={64} tag="synthetic" size="sm" />
        </dd>
        <dt>Rounds a run can draw</dt>
        <dd>
          <Readout value={20000} tag="estimated" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>Ignores.</strong> A real engine and real logits. Draft trees, temperature beyond zero and one, top-k and top-p, and the numerics of real probabilities: a distribution here is
        six whole numbers. The cost of drafting appears only in the level about the draft length, where it is a made-up fraction of a target forward.
      </p>
      <p>
        <strong>Calibrated against.</strong> Nothing yet. The chi-square lab and the real engine are the judge: the course checks the same ideas on vLLM and SGLang. The accept rule and the
        residual are the paper&apos;s (claim spec.paper.accept-or-resample), and vLLM&apos;s sampler follows it (claim vllm.spec.rejection-sampler.exact).
      </p>
    </div>
  )
}
