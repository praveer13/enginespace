---
id: tr6.l2
module: tr6
title: The rejection sampler, exactly
minutes: 50                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr6.exact-acceptance, tr6.residual-recovery]
builds_on: [ks:T5.L8, ks:T6.L6, ks:t5.speculative-decoding]
status: review                    # draft | review | live
lanes: [B]
games: [verifier]
---

The last lesson counted tokens. This one is about which tokens. Speculative decoding is worth having only if it is exact: whatever the proposer guessed, the tokens that come out must be distributed as the target's own. The rule that makes it so is short enough to hold in your head and easy to get almost right. This lesson states it, proves it on a table small enough to read, shows what each way of getting it almost right puts out, and then reads how the two engines write it.

## The rule

Call the target's distribution at a position p and the draft's q, both over the same tokens. The proposer drew a token x from q. The sampler then does three things.

1. **Accept** x with probability `min(1, p(x) ÷ q(x))`. That is always, when the target likes x at least as much as the draft did, and with the ratio when it likes it less.
2. **Recover** if x is rejected. Stop the round there, and draw the replacement from the residual: the target's probability less the draft's, where that is positive, divided by its total. It is written (p − q)⁺ and normalised.
3. **Bonus** if every draft was accepted. Draw one more token from the target alone.

The paper says it in one sentence, and says the output is distributed as p. {{claim:spec.paper.accept-or-resample}} In The Tasting the commis plates the drafts and the chef is the target, which is why the game's verbs are keeping a plate and re-plating from what the commis under-plates. Commit to one number before you read the proof.

:::predict
id: tr6.l2.p1
prompt: The target's distribution over three tokens is 0.6, 0.3 and 0.1 [estimated], and the draft's is 0.2, 0.3 and 0.5 [estimated]. The proposer draws a token from its own distribution, and the sampler accepts or rejects it by the rule above. What is the probability that it accepts?
answer: { kind: numeric, unit: probability, rel_tol: 0.02 }
reveal: after-game
kcs: [tr6.exact-acceptance]
:::

Play The Tasting's `overlap` level on its practice seed, which asks the same question for a pair it draws.

:::game
id: verifier
level: overlap
mode: practice
:::

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

:::card
kind: isomorphism
title: A fast path with a spillover
body: A service puts a fast path in front of a slow one. For each kind of request the fast path takes up to its capacity, and the demand beyond it spills over to the slow path. The service serves exactly the demand if the slow path takes the spillover alone. The accept step is the fast path, serving min(p, q) of each token, and the residual is the spillover, the excess of demand over capacity.
breaks: A service knows its demand and its capacity as counts and routes each request. Here both are probabilities, and the fast path does not know the demand. It proposes a token from q, and a coin cuts the proposals down to p. What carries over is the accounting. Whatever the fast path under-serves the slow path serves, and nothing more.
:::

## In integers, with a coin

An engine writes the rule in floats, and a float comparison has a boundary, which is where the bugs of the next lesson live. The course's sampler writes it in whole numbers so that the boundary can be looked at. Every weight is out of 65,536 [estimated], so p and q are whole weights. The accept step draws a coin u uniformly from zero up to q(x), not including q(x), and keeps x when `u < p(x)`. That keeps it for exactly `min(p(x), q(x))` of the q(x) coins, so with probability `min(1, p ÷ q)`, with no float, and a token with `p(x) = 0` is kept for no coin at all.

The engines write the same test in floats, and each writes it its own way.

| Runner | Keeps x when | The coin |
|---|---|---|
| MRV1, the legacy runner | the draft's probability of x is above zero and p ÷ q is at least the coin {{claim:vllm.spec.mrv1.accept-test}} | a float64 between zero and one, because its authors saw that a float32 could be exactly zero {{claim:vllm.spec.mrv1.coin-float64}} |
| MRV2, the default | p is greater than the coin times q, in log space {{claim:vllm.spec.mrv2.accept-test}} | drawn with `includes_zero=False` {{claim:vllm.spec.mrv2.coin-call}}, which raises a draw to a floor {{claim:vllm.spec.mrv2.coin-floor}} |
| The course | `u < p(x)` | an integer, below q(x) |

