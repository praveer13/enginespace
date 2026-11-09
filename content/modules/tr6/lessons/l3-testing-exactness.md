---
id: tr6.l3
module: tr6
title: "Testing exactness: chi-square, power, and a real bug"
minutes: 40                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr6.exactness-testing]
builds_on: [ks:T5.L8, ks:T6.L6]
status: review                    # draft | review | live
lanes: [B]
games: [verifier]
---

A proof says the rule is exact. It says nothing about the code you wrote from it. The only evidence a program can give that it samples from p is what it samples, and what it samples is random, so the evidence is statistical. A statistical test has two numbers that matter more than its verdict: how often it fails an honest sampler, and how often it misses a dishonest one. This lesson builds the test that the lab uses, says what it can see and what it cannot, and then reads a real bug that no sample could have found.

## What a chi-square test sees

Draw N rounds, and count how many times each token came out first. If the sampler is exact, the counts are a multinomial sample of p. Pearson's statistic is the sum over the bins of `(observed − expected)² ÷ expected`, where a token's expected count is N times its probability. For an exact sampler it follows a chi-square distribution, to a good approximation, with one degree of freedom fewer than there are bins. Reject the sampler when the statistic is beyond the value that an exact sampler exceeds only with probability α.

What counts as a bin is a rule, and the rule comes from upstream. vLLM's own test of its rejection sampler merges every token whose expected count is under 5 [estimated] into a single bin, so that a rare token does not add noise to the sum. {{claim:vllm.spec.chi-square.min-expected}} The lab's check does the same. A token that the target rules out is no bin at all. If the sampler ever puts one out, it has put out what p forbids, and the statistic is infinite: a certain failure, not a statistical one.

Here is the count on a small target. Take 1,000 draws [estimated] on a target of nine tokens whose weights, in a thousand, are 450, 300, 200, 40, 4, 3, 2, 1 and 0 [estimated]. With the draws and the total both a thousand, a token's expected count is its weight [derived]. The last token is no bin. The four before it expect under 5 [estimated] each, so they are pooled into one bin that expects 10 [derived]. That leaves the first four tokens alone and the pool, 5 bins [derived] and 4 degrees of freedom [derived].

## Level and power

Two numbers describe a test. Its **level** α is the chance that it rejects an honest sampler. Its **power** against a bug is the chance that it rejects a sampler that has the bug. You buy one with the other, and both with the sample.

When a sampler must pass several seeds, the chances of a false fail add up. An exact sampler passes one seed with probability `1 − α` and passes `k` seeds with probability `(1 − α)^k`, so it fails by chance with probability `1 − (1 − α)^k`.

vLLM's test sets its threshold at `df + 10·√(2·df)`, about ten standard deviations of the statistic, and its docstring says that this effectively disallows false positives. {{claim:vllm.spec.chi-square.threshold}} That is a deliberate choice, since a check in an engine's CI that fails by chance is worse than none. The price is power: a check that waits for ten standard deviations misses a bias that moves the statistic by three.

The lab makes the other choice, and states it. Each seed draws 20,000 rounds [estimated] and is tested at α = 1e-4 [estimated], and the sampler must pass two fresh seeds [estimated]. An exact sampler fails the lab if either seed rejects it, which happens with probability `1 − (1 − 1e-4)²`, about 2 in 10,000 attempts [derived]. Take a target of six tokens [estimated], each kept alone, so the test has 5 degrees of freedom [derived]. The lab rejects above 25.7 [derived], where the ten-sigma threshold would wait for 5 + 10·√10 = 36.6 [derived]. The lab speaks up sooner and pays for it with those 2 in 10,000 [derived], which a learner repairs by running again on fresh seeds.

## The noise of a sample

A chi-square check can only see a bias that stands out of the sample's own noise. A token of probability p over N draws has a frequency whose standard error is `√(p(1 − p) ÷ N)`. For a token of probability 0.25 [estimated] over 20,000 draws [estimated] that is 0.003062, or 3,062 parts per million [derived]. A bias has to be several times that to show on most seeds. And the standard error falls only as the square root of the draws, so a sample 100 times [estimated] larger has noise only 10 times [derived] smaller.

Commit to one number before you read on.

:::predict
id: tr6.l3.p1
prompt: A token of probability 0.25 [estimated] has a frequency with a standard error of 3,062 parts per million [derived] over 20,000 draws [estimated]. A bug moves that frequency by one part in 65,536 [estimated], which is 15 parts per million [derived]. About how many draws until the standard error is no bigger than the bug, in millions?
answer: { kind: numeric, unit: Mdraws, rel_tol: 0.05 }
reveal: after-game
kcs: [tr6.exactness-testing]
:::

