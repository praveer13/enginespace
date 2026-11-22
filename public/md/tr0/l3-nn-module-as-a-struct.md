# nn.Module as a struct: Qwen3's forward in the pinned transformers

_PyTorch for the Rust-first, and reading Triton · lesson `tr0.l3` · review · about 20 minutes [estimated]_

Builds on kernelspace: `ks:T5.L1`, `ks:T5.L4`, `ks:t5.gqa-kv-heads`, `ks:t5.why-kv-cache`.

Knowledge components: `tr0.module-as-struct`, `tr0.decoder-forward`, `tr0.kv-cache-contract`.

The last two lessons showed what a call does to one tensor, and an engine's model code is many tensors owned by code. This lesson reads one model's forward pass, Qwen3-0.6B's, as the pinned `transformers` writes it. kernelspace T5.L1 drew the same pass as data moving through memory.

## A module is a struct

A PyTorch `nn.Module` is model code's struct with an `impl` block. A model is a module made of modules, the way a struct can hold structs.

> **A struct and a module.** In Rust, a struct's fields are other structs and arrays, and an impl block gives it a method that computes from them. A PyTorch module has the same parts. Its fields are the tensors it owns and the modules it contains, and its forward method is the computation.
>
> Where it breaks: A Rust struct's fields are fixed and checked when the program compiles. A module's fields are attributes that Python sets while the module is being built, so a misnamed field or a shape that does not fit shows up as an error only when the code reaches it.

A checkpoint is a file of named tensors, and the module tree is the code that consumes them. The names are paths through the fields, joined with dots. The pinned `transformers` writes two of them itself, when it ties the output head's weight to the embedding table's: `lm_head.weight` and `model.embed_tokens.weight`. **lm_head.weight tied to model.embed_tokens.weight** [measured] By the same pattern, this would be the weight of the query projection of the attention of the first layer:

```text
model.layers.0.self_attn.q_proj.weight
```

How `nn.Module` builds such names is not in the PyTorch documents the course read [unverified], so the pattern is read from names like the two above and not from a rule. The lab checks only the numbers your `build` returns, so a name that fits no field is yours to catch: `load_state_dict(strict=True)` refuses one [unverified].

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
| the small number every norm adds before its square root (`rms_norm_eps`) | **1e-06** [measured] |

Each key and value head serves **2** [derived] query heads, and the hidden size is not the number of heads times the head size. Commit to the size of the query projection with that in mind.

> **Predict `tr0.l3.p1`.** Qwen3-0.6B has a hidden size of 1024 [measured], 16 [measured] attention heads, 8 [measured] key and value heads and a head size of 128 [measured]. How many output rows does the query projection q_proj of the first layer have?
>
> The learner commits to a number in `rows`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

## Qwen3's decoder layer at the pin

At the pin, `transformers` `5.19.0`, one decoder layer keeps its input as the residual, normalizes the input, runs the attention and adds the residual back. It does the same for the MLP, with the post-attention norm. **norm, attention, add, norm, MLP, add** [measured] The model is an embedding table, then the layers, then a final norm. **an embedding of vocab_size by hidden_size** [measured] The output head `lm_head` then turns each token's vector into one score for each entry of the vocabulary, and those scores are the logits. **hidden_size to vocab_size, the logits** [measured] Qwen3-0.6B ties the head to the embedding table, so the checkpoint holds one table for both. **true** [measured]

Inside the layer, in the order it runs:

