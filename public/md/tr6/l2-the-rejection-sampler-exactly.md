# The rejection sampler, exactly

_Speculation and structure · lesson `tr6.l2` · review · about 50 minutes [estimated]_

Builds on kernelspace: `ks:T5.L8`, `ks:T6.L6`, `ks:t5.speculative-decoding`.

Knowledge components: `tr6.exact-acceptance`, `tr6.residual-recovery`.

The last lesson counted tokens. This one is about which tokens. Speculative decoding is worth having only if it is exact: whatever the proposer guessed, the tokens that come out must be distributed as the target's own. The rule that makes it so is short enough to hold in your head and easy to get almost right. This lesson states it, proves it on a table small enough to read, shows what each way of getting it almost right puts out, and then reads how the two engines write it.

## The rule

Call the target's distribution at a position p and the draft's q, both over the same tokens. The proposer drew a token x from q. The sampler then does three things.

1. **Accept** x with probability `min(1, p(x) ÷ q(x))`. That is always, when the target likes x at least as much as the draft did, and with the ratio when it likes it less.
2. **Recover** if x is rejected. Stop the round there, and draw the replacement from the residual: the target's probability less the draft's, where that is positive, divided by its total. It is written (p − q)⁺ and normalised.
3. **Bonus** if every draft was accepted. Draw one more token from the target alone.

The paper says it in one sentence, and says the output is distributed as p. **min(1, p/q), then norm(max(0, p - q))** [measured] In The Tasting the commis plates the drafts and the chef is the target, which is why the game's verbs are keeping a plate and re-plating from what the commis under-plates. Commit to one number before you read the proof.

> **Predict `tr6.l2.p1`.** The target's distribution over three tokens is 0.6, 0.3 and 0.1 [estimated], and the draft's is 0.2, 0.3 and 0.5 [estimated]. The proposer draws a token from its own distribution, and the sampler accepts or rejects it by the rule above. What is the probability that it accepts?
>
> The learner commits to a number in `probability`, graded within a relative tolerance of `0.02` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Play The Tasting's `overlap` level on its practice seed, which asks the same question for a pair it draws.

> **Play.** The game `verifier`, level `overlap`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Why it is exact

The proof needs one pair of distributions. Take a target p and a draft q over three tokens, written in tenths.

| Token | p [estimated] | q [estimated] | min(p, q) [derived] | (p − q)⁺ [derived] |
|---|---|---|---|---|
| `a` | 0.5 | 0.2 | 0.2 | 0.3 |
| `b` | 0.3 | 0.5 | 0.3 | 0.0 |
| `c` | 0.2 | 0.3 | 0.2 | 0.0 |

A round puts out token y in one of two ways. The draft can be y and be kept, which has probability `q(y) × min(1, p(y) ÷ q(y)) = min(p(y), q(y))`, the third column. Or a draft can be rejected, and y can be the token that replaces it. A draft is rejected with probability one less the total of the third column, 1 − (0.2 + 0.3 + 0.2) = 0.3 [derived]. That total is α, the overlap Σ min(p, q), and it is the chance that a draft is accepted: 0.7 [derived].

The residual has the same total, and that is the whole proof. Since p adds up to one, p = min(p, q) + (p − q)⁺ token by token, so the residual adds up to `1 − α`, the chance of a rejection. A replacement drawn from the residual normalised, times the chance that there is one to draw, is the residual itself. So the chance of y is min(p(y), q(y)) + (p(y) − q(y))⁺ = p(y), for every y. Here a rejection happens 0.3 [derived] of the time, the residual is all on `a`, and `a` comes out 0.2 + 0.3 = 0.5 [derived] of the time, `b` 0.3 [derived] and `c` 0.2 [derived], which is p.

The proof used two things: that the kept part is min(p, q), and that the replacement carries exactly what the kept part lacks. Change either and the output is no longer p.

## The rules that look right

Here is what the same pair puts out under the exact rule and under six rules that are one change away from it. The last column is the total-variation distance from p: half the sum, over the tokens, of how far the output is from p [derived]. It is zero only for p.