Then play The Tasting's `mutants` level on its practice seed. It deals five sampling rules, each a little wrong in a different way, and lets you taste a rule, which is the lab's chi-square on a sample of its rounds, or check every coin of its accept step. One of the five is a rule that a taste cannot find, and the rest of the lesson is about it.

:::game
id: verifier
level: mutants
mode: practice
:::

## What power looks like

The lab's bestiary holds six wrong samplers, each a copy of the exact one with a single change. Run both kinds of check on them: the chi-square check, as the lab runs it, and an enumeration of the accept step, which tries every coin of every token and counts how many it keeps. Each row is 50 trials [estimated], and a trial draws a fresh target and draft from the band on which the member differs from the exact sampler. The numbers were measured by the course's sim on 2026-11-05 at `f4c2395`.

| Sampler | The chi-square check rejects it, of 50 trials [measured] | The enumeration flags it, of 50 trials [measured] |
|---|---|---|
| The exact sampler | 0 | 0 |
| Accept when p > q, with no coin | 50 | 50 |
| Re-plate from p | 50 | 0 |
| Re-plate from q | 50 | 0 |
| A residual off by one | 50 | 0 |
| The boundary-inclusive comparison | 50 | 50 |
| A FLy-style lossy rule | 50 | 0 |

Read it by columns. The exact sampler is the control: neither check flags it. The chi-square check finds every bug that moves the output by a visible amount. A wrong recovery puts out another distribution, and the lab's draws are enough to tell. The enumeration finds the two bugs that are in the accept step and none that is in the recovery, because it looks at the accept step alone.

The boundary-inclusive row is the one to stop at, because its full count for the chi-square check depends on the band. It is run on a band of sparse targets, and the next section shows what happens on the others.

The FLy-style rule is a different kind of row. vLLM ships FLy as an option, and its documentation says that it is intentionally lossy and does not preserve the target distribution. {{claim:vllm.spec.fly-lossy}} The lab's stand-in keeps a rejected draft at a flat position when the draft after it would be kept. It is the course's example of a loose rule and not FLy's own algorithm, and the sample catches it, as it should. The method is for the speedup. The claim of exactness belongs to `standard`, the default of the four methods. {{claim:vllm.spec.rejection-methods}}

## A bug the sample cannot see

SGLang pull request `#35798`, opened on 2026-08-21, fixed an exactness bug in `TreeSpeculativeSamplingTargetOnly`. The sampler drew its coins from the half-open interval from zero up to one and chose a bucket of the target's CDF with `coin <= cumulative_probability`, which at a coin of exactly zero accepts a draft token whose target probability is zero. {{claim:sglang.spec.pr-35798}} The same inclusive comparison puts a coin that lands exactly on an interior boundary of the CDF into the bucket before it, not into the next bucket that has any mass. {{claim:sglang.spec.pr-35798-interior}} The fix is in the pinned source: a draft token is accepted only if its target probability is above zero, and the bucket test is half-open. {{claim:sglang.spec.pr-35798-fix}}

In the course's integers the bug is `u <= p(x)` where `u < p(x)` is right. The coin u runs over the q(x) values from zero up to q(x), and the inclusive test keeps one more of them for each token whose p is below its q. Each such token's probability moves by one part in 65,536 [estimated], which is 15 parts per million [derived]. Set that against the noise. The token of the last section, at probability 0.25 [estimated] over 20,000 draws [estimated], has noise of 3,062 parts per million [derived], so the bias is about 200 times [derived] smaller than the noise. For the bias to equal one standard error, the draws must satisfy `N = p(1 − p) ÷ δ²`, which is 805 million draws [derived], 40,265 times [derived] the lab's 20,000 draws [estimated] a seed. No level of test can find what the sample is too small to hold, and a lower level would only make it fail honest samplers.

What does see it is the other kind of check. The accept step is small enough to try every coin: for each token, count how many of its q(x) coins the rule keeps, and require exactly `min(p(x), q(x))`. That check has no sampling noise and no false fail, and it sees a bias of one coin as clearly as a bias of half the coins. The lab's `accept` check is that enumeration. Its `pick` check does the same for the walk over the residual's weights, where the bug has a second half, and the lab's `exact` check is the chi-square of this lesson.

The sample is not blind to this bug on every target, and the next table is the reason to know why. It runs the boundary-inclusive member on three kinds of target, 100 trials [estimated] each, and counts the trials in which the target rules out a token that the draft still proposes.