1. **The norm.** Qwen3's RMSNorm, `Qwen3RMSNorm`, casts to `float32`, takes the mean of the squares over the last dimension, multiplies by the reciprocal square root of that mean plus epsilon, casts back, and multiplies by its weight. **float32, mean of squares, rsqrt, then the weight** [measured]
2. **The projections.** `q_proj`, `k_proj` and `v_proj` make the query, the key and the value. The query's width is the number of heads times the head size, and the key's and the value's is the number of key and value heads times the head size. **q_proj, k_proj, v_proj and o_proj** [measured] That is **2048** [derived] rows for the query and **1024** [derived] for each of the other two.
3. **The norm on each head.** The query and the key each get an RMSNorm of one head's vector. **a norm of the head size on the query and the key** [measured]
4. **The rotation.** Attention alone does not know where a token sits, and the rotation tells it. Each pair of a head's dimensions has a frequency set by the rotary base, `1000000`, and a token's angle for that pair is its position times the frequency. **position times a frequency per pair** [measured] **1000000** [measured] `rotate_half` splits the last dimension in two and returns the negated second half followed by the first. **the second half, negated, then the first** [measured] The query becomes itself times the cosine of its angles plus `rotate_half` of itself times the sine, and so does the key. The values are not turned. **q * cos + rotate_half(q) * sin** [measured]
5. **The attention.** `repeat_kv` repeats each key and value head in place, so query heads 0 and 1 read key and value head 0, and heads 2 and 3 read head 1 [derived]. **each key and value head repeated in place** [measured] The scores are the query times the transposed keys, scaled by the head size to the power of minus one half. **head size to the power -0.5** [measured] The mask is added, a softmax turns each row of scores into weights, and the weights multiply the values. **scores, mask, softmax, values** [measured] The mask is causal: it lets a token read itself and the tokens before it, and none after. **a causal mask** [measured] `o_proj` takes the result back to the hidden size, so the residual can be added [derived].
6. **The MLP.** `Qwen3MLP` applies the activation to the gate projection, multiplies by the up projection element by element, and applies the down projection, and all three have no bias. **down(act(gate(x)) * up(x))** [measured] The activation is `silu`, applied to each element on its own. **silu** [measured]

## Shapes through one layer

Take one prompt of `6` tokens [estimated]. The `6` is arbitrary: it is this lesson's, and no engine's.

The attention moves tensors with the first two lessons' calls. The query is viewed into heads, normed on each head and transposed, and both moves are views. **view, then transpose(1, 2)** [measured] The norm keeps shape and strides, so the table skips it. The projection's `(1, 6, 2048)` output is viewed as `(1, 6, 16, 128)` and then transposed. Printed by the course's model on 2026-11-21 at `0dc2dcc`.

| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |
|---|---|---|---|
| the start | `(1, 6, 2048)` | `(12288, 2048, 1)` | 0 |
| `view([1, 6, 16, 128])` | `(1, 6, 16, 128)` | `(12288, 2048, 128, 1)` | 0 |
| `transpose(1, 2)` | `(1, 16, 6, 128)` | `(12288, 128, 2048, 1)` | 0 |

Both steps are views. The result's second stride is `128`, one head's width, and its third `2048`, a projection row. The attention's output comes back heads first, and `o_proj` needs tokens first. On the tensor in the table, a `view` to `(1, 6, 2048)` is refused: its heads and tokens do not chain, so no one stride walks them [synthetic]. So the attention function swaps them back and ends with `contiguous()`, the one copy, and the layer's `reshape` after it is a view. **transpose(1, 2), then contiguous** [measured]

Check the strides of a reshape like this one before you read on.

> **Practice.** Items from the generator family `tr0.strides-of`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

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

A token reads only itself and the tokens before it, so what a layer computed for a token does not change when later tokens arrive. A KV cache keeps each layer's keys and values for the tokens already seen. kernelspace T5.L4 works out how much memory that takes, and here the question is what it must not change.

The contract is one sentence: the logits of each step equal the logits of a full recompute of the same prefix. The lab's stage with a cache checks it step by step, and it checks that the cache holds as many positions as the prefix after every step. Four parts of the attention change when the cache arrives, and no other part does.

| Part of the attention | Without a cache | With a cache |
|---|---|---|
| where the rotation starts | position `0` | the cache's length |
| the queries | every token | the new tokens only |
| the keys and values | every token's, recomputed | the whole cache, with the new ones appended |
| the causal mask | square | one row for each new token, over every cached position and itself |

The rotation's row follows from its angles, which come from each token's position: with a cache, the new tokens are numbered from the count already cached. **new tokens numbered from the cache length** [measured] A cache written at the wrong position gives logits that are nearly right and not equal, which is why the check compares them with a recompute and not with a plausible word. The contract says nothing about how an engine stores the cache or how large it grows. It only says that the cache must not change an answer.

> **Card.** The build-this card `build-tr0-forward`.

## Exit check

