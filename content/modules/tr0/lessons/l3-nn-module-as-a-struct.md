---
id: tr0.l3
module: tr0
title: "nn.Module as a struct: Qwen3's forward in the pinned transformers"
minutes: 20                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr0.module-as-struct, tr0.decoder-forward, tr0.kv-cache-contract]
builds_on: [ks:T5.L1, ks:T5.L4, ks:t5.gqa-kv-heads, ks:t5.why-kv-cache]
status: review                    # draft | review | live
lanes: [B]
---

The last two lessons showed what a call does to one tensor, and an engine's model code is many tensors owned by code. This lesson reads one model's forward pass, Qwen3-0.6B's, as the pinned `transformers` writes it. {{ks:T5.L1}} drew the same pass as data moving through memory.

## A module is a struct

A PyTorch `nn.Module` is model code's struct with an `impl` block. A model is a module made of modules, the way a struct can hold structs.

:::card
kind: isomorphism
title: A struct and a module
body: "In Rust, a struct's fields are other structs and arrays, and an impl block gives it a method that computes from them. A PyTorch module has the same parts. Its fields are the tensors it owns and the modules it contains, and its forward method is the computation."
breaks: "A Rust struct's fields are fixed and checked when the program compiles. A module's fields are attributes that Python sets while the module is being built, so a misnamed field or a shape that does not fit shows up as an error only when the code reaches it."
:::

A checkpoint is a file of named tensors, and the module tree is the code that consumes them. The names are paths through the fields, joined with dots. The pinned `transformers` writes two of them itself, when it ties the output head's weight to the embedding table's: `lm_head.weight` and `model.embed_tokens.weight`. {{claim:transformers.qwen3.tied-keys}} By the same pattern, this would be the weight of the query projection of the attention of the first layer:

```text
model.layers.0.self_attn.q_proj.weight
```

How `nn.Module` builds such names is not in the PyTorch documents the course read [unverified], so the pattern is read from names like the two above and not from a rule. The lab checks only the numbers your `build` returns, so a name that fits no field is yours to catch: `load_state_dict(strict=True)` refuses one [unverified].

The configuration fixes every size of Qwen3-0.6B, so a forward pass is written from it and never from typed numbers. These are its values, each read at the model's pinned revision.

| What it sizes | Value |
|---|---|
| the width of the vector that travels between layers (`hidden_size`) | {{claim:qwen3.config.hidden-size}} |
| how many decoder layers are stacked | {{claim:qwen3.config.layers}} |
| the query heads of one attention | {{claim:qwen3.config.heads}} |
| the key and value heads, so each serves two query heads | {{claim:qwen3.config.kv-heads}} |
| the size of one head, set in the configuration and not worked out from the hidden size | {{claim:qwen3.config.head-dim}} |
| the longest position the configuration allows | {{claim:qwen3.config.max-positions}} |
| the width inside the MLP | {{claim:qwen3.config.intermediate-size}} |
| the rows of the embedding table | {{claim:qwen3.config.vocab-size}} |
| the small number every norm adds before its square root (`rms_norm_eps`) | {{claim:qwen3.config.rms-eps}} |

Each key and value head serves {{claim:qwen3.config.query-group}} query heads, and the hidden size is not the number of heads times the head size. Commit to the size of the query projection with that in mind.

:::predict
id: tr0.l3.p1
prompt: Qwen3-0.6B has a hidden size of 1024 [measured], 16 [measured] attention heads, 8 [measured] key and value heads and a head size of 128 [measured]. How many output rows does the query projection q_proj of the first layer have?
answer: { kind: numeric, unit: rows, rel_tol: 0 }
reveal: at-commit
kcs: [tr0.module-as-struct]
:::

## Qwen3's decoder layer at the pin

At the pin, `transformers` `5.19.0`, one decoder layer keeps its input as the residual, normalizes the input, runs the attention and adds the residual back. It does the same for the MLP, with the post-attention norm. {{claim:transformers.qwen3.decoder-order}} The model is an embedding table, then the layers, then a final norm. {{claim:transformers.qwen3.embedding}} The output head `lm_head` then turns each token's vector into one score for each entry of the vocabulary, and those scores are the logits. {{claim:transformers.qwen3.lm-head}} Qwen3-0.6B ties the head to the embedding table, so the checkpoint holds one table for both. {{claim:qwen3.config.tied-embeddings}}

Inside the layer, in the order it runs:

