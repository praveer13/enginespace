# TR0 cold-reader check

Read on 2026-11-21 by an agent with a fresh context that wrote none of TR0 and did not read the technical check's report. The reader is a kernelspace graduate who has not seen vLLM or SGLang. This report changes nothing else.

**What was read, in this order.**

1. The kernelspace lessons the module page names as prerequisites (`public/md/tr0/index.md:13`): T5.L1, T0.L3 and T0.L4, read from the sibling checkout at `d478f91` with `git show`, as `public/lessons-md/<id>.md`. Kernelspace is cited below by id and line only; none of its text is quoted.
2. TR0's pages in order, as exported in `public/md/tr0/`: `index.md`, then `l1` to `l5`.
3. The game's level copy: each level's parts list, goal line, prompt and guess (`packages/play/shape-shifter/copy.ts`), and the module's design (`curriculum/TR0-pytorch-for-rust.md` §2 and §3) and the twelve rules (`content/README.md`).
4. The built site, served by `vite preview` from this branch's build, at 1440x900 and 390x844: lesson 1 (the `views` level played to the end, a wrong `view` tried on the way, the Test opened) and lesson 4 (the `grid` level played to the end with a guess committed).

Line numbers are those of the exported Markdown under `public/md/tr0/`. Where a fix lands in a source file, its file and line follow in brackets.

## Verdicts

| Lesson | Verdict | Opener by rule 1 | Rules 8 to 12 | Test tests what was taught |
|---|---|---|---|---|
| `tr0.l1` | lost at `l1-pytorch-in-rust-terms.md:39` | B holds | 8 holds; 9 and 11 waived by the module page; 10 n/a; 12 holds | partly: the chain questions lean on line 39 |
| `tr0.l2` | lost at `l2-views-copies-and-hidden-syncs.md:36` | A holds | 8 holds; 12 broken at line 74 | yes |
| `tr0.l3` | lost at `l3-nn-module-as-a-struct.md:56` | C holds | 8 holds; 12 broken at lines 66 to 70 | no |
| `tr0.l4` | follows on the page; lost on the screen at the goal line | B holds | 8 holds; 12 broken at lines 114 to 120 | yes |
| `tr0.l5` | lost at `l5-engine-style-model-code.md:15` | C holds | 8 holds; 12 broken at lines 47, 49 to 53 and 55 | no |

Rules 9 and 11: the module page says the five lessons are separate subjects with no one relation (`index.md:29`), which is the waiver both rules allow. Rule 10 governs a table that sets two times side by side, and no TR0 table does.

## The module page and the prerequisites

- `index.md:13` names three kernelspace lessons as prerequisites. The lessons lean on four more: lesson 2 lists T5.L3 and T0.L6 (`l2:5`), lesson 3 lists T5.L4 (`l3:5`), and lesson 4 lists T4.L4 and T4.L6 (`l4:5`). A reader who takes the module page's advice reaches lesson 4 without T4.L6, the lesson where a grid of programs and a tile are first met, and reaches lesson 2 without having met "kernel" or "stream". The prerequisite line and the lessons' "Builds on" lines disagree.
- Lesson 2's "Builds on" names T5.L3 (prefill and decode) and T0.L6 (flame graphs), and its prose uses neither.
- T5.L1, the hard prerequisite, gives the forward pass as a cost ledger (T5.L1 lines 21 to 36) and the KV cache's reason (lines 47 to 58), and names GQA (line 90). It does not give RMSNorm, rotary position embeddings, the gated activation by name beyond one word at line 34, or the causal mask as a tensor. Lesson 3 relies on all four (see below).
- T0.L3 lines 34 to 36 give the row-major address sum for two dimensions; lesson 1 generalises it correctly and does not lose this reader there. T0.L4 is about the layout of records and cache lines; lesson 1 line 68 uses it in one sentence and nothing leans on it.

## Lesson 1: PyTorch in Rust terms

**Verdict: lost at `l1:39`.** "A new shape is a view only where each new dimension lies inside an old one, or spans old dimensions whose strides chain" is the only statement of when `view` succeeds, and "strides chain" is never said in other words: not which stride must equal which product, not an example of a chain and of a break. The reader can see why `view([24])` fails on the transpose (the walk 0, 6, 12, 18, 1 at line 39), but cannot apply the rule to a new shape. The Test then asks exactly that: the first question drawn in the browser was a `(5, 9)` tensor, `transpose(1, 0)`, then `reshape(15, 3)`, and asked for the elements moved. Answering it needs the chain rule. [source: `content/modules/tr0/lessons/l1-pytorch-in-rust-terms.md:51`]

