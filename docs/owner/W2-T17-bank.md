# W2-T17: record the TR0 argmax bank

This is the owner's step. The generator is built and tested (W2b-T31), and no bank is published: `BANKS` in `src/receipts/declared.ts` stays `{}` and `public/references/` does not exist until you do this. Until then, a `tr0.forward.s2` receipt that is otherwise honest earns `gpu-unverified`, and its page says the site holds no bank yet.

## What the bank is

The argmax token id of Hugging Face `transformers` (Qwen3-0.6B at the pinned revision, fp32, one CPU) over stage 2's eight fixed prompts (`pool_prompts`, 192 positions, position = `prompt * 24 + place`), kept only at positions where the best logit leads the runner-up by at least the margin. The default margin is 1.0 logit [estimated]: a thousand times the grader's 1e-3 logit bound, so that an honest forward pass cannot cross the gap and pick another token. Whether 1.0 keeps enough positions on the real model is not known until you run it; the command prints how many it kept.

The browser re-checks (`argmax-bank`, rule 7) that the receipt's ids equal the bank's at every banked position. A receipt that leaves a banked position out fails.

## Steps

You need a computer with the CPU environment of the lab (`labs/envs/cpu`, torch 2.14.0 and transformers 5.19.0) and the pinned model in the grader's cache. No GPU is needed.

1. Fetch the pinned model: `enginespace fetch tr0.forward`. The grader hashes each file again against `labs/references/manifest.json`. If the weights job of `labs.yml` has not yet confirmed the three hashes, they are [unverified]: run that job first (the manifest's notes say so).
2. Make the bank, from the repository root, in the CPU environment:

   ```
   PYTHONPATH=labs/grader/src python -m enginespace_grader.labs.tr0_forward bank public/references/tr0/argmax-bank.json
   ```

   An optional third argument is the margin, such as `1.0`. The command prints the number of banked positions, the file's size and its SHA-256. Run it twice and compare the SHA-256: the two must be equal, on this computer, with the same builds. The file names the builds of torch and transformers and the model's three files by hash, so a bank is never read apart from what made it.
3. Look at the number of banked positions. If it is very few (say under a third of 192), lower the margin and say so in the manifest entry's notes, or leave the lab's bound as it is and tell the course. Do not change `LOGIT_BOUND`.
4. Add the manifest entry to `labs/references/manifest.json`, with `kind` `reference`, `labs` `["tr0.forward"]`, `path` `tr0/argmax-bank.json`, `url` the file's address on the site (the site's own https address of `references/tr0/argmax-bank.json`), the SHA-256 and `bytes` the command printed, a `licence` of your choosing (O-3 is open, so write what you decide), the day, and notes that carry the margin and the builds. The grader reads only `kind` `model` entries as the model's files, so this entry does not enter a receipt's inputs.
5. Add the bank to `BANKS` in `src/receipts/declared.ts`, compiled in (the browser fetches nothing, A§12):

   ```ts
   export const BANKS: Banks = {
     'tr0.forward.s2': { positions: [ /* the file's "positions" */ ], ids: [ /* the file's "ids" */ ] },
   }
   ```

   Copy both arrays from the file, in order. `tests/receipts/declared.test.ts` and `tests/verify/forward.test.ts` assert today that `BANKS` is empty and that the honest receipt fails `argmax-bank` for the missing bank; they move with this change (they should then assert the bank's SHA-256 and that the honest receipt passes). The receipt of the reference solution has to pass against the real bank: run the reference solution on the pinned model (`labs/grader/tests/cpu/weights_margin.py`), and drop its receipt on `/receipts`.
6. Repack the kit (`bun scripts/pack-kit.ts`) if the grader's files changed, and run `npm run test` and `bun scripts/verify.ts all`.

## What to check afterwards

- The honest receipt passes `argmax-bank` on the real bank; the wrong-epsilon solution (`mutant_forward.py`) fails `logits-fp32` before it ever matters.
- The bank's file is public, and holds no path, no name and no host: it holds ids, positions, the margin, the builds and the model's file hashes.
