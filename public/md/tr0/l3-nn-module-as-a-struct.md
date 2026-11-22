# nn.Module as a struct: Qwen3's forward in the pinned transformers

_PyTorch for the Rust-first, and reading Triton · lesson `tr0.l3` · review · about 20 minutes [estimated]_

Builds on kernelspace: `ks:T5.L1`, `ks:T5.L4`, `ks:t5.gqa-kv-heads`, `ks:t5.why-kv-cache`.

Knowledge components: `tr0.module-as-struct`, `tr0.decoder-forward`, `tr0.kv-cache-contract`.

The last two lessons showed what a call does to one tensor, and an engine's model code is many tensors owned by code. This lesson reads one model's forward pass, Qwen3-0.6B's, as the pinned `transformers` writes it. kernelspace T5.L1 drew the same pass as data moving through memory.

## A module is a struct

In Rust, a struct holds other structs and arrays, and an `impl` block gives it a method that computes from them. A PyTorch `nn.Module` has the same parts: its fields are the tensors it owns and the modules inside it, and its `forward` method is the computation. A model is a module made of modules, the way a struct can hold structs.

> **A struct and a module.** In Rust, a struct's fields are other structs and arrays, and an impl block gives it a method that computes from them. A PyTorch module has the same parts. Its fields are the tensors it owns and the modules it contains, and its forward method is the computation.
>
> Where it breaks: A Rust struct's fields are fixed and checked when the program compiles. A module's fields are attributes that Python sets while the module is being built, so a misnamed field or a shape that does not fit shows up as an error only when the code reaches it.

A checkpoint is a file of named tensors, and the module tree is the code that consumes them. A tensor's name is the path to it through the fields, joined with dots. This name is the weight of the query projection of the attention of the first layer:

```text
model.layers.0.self_attn.q_proj.weight
```

How `nn.Module` builds such names is not in the PyTorch documents the course read [unverified]. The lab checks only the numbers your `build` returns, so a name that fits no field is yours to catch: `load_state_dict(strict=True)` refuses one [unverified].

The configuration fixes every size of Qwen3-0.6B, so a forward pass is written from it and never from typed numbers. These are its values, each read at the model's pinned revision.

| What it sizes | Value |
|---|---|
| the width of the vector that travels between layers (`hidden_size`) | **1024** [measured] |
| how many decoder layers are stacked | **28** [measured] |
| the query heads of one attention | **16** [measured] |
| the key and value heads, so each serves two query heads | **8** [measured] |
| the size of one head, set in the configuration and not worked out from the hidden size | **128** [measured] |
| the longest position the configuration allows | **40960** [measured] |
| the width inside the MLP | **3072** [measured] |
| the rows of the embedding table | **151936** [measured] |
| the epsilon of every RMSNorm | **1e-06** [measured] |

Each key and value head serves **2** [derived] query heads, and the hidden size is not the number of heads times the head size. Commit to the size of the query projection with that in mind.

> **Predict `tr0.l3.p1`.** Qwen3-0.6B has a hidden size of 1024 [measured], 16 [measured] attention heads, 8 [measured] key and value heads and a head size of 128 [measured]. How many output rows does the query projection q_proj of the first layer have?
>
> The learner commits to a number in `rows`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

## Qwen3's decoder layer at the pin

The pin is `transformers` `5.19.0`. One decoder layer keeps its input as the residual, normalizes the input, runs the attention and adds the residual back. It then does the same four steps for the MLP, with the post-attention norm. **norm, attention, add, norm, MLP, add** [measured] The model is an embedding table of `vocab_size` rows and `hidden_size` columns, then the layers, then a final norm. **an embedding of vocab_size by hidden_size** [measured] Qwen3-0.6B ties its output head to the embedding table, so the checkpoint holds one table for both. **true** [measured]

Each piece, in the order the layer runs them:

