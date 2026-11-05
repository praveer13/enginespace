---
id: tr6.l4
module: tr6
title: "Proposers: n-gram, suffix, draft model, EAGLE-3 and MTP, and what moved at v0.33.0"
minutes: 35                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr6.proposer-families]
builds_on: [ks:T6.L6, ks:t6.self-drafting]
status: review                    # draft | review | live
lanes: [B]
games: [verifier]
---

The last three lessons were about the sampler, which is the same whatever drafted the tokens. This lesson is about the drafters. A **proposer** does one thing: from a request's context, it names `k` tokens. What it needs to do that decides what you must install, what traffic it pays on, and which runner it lands on in the pinned engines. {{ks:T6.L6}} gave you the economics of MTP and EAGLE. This lesson names the proposers that vLLM v0.33.0 and SGLang v0.5.23 ship, reads two of them in the code, and ends on a fact that changes what a benchmark means: the runner a proposer lands on.

## What a proposer needs

vLLM's configuration names the speculative method, and at v0.33.0 the name is one of a fixed list. {{claim:vllm.spec.methods}} Five of them are what a team chooses between, and a sixth is the hook for writing your own.

| Method | Drafts from | What has to exist |
|---|---|---|
| `ngram` | the prompt, by matching n-grams in it and proposing the tokens that followed a match {{claim:vllm.spec.ngram-prompt-lookup}} | nothing beyond the engine |
| `suffix` | the prompt and earlier generations, by frequency counts, with an adaptive number of tokens {{claim:vllm.spec.suffix-differs}} | the Arctic Inference package {{claim:vllm.spec.suffix-needs-arctic}} |
| `draft_model` | a separate model, running its own forward passes | a separate draft model {{claim:vllm.spec.draft-model-separate}} |
| `eagle3` | a head that reads features of the target | a head trained for this target |
| `mtp` | the target's own multi-token prediction module {{claim:vllm.spec.mtp-native}} | a target that includes native MTP, from a family vLLM supports {{claim:vllm.spec.mtp-families}} |
| `custom_class` | your class's `propose` method {{claim:vllm.spec.custom-class}} | a module path in `speculative_config.model` |

The `model` key of the configuration follows the same split. It names a draft model, an EAGLE head or an auxiliary model, and for `ngram`, `ngram_gpu`, `suffix` and `mtp` it can often be left out. {{claim:vllm.spec.model-key-optional}}

None of this changes the sampler. An n-gram or suffix proposer names a token and no probability, so the sampler treats q as one-hot on it, which the second lesson worked through. By default a model-based draft is one-hot as well, because `draft_sample_method` defaults to `greedy`. {{claim:vllm.spec.draft-sample-greedy}} The proposers differ in cost and in how often they are right, not in what the output is.

## Which one fits

vLLM's guide gives two pieces of advice to hold against any proposer. Speculation pays under medium-to-low QPS, memory-bound workloads. {{claim:vllm.spec.where-it-pays}} And the methods fall into two groups: the model-based ones, EAGLE, MTP, draft models and PARD, give the best latency reduction, and the simpler ones, n-gram and suffix, give modest speedups without adding work at peak traffic. {{claim:vllm.spec.model-based-vs-simple}}

The choice is mostly made by what a team already has. A target trained with MTP has its proposer inside it. A head trained for the target is an EAGLE-3 proposer waiting for a config line. A smaller sibling of the same family is a draft model. With none of those, traffic that quotes its own prompt suits `ngram`, and agent loops that repeat their own earlier outputs suit `suffix`, if the package is installed. When more than one is on hand, the guide's first group gains more.

SGLang ranks by the same logic. Its guide names EAGLE-3, run with `--speculative-algorithm EAGLE3`, as its recommended choice for the best speed and quality, {{claim:sglang.spec.eagle3-recommended}} and NGRAM, which is CUDA-only, as the choice when no extra model is available. {{claim:sglang.spec.ngram-no-extra-model}} Its built-in algorithm names are a list of eight, and any name registered with `SpeculativeAlgorithm.register` joins it, {{claim:sglang.spec.algorithms}} which is its counterpart to vLLM's module path.

