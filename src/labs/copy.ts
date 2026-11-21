/*
 * The words of a graded lab's page (GradedLabView.tsx) that are the same for every lab: the steps' names and leads, what each kind of kit
 * file is, and the one line that says where each stage stands. A lab's own facts are its descriptor's (types.ts).
 *
 * The state lines are a fixed set on purpose. A stage says the course has not yet run it, or that it waits for the course's reference
 * bank, or that the course ran it and on which day: no lab can word its way round that. The words are the engine's and the learner's,
 * name no task and no wave, and hold no number that no tag covers (tests/labs/copy.test.ts). A run in backticks is set as code.
 */
import type { KitRef, StageState } from './types'

/** The one line for each state of a stage. `verified` is said with its day, and the commit beside it is set as code. */
export const STAGE_STATE: Readonly<Record<Exclude<StageState['kind'], 'verified'>, string>> & { verified: (on: string) => string } = {
  'not-run-weights': 'built; the course has not yet run this lab on the pinned weights',
  'not-run-engine': 'built; the course has not yet run this lab on a real engine',
  'awaiting-bank': "awaiting the course's reference bank",
  verified: (on) => `verified: the course ran it on ${on}`,
}

/** What a reader hears for each state before its line, and what the stage list says for it in one word. */
export const STATE_WORD: Readonly<Record<StageState['kind'], string>> = {
  'not-run-weights': 'Not yet run by the course',
  'not-run-engine': 'Not yet run by the course',
  'awaiting-bank': 'Awaiting a bank',
  verified: 'Verified',
}

/** The line of a stage's state, as the page prints it. */
export const stateLine = (state: StageState): string => (state.kind === 'verified' ? STAGE_STATE.verified(state.on) : STAGE_STATE[state.kind])

/** What each kind of file in the kit is, in one sentence. */
export const KIT_KIND: Readonly<Record<KitRef['kind'], { name: string; is: string }>> = {
  'gpu-kit': {
    name: 'The kit',
    is: "The grader's source, the locked environment of each engine, and the guides for a rented GPU. Every command below runs in the folder it unzips to.",
  },
  'grader-wheel': {
    name: 'The grader alone',
    is: 'The same grader as one Python wheel, for a machine where the kit is already unzipped and only the grader is new.',
  },
  'forge-lab': {
    name: 'The crate',
    is: 'A Cargo workspace: the file you edit, the checks that `cargo test` runs, and a README.',
  },
}

/** The words of the page around a lab's facts. */
export const PAGE = {
  needs: 'What you need',
  stagesTitle: 'Stages',
  stagesLead: 'Where each stage stands for the course.',
  optional: 'optional',
  optionalNote: 'The module does not need it.',
  crumbCourse: 'Course',
  steps: {
    kit: 'Download the kit',
    inputs: 'Fetch the inputs',
    challenge: 'Get a challenge',
    edit: 'Edit one file',
    run: 'Run the grader',
    import: 'Bring the receipt back',
    checks: 'The checks',
    prove: 'Prove it',
  },
  kitLead: 'Unzip it where you keep your work. Each file is linked with its size and its SHA-256, so you can check what you downloaded.',
  kitLoading: "Reading each file's size and SHA-256 from the site.",
  kitMissing: "The size and SHA-256 could not be read from the site's list of files, so they are not printed here. The link still works.",
  checkSummary: 'Check the download',
  checkNote: 'Run this line where you saved the file. It prints OK when the file is the one the site holds. On a Mac, `shasum -a 256 -c` reads it in place of `sha256sum -c`.',
  inputsLead: 'Run these in order, from the folder the kit unzipped to. The large files are not in the kit: the grader downloads them and keeps a file only when its SHA-256 is the one the course pinned.',
  challengeLead:
    'A challenge is a one-use token that this site makes for one stage. Your grader draws every seed of the run from it, so a receipt shows the run came after you asked. Get one for the stage you are about to run; the page that makes it also prints the command with the token filled in.',
  challengeLink: (stage: string) => `Get a challenge for ${stage}`,
  editLead: (folder: string) => `In \`${folder}\`, this is the only file you change. Every stage grades the same file.`,
  runLead: 'Grade one stage at a time, with the token of its challenge in place of `<token>`. The grader runs the stage on your machine, checks the result, and writes one receipt file, whether the checks passed or not.',
  asks: 'What it asks',
  then: 'Then you see',
  copy: 'Copy the command',
  copied: 'Copied.',
  refused: 'The browser would not copy. The line is selected: press Ctrl+C (Cmd+C on a Mac).',
  unverified: 'Taken from the pinned project\'s documents. The course has not run this line.',
  importLead: 'The receipt is one file in the `receipts` folder, ending in `.es.json.gz`. Drop it on the results page. This browser checks it against your challenge there, and the file never leaves the tab.',
  importLink: 'Open GPU lab results',
  checksLead: 'What a receipt of each stage must show to pass. Your grader checks some on your machine and writes its word into the receipt; this browser checks the others again from what the receipt holds.',
  byGrader: 'your grader',
  byBrowser: 'this browser',
  checkedBy: 'checked by',
  catches: 'Catches',
  proveLead: 'Once a receipt of a required stage passes, its page asks you questions that only your own run can answer. You answer first, and then the browser shows the computation from your receipt.',
  proveOpen: 'Open a passed receipt on GPU lab results to start.',
  proveClosed: 'Not published yet.',
} as const

/** Every string above that holds words, for the tests. */
export function labPageCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (typeof value === 'function') out.push(String((value as (arg: string) => string)('x')))
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk({ STAGE_STATE, STATE_WORD, KIT_KIND, PAGE })
  return out
}