1. **The norm.** `Qwen3RMSNorm` casts to `float32`, takes the mean of the squares over the last dimension, multiplies by the reciprocal square root of that mean plus epsilon, casts back, and then multiplies by its weight. **float32, mean of squares, rsqrt, then the weight** [measured]
2. **The projections.** The attention has three separate projections, `q_proj`, `k_proj` and `v_proj`, and an output projection `o_proj`. The query's output width is the number of heads times the head size, and the key's and the value's is the number of key and value heads times the head size. **q_proj, k_proj, v_proj and o_proj** [measured] That is **2048** [derived] rows for the query and **1024** [derived] for each of the other two. The attention's output goes back through `o_proj` to the hidden size, so the residual can be added [derived].
3. **The norm on each head.** The query and the key each get an RMSNorm built over the head size, and it acts on one head's vector and not on the hidden size. **a norm of the head size on the query and the key** [measured]
4. **The rotation.** `rotate_half` splits the last dimension in two and returns the negated second half followed by the first. **the second half, negated, then the first** [measured] The rotary base is `1000000`. **1000000** [measured]
5. **The scores.** They are scaled by the head size to the power of minus one half. **head size to the power -0.5** [measured]
6. **The MLP.** `Qwen3MLP` applies the activation to the gate projection, multiplies by the up projection and applies the down projection, and all three have no bias. **down(act(gate(x)) * up(x))** [measured] The activation is `silu`. **silu** [measured]

Where the layer reshapes, it uses the calls of the first two lessons: `view` into heads and `transpose(1, 2)`, which are free. The attention function ends with `contiguous()`, the one copy, and the layer's `reshape` after it is a view. **view, then transpose(1, 2)** [measured] **transpose(1, 2), then contiguous** [measured]

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

> **Practice.** Items from the generator family `tr0.strides-of`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## The cache's contract

A token reads only itself and the tokens before it, so what a layer computed for a token does not change when later tokens arrive. A KV cache keeps each layer's keys and values for the tokens already seen. kernelspace T5.L4 works out how much memory that takes, and here the question is what it must not change.

The contract is one sentence: the logits of each step equal the logits of a full recompute of the same prefix. The lab's stage with a cache checks it step by step, and it checks that the cache holds as many positions as the prefix after every step. Four parts of the attention change when the cache arrives, and no other part does.

| Part of the attention | Without a cache | With a cache |
|---|---|---|
| where the rotation starts | position `0` | the cache's length |
| the queries | every token | the new tokens only |
| the keys and values | every token's, recomputed | the whole cache, with the new ones appended |
| the mask | square | one row for each new token, over every cached position and itself |

A cache written at the wrong position gives logits that are nearly right and not equal, which is why the check compares them with a recompute and not with a plausible word. The contract says nothing about how an engine stores the cache or how large it grows. It only says that the cache must not change an answer.

> **Card.** The build-this card `build-tr0-forward`.

## Exit check

Three questions on new tensors: two ask for a stride after the reshapes of attention, and one asks what a chain of calls does.