Three questions on new tensors: two ask for a stride after the reshapes of attention, as this lesson's query table did, and one asks what a chain of calls does, as the first two lessons did.

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
- `transformers.qwen3.attn-softmax`: The attention multiplies the query by the transposed keys and scales the scores, adds the mask, takes a softmax over the last dimension, and multiplies the weights by the values. Value scores, mask, softmax, values [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, eager_attention_forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L190-L196>, read 2026-11-21).
- `transformers.qwen3.attn-views`: The attention reshapes each projection with view into (batch, tokens, heads, head size) and swaps the first two inner dimensions with transpose(1, 2). Both are views. Value view, then transpose(1, 2) [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L244-L246>, read 2026-11-20).
- `transformers.qwen3.causal-mask`: Qwen3Model builds the mask that the attention adds to its scores with create_causal_mask. Value a causal mask [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Model.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L394-L396>, read 2026-11-21).
- `transformers.qwen3.decoder-order`: In Qwen3's decoder layer in transformers the residual is kept, the input is normalized, the attention runs and the residual is added back. The same four steps follow for the MLP, with the post-attention norm. Value norm, attention, add, norm, MLP, add [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3DecoderLayer.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L296-L315>, read 2026-11-20).
- `transformers.qwen3.embedding`: Qwen3Model starts with an embedding table of vocab_size rows and hidden_size columns, then its decoder layers, then a final norm. Value an embedding of vocab_size by hidden_size [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Model.__init__ <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L344-L348>, read 2026-11-20).
- `transformers.qwen3.lm-head`: The output head lm_head is a linear layer from the hidden size to the vocabulary size, and what it returns is named the logits. Value hidden_size to vocab_size, the logits [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3ForCausalLM <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L433-L482>, read 2026-11-21).
- `transformers.qwen3.mlp`: Qwen3MLP applies the activation to the gate projection, multiplies by the up projection and applies the down projection. All three have no bias. Value down(act(gate(x)) * up(x)) [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3MLP <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L75-L81>, read 2026-11-20).
- `transformers.qwen3.position-ids`: When no positions are passed, Qwen3Model numbers the new tokens from the count of tokens already in the cache, or from 0 with no cache. Value new tokens numbered from the cache length [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Model.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L378-L381>, read 2026-11-21).
- `transformers.qwen3.qk-norm`: Each attention layer has a norm on the query and one on the key, built over the head size. They act on one head's vector, not on the model's hidden size. Value a norm of the head size on the query and the key [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.__init__ <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L229-L230>, read 2026-11-20).
- `transformers.qwen3.repeat-kv`: Before the scores, repeat_kv repeats each key and value head for the query heads of its group, as torch.repeat_interleave does along the head dimension, so neighbouring query heads share one key and value head. Value each key and value head repeated in place [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, repeat_kv <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L165-L175>, read 2026-11-21).
- `transformers.qwen3.rmsnorm`: Qwen3RMSNorm casts to float32, takes the mean of the squares over the last dimension, multiplies by the reciprocal square root of that mean plus epsilon, casts back and then multiplies by its weight. Value float32, mean of squares, rsqrt, then the weight [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3RMSNorm.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L59-L63>, read 2026-11-20).
- `transformers.qwen3.rope-angles`: The rotary embedding computes one inverse frequency for each pair of a head's dimensions from the base rope_theta, and multiplies each token's position by those frequencies, so the angles grow with the position. Value position times a frequency per pair [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3RotaryEmbedding <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L118-L124>, read 2026-11-21).
- `transformers.qwen3.rope-apply`: apply_rotary_pos_emb rotates the query and the key, and nothing else: each is multiplied by the cosine of its angles, and rotate_half of it by the sine, and the two are added. Value q * cos + rotate_half(q) * sin [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, apply_rotary_pos_emb <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L140-L162>, read 2026-11-21).
- `transformers.qwen3.rotate-half`: rotate_half splits the last dimension in two and returns the negated second half followed by the first half. Value the second half, negated, then the first [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, rotate_half <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L134-L136>, read 2026-11-20).
- `transformers.qwen3.tied-keys`: Qwen3ForCausalLM names the tensors it ties by their dotted paths: lm_head.weight to model.embed_tokens.weight. Value lm_head.weight tied to model.embed_tokens.weight [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3ForCausalLM <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L424>, read 2026-11-21).