A comparison that includes its boundary, and a coin that can be exactly zero, keep a token that the target forbids: `p(x) = 0`, `u = 0`, and zero over q is at least zero. MRV1's authors saw the risk and moved to float64, which makes it negligible and does not make it impossible. MRV2 compares strictly and keeps the coin off zero. One engine's sampler shipped with a boundary of this kind, and the next lesson reads it.

## The residual, and the drafts with no q

The recovery has two forms in vLLM, and they are one rule. When the draft's probabilities are in hand, MRV2 draws from the residual r(x), the target's probability less the draft's where that is positive, {{claim:vllm.spec.mrv2.residual}} and MRV1 draws from the same excess without dividing by its sum, because it takes an argmax over the excess scaled by random numbers, and a scale does not move an argmax. {{claim:vllm.spec.mrv1.residual}}

Not every proposer has probabilities. An n-gram lookup names a token and no distribution, and MRV1's sampler takes the draft's probabilities as optional, with a docstring that says they are not provided for n-gram speculation. {{claim:vllm.spec.mrv1.ngram-no-draft-probs}} Without them the engine takes the draft's probability of the token to be one, {{claim:vllm.spec.mrv1.one-hot-accept}} so q is one-hot on the drafted token. The accept test becomes p(x) against the coin, and the residual becomes the target with the rejected token removed. {{claim:vllm.spec.mrv1.residual-no-draft-probs}} MRV2 says the same in a comment. {{claim:vllm.spec.mrv2.one-hot-residual}} Put a one-hot q into the proof above and it still holds: a draft is kept with probability p(x), and the rejected ones are replaced from p without x.

That is also what a draft model gets by default. vLLM's `draft_sample_method` is `greedy`, in which the draft always picks its argmax token and its probabilities are treated as one-hot, and only the `probabilistic` setting keeps the draft's distribution for the ratio test, at the cost of GPU memory. {{claim:vllm.spec.draft-sample-greedy}} The one-hot q is not an approximation there. A draft that always picks its argmax draws its token from a distribution that is one-hot, whatever its softmax looks like, and the softmax is not what it sampled from.

At temperature zero the target's distribution is one-hot on its argmax, so `min(1, p ÷ q)` is one for the draft that equals the argmax and zero for any other: a draft is accepted if and only if it is the target's argmax. {{claim:vllm.spec.mrv2.greedy-accept}} And before it verifies anything, vLLM runs the target's logits through temperature, top-k and top-p, {{claim:vllm.spec.sampling-constraints}} so p in all of the above is the processed distribution, and exact means exact against what plain decoding would sample after those constraints.

:::card
kind: warning
title: Exactness belongs to the pair of rules
body: The right recovery depends on the accept rule that goes with it. With the accept step above it is the residual. A residual behind an accept step that skips the coin is biased, and so is an exact accept step with a recovery from p. Other pairs of rules are exact too, and they keep fewer drafts. The Tasting's exact level fixes the accept rule and asks for the recovery, and the lab's bestiary breaks one half at a time.
:::

:::card
kind: notional-machine
id: spec
:::

## What to carry

- A draft x from q is kept with probability `min(1, p ÷ q)`. The chance that a draft is kept is `α = Σ min(p, q)`, and the chance of a rejection is `1 − α`.
- A rejected draft is replaced from the residual, the target less the draft where positive, normalised. The residual's total is the chance of a rejection, which is why the output is p exactly.
- With no draft probabilities, as with an n-gram or a greedy draft, q is one-hot on the drafted token. A draft is kept with probability p(x), and a rejected one is replaced from p without x.

## Exit check

This lesson tests two skills: computing the chance that a drafted token is accepted, and saying why the rule leaves the output exactly the target's (`tr6.exact-acceptance`), and drawing the replacement for a rejected token from the excess of p over q, and saying what any other choice does (`tr6.residual-recovery`). The graded `exact` level draws a fresh pair of distributions, hides the live meter and takes one submission. You pass it when what goes out is exactly the target's, on three fresh pairs [estimated] (ASSESSMENT §4.3). The lab, `rejection-sampler`, is the same skill in Rust, and its checks `accept`, `residual` and `pick` are this lesson's rule in whole numbers.

:::game
id: verifier
level: exact
mode: graded
:::
