---
id: spec
kind: notional-machine
title: The speculative-decoding verifier
world: spec
status: draft
---

The notional machine behind The Tasting (`verifier`) and the `rejection-sampler` forge lab: `packages/sim/spec`, which W1-T26 builds. Until it lands, this card is the specification that model is built to and checked against. It verifies a chain of drafted tokens against the target model's distribution in integers, and it checks with a chi-square test that the output is exact. Its rules follow the speculative-decoding paper and vLLM v0.33.0. The distributions it draws are synthetic. The real engine is authoritative: when it disagrees with this card, the card is wrong.

## Models

1. **Accept a drafted token.** A drafted token x is kept when `q(x) <= p(x)`, and otherwise rejected with probability `1 - p(x)/q(x)`, where p is the target's distribution and q the draft's. In integers the model draws u uniformly from `[0, q_x)` and accepts when `u < p_x`. That accepts with probability `min(1, p_x / q_x)` and uses no floating point (A§5.5, D-017). The comparison is strict. A comparison that includes the boundary accepts a token with no target probability when the draw is exactly zero, which is the exactness bug that SGLang fixed in its tree sampler. {{claim:spec.paper.accept-or-resample}} {{claim:sglang.spec.pr-35798}}
2. **Recover on rejection.** A rejected token is replaced by one drawn from the adjusted distribution, `norm(max(0, p - q))`, which vLLM calls a recovered token. In integers the weight of x is `max(0, p_x - q_x)`, and the total is the sum of those weights. Only the exact residual makes the output equal p (A§5.5). {{claim:vllm.spec.rejection-sampler.exact}}
3. **The bonus token.** When every drafted token is accepted the round adds one more, sampled from the target's distribution alone, so a round always yields at least one new token. {{claim:vllm.spec.bonus-token}} {{claim:spec.paper.bonus-token}}
4. **Exactness.** The output distribution equals p. vLLM's standard method follows the paper's algorithm strictly, and upstream checks it with a chi-square test whose threshold is set so far out that it almost never fails by chance and detects only a large bias [estimated]. The model's own test runs on fresh seeds with a significance level that it states (A§5.5). {{claim:vllm.spec.rejection-sampler.exact}} {{claim:vllm.spec.chi-square.threshold}}
5. **Acceptance length.** When every draft is accepted at the same rate, a round yields in expectation a number of tokens that depends only on that rate and on the draft length. The model computes it as a sum of repeated products over integer weights, and never calls a power function (WORLD §2.7, D-017). {{claim:spec.paper.expected-tokens}}
6. **Critical values.** The chi-square critical values come from a script and are committed as integers, and the build regenerates them to compare (A§5.5, WORLD §6).
7. **A lossy rule must fail.** vLLM ships a lossy verification method, FLy. A FLy-style rule is a member of the model's bestiary, and the chi-square test must catch it beside the other known-wrong samplers (A§5.10). {{claim:vllm.spec.fly-lossy}}

## Ignores

- **Draft trees.** The first edition verifies chains. A tree is a labelled stretch level (A§5.5).
- **Temperature, top-k and top-p.** vLLM runs the target's logits through all three before it verifies a draft. {{claim:vllm.spec.sampling-constraints}} The model verifies the distributions it is handed, except where a level says so.
- **The numerics of real logits.** A distribution is a list of integer weights with a fixed total, so the model has no rounding, overflow or underflow to show.
- **The cost of drafting.** The model verifies a chain. What a draft model, an n-gram lookup or an MTP head costs on a step is the step-loop model's business (A§5.3).

## Calibrated against

- **Nothing.** The distributions are synthetic, drawn per seed, and no real draft model's acceptance rate is behind them [estimated].
- **Exactness itself,** which the model's tests will prove: the exact rule's output matches p under the chi-square test, and each member of the bestiary fails it (W1-T26).