| Rule | `a` [derived] | `b` [derived] | `c` [derived] | Distance from p [derived] |
|---|---|---|---|---|
| The exact rule | 0.500 | 0.300 | 0.200 | 0.000 |
| Re-plate from p | 0.350 | 0.390 | 0.260 | 0.150 |
| Re-plate from q | 0.260 | 0.450 | 0.290 | 0.240 |
| Re-plate from p with the rejected token taken out | 0.405 | 0.338 | 0.257 | 0.095 |
| Walk the residual one token along | 0.200 | 0.600 | 0.200 | 0.300 |
| Accept when p > q, with no coin | 1.000 | 0.000 | 0.000 | 0.500 |
| Accept every draft | 0.200 | 0.500 | 0.300 | 0.300 |

The first of them is the one that looks most natural. Re-plating from p feels right, since the target is the distribution you want. But the kept drafts have already served the target its share min(p, q) of each token, so a replacement drawn from all of p serves that share a second time, and `b`, which the kept drafts already served in full, comes out too often. The residual is the target less what has been served, and nothing else is.

> **A fast path with a spillover.** A service puts a fast path in front of a slow one. For each kind of request the fast path takes up to its capacity, and the demand beyond it spills over to the slow path. The service serves exactly the demand if the slow path takes the spillover alone. The accept step is the fast path, serving min(p, q) of each token, and the residual is the spillover, the excess of demand over capacity.
>
> Where it breaks: A service knows its demand and its capacity as counts and routes each request. Here both are probabilities, and the fast path does not know the demand. It proposes a token from q, and a coin cuts the proposals down to p. What carries over is the accounting. Whatever the fast path under-serves the slow path serves, and nothing more.

## In integers, with a coin

An engine writes the rule in floats, and a float comparison has a boundary, which is where the bugs of the next lesson live. The course's sampler writes it in whole numbers so that the boundary can be looked at. Every weight is out of 65,536 [estimated], so p and q are whole weights. The accept step draws a coin u uniformly from zero up to q(x), not including q(x), and keeps x when `u < p(x)`. That keeps it for exactly `min(p(x), q(x))` of the q(x) coins, so with probability `min(1, p ÷ q)`, with no float, and a token with `p(x) = 0` is kept for no coin at all.

The engines write the same test in floats, and each writes it its own way.

| Runner | Keeps x when | The coin |
|---|---|---|
| MRV1, the legacy runner | the draft's probability of x is above zero and p ÷ q is at least the coin **target_prob / draft_prob >= uniform_prob** [measured] | a float64 between zero and one, because its authors saw that a float32 could be exactly zero **float64** [measured] |
| MRV2, the default | p is greater than the coin times q, in log space **p(x) > u * q(x)** [measured] | drawn with `includes_zero=False` **includes_zero=False** [measured], which raises a draw to a floor **u = max(u, a minimum)** [measured] |
| The course | `u < p(x)` | an integer, below q(x) |

A comparison that includes its boundary, and a coin that can be exactly zero, keep a token that the target forbids: `p(x) = 0`, `u = 0`, and zero over q is at least zero. MRV1's authors saw the risk and moved to float64, which makes it negligible and does not make it impossible. MRV2 compares strictly and keeps the coin off zero. One engine's sampler shipped with a boundary of this kind, and the next lesson reads it.

## The residual, and the drafts with no q

The recovery has two forms in vLLM, and they are one rule. When the draft's probabilities are in hand, MRV2 draws from the residual r(x), the target's probability less the draft's where that is positive, **r(x) = max(p(x) - q(x), 0)** [measured] and MRV1 draws from the same excess without dividing by its sum, because it takes an argmax over the excess scaled by random numbers, and a scale does not move an argmax. **max(target_prob - draft_prob, 0)** [measured]

Not every proposer has probabilities. An n-gram lookup names a token and no distribution, and MRV1's sampler takes the draft's probabilities as optional, with a docstring that says they are not provided for n-gram speculation. **draft_probs can be None** [measured] Without them the engine takes the draft's probability of the token to be one, **draft_prob = 1** [measured] so q is one-hot on the drafted token. The accept test becomes p(x) against the coin, and the residual becomes the target with the rejected token removed. **the target with the draft token masked out** [measured] MRV2 says the same in a comment. **p with the rejected token zeroed** [measured] Put a one-hot q into the proof above and it still holds: a draft is kept with probability p(x), and the rejected ones are replaced from p without x.