| Target [estimated] | Trials with a token that p rules out and q proposes, of 100 [measured] | The chi-square check rejects it, of 100 [measured] | The enumeration flags it, of 100 [measured] |
|---|---|---|---|
| Six tokens on a grid of 1/64, The Tasting's band | 25 | 9 | 100 |
| Sixteen tokens, with the target possible on three to six | 100 | 100 | 100 |
| Sixty-four tokens, with weights down to 1/65,536 | 3 | 1 | 100 |

Every one of the 110 rejections [derived] is in a trial that has such a token. In the 172 trials [derived] that have none, the chi-square check rejects 0 [measured] and the enumeration flags 172 [measured]. The sample never sees the shift of one coin. It sees a leak. A token with `p(x) = 0` has the coin zero among its q(x) coins, and `0 <= 0` keeps it, so the draft is accepted and a token comes out that the target forbids. That chance does not depend on q(x): the token is proposed with probability q(x) ÷ 65,536 and then kept with probability 1 ÷ q(x), so it leaks once in 65,536 rounds [derived]. The statistic for a forbidden token is infinite.

A leak needs a forbidden token that the draft proposes, and a target that has been through top-k or top-p has plenty of them, because vLLM applies those constraints to the target's logits before it verifies. {{claim:vllm.spec.sampling-constraints}} The sparse band is built like that. Its draft proposes at least ten tokens [derived] that the target rules out, so 20,000 rounds leak about three times [derived] on each seed, and every trial shows it. A dense target has one now and then. In The Tasting's band a quarter of the trials [measured] do, and two seeds show a given leak only about 46 times in 100 [derived], which is why 9 of those 25 [measured] were rejected. On the finest band a forbidden token is rare, and the sample all but never sees the bug.

:::card
kind: isomorphism
title: The A/B test you size before you run it
body: An experiment is sized before it runs. You fix the false-positive rate you can live with and the smallest effect worth finding, and the arithmetic gives the sample you need. A sampler's chi-square check is sized the same way. The level is the false-fail rate of a seed, and the draws are the sample.
breaks: An A/B test has an effect to find, and a larger sample finds a smaller one. An exact sampler has none, and the bug you fear can be so small that no sample you could draw would find it, since the noise shrinks only as the square root of the sample. For that bug you do not sample. You look at every coin.
:::

## What a pass means

A pass is not a proof. A chi-square check that does not reject says that any bias is smaller than the check can see at its sample and its level, and the tables above are what that means. It sees the bugs that move the output by a percent. It does not see a shift of one coin in 65,536 [estimated], unless a leak gives the shift away. A bug that is tiny and in the recovery draw is seen by neither the sample nor the enumeration of the accept step, which is why the lab also enumerates the draws of the walk.

A sampler therefore earns the word exact from the checks together: no bias that a sample sees, and no bias in the parts that an enumeration looks at, the accept step, the residual and the walk over the weights. Each of the lab's checks is one part of the claim.

The same reasoning governs a pull request to an engine. Upstream's test is sized so that it never fails by chance, and the cost is a threshold that a small bias can sit under. When you read a sampler's test, find its sample and its level before you read its verdict, and ask what size of bias it could see.

:::card
kind: warning
title: A pass only bounds the bias
body: A check that does not reject says that any bias is smaller than the check can see. State the size of the sample and the level beside every pass, and when a bug can hide below them, add a check that does not sample.
:::

:::card
kind: notional-machine
id: spec
:::

## What to carry

- A chi-square check has a level, the chance that it fails an honest sampler, and a power against each bug. Pool the bins that expect under 5 [estimated], leave out the tokens the target rules out, and count the degrees of freedom as the bins less one. With `k` seeds the false fail is `1 − (1 − α)^k`, which is about 2 in 10,000 [derived] for the lab's two seeds at 1e-4 [estimated].
- A bias that is a small fraction of the sample's standard error cannot be seen by sampling. The noise falls as the square root of the draws, so a bias of one coin in 65,536 [estimated] needs hundreds of millions of draws [derived], and an enumeration of the accept step sees it with none.
- The same bug can show on one target and not on another. A pass states its sample and its level.

## Exit check

This lesson tests one skill: testing a sampler for exactness with a chi-square goodness-of-fit test, and saying what its level and its power tell you (`tr6.exactness-testing`). The ticket is three items on fresh seeds, drawn from the degrees of freedom of a test, the chance that it fails an exact sampler, which check sees a bug of a given size and place, and the draws until a bias shows. It is passed with at least two right (ASSESSMENT §4.2). The lab's `exact` check is the same skill on your Rust code.

:::item
family: tr6.exactness-test
level: 2
count: 3
:::