:::card
kind: isomorphism
title: A prefetcher with and without training
body: Hardware prefetchers fall into two groups. A stride prefetcher needs no training. It watches the addresses so far, guesses the next one, and pays only when the access pattern repeats. A learned prefetcher is trained on traces and pays on patterns that a stride cannot see. The n-gram and suffix proposers are the first group, copying what the text has already said. An EAGLE head or an MTP module is the second, trained on the target's own features.
breaks: A wrong prefetch costs bandwidth and the program still reads the right data. A wrong draft costs verified positions and the sampler still returns the target's distribution, but a model-based proposer also has a price that a prefetcher has not, which is the weights and the forward passes of the model that drafts.
:::

## EAGLE-3 and MTP, as reading

You will not build either of these here. A head has to be trained, and the lab's proposer is a prompt-lookup one. But you should be able to read them, and reading starts with what they take in.

EAGLE drafts by autoregression at the level of the target's features, the second-to-top layer, which its authors found more straightforward than autoregression on tokens. {{claim:spec.paper.eagle-feature-level}} EAGLE-3 gives up predicting features for predicting tokens directly, and fuses the features of several layers of the target in place of relying on the top one. {{claim:spec.paper.eagle3-fusion}} MTP comes from somewhere else. DeepSeek-V3 trains its multi-token prediction modules with the model, so that they predict the extra tokens one after another and keep the causal chain at each depth, {{claim:spec.paper.mtp-sequential}} and the model can discard them at inference or repurpose them for speculative decoding. {{claim:spec.paper.mtp-speculative}} SGLang puts it in its own terms: MTP is speculative decoding, and its example launches it with the EAGLE algorithm, so MTP runs through the EAGLE workers. {{claim:sglang.spec.mtp-through-eagle}}

What the three share, and what the pinned code shows, is an input that a draft model does not have: the target's own hidden states. Read it in four places.

1. `vllm/v1/spec_decode/eagle.py` is a short subclass whose only job is to build the base proposer with `pass_hidden_states_to_model=True`. {{claim:vllm.spec.eagle-passes-hidden}}
2. The base class, `vllm/v1/spec_decode/llm_base_proposer.py`, says what the flag does. It adds the stored hidden states to the draft model's inputs, next to the token ids and the positions. {{claim:vllm.spec.hidden-states-to-draft}} For `eagle3` it also assumes that the head takes auxiliary hidden states, unless the head's own config says it does not. {{claim:vllm.spec.eagle3-aux-default}}
3. `vllm/v1/spec_decode/draft_model.py` builds the same base class with the flag set to False. {{claim:vllm.spec.draft-model-no-hidden}} The difference between a head and a model, in this code, is whether the target's hidden states go in.
4. `vllm/config/speculative.py` holds the names, and two of them mislead. `use_eagle()` is true for `eagle`, `eagle3`, `mtp`, `dflash` and `dspark`, and a comment above it calls the name usually a stand-in for speculative decoding that uses the target's hidden states. {{claim:vllm.spec.use-eagle-covers-mtp}} So a search for eagle that finds MTP is working as written. And the long list of model-specific MTP names in the method type, `deepseek_mtp` and its kin, is now a list of deprecated aliases: the config logs a warning and replaces any of them with `mtp`. {{claim:vllm.spec.mtp-names-deprecated}}

Medusa and the MLP speculator are gone. They were removed in v0.33.0, so a guide that still lists them describes an older engine. {{claim:vllm.spec.medusa-removed}}

Commit to a choice before you read on. The answer is in the next section, and the game below is the n-gram proposer's side of the sampler, which you can play first.

:::predict
id: tr6.l4.p1
prompt: A team writes its own proposer and loads it with the method custom_class on vLLM v0.33.0, and changes nothing else in the engine's defaults. Which runner serves it, and is async scheduling on?
answer:
  kind: choice
  options:
    - { id: mrv2-on, text: "MRV2, with async scheduling on" }
    - { id: mrv1-on, text: "MRV1, with async scheduling on" }
    - { id: mrv1-off, text: "MRV1, with async scheduling off" }
    - { id: refused, text: "The engine refuses to start" }