1. **The norm.** Qwen3's RMSNorm, `Qwen3RMSNorm`, casts to `float32`, takes the mean of the squares over the last dimension, multiplies by the reciprocal square root of that mean plus epsilon, casts back, and multiplies by its weight. {{claim:transformers.qwen3.rmsnorm}}
2. **The projections.** `q_proj`, `k_proj` and `v_proj` make the query, the key and the value. The query's width is the number of heads times the head size, and the key's and the value's is the number of key and value heads times the head size. {{claim:transformers.qwen3.attn-projections}} That is {{claim:qwen3.config.q-proj-rows}} rows for the query and {{claim:qwen3.config.kv-proj-rows}} for each of the other two.
3. **The norm on each head.** The query and the key each get an RMSNorm of one head's vector. {{claim:transformers.qwen3.qk-norm}}
4. **The rotation.** Attention alone does not know where a token sits, and the rotation tells it. Each pair of a head's dimensions has a frequency set by the rotary base, `1000000`, and a token's angle for that pair is its position times the frequency. {{claim:transformers.qwen3.rope-angles}} {{claim:qwen3.config.rope-theta}} `rotate_half` splits the last dimension in two and returns the negated second half followed by the first. {{claim:transformers.qwen3.rotate-half}} The query becomes itself times the cosine of its angles plus `rotate_half` of itself times the sine, and so does the key. The values are not turned. {{claim:transformers.qwen3.rope-apply}}
5. **The attention.** `repeat_kv` repeats each key and value head in place, so query heads 0 and 1 read key and value head 0, and heads 2 and 3 read head 1 [derived]. {{claim:transformers.qwen3.repeat-kv}} The scores are the query times the transposed keys, scaled by the head size to the power of minus one half. {{claim:transformers.qwen3.attn-scaling}} The mask is added, a softmax turns each row of scores into weights, and the weights multiply the values. {{claim:transformers.qwen3.attn-softmax}} The mask is causal: it lets a token read itself and the tokens before it, and none after. {{claim:transformers.qwen3.causal-mask}} `o_proj` takes the result back to the hidden size, so the residual can be added [derived].
6. **The MLP.** `Qwen3MLP` applies the activation to the gate projection, multiplies by the up projection element by element, and applies the down projection, and all three have no bias. {{claim:transformers.qwen3.mlp}} The activation is `silu`, applied to each element on its own. {{claim:qwen3.config.activation}}

## Shapes through one layer

Take one prompt of `6` tokens [estimated]. The `6` is arbitrary: it is this lesson's, and no engine's.

The attention moves tensors with the first two lessons' calls. The query is viewed into heads, normed on each head and transposed, and both moves are views. {{claim:transformers.qwen3.attn-views}} The norm keeps shape and strides, so the table skips it. The projection's `(1, 6, 2048)` output is viewed as `(1, 6, 16, 128)` and then transposed. Printed by the course's model on 2026-11-21 at `0dc2dcc`.

| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |
|---|---|---|---|
| the start | `(1, 6, 2048)` | `(12288, 2048, 1)` | 0 |
| `view([1, 6, 16, 128])` | `(1, 6, 16, 128)` | `(12288, 2048, 128, 1)` | 0 |
| `transpose(1, 2)` | `(1, 16, 6, 128)` | `(12288, 128, 2048, 1)` | 0 |

Both steps are views. The result's second stride is `128`, one head's width, and its third `2048`, a projection row. The attention's output comes back heads first: say a contiguous `(1, 16, 6, 128)` with strides `(12288, 768, 128, 1)` [derived], and `o_proj` needs tokens first. A `view` to `(1, 6, 2048)` runs on it, silently mixing heads into tokens. After `transpose(1, 2)` its strides are `(12288, 128, 768, 1)` [derived]: a `view` to `(1, 6, 2048)` is refused. So the attention function swaps them back and ends with `contiguous()`, the one copy, and the layer's `reshape` after it is a view. {{claim:transformers.qwen3.attn-fn-contiguous}}

Check the strides of a reshape like this one before you read on.

:::item
family: tr0.strides-of
level: 2
count: 1
:::

The lab's grader records the shape and the strides of what leaves five modules of your forward pass. On the same prompt of `6` tokens they are these.

| Module | Shape [derived] | Strides [derived] |
|---|---|---|
| `embed_tokens` | `(1, 6, 1024)` | `(6144, 1024, 1)` |
| the first layer's `self_attn` | `(1, 6, 1024)` | `(6144, 1024, 1)` |
| the first layer's `mlp` | `(1, 6, 1024)` | `(6144, 1024, 1)` |
| `norm` | `(1, 6, 1024)` | `(6144, 1024, 1)` |
| `lm_head` | `(1, 6, 151936)` | `(911616, 151936, 1)` |

Each shape is the batch, the tokens and the hidden size, or the vocabulary at the head, and each stride is a contiguous tensor's. The grader records your code's strides, so a tensor that a `transpose` left shows others.

## The cache's contract

A token reads only itself and the tokens before it, so what a layer computed for a token does not change when later tokens arrive. A KV cache keeps each layer's keys and values for the tokens already seen. {{ks:T5.L4}} works out how much memory that takes, and here the question is what it must not change.

The contract is one sentence: the logits of each step equal the logits of a full recompute of the same prefix. The lab's stage with a cache checks it step by step, and it checks that the cache holds as many positions as the prefix after every step. Four parts of the attention change when the cache arrives, and no other part does.

| Part of the attention | Without a cache | With a cache |
|---|---|---|
| where the rotation starts | position `0` | the cache's length |
| the queries | every token | the new tokens only |
| the keys and values | every token's, recomputed | the whole cache, with the new ones appended |
| the causal mask | square | one row for each new token, over every cached position and itself |

The rotation's row follows from its angles, which come from each token's position: with a cache, the new tokens are numbered from the count already cached. {{claim:transformers.qwen3.position-ids}} A cache written at the wrong position gives logits that are nearly right and not equal, which is why the check compares them with a recompute and not with a plausible word. The contract says nothing about how an engine stores the cache or how large it grows. It only says that the cache must not change an answer.

:::card
kind: build-this
id: build-tr0-forward
:::

## Exit check

Three questions on new tensors. Two ask for the stride of one dimension after a few calls, which may be a transpose, an expand or the reshapes of attention, and one is about a chain of calls on a tensor, asking either whether its last call makes a view, makes a copy or fails, or how many elements the calls move.

:::item
family: tr0.strides-of
level: 2
count: 2
:::

:::item
family: tr0.view-or-copy
level: 2
count: 1
:::