> **Practice.** Items from the generator family `tr0.strides-of`, level `2`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr0.view-or-copy`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `qwen3.config.activation`: Qwen3-0.6B's MLP activation is silu. Value silu [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, hidden_act <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L10>, read 2026-11-20).
- `qwen3.config.head-dim`: Qwen3-0.6B's head size is 128, set in the configuration and not worked out from the hidden size. Value 128 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, head_dim <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L9>, read 2026-11-20).
- `qwen3.config.heads`: Qwen3-0.6B has 16 attention heads. Value 16 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, num_attention_heads <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L17>, read 2026-11-20).
- `qwen3.config.hidden-size`: Qwen3-0.6B's hidden size is 1024. It is not the number of heads times the head size. Value 1024 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, hidden_size <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L11>, read 2026-11-20).
- `qwen3.config.intermediate-size`: Qwen3-0.6B's MLP has an intermediate size of 3072. Value 3072 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, intermediate_size <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L13>, read 2026-11-20).
- `qwen3.config.kv-heads`: Qwen3-0.6B has 8 key and value heads, so two query heads share each one. Value 8 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, num_key_value_heads <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L19>, read 2026-11-20).
- `qwen3.config.kv-proj-rows`: The key projection, and the value projection, have 1024 output rows: 8 key and value heads times a head size of 128. Value 1024 [derived], checked 2026-11-20 (derived as qwen3.config.kv-heads * qwen3.config.head-dim).
- `qwen3.config.layers`: Qwen3-0.6B has 28 decoder layers. Value 28 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, num_hidden_layers <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L18>, read 2026-11-20).
- `qwen3.config.max-positions`: Qwen3-0.6B's configuration allows positions up to 40960. Value 40960 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, max_position_embeddings <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L14>, read 2026-11-20).
- `qwen3.config.q-proj-rows`: The query projection has 2048 output rows: 16 heads times a head size of 128. That is twice the hidden size of 1024. Value 2048 [derived], checked 2026-11-20 (derived as qwen3.config.heads * qwen3.config.head-dim).
- `qwen3.config.query-group`: Each key and value head serves 2 query heads: 16 attention heads over 8 key and value heads. Value 2 [derived], checked 2026-11-20 (derived as qwen3.config.heads / qwen3.config.kv-heads).
- `qwen3.config.rms-eps`: Qwen3-0.6B's RMSNorm epsilon is 1e-06. A learner who writes another epsilon gets logits that differ from the reference. Value 1e-06 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, rms_norm_eps <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L20>, read 2026-11-20).
- `qwen3.config.rope-theta`: Qwen3-0.6B's rotary embedding has a base (theta) of 1000000. Value 1000000 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, rope_theta <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L22>, read 2026-11-20).
- `qwen3.config.tied-embeddings`: Qwen3-0.6B ties its output projection to its embedding table, so its checkpoint holds one table for both. Value true [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, tie_word_embeddings <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L24>, read 2026-11-20).
- `qwen3.config.vocab-size`: Qwen3-0.6B's vocabulary has 151936 entries. Value 151936 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, vocab_size <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L29>, read 2026-11-20).
- `transformers.qwen3.attn-fn-contiguous`: The attention function ends by swapping the heads and the tokens back with transpose(1, 2) and making the result contiguous, so the tensor the layer then reshapes is already in one run. Value transpose(1, 2), then contiguous [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, eager_attention_forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L197>, read 2026-11-21).
- `transformers.qwen3.attn-projections`: Qwen3Attention has three separate projections for the query, the key and the value, and an output projection. The query's output width is the number of attention heads times the head size, and the key's and the value's is the number of key and value heads times the head size. Value q_proj, k_proj, v_proj and o_proj [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.__init__ <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L217-L227>, read 2026-11-20).
- `transformers.qwen3.attn-scaling`: The attention scores are scaled by the head size to the power of minus one half. Value head size to the power -0.5 [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.__init__ <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L213>, read 2026-11-20).
- `transformers.qwen3.attn-views`: The attention reshapes each projection with view into (batch, tokens, heads, head size) and swaps the first two inner dimensions with transpose(1, 2). Both are views. Value view, then transpose(1, 2) [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L244-L246>, read 2026-11-20).
- `transformers.qwen3.decoder-order`: In Qwen3's decoder layer in transformers the residual is kept, the input is normalized, the attention runs and the residual is added back. The same four steps follow for the MLP, with the post-attention norm. Value norm, attention, add, norm, MLP, add [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3DecoderLayer.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L296-L315>, read 2026-11-20).
- `transformers.qwen3.embedding`: Qwen3Model starts with an embedding table of vocab_size rows and hidden_size columns, then its decoder layers, then a final norm. Value an embedding of vocab_size by hidden_size [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Model.__init__ <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L344-L348>, read 2026-11-20).
- `transformers.qwen3.mlp`: Qwen3MLP applies the activation to the gate projection, multiplies by the up projection and applies the down projection. All three have no bias. Value down(act(gate(x)) * up(x)) [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3MLP <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L75-L81>, read 2026-11-20).
- `transformers.qwen3.qk-norm`: Each attention layer has a norm on the query and one on the key, built over the head size. They act on one head's vector, not on the model's hidden size. Value a norm of the head size on the query and the key [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.__init__ <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L229-L230>, read 2026-11-20).
- `transformers.qwen3.rmsnorm`: Qwen3RMSNorm casts to float32, takes the mean of the squares over the last dimension, multiplies by the reciprocal square root of that mean plus epsilon, casts back and then multiplies by its weight. Value float32, mean of squares, rsqrt, then the weight [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3RMSNorm.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L59-L63>, read 2026-11-20).
- `transformers.qwen3.rotate-half`: rotate_half splits the last dimension in two and returns the negated second half followed by the first half. Value the second half, negated, then the first [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, rotate_half <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L134-L136>, read 2026-11-20).