reveal: after-game
kcs: [tr6.proposer-families]
:::

The Tasting's `greedy-ngram` level deals the case of the table's first rows: a copier who plates what the night served lately and knows nothing of the odds, so its q is one dish. At temperature zero the chef always sends back her favourite, and then at full temperature you sculpt the re-plating that keeps the output her tasting.

:::game
id: verifier
level: greedy-ngram
mode: practice
:::

## What moved at v0.33.0

A proposer lives inside a runner, and the runner moved. Model Runner V2, MRV2, became vLLM's default for all models in v0.29.0, released on 2026-09-09. {{claim:vllm.mrv2.default-since}} At v0.33.0 the engine uses MRV2 unless the environment turns it off, Triton is missing, or the configuration uses a feature MRV2 does not support yet. In the last two cases it falls back to the legacy runner, MRV1, and logs one warning. {{claim:vllm.mrv2.default-rule}} Five things send a configuration back, and three of them are about speculation: the methods `suffix` and `custom_class`, parallel drafting for anything but DFlash and DSpark, and draft models with their own vocabulary. {{claim:vllm.mrv2.fallback-reasons}} A custom proposer therefore runs on MRV1. {{claim:vllm.spec.custom-class-mrv1}}

The runner decides one thing more. Async scheduling is on by default, {{claim:vllm.async-scheduling.default}} and on MRV1 it works with only some methods: the EAGLE family, n-gram on the GPU, a draft model, DSpark and DFlash. Asked for with another method, it raises an error. Left to its default, it turns itself off with one warning. {{claim:vllm.async-scheduling.mrv1-limits}} So the answer to the prediction is that a custom proposer runs on MRV1 with async scheduling off. The table lists more cases, each worked from these rules.

| Configuration | Runner | Async scheduling |
|---|---|---|
| `eagle3`, nothing else set | MRV2 | on |
| `ngram`, nothing else set | MRV2 | on |
| `suffix`, nothing else set | MRV1 | off, with one warning |
| `suffix`, async scheduling requested | the engine refuses to start | not applicable |
| `custom_class`, nothing else set | MRV1 | off, with one warning |
| `draft_model` with a vocabulary of its own | MRV1 | on |

This is why the module's lab compares like with like. A plain run on MRV2 with async scheduling on, set against a custom proposer on MRV1 with it off, differs in the runner and in the scheduling as well as in the proposer, and the speedup it reports folds all three together. The plain run uses the same runner and the same async setting as the speculative run, and the receipt records both.

:::card
kind: warning
title: A method name does not tell you the runner
body: Two configurations that differ in method can differ in runner, and in whether async scheduling runs. A speedup measured across them folds all of that into one number. Record the runner and the async setting beside every speedup you report, and compare a speculative run only with a plain run on the same runner.
:::

The hook and the fallback list are the facts on this page most likely to change before the next pin. The course re-reads `custom_class_proposer.py`, the fallback list and the proposer dispatch at every re-pin, and so should you before you trust the table above.

:::card
kind: notional-machine
id: spec
:::

## What to carry

- A proposer needs something. The n-gram method needs the prompt, suffix decoding needs the prompt, earlier outputs and a package, a draft model needs a second model, an EAGLE-3 head needs training on the target's hidden states, and MTP needs a target that was trained with it.
- In the code, the difference between a head and a model is whether the target's hidden states go in. In a config check, `eagle` means that they do, and MTP is included.
- At the pin, `suffix` and `custom_class` run on MRV1, and on MRV1 async scheduling turns itself off for the methods outside a short list. Compare a speculative run only with a plain run on the same runner and the same async setting.

## Exit check

This lesson tests one skill: telling the proposers of the pinned engines apart by what each needs, and saying which runner a configuration runs on (`tr6.proposer-families`). The ticket is three items on fresh seeds, drawn from what a method drafts from, which method fits what a team has, and the runner and async setting that a configuration ends up with. It is passed with at least two right (ASSESSMENT §4.2).

:::item
family: tr6.which-runner
level: 2
count: 3
:::
