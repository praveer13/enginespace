/*
 * The graded lab page's descriptor for TR0's forward pass (`tr0.forward`, lane L): the facts the page tells, in the order of the page's steps
 * (types.ts), and the lab's own words for them. The stages and their checks are src/receipts/labs.ts's and packages/verify/stages.ts's, and
 * tests/labs/descriptors.test.ts holds this file to both. The check labels are the grader's (CHECK_LABELS in tr0_forward.py), which a test
 * reads from the lab module itself, so the page and the receipt say the same thing.
 *
 * The states are the ones the course can say today. Stages 1 and 3 are built, and the course has not yet run them on the pinned weights; stage 2
 * also waits for the course's reference bank, which `argmax-bank` needs. When the weights job has run (labs.yml) and the owner has recorded the
 * bank, a stage's state becomes `verified` here, with its day and its commit.
 */
import type { GradedLab } from './types'

const grade = (stage: string) => ({
  line: `uv run --project envs/cpu enginespace grade ${stage} --challenge <token> --assisted <none|explain|code> --agent <yes|no>`,
  then: `\`graded ${stage}\` with the grader's name and version, the receipt file it wrote under \`receipts/\`, and how many checks passed and failed. A failed check prints its id and what it found.`,
  from: 'course' as const,
})

export const TR0_FORWARD: GradedLab = {
  id: 'tr0.forward',
  title: 'Build the Qwen3-0.6B forward pass on a CPU',
  builds:
    "Write Qwen3-0.6B's forward pass yourself in PyTorch, on your laptop's CPU, until its logits match Hugging Face's `transformers`, then add a KV cache that changes nothing. A grader on your machine checks each stage against the reference and writes a receipt that this browser checks again.",
  needs: [
    { term: 'Machine', detail: 'A laptop or desktop on Linux or macOS. No GPU: every stage runs on the CPU.' },
    { term: 'Software', detail: '`uv 0.10.2`, and Python from `3.11` to `3.14`. uv installs the rest from the kit.' },
    { term: 'Memory', detail: 'Several gigabytes free. The grader holds the reference model and yours at once, in fp32.' },
    { term: 'Disk', detail: "Room for the model's weights in your cache folder: the weights file is 1,503,300,328 bytes by the model hub's own listing [unverified]. `enginespace fetch` checks the room before it downloads anything." },
    { term: 'Network', detail: 'Once, to download the pinned weights. The grader sends nothing anywhere else, and your receipt moves to this site by your own hand.' },
  ],
  kit: [{ kind: 'gpu-kit' }, { kind: 'grader-wheel' }],
  folder: 'enginespace-gpu-kit',
  inputs: [
    {
      line: 'uv sync --locked --project envs/cpu',
      then: 'uv installs torch, `transformers` and the grader from the lock, checking the hash of every file, and returns to the prompt with no error.',
      from: 'course',
      ran: '2026-11-21',
    },
    {
      line: 'uv run --project envs/cpu enginespace fetch tr0.forward',
      then: 'A line that names the lab, how many files it pins and the cache folder, then one line for each file: `fetched`, `resumed` (it carried on from a partial file) or `ok` (already in the cache), its path, its size and its licence. The course has not yet run this download on the pinned files [unverified].',
      from: 'course',
    },
  ],
  edit: {
    file: 'gpu/tr0-forward/starter/forward.py',
    note: 'The grader imports your forward pass from this file, and its docstring is the contract. `gpu/tr0-forward/LAB.md` walks through the pieces in order. Every other file of the kit is the harness: leave it as it is.',
  },
  stages: [
    {
      id: 'tr0.forward.s1',
      state: { kind: 'not-run-weights' },
      asks: "One decoder layer: RMSNorm, attention with rotary embeddings, and the MLP, over the embeddings of the challenge's prompt.",
      run: grade('tr0.forward.s1'),
      checks: [
        {
          id: 'layer0-hidden',
          label: "The first layer's hidden states agree with the `transformers` reference in fp32",
          catches: 'An RMSNorm or a rotary embedding that is nearly right, caught where it starts, before the layers above it hide where the error came from.',
          by: 'grader',
          optional: true,
        },
      ],
    },
    {
      id: 'tr0.forward.s2',
      state: { kind: 'awaiting-bank' },
      asks: 'Every layer, the final norm and the language-model head: the logits of the whole prompt. The bar is a largest difference of 0.001 [estimated] in any logit. How far below it a correct forward pass lands on the pinned weights has not been measured yet [unverified].',
      run: grade('tr0.forward.s2'),
      checks: [
        {
          id: 'logits-fp32',
          label: 'The logits agree with the `transformers` reference in fp32',
          catches: 'A wrong epsilon, a missed residual, or a weight loaded into the wrong place.',
          by: 'grader',
        },
        {
          id: 'import-guard',
          label: 'Your forward pass does not import `transformers.models`',
          catches: "A forward pass that calls Hugging Face's own model and passes its answer through.",
          by: 'grader',
        },
        {
          id: 'argmax-bank',
          label: "The top token at each of the bank's positions is the one the course recorded",
          catches: 'A run on other weights, or on another prompt than the challenge drew.',
          by: 'browser',
        },
      ],
    },
    {
      id: 'tr0.forward.s3',
      state: { kind: 'not-run-weights' },
      asks: 'Decode token by token with a KV cache: each step computes only the new position and reads the rest from the cache.',
      run: grade('tr0.forward.s3'),
      checks: [
        {
          id: 'cache-logits',
          label: 'Decoding with the cache gives the logits of recomputing the whole sequence',
          catches: 'A cache written at the wrong position, or read before it is written.',
          by: 'grader',
        },
        {
          id: 'cache-lengths',
          label: 'At every step the cache holds exactly as many positions as the prefix',
          catches: 'A cache that appends twice, or never, and still prints plausible text.',
          by: 'grader',
        },
      ],
    },
  ],
  prove: {
    open: true,
    asks: "For this lab they ask the shape or the strides of the tensor at one of five points of your forward pass: what leaves the embedding, the first layer's attention, the first layer's MLP, the final norm and the head. A receipt of the stage with a KV cache can be defended as soon as it passes; a receipt of the full forward pass passes once the course's reference bank is in.",
  },
}
