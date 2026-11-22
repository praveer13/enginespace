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

In Rust, a struct holds other structs and arrays, and an `impl` block gives it a method that computes from them. A PyTorch `nn.Module` has the same parts: its fields are the tensors it owns and the modules inside it, and its `forward` method is the computation. A model is a module made of modules, the way a struct can hold structs.

:::card
kind: isomorphism
title: A struct and a module
body: "In Rust, a struct's fields are other structs and arrays, and an impl block gives it a method that computes from them. A PyTorch module has the same parts. Its fields are the tensors it owns and the modules it contains, and its forward method is the computation."
breaks: "A Rust struct's fields are fixed and checked when the program compiles. A module's fields are attributes that Python sets while the module is being built, so a misnamed field or a shape that does not fit shows up as an error only when the code reaches it."
:::

A checkpoint is a file of named tensors, and the module tree is the code that consumes them. A tensor's name is the path to it through the fields, joined with dots. This name is the weight of the query projection of the attention of the first layer:

```text
model.layers.0.self_attn.q_proj.weight
```

How `nn.Module` builds such names is not in the PyTorch documents the course read [unverified]. The lab checks only the numbers your `build` returns, so a name that fits no field is yours to catch: `load_state_dict(strict=True)` refuses one [unverified].

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
| the epsilon of every RMSNorm | {{claim:qwen3.config.rms-eps}} |

Each key and value head serves {{claim:qwen3.config.query-group}} query heads, and the hidden size is not the number of heads times the head size. Commit to the size of the query projection with that in mind.

:::predict
id: tr0.l3.p1
prompt: Qwen3-0.6B has a hidden size of 1024 [measured], 16 [measured] attention heads, 8 [measured] key and value heads and a head size of 128 [measured]. How many output rows does the query projection q_proj of the first layer have?
answer: { kind: numeric, unit: rows, rel_tol: 0 }
reveal: at-commit
kcs: [tr0.module-as-struct]
:::

## Qwen3's decoder layer at the pin

The pin is `transformers` `5.19.0`. One decoder layer keeps its input as the residual, normalizes the input, runs the attention and adds the residual back. It then does the same four steps for the MLP, with the post-attention norm. {{claim:transformers.qwen3.decoder-order}} The model is an embedding table of `vocab_size` rows and `hidden_size` columns, then the layers, then a final norm. {{claim:transformers.qwen3.embedding}} Qwen3-0.6B ties its output head to the embedding table, so the checkpoint holds one table for both. {{claim:qwen3.config.tied-embeddings}}

Each piece, in the order the layer runs them:

1. **The norm.** `Qwen3RMSNorm` casts to `float32`, takes the mean of the squares over the last dimension, multiplies by the reciprocal square root of that mean plus epsilon, casts back, and then multiplies by its weight. {{claim:transformers.qwen3.rmsnorm}}
2. **The projections.** The attention has three separate projections, `q_proj`, `k_proj` and `v_proj`, and an output projection `o_proj`. The query's output width is the number of heads times the head size, and the key's and the value's is the number of key and value heads times the head size. {{claim:transformers.qwen3.attn-projections}} That is {{claim:qwen3.config.q-proj-rows}} rows for the query and {{claim:qwen3.config.kv-proj-rows}} for each of the other two. The attention's output goes back through `o_proj` to the hidden size, so the residual can be added [derived].
3. **The norm on each head.** The query and the key each get an RMSNorm built over the head size, and it acts on one head's vector and not on the hidden size. {{claim:transformers.qwen3.qk-norm}}
4. **The rotation.** `rotate_half` splits the last dimension in two and returns the negated second half followed by the first. {{claim:transformers.qwen3.rotate-half}} The rotary base is `1000000`. {{claim:qwen3.config.rope-theta}}
5. **The scores.** They are scaled by the head size to the power of minus one half. {{claim:transformers.qwen3.attn-scaling}}
6. **The MLP.** `Qwen3MLP` applies the activation to the gate projection, multiplies by the up projection and applies the down projection, and all three have no bias. {{claim:transformers.qwen3.mlp}} The activation is `silu`. {{claim:qwen3.config.activation}}

Where the layer reshapes, it uses the calls of the first two lessons: `view` into heads and `transpose(1, 2)`, which are free. The attention function ends with `contiguous()`, the one copy, and the layer's `reshape` after it is a view. {{claim:transformers.qwen3.attn-views}} {{claim:transformers.qwen3.attn-fn-contiguous}}

## Shapes through one layer

The lab's grader records the shape and the strides of what leaves five modules of your forward pass: `embed_tokens`, the first layer's `self_attn` and `mlp`, `norm` and `lm_head`. Take one prompt of `6` tokens [estimated]. The `6` is arbitrary: it is this lesson's, and no engine's.

- The embedding leaves with shape `(1, 6, 1024)` and strides `(6144, 1024, 1)`.
- The first layer's attention leaves with the same shape and strides.
- The first layer's MLP leaves with the same shape and strides.
- The final norm leaves with the same shape and strides.
- The head leaves with shape `(1, 6, 151936)` and strides `(911616, 151936, 1)`.

Each shape is the batch, the tokens and then the hidden size, or the vocabulary at the head [derived]. Each stride is the one a contiguous tensor of that shape has [derived].

A module returns what its code makes, so the strides the grader records are your code's. A contiguous tensor has the strides above, and one that a `transpose` left has others.

The query is viewed, normed on each head and transposed. The norm keeps shape and strides, so the table skips it. The projection's `(1, 6, 2048)` output is viewed as `(1, 6, 16, 128)` and then transposed. Here are the steps and the elements each moved. Printed by the course's model on 2026-11-21 at `0dc2dcc`.

| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |
|---|---|---|---|
| the start | `(1, 6, 2048)` | `(12288, 2048, 1)` | 0 |
| `view([1, 6, 16, 128])` | `(1, 6, 16, 128)` | `(12288, 2048, 128, 1)` | 0 |
| `transpose(1, 2)` | `(1, 16, 6, 128)` | `(12288, 128, 2048, 1)` | 0 |

Neither step moved an element. The second dimension of the result has stride `128`, one head's width, the third `2048`, a whole projection row. Going back, a `view` to `(1, 6, 2048)` is refused: no one stride walks the heads and then the tokens [synthetic]. That is why the attention function ends with a copy and the layer's `reshape` after it is a view.

Check the strides of a reshape like this one before you read on.

:::item
family: tr0.strides-of
level: 2
count: 1
:::

## The cache's contract

A token reads only itself and the tokens before it, so what a layer computed for a token does not change when later tokens arrive. A KV cache keeps each layer's keys and values for the tokens already seen. {{ks:T5.L4}} works out how much memory that takes, and here the question is what it must not change.

The contract is one sentence: the logits of each step equal the logits of a full recompute of the same prefix. The lab's stage with a cache checks it step by step, and it checks that the cache holds as many positions as the prefix after every step. Four parts of the attention change when the cache arrives, and no other part does.

| Part of the attention | Without a cache | With a cache |
|---|---|---|
| where the rotation starts | position `0` | the cache's length |
| the queries | every token | the new tokens only |
| the keys and values | every token's, recomputed | the whole cache, with the new ones appended |
| the mask | square | one row for each new token, over every cached position and itself |

A cache written at the wrong position gives logits that are nearly right and not equal, which is why the check compares them with a recompute and not with a plausible word. The contract says nothing about how an engine stores the cache or how large it grows. It only says that the cache must not change an answer.

:::card
kind: build-this
id: build-tr0-forward
:::

## Exit check

Three questions on new tensors: two ask for a stride after the reshapes of attention, and one asks what a chain of calls does.

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