That is also what a draft model gets by default. vLLM's `draft_sample_method` is `greedy`, in which the draft always picks its argmax token and its probabilities are treated as one-hot, and only the `probabilistic` setting keeps the draft's distribution for the ratio test, at the cost of GPU memory. **greedy** [measured] The one-hot q is not an approximation there. A draft that always picks its argmax draws its token from a distribution that is one-hot, whatever its softmax looks like, and the softmax is not what it sampled from.

At temperature zero the target's distribution is one-hot on its argmax, so `min(1, p ÷ q)` is one for the draft that equals the argmax and zero for any other: a draft is accepted if and only if it is the target's argmax. **accept if and only if the draft is the target's argmax** [measured] And before it verifies anything, vLLM runs the target's logits through temperature, top-k and top-p, **temperature, top-k and top-p on the target logits** [measured] so p in all of the above is the processed distribution, and exact means exact against what plain decoding would sample after those constraints.

> **Exactness belongs to the pair of rules.** The right recovery depends on the accept rule that goes with it. With the accept step above it is the residual. A residual behind an accept step that skips the coin is biased, and so is an exact accept step with a recovery from p. Other pairs of rules are exact too, and they keep fewer drafts. The Tasting's exact level fixes the accept rule and asks for the recovery, and the lab's bestiary breaks one half at a time.

> **Card.** The notional-machine card `spec`.

## What to carry

- A draft x from q is kept with probability `min(1, p ÷ q)`. The chance that a draft is kept is `α = Σ min(p, q)`, and the chance of a rejection is `1 − α`.
- A rejected draft is replaced from the residual, the target less the draft where positive, normalised. The residual's total is the chance of a rejection, which is why the output is p exactly.
- With no draft probabilities, as with an n-gram or a greedy draft, q is one-hot on the drafted token. A draft is kept with probability p(x), and a rejected one is replaced from p without x.

## Exit check

This lesson tests two skills: computing the chance that a drafted token is accepted, and saying why the rule leaves the output exactly the target's (`tr6.exact-acceptance`), and drawing the replacement for a rejected token from the excess of p over q, and saying what any other choice does (`tr6.residual-recovery`). The graded `exact` level draws a fresh pair of distributions, hides the live meter and takes one submission. You pass it when what goes out is exactly the target's, on three fresh pairs [estimated] (ASSESSMENT §4.3). The lab, `rejection-sampler`, is the same skill in Rust, and its checks `accept`, `residual` and `pick` are this lesson's rule in whole numbers.

> **Play.** The game `verifier`, level `exact`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Claims cited

