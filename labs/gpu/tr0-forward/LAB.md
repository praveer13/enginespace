# Build the Qwen3-0.6B forward pass on a CPU

You write the forward pass of a small language model, Qwen3-0.6B, in plain PyTorch, and load Hugging Face's weights into it. A grader on your machine runs your code and Hugging Face's `transformers` on the same inputs, on the same CPU, in fp32, and compares the logits. Then you add a KV cache and the grader checks that it changes nothing.

No GPU is used. Everything runs on the CPU. The course site checks the receipt your grader writes; it never runs your code.

## Before you start

- You have this kit unzipped, and every command below runs from its folder (`enginespace-gpu-kit/`).
- You read PyTorch well enough to follow a `Tensor`'s shape, its strides and what `view` and `reshape` do. If a stride is still a surprise, play Tensor views first.
- You know what a decoder layer does from kernelspace T5: attention reads every earlier token, and the MLP works on one token at a time.

## 1. Set up

```sh
uv sync --locked --project envs/cpu
uv run --project envs/cpu enginespace fetch tr0.forward
```

The first line installs torch, `transformers` and the grader from the lock. The second downloads the pinned weights into your cache folder, and keeps a file only when its SHA-256 is the one the course pinned. It prints the cache folder. Run it again and it checks the files in place. The course has not yet run this download on the pinned files [unverified], so if it stops, the line it prints says why and the command resumes where it stopped.

## 2. The file you edit

`gpu/tr0-forward/starter/forward.py` is the only file you change. It holds the shells of the classes you write, and each `raise NotImplementedError` names a piece. The docstring at the top is the contract: what `build`, the model's call, `layer`, `new_cache` and `step` take and return.

Name your modules as the checkpoint does (`embed_tokens`, `layers`, `self_attn`, `mlp`, `norm`, `lm_head`). The grader records the shape and the strides of what leaves five of them, and the course site asks you about them later.

## 3. Read the reference first

The reference is Hugging Face's own Qwen3, which `uv sync` already installed. Open it:

```sh
uv run --project envs/cpu python -c "import transformers.models.qwen3.modeling_qwen3 as m; print(m.__file__)"
```

Read `Qwen3RMSNorm`, `Qwen3MLP`, `rotate_half`, `apply_rotary_pos_emb`, `repeat_kv`, `Qwen3Attention` and `Qwen3DecoderLayer`. That file is the specification for stages 1 and 2, at the `transformers` version of your lock. You may read it as much as you like. You may not import from it in `forward.py`: the import guard refuses `transformers.models`, and a file that reaches for it is not graded.

Read the sizes from `config` and never type them. `hidden_size`, `num_attention_heads`, `num_key_value_heads`, `head_dim`, `intermediate_size`, `num_hidden_layers`, `vocab_size`, `rms_norm_eps` and the rotary base are all there. The rotary base's key depends on the `transformers` version, so look at how `Qwen3RotaryEmbedding` finds it.

## 4. Stage 1: one layer

Write `RMSNorm`, `MLP`, `Attention`, `Layer` and `Model.layer`, and make `build` load layer 0's weights. The grader feeds layer 0 the embeddings of two prompts and compares what comes out with the reference's layer 0.

The pieces, in order:

1. **RMSNorm.** Divide each vector by the root of the mean of its squares plus epsilon, then multiply by the weight. Epsilon is in the config. A wrong epsilon passes a glance and fails the grader: that is the point of this lab.
2. **Attention.** Project to queries, keys and values. The query and key each get an RMSNorm over the head's own dimension before the rotation, which not every model does. Rotate the queries and keys by position with `rotate_half`. There are fewer key and value heads than query heads, so each key and value head is shared by a group of query heads. Mask so a token reads only itself and the tokens before it, scale the scores by one over the root of the head dimension, softmax, and mix the values.
3. **MLP.** The gate projection goes through SiLU, multiplies the up projection element by element, and the down projection brings it back.
4. **Layer.** Norm, attention, add the input back; norm, MLP, add back.

Grade it:

```sh
uv run --project envs/cpu enginespace grade tr0.forward.s1 --challenge <token>
```

The token comes from the course site's Receipts page, which also prints this command with the token in it. The grader asks how much help you had: say it with `--assisted none|explain|code` and `--agent yes|no`, or it records the most help. Stage 1 is practice: the module does not need it, and it shows you where an error starts before 28 layers hide it.

## 5. Stage 2: the whole forward pass

Write `Model.__init__` and `Model.forward`, and make `build` load every weight. `weights` maps each checkpoint name to a tensor, so `model.layers.7.mlp.down_proj.weight` goes into `layers[7].mlp.down_proj.weight`. Start from the names, and make the modules fit them: `load_state_dict(strict=True)` will tell you about every name that does not fit.

The model is embedding, the layers in order, the final norm, then the output head, which maps each position's vector to one score per vocabulary token. When the config ties the head to the embedding, `weights` already holds `lm_head.weight`.

Grade it:

```sh
uv run --project envs/cpu enginespace grade tr0.forward.s2 --challenge <token>
```

The stage checks two things on your machine. `logits-fp32` compares your logits with the reference's at every element and passes when the largest difference is within the bound. `import-guard` passes when your file did not import `transformers.models`. A third check, `argmax-bank`, is made by the course site from your receipt: it compares your top token at chosen positions with the ids the course recorded. Until the course has recorded them, that check cannot pass, and the page says so.

When `logits-fp32` fails, find where your forward pass leaves the reference's. Load the reference yourself in a scratch script (not in `forward.py`) and compare each layer's output:

```python
import json, torch
from transformers import AutoModelForCausalLM
folder = "<the cache folder that fetch printed>/tr0/qwen3-0.6b"
reference = AutoModelForCausalLM.from_pretrained(folder, dtype=torch.float32).eval()
```

Register a forward hook on `reference.model.layers[i]` and on your own `layers[i]`, run the same ids through both, and print the largest absolute difference after each layer. The first layer where it jumps is the one to read again.

## 6. Stage 3: the KV cache

Write `Cache`, `Model.new_cache` and `Model.step`. Without a cache, every new token recomputes every earlier token's keys and values. With one, a step computes the new token's keys and values, appends them to each layer's cache, and attends over everything cached.

What changes:

- The new token's position is the cache's length, so the rotation must use `start`, not zero.
- The queries are the new tokens only. The keys and values are the whole cache.
- The mask is no longer square: a new token may read every cached position and itself.
- `cache.length` must say how many positions the cache holds, after every step, and it is checked.

The grader feeds a short prefix, then decodes one token at a time. After each step it compares your logits with a full recompute of the same prefix, by the reference and by your own uncached forward pass, and checks `cache.length` against the prefix length.

```sh
uv run --project envs/cpu enginespace grade tr0.forward.s3 --challenge <token>
```

`cache-logits` fails for a cache written at the wrong position or read before it is written. `cache-lengths` fails for a cache that appends twice, or never.

## 7. Bring the receipt back

Each `grade` writes one file under `receipts/`, whether the checks passed or not. Drop it on the course site's Receipts page. The site checks it again in your browser and sends nothing anywhere.

## What the grader does not do

It does not read your file's name or path into the receipt. It does not stop you from copying code from `transformers` by hand: the import guard is friction, not a lock. What a copied line cannot do is answer the questions the course asks about the tensors of your own run.