**Terms used before they are given.**
- `reshape` is a row of the table at line 33, two paragraphs before line 39 says what it does. The game's controls offer `reshape` and `contiguous()` too, and neither the primer (lines 9 to 17) nor the `views` parts list says what either call does; the primer gives "view" and "copy" as ideas, not the calls. The level can still be finished by trial, with undo, so the opener holds; but by rule 2's letter the two calls are engine terms of the controls that the parts list and the primer do not carry.
- "storage" is the title's word, and line 35 is the first place that says it is the buffer.

**Opener.** B holds. The `views` level can be finished from the goal line, the four parts and the primer: transpose, then reshape.

**Rules 8 to 12.** Rule 8 holds (line 27 opens Read on the run just made; the kernelspace reference comes at line 47). Rule 12 holds: line 47 and line 95 say what a view does not buy; the claim marks follow their sentences.

**Test.** Three questions, at least one numeric: two `tr0.strides-of` and one `tr0.view-or-copy` (lines 112 to 116). The stride questions test lines 53 to 95. The chain question tests line 39, which was not taught well enough to answer (above). The Test's intro on the page says the reading's practice questions count toward it; the export's line 112 does not say so.

**On the screen.**
- The guess panel prints the prompt's code with its backticks: "The level's tensor has shape \`(4, 6)\`". The same in lesson 4's guess. [the `prompt` of each `predict` block: `l1-pytorch-in-rust-terms.md` and `l4-reading-triton.md` front matter]
- Below the unplayed game, Read part 1 is in full view: "You just made a (4, 6) tensor read column by column" and the reference's three steps. A reader who scrolls past the game before playing it reads the answer, and is told they did something they did not.
- At 390 px the goal line shows only "The reference does it with 1 copy. Ends when your tensor matches the target." The aim ("Read this tensor column by column, as one row of 24 elements") is behind a "more" link. The one sentence that says what to do is the one that is hidden.
- The target row reads "2 of 24 in place" before any move and "24 of 24 in place" after the transpose, while the target is still not reached (it also needs contiguous). Nothing on screen says what "in place" counts, so the reader at 24 of 24 does not know why the level has not ended.
- `reshape` and `view` each open a list of fifteen shapes, and the target `[24]` is the last, under a "More below" label that overlaps the bottom row of buttons. At the end of the run the same label overlaps "Run again" and "New numbers".
- Clicking `view` then `[24]` on the transpose gives the line "view cannot give [24] here: the stride order jumps where the new shape needs one stride. reshape would copy." and marks the two cells where the order jumps. This is the clearest statement of the chain rule in the module, and it lives only in the game.
- The header's button reads "Start: TR1 lesson 1" on every TR0 page. With N8's answer that is correct, but on a page headed "Lesson 1 of 5" this reader stopped to ask whether TR0 was the wrong place to be.

## Lesson 2: Views, copies, and the syncs you cannot see

**Verdict: lost at `l2:36`.** The analogy box "A spawn and a join" sits in the first part, on copies, before the part on syncs. It uses "sync", "item" and "tolist" (lines 36 to 38), which line 48 defines and lines 56 and 57 introduce. The reader meets the explanation of a sync before the question, then a checkpoint on views (line 42), then the sync section. [source: `l2-views-copies-and-hidden-syncs.md:50`]

**Terms used before they are given.**
- "kernel" in the setup at line 9 ("An attention kernel") and at line 30, and "streams" at line 59. Neither is in the named prerequisites; lesson 4 line 11 is the first place TR0 says what a kernel is, and no TR0 page says what a stream is.
- "head size" in the setup (line 9) and in the goal line of `three-d`: T5.L1 uses the symbol at line 32 and never the words. The reader can infer it from the shape; it is not lost.
- `(batch, tokens, heads, head size)` at line 32 adds a batch dimension that the game's tensors do not have; one clause would say the game drops it.

**Opener.** A holds: 45 words, and `three-d` is reachable from lesson 1's `permute` and `reshape` and the goal line.

**Rules 8 to 12.** Rule 8 holds (line 19). Rule 12 breaks at line 74: the loop runs `range(24)` and line 80 derives 25 waits, and no sentence says the 24 is arbitrary. The reader who goes on to lesson 3 meets 28 layers and asks where 24 came from. [source: `l2:97`] Line 86 says what the lesson does not buy.

**Test.** Yes: `fewest` graded, two `tr0.find-the-sync` and one `tr0.view-or-copy` (lines 90 to 96). The sync rules the items draw from (`packages/play/items/families/tr0/sync-rules.ts`) are the calls lines 54 to 67 teach, with `softmax` and `* 0.5` as two more GPU operations that line 64's rule covers.

## Lesson 3: `nn.Module` as a struct

**Verdict: lost at `l3:56`.** "The rotation" is a step of the layer, and the lesson says what `rotate_half` does to a vector and that "the rotary base is 1000000". It never says what is rotated, by what angle, or that the angle comes from the token's position. T5.L1 does not teach rotary embeddings either. The cache table then leans on it: "where the rotation starts: position 0 / the cache's length" (line 98) is the first hint that the rotation depends on position, and the reader cannot see why a cache would change it. [source: `l3-nn-module-as-a-struct.md:66` and `:112`]

**Terms used before they are given, or never given.**
- "RMSNorm" in the configuration table (line 39), given at line 53.
- `silu`, "gate projection", "up projection" (line 58): the order of the three calls is given, what `silu` is is not. T5.L1 line 34 names the gated MLP in one word.
- "the mask" at line 101 is the attention's causal mask, a tensor that no TR0 or prerequisite page shows. Lesson 4 then uses "mask" for a Triton lane mask. Two meanings of one word, one of them never given.
- "logits" at line 94, and "lm_head" at line 64 next to "output head" at line 49: the reader meets three names for the head and its output without one sentence that ties them.
- Line 41 says each key and value head serves two query heads; it does not say which two. A reader who writes the lab's attention has to guess the grouping.

**Other places the reader stopped.**
- Line 25 says how `nn.Module` builds a tensor's name is not in the documents the course read [unverified], one paragraph after line 19 says the name is the path through the fields joined with dots. The reader cannot tell whether line 19 is to be trusted. [source: `l3:31`]
- Line 84, "Going back, a `view` to `(1, 6, 2048)` is refused": going back from what? The table above it is the query on its way in. The tensor reshaped at the end of the attention is its output, which the lesson never draws. [source: `l3:94`]
- Lines 13 and 15 say the same thing twice: the prose paragraph and the analogy box under it are near copies. [source: `l3:16` and `:20`]
- The six numbered pieces at lines 53 to 58 are said to run "in the order the layer runs them", and the list has no softmax, no weighted sum of the values and no step that repeats the key and value heads for the query heads.

**Opener.** C holds; the lesson has no level. Its first thing to do (the guess at line 43) comes within its first part.

**Rules 8 to 12.** Rule 8 holds (line 9; the kernelspace reference is its third sentence). Rule 12, the last sentence rule, breaks at lines 66 to 70: five bullets carry a module, a shape and strides each, which is a table of five rows. Line 64 says the 6 tokens are arbitrary, as rule 12 asks. Line 103 says what the cache's contract does not promise.

**Test.** No. The Test (lines 109 to 113) is two `tr0.strides-of` items at level 2 and one `tr0.view-or-copy`. The first checks lines 76 to 84; the second checks lessons 1 and 2. Nothing in it asks for a checkpoint name's path (lines 19 to 23), the order of the layer's steps (line 49), a projection's width (lines 41 and 54, asked only as an ungraded guess), the key and value grouping, or the cache's contract (lines 92 to 103). The lesson lists `tr0.module-as-struct`, `tr0.decoder-forward` and `tr0.kv-cache-contract` as its KCs (line 7), and its Test grades `tr0.tensor-metadata` and `tr0.view-vs-copy`.

## Lesson 4: Reading Triton

**Verdict: follows on the page. On the screen, lost at the goal line of `grid`.**

**The goal line gives the guess's answer.** The guess (line 19) asks how many lanes the reference will leave masked. The goal line, in bold, directly above the guess on both widths, says "The reference leaves 80 lanes masked." At 390 px that sentence is the only part of the goal line shown, and the guess sits under it. [source: `packages/play/shape-shifter/copy.ts:123` against `:115`]

**Terms used before they are given.**
- "the course's Python `3.12`" at line 126. Lesson 5 line 47 is where the course's Python is first named.
- The seven vLLM kernels at lines 114 to 120 name block tables, slot mappings, Gumbel sampling and prefill inputs. None is in the named prerequisites (prefill is T5.L1 line 87). Nothing in the lesson leans on what they do, so the reader skims and is not lost.
- Line 39, "A kernel spells it in four lines", heads a kernel of eight lines; the reader looks for the four.

**Opener.** B holds. The five facts of the primer, the five parts and the goal line are enough to plan `(16, 4)` on a `(12, 20)` tensor.

**Rules 8 to 12.** Rule 8 holds (line 27). Rule 12: line 37 says the cap of six programs is the level's; lines 95 and 124 say what a stride-correct read and a CPU run do not buy. The seven kernels at lines 114 to 120 are a list of what a table carries (kernel, file, what one program covers, ran), and four rows of it say only "ran". [source: `l4-reading-triton.md:134` onward]

**Test.** Yes: `grid` graded and three `tr0.grid-cover` items: which program covers an element, how many programs, how many lanes masked, all taught at lines 9 to 99.

**On the screen.**
- At 1440 px the launch panel clips its own labels: "BLOCK" shows as "OCK" and "Grid" as "d" once a value has two digits, and the "+" of dimension 1 is cut at the panel's right edge before any change.
- "BLOCK must be a power of two." stays beside Launch while BLOCK is `(1, 1)` and while it is `(16, 4)`; both are powers of two. The reader read it as an error.
- The BLOCK steppers count by one (1, 2, 3, 4 and so on), through values the level refuses, where the primer says BLOCK is a power of two. Fifteen clicks reach 16.
- Changing BLOCK resets the grid to cover the tensor; the grid's own steppers then change it again. Nothing says the grid follows BLOCK.
- After the launch, the debrief ends on "Counted: none on this path." and "Read from your run of Tensor views, on seed 00000000." The first means nothing to the reader; the second is a build word on the learner's page.
- At 390 px the guess card overlaps the "Tiles" heading and the top of the drawing, and "More below" overlaps the confidence buttons. While the reader steps BLOCK, the drawing is above the fold.

## Lesson 5: Engine-style model code

**Verdict: lost at `l5:15`.** "The layer runs the same four pieces as the third lesson's: the input norm, the attention, the post-attention norm and the MLP." Lesson 3 gave the layer as six numbered pieces (`l3:53` to `l3:58`) and as "norm, attention, add, norm, MLP, add" (`l3:49`). The reader goes back to find four pieces and finds neither list. The next sentence, that each norm "takes the residual along and returns the new one", is not said in terms of what the norm's call takes and returns, and the reader cannot see where the add went. [source: `l5-engine-style-model-code.md:18`]

**Other places the reader stopped.**
- Line 39, "One more line of the layer is for the next module." The next module in course order is TR1; the NVTX ranges are for TR3. [source: `l5:46`]
- Line 47 ends on three date chips in a row, after a sentence that names three releases. Which date is which is not on the page; the reader has to open each chip. The paragraph's subject (pins and release dates) is not the part's subject (kernels an engine owns).
- Lines 53 and 57 name "the speculative rejection sampler" and "check a draft's tokens"; neither speculative decoding nor a draft is in the named prerequisites or in TR0.
- Line 59 says Triton's documentation words the `tl.arange` rule as "a start that must be a power of two" and the code checks the difference. Lesson 4 line 61 already gave the rule without the documentation's wording; the reader is left unsure which to believe.
- Lines 69 to 73: the Rust crate is `sglang-radix-tree`, and `match_prefix` is its call. The lesson never says what a radix tree does for SGLang or what prefix is matched, so the reader reads a seam into something unnamed.
- Line 33, "the attention layer that `RopeAttn` calls", is never named.

**Opener.** C holds; no level.

**Rules 8 to 12.** Rule 8 holds (line 9). Rule 12 breaks three times: lines 49 to 53 are five bullets of file, line count and contents, a table of three columns; line 55 puts eight claim marks after one sentence, away from the counts each supplies; line 47's three dates, as above. Line 37 and line 79 say what a merged projection and the Rust tree do not buy.

**Test.** No. The Test (lines 83 to 87) is two `tr0.find-the-sync` items and one `tr0.grid-cover`. Lesson 5 teaches no sync; the syncs are lesson 2's. The one `grid-cover` item matches line 61's launch arithmetic. Nothing asks for the merged projection's width (line 25, asked only as an ungraded guess at line 19), what `gate_up_proj` merges, or which program of the temperature kernel's launch covers a vocabulary entry.

## Across the module

- Three lessons' Tests grade what an earlier lesson taught (lesson 1's chain rule is the exception inside lesson 1; lessons 3 and 5 entirely). With N5's rule that a Test passes only when every question is right, a reader of lesson 3 or 5 is held to lessons 1 and 2 and never to the lesson in front of them.
- The guess prompt and the goal line are written apart. In `grid` they collide (the answer is in the goal line). In `views` they do not.
- The exported Markdown marks every Test item block "Practice." The page shows them under Test. A reader of the export (or of `llms.txt`) cannot tell the Test from the checkpoints.

## Owner questions

N5 and N8 were read as the owner answered them on 2026-11-19 (`docs/waves/W2m1a-report.md` §11). No unanswered owner question bore on this check, and no default was taken.

## For the rewrite task

In order of how far the reader got before stopping: `l1:39` (the chain rule, which the Test asks); `l3:56` with `l3:98` (the rotation); `l3` Test; `l5` Test; `copy.ts:123` (the goal line gives the guess's answer); `l2:36` (the box before the definition); `l5:15` (four pieces); `l3:25` and `l3:84`; then the terms listed per lesson. The screen findings in the frame (the hidden aim at 390 px, "More below" over buttons, the clipped launch panel, the stale power-of-two line, the debrief's last two lines) are outside the lesson files.

## Closing lines (W2b-T53)

Each row of this report, closed: rewritten in the lessons at the commit whose subject starts "W2b-T53", or listed for the owner with the reason. Line numbers are this report's, of the export before the rewrite.

**The lost-at rows.**

- `l1:39`, the chain rule: rewritten. Lesson 1 now says when two dimensions chain (the outer stride is the inner size times the inner stride), sets the contiguous `(4, 6)` and its transpose side by side in a table of the two strides, and works a split that is a view (`view([2, 3, 4])` on the transpose, strides `(3, 1, 6)`) and a merge that is refused (`view([3, 8])`). A test holds both examples to the tensor model. The Test's chain question now asks what the page taught.
- `l2:36`, the spawn-and-join box before the definition of a sync: rewritten. The box moved into the part on syncs, after the two lists of calls that wait and that do not, and its last sentence, which pointed at the second half, is gone.
- `l3:56` with `l3:98`, the rotation: rewritten. Step 4 of the layer now says what is rotated (the query and the key, not the values), by what (an angle for each pair of a head's dimensions, the token's position times a frequency set by the rotary base), and how (`q * cos + rotate_half(q) * sin`). The cache's table row on where the rotation starts now has its reason beside it: with a cache, the new tokens are numbered from the count already cached. Eight new claims of the pinned `transformers` file carry it and the steps below (`transformers.qwen3.rope-angles`, `rope-apply`, `position-ids`, `repeat-kv`, `attn-softmax`, `causal-mask`, `lm-head`, `tied-keys`).
- `l4`, on the screen, the `grid` goal line that gives the guess's answer (`copy.ts:123` against `:115`): **listed for the owner.** The practice goal line prints "The reference leaves 80 lanes masked." above the guess that asks for that number. Changing it moves three assertions of `tests/copy/game-copy.test.ts` (the regex for a practice level's stated count, the check that the beat holds the least masked count, and the line that pins the sentence with its 80), and the merge gate refuses a changed number in an assertion unless the coordinator allows it. The proposed edit: the practice `grid` beat says "Match the reference's masked lanes, the fewest any launch can leave; its count shows when you launch.", and the three assertions move with it. The other fix, hiding the beat until the guess is committed, is the frame's.
- `l5:15`, "the same four pieces": rewritten. Lesson 5 now says the layer runs the third lesson's steps in the same order, and says where the residual add went: Mini-SGLang's norm takes the new output and the residual, adds them inside its call and returns the normalized sum and the sum.

**Terms used before they were given, and other places the reader stopped.**

- `l1:33`, `reshape` and `contiguous()` used before they are given, and the controls' calls not in the primer: rewritten. The primer now says what `transpose`, `view`, `contiguous()` and `reshape` make.
- `l1`, "storage" first explained at line 35: rewritten. The primer's first fact calls the buffer PyTorch's storage.
- `l1`, "in place" on the screen: rewritten in the primer ("The target counts the elements in place: those that already sit where the target reads them."). The readout's own label is the game's and is unchanged.
- `l1`, Read part 1 tells a reader who has not played that they did: rewritten ("The level asks for a `(4, 6)` tensor read column by column."; the same in lessons 2 and 4). That Read sits in full view under an unplayed game is the page's layout: listed for the owner.
- `l1` and `l4`, the guess prompts printed with their backticks: rewritten. The four TR0 prompts that held code spans now hold none, since the guess panel prints a prompt as plain text. The prompts' copies in `packages/play/predictions/same.ts`, `tr0.ts` and `commit-tr0.ts` moved with them. The panel's not drawing code spans is the renderer's (`src/content/render/Tagged.tsx`), and other modules' prompts have the same mark: listed.
- `l2:9` and `l2:30`, "kernel" before it is given: rewritten. The setup's first sentence says a kernel is a function that runs on the GPU.
- `l2:59`, "streams": rewritten. The part on syncs says a queue that holds GPU work is called a stream.
- `l2:32`, the batch dimension the game does not have: rewritten ("The batch counts the prompts run together, and the level leaves it out.").
- `l2:74`, `range(24)` not said to be arbitrary: rewritten, in the sentence after the loop.
- `l2:5`, "Builds on" names T5.L3 and T0.L6, which the prose does not use: rewritten to T0.L3 (strides) and T5.L1 (attention heads). The module page's prerequisites are the `course.yaml` entry and are unchanged: listed for the owner, since TR0 is an advised primer and each lesson now carries the terms it leans on.
- `l3:39`, RMSNorm in the configuration table before it is given: rewritten ("the small number every norm adds before its square root").
- `l3:58`, `silu`, the gate and the up projection: rewritten. The MLP's step says the activation of the gate projection multiplies the up projection element by element, and that `silu` acts on each element on its own.
- `l3:101`, "the mask", never given, and a second meaning in lesson 4: rewritten. Step 5 says the mask added to the scores is causal and what it lets a token read; the cache's table names it "the causal mask".
- `l3:94` and `l3:64`, "logits", "lm_head" and "output head": rewritten into one sentence: the output head `lm_head` turns each token's vector into a score for each vocabulary entry, and those scores are the logits.
- `l3:41`, which two query heads a key and value head serves: rewritten. `repeat_kv` repeats each head in place, so query heads 0 and 1 read head 0 and heads 2 and 3 read head 1.
- `l3:25`, the dotted names said to be unverified after line 19 stated them: rewritten. The page shows two names the pinned `transformers` writes itself (`lm_head.weight` and `model.embed_tokens.weight`), and says the pattern is read from names like those and not from a rule.
- `l3:84`, "Going back" from what: rewritten. The paragraph says the attention's output comes back heads first, `o_proj` needs tokens first, and on the tensor in the table a `view` to `(1, 6, 2048)` is refused because its heads and tokens do not chain.
- `l3:13` and `:15`, the paragraph and the box that say the same: rewritten. The paragraph is one sentence now.
- `l3:53` to `:58`, no softmax, no weighted sum, no repeat of the key and value heads: rewritten. Step 5, "The attention", holds the repeat, the scaled scores, the mask, the softmax and the weighted sum of the values, and `o_proj`.
- `l3:66` to `:70`, five bullets that are a table: rewritten as a table, after the checkpoint, so the part stays under the pacing bound.
- `l4:126`, "the course's Python `3.12`" before lesson 5 names it: rewritten ("Python `3.12`, the one the course's environments use").
- `l4:39`, "four lines" over a kernel of eight: rewritten ("a kernel spells it out in a few lines").
- `l4:114` to `:120`, seven kernels as a list a table can carry: stands, after a try. As a table of kernel, file, what one program covers and sources, the long kernel and file names broke inside their words at 1280 px and below, and the claim chips printed their values in a column of their own, so the table read worse than the list. The list keeps one kernel to a line, with its link, its file and its marks.
- `l4`, the seven vLLM kernels' terms (block tables, slot mappings, Gumbel sampling, prefill inputs): stand. Nothing in the lesson leans on what they do.
- `l5:39`, "the next module": rewritten. The NVTX line matters in TR3, the module that profiles an engine's step.
- `l5:47`, three date chips after one sentence, in a part about kernels: rewritten as a table of release and the day its first files went up, after the part's kernel paragraph.
- `l5:53` and `:57`, the speculative rejection sampler and "a draft": rewritten. The page says the last kind of kernel is the verify step of speculative decoding from T5.L8, and what the rejection sampler decides.
- `l5:59`, Triton's documentation against its code: rewritten. The page gives the code's rule (a range whose length is not a power of two is refused), says it is the fourth lesson's rule for `BLOCK`, and says the documentation words it about the start and that the code is what runs.
- `l5:69` to `:73`, the radix tree never said: rewritten. The part opens on T5.L6's radix tree: requests that start with the same tokens share one path, and a lookup returns the longest prefix the tree holds.
- `l5:33`, "the attention layer that `RopeAttn` calls" never named: rewritten so that nothing promises a name: `RopeAttn.forward` passes the merged output to a second attention layer that holds the rotary embedding and the two norms.
- `l5:49` to `:53`, five bullets that are a table: **listed.** The rows stay bullets, because `tests/content/tr0-module.test.ts` holds each row's opening words and its printed line count, and turning them into a table moves those assertions, which the merge gate refuses without the coordinator's allow. `l5:55`, eight claim marks after one sentence: rewritten. Each bullet now ends in its own claims.

**The Tests.**

- `l1` Test: closed by the chain-rule rewrite above.
- `l3` Test grades lessons 1 and 2's skills, not lesson 3's: **listed for the owner.** No item family yet asks for a checkpoint name's path, the order of the layer's steps, a projection's width, the key and value grouping or the cache's contract; a family is an items task (`packages/play/items/`, its registry and vectors), not a rewrite of the lesson. The Exit check's lead now says which lesson each question goes back to.
- `l5` Test grades lesson 2's syncs: **listed for the owner**, for the same reason: no family asks for the merged projection's width, what `gate_up_proj` merges, or which program of the temperature kernel's launch covers a vocabulary entry. The Exit check's lead now says the two sync questions are the second lesson's.

**On the screen, outside the lesson files: listed for the owner.** None of these is in a lesson, a claim or the level copy; each is the frame's or the Tensor views views': the goal's aim hidden behind "more" at 390 px; "More below" over the bottom row of buttons and over "Run again" and "New numbers"; the launch panel clipping "BLOCK", "Grid" and the "+" at 1440 px; "BLOCK must be a power of two." shown beside a valid BLOCK; the BLOCK steppers counting by one; the grid following BLOCK without a word; the debrief's "Counted: none on this path." and "on seed 00000000"; the guess card over the "Tiles" heading at 390 px; the header's "Start: TR1 lesson 1" on a page headed "Lesson 1 of 5", which is right by N8 and reads as a wrong turn. The export's "Practice." label on Test item blocks is the compiler's.

**The passages W2b-T36 changed, read again.**

- Lesson 2, the paragraph on where `transformers` copies (W1): stands. The batch sentence was added after its first claim mark.
- Lesson 3, the copy at the end of the attention function (W1): rewritten. The sentence moved into the paragraph under the query's table, where the refused `view` explains why the copy is needed, and its claim mark moved with it.
- Lesson 3, the lab's loader (W2): stands, after the dotted-name paragraph before it was rewritten.
- Lesson 3, the norm on each head between the view and the transpose (N1): stands, in the query's paragraph; the step list's item 3 was shortened.
- The card `tensor`, its line on Triton's interpreter (W3): rewritten. "Wrote what the grid model counts" said the kernel wrote counts; the counts are the course script's arithmetic. The line now says the kernel wrote what PyTorch computes, and that on the one-dimensional launch its last program's mask was false on the two lanes the grid model counts as masked.
- `content/claims/tr0.yaml`, `transformers.qwen3.attn-fn-contiguous` and the narrowed `attn-contiguous`: stand.
