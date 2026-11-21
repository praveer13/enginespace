/*
 * The specimen of a graded lab's page: TR0's forward pass, as its descriptor is expected to read, drawn by the dev server and by a test build
 * (`VITE_ES_TEST_HOOKS=1`) at `/labs/tr0.forward`, and by tests/labs/view.test.ts on the server renderer. A production build holds none of it
 * (GradedLabPage.tsx reads it only behind the same constant that src/pages/TraceRoom.tsx's specimen uses), and a learner meets the lab's
 * "not published yet" page until the lab's own descriptor is in published.ts.
 *
 * It is a fixture of the page's shape, made from what the repository says today: the stages of src/receipts/labs.ts, the check ids of
 * packages/verify/stages.ts, the commands of the grader's README and of labs/envs/README.md, and what `enginespace fetch` and `enginespace
 * grade` print (labs/grader/src/enginespace_grader/fetch.py and cli.py). The file the learner edits is a placeholder: the lab's kit names it.
 * The states are the ones the lab's own task is to show until the course has run it: stages 1 and 3 not yet run on the pinned weights, and
 * stage 2 awaiting the course's reference bank.
 */
import type { GradedLab } from './types'

const grade = (stage: string) => ({
  line: `uv run --project envs/cpu enginespace grade ${stage} --challenge <token>`,
  then: `\`graded ${stage}\` with the grader's name and version, the receipt file it wrote under \`receipts/\`, and how many checks passed and failed. A failed check prints its id and what it found.`,
  from: 'course' as const,
})

export const SPECIMENS: Readonly<Record<string, GradedLab>> = {
  'tr0.forward': {
    id: 'tr0.forward',
    title: 'Build the Qwen3-0.6B forward pass on a CPU',
    builds:
      "Write Qwen3-0.6B's forward pass yourself in PyTorch, on your laptop's CPU, until its logits match Hugging Face's `transformers`, then add a KV cache that changes nothing. A grader on your machine checks each stage against the reference and writes a receipt that this browser checks again.",
    needs: [
      { term: 'Machine', detail: 'A laptop or desktop on Linux or macOS. No GPU: every stage runs on the CPU.' },
      { term: 'Software', detail: '`uv 0.10.2`, and Python from `3.11` to `3.14`. uv installs the rest from the kit.' },
      { term: 'Disk', detail: "Room for the model's weights in your cache folder. `enginespace fetch` checks the room before it downloads anything." },
      { term: 'Network', detail: 'Once, to download the pinned weights. The grader sends nothing anywhere else, and your receipt moves to this site by your own hand.' },
    ],
    kit: [{ kind: 'gpu-kit' }, { kind: 'grader-wheel' }],
    folder: 'enginespace-gpu-kit',
    inputs: [
      {
        line: 'uv sync --locked --project envs/cpu',
        then: 'uv installs torch, `transformers` and the grader from the lock, checking the hash of every file, and returns to the prompt with no error.',
        from: 'course',
      },
      {
        line: 'uv run --project envs/cpu enginespace fetch tr0.forward',
        then: 'A line that names the lab, how many files it pins and the cache folder, then one line for each file: `fetched` or `ok`, its path, its size and its licence.',
        from: 'course',
      },
    ],
    edit: {
      file: 'tr0-forward/forward.py',
      note: 'The grader imports your forward pass from this file. Every other file of the folder is the harness: leave it as it is.',
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
        asks: 'Every layer, the final norm and the language-model head: the logits of the whole prompt.',
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
    prove: { open: false, asks: 'For this lab they ask the shape or the strides of a tensor at one of the points your run recorded.' },
  },
}