- `spec.paper.accept-or-resample`: In speculative sampling a token x drawn from the draft distribution q is kept when q(x) is at most p(x), and otherwise rejected with probability 1 - p(x)/q(x). A rejected token is replaced by one drawn from the adjusted distribution norm(max(0, p(x) - q(x))), and the output is distributed as p. Value min(1, p/q), then norm(max(0, p - q)) [measured], checked 2026-11-04 (source: Leviathan, Kalman and Matias, Fast Inference from Transformers via Speculative Decoding, arXiv 2211.17192v2, section 2.3 (the fraction is typeset stacked on the page) <https://arxiv.org/html/2211.17192v2>, read 2026-11-04).
- `vllm.spec.draft-sample-greedy`: vLLM's draft_sample_method defaults to greedy, where the draft always picks its argmax token and its probabilities are treated as one-hot during rejection sampling. The other setting, probabilistic, samples the draft stochastically and keeps its logits for the probability-ratio test, at the cost of more GPU memory. Value greedy [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/config/speculative.py, SpeculativeConfig.draft_sample_method <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/speculative.py#L634-L640>, read 2026-11-05).
- `vllm.spec.mrv1.accept-test`: MRV1's rejection sampler accepts a drafted token when the draft's probability of it is above 0 and the target's probability divided by the draft's is at least a uniform draw. The comparison includes its boundary. Value target_prob / draft_prob >= uniform_prob [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, rejection_random_sample_kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L949-L951>, read 2026-11-05).
- `vllm.spec.mrv1.coin-float64`: MRV1 draws its uniform coins in float64 and not in float32, because with float32 there is, in its authors' words, a non-negligible chance that a coin is exactly 0.0. Value float64 [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, generate_uniform_probs <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L721-L725>, read 2026-11-05).
- `vllm.spec.mrv1.ngram-no-draft-probs`: MRV1's rejection sampler takes the draft's probabilities as an optional argument, and its docstring says they are not provided for n-gram speculation. Value draft_probs can be None [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, RejectionSampler.forward <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L137-L140>, read 2026-11-05).
- `vllm.spec.mrv1.one-hot-accept`: When a drafted token comes with no draft probabilities, MRV1 takes the draft's probability of it to be 1, so the accept test reduces to the target's probability of the token being at least the coin. Value draft_prob = 1 [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, rejection_random_sample_kernel (NO_DRAFT_PROBS) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L938-L951>, read 2026-11-05).
- `vllm.spec.mrv1.residual`: MRV1 draws the replacement for a rejected token from the target's probabilities minus the draft's, where positive. It does not divide by the sum first, because it takes an argmax over the residual scaled by random numbers. Value max(target_prob - draft_prob, 0) [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, sample_recovered_tokens_kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L1117-L1144>, read 2026-11-05).
- `vllm.spec.mrv1.residual-no-draft-probs`: When the draft has no probabilities, MRV1 draws the replacement from the target's probabilities with the rejected draft token masked out. Value the target with the draft token masked out [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, sample_recovered_tokens_kernel (NO_DRAFT_PROBS) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L1111-L1116>, read 2026-11-05).
- `vllm.spec.mrv2.accept-test`: MRV2, the default runner, accepts a drafted token x when the target's probability of x is greater than a draw u times the draft's probability of x. The comparison is strict, and the kernel does it in log space. Value p(x) > u * q(x) [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py, the acceptance kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py#L694-L697>, read 2026-11-05).
- `vllm.spec.mrv2.coin-call`: MRV2's acceptance kernel draws the coin u of every drafted token with the argument includes_zero set to False. Value includes_zero=False [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py, the acceptance kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py#L598>, read 2026-11-05).
- `vllm.spec.mrv2.coin-floor`: When includes_zero is False, the helper tl_rand32 raises a draw that falls below a minimum, _TL_RAND_MIN, up to that minimum, so that u is never exactly 0. Value u = max(u, a minimum) [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/sample/gumbel.py, tl_rand32 <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/sample/gumbel.py#L66-L70>, read 2026-11-05).
- `vllm.spec.mrv2.greedy-accept`: At temperature 0, MRV2 accepts a drafted token if and only if it is the target's argmax. Value accept if and only if the draft is the target's argmax [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py, the acceptance kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py#L599-L617>, read 2026-11-05).
- `vllm.spec.mrv2.one-hot-residual`: With a one-hot draft, MRV2's residual is the target distribution with the probability of the rejected draft token zeroed out. Value p with the rejected token zeroed [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py, the resampling kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py#L949-L961>, read 2026-11-05).
- `vllm.spec.mrv2.residual`: MRV2 replaces a rejected token with one drawn from the residual r(x), the target's probability minus the draft's where that is positive. It computes the residual's logits in log space, because it draws with Gumbel noise. Value r(x) = max(p(x) - q(x), 0) [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py, the resampling kernel <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py#L937-L948>, read 2026-11-05).
- `vllm.spec.sampling-constraints`: Before it verifies drafts, vLLM's rejection sampler runs the target model's logits through apply_sampling_constraints, which applies temperature scaling and then top-k and top-p. Value temperature, top-k and top-p on the target logits [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/sample/rejection_sampler.py, apply_sampling_constraints <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/sample/rejection_sampler.py#L589-L598>, read 2026-11-04).
